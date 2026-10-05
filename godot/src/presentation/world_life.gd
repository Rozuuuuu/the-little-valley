class_name WorldLife
extends Node2D
## The moving life the browser draws on the map (src/render/Renderer.ts) beyond buildings,
## settlers and animals:
## - lights at night: darkness lifted round camps, lamps and lit homes, a warm glow at flames;
## - weather: rain (snow in winter) with a grey-blue wash, fireflies at night, pollen by day;
## - the ruler's aura: a faint gold ring of dots that slowly turns;
## - animals that die keel over onto their backs, bounce, lie still and fade;
## - travelling merchants walking in with their packs, caravan carts on the road.
## Each frame refresh() is given the view rectangle in world px.

const PX := 4.0
const CORPSE_SECONDS := 2.2
const AURA_PHASES := 8
const AURA_STEPS_PER_SECOND := 6.0
const MAX_LIGHTS := 48

var view: WorldView
var particles: Particles
var _glow := _Glow.new()
var _weather := _Weather.new()
var _aura := _Aura.new()
var _night_mat := ShaderMaterial.new()
var _corpses: Array[Dictionary] = []
## party id -> {node: Node2D, figure: Sprite2D, pack: Sprite2D, at: Vector2}
var _travellers := {}
## manifest id -> {node: Node2D, cart: Sprite2D, load: Sprite2D, at: Vector2}
var _carts := {}
## "kingdom:company" -> {node, figures: Array[Sprite2D], at}
var _foreign := {}


func _init() -> void:
	_glow.z_index = 6
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_glow.material = add
	_weather.z_index = 8
	_aura.z_index = -4
	for n: Node in [_glow, _weather, _aura]:
		add_child(n)
	_night_mat.shader = load("res://src/presentation/shaders/night.gdshader")


## The night layer's material (WorldView puts it on its night rectangle).
func night_material() -> ShaderMaterial:
	return _night_mat


func clear() -> void:
	for c: Dictionary in _corpses:
		(c["node"] as Node).queue_free()
	_corpses.clear()
	for d: Dictionary in _travellers.values():
		(d["node"] as Node).queue_free()
	_travellers.clear()
	for d: Dictionary in _carts.values():
		(d["node"] as Node).queue_free()
	_carts.clear()
	for d: Dictionary in _foreign.values():
		(d["node"] as Node).queue_free()
	_foreign.clear()


func refresh(sim: Simulation, area: Rect2, delta: float, night_tint: Color, night_rect: Rect2) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	var still := view.motion <= 0.0
	var dark := clampf(1.0 - (night_tint.r + night_tint.g + night_tint.b) / 3.0, 0.0, 1.0)
	_update_lights(sim, area, t, dark, night_tint, night_rect, still)
	_weather.step(sim, area, delta, t, dark, still)
	_aura.step(sim, view, t, still)
	_update_corpses(t)
	_update_travellers(sim, area, delta, t, still)
	_update_carts(sim, area, delta, t, still)
	_update_foreign(sim, area, delta, t, still)


# ---- lights ---------------------------------------------------------------------------------------

static func light_of(b: Building) -> float:
	var levels: Array = b.def().get("levels", [])
	for i in range(mini(b.level, levels.size()) - 1, -1, -1):
		if (levels[i] as Dictionary).has("light"):
			return float(levels[i]["light"])
	return float(b.def().get("light", 0))


