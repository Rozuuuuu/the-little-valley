class_name FogView
extends Node2D
## The fog of war, drawn over the ground, trees, buildings and people as one soft layer (one value
## per tile, smoothed between tiles), so everything under it dims together:
## - land near your people and buildings is clear;
## - explored land nobody is near has a light veil: you still see it, a little dimmed;
## - unexplored land is half dark at the edge of what you know and darkens with distance, black
##   FAR tiles out.
## Values are worked out for the view plus a margin, a few times a second, and fade over that time.

const FAR := 7
const VEIL := 0.3
const EDGE := 0.5
const SETTLER_SIGHT := 7
const BUILDING_SIGHT := 5
## Tiles kept around the view, so small pans need no recalculation.
const MARGIN := 12
## Seconds between updates (and the fade between them).
const REFRESH := 0.35
const COLOR := Color("#17131f")

var sim: Simulation
## The light veil over explored land nobody is near (off behind the title).
var veil := true:
	set(on):
		veil = on
		_mat.set_shader_parameter("veil", VEIL if on else 0.0)
var _sprite := Sprite2D.new()
var _mat := ShaderMaterial.new()
var _region := Rect2i()
var _explored_version := -1
## Chamfer distance to explored land (2 per tile straight, 3 diagonal), 0 on explored tiles.
var _dist := PackedByteArray()
var _base := PackedByteArray()
var _sight: Image
var _base_tex: ImageTexture
var _sight_tex: ImageTexture
var _timer := 0.0
var _dist_timer := 0.0
var _fade := 1.0
var _discs := {}


func _init() -> void:
	z_index = 7
	_sprite.centered = false
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_mat.shader = load("res://src/presentation/shaders/fog.gdshader")
	_mat.set_shader_parameter("fog_color", COLOR)
	_mat.set_shader_parameter("veil", VEIL)
	_sprite.material = _mat
	add_child(_sprite)


## Forget everything (a different valley).
func reset() -> void:
	_region = Rect2i()
	_explored_version = -1
	_base_tex = null
	_sprite.texture = null


func refresh(view: Rect2, delta: float) -> void:
	if sim == null:
		return
	var t := WorldView.TILE_PX
	var vt := Rect2i(floori(view.position.x / t), floori(view.position.y / t), ceili(view.size.x / t) + 1, ceili(view.size.y / t) + 1)
	var moved := _base_tex == null or not _region.encloses(vt.grow(3))
	_timer -= delta
	_dist_timer -= delta
	if not moved and _timer > 0.0:
		_advance_fade(delta)
		return
	_timer = REFRESH
	if moved:
		_region = vt.grow(MARGIN)
	# The darkness of unexplored land changes only as land is explored: at most once a second.
	var base_changed := moved or (_explored_version != sim.world.explored_version and _dist_timer <= 0.0)
	if base_changed:
		_dist_timer = 1.0
		_explored_version = sim.world.explored_version
		_compute_distance()
		_compute_base()
	_compute_sight()
	var sight_tex := ImageTexture.create_from_image(_sight)
	var base_tex := ImageTexture.create_from_image(Image.create_from_data(_region.size.x, _region.size.y, false, Image.FORMAT_L8, _base)) if base_changed else _base_tex
	# Fade from the last picture unless the view jumped to new ground.
	_mat.set_shader_parameter("sight_prev", sight_tex if moved else _sight_tex)
	_mat.set_shader_parameter("base_prev", base_tex if moved else _base_tex)
	_mat.set_shader_parameter("sight", sight_tex)
	_mat.set_shader_parameter("base", base_tex)
	_sight_tex = sight_tex
	_base_tex = base_tex
	_sprite.texture = base_tex
	_sprite.position = Vector2(_region.position) * WorldView.TILE_PX
	_sprite.scale = Vector2.ONE * WorldView.TILE_PX
	_fade = 1.0 if moved else 0.0
	_mat.set_shader_parameter("t", _fade)


func _advance_fade(delta: float) -> void:
	if _fade < 1.0:
		_fade = minf(1.0, _fade + delta / REFRESH)
		_mat.set_shader_parameter("t", _fade)


