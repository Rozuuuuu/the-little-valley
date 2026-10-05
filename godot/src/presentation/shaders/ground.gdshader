// Ground for one 32×32-tile chunk in the browser game's pixel style: a port of
// src/render/terrainPainter.ts (computePixels) to the GPU. Every world pixel (16 per tile) is
// resolved exactly as the browser does, with the same 32-bit hashes, so borders creep and
// dither identically: pass 1 picks each pixel's terrain (higher priority terrain creeps into
// lower by noise), pass 2 colours it (patches, speckles, water foam and bank shadow, cliff rims
// and strata, road edges, bridges), pass 3 adds per-tile details (tufts, flowers, pebbles,
// forest berries, shells). One quad per chunk; see WorldView. Fog of war is laid over the top.
// Terrain ids (src/world/tiles.gd): 0 deep water, 1 water, 2 sand, 3 grass, 4 meadow, 5 forest,
// 6 rocky, 7 road, 8 bridge, 9 stone bridge, 10 hill, 11 mountain.
shader_type canvas_item;

// 38×38: the chunk plus a three-tile border from its neighbours. R = terrain id / 255.
uniform sampler2D ids : filter_nearest;
// 38×38 exploration (R = 1 explored), sampled smoothly for a soft fog edge.
uniform sampler2D fog : filter_linear;
// The season's palette, one pixel per slot (PixelGround.SLOTS).
uniform sampler2D pal : filter_nearest;
uniform vec2 origin;
uniform int world_seed = 0;
uniform vec4 fog_color : source_color = vec4(0.08, 0.06, 0.11, 1.0);
uniform bool winter = false;
uniform bool autumn = false;

const float BORDER = 3.0;
const float SIDE = 38.0;

// Palette slots (PixelGround.SLOTS order).
const int GRASS0 = 0; const int GRASS1 = 1; const int GRASS2 = 2; const int GRASS3 = 3;
const int MEADOW0 = 4; const int MEADOW1 = 5; const int MEADOW2 = 6; const int MEADOW3 = 7;
const int FOREST0 = 8; const int FOREST1 = 9; const int FOREST2 = 10; const int FOREST_LEAF = 11;
const int SAND0 = 12; const int SAND1 = 13; const int SAND2 = 14; const int SAND3 = 15;
const int HILL0 = 16; const int HILL1 = 17; const int HILL2 = 18; const int HILL3 = 19;
const int CLIFF0 = 20; const int CLIFF1 = 21; const int CLIFF2 = 22; const int CLIFF3 = 23; const int SNOWCAP = 24;
const int ROCK1 = 25; const int ROCK2 = 26; const int ROCK3 = 27;
const int DIRT0 = 28; const int DIRT1 = 29; const int DIRT2 = 30; const int DIRT3 = 31;
const int WATER0 = 32; const int WATER1 = 33; const int WATER2 = 34; const int WATER3 = 35; const int FOAM = 36;
const int DEEP0 = 37; const int DEEP1 = 38;
const int STONE0 = 39; const int STONE1 = 40; const int STONE2 = 41; const int STONE3 = 42;
const int WOOD0 = 43; const int WOOD1 = 44; const int WOOD2 = 45; const int WOOD3 = 46;
const int FLOWER_Y = 47; const int FLOWER_W = 48; const int FLOWER_P = 49; const int FLOWER_V = 50; const int FLOWER_R = 51;
const int FIRE1 = 52; const int LEAF1 = 53; const int BERRY = 54;

const int T_DEEP = 0; const int T_WATER = 1; const int T_SAND = 2; const int T_GRASS = 3; const int T_MEADOW = 4;
const int T_FOREST = 5; const int T_ROCKY = 6; const int T_ROAD = 7; const int T_BRIDGE = 8; const int T_STONE_BRIDGE = 9;
const int T_HILL = 10; const int T_MOUNTAIN = 11;

// Border priority and how far (px) each terrain may creep, as TERRAIN and REACH in the browser.
const int PRIORITY[12] = int[12](0, 1, 2, 4, 5, 6, 3, 8, 9, 10, 7, 11);
const float REACH[12] = float[12](0.0, 0.9, 1.0, 1.0, 0.85, 1.0, 0.9, 0.45, 0.0, 0.0, 0.9, 0.35);

vec3 col(int slot) {
	return texelFetch(pal, ivec2(slot, 0), 0).rgb;
}

// hash2 from src/game/core/rng.ts (32-bit integer arithmetic, identical results).
uint hash2(int x, int y, int seed) {
	uint h = uint(seed) + uint(x) * 374761393u + uint(y) * 668265263u;
	h = (h ^ (h >> 13u)) * 1274126177u;
	h = (h ^ (h >> 16u)) * 0x85ebca6bu;
	h ^= h >> 13u;
	return h;
}

