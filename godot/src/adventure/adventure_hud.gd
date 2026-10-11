class_name AdventureHud
extends CanvasLayer
## Presentation only. Commands pass through Game so refresh, saving and feedback stay centralized.

const PAPER := Color("eee5c9")
const MUTED := Color("b8c6ae")
const GOLD := Color("e6c77d")
const PAGE_SIZE := 24
const RARITIES := ["Common", "Uncommon", "Rare", "Very Rare", "Epic", "Legendary", "Mythic", "Relic"]
const RARITY_COLORS := ["c9c9bb", "90c989", "86b9ef", "aaa5ef", "cf8de5", "edbe68", "ef9295", "f4e7ac"]

var game: Game
var _root: Control
var _overlays: Control
var _shade: ColorRect
var _panel: PanelContainer
var _body: VBoxContainer
var _title: Label
var _hero: Label
var _health: ProgressBar
var _mana: ProgressBar
var _vitals: Label
var _objective: Label
var _message: Label
var _management: Button
var _mini: MinimapView
var _kind := ""
var _site := ""
var _dialogue: Dictionary = {}
var _page := 0
var _selected := ""
var _filter := "All"
var _search := ""
var _sort := 0
var _timer := 0.0
var _feedback := ""
var _confirm := ""
var _built := false


func setup(owner_game: Game) -> void:
	game = owner_game
	if _built:
		refresh_now()
		return
	_built = true
	layer = 3
	_root = Control.new()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.theme = game.hud._theme.duplicate() if game.hud._theme != null else Theme.new()
	_root.theme.default_font = UiFonts.regular()
	_root.theme.default_font_size = 16
	_root.theme.set_color("font_color", "Label", PAPER)
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_root.theme.set_stylebox(state, "Button", _style(Color("30443b") if state == "hover" else Color("202e28")))
	_root.theme.set_color("font_color", "Button", PAPER)
	_root.theme.set_color("font_hover_color", "Button", GOLD)
	_overlays = Control.new()
	_overlays.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_overlays)
	_overlays.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build_overlays()
	_shade = ColorRect.new()
	_shade.color = Color(0.025, 0.05, 0.04, 0.62)
	_shade.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(_shade)
	_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", _style(Color("17261f"), 18))
	_shade.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	_panel.add_child(column)
	var header := HBoxContainer.new()
	column.add_child(header)
	_title = _label("", 24, GOLD)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_title)
	header.add_child(_button("Close  [Esc]", close_panel))
	column.add_child(HSeparator.new())
	_body = VBoxContainer.new()
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_body)
	_shade.hide()
	get_viewport().size_changed.connect(_layout)
	_layout()
	refresh_now()


func _style(color: Color, padding: int = 8) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color("6a7958")
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	style.content_margin_left = padding
	style.content_margin_right = padding
	style.content_margin_top = padding
	style.content_margin_bottom = padding
	return style


func _label(text: String, font_size: int = 16, color: Color = PAPER) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _wrapped(text: String, font_size: int = 16, color: Color = PAPER) -> Label:
	var label := _label(text, font_size, color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label


func _button(text: String, action: Callable, tip: String = "") -> Button:
	var button := Button.new()
	button.text = text
	button.tooltip_text = tip
	button.custom_minimum_size.y = 32
	button.add_theme_font_size_override("font_size", 15)
	button.pressed.connect(action)
	return button


func _card(rect: Rect2, anchor: Vector2) -> VBoxContainer:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _style(Color(0.07, 0.12, 0.09, 0.94), 12))
	_overlays.add_child(card)
	card.anchor_left = anchor.x
	card.anchor_right = anchor.x
	card.anchor_top = anchor.y
	card.anchor_bottom = anchor.y
	card.position = rect.position
	card.size = rect.size
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 5)
	card.add_child(column)
	return column


