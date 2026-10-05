class_name Hud
extends CanvasLayer
## The interface, laid out as the browser game's (src/ui): the top bar (main goods, Goods drawer,
## people and storage; window tabs; calendar and speed), the bottom console (GameConsole: minimap,
## selection and command card), the windows (People, Areas, Towns, Families, Realm, Goals, Goods),
## toasts, the title and the menu. Built in code from the palette. It reads the game's state and
## calls Game's command helpers; it never changes simulation state itself.

const JOBS: Array[String] = ["laborer", "farmer", "gatherer", "builder", "hauler", "hunter", "herder"]
## Always on the bar; everything else lives in the Goods drawer (as the browser's MAIN_RES).
const MAIN_RES: Array[String] = ["food", "wood", "stone", "planks", "tools"]

var game: Game
var _root := Control.new()
var _theme: Theme
var _pal: Dictionary
var _font: FontFile
var _bold: FontFile

var _top := HBoxContainer.new()
var _stocks := HBoxContainer.new()
var _clock := Label.new()
var _clock_sub := Label.new()
var _sun := TextureRect.new()
var _speed_buttons := {}
var _tabs := {}
var _goods_button: Button
## The bottom console: minimap, selection info and the command card (src/ui/Console.tsx).
var console := GameConsole.new()
var _list: PanelContainer
var _list_body: VBoxContainer
var _list_scroll: ScrollContainer
var _list_key := ""
var _goals: PanelContainer
var _goals_body: VBoxContainer
var _goals_scroll: ScrollContainer
var _goals_key := ""
var _goods: PanelContainer
var _goods_body: VBoxContainer
var _goods_scroll: ScrollContainer
var _goods_key := ""
var _help: PanelContainer = null
var _help_body: VBoxContainer
var _help_scroll: ScrollContainer
var _toasts := VBoxContainer.new()
var _title := Control.new()
var _busy := PanelContainer.new()
var _today := PanelContainer.new()
var _studio := AssetStudio.new()
var _tutorial := PanelContainer.new()
var _tutorial_box := VBoxContainer.new()
var _tutorial_key := ""
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
	_font = UiFonts.regular()
	_bold = UiFonts.bold()
	_theme = _make_theme()
	_root.theme = _theme
	# _apply_scale owns the root size; stretched anchors would override that size and warn.
	_root.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_apply_scale()
	_build_top()
	console.setup(self)
	console.visible = false
	_root.add_child(console)
	_toasts.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toasts.position = Vector2(-260, 64)
	_toasts.custom_minimum_size = Vector2(520, 0)
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_toasts)
	_build_people()
	_build_lists()
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
	for p: Control in [_title, _busy, _today]:
		p.set_anchors_preset(Control.PRESET_CENTER)
		p.visible = false
		_root.add_child(p)
	_tutorial.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_tutorial.offset_left = 8
	_tutorial.offset_top = 64
	_tutorial_box.custom_minimum_size = Vector2(360, 0)
	_tutorial.add_child(_tutorial_box)
	_tutorial.visible = false
	_root.add_child(_tutorial)
	_studio.setup(self)
	_root.add_child(_studio)
	# The command tooltip floats above everything else in the HUD.
	_root.add_child(console.tip_layer())
	_busy.add_child(_busy_label)


func _apply_scale() -> void:
	# The player's interface size on top of the display's scaling (the game draws 1:1).
	var s := (game.settings.ui_scale if game != null else 1.0) * CameraRig.screen_scale()
	_root.scale = Vector2(s, s)
	var size := get_viewport().get_visible_rect().size / s
	if _root.size != size:
		_root.size = size


# ---- theme -----------------------------------------------------------------------------------

func _c(key: String) -> Color:
	return Color(str(_pal["ui"][key]))


func _box(bg: Color, border: Color, radius: int = 0, pad: int = 8) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = border
	b.set_border_width_all(2)
	b.set_corner_radius_all(radius)
	b.set_content_margin_all(pad)
	return b


## A pixel button as the browser's (src/ui/pixel.css): soil with a turf edge and a dark drop.
## A pixel button as the browser's (src/ui/pixel.css .panel .btn): soil with a 2 px turf edge and
## a 2 px dark-grass drop below.
func _soil_button(bg: Color, edge: Color, border: int = 2) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = bg
	b.border_color = edge
	b.set_border_width_all(border)
	b.shadow_color = Color("#1d4a1b")
	b.shadow_size = 0
	b.shadow_offset = Vector2(0, 2)
	b.content_margin_left = 12
	b.content_margin_right = 12
	b.content_margin_top = 5
	b.content_margin_bottom = 5
	return b


## Every box: the browser's grass frame round tiled dirt, at 2× (1× in the top bar).
func _grass_panel() -> StyleBoxTexture:
	return HudTextures.panel_style(2)


func _make_theme() -> Theme:
	var t := Theme.new()
	t.default_font = _font
	t.default_font_size = 15
	t.set_stylebox("panel", "PanelContainer", _grass_panel())
	var soil := Color("#634024")
	var grass := Color("#2f6a27")
	t.set_stylebox("normal", "Button", _soil_button(soil, grass))
	t.set_stylebox("hover", "Button", _soil_button(Color("#8a5c36"), Color("#4f9636")))
	var down := _soil_button(Color("#8a6a1c"), _c("accent"))
	down.shadow_offset = Vector2.ZERO
	t.set_stylebox("pressed", "Button", down)
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	var off := _soil_button(Color(soil, 0.5), Color(grass, 0.5))
	t.set_stylebox("disabled", "Button", off)
	t.set_color("font_color", "Button", _c("text"))
	t.set_color("font_hover_color", "Button", _c("text"))
	t.set_color("font_pressed_color", "Button", Color("#fffbe8"))
	t.set_color("font_disabled_color", "Button", Color(_c("text"), 0.45))
	# The browser's text shadow on dirt: 1 px down, dark brown, so text stays crisp over clods.
	for type: String in ["Label", "Button", "CheckButton", "CheckBox"]:
		t.set_color("font_shadow_color", type, Color(0.094, 0.047, 0.016, 0.75))
		t.set_constant("shadow_offset_x", type, 0)
		t.set_constant("shadow_offset_y", type, 1)
	t.set_color("font_shadow_color", "RichTextLabel", Color(0.094, 0.047, 0.016, 0.75))
	t.set_constant("shadow_offset_y", "RichTextLabel", 1)
	# The green primary button (Continue, Start), as the browser's .btn.primary.
	t.set_type_variation("PrimaryButton", "Button")
	t.set_stylebox("normal", "PrimaryButton", _soil_button(Color("#4f8a3c"), Color("#a8e070")))
	t.set_stylebox("hover", "PrimaryButton", _soil_button(Color("#5e9a45"), Color("#a8e070")))
	t.set_color("font_color", "PrimaryButton", Color("#fffbe8"))
	t.set_color("font_hover_color", "PrimaryButton", Color("#fffbe8"))
	# A danger button (Delete, Return to title).
	t.set_type_variation("DangerButton", "Button")
	t.set_stylebox("normal", "DangerButton", _soil_button(soil, Color("#d86048")))
	t.set_stylebox("hover", "DangerButton", _soil_button(Color("#4a2a26"), Color("#d86048")))
	t.set_color("font_color", "DangerButton", Color("#ffc0b0"))
	# A window tab in the top bar (src/ui/pixel.css .win-btn): soil with a dirt edge; on: grass.
	t.set_type_variation("TabButton", "Button")
	var tab := _soil_button(soil, Color("#4c311b"))
	tab.content_margin_left = 7
	tab.content_margin_right = 7
	tab.content_margin_top = 3
	tab.content_margin_bottom = 3
	tab.shadow_offset = Vector2.ZERO
	t.set_stylebox("normal", "TabButton", tab)
	var tab_hover := tab.duplicate() as StyleBoxFlat
	tab_hover.border_color = Color("#4f9636")
	t.set_stylebox("hover", "TabButton", tab_hover)
	t.set_font_size("font_size", "TabButton", 13)
	t.set_type_variation("TabOn", "Button")
	var on := tab.duplicate() as StyleBoxFlat
	on.bg_color = Color("#1d4a1b")
	on.border_color = Color("#4f9636")
	t.set_stylebox("normal", "TabOn", on)
	t.set_stylebox("hover", "TabOn", on)
	t.set_color("font_color", "TabOn", Color("#fffbe8"))
	t.set_font_size("font_size", "TabOn", 13)
	# The chosen speed, a pressed toggle (src/ui/pixel.css .btn.on): gold on dark gold.
	t.set_type_variation("GoldOn", "Button")
	var gold := tab.duplicate() as StyleBoxFlat
	gold.bg_color = Color("#8a6a1c")
	gold.border_color = _c("accent")
	t.set_stylebox("normal", "GoldOn", gold)
	t.set_stylebox("hover", "GoldOn", gold)
	t.set_color("font_color", "GoldOn", Color("#fffbe8"))
	t.set_font_size("font_size", "GoldOn", 13)
	t.set_color("font_color", "Label", _c("text"))
	t.set_color("default_color", "RichTextLabel", _c("text"))
	var field := _soil_button(soil, Color("#4c311b"))
	field.shadow_offset = Vector2.ZERO
	field.content_margin_left = 8
	field.content_margin_top = 4
	field.content_margin_bottom = 4
	t.set_stylebox("normal", "LineEdit", field)
	var field_focus := field.duplicate() as StyleBoxFlat
	field_focus.border_color = _c("accent")
	t.set_stylebox("focus", "LineEdit", field_focus)
	t.set_color("font_color", "LineEdit", _c("text"))
	t.set_color("font_placeholder_color", "LineEdit", Color(_c("text"), 0.45))
	t.set_stylebox("normal", "OptionButton", _soil_button(soil, grass))
	t.set_stylebox("hover", "OptionButton", _soil_button(Color("#8a5c36"), Color("#4f9636")))
	t.set_stylebox("panel", "PopupMenu", _soil_button(Color("#4c311b"), grass))
	t.set_color("font_color", "PopupMenu", _c("text"))
	t.set_color("font_hover_color", "PopupMenu", _c("accent"))
	t.set_stylebox("panel", "TooltipPanel", HudTextures.panel_style(1))
	t.set_color("font_color", "TooltipLabel", _c("text"))
	t.set_font_size("font_size", "TooltipLabel", 13)
	var track := StyleBoxFlat.new()
	track.bg_color = Color("#4c311b")
	track.content_margin_top = 3
	track.content_margin_bottom = 3
	t.set_stylebox("slider", "HSlider", track)
	var grab := StyleBoxFlat.new()
	grab.bg_color = Color("#4f9636")
	t.set_stylebox("grabber_area", "HSlider", grab)
	t.set_stylebox("grabber_area_highlight", "HSlider", grab)
	t.set_font("bold_font", "RichTextLabel", _bold)
	return t


