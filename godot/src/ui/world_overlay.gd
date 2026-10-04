class_name WorldOverlay
extends Node2D
## Planning and feedback drawn over the world: harvest marks, construction progress, the
## placement ghost (mint when it fits, red and hatched when not, so colour is never the only cue),
## the drag box, the hovered tile and order markers.

var game: Game


func _ready() -> void:
	z_index = 10


func _draw() -> void:
	if game == null or game.sim == null:
		return
	var sim := game.sim
	var T := WorldView.TILE_PX
	var view := game.camera.view_rect().grow(T)
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
