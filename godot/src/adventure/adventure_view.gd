class_name AdventureView
extends Node2D
## Presentation only. Positions are continuous tile coordinates (no half-tile offset).
## Add beside WorldView's other layers; fog must remain at z=7. No owned child nodes.
## setup() also resets presentation when changing games. refresh({}) clears the view.

const TILE := 64.0
const GRID := 4.0
const INK := Color("263949")
const SHADOW := Color(0.10, 0.23, 0.24, 0.32)
const GOLD := Color("ffd77b")
const PALE := Color("ecf4df")
const TEAL := Color("349fa5")

var _sim: Simulation
var _art: Art
var _state: Dictionary = {}
var _clock := 0.0
var _motion := 1.0
var _alpha := 1.0
var _tick := 0


func setup(sim: Simulation, art: Art) -> void:
	_sim = sim
	_art = art
	_state = {}
	_clock = 0.0
	z_index = 6
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	queue_redraw()


func refresh(state: Dictionary, delta: float, motion: float = 1.0) -> void:
	_state = state
	_motion = clampf(motion, 0.0, 1.0)
	_clock += clampf(delta, 0.0, 0.1) * _motion
	_alpha = clampf(float(state.get("alpha", 1.0)), 0.0, 1.0)
	_tick = int(state.get("tick", 0))
	queue_redraw()


func _position(actor: Dictionary) -> Vector2:
	var now := Vector2(float(actor.get("x", 0)), float(actor.get("y", 0)))
	var previous := Vector2(float(actor.get("px", now.x)), float(actor.get("py", now.y)))
	return (previous.lerp(now, _alpha) * TILE).round()


func _explored(p: Vector2) -> bool:
	return _sim != null and _sim.world != null and _sim.world.explored(floori(p.x / TILE), floori(p.y / TILE))


func _on_screen(p: Vector2) -> bool:
	return get_viewport_rect().grow(192.0).has_point(get_global_transform_with_canvas() * p)


func _draw() -> void:
	if _state.is_empty():
		return
	# Scenery is always painted first so roofs and shrubs cannot cover the party.
	for site: Dictionary in _state.get("sites", []):
		var p := Vector2(float(site.get("x", 0)), float(site.get("y", 0))) * TILE
		if bool(site.get("discovered", false)) and _explored(p) and _on_screen(p):
			_site(site, p.round())
	var actors: Array[Dictionary] = []
	var hero: Dictionary = _state.get("hero", {})
	if not hero.is_empty():
		actors.append({"data": hero, "kind": "hero", "p": _position(hero), "ally": true})
	for enemy: Dictionary in _state.get("enemies", []):
		var p := _position(enemy)
		var target := Vector2(float(enemy.get("x", 0)), float(enemy.get("y", 0))) * TILE
		if _explored(p) and _explored(target):
			actors.append({"data": enemy, "kind": str(enemy.get("kind", "mossling")), "p": p, "ally": false})
	var social: Dictionary = _state.get("social", {})
	for companion: Dictionary in social.get("companions", []):
		if not companion.has("x") or not companion.has("y"):
			continue
		if str(companion.get("status", "active")) in ["reserve", "dismissed", "dead", "away"]:
			continue
		var p := _position(companion)
		if _explored(p):
			var role := str(companion.get("role", "human"))
			actors.append({"data": companion, "kind": role if role in ["elf", "orc"] else "human", "p": p, "ally": true})
	actors.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["p"].y < b["p"].y)
	for entry: Dictionary in actors:
		if _on_screen(entry["p"]):
			_actor(entry["data"], entry["kind"], entry["p"], entry["ally"])
	draw_set_transform(Vector2.ZERO)


## All authored shapes use a four-screen-pixel grid; no textures or external assets.
func _box(x: float, y: float, w: float, h: float, color: Color) -> void:
	draw_rect(Rect2(x * GRID, y * GRID, w * GRID, h * GRID), color)


func _ring(radius: float, color: Color) -> void:
	for i in range(20):
		var angle := float(i) * TAU / 20.0
		var p := (Vector2(cos(angle), sin(angle) * 0.48) * radius / GRID).round() * GRID
		draw_rect(Rect2(p - Vector2(2, 2), Vector2(4, 4)), color)


