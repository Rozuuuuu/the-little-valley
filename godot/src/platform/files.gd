class_name Files
extends RefCounted
## Save files in and out of the game, and the old browser game's saves.
##
## On the web the browser does the work: a download for "Download save file", a file picker for
## "Load a save file", and the old game's IndexedDB (same address, so same origin) for bringing
## old valleys in. The old database is only read, never changed or deleted. On desktop, downloads
## go to the Downloads folder and files are picked with the system dialog.

## How long to wait for the old game's database before giving up (it answers in milliseconds).
const OLD_DB_TIMEOUT_MS := 8000
## How long a file picker may stay open.
const PICK_TIMEOUT_MS := 30 * 60 * 1000


static func is_web() -> bool:
	return OS.has_feature("web")


## A file name for a save: the valley's name and day, safe on every system.
static func save_file_name(world_name: String, day: int) -> String:
	var clean := ""
	for ch in world_name.strip_edges():
		clean += ch if ch.is_valid_identifier() or ch.is_valid_int() or ch == "-" else "-"
	while clean.contains("--"):
		clean = clean.replace("--", "-")
	clean = clean.trim_prefix("-").trim_suffix("-")
	return "little-valley-%s-day-%d.json" % [clean if clean != "" else "valley", day]


## Offers the save as a file. Returns {ok, error, path} (path is empty on the web).
static func download(file_name: String, data: Dictionary) -> Dictionary:
	return download_bytes(file_name, JSON.stringify(data, "", true, true).to_utf8_buffer(), "application/json")


## Offers any bytes as a file: a browser download on the web, the Downloads folder on desktop.
static func download_bytes(file_name: String, bytes: PackedByteArray, mime: String) -> Dictionary:
	if is_web():
		JavaScriptBridge.download_buffer(bytes, file_name, mime)
		return {"ok": true, "error": "", "path": ""}
	var dir := OS.get_system_dir(OS.SYSTEM_DIR_DOWNLOADS)
	if dir == "":
		dir = OS.get_user_data_dir()
	var path := dir.path_join(file_name)
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return {"ok": false, "error": "Could not write %s (%s)" % [path, error_string(FileAccess.get_open_error())], "path": ""}
	f.store_buffer(bytes)
	f.close()
	return {"ok": true, "error": "", "path": path}


static func _tree() -> SceneTree:
	return Engine.get_main_loop() as SceneTree


## Waits for a browser-side job that leaves its answer (a string) in window[slot].
static func _await_js(slot: String, timeout_ms: int) -> String:
	var until := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < until:
		await _tree().process_frame
		var v: Variant = JavaScriptBridge.eval("window.%s" % slot, true)
		if v is String:
			JavaScriptBridge.eval("window.%s = null" % slot, true)
			return v
	return ""


## Lets the player pick a save file. Returns {name, text}; both empty if nothing was picked.
## On desktop, `host` holds the system dialog while it is open.
static func pick(host: Node) -> Dictionary:
	var got := await pick_bytes(host, ".json,application/json", PackedStringArray(["*.json ; Little Valley saves"]))
	return {"name": got["name"], "text": (got["bytes"] as PackedByteArray).get_string_from_utf8()}


## Lets the player pick any file. Returns {name, bytes}; empty if nothing was picked.
static func pick_bytes(host: Node, accept: String, filters: PackedStringArray) -> Dictionary:
	if is_web():
		JavaScriptBridge.eval("""(function () {
			window.__lvFile = null;
			var input = document.createElement('input');
			input.type = 'file';
			input.accept = '%s';
			input.oncancel = function () { window.__lvFile = ''; };
			input.onchange = function () {
				var f = input.files && input.files[0];
				if (!f) { window.__lvFile = ''; return; }
				var r = new FileReader();
				r.onload = function () {
					var url = String(r.result);
					window.__lvFile = JSON.stringify({ name: f.name, data: url.substring(url.indexOf(',') + 1) });
				};
				r.onerror = function () { window.__lvFile = ''; };
				r.readAsDataURL(f);
			};
			input.click();
		})()""" % accept.replace("'", ""), true)
		var got := await _await_js("__lvFile", PICK_TIMEOUT_MS)
		var parsed: Variant = JSON.parse_string(got) if got != "" else null
		if parsed is Dictionary:
			return {"name": str(parsed.get("name", "")), "bytes": Marshalls.base64_to_raw(str(parsed.get("data", "")))}
		return {"name": "", "bytes": PackedByteArray()}
	var dialog := FileDialog.new()
	dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.use_native_dialog = true
	dialog.filters = filters
	dialog.current_dir = OS.get_system_dir(OS.SYSTEM_DIR_DOWNLOADS)
	host.add_child(dialog)
	var result := {"name": "", "bytes": PackedByteArray()}
	var done := [false]
	dialog.file_selected.connect(func(path: String) -> void:
		result["name"] = path.get_file()
		result["bytes"] = FileAccess.get_file_as_bytes(path)
		done[0] = true)
	dialog.canceled.connect(func() -> void: done[0] = true)
	dialog.popup_centered_ratio(0.6)
	while not done[0]:
		await host.get_tree().process_frame
	dialog.queue_free()
	return result