func _build_overlays() -> void:
	var quest := _card(Rect2(16, 16, 330, 100), Vector2.ZERO)
	quest.add_child(_label("THE ROAD AHEAD", 16, GOLD))
	_objective = _wrapped("")
	quest.add_child(_objective)
	quest.add_child(_button("Journal  [J]", open_panel.bind("journal")))
	var map_box := _card(Rect2(16, -176, 236, 160), Vector2(0, 1))
	_mini = MinimapView.new()
	_mini.game = game
	map_box.add_child(_mini)
	var hero_box := _card(Rect2(-210, -162, 420, 146), Vector2(0.5, 1))
	_hero = _label("", 21, GOLD)
	hero_box.add_child(_hero)
	_health = _bar(Color("9bbc77"))
	_mana = _bar(Color("7aabd1"))
	hero_box.add_child(_health)
	hero_box.add_child(_mana)
	_vitals = _label("", 15)
	hero_box.add_child(_vitals)
	var skills := HBoxContainer.new()
	hero_box.add_child(skills)
	for id: String in ["cleave", "ward", "recover"]:
		var skill := _button(id.capitalize(), _act.bind({"type": "skill", "id": id}))
		skill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		skills.add_child(skill)
	var actions := _card(Rect2(-326, -176, 310, 160), Vector2(1, 1))
	var grid := GridContainer.new()
	grid.columns = 3
	actions.add_child(grid)
	for entry: Array in [["Inventory [I]", "inventory"], ["Character [C]", "character"], ["Party [P]", "party"], ["Journal [J]", "journal"], ["Menu", "menu"]]:
		grid.add_child(_button(entry[0], open_panel.bind(entry[1])))
	grid.add_child(_button("Save", _save))
	grid.add_child(_button("Rest", _act.bind({"type": "rest"})))
	grid.add_child(_button("Find hero", _focus_hero))
	_management = _button("Manage village", _toggle_management)
	actions.add_child(_management)
	var status := _card(Rect2(-350, 16, 334, 60), Vector2(1, 0))
	_message = _wrapped("", 15, MUTED)
	status.add_child(_message)


