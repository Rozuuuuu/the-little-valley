extends TestCase


func test_colour_default_and_legacy_migration_preserve_new_choices() -> void:
	var path := "res://../build/test-colour-settings.cfg"
	check_eq(Settings.new().art_style, "colour", "fresh settings use full colour")
	var cfg := ConfigFile.new()
	cfg.set_value("display", "art_style", "sepia")
	cfg.set_value("audio", "muted", true)
	check_eq(cfg.save(path), OK, "write isolated legacy settings")
	var restored := Settings.load_saved(path)
	check_eq(restored.art_style, "colour", "legacy sepia default returns to colour")
	check(restored.muted, "migration preserves other preferences")
	restored.art_style = "sepia"
	check_eq(restored.save(path), OK, "save an explicit new preference")
	check_eq(Settings.load_saved(path).art_style, "sepia", "explicit sepia survives reload")
	restored.art_style = "colour"
	check_eq(restored.save(path), OK, "save explicit colour")
	check_eq(Settings.load_saved(path).art_style, "colour", "explicit colour survives reload")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