## The old browser game's valleys on this address: [{slot, name, savedAt, candidates: [text]}],
## each with its copies newest first (emergency copy if newer, then current, then backup). Empty
## off the web, or when the old game was never played here.
static func old_game_saves() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not is_web():
		return out
	JavaScriptBridge.eval("""(function () {
		window.__lvOld = null;
		var done = function (v) { window.__lvOld = JSON.stringify(v); };
		try {
			var open = indexedDB.open('little-valley');
			// No old database: abort, so none is created by looking.
			open.onupgradeneeded = function () { open.transaction.abort(); };
			open.onerror = function () { done([]); };
			open.onblocked = function () { done([]); };
			open.onsuccess = function () {
				var db = open.result;
				if (!db.objectStoreNames.contains('meta') || !db.objectStoreNames.contains('data')) { db.close(); done([]); return; }
				var tx = db.transaction(['meta', 'data']);
				var metas = tx.objectStore('meta').getAll();
				var data = tx.objectStore('data');
				var out = [];
				metas.onerror = function () { db.close(); done([]); };
				metas.onsuccess = function () {
					var list = metas.result || [];
					var left = list.length;
					if (!left) { db.close(); done([]); return; }
					list.forEach(function (meta) {
						var g = data.get(meta.slot);
						var finish = function (v) {
							var em = null;
							try { em = localStorage.getItem('little-valley:emergency:' + meta.slot); } catch (e) {}
							out.push({ meta: meta, current: (v && v.current) || null, backup: (v && v.backup) || null, emergency: em });
							if (--left === 0) { db.close(); done(out); }
						};
						g.onsuccess = function () { finish(g.result); };
						g.onerror = function () { finish(null); };
					});
				};
			};
		} catch (e) { done([]); }
	})()""", true)
	var got := await _await_js("__lvOld", OLD_DB_TIMEOUT_MS)
	var parsed: Variant = JSON.parse_string(got) if got != "" else null
	if not parsed is Array:
		return out
	for e: Variant in parsed:
		if e is Dictionary:
			out.append(old_slot(e))
	return out


## One old-game slot as read from its database: its copies in the order to try them.
static func old_slot(e: Dictionary) -> Dictionary:
	var meta: Dictionary = e.get("meta", {}) if e.get("meta") is Dictionary else {}
	var current: Variant = e.get("current")
	var candidates: Array[String] = []
	var em: Variant = e.get("emergency")
	# The emergency copy (written as the page closed) wins only when it is newer than the save.
	if em is String and em != "":
		var em_at := _saved_at(em)
		var cur_at := _saved_at(current) if current is String else -1.0
		if em_at > cur_at:
			candidates.append(em)
	for t: Variant in [current, e.get("backup")]:
		if t is String and t != "":
			candidates.append(t)
	return {"slot": str(meta.get("slot", "")), "name": str(meta.get("name", "Old valley")), "savedAt": float(meta.get("savedAt", 0)),
		"day": int(meta.get("day", 0)), "population": int(meta.get("population", 0)), "candidates": candidates}


static func _saved_at(text: String) -> float:
	var d: Variant = JSON.parse_string(text)
	if d is Dictionary and d.get("meta") is Dictionary:
		return float(d["meta"].get("savedAt", 0))
	return -1.0
