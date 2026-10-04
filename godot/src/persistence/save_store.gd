class_name SaveStore
extends RefCounted
## Saves on this device, as a history of save points per world.
##
## Layout under `root` (user://saves by default; on the web, user:// lives in the browser's
## IndexedDB):
##   <world id>/index.json      the world's name and its save points, newest first
##   <world id>/<point>.json    one save point (the full save, SaveCodec layout)
##
## Each save writes a new point, so every save can be loaded again. Automatic points beyond the
## last KEEP_AUTO are deleted; points the player named are kept until the player deletes them.
##
## Safe writes: the save is written to a temporary file, read back and decoded, and only then
## renamed into place and added to the index. A save that can't be read back is never kept.
## The index is rewritten the same way, so a crash leaves either the old or the new index.

const KEEP_AUTO := 10

var root: String


func _init(root_dir: String = "user://saves") -> void:
	root = root_dir
	DirAccess.make_dir_recursive_absolute(root)


## Writes a new save point. Returns {ok, error, point}.
func save(world_id: String, world_name: String, data: Dictionary, label: String = "") -> Dictionary:
	var dir := root.path_join(world_id)
	DirAccess.make_dir_recursive_absolute(dir)
	# Full precision: by default Godot shortens floats, which would change positions and growth.
	var text := JSON.stringify(data, "", true, true)
	# Read it back before trusting it.
	var check := SaveCodec.decode(JSON.parse_string(text))
	if check["sim"] == null:
		return {"ok": false, "error": "The save could not be read back (%s), so it was not kept" % check["error"], "point": ""}
	var point := "%d-%04d" % [int(Time.get_unix_time_from_system() * 1000), randi() % 10000]
	var final_path := dir.path_join(point + ".json")
	var err := _write_atomic(final_path, text)
	if err != "":
		return {"ok": false, "error": err, "point": ""}
	var index := _read_index(dir)
	index["name"] = world_name
	var meta: Dictionary = data.get("meta", {})
	var points: Array = index.get("points", [])
	points.push_front({"id": point, "label": label, "savedAt": meta.get("savedAt", 0), "day": meta.get("day", 0),
		"population": meta.get("population", 0), "bytes": text.length()})
	# Keep the newest automatic points and every named one.
	var kept: Array = []
	var autos := 0
	var dropped: Array[String] = []
	for p: Dictionary in points:
		if str(p.get("label", "")) != "":
			kept.append(p)
		elif autos < KEEP_AUTO:
			kept.append(p)
			autos += 1
		else:
			dropped.append(str(p["id"]))
	index["points"] = kept
	err = _write_atomic(dir.path_join("index.json"), JSON.stringify(index, "\t"))
	if err != "":
		return {"ok": false, "error": err, "point": ""}
	for id in dropped:
		DirAccess.remove_absolute(dir.path_join(id + ".json"))
	return {"ok": true, "error": "", "point": point}


## Every world on this device: [{id, name, points: [...]}], most recently saved first.
func worlds() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for id in DirAccess.get_directories_at(root):
		var index := _read_index(root.path_join(id))
		if not (index.get("points", []) as Array).is_empty():
			out.append({"id": id, "name": index.get("name", id), "points": index["points"]})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int((a["points"] as Array)[0]["savedAt"]) > int((b["points"] as Array)[0]["savedAt"]))
	return out


## The save points of one world, newest first.
func points(world_id: String) -> Array:
	return _read_index(root.path_join(world_id)).get("points", [])


## Reads a save point (the newest when `point` is empty). Returns {data, error}.
## If the point can't be read, the next older one is tried and the error says so.
func load_point(world_id: String, point: String = "") -> Dictionary:
	var dir := root.path_join(world_id)
	var list := points(world_id)
	if list.is_empty():
		return {"data": null, "error": "This valley has no saves on this device"}
	var start := 0
	if point != "":
		start = -1
		for i in list.size():
			if str(list[i]["id"]) == point:
				start = i
		if start == -1:
			return {"data": null, "error": "That save point is gone"}
	var first_error := ""
	for i in range(start, list.size()):
		var path := dir.path_join(str(list[i]["id"]) + ".json")
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if parsed is Dictionary:
			var note := "" if first_error == "" else "%s; loaded the save before it instead" % first_error
			return {"data": parsed, "error": note}
		if first_error == "":
			first_error = "The save point %s could not be read" % list[i]["id"]
		if point != "":
			break
	return {"data": null, "error": first_error + ". Nothing was changed or deleted."}


func delete_point(world_id: String, point: String) -> void:
	var dir := root.path_join(world_id)
	var index := _read_index(dir)
	var points_list: Array = index.get("points", [])
	index["points"] = points_list.filter(func(p: Dictionary) -> bool: return str(p["id"]) != point)
	_write_atomic(dir.path_join("index.json"), JSON.stringify(index, "\t"))
	DirAccess.remove_absolute(dir.path_join(point + ".json"))


func _read_index(dir: String) -> Dictionary:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join("index.json")))
	return parsed if parsed is Dictionary else {}


## Writes through a temporary file and renames it into place. Returns "" or an error message.
static func _write_atomic(path: String, text: String) -> String:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return "Could not write %s (error %d)" % [tmp, FileAccess.get_open_error()]
	f.store_string(text)
	f.close()
	if FileAccess.get_file_as_string(tmp).length() != text.length():
		DirAccess.remove_absolute(tmp)
		return "The save was not written completely; the previous save is untouched"
	var err := DirAccess.rename_absolute(tmp, path)
	if err != OK:
		DirAccess.remove_absolute(tmp)
		return "Could not finish writing the save (error %d); the previous save is untouched" % err
	return ""
