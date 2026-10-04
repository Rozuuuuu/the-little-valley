// Ground for one 32×32-tile chunk: painted terrain with organic borders, animated water with a
// foam edge, seasonal tint, and soft fog of war. One quad per chunk; see ChunkGround.
// Terrain ids (src/world/tiles.gd): 0 deep water, 1 water, 2 sand, 3 grass, 4 meadow, 5 forest,
// 6 rocky, 7 road, 8 bridge, 9 stone bridge, 10 hill, 11 mountain.
shader_type canvas_item;

// 34×34: the chunk plus a one-tile border from its neighbours. R = terrain id / 255.
uniform sampler2D ids : filter_nearest;
// 34×34 exploration (R = 1 explored), sampled smoothly for a soft fog edge.
uniform sampler2D fog : filter_linear;
// 3 tones (dark, mid, light) × 12 terrains.
uniform sampler2D pal : filter_nearest;
uniform vec2 origin;
uniform vec4 fog_color : source_color = vec4(0.08, 0.19, 0.18, 1.0);
uniform vec4 foam_color : source_color = vec4(0.83, 0.94, 0.91, 1.0);
uniform vec4 snow_color : source_color = vec4(0.93, 0.96, 0.97, 1.0);
// 0 in spring/summer, up to 1 in autumn (warmer, drier grass).
uniform float autumn = 0.0;
// 0..1: how much snow lies on open ground.
uniform float snow = 0.0;
// 1 = animated water; 0 with reduced motion.
uniform float motion = 1.0;

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

int id_at(vec2 tile) {
	vec2 local = clamp(floor(tile - origin) + 1.0, vec2(0.0), vec2(33.0));
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

// The colour of one terrain at this point (water handled separately).
vec3 land_colour(int id, vec2 tile, float patch, float detail) {
	vec3 col = tone(id, patch * 1.15 - 0.08 + (detail - 0.5) * 0.18);
	if (green(id)) {
		// Short blades: a few slightly darker streaks.
		float blade = step(0.86, vnoise(tile * vec2(9.0, 3.0)));
		col *= 1.0 - blade * 0.07;
		col = mix(col, col * vec3(1.14, 0.98, 0.70), autumn);
		col = mix(col, snow_color.rgb, snow * smoothstep(0.3, 0.55, fbm(tile * 0.5)));
	}
	if (id == 10) {
		float c = fract(fbm(tile * 0.25) * 6.0);
		col *= 1.0 - smoothstep(0.9, 1.0, c) * 0.12;
	}
	if (id == 11) {
		col *= 0.9 + 0.1 * sin(tile.y * 5.0 + fbm(tile) * 4.0);
		col = mix(col, snow_color.rgb, snow * 0.6);
	}
	if (id == 7 || id == 8 || id == 9) {
		col *= 0.95 + detail * 0.1;
	}
	return col;
}

vec3 water_colour(int id, vec2 tile, float shore) {
	float t = TIME * motion;
	float ripple = vnoise(tile * 1.3 + vec2(t * 0.25, t * 0.18));
	vec3 col = tone(id, 0.25 + ripple * 0.45 + shore * 0.3);
	float glint = smoothstep(0.78, 0.95, vnoise(tile * 2.6 + vec2(-t * 0.4, t * 0.3)));
	col = mix(col, foam_color.rgb, glint * 0.16 * motion);
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
	float detail = vnoise(tile * 3.1);
	vec3 col;
	if (wet > 0.5) {
		int wid = water(a_id) ? a_id : (water(b_id) ? b_id : 1);
		float shore = 1.0 - smoothstep(0.5, 0.95, wet);
		col = water_colour(wid, tile, shore);
		float foam = shore * (0.6 + 0.4 * sin(TIME * motion * 1.7 + fbm(tile * 2.0) * 6.0));
		col = mix(col, foam_color.rgb, smoothstep(0.25, 0.9, foam) * 0.85);
	} else {
		int land_a = water(a_id) ? b_id : a_id;
		int land_b = water(b_id) || b_w < 0.0 ? land_a : b_id;
		vec3 ca = land_colour(land_a, tile, patch, detail);
		vec3 cb = land_colour(land_b, tile, patch, detail);
		float edge = smoothstep(-0.06, 0.06, (water(a_id) ? b_w : a_w) - (water(b_id) ? 0.0 : b_w));
		col = mix(cb, ca, 0.5 + 0.5 * edge);
		// Damp sand right at the waterline.
		col = mix(col, col * 0.86, smoothstep(0.3, 0.5, wet));
		// Mountains: a lit rim where open ground lies above, a dark foot below.
		if (land_a == 11) {
			if (id_at(tile - vec2(0.0, 0.55)) != 11) col = mix(col, vec3(0.80, 0.93, 0.86), 0.3);
			if (id_at(tile + vec2(0.0, 0.55)) != 11) col *= 0.72;
		}
	}
	// Fog of war, soft-edged and slightly mottled.
	float e = texture(fog, (tile - origin + 1.0) / 34.0).r;
	e = smoothstep(0.2, 0.8, e + (fbm(tile * 0.6) - 0.5) * 0.35);
	col = mix(fog_color.rgb * (0.85 + 0.3 * fbm(tile * 0.3)), col, e);
	COLOR = vec4(col, 1.0);
}
