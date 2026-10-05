class_name Hud
extends CanvasLayer
## The interface: title screen, top bar (stocks, storage, day and season, speed), selection panel,
## command card (build, marks, orders, jobs), toasts and the menu (save points, settings).
## Built in code from the palette. It reads the game's state and calls Game's command helpers;
## it never changes simulation state itself.

const BUILD_LIST: Array[String] = ["house", "familyHome", "storehouse", "field", "orchard", "path", "bridge",
	"workshop", "mill", "bakery", "granary", "charcoalKiln", "cottage", "hunterLodge", "chickenCoop", "pigsty",
	"sheepPen", "goatPen", "cattlePasture", "horsePaddock", "tannery", "weaver", "quarry", "mine", "fisherHut",
	"smelter", "forge", "waystation", "depot", "stoneBridge", "inn", "barracks", "archeryRange", "stable", "travelCamp", "watchtower", "well"]
const JOBS: Array[String] = ["laborer", "farmer", "gatherer", "builder", "hauler", "hunter", "herder"]
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
var _realm := RealmWindow.new()
var _towns := PanelContainer.new()
var _towns_list := VBoxContainer.new()
var _towns_key := ""
var _areas := PanelContainer.new()
var _areas_text := RichTextLabel.new()
var _areas_list := VBoxContainer.new()
var _areas_scroll := ScrollContainer.new()
var _areas_key := ""
## The work area highlighted in the Areas window (-1: none).
var chosen_area := -1
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
	_build_areas()
	_towns.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_towns.offset_right = -8
	_towns.offset_top = 64
	_towns.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_towns_list.custom_minimum_size = Vector2(480, 0)
	_towns.add_child(_towns_list)
	_towns.visible = false
	_root.add_child(_towns)
	_realm.setup(self)
	_root.add_child(_realm)
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
	row.add_child(_button("Areas", toggle_areas, "Work areas: farms, woodlots, quarries, building areas (F3)"))
	row.add_child(_button("Towns", toggle_towns, "Settlements, supply routes and caravans (F4)"))
	row.add_child(_button("Realm", toggle_realm, "Crown, land, kingdoms, news, army and war (F6)"))
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
	if _people.visible:
		_close_windows(_people)
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


# ---- towns window --------------------------------------------------------------------------------

func _close_windows(keep: Control) -> void:
	for w: Control in [_people, _areas, _towns, _realm]:
		if w != keep:
			w.visible = false


func toggle_realm() -> void:
	_realm.visible = not _realm.visible
	if _realm.visible:
		_close_windows(_realm)
	_realm._key = ""
	refresh_now()


## Whether the Realm window is open (the map then shows borders).
func realm_open() -> bool:
	return _realm.visible


func _text_label(t: String, tip: String = "") -> Label:
	var l := Label.new()
	l.text = t
	l.tooltip_text = tip
	l.mouse_filter = Control.MOUSE_FILTER_PASS
	return l


func toggle_towns() -> void:
	_towns.visible = not _towns.visible
	if _towns.visible:
		_close_windows(_towns)
	_towns_key = ""
	refresh_now()


