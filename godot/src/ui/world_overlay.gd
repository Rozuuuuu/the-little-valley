class_name WorldOverlay
extends Node2D
## Planning and feedback drawn over the world: work areas, harvest marks, construction progress, the
## placement ghost (mint when it fits, red and hatched when not, so colour is never the only cue),
## the drag box, the hovered tile and order markers.

var game: Game
var font: Font = UiFonts.bold()
## Outline colours of work areas by kind (fill is the same, faint).
const ORE_COLORS := {"coal": Color("#3b3b3b"), "copper": Color("#d07a43"), "iron": Color("#a7a2a0"), "silver": Color("#dfe6ea"), "gold": Color("#e6b65a"), "diamond": Color("#9fe3f0")}
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
	if game.settings.show_grid:
		# The tile grid: one-pixel lines on every tile edge (Renderer.drawGrid).
		var gc := Color(0.08, 0.06, 0.11, 0.18)
		for gx in range(floori(view.position.x / T), ceili(view.end.x / T) + 1):
			draw_line(Vector2(gx * T, view.position.y), Vector2(gx * T, view.end.y), gc, px)
		for gy in range(floori(view.position.y / T), ceili(view.end.y / T) + 1):
			draw_line(Vector2(view.position.x, gy * T), Vector2(view.end.x, gy * T), gc, px)
	if game.placing == "survey" and game.hover_tile.x != -99999:
		# The whole geology cell a survey would cover.
		var gc := Geology.cell_of(game.hover_tile.x, game.hover_tile.y)
		var cr := Rect2(Vector2(gc) * Geology.CELL * T, Vector2.ONE * Geology.CELL * T)
		draw_rect(cr, Color(WorldView.GOLD, 0.08))
		draw_rect(cr, Color(WorldView.GOLD, 0.8), false, 2.0 * px)
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
	# Surveyed ore: a coloured stone with the mineral's name once zoomed in.
	for d in Mining.known_deposits(sim):
		var dp := Vector2(int(d["x"]) + 0.5, int(d["y"]) + 0.5) * T
		if not view.has_point(dp):
			continue
		var mcol: Color = ORE_COLORS.get(str(d["mineral"]), WorldView.GOLD)
		if int(d["remaining"]) <= 0:
			mcol = Color(0.55, 0.55, 0.55)
		draw_circle(dp, 9.0 * px, Color(0.05, 0.16, 0.17, 0.85))
		draw_circle(dp, 6.5 * px, mcol)
		if game.camera.zoom.x >= 0.6:
			_label(dp + Vector2(12, 5) * px, str(Geology.mineral(str(d["mineral"]))["name"]), mcol, px)
	# Health bars over animals, as the browser (over everyone, or only the hurt).
	for a in sim.animals:
		var ap := Vector2(a.x, a.y) * T
		if not view.has_point(ap) or not sim.world.explored(floori(a.x), floori(a.y)):
			continue
		var d := a.def()
		var hp_max := float(d.get("hp", 1))
		if not SettlerView.health_bars_all and a.health() >= hp_max:
			continue
		var lift: Array = [0, 13, 18, 23]
		SettlerView.draw_hp_bar(self, ap + Vector2(0, -float(lift[clampi(int(d.get("size", 1)), 0, 3)]) * 4.0), a.health() / maxf(1.0, hp_max), d.has("fightsBack"))
	# Harvest marks, as the browser: the tool for the job (axe, pick or basket) over each marked
	# object, bobbing while a settler is on the way to it.
	var tiles := Rect2i(floori(view.position.x / T), floori(view.position.y / T), ceili(view.size.x / T) + 1, ceili(view.size.y / T) + 1)
	var bob_t := Time.get_ticks_msec() / 1000.0 * 5.0
	for k: int in sim.designations.keys_in(tiles):
		var x := Simulation.key_x(k)
		var y := Simulation.key_y(k)
		if not sim.world.explored(x, y):
			continue
		var res: String = Tiles.object_resource[sim.world.obj(x, y)]
		var icon := "ui_axe" if res == "wood" else ("ui_pick" if res == "stone" else "ui_basket")
		var bob := roundf(sin(bob_t)) if sim.reservations.has(Simulation.K_OBJ + k) else 0.0
		_draw_sprite(icon, Vector2((x + 0.5) * T, (y + (bob - 2.0) / 16.0) * T), 0.9)
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
	var with_sprite := game.ghost_sprite != "" and game.placing != ""
	for t: Array in game.ghost_tiles:
		var r := Rect2(Vector2(int(t[0]), int(t[1])) * T, Vector2(T, T))
		if bool(t[2]):
			draw_rect(r, Color(WorldView.MINT, 0.15 if with_sprite else 0.35))
			draw_rect(r, Color(WorldView.MINT, 0.9), false, 2.0)
		else:
			draw_rect(r, Color("#d9584f", 0.35))
			for i in 4:
				var o := i * T / 4.0
				draw_line(r.position + Vector2(o, 0), r.position + Vector2(0, o), Color("#d9584f", 0.9), 2.0)
				draw_line(r.end - Vector2(o, 0), r.end - Vector2(0, o), Color("#d9584f", 0.9), 2.0)
	# The building itself, see-through over its footprint (reddened where it can't go).
	if with_sprite:
		var tint := Color(1, 1, 1, 0.8) if game.ghost_ok else Color(1.0, 0.45, 0.4, 0.65)
		_draw_sprite(game.ghost_sprite, Vector2(game.ghost_at) * T, tint.a, tint)
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
	# Borders while the Realm window is open (or a sector is being claimed): homeland, frontier
	# claims, held land and other kingdoms' land, each sector outlined in its colour.
	if (game.hud != null and game.hud.realm_open()) or game.placing == "claim":
		_draw_borders(sim, view, T, px)
	# Other kingdoms' companies are drawn by WorldLife as soldiers; here, their strength.
	for k: Dictionary in sim.kingdoms:
		if k["player"]:
			continue
		var kc := Color(str(k["banner"]["color"]))
		for c: Dictionary in k["companies"]:
			if c.get("state") != "deployed" and c.get("state") != "returning":
				continue
			var cp := Vector2(float(c.get("x", 0)), float(c.get("y", 0))) * T
			if not view.has_point(cp):
				continue
			_label(cp + Vector2(-40, -150), "%s %d" % [str(Military.unit(c["kind"])["name"]), int(c.get("health", 100))], kc.lightened(0.2), px)
	# Merchants and caravan carts are drawn by WorldLife, in pixel art.
	# The Assistant Chief's big gold "?" (ui_advice) while they wait beside the ruler with advice:
	# it bobs and pulses, to be clicked (the ruler's own crown is on their SettlerView).
	var adviser := Roles.advice_showing(sim)
	if adviser != null:
		var av: Node2D = game.view.settler_views.get(adviser.id)
		var ap := av.position if av != null else Vector2(adviser.x, adviser.y) * T
		var tq := Time.get_ticks_msec() / 1000.0
		_draw_sprite("ui_advice", ap + Vector2(0, (-25.0 + roundf(sin(tq * 4.0) * 1.5)) * 4.0), 0.85 + 0.15 * sin(tq * 6.0))
	# Highlight: corner brackets that pulse round what was just pointed at, for 2.6 s.
	if not game.highlight.is_empty():
		var age := Time.get_ticks_msec() / 1000.0 - float(game.highlight["t0"])
		if age > 2.6:
			game.highlight = {}
		else:
			var hr: Rect2 = game.highlight["rect"]
			var a4 := 4.0
			var pulse := (2.0 + roundf((sin(age * 8.0) + 1.0) * 1.5)) * a4
			var alpha := minf(1.0, (2.6 - age) * 1.5)
			var r := Rect2(hr.position * T, hr.size * T).grow(pulse)
			_brackets(r.grow(a4), Color(Color("#ffcf5a"), alpha), a4)
			_brackets(r, Color(Color("#fff6c2"), alpha), a4)
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


