// Ground for one 32×32-tile chunk, painted like a storybook backdrop: sunlit and shaded grass
// patches laid in visible brush strokes, lit grass clumps, flowers, dappled forest floor, worn
// dirt roads, layered rock, water that deepens from turquoise shallows to blue, a bank shadow,
// shore foam, drifting cloud shadows and a soft fog of war. One quad per chunk; see ChunkGround.
// Everything is in world coordinates, so neighbouring chunks meet without seams.
// Terrain ids (src/world/tiles.gd): 0 deep water, 1 water, 2 sand, 3 grass, 4 meadow, 5 forest,
// 6 rocky, 7 road, 8 bridge, 9 stone bridge, 10 hill, 11 mountain.
shader_type canvas_item;

// 38×38: the chunk plus a three-tile border from its neighbours. R = terrain id / 255.
uniform sampler2D ids : filter_nearest;
// 38×38 exploration (R = 1 explored), sampled smoothly for a soft fog edge.
uniform sampler2D fog : filter_linear;
// 3 tones (dark, mid, light) × 12 terrains.
uniform sampler2D pal : filter_nearest;
uniform vec2 origin;
uniform vec4 fog_color : source_color = vec4(0.09, 0.15, 0.11, 1.0);
uniform vec4 foam_color : source_color = vec4(0.93, 0.97, 0.94, 1.0);
uniform vec4 snow_color : source_color = vec4(0.95, 0.97, 0.98, 1.0);
// 0 in spring/summer, up to 1 in autumn (warmer, drier grass).
uniform float autumn = 0.0;
// 0..1: how much snow lies on open ground.
uniform float snow = 0.0;
// 1 = animated water and clouds; 0 with reduced motion.
uniform float motion = 1.0;

const float BORDER = 3.0;
const float SIDE = 38.0;
// Sunlight and its complementary shade: warm yellow light, cool blue-green shadow.
const vec3 SUN = vec3(1.07, 1.05, 0.86);
const vec3 SHADE = vec3(0.80, 0.90, 0.93);

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return s;
}

// Rotates world space so brush strokes lean the same way everywhere (about 25° up-right).
vec2 stroke_space(vec2 p) {
	return vec2(p.x * 0.906 - p.y * 0.423, p.x * 0.423 + p.y * 0.906);
}

// Soft posterising: a value snapped into `n` bands with soft edges, like flat dabs of paint.
float bands(float v, float n) {
	float x = v * n;
	float fl = floor(x);
	return (fl + smoothstep(0.35, 0.65, fract(x))) / n;
}

int id_at(vec2 tile) {
	vec2 local = clamp(floor(tile - origin) + BORDER, vec2(0.0), vec2(SIDE - 1.0));
	return int(texelFetch(ids, ivec2(local), 0).r * 255.0 + 0.5);
}

vec3 tone(int id, float t) {
	vec3 a = texelFetch(pal, ivec2(0, id), 0).rgb;
	vec3 b = texelFetch(pal, ivec2(1, id), 0).rgb;
	vec3 c = texelFetch(pal, ivec2(2, id), 0).rgb;
	t = clamp(t, 0.0, 1.0);
	return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
}

bool water(int id) {
	return id <= 1;
}

bool green(int id) {
	return id == 3 || id == 4 || id == 5 || id == 10;
}

// Grass clumps on a jittered grid: each a small mound lit on its upper-left and shaded on its
// lower-right, with a few blades. Returns (light, dark) amounts.
vec2 clumps(vec2 tile, float scale, float density) {
	vec2 g = tile * scale;
	vec2 cell = floor(g);
	vec2 res = vec2(0.0);
	for (int j = -1; j <= 0; j++) {
		for (int i = -1; i <= 0; i++) {
			vec2 c = cell + vec2(float(i), float(j));
			float s = hash(c);
			if (s > density) continue;
			vec2 centre = c + 0.25 + vec2(hash(c + 3.1), hash(c + 7.7)) * 0.5;
			vec2 d = (g - centre) * vec2(1.0, 1.7);
			float r = 0.28 + hash(c + 1.3) * 0.22;
			float body = 1.0 - smoothstep(r * 0.7, r, length(d));
			// Blades: thin upward strokes fanning out from the clump's base.
			float a = atan(d.x, -d.y);
			float blade = smoothstep(0.55, 0.95, sin(a * 9.0 + s * 20.0)) * (1.0 - smoothstep(r * 0.8, r * 1.35, length(d))) * step(d.y, 0.05);
			float lit = smoothstep(0.1, -0.25, d.x + d.y);
			res.x += body * lit * 0.8 + blade * 0.55;
			res.y += body * (1.0 - lit) * 0.9;
		}
	}
	return clamp(res, 0.0, 1.0);
}