func _update_lights(sim: Simulation, area: Rect2, t: float, dark: float, tint: Color, rect: Rect2, still: bool) -> void:
	var lights := PackedVector4Array()
	var flames: Array[Vector4] = []
	if dark > 0.01:
		var occupied := {}
		for s: Settler in sim.settlers:
			if s.inside_id != -1:
				occupied[s.inside_id] = true
		var flick := 1.0 if still else 0.92 + sin(t * 11.0) * 0.04 + sin(t * 7.3) * 0.04
		var T := WorldView.TILE_PX
		for b: Building in sim.buildings.values():
			if not b.built:
				continue
			var light := light_of(b)
			if light <= 0.0 or (b.is_permanent_home() and not occupied.has(b.id)):
				continue
			var r := light * T
			var lx := (b.x + b.w / 2.0) * T
			var ly := (b.y + b.h * 0.7) * T
			var warm := 0.0
			if b.type == "camp" or b.type == "travelCamp":
				lx = b.x * T + 24.0 * PX
				ly = b.y * T + 26.0 * PX
				r *= flick
				warm = 0.22
			elif b.type == "lamp":
				ly = b.y * T - 10.0 * PX
				warm = 0.12
			elif b.type == "market":
				warm = 0.12
			if not area.grow(r).has_point(Vector2(lx, ly)):
				continue
			if lights.size() < MAX_LIGHTS:
				lights.append(Vector4(lx, ly, r, 0))
			if warm > 0.0:
				flames.append(Vector4(lx, ly, r * 0.6, warm * dark * 1.4))
	_night_mat.set_shader_parameter("tint", tint)
	_night_mat.set_shader_parameter("origin", rect.position)
	_night_mat.set_shader_parameter("extent", rect.size)
	_night_mat.set_shader_parameter("count", lights.size())
	if not lights.is_empty():
		var padded := lights.duplicate()
		padded.resize(MAX_LIGHTS)
		_night_mat.set_shader_parameter("lights", padded)
	_glow.flames = flames
	_glow.queue_redraw()


class _Glow extends Node2D:
	var flames: Array[Vector4] = []
	var _tex: GradientTexture2D

	func _ready() -> void:
		var g := Gradient.new()
		g.set_color(0, Color(1.0, 0.667, 0.275, 1.0))
		g.set_color(1, Color(1.0, 0.667, 0.275, 0.0))
		_tex = GradientTexture2D.new()
		_tex.gradient = g
		_tex.fill = GradientTexture2D.FILL_RADIAL
		_tex.fill_from = Vector2(0.5, 0.5)
		_tex.fill_to = Vector2(1.0, 0.5)
		_tex.width = 64
		_tex.height = 64

	func _draw() -> void:
		for f: Vector4 in flames:
			draw_texture_rect(_tex, Rect2(f.x - f.z, f.y - f.z, f.z * 2.0, f.z * 2.0), false, Color(1, 1, 1, clampf(f.w, 0.0, 1.0)))


# ---- weather ---------------------------------------------------------------------------------------