func _button(text: String, on_press: Callable, tip: String = "", shortcut: String = "") -> Button:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.pressed.connect(on_press)
	b.focus_mode = Control.FOCUS_NONE
	if shortcut != "":
		b.mouse_entered.connect(func() -> void:
			b.tooltip_text = "%s (%s)" % [tip, game.settings.bindings.label(shortcut)])
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
	# Three boxes along the top, as the browser's TopBar: goods and counts on the left, the
	# window tabs in the middle, the calendar and time controls on the right.
	_top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_top.offset_left = 6
	_top.offset_right = -6
	_top.offset_top = 4
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_theme_constant_override("separation", 4)
	var left := PanelContainer.new()
	left.add_theme_stylebox_override("panel", _bar_panel())
	_stocks.add_theme_constant_override("separation", 6)
	left.add_child(_stocks)
	_top.add_child(left)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(spacer)
	var mid := PanelContainer.new()
	mid.add_theme_stylebox_override("panel", _bar_panel())
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 2)
	mid.add_child(tabs)
	for t: Array in [["People", "people", "Everyone in the valley", toggle_people], ["Areas", "areas", "Work areas", toggle_areas],
			["Towns", "towns", "Settlements, seasons and supply routes", toggle_towns], ["Families", "families", "Households, children and visitors", toggle_families],
			["Realm", "realm", "Crown, diplomacy, news and war", toggle_realm], ["Goals", "goals", "Milestones and what they unlock", toggle_goals]]:
		var b := _tab_button(t[0], t[1], t[2], t[3])
		tabs.add_child(b)
		_tabs[t[1]] = b
	_top.add_child(mid)
	var spacer2 := Control.new()
	spacer2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer2.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(spacer2)
	var right := PanelContainer.new()
	right.add_theme_stylebox_override("panel", _bar_panel())
	var rr := HBoxContainer.new()
	rr.add_theme_constant_override("separation", 4)
	right.add_child(rr)
	_sun.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sun.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_sun.custom_minimum_size = Vector2(20, 20)
	rr.add_child(_sun)
	var clock := VBoxContainer.new()
	clock.add_theme_constant_override("separation", -4)
	_clock.add_theme_font_size_override("font_size", 12)
	clock.add_child(_clock)
	_clock_sub.add_theme_font_size_override("font_size", 11)
	_clock_sub.add_theme_color_override("font_color", _c("textDim"))
	clock.add_child(_clock_sub)
	rr.add_child(clock)
	for sp: Array in [["II", 0], ["1×", 1], ["2×", 2], ["4×", 4]]:
		var v: int = sp[1]
		var sb := _button(sp[0], func() -> void:
			if v == 0:
				game.paused = not game.paused
			else:
				game.paused = false
				game.speed = v
			refresh_now(), "Pause" if v == 0 else "Speed %d×" % v, "pause" if v == 0 else {1: "speed1", 2: "speed2", 4: "speed3"}[v])
		sb.theme_type_variation = &"TabButton"
		sb.custom_minimum_size = Vector2(28, 0)
		_speed_buttons[v] = sb
		rr.add_child(sb)
	var today := _button("Today", func() -> void: game.open_today(), "Valley today: what needs attention and what to do next", "today")
	today.theme_type_variation = &"TabButton"
	rr.add_child(today)
	var menu := _button("Menu", toggle_menu, "Menu: save, settings and leaving (Esc)")
	menu.theme_type_variation = &"TabButton"
	rr.add_child(menu)
	_top.add_child(right)
	_top.visible = false
	_root.add_child(_top)


## The top bar's boxes: the browser draws them with the frame at 1× (src/ui/pixel.css .hud-top).
func _bar_panel() -> StyleBoxTexture:
	var sb := HudTextures.panel_style(1)
	sb.content_margin_top = 13
	sb.content_margin_bottom = 4
	sb.content_margin_left = 9
	sb.content_margin_right = 9
	return sb


## A window tab with its function key shown small above the name, and an optional alert badge.
func _tab_button(text: String, action: String, tip: String, on_press: Callable) -> Button:
	var b := _button(text, on_press, tip, action)
	b.toggle_mode = false
	b.theme_type_variation = &"TabButton"
	var k := Label.new()
	k.text = game.settings.bindings.label(action) if game != null else ""
	k.add_theme_font_size_override("font_size", 8)
	k.add_theme_color_override("font_color", _c("accent"))
	k.position = Vector2(3, -1)
	k.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(k)
	var badge := Label.new()
	badge.name = "Badge"
	badge.add_theme_font_size_override("font_size", 10)
	badge.add_theme_color_override("font_color", Color("#fffbe8"))
	var bs := StyleBoxFlat.new()
	bs.bg_color = Color("#c0443a")
	bs.set_corner_radius_all(7)
	bs.content_margin_left = 4
	bs.content_margin_right = 4
	badge.add_theme_stylebox_override("normal", bs)
	badge.visible = false
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(badge)
	return b


func _refresh_top() -> void:
	var sim := game.sim
	if _stock_labels.is_empty():
		for r in MAIN_RES:
			var chip := HBoxContainer.new()
			chip.add_theme_constant_override("separation", 4)
			chip.tooltip_text = str(Defs.resource(r)["name"])
			chip.mouse_filter = Control.MOUSE_FILTER_PASS
			chip.add_child(_icon(r, 18))
			var l := Label.new()
			l.add_theme_font_size_override("font_size", 13)
			chip.add_child(l)
			_stocks.add_child(chip)
			_stock_labels[r] = l
		_goods_button = _button("Goods", toggle_goods, "Every other good in store", "goods")
		_goods_button.theme_type_variation = &"TabButton"
		_stocks.add_child(_goods_button)
		for k: Array in [["pop", "ui_people", "People / beds and bunks"], ["store", "ui_storage", "Goods in store / storage room"]]:
			var chip := HBoxContainer.new()
			chip.add_theme_constant_override("separation", 4)
			chip.tooltip_text = k[2]
			chip.mouse_filter = Control.MOUSE_FILTER_PASS
			var ic := TextureRect.new()
			ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			ic.custom_minimum_size = Vector2(18, 18)
			if game.art.has(k[1]):
				ic.texture = game.art.sprites[k[1]]["texture"]
			chip.add_child(ic)
			var l := Label.new()
			l.add_theme_font_size_override("font_size", 13)
			chip.add_child(l)
			_stocks.add_child(chip)
			_stock_labels[k[0]] = l
		_storage_label = _stock_labels["store"]
	var totals := sim.totals()
	for r in MAIN_RES:
		_set_text(_stock_labels[r], str(int(totals.get(r, 0))))
	var other := 0
	for r: String in Content.get_value("resources", "RESOURCE_IDS"):
		if not MAIN_RES.has(r) and int(totals.get(r, 0)) > 0:
			other += int(totals[r])
	if _goods_button.text != "Goods %d" % other:
		_goods_button.text = "Goods %d" % other
	var beds := 0
	for b: Building in sim.buildings.values():
		beds += b.beds()
	_set_text(_stock_labels["pop"], "%d / %d" % [sim.settlers.size(), beds])
	var cap := sim.total_capacity()
	_set_text(_storage_label, "%d/%d" % [cap.x, cap.y])
	_storage_label.add_theme_color_override("font_color", _c("problem") if cap.x >= cap.y else _c("text"))
	var season: Dictionary = sim.season()
	var t := sim.time_of_day()
	var mins := floori(t * 24.0 * 60.0)
	var period := "Night" if t < 0.21 or t >= 0.87 else ("Dawn" if t < 0.3 else ("Morning" if t < 0.5 else ("Afternoon" if t < 0.7 else ("Evening" if t < 0.8 else "Dusk"))))
	_set_text(_clock, "%s %d/%d · Year %d · %02d:%02d" % [season["def"]["name"], int(season["day"]), int(Content.get_value("seasons", "SEASON_DAYS")), int(season["year"]), mins / 60, (mins % 60) / 10 * 10])
	var ms: Dictionary = Content.get_value("progression", "MILESTONES")
	var sub := "%s · %s" % [period, (ms.get(Progression.current(sim), {}) as Dictionary).get("name", "Camp")]
	if game.paused:
		sub += " · paused"
	elif game.falling_behind:
		sub += " · slowed"
	_set_text(_clock_sub, sub)
	var icon := "ui_moon" if period == "Night" or period == "Dusk" else ("ui_rain" if sim.raining else "ui_sun")
	if game.art.has(icon):
		_sun.texture = game.art.sprites[icon]["texture"]
	for v: int in _speed_buttons:
		var on := (v == 0 and game.paused) or (v != 0 and not game.paused and game.speed == v)
		(_speed_buttons[v] as Button).theme_type_variation = &"GoldOn" if on else &"TabButton"
	var idle := console.find_list("idle").size() if console.game != null else 0
	var badge: Label = (_tabs["people"] as Button).get_node("Badge")
	badge.visible = idle > 0
	badge.text = str(idle)
	badge.position = Vector2((_tabs["people"] as Button).size.x - 14, -4)
	for k: String in _tabs:
		var w: Control = {"people": _list, "areas": _areas, "towns": _towns, "families": _people, "realm": _realm, "goals": _goals}[k]
		(_tabs[k] as Button).theme_type_variation = &"TabOn" if w.visible else &"TabButton"


