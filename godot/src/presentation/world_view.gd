class_name WorldView
extends Node2D
## Draws the simulation: ground, objects, buildings, fields and settlers, plus a night tint.
## It only reads the Simulation. Everything is culled to the camera's view plus a margin, and
## per-chunk work (ground textures, object sprites) is redone only when that chunk changes.
##
## Layers (z): ground -10 (one shader quad per chunk), fields -5 (soil patches), entities 0
## (y-sorted: objects, crops, buildings, settlers; nested per-chunk containers sort together),
## overlay 10 (WorldOverlay: selection, marks, previews).

const TILE_PX := 64.0
const GOLD := Color("#e6b65a")
const MINT := Color("#cdeedb")
## Chunks kept around the view (beyond it) before their nodes are freed.
const KEEP_MARGIN := 2

var sim: Simulation
var art: Art
var motion := 1.0
## Wind sway on trees, bushes and crops (benchmarks can turn it off to measure batching).
var sway_enabled := true
## Benchmarks can hide the ground to measure its cost.
var ground_visible := true

var _palette: Dictionary
var _pal_tex: ImageTexture
var _ground_shader: Shader
var _sway: ShaderMaterial
var _ground_layer := Node2D.new()
var _field_layer := Node2D.new()
var entities := Node2D.new()
## chunk key -> {node: Sprite2D, terrain_version, fog_version, ids: ImageTexture, fog: ImageTexture}
var _ground := {}
## chunk key -> {node: Node2D, version, season}
var _objects := {}
## building id -> {node: Node2D, look: String}
var _buildings := {}
## settler id -> SettlerView
var settler_views := {}
var _white: ImageTexture
var _season := ""
## Chunk builds (ground textures or object sprites) allowed per frame.
const BUILDS_PER_FRAME := 2
var _builds_left := 0
## Night: a multiply-blended tint over the world, with lit windows drawn above it so they glow.
var _night := ColorRect.new()
var _lights := Node2D.new()


func setup(simulation: Simulation, sprites: Art) -> void:
	sim = simulation
	art = sprites
	_palette = JSON.parse_string(FileAccess.get_file_as_string("res://art/palette.json"))
	_ground_shader = load("res://src/presentation/shaders/ground.gdshader")
	_sway = ShaderMaterial.new()
	_sway.shader = load("res://src/presentation/shaders/sway.gdshader")
	_pal_tex = _make_palette_texture()
	var white := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	white.fill(Color.WHITE)
	_white = ImageTexture.create_from_image(white)
	_ground_layer.z_index = -10
	_field_layer.z_index = -5
	entities.y_sort_enabled = true
	add_child(_ground_layer)
	add_child(_field_layer)
	add_child(entities)
	var mul := CanvasItemMaterial.new()
	mul.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
	_night.material = mul
	_night.z_index = 5
	_night.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_night)
	_lights.z_index = 6
	add_child(_lights)


## Replaces the simulation (after loading), clearing everything drawn.
func set_simulation(simulation: Simulation) -> void:
	sim = simulation
	for d: Dictionary in _ground.values():
		(d["node"] as Node).queue_free()
	for d: Dictionary in _objects.values():
		(d["node"] as Node).queue_free()
	for d: Dictionary in _buildings.values():
		(d["node"] as Node).queue_free()
	for v: SettlerView in settler_views.values():
		v.queue_free()
	_ground.clear()
	_objects.clear()
	_buildings.clear()
	settler_views.clear()


func _make_palette_texture() -> ImageTexture:
	var g: Dictionary = _palette["ground"]
	var order := ["deep", "water", "sand", "grass", "meadow", "forestFloor", "rocky", "road", "bridge", "stoneBridge", "hill", "mountain"]
	var im := Image.create(3, order.size(), false, Image.FORMAT_RGBA8)
	for row in order.size():
		var tones: Array = g[order[row]]
		for i in 3:
			im.set_pixel(i, row, Color(str(tones[i])))
	return ImageTexture.create_from_image(im)


