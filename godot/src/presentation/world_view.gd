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
## Trees leaning a pixel in the wind (benchmarks can turn it off). Pixel art moves in whole
## pixels, never a smooth bend, which would blur and shimmer it.
var sway_enabled := true
## Benchmarks can hide the ground to measure its cost.
var ground_visible := true

var _palette: Dictionary
var _ground_shader: Shader
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
## animal id -> Sprite2D
var animal_views := {}
## company id -> CompanyView, for companies in the field.
var company_views := {}
var _white: ImageTexture
var _season := ""
## Chunk builds (ground textures or object sprites) allowed per frame.
const BUILDS_PER_FRAME := 2
var _builds_left := 0
## Night: a multiply-blended tint over the world, with lit windows drawn above it so they glow.
var _night := ColorRect.new()
var _lights := Node2D.new()
## The fog of war over everything (see FogView).
var fog := FogView.new()
## Lights, weather, the ruler's aura, corpses, merchants and carts (see WorldLife).
var life := WorldLife.new()
var _ground_motion := 1.0


func _init() -> void:
	# The title may close before setup() is called. Own these nodes from construction.
	for layer: Node in [_ground_layer, _field_layer, entities, _night, _lights, fog, life]:
		add_child(layer)


func setup(simulation: Simulation, sprites: Art) -> void:
	sim = simulation
	fog.sim = simulation
	art = sprites
	_palette = JSON.parse_string(FileAccess.get_file_as_string("res://art/palette.json"))
	_ground_shader = load("res://src/presentation/shaders/ground.gdshader")
	var white := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	white.fill(Color.WHITE)
	_white = ImageTexture.create_from_image(white)
	_ground_layer.z_index = -10
	_field_layer.z_index = -5
	entities.y_sort_enabled = true
	life.view = self
	# Night is multiplied in, lifted round lights (see WorldLife and night.gdshader).
	_night.material = life.night_material()
	_night.z_index = 5
	_night.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lights.z_index = 6


## Replaces the simulation (after loading), clearing everything drawn.
func set_simulation(simulation: Simulation) -> void:
	sim = simulation
	fog.sim = simulation
	fog.reset()
	life.clear()
	for d: Dictionary in _ground.values():
		(d["node"] as Node).queue_free()
	for d: Dictionary in _objects.values():
		(d["node"] as Node).queue_free()
	for d: Dictionary in _buildings.values():
		(d["node"] as Node).queue_free()
	for v: SettlerView in settler_views.values():
		v.queue_free()
	for v: Node in animal_views.values():
		v.queue_free()
	animal_views.clear()
	_ground.clear()
	_objects.clear()
	_buildings.clear()
	settler_views.clear()


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
		if p.x >= c0.x - 1 and p.x <= c1.x + 1 and p.y >= c0.y - 1 and p.y <= c1.y + 1:
			_sway_trees(k)
	_free_far(_ground, c0, c1)
	_free_far(_objects, c0, c1)
	_sync_buildings()
	_sync_settlers(alpha, delta, view.grow(TILE_PX * 3))
	_sync_animals(alpha, view.grow(TILE_PX * 3))
	_sync_companies(delta, view.grow(TILE_PX * 4))
	if motion != _ground_motion:
		_ground_motion = motion
		for g: Dictionary in _ground.values():
			((g["node"] as Sprite2D).material as ShaderMaterial).set_shader_parameter("motion", motion)
	fog.refresh(view, delta)
	_ground_layer.visible = ground_visible
	var tint := _night_tint()
	_night.visible = tint != Color.WHITE
	_night.position = view.position - Vector2(64, 64)
	_night.size = view.size + Vector2(128, 128)
	life.refresh(sim, view, delta, tint, Rect2(_night.position, _night.size))


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
		mat.set_shader_parameter("pal", _season_palette(_season))
		mat.set_shader_parameter("world_seed", sim.seed_value)
		mat.set_shader_parameter("origin", Vector2(c.cx, c.cy) * Chunk.SIZE)
		# The fog is FogView's layer over everything, not painted into the ground.
		mat.set_shader_parameter("fog_on", false)
		mat.set_shader_parameter("motion", motion)
		node.material = mat
		_ground_layer.add_child(node)
		g = {"node": node, "terrain_version": -1, "fog_version": -1, "neighbours": -1}
		_ground[k] = g
	var mat: ShaderMaterial = (g["node"] as Sprite2D).material
	# Borders come from neighbouring chunks, so a neighbour loading later repaints us too.
	var nsum := _neighbour_signature(c)
	if int(g["terrain_version"]) != c.terrain_version or int(g["neighbours"]) != nsum:
		g["terrain_version"] = c.terrain_version
		g["neighbours"] = nsum
		mat.set_shader_parameter("ids", _bordered_texture(c, false))


