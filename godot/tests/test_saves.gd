extends TestCase
## Saves: exact round trips, conservation after loading, safe storage with history, refusal of
## damaged and unsupported files, and importing a genuine save written by the browser game.


func _state(sim: Simulation) -> Dictionary:
	# A canonical view of the authoritative state (what a save must preserve).
	var d := SaveCodec.encode(sim, "x", 0)
	(d["meta"] as Dictionary).erase("savedAt")
	return d


func test_round_trip_is_exact() -> void:
	var sim := NewGame.create(4242)
	SimHelpers.camp(sim).inventory = {"food": 40, "wood": 60, "stone": 30}
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 3, "x1": -6, "y1": 6, "crop": "turnip"})
	SimHelpers.find_spot(sim, "house")
	Commands.apply(sim, {"type": "designate", "x0": -15, "y0": -15, "x1": 15, "y1": 15, "on": true})
	Commands.apply(sim, {"type": "setPriorities", "ids": [sim.settlers[0].id], "priorities": ["farm", "haul"]})
	SimHelpers.run(sim, Defs.DAY_TICKS / 2)
	var before := _state(sim)
	var text := JSON.stringify(SaveCodec.encode(sim, "Round trip", 0), "", true, true)
	var loaded := SaveCodec.decode(JSON.parse_string(text))
	if not check(loaded["sim"] != null, "loads: %s" % loaded["error"]):
		return
	check_eq(loaded["report"], PackedStringArray(), "nothing unsupported in our own save")
	var sim2: Simulation = loaded["sim"]
	var diff := _first_diff(before, _state(sim2), "")
	check(diff == "", "state after reload equals state before; first difference: %s" % diff)
	# Play on: goods stay accounted for (tasks and reservations were rebuilt, not loaded).
	var wood_base := SimHelpers.accounted_for(sim2, "wood") + SimHelpers.consumed_by_construction(sim2, "wood") - int(sim2.stats["woodGathered"])
	SimHelpers.run(sim2, Defs.DAY_TICKS / 2)
	check_eq(SimHelpers.accounted_for(sim2, "wood") + SimHelpers.consumed_by_construction(sim2, "wood") - int(sim2.stats["woodGathered"]), wood_base, "wood conserved after loading")
	check_eq(SimHelpers.reservation_problems(sim2), PackedStringArray(), "reservations after loading")


func test_modified_land_survives_and_unmodified_land_regenerates() -> void:
	var sim := NewGame.create(606)
	Commands.apply(sim, {"type": "placeArea", "building": "path", "x0": -3, "y0": 3, "x1": 3, "y1": 3})
	SimHelpers.run_until(sim, func() -> bool: return sim.world.terrain(0, 3) == Tiles.ROAD and sim.world.terrain(3, 3) == Tiles.ROAD, Defs.DAY_TICKS)
	var sim2: Simulation = SaveCodec.decode(JSON.parse_string(JSON.stringify(SaveCodec.encode(sim, "x", 0), "", true, true)))["sim"]
	check_eq(sim2.world.terrain(0, 3), Tiles.ROAD, "the road is still there")
	var probe := Vector2i(40, -40)
	check_eq(sim2.world.terrain(probe.x, probe.y), sim.world.terrain(probe.x, probe.y), "untouched land regenerates identically")
	check_eq(sim2.world.explored(20, 0), sim.world.explored(20, 0), "exploration kept")


func test_damaged_and_unknown_saves_are_refused_clearly() -> void:
	var sim := NewGame.create(101)
	var good := SaveCodec.encode(sim, "x", 0)
	check(SaveCodec.decode(null)["sim"] == null, "not a save")
	var newer := good.duplicate(true)
	newer["version"] = 99
	check(str(SaveCodec.decode(newer)["error"]).contains("newer"), "a newer save is refused as newer")
	var older := good.duplicate(true)
	older["version"] = 12
	check(str(SaveCodec.decode(older)["error"]).contains("older"), "an older save explains that conversion is not in yet")
	var bad_home := good.duplicate(true)
	(bad_home["sim"]["settlers"] as Array)[0]["homeId"] = 99999
	check(str(SaveCodec.decode(bad_home)["error"]).contains("does not exist"), "a broken reference is caught: %s" % SaveCodec.decode(bad_home)["error"])
	var dup := good.duplicate(true)
	(dup["sim"]["settlers"] as Array)[1]["id"] = (dup["sim"]["settlers"] as Array)[0]["id"]
	check(str(SaveCodec.decode(dup)["error"]).contains("twice"), "duplicate ids are caught")
	var neg := good.duplicate(true)
	(neg["sim"]["buildings"] as Array)[0]["inventory"]["food"] = -5
	check(str(SaveCodec.decode(neg)["error"]).contains("negative"), "negative stock is caught")
	var chunk := good.duplicate(true)
	(chunk["world"]["chunks"] as Array)[0]["explored"] = "AAAA"
	check(str(SaveCodec.decode(chunk)["error"]).contains("damaged"), "damaged chunk data is caught")


