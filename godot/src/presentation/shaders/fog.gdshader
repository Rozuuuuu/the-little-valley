// The fog of war (FogView), one value per tile smoothed between tiles:
// base = darkness of unexplored land (0 on explored land), sight = 1 near your people and
// buildings. Explored land nobody is near gets a light veil. Fades from the previous update.
shader_type canvas_item;

uniform sampler2D base : filter_linear;
uniform sampler2D base_prev : filter_linear;
uniform sampler2D sight : filter_linear;
uniform sampler2D sight_prev : filter_linear;
uniform float t = 1.0;
uniform float veil = 0.3;
uniform vec4 fog_color : source_color = vec4(0.09, 0.075, 0.12, 1.0);

void fragment() {
	float b = mix(texture(base_prev, UV).r, texture(base, UV).r, t);
	float s = mix(texture(sight_prev, UV).r, texture(sight, UV).r, t);
	COLOR = vec4(fog_color.rgb, max(b, veil * (1.0 - s)));
}
