class_name Hud
extends CanvasLayer
## The interface: title screen, top bar (stocks, storage, day and season, speed), selection panel,
## command card (build, marks, orders, jobs), toasts and the menu (save points, settings).
## Built in code from the palette. It reads the game's state and calls Game's command helpers;
## it never changes simulation state itself.

const BUILD_LIST: Array[String] = ["house", "familyHome", "storehouse", "field", "path", "bridge",
	"workshop", "mill", "bakery", "granary", "charcoalKiln", "cottage"]
const JOBS: Array[String] = ["laborer", "farmer", "gatherer", "builder", "hauler"]
const STOCKS: Array[String] = ["food", "wood", "stone", "planks", "wheat"]

var game: Game
var _root := Control.new()
var _theme: Theme
var _pal: Dictionary
var _font: FontFile
var _bold: FontFile

var _top := PanelContainer.new()
var _stocks := HBoxContainer.new()
var _clock := Label.new()
var _speed_box := HBoxContainer.new()
var _select_panel := PanelContainer.new()
var _select_text := RichTextLabel.new()
var _card := PanelContainer.new()
var _card_grid := GridContainer.new()
var _card_title := Label.new()
var _toasts := VBoxContainer.new()
var _title := PanelContainer.new()
var _menu := PanelContainer.new()
var _busy := PanelContainer.new()
var _people := PanelContainer.new()
var _people_text := RichTextLabel.new()
var _people_buttons := VBoxContainer.new()
var _people_key := ""
var _busy_label := Label.new()
var _card_mode := ""
var _refresh_timer := 0.0
var _last_card_key := ""
## resource id -> Label showing its count (built once).
var _stock_labels := {}
var _storage_label: Label


func _ready() -> void:
	_pal = JSON.parse_string(FileAccess.get_file_as_string("res://art/palette.json"))
	_font = load("res://fonts/AtkinsonHyperlegible-Regular.woff2")
	_bold = load("res://fonts/AtkinsonHyperlegible-Bold.woff2")
	_theme = _make_theme()
	_root.theme = _theme
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_apply_scale()
	_build_top()
	_build_select()
	_build_card()
	_toasts.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toasts.position = Vector2(-260, 64)
	_toasts.custom_minimum_size = Vector2(520, 0)
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_toasts)
	_build_people()
	for p: Control in [_title, _menu, _busy]:
		p.set_anchors_preset(Control.PRESET_CENTER)
		p.visible = false
		_root.add_child(p)
	_busy.add_child(_busy_label)


func _apply_scale() -> void:
	var s := game.settings.ui_scale if game != null else 1.0
	_root.scale = Vector2(s, s)
	_root.size = get_viewport().get_visible_rect().size / s


# ---- theme -----------------------------------------------------------------------------------

func _c(key: String) -> Color:
	return Color(str(_pal["ui"][key]))


func _box(bg: Color, border: Color, radius: int = 8, pad: int = 8) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = border
	b.set_border_width_all(1)
	b.set_corner_radius_all(radius)
	b.set_content_margin_all(pad)
	b.shadow_color = Color(0, 0, 0, 0.25)
	b.shadow_size = 4
	b.anti_aliasing = true
	return b


func _make_theme() -> Theme:
	var t := Theme.new()
	t.default_font = _font
	t.default_font_size = 17
	var panel := _c("panel")
	panel.a = 0.93
	t.set_stylebox("panel", "PanelContainer", _box(panel, Color(_c("line"), 0.35), 10, 10))
	t.set_stylebox("normal", "Button", _box(_c("panelHi"), Color(_c("line"), 0.3), 7, 7))
	t.set_stylebox("hover", "Button", _box(_c("panelHi").lightened(0.12), Color(_c("line"), 0.7), 7, 7))
	t.set_stylebox("pressed", "Button", _box(_c("panelHi").darkened(0.2), _c("accent"), 7, 7))
	t.set_stylebox("focus", "Button", _box(Color(0, 0, 0, 0), _c("accent"), 7, 7))
	t.set_stylebox("disabled", "Button", _box(Color(_c("panelHi"), 0.5), Color(_c("line"), 0.15), 7, 7))
	t.set_color("font_color", "Button", _c("text"))
	t.set_color("font_hover_color", "Button", _c("accent"))
	t.set_color("font_disabled_color", "Button", Color(_c("textDim"), 0.6))
	t.set_color("font_color", "Label", _c("text"))
	t.set_color("default_color", "RichTextLabel", _c("text"))
	t.set_stylebox("normal", "LineEdit", _box(_c("panelHi").darkened(0.25), Color(_c("line"), 0.4), 6, 6))
	t.set_color("font_color", "LineEdit", _c("text"))
	t.set_font("bold_font", "RichTextLabel", _bold)
	return t


