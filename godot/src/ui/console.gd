class_name GameConsole
extends PanelContainer
## The bottom console, as the browser game's (src/ui/Console.tsx): a grass verge along the bottom of
## the screen holding the minimap (with its layer chips), the info panel (the selection's portrait,
## state and bars, or the valley's next milestone), "See more" details beside it, and the 4×3
## command card with hotkeys. The card's commands follow the selection: people (Move, Stop, Hold,
## Attack, Gather, Build, Return, Train, Survey, Home), the ruler (Rally), a building (Upgrade,
## Pause, Demolish), or nothing (Build, Harvest, Unmark, Areas, Next idle, Select all, Sites,
## Waiting, Today, You). In the build and train menus the grid keys Q W E R / A S D F / Z X C V pick.

const GRID_KEYS: Array[Key] = [KEY_Q, KEY_W, KEY_E, KEY_R, KEY_A, KEY_S, KEY_D, KEY_F, KEY_Z, KEY_X, KEY_C, KEY_V]
const BACK_SLOT := 11
const HEIGHT := 204

var hud: Hud
var game: Game
## "" (commands), "build", "train" or a building category.
var menu := ""
var details := false

var minimap := MinimapView.new()
var _info := HBoxContainer.new()
var _details_box := ScrollContainer.new()
var _details_text := RichTextLabel.new()
var _actions := GridContainer.new()
var _card_head := Label.new()
var _grid := GridContainer.new()
var _tip := PanelContainer.new()
var _tip_text := RichTextLabel.new()
var _slots: Array = []
var _info_key := ""
var _card_key := ""
var _find_cursor := {}


func setup(h: Hud) -> void:
	hud = h
	game = h.game
	minimap.game = game
	set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	grow_vertical = Control.GROW_DIRECTION_BEGIN
	custom_minimum_size = Vector2(0, HEIGHT)
	add_theme_stylebox_override("panel", _verge())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	add_child(row)
	# The minimap and its chips (236 px wide, as the browser's console grid).
	var map_box := PanelContainer.new()
	map_box.custom_minimum_size = Vector2(236, 0)
	var mv := VBoxContainer.new()
	mv.add_theme_constant_override("separation", 4)
	map_box.add_child(mv)
	var frame := PanelContainer.new()
	frame.add_theme_stylebox_override("panel", hud._box(Color("#141c18"), Color("#2f6a27"), 0, 0))
	frame.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	frame.add_child(minimap)
	mv.add_child(frame)
	var chips := HBoxContainer.new()
	chips.add_theme_constant_override("separation", 3)
	mv.add_child(chips)
	for c: Array in [["Ppl", "show_settlers", "Show people on the minimap"], ["Bld", "show_buildings", "Show buildings on the minimap"], ["Area", "show_areas", "Show work areas on the minimap"]]:
		var prop: String = c[1]
		var b := _chip(c[0], c[2])
		b.toggle_mode = true
		b.button_pressed = true
		b.toggled.connect(func(on: bool) -> void: minimap.set(prop, on))
		chips.add_child(b)
	var zoom := _chip("Mid", "Minimap zoom")
	zoom.pressed.connect(func() -> void:
		minimap.scale_px = 1 if minimap.scale_px == 2 else (3 if minimap.scale_px == 1 else 2)
		zoom.text = {1: "Far", 2: "Mid", 3: "Near"}[minimap.scale_px])
	chips.add_child(zoom)
	var home := _chip("Home", "Jump to the settlement centre")
	home.pressed.connect(func() -> void: find_next("home"))
	chips.add_child(home)
	row.add_child(map_box)
	# The info panel, with See more beside the summary.
	var info_box := PanelContainer.new()
	info_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# The middle box takes what is left and never pushes the command card off the screen.
	info_box.clip_contents = true
	info_box.custom_minimum_size = Vector2(200, 0)
	# A clipped scroll area: the middle box takes only the room left between the map and the card.
	var clip := ScrollContainer.new()
	clip.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	clip.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	info_box.add_child(clip)
	var split := HBoxContainer.new()
	split.add_theme_constant_override("separation", 10)
	split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	clip.add_child(split)
	_info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_info.add_theme_constant_override("separation", 10)
	split.add_child(_info)
	_details_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_details_box.custom_minimum_size = Vector2(240, 0)
	_details_box.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_details_text.bbcode_enabled = true
	_details_text.fit_content = true
	_details_text.scroll_active = false
	_details_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_details_text.add_theme_font_size_override("normal_font_size", 13)
	_details_text.add_theme_font_size_override("bold_font_size", 14)
	var dv := VBoxContainer.new()
	dv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dv.add_child(_details_text)
	_actions.columns = 3
	_actions.add_theme_constant_override("h_separation", 4)
	_actions.add_theme_constant_override("v_separation", 4)
	dv.add_child(_actions)
	_details_box.add_child(dv)
	split.add_child(_details_box)
	row.add_child(info_box)
	# The command card.
	var card := PanelContainer.new()
	card.size_flags_horizontal = Control.SIZE_SHRINK_END
	card.custom_minimum_size = Vector2(272, 0)
	var cv := VBoxContainer.new()
	cv.add_theme_constant_override("separation", 2)
	card.add_child(cv)
	_card_head.add_theme_color_override("font_color", hud._c("accent"))
	_card_head.add_theme_font_size_override("font_size", 11)
	_card_head.uppercase = true
	cv.add_child(_card_head)
	_grid.columns = 4
	_grid.add_theme_constant_override("h_separation", 4)
	_grid.add_theme_constant_override("v_separation", 4)
	cv.add_child(_grid)
	row.add_child(card)
	# The command tooltip, above the card.
	_tip.visible = false
	_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip_text.bbcode_enabled = true
	_tip_text.fit_content = true
	_tip_text.scroll_active = false
	_tip_text.custom_minimum_size = Vector2(300, 0)
	_tip_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip.add_child(_tip_text)