func _draw_borders(sim: Simulation, view: Rect2, T: float, px: float) -> void:
	var size := Territory.sector_size() * T
	var s0 := Territory.sector_of(view.position.x / T, view.position.y / T)
	var s1 := Territory.sector_of(view.end.x / T, view.end.y / T)
	for sy in range(s0.y, s1.y + 1):
		for sx in range(s0.x, s1.x + 1):
			var o := Territory.owner_of(sim, Vector2i(sx, sy))
			if o.is_empty():
				continue
			var owner := Kingdoms.by_id(sim, int(o["legalOwner"]))
			var col := Color(str(owner["banner"]["color"])) if not owner.is_empty() else Color.GRAY
			var r := Rect2(Vector2(sx, sy) * size, Vector2(size, size))
			draw_rect(r, Color(col, 0.10 if o["protectedHomeland"] else 0.05))
			# Outline only where the neighbouring sector has another owner.
			var me_key := "%s|%s" % [o["legalOwner"], o["protectedHomeland"]]
			for d: Vector2i in [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]:
				var n := Territory.owner_of(sim, Vector2i(sx, sy) + d)
				if not n.is_empty() and "%s|%s" % [n["legalOwner"], n["protectedHomeland"]] == me_key:
					continue
				var a0 := r.position + Vector2(maxi(d.x, 0), maxi(d.y, 0)) * size
				var a1 := a0 + (Vector2(0, size) if d.x != 0 else Vector2(size, 0))
				draw_line(a0, a1, Color(col, 0.85), 3.0 * px)
			if o["occupyingKingdom"] != null:
				var occ := Kingdoms.by_id(sim, int(o["occupyingKingdom"]))
				var oc := Color(str(occ["banner"]["color"])) if not occ.is_empty() else Color.RED
				for i in 4:
					var off := i * size / 4.0
					draw_line(r.position + Vector2(off, 0), r.position + Vector2(0, off), Color(oc, 0.6), 2.0 * px)
	if game.placing == "claim" and game.hover_tile.x != -99999:
		var hs := Territory.sector_of(game.hover_tile.x, game.hover_tile.y)
		var pv := Territory.claim_preview(sim, hs)
		var hr := Rect2(Vector2(hs) * size, Vector2(size, size))
		var ok: bool = pv["problem"] == ""
		draw_rect(hr, Color(WorldView.MINT if ok else Color("#d9584f"), 0.2))
		_label(hr.position + Vector2(6, 20) * px, "%d coins" % int(pv["cost"]) if ok else str(pv["problem"]), WorldView.MINT if ok else Color("#f08a80"), px)