class _Weather extends Node2D:
	var rain_amount := 0.0
	var winter := false
	var view_rect := Rect2()
	var drops: Array[Vector3] = []
	var flies: Array[Vector4] = []
	var dark := 0.0
	var time := 0.0
	var _explored: Callable

	func step(sim: Simulation, area: Rect2, delta: float, t: float, d: float, still: bool) -> void:
		view_rect = area
		dark = d
		time = t
		winter = str(sim.season()["id"]) == "winter"
		rain_amount += ((1.0 if sim.raining else 0.0) - rain_amount) * minf(1.0, delta * 0.8)
		var px := WorldLife.PX
		# Drops, as many as the browser puts on the screen (one per 7000 screen px at full rain).
		var zoom := maxf(0.05, get_viewport().get_canvas_transform().get_scale().x)
		var want := 0 if rain_amount <= 0.02 else floori(area.size.x * area.size.y * zoom * zoom / 7000.0 * rain_amount)
		while drops.size() < want:
			drops.append(Vector3(area.position.x + randf() * area.size.x, area.position.y + randf() * area.size.y, 0.8 + randf() * 0.5))
		if drops.size() > want:
			drops.resize(want)
		if not still:
			for i in drops.size():
				var dr := drops[i]
				dr.y += delta * (32.0 if winter else 260.0) * px * dr.z
				dr.x -= delta * 50.0 * px * dr.z
				if dr.y > area.end.y or dr.x < area.position.x - 40.0 or not area.grow(200).has_point(Vector2(dr.x, dr.y)):
					dr = Vector3(area.position.x + randf() * area.size.x * 1.2, area.position.y - randf() * 40.0, dr.z)
				drops[i] = dr
		# Fireflies at night, drifting pollen by day: x, y, phase, life.
		var count := 28 if dark > 0.3 else 10
		while flies.size() < count:
			flies.append(Vector4(area.position.x + randf() * area.size.x, area.position.y + randf() * area.size.y, randf() * TAU, 0.0))
		if flies.size() > count:
			flies.resize(count)
		for i in flies.size():
			var f := flies[i]
			f.w += delta
			if not still:
				f.x += sin(t * 0.7 + f.z) * delta * 6.0 * px
				f.y += (cos(t * 0.5 + f.z * 1.3) * delta * 4.0 - (0.0 if dark > 0.3 else delta * 2.0)) * px
			if not area.has_point(Vector2(f.x, f.y)) or f.w > 20.0:
				f = Vector4(area.position.x + randf() * area.size.x, area.position.y + randf() * area.size.y, f.z, 0.0)
			flies[i] = f
		_explored = func(x: float, y: float) -> bool: return sim.world.explored(floori(x / WorldView.TILE_PX), floori(y / WorldView.TILE_PX))
		queue_redraw()

	func _draw() -> void:
		var px := WorldLife.PX
		if rain_amount > 0.02:
			draw_rect(view_rect, Color(40 / 255.0, 55 / 255.0, 85 / 255.0, 0.18 * rain_amount))
			var c := Color(190 / 255.0, 210 / 255.0, 235 / 255.0, 0.55)
			for d: Vector3 in drops:
				draw_rect(Rect2(d.x, d.y, px * 0.5 if not winter else px * 0.5, px * 0.5 if winter else px * 4.0), c)
		for f: Vector4 in flies:
			if not _explored.call(f.x, f.y):
				continue
			if dark > 0.3:
				var glow := (sin(time * 2.2 + f.z * 3.0) + 1.0) / 2.0
				if glow < 0.25:
					continue
				draw_rect(Rect2(f.x - px, f.y - px, px * 3.0, px * 3.0), Color(220 / 255.0, 1.0, 140 / 255.0, 0.35 * glow))
				draw_rect(Rect2(f.x, f.y, px, px), Color(Color("#eaff9a"), glow))
			elif rain_amount < 0.2:
				draw_rect(Rect2(f.x, f.y, px, px), Color(Color("#fff8d8"), 0.6))


# ---- the ruler's aura ---------------------------------------------------------------------------------

class _Aura extends Node2D:
	var at := Vector2.ZERO
	var phase := 0
	var shown := false

	func step(sim: Simulation, wv: WorldView, t: float, still: bool) -> void:
		var r := sim.ruler()
		shown = r != null and not r.hidden
		if shown:
			var v: Node2D = wv.settler_views.get(r.id)
			at = v.position if v != null else Vector2(r.x, r.y) * WorldView.TILE_PX
			phase = 0 if still else floori(t * WorldLife.AURA_STEPS_PER_SECOND) % WorldLife.AURA_PHASES
		queue_redraw()

	func _draw() -> void:
		if not shown:
			return
		var px := WorldLife.PX
		var rad := float(Content.get_value("kingdomBalance", "AURA_RADIUS")) * 16.0
		var mid := at - Vector2(0, 2.0 * px)
		draw_circle(mid, rad * px, Color(236 / 255.0, 210 / 255.0, 126 / 255.0, 0.06))
		# Gold dots every 8 art pixels round the edge, a darker lower half; shifted each phase.
		var n := roundi(TAU * rad / 8.0)
		for i in n:
			var a := (i + phase / float(WorldLife.AURA_PHASES)) / n * TAU
			var d := mid + Vector2(roundf(cos(a) * rad) - 1.0, roundf(sin(a) * rad) - 1.0) * px
			draw_rect(Rect2(d, Vector2(2.0 * px, px)), Color("#ffe07a"))
			draw_rect(Rect2(d + Vector2(0, px), Vector2(2.0 * px, px)), Color("#b8862a"))


