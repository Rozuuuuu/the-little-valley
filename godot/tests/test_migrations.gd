extends TestCase
## Old browser saves: the conversion chain matches src/game/save/migrations.ts exactly, and every
## converted fixture loads, plays a day and saves again (tests/migrations-chain.test.ts).


## The JSON the Godot chain writes, read back the way the browser's output was read.
func _as_json(d: Dictionary) -> Variant:
	return JSON.parse_string(JSON.stringify(d, "", true, true))


## The first place two JSON values differ, or "" when they match.
func _diff(a: Variant, b: Variant, at: String = "") -> String:
	if a is Dictionary and b is Dictionary:
		for k: Variant in a:
			if not (b as Dictionary).has(k):
				return "%s.%s only in Godot's output" % [at, k]
			var d := _diff(a[k], b[k], "%s.%s" % [at, k])
			if d != "":
				return d
		for k: Variant in b:
			if not (a as Dictionary).has(k):
				return "%s.%s missing from Godot's output" % [at, k]
		return ""
	if a is Array and b is Array:
		if (a as Array).size() != (b as Array).size():
			return "%s has %d entries, browser %d" % [at, (a as Array).size(), (b as Array).size()]
		for i in (a as Array).size():
			var d := _diff(a[i], b[i], "%s[%d]" % [at, i])
			if d != "":
				return d
		return ""
	return "" if a == b else "%s: %s, browser %s" % [at, str(a), str(b)]


func test_the_chain_matches_the_browser_step_for_step() -> void:
	var golden: Dictionary = load_json("res://tests/golden/migrated.json")
	var v1: Dictionary = golden["v1"]
	var m := Migrations.migrate(v1["raw"], SaveCodec.VERSION)
	check_eq(m["error"], "", "the prototype save converts")
	check_eq(_diff(_as_json(m["save"]), v1["out"]), "", "the prototype save converts exactly as in the browser")
	for v: int in [2, 3, 4, 11, 12]:
		var raw: Dictionary = load_json("res://tests/golden/v%d-save.json" % v)
		var before := JSON.stringify(raw)
		var r := Migrations.migrate(raw, SaveCodec.VERSION)
		check_eq(_diff(_as_json(r["save"]), golden["v%d" % v]["out"]), "", "v%d converts exactly as in the browser" % v)
		check_eq(JSON.stringify(raw), before, "converting v%d leaves the original alone" % v)


func test_every_old_save_loads_plays_a_day_and_saves_again() -> void:
	for v: int in [2, 3, 4, 11]:
		var raw: Dictionary = load_json("res://tests/golden/v%d-save.json" % v)
		var r := SaveCodec.decode(raw)
		if not check(r["sim"] != null, "v%d loads: %s" % [v, r["error"]]):
			continue
		var sim: Simulation = r["sim"]
		# Old worlds keep their rules and land; before v12 there was no ruler on the map.
		check(sim.world.gen < 4, "v%d keeps its old generator" % v)
		check_eq(sim.world.habitat_id, "valley", "v%d is a valley" % v)
		check(sim.ruler() == null, "v%d has no ruler on the map" % v)
		if v != 11:
			check_eq(sim.growth_mode, "legacy", "v%d keeps newcomer arrivals" % v)
			check(sim.world.gen < 3, "v%d world generator" % v)
			check(sim.wars.is_empty(), "v%d has no wars" % v)
			var plain := true
			for s: Settler in sim.settlers:
				if not s.military.is_empty() or s.life_stage != "adult" or s.kingdom_id != 0:
					plain = false
			check(plain, "v%d: everyone is an adult civilian of the player's kingdom" % v)
		var players := sim.kingdoms.filter(func(k: Dictionary) -> bool: return k.get("player") == true)
		check_eq(players.size(), 1, "v%d has one player kingdom" % v)
		var people := sim.settlers.size()
		SimHelpers.run(sim, Defs.DAY_TICKS)
		check(sim.settlers.size() >= people, "v%d keeps its people through a day" % v)
		check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "v%d plays on cleanly" % v)
		var again := SaveCodec.decode(_as_json(SaveCodec.encode(sim, "Chain", 0)))
		if check(again["sim"] != null, "v%d saves and loads again: %s" % [v, again["error"]]):
			check_eq((again["sim"] as Simulation).settlers.size(), sim.settlers.size(), "v%d keeps everyone after saving" % v)