func _actor(actor: Dictionary, kind: String, p: Vector2, ally: bool) -> void:
	draw_set_transform(p)
	_box(-4, -1, 8, 2, SHADOW)
	if bool(actor.get("dead", false)):
		_box(-3, -2, 6, 1, INK)
		_box(-2, -3, 2, 1, Color("a9b4a1"))
		_box(1, -2, 2, 1, Color("7b897c"))
		return
	var windup := int(actor.get("windup", 0)) > 0
	var attacking := int(actor.get("attack_until", 0)) > _tick
	if kind == "hero":
		_ring(22, Color("82d9c5"))
	if windup:
		_ring(32, Color("ffae66"))
		_box(-1, -17, 2, 3, GOLD)
		_box(-1, -13, 2, 1, GOLD)
	var walking := absf(float(actor.get("x", 0)) - float(actor.get("px", actor.get("x", 0)))) + absf(float(actor.get("y", 0)) - float(actor.get("py", actor.get("y", 0)))) > 0.001
	var step := 0
	if walking and _motion > 0.0:
		step = 1 if sin(_clock * 13.0) > 0.0 else -1
	var bob := -GRID if step == 1 else 0.0
	var face := -1.0 if int(actor.get("face", 1)) < 0 else 1.0
	draw_set_transform(p + Vector2(0, bob), 0, Vector2(face, 1))
	match kind:
		"mossling":
			_box(-4, -6, 8, 5, INK)
			_box(-5, -5, 10, 3, Color("347659"))
			_box(-3, -8, 6, 6, Color("74b95a"))
			_box(-2, -9, 3, 2, Color("c9df73"))
			_box(1, -11, 1, 3, Color("4c9462"))
			_box(2, -11, 2, 1, Color("bce077"))
			_box(-2, -5, 1, 1, INK)
			_box(2, -5, 1, 1, INK)
			_box(-3, -1 + step, 2, 1, Color("406552"))
			_box(2, -1 - step, 2, 1, Color("406552"))
		"stone_brute":
			_box(-5, -9, 10, 8, INK)
			_box(-7, -8, 3, 6, Color("75858b"))
			_box(4, -8, 3, 6, Color("75858b"))
			_box(-4, -9, 8, 6, Color("93a69a"))
			_box(-3, -12, 6, 4, Color("bcc5ad"))
			_box(-3, -12, 3, 1, Color("94bb65"))
			_box(-2, -10, 1, 1, GOLD)
			_box(1, -10, 1, 1, GOLD)
			_box(0, -7, 1, 3, Color("437b79"))
			_box(-4, -2 + step, 3, 2, Color("61757d"))
			_box(1, -2 - step, 3, 2, Color("61757d"))
		"hexling", "gravecaller":
			var robe := Color("8d65b5") if kind == "hexling" else Color("397a88")
			_box(-4, -7, 8, 7, INK)
			_box(-3, -8, 6, 7, robe)
			_box(-2, -11, 4, 4, robe.lightened(0.18))
			_box(-1, -9, 3, 2, INK)
			_box(0, -9, 1, 1, Color("a5f1d8"))
			_box(-4, -1, 3, 1, robe)
			_box(1, -1, 3, 1, robe)
			_box(5, -10, 1, 10, Color("8a6458"))
			_box(4, -12, 3, 2, Color("88dfbd"))
			if kind == "gravecaller":
				_box(-4, -12, 1, 4, PALE)
				_box(3, -12, 1, 4, PALE)
				_box(-1, -5, 2, 2, PALE)
		_:
			_humanoid(kind, step, attacking)
	if attacking:
		# Static blade at reduced motion; attack feedback remains visible.
		var phase := (sin(_clock * 20.0) + 1.0) * 0.5 if _motion > 0.0 else 0.5
		if kind == "hero":
			# Three authored blade poses keep the sword on-grid during the swing.
			var pose := int(phase * 2.99)
			_box(4, -6, 2, 2, GOLD)
			for blade in range(6):
				var blade_x := 5 + (blade if pose > 0 else 0)
				var blade_y := -6 - (blade if pose < 2 else 0)
				_box(blade_x, blade_y, 1, 1, PALE)
		for i in range(7):
			var q := Vector2(5 + i, -9 + roundf(float(i * i) / 9.0 + phase * 2))
			_box(q.x, q.y, 1, 1, PALE if i < 4 else GOLD)
	draw_set_transform(p)
	if actor.has("hp") and float(actor.get("max_hp", 0)) > 0:
		var health := clampf(float(actor["hp"]) / float(actor["max_hp"]), 0, 1)
		var bar_y := -64.0 if windup else -56.0
		draw_rect(Rect2(-20, bar_y, 40, 8), INK)
		draw_rect(Rect2(-18, bar_y + 2, 36 * health, 4), Color("79d9a2") if ally else Color("f18b79"))
	if ally and kind != "hero":
		_box(-1, 2, 2, 1, TEAL)