# ---- corpses --------------------------------------------------------------------------------------

## An animal just died (the simulation's "death" event): it keels over where it stood.
func add_corpse(e: Dictionary) -> void:
	var name := "animal_%s_4" % e["species"]
	if not view.art.has(name):
		name = "animal_%s_0" % e["species"]
		if not view.art.has(name):
			return
	var holder := Node2D.new()
	var sp := Sprite2D.new()
	view.art.apply(sp, name)
	var info: Dictionary = view.art.sprites[name]
	var k := WorldView.TILE_PX / Art.SOURCE_PX_PER_TILE
	# Roll about the middle of the body, so the back ends up on the ground.
	var pivot := float(info["ay"]) * k * 0.4
	sp.position = Vector2(0, pivot)
	if int(e.get("facing", 3)) == 2:
		sp.scale.x = -absf(sp.scale.x)
	holder.add_child(sp)
	var at := Vector2(float(e["x"]), float(e["y"])) * WorldView.TILE_PX
	holder.position = at - Vector2(0, pivot)
	view.entities.add_child(holder)
	_corpses.append({"node": holder, "sprite": sp, "t0": Time.get_ticks_msec() / 1000.0, "dir": -1.0 if int(e.get("facing", 3)) == 3 else 1.0,
		"landed": false, "x": float(e["x"]), "y": float(e["y"]), "base_y": holder.position.y, "sy": sp.scale.y})
	if _corpses.size() > 40:
		(_corpses.pop_front()["node"] as Node).queue_free()


func _update_corpses(now: float) -> void:
	var keep: Array[Dictionary] = []
	for c: Dictionary in _corpses:
		var age := now - float(c["t0"])
		var holder: Node2D = c["node"]
		var sp: Sprite2D = c["sprite"]
		if age > CORPSE_SECONDS:
			holder.queue_free()
			continue
		keep.append(c)
		var flash := age < 0.18 or (age < 0.32 and floori(age * 30.0) % 2 == 0)
		var k := minf(1.0, age / 0.34)
		var ease := k * k
		var bounce := sin((age - 0.34) / 0.16 * PI) * 1.5 * PX if age > 0.34 and age < 0.5 else 0.0
		holder.rotation = float(c["dir"]) * sin(PI * ease) * 0.45
		sp.scale.y = float(c["sy"]) * cos(PI * ease)
		holder.position.y = float(c["base_y"]) - bounce
		var alpha := 1.0 if age < CORPSE_SECONDS - 0.7 else maxf(0.0, (CORPSE_SECONDS - age) / 0.7)
		sp.modulate = Color(1.0, 0.5, 0.45, alpha) if flash else Color(1, 1, 1, alpha)
		if not bool(c["landed"]) and k >= 1.0:
			c["landed"] = true
			if particles != null:
				particles.fx("dust", float(c["x"]), float(c["y"]))
				particles.fx("dust", float(c["x"]) - float(c["dir"]) * 0.4, float(c["y"]))
	_corpses = keep


# ---- merchants and carts --------------------------------------------------------------------------

