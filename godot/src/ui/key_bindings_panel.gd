class_name KeyBindingsPanel
extends PanelContainer
## Device-local keyboard editor. Captured keys never become game commands.
var settings: Settings
var _waiting := ""
var _buttons := {}
var _message := Label.new()

## `embedded`: part of a page that scrolls (Settings): no frame, heading or scroll box of its own,
## just the note and the rows.
func setup(player_settings: Settings, embedded := false) -> void:
	settings = player_settings
	var box := VBoxContainer.new()
	add_child(box)
	if embedded:
		add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	else:
		var heading := Label.new()
		heading.text = "Keyboard shortcuts"
		box.add_child(heading)
	_message.text = "Click a shortcut, then press the new key. Escape cancels."
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if embedded:
		_message.add_theme_font_size_override("font_size", 12)
	box.add_child(_message)
	var rows := VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if embedded:
		box.add_child(rows)
	else:
		var scroll := ScrollContainer.new()
		scroll.custom_minimum_size = Vector2(420, 240)
		box.add_child(scroll)
		scroll.add_child(rows)
	for action: String in KeyBindings.DEFINITIONS:
		var row := HBoxContainer.new()
		rows.add_child(row)
		var label := Label.new()
		label.text = KeyBindings.DEFINITIONS[action][0]
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		var key := Button.new()
		key.text = settings.bindings.label(action)
		key.custom_minimum_size.x = 140
		key.focus_mode = Control.FOCUS_NONE
		key.disabled = action == "cancel"
		key.pressed.connect(func() -> void:
			_waiting = action
			_message.text = "Press a key for %s. Escape cancels." % KeyBindings.DEFINITIONS[action][0])
		row.add_child(key)
		_buttons[action] = key
		var clear := Button.new()
		clear.text = "Clear"
		clear.focus_mode = Control.FOCUS_NONE
		clear.disabled = action == "cancel"
		clear.pressed.connect(func() -> void: _assign(action, 0))
		row.add_child(clear)
	var reset := Button.new()
	reset.text = "Reset keyboard shortcuts"
	reset.focus_mode = Control.FOCUS_NONE
	reset.size_flags_horizontal = Control.SIZE_SHRINK_END
	reset.pressed.connect(func() -> void:
		_waiting = ""
		settings.bindings.reset()
		_save_and_refresh())
	box.add_child(reset)

func _assign(action: String, key: int) -> void:
	var problem := settings.bindings.rebind(action, key)
	if problem != "":
		_message.text = problem + ". Choose another key, or Escape to cancel."
		return
	_waiting = ""
	_save_and_refresh()

func _save_and_refresh() -> void:
	var error := settings.save()
	_message.text = "Shortcuts saved on this device." if error == OK else "Shortcuts changed, but could not be saved on this device."
	for action: String in _buttons:
		(_buttons[action] as Button).text = settings.bindings.label(action)

func _input(event: InputEvent) -> void:
	if _waiting == "" or not is_visible_in_tree() or not event is InputEventKey:
		return
	get_viewport().set_input_as_handled()
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	if KeyBindings.code(key) == KEY_ESCAPE:
		_waiting = ""
		_message.text = "Key change cancelled."
	elif key.ctrl_pressed or key.alt_pressed or key.meta_pressed or key.shift_pressed:
		_message.text = "Choose a key without Ctrl, Alt, Shift or Command."
	else:
		_assign(_waiting, KeyBindings.code(key))