// Small flowers: a bright centre ringed by petals, in sparse seeded spots.
vec4 flowers(vec2 tile, float density) {
	vec2 g = tile * 4.0;
	vec2 cell = floor(g);
	float s = hash(cell + 19.7);
	if (s > density) return vec4(0.0);
	vec2 centre = cell + 0.3 + vec2(hash(cell + 2.2), hash(cell + 5.9)) * 0.4;
	float d = length((g - centre) * vec2(1.0, 1.3));
	float petal = 1.0 - smoothstep(0.09, 0.15, d);
	float eye = 1.0 - smoothstep(0.03, 0.06, d);
	float pick = hash(cell + 11.0);
	vec3 col = pick < 0.4 ? vec3(0.98, 0.96, 0.86) : (pick < 0.7 ? vec3(0.99, 0.84, 0.32) : (pick < 0.88 ? vec3(0.93, 0.62, 0.72) : vec3(0.62, 0.70, 0.95)));
	col = mix(col, vec3(0.96, 0.74, 0.2), eye);
	return vec4(col, petal);
}

// The colour of one terrain at this point (water handled separately).
vec3 land_colour(int id, vec2 tile, float patch, float macro) {
	vec2 sp = stroke_space(tile);
	// Long, leaning brush strokes, posterised into a few tones so they read as paint dabs.
	float stroke = vnoise(sp * vec2(0.9, 3.4)) * 0.6 + vnoise(sp * vec2(2.1, 7.5)) * 0.4;
	float t = bands(clamp(patch * 0.95 + (stroke - 0.5) * 0.55 + 0.05, 0.0, 1.0), 5.0);
	vec3 col = tone(id, t);
	if (green(id)) {
		// Big sunlit and shaded areas: warm yellow-green in light, blue-green in shade.
		col *= mix(SHADE, SUN, smoothstep(0.32, 0.7, macro));
		float density = id == 5 ? 0.42 : (id == 4 ? 0.5 : 0.62);
		vec2 cl = clumps(tile, 2.6, density);
		vec2 cl2 = clumps(tile + 13.7, 5.2, density * 0.7);
		vec3 lightc = tone(id, 1.0) * vec3(1.12, 1.1, 0.86);
		vec3 darkc = tone(id, 0.0) * vec3(0.82, 0.92, 0.95);
		col = mix(col, darkc, cl.y * 0.28 + cl2.y * 0.2);
		col = mix(col, lightc, cl.x * 0.26 + cl2.x * 0.2);
		if (id == 5) {
			// Dappled light falling through the canopy, and darker moss under it.
			float dapple = smoothstep(0.62, 0.75, fbm(tile * 0.9 + 4.0));
			col = mix(col, tone(4, 0.95) * SUN, dapple * 0.3);
		} else {
			vec4 fl = flowers(tile, id == 4 ? 0.16 : 0.06);
			col = mix(col, fl.rgb, fl.a * (1.0 - autumn) * (1.0 - snow));
		}
		col = mix(col, col * vec3(1.18, 0.96, 0.62), autumn);
		col = mix(col, snow_color.rgb * mix(vec3(0.86, 0.9, 1.0), vec3(1.0), stroke), snow * smoothstep(0.3, 0.55, fbm(tile * 0.5)));
	}
	if (id == 10) {
		// Hills: soft contour strokes catching the light.
		float c = fract(fbm(tile * 0.25) * 6.0);
		col = mix(col, col * SUN, smoothstep(0.82, 0.9, c) * 0.3);
		col *= 1.0 - smoothstep(0.9, 1.0, c) * 0.14;
	}
	if (id == 11) {
		// Rock faces lit from the upper left: a smooth height field's slope, in a few facets.
		vec2 rp = tile * 0.45;
		float h0 = vnoise(rp) + vnoise(rp * 2.1) * 0.4;
		float hx = vnoise(rp + vec2(0.2, 0.0)) + vnoise(rp * 2.1 + vec2(0.42, 0.0)) * 0.4;
		float hy = vnoise(rp + vec2(0.0, 0.2)) + vnoise(rp * 2.1 + vec2(0.0, 0.42)) * 0.4;
		float light = clamp(0.5 + ((h0 - hx) + (h0 - hy)) * 2.2, 0.0, 1.0);
		light = bands(light, 4.0);
		col = mix(tone(11, 0.0) * vec3(0.9, 0.9, 1.0), tone(11, 1.0) * vec3(1.05, 1.02, 0.94), light);
		float crack = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(tile * vec2(2.2, 1.1)) - 0.5));
		col *= 1.0 - crack * 0.22;
		// Moss and grass in the hollows.
		col = mix(col, tone(3, 0.4), smoothstep(0.6, 0.75, fbm(tile * 1.3 + 9.0)) * 0.45 * (1.0 - snow));
		col = mix(col, snow_color.rgb, snow * 0.6 * light);
	}
	if (id == 7 || id == 8 || id == 9) {
		col *= 0.94 + vnoise(tile * 3.1) * 0.12;
	}
	if (id == 7) {
		// Wheel ruts along the road and a grass strip in the middle.
		float rut = vnoise(tile * vec2(5.0, 0.7));
		col = mix(col, tone(7, 0.0), smoothstep(0.62, 0.8, rut) * 0.35);
	}
	if (id == 2 || id == 6 || id == 7) {
		// Pebbles, each lit on its upper-left.
		vec2 g = tile * 6.0;
		vec2 cell = floor(g);
		vec2 q = fract(g) - 0.5 - (vec2(hash(cell + 1.0), hash(cell + 2.0)) - 0.5) * 0.4;
		float s = hash(cell);
		float pebble = (1.0 - smoothstep(0.08, 0.16, length(q * vec2(1.0, 1.5)))) * step(id == 6 ? 0.6 : 0.82, s);
		float lit = smoothstep(0.05, -0.08, q.x + q.y);
		vec3 pc = mix(tone(6, 0.1), tone(6, 1.0) * 1.08, lit);
		col = mix(col, pc, pebble * 0.8);
		// A small cast shadow below and right of each pebble.
		float sh = (1.0 - smoothstep(0.08, 0.17, length((q - vec2(0.05, 0.07)) * vec2(1.0, 1.6)))) * step(id == 6 ? 0.6 : 0.82, s) * (1.0 - pebble);
		col *= 1.0 - sh * 0.25;
	}
	if (id == 2) {
		// Ripple marks in the sand.
		col *= 0.96 + 0.06 * sin(sp.y * 9.0 + vnoise(tile * 1.5) * 5.0);
	}
	return col;
}