## Called every frame. `alpha` interpolates settlers between the last two ticks; `view` is the
## visible rectangle in world px.
func refresh(alpha: float, view: Rect2, delta: float) -> void:
	var season: String = sim.season()["id"]
	if season != _season:
		_season = season
		_set_season_look(season)
	var c0 := Vector2i(floori(view.position.x / TILE_PX) >> Chunk.SHIFT, floori(view.position.y / TILE_PX) >> Chunk.SHIFT)
	var c1 := Vector2i(floori(view.end.x / TILE_PX) >> Chunk.SHIFT, floori(view.end.y / TILE_PX) >> Chunk.SHIFT)
	_builds_left = BUILDS_PER_FRAME
	# Chunks on screen first, then the margin, so what you see is never waiting on what you don't.
	var centre := Vector2i((c0.x + c1.x) / 2, (c0.y + c1.y) / 2)
	var order: Array[Vector2i] = []
	for cy in range(c0.y - 1, c1.y + 2):
		for cx in range(c0.x - 1, c1.x + 2):
			order.append(Vector2i(cx, cy))
	order.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var ina := a.x >= c0.x and a.x <= c1.x and a.y >= c0.y and a.y <= c1.y
		var inb := b.x >= c0.x and b.x <= c1.x and b.y >= c0.y and b.y <= c1.y
		if ina != inb:
			return ina
		return (a - centre).length_squared() < (b - centre).length_squared())
	for p in order:
		var c := sim.world.peek(p.x, p.y)
		if c == null:
			sim.world.request(p.x, p.y)
			continue
		var k := World.key(p.x, p.y)
		_sync_ground(k, c)
		_sync_objects(k, c)
	_free_far(_ground, c0, c1)
	_free_far(_objects, c0, c1)
	_sync_buildings()
	_sync_settlers(alpha, delta, view.grow(TILE_PX * 3))
	_ground_layer.visible = ground_visible
	_night.color = _night_tint()
	_night.visible = _night.color != Color.WHITE
	_night.position = view.position - Vector2(64, 64)
	_night.size = view.size + Vector2(128, 128)


func _free_far(store: Dictionary, c0: Vector2i, c1: Vector2i) -> void:
	for k: int in store.keys():
		var cx := World.key_cx(k)
		var cy := World.key_cy(k)
		if cx < c0.x - KEEP_MARGIN or cx > c1.x + KEEP_MARGIN or cy < c0.y - KEEP_MARGIN or cy > c1.y + KEEP_MARGIN:
			(store[k]["node"] as Node).queue_free()
			store.erase(k)


# ---- ground ------------------------------------------------------------------------------------

func _sync_ground(k: int, c: Chunk) -> void:
	var g: Dictionary = _ground.get(k, {})
	if g.is_empty():
		if _builds_left <= 0:
			return
		_builds_left -= 1
		var node := Sprite2D.new()
		node.texture = _white
		node.centered = false
		node.scale = Vector2.ONE * Chunk.SIZE * TILE_PX
		node.position = Vector2(c.cx, c.cy) * Chunk.SIZE * TILE_PX
		var mat := ShaderMaterial.new()
		mat.shader = _ground_shader
		mat.set_shader_parameter("pal", _pal_tex)
		mat.set_shader_parameter("origin", Vector2(c.cx, c.cy) * Chunk.SIZE)
		mat.set_shader_parameter("fog_color", Color(str(_palette["ground"]["fog"])))
		mat.set_shader_parameter("foam_color", Color(str(_palette["ground"]["foam"])))
		node.material = mat
		_ground_layer.add_child(node)
		g = {"node": node, "terrain_version": -1, "fog_version": -1, "neighbours": -1}
		_ground[k] = g
	var mat: ShaderMaterial = (g["node"] as Sprite2D).material
	mat.set_shader_parameter("motion", motion)
	# Borders come from neighbouring chunks, so a neighbour loading later repaints us too.
	var nsum := _neighbour_signature(c)
	if int(g["terrain_version"]) != c.terrain_version or int(g["neighbours"]) != nsum:
		g["terrain_version"] = c.terrain_version
		g["neighbours"] = nsum
		mat.set_shader_parameter("ids", _bordered_texture(c, false))
	if int(g["fog_version"]) != c.fog_version:
		g["fog_version"] = c.fog_version
		mat.set_shader_parameter("fog", _bordered_texture(c, true))


func _neighbour_signature(c: Chunk) -> int:
	var sum := 0
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var n := sim.world.peek(c.cx + dx, c.cy + dy)
			sum = sum * 31 + (0 if n == null else n.terrain_version + 1)
	return sum


