extends SceneTree
## Times chunk generation. From the godot/ folder:
##   godot --headless --path . -s res://tools/bench_gen.gd [-- chunks=24]
## Prints milliseconds per chunk for each generator (generator 4 in the valley habitat), using
## chunks around the spawn and further out, the same seed for every run.


func _initialize() -> void:
	var n := 24
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		n = int(args[0])
	print("Godot %s, %s, %d chunks per generator" % [Engine.get_version_info()["string"], OS.get_processor_name(), n])
	for gen: int in [1, 2, 3, 4]:
		var t0 := Time.get_ticks_usec()
		for i in n:
			WorldGen.generate_chunk(424242, (i % 6) - 3, (i / 6) - 2, gen, "valley")
		var ms := (Time.get_ticks_usec() - t0) / 1000.0
		print("gen %d: %.1f ms per chunk" % [gen, ms / n])
	quit()
