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
var master_volume := 0.8
var music_volume := 0.5
var sfx_volume := 0.7
var muted := false
## "always": health bars over everyone (the browser's default); "hurt": only over the hurt.
var health_bars := "always"
var bindings := KeyBindings.new()


static func load_saved(path: String = PATH) -> Settings:
	var s := Settings.new()
	var cfg := ConfigFile.new()
	if cfg.load(path) == OK:
		var saved: Variant = cfg.get_value("controls", "bindings", {})
		if saved is Dictionary:
			s.bindings.restore(saved)
		s.reduced_motion = bool(cfg.get_value("display", "reduced_motion", s.reduced_motion))
		s.effects = str(cfg.get_value("display", "effects", s.effects))
		s.ui_scale = clampf(float(cfg.get_value("display", "ui_scale", s.ui_scale)), 0.75, 2.0)
		s.edge_scroll = bool(cfg.get_value("controls", "edge_scroll", s.edge_scroll))
		s.autosave_minutes = clampi(int(cfg.get_value("game", "autosave_minutes", s.autosave_minutes)), 0, 30)
		s.master_volume = clampf(float(cfg.get_value("audio", "master", s.master_volume)), 0.0, 1.0)
		s.music_volume = clampf(float(cfg.get_value("audio", "music", s.music_volume)), 0.0, 1.0)
		s.sfx_volume = clampf(float(cfg.get_value("audio", "sfx", s.sfx_volume)), 0.0, 1.0)
		s.muted = bool(cfg.get_value("audio", "muted", s.muted))
		s.health_bars = "hurt" if str(cfg.get_value("display", "health_bars", s.health_bars)) == "hurt" else "always"
	return s


func save(path: String = PATH) -> Error:
	var cfg := ConfigFile.new()
	cfg.set_value("display", "reduced_motion", reduced_motion)
	cfg.set_value("display", "effects", effects)
	cfg.set_value("display", "health_bars", health_bars)
	cfg.set_value("display", "ui_scale", ui_scale)
	cfg.set_value("controls", "edge_scroll", edge_scroll)
	cfg.set_value("controls", "bindings", bindings.keys)
	cfg.set_value("game", "autosave_minutes", autosave_minutes)
	cfg.set_value("audio", "master", master_volume)
	cfg.set_value("audio", "music", music_volume)
	cfg.set_value("audio", "sfx", sfx_volume)
	cfg.set_value("audio", "muted", muted)
	return cfg.save(path)


## Sends the volumes to the audio engine.
func apply_audio(audio: AudioEngine) -> void:
	audio.master_volume = master_volume
	audio.music_volume = music_volume
	audio.sfx_volume = sfx_volume
	audio.muted = muted
	audio.apply_volumes()


func motion() -> float:
	return 0.0 if reduced_motion else 1.0