func _neighbour_signature(c: Chunk) -> int:
	var sum := 0
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var n := sim.world.peek(c.cx + dx, c.cy + dy)
			sum = sum * 31 + (0 if n == null else n.terrain_version + 1)
	return sum


## A 38×38 R8 texture of terrain ids (or exploration) for a chunk plus a three-tile border, so
## the shader can measure water depth and bank shadows across chunk edges without seams.
const BORDER := 3
const BORDERED := Chunk.SIZE + BORDER * 2


func _bordered_texture(c: Chunk, exploration: bool) -> ImageTexture:
	var data := PackedByteArray()
	data.resize(BORDERED * BORDERED)
	var ox := c.cx * Chunk.SIZE - BORDER
	var oy := c.cy * Chunk.SIZE - BORDER
	for y in BORDERED:
		for x in BORDERED:
			var tx := ox + x
			var ty := oy + y
			var v := 0
			if exploration:
				v = 255 if sim.world.explored(tx, ty) else 0
			else:
				var t := sim.world.terrain(tx, ty)
				if t == World.UNKNOWN:
					# Unloaded neighbour: repeat our own edge.
					t = c.terrain[clampi(ty - c.cy * Chunk.SIZE, 0, 31) * Chunk.SIZE + clampi(tx - c.cx * Chunk.SIZE, 0, 31)]
				v = t
			data[y * BORDERED + x] = v
	return ImageTexture.create_from_image(Image.create_from_data(BORDERED, BORDERED, false, Image.FORMAT_R8, data))


func _set_season_look(season: String) -> void:
	for g: Dictionary in _ground.values():
		_apply_season((g["node"] as Sprite2D).material, season)
	# Object sprites change with the season (autumn leaves, bare winter trees).
	for d: Dictionary in _objects.values():
		d["version"] = -1


func _apply_season(mat: ShaderMaterial, season: String) -> void:
	mat.set_shader_parameter("pal", _season_palette(season))
	mat.set_shader_parameter("autumn", season == "autumn")
	mat.set_shader_parameter("winter", season == "winter")


var _season_palettes := {}


## The pixel ground's palette for a season (the browser's seasonal ground colours).
func _season_palette(season: String) -> ImageTexture:
	var key := season if season != "" else "spring"
	if not _season_palettes.has(key):
		_season_palettes[key] = PixelGround.palette(key)
	return _season_palettes[key]


# ---- objects -------------------------------------------------------------------------------------

func _sync_objects(k: int, c: Chunk) -> void:
	var d: Dictionary = _objects.get(k, {})
	# Objects stand everywhere; FogView's layer dims or hides them with the land under them.
	var version := c.version
	if not d.is_empty() and int(d["version"]) == version:
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
	var trees: Array[Array] = []
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
		# The foot of the tile, where the browser game stands its trees and rocks.
		sp.position = Vector2(tx + 0.5, ty + 1.0) * TILE_PX
		# Trees lean a whole pixel in the wind, the canopy only, as in the browser (its baked
		# sway frames). A tree the player redrew in the Asset Studio stands still.
		if (o == Tiles.O_OAK or o == Tiles.O_PINE) and art.has(sprite_name + "_lean_l") and not art.is_custom(sprite_name):
			trees.append([sp, sprite_name, tx * 0.9 + ty * 0.4, 0])
		node.add_child(sp)
	_objects[k] = {"node": node, "version": version, "trees": trees}


