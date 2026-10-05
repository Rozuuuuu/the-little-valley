extends TestCase

func test_defaults_and_physical_keys() -> void:
	var bindings := KeyBindings.new()
	var event := InputEventKey.new()
	event.pressed = true
	event.physical_keycode = KEY_S
	event.keycode = KEY_O
	check_eq(bindings.action_for(event), "stop", "physical position wins over keyboard layout")
	event.ctrl_pressed = true
	check_eq(bindings.action_for(event), "", "browser and editor shortcuts stay separate")
	event.ctrl_pressed = false
	event.echo = true
	check_eq(bindings.action_for(event), "", "held command keys do not repeat orders")

func test_remap_conflicts_clear_and_reset() -> void:
	var bindings := KeyBindings.new()
	check_eq(bindings.rebind("stop", KEY_Z), "", "a free key can be assigned")
	check(bindings.rebind("hold", KEY_Z) != "", "conflicts are explained and refused")
	check_eq(bindings.keys["hold"], [KEY_H], "refusal leaves the old binding")
	check(bindings.rebind("hold", KEY_ESCAPE) != "", "Escape remains available to cancel")
	check(bindings.rebind("hold", KEY_SHIFT) != "", "modifier-only bindings cannot become unusable shortcuts")
	check_eq(bindings.rebind("stop", 0), "", "a shortcut can be disabled")
	check_eq(bindings.keys["stop"], [], "disabled")
	bindings.reset()
	check_eq(bindings.keys["stop"], [KEY_S], "reset restores defaults")

func test_settings_round_trip_and_invalid_bindings() -> void:
	var path := "user://test-bindings.cfg"
	var settings := Settings.new()
	settings.bindings.rebind("stop", KEY_Z)
	check_eq(settings.save(path), OK, "saved")
	var loaded := Settings.load_saved(path)
	check_eq(loaded.bindings.keys["stop"], [KEY_Z], "device settings remember changes")
	loaded.bindings.restore({"hold": [KEY_Z], "stop": [KEY_Z], "madeUp": [KEY_P], "pause": "bad"})
	check_eq(loaded.bindings.keys["stop"], [KEY_Z], "first valid claimant keeps key")
	check_eq(loaded.bindings.keys["hold"], [KEY_H], "invalid conflicting override falls back")
	check_eq(loaded.bindings.keys["pause"], [KEY_SPACE], "invalid arrays fall back")
	loaded.bindings.restore({"stop": [KEY_H], "hold": [KEY_S]})
	check_eq(loaded.bindings.keys["stop"], [KEY_H], "a complete swap survives reload")
	check_eq(loaded.bindings.keys["hold"], [KEY_S], "both swapped actions survive")
	DirAccess.remove_absolute(path)