func tip_layer() -> Control:
	return _tip


## The grass verge behind the console (src/ui/pixel.css .console): dark grass dotted with lighter
## grass every 5 px, a lighter band along the top, and a row of blades above it (drawn in _draw).
func _verge() -> StyleBoxTexture:
	var im := Image.create(5, 5, false, Image.FORMAT_RGBA8)
	im.fill(Color("#25561f"))
	im.set_pixel(2, 2, Color("#387a2b"))
	im.resize(10, 10, Image.INTERPOLATE_NEAREST)
	var b := StyleBoxTexture.new()
	b.texture = ImageTexture.create_from_image(im)
	b.axis_stretch_horizontal = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	b.axis_stretch_vertical = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	b.content_margin_left = 8
	b.content_margin_right = 8
	b.content_margin_top = 8
	b.content_margin_bottom = 6
	return b


var _edge: ImageTexture = null


func _draw() -> void:
	if _edge == null:
		_edge = HudTextures.texture(HudTextures.grass_edge(), 2)
	draw_rect(Rect2(0, 0, size.x, 4), Color("#2f6a27"))
	draw_texture_rect(_edge, Rect2(0, -16, size.x, 16), true)


func _chip(text: String, tip: String) -> Button:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 11)
	for st: String in ["normal", "hover", "pressed"]:
		var sb: StyleBoxFlat = hud._box(Color("#1d4a1b") if st == "pressed" else hud._c("panelHi"), hud._c("lineHi") if st != "normal" else hud._c("panelEdge"), 0, 2)
		sb.content_margin_left = 6
		sb.content_margin_right = 6
		b.add_theme_stylebox_override(st, sb)
	return b


# ---- refresh -----------------------------------------------------------------------------------

func refresh() -> void:
	if game == null or game.sim == null:
		return
	_refresh_info()
	_refresh_card()


func _refresh_info() -> void:
	var sim := game.sim
	var key := "%s|%s|%d|%s|%d" % [game.placing, game.selected, game.selected_building, details, sim.tick / 10]
	if key == _info_key:
		return
	_info_key = key
	for c in _info.get_children():
		c.queue_free()
	var has_sel := not game.selected.is_empty() or game.selected_building != -1
	_details_box.visible = details and has_sel and game.placing == ""
	if game.placing != "" and not game.placing.begins_with("order:"):
		_placing_info()
	elif game.selected.size() == 1 and sim.settler(game.selected[0]) != null:
		_settler_info(sim.settler(game.selected[0]))
	elif game.selected.size() > 1:
		_group_info()
	elif game.selected_building != -1 and sim.buildings.has(game.selected_building):
		_building_info(sim.buildings[game.selected_building])
	elif game.selected_animal != -1 and Animals.find(sim, game.selected_animal) != null:
		_animal_info(Animals.find(sim, game.selected_animal))
	else:
		_valley_info()
	if _details_box.visible:
		var t := ""
		if game.selected.size() == 1 and sim.settler(game.selected[0]) != null:
			t = hud._settler_text(sim.settler(game.selected[0]))
		elif game.selected_building != -1 and sim.buildings.has(game.selected_building):
			t = hud._building_text(sim.buildings[game.selected_building])
		elif game.selected.size() > 1:
			t = hud._group_text()
		if _details_text.text != t:
			_details_text.text = t
		hud.detail_actions(_actions)


func _portrait(tex: Texture2D, big_px: float = 4.0) -> PanelContainer:
	var p := PanelContainer.new()
	var sb: StyleBoxFlat = hud._box(Color("#6b4a2e"), Color("#2f6a27"), 0, 4)
	sb.set_border_width_all(3)
	p.add_theme_stylebox_override("panel", sb)
	p.custom_minimum_size = Vector2(112, 112)
	p.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var r := TextureRect.new()
	r.texture = tex
	r.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = Vector2(18, 16) * big_px
	p.add_child(r)
	return p


func _settler_portrait(s: Settler) -> Texture2D:
	var at := AtlasTexture.new()
	at.atlas = SettlerView.people().sheet(s.appearance)
	at.region = Rect2(0, 0, PixelPeople.FW, 16)
	return at


func _building_portrait(type: String) -> Texture2D:
	var art := game.art
	var name := type
	if not art.has(name):
		return null
	return art.sprites[name]["texture"]


func _text_col() -> VBoxContainer:
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 3)
	return v


func _title_row(name: String, pip: String = "", muted: String = "") -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	var n := Label.new()
	n.text = name
	n.add_theme_font_override("font", hud._bold)
	n.add_theme_font_size_override("font_size", 18)
	n.add_theme_color_override("font_color", hud._c("accent"))
	h.add_child(n)
	if pip != "":
		var p := Label.new()
		p.text = " %s " % pip
		p.add_theme_font_size_override("font_size", 12)
		p.add_theme_color_override("font_color", Color("#fffbe8"))
		var sb := StyleBoxFlat.new()
		sb.bg_color = hud._c("line")
		sb.set_content_margin_all(2)
		p.add_theme_stylebox_override("normal", sb)
		h.add_child(p)
	if muted != "":
		h.add_child(_line(muted, hud._c("textDim"), 13))
	return h


func _line(t: String, col: Color, size: int = 13) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_color_override("font_color", col)
	l.add_theme_font_size_override("font_size", size)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