# ---- simple windows: People list, Goals, Goods -------------------------------------------------

## A window down the right side, under the top bar and above the console, with a title and ✕.
func _side_window(title: String, close: Callable) -> Array:
	var p := PanelContainer.new()
	p.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	p.offset_right = -8
	p.offset_top = 64
	p.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(340, 0)
	p.add_child(v)
	var head := HBoxContainer.new()
	var t := Label.new()
	t.text = title
	t.add_theme_font_override("font", _bold)
	t.add_theme_font_size_override("font_size", 18)
	t.add_theme_color_override("font_color", _c("accent"))
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(t)
	head.add_child(_button("Close", close, "Close (Esc)"))
	v.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(340, 120)
	var body := VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 4)
	scroll.add_child(body)
	v.add_child(scroll)
	p.visible = false
	_root.add_child(p)
	return [p, body, scroll]


func _fit_window(scroll: ScrollContainer, body: Control) -> void:
	var room := _root.size.y - 64 - GameConsole.HEIGHT - 110
	scroll.custom_minimum_size.y = clampf(body.get_combined_minimum_size().y, 60.0, maxf(120.0, room))


func _build_lists() -> void:
	var a := _side_window("People", toggle_people)
	_list = a[0]
	_list_body = a[1]
	_list_scroll = a[2]
	var g := _side_window("Goals", toggle_goals)
	_goals = g[0]
	_goals_body = g[1]
	_goals_scroll = g[2]
	var d := _side_window("All goods", toggle_goods)
	_goods = d[0]
	_goods_body = d[1]
	_goods_scroll = d[2]
	_goods.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_goods.offset_left = 8
	_goods.grow_horizontal = Control.GROW_DIRECTION_END


func toggle_people() -> void:
	_list.visible = not _list.visible
	_window_sound(_list.visible)
	if _list.visible:
		_close_windows(_list)
	_list_key = ""
	refresh_now()


func toggle_families() -> void:
	_people.visible = not _people.visible
	_window_sound(_people.visible)
	if _people.visible:
		_close_windows(_people)
	_people_key = ""
	refresh_now()


func toggle_goals() -> void:
	_goals.visible = not _goals.visible
	_window_sound(_goals.visible)
	if _goals.visible:
		_close_windows(_goals)
	_goals_key = ""
	refresh_now()


## Controls help (F1), as the browser's HelpModal: the mouse, orders, keys and the screen.
func toggle_help() -> void:
	if _help == null:
		var a := _side_window("Controls", toggle_help)
		_help = a[0]
		_help_body = a[1]
		_help_scroll = a[2]
		_help.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_help.visible = not _help.visible
	_window_sound(_help.visible)
	if not _help.visible:
		return
	for c in _help_body.get_children():
		c.queue_free()
	var b := game.settings.bindings
	var k := func(a: String) -> String: return b.label(a)
	var sections := [
		["Mouse", [["Select a settler or building", "Left-click"], ["Select a group", "Left-drag"], ["Add to selection", "Shift + click"],
			["Smart order: move, chop, mine, farm, build, hunt", "Right-click"], ["Pan the camera", "Middle-drag"], ["Zoom", "Wheel"]]],
		["Orders (people selected)", [["Move, then click a spot", k.call("move")], ["Stop", k.call("stop")], ["Hold position", k.call("hold")],
			["Attack (hunt), then click an animal", k.call("attack")], ["Gather, then click a tree, rock or bush", k.call("harvest")],
			["Build / Return goods / Train a main job", "%s / %s / %s" % [k.call("build"), k.call("returnGoods"), k.call("trainRole")]],
			["With a building selected: Upgrade / Pause / Demolish", "U / P / %s" % k.call("demolish")]]],
		["Keyboard", [["Pan", "%s, %s, %s, %s" % [k.call("panUp"), k.call("panLeft"), k.call("panDown"), k.call("panRight")]], ["Pause", k.call("pause")],
			["Speed", "%s / %s / %s" % [k.call("speed1"), k.call("speed2"), k.call("speed3")]], ["Pick in the build menu", "Q W E R / A S D F / Z X C V"],
			["Find yourself, the ruler", k.call("findRuler")], ["Rally (ruler selected)", k.call("rally")], ["Survey for ore", k.call("survey")],
			["Jump to the Town Hall", k.call("homeView")], ["People / Areas / Towns / Families / Realm / Goals", "%s %s %s %s %s %s" % [k.call("people"), k.call("areas"), k.call("towns"), k.call("families"), k.call("realm"), k.call("goals")]],
			["All goods / Valley today / See more", "%s / %s / %s" % [k.call("goods"), k.call("today"), k.call("seeMore")]], ["Health bars", k.call("healthBars")],
			["Mark / unmark for harvest", "%s / %s" % [k.call("harvest"), k.call("unmark")]], ["Full screen", k.call("fullscreen")],
			["Next idle settler", k.call("nextIdle")], ["Select everyone", k.call("selectAll")], ["Save", k.call("save")], ["Cancel / menu", k.call("cancel")]]],
		["The screen", [["Top: stores (Goods for the rest), windows, clock", ""], ["Bottom left: the minimap", ""],
			["Bottom middle: what you selected; See more opens every detail", ""], ["Bottom right: the command card; hover a button to read it", ""]]],
	]
	for sec: Array in sections:
		_help_body.add_child(_row_label(sec[0], _c("accent"), 15))
		var g := GridContainer.new()
		g.columns = 2
		for row: Array in sec[1]:
			var l := _row_label(row[0], _c("text"), 12)
			l.custom_minimum_size = Vector2(360, 0)
			g.add_child(l)
			var r := _row_label(row[1], _c("accent"), 12)
			r.custom_minimum_size = Vector2(160, 0)
			g.add_child(r)
		_help_body.add_child(g)
	_help_scroll.custom_minimum_size = Vector2(560, minf(_root.size.y - GameConsole.HEIGHT - 150, 600))
	_help.reset_size()
	_center(_help)


func toggle_goods() -> void:
	_goods.visible = not _goods.visible
	_window_sound(_goods.visible)
	_goods_key = ""
	refresh_now()


func _row_label(t: String, col: Color, size: int = 14) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_color_override("font_color", col)
	l.add_theme_font_size_override("font_size", size)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(320, 0)
	return l