## Swaps each tree to its wind frame: round(sin(t·1.3 + phase)·0.7), -1, 0 or 1 pixel, as the
## browser's drawObject. Only frames that change are applied.
func _sway_trees(k: int) -> void:
	var d: Dictionary = _objects.get(k, {})
	if d.is_empty():
		return
	var t := Time.get_ticks_msec() / 1000.0
	var still := not sway_enabled or motion <= 0.0
	for tree: Array in d["trees"]:
		var lean := 0 if still else roundi(sin(t * 1.3 + float(tree[2])) * 0.7)
		if lean != int(tree[3]):
			tree[3] = lean
			var base: String = tree[1]
			art.apply(tree[0] as Sprite2D, base if lean == 0 else base + ("_lean_l" if lean < 0 else "_lean_r"))


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
		# The finished building shows through as it rises, in twelfths of the work.
		var work := BuildingOps.work_of(b)
		var frac := clampf(b.progress / work, 0.0, 1.0) if work > 0 else 0.0
		return "site:%d:%d:%d" % [b.w, b.h, int(frac * 12.0)]
	if not b.orchard.is_empty():
		return "orchard:%s" % Orchards.look(sim, b)
	if not b.quarry.is_empty():
		return "quarry:%d" % Mining.quarry_stage(b)
	return "%s:%s" % [_building_sprite(b), night]


## The sprite for a finished building: fence and wall pieces join their neighbours, the hall and
## mines show their level, and the camp becomes the village hall once the valley is a village.
func _building_sprite(b: Building) -> String:
	if b.type == "fence" or b.type == "stoneWall":
		var mask := 0
		for i in 4:
			var o: Vector2i = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)][i]
			var n := sim.building_at(b.x + o.x, b.y + o.y)
			if n != null and n.type == b.type:
				mask |= 1 << i
		var piece := "%s_%d" % [b.type, mask]
		return piece if mask > 0 and art.has(piece) else b.type
	if b.type == "townHall" and b.level > 1 and art.has("townHall_%d" % b.level):
		return "townHall_%d" % b.level
	if b.type == "mine":
		var level := int(b.mine.get("level", 1))
		return "mine_%d" % level if level > 1 and art.has("mine_%d" % level) else "mine"
	if b.type == "camp" and not b.extra.get("foundingCamp", false) and sim.reached.has("village") and art.has("villageHall"):
		return "villageHall"
	return b.type


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
			holder.add_child(crop)
		holder.tree_exiting.connect(func() -> void: soil.queue_free())
		entities.add_child(holder)
		return holder
	var ground_sprite := ""
	if b.built and b.def().has("pen") and art.has(b.type):
		ground_sprite = b.type
	elif b.built and not b.quarry.is_empty():
		ground_sprite = "quarry_%d" % Mining.quarry_stage(b)
	if ground_sprite != "":
		# Pens and quarry pits lie on the ground layer, so whoever is inside is always in view.
		var pen_holder := Node2D.new()
		var yard := Sprite2D.new()
		art.apply(yard, ground_sprite)
		yard.position = base
		_field_layer.add_child(yard)
		pen_holder.tree_exiting.connect(func() -> void: yard.queue_free())
		entities.add_child(pen_holder)
		return pen_holder
	var node := Node2D.new()
	node.position = base
	if b.built and b.type == "stoneBridge":
		# The finished bridge is its stone deck, drawn by the ground.
		entities.add_child(node)
		return node
	var sp := Sprite2D.new()
	var name := "site_%dx%d" % [b.w, b.h] if not b.built else look.get_slice(":", 0)
	if b.built and not b.orchard.is_empty():
		name = "orchard_" + look.get_slice(":", 1)
	if not art.has(name):
		name = "site_%dx%d" % [mini(b.w, 4), mini(b.h, 3)] if art.has("site_%dx%d" % [mini(b.w, 4), mini(b.h, 3)]) else "site_1x1"
	art.apply(sp, name)
	node.add_child(sp)
	if not b.built:
		_add_rising(node, b, int(look.get_slice(":", 3)) / 12.0)
	entities.add_child(node)
	if b.built and b.type == "mill" and art.has("mill_sails_0"):
		node.add_child(_mill_sails(b))
	if BuildingLife.wanted(b):
		var life := BuildingLife.new()
		life.view = self
		life.type = b.type
		life.id = b.id
		life.level = b.level
		life.h_tiles = b.h
		node.add_child(life)
	if b.built and look.ends_with("true") and art.has(name + "_lit"):
		# Lit windows sit above the night tint, so they glow. Pixel art's overlay holds the lit
		# window pixels themselves, drawn as they are; smooth art's is a glow, added on.
		var lit := Sprite2D.new()
		art.apply(lit, name + "_lit")
		lit.position = base
		if not art.pixel:
			var add := CanvasItemMaterial.new()
			add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
			lit.material = add
		_lights.add_child(lit)
		node.tree_exiting.connect(func() -> void: lit.queue_free())
	return node