func _bars(items: Array) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 6)
	for it: Array in items:
		var l := Label.new()
		l.text = str(it[0])
		l.add_theme_color_override("font_color", hud._c("textDim"))
		l.add_theme_font_size_override("font_size", 12)
		h.add_child(l)
		var bar := ProgressBar.new()
		bar.show_percentage = false
		bar.custom_minimum_size = Vector2(78, 10)
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		bar.max_value = 1.0
		bar.value = clampf(float(it[1]), 0.0, 1.0)
		var bg := StyleBoxFlat.new()
		bg.bg_color = hud._c("panelHi")
		bg.border_color = hud._c("panelEdge")
		bg.set_border_width_all(1)
		var fg := StyleBoxFlat.new()
		fg.bg_color = Color(str(it[2]))
		bar.add_theme_stylebox_override("background", bg)
		bar.add_theme_stylebox_override("fill", fg)
		h.add_child(bar)
	return h


func _see_more(on_press: Callable) -> Button:
	var b: Button = hud._button("See more (%s)" % game.settings.bindings.label("seeMore"), on_press, "Everything about the selection, beside it in the panel")
	b.add_theme_font_size_override("font_size", 12)
	b.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	return b


func _toggle_details() -> void:
	details = not details
	_info_key = ""
	refresh()


func _settler_info(s: Settler) -> void:
	_info.add_child(_portrait(_settler_portrait(s)))
	var v := _text_col()
	var sim := game.sim
	if s.ruler:
		v.add_child(_title_row(s.name, "You", "Ruler of %s" % game.world_name))
		v.add_child(_line(_plain(hud._describe(s)), hud._c("text")))
		v.add_child(_bars([["Fed", s.hunger / 100.0, "#e0844a"], ["Rested", s.energy / 100.0, "#6fa8dc"]]))
		v.add_child(_line("Royal presence: everyone within 8 tiles works 20% faster.", hud._c("textDim"), 12))
		var wait := sim.rally_ready_at - sim.tick
		v.add_child(_line("Rally is ready (%s): nearby people work 30%% faster for an hour." % game.settings.bindings.label("rally") if wait <= 0 else "Rally ready again in %d min." % ceili(wait / 600.0), hud._c("textDim"), 12))
	else:
		var job := "Child" if s.life_stage == "child" else Roles.job_name(s.job)
		var area := sim.area(s.area_id)
		v.add_child(_title_row(s.name, "", job + (" · %s" % area.name if area != null else "") + (" · holding" if s.hold else "")))
		if not s.training.is_empty():
			v.add_child(_line("Training as %s — %d%%" % [Roles.job_name(str(s.training["role"])), floori(float(s.training["progress"]) / float(Content.get_value("jobs", "ROLE_TRAIN_TICKS")) * 100)], hud._c("text")))
		var idle := s.task == null and s.idle_reason != ""
		v.add_child(_line(("! " + s.idle_reason) if idle else _plain(hud._describe(s)), Color("#ffc890") if idle else hud._c("text")))
		v.add_child(_bars([["Health", s.hp / 100.0, "#5ecb4a"], ["Fed", s.hunger / 100.0, "#e0844a"], ["Rested", s.energy / 100.0, "#6fa8dc"]]))
		var bed := "none"
		if s.home_id != -1 and sim.buildings.has(s.home_id):
			bed = str((sim.buildings[s.home_id] as Building).def()["name"])
		var carry := "%d %s · " % [s.carry_amount, str(Defs.resource(s.carry_res)["name"]).to_lower()] if s.carrying() else ""
		v.add_child(_line("%sBed: %s" % [carry, bed], hud._c("textDim"), 12))
	_info.add_child(v)
	_info.add_child(_see_more(_toggle_details))


func _group_info() -> void:
	var sim := game.sim
	var v := _text_col()
	var idle := 0
	for id: int in game.selected:
		var s := sim.settler(id)
		if s != null and s.task == null:
			idle += 1
	v.add_child(_title_row("%d selected" % game.selected.size(), "", "%d idle" % idle if idle > 0 else "all busy"))
	var grid := GridContainer.new()
	grid.columns = 12
	for id: int in game.selected.slice(0, 24):
		var s := sim.settler(id)
		if s == null:
			continue
		var b := TextureButton.new()
		b.texture_normal = _settler_portrait(s)
		b.ignore_texture_size = true
		b.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
		b.custom_minimum_size = Vector2(36, 32)
		b.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		b.tooltip_text = "%s: %s" % [s.name, s.idle_reason if s.task == null else _plain(hud._describe(s))]
		var sid := s.id
		b.pressed.connect(func() -> void:
			game.selected = [sid]
			hud.refresh_now())
		grid.add_child(b)
	v.add_child(grid)
	_info.add_child(v)
	_info.add_child(_see_more(_toggle_details))