## The People window: everyone, with their role and what they are doing; click to select.
func _refresh_list() -> void:
	if not _list.visible:
		return
	var sim := game.sim
	var key := "%s|%d" % [game.selected, sim.tick / 20]
	if key == _list_key:
		return
	_list_key = key
	for c in _list_body.get_children():
		c.queue_free()
	for s in sim.settlers:
		# A row per person (a clickable panel: text inside a Button gets no width to wrap in).
		var row := PanelContainer.new()
		var job := "Ruler (you)" if s.ruler else ("Child" if s.life_stage == "child" else Roles.job_name(s.job))
		var idle := s.task == null and s.idle_reason != ""
		row.add_theme_stylebox_override("panel", _box(Color("#1d4a1b") if game.selected.has(s.id) else _c("panelHi"), _c("panelEdge"), 0, 6))
		row.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var v := VBoxContainer.new()
		v.add_theme_constant_override("separation", 0)
		var top := HBoxContainer.new()
		var n := _row_label(s.name, _c("text"), 15)
		n.custom_minimum_size = Vector2(0, 0)
		n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		top.add_child(n)
		var jl := _row_label(job, _c("textDim"), 12)
		jl.custom_minimum_size = Vector2(0, 0)
		jl.autowrap_mode = TextServer.AUTOWRAP_OFF
		top.add_child(jl)
		v.add_child(top)
		var st := _row_label(("! " + s.idle_reason) if idle else GameConsole._plain(_describe(s)), Color("#ffc890") if idle else _c("textDim"), 12)
		st.custom_minimum_size = Vector2(300, 0)
		v.add_child(st)
		row.add_child(v)
		var sid := s.id
		row.gui_input.connect(func(e: InputEvent) -> void:
			if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
				var who := game.sim.settler(sid)
				if who != null:
					game.selected = [sid]
					game.selected_building = -1
					game.camera.target_pos = Vector2(who.x, who.y) * WorldView.TILE_PX
					_list_key = ""
					refresh_now())
		_list_body.add_child(row)
	var home_beds := 0
	var bunks := 0
	var used := 0
	for b: Building in sim.buildings.values():
		if b.is_permanent_home():
			home_beds += b.beds()
			for s in sim.settlers:
				if s.home_id == b.id:
					used += 1
		else:
			bunks += b.beds()
	_list_body.add_child(_row_label("Home beds %d/%d · hall bunks and bedrolls %d" % [used, home_beds, bunks], _c("textDim"), 12))
	_list_body.add_child(_row_label("New people come from households (Families window) and from visitors you welcome with food.", _c("textDim"), 12))
	_fit_window(_list_scroll, _list_body)


## The Goals window: where the valley stands, the next milestone's requirements and unlocks.
func _refresh_goals() -> void:
	if not _goals.visible:
		return
	var sim := game.sim
	var key := "%s|%d" % [sim.reached, sim.tick / 30]
	if key == _goals_key:
		return
	_goals_key = key
	for c in _goals_body.get_children():
		c.queue_free()
	var ms: Dictionary = Content.get_value("progression", "MILESTONES")
	_goals_body.add_child(_row_label(str((ms.get(Progression.current(sim), {}) as Dictionary).get("name", "Camp")), _c("accent"), 17))
	var nid := Progression.next_milestone(sim)
	if nid == "":
		_goals_body.add_child(_row_label("Every milestone reached. Keep building.", _c("textDim")))
	else:
		var nm: Dictionary = ms[nid]
		_goals_body.add_child(_row_label("Next: %s. %s" % [nm["name"], nm.get("description", "")], _c("textDim"), 13))
		for req: Dictionary in nm.get("requirements", []):
			_goals_body.add_child(req_row(Progression.requirement_progress(sim, req), 14))
		var unlocks: Array = nm.get("unlocks", [])
		if not unlocks.is_empty():
			_goals_body.add_child(_row_label("Unlocks: %s" % ", ".join(PackedStringArray(unlocks)), _c("textDim"), 12))
		# Later milestones, briefly.
		var order: Array = Content.get_value("progression", "MILESTONE_ORDER")
		var later: PackedStringArray = []
		for id: String in order.slice(order.find(nid) + 1):
			later.append(str(ms[id]["name"]))
		if not later.is_empty():
			_goals_body.add_child(_row_label("After that: %s" % ", ".join(later), _c("textDim"), 12))
	_goals_body.add_child(_button("Open \"Valley today\"", func() -> void: game.open_today()))
	_fit_window(_goals_scroll, _goals_body)


## The Goods drawer: every good beyond the five on the bar.
func _refresh_goods() -> void:
	if not _goods.visible:
		return
	var totals := game.sim.totals()
	var key := str(totals)
	if key == _goods_key:
		return
	_goods_key = key
	for c in _goods_body.get_children():
		c.queue_free()
	var none: PackedStringArray = []
	var grid := GridContainer.new()
	grid.columns = 2
	for r: String in Content.get_value("resources", "RESOURCE_IDS"):
		if MAIN_RES.has(r):
			continue
		var n := int(totals.get(r, 0))
		if n <= 0:
			none.append(str(Defs.resource(r)["name"]))
			continue
		var h := HBoxContainer.new()
		h.custom_minimum_size = Vector2(160, 0)
		h.add_child(_icon(r, 20))
		var l := _row_label("%s  %d" % [Defs.resource(r)["name"], n], _c("text"), 13)
		l.custom_minimum_size = Vector2(130, 0)
		h.add_child(l)
		grid.add_child(h)
	_goods_body.add_child(grid)
	if not none.is_empty():
		_goods_body.add_child(_row_label("None yet: %s" % ", ".join(none), _c("textDim"), 12))
	_fit_window(_goods_scroll, _goods_body)


## "See more" for several people: each with what they are doing.
func _group_text() -> String:
	var lines: PackedStringArray = []
	for id in game.selected:
		var s := game.sim.settler(id)
		if s != null:
			lines.append("[b]%s[/b] — %s" % [s.name, _describe(s)])
	return "\n".join(lines)


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




## The People window: what growth is waiting on, the visitor, travellers on the way, households.
func _refresh_people() -> void:
	if not _people.visible:
		return
	var sim := game.sim
	var lines: PackedStringArray = ["[b]Families and visitors[/b]"]
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

func _window_sound(open: bool) -> void:
	game.audio.play("uiOpen" if open else "uiClose")


func _close_windows(keep: Control) -> void:
	for w: Control in [_people, _areas, _towns, _realm, _list, _goals]:
		if w != keep:
			w.visible = false


func toggle_realm() -> void:
	_realm.visible = not _realm.visible
	_window_sound(_realm.visible)
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
	_window_sound(_towns.visible)
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
		rl.text = "%s › %s: keep %d %s · %s" % [Settlements.name_of(sim, Settlements.id_of_building(sim, src)) if src != null else "?", Settlements.name_of(sim, Settlements.id_of_building(sim, dst)) if dst != null else "?",
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
	_window_sound(_areas.visible)
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
	return _title.visible or _modal.visible or _busy.visible or _today.visible or _studio.visible


func show_busy(text: String) -> void:
	_busy_label.text = text
	_busy.visible = true
	_title.visible = false
	close_modal()


func show_play() -> void:
	_today.visible = false
	_busy.visible = false
	_title.visible = false
	close_modal()
	_top.visible = true
	console.visible = true
	refresh_now()


## The title, as the browser game's (src/ui/App.tsx Title and styles.css .title-screen): no box;
## the logo, tagline and menu stand at the left over the living valley, which a dark gradient
## shades behind them. Continue, New valley, Load a valley, Settings; Full screen below; a tip;
## the credit and version at the bottom right.
func show_title(message: String = "") -> void:
	_today.visible = false
	_tutorial.visible = false
	_busy.visible = false
	close_modal()
	_top.visible = false
	console.visible = false
	for c in _title.get_children():
		c.queue_free()
	_title.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shade := TextureRect.new()
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.38, 0.7, 1.0])
	g.colors = PackedColorArray([Color(0.063, 0.086, 0.071, 0.82), Color(0.063, 0.086, 0.071, 0.55), Color(0.063, 0.086, 0.071, 0.0), Color(0.063, 0.086, 0.071, 0.0)])
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.width = 256
	gt.height = 4
	shade.texture = gt
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_title.add_child(shade)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 0)
	_title.add_child(col)
	# The logo: "Little" in cream over "Valley" in gold, indented, with the browser's hard shadow.
	var size := clampi(roundi(_root.size.x * 0.09), 56, 112)
	var logo := VBoxContainer.new()
	logo.add_theme_constant_override("separation", -roundi(size * 0.32))
	col.add_child(logo)
	for part: Array in [["Little", _c("text"), 0], ["Valley", _c("accent"), roundi(size * 0.6)]]:
		var row := HBoxContainer.new()
		var pad := Control.new()
		pad.custom_minimum_size = Vector2(int(part[2]), 0)
		row.add_child(pad)
		var h := Label.new()
		h.text = part[0]
		h.add_theme_font_override("font", _bold)
		h.add_theme_font_size_override("font_size", size)
		h.add_theme_color_override("font_color", part[1])
		h.add_theme_color_override("font_shadow_color", Color("#2b2033"))
		h.add_theme_constant_override("shadow_offset_x", 5)
		h.add_theme_constant_override("shadow_offset_y", 5)
		h.add_theme_constant_override("line_spacing", -int(size * 0.25))
		row.add_child(h)
		logo.add_child(row)
	var tag := Label.new()
	tag.text = "Clear a meadow, plant the first rows, and grow a Town Hall into a kingdom one season at a time."
	tag.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tag.custom_minimum_size = Vector2(380, 0)
	tag.add_theme_font_size_override("font_size", 18)
	tag.add_theme_constant_override("shadow_offset_y", 2)
	col.add_child(_spacer(22))
	col.add_child(tag)
	col.add_child(_spacer(26))
	if message != "":
		var m := _row_label(message, _c("problem"), 14)
		col.add_child(m)
		col.add_child(_spacer(8))
	var menu := VBoxContainer.new()
	menu.custom_minimum_size = Vector2(260, 0)
	menu.add_theme_constant_override("separation", 8)
	menu.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	col.add_child(menu)
	var worlds := game.store.worlds()
	if not worlds.is_empty():
		var latest: Dictionary = worlds[0]
		var id: String = latest["id"]
		menu.add_child(_title_button("Continue", func() -> void: game.load_world(id), "%s — day %d, %d people" % [latest["name"], int((latest["points"] as Array)[0].get("day", 0)), int((latest["points"] as Array)[0].get("population", 0))], true))
	menu.add_child(_title_button("New valley", show_new_world, "Name yourself and your valley, and choose your land", worlds.is_empty()))
	menu.add_child(_title_button("Load a valley", show_load, "Every valley saved on this computer"))
	menu.add_child(_title_button("Settings", show_settings, "Sound, play and keys"))
	if Files.is_web():
		if game.pwa.update_waiting:
			menu.add_child(_title_button("Update now", func() -> void: game.pwa.apply_update(), "Save and close other Little Valley tabs first; updating reloads them too."))
		_offer_old_game(menu)
	# The shell buttons (src/ui/ShellButtons.tsx) and the tip under them.
	var shell := HBoxContainer.new()
	shell.add_theme_constant_override("separation", 6)
	col.add_child(_spacer(12))
	col.add_child(shell)
	if Files.is_web() and not Pwa.runs_as_app():
		_offer_install(shell)
	var fs := _button("Full screen", _toggle_fullscreen, "Play full screen (F)")
	fs.theme_type_variation = &"TabButton"
	shell.add_child(fs)
	var tip := _row_label("Tip: play full screen so the mouse can't slip off the screen edge while scrolling.", _c("textDim"), 12)
	tip.custom_minimum_size = Vector2(330, 0)
	col.add_child(_spacer(6))
	col.add_child(tip)
	var credit := Label.new()
	credit.text = "All art and sound are generated in code. %s" % ("Saved in this browser." if Files.is_web() else "Saved in %s." % UserDir.path().trim_suffix("/"))
	credit.add_theme_font_size_override("font_size", 12)
	credit.add_theme_color_override("font_color", _c("textDim"))
	credit.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	credit.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	credit.offset_right = -14
	credit.offset_top = -30
	credit.offset_bottom = -10
	_title.add_child(credit)
	_title.visible = true
	_place_title(col)


