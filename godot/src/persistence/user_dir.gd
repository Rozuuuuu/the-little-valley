class_name UserDir
## Where the game keeps its saves on a computer: its own folder, %APPDATA%\Little Valley on
## Windows (project setting application/config/custom_user_dir_name; Godot creates it), with
## saves/, settings.cfg and the player's art in art_overrides/. Earlier builds kept these in
## Godot's shared folder (%APPDATA%\Godot\app_userdata\Little Valley); the first start copies
## anything from there that is not here yet. The old copies are left untouched.

const MARKER := "user://.moved-from-godot-app-userdata"
const ITEMS: Array[String] = ["saves", "settings.cfg", "art_overrides"]


## The folder players see, for the menu ("Saves are kept in …").
static func path() -> String:
	return ProjectSettings.globalize_path("user://")


## Runs once, before settings and saves are read. Returns true (for use as an initialiser).
static func migrate_old() -> bool:
	if OS.has_feature("web") or FileAccess.file_exists(MARKER):
		return true
	var old := OS.get_data_dir().path_join("Godot/app_userdata").path_join(str(ProjectSettings.get_setting("application/config/name")))
	if DirAccess.dir_exists_absolute(old) and old.simplify_path() != path().simplify_path():
		for item in ITEMS:
			var src := old.path_join(item)
			var dst := path().path_join(item)
			if DirAccess.dir_exists_absolute(src):
				_copy_dir(src, dst)
			elif FileAccess.file_exists(src) and not FileAccess.file_exists(dst):
				DirAccess.copy_absolute(src, dst)
	var f := FileAccess.open(MARKER, FileAccess.WRITE)
	if f != null:
		f.store_string("Copied from the earlier save folder on %s.\n" % Time.get_datetime_string_from_system())
	return true


## Copies a folder's files and subfolders, never overwriting what is already there.
static func _copy_dir(src: String, dst: String) -> void:
	DirAccess.make_dir_recursive_absolute(dst)
	for f in DirAccess.get_files_at(src):
		if not FileAccess.file_exists(dst.path_join(f)):
			DirAccess.copy_absolute(src.path_join(f), dst.path_join(f))
	for d in DirAccess.get_directories_at(src):
		_copy_dir(src.path_join(d), dst.path_join(d))
