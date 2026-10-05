class_name BuildingLife
extends Node2D
## The little moving pixels the browser draws on finished buildings (src/render/Renderer.ts):
## the campfire's flicker, the market fountain's spray, and flags rippling in the wind. A child of
## the building's node (its footprint's bottom-left), drawn in art pixels so it stays crisp.

## Flag tails from the browser's BUILDING_LIFE: [dx, dy, colour] from the building's top-left.
const FLAGS := {
	"royalHall": [[61, -44, "#e0584a"]], "archeryRange": [[46, -2, "#e0584a"]],
	"watchtower": [[14, -28, "#e0584a"]], "signpost": [[12, -14, "#f4dc5c"]],
	"townHall": [[38, -45, "#e0584a"]], "barracks": [[52, -16, "#e0584a"]],
}
const FIRE := [Color("#d9481f"), Color("#f28a2e"), Color("#ffc947"), Color("#fff3a8")]
const FOAM := Color("#d8f1f4")

var view: WorldView
var type := ""
var id := 0
var level := 1
## Footprint height in tiles (the browser measures from the top-left; this node sits bottom-left).
var h_tiles := 1


static func wanted(b: Building) -> bool:
	return b.built and (b.type == "camp" or b.type == "travelCamp" or b.type == "market" or FLAGS.has(b.type))


func _process(_delta: float) -> void:
	if is_visible_in_tree():
		queue_redraw()


## One art pixel (or a w × h block) at browser coordinates relative to the building's top-left.
func _px(x: float, y: float, w: float, h: float, c: Color) -> void:
	var k := WorldView.TILE_PX / 16.0
	draw_rect(Rect2(Vector2(roundf(x), roundf(y) - h_tiles * 16) * k, Vector2(w, h) * k), c)


func _draw() -> void:
	var still := view != null and view.motion <= 0.0
	var time := 0.0 if still else Time.get_ticks_msec() / 1000.0
	if type == "camp" or type == "travelCamp":
		_campfire(24, 28, time)
	elif type == "market":
		_fountain(40, 36, time)
	for f: Array in FLAGS.get(type, []):
		var fx: float = f[0]
		var fy: float = f[1]
		if type == "townHall" and level == 2:
			fx = 42
			fy = -51
		elif type == "townHall" and level == 3:
			fx = 44
			fy = -65
		for i in 4:
			var wave := roundf(sin(time * 7.0 - i * 0.9 + id) * 1.2)
			_px(fx + i, fy + wave + (1 if i > 1 else 0), 1, 1 if i > 2 else 2, Color(str(f[2])))


func _campfire(x: float, y: float, time: float) -> void:
	var f := floori(time * 10.0)
	_px(x - 2, y - 3, 5, 3, FIRE[0])
	_px(x - 1 + roundf(_flick(f, 1) - 0.5), y - 5 - roundf(_flick(f, 2) * 2.0), 3, 3, FIRE[1])
	_px(x + roundf(_flick(f, 3) - 0.5), y - 6 - roundf(_flick(f, 4) * 2.0), 1, 3, FIRE[2])
	_px(x - 1, y - 2, 3, 1, FIRE[3])


func _fountain(x: float, y: float, time: float) -> void:
	if view != null and view.motion <= 0.0:
		return
	for i in 5:
		var t := fmod(time * 1.4 + i / 5.0, 1.0)
		var a := i / 5.0 * TAU
		_px(x + cos(a) * t * 7.0, y - sin(t * PI) * 6.0 + t * 8.0, 1, 1, FOAM)


## A flicker in 0..1 for frame `f` (the browser's hash01(f, n, 3)).
func _flick(f: int, n: int) -> float:
	return float(WorldNoise.hash2(f, n, 3) % 1000) / 1000.0