## Draws one of the game's sprites with its anchor at `at` (world px), at the world's scale.
func _draw_sprite(sprite_name: String, at: Vector2, alpha: float = 1.0, tint: Color = Color.WHITE) -> void:
	var sp: Dictionary = game.art.sprites.get(sprite_name, {})
	if sp.is_empty():
		return
	var k := WorldView.TILE_PX / Art.SOURCE_PX_PER_TILE
	var size := Vector2(float(sp["w"]), float(sp["h"])) * k
	var anchor := Vector2(float(sp["ax"]), float(sp["ay"])) * k
	draw_texture_rect(sp["texture"] as Texture2D, Rect2(at - anchor, size), false, Color(tint.r, tint.g, tint.b, alpha))


## Four corner brackets round `r` (Renderer.drawBrackets), lines `a` px thick and 4 a long.
func _brackets(r: Rect2, c: Color, a: float) -> void:
	var l := a * 5.0
	for corner: Vector2 in [r.position, Vector2(r.end.x, r.position.y), Vector2(r.position.x, r.end.y), r.end]:
		var sx := 1.0 if corner.x == r.position.x else -1.0
		var sy := 1.0 if corner.y == r.position.y else -1.0
		draw_rect(Rect2(corner.x - (0.0 if sx > 0 else l), corner.y - (0.0 if sy > 0 else a), l, a), c)
		draw_rect(Rect2(corner.x - (0.0 if sx > 0 else a), corner.y - (0.0 if sy > 0 else l), a, l), c)