## A building under construction as the browser draws it: a faint ghost of the finished
## building, and the finished building itself revealed from the ground up as work progresses.
func _add_rising(node: Node2D, b: Building, frac: float) -> void:
	var final_name := b.type
	if not art.has(final_name) or art.sprites[final_name]["texture"] == null:
		return
	var ghost := Sprite2D.new()
	art.apply(ghost, final_name)
	ghost.modulate = Color(1, 1, 1, 0.35)
	node.add_child(ghost)
	if frac <= 0.0:
		return
	var full: AtlasTexture = art.sprites[final_name]["texture"]
	var h := full.region.size.y
	var cut := floorf(h * (1.0 - frac))
	var part := AtlasTexture.new()
	part.atlas = full.atlas
	part.region = Rect2(full.region.position + Vector2(0, cut), Vector2(full.region.size.x, h - cut))
	var rising := Sprite2D.new()
	art.apply(rising, final_name)
	rising.texture = part
	rising.offset.y += cut
	node.add_child(rising)


var _sails_frames: SpriteFrames = null


## The mill's turning sails (the browser draws them 16px right of and 7px above the footprint).
func _mill_sails(b: Building) -> AnimatedSprite2D:
	var first: Dictionary = art.sprites["mill_sails_0"]
	if _sails_frames == null:
		_sails_frames = SpriteFrames.new()
		var i := 0
		while art.has("mill_sails_%d" % i):
			_sails_frames.add_frame(&"default", art.sprites["mill_sails_%d" % i]["texture"])
			i += 1
		_sails_frames.set_animation_speed(&"default", 1.5)
	var a := AnimatedSprite2D.new()
	a.sprite_frames = _sails_frames
	a.centered = false
	var k := TILE_PX / Art.SOURCE_PX_PER_TILE
	a.scale = Vector2(k, k) / art.raster_scale
	a.offset = Vector2(-float(first["ax"]), -float(first["ay"])) * art.raster_scale
	a.position = Vector2(16, -7 - b.h * 16) * (TILE_PX / 16.0)
	a.frame = b.id % maxi(1, _sails_frames.get_frame_count(&"default"))
	if motion > 0.0:
		a.play()
	return a


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


# ---- companies in the field ------------------------------------------------------------------------

