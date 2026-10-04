extends TestCase
## The playable slice's simulation, ported from the browser game's tests/simulation.test.ts:
## same seeds, same commands, same expectations (where a system is not in the slice yet, the test
## says so instead).

const DAY := Defs.DAY_TICKS


func test_new_game() -> void:
	var sim := NewGame.create(101)
	check_eq(sim.settlers.size(), 5, "settlers")
	check(SimHelpers.camp(sim).built, "the Town Hall is built")
	check_eq(int(sim.totals()["food"]), 30, "starting food")
	var beds := 0
	for b: Building in sim.buildings.values():
		beds += b.beds()
	check_eq(beds, 10, "hall bunks")
	var names := {}
	for s in sim.settlers:
		names[s.name] = true
	check_eq(names.size(), 5, "distinct names")
	check(not bool(Commands.apply(sim, {"type": "remove", "buildingId": SimHelpers.camp(sim).id})["ok"]), "the Town Hall can't be demolished")


func test_chops_a_tree_and_carries_the_wood_to_storage() -> void:
	var sim := NewGame.create(202)
	var tree := SimHelpers.nearest_resource(sim, "wood")
	if not check(tree.x != -99999, "a tree near the hall"):
		return
	var wood_before := int(sim.totals()["wood"])
	var s := sim.settlers[3]
	s.job = "hauler"
	check(bool(Commands.apply(sim, {"type": "gather", "ids": [s.id], "x": tree.x, "y": tree.y})["ok"]), "gather order accepted")
	check(SimHelpers.run_until(sim, func() -> bool: return sim.world.obj(tree.x, tree.y) == Tiles.O_STUMP, 3000) >= 0, "the tree becomes a stump")
	check(SimHelpers.run_until(sim, func() -> bool: return not s.carrying(), 1000) >= 0, "the wood is delivered")
	check(int(sim.totals()["wood"]) >= wood_before + 8, "wood in storage: %d (was %d)" % [int(sim.totals()["wood"]), wood_before])
	check(sim.regrowth.size() > 0, "regrowth scheduled")


func test_rejects_gathering_from_empty_ground() -> void:
	var sim := NewGame.create(202)
	var res := Commands.apply(sim, {"type": "gather", "ids": [sim.settlers[0].id], "x": 0, "y": 1})
	check(not bool(res["ok"]), "refused")
	check(str(res["message"]).contains("Nothing to gather"), "reason: %s" % res["message"])


func test_marked_resources_are_collected() -> void:
	var sim := NewGame.create(303)
	var rock := SimHelpers.nearest_resource(sim, "stone")
	var res := Commands.apply(sim, {"type": "designate", "x0": rock.x, "y0": rock.y, "x1": rock.x, "y1": rock.y, "on": true})
	check(bool(res["ok"]), "designated")
	check(SimHelpers.run_until(sim, func() -> bool:
		var o := sim.world.obj(rock.x, rock.y)
		return o != Tiles.O_ROCK and o != Tiles.O_BOULDER, 4000) >= 0, "the rock is mined out")
	check_eq(sim.designations.size(), 0, "marks cleared")


func test_builds_a_house_consuming_exactly_its_cost() -> void:
	var sim := NewGame.create(404)
	SimHelpers.camp(sim).inventory = {"food": 60, "wood": 40, "stone": 20}
	var house := SimHelpers.find_spot(sim, "house")
	if not check(house != null and not house.built, "a house site"):
		return
	check(SimHelpers.run_until(sim, func() -> bool: return house.built, DAY) >= 0, "the house is finished within a day")
	check_eq(SimHelpers.accounted_for(sim, "wood") + SimHelpers.consumed_by_construction(sim, "wood"), 40 + int(sim.stats["woodGathered"]), "wood accounted for")
	check_eq(SimHelpers.accounted_for(sim, "stone") + SimHelpers.consumed_by_construction(sim, "stone"), 20 + int(sim.stats["stoneGathered"]), "stone accounted for")
	var beds := 0
	for b: Building in sim.buildings.values():
		beds += b.beds()
	check_eq(beds, 12, "beds after the house")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations")


