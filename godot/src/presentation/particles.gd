class_name Particles
extends Node2D
## Cosmetic particles, never saved (src/render/particles.ts): chips, soil, leaves, sparkles, dust,
## splashes, hearts, smoke, butterflies, glints, birds, sparks, damage numbers and arrows. The
## browser works in art pixels (16 a tile); here everything is in world pixels, K times larger.
##
## Emitters (src/render/Renderer.ts): simulation events, campfire sparks, and building life:
## chimney smoke at meal times and while workshops work, sparks over forges and smelters, dust and
## splashes while someone works, and now and then butterflies, birds, dust or glints.

const K := WorldView.TILE_PX / 16.0
const MAX := 900
const LIFE := {
	"house": {"smoke": true}, "familyHome": {"smoke": true}, "cottage": {"smoke": true}, "inn": {"smoke": true},
	"bakery": {"smoke": true, "heavy": true, "work": "dust"},
	"smelter": {"smoke": true, "heavy": true, "sparks": true, "work": "spark"},
	"forge": {"smoke": true, "sparks": true, "work": "spark"},
	"charcoalKiln": {"smoke": true, "heavy": true}, "workshop": {"smoke": true, "work": "woodchips"},
	"mill": {"work": "dust"}, "hunterLodge": {"smoke": true}, "tannery": {"smoke": true, "work": "dust"}, "weaver": {"smoke": true},
	"townHall": {"smoke": true}, "barracks": {"smoke": true}, "quarry": {"work": "stonechips"}, "mine": {"work": "stonechips"},
	"fisherHut": {"smoke": true, "work": "splash"}, "well": {"work": "splash"}, "waystation": {"smoke": true},
	"councilHall": {"ambient": "glint", "smoke": true},
	"flowerbed": {"ambient": "butterfly"}, "orchard": {"ambient": "butterfly"}, "granary": {"ambient": "bird"},
	"storehouse": {"ambient": "dust"}, "depot": {"ambient": "dust"}, "stable": {"ambient": "dust"}, "armory": {"ambient": "glint"},
	"royalHall": {"ambient": "glint"}, "market": {"ambient": "glint"}, "archeryRange": {"ambient": "dust"},
	"bench": {"ambient": "butterfly"}, "haystack": {"ambient": "bird"}, "statue": {"ambient": "glint"}, "garden": {"ambient": "butterfly"},
	"lamp": {"ambient": "glint"}, "travelCamp": {"ambient": "leaves"}, "camp": {"ambient": "leaves"}, "chickenCoop": {"ambient": "bird"},
	"sheepPen": {"ambient": "butterfly"}, "cattlePasture": {"ambient": "butterfly"}, "horsePaddock": {"ambient": "dust"},
	"goatPen": {"ambient": "dust"}, "pigsty": {"ambient": "dust"},
}
## Homes smoke at breakfast and supper; workshops while they work.
const HOMEY: Array[String] = ["house", "familyHome", "cottage", "inn", "townHall", "hunterLodge", "weaver", "barracks", "fisherHut"]

## Palette colours (src/render/palette.ts names) for the bursts.
const C := {
	"wood": [Color("#8a5a32"), Color("#a8743e"), Color("#6a4426")], "stone": [Color("#9aa0a4"), Color("#b8bcc0"), Color("#7a8084")],
	"soil": [Color("#5a3e26"), Color("#7a5634"), Color("#8a6a44")], "leaf": [Color("#4f8a3a"), Color("#6aa848"), Color("#8cc45a")],
	"water": [Color("#7cc0e0"), Color("#e8f6fa"), Color("#5aa0c8")], "fire": [Color("#f4b04a"), Color("#f07a3a")],
}

## Each particle: [x, y, vx, vy, life, max, color, size, gravity, kind, phase, extra]
var list: Array[Array] = []
var game: Node
var font: Font
var _smoke_timer := 0.0
var _frame := 0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	font = ThemeDB.fallback_font


