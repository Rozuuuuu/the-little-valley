extends SceneTree
## Writes a played Godot save to a file, for checking that the browser game can read it:
##   godot --headless --path . -s res://tools/write_sample_save.gd -- <out.json>
## then, from the repository root: npx tsx scripts/check-godot-save.ts <out.json>


func _initialize() -> void:
	var out := OS.get_cmdline_user_args()[0] if not OS.get_cmdline_user_args().is_empty() else "user://sample_save.json"
	var sim := NewGame.create(4242, WorldGen.CURRENT_GEN, "valley", "Lloyd")
	SimHelpers.camp(sim).inventory = {"food": 150, "wood": 120, "stone": 60, "planks": 20}
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 3, "x1": -6, "y1": 6, "crop": "turnip"})
	Commands.apply(sim, {"type": "createArea", "kind": "wood", "x0": -16, "y0": -16, "x1": -6, "y1": -8, "wanted": 2})
	for i in 1500:
		sim.step()
	var f := FileAccess.open(out, FileAccess.WRITE)
	f.store_string(JSON.stringify(SaveCodec.encode(sim, "Sample", 1), "", true, true))
	f.close()
	print("wrote %s at tick %d" % [out, sim.tick])
	quit(0)