func _button(text: String, on_press: Callable, tip: String = "") -> Button:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.pressed.connect(on_press)
	b.focus_mode = Control.FOCUS_NONE
	return b


func _icon(res: String, size: float = 28.0) -> TextureRect:
	var r := TextureRect.new()
	var sp: Dictionary = game.art.sprites.get("icon_" + res, {})
	if not sp.is_empty():
		r.texture = sp["texture"]
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = Vector2(size, size)
	return r


# ---- layout ------------------------------------------------------------------------------------

func _build_top() -> void:
	_top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_top.offset_left = 8
	_top.offset_right = -8
	_top.offset_top = 8
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	_top.add_child(row)
	_stocks.add_theme_constant_override("separation", 14)
	row.add_child(_stocks)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	row.add_child(_clock)
	for sp: Array in [["⏸", 0], ["1×", 1], ["2×", 2], ["4×", 4]]:
		var v: int = sp[1]
		_speed_box.add_child(_button(sp[0], func() -> void:
			if v == 0:
				game.paused = not game.paused
			else:
				game.paused = false
				game.speed = v
			refresh_now(), "Pause (Space)" if v == 0 else "Speed %d× (%s)" % [v, {1: "1", 2: "2", 4: "3"}[v]]))
	row.add_child(_speed_box)
	row.add_child(_button("People", toggle_people, "Visitors, travellers, households and children (F2)"))
	row.add_child(_button("Save", func() -> void: game.save_now(), "Save now (F5)"))
	row.add_child(_button("Menu", toggle_menu, "Menu (Esc)"))
	_top.visible = false
	_root.add_child(_top)


func _build_select() -> void:
	_select_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_select_panel.offset_left = 8
	_select_panel.offset_bottom = -8
	_select_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_select_panel.custom_minimum_size = Vector2(380, 150)
	_select_text.bbcode_enabled = true
	_select_text.fit_content = true
	_select_text.scroll_active = false
	_select_text.custom_minimum_size = Vector2(360, 0)
	_select_panel.add_child(_select_text)
	_select_panel.visible = false
	_root.add_child(_select_panel)


func _build_card() -> void:
	_card.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_card.offset_right = -8
	_card.offset_bottom = -8
	_card.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_card.grow_vertical = Control.GROW_DIRECTION_BEGIN
	var v := VBoxContainer.new()
	_card.add_child(v)
	_card_title.add_theme_color_override("font_color", _c("textDim"))
	v.add_child(_card_title)
	_card_grid.columns = 3
	_card_grid.add_theme_constant_override("h_separation", 6)
	_card_grid.add_theme_constant_override("v_separation", 6)
	v.add_child(_card_grid)
	_card.visible = false
	_root.add_child(_card)


# ---- people window ------------------------------------------------------------------------------

func _build_people() -> void:
	_people.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_people.offset_right = -8
	_people.offset_top = 64
	_people.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(430, 0)
	_people.add_child(v)
	_people_text.bbcode_enabled = true
	_people_text.fit_content = true
	_people_text.scroll_active = false
	v.add_child(_people_text)
	v.add_child(_people_buttons)
	_people.visible = false
	_root.add_child(_people)


func toggle_people() -> void:
	_people.visible = not _people.visible
	_people_key = ""
	refresh_now()