func _building_info(b: Building) -> void:
	var sim := game.sim
	_info.add_child(_portrait(_building_portrait(b.type), 1.0))
	var v := _text_col()
	var levels := Levels.levels_of(b)
	var pip := "Level %d/%d" % [b.level, levels.size()] if b.built and not levels.is_empty() else ""
	v.add_child(_title_row(Levels.level_name(b) if b.built else str(b.def()["name"]), pip))
	v.add_child(_line(_headline(b), hud._c("text")))
	if not b.built:
		v.add_child(_bars([["Built", b.progress / maxf(1.0, BuildingOps.work_of(b)), "#8fd18a"]]))
	elif b.is_storage():
		v.add_child(_bars([["Stored", float(sim.storage_used(b)) / maxf(1.0, b.storage_capacity()), "#8fd18a"]]))
		v.get_child(v.get_child_count() - 1).add_child(_line("%d/%d" % [sim.storage_used(b), b.storage_capacity()], hud._c("textDim"), 12))
	if not b.upgrade.is_empty():
		var nl: Dictionary = levels[int(b.upgrade["to"]) - 1]
		v.add_child(_bars([["Upgrading", float(b.upgrade["progress"]) / maxf(1.0, float(nl["time"])), "#ecd27e"]]))
	var max_w: Variant = b.stat("maxWorkers")
	if b.built and (not b.workshop.is_empty() or max_w != null):
		var names: PackedStringArray = []
		for id: int in b.workers:
			var w := sim.settler(id)
			if w != null:
				names.append(w.name)
		v.add_child(_line("Workers %d/%d%s" % [names.size(), int(max_w) if max_w != null else 1, ": " + ", ".join(names) if not names.is_empty() else ""], hud._c("textDim"), 12))
	_info.add_child(v)
	_info.add_child(_see_more(_toggle_details))


func _headline(b: Building) -> String:
	if not b.built:
		var cost := BuildingOps.cost_of(b)
		var parts: PackedStringArray = []
		for r: String in cost:
			parts.append("%s %d/%d" % [str(Defs.resource(r)["name"]).to_lower(), int(b.delivered.get(r, 0)), int(cost[r])])
		return "Being built" + (" — materials: " + ", ".join(parts) if not parts.is_empty() else "")
	if not b.workshop.is_empty():
		return str(b.workshop.get("status", "")) if str(b.workshop.get("status", "")) != "" else "Workshop"
	if b.is_field():
		return str(b.field["state"]).capitalize()
	if not b.orchard.is_empty():
		return Orchards.status(game.sim, b)
	var beds := b.beds()
	if beds > 0:
		var n := 0
		for s in game.sim.settlers:
			if s.home_id == b.id:
				n += 1
		return "%d/%d %s taken" % [n, beds, "beds" if b.is_permanent_home() else "bunks"]
	return str(b.def().get("description", ""))


func _valley_info() -> void:
	var sim := game.sim
	var v := _text_col()
	var ms: Dictionary = Content.get_value("progression", "MILESTONES")
	var cur: String = str((ms.get(Progression.current(sim), {}) as Dictionary).get("name", "Camp"))
	var idle := find_list("idle").size()
	v.add_child(_title_row(game.world_name if game.world_name != "" else "Your valley", "", "%s · %d people · %d idle" % [cur, sim.settlers.size(), idle]))
	var nid := Progression.next_milestone(sim)
	if nid != "":
		var nm: Dictionary = ms[nid]
		v.add_child(_line("Next: %s" % nm["name"], hud._c("text")))
		# Two columns of checklist rows, as the browser's .con-reqs.
		var reqs: Array = nm.get("requirements", [])
		var grid := GridContainer.new()
		grid.columns = 2
		grid.add_theme_constant_override("h_separation", 10)
		grid.add_theme_constant_override("v_separation", 1)
		for req: Dictionary in reqs.slice(0, 4):
			var row := hud.req_row(Progression.requirement_progress(sim, req), 13)
			row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			grid.add_child(row)
		v.add_child(grid)
	else:
		v.add_child(_line("Every milestone reached. Keep building.", hud._c("textDim")))
	var ruler := sim.ruler()
	v.add_child(_line("Select a settler or building to see it here. Right-click gives orders.%s" % (" Press %s to find %s." % [game.settings.bindings.label("findRuler"), ruler.name] if ruler != null else ""), hud._c("textDim"), 12))
	_info.add_child(v)
	_info.add_child(_see_more(func() -> void: hud.toggle_goals()))