func _humanoid(kind: String, step: int, attacking: bool) -> void:
	var bone := kind in ["skeleton", "bone_archer"]
	var skin := PALE if bone else Color("e3ad7c")
	var cloth := Color("ae6754")
	if kind == "hero":
		cloth = TEAL
	elif kind == "elf":
		cloth = Color("6fa865")
	elif kind == "orc":
		skin = Color("91b66d")
		cloth = Color("ba7750")
	_box(-3, -8, 6, 7, INK)
	_box(-3, -2 + step, 2, 2, Color("536577"))
	_box(1, -2 - step, 2, 2, Color("536577"))
	_box(-2, -8, 4, 5, cloth)
	_box(-3, -11, 6, 4, INK)
	_box(-2, -11, 4, 3, skin)
	_box(1, -10, 1, 1, INK)
	_box(-4, -7, 2, 3, skin)
	_box(3, -7, 2, 3, skin)
	_box(-2, -4, 4, 1, GOLD)
	if kind == "hero":
		_box(-3, -12, 6, 2, Color("b9d7de"))
		_box(-2, -13, 3, 1, Color("e77668"))
		_box(-2, -10, 4, 1, Color("526a7e"))
		_box(-3, -8, 6, 2, Color("9ebdc9"))
		_box(-4, -7, 3, 4, Color("286c83"))
		_box(-3, -6, 1, 2, GOLD)
		if not attacking:
			_box(5, -11, 1, 7, PALE)
			_box(4, -5, 3, 1, GOLD)
	elif kind == "elf":
		_box(-4, -10, 1, 2, skin)
		_box(3, -11, 1, 2, skin)
		_box(-2, -12, 3, 1, Color("e8d998"))
		_box(5, -10, 1, 9, Color("aa7951"))
	elif kind == "orc":
		_box(-4, -8, 2, 2, Color("d6bb86"))
		_box(3, -9, 1, 2, PALE)
		_box(5, -9, 1, 8, Color("78574e"))
		_box(5, -10, 3, 3, Color("a4b0ae"))
	elif bone:
		for y: int in [-7, -5]:
			_box(-2, y, 4, 1, skin)
		_box(0, -7, 1, 5, skin)
		_box(-2, -2 + step, 1, 2, skin)
		_box(1, -2 - step, 1, 2, skin)
		if kind == "bone_archer":
			_box(5, -9, 1, 7, Color("b98c65"))
			_box(4, -10, 1, 1, GOLD)
			_box(4, -2, 1, 1, GOLD)
			_box(3, -9, 0.5, 7, PALE)
		else:
			_box(5, -9, 1, 6, Color("9daeb0"))
	else:
		_box(-3, -12, 6, 2, Color("775c4a"))
		_box(-4, -10, 7, 1, Color("ad875c"))


func _site(site: Dictionary, p: Vector2) -> void:
	var faction := str(site.get("faction", "human")).to_lower()
	var roof := TEAL
	var wall := Color("e3c58b")
	var banner := Color("e9b960")
	match faction:
		"elf", "elves", "elven":
			roof = Color("4d9b86")
			wall = Color("d9e0c3")
			banner = Color("a9d987")
		"orc", "orcs":
			roof = Color("a86446")
			wall = Color("94704d")
			banner = Color("edb068")
		"undead":
			roof = Color("566f89")
			wall = Color("8b9a9e")
			banner = Color("a195c8")
	draw_set_transform(p)
	# A sandy entrance, flanked by fixed clusters. Centre stays clear for actors.
	_box(-3, -2, 6, 9, Color("bda66e"))
	_box(-2, -1, 4, 8, Color("dfc58d"))
	for i in range(10):
		var dx := (-7 if i % 2 == 0 else 7) + (i % 3)
		var dy := -3 + i * 2
		var patch := p + Vector2(dx, dy) * GRID
		if not _explored(patch):
			continue
		_box(dx - 1, dy, 3, 1, Color("34735e"))
		_box(dx, dy - 1, 2, 1, Color("85b85d"))
		if i % 3 == 0:
			_box(dx, dy - 2, 1, 1, Color("f4c87e") if i % 2 == 0 else Color("eaa1b5"))
	# Small original facade, anchored immediately north of the interaction point.
	_box(-8, -5, 16, 3, SHADOW)
	_box(-7, -14, 14, 10, INK)
	_box(-6, -13, 12, 9, wall)
	_box(-2, -9, 4, 5, Color("4c6665"))
	_box(-5, -11, 2, 2, GOLD)
	_box(3, -11, 2, 2, GOLD)
	for row in range(5):
		_box(-4 - row, -19 + row, 8 + row * 2, 1, roof.lightened(0.22 - row * 0.06))
	_box(-8, -14, 16, 1, roof.darkened(0.25))
	_box(10, -18, 1, 15, Color("786450"))
	_box(11, -18, 4, 5, banner)
	# Banner shapes encode faction even in sepia.
	if faction in ["elf", "elves", "elven"]:
		_box(12, -17, 1, 3, PALE)
		_box(13, -16, 1, 1, PALE)
	elif faction in ["orc", "orcs"]:
		_box(12, -17, 2, 1, INK)
		_box(12, -15, 2, 1, INK)
	elif faction == "undead":
		_box(12, -17, 2, 2, PALE)
		_box(12, -15, 1, 1, PALE)
	else:
		_box(12, -17, 1, 3, PALE)
		_box(11, -16, 3, 1, PALE)
	if bool(site.get("kingless", false)):
		# Empty throne glyph: visible without requiring a text/font dependency.
		_box(-2, -23, 1, 3, GOLD)
		_box(1, -23, 1, 3, GOLD)
		_box(-2, -21, 4, 1, GOLD)
	draw_set_transform(Vector2.ZERO)
