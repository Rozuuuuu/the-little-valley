class_name Settings
extends RefCounted
## Player settings, kept on this device (user://settings.cfg).

const PATH := "user://settings.cfg"

## Fewer moving things: no sway, still water, no idle bobbing.
var reduced_motion := false
## "high": all effects; "low": fewer particles and no water glints.
var effects := "high"
var ui_scale := 1.0
var edge_scroll := true
## Minutes between automatic saves (0 = off).
var autosave_minutes := 3


static func load_saved() -> Settings:
	var s := Settings.new()
	var cfg := ConfigFile.new()
	if cfg.load(PATH) == OK:
		s.reduced_motion = bool(cfg.get_value("display", "reduced_motion", s.reduced_motion))
		s.effects = str(cfg.get_value("display", "effects", s.effects))
		s.ui_scale = clampf(float(cfg.get_value("display", "ui_scale", s.ui_scale)), 0.75, 2.0)
		s.edge_scroll = bool(cfg.get_value("controls", "edge_scroll", s.edge_scroll))
		s.autosave_minutes = clampi(int(cfg.get_value("game", "autosave_minutes", s.autosave_minutes)), 0, 30)
	return s


func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("display", "reduced_motion", reduced_motion)
	cfg.set_value("display", "effects", effects)
	cfg.set_value("display", "ui_scale", ui_scale)
	cfg.set_value("controls", "edge_scroll", edge_scroll)
	cfg.set_value("game", "autosave_minutes", autosave_minutes)
	cfg.save(PATH)


func motion() -> float:
	return 0.0 if reduced_motion else 1.0