func _spacer(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


## A title menu button (src/ui/pixel.css .title-screen .menu .btn): 20 px, left-aligned, a 3 px
## turf edge and a 3 px drop; the primary one green.
func _title_button(text: String, on_press: Callable, tip: String = "", primary: bool = false) -> Button:
	var b := _button(text, on_press, tip)
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.add_theme_font_size_override("font_size", 20)
	var looks := {"normal": [Color("#4f8a3c") if primary else Color("#634024"), Color("#a8e070") if primary else Color("#2f6a27")],
		"hover": [Color("#5e9a45") if primary else Color("#8a5c36"), Color("#a8e070") if primary else Color("#4f9636")],
		"pressed": [Color("#8a6a1c"), _c("accent")]}
	for st: String in looks:
		var sb := _soil_button(looks[st][0], looks[st][1], 3)
		sb.shadow_offset = Vector2(0, 3) if st != "pressed" else Vector2.ZERO
		sb.content_margin_left = 14
		sb.content_margin_top = 9
		sb.content_margin_bottom = 9
		b.add_theme_stylebox_override(st, sb)
	if primary:
		b.add_theme_color_override("font_color", Color("#fffbe8"))
		b.add_theme_color_override("font_hover_color", Color("#fffbe8"))
	return b


func _toggle_fullscreen() -> void:
	var full := DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if full else DisplayServer.WINDOW_MODE_FULLSCREEN)


func _version() -> String:
	return FileAccess.get_file_as_string("res://VERSION").strip_edges() if FileAccess.file_exists("res://VERSION") else "dev"


## The menu stands at 8% of the width from the left, centred vertically (as .title-screen).
func _place_title(col: Control) -> void:
	await get_tree().process_frame
	col.reset_size()
	col.position = Vector2(_root.size.x * 0.08, maxf(16.0, (_root.size.y - col.size.y) / 2.0))


# ---- modals: a dimmed scrim with a framed box in the middle (src/ui/Modals.tsx) ----------------

var _modal := Control.new()
var _modal_box := PanelContainer.new()


## Opens a modal titled `title` and returns the box's column to fill. Esc or a click on the dim
## outside closes it.
func open_modal(title: String, width: float = 520.0) -> VBoxContainer:
	if _modal.get_parent() == null:
		_modal.set_anchors_preset(Control.PRESET_FULL_RECT)
		var scrim := ColorRect.new()
		scrim.color = Color(0.047, 0.039, 0.071, 0.55)
		scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
		scrim.gui_input.connect(func(e: InputEvent) -> void:
			if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
				close_modal())
		_modal.add_child(scrim)
		_modal.add_child(_modal_box)
		_root.add_child(_modal)
	for c in _modal_box.get_children():
		c.queue_free()
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(width, 0)
	v.add_theme_constant_override("separation", 8)
	scroll.add_child(v)
	_modal_box.add_child(scroll)
	var h := Label.new()
	h.text = title
	h.add_theme_font_override("font", _bold)
	h.add_theme_font_size_override("font_size", 20)
	h.add_theme_color_override("font_color", _c("accent"))
	v.add_child(h)
	_modal.visible = true
	_modal.move_to_front()
	_fit_modal.call_deferred(scroll, v)
	return v


func _fit_modal(scroll: ScrollContainer, v: Control) -> void:
	await get_tree().process_frame
	scroll.custom_minimum_size = Vector2(v.size.x, minf(v.get_combined_minimum_size().y, _root.size.y * 0.9 - 40))
	_modal_box.reset_size()
	_modal_box.position = (_root.size - _modal_box.size) / 2.0


func close_modal() -> void:
	if _modal.visible:
		_modal.visible = false
		for c in _modal_box.get_children():
			c.queue_free()


## Something over the whole valley (the title, a window, the busy note, the studio): the camera
## should not scroll under it.
func title_or_window_open() -> bool:
	return _title.visible or _modal.visible or _busy.visible or _studio.visible


func modal_open() -> bool:
	return _modal.visible


func _h3(t: String) -> Label:
	var l := _row_label(t, _c("accent"), 16)
	l.add_theme_font_override("font", _bold)
	return l


func _buttons_row(items: Array) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_theme_constant_override("separation", 8)
	for b: Control in items:
		row.add_child(b)
	return row


## The pause menu (Esc while playing), as the browser's PauseMenu.
func toggle_menu() -> void:
	if modal_open():
		close_modal()
		_window_sound(false)
		return
	_window_sound(true)
	var v := open_modal(game.world_name if game.world_name != "" else "Menu", 360)
	var resume := _button("Resume", close_modal)
	resume.theme_type_variation = &"PrimaryButton"
	v.add_child(resume)
	v.add_child(_button("Save now", func() -> void:
		game.save_now()
		close_modal()))
	v.add_child(_button("Settings", show_settings))
	v.add_child(_button("Controls", func() -> void:
		close_modal()
		toggle_help()))
	v.add_child(_button("Save points", show_points, "Every save of this valley; open an earlier one or name the current one"))
	v.add_child(_button("Replay introduction" if game.tutorial["done"] else "Skip the introduction", func() -> void:
		if game.tutorial["done"]:
			game.restart_tutorial()
		else:
			game.skip_tutorial()
		close_modal()))
	if game.pwa.update_waiting:
		v.add_child(_button("Update now", func() -> void: game.update_now(), "This valley is saved first."))
	if game.sim != null and game.sim.ruler() == null:
		var throne := LineEdit.new()
		throne.placeholder_text = "Your ruler's name"
		throne.max_length = 24
		v.add_child(throne)
		v.add_child(_button("Take the throne", func() -> void:
			if bool(game.command({"type": "takeThrone", "name": throne.text})["ok"]):
				close_modal(), "Walk the map as your valley's ruler"))
	var quit := _button("Save and return to title", func() -> void:
		game.save_now()
		game.sim = null
		show_title())
	quit.theme_type_variation = &"DangerButton"
	v.add_child(quit)
	v.add_child(_row_label("The valley saves itself every %d minutes. Saves are kept in %s." % [game.settings.autosave_minutes, "this browser" if Files.is_web() else UserDir.path().trim_suffix("/")], _c("textDim"), 12))


