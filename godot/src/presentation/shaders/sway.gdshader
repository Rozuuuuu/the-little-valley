// Gentle wind sway for trees and bushes: the top of the sprite moves, the base stays put.
// Shared by every swaying sprite (one material), so batching is kept.
shader_type canvas_item;

// 1 = sway; 0 with reduced motion.
uniform float motion = 1.0;
uniform float strength = 3.0;

void vertex() {
	// Sprites are drawn with their anchor at the origin, so the top has the most negative y.
	float h = clamp(-VERTEX.y / 280.0, 0.0, 1.0);
	vec2 world = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xy;
	float phase = world.x * 0.013 + world.y * 0.007;
	VERTEX.x += (sin(TIME * 1.3 + phase) + 0.4 * sin(TIME * 2.9 + phase * 1.7)) * strength * h * h * motion;
}
