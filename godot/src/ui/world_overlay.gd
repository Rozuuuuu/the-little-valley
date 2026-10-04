class_name WorldOverlay
extends Node2D
## Planning and feedback drawn over the world: work areas, harvest marks, construction progress, the
## placement ghost (mint when it fits, red and hatched when not, so colour is never the only cue),
## the drag box, the hovered tile and order markers.

var game: Game
var font: Font = load("res://fonts/AtkinsonHyperlegible-Bold.woff2")
## Outline colours of work areas by kind (fill is the same, faint).
const AREA_COLORS := {"farm": Color("#e3c26f"), "wood": Color("#7fc79a"), "stone": Color("#b9c6c4"), "build": Color("#e8a66a"), "hunt": Color("#d98a7a"), "forage": Color("#c49ad8")}


func _ready() -> void:
	z_index = 10


func _draw() -> void:
	if game == null or game.sim == null:
		return
	var sim := game.sim
	var T := WorldView.TILE_PX
	var view := game.camera.view_rect().grow(T)
	# Work areas: a faint fill, an outline and the name with the crew count, kept the same size on
	# screen at any zoom.
	var px := 1.0 / maxf(0.05, game.camera.zoom.x)
	for a in sim.work_areas:
		var r := Rect2(Vector2(a.x0, a.y0) * T, Vector2(a.x1 - a.x0 + 1, a.y1 - a.y0 + 1) * T)
		if not r.intersects(view):
			continue
		var col: Color = AREA_COLORS.get(a.kind, WorldView.MINT)
		var chosen := game.hud != null and game.hud.chosen_area == a.id
		draw_rect(r, Color(col, 0.18 if chosen else 0.1))
		draw_rect(r, Color(col, 1.0 if chosen else 0.85), false, (3.5 if chosen else 2.5) * px)
		var label := "%s · %d" % [a.name, Areas.crew_of(sim, a.id).size()]
		_label(r.position + Vector2(6, 20) * px, label, col, px)
	# Harvest marks: a small gold diamond over each marked object.
	var tiles := Rect2i(floori(view.position.x / T), floori(view.position.y / T), ceili(view.size.x / T) + 1, ceili(view.size.y / T) + 1)
	for k: int in sim.designations.keys_in(tiles):
		var p := Vector2(Simulation.key_x(k) + 0.5, Simulation.key_y(k) + 0.85) * T
		if true:
			# A small gold tag at the foot of the marked object.
			draw_colored_polygon(PackedVector2Array([p + Vector2(0, -5), p + Vector2(5, 0), p + Vector2(0, 5), p + Vector2(-5, 0)]), WorldView.GOLD)
			draw_polyline(PackedVector2Array([p + Vector2(0, -5), p + Vector2(5, 0), p + Vector2(0, 5), p + Vector2(-5, 0), p + Vector2(0, -5)]), Color("#7a5a20"), 1.5, true)
	# Construction progress: materials, then work.
	for b in sim.sites():
		var top := Vector2(b.x * T, b.y * T - 10)
		if not view.has_point(top):
			continue
		var w := b.w * T
		var cost := BuildingOps.cost_of(b)
		var need := maxi(1, Inv.total(cost))
		var got := 0
		for r: String in cost:
			got += mini(int(cost[r]), int(b.delivered.get(r, 0)))
		var mat_frac := float(got) / need
		var work := BuildingOps.work_of(b)
		var work_frac := b.progress / work if work > 0 else 1.0
		draw_rect(Rect2(top, Vector2(w, 8)), Color(0.09, 0.23, 0.24, 0.85))
		draw_rect(Rect2(top, Vector2(w * mat_frac, 4)), Color("#d9b26a"))
		draw_rect(Rect2(top + Vector2(0, 4), Vector2(w * work_frac, 4)), Color("#8fd18a"))
	# Levels: a gold pip per level above the first, and an upgrade's progress.
	for id: int in sim.upgrading:
		var ub: Building = sim.buildings.get(id)
		if ub == null or ub.upgrade.is_empty():
			continue
		var top := Vector2(ub.x * T, ub.y * T - 12)
		if not view.has_point(top):
			continue
		var lvs := Levels.levels_of(ub)
		var to := int(ub.upgrade["to"])
		var frac := float(ub.upgrade["progress"]) / maxf(1.0, float((lvs[to - 1] as Dictionary)["time"])) if to - 1 < lvs.size() else 0.0
		draw_rect(Rect2(top, Vector2(ub.w * T, 6)), Color(0.09, 0.23, 0.24, 0.85))
		draw_rect(Rect2(top, Vector2(ub.w * T * frac, 6)), WorldView.GOLD)
	for b: Building in sim.buildings.values():
		if b.level <= 1 or not b.built:
			continue
		var at := Vector2((b.x + b.w) * T - 10, b.y * T + 8)
		if not view.has_point(at):
			continue
		for i in b.level - 1:
			var c := at - Vector2(i * 12, 0)
			var pip := PackedVector2Array([c + Vector2(0, -5), c + Vector2(5, 0), c + Vector2(0, 5), c + Vector2(-5, 0)])
			draw_colored_polygon(pip, WorldView.GOLD)
			pip.append(pip[0])
			draw_polyline(pip, Color("#7a5a20"), 1.5, true)
	# Hovered tile.
	if game.hover_tile.x != -99999 and game.placing == "":
		draw_rect(Rect2(Vector2(game.hover_tile) * T, Vector2(T, T)), Color(WorldView.MINT, 0.5), false, 2.0)
	# Placement ghost.
	for t: Array in game.ghost_tiles:
		var r := Rect2(Vector2(int(t[0]), int(t[1])) * T, Vector2(T, T))
		if bool(t[2]):
			draw_rect(r, Color(WorldView.MINT, 0.35))
			draw_rect(r, Color(WorldView.MINT, 0.9), false, 2.0)
		else:
			draw_rect(r, Color("#d9584f", 0.35))
			for i in 4:
				var o := i * T / 4.0
				draw_line(r.position + Vector2(o, 0), r.position + Vector2(0, o), Color("#d9584f", 0.9), 2.0)
				draw_line(r.end - Vector2(o, 0), r.end - Vector2(0, o), Color("#d9584f", 0.9), 2.0)
	# Drag box.
	if game.drag_box.has_area():
		if game.placing.begins_with("area:"):
			# A new work area snaps to whole tiles.
			var tr := game._tile_rect(game.drag_box)
			var col: Color = AREA_COLORS.get(game.placing.substr(5), WorldView.MINT)
			var too_big := tr.get_area() > Commands.MAX_AREA
			if too_big:
				col = Color("#d9584f")
			var rr := Rect2(Vector2(tr.position) * T, Vector2(tr.size) * T)
			draw_rect(rr, Color(col, 0.18))
			draw_rect(rr, Color(col, 0.95), false, 2.5 * px)
			_label(rr.end + Vector2(6, 0) * px, "%d×%d%s" % [tr.size.x, tr.size.y, " — too large" if too_big else ""], col, px)
		else:
			draw_rect(game.drag_box, Color(WorldView.MINT, 0.12))
			draw_rect(game.drag_box, Color(WorldView.MINT, 0.9), false, 2.0)
	# Order markers fade over 0.7 s.
	var now := Time.get_ticks_msec() / 1000.0
	for m: Dictionary in game.markers:
		var age := now - float(m["t"])
		if age > 0.7:
			continue
		var c: Color = WorldView.GOLD if m["kind"] == "work" else WorldView.MINT
		var p: Vector2 = m["p"]
		draw_set_transform(p, 0.0, Vector2(1.0, 0.5))
		draw_arc(Vector2.ZERO, 10.0 + age * 30.0, 0.0, TAU, 24, Color(c, 1.0 - age / 0.7), 3.0, true)
		draw_set_transform(Vector2.ZERO)


## Text in world space drawn at a constant screen size (`px` world units per screen pixel).
func _label(at: Vector2, text: String, col: Color, px: float) -> void:
	draw_set_transform(at, 0.0, Vector2(px, px))
	draw_string_outline(font, Vector2.ZERO, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, 5, Color(0.05, 0.16, 0.17, 0.92))
	draw_string(font, Vector2.ZERO, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, col.lightened(0.35))
	draw_set_transform(Vector2.ZERO)
