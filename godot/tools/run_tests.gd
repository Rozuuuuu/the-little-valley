extends SceneTree
## Headless test runner. From the godot/ folder:
##   godot --headless --path . -s res://tools/run_tests.gd [-- filter]
## Runs every `test_*` method in res://tests/test_*.gd (optionally only files or methods containing
## `filter`), prints each failure with its message, and exits with code 1 if anything failed.

const TEST_DIR := "res://tests"


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
	for f in files:
		var script: GDScript = load(TEST_DIR.path_join(f))
		if script == null or not script.can_instantiate():
			print("FAIL %s: could not load (parse error?)" % f)
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
			test.call(method_name)
			var ms := (Time.get_ticks_usec() - t0) / 1000.0
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