func test_refuses_placement_on_water_trees_and_unexplored_land() -> void:
	var sim := NewGame.create(404)
	var tree := SimHelpers.nearest_resource(sim, "wood")
	var on_tree := Commands.apply(sim, {"type": "place", "building": "house", "x": tree.x, "y": tree.y})
	check(not bool(on_tree["ok"]) and str(on_tree["message"]).contains("harvest it first"), "tree: %s" % on_tree["message"])
	var far := Commands.apply(sim, {"type": "place", "building": "house", "x": 200, "y": 200})
	check(str(far["message"]).contains("Explore"), "far: %s" % far["message"])
	var pond := Commands.apply(sim, {"type": "place", "building": "storehouse", "x": 8, "y": 5})
	check(not bool(pond["ok"]), "the spawn pond refuses a storehouse")


func test_cancelling_a_site_refunds_delivered_materials() -> void:
	var sim := NewGame.create(505)
	SimHelpers.camp(sim).inventory = {"wood": 40, "stone": 20, "food": 50}
	var house := SimHelpers.find_spot(sim, "house")
	check(SimHelpers.run_until(sim, func() -> bool: return int(house.delivered.get("wood", 0)) >= 10, 2000) >= 0, "wood delivered to the site")
	Commands.apply(sim, {"type": "remove", "buildingId": house.id})
	SimHelpers.run(sim, 400)
	check_eq(SimHelpers.accounted_for(sim, "wood"), 40 + int(sim.stats["woodGathered"]), "every unit of wood is back")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations")


func test_path_sites_become_road() -> void:
	var sim := NewGame.create(606)
	var res := Commands.apply(sim, {"type": "placeArea", "building": "path", "x0": -3, "y0": 3, "x1": 3, "y1": 3})
	check(bool(res["ok"]), "paths placed: %s" % res["message"])
	check(SimHelpers.run_until(sim, func() -> bool:
		for b: Building in sim.buildings.values():
			if b.type == "path":
				return false
		return true, DAY) >= 0, "every path is laid")
	check_eq(sim.world.terrain(0, 3), Tiles.ROAD, "road terrain")
	check(sim.walkable(0, 3) and is_equal_approx(sim.cost(0, 3), 0.6), "roads are walkable and cheap")


func test_bridge_over_shallow_water_once_unlocked() -> void:
	var sim := NewGame.create(707)
	SimHelpers.camp(sim).inventory = {"planks": 10, "food": 60}
	var spot := Vector2i(-99999, 0)
	for y in range(0, 14):
		for x in range(4, 16):
			if spot.x == -99999 and sim.world.terrain(x, y) == Tiles.WATER and sim.world.terrain(x - 1, y) != Tiles.WATER and sim.world.explored(x, y):
				spot = Vector2i(x, y)
	if not check(spot.x != -99999, "shallow water at the pond's edge"):
		return
	var locked := Commands.apply(sim, {"type": "place", "building": "bridge", "x": spot.x, "y": spot.y})
	check(str(locked["message"]).contains("hamlet") or str(locked["message"]).contains("Hamlet"), "locked until Hamlet: %s" % locked["message"])
	sim.reached.append("hamlet")
	check(bool(Commands.apply(sim, {"type": "place", "building": "bridge", "x": spot.x, "y": spot.y})["ok"]), "bridge placed")
	check(SimHelpers.run_until(sim, func() -> bool: return sim.world.terrain(spot.x, spot.y) == Tiles.BRIDGE, DAY) >= 0, "the bridge is built")
	check(sim.walkable(spot.x, spot.y), "the bridge is walkable")
	check_eq(int(sim.totals()["planks"]), 8, "the bridge cost 2 planks")


func test_farming_cycle_through_every_stage() -> void:
	var sim := NewGame.create(707)
	var res := Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -8, "y0": 4, "x1": -7, "y1": 5, "crop": "turnip"})
	check(bool(res["ok"]), "fields placed: %s" % res["message"])
	var fields: Array[Building] = []
	for b: Building in sim.buildings.values():
		if b.is_field():
			fields.append(b)
	check(fields.size() >= 3, "at least 3 fields (a stray bush may block one)")
	var f := fields[0].field
	var seen := {}
	check(SimHelpers.run_until(sim, func() -> bool:
		seen[Farming.field_stage(f)] = true
		return int(sim.stats["harvested"]) > 0, DAY * 3) >= 0, "a harvest within three days")
	var stages: Array = seen.keys().filter(func(v: int) -> bool: return v >= 0)
	stages.sort()
	check_eq(stages, [0, 1, 2, 3], "every growth stage seen")


