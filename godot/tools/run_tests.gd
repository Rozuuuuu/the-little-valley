extends SceneTree
## Headless test runner. From the godot/ folder:
##   godot --headless --path . -s res://tools/run_tests.gd [-- filter]
## Runs every `test_*` method in res://tests/test_*.gd (optionally only files or methods containing
## `filter`), prints each failure with its message, and exits with code 1 if anything failed.

const TEST_DIR := "res://tests"


## Collects engine and script errors while a test runs, so a runtime error fails the test even
## though GDScript carries on after it. (Godot calls loggers from any thread.)
class ErrorCatcher:
	extends Logger
	var errors: PackedStringArray = []
	var _mutex := Mutex.new()

	func _log_error(function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, _error_type: int, _script_backtraces: Array[ScriptBacktrace]) -> void:
		_mutex.lock()
		errors.append("%s (%s:%d in %s)" % [rationale if rationale != "" else code, file, line, function])
		_mutex.unlock()

	func take() -> PackedStringArray:
		_mutex.lock()
		var out := errors
		errors = []
		_mutex.unlock()
		return out


func _initialize() -> void:
	var filter := ""
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		filter = args[0]
	var files: PackedStringArray = []
	for f in DirAccess.get_files_at(TEST_DIR):
		if f.begins_with("test_") and f.ends_with(".gd"):
			files.append(f)
	files.sort()
	var passed := 0
	var failed := 0
	var started := Time.get_ticks_msec()
	var catcher := ErrorCatcher.new()
	OS.add_logger(catcher)
	for f in files:
		var script: GDScript = load(TEST_DIR.path_join(f))
		var load_errors := catcher.take()
		if script == null or not script.can_instantiate() or not load_errors.is_empty():
			print("FAIL %s: could not load" % f)
			for e in load_errors:
				print("         " + e)
			failed += 1
			continue
		for m in script.get_script_method_list():
			var method_name: String = m["name"]
			if not method_name.begins_with("test_"):
				continue
			if filter != "" and not (f.contains(filter) or method_name.contains(filter)):
				continue
			var test: TestCase = script.new()
			var t0 := Time.get_ticks_usec()
			catcher.take()
			test.call(method_name)
			var ms := (Time.get_ticks_usec() - t0) / 1000.0
			for e in catcher.take():
				test.failures.append("error: " + e)
			if test.checks == 0:
				test.failures.append("made no checks (did it stop early?)")
			if test.failures.is_empty():
				passed += 1
				print("  ok   %s.%s (%d checks, %.0f ms)" % [f.get_basename(), method_name, test.checks, ms])
			else:
				failed += 1
				print("  FAIL %s.%s" % [f.get_basename(), method_name])
				for msg in test.failures:
					print("         " + msg)
	print("\n%d passed, %d failed in %.1f s" % [passed, failed, (Time.get_ticks_msec() - started) / 1000.0])
	quit(1 if failed > 0 else 0)