## A 34×34 R8 texture of terrain ids (or exploration) for a chunk plus a one-tile border.
func _bordered_texture(c: Chunk, fog: bool) -> ImageTexture:
	var data := PackedByteArray()
	data.resize(34 * 34)
	var ox := c.cx * Chunk.SIZE - 1
	var oy := c.cy * Chunk.SIZE - 1
	for y in 34:
		for x in 34:
			var tx := ox + x
			var ty := oy + y
			var v := 0
			if fog:
				v = 255 if sim.world.explored(tx, ty) else 0
			else:
				var t := sim.world.terrain(tx, ty)
				if t == World.UNKNOWN:
					# Unloaded neighbour: repeat our own edge.
					t = c.terrain[clampi(ty - c.cy * Chunk.SIZE, 0, 31) * Chunk.SIZE + clampi(tx - c.cx * Chunk.SIZE, 0, 31)]
				v = t
			data[y * 34 + x] = v
	return ImageTexture.create_from_image(Image.create_from_data(34, 34, false, Image.FORMAT_R8, data))


func _set_season_look(season: String) -> void:
	for g: Dictionary in _ground.values():
		_apply_season((g["node"] as Sprite2D).material, season)
	# Object sprites change with the season (autumn leaves, bare winter trees).
	for d: Dictionary in _objects.values():
		d["version"] = -1


func _apply_season(mat: ShaderMaterial, season: String) -> void:
	mat.set_shader_parameter("autumn", 0.6 if season == "autumn" else 0.0)
	mat.set_shader_parameter("snow", 0.75 if season == "winter" else 0.0)


# ---- objects -------------------------------------------------------------------------------------

func _sync_objects(k: int, c: Chunk) -> void:
	var d: Dictionary = _objects.get(k, {})
	if not d.is_empty() and int(d["version"]) == c.version:
		return
	if not _ground.has(k) or _builds_left <= 0:
		return
	_builds_left -= 1
	if not d.is_empty():
		(d["node"] as Node).queue_free()
	else:
		_apply_season((_ground[k]["node"] as Sprite2D).material, _season)
	var node := Node2D.new()
	node.y_sort_enabled = true
	entities.add_child(node)
	var ox := c.cx * Chunk.SIZE
	var oy := c.cy * Chunk.SIZE
	for i in Chunk.AREA:
		var o := c.obj[i]
		if o == Tiles.O_NONE:
			continue
		var tx := ox + (i & Chunk.MASK)
		var ty := oy + (i >> Chunk.SHIFT)
		var sprite_name := _object_sprite(o, tx, ty)
		if sprite_name == "":
			continue
		var sp := Sprite2D.new()
		art.apply(sp, sprite_name)
		sp.position = Vector2(tx + 0.5, ty + 0.78) * TILE_PX
		if sway_enabled and (o == Tiles.O_OAK or o == Tiles.O_PINE or o == Tiles.O_BERRY or o == Tiles.O_BERRY_EMPTY or o == Tiles.O_SAPLING):
			sp.material = _sway
		node.add_child(sp)
	_objects[k] = {"node": node, "version": c.version}


func _object_sprite(o: int, tx: int, ty: int) -> String:
	var v := WorldNoise.hash2(tx, ty, 991)
	var winter := _season == "winter"
	match o:
		Tiles.O_OAK:
			return "oak_%d_%s" % [v % 3, "winter" if winter else ("autumn" if _season == "autumn" else "summer")]
		Tiles.O_PINE:
			return "pine_%d_%s" % [v % 2, "winter" if winter else "summer"]
		Tiles.O_BERRY:
			return "berry_full_%s" % ("winter" if winter else "summer")
		Tiles.O_BERRY_EMPTY:
			return "berry_empty_%s" % ("winter" if winter else "summer")
		Tiles.O_ROCK:
			return "rock_%d" % (v % 2)
		Tiles.O_BOULDER:
			return "boulder"
		Tiles.O_STUMP:
			return "stump"
		Tiles.O_SAPLING:
			return "sapling"
	return ""


# ---- buildings and fields ----------------------------------------------------------------------

func _sync_buildings() -> void:
	var seen := {}
	var night := sim.is_night() or sim.time_of_day() > Defs.DUSK
	for b: Building in sim.buildings.values():
		seen[b.id] = true
		var look := _building_look(b, night)
		var d: Dictionary = _buildings.get(b.id, {})
		if not d.is_empty() and d["look"] == look:
			continue
		if not d.is_empty():
			(d["node"] as Node).queue_free()
		_buildings[b.id] = {"node": _make_building(b, look), "look": look}
	for id: int in _buildings.keys():
		if not seen.has(id):
			(_buildings[id]["node"] as Node).queue_free()
			_buildings.erase(id)


