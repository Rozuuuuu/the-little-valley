extends SceneTree
## Compiles every script under res://src and res://tools and reports which fail, with the
## engine's messages. From godot/: godot --headless --path . -s res://tools/check_scripts.gd


func _initialize() -> void:
	var bad := 0
	for path in _scripts("res://src") + _scripts("res://tools") + _scripts("res://tests"):
		var s: GDScript = load(path)
		if s == null or not s.can_instantiate():
			print("FAILED ", path)
			bad += 1
	print("%d scripts failed" % bad)
	quit(1 if bad > 0 else 0)


func _scripts(dir: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_scripts(dir.path_join(d)))
	return out