## The People window: what growth is waiting on, the visitor, travellers on the way, households.
func _refresh_people() -> void:
	if not _people.visible:
		return
	var sim := game.sim
	var lines: PackedStringArray = ["[b]People[/b]"]
	var adults := 0
	var kids: PackedStringArray = []
	for s in sim.settlers:
		if s.life_stage == "adult":
			adults += 1
		else:
			var days := maxi(1, ceili(float(int(Content.get_value("kingdomBalance", "CHILD_ADULT_TICKS")) - s.age_ticks) / Defs.DAY_TICKS))
			kids.append("%s (grows up in %d day%s)" % [s.name, days, "" if days == 1 else "s"])
	var home_beds := 0
	var used := 0
	for b: Building in sim.buildings.values():
		if b.is_permanent_home():
			home_beds += b.beds()
			for s in sim.settlers:
				if s.home_id == b.id:
					used += 1
	lines.append("%d adults%s · beds in homes %d/%d" % [adults, ", %d children" % kids.size() if not kids.is_empty() else "", used, home_beds])
	# The visitor gets their own line below, so the status line is only shown without one.
	if sim.population_status != "" and sim.offer.is_empty():
		lines.append("[color=%s]%s[/color]" % [_c("textDim").to_html(), sim.population_status])
	if not kids.is_empty():
		lines.append("Children: " + ", ".join(kids))
	# Buttons are rebuilt only when what they act on changes.
	var key := "%s|%s|%s|%s|%s" % [sim.offer.get("id", -1), sim.recruits.size(), sim.households.size(), game.selected.size(), sim.growth_mode]
	for h: Dictionary in sim.households:
		key += "|%s%s" % [h["pending"] != null, sim.tick >= int(h["cooldownUntil"])]
		var a := sim.settler(int(h["adults"][0]))
		var b := sim.settler(int(h["adults"][1]))
		var line := "Household: %s and %s" % [a.name if a else "?", b.name if b else "?"]
		if h["pending"] != null:
			var p: Dictionary = h["pending"]
			var stable := int(Content.get_value("kingdomBalance", "CHILD_STABLE_TICKS"))
			line += " — expecting (%d%%)" % roundi(float(p["stableTicks"]) / stable * 100)
			if str(p["blocked"]) != "":
				line += " [color=%s]paused: %s[/color]" % [_c("accent").to_html(), p["blocked"]]
		elif sim.tick < int(h["cooldownUntil"]):
			line += " — resting %s" % People._days(int(h["cooldownUntil"]) - sim.tick)
		lines.append(line)
	for r: Dictionary in sim.recruits:
		lines.append("%s is on the way%s" % [r["name"], " — " + str(r["blocked"]) if str(r["blocked"]) != "" else ""])
	if not sim.offer.is_empty():
		var needs := People.recruit_needs(sim, int(sim.settlements[0]["id"]))
		lines.append("[b]A visitor, %s,[/b] would settle for %d food.%s" % [sim.offer["name"], int(Content.get_value("kingdomBalance", "RECRUIT_FOOD")),
			" Still needed: %s." % ", ".join(needs) if not needs.is_empty() else ""])
	_people_text.text = "\n".join(lines)
	if key == _people_key:
		return
	_people_key = key
	for c in _people_buttons.get_children():
		c.queue_free()
	if sim.growth_mode != "deliberate":
		_people_buttons.add_child(_button("Adopt deliberate growth", func() -> void:
			game.command({"type": "adoptDeliberateGrowth"})
			_people_key = ""
			refresh_now(), "Newcomers then come only as welcomed travellers and from households"))
	if not sim.offer.is_empty():
		var offer_id: int = sim.offer["id"]
		_people_buttons.add_child(_button("Welcome %s (%d food)" % [sim.offer["name"], int(Content.get_value("kingdomBalance", "RECRUIT_FOOD"))], func() -> void:
			game.command({"type": "acceptRecruit", "offerId": offer_id, "settlementId": sim.settlements[0]["id"]})
			_people_key = ""
			refresh_now()))
	for r: Dictionary in sim.recruits:
		var rid: int = r["id"]
		if r["state"] == "travelling":
			_people_buttons.add_child(_button("Call off %s (food back)" % r["name"], func() -> void:
				game.command({"type": "cancelRecruit", "recruitId": rid})
				_people_key = ""
				refresh_now()))
	for h: Dictionary in sim.households:
		var hid: int = h["id"]
		var a := sim.settler(int(h["adults"][0]))
		var names := "%s's household" % (a.name if a else "a")
		if h["pending"] == null:
			_people_buttons.add_child(_button("Ask for a child — %s" % names, func() -> void:
				game.command({"type": "requestChild", "householdId": hid})
				_people_key = ""
				refresh_now(), "Holds a bed; the baby arrives after two steady days of food and shelter"))
		else:
			_people_buttons.add_child(_button("Wait — %s" % names, func() -> void:
				game.command({"type": "cancelChildRequest", "householdId": hid})
				_people_key = ""
				refresh_now()))
	if game.selected.size() == 2:
		_people_buttons.add_child(_button("Start a household with the two selected", func() -> void:
			game.command({"type": "formHousehold", "ids": game.selected.duplicate()})
			_people_key = ""
			refresh_now()))
	else:
		var hint := Label.new()
		hint.text = "Select two adults to start a household."
		hint.add_theme_color_override("font_color", _c("textDim"))
		_people_buttons.add_child(hint)