## A string naming everything about the building's appearance; a change rebuilds its node.
func _building_look(b: Building, night: bool) -> String:
	if b.is_field():
		var f := b.field
		var stage := Farming.field_stage(f)
		var wet: bool = float(f["moisture"]) >= Farming.WATER_THRESHOLD and f["state"] != "wild"
		return "field:%s:%s:%d:%s" % [f["state"], f["crop"], stage, wet]
	if not b.built:
		return "site:%d:%d" % [b.w, b.h]
	return "%s:%s" % [b.type, night]


func _make_building(b: Building, look: String) -> Node2D:
	var base := Vector2(b.x, b.y + b.h) * TILE_PX
	if b.is_field():
		var holder := Node2D.new()
		var soil := Sprite2D.new()
		var f := b.field
		var state := "wild" if f["state"] == "wild" else ("wet" if look.ends_with("true") else "tilled")
		art.apply(soil, "soil_" + state)
		soil.position = base
		_field_layer.add_child(soil)
		holder.set_meta("soil", soil)
		var stage := Farming.field_stage(f)
		if stage >= 0 and f["crop"] != "" and art.has("crop_%s_%d" % [f["crop"], stage]):
			var crop := Sprite2D.new()
			art.apply(crop, "crop_%s_%d" % [f["crop"], stage])
			crop.position = base
			if sway_enabled:
				crop.material = _sway
			holder.add_child(crop)
		holder.tree_exiting.connect(func() -> void: soil.queue_free())
		entities.add_child(holder)
		return holder
	var node := Node2D.new()
	node.position = base
	var sp := Sprite2D.new()
	var name := "site_%dx%d" % [b.w, b.h] if not b.built else b.type
	if not art.has(name):
		name = "site_%dx%d" % [mini(b.w, 4), mini(b.h, 3)] if art.has("site_%dx%d" % [mini(b.w, 4), mini(b.h, 3)]) else "site_1x1"
	art.apply(sp, name)
	node.add_child(sp)
	entities.add_child(node)
	if b.built and look.ends_with("true") and art.has(b.type + "_lit"):
		# Lit windows sit above the night tint, so they glow.
		var lit := Sprite2D.new()
		art.apply(lit, b.type + "_lit")
		lit.position = base
		var add := CanvasItemMaterial.new()
		add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		lit.material = add
		_lights.add_child(lit)
		node.tree_exiting.connect(func() -> void: lit.queue_free())
	return node


# ---- settlers ------------------------------------------------------------------------------------

func _sync_settlers(alpha: float, delta: float, area: Rect2) -> void:
	var seen := {}
	for s in sim.settlers:
		seen[s.id] = true
		var v: SettlerView = settler_views.get(s.id)
		if v == null:
			v = SettlerView.new()
			v.setup(art, s, _palette["people"])
			entities.add_child(v)
			settler_views[s.id] = v
		var pos := Vector2(lerpf(s.rpx, s.rx, alpha), lerpf(s.rpy, s.ry, alpha)) * TILE_PX
		if not area.has_point(pos):
			# Off screen: hide and skip the per-frame work.
			v.visible = false
			v.position = pos
			continue
		v.refresh(s, pos, delta, motion)
	for id: int in settler_views.keys():
		if not seen.has(id):
			(settler_views[id] as Node).queue_free()
			settler_views.erase(id)


# ---- light ---------------------------------------------------------------------------------------

## The whole scene's colour by time of day: warm noon, golden dusk, deep teal night.
func _night_tint() -> Color:
	var t := sim.time_of_day()
	var day := Color(1, 1, 1)
	var dusk := Color(1.0, 0.86, 0.72)
	var night := Color(0.42, 0.55, 0.62)
	if t >= Defs.MORNING + 0.06 and t < Defs.DUSK:
		return day
	if t >= Defs.DUSK and t < Defs.NIGHT_START:
		return day.lerp(dusk, (t - Defs.DUSK) / (Defs.NIGHT_START - Defs.DUSK))
	if t >= Defs.NIGHT_START:
		return dusk.lerp(night, clampf((t - Defs.NIGHT_START) / 0.04, 0.0, 1.0))
	if t < Defs.MORNING:
		return night
	return night.lerp(day, (t - Defs.MORNING) / 0.06)