func _bar(color: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.custom_minimum_size.y = 12
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background", _style(Color("101b16"), 0))
	bar.add_theme_stylebox_override("fill", _style(color, 0))
	return bar


func _layout() -> void:
	if not _built:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	# Keep the same readable layout at 720p; scale the whole canvas on smaller windows.
	var factor := minf(1.0, minf(viewport_size.x / 1280.0, viewport_size.y / 720.0))
	_root.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_root.scale = Vector2.ONE * factor
	_root.size = viewport_size / factor
	_panel.size = Vector2(minf(900, _root.size.x - 48), minf(560, _root.size.y - 80))
	_panel.position = (_root.size - _panel.size) / 2.0


func _state() -> Dictionary:
	return AdventureMode.data(game.sim) if game != null and game.sim != null else {}


func refresh(delta: float) -> void:
	_timer += delta
	if _timer >= 0.2:
		_timer = 0.0
		refresh_now()


func refresh_now() -> void:
	if not _built:
		return
	var active := game.sim != null and AdventureMode.active(game.sim)
	_root.visible = active
	if not active:
		close_panel()
		return
	var state := _state()
	var hero: Dictionary = state.get("hero", {})
	_hero.text = "%s  ·  Level %d" % [hero.get("name", "Wanderer"), hero.get("level", 1)]
	_health.max_value = maxf(1, float(hero.get("max_hp", 1)))
	_health.value = float(hero.get("hp", 0))
	_mana.max_value = maxf(1, float(hero.get("max_mana", 1)))
	_mana.value = float(hero.get("mana", 0))
	_vitals.text = "HP %d/%d   Mana %d/%d   XP %d   Points %d" % [hero.get("hp", 0), hero.get("max_hp", 0), hero.get("mana", 0), hero.get("max_mana", 0), hero.get("xp", 0), hero.get("points", 0)]
	_objective.text = AdventureMode.objective(game.sim)
	_message.text = str(state.get("message", "Click to travel. Right-click to interact."))
	_management.visible = bool(state.get("leader", false))
	_management.text = "Return to adventure" if bool(game.get("adventure_management")) else "Manage village"
	# In settlement mode keep only the return button; the parent owns normal HUD visibility.
	for child: Control in _overlays.get_children():
		child.visible = not bool(game.get("adventure_management")) or child == _management.get_parent().get_parent()
	_mini.queue_redraw()


func open_panel(kind: String) -> void:
	if not _built or game.sim == null or not AdventureMode.active(game.sim):
		return
	if kind.to_lower() == "menu":
		close_panel()
		game.hud.toggle_menu()
		return
	_kind = kind.to_lower()
	_page = 0
	_feedback = ""
	_confirm = ""
	_shade.show()
	_rebuild()


func show_dialogue(site_id: String) -> void:
	if game == null or game.sim == null:
		return
	_site = site_id
	_dialogue = AdventureMode.interact(game.sim, site_id)
	open_panel("dialogue")


func close_panel() -> void:
	_kind = ""
	_confirm = ""
	if _shade != null:
		_shade.hide()


func blocking() -> bool:
	return _built and _root.visible and _shade.visible


func handle_input(event: InputEvent) -> bool:
	if not _built or not _root.visible or not event is InputEventKey:
		return false
	var key := event as InputEventKey
	if not key.pressed or key.echo or key.ctrl_pressed or key.alt_pressed or key.meta_pressed:
		return false
	if key.keycode == KEY_ESCAPE and blocking():
		close_panel()
		return true
	var focus := get_viewport().gui_get_focus_owner()
	if focus is LineEdit or focus is TextEdit or game.hud.modal_open():
		return false
	var shortcuts := {KEY_I: "inventory", KEY_C: "character", KEY_J: "journal", KEY_P: "party"}
	if not shortcuts.has(key.keycode):
		return false
	var kind: String = shortcuts[key.keycode]
	if _kind == kind:
		close_panel()
	else:
		open_panel(kind)
	return true


func _save() -> void:
	game.hud.toast("Adventure saved." if game.save_now() else "Could not save.")


func _focus_hero() -> void:
	var hero: Dictionary = _state().get("hero", {})
	game.camera.target_pos = Vector2(float(hero.get("x", 0)), float(hero.get("y", 0))) * WorldView.TILE_PX


func _toggle_management() -> void:
	if not bool(_state().get("leader", false)):
		return
	close_panel()
	game.set("adventure_management", not bool(game.get("adventure_management")))
	game.hud.refresh_now()
	refresh_now()


func _act(command: Dictionary) -> void:
	var result: Dictionary = game.call("adventure_action", command)
	_feedback = str(result.get("message", result.get("text", "")))
	_confirm = ""
	if _kind == "dialogue":
		if result.has("choices"):
			_dialogue = result
		elif result.get("dialogue") is Dictionary:
			_dialogue = result["dialogue"]
		else:
			_dialogue = AdventureMode.interact(game.sim, _site)
	refresh_now()
	if blocking():
		_rebuild()


func _rebuild() -> void:
	for child in _body.get_children():
		_body.remove_child(child)
		child.queue_free()
	_title.text = _kind.capitalize()
	match _kind:
		"inventory": _inventory()
		"character": _character()
		"journal": _journal()
		"party": _party()
		"dialogue": _conversation()
		"shop", "craft": _trade()
		_: _body.add_child(_wrapped("This panel is not available."))
	if not _feedback.is_empty():
		_body.add_child(_wrapped(_feedback, 15, GOLD))
	_layout()


func _pager(parent: Node, count: int, per_page: int) -> void:
	var pages := maxi(1, ceili(float(count) / per_page))
	_page = clampi(_page, 0, pages - 1)
	var row := HBoxContainer.new()
	parent.add_child(row)
	var previous := _button("Previous", _turn_page.bind(-1))
	previous.disabled = _page == 0
	row.add_child(previous)
	row.add_child(_label("Page %d / %d" % [_page + 1, pages], 15, MUTED))
	var next := _button("Next", _turn_page.bind(1))
	next.disabled = _page >= pages - 1
	row.add_child(next)


func _turn_page(step: int) -> void:
	_page += step
	_rebuild()


func _character() -> void:
	var hero: Dictionary = _state().get("hero", {})
	_body.add_child(_label("%s · %d unspent points" % [hero.get("name", "Wanderer"), hero.get("points", 0)], 20, GOLD))
	for attribute: String in ["strength", "agility", "intelligence"]:
		var row := HBoxContainer.new()
		_body.add_child(row)
		var label := _label("%s   %d" % [attribute.capitalize(), hero.get(attribute, 0)], 19)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		var spend := _button("Spend point", _act.bind({"type": "spend", "attribute": attribute}))
		spend.disabled = int(hero.get("points", 0)) <= 0
		row.add_child(spend)
	_body.add_child(HSeparator.new())
	_body.add_child(_wrapped("Strength supports health and melee damage. Agility supports armour and attack speed. Intelligence supports mana and skills.", 16, MUTED))
	_body.add_child(_wrapped(_stats_text(AdventureMode.hero_stats(game.sim)), 18))


func _stats_text(stats: Dictionary) -> String:
	var values: PackedStringArray = []
	for key: Variant in stats:
		if stats[key] is float or stats[key] is int:
			values.append("%s: %s" % [str(key).replace("_", " ").capitalize(), str(snappedf(float(stats[key]), 0.01))])
	return "   ·   ".join(values)


func _conversation() -> void:
	_title.text = str(_dialogue.get("speaker", "Conversation"))
	_body.add_child(_wrapped(str(_dialogue.get("text", "No conversation is available here.")), 19))
	_body.add_child(HSeparator.new())
	var choices: Array = _dialogue.get("choices", [])
	_pager(_body, choices.size(), 5)
	for index in range(_page * 5, mini(choices.size(), (_page + 1) * 5)):
		var choice: Variant = choices[index]
		var id := str(choice.get("id", "")) if choice is Dictionary else str(choice)
		var text := str(choice.get("text", choice.get("label", id))) if choice is Dictionary else str(choice)
		var button := _button(text, _act.bind({"type": "dialogue", "site": _site, "choice": id}))
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		if choice is Dictionary:
			button.disabled = bool(choice.get("disabled", false))
			button.tooltip_text = str(choice.get("outcome", choice.get("reason", "")))
		_body.add_child(button)


func _inventory() -> void:
	var bag: Dictionary = _state().get("bag", {})
	var items: Array = bag.get("items", [])
	var equipment: Dictionary = bag.get("equipment", {})
	var toolbar := HBoxContainer.new()
	_body.add_child(toolbar)
	toolbar.add_child(_label("%d gold · %d/%d slots" % [bag.get("gold", 0), items.size(), bag.get("capacity", 30)], 16, GOLD))
	var filter := OptionButton.new()
	var categories := ["All", "weapon", "armor", "accessory", "consumable", "material", "trade"]
	for category: String in categories:
		filter.add_item(category.capitalize())
	filter.select(maxi(0, categories.find(_filter)))
	filter.item_selected.connect(func(index: int) -> void:
		_filter = categories[index]
		_page = 0
		_rebuild())
	toolbar.add_child(filter)
	var search := LineEdit.new()
	search.placeholder_text = "Search + Enter"
	search.text = _search
	search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	search.text_submitted.connect(func(value: String) -> void:
		_search = value
		_page = 0
		_rebuild())
	toolbar.add_child(search)
	var sort := OptionButton.new()
	sort.add_item("Name")
	sort.add_item("Rarity")
	sort.select(_sort)
	sort.item_selected.connect(func(index: int) -> void:
		_sort = index
		_rebuild())
	toolbar.add_child(sort)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 12)
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(columns)
	var gear := VBoxContainer.new()
	gear.custom_minimum_size.x = 160
	columns.add_child(gear)
	gear.add_child(_label("EQUIPMENT", 16, GOLD))
	for slot: String in AdventureItems.SLOTS:
		var equipped := _find_item(items, str(equipment.get(slot, 0)))
		var caption := "%s: %s" % [slot.capitalize(), equipped.get("name", "—")]
		var button := _button(caption, _act.bind({"type": "unequip", "slot": slot}), caption + "\nClick to unequip")
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.custom_minimum_size.x = 160
		button.disabled = equipped.is_empty()
		gear.add_child(button)
	var bag_column := VBoxContainer.new()
	bag_column.custom_minimum_size.x = 396
	columns.add_child(bag_column)
	var shown: Array[Dictionary] = []
	for item: Dictionary in items:
		if (_filter == "All" or item.get("category", "") == _filter) and (_search.is_empty() or str(item.get("name", "")).to_lower().contains(_search.to_lower())):
			shown.append(item)
	shown.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if _sort == 1 and int(a.get("tier", 0)) != int(b.get("tier", 0)):
			return int(a.get("tier", 0)) > int(b.get("tier", 0))
		return str(a.get("name", "")) < str(b.get("name", "")))
	_pager(bag_column, shown.size(), PAGE_SIZE)
	var grid := GridContainer.new()
	grid.columns = 4
	bag_column.add_child(grid)
	for index in range(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE):
		var item: Dictionary = shown[index] if index < shown.size() else {}
		var id := str(item.get("id", ""))
		var tier := clampi(int(item.get("tier", 0)), 0, 7)
		var caption := "—" if item.is_empty() else "%s\n%d · %s ×%d" % [item.get("name", "Item"), tier + 1, RARITIES[tier], item.get("count", 1)]
		var button := _button(caption, _select_item.bind(id), caption)
		button.custom_minimum_size = Vector2(96, 46)
		button.add_theme_font_size_override("font_size", 13)
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.disabled = item.is_empty()
		button.add_theme_color_override("font_color", Color(RARITY_COLORS[tier]))
		if id == _selected and not id.is_empty():
			button.add_theme_stylebox_override("normal", _style(Color("47523a")))
		grid.add_child(button)
	var details := VBoxContainer.new()
	details.custom_minimum_size.x = 250
	details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(details)
	_item_details(details, bag, _find_item(items, _selected))
	var footer := HBoxContainer.new()
	_body.add_child(footer)
	footer.add_child(_button("Recover cache (%d)" % bag.get("cache", []).size(), _act.bind({"type": "cache"})))
	footer.add_child(_button("Shop", open_panel.bind("shop")))
	footer.add_child(_button("Craft", open_panel.bind("craft")))
	_body.add_child(_wrapped("RARITIES  1 Common · 2 Uncommon · 3 Rare · 4 Very Rare · 5 Epic · 6 Legendary · 7 Mythic · 8 Relic", 13, MUTED))