func test_genuine_browser_save_imports_with_a_report() -> void:
	var data: Dictionary = load_json("res://tests/golden/v15-save.json")
	if data == null:
		return
	var r := SaveCodec.decode(data)
	if not check(r["sim"] != null, "the browser save loads: %s" % r["error"]):
		return
	var sim: Simulation = r["sim"]
	var report: PackedStringArray = r["report"]
	var text := "; ".join(report)
	check_eq(sim.animals.size(), (data["sim"]["animals"] as Array).size(), "every animal arrives")
	check(not text.contains("animal"), "animals are simulated now, so not reported: %s" % text)
	check(text.contains("ruler"), "the ruler is reported: %s" % text)
	check_eq(sim.settlers.size(), (data["sim"]["settlers"] as Array).size(), "every settler arrives")
	check_eq(sim.buildings.size(), (data["sim"]["buildings"] as Array).size(), "every building arrives")
	for bd: Dictionary in data["sim"]["buildings"]:
		var b: Building = sim.buildings.get(int(bd["id"]))
		check_eq(b.inventory, Inv.from_json(bd["inventory"]), "stock of building %d" % b.id)
	for sv: Dictionary in data["sim"]["settlers"]:
		var s := sim.settler(int(sv["id"]))
		var carrying: Variant = sv["carrying"]
		check_eq(s.carry_amount, int(carrying["amount"]) if carrying is Dictionary else 0, "%s's load" % s.name)
	# The browser game's world regenerates identically, so its explored land matches tile for tile.
	var probe_ok := true
	for sc: Dictionary in data["world"]["chunks"]:
		var bits := Marshalls.base64_to_raw(str(sc["explored"]))
		if sim.world.explored_bits(int(sc["cx"]), int(sc["cy"])) != bits and bits.count(0) != bits.size():
			probe_ok = false
	check(probe_ok, "exploration matches the browser save")
	SimHelpers.run(sim, 600)
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "plays on after import")


func test_store_keeps_history_and_writes_safely() -> void:
	var dir := "user://test_saves_%d" % Time.get_ticks_usec()
	var store := SaveStore.new(dir)
	var sim := NewGame.create(101)
	var first := store.save("w1", "First valley", SaveCodec.encode(sim, "First valley", 0))
	check(bool(first["ok"]), "first save: %s" % first["error"])
	for i in SaveStore.KEEP_AUTO + 3:
		SimHelpers.run(sim, 10)
		store.save("w1", "First valley", SaveCodec.encode(sim, "First valley", 0), "Before the river" if i == 0 else "")
	var pts := store.points("w1")
	var named := pts.filter(func(p: Dictionary) -> bool: return str(p["label"]) != "")
	check_eq(named.size(), 1, "the named save point is kept")
	check_eq(pts.size() - named.size(), SaveStore.KEEP_AUTO, "only the newest automatic points are kept")
	var newest := store.load_point("w1")
	check(newest["data"] is Dictionary, "the newest point loads")
	check_eq(int(newest["data"]["sim"]["tick"]), sim.tick, "the newest point is the latest state")
	# A corrupted newest file falls back to the one before, and says so.
	allowed_errors.append("Parse JSON failed")
	var latest_path := dir.path_join("w1").path_join(str(pts[0]["id"]) + ".json")
	var f := FileAccess.open(latest_path, FileAccess.WRITE)
	f.store_string("{ not json")
	f.close()
	var fallback := store.load_point("w1")
	check(fallback["data"] is Dictionary and str(fallback["error"]).contains("loaded the save before it"), "falls back to the previous point: %s" % fallback["error"])
	# A save that can't be read back is never written.
	var broken := SaveCodec.encode(sim, "x", 0)
	(broken["sim"]["settlers"] as Array)[0]["job"] = "wizard"
	var refused := store.save("w1", "First valley", broken)
	check(not bool(refused["ok"]), "an unreadable save is refused")
	check_eq(store.points("w1").size(), pts.size(), "and leaves the history unchanged")
	check_eq(store.worlds().size(), 1, "one world listed")


## The first path where two JSON-like values differ ("" when equal).
static func _first_diff(a: Variant, b: Variant, path: String) -> String:
	if a is Dictionary and b is Dictionary:
		for k: Variant in a:
			if not (b as Dictionary).has(k):
				return "%s.%s missing after reload" % [path, k]
			var d := _first_diff(a[k], b[k], "%s.%s" % [path, k])
			if d != "":
				return d
		for k: Variant in b:
			if not (a as Dictionary).has(k):
				return "%s.%s appeared after reload" % [path, k]
		return ""
	if a is Array and b is Array:
		if (a as Array).size() != (b as Array).size():
			return "%s: %d items before, %d after" % [path, (a as Array).size(), (b as Array).size()]
		for i in (a as Array).size():
			var d := _first_diff(a[i], b[i], "%s[%d]" % [path, i])
			if d != "":
				return d
		return ""
	# Decimals may move in the last digits: Godot's JSON reader rounds 17-digit numbers inexactly
	# (measured; docs/godot/BASELINE.md, "Saves"). Everything else must match exactly.
	if a is float and b is float and absf(float(a) - float(b)) <= 1e-9 * maxf(1.0, absf(float(a))):
		return ""
	return "" if a == b else "%s: %s before, %s after" % [path, str(a), str(b)]
