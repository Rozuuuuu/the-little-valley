extends TestCase
## A supply shortage must stop bread honestly, then recover through normal hauling after reload.


func test_full_storage_stops_bakery_until_space_is_added() -> void:
	var sim := NewGame.create(606)
	sim.reached.append("hamlet")
	var bakery := RealmHelpers.instant(sim, "bakery", Vector2i(-5, -5))
	if not check(bakery != null, "bakery placed"):
		return
	bakery.delivered = {"flour": 4, "wood": 2}
	for b in sim.storages():
		b.inventory = {"wood": b.storage_capacity()}
	for s in sim.settlers:
		s.hold = true
	var baker := sim.settlers[4]
	Production.update_workshops(sim)
	check(str(bakery.workshop["status"]).contains("Storage is full"), "reports output storage rather than missing ingredients")
	check(Production.find_craft(sim, baker) is String, "no batch starts with nowhere to put output")
	check(not sim.reservations.has(Simulation.K_CRAFT + bakery.id), "blocked batch reserves no worker")
	check_eq(bakery.delivered, {"flour": 4, "wood": 2}, "blocked batch consumes nothing")
	var bakery_id := bakery.id
	sim = RealmHelpers.reload_sim(sim)
	bakery = sim.buildings[bakery_id]
	baker = sim.settlers[4]
	var extra := RealmHelpers.instant(sim, "storehouse", Vector2i(5, -4))
	if not check(extra != null, "additional storage placed"):
		return
	var wood_before := SimHelpers.accounted_for(sim, "wood")
	check(bool(Commands.apply(sim, {"type": "assignWorker", "buildingId": bakery.id, "ids": [baker.id]})["ok"]), "worker assigned")
	baker.hold = false
	baker.priorities = ["craft"]
	check(SimHelpers.run_until(sim, func() -> bool: return int(sim.stats["bakedFood"]) >= 5, Defs.DAY_TICKS) >= 0, "adding capacity lets normal crafting resume")
	check_eq(SimHelpers.accounted_for(sim, "wood") + SimHelpers.consumed_by_crafting(sim, "wood"), wood_before, "recovery conserves wood")
	check_eq(SimHelpers.accounted_for(sim, "flour") + SimHelpers.consumed_by_crafting(sim, "flour"), 4, "recovery conserves flour")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "no stale reservations")


func test_bakery_recovers_from_missing_wood_after_reload() -> void:
	var sim := NewGame.create(606)
	sim.reached.append("hamlet")
	SimHelpers.camp(sim).inventory = {"food": 60}
	var bakery := RealmHelpers.instant(sim, "bakery", Vector2i(-5, -5))
	if not check(bakery != null, "bakery placed"):
		return
	bakery.delivered = {"flour": 4}
	for s in sim.settlers:
		s.hold = true
	var baker := sim.settlers[4]
	check(bool(Commands.apply(sim, {"type": "assignWorker", "buildingId": bakery.id, "ids": [baker.id]})["ok"]), "worker assigned")
	baker.hold = false
	baker.priorities = ["haul", "craft"]
	SimHelpers.run(sim, 200)
	check_eq(int(sim.stats["bakedFood"]), 0, "flour alone does not make bread")
	check(str(bakery.workshop["status"]).contains("Needs 1 wood"), "explicit wood shortage: %s" % bakery.workshop["status"])
	check_eq(SimHelpers.accounted_for(sim, "flour"), 4, "waiting does not consume flour")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "no stranded reservations while waiting")
	var bakery_id := bakery.id
	sim = RealmHelpers.reload_sim(sim)
	bakery = sim.buildings[bakery_id]
	# External supply is explicit test setup, not a game rule or soak autopilot subsidy.
	Inv.add(SimHelpers.camp(sim).inventory, "wood", 2)
	check(SimHelpers.run_until(sim, func() -> bool: return int(sim.stats["bakedFood"]) >= 5, Defs.DAY_TICKS) >= 0, "normal delivery restarts baking after reload")
	check_eq(SimHelpers.accounted_for(sim, "wood") + SimHelpers.consumed_by_crafting(sim, "wood"), 2, "every supplied wood accounted for")
	check_eq(SimHelpers.accounted_for(sim, "flour") + SimHelpers.consumed_by_crafting(sim, "flour"), 4, "every flour accounted for")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations remain balanced after recovery")