func _find_item(items: Array, id: String) -> Dictionary:
	for item: Dictionary in items:
		if str(item.get("id", "")) == id:
			return item
	return {}


func _select_item(id: String) -> void:
	_selected = id
	_confirm = ""
	_rebuild()


func _item_details(column: VBoxContainer, bag: Dictionary, item: Dictionary) -> void:
	if item.is_empty():
		column.add_child(_wrapped("Select an item to compare equipment or use supplies.\n\nEquipped gear remains in the backpack. Overflow rewards stay in the recoverable cache.", 16, MUTED))
		return
	var tier := clampi(int(item.get("tier", 0)), 0, 7)
	column.add_child(_wrapped(str(item.get("name", "Item")), 20, GOLD))
	column.add_child(_label("%d · %s · Level %d" % [tier + 1, RARITIES[tier], item.get("item_level", 1)], 15, Color(RARITY_COLORS[tier])))
	column.add_child(_wrapped(_stats_text(item.get("stats", {})), 15))
	var slot := str(item.get("slot", ""))
	var id := int(item.get("id", 0))
	if not slot.is_empty():
		var slots: Array = ["ring1", "ring2"] if slot == "ring" else [slot]
		for target: String in slots:
			var comparison := AdventureItems.compare(bag, id, target)
			column.add_child(_wrapped("Net change (%s): %s" % [target, _stats_text(comparison.get("delta", {}))], 14, MUTED))
			column.add_child(_button("Equip · " + target, _act.bind({"type": "equip", "item": id, "slot": target})))
		if bool(item.get("two_handed", false)):
			column.add_child(_wrapped("Uses both hands; comparison includes displaced off-hand gear.", 13, MUTED))
	if item.get("category", "") == "consumable":
		column.add_child(_button("Use one", _act.bind({"type": "use", "item": id})))
	var equipped := false
	for value: Variant in bag.get("equipment", {}).values():
		if int(value) == id:
			equipped = true
	var protected := equipped or bool(item.get("favourite", false)) or item.get("category", "") == "quest"
	var price := maxi(1, int(int(item.get("price", 0)) * 0.3)) * int(item.get("count", 1))
	var sell := _button("Sell stack · %d gold" % price, _destructive.bind("sell", item))
	sell.disabled = protected
	column.add_child(sell)
	if item.get("category", "") in ["weapon", "armor", "accessory"]:
		var salvage := _button("Salvage · %d ore" % (2 + tier), _destructive.bind("salvage", item))
		salvage.disabled = protected
		column.add_child(salvage)
	if protected:
		column.add_child(_wrapped("Equipped, favourite and quest items are protected.", 13, MUTED))
	if not _confirm.is_empty():
		column.add_child(_wrapped("Confirm %s? This removes the selected item or stack." % _confirm, 14, GOLD))
		column.add_child(_button("Confirm " + _confirm, _act.bind({"type": _confirm, "item": id})))