# ---- states ------------------------------------------------------------------------------------

func blocking() -> bool:
	return _title.visible or _menu.visible or _busy.visible


func show_busy(text: String) -> void:
	_busy_label.text = text
	_busy.visible = true
	_title.visible = false
	_menu.visible = false


func show_play() -> void:
	_busy.visible = false
	_title.visible = false
	_menu.visible = false
	_top.visible = true
	_card.visible = true
	refresh_now()


func show_title(message: String = "") -> void:
	_busy.visible = false
	_menu.visible = false
	_top.visible = false
	_card.visible = false
	_select_panel.visible = false
	for c in _title.get_children():
		c.queue_free()
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(460, 0)
	v.add_theme_constant_override("separation", 10)
	_title.add_child(v)
	var h := Label.new()
	h.text = "Little Valley"
	h.add_theme_font_override("font", _bold)
	h.add_theme_font_size_override("font_size", 40)
	h.add_theme_color_override("font_color", _c("accent"))
	h.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(h)
	if message != "":
		var m := Label.new()
		m.text = message
		m.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		m.add_theme_color_override("font_color", _c("problem"))
		v.add_child(m)
	for w: Dictionary in game.store.worlds().slice(0, 4):
		var p: Dictionary = (w["points"] as Array)[0]
		var id: String = w["id"]
		v.add_child(_button("Continue %s — day %d, %d people" % [w["name"], int(p.get("day", 0)), int(p.get("population", 0))], func() -> void: game.load_world(id)))
	var name_edit := LineEdit.new()
	name_edit.placeholder_text = "Name your valley"
	name_edit.text = "Home"
	v.add_child(name_edit)
	var habitat := OptionButton.new()
	var habitats: Dictionary = Content.get_value("habitats", "HABITATS")
	for k: String in habitats:
		habitat.add_item(str(habitats[k]["name"]))
		habitat.set_item_metadata(habitat.item_count - 1, k)
	v.add_child(habitat)
	var seed_edit := LineEdit.new()
	seed_edit.placeholder_text = "Seed (optional)"
	v.add_child(seed_edit)
	v.add_child(_button("Start a new valley", func() -> void:
		var seed_text := seed_edit.text.strip_edges()
		var seed_value := int(seed_text) if seed_text.is_valid_int() else (seed_text.hash() if seed_text != "" else randi() % 2147483647)
		game.new_world(seed_value, str(habitat.get_item_metadata(habitat.selected)), name_edit.text.strip_edges() if name_edit.text.strip_edges() != "" else "Home")))
	var note := Label.new()
	note.text = "Godot preview: farming, gathering, hauling and building. Time stands still while the game is closed."
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.add_theme_color_override("font_color", _c("textDim"))
	note.add_theme_font_size_override("font_size", 14)
	v.add_child(note)
	_title.visible = true
	_center(_title)