float hash01(int x, int y, int seed) {
	return float(hash2(x, y, seed)) / 4294967296.0;
}

float value_noise(float x, float y, int seed) {
	float x0 = floor(x);
	float y0 = floor(y);
	float fx = x - x0;
	float fy = y - y0;
	fx = fx * fx * (3.0 - 2.0 * fx);
	fy = fy * fy * (3.0 - 2.0 * fy);
	int ix = int(x0);
	int iy = int(y0);
	float a = hash01(ix, iy, seed);
	float b = hash01(ix + 1, iy, seed);
	float c = hash01(ix, iy + 1, seed);
	float d = hash01(ix + 1, iy + 1, seed);
	float top = a + (b - a) * fx;
	float bottom = c + (d - c) * fx;
	return top + (bottom - top) * fy;
}

// JavaScript's % (the sign follows the dividend); GLSL's % is undefined for negatives.
int js_mod(int a, int b) {
	return a - b * int(trunc(float(a) / float(b)));
}

int terr(int tx, int ty) {
	ivec2 local = clamp(ivec2(tx, ty) - ivec2(origin) + ivec2(int(BORDER)), ivec2(0), ivec2(int(SIDE) - 1));
	return int(texelFetch(ids, local, 0).r * 255.0 + 0.5);
}

bool is_water(int t) {
	return t == T_WATER || t == T_DEEP;
}

// Pass 1: which terrain a world pixel shows.
int cls(ivec2 p) {
	int tx = p.x >> 4;
	int ty = p.y >> 4;
	int lx = p.x & 15;
	int ly = p.y & 15;
	int t = terr(tx, ty);
	if (t == T_BRIDGE || t == T_STONE_BRIDGE) return t;
	int ex = lx < 8 ? -1 : 1;
	int dx = lx < 8 ? lx : 15 - lx;
	int ey = ly < 8 ? -1 : 1;
	int dy = ly < 8 ? ly : 15 - ly;
	float n = hash01(p.x >> 1, p.y >> 1, world_seed ^ 0x1234) * 0.6 + hash01(p.x >> 3, p.y >> 3, world_seed ^ 0x77) * 0.4;
	float spread = 1.2 + n * 4.2;
	int best = t;
	int best_p = PRIORITY[t];
	int nt = terr(tx + ex, ty);
	if (PRIORITY[nt] > best_p && nt != T_BRIDGE && float(dx) < spread * REACH[nt]) { best = nt; best_p = PRIORITY[nt]; }
	nt = terr(tx, ty + ey);
	if (PRIORITY[nt] > best_p && nt != T_BRIDGE && float(dy) < spread * REACH[nt]) { best = nt; best_p = PRIORITY[nt]; }
	nt = terr(tx + ex, ty + ey);
	if (PRIORITY[nt] > best_p && nt != T_BRIDGE && length(vec2(float(dx) + 0.5, float(dy) + 0.5)) * 1.1 < spread * REACH[nt]) best = nt;
	return best;
}