func _destructive(action: String, item: Dictionary) -> void:
	if int(item.get("tier", 0)) >= 2:
		_confirm = action
		_rebuild()
	else:
		_act({"type": action, "item": int(item.get("id", 0))})


func _trade() -> void:
	var bag: Dictionary = _state().get("bag", {})
	_body.add_child(_label("Party gold: %d" % bag.get("gold", 0), 18, GOLD))
	_body.add_child(_wrapped("Trade and crafting require a nearby friendly settlement. Availability is checked when you act.", 15, MUTED))
	var stock: Array[Dictionary] = []
	for definition: Dictionary in AdventureItems.catalogue():
		if definition.get("category", "") == "quest":
			continue
		if _kind == "craft" and definition.get("recipe", {}).is_empty():
			continue
		stock.append(definition)
	_pager(_body, stock.size(), 5)
	for index in range(_page * 5, mini(stock.size(), (_page + 1) * 5)):
		var definition: Dictionary = stock[index]
		var row := HBoxContainer.new()
		_body.add_child(row)
		var cost := "%d gold" % definition.get("price", 0)
		if _kind == "craft":
			cost = "%d gold · %s" % [definition.get("craft_gold", 0), _stats_text(definition.get("recipe", {}))]
		var description := _wrapped("%s · %s\n%s" % [definition.get("name", ""), RARITIES[clampi(int(definition.get("tier", 0)), 0, 7)], cost], 16)
		row.add_child(description)
		row.add_child(_button("Craft" if _kind == "craft" else "Buy", _act.bind({"type": "craft" if _kind == "craft" else "buy", "definition": definition.get("id", "")})))
	_body.add_child(_button("Back to inventory", open_panel.bind("inventory")))