func toggle_menu() -> void:
	if _menu.visible:
		_menu.visible = false
		return
	for c in _menu.get_children():
		c.queue_free()
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(420, 0)
	v.add_theme_constant_override("separation", 8)
	_menu.add_child(v)
	v.add_child(_button("Resume", func() -> void: _menu.visible = false))
	var label_edit := LineEdit.new()
	label_edit.placeholder_text = "Name this save point (kept for good)"
	v.add_child(label_edit)
	v.add_child(_button("Save", func() -> void:
		game.save_now(label_edit.text.strip_edges())
		toggle_menu()
		toggle_menu()))
	var head := Label.new()
	head.text = "Save points"
	head.add_theme_color_override("font_color", _c("textDim"))
	v.add_child(head)
	for p: Dictionary in game.store.points(game.world_id):
		var point: String = p["id"]
		var when := Time.get_datetime_string_from_unix_time(int(float(p.get("savedAt", 0)) / 1000.0), true)
		var lbl := str(p.get("label", ""))
		v.add_child(_button("%s  day %d%s" % [when, int(p.get("day", 0)), "  “%s”" % lbl if lbl != "" else ""], func() -> void:
			_menu.visible = false
			game.load_world(game.world_id, point)))
	var set_head := Label.new()
	set_head.text = "Settings"
	set_head.add_theme_color_override("font_color", _c("textDim"))
	v.add_child(set_head)
	v.add_child(_check("Reduced motion", game.settings.reduced_motion, func(on: bool) -> void: game.settings.reduced_motion = on))
	v.add_child(_check("Scroll at the screen edge", game.settings.edge_scroll, func(on: bool) -> void:
		game.settings.edge_scroll = on
		game.camera.edge_scroll = on))
	v.add_child(_check("Fewer effects", game.settings.effects == "low", func(on: bool) -> void: game.settings.effects = "low" if on else "high"))
	var scale_row := HBoxContainer.new()
	var scale_label := Label.new()
	scale_label.text = "Interface size"
	scale_row.add_child(scale_label)
	for sz: float in [0.85, 1.0, 1.25, 1.5]:
		scale_row.add_child(_button("%d%%" % roundi(sz * 100), func() -> void:
			game.settings.ui_scale = sz
			game.settings.save()
			_apply_scale()))
	v.add_child(scale_row)
	v.add_child(_button("Back to the title", func() -> void:
		game.save_now()
		game.sim = null
		show_title()))
	_menu.visible = true
	_center(_menu)


func _check(text: String, on: bool, apply: Callable) -> CheckButton:
	var c := CheckButton.new()
	c.text = text
	c.button_pressed = on
	c.focus_mode = Control.FOCUS_NONE
	c.toggled.connect(func(v: bool) -> void:
		apply.call(v)
		game.settings.save())
	return c


func _center(p: Control) -> void:
	await get_tree().process_frame
	p.position = (_root.size - p.size) / 2.0


# ---- toasts -------------------------------------------------------------------------------------

func toast(text: String, level: String = "info") -> void:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var col := _c("text")
	if level == "warn":
		col = _c("accent")
	elif level == "good":
		col = _c("good")
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_outline_color", _c("panel"))
	l.add_theme_constant_override("outline_size", 6)
	_toasts.add_child(l)
	while _toasts.get_child_count() > 4:
		_toasts.get_child(0).queue_free()
		_toasts.remove_child(_toasts.get_child(0))
	var tw := create_tween()
	tw.tween_interval(3.5 if level != "warn" else 5.5)
	tw.tween_property(l, "modulate:a", 0.0, 0.6)
	tw.tween_callback(l.queue_free)


# ---- per-frame ----------------------------------------------------------------------------------

func refresh(delta: float) -> void:
	_refresh_timer -= delta
	if _refresh_timer <= 0.0:
		refresh_now()


## Rebuilds the top bar, selection panel and command card from the current state. Runs about four
## times a second, and at once after any input.
func refresh_now() -> void:
	_refresh_timer = 0.25
	if game == null or game.sim == null or not _top.visible:
		return
	var sim := game.sim
	_apply_scale()
	# Stocks: chips are built once and only their numbers change.
	if _stock_labels.is_empty():
		for r in STOCKS:
			var chip := HBoxContainer.new()
			chip.add_child(_icon(r))
			var l := Label.new()
			l.tooltip_text = str(Defs.resource(r)["name"])
			chip.add_child(l)
			_stocks.add_child(chip)
			_stock_labels[r] = l
		_storage_label = Label.new()
		_stocks.add_child(_storage_label)
	var totals := sim.totals()
	for r in STOCKS:
		var l: Label = _stock_labels[r]
		_set_text(l, str(int(totals[r])))
		l.get_parent().visible = r != "wheat" or int(totals[r]) > 0
	var cap := sim.total_capacity()
	_set_text(_storage_label, "Storage %d/%d" % [cap.x, cap.y])
	_storage_label.add_theme_color_override("font_color", _c("problem") if cap.x >= cap.y else _c("textDim"))
	var season: Dictionary = sim.season()
	var t := sim.time_of_day() * 24.0
	_clock.text = "%s · Day %d of %s · %02d:%02d%s" % [season["def"]["name"], int(season["day"]), str(season["def"]["name"]).to_lower(), int(t), int(fmod(t, 1.0) * 60.0), "  ⏸" if game.paused else ("  %d×" % game.speed if game.speed > 1 else "")]
	_refresh_selection()
	_refresh_card()
	_refresh_people()