## This valley's save points, newest first: open an earlier one, or keep the current one by name.
func show_points() -> void:
	var v := open_modal("Save points", 520)
	var row := HBoxContainer.new()
	var name_edit := LineEdit.new()
	name_edit.placeholder_text = "Name a save to keep it for good"
	name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name_edit)
	row.add_child(_button("Save", func() -> void:
		game.save_now(name_edit.text.strip_edges())
		show_points()))
	v.add_child(row)
	for p: Dictionary in game.store.points(game.world_id):
		var point: String = p["id"]
		var when := Time.get_datetime_string_from_unix_time(int(float(p.get("savedAt", 0)) / 1000.0), true)
		var lbl := str(p.get("label", ""))
		var line := HBoxContainer.new()
		var t := _row_label("%s · day %d%s" % [when, int(p.get("day", 0)), "  “%s”" % lbl if lbl != "" else ""], _c("text"), 13)
		t.custom_minimum_size = Vector2(0, 0)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(t)
		line.add_child(_small("Open", func() -> void:
			close_modal()
			game.load_world(game.world_id, point)))
		v.add_child(line)
	v.add_child(_buttons_row([_button("Download a copy", func() -> void: game.download_save(), "This valley as a file, to keep or move to another computer"), _button("Back", toggle_menu)]))


## "Your valleys" (as the browser's LoadModal): every valley saved on this computer, with Play and
## Delete. Nothing to upload: saves are kept in the game's folder.
func show_load() -> void:
	var v := open_modal("Your valleys", 560)
	var worlds := game.store.worlds()
	if worlds.is_empty():
		v.add_child(_row_label("No saved valleys yet. Start a new one from the title.", _c("textDim"), 14))
	var ms: Dictionary = Content.get_value("progression", "MILESTONES")
	for w: Dictionary in worlds:
		var id: String = w["id"]
		var p: Dictionary = (w["points"] as Array)[0]
		var slot := PanelContainer.new()
		slot.add_theme_stylebox_override("panel", _soil_button(Color("#8a5c36"), Color("#4c311b")))
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 8)
		var info := VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.add_theme_constant_override("separation", 0)
		var nm := _row_label(str(w["name"]), _c("text"), 17)
		nm.custom_minimum_size = Vector2(0, 0)
		info.add_child(nm)
		var when := Time.get_datetime_string_from_unix_time(int(float(p.get("savedAt", 0)) / 1000.0), true)
		var level := str((ms.get(str(p.get("milestone", "")), {}) as Dictionary).get("name", ""))
		var meta := _row_label("%sday %d, %d settlers. Saved %s" % [level + ", " if level != "" else "", int(p.get("day", 0)), int(p.get("population", 0)), when], _c("textDim"), 12)
		meta.custom_minimum_size = Vector2(0, 0)
		info.add_child(meta)
		h.add_child(info)
		var acts := HBoxContainer.new()
		acts.add_theme_constant_override("separation", 6)
		var play := _small("Play", func() -> void:
			close_modal()
			game.load_world(id))
		play.theme_type_variation = &"PrimaryButton"
		acts.add_child(play)
		var del := _small("Delete", func() -> void: pass)
		del.pressed.connect(func() -> void:
			for c in acts.get_children():
				c.queue_free()
			var sure := _small("Delete for good", func() -> void:
				game.store.delete_world(id)
				show_load())
			sure.theme_type_variation = &"DangerButton"
			acts.add_child(sure)
			acts.add_child(_small("Keep", show_load)))
		acts.add_child(del)
		h.add_child(acts)
		slot.add_child(h)
		v.add_child(slot)
	var folder := "your browser" if Files.is_web() else UserDir.path().trim_suffix("/")
	v.add_child(_row_label("Valleys are saved on this computer, in %s." % folder, _c("textDim"), 12))
	var buttons: Array = []
	if not Files.is_web():
		buttons.append(_button("Open the save folder", func() -> void: OS.shell_open(ProjectSettings.globalize_path("user://saves"))))
	buttons.append(_button("Bring in a save file", func() -> void:
		close_modal()
		game.load_from_file(), "A save from another computer, or from the old browser game"))
	buttons.append(_button("Back", func() -> void:
		close_modal()
		if game.sim == null:
			show_title()))
	v.add_child(_buttons_row(buttons))


## Settings (as the browser's SettingsModal): Sound, Play, Keys, and where things are kept.
func show_settings() -> void:
	var v := open_modal("Settings", 560)
	var s := game.settings
	v.add_child(_h3("Sound"))
	for row: Array in [["Master", "master_volume"], ["Music", "music_volume"], ["Effects", "sfx_volume"]]:
		v.add_child(_volume_row(row[0], row[1]))
	v.add_child(_setting_row("Mute everything", _check("", s.muted, func(on: bool) -> void:
		s.muted = on
		s.apply_audio(game.audio))))
	v.add_child(_h3("Play"))
	v.add_child(_setting_row("Scroll when the mouse touches the screen edge", _check("", s.edge_scroll, func(on: bool) -> void:
		s.edge_scroll = on
		game.camera.edge_scroll = on)))
	var speed := HSlider.new()
	speed.min_value = 0.5
	speed.max_value = 2.0
	speed.step = 0.25
	speed.value = s.scroll_speed
	speed.custom_minimum_size = Vector2(200, 0)
	speed.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	speed.focus_mode = Control.FOCUS_NONE
	speed.value_changed.connect(func(x: float) -> void:
		s.scroll_speed = x
		game.camera.scroll_speed = x)
	speed.drag_ended.connect(func(_changed: bool) -> void: s.save())
	v.add_child(_setting_row("Scroll speed (keys and screen edge)", speed))
	v.add_child(_setting_row("Health bars", _choice(["Over everyone", "Only when hurt"], 0 if s.health_bars == "always" else 1, func(i: int) -> void: s.health_bars = "always" if i == 0 else "hurt")))
	var autos := [1, 2, 3, 5, 10]
	v.add_child(_setting_row("Autosave every", _choice(autos.map(func(m: int) -> String: return "%d min" % m), maxi(0, autos.find(s.autosave_minutes)), func(i: int) -> void: s.autosave_minutes = autos[i])))
	var sizes := [0.85, 1.0, 1.25, 1.5]
	v.add_child(_setting_row("Interface size", _choice(sizes.map(func(z: float) -> String: return "%d%%" % roundi(z * 100)), maxi(0, sizes.find(s.ui_scale)), func(i: int) -> void:
		s.ui_scale = sizes[i]
		_apply_scale())))
	v.add_child(_setting_row("Reduced motion (no sway, still water)", _check("", s.reduced_motion, func(on: bool) -> void: s.reduced_motion = on)))
	v.add_child(_setting_row("Fewer effects (for slower computers)", _check("", s.effects == "low", func(on: bool) -> void: s.effects = "low" if on else "high")))
	v.add_child(_setting_row("Full screen", _check("", DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN, func(_on: bool) -> void: _toggle_fullscreen())))
	v.add_child(_h3("Keys"))
	var bindings_panel := KeyBindingsPanel.new()
	bindings_panel.setup(s, true)
	v.add_child(bindings_panel)
	v.add_child(_h3("Version"))
	v.add_child(_row_label("Made with Godot %s. Saves and settings are kept in %s." % [_version(), "this browser" if Files.is_web() else UserDir.path().trim_suffix("/")], _c("textDim"), 12))
	var done := _button("Done", func() -> void:
		s.save()
		if game.sim != null:
			toggle_menu()
			toggle_menu()
		else:
			close_modal())
	done.theme_type_variation = &"PrimaryButton"
	v.add_child(_buttons_row([done]))


func _setting_row(text: String, control: Control) -> HBoxContainer:
	var row := HBoxContainer.new()
	var l := _row_label(text, _c("text"), 14)
	l.custom_minimum_size = Vector2(0, 0)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(l)
	row.add_child(control)
	return row


func _choice(items: Array, selected: int, on_pick: Callable) -> OptionButton:
	var o := OptionButton.new()
	for it: String in items:
		o.add_item(it)
	o.selected = selected
	o.focus_mode = Control.FOCUS_NONE
	o.item_selected.connect(func(i: int) -> void:
		on_pick.call(i)
		game.settings.save())
	return o


