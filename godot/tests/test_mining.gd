extends TestCase
## Surveying, mines, quarries and fishing, ported from tests/mining.test.ts and the fisher's hut
## case of tests/animals.test.ts (same seeds and scenarios). The industry cases (fuel, ingots,
## tools) are covered by the production tests.


func _reload(sim: Simulation) -> Simulation:
	var text := JSON.stringify(SaveCodec.encode(sim, "Mine", 0), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	check_eq(str(loaded["error"]), "", "reloads")
	return loaded["sim"]


func _instant(sim: Simulation, type: String, near: Vector2i) -> Building:
	for r in 24:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				if bool(BuildingOps.check_placement(sim, type, x, y)["ok"]):
					var b := BuildingOps.place(sim, type, x, y)
					b.delivered = BuildingOps.cost_of(b).duplicate()
					BuildingOps.complete(sim, b, true)
					return b
	return null


## A Hamlet valley with the starter copper surveyed, revealed and reachable, plus a storehouse
## halfway to it. Returns [sim, deposit].
func _mine_world(seed_value: int = 424242) -> Array:
	var sim := NewGame.create(seed_value)
	sim.reached.append("hamlet")
	var dep: Dictionary = Geology.starter_deposits(sim.seed_value, 3)["copper"]
	var dx := int(dep["x"])
	var dy := int(dep["y"])
	for i in 13:
		sim.world.reveal(dx * i / 12.0, dy * i / 12.0, 7)
	sim.world.reveal(dx, dy, 10)
	sim.load_nav_area(0, 0)
	Mining.complete_survey(sim, sim.settlers[0], dx, dy)
	SimHelpers.camp(sim).inventory = {"food": 100, "wood": 60, "stone": 40, "planks": 30, "tools": 6}
	_instant(sim, "storehouse", Vector2i(roundi(dx / 2.0), roundi(dy / 2.0)))
	return [sim, dep]


func _place_mine(sim: Simulation, dep: Dictionary) -> Building:
	for d: Vector2i in [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(-1, -1)]:
		var x := int(dep["x"]) + d.x
		var y := int(dep["y"]) + d.y
		if bool(BuildingOps.check_placement(sim, "mine", x, y)["ok"]):
			var b := BuildingOps.place(sim, "mine", x, y)
			b.delivered = BuildingOps.cost_of(b).duplicate()
			BuildingOps.complete(sim, b)
			return b
	check(false, "no mine footprint: %s" % BuildingOps.check_placement(sim, "mine", int(dep["x"]), int(dep["y"]))["reason"])
	return null


func _remaining(sim: Simulation, dep: Dictionary) -> int:
	var c := Geology.cell_of(int(dep["x"]), int(dep["y"]))
	return int(Mining.known_cell(sim, c.x, c.y)["deposit"]["remaining"])


func test_mine_needs_a_surveyed_deposit_and_a_quarry_rock_or_hills() -> void:
	var w := _mine_world()
	var sim: Simulation = w[0]
	var dep: Dictionary = w[1]
	var iron: Dictionary = Geology.starter_deposits(sim.seed_value, 3)["iron"]
	sim.world.reveal(int(iron["x"]), int(iron["y"]), 8)
	check(str(BuildingOps.check_placement(sim, "mine", int(iron["x"]), int(iron["y"]))["reason"]).to_lower().contains("survey"), "unsurveyed iron refused")
	var r := str(BuildingOps.check_placement(sim, "mine", 2, 3)["reason"]).to_lower()
	check(r.contains("survey") or r.contains("deposit"), "no deposit at the camp: %s" % r)
	var mine := _place_mine(sim, dep)
	if mine == null:
		return
	check_eq(int(mine.mine["level"]), 1, "shaft level 1")
	check_eq(int(mine.mine["depositId"]), int(dep["id"]), "over the copper")
	check(not bool(BuildingOps.check_placement(sim, "mine", int(dep["x"]) + 1, int(dep["y"]))["ok"]), "one mine per deposit")
	var qr := str(BuildingOps.check_placement(sim, "quarry", 3, 3)["reason"]).to_lower()
	check(qr.contains("rock") or qr.contains("hill"), "grass refused: %s" % qr)
	var ok := false
	for dx in range(-5, 6):
		for dy in range(-5, 6):
			var x := int(dep["x"]) + dx
			var y := int(dep["y"]) + dy
			if not ok and sim.world.terrain(x, y) == Tiles.HILL and bool(BuildingOps.check_placement(sim, "quarry", x, y)["ok"]):
				ok = true
	check(ok, "hill slopes take a quarry")


func test_miners_bring_ore_and_the_deposit_shrinks_exactly_across_a_reload() -> void:
	var w := _mine_world()
	var sim: Simulation = w[0]
	var dep: Dictionary = w[1]
	var mine := _place_mine(sim, dep)
	if mine == null:
		return
	check(bool(Commands.apply(sim, {"type": "assignWorker", "buildingId": mine.id, "ids": [sim.settlers[0].id]})["ok"]), "miner assigned")
	check(SimHelpers.run_until(sim, func() -> bool: return int(sim.stats["oreMined"]) > 0, Defs.DAY_TICKS * 2) >= 0, "ore mined")
	check_eq(_remaining(sim, dep) + int(sim.stats["oreMined"]), int(dep["initial"]), "the deposit shrank by what was mined")
	SimHelpers.run(sim, 300)
	var loaded := _reload(sim)
	check_eq(_remaining(loaded, dep), _remaining(sim, dep), "same ore left after reload")
	SimHelpers.run(loaded, Defs.DAY_TICKS / 2)
	check_eq(_remaining(loaded, dep) + int(loaded.stats["oreMined"]), int(dep["initial"]), "still exact after more mining")
	check_eq(SimHelpers.accounted_for(loaded, "copperOre"), int(loaded.stats["oreMined"]), "every unit is somewhere")
	check_eq(SimHelpers.reservation_problems(loaded), PackedStringArray(), "reservations consistent")


func test_two_miners_race_for_the_last_unit() -> void:
	var w := _mine_world()
	var sim: Simulation = w[0]
	var mine := _place_mine(sim, w[1])
	if mine == null:
		return
	var id := int(mine.mine["depositId"])
	sim.geology[id] = 1
	Commands.apply(sim, {"type": "assignWorker", "buildingId": mine.id, "ids": [sim.settlers[0].id, sim.settlers[1].id]})
	check_eq(mine.workers.size(), 2, "two miners")
	SimHelpers.run(sim, Defs.DAY_TICKS / 2)
	check_eq(int(sim.stats["oreMined"]), 1, "exactly one unit mined")
	check_eq(SimHelpers.accounted_for(sim, "copperOre"), 1, "and it is in store or in hand")
	check_eq(int(sim.geology[id]), 0, "worked out")
	check_eq(int(sim.ore_reserved.get(id, 0)), 0, "nothing still promised")
	for s in sim.settlers:
		check(s.task == null or s.task.kind != Task.EXTRACT, "%s is not digging" % s.name)
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations consistent")


func test_deepening_the_shaft() -> void:
	var w := _mine_world()
	var sim: Simulation = w[0]
	var mine := _place_mine(sim, w[1])
	if mine == null:
		return
	var planks := sim.stored_total("planks")
	check(bool(Commands.apply(sim, {"type": "upgradeMine", "buildingId": mine.id})["ok"]), "deepened")
	check_eq(int(mine.mine["level"]), 2, "level 2")
	check(sim.stored_total("planks") < planks, "paid in planks")
	check(Mining.MINE_YIELD[2] > Mining.MINE_YIELD[1], "more per trip")
	SimHelpers.camp(sim).inventory["tools"] = 0
	var snapshot := sim.totals()
	var res := Commands.apply(sim, {"type": "upgradeMine", "buildingId": mine.id})
	check(not bool(res["ok"]) and str(res["message"]).contains("tools"), "refused for tools: %s" % res["message"])
	check_eq(sim.totals(), snapshot, "nothing charged")
	SimHelpers.camp(sim).inventory["tools"] = 10
	check(bool(Commands.apply(sim, {"type": "upgradeMine", "buildingId": mine.id})["ok"]), "level 3")
	check(str(Commands.apply(sim, {"type": "upgradeMine", "buildingId": mine.id})["message"]).contains("deepest"), "no deeper")
	check_eq(int((_reload(sim).buildings[mine.id] as Building).mine["level"]), 3, "kept on reload")


func test_quarry_cuts_stone_and_its_pit_persists() -> void:
	var w := _mine_world()
	var sim: Simulation = w[0]
	var dep: Dictionary = w[1]
	var q: Building = null
	for dx in range(-5, 6):
		for dy in range(-5, 6):
			if q == null and bool(BuildingOps.check_placement(sim, "quarry", int(dep["x"]) + dx, int(dep["y"]) + dy)["ok"]):
				q = BuildingOps.place(sim, "quarry", int(dep["x"]) + dx, int(dep["y"]) + dy)
				q.delivered = BuildingOps.cost_of(q).duplicate()
				BuildingOps.complete(sim, q)
	check(q != null, "a quarry placed")
	if q == null:
		return
	Commands.apply(sim, {"type": "assignWorker", "buildingId": q.id, "ids": [sim.settlers[2].id]})
	check(SimHelpers.run_until(sim, func() -> bool: return int(q.quarry["extracted"]) >= 12, Defs.DAY_TICKS * 2) >= 0, "stone cut")
	check_eq(int(sim.stats["stoneQuarried"]), int(q.quarry["extracted"]), "stat matches")
	check_eq(int((_reload(sim).buildings[q.id] as Building).quarry["extracted"]), int(q.quarry["extracted"]), "pit kept on reload")


func test_full_storage_stops_miners_with_a_reason() -> void:
	var w := _mine_world()
	var sim: Simulation = w[0]
	var mine := _place_mine(sim, w[1])
	if mine == null:
		return
	for st in sim.storages():
		Inv.add(st.inventory, "stone", st.storage_capacity() - sim.storage_used(st))
	Commands.apply(sim, {"type": "assignWorker", "buildingId": mine.id, "ids": [sim.settlers[0].id]})
	SimHelpers.run(sim, 600)
	check_eq(int(sim.stats["oreMined"]), 0, "no ore lost")
	check(sim.settlers[0].idle_reason.to_lower().contains("storage"), "says why: %s" % sim.settlers[0].idle_reason)


func test_survey_order_finds_the_starter_copper() -> void:
	var sim := NewGame.create(424242)
	var dep: Dictionary = Geology.starter_deposits(sim.seed_value, 3)["copper"]
	for i in 13:
		sim.world.reveal(int(dep["x"]) * i / 12.0, int(dep["y"]) * i / 12.0, 7)
	var s := sim.settlers[1]
	var r := Commands.apply(sim, {"type": "surveyDeposit", "settlerId": s.id, "x": int(dep["x"]), "y": int(dep["y"])})
	check(bool(r["ok"]), "survey ordered: %s" % r["message"])
	check(SimHelpers.run_until(sim, func() -> bool: return int(sim.stats["surveys"]) > 0, Defs.DAY_TICKS) >= 0, "surveyed")
	check_eq(_remaining(sim, dep), int(dep["initial"]), "copper found, untouched")
	check(str(Commands.apply(sim, {"type": "surveyDeposit", "settlerId": s.id, "x": int(dep["x"]), "y": int(dep["y"])})["message"]).contains("Already surveyed"), "once per cell")


func test_fisher_hut_must_touch_water_and_lands_fish() -> void:
	var sim := NewGame.create(8989)
	SimHelpers.camp(sim).inventory = {"food": 150, "wood": 100, "stone": 80, "planks": 40}
	sim.reached.append("hamlet")
	var dry := Vector2i(-99999, 0)
	for r in range(0, 12):
		for x in range(-4 - r, -4 + r + 1):
			if dry.x == -99999 and str(BuildingOps.check_placement(sim, "fisherHut", x, -8)["reason"]).contains("shore"):
				dry = Vector2i(x, -8)
	check(dry.x != -99999, "a dry spot")
	var m := str(Commands.apply(sim, {"type": "place", "building": "fisherHut", "x": dry.x, "y": dry.y})["message"]).to_lower()
	check(m.contains("shore") or m.contains("water"), "dry ground refused: %s" % m)
	var spot := Vector2i(-99999, 0)
	for y in range(1, 12):
		for x in range(3, 16):
			if spot.x == -99999 and bool(Commands.apply(sim, {"type": "place", "building": "fisherHut", "x": x, "y": y})["ok"]):
				spot = Vector2i(x, y)
	check(spot.x != -99999, "a shore spot by the pond")
	if spot.x == -99999:
		return
	var hut := sim.building_at(spot.x, spot.y)
	check(SimHelpers.run_until(sim, func() -> bool: return hut.built, Defs.DAY_TICKS * 2) >= 0, "built")
	Commands.apply(sim, {"type": "assignWorker", "buildingId": hut.id, "ids": [sim.settlers[3].id]})
	var food0 := int(sim.stats["foodGathered"])
	check(SimHelpers.run_until(sim, func() -> bool: return int(sim.stats["foodGathered"]) >= food0 + 3, Defs.DAY_TICKS) >= 0, "fish landed")