## Settlements, their stores and the supply routes between them.
func _refresh_towns() -> void:
	if not _towns.visible:
		return
	var sim := game.sim
	var key := "%d|%d|%d" % [sim.settlements.size(), game.selected.size(), sim.manifests.size()]
	for st: Dictionary in sim.settlements:
		key += "|%s:%d" % [st["name"], Settlements.residents(sim, int(st["id"])).size()]
	for r: Dictionary in sim.routes:
		key += "|%d:%d:%s" % [int(r["id"]), int(r["target"]), Logistics.route_info(sim, int(r["id"]))["status"]]
	if key == _towns_key:
		return
	_towns_key = key
	for c in _towns_list.get_children():
		_towns_list.remove_child(c)
		c.queue_free()
	var head := RichTextLabel.new()
	head.bbcode_enabled = true
	head.fit_content = true
	head.scroll_active = false
	var lines: PackedStringArray = ["[b]Towns[/b]"]
	if sim.settlements.size() < 2:
		lines.append("[color=%s]Build a waystation (from Village) at least 24 tiles away to found a second settlement. A caravan depot and supply routes then keep its stores stocked.[/color]" % _c("textDim").to_html())
	head.text = "\n".join(lines)
	_towns_list.add_child(head)
	for st: Dictionary in sim.settlements:
		var sid := int(st["id"])
		var row := HFlowContainer.new()
		var l := Label.new()
		l.text = "%s — %d people" % [st["name"], Settlements.residents(sim, sid).size()]
		row.add_child(l)
		var edit := LineEdit.new()
		edit.placeholder_text = "Rename"
		edit.custom_minimum_size = Vector2(130, 0)
		row.add_child(edit)
		row.add_child(_button("Rename", func() -> void:
			game.command({"type": "renameSettlement", "settlementId": sid, "name": edit.text})
			_towns_key = ""
			refresh_now()))
		if not game.selected.is_empty() and sim.settlements.size() > 1:
			row.add_child(_button("Move selected here", func() -> void:
				game.command({"type": "assignSettlement", "ids": game.selected.duplicate(), "settlementId": sid})
				_towns_key = ""
				refresh_now(), "They move their bed and work to this settlement"))
		_towns_list.add_child(row)
	if sim.settlements.size() < 2:
		return
	var rh := Label.new()
	rh.text = "Supply routes (%d cart%s on the road)" % [sim.manifests.size(), "" if sim.manifests.size() == 1 else "s"]
	rh.add_theme_color_override("font_color", _c("textDim"))
	_towns_list.add_child(rh)
	for r: Dictionary in sim.routes:
		var rid := int(r["id"])
		var src: Building = sim.buildings.get(int(r["sourceId"]))
		var dst: Building = sim.buildings.get(int(r["destId"]))
		var rl := Label.new()
		rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		rl.custom_minimum_size = Vector2(460, 0)
		rl.text = "%s → %s: keep %d %s · %s" % [Settlements.name_of(sim, Settlements.id_of_building(sim, src)) if src != null else "?", Settlements.name_of(sim, Settlements.id_of_building(sim, dst)) if dst != null else "?",
			int(r["target"]), str(Defs.resource(str(r["res"]))["name"]).to_lower(), Logistics.route_info(sim, rid)["status"]]
		_towns_list.add_child(rl)
		var rr := HFlowContainer.new()
		var tgt := int(r["target"])
		rr.add_child(_button("−10", func() -> void:
			game.command({"type": "setRouteTarget", "routeId": rid, "target": maxi(1, tgt - 10)})
			refresh_now()))
		rr.add_child(_button("+10", func() -> void:
			game.command({"type": "setRouteTarget", "routeId": rid, "target": tgt + 10})
			refresh_now()))
		rr.add_child(_button("End route", func() -> void:
			game.command({"type": "cancelRoute", "routeId": rid})
			refresh_now(), "A cart on the road turns back with its load"))
		_towns_list.add_child(rr)
	# A new route: from a store to a store in another settlement.
	var stores := sim.storages()
	var nr := HFlowContainer.new()
	var src_pick := OptionButton.new()
	var dst_pick := OptionButton.new()
	for b in stores:
		var label := "%s %s" % [Settlements.name_of(sim, Settlements.id_of_building(sim, b)), str(b.def()["name"]).to_lower()]
		src_pick.add_item(label)
		src_pick.set_item_metadata(src_pick.item_count - 1, b.id)
		dst_pick.add_item(label)
		dst_pick.set_item_metadata(dst_pick.item_count - 1, b.id)
	if dst_pick.item_count > 1:
		dst_pick.select(dst_pick.item_count - 1)
	var res_pick := OptionButton.new()
	for r: String in ["wood", "stone", "food", "planks", "tools", "wheat", "flour"]:
		res_pick.add_item(str(Defs.resource(r)["name"]))
		res_pick.set_item_metadata(res_pick.item_count - 1, r)
	nr.add_child(src_pick)
	nr.add_child(dst_pick)
	nr.add_child(res_pick)
	nr.add_child(_button("Add route", func() -> void:
		if src_pick.selected < 0 or dst_pick.selected < 0:
			return
		game.command({"type": "createRoute", "sourceId": src_pick.get_item_metadata(src_pick.selected), "destinationId": dst_pick.get_item_metadata(dst_pick.selected),
			"resource": res_pick.get_item_metadata(res_pick.selected), "target": 40})
		_towns_key = ""
		refresh_now(), "Keep 40 there (change it after); needs a caravan depot with a teamster at the source"))
	_towns_list.add_child(nr)