// Pass 2: the colour of a pixel of class c.
vec3 colour(ivec2 p, int c) {
	int wx = p.x;
	int wy = p.y;
	float h = hash01(wx, wy, world_seed ^ 0x99);
	float patch = value_noise(float((wx >> 2) * 4) / 28.0, float((wy >> 2) * 4) / 28.0, world_seed ^ 0x55);
	int slot = GRASS1;
	if (c == T_WATER || c == T_DEEP) {
		bool deep = c == T_DEEP;
		int shore = 9;
		for (int r = 1; r <= 3 && shore == 9; r++) {
			if (!is_water(cls(p + ivec2(-r, 0))) || !is_water(cls(p + ivec2(r, 0))) || !is_water(cls(p + ivec2(0, -r))) || !is_water(cls(p + ivec2(0, r)))) shore = r;
		}
		bool shadow = !is_water(cls(p + ivec2(0, -1))) || (!is_water(cls(p + ivec2(0, -2))) && (wx & 1) == 0);
		if (shadow) slot = deep ? DEEP0 : WATER0;
		else if (shore == 1) slot = FOAM;
		else if (shore == 2) slot = js_mod(wx + wy, 2) == 0 ? WATER3 : WATER2;
		else if (shore == 3) slot = WATER2;
		else if (deep) slot = patch > 0.6 ? DEEP1 : DEEP0;
		else slot = patch > 0.62 ? WATER2 : (patch < 0.3 ? WATER0 : WATER1);
	} else if (c == T_SAND) {
		slot = h < 0.05 ? SAND2 : (h > 0.95 ? SAND0 : (patch > 0.6 ? SAND2 : SAND1));
	} else if (c == T_GRASS) {
		slot = h < 0.035 ? GRASS3 : (h > 0.975 ? GRASS0 : (patch > 0.56 ? GRASS2 : GRASS1));
	} else if (c == T_MEADOW) {
		slot = h < 0.05 ? MEADOW3 : (h > 0.975 ? MEADOW0 : (patch > 0.5 ? MEADOW2 : MEADOW1));
	} else if (c == T_FOREST) {
		slot = h < 0.015 ? FOREST_LEAF : (h < 0.06 ? FOREST0 : (patch > 0.5 ? FOREST1 : FOREST2));
	} else if (c == T_ROCKY) {
		slot = h < 0.04 ? ROCK2 : (h > 0.95 ? ROCK3 : (patch > 0.55 ? ROCK2 : ROCK1));
	} else if (c == T_HILL) {
		bool contour = js_mod(wy + int(floor(patch * 12.0)), 11) == 0;
		slot = contour ? HILL0 : (h < 0.035 ? HILL3 : (patch > 0.55 ? HILL2 : HILL1));
	} else if (c == T_MOUNTAIN) {
		bool top = cls(p + ivec2(0, -1)) != T_MOUNTAIN || cls(p + ivec2(0, -2)) != T_MOUNTAIN;
		bool foot = cls(p + ivec2(0, 1)) != T_MOUNTAIN || cls(p + ivec2(0, 2)) != T_MOUNTAIN || cls(p + ivec2(0, 3)) != T_MOUNTAIN;
		if (top) slot = CLIFF3;
		else if (foot) slot = CLIFF0;
		else if (js_mod((wx + wy * 2) >> 2, 7) == 0) slot = CLIFF1;
		else slot = h < 0.06 ? CLIFF3 : (patch > 0.5 ? CLIFF2 : CLIFF1);
		if (winter && !foot && h < 0.25) slot = SNOWCAP;
	} else if (c == T_ROAD) {
		bool edge = cls(p + ivec2(-1, 0)) != T_ROAD || cls(p + ivec2(1, 0)) != T_ROAD || cls(p + ivec2(0, -1)) != T_ROAD || cls(p + ivec2(0, 1)) != T_ROAD;
		slot = edge ? DIRT0 : (h < 0.06 ? DIRT2 : (h > 0.96 ? DIRT3 : DIRT1));
	} else if (c == T_STONE_BRIDGE) {
		int tx = wx >> 4;
		int ty = wy >> 4;
		int lx = wx & 15;
		int ly = wy & 15;
		bool horiz = terr(tx - 1, ty) == T_STONE_BRIDGE || terr(tx + 1, ty) == T_STONE_BRIDGE || !is_water(terr(tx - 1, ty)) || !is_water(terr(tx + 1, ty));
		int along = horiz ? wx : wy;
		int across = horiz ? ly : lx;
		if (across <= 1 || across >= 14) slot = (across == 0 || across == 15) ? STONE0 : (js_mod(along, 6) == 0 ? STONE0 : STONE1);
		else if (across == 2 || across == 13) slot = STONE0;
		else if (js_mod(along, 8) == 0 || (across == 8 && js_mod(along, 8) == 4)) slot = STONE1;
		else slot = h < 0.06 ? STONE3 : (across < 6 ? STONE3 : STONE2);
	} else if (c == T_BRIDGE) {
		int tx = wx >> 4;
		int ty = wy >> 4;
		int lx = wx & 15;
		int ly = wy & 15;
		bool horiz = !is_water(terr(tx - 1, ty)) || !is_water(terr(tx + 1, ty));
		int along = horiz ? lx : ly;
		int across = horiz ? ly : lx;
		if (across <= 1 || across >= 14) slot = (across == 0 || across == 15) ? WOOD0 : WOOD1;
		else if (js_mod(along, 4) == 3) slot = WOOD1;
		else slot = js_mod(along / 4 + (horiz ? tx : ty), 2) != 0 ? WOOD3 : WOOD2;
		if (across == 2) slot = WOOD1;
	}
	// Land lip above water: a darker edge so banks read as raised.
	if (!is_water(c) && c != T_BRIDGE && c != T_STONE_BRIDGE && is_water(cls(p + ivec2(0, 1)))) slot = c == T_SAND ? SAND3 : GRASS0;
	// Cliffs cast a short shadow onto the ground below them.
	if (c != T_MOUNTAIN && !is_water(c) && (cls(p + ivec2(0, -1)) == T_MOUNTAIN || cls(p + ivec2(0, -2)) == T_MOUNTAIN)) slot = c == T_HILL ? HILL0 : GRASS0;
	return col(slot);
}

float nib(uint hv, int n) {
	return float((hv >> uint(n * 4)) & 15u) / 16.0;
}