func _animal_info(a: Animal) -> void:
	var name := "animal_%s_0" % a.species
	_info.add_child(_portrait(game.art.sprites[name]["texture"] if game.art.has(name) else null, 1.0))
	var v := _text_col()
	var lines := _plain(hud._animal_text(a)).split("
")
	v.add_child(_title_row(lines[0]))
	var d := a.def()
	v.add_child(_bars([["Health", a.health() / maxf(1.0, float(d.get("hp", 1))), "#5ecb4a"]]))
	for i in range(1, lines.size()):
		if lines[i] != "":
			v.add_child(_line(lines[i], hud._c("textDim"), 12))
	_info.add_child(v)


func _placing_info() -> void:
	var v := _text_col()
	var text := _plain(hud._placing_text())
	var lines := text.split("\n")
	v.add_child(_title_row(lines[0] if not lines.is_empty() else "Placing"))
	for i in range(1, lines.size()):
		v.add_child(_line(lines[i], hud._c("textDim"), 13))
	if Defs.is_building(game.placing):
		_info.add_child(_portrait(_building_portrait(game.placing), 1.0))
	_info.add_child(v)


static func _plain(bb: String) -> String:
	var re := RegEx.create_from_string("\\[/?[a-z]+(=[^\\]]*)?\\]")
	return re.sub(bb, "", true)


# ---- finding things ------------------------------------------------------------------------------

## The browser's findList: idle people, waiting buildings, construction sites, or the camp.
func find_list(kind: String) -> Array[Dictionary]:
	var sim := game.sim
	var out: Array[Dictionary] = []
	match kind:
		"idle":
			for s in sim.settlers:
				if (s.task == null or s.task.kind == Task.WANDER) and s.idle_reason != "" and s.idle_reason != "Stores are well stocked":
					out.append({"x": floori(s.x), "y": floori(s.y), "w": 1, "h": 1, "settlerId": s.id})
		"waiting":
			var re := RegEx.create_from_string("Needs|Waiting|No worker|full|turned off")
			for b: Building in sim.buildings.values():
				var short := false
				if not b.built and not b.is_field():
					var cost := BuildingOps.cost_of(b)
					for r: String in cost:
						if int(b.delivered.get(r, 0)) < int(cost[r]):
							short = true
				if (b.built and not b.workshop.is_empty() and re.search(str(b.workshop.get("status", ""))) != null) or short:
					out.append({"x": b.x, "y": b.y, "w": b.w, "h": b.h, "buildingId": b.id})
		"sites":
			for b: Building in sim.buildings.values():
				if not b.built and not b.is_field():
					out.append({"x": b.x, "y": b.y, "w": b.w, "h": b.h, "buildingId": b.id})
		"home":
			var camp := BuildingOps.camp_of(sim)
			if camp != null:
				out.append({"x": camp.x, "y": camp.y, "w": camp.w, "h": camp.h, "buildingId": camp.id})
	return out


func find_next(kind: String) -> void:
	var list := find_list(kind)
	if list.is_empty():
		hud.toast({"idle": "Nobody is idle.", "waiting": "Nothing is waiting for resources.", "sites": "No construction under way.", "home": "No camp found."}[kind], "info")
		return
	var i := (int(_find_cursor.get(kind, -1)) + 1) % list.size()
	_find_cursor[kind] = i
	game.focus_target(list[i])
	hud.refresh_now()


# ---- the command card ----------------------------------------------------------------------------

func _cmd(label: String, icon: String, action: String, tip: String, run: Callable, extra: Dictionary = {}) -> Dictionary:
	var d := {"label": label, "icon": icon, "action": action, "tip": tip, "run": run, "on": false, "disabled": false, "badge": ""}
	d.merge(extra, true)
	return d


func _commands() -> Array:
	var sim := game.sim
	var slots: Array = []
	slots.resize(12)
	var back_run := func() -> void:
		menu = "" if menu == "build" else "build"
		_card_key = ""
		refresh()
	if game.placing != "":
		slots[BACK_SLOT] = _cmd("Done" if not game.placing.begins_with("order:") else "Cancel", "ui_star", "cancel", "Stop placing (right-click does the same)", func() -> void:
			game.cancel_placing()
			hud.refresh_now())
		return slots
	if menu == "train":
		var people := _trainable()
		var hall := Roles.hall_for(sim, sim.settler(people[0])) if not people.is_empty() and sim.settler(people[0]) != null else null
		var lvl := hall.level if hall != null else 0
		var names: Array = Content.get_value("jobs", "HALL_LEVEL_NAMES")
		var i := 0
		for j: String in Content.get_value("jobs", "JOB_IDS"):
			if i >= 11:
				break
			var need := int(Defs.job(j).get("hallLevel", 1))
			var role := j
			slots[i] = _cmd(Roles.job_name(j), "", "", "[b]Train as %s[/b]\n%s%s" % [Roles.job_name(j), Defs.job(j).get("description", ""), "" if need <= lvl else "\n[color=#ffc890]Needs a %s — upgrade the Town Hall[/color]" % names[mini(need, names.size() - 1)]], func() -> void:
				game.command({"type": "trainRole", "ids": _trainable(), "role": role})
				menu = ""
				hud.refresh_now(), {"disabled": need > lvl or people.is_empty(), "grid": i})
			i += 1
		slots[BACK_SLOT] = _cmd("Back", "", "cancel", "Close the Train menu.", func() -> void:
			menu = ""
			hud.refresh_now())
		return slots
	if menu == "build":
		var order: Array = Content.get_value("buildings", "CATEGORY_ORDER")
		var info: Dictionary = Content.get_value("buildings", "CATEGORY_INFO")
		for i in order.size():
			var cat: String = order[i]
			var ids := _category(cat)
			var open := 0
			for id: String in ids:
				if _unlocked(id):
					open += 1
			slots[i] = _cmd(str(info[cat]["name"]), ids[0] if not ids.is_empty() else "", "", "[b]%s[/b]\n%s\n%s" % [info[cat]["name"], info[cat]["description"], "%d of %d available" % [open, ids.size()] if not ids.is_empty() else "Nothing here yet"], func() -> void:
				menu = cat
				_card_key = ""
				refresh(), {"disabled": ids.is_empty(), "badge": str(open) if open > 0 else "", "grid": i})
		slots[BACK_SLOT] = _cmd("Back", "", "cancel", "Close the build menu.", back_run)
		return slots
	if menu != "":
		var i := 0
		var items := _category(menu)
		items.sort_custom(func(a: String, b: String) -> bool: return _unlocked(a) and not _unlocked(b))
		for id: String in items:
			if i >= 11:
				break
			var d := Defs.building(id)
			var ok := _unlocked(id)
			var cost := Inv.format(Defs.cost(id))
			var type := id
			slots[i] = _cmd(str(d["name"]), id, "", "[b]%s[/b]\n%s\nCost: %s%s" % [d["name"], d.get("description", ""), cost if cost != "" else "free", "" if ok else "\n[color=#ffc890]Unlocks at %s[/color]" % _unlock_name(d.get("unlock"))], func() -> void:
				menu = ""
				game.start_placing(type)
				hud.refresh_now(), {"disabled": not ok, "grid": i})
			i += 1
		slots[BACK_SLOT] = _cmd("Back", "", "cancel", "Back to the categories.", back_run)
		return slots
	var see_more := _cmd("See more", "ui_star", "seeMore", "Everything about the selection, beside it in the panel.", _toggle_details)
	var deselect := _cmd("Deselect", "", "cancel", "Clear the selection.", func() -> void:
		game.selected.clear()
		game.selected_building = -1
		hud.refresh_now())
	var ruler := sim.ruler()
	if not game.selected.is_empty():
		var one := sim.settler(game.selected[0]) if game.selected.size() == 1 else null
		var people := _trainable()
		var only_ruler := people.is_empty() and one != null and one.ruler
		slots[0] = _cmd("Move", "ui_drop", "move", "[b]Move[/b]\nThen click where to go. Right-clicking the ground does the same at once.", func() -> void: _order("move"), {"on": game.placing == "order:move"})
		slots[1] = _cmd("Stop", "", "stop", "[b]Stop[/b]\nDrop the current task and stand still for a moment, then carry on with their work.", func() -> void: game.command({"type": "stop", "ids": game.selected.duplicate()}))
		var all_hold := true
		for id: int in game.selected:
			var s := sim.settler(id)
			if s != null and not s.hold:
				all_hold = false
		slots[2] = _cmd("Hold", "", "hold", "[b]Hold position[/b]\nStay right here and take no work until you give another order (they still eat and sleep).", func() -> void: game.command({"type": "hold", "ids": game.selected.duplicate()}), {"on": all_hold})
		if only_ruler:
			var wait := sim.rally_ready_at - sim.tick
			slots[3] = _cmd("Rally", "ui_crown", "rally", "[b]Rally the people[/b]\nEveryone within 12 tiles works 30% faster for an hour. Once a day." + ("" if wait <= 0 else "\n[color=#ffc890]Ready again in %d min[/color]" % ceili(wait / 600.0)), func() -> void: game.command({"type": "rally"}), {"disabled": wait > 0})
			slots[4] = _cmd("Build", "tool_hammer", "build", "[b]Build[/b]\nChoose a category, then a building.", _open_build)
		else:
			slots[3] = _cmd("Attack", "tool_bow", "attack", "[b]Attack (hunt)[/b]\nThen click a wild animal: they hunt it with what their lodge gives them. Right-clicking an animal does the same.", func() -> void: _order("attack"), {"on": game.placing == "order:attack", "disabled": people.is_empty()})
			slots[4] = _cmd("Gather", "tool_axe", "harvest", "[b]Gather[/b]\nThen click a tree, rock or bush: they harvest it and the ones around it.", func() -> void: _order("gather"), {"on": game.placing == "order:gather", "disabled": people.is_empty()})
			slots[5] = _cmd("Build", "tool_hammer", "build", "[b]Build[/b]\nChoose a category, then a building. Selected people can then be sent to build it.", _open_build)
			var carrying := false
			for id: int in game.selected:
				var s := sim.settler(id)
				if s != null and s.carrying():
					carrying = true
			slots[6] = _cmd("Return", "ui_storage", "returnGoods", "[b]Return goods[/b]\nCarry what they hold to the nearest store." + ("" if carrying else "\n[color=#ffc890]Nobody selected is carrying anything[/color]"), func() -> void: game.command({"type": "returnGoods", "ids": game.selected.duplicate()}), {"disabled": not carrying})
			slots[7] = _cmd("Train", "ui_star", "trainRole", "[b]Train a new main job[/b]\nChoose a role: they walk to the Town Hall and learn it.", func() -> void:
				menu = "train"
				_card_key = ""
				refresh(), {"disabled": people.is_empty()})
			slots[8] = _cmd("Survey", "tool_pick", "survey", "[b]Survey for ore[/b]\nThen click rocky ground or a hill face: they survey the 16×16 area around it.", func() -> void: game.start_placing("survey"), {"on": game.placing == "survey", "disabled": people.is_empty()})
			var learning: Array[int] = []
			for id: int in people:
				var s := sim.settler(id)
				if s != null and not s.training.is_empty():
					learning.append(id)
			if not learning.is_empty():
				slots[9] = _cmd("No train", "", "", "[b]Stop training[/b]\nThey keep their current main job.", func() -> void:
					for id: int in learning:
						game.command({"type": "cancelRoleTraining", "settlerId": id}))
			elif one != null and one.home_id != -1:
				var hid := one.home_id
				slots[9] = _cmd("Home", "ui_house", "", "[b]Show home[/b]", func() -> void:
					var h: Building = sim.buildings.get(hid)
					if h != null:
						game.focus_target({"x": h.x, "y": h.y, "w": h.w, "h": h.h, "buildingId": h.id})
					hud.refresh_now())
		slots[10] = see_more
		slots[BACK_SLOT] = deselect
		return slots
	if game.selected_building != -1 and sim.buildings.has(game.selected_building):
		var b: Building = sim.buildings[game.selected_building]
		var next := Levels.next_level(b) if b.built else {}
		if not next.is_empty():
			var problem := Levels.upgrade_problem(sim, b) if b.upgrade.is_empty() else ""
			slots[0] = _cmd("Upgrading" if not b.upgrade.is_empty() else "Upgrade", "ui_star", "", "[b]Upgrade to %s[/b]\n%s\nCost: %s%s" % [next["name"], " · ".join(PackedStringArray(next.get("perks", []) as Array)), Inv.format(Inv.from_json(next.get("cost", {}))), "\n[color=#ffc890]%s[/color]" % problem if problem != "" else ""], func() -> void: game.command({"type": "upgradeBuilding", "buildingId": b.id}), {"disabled": not b.upgrade.is_empty() or problem != "", "on": not b.upgrade.is_empty(), "key": KEY_U})
		if not b.upgrade.is_empty():
			slots[1] = _cmd("Cancel", "", "", "[b]Cancel the upgrade[/b]\nEverything paid is returned to the stores.", func() -> void: game.command({"type": "cancelUpgrade", "buildingId": b.id}), {"key": KEY_N})
		if not b.workshop.is_empty():
			var paused := bool(b.workshop.get("paused", false))
			slots[2] = _cmd("Resume" if paused else "Pause", "", "", "[b]%s work[/b]" % ("Resume" if paused else "Pause"), func() -> void: game.command({"type": "toggleWorkshop", "buildingId": b.id}), {"key": KEY_P})
		slots[3] = see_more
		slots[10] = deselect
		if not (b.built and bool(b.def().get("permanent", false))):
			slots[BACK_SLOT] = _cmd("Demolish" if b.built else "Cancel", "", "demolish", "[b]%s[/b]\n%s" % ["Demolish" if b.built else "Cancel construction", "Pull it down. Stored goods are moved out first." if b.built else "Delivered materials go back to storage."], func() -> void:
				game.command({"type": "remove", "buildingId": b.id})
				game.selected_building = -1
				hud.refresh_now())
		return slots
	# Nothing selected: the valley's tools.
	slots[0] = _cmd("Build", "tool_hammer", "build", "[b]Build[/b]\nChoose a category, then a building. Construction waits until haulers bring the materials.", _open_build)
	slots[1] = _cmd("Harvest", "tool_axe", "harvest", "[b]Mark for harvest[/b]\nDrag over trees, rocks and bushes to mark them. Gatherers and labourers collect them.", func() -> void: game.start_placing("mark"), {"on": game.placing == "mark"})
	slots[2] = _cmd("Unmark", "", "unmark", "[b]Remove harvest marks[/b]\nDrag to take marks off.", func() -> void: game.start_placing("unmark"), {"on": game.placing == "unmark"})
	slots[3] = _cmd("Areas", "ui_basket", "areas", "[b]Work areas[/b]\nDraw woodlots, farm areas, quarries and building areas, then assign workers.", func() -> void: hud.toggle_areas())
	var idle_n := find_list("idle").size()
	slots[4] = _cmd("Next idle", "ui_idle", "nextIdle", "[b]Next idle settler[/b]\nJump to someone with nothing to do.", func() -> void: find_next("idle"), {"badge": str(idle_n) if idle_n > 0 else ""})
	slots[5] = _cmd("Select all", "ui_people", "selectAll", "[b]Select every settler[/b]", func() -> void:
		game.selected.clear()
		for s in sim.settlers:
			game.selected.append(s.id)
		hud.refresh_now())
	var sites_n := find_list("sites").size()
	slots[6] = _cmd("Sites", "ui_warn", "", "[b]Construction sites[/b]\nJump to the next building under construction.", func() -> void: find_next("sites"), {"badge": str(sites_n) if sites_n > 0 else ""})
	var wait_n := find_list("waiting").size()
	slots[7] = _cmd("Waiting", "ui_hungry", "", "[b]Waiting buildings[/b]\nBuildings short of materials or workers.", func() -> void: find_next("waiting"), {"badge": str(wait_n) if wait_n > 0 else ""})
	slots[8] = _cmd("Today", "ui_sun", "today", "[b]Valley today[/b]\nWhat needs attention and what to do next.", func() -> void: game.open_today())
	slots[10] = _cmd("You" if ruler != null else "Throne", "ui_crown", "findRuler", ("[b]%s[/b]\nSelect yourself and jump to where you stand." % ruler.name) if ruler != null else "[b]Take the throne[/b]", func() -> void: find_ruler())
	return slots


func find_ruler() -> void:
	var ruler := game.sim.ruler()
	if ruler == null:
		hud.toast("This valley has no ruler yet.", "info")
		return
	game.selected = [ruler.id]
	game.selected_building = -1
	game.camera.target_pos = Vector2(ruler.x, ruler.y) * WorldView.TILE_PX
	hud.refresh_now()


func _open_build() -> void:
	menu = "build"
	_card_key = ""
	refresh()


func _order(kind: String) -> void:
	game.start_placing("order:" + kind)
	hud.refresh_now()


func _trainable() -> Array[int]:
	var out: Array[int] = []
	for id: int in game.selected:
		var s := game.sim.settler(id)
		if s != null and s.life_stage == "adult" and not s.ruler:
			out.append(id)
	return out


func _category(cat: String) -> Array[String]:
	var out: Array[String] = []
	for id: String in Content.get_value("buildings", "BUILDING_IDS"):
		var d := Defs.building(id)
		if bool(d.get("buildable", false)) and str(d.get("category", "")) == cat:
			out.append(id)
	return out


func _unlocked(id: String) -> bool:
	return BuildingOps.is_unlocked(game.sim, Defs.building(id).get("unlock"))


func _unlock_name(unlock: Variant) -> String:
	var ms: Dictionary = Content.get_value("progression", "MILESTONES")
	return str((ms.get(str(unlock), {}) as Dictionary).get("name", str(unlock).capitalize()))


func _refresh_card() -> void:
	var sim := game.sim
	_slots = _commands()
	var key := "%s|%s|%s|%d|%s|%d" % [menu, game.placing, game.selected, game.selected_building, sim.reached, sim.tick / 30]
	for c: Variant in _slots:
		if c != null:
			key += "|%s%s%s%s" % [c["label"], c["on"], c["disabled"], c["badge"]]
	if key == _card_key:
		return
	_card_key = key
	var info: Dictionary = Content.get_value("buildings", "CATEGORY_INFO")
	_card_head.text = "Build" if menu == "build" else ("Train a role" if menu == "train" else (str(info[menu]["name"]) if menu != "" else "Commands"))
	for c in _grid.get_children():
		c.queue_free()
	for i in 12:
		_grid.add_child(_slot_button(_slots[i], i))


func _slot_button(c: Variant, i: int) -> Control:
	var b := Button.new()
	b.custom_minimum_size = Vector2(60, 50)
	b.focus_mode = Control.FOCUS_NONE
	b.clip_text = true
	var empty := c == null
	# The browser's .card-btn: wood with a turf edge and a dark-grass drop; empty slots are faint.
	var sb: StyleBoxFlat = hud._box(Color(0.157, 0.094, 0.047, 0.35) if empty else (Color("#7a5e1a") if bool(c["on"]) else Color("#61432a")), Color(0.49, 0.75, 0.31, 0.3) if empty else (hud._c("accent") if bool(c["on"]) else Color("#2f6a27")), 0, 2)
	if not empty:
		sb.shadow_color = Color("#1d4a1b")
		sb.shadow_offset = Vector2(0, 2)
	for st: String in ["normal", "hover", "pressed", "disabled"]:
		var s2 := sb.duplicate() as StyleBoxFlat
		if st == "hover" and not empty:
			s2.border_color = hud._c("lineHi")
			s2.bg_color = Color("#7c5836")
		b.add_theme_stylebox_override(st, s2)
	if empty:
		b.disabled = true
		return b
	var v := VBoxContainer.new()
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	v.add_theme_constant_override("separation", 0)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var icon := TextureRect.new()
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(0, 24)
	icon.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var icon_name := str(c["icon"])
	if icon_name != "" and game.art.has(icon_name):
		icon.texture = game.art.sprites[icon_name]["texture"]
	v.add_child(icon)
	var l := Label.new()
	l.text = str(c["label"])
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 10)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.clip_text = true
	v.add_child(l)
	var disabled := bool(c["disabled"])
	if disabled:
		l.add_theme_color_override("font_color", Color(hud._c("textDim"), 0.5))
		icon.modulate = Color(1, 1, 1, 0.4)
	var hk := _hotkey_label(c, i)
	if hk != "":
		var k := Label.new()
		k.text = hk
		k.add_theme_font_size_override("font_size", 9)
		k.add_theme_color_override("font_color", hud._c("accent"))
		k.position = Vector2(3, 0)
		k.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(k)
	if str(c["badge"]) != "":
		var bd := Label.new()
		bd.text = str(c["badge"])
		bd.add_theme_font_size_override("font_size", 10)
		bd.add_theme_color_override("font_color", Color("#fffbe8"))
		var bs := StyleBoxFlat.new()
		bs.bg_color = Color("#c0443a")
		bs.set_corner_radius_all(6)
		bs.content_margin_left = 3
		bs.content_margin_right = 3
		bd.add_theme_stylebox_override("normal", bs)
		bd.position = Vector2(40, 0)
		bd.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(bd)
	var tip := str(c["tip"])
	var hk_txt := "  [color=#f4cf5a](%s)[/color]" % hk if hk != "" else ""
	b.mouse_entered.connect(func() -> void: _show_tip(tip.replace("[/b]", "[/b]" + hk_txt) if tip.contains("[/b]") else tip + hk_txt))
	b.mouse_exited.connect(func() -> void: _tip.visible = false)
	var run: Callable = c["run"]
	b.pressed.connect(func() -> void:
		if disabled:
			game.audio.play("error")
			return
		game.audio.play("ui")
		_tip.visible = false
		run.call()
		_card_key = ""
		hud.refresh_now())
	return b


