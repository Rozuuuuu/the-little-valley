class_name KeyBindings
extends RefCounted
## Physical keys, independent of the player's keyboard layout. No simulation state lives here.
## The defaults are the browser game's (src/input/bindings.ts DEFAULT_BINDINGS).
const DEFINITIONS := {
	"panUp": ["Pan up", [KEY_UP]], "panDown": ["Pan down", [KEY_DOWN]],
	"panLeft": ["Pan left", [KEY_LEFT]], "panRight": ["Pan right", [KEY_RIGHT]],
	"move": ["Move (then click a spot)", [KEY_M]], "stop": ["Stop", [KEY_S]],
	"hold": ["Hold position", [KEY_H]], "attack": ["Attack — hunt (then click an animal)", [KEY_A]],
	"returnGoods": ["Return goods to storage", [KEY_C]],
	"zoomIn": ["Zoom in", [KEY_EQUAL, KEY_KP_ADD]], "zoomOut": ["Zoom out", [KEY_MINUS, KEY_KP_SUBTRACT]],
	"pause": ["Pause / resume", [KEY_SPACE]], "speed1": ["Normal speed", [KEY_1]],
	"speed2": ["Fast speed", [KEY_2]], "speed3": ["Fastest speed", [KEY_3]],
	"build": ["Build menu", [KEY_B]], "harvest": ["Gather: mark for harvest", [KEY_G]],
	"unmark": ["Unmark harvest", [KEY_U]], "demolish": ["Demolish selected", [KEY_DELETE, KEY_X]],
	"cancel": ["Cancel / close", [KEY_ESCAPE]], "nextIdle": ["Next idle settler", [KEY_PERIOD]],
	"selectAll": ["Select all settlers", [KEY_E]], "save": ["Quick save", [KEY_F5]],
	"survey": ["Survey for ore", [KEY_Y]], "homeView": ["Jump to the Town Hall", [KEY_BACKSPACE, KEY_HOME]],
	"findRuler": ["Find yourself (the ruler)", [KEY_K]], "rally": ["Rally the people (ruler selected)", [KEY_R]],
	"trainRole": ["Train a role (people selected)", [KEY_T]], "healthBars": ["Health bars: everyone / only the hurt", [KEY_L]],
	"goods": ["All goods", [KEY_I]], "today": ["Valley today", [KEY_F9]],
	"seeMore": ["See more about the selection", [KEY_V]], "people": ["People window", [KEY_F2]],
	"areas": ["Work areas window", [KEY_F3]], "towns": ["Towns window", [KEY_F4]],
	"families": ["Families window", [KEY_F6]], "realm": ["Realm window", [KEY_F7]],
	"goals": ["Goals window", [KEY_F8]], "help": ["Controls help", [KEY_F1]],
	"fullscreen": ["Full screen on / off", [KEY_F]],
}
var keys: Dictionary = {}

func _init() -> void:
	reset()

func reset() -> void:
	keys.clear()
	for action: String in DEFINITIONS:
		keys[action] = (DEFINITIONS[action][1] as Array).duplicate()

static func code(event: InputEventKey) -> int:
	return event.physical_keycode if event.physical_keycode != 0 else event.keycode

func action_for(event: InputEventKey) -> String:
	if not event.pressed or event.echo or event.ctrl_pressed or event.alt_pressed or event.meta_pressed or event.shift_pressed:
		return ""
	for action: String in keys:
		if (keys[action] as Array).has(code(event)):
			return action
	return ""

func pressed(action: String) -> bool:
	if Input.is_key_pressed(KEY_CTRL) or Input.is_key_pressed(KEY_ALT) or Input.is_key_pressed(KEY_META):
		return false
	for key: int in keys.get(action, []):
		if Input.is_physical_key_pressed(key as Key):
			return true
	return false

func label(action: String) -> String:
	var names := PackedStringArray()
	for key: int in keys[action]:
		names.append(OS.get_keycode_string(key))
	return " / ".join(names) if not names.is_empty() else "Unassigned"

func rebind(action: String, key: int) -> String:
	if not DEFINITIONS.has(action):
		return "Unknown shortcut"
	if action == "cancel":
		return "Escape is reserved for cancelling and closing"
	if key == KEY_ESCAPE:
		return "Escape is reserved for cancelling and closing"
	if key in [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META]:
		return "Choose a key other than a modifier"
	if key < 0 or (key != 0 and OS.get_keycode_string(key) == ""):
		return "Choose a keyboard key"
	for other: String in keys:
		if other != action and (keys[other] as Array).has(key):
			return "%s is already used for %s" % [OS.get_keycode_string(key), DEFINITIONS[other][0]]
	keys[action] = [] if key == 0 else [key]
	return ""

## Validate the complete saved layout so valid swaps survive reload. Conflicting overrides
## fall back to defaults; unknown actions and malformed arrays are ignored.
func restore(saved: Dictionary) -> void:
	reset()
	var overrides := {}
	for action: String in DEFINITIONS:
		if action == "cancel" or not saved.get(action) is Array:
			continue
		var values: Array = saved[action]
		var valid := values.size() <= 4
		for value: Variant in values:
			if not value is int or int(value) <= 0 or value in [KEY_ESCAPE, KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META] or OS.get_keycode_string(int(value)) == "":
				valid = false
		if valid:
			keys[action] = values.duplicate()
			overrides[action] = true
	for _pass: int in DEFINITIONS.size():
		var used := {}
		var invalid := {}
		for action: String in keys:
			for value: int in keys[action]:
				if used.has(value) and used[value] != action:
					if overrides.has(action):
						invalid[action] = true
					elif overrides.has(used[value]):
						invalid[used[value]] = true
				else:
					used[value] = action
		if invalid.is_empty():
			break
		for action: String in invalid:
			keys[action] = (DEFINITIONS[action][1] as Array).duplicate()
			overrides.erase(action)