# ---- areas window -------------------------------------------------------------------------------

func _build_areas() -> void:
	_areas.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_areas.offset_right = -8
	_areas.offset_top = 64
	_areas.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(470, 0)
	_areas.add_child(v)
	_areas_text.bbcode_enabled = true
	_areas_text.fit_content = true
	_areas_text.scroll_active = false
	v.add_child(_areas_text)
	_areas_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_areas_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_areas_scroll.add_child(_areas_list)
	v.add_child(_areas_scroll)
	_areas.visible = false
	_root.add_child(_areas)


func toggle_areas() -> void:
	_areas.visible = not _areas.visible
	if _areas.visible:
		_close_windows(_areas)
	_areas_key = ""
	refresh_now()


func show_areas() -> void:
	if not _areas.visible:
		toggle_areas()


## The Areas window: each area's kind, crew and settings, with buttons to change them.
func _refresh_areas() -> void:
	if not _areas.visible:
		return
	var sim := game.sim
	var lines: PackedStringArray = ["[b]Work areas[/b]"]
	if sim.work_areas.is_empty():
		lines.append("Settlers in an area work only inside it: a farm tends its fields, a woodlot fells and replants its trees, a quarry breaks its rocks.")
	lines.append("[color=%s]New area: pick a kind, then drag on the map. People selected while drawing are assigned to it.[/color]" % _c("textDim").to_html())
	_areas_text.text = "\n".join(lines)
	var key := "%d|%d" % [game.selected.size(), chosen_area]
	for a in sim.work_areas:
		key += "|%d:%s:%d:%s:%d:%d:%d:%d:%d" % [a.id, a.name, a.wanted, a.crop, Areas.crew_of(sim, a.id).size(), a.x0, a.y0, a.x1, a.y1]
	if key == _areas_key:
		return
	_areas_key = key
	for c in _areas_list.get_children():
		_areas_list.remove_child(c)
		c.queue_free()
	var kinds := HFlowContainer.new()
	for k: String in WorkArea.KINDS:
		kinds.add_child(_button(str(WorkArea.LABELS[k]["name"]), func() -> void:
			game.start_placing("area:" + k)
			refresh_now(), str(WorkArea.LABELS[k]["does"])))
	_areas_list.add_child(kinds)
	var crops: Array[String] = []
	for c: String in Defs.crop_ids():
		if BuildingOps.is_unlocked(sim, Defs.crop(c).get("unlock")):
			crops.append(c)
	for a in sim.work_areas:
		_areas_list.add_child(_area_row(a, crops))
	if not game.selected.is_empty():
		_areas_list.add_child(_button("Release the selected from their areas", func() -> void:
			game.command({"type": "assignArea", "ids": game.selected.duplicate(), "areaId": null})
			refresh_now()))
	_fit_areas.call_deferred()


## Sizes the Areas list to its contents, scrolling past most of the screen height. Runs after
## layout: wrapped text only knows its height once its width is set.
func _fit_areas() -> void:
	await get_tree().process_frame
	var vh := get_viewport().get_visible_rect().size.y / maxf(0.1, _root.scale.y)
	_areas_scroll.custom_minimum_size.y = minf(_areas_list.get_combined_minimum_size().y + 4, maxf(160.0, vh - 300.0))
	# Shrink the window to its new contents (containers only ever grow on their own).
	_areas.reset_size()