func _update_travellers(sim: Simulation, area: Rect2, delta: float, t: float, still: bool) -> void:
	var seen := {}
	var k := 1.0 - exp(-delta * 12.0)
	for p: Dictionary in sim.parties:
		if p["state"] != "arriving" and p["state"] != "leaving":
			continue
		var id := int(p["id"])
		var target := Vector2(float(p["x"]), float(p["y"])) * WorldView.TILE_PX
		if not area.grow(200).has_point(target) or not sim.world.explored(floori(float(p["x"])), floori(float(p["y"]))):
			continue
		seen[id] = true
		var d: Dictionary = _travellers.get(id, {})
		if d.is_empty():
			var node := Node2D.new()
			var fig := Sprite2D.new()
			fig.texture = SettlerView.people().sheet(p["appearance"])
			fig.region_enabled = true
			fig.centered = false
			fig.offset = Vector2(-PixelPeople.AX, -PixelPeople.AY)
			fig.scale = Vector2(PX, PX)
			node.add_child(fig)
			var pack := Sprite2D.new()
			if view.art.has("icon_planks"):
				view.art.apply(pack, "icon_planks")
			node.add_child(pack)
			view.entities.add_child(node)
			d = {"node": node, "figure": fig, "pack": pack, "at": target}
			_travellers[id] = d
		var at: Vector2 = (d["at"] as Vector2).lerp(target, k)
		var step := target - (d["at"] as Vector2)
		d["at"] = at
		var node2: Node2D = d["node"]
		node2.position = at
		var path: Variant = p.get("path")
		var dir := step
		if path is Array and not (path as Array).is_empty():
			var nx: Variant = (path as Array)[0]
			if nx is Vector2i or nx is Vector2:
				dir = Vector2(nx) + Vector2(0.5, 0.5) - Vector2(float(p["x"]), float(p["y"]))
		var facing := (2 if dir.x < 0 else 3) if absf(dir.x) > absf(dir.y) else (1 if dir.y < 0 else 0)
		var frame := int(PixelPeople.FRAME["carry"]) + (0 if still else floori(t * 8.0 + id * 0.37) % 4)
		(d["figure"] as Sprite2D).region_rect = Rect2(frame * PixelPeople.FW, facing * PixelPeople.FH, PixelPeople.FW, PixelPeople.FH)
		(d["pack"] as Sprite2D).position = Vector2(0, (-20.0 + (0 if still else floori(t * 4.0) % 2)) * PX)
	for id: int in _travellers.keys():
		if not seen.has(id):
			(_travellers[id]["node"] as Node).queue_free()
			_travellers.erase(id)


func _update_carts(sim: Simulation, area: Rect2, delta: float, t: float, still: bool) -> void:
	var seen := {}
	var k := 1.0 - exp(-delta * 10.0)
	if not view.art.has("cart"):
		return
	for m: Dictionary in sim.manifests:
		var id := int(m["id"])
		var target := Logistics.cart_position(sim, m) * WorldView.TILE_PX
		if not area.grow(200).has_point(target):
			continue
		seen[id] = true
		var d: Dictionary = _carts.get(id, {})
		if d.is_empty():
			var node := Node2D.new()
			var cart := Sprite2D.new()
			view.art.apply(cart, "cart")
			node.add_child(cart)
			var load := Sprite2D.new()
			node.add_child(load)
			view.entities.add_child(node)
			d = {"node": node, "cart": cart, "load": load, "at": target, "res": ""}
			_carts[id] = d
		var at: Vector2 = (d["at"] as Vector2).lerp(target, k)
		d["at"] = at
		(d["node"] as Node2D).position = at
		var from: Dictionary = m.get("from", {})
		var to: Dictionary = m.get("to", {})
		var dx := float(to.get("x", 0)) - float(from.get("x", 0))
		var leftward := (dx if m["state"] == "outbound" else -dx) < 0.0
		var cart_sp: Sprite2D = d["cart"]
		cart_sp.scale.x = -absf(cart_sp.scale.x) if leftward else absf(cart_sp.scale.x)
		var bob := 0.0 if still else float(floori(t * 6.0) % 2)
		cart_sp.position = Vector2(0, -bob * PX)
		var res := ""
		var cargo: Dictionary = m.get("cargo", {})
		for r: String in cargo:
			if int(cargo[r]) > 0:
				res = r
				break
		var load_sp: Sprite2D = d["load"]
		if res != str(d["res"]):
			d["res"] = res
			load_sp.visible = res != "" and view.art.has("icon_" + res)
			if load_sp.visible:
				view.art.apply(load_sp, "icon_" + res)
		load_sp.position = Vector2(0, -24.0 * PX)
	for id: int in _carts.keys():
		if not seen.has(id):
			(_carts[id]["node"] as Node).queue_free()
			_carts.erase(id)