func _refresh_selection() -> void:
	var sim := game.sim
	var text := ""
	if game.selected.size() == 1:
		var s := sim.settler(game.selected[0])
		if s != null:
			text = _settler_text(s)
	elif game.selected.size() > 1:
		var idle := 0
		for id in game.selected:
			var s := sim.settler(id)
			if s != null and s.task == null:
				idle += 1
		text = "[b]%d people selected[/b]\n%d busy, %d idle.\nRight-click: work or walk there · S stop · H hold" % [game.selected.size(), game.selected.size() - idle, idle]
	elif game.selected_building != -1:
		var b: Building = sim.buildings.get(game.selected_building)
		if b != null:
			text = _building_text(b)
	elif game.placing != "":
		text = _placing_text()
	_select_panel.visible = text != ""
	if _select_text.text != text:
		_select_text.text = text


func _set_text(l: Label, t: String) -> void:
	if l.text != t:
		l.text = t


func _settler_text(s: Settler) -> String:
	var job := str(Defs.job(s.job)["name"])
	var lines := ["[b]%s[/b] — %s" % [s.name, job]]
	lines.append(_describe(s))
	lines.append("Hunger %s  ·  Energy %s" % [_bar(s.hunger), _bar(s.energy)])
	if s.carrying():
		lines.append("Carrying %d %s" % [s.carry_amount, str(Defs.resource(s.carry_res)["name"]).to_lower()])
	if s.home_id != -1:
		var h: Building = game.sim.buildings.get(s.home_id)
		if h != null:
			lines.append("Sleeps in the %s" % str(h.def()["name"]).to_lower())
	else:
		lines.append("[color=%s]No bed[/color]" % _c("problem").to_html())
	return "\n".join(lines)


## What a settler is doing, or why they are idle, in plain words.
func _describe(s: Settler) -> String:
	var sim := game.sim
	if s.task == null:
		var reason := s.idle_reason if s.idle_reason != "" else "Looking for something to do"
		return "[color=%s]Idle: %s[/color]" % [_c("accent").to_html(), reason]
	var t := s.task
	match t.kind:
		Task.MOVE:
			return "Walking"
		Task.WANDER:
			return "Strolling" + (" — " + s.idle_reason if s.idle_reason != "" else "")
		Task.GATHER:
			var o := sim.world.obj(t.x, t.y)
			var what := Tiles.object_name[o].to_lower() if o != World.UNKNOWN else "resource"
			var verb: String = {"wood": "Chopping", "stone": "Breaking", "food": "Picking"}.get(Tiles.object_resource[o] if o != World.UNKNOWN else "", "Gathering")
			return "%s the %s" % [verb, what] if t.stage == &"work" else "On the way to the %s" % what
		Task.DELIVER:
			return "Taking %s to storage" % str(Defs.resource(s.carry_res)["name"]).to_lower() if s.carrying() else "Heading to storage"
		Task.HAUL:
			var dst: Building = sim.buildings.get(t.dst)
			var dn := str(dst.def()["name"]).to_lower() if dst != null else "site"
			return "Fetching %d %s for the %s" % [t.amount, t.res, dn] if t.stage == &"toSrc" else "Bringing %d %s to the %s" % [t.amount, t.res, dn]
		Task.BUILD:
			var site: Building = sim.buildings.get(t.site)
			return "Building the %s" % (str(site.def()["name"]).to_lower() if site != null else "site")
		Task.FARM:
			var f: Building = sim.buildings.get(t.field)
			var crop := str(f.field["crop"]) if f != null and f.is_field() else ""
			return {&"till": "Tilling a field", &"plant": "Planting %s" % crop, &"water": "Watering the %s" % crop, &"harvest": "Harvesting %s" % crop}.get(t.action, "Farming")
		Task.EAT:
			return "Going to eat"
		Task.SLEEP:
			return s.rest_note if s.rest_note != "" else "Going to bed"
	return "Busy"