func _area_row(a: WorkArea, crops: Array[String]) -> Control:
	var sim := game.sim
	var id := a.id
	var box := VBoxContainer.new()
	var crew := Areas.crew_of(sim, id)
	var head := RichTextLabel.new()
	head.bbcode_enabled = true
	head.fit_content = true
	head.scroll_active = false
	var names: PackedStringArray = []
	for s in crew:
		names.append(s.name)
	var staffing := "staffs itself with %d" % a.wanted if a.wanted >= 0 else "assigned by hand"
	var text := "[b]%s[/b] — %s, %d×%d · %d/%d workers (%s)" % [a.name, str(WorkArea.LABELS[a.kind]["name"]).to_lower(), a.x1 - a.x0 + 1, a.y1 - a.y0 + 1,
		crew.size(), WorkArea.MAX_WORKERS, staffing]
	if not names.is_empty():
		text += "\n" + ", ".join(names)
	if a.kind == "farm":
		text += "\nNew fields: %s" % (a.crop.capitalize() if a.crop != "" else "placed by hand")
	head.text = text
	box.add_child(head)
	var row := HFlowContainer.new()
	row.add_child(_button("Show", func() -> void:
		chosen_area = id
		var ar := sim.area(id)
		if ar != null:
			game.camera.target_pos = Vector2((ar.x0 + ar.x1 + 1) / 2.0, (ar.y0 + ar.y1 + 1) / 2.0) * WorldView.TILE_PX
		_areas_key = ""
		refresh_now(), "Centre the view on this area"))
	var have := a.wanted if a.wanted >= 0 else crew.size()
	row.add_child(_button("−", func() -> void:
		game.command({"type": "updateArea", "areaId": id, "wanted": maxi(0, have - 1)})
		refresh_now(), "Fewer workers (at 0 the area is staffed by hand)"))
	row.add_child(_button("+", func() -> void:
		game.command({"type": "updateArea", "areaId": id, "wanted": mini(WorkArea.MAX_WORKERS, have + 1)})
		refresh_now(), "More workers: free adults head there on their own"))
	if a.kind == "farm" and not crops.is_empty():
		var i := crops.find(a.crop)
		var next := crops[0] if a.crop == "" else (crops[i + 1] if i + 1 < crops.size() and i >= 0 else "")
		row.add_child(_button("Fields: %s" % (next.capitalize() if next != "" else "by hand"), func() -> void:
			game.command({"type": "updateArea", "areaId": id, "crop": next if next != "" else null})
			refresh_now(), "Lay out fields of this crop on every free tile inside"))
	if not game.selected.is_empty():
		row.add_child(_button("Assign selected", func() -> void:
			game.command({"type": "assignArea", "ids": game.selected.duplicate(), "areaId": id})
			refresh_now()))
	row.add_child(_button("Remove", func() -> void:
		game.command({"type": "deleteArea", "areaId": id})
		if chosen_area == id:
			chosen_area = -1
		refresh_now(), "Its settlers go back to their usual work; its fields stay"))
	box.add_child(row)
	return box


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
	var ruler_edit := LineEdit.new()
	ruler_edit.placeholder_text = "Your ruler's name"
	ruler_edit.max_length = 24
	v.add_child(ruler_edit)
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
		game.new_world(seed_value, str(habitat.get_item_metadata(habitat.selected)), name_edit.text.strip_edges() if name_edit.text.strip_edges() != "" else "Home",
			ruler_edit.text.strip_edges() if ruler_edit.text.strip_edges() != "" else "Your Majesty")))
	var note := Label.new()
	note.text = "Godot preview: farming, crafts, animals, mining, work areas, roles and growing families. Time stands still while the game is closed."
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
	if game.sim != null and game.sim.ruler() == null:
		# Valleys from before the ruler walked the map.
		var throne_edit := LineEdit.new()
		throne_edit.placeholder_text = "Your ruler's name"
		throne_edit.max_length = 24
		v.add_child(throne_edit)
		v.add_child(_button("Take the throne", func() -> void:
			if bool(game.command({"type": "takeThrone", "name": throne_edit.text})["ok"]):
				_menu.visible = false, "Walk the map as your valley's ruler: people near you work faster, and Rally inspires them"))
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
	if game.falling_behind and not game.paused:
		_clock.text += "  (slowed: this device can't keep up at this speed)"
	_refresh_selection()
	_refresh_card()
	_refresh_people()
	_refresh_areas()
	_refresh_towns()
	_realm.refresh()


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
	elif game.selected_animal != -1:
		var a := Animals.find(sim, game.selected_animal)
		if a != null:
			text = _animal_text(a)
		else:
			game.selected_animal = -1
	elif game.placing != "":
		text = _placing_text()
	_select_panel.visible = text != ""
	if _select_text.text != text:
		_select_text.text = text