# ---- other kingdoms' companies ------------------------------------------------------------------

## Another kingdom's company in the field (Renderer.drawForeignCompany): four soldiers in a block,
## with horses for knights, their weapons over their shoulders, and a banner in their colour.
func _update_foreign(sim: Simulation, area: Rect2, delta: float, t: float, still: bool) -> void:
	var seen := {}
	var k := 1.0 - exp(-delta * 10.0)
	for kd: Dictionary in sim.kingdoms:
		if kd["player"]:
			continue
		var color := Color(str(kd["banner"]["color"]))
		for c: Dictionary in kd["companies"]:
			if c.get("state") != "deployed" and c.get("state") != "returning":
				continue
			var target := Vector2(float(c.get("x", 0)), float(c.get("y", 0))) * WorldView.TILE_PX
			if not area.grow(200).has_point(target):
				continue
			var id := "%s:%s" % [kd["id"], c["id"]]
			seen[id] = true
			var d: Dictionary = _foreign.get(id, {})
			if d.is_empty():
				d = _make_company(int(c["id"]), str(c.get("kind", "")), color)
				d["at"] = target
				_foreign[id] = d
			var at: Vector2 = (d["at"] as Vector2).lerp(target, k)
			var moving := at.distance_to(target) > 2.0
			d["at"] = at
			(d["node"] as Node2D).position = at
			var facing := 1 if c.get("state") == "returning" else 0
			var figs: Array = d["figures"]
			for i in figs.size():
				var frame := int(PixelPeople.FRAME["walk" if moving else "idle"]) + (0 if still else (floori(t * 8.0) + i) % (4 if moving else 2))
				(figs[i] as Sprite2D).region_rect = Rect2(frame * PixelPeople.FW, facing * PixelPeople.FH, PixelPeople.FW, PixelPeople.FH)
	for id: String in _foreign.keys():
		if not seen.has(id):
			(_foreign[id]["node"] as Node).queue_free()
			_foreign.erase(id)


func _make_company(cid: int, kind: String, color: Color) -> Dictionary:
	var node := Node2D.new()
	var look := {"skin": cid % 4, "hair": (cid >> 2) % 6, "hairStyle": cid % 3, "shirt": 5, "pants": 2}
	var figs: Array[Sprite2D] = []
	for i in 4:
		var off := Vector2((i % 2) * 10 - 5, floori(i / 2.0) * 7 - 3) * PX
		if kind == "knight" and view.art.has("icon_horses"):
			var horse := Sprite2D.new()
			view.art.apply(horse, "icon_horses")
			horse.position = off + Vector2(0, 2 * PX)
			node.add_child(horse)
		var fig := Sprite2D.new()
		fig.texture = SettlerView.people().sheet(look)
		fig.region_enabled = true
		fig.centered = false
		fig.offset = Vector2(-PixelPeople.AX, -PixelPeople.AY)
		fig.scale = Vector2(PX, PX)
		fig.position = off
		node.add_child(fig)
		figs.append(fig)
		var gear_name := "icon_bows" if kind == "archer" else "icon_swords"
		if view.art.has(gear_name):
			var gear := Sprite2D.new()
			view.art.apply(gear, gear_name)
			gear.position = off + Vector2(5, -8) * PX
			node.add_child(gear)
	var pole := ColorRect.new()
	pole.color = Color("#5c3a22")
	pole.position = Vector2(10, -30) * PX
	pole.size = Vector2(1, 22) * PX
	node.add_child(pole)
	var flag := ColorRect.new()
	flag.color = color
	flag.position = Vector2(11, -30) * PX
	flag.size = Vector2(7, 5) * PX
	node.add_child(flag)
	view.entities.add_child(node)
	return {"node": node, "figures": figs}