func test_genuine_v11_and_v12_saves() -> void:
	var r11 := SaveCodec.decode(load_json("res://tests/golden/v11-save.json"))
	if check(r11["sim"] != null, "v11 loads: %s" % r11["error"]):
		var sim: Simulation = r11["sim"]
		check(Kingdoms.player(sim)["crowned"] == true, "the v11 crown survives")
		check_eq(sim.routes.size(), 1, "the v11 supply route survives")
		SimHelpers.run(sim, Defs.DAY_TICKS / 2)
		check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "v11 plays on")
	var raw: Dictionary = load_json("res://tests/golden/v12-save.json")
	var r12 := SaveCodec.decode(raw)
	if check(r12["sim"] != null, "v12 loads: %s" % r12["error"]):
		var sim: Simulation = r12["sim"]
		check_eq(sim.world.habitat_id, "highlands", "v12 habitat")
		check(sim.ruler() != null, "v12 ruler")
		var hall: Building = null
		for b: Building in sim.buildings.values():
			if b.type == "townHall":
				hall = b
		check(hall != null and not hall.upgrade.is_empty() and sim.upgrading.has(hall.id), "the Town Hall upgrade under way survives")
		check(sim.animals.any(func(a: Animal) -> bool: return a.pen_id != -1), "penned animals survive")
		check(sim.work_areas.any(func(a: WorkArea) -> bool: return a.wanted > 0 and a.crop == "turnip"), "staffed turnip farm survives")
		SimHelpers.run(sim, Defs.DAY_TICKS / 2)
		check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "v12 plays on")
	# A damaged animal is refused, and the file is left alone.
	var bad: Dictionary = raw.duplicate(true)
	(bad["sim"]["animals"] as Array)[0]["species"] = "dragon"
	check(SaveCodec.decode(bad)["sim"] == null, "a damaged v12 save is refused")
	check(str((raw["sim"]["animals"] as Array)[0]["species"]) != "dragon", "the original is untouched")


func test_bad_versions_and_damaged_old_saves_are_refused() -> void:
	check(str(SaveCodec.decode({"version": SaveCodec.VERSION + 1})["error"]).contains("newer"), "a newer save is refused")
	check(str(SaveCodec.decode({"version": 0})["error"]).contains("version"), "version 0 is refused")
	check(str(SaveCodec.decode({"version": "two"})["error"]).contains("version"), "a text version is refused")
	var good: Dictionary = load_json("res://tests/golden/v4-save.json")
	var bad: Dictionary = good.duplicate(true)
	(bad["sim"]["settlers"] as Array)[0]["hunger"] = "lots"
	var r := SaveCodec.decode(bad)
	check(r["sim"] == null and str(r["error"]).contains("damaged"), "a damaged v4 save is refused: %s" % r["error"])
	check(str((good["sim"]["settlers"] as Array)[0]["hunger"]) != "lots", "the original is untouched")


func test_bringing_saves_in_keeps_them_converted_and_named() -> void:
	var store := SaveStore.new("user://test_import_%d" % Time.get_ticks_usec())
	var text := FileAccess.get_file_as_string("res://tests/golden/v4-save.json")
	check_eq(store.import_text(text, "browser-slot-1", "From the old game"), "", "a v4 save is brought in")
	var pts := store.points("browser-slot-1")
	check(pts.size() == 1 and pts[0]["label"] == "From the old game", "as a named save point, so it is never pruned")
	var got := store.load_point("browser-slot-1")
	check_eq(int(got["data"]["version"]), SaveCodec.VERSION, "stored converted to the current version")
	check(SaveCodec.decode(got["data"])["sim"] != null, "and opens")
	allowed_errors.append("Parse JSON failed")
	check(store.import_text("{ nope", "w2", "x") != "", "text that is not a save is refused")
	check(store.points("w2").is_empty(), "and nothing is kept for it")


func test_old_game_copies_are_tried_newest_first() -> void:
	var old := '{"meta":{"savedAt":100}}'
	var newer := '{"meta":{"savedAt":200}}'
	var e := Files.old_slot({"meta": {"slot": "a", "name": "Vale"}, "current": old, "backup": "b", "emergency": newer})
	check_eq(e["candidates"], [newer, old, "b"], "a newer emergency copy is tried first")
	e = Files.old_slot({"meta": {"slot": "a"}, "current": newer, "backup": null, "emergency": old})
	check_eq(e["candidates"], [newer], "an older emergency copy is ignored")
	check_eq(Files.save_file_name("Oak Hollow!", 12), "little-valley-Oak-Hollow-day-12.json", "file names are safe")
	check_eq(Files.save_file_name("???", 1), "little-valley-valley-day-1.json", "an unusable name falls back")