// Pass 3: per-tile details. Returns a palette slot, or -1 when this pixel has none. Each detail
// is drawn only over its own tile's terrain class, and later details overwrite earlier ones.
int detail(ivec2 p, int c) {
	int tx = p.x >> 4;
	int ty = p.y >> 4;
	int t = terr(tx, ty);
	if (c != t) return -1;
	ivec2 l = p - ivec2(tx << 4, ty << 4);
	uint hv = hash2(tx, ty, world_seed ^ 0xdeca);
	int slot = -1;
	if (t == T_GRASS || t == T_MEADOW || t == T_FOREST || t == T_HILL) {
		int tufts = nib(hv, 0) < 0.45 ? 1 : (nib(hv, 0) < 0.7 ? 2 : 0);
		int light = t == T_FOREST ? FOREST2 : (t == T_MEADOW ? MEADOW3 : (t == T_HILL ? HILL3 : GRASS3));
		int dark = t == T_FOREST ? FOREST0 : (t == T_MEADOW ? MEADOW0 : (t == T_HILL ? HILL0 : GRASS0));
		for (int i = 0; i < tufts; i++) {
			ivec2 q = ivec2(2 + int(floor(nib(hv, 1 + i * 2) * 12.0)), 2 + int(floor(nib(hv, 2 + i * 2) * 11.0)));
			ivec2 d = l - q;
			if (d == ivec2(0, 0) || d == ivec2(-1, 1) || d == ivec2(1, 1)) slot = light;
			if (d == ivec2(0, 1) || d == ivec2(-1, 2) || d == ivec2(1, 2)) slot = dark;
		}
	}
	if (!winter && ((t == T_MEADOW && nib(hv, 5) < 0.55) || (t == T_GRASS && nib(hv, 5) < (autumn ? 0.02 : 0.07)))) {
		int n = (t == T_MEADOW && nib(hv, 6) > 0.6) ? 2 : 1;
		for (int i = 0; i < n; i++) {
			ivec2 q = ivec2(3 + int(floor(nib(hv, 6 + i) * 10.0)), 3 + int(floor(nib(hv, 4 - i) * 9.0)));
			int pick = int(floor(nib(hv, 7 - i) * 5.0));
			int petal = pick == 0 ? FLOWER_Y : (pick == 1 ? FLOWER_W : (pick == 2 ? FLOWER_P : (pick == 3 ? FLOWER_V : FLOWER_R)));
			ivec2 d = l - q;
			if (d == ivec2(-1, 0) || d == ivec2(1, 0) || d == ivec2(0, -1)) slot = petal;
			if (d == ivec2(0, 1)) slot = LEAF1;
			if (d == ivec2(0, 0)) slot = petal == FLOWER_Y ? FIRE1 : FLOWER_Y;
		}
	}
	if (t == T_ROCKY && nib(hv, 3) < 0.6) {
		ivec2 d = l - ivec2(2 + int(floor(nib(hv, 4) * 11.0)), 2 + int(floor(nib(hv, 5) * 11.0)));
		if (d == ivec2(0, 0) || d == ivec2(1, 0)) slot = ROCK2;
		if (d == ivec2(0, 1) || d == ivec2(1, 1)) slot = ROCK3;
	}
	if (t == T_FOREST && nib(hv, 7) < 0.05) {
		ivec2 d = l - ivec2(4 + int(floor(nib(hv, 3) * 8.0)), 4 + int(floor(nib(hv, 1) * 8.0)));
		if (d == ivec2(0, 0) || d == ivec2(1, 0)) slot = BERRY;
		if (d == ivec2(0, 1)) slot = FLOWER_W;
	}
	if (t == T_SAND && nib(hv, 2) < 0.12) {
		ivec2 d = l - ivec2(3 + int(floor(nib(hv, 3) * 10.0)), 3 + int(floor(nib(hv, 4) * 10.0)));
		if (d == ivec2(0, 0)) slot = FLOWER_W;
		if (d == ivec2(1, 0)) slot = SAND0;
	}
	return slot;
}

void fragment() {
	vec2 world_px = origin * 16.0 + UV * 512.0;
	ivec2 p = ivec2(floor(world_px));
	int c = cls(p);
	vec3 rgb = colour(p, c);
	int d = detail(p, c);
	if (d >= 0) rgb = col(d);
	// Fog of war, soft-edged as in the browser (its 4x smoothed edge), on whole pixels.
	vec2 tile = (vec2(p) + 0.5) / 16.0;
	float e = texture(fog, (tile - origin + BORDER) / SIDE).r;
	e = smoothstep(0.25, 0.75, e);
	COLOR = vec4(mix(fog_color.rgb, rgb, e), 1.0);
}