func _sync_companies(delta: float, area: Rect2) -> void:
	var seen := {}
	for k: Dictionary in sim.kingdoms:
		var player: bool = k.get("player") == true
		for c: Dictionary in k.get("companies", []):
			var state := str(c.get("state", ""))
			if state != "deployed" and state != "returning":
				continue
			var pos := Vector2(float(c.get("x", 0)), float(c.get("y", 0))) * TILE_PX
			if not area.has_point(pos):
				continue
			var members: Array = []
			if player:
				for id: Variant in c.get("members", []):
					var s := sim.settler(int(id))
					if s != null and str(s.military.get("state", "")) == "deployed":
						members.append(s)
				if members.is_empty():
					continue
			var id := int(c["id"])
			seen[id] = true
			var v: CompanyView = company_views.get(id)
			if v == null:
				v = CompanyView.new()
				v.setup(art, _palette["people"], c)
				entities.add_child(v)
				company_views[id] = v
			v.refresh(c, members, delta, motion)
	for id: int in company_views.keys():
		if not seen.has(id):
			(company_views[id] as Node).queue_free()
			company_views.erase(id)


# ---- animals -------------------------------------------------------------------------------------

func _sync_animals(alpha: float, area: Rect2) -> void:
	var seen := {}
	var now := Time.get_ticks_msec()
	for a in sim.animals:
		seen[a.id] = true
		var sp: Sprite2D = animal_views.get(a.id)
		if sp == null:
			sp = Sprite2D.new()
			sp.set_meta("frame", -1)
			entities.add_child(sp)
			animal_views[a.id] = sp
		var pos := Vector2(lerpf(a.rpx, a.rx, alpha), lerpf(a.rpy, a.ry, alpha)) * TILE_PX
		sp.position = pos
		if not area.has_point(pos) or not sim.world.explored(floori(a.x), floori(a.y)):
			sp.visible = false
			continue
		sp.visible = true
		# The browser's cycle: four walking frames (twice as fast when fleeing); standing animals
		# graze now and then (frame 5) and otherwise stand (frame 4).
		var walking := absf(a.rx - a.rpx) + absf(a.ry - a.rpy) > 0.001
		var t := now / 1000.0
		var frame := 0
		if motion <= 0.0:
			frame = 4
		elif walking:
			frame = floori(t * (16.0 if a.flee else 8.0) + a.id * 0.37) % 4
		else:
			frame = 5 if fmod(t * 0.5 + a.id * 0.23, 3.0) < 1.0 else 4
		if not art.has("animal_%s_%d" % [a.species, frame]):
			frame = 0
		if int(sp.get_meta("frame")) != frame:
			sp.set_meta("frame", frame)
			art.apply(sp, "animal_%s_%d" % [a.species, frame])
		sp.scale.x = -absf(sp.scale.x) if a.facing == 2 else absf(sp.scale.x)
		# A short red flash when struck.
		sp.modulate = Color(1.0, 0.55, 0.5) if sim.tick - a.hit_at < 4 else Color.WHITE
	for id: int in animal_views.keys():
		if not seen.has(id):
			(animal_views[id] as Node).queue_free()
			animal_views.erase(id)


# ---- light ---------------------------------------------------------------------------------------

## The whole scene's colour by time of day: warm noon, golden dusk, moonlit blue night.
func _night_tint() -> Color:
	var t := sim.time_of_day()
	var day := Color(1, 1, 1)
	var dusk := Color(1.0, 0.82, 0.66)
	var night := Color(0.38, 0.46, 0.68)
	if t >= Defs.MORNING + 0.06 and t < Defs.DUSK:
		return day
	if t >= Defs.DUSK and t < Defs.NIGHT_START:
		return day.lerp(dusk, (t - Defs.DUSK) / (Defs.NIGHT_START - Defs.DUSK))
	if t >= Defs.NIGHT_START:
		return dusk.lerp(night, clampf((t - Defs.NIGHT_START) / 0.04, 0.0, 1.0))
	if t < Defs.MORNING:
		return night
	return night.lerp(day, (t - Defs.MORNING) / 0.06)