func _bar(v: float) -> String:
	var col := _c("good") if v >= 50 else (_c("accent") if v >= 15 else _c("problem"))
	return "[color=%s]%d[/color]" % [col.to_html(), roundi(v)]


func _building_text(b: Building) -> String:
	var d := b.def()
	var lines := ["[b]%s[/b]" % d["name"]]
	if b.is_field():
		var f := b.field
		lines.append("%s · %s" % [str(f["crop"]).capitalize() if f["crop"] != "" else "Nothing planted", str(f["state"]).capitalize()])
		lines.append("Moisture %d%%" % roundi(float(f["moisture"]) * 100))
		if f["state"] == "growing":
			lines.append("Growing: %d%%" % roundi(float(f["growth"]) / float(Defs.crop(f["crop"])["growTicks"]) * 100))
	elif not b.built:
		var cost := BuildingOps.cost_of(b)
		var parts: PackedStringArray = []
		for r: String in cost:
			parts.append("%s %d/%d" % [r, int(b.delivered.get(r, 0)), int(cost[r])])
		lines.append("Being built — materials: %s" % (", ".join(parts) if not parts.is_empty() else "none needed"))
		lines.append("Work %d%%" % roundi(b.progress / maxf(1.0, BuildingOps.work_of(b)) * 100))
	else:
		lines.append(str(d.get("description", "")))
		if not b.workshop.is_empty():
			var ws := b.workshop
			var r := str(ws.get("recipe", ""))
			lines.append("Making: %s" % (str(Production.recipe(r)["name"]) if r != "" else "nothing"))
			var status := str(ws.get("status", ""))
			if status != "":
				var col := _c("text") if status.begins_with("Ready") or status.contains("%") or status.begins_with("Worker") else _c("accent")
				lines.append("[color=%s]%s[/color]" % [col.to_html(), status])
			var names: PackedStringArray = []
			for id in b.workers:
				var w := game.sim.settler(id)
				if w != null:
					names.append(w.name)
			var max_w := int(b.stat("maxWorkers") if b.stat("maxWorkers") != null else 1)
			lines.append("Workers %d/%d%s" % [names.size(), max_w, ": " + ", ".join(names) if not names.is_empty() else " — select someone and right-click here"])
			if not b.delivered.is_empty():
				lines.append("On hand: %s" % Inv.format(b.delivered))
		if b.is_storage():
			lines.append("Holds %d/%d: %s" % [game.sim.storage_used(b), b.storage_capacity(), Inv.format(b.inventory)])
		if b.beds() > 0:
			var names: PackedStringArray = []
			for s in game.sim.settlers:
				if s.home_id == b.id:
					names.append(s.name)
			lines.append("Beds %d/%d%s" % [names.size(), b.beds(), ": " + ", ".join(names) if not names.is_empty() else ""])
	return "\n".join(lines)


func _placing_text() -> String:
	if game.placing == "mark":
		return "[b]Mark for harvest[/b]\nDrag over trees, rocks and bushes. Right-click or Esc to stop."
	if game.placing == "unmark":
		return "[b]Remove marks[/b]\nDrag over marked things. Right-click or Esc to stop."
	var d := Defs.building(game.placing)
	var cost := Inv.format(Defs.cost(game.placing))
	return "[b]%s[/b]\n%s\nCost: %s\n%s" % [d["name"], d.get("description", ""), cost if cost != "" else "free", "Drag to lay out several." if d.get("paint", false) else "Click to place; Shift to place more."]


