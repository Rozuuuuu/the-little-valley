extends TestCase
## Settlements and supply routes, ported from tests/logistics.test.ts (same seeds and scenarios).


func _reload(sim: Simulation) -> Simulation:
	var text := JSON.stringify(SaveCodec.encode(sim, "Routes", 0), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	check_eq(str(loaded["error"]), "", "reloads")
	return loaded["sim"]


## Every unit of a resource, including goods on carts and in crates.
func _held(sim: Simulation, res: String) -> int:
	var n := SimHelpers.accounted_for(sim, res)
	for m: Dictionary in sim.manifests:
		n += int((m["cargo"] as Dictionary).get(res, 0))
	return n


## Places a finished building near a spot (the browser's instant(): clear spot, then complete).
func _instant(sim: Simulation, type: String, near: Vector2i) -> Building:
	var d := Defs.building(type)
	for r in 30:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				if maxi(absi(x - near.x), absi(y - near.y)) != r:
					continue
				var ok := true
				for dy in int(d["size"]["h"]):
					for dx in int(d["size"]["w"]):
						if ok and (BuildingOps.tile_problem(sim, type, x + dx, y + dy) != "" or sim.building_at(x + dx, y + dy) != null):
							ok = false
				if ok and Settlements.spacing_problem(sim, type, x, y) == "":
					var b := BuildingOps.place(sim, type, x, y)
					b.delivered = BuildingOps.cost_of(b).duplicate()
					BuildingOps.complete(sim, b)
					return b
	return null


## Home and a waystation 34+ tiles west (same bank, explored between), with a depot at home.
func _two_towns(seed_value: int = 6060) -> Dictionary:
	var sim := NewGame.create(seed_value)
	sim.reached.append("hamlet")
	sim.reached.append("village")
	var x := 6
	while x >= -60:
		sim.world.reveal(x, 0, 11)
		x -= 3
	sim.load_nav_area(0, 0)
	var hall := _instant(sim, "waystation", Vector2i(-40, 0))
	check_eq(sim.settlements.size(), 2, "a second settlement")
	var home := SimHelpers.camp(sim)
	home.inventory = {"food": 120, "wood": 100, "stone": 20}
	var depot := _instant(sim, "depot", Vector2i(5, 5))
	var a := sim.settlers[0]
	var b := sim.settlers[1]
	check(bool(Commands.apply(sim, {"type": "assignWorker", "buildingId": depot.id, "ids": [a.id, b.id]})["ok"]), "teamsters assigned")
	return {"sim": sim, "home": home, "hall": hall, "depot": depot, "a": a, "b": b}


func _route(sim: Simulation, src: Building, dst: Building, res: String, target: int) -> int:
	var r := Commands.apply(sim, {"type": "createRoute", "sourceId": src.id, "destinationId": dst.id, "resource": res, "target": target})
	check(bool(r["ok"]), "route: %s" % r["message"])
	return int(r.get("id", -1))


func test_caravan_tops_up_the_far_store_and_goods_only_move() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var hall: Building = t["hall"]
	var wood0 := _held(sim, "wood")
	_route(sim, t["home"], hall, "wood", 40)
	check(SimHelpers.run_until(sim, func() -> bool: return int(hall.inventory.get("wood", 0)) >= 40, Defs.DAY_TICKS * 3) >= 0, "target reached")
	SimHelpers.run(sim, Defs.DAY_TICKS / 2)
	check(int(hall.inventory.get("wood", 0)) <= 60, "not overfilled")
	check(int(sim.stats["caravanDeliveries"]) > 0, "deliveries counted")
	check_eq(_held(sim, "wood"), wood0 + int(sim.stats["woodGathered"]), "wood conserved")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations consistent")


func test_needs_a_teamster_and_says_so() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var depot: Building = t["depot"]
	Commands.apply(sim, {"type": "unassignWorker", "buildingId": depot.id, "settlerId": depot.workers[0]})
	Commands.apply(sim, {"type": "unassignWorker", "buildingId": depot.id, "settlerId": depot.workers[0]})
	var id := _route(sim, t["home"], t["hall"], "wood", 30)
	SimHelpers.run(sim, 200)
	check(str(Logistics.route_info(sim, id)["status"]).to_lower().contains("teamster"), "names the teamster: %s" % Logistics.route_info(sim, id)["status"])
	var home: Building = t["home"]
	check(not bool(Commands.apply(sim, {"type": "createRoute", "sourceId": home.id, "destinationId": home.id, "resource": "wood", "target": 5})["ok"]), "two different stores")


func test_teamster_travels_and_returns_once_across_a_reload() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var hall: Building = t["hall"]
	_route(sim, t["home"], hall, "wood", 20)
	check(SimHelpers.run_until(sim, func() -> bool: return sim.manifests.any(func(m: Dictionary) -> bool: return m["state"] == "outbound"), Defs.DAY_TICKS) >= 0, "a cart left")
	var m: Dictionary = sim.manifests[0]
	var crew := sim.settler(int(m["crewId"]))
	check(crew == t["a"] or crew == t["b"], "a teamster went")
	check_eq(crew.away_on, int(m["id"]), "away with the cart")
	var loaded := _reload(sim)
	check_eq(loaded.manifests.size(), 1, "the cart survives a reload")
	check_eq(loaded.settler(crew.id).away_on, int(m["id"]), "still away after reload")
	check_eq(loaded.manifests[0]["cargo"], m["cargo"], "same cargo")
	for w: Simulation in [sim, loaded]:
		var before := int(w.stats["caravanDeliveries"])
		check(SimHelpers.run_until(w, func() -> bool: return w.manifests.is_empty(), Defs.DAY_TICKS * 2) >= 0, "the cart came home")
		check_eq(int(w.stats["caravanDeliveries"]), before + 1, "one delivery")
		check_eq(w.settler(crew.id).away_on, -1, "home again")
		check(not w.settler(crew.id).hidden, "visible again")
		check_eq(SimHelpers.reservation_problems(w), PackedStringArray(), "reservations consistent")
	check_eq(int((loaded.buildings[hall.id] as Building).inventory.get("wood", 0)), int(hall.inventory.get("wood", 0)), "same result either way")


func test_two_routes_never_overfill_and_opposing_routes_settle() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var home: Building = t["home"]
	var far: Building = t["hall"]
	var depot: Building = t["depot"]
	home.inventory = {"food": 120, "wood": 60, "stone": 60}
	far.inventory = {}
	_route(sim, home, far, "wood", 100)
	_route(sim, home, far, "stone", 100)
	SimHelpers.run(sim, Defs.DAY_TICKS * 2)
	check(sim.storage_used(far) <= far.storage_capacity(), "never overfilled")
	var depot2 := _instant(sim, "depot", Vector2i(far.x + 4, far.y + 5))
	var helper: Settler = null
	for s in sim.settlers:
		if not depot.workers.has(s.id) and s.life_stage == "adult" and not s.ruler:
			helper = s
			break
	Commands.apply(sim, {"type": "assignSettlement", "ids": [helper.id], "settlementId": far.id})
	Commands.apply(sim, {"type": "assignWorker", "buildingId": depot2.id, "ids": [helper.id]})
	_route(sim, far, home, "wood", 30)
	var trips0 := int(sim.stats["caravanDeliveries"])
	SimHelpers.run(sim, Defs.DAY_TICKS * 3)
	check(int(sim.stats["caravanDeliveries"]) - trips0 < 12, "no endless shuttling")
	check_eq(SimHelpers.reservation_problems(sim), PackedStringArray(), "reservations consistent")


func test_source_keeps_its_own_target() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var home: Building = t["home"]
	var hall: Building = t["hall"]
	home.inventory = {"food": 100, "wood": 12}
	home.wants = {"wood": 10}
	# Nobody gathers, so the source's spare stays at 2 (the browser test relies on slow gathering).
	for s in sim.settlers:
		s.has_priorities = true
		s.priorities = []
	var id := _route(sim, home, hall, "wood", 50)
	SimHelpers.run(sim, Defs.DAY_TICKS)
	check(int(home.inventory.get("wood", 0)) >= 10, "home keeps its own target")
	check(int(hall.inventory.get("wood", 0)) <= 2 + int(sim.stats["woodGathered"]), "only the spare left home")
	var st := str(Logistics.route_info(sim, id)["status"]).to_lower()
	check(st.contains("nothing to spare") or st.contains("waiting"), "explains: %s" % st)


func test_cancelling_turns_the_cart_round() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var hall: Building = t["hall"]
	var wood0 := _held(sim, "wood")
	var id := _route(sim, t["home"], hall, "wood", 40)
	SimHelpers.run_until(sim, func() -> bool: return sim.manifests.any(func(m: Dictionary) -> bool: return m["state"] == "outbound"), Defs.DAY_TICKS)
	var cargo := int((sim.manifests[0]["cargo"] as Dictionary).get("wood", 0))
	check(bool(Commands.apply(sim, {"type": "cancelRoute", "routeId": id})["ok"]), "cancelled")
	check_eq(str(sim.manifests[0]["state"]), "returning", "turned round")
	check_eq(_held(sim, "wood"), wood0 + int(sim.stats["woodGathered"]), "nothing lost")
	SimHelpers.run_until(sim, func() -> bool: return sim.manifests.is_empty(), Defs.DAY_TICKS * 2)
	check_eq(int(hall.inventory.get("wood", 0)), 0, "nothing delivered")
	check_eq(_held(sim, "wood"), wood0 + int(sim.stats["woodGathered"]), "nothing doubled")
	check(cargo > 0, "it was carrying wood")


func test_goods_with_nowhere_to_go_wait_in_a_crate() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var wood0 := _held(sim, "wood")
	_route(sim, t["home"], t["hall"], "wood", 40)
	SimHelpers.run_until(sim, func() -> bool: return sim.manifests.any(func(m: Dictionary) -> bool: return m["state"] == "outbound"), Defs.DAY_TICKS)
	for st in sim.storages():
		Inv.add(st.inventory, "stone", st.storage_capacity() - sim.storage_used(st))
	var stone0 := _held(sim, "stone")
	SimHelpers.run_until(sim, func() -> bool: return sim.manifests.is_empty(), Defs.DAY_TICKS * 3)
	var crates := 0
	for b: Building in sim.buildings.values():
		if b.type == "crate":
			crates += 1
	check(crates > 0, "a crate")
	check_eq(_held(sim, "wood"), wood0 + int(sim.stats["woodGathered"]), "wood conserved")
	check_eq(_held(sim, "stone"), stone0 + int(sim.stats["stoneGathered"]), "stone conserved")


func test_freight_needs_a_bridge_over_the_river() -> void:
	var sim := NewGame.create(9090)
	sim.reached.append("hamlet")
	sim.reached.append("village")
	var c := Vector3i(-99999, 0, 0)
	for dy in 30:
		for y: int in [dy, -dy]:
			if c.x != -99999:
				break
			var mid := roundi(WorldGen.river_center(sim.seed_value, y))
			var x0 := mid
			var x1 := mid
			while sim.world.terrain(x0 - 1, y) == Tiles.WATER or sim.world.terrain(x0 - 1, y) == Tiles.DEEP_WATER:
				x0 -= 1
			while sim.world.terrain(x1 + 1, y) == Tiles.WATER or sim.world.terrain(x1 + 1, y) == Tiles.DEEP_WATER:
				x1 += 1
			if sim.walkable(x0 - 1, y) and sim.walkable(x1 + 1, y) and x1 - x0 + 1 <= 12 and sim.world.terrain(mid, y) == Tiles.DEEP_WATER:
				c = Vector3i(y, x0, x1)
	check(c.x != -99999, "a narrow deep crossing")
	var x := 0
	while x <= c.z + 30:
		sim.world.reveal(x, c.x, 11)
		x += 3
	sim.load_nav_area(0, 0)
	var hall := _instant(sim, "waystation", Vector2i(c.z + 14, c.x))
	var home := SimHelpers.camp(sim)
	home.inventory = {"food": 120, "wood": 80, "stone": 90, "planks": 40}
	var depot := _instant(sim, "depot", Vector2i(5, 5))
	Commands.apply(sim, {"type": "assignWorker", "buildingId": depot.id, "ids": [sim.settlers[0].id]})
	var id := _route(sim, home, hall, "wood", 20)
	SimHelpers.run(sim, 300)
	var st := str(Logistics.route_info(sim, id)["status"]).to_lower()
	check(st.contains("no road") or st.contains("bridge") or st.contains("connect"), "no crossing: %s" % st)
	check(sim.manifests.is_empty(), "no cart left")
	var br := Commands.apply(sim, {"type": "placeSpan", "building": "stoneBridge", "x0": c.y, "y0": c.x, "x1": c.z, "y1": c.x})
	check(bool(br["ok"]), "bridge planned: %s" % br["message"])
	if not bool(br["ok"]):
		return
	var bid := int(br["id"])
	check(SimHelpers.run_until(sim, func() -> bool: return sim.buildings.has(bid) and (sim.buildings[bid] as Building).built, Defs.DAY_TICKS * 4) >= 0, "bridge built")
	check(SimHelpers.run_until(sim, func() -> bool: return int(hall.inventory.get("wood", 0)) >= 20, Defs.DAY_TICKS * 3) >= 0, "wood across the bridge")


func test_route_travel_never_generates_chunks() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var before := sim.world.loaded_keys().size()
	_route(sim, t["home"], t["hall"], "wood", 30)
	for i in 5:
		Logistics.update(sim)
	check_eq(sim.world.loaded_keys().size(), before, "no new chunks")


func test_road_link_counts_for_the_region() -> void:
	var t := _two_towns()
	var sim: Simulation = t["sim"]
	var home: Building = t["home"]
	var hall: Building = t["hall"]
	check(not Settlements.road_linked(sim, home.id, hall.id), "no road yet")
	# Lay a path straight between them (terrain only, as finished paths become).
	var y := home.y + home.h
	for x in range(hall.x - 2, home.x + 3):
		if sim.world.terrain(x, y) != Tiles.WATER and sim.world.terrain(x, y) != Tiles.DEEP_WATER:
			sim.world.set_terrain(x, y, Tiles.ROAD)
	sim.map_changed()
	var ok := Settlements.road_linked(sim, home.id, hall.id)
	check(ok, "linked by road")
	var req := Progression.requirement_progress(sim, {"kind": "roadLink"})
	check_eq(bool(req["done"]), ok, "the requirement agrees")