func _hotkey_label(c: Dictionary, i: int) -> String:
	if menu != "" and c.has("grid"):
		return KeyBindings.short_name(GRID_KEYS[int(c["grid"])])
	if c.has("key"):
		return KeyBindings.short_name(int(c["key"]))
	var a := str(c["action"])
	if a == "cancel":
		return "Esc"
	return game.settings.bindings.short_label(a) if a != "" and game.settings.bindings.keys.has(a) else ""


func _show_tip(t: String) -> void:
	_tip_text.text = t
	_tip.visible = true
	_tip.reset_size()
	var vp: Vector2 = hud.get_viewport().get_visible_rect().size / hud._root.scale
	_tip.position = Vector2(vp.x - _tip.size.x - 12, vp.y - HEIGHT - _tip.size.y - 8)


## Card hotkeys, Warcraft style: what the card shows answers to its own key first; in the build
## and train menus the grid positions pick. Returns true when the key was used.
func handle_key(k: InputEventKey) -> bool:
	if game.sim == null or k.echo or k.ctrl_pressed or k.alt_pressed or k.meta_pressed:
		return false
	var code := k.physical_keycode if k.physical_keycode != KEY_NONE else k.keycode
	var idx := -1
	if menu != "":
		if code == KEY_ESCAPE:
			idx = BACK_SLOT
		else:
			for i in 12:
				var c: Variant = _slots[i] if i < _slots.size() else null
				if c != null and c.has("grid") and GRID_KEYS[int(c["grid"])] == code:
					idx = i
	if idx < 0:
		var action := game.settings.bindings.action_for(k)
		for i in _slots.size():
			var c: Variant = _slots[i]
			if c == null:
				continue
			if (c.has("key") and int(c["key"]) == code) or (action != "" and str(c["action"]) == action and action != "cancel"):
				idx = i
				break
	if idx < 0:
		return false
	var c: Dictionary = _slots[idx]
	if bool(c["disabled"]):
		game.audio.play("error")
	else:
		game.audio.play("ui")
		(c["run"] as Callable).call()
	_card_key = ""
	hud.refresh_now()
	return true