func _refresh_card() -> void:
	var sim := game.sim
	var key := "%s|%s|%d|%d|%s" % [_card_mode, game.placing, game.selected.size(), game.selected_building, sim.reached]
	if key == _last_card_key:
		return
	_last_card_key = key
	for c in _card_grid.get_children():
		c.queue_free()
	if _card_mode == "build":
		_card_title.text = "Build"
		for type in BUILD_LIST:
			var d := Defs.building(type)
			var ok := BuildingOps.is_unlocked(sim, d.get("unlock"))
			var b := _button(str(d["name"]), func() -> void:
				_card_mode = ""
				game.start_placing(type), "%s\nCost: %s%s" % [d.get("description", ""), Inv.format(Defs.cost(type)) if not Defs.cost(type).is_empty() else "free", "" if ok else "\nUnlocks at %s" % str(d.get("unlock", "")).capitalize()])
			b.disabled = not ok
			_card_grid.add_child(b)
		_card_grid.add_child(_button("Back", func() -> void:
			_card_mode = ""
			refresh_now()))
		return
	if _card_mode == "job":
		_card_title.text = "Choose a job"
		for j in JOBS:
			_card_grid.add_child(_button(str(Defs.job(j)["name"]), func() -> void:
				game.command({"type": "setJob", "ids": game.selected.duplicate(), "job": j})
				_card_mode = ""
				refresh_now()))
		_card_grid.add_child(_button("Back", func() -> void:
			_card_mode = ""
			refresh_now()))
		return
	if not game.selected.is_empty():
		_card_title.text = "Orders"
		_card_grid.add_child(_button("Stop", func() -> void: game.command({"type": "stop", "ids": game.selected.duplicate()}), "Stand still for a moment (S)"))
		_card_grid.add_child(_button("Hold", func() -> void: game.command({"type": "hold", "ids": game.selected.duplicate()}), "Hold position until given another order (H)"))
		_card_grid.add_child(_button("Return goods", func() -> void: game.command({"type": "returnGoods", "ids": game.selected.duplicate()}), "Take what they carry to storage (C)"))
		_card_grid.add_child(_button("Job…", func() -> void:
			_card_mode = "job"
			refresh_now()))
		_card_grid.add_child(_button("Deselect", func() -> void:
			game.selected.clear()
			refresh_now()))
		return
	if game.selected_building != -1:
		var b: Building = sim.buildings.get(game.selected_building)
		if b != null:
			_card_title.text = str(b.def()["name"])
			if not b.workshop.is_empty():
				for r: String in b.def().get("recipes", []):
					var rd := Production.recipe(r)
					var unlocked := BuildingOps.is_unlocked(sim, rd.get("unlock"))
					var rb := _button(str(rd["name"]), func() -> void:
						game.command({"type": "setRecipe", "buildingId": b.id, "recipe": r})
						_last_card_key = ""
						refresh_now(), "%s → %s (%d work)" % [Inv.format(Inv.from_json(rd["inputs"])), Inv.format(Inv.from_json(rd["outputs"])), int(rd["work"])])
					rb.disabled = not unlocked or str(b.workshop.get("recipe", "")) == r
					_card_grid.add_child(rb)
				_card_grid.add_child(_button("Resume" if bool(b.workshop["paused"]) else "Pause", func() -> void:
					game.command({"type": "toggleWorkshop", "buildingId": b.id})
					_last_card_key = ""
					refresh_now(), "Pause or resume production (P)"))
			var permanent: bool = b.built and bool(b.def().get("permanent", false))
			var rm := _button("Cancel site" if not b.built else "Demolish", func() -> void:
				game.command({"type": "remove", "buildingId": b.id})
				game.selected_building = -1
				refresh_now(), "Materials come back; a finished building returns half its cost (X)")
			rm.disabled = permanent
			_card_grid.add_child(rm)
			_card_grid.add_child(_button("Deselect", func() -> void:
				game.selected_building = -1
				refresh_now()))
			return
	_card_title.text = "Valley"
	_card_grid.add_child(_button("Build…", func() -> void:
		_card_mode = "build"
		refresh_now(), "Homes, storage, fields, paths"))
	_card_grid.add_child(_button("Mark", func() -> void: game.start_placing("mark"), "Mark trees, rocks and bushes for harvest (G)"))
	_card_grid.add_child(_button("Unmark", func() -> void: game.start_placing("unmark"), "Remove harvest marks (U)"))
	_card_grid.add_child(_button("Everyone", func() -> void:
		game.selected.clear()
		for s in sim.settlers:
			game.selected.append(s.id)
		refresh_now(), "Select everyone (E)"))
	if game.placing != "":
		_card_grid.add_child(_button("Cancel", func() -> void:
			game.cancel_placing()
			refresh_now()))
