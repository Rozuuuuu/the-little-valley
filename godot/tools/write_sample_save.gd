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
	# Some realm state too: a crown, a known neighbour, a treaty offer and news on its way.
	for m: String in ["hamlet", "village", "town", "region"]:
		sim.reached.append(m)
	Commands.apply(sim, {"type": "coronate", "rulerName": "Lloyd", "kingdomName": "Valleyhold", "banner": {"color": "#3a6ea5", "emblem": "oak"}})
	Kingdoms.player(sim)["treasury"] = 200
	Commands.apply(sim, {"type": "appointCouncil", "post": "envoy", "settlerId": sim.settlers[0].id})
	var town: Dictionary = Regions.nearby_towns(sim.seed_value)[0]
	var rival := Kingdoms.know_of(sim, int(town["id"]))
	Commands.apply(sim, {"type": "proposeTreaty", "kind": "trade", "to": rival["id"], "terms": {"durationDays": 8, "payment": 10}})
	for i in 1500:
		sim.step()
	var f := FileAccess.open(out, FileAccess.WRITE)
	f.store_string(JSON.stringify(SaveCodec.encode(sim, "Sample", 1), "", true, true))
	f.close()
	print("wrote %s at tick %d" % [out, sim.tick])
	quit(0)