func _add(x: float, y: float, vx: float, vy: float, max_life: float, color: Color, size: float, gravity: float = 0.0, kind: String = "px", extra: Variant = null) -> void:
	if list.size() >= MAX:
		list.pop_front()
	list.append([x, y, vx, vy, 0.0, max_life, color, size, gravity, kind, _rng.randf() * TAU, extra])


## A damage number that floats up and fades. (tx, ty) in tiles.
func float_text(tx: float, ty: float, text: String, color: Color) -> void:
	_add(tx * WorldView.TILE_PX, ty * WorldView.TILE_PX - 20 * K, 0.0, -14 * K, 0.9 if text.begins_with("-") else 1.4, color, 1.0, 0.0, "text", text)


## An arrow flying from a hunter to its quarry (tiles).
func arrow(fx: float, fy: float, tx: float, ty: float) -> void:
	_add(fx * WorldView.TILE_PX, fy * WorldView.TILE_PX - 10 * K, 0.0, 0.0, 0.22, Color("#e8dcc0"), 1.0, 0.0, "arrow",
		Vector2(tx * WorldView.TILE_PX, ty * WorldView.TILE_PX - 6 * K))


func _burst(x: float, y: float, n: int, colors: Array, speed: float, gravity: float, max_life: float, lift: float = 30.0) -> void:
	var r := _rng
	for i in n:
		var a := r.randf() * TAU
		_add(x + (r.randf() - 0.5) * 6 * K, y - 4 * K + (r.randf() - 0.5) * 4 * K, cos(a) * speed * K * (0.4 + r.randf()), -lift * K * (0.5 + r.randf()),
			max_life * (0.7 + r.randf() * 0.6), colors[i % colors.size()], 2.0 if r.randf() < 0.3 else 1.0, gravity * K)


## Bursts from simulation events and building life. (tx, ty) in tiles.
func fx(kind: String, tx: float, ty: float) -> void:
	var x := tx * WorldView.TILE_PX
	var y := ty * WorldView.TILE_PX
	var r := _rng
	match kind:
		"woodchips":
			_burst(x, y, 5, C["wood"], 30, 160, 0.6)
		"stonechips":
			_burst(x, y, 5, C["stone"], 32, 170, 0.55)
		"soil":
			_burst(x, y, 6, C["soil"], 26, 150, 0.5)
		"splash":
			_burst(x, y, 7, C["water"], 22, 140, 0.5, 34)
		"leaves":
			for i in 10:
				_add(x + (r.randf() - 0.5) * 18 * K, y - (18 + r.randf() * 10) * K, (r.randf() - 0.5) * 8 * K, (6 + r.randf() * 8) * K,
					1.6 + r.randf(), C["leaf"][i % 3], 1.0, 0.0, "leaf")
		"sparkle":
			for i in 9:
				_add(x + (r.randf() - 0.5) * 16 * K, y - r.randf() * 14 * K, (r.randf() - 0.5) * 6 * K, (-12 - r.randf() * 14) * K,
					0.9 + r.randf() * 0.5, Color("#fff6c2") if i % 2 else Color("#f4dc5c"), 2.0 if r.randf() < 0.3 else 1.0)
		"dust":
			for i in 4:
				_add(x + (r.randf() - 0.5) * 14 * K, y - r.randf() * 3 * K, (r.randf() - 0.5) * 16 * K, (-4 - r.randf() * 5) * K,
					0.7 + r.randf() * 0.4, Color(0.84, 0.77, 0.63, 0.8), 3.0, 0.0, "smoke")
		"hearts":
			_add(x, y - 16 * K, 0.0, -10 * K, 1.3, Color("#e0584a"), 1.0, 0.0, "heart")
		"smoke":
			_add(x + (r.randf() - 0.5) * 2 * K, y, (3 + r.randf() * 3) * K, (-9 - r.randf() * 4) * K, 2.6 + r.randf(), Color(0.86, 0.86, 0.88, 0.55), 2.0, 0.0, "smoke")
		"butterfly":
			var colors := [Color("#f4dc5c"), Color("#f0f0f8"), Color("#f09ab8"), Color("#8fc9e0")]
			_add(x + (r.randf() - 0.5) * 10 * K, y - 4 * K, (r.randf() - 0.5) * 10 * K, (-3 - r.randf() * 3) * K, 3 + r.randf() * 2, colors[r.randi() % 4], 1.0, 0.0, "butterfly")
		"glint":
			_add(x + (r.randf() - 0.5) * 20 * K, y - r.randf() * 20 * K, 0.0, 0.0, 0.5, Color("#fffbe8"), 1.0)
		"bird":
			_add(x + (r.randf() - 0.5) * 16 * K, y, (r.randf() - 0.5) * 14 * K, -12 * K, 0.8, Color("#6a4a32"), 2.0, 60 * K)
		"spark":
			_add(x + (r.randf() - 0.5) * 5 * K, y, (r.randf() - 0.5) * 8 * K, (-18 - r.randf() * 16) * K, 0.7 + r.randf() * 0.5, C["fire"][r.randi() % 2], 1.0)


