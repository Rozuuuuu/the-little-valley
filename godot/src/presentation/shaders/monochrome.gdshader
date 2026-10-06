// The game's monochromatic look: everything on screen (world and interface) re-coloured by its
// brightness onto one warm sepia ramp, ink to cream. Shapes, shading and animation are kept;
// only the hue goes. Brightness is lifted a little in contrast so the art stays readable, and
// held to 16 steps so the pixel art keeps crisp, even bands.
shader_type canvas_item;

uniform sampler2D screen : hint_screen_texture, filter_nearest;
uniform float strength = 1.0;
uniform vec3 ink : source_color = vec3(0.118, 0.078, 0.047);
uniform vec3 dark : source_color = vec3(0.290, 0.196, 0.125);
uniform vec3 mid : source_color = vec3(0.541, 0.392, 0.251);
uniform vec3 lit : source_color = vec3(0.788, 0.643, 0.431);
uniform vec3 pale : source_color = vec3(0.949, 0.886, 0.737);

vec3 ramp(float l) {
	if (l < 0.25) return mix(ink, dark, l / 0.25);
	if (l < 0.5) return mix(dark, mid, (l - 0.25) / 0.25);
	if (l < 0.75) return mix(mid, lit, (l - 0.5) / 0.25);
	return mix(lit, pale, (l - 0.75) / 0.25);
}

void fragment() {
	vec3 c = texture(screen, SCREEN_UV).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	// Keep water apart from land once the hue is gone: bluish colours read a little deeper,
	// warm sand and wheat a little lighter.
	float blue = clamp(c.b - max(c.r, c.g), 0.0, 1.0);
	float warm = clamp(c.r - c.b, 0.0, 1.0);
	l = l - blue * 0.35 + warm * 0.08;
	l = clamp((l - 0.5) * 1.12 + 0.52, 0.0, 1.0);
	l = floor(l * 16.0 + 0.5) / 16.0;
	COLOR = vec4(mix(c, ramp(l), strength), 1.0);
}
