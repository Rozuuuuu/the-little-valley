// Night over the world (multiplied in), with the darkness lifted round every light: camps,
// lamps, windows of homes where someone sleeps (Renderer.drawLighting). Each light is
// (x, y, radius) in world px; the falloff is the browser's gradient (full, 70% at half, none).
shader_type canvas_item;
render_mode blend_mul;

uniform vec4 tint : source_color = vec4(1.0);
uniform vec2 origin;
uniform vec2 extent;
uniform int count = 0;
uniform vec4 lights[48];

void fragment() {
	vec2 w = origin + UV * extent;
	float lift = 0.0;
	for (int i = 0; i < count; i++) {
		float d = distance(w, lights[i].xy) / lights[i].z;
		float f = d < 0.5 ? mix(1.0, 0.7, d * 2.0) : mix(0.7, 0.0, clamp((d - 0.5) * 2.0, 0.0, 1.0));
		lift = max(lift, f);
	}
	COLOR = vec4(mix(tint.rgb, vec3(1.0), lift), 1.0);
}
