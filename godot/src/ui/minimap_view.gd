class_name MinimapView
extends Control
## The console's overview map, as the browser game's Minimap (src/render/Minimap.ts): explored
## ground at one colour per tile (trees and rocks marked), work areas, buildings (sites blink),
## settlers in 2×2 groups (idle ones in amber), and the camera's view. Click to move the camera.

const W := 212
const H := 120
const TERRAIN := ["#244f7e", "#3b82b4", "#dbc284", "#56913f", "#7aba52", "#3a6a36", "#908a79", "#c39a66", "#b98049", "#c8cccc", "#66903f", "#7f7987"]
const TREE := "#2c5a2e"
const ROCK := "#80868c"
const AREA_COLORS := {"farm": "#e9c65a", "wood": "#8ee07a", "stone": "#d6dadc", "build": "#8fc9e0", "hunt": "#e0845a", "forage": "#e07ab8"}

var game: Game
## Pixels per tile (1 far, 2 mid, 3 near).
var scale_px := 2
var show_settlers := true
var show_buildings := true
var show_areas := true
## chunk key -> {tex, key}
var _cache := {}
var _centre := Vector2.ZERO


func _ready() -> void:
	custom_minimum_size = Vector2(W, H)
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true


func _chunk_texture(c: Chunk) -> ImageTexture:
	var key := "%d:%d:%d" % [c.version, c.terrain_version, c.fog_version]
	var k := World.key(c.cx, c.cy)
	var hit: Dictionary = _cache.get(k, {})
	if not hit.is_empty() and hit["key"] == key:
		return hit["tex"]
	var im := Image.create(Chunk.SIZE, Chunk.SIZE, false, Image.FORMAT_RGBA8)
	var ox := c.cx * Chunk.SIZE
	var oy := c.cy * Chunk.SIZE
	for i in Chunk.AREA:
		var tx := ox + (i & Chunk.MASK)
		var ty := oy + (i >> Chunk.SHIFT)
		if not game.sim.world.explored(tx, ty):
			continue
		var o := c.obj[i]
		var col: String = TREE if o == Tiles.O_OAK or o == Tiles.O_PINE else (ROCK if o == Tiles.O_ROCK or o == Tiles.O_BOULDER else TERRAIN[mini(c.terrain[i], TERRAIN.size() - 1)])
		im.set_pixel(i & Chunk.MASK, i >> Chunk.SHIFT, Color(col))
	var tex := ImageTexture.create_from_image(im)
	_cache[k] = {"tex": tex, "key": key}
	if _cache.size() > 400:
		_cache.erase(_cache.keys()[0])
	return tex


func _process(_delta: float) -> void:
	if is_visible_in_tree() and game != null and game.sim != null:
		queue_redraw()


func _to(t: Vector2) -> Vector2:
	return Vector2(W / 2.0, H / 2.0) + (t - _centre) * scale_px


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Vector2(W, H)), Color("#141c18"))
	if game == null or game.sim == null:
		return
	var sim := game.sim
	var s := float(scale_px)
	_centre = game.camera.position / WorldView.TILE_PX
	var half := Vector2(W / 2.0 / s, H / 2.0 / s)
	var c0 := Vector2i(floori((_centre.x - half.x) / Chunk.SIZE), floori((_centre.y - half.y) / Chunk.SIZE))
	var c1 := Vector2i(floori((_centre.x + half.x) / Chunk.SIZE), floori((_centre.y + half.y) / Chunk.SIZE))
	for cy in range(c0.y, c1.y + 1):
		for cx in range(c0.x, c1.x + 1):
			var c := sim.world.peek(cx, cy)
			if c == null:
				continue
			draw_texture_rect(_chunk_texture(c), Rect2(_to(Vector2(cx, cy) * Chunk.SIZE), Vector2.ONE * Chunk.SIZE * s), false)
	var t := Time.get_ticks_msec() / 1000.0
	if show_areas:
		for a in sim.work_areas:
			draw_rect(Rect2(_to(Vector2(a.x0, a.y0)), Vector2(a.x1 - a.x0 + 1, a.y1 - a.y0 + 1) * s), Color(str(AREA_COLORS.get(a.kind, "#ffffff"))), false, 1.0)
	if show_buildings:
		for b: Building in sim.buildings.values():
			var d := b.def()
			var col := "#f2e0b6"
			if b.is_field():
				col = "#8e6841"
			elif not b.built:
				col = "#ffcf5a" if int(t * 2.0) % 2 == 1 else "#b98049"
			elif d.has("housing"):
				col = "#ffc947" if b.type == "camp" or b.type == "townHall" else "#de7b4e"
			elif d.has("storage"):
				col = "#7897bd"
			elif d.has("recipes"):
				col = "#f28a2e"
			draw_rect(Rect2(_to(Vector2(b.x, b.y)), Vector2(maxf(2.0, b.w * s), maxf(2.0, b.h * s))), Color(col))
	if show_settlers:
		var seen := {}
		for st in sim.settlers:
			if st.hidden:
				continue
			var g := Vector2i(floori(st.x / 2.0), floori(st.y / 2.0))
			if seen.has(g):
				continue
			seen[g] = true
			var p := _to(Vector2(st.x, st.y)).floor()
			var idle := (st.task == null or st.task.kind == Task.WANDER) and st.idle_reason != ""
			draw_rect(Rect2(p - Vector2.ONE, Vector2(3, 3)), Color("#1b1422"))
			draw_rect(Rect2(p, Vector2.ONE), Color("#ffcf5a") if idle else Color("#fff8e8"))
	# The camera's view.
	var view := game.camera.view_rect()
	draw_rect(Rect2(_to(view.position / WorldView.TILE_PX), view.size / WorldView.TILE_PX * s), Color(1.0, 0.97, 0.91, 0.9), false, 1.0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and (event as InputEventMouseButton).pressed and (event as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		_jump((event as InputEventMouseButton).position)
		accept_event()
	elif event is InputEventMouseMotion and ((event as InputEventMouseMotion).button_mask & MOUSE_BUTTON_MASK_LEFT) != 0:
		_jump((event as InputEventMouseMotion).position)
		accept_event()


func _jump(at: Vector2) -> void:
	var tile := _centre + (at - Vector2(W / 2.0, H / 2.0)) / float(scale_px)
	game.camera.target_pos = tile * WorldView.TILE_PX