## Unexplored darkness per tile: EDGE next to explored land, rising to black FAR tiles out; 0 on
## explored land (the shader adds the veil where nobody is near).
func _compute_base() -> void:
	var n := _dist.size()
	_base.resize(n)
	var lut := PackedByteArray()
	lut.resize(256)
	for v in 256:
		lut[v] = 0 if v == 0 else roundi(clampf(EDGE + (v / 2.0 - 1.0) / (FAR - 1.0) * (1.0 - EDGE), EDGE, 1.0) * 255.0)
	for i in n:
		_base[i] = lut[_dist[i]]


func _compute_distance() -> void:
	var w := _region.size.x
	var h := _region.size.y
	var x0 := _region.position.x
	var y0 := _region.position.y
	_dist.resize(w * h)
	_dist.fill(255)
	for cy in range(y0 >> Chunk.SHIFT, ((y0 + h - 1) >> Chunk.SHIFT) + 1):
		for cx in range(x0 >> Chunk.SHIFT, ((x0 + w - 1) >> Chunk.SHIFT) + 1):
			var f := sim.world.explored_flags(cx, cy)
			if f.is_empty():
				continue
			var bx := cx * Chunk.SIZE
			var by := cy * Chunk.SIZE
			for y in range(maxi(by, y0), mini(by + Chunk.SIZE, y0 + h)):
				var src := (y - by) * Chunk.SIZE - bx
				var dst := (y - y0) * w - x0
				for x in range(maxi(bx, x0), mini(bx + Chunk.SIZE, x0 + w)):
					if f[src + x] == 1:
						_dist[dst + x] = 0
	# Two chamfer passes; the distance only matters up to FAR tiles.
	var d := _dist
	for y in h:
		var row := y * w
		for x in w:
			var i := row + x
			var v := d[i]
			if v == 0:
				continue
			if x > 0:
				v = mini(v, d[i - 1] + 2)
			if y > 0:
				v = mini(v, d[i - w] + 2)
				if x > 0:
					v = mini(v, d[i - w - 1] + 3)
				if x < w - 1:
					v = mini(v, d[i - w + 1] + 3)
			d[i] = mini(v, 255)
	for y in range(h - 1, -1, -1):
		var row := y * w
		for x in range(w - 1, -1, -1):
			var i := row + x
			var v := d[i]
			if v == 0:
				continue
			if x < w - 1:
				v = mini(v, d[i + 1] + 2)
			if y < h - 1:
				v = mini(v, d[i + w] + 2)
				if x < w - 1:
					v = mini(v, d[i + w + 1] + 3)
				if x > 0:
					v = mini(v, d[i + w - 1] + 3)
			d[i] = mini(v, 255)
	_dist = d


## A disc of sight: one rectangle per row (filled natively, which is quick for hundreds).
func _disc(r: int) -> PackedInt32Array:
	if not _discs.has(r):
		var out := PackedInt32Array()
		for y in range(-r, r + 1):
			var half := floori(sqrt(float(r * r + r - y * y)))
			out.append(y)
			out.append(half)
		_discs[r] = out
	return _discs[r]


func _stamp(cx: int, cy: int, r: int) -> void:
	var lx := cx - _region.position.x
	var ly := cy - _region.position.y
	var disc := _disc(r)
	for j in range(0, disc.size(), 2):
		var half := disc[j + 1]
		_sight.fill_rect(Rect2i(lx - half, ly + disc[j], half * 2 + 1, 1), Color.WHITE)


func _compute_sight() -> void:
	_sight = Image.create(_region.size.x, _region.size.y, false, Image.FORMAT_L8)
	var area := _region.grow(SETTLER_SIGHT + 4)
	var seen := {}
	for s: Settler in sim.settlers:
		if s.kingdom_id != 0:
			continue
		var tx := floori(s.x)
		var ty := floori(s.y)
		if not area.has_point(Vector2i(tx, ty)):
			continue
		var k := Simulation.tile_key(tx, ty)
		if seen.has(k):
			continue
		seen[k] = true
		_stamp(tx, ty, SETTLER_SIGHT)
	for b: Building in sim.buildings.values():
		if b.is_field() or not area.has_point(Vector2i(b.x, b.y)):
			continue
		_stamp(floori(b.x + b.w / 2.0), floori(b.y + b.h / 2.0), BUILDING_SIGHT + maxi(b.w, b.h) / 2)