## "A new world", as the browser's NewWorldModal: your name (you walk the map as the ruler), the
## valley's name, the land as cards with what each is like, a seed with Reroll, and whether to
## show the introduction.
func show_new_world() -> void:
	var v := open_modal("A new world", 720)
	v.add_child(_row_label("Your name - you will walk the map as its ruler", _c("text"), 13))
	var ruler_edit := LineEdit.new()
	ruler_edit.placeholder_text = "Type your name"
	ruler_edit.max_length = 24
	v.add_child(ruler_edit)
	v.add_child(_row_label("Name of your valley", _c("text"), 13))
	var name_edit := LineEdit.new()
	name_edit.text = "Little Valley"
	v.add_child(name_edit)
	v.add_child(_row_label("Choose your land", _c("text"), 13))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	v.add_child(grid)
	var habitats: Dictionary = Content.get_value("habitats", "HABITATS")
	var chosen := [str(Content.get_value("habitats", "HABITAT_IDS")[0])]
	var cards := {}
	var paint := func() -> void:
		for k: String in cards:
			var on: bool = k == chosen[0]
			(cards[k] as PanelContainer).add_theme_stylebox_override("panel", _soil_button(Color("#1d4a1b") if on else Color("#634024"), Color("#4f9636") if on else Color("#4c311b")))
	for k: String in habitats:
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(232, 0)
		card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var cv := VBoxContainer.new()
		cv.add_theme_constant_override("separation", 2)
		var n := _row_label(str(habitats[k]["name"]), _c("accent"), 15)
		n.custom_minimum_size = Vector2(0, 0)
		cv.add_child(n)
		var d := _row_label(str(habitats[k]["description"]), _c("textDim"), 12)
		d.custom_minimum_size = Vector2(204, 0)
		cv.add_child(d)
		card.add_child(cv)
		var id := k
		card.gui_input.connect(func(e: InputEvent) -> void:
			if e is InputEventMouseButton and (e as InputEventMouseButton).pressed:
				chosen[0] = id
				paint.call())
		cards[k] = card
		grid.add_child(card)
	paint.call()
	v.add_child(_row_label("Seed (optional - the same seed and land always make the same world)", _c("text"), 13))
	var seed_row := HBoxContainer.new()
	var seed_edit := LineEdit.new()
	seed_edit.text = str(randi() % 1000000000)
	seed_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	seed_row.add_child(seed_edit)
	seed_row.add_child(_button("Reroll", func() -> void: seed_edit.text = str(randi() % 1000000000)))
	v.add_child(seed_row)
	var intro := _check("", true, func(_on: bool) -> void: pass)
	v.add_child(_setting_row("Show the introduction", intro))
	var found := _button("Found the realm", func() -> void:
		var ruler := ruler_edit.text.strip_edges()
		if ruler == "":
			toast("Type your name first: you walk the map as the valley's ruler.", "warn")
			ruler_edit.grab_focus()
			return
		var seed_text := seed_edit.text.strip_edges()
		var seed_value := int(seed_text) if seed_text.is_valid_int() else (seed_text.hash() if seed_text != "" else randi() % 2147483647)
		var valley := name_edit.text.strip_edges()
		close_modal()
		game.new_world(seed_value, chosen[0], valley if valley != "" else "Little Valley", ruler, intro.button_pressed))
	found.theme_type_variation = &"PrimaryButton"
	v.add_child(_buttons_row([_button("Back", close_modal), found]))
	ruler_edit.grab_focus.call_deferred()


## Adds "Bring in valleys from the old game" to the title when the old browser game has valleys
## on this address that are not here yet. Their originals stay where they are.
func _offer_old_game(v: BoxContainer) -> void:
	var pending := await game.old_game_pending()
	if pending.is_empty() or not is_instance_valid(v):
		return
	var names := ", ".join(pending.map(func(e: Dictionary) -> String: return str(e["name"])))
	var b := _button("Bring in %d valley%s from the old game" % [pending.size(), "" if pending.size() == 1 else "s"], func() -> void:
		show_busy("Bringing your valleys over…")
		await get_tree().process_frame
		var problems := game.import_old_game(pending)
		show_title("" if problems.is_empty() else "Some valleys could not be brought over (they are untouched in the old game): " + "; ".join(problems)),
		"%s. The old game's saves are copied, never changed or removed." % names)
	v.add_child(b)
	v.move_child(b, 1)


## The introduction's current step (or its closing words), top left.
func _refresh_tutorial() -> void:
	var t: Dictionary = game.tutorial
	var outro: bool = t["done"] and Time.get_ticks_msec() < game.tutorial_outro_until
	var key := "%s|%s|%s" % [t["step"], t["done"], outro]
	_tutorial.visible = outro or not t["done"]
	if key == _tutorial_key:
		return
	_tutorial_key = key
	for c in _tutorial_box.get_children():
		c.queue_free()
	if not _tutorial.visible:
		return
	var i := int(t["step"])
	var step: Dictionary = Tutorial.STEPS[mini(i, Tutorial.STEPS.size() - 1)]
	var h := Label.new()
	h.text = "Your valley awaits" if outro else str(step["title"])
	h.add_theme_font_override("font", _bold)
	h.add_theme_color_override("font_color", _c("accent"))
	_tutorial_box.add_child(h)
	var body := Label.new()
	body.text = Tutorial.OUTRO if outro else str(step["text"])
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size = Vector2(360, 0)
	_tutorial_box.add_child(body)
	if outro:
		return
	var foot := HBoxContainer.new()
	var pips := Label.new()
	var marks := ""
	for n in Tutorial.STEPS.size():
		marks += "•" if n <= i else "·"
	pips.text = marks
	pips.tooltip_text = "Step %d of %d" % [i + 1, Tutorial.STEPS.size()]
	pips.mouse_filter = Control.MOUSE_FILTER_PASS
	pips.add_theme_color_override("font_color", _c("accent"))
	pips.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(pips)
	foot.add_child(_button("Skip introduction", func() -> void:
		game.skip_tutorial()
		refresh_now()))
	_tutorial_box.add_child(foot)


## Valley today (src/ui/Village.tsx): last session's recap, what needs attention, ideas for
## today and the next milestone. Every line jumps to what it talks about.
## "Valley today", as the browser's (src/ui/Village.tsx): a column at the left under the top bar,
## above the console. A recap of the last session, what needs attention (!) and ideas for today
## (→) as cards that jump to what they name, the next milestone's checklist, and Start playing.
func show_today(o: Dictionary) -> void:
	for c in _today.get_children():
		c.queue_free()
	_tutorial.visible = false
	_today.set_anchors_preset(Control.PRESET_TOP_LEFT)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_today.add_child(scroll)
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(372, 0)
	v.add_theme_constant_override("separation", 6)
	scroll.add_child(v)
	var head := HBoxContainer.new()
	var h := _row_label("%s today" % (game.world_name if game.world_name != "" else "Your valley"), _c("accent"), 20)
	h.add_theme_font_override("font", _bold)
	h.custom_minimum_size = Vector2(0, 0)
	h.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(h)
	head.add_child(_small("Close", _close_today))
	v.add_child(head)
	v.add_child(_today_text(str(o["sinceNote"]), _c("textDim")))
	if o["since"] is Array:
		for line: String in o["since"]:
			v.add_child(_today_text("•  " + line, _c("text")))
	for section: Array in [["Needs attention", o["issues"], "!", Color("#c8841c")], ["Ideas for today", o["goals"], ">", Color("#4f8a3c")]]:
		var items: Array = section[1]
		if items.is_empty():
			continue
		v.add_child(_h3(section[0]))
		for item: Dictionary in items:
			v.add_child(_today_card(item, section[2], section[3]))
	var ms: Dictionary = o["milestone"]
	if ms["next"] != null:
		v.add_child(_h3("%s, next: %s" % [ms["current"], ms["next"]]))
		for r: Dictionary in ms["reqs"]:
			var row := req_row(r, 13)
			row.custom_minimum_size = Vector2(360, 0)
			v.add_child(row)
	var start := _button("Start playing", _close_today)
	start.theme_type_variation = &"PrimaryButton"
	v.add_child(start)
	_root.move_child(_today, -1)
	_today.visible = true
	await get_tree().process_frame
	scroll.custom_minimum_size = Vector2(372, minf(v.get_combined_minimum_size().y, _root.size.y - 62 - GameConsole.HEIGHT - 22))
	_today.reset_size()
	_today.position = Vector2(6, 62)


## A milestone requirement as the browser's .req row: a square box (filled green when done), the
## label and, until done, the count. Done rows are dimmed.
func req_row(r: Dictionary, size: int = 13) -> HBoxContainer:
	var done := bool(r["done"])
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var box := Panel.new()
	box.custom_minimum_size = Vector2(14, 14)
	box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var sb := StyleBoxFlat.new()
	sb.bg_color = _c("good") if done else Color(0, 0, 0, 0)
	sb.border_color = _c("good") if done else _c("lineHi")
	sb.set_border_width_all(2)
	box.add_theme_stylebox_override("panel", sb)
	row.add_child(box)
	var l := _row_label("%s%s" % [r["label"], "" if done else " (%d/%d)" % [int(r["current"]), int(r["target"])]], _c("textDim") if done else _c("text"), size)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(l)
	return row


func _today_text(t: String, col: Color) -> Label:
	var l := _row_label(t, col, 13)
	l.custom_minimum_size = Vector2(360, 0)
	return l