## A simulation event: bursts, hits (a number, dust, and an arrow from afar).
func on_event(e: Dictionary) -> void:
	match str(e["type"]):
		"fx":
			fx(str(e["kind"]), float(e["x"]), float(e["y"]))
		"hit":
			var x := float(e["x"])
			var y := float(e["y"])
			if float(e.get("reach", 0)) > 2.5 and e.get("fromX") != null:
				arrow(float(e["fromX"]), float(e["fromY"]), x, y)
			float_text(x, y, "-%d" % int(e["amount"]), Color("#ff7b6b") if e["target"] == "settler" else Color("#ffe08a"))
			fx("dust", x, y)


## Moves and draws. `view` (world pixels) limits the building emitters to what is on screen.
func step(delta: float, sim: Simulation, view: Rect2, art: Art, lite: bool, night: bool) -> void:
	_frame += 1
	if not lite and sim != null:
		_emit(delta, sim, view, art, night)
	var out: Array[Array] = []
	for p: Array in list:
		p[4] += delta
		if p[4] >= p[5]:
			continue
		p[3] += p[8] * delta
		var kind: String = p[9]
		if kind == "leaf":
			p[2] = sin(p[4] * 4 + p[10]) * 10 * K
		elif kind == "butterfly":
			p[2] = sin(p[4] * 3 + p[10]) * 9 * K
			p[3] = (cos(p[4] * 5 + p[10]) * 6 - 1) * K
		if kind != "arrow":
			p[0] += p[2] * delta
			p[1] += p[3] * delta
		if kind == "smoke":
			p[7] += delta * 2.2
		out.append(p)
	list = out
	queue_redraw()


func _busy_sites(sim: Simulation) -> Dictionary:
	var busy := {}
	for s: Settler in sim.settlers:
		var t := s.task
		if t != null and t.stage == &"work" and (t.kind == Task.CRAFT or t.kind == Task.EXTRACT or t.kind == Task.HERD):
			busy[t.site] = true
	return busy


