extends SceneTree
## Writes every synthesised sound to WAV files for listening:
##   godot --headless --path . -s res://tools/render_sounds.gd -- [out_dir]
## (default: the user data folder's sounds/). Music: one pad per chord and the pluck notes.

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var dir := args[0] if not args.is_empty() else OS.get_user_data_dir().path_join("sounds")
	DirAccess.make_dir_recursive_absolute(dir)
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	for name: String in AudioEngine.NAMES:
		var buf := Synth.render(AudioEngine.voices(name, rng), AudioEngine.RATE, rng)
		Synth.to_wav(buf, AudioEngine.RATE).save_to_wav(dir.path_join(name + ".wav"))
	for c in AudioEngine.CHORDS.size():
		Synth.to_wav(Synth.render(AudioEngine.pad_voices(c), AudioEngine.PAD_RATE, rng), AudioEngine.PAD_RATE).save_to_wav(dir.path_join("pad-%d.wav" % c))
	print("sounds written to %s" % dir)
	quit()