func _animal_text(a: Animal) -> String:
	var d := a.def()
	var lines := ["[b]%s[/b]%s" % [d["name"], " · in the %s" % str((game.sim.buildings[a.pen_id] as Building).def()["name"]).to_lower() if a.pen_id != -1 and game.sim.buildings.has(a.pen_id) else ""]]
	lines.append(str(d.get("note", "")))
	if a.pen_id == -1:
		if d.has("hunt"):
			var h: Dictionary = d["hunt"]
			lines.append("Hunting gives %d food%s. Health %d/%d." % [int(h["food"]), " and %d hides" % int(h["hides"]) if int(h["hides"]) > 0 else "", ceili(a.health()), int(d["hp"])])
			if d.has("fightsBack"):
				lines.append("[color=%s]Strikes back at hunters who come close.[/color]" % _c("accent").to_html())
			lines.append("Select settlers and right-click it to hunt it.")
		else:
			lines.append("Not hunted.")
		if a.hunted_by != -1:
			var s := game.sim.settler(a.hunted_by)
			if s != null:
				lines.append("%s is stalking it." % s.name)
	return "\n".join(lines)


func _set_text(l: Label, t: String) -> void:
	if l.text != t:
		l.text = t


func _settler_text(s: Settler) -> String:
	var job := "Ruler" if s.ruler else str(Defs.job(s.job)["name"])
	var lines := ["[b]%s[/b] — %s" % [s.name, job]]
	if s.ruler:
		var wait := game.sim.rally_ready_at - game.sim.tick
		lines.append("People nearby work faster. %s" % ("Rally (R) is ready." if wait <= 0 else "Rally again in %d min." % ceili(wait / 600.0)))
	if not s.training.is_empty():
		lines.append("Training as a %s: %d%%" % [Roles.job_name(str(s.training["role"])), floori(float(s.training["progress"]) / float(Content.get_value("jobs", "ROLE_TRAIN_TICKS")) * 100)])
	elif s.boost_until > game.sim.tick:
		lines.append("[color=%s]Rallied: working 30%% faster[/color]" % _c("good").to_html())
	lines.append(_describe(s))
	lines.append("Hunger %s  ·  Energy %s%s" % [_bar(s.hunger), _bar(s.energy), "  ·  Health %s" % _bar(s.hp) if s.hp < 100.0 else ""])
	if s.carrying():
		lines.append("Carrying %d %s" % [s.carry_amount, str(Defs.resource(s.carry_res)["name"]).to_lower()])
	var area := game.sim.area(s.area_id)
	if area != null:
		lines.append("Works in %s" % area.name)
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
	if s.ruler and (s.task == null or s.task.kind == Task.WANDER):
		return "Watching over the realm"
	if s.job == "chief" and (s.task == null or s.task.kind == Task.MOVE):
		return "Bringing advice to the ruler" if bool(sim.chief["adviceReady"]) else "Walking among the people, watching them work"
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
		Task.LEARN:
			return "Training as a %s" % (Roles.job_name(str(s.training["role"])) if not s.training.is_empty() else "new role")
		Task.SURVEY:
			return "Surveying for ore" if t.stage == &"work" else "On the way to survey"
		Task.EXTRACT:
			var xb: Building = sim.buildings.get(t.site)
			if xb != null and xb.def().get("extraction") == "fish":
				return "Fishing from the jetty"
			return "Cutting stone at the quarry" if xb != null and not xb.quarry.is_empty() else "Digging ore in the mine"
		Task.HUNT:
			var a := Animals.find(sim, t.animal)
			var an := str(a.def()["name"]).to_lower() if a != null else "game"
			return ("Striking at the %s" if t.stage == &"aim" else "Stalking a %s") % an
		Task.HERD:
			var pen: Building = sim.buildings.get(t.site)
			return "Tending the %s" % (str(pen.def()["name"]).to_lower() if pen != null else "animals")
		Task.CRAFT:
			var ws: Building = sim.buildings.get(t.site)
			return "Working at the %s" % (str(ws.def()["name"]).to_lower() if ws != null else "workshop")
		Task.ORCHARD:
			return "Picking apples" if t.action == &"pick" else "Tending the orchard"
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
	var lines := ["[b]%s[/b]" % (Levels.level_name(b) if b.built else str(d["name"]))]
	var levels := Levels.levels_of(b)
	if b.built and not levels.is_empty():
		var lv_line := "Level %d of %d" % [b.level, levels.size()]
		if not b.upgrade.is_empty():
			var to := int(b.upgrade["to"])
			var nl: Dictionary = levels[to - 1]
			lv_line += " · upgrading to %s: %d%%" % [nl["name"], roundi(float(b.upgrade["progress"]) / maxf(1.0, float(nl["time"])) * 100)]
		else:
			var next := Levels.next_level(b)
			if not next.is_empty():
				lv_line += " · next: %s (%s)" % [next["name"], ", ".join(PackedStringArray(next.get("perks", []) as Array))]
		lines.append("[color=%s]%s[/color]" % [_c("textDim").to_html(), lv_line])
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
		if not b.orchard.is_empty():
			lines.append(Orchards.status(game.sim, b))
		if b.def().has("pen") and not b.pen.is_empty():
			lines.append(Animals.pen_status(game.sim, b))
		if b.def().has("hunting"):
			var weapon: Dictionary = (Animals.value("WEAPONS") as Dictionary)[Animals.weapon_of_lodge(b)]
			var near := Animals.prey_near(game.sim, b).size()
			lines.append("Hunters carry: %s · %d game within %d tiles" % [str(weapon["name"]).to_lower(), near, roundi(Animals.hunt_radius_of(b))])
		if b.def().has("extraction"):
			lines.append(Mining.extraction_status(game.sim, b))
		if b.def().has("hunting") or b.def().has("pen") or b.def().has("extraction"):
			var wn: PackedStringArray = []
			for id in b.workers:
				var w := game.sim.settler(id)
				if w != null:
					wn.append(w.name)
			var mx := int(b.stat("maxWorkers") if b.stat("maxWorkers") != null else 1)
			lines.append("Workers %d/%d%s" % [wn.size(), mx, ": " + ", ".join(wn) if not wn.is_empty() else " — anyone free helps; select someone and right-click here to assign"])
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
			if not b.wants.is_empty():
				lines.append("Stock targets: %s" % Inv.format(b.wants))
		if b.def().has("depot"):
			var tn: PackedStringArray = []
			for id in b.workers:
				var w := game.sim.settler(id)
				if w != null:
					tn.append(w.name + (" (on the road)" if w.away_on != -1 else ""))
			lines.append("Teamsters: %s" % (", ".join(tn) if not tn.is_empty() else "none — select someone and right-click here"))
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
	if game.placing == "claim":
		return "[b]Claim a sector[/b]\nClick a 16×16 sector next to your land. Its cost and any problem are shown first.\nRight-click or Esc to stop."
	if game.placing.begins_with("company:"):
		return "[b]March[/b]\nClick where the company should go. They carry two days of food from the stores.\nRight-click or Esc to stop."
	if game.placing == "survey":
		return "[b]Survey for ore[/b]\nClick rocky ground, a rock or a hill below a mountain face. The whole 16×16 patch is surveyed.\nRight-click or Esc to stop."
	if game.placing.begins_with("area:"):
		var k := game.placing.substr(5)
		return "[b]New %s[/b]\n%s.\nDrag a rectangle (up to 40×40) over explored land. Right-click or Esc to stop." % [str(WorkArea.LABELS[k]["name"]).to_lower(), WorkArea.LABELS[k]["does"]]
	if game.placing == "unmark":
		return "[b]Remove marks[/b]\nDrag over marked things. Right-click or Esc to stop."
	var d := Defs.building(game.placing)
	if d.has("span"):
		return "[b]%s[/b]\n%s\nCost per tile: %s\nDrag across the water from bank to bank." % [d["name"], d.get("description", ""), Inv.format(Inv.from_json(d["span"]["costPerTile"]))]
	var cost := Inv.format(Defs.cost(game.placing))
	return "[b]%s[/b]\n%s\nCost: %s\n%s" % [d["name"], d.get("description", ""), cost if cost != "" else "free", "Drag to lay out several." if d.get("paint", false) else "Click to place; Shift to place more."]