func test_dry_fields_grow_slower_but_never_die() -> void:
	var sim := NewGame.create(808)
	Commands.apply(sim, {"type": "place", "building": "field", "x": -7, "y": 5, "crop": "wheat"})
	var b: Building = null
	for x: Building in sim.buildings.values():
		if x.is_field():
			b = x
	b.field["state"] = "growing"
	b.field["moisture"] = 0.0
	sim.settlers.clear()
	SimHelpers.camp(sim).inventory = {}
	SimHelpers.run(sim, 500)
	check_eq(b.field["state"], "growing", "still growing")
	check(float(b.field["growth"]) > 0.0 and float(b.field["growth"]) < 500.0, "grew slowly: %s" % str(b.field["growth"]))


func test_only_unlocked_crops() -> void:
	var sim := NewGame.create(808)
	Commands.apply(sim, {"type": "place", "building": "field", "x": -7, "y": 5})
	var b: Building = null
	for x: Building in sim.buildings.values():
		if x.is_field():
			b = x
	check(not bool(Commands.apply(sim, {"type": "setCrop", "buildingIds": [b.id], "crop": "pumpkin"})["ok"]), "pumpkin locked")
	sim.reached.append("hamlet")
	check(bool(Commands.apply(sim, {"type": "setCrop", "buildingIds": [b.id], "crop": "pumpkin"})["ok"]), "pumpkin at Hamlet")


func test_settlers_eat_and_sleep_at_night() -> void:
	var sim := NewGame.create(909)
	for s in sim.settlers:
		s.hunger = 20
	var food := int(sim.totals()["food"])
	SimHelpers.run(sim, 300)
	check(int(sim.totals()["food"]) < food, "food was eaten")
	for s in sim.settlers:
		check(s.hunger > 40, "%s ate (hunger %.0f)" % [s.name, s.hunger])
	SimHelpers.run_until(sim, sim.is_night, DAY)
	SimHelpers.run(sim, 200)
	var asleep := 0
	for s in sim.settlers:
		if s.anim == &"sleep":
			asleep += 1
	check(asleep >= 4, "%d of 5 asleep" % asleep)


func test_goods_are_never_lost_or_duplicated_over_days() -> void:
	var sim := NewGame.create(4242)
	SimHelpers.camp(sim).inventory = {"food": 40, "wood": 60, "stone": 30}
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 3, "x1": -6, "y1": 6, "crop": "turnip"})
	SimHelpers.find_spot(sim, "house")
	var wood := SimHelpers.nearest_resource(sim, "wood")
	Commands.apply(sim, {"type": "gather", "ids": [sim.settlers[1].id, sim.settlers[3].id], "x": wood.x, "y": wood.y})
	for i in 6:
		SimHelpers.run(sim, DAY / 2)
		check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations after half-day %d" % (i + 1))
		for res: String in ["wood", "stone"]:
			var start := 60 if res == "wood" else 30
			var gathered: int = sim.stats["woodGathered" if res == "wood" else "stoneGathered"]
			check_eq(SimHelpers.accounted_for(sim, res) + SimHelpers.consumed_by_construction(sim, res), start + gathered, "%s after half-day %d" % [res, i + 1])
	check(int(sim.stats["harvested"]) > 0, "something was harvested")


func test_orders_release_reservations_mid_task() -> void:
	var sim := NewGame.create(4242)
	SimHelpers.camp(sim).inventory = {"food": 40, "wood": 60, "stone": 30}
	SimHelpers.find_spot(sim, "house")
	Commands.apply(sim, {"type": "designate", "x0": -15, "y0": -15, "x1": 15, "y1": 15, "on": true})
	var ids: Array[int] = []
	for s in sim.settlers:
		ids.append(s.id)
	for i in 30:
		SimHelpers.run(sim, 37)
		# Interrupt everyone in turn with each kind of order.
		var s := sim.settlers[i % sim.settlers.size()]
		match i % 4:
			0:
				Commands.apply(sim, {"type": "stop", "ids": [s.id]})
			1:
				Commands.apply(sim, {"type": "move", "ids": [s.id], "x": 0, "y": 4})
			2:
				Commands.apply(sim, {"type": "setJob", "ids": [s.id], "job": ["farmer", "builder", "hauler", "gatherer"][i % 4]})
			3:
				Commands.apply(sim, {"type": "hold", "ids": ids.slice(0, 2)})
		check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations after interruption %d" % i)
		check_eq(SimHelpers.accounted_for(sim, "wood") + SimHelpers.consumed_by_construction(sim, "wood"), 60 + int(sim.stats["woodGathered"]), "wood after interruption %d" % i)