// 1 on land and 0 on water, bilinearly blended between tile centres (smooth, no tile steps).
float landf(vec2 tile) {
	vec2 p = tile - 0.5;
	vec2 b = floor(p);
	vec2 f = smoothstep(0.0, 1.0, fract(p));
	float a = water(id_at(b + vec2(0.5, 0.5))) ? 0.0 : 1.0;
	float c = water(id_at(b + vec2(1.5, 0.5))) ? 0.0 : 1.0;
	float d = water(id_at(b + vec2(0.5, 1.5))) ? 0.0 : 1.0;
	float e = water(id_at(b + vec2(1.5, 1.5))) ? 0.0 : 1.0;
	return mix(mix(a, c, f.x), mix(d, e, f.x), f.y);
}

// How much land lies around a water point: 0 deep in a lake, 1 right at the bank.
float landness(vec2 tile) {
	float n = 0.0;
	for (int i = 0; i < 8; i++) {
		float a = float(i) * 0.785398 + 0.39;
		n += landf(tile + vec2(cos(a), sin(a)) * 1.7);
	}
	return clamp(n / 8.0 * 1.6, 0.0, 1.0);
}

vec3 water_colour(int id, vec2 tile, float shore) {
	float t = TIME * motion;
	float near = max(landness(tile), shore);
	// Deep blue in the channel, turquoise and sandy over the shallows.
	float depth = clamp((id == 0 ? 0.1 : 0.75) - (1.0 - near) * 0.5, 0.0, 1.0);
	vec3 deep = tone(0, 0.3);
	vec3 mid = tone(1, 0.35);
	vec3 shallow = mix(tone(1, 0.85), tone(2, 0.7), 0.15);
	vec3 col = mix(deep, mid, smoothstep(0.0, 0.8, depth));
	col = mix(col, shallow, smoothstep(0.45, 1.0, near));
	// Painterly wave strokes: short horizontal dashes drifting slowly.
	vec2 w = tile * vec2(1.6, 6.0) + vec2(t * 0.18, sin(tile.x * 0.7 + t * 0.6) * 0.4);
	float wave = smoothstep(0.66, 0.82, vnoise(w)) * (1.0 - smoothstep(0.82, 0.95, vnoise(w)));
	col = mix(col, tone(1, 1.0) * 1.08, wave * 0.45);
	float trough = smoothstep(0.7, 0.85, vnoise(w + vec2(3.3, 0.5)));
	col = mix(col, deep * 0.85, trough * 0.25 * (1.0 - near));
	// Sky reflections: broad lighter bands, and sparkles that twinkle.
	col = mix(col, vec3(0.82, 0.93, 0.98), smoothstep(0.6, 0.9, fbm(tile * vec2(0.15, 0.4) + vec2(t * 0.02, 0.0))) * 0.18);
	vec2 sg = tile * 3.0;
	float sparkle = (1.0 - smoothstep(0.02, 0.09, length(fract(sg) - 0.5))) * step(0.93, hash(floor(sg))) * (0.5 + 0.5 * sin(t * 3.0 + hash(floor(sg) + 4.0) * 30.0));
	col = mix(col, vec3(1.0), sparkle * 0.85 * motion + sparkle * 0.25 * (1.0 - motion));
	return col;
}