func _refresh_card() -> void:
	var sim := game.sim
	var key := "%s|%s|%d|%d|%s" % [_card_mode, game.placing, game.selected.size(), game.selected_building, sim.reached]
	var sel: Building = sim.buildings.get(game.selected_building)
	if sel != null:
		key += "|%s" % sel.mine.get("level", 0)
		key += "|%d|%s|%d|%s" % [sel.level, sel.upgrade.is_empty(), sel.type.hash(), Levels.upgrade_problem(sim, sel) if sel.upgrade.is_empty() else ""]
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
	if _card_mode == "wants" and game.selected_building != -1 and sim.buildings.has(game.selected_building):
		var wb: Building = sim.buildings[game.selected_building]
		_card_title.text = "Stock targets"
		for r: String in ["wood", "stone", "food", "planks", "tools"]:
			var have := int(wb.wants.get(r, 0))
			_card_grid.add_child(_button("%s %d −" % [Defs.resource(r)["name"], have], func() -> void:
				game.command({"type": "setWants", "buildingId": wb.id, "res": r, "amount": maxi(0, have - 10)})
				_last_card_key = ""
				refresh_now()))
			_card_grid.add_child(_button("+10 %s" % str(Defs.resource(r)["name"]).to_lower(), func() -> void:
				game.command({"type": "setWants", "buildingId": wb.id, "res": r, "amount": have + 10})
				_last_card_key = ""
				refresh_now()))
			_card_grid.add_child(Control.new())
		_card_grid.add_child(_button("Back", func() -> void:
			_card_mode = ""
			refresh_now()))
		return
	if _card_mode == "train":
		_card_title.text = "Train at the Town Hall"
		var hall := Roles.hall_for(sim, sim.settler(game.selected[0])) if not game.selected.is_empty() and sim.settler(game.selected[0]) != null else null
		var lvl := hall.level if hall != null else 0
		for j: String in Content.get_value("jobs", "JOB_IDS"):
			var need := int(Defs.job(j).get("hallLevel", 1))
			var names: Array = Content.get_value("jobs", "HALL_LEVEL_NAMES")
			var tb := _button(Roles.job_name(j), func() -> void:
				game.command({"type": "trainRole", "ids": game.selected.duplicate(), "role": j})
				_card_mode = ""
				refresh_now(), str(Defs.job(j).get("description", "")) + ("" if need <= lvl else "\nNeeds a %s" % names[mini(need, names.size() - 1)]))
			tb.disabled = need > lvl
			_card_grid.add_child(tb)
		_card_grid.add_child(_button("Back", func() -> void:
			_card_mode = ""
			refresh_now()))
		return
	var ruler := sim.ruler()
	if game.selected.size() == 1 and ruler != null and game.selected[0] == ruler.id:
		_card_title.text = "The ruler"
		_card_grid.add_child(_button("Rally", func() -> void: game.command({"type": "rally"}), "Inspire everyone close by to work 30% faster for an hour; once a day (R)"))
		_card_grid.add_child(_button("Stop", func() -> void: game.command({"type": "stop", "ids": game.selected.duplicate()}), "Stand still for a moment (S)"))
		_card_grid.add_child(_button("Deselect", func() -> void:
			game.selected.clear()
			refresh_now()))
		return
	if not game.selected.is_empty():
		_card_title.text = "Orders"
		_card_grid.add_child(_button("Stop", func() -> void: game.command({"type": "stop", "ids": game.selected.duplicate()}), "Stand still for a moment (S)"))
		_card_grid.add_child(_button("Hold", func() -> void: game.command({"type": "hold", "ids": game.selected.duplicate()}), "Hold position until given another order (H)"))
		_card_grid.add_child(_button("Return goods", func() -> void: game.command({"type": "returnGoods", "ids": game.selected.duplicate()}), "Take what they carry to storage (C)"))
		if game.selected.size() == 1:
			_card_grid.add_child(_button("Survey", func() -> void: game.start_placing("survey"), "Send them to survey the ground for ore"))
			var one := sim.settler(game.selected[0])
			if one != null and not one.training.is_empty():
				_card_grid.add_child(_button("Stop training", func() -> void: game.command({"type": "cancelRoleTraining", "settlerId": one.id})))
		_card_grid.add_child(_button("Train…", func() -> void:
			_card_mode = "train"
			refresh_now(), "Learn a new role at the Town Hall"))
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
			if b.built and not b.mine.is_empty() and int(b.mine["level"]) < 3:
				var nl := int(b.mine["level"]) + 1
				_card_grid.add_child(_button("Deepen shaft", func() -> void:
					game.command({"type": "upgradeMine", "buildingId": b.id})
					_last_card_key = ""
					refresh_now(), "Level %d: %d ore per trip · costs %s" % [nl, Mining.MINE_YIELD[nl], Inv.format(Mining.MINE_UPGRADES[nl])]))
			if b.built and not Levels.levels_of(b).is_empty():
				if not b.upgrade.is_empty():
					_card_grid.add_child(_button("Cancel upgrade", func() -> void:
						game.command({"type": "cancelUpgrade", "buildingId": b.id})
						_last_card_key = ""
						refresh_now(), "Everything paid comes back"))
				else:
					var next := Levels.next_level(b)
					if not next.is_empty():
						var problem := Levels.upgrade_problem(sim, b)
						var tip := "%s\nCost: %s · %d s at normal speed%s" % [", ".join(PackedStringArray(next.get("perks", []) as Array)),
							Inv.format(Inv.from_json(next.get("cost", {}))), roundi(float(next["time"]) / 10.0), "\n" + problem if problem != "" else ""]
						var ub := _button("Upgrade → %s" % next["name"], func() -> void:
							game.command({"type": "upgradeBuilding", "buildingId": b.id})
							_last_card_key = ""
							refresh_now(), tip)
						ub.disabled = problem != ""
						_card_grid.add_child(ub)
			if b.built and b.def().has("training"):
				for u: String in b.def()["training"]["units"]:
					var ud := Military.unit(u)
					var eb := _button("Enlist selected: %s" % ud["name"], func() -> void:
						game.command({"type": "enlist", "ids": game.selected_before_building.duplicate(), "unit": u, "buildingId": b.id})
						_last_card_key = ""
						refresh_now(), "Select adults first, then this building. Gear: %s" % Inv.format(Inv.from_json(ud["gear"])))
					eb.disabled = game.selected_before_building.is_empty()
					_card_grid.add_child(eb)
			if b.built and b.def().has("lodging"):
				for p: Dictionary in sim.parties:
					if p["state"] != "lodging" or int(p["innId"]) != b.id:
						continue
					var pid := int(p["id"])
					for r: String in p["stock"]:
						if int(p["stock"][r]) <= 0:
							continue
						var price := Merchants.sell_price(r)
						_card_grid.add_child(_button("Buy 1 %s (%d coins)" % [str(Defs.resource(r)["name"]).to_lower(), price], func() -> void:
							game.command({"type": "barter", "partyId": pid, "give": {}, "take": {r: 1}, "coins": price})
							_last_card_key = ""
							refresh_now(), "%s has %d" % [p["name"], int(p["stock"][r])]))
					for r: String in ["tools", "planks", "wool", "hides", "leather", "cloth", "silverOre", "goldOre", "diamonds"]:
						if sim.stored_total(r) <= 0:
							continue
						var pay := Merchants.buy_price(r)
						_card_grid.add_child(_button("Sell 1 %s (%d coins)" % [str(Defs.resource(r)["name"]).to_lower(), pay], func() -> void:
							game.command({"type": "barter", "partyId": pid, "give": {r: 1}, "take": {}, "coins": -pay})
							_last_card_key = ""
							refresh_now()))
			if b.built and b.is_storage() and b.type != "crate":
				_card_grid.add_child(_button("Stock targets…", func() -> void:
					_card_mode = "wants"
					refresh_now(), "Haulers keep this store stocked from other stores"))
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