## An idea or a problem as a card: a coloured mark, the title in bold and the detail after it.
func _today_card(item: Dictionary, mark: String, mark_col: Color) -> PanelContainer:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _soil_button(Color("#634024"), Color("#4c311b")))
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var m := Label.new()
	m.text = mark
	m.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	m.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	m.custom_minimum_size = Vector2(22, 22)
	m.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var ms := StyleBoxFlat.new()
	ms.bg_color = mark_col
	ms.border_color = Color("#1c3416")
	ms.set_border_width_all(2)
	m.add_theme_stylebox_override("normal", ms)
	m.add_theme_color_override("font_color", Color("#fffbe8"))
	row.add_child(m)
	var t := RichTextLabel.new()
	t.bbcode_enabled = true
	t.fit_content = true
	t.scroll_active = false
	t.custom_minimum_size = Vector2(300, 0)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	t.add_theme_font_size_override("normal_font_size", 13)
	t.add_theme_font_size_override("bold_font_size", 13)
	var detail := str(item.get("detail", ""))
	t.text = "[b]%s[/b]%s" % [item["text"], (" [color=#ecdab4]- %s[/color]" % detail) if detail != "" else ""]
	row.add_child(t)
	card.add_child(row)
	card.gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and (e as InputEventMouseButton).pressed and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
			_go_today(item))
	return card


func open_studio() -> void:
	_root.move_child(_studio, -1)
	_studio.open()


func _close_today() -> void:
	_today.visible = false


func _go_today(item: Dictionary) -> void:
	_today.visible = false
	game.focus_target(item["target"])
	refresh_now()


func _wrapped(text: String, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(480, 0)
	l.add_theme_color_override("font_color", color)
	return l


## In a browser tab: Little Valley is meant to be installed (full screen, offline, its own icon).
## The browser's "Install app" shell button: the browser's own install prompt when it offers one,
## otherwise a small window with this browser's steps.
func _offer_install(v: BoxContainer) -> void:
	var install := _button("Install app", _show_install, "Runs full screen, works offline and keeps your valleys on this device")
	install.theme_type_variation = &"TabOn"
	v.add_child(install)


func _show_install() -> void:
	if Pwa.can_prompt():
		Pwa.prompt_install()
		return
	var v := open_modal("Install Little Valley", 480)
	var head := Label.new()
	head.text = "It runs full screen, works offline and keeps your valleys on this device."
	head.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	head.add_theme_color_override("font_color", _c("accent"))
	v.add_child(head)
	for step: String in Pwa.install_steps(Pwa.this_device()):
		var l := Label.new()
		l.text = "•  " + step
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		v.add_child(l)
	var ok := _button("Got it", close_modal)
	ok.theme_type_variation = &"PrimaryButton"
	v.add_child(_spacer(6))
	v.add_child(_buttons_row([ok]))


func _volume_row(text: String, key: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	var l := Label.new()
	l.text = text
	l.custom_minimum_size = Vector2(110, 0)
	row.add_child(l)
	var slider := HSlider.new()
	slider.min_value = 0.0
	slider.max_value = 1.0
	slider.step = 0.05
	slider.value = float(game.settings.get(key))
	slider.custom_minimum_size = Vector2(260, 0)
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	slider.focus_mode = Control.FOCUS_NONE
	slider.value_changed.connect(func(x: float) -> void:
		game.settings.set(key, x)
		game.settings.apply_audio(game.audio))
	slider.drag_ended.connect(func(_changed: bool) -> void:
		game.settings.save()
		game.audio.play("ui"))
	row.add_child(slider)
	return row


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
	_refresh_top()
	console.refresh()
	_refresh_list()
	_refresh_goals()
	_refresh_goods()
	_refresh_people()
	_refresh_areas()
	_refresh_towns()
	_refresh_tutorial()
	_realm.refresh()


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


## Actions that belong to the selection's details ("See more" in the console, as the browser's
## SettlerCard and BuildingCard): a settler's job; a workshop's recipe and pause; deepening a
## mine; enlisting at a training ground; trading with a merchant at the inn; stock targets.
## Rebuilt only when what they act on changes. The console shows them under the details.
func detail_actions(box: GridContainer) -> void:
	var sim := game.sim
	var key := "%s|%s|%d|%s" % [_card_mode, game.selected, game.selected_building, sim.reached]
	var sel: Building = sim.buildings.get(game.selected_building)
	if sel != null:
		key += "|%s|%d|%s|%s|%s" % [sel.mine.get("level", 0), sel.level, sel.workshop.get("recipe", ""), sel.workshop.get("paused", false), sel.wants]
		for p: Dictionary in sim.parties:
			key += "|%s%s" % [p["state"], p.get("stock", {})]
	if key == _last_card_key and box.get_child_count() > 0:
		return
	_last_card_key = key
	for c in box.get_children():
		c.queue_free()
	var back := func() -> void:
		_card_mode = ""
		_last_card_key = ""
		refresh_now()
	if _card_mode == "job" and not game.selected.is_empty():
		for j in JOBS:
			box.add_child(_small(Roles.job_name(j), func() -> void:
				game.command({"type": "setJob", "ids": game.selected.duplicate(), "job": j})
				back.call()))
		box.add_child(_small("Back", back))
		return
	if _card_mode == "wants" and sel != null:
		for r: String in ["wood", "stone", "food", "planks", "tools"]:
			var have := int(sel.wants.get(r, 0))
			box.add_child(_small("%s %d −" % [Defs.resource(r)["name"], have], func() -> void:
				game.command({"type": "setWants", "buildingId": sel.id, "res": r, "amount": maxi(0, have - 10)})
				_last_card_key = ""
				refresh_now()))
			box.add_child(_small("+10 %s" % str(Defs.resource(r)["name"]).to_lower(), func() -> void:
				game.command({"type": "setWants", "buildingId": sel.id, "res": r, "amount": have + 10})
				_last_card_key = ""
				refresh_now()))
		box.add_child(_small("Back", back))
		return
	if not game.selected.is_empty():
		var one := sim.settler(game.selected[0])
		if one == null or not one.ruler:
			box.add_child(_small("Change job…", func() -> void:
				_card_mode = "job"
				_last_card_key = ""
				refresh_now(), "Set their main job straight away (Train teaches a new role at the Town Hall)"))
		return
	if sel == null:
		return
	var b := sel
	if not b.workshop.is_empty():
		for r: String in b.def().get("recipes", []):
			var rd := Production.recipe(r)
			var unlocked := BuildingOps.is_unlocked(sim, rd.get("unlock"))
			var rb := _small(str(rd["name"]), func() -> void:
				game.command({"type": "setRecipe", "buildingId": b.id, "recipe": r})
				_last_card_key = ""
				refresh_now(), "%s › %s (%d work)" % [Inv.format(Inv.from_json(rd["inputs"])), Inv.format(Inv.from_json(rd["outputs"])), int(rd["work"])])
			rb.disabled = not unlocked or str(b.workshop.get("recipe", "")) == r
			box.add_child(rb)
	if b.built and not b.mine.is_empty() and int(b.mine["level"]) < 3:
		var nl := int(b.mine["level"]) + 1
		box.add_child(_small("Deepen shaft", func() -> void:
			game.command({"type": "upgradeMine", "buildingId": b.id})
			_last_card_key = ""
			refresh_now(), "Level %d: %d ore per trip · costs %s" % [nl, Mining.MINE_YIELD[nl], Inv.format(Mining.MINE_UPGRADES[nl])]))
	if b.built and b.def().has("training"):
		for u: String in b.def()["training"]["units"]:
			var ud := Military.unit(u)
			var eb := _small("Enlist selected: %s" % ud["name"], func() -> void:
				game.command({"type": "enlist", "ids": game.selected_before_building.duplicate(), "unit": u, "buildingId": b.id})
				_last_card_key = ""
				refresh_now(), "Select adults first, then this building. Gear: %s" % Inv.format(Inv.from_json(ud["gear"])))
			eb.disabled = game.selected_before_building.is_empty()
			box.add_child(eb)
	if b.built and b.def().has("lodging"):
		for p: Dictionary in sim.parties:
			if p["state"] != "lodging" or int(p["innId"]) != b.id:
				continue
			var pid := int(p["id"])
			for r: String in p["stock"]:
				if int(p["stock"][r]) <= 0:
					continue
				var price := Merchants.sell_price(r)
				box.add_child(_small("Buy 1 %s (%d coins)" % [str(Defs.resource(r)["name"]).to_lower(), price], func() -> void:
					game.command({"type": "barter", "partyId": pid, "give": {}, "take": {r: 1}, "coins": price})
					_last_card_key = ""
					refresh_now(), "%s has %d" % [p["name"], int(p["stock"][r])]))
			for r: String in ["tools", "planks", "wool", "hides", "leather", "cloth", "silverOre", "goldOre", "diamonds"]:
				if sim.stored_total(r) <= 0:
					continue
				var pay := Merchants.buy_price(r)
				box.add_child(_small("Sell 1 %s (%d coins)" % [str(Defs.resource(r)["name"]).to_lower(), pay], func() -> void:
					game.command({"type": "barter", "partyId": pid, "give": {r: 1}, "take": {}, "coins": -pay})
					_last_card_key = ""
					refresh_now()))
	if b.built and b.is_storage() and b.type != "crate":
		box.add_child(_small("Stock targets…", func() -> void:
			_card_mode = "wants"
			_last_card_key = ""
			refresh_now(), "Haulers keep this store stocked from other stores"))


func _small(text: String, on_press: Callable, tip: String = "") -> Button:
	var b := _button(text, on_press, tip)
	b.add_theme_font_size_override("font_size", 12)
	return b