func _emit(delta: float, sim: Simulation, view: Rect2, art: Art, night: bool) -> void:
	var T := WorldView.TILE_PX
	var tiles := Rect2(view.position / T, view.size / T).grow(3)
	_smoke_timer += delta
	var camp_sparks := _smoke_timer > 0.45
	if camp_sparks:
		_smoke_timer = 0.0
	var busy := {}
	var busy_known := false
	for b: Building in sim.buildings.values():
		if not b.built or not tiles.intersects(Rect2(b.x, b.y, b.w, b.h)):
			continue
		if camp_sparks and (b.type == "camp" or b.type == "travelCamp"):
			fx("spark", b.x + 1.5, b.y + 1.6)
		var life: Dictionary = LIFE.get(b.type, {})
		if life.is_empty():
			continue
		var heavy: bool = life.get("heavy", false)
		var needs_busy: bool = life.has("work") or life.has("sparks") or (life.has("smoke") and not HOMEY.has(b.type))
		if needs_busy and not busy_known:
			busy = _busy_sites(sim)
			busy_known = true
		var working: bool = busy.has(b.id)
		var anchor := Vector2(b.x, b.y + b.h) * T
		if life.has("smoke"):
			var fire: bool = (night or (_frame + b.id * 7) % 600 < 200) if HOMEY.has(b.type) else (working or heavy)
			if fire and (_frame + b.id * 13) % (9 if heavy else 16) == 0:
				var pt: Variant = art.point(b.type, "chimney")
				if pt == null:
					pt = art.point(b.type, "top")
				var at: Vector2 = anchor + (pt as Vector2 if pt != null else Vector2(b.w * T / 2.0, -T))
				fx("smoke", at.x / T, at.y / T)
		if life.has("ambient"):
			var amb: String = life["ambient"]
			var every := 140 if amb == "butterfly" else (90 if amb == "glint" else 110)
			if (_frame + b.id * 17) % every == 0:
				fx(amb, b.x + b.w / 2.0, b.y + b.h / 2.0)
		if life.has("sparks") and working and (_frame + b.id) % 5 == 0:
			var top: Variant = art.point(b.type, "chimney")
			var sp: Vector2 = anchor + (top as Vector2 if top != null else Vector2(b.w * T / 2.0, -T))
			fx("spark", sp.x / T, sp.y / T)
		if life.has("work") and working and (_frame + b.id * 3) % 24 == 0:
			fx(str(life["work"]), b.x + b.w / 2.0, b.y + b.h)


func _draw() -> void:
	var zoom := get_viewport().get_canvas_transform().get_scale().x
	for p: Array in list:
		var t: float = p[4] / p[5]
		var kind: String = p[9]
		var pos := Vector2(p[0], p[1])
		var col: Color = p[6]
		match kind:
			"text":
				var a := (1.0 - t) / 0.4 if t > 0.6 else 1.0
				var size := int(22.0 / maxf(zoom, 0.05))
				var label := str(p[11])
				var at := pos - Vector2(font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x / 2.0, 0)
				draw_string(font, at + Vector2(2, 2) / zoom, label, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(0.1, 0.08, 0.12, a))
				draw_string(font, at, label, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(col, a))
			"arrow":
				var to: Vector2 = p[11]
				var ap := pos.lerp(to, t) - Vector2(0, sin(t * PI) * 6 * K)
				var dir := (to - pos).normalized()
				draw_line(ap - dir * 6 * K, ap, Color("#6a4a2a"), maxf(1.0, K * 0.6))
				draw_rect(Rect2(ap - Vector2(K, K), Vector2(K, K) * 2), Color("#c8ccd0"))
			"heart":
				var s := K * 2.2
				var c := Color(col, 1.0 - t * t)
				draw_circle(pos + Vector2(-s * 0.5, 0), s * 0.6, c)
				draw_circle(pos + Vector2(s * 0.5, 0), s * 0.6, c)
				draw_colored_polygon(PackedVector2Array([pos + Vector2(-s * 1.08, s * 0.2), pos + Vector2(s * 1.08, s * 0.2), pos + Vector2(0, s * 1.4)]), c)
			"butterfly":
				var a := (1.0 - t) / 0.15 if t > 0.85 else 1.0
				var open := int(p[4] * 12 + p[10]) % 2 == 0
				draw_rect(Rect2(pos + Vector2(-K * (2 if open else 1), 0), Vector2(K, K)), Color(col, a))
				draw_rect(Rect2(pos + Vector2(K * (1 if open else 0), 0), Vector2(K, K)), Color(col, a))
				draw_rect(Rect2(pos, Vector2(K * 0.5, K)), Color("#3a2a1a", a))
			"smoke":
				draw_circle(pos, float(p[7]) * K * 0.6, Color(col, col.a * (1.0 - t) * 0.9))
			_:
				var a := (1.0 - t) / 0.3 if t > 0.7 else 1.0
				var s := maxf(1.0, roundf(p[7])) * K
				draw_rect(Rect2(pos - Vector2(s, s) / 2.0, Vector2(s, s)), Color(col, col.a * a))
