extends SceneTree
## Exercise actual scene routing and key capture, keeping settings in a test-only file.
class TestSettings:
	extends Settings
	func save(_path: String = PATH) -> Error:
		return super.save("user://test-controls.cfg")

class TestStore:
	extends SaveStore
	func worlds() -> Array[Dictionary]:
		return []
	func points(_world_id: String) -> Array[Dictionary]:
		return []

class Errors:
	extends Logger
	var messages: Array[String] = []
	var mutex := Mutex.new()
	func _log_error(_function: String, _file: String, _line: int, code: String, rationale: String, _notify: bool, _type: int, _traces: Array[ScriptBacktrace]) -> void:
		mutex.lock()
		messages.append(rationale if rationale != "" else code)
		mutex.unlock()

var failures: Array[String] = []

func _initialize() -> void:
	_run.call_deferred()

func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _run() -> void:
	var errors := Errors.new()
	OS.add_logger(errors)
	var game: Game = load("res://scenes/main.tscn").instantiate()
	game.settings = TestSettings.new()
	game.store = TestStore.new("user://test-controls-store")
	root.add_child(game)
	game.set_process(false)
	game._start(NewGame.create(4242))
	game.hud._title.hide()
	game.settings.bindings.rebind("pause", KEY_Z)
	var event := InputEventKey.new()
	event.pressed = true
	event.physical_keycode = KEY_Z
	game._key(event)
	check(game.paused, "remapped key pauses the actual game")
	game.hud.toggle_menu()
	await process_frame
	game.settings.ui_scale = 1.5
	game.hud._apply_scale()
	for _frame: int in 3:
		await process_frame
	check(game.hud._menu.size.y * 1.5 <= root.size.y, "larger interface settings keep the menu within the viewport")
	game.settings.ui_scale = 1.0
	game.hud._apply_scale()
	game._key(event)
	check(game.paused, "menu blocks game commands")
	var edit := LineEdit.new()
	game.hud._root.add_child(edit)
	game.hud._menu.hide()
	edit.grab_focus()
	game._key(event)
	check(game.paused, "typing blocks game commands")
	edit.release_focus()
	edit.queue_free()
	var panel := KeyBindingsPanel.new()
	panel.setup(game.settings)
	game.hud._root.add_child(panel)
	panel._waiting = "hold"
	panel._input(event)
	check(panel._waiting == "hold", "conflicting key keeps capture open")
	check(game.settings.bindings.keys["hold"] == [KEY_H], "conflict leaves hold unchanged")
	event.physical_keycode = KEY_J
	panel._input(event)
	check(panel._waiting == "", "valid assignment ends capture")
	check(game.settings.bindings.keys["hold"] == [KEY_J], "valid assignment reaches live settings")
	check(Settings.load_saved("user://test-controls.cfg").bindings.keys["hold"] == [KEY_J], "captured key persists")
	DirAccess.remove_absolute("user://test-controls.cfg")
	if not OS.get_cmdline_user_args().is_empty():
		panel.hide()
		game.hud._menu.show()
		for _frame: int in 10:
			await process_frame
		var scroll := game.hud._menu.get_child(0) as ScrollContainer
		scroll.scroll_vertical = 10000
		for _frame: int in 10:
			await process_frame
		root.get_texture().get_image().save_png(OS.get_cmdline_user_args()[0])
	game.free()
	errors.mutex.lock()
	failures.append_array(errors.messages)
	errors.mutex.unlock()
	for failure: String in failures:
		print("FAIL: " + failure)
	print("CONTROL CHECK: %d failures" % failures.size())
	quit(0 if failures.is_empty() else 1)