void fragment() {
	vec2 tile = origin + UV * 32.0;
	// Smooth contours: weigh the four nearest tile centres (bilinear, nudged by noise) and let
	// the terrain with the most weight win, blending softly where two are nearly equal. This
	// gives curved shorelines and soft meadow edges instead of tile steps.
	vec2 warp = vec2(fbm(tile * 0.55), fbm(tile * 0.55 + 17.3)) - 0.5;
	vec2 p = tile + warp * 0.55 - 0.5;
	vec2 b = floor(p);
	vec2 f = smoothstep(0.0, 1.0, fract(p));
	int ids4[4] = int[4](id_at(b + vec2(0.5, 0.5)), id_at(b + vec2(1.5, 0.5)), id_at(b + vec2(0.5, 1.5)), id_at(b + vec2(1.5, 1.5)));
	float w4[4] = float[4]((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
	// Water against land decides the shoreline first.
	float wet = 0.0;
	for (int i = 0; i < 4; i++) wet += water(ids4[i]) ? w4[i] : 0.0;
	// Strongest and second-strongest terrain among the corners.
	int a_id = ids4[0];
	float a_w = -1.0;
	int b_id = ids4[0];
	float b_w = -1.0;
	for (int i = 0; i < 4; i++) {
		float sum = 0.0;
		for (int j = 0; j < 4; j++) sum += ids4[j] == ids4[i] ? w4[j] : 0.0;
		if (sum > a_w + 0.0001 && ids4[i] != a_id) {
			if (a_w >= 0.0) { b_id = a_id; b_w = a_w; }
			a_id = ids4[i];
			a_w = sum;
		} else if (ids4[i] != a_id && sum > b_w) {
			b_id = ids4[i];
			b_w = sum;
		} else if (ids4[i] == a_id) {
			a_w = max(a_w, sum);
		}
	}
	float patch = fbm(tile * 0.18);
	float macro = fbm(tile * 0.045 + 3.0);
	vec3 col;
	if (wet > 0.5) {
		int wid = water(a_id) ? a_id : (water(b_id) ? b_id : 1);
		float shore = 1.0 - smoothstep(0.5, 0.95, wet);
		col = water_colour(wid, tile, shore);
		// The bank's face casts a shadow on the water just below it (the view is tilted).
		vec2 q = tile + warp * 0.55;
		float above = water(id_at(q - vec2(0.0, 0.45))) ? 0.0 : 1.0;
		float above2 = water(id_at(q - vec2(0.0, 0.9))) ? 0.0 : 0.5;
		col = mix(col, tone(0, 0.0) * 0.8, max(above, above2) * 0.38);
		// Foam: a lacy band hugging the shore, breathing slowly.
		float lace = vnoise(tile * 7.0 + vec2(TIME * motion * 0.2, 0.0));
		float band = 1.0 - smoothstep(0.5, 0.6 + 0.06 * sin(TIME * motion * 1.2 + tile.x), wet);
		float ring = (1.0 - smoothstep(0.6, 0.7, wet)) * smoothstep(0.62, 0.66, wet) * smoothstep(0.4, 0.6, lace);
		col = mix(col, foam_color.rgb, clamp(band * (0.55 + lace * 0.45) + ring * 0.6, 0.0, 1.0) * 0.85);
	} else {
		int land_a = water(a_id) ? b_id : a_id;
		int land_b = water(b_id) || b_w < 0.0 ? land_a : b_id;
		vec3 ca = land_colour(land_a, tile, patch, macro);
		vec3 cb = land_colour(land_b, tile, patch, macro);
		// Grass into grass blends broadly (meadow, forest floor and hill fade into each other);
		// other borders stay crisp, with a ragged grass lip.
		float soft = green(land_a) && green(land_b) ? 0.45 : 0.06;
		float edge = smoothstep(-soft, soft, (water(a_id) ? b_w : a_w) - (water(b_id) ? 0.0 : b_w) + (fbm(tile * 1.7) - 0.5) * soft * 0.8);
		col = mix(cb, ca, 0.5 + 0.5 * edge);
		// Where grass meets sand, road or rock, a ragged lip of grass hangs over the edge.
		if (green(land_a) != green(land_b)) {
			float lip = 1.0 - abs(edge);
			float tuft = smoothstep(0.45, 0.7, vnoise(tile * vec2(9.0, 4.0)));
			vec3 g = green(land_a) ? land_colour(land_a, tile, patch, macro) : land_colour(land_b, tile, patch, macro);
			col = mix(col, g * 0.82, lip * tuft * 0.6);
		}
		// Damp, darker sand right at the waterline.
		col = mix(col, col * vec3(0.78, 0.8, 0.86), smoothstep(0.3, 0.5, wet));
		if (land_a == 2) {
			// Reeds on the inland bank toward shallow water.
			float grassy = 0.0;
			for (int i = 0; i < 4; i++) grassy += green(ids4[i]) ? w4[i] : 0.0;
			vec2 bank_cell = floor(tile * 2.5);
			vec2 reed = fract(tile * 2.5) - vec2(0.5, 0.7);
			float reed_seed = hash(bank_cell);
			float strokes = 1.0 - smoothstep(0.015, 0.047, abs(abs(reed.x) + reed.y * 0.23 - 0.05));
			strokes *= smoothstep(-0.55, -0.35, reed.y) * (1.0 - smoothstep(0.08, 0.14, reed.y));
			float bank = smoothstep(0.05, 0.22, max(grassy, wet)) * step(reed_seed, 0.55) * (1.0 - snow);
			col = mix(col, tone(3, 0.25 + reed_seed * 0.6), strokes * bank * 0.9);
		}
		// Mountains: a sunlit rim where open ground lies above, a shadowed cliff foot below.
		// Sampled on the same warped grid as the contours, so the rim follows the curved edge.
		if (land_a == 11) {
			vec2 q = tile + warp * 0.55;
			if (id_at(q - vec2(0.0, 0.55)) != 11) col = mix(col, vec3(0.98, 0.94, 0.78), 0.32);
			if (id_at(q + vec2(0.0, 0.55)) != 11) col *= vec3(0.62, 0.6, 0.72);
		} else if (id_at(tile + warp * 0.55 - vec2(0.0, 0.7)) == 11) {
			// Ground just below a cliff lies in its shadow.
			col *= vec3(0.74, 0.8, 0.86);
		}
	}
	// Cloud shadows drifting slowly over land and water.
	float cloud = smoothstep(0.52, 0.7, fbm(tile * 0.03 + vec2(TIME * motion * 0.012, TIME * motion * 0.005)));
	col *= mix(vec3(1.0), vec3(0.8, 0.86, 0.94), cloud * 0.55);
	// Fog of war, soft-edged and slightly mottled.
	float e = texture(fog, (tile - origin + BORDER) / SIDE).r;
	e = smoothstep(0.2, 0.8, e + (fbm(tile * 0.6) - 0.5) * 0.35);
	col = mix(fog_color.rgb * (0.85 + 0.3 * fbm(tile * 0.3)), col, e);
	COLOR = vec4(col, 1.0);
}
