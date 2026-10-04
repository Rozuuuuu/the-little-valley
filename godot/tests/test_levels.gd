extends TestCase
## Building levels (Warcraft-style upgrades), ported from tests/levels.test.ts with the same seed
## and scenarios, plus the camp growing into a Town Hall.


func _world() -> Array:
	var sim := NewGame.create(4242)
	for m: String in ["hamlet", "village", "town"]:
		sim.reached.append(m)
	var hall := SimHelpers.camp(sim)
	hall.inventory = {"food": 200, "wood": 150, "stone": 150, "planks": 80, "tools": 20}
	return [sim, hall]


func _instant(sim: Simulation, type: String, near: Vector2i) -> Building:
	for r in 20:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				if bool(BuildingOps.check_placement(sim, type, x, y)["ok"]):
					var b := BuildingOps.place(sim, type, x, y)
					b.delivered = BuildingOps.cost_of(b).duplicate()
					BuildingOps.complete(sim, b, true)
					return b
	return null


func _upgrade(sim: Simulation, b: Building) -> Dictionary:
	return Commands.apply(sim, {"type": "upgradeBuilding", "buildingId": b.id})


func test_storehouse_upgrade_paid_up_front_and_timed() -> void:
	var w := _world()
	var sim: Simulation = w[0]
	var st := _instant(sim, "storehouse", Vector2i(8, 6))
	var next: Dictionary = Levels.levels_of(st)[1]
	var wood := sim.stored_total("wood")
	check_eq(st.level, 1, "level 1")
	check_eq(st.storage_capacity(), 300, "300 to start")
	var res := _upgrade(sim, st)
	check(bool(res["ok"]), "started: %s" % res["message"])
	check_eq(sim.stored_total("wood"), wood - int(next["cost"].get("wood", 0)), "paid up front")
	check(sim.storages().has(st), "still a store")
	check_eq(st.storage_capacity(), 300, "same room meanwhile")
	check(not bool(_upgrade(sim, st)["ok"]), "only one at a time")
	SimHelpers.run(sim, int(next["time"]) - 1)
	check_eq(st.level, 1, "not yet")
	SimHelpers.run(sim, 2)
	check_eq(st.level, 2, "level 2")
	check_eq(Levels.level_name(st), str(next["name"]), "name")
	check_eq(st.storage_capacity(), int(next["storage"]), "more room")
	check(st.upgrade.is_empty(), "upgrade cleared")


func test_refusals() -> void:
	var w := _world()
	var sim: Simulation = w[0]
	var hall: Building = w[1]
	var st := _instant(sim, "storehouse", Vector2i(8, 6))
	hall.inventory = {"food": 200}
	var poor := _upgrade(sim, st)
	check(not bool(poor["ok"]), "too poor")
	var msg := str(poor["message"])
	check(msg.contains("wood") or msg.contains("stone") or msg.contains("planks"), "says what is short: %s" % msg)
	hall.inventory = {"food": 200, "wood": 300, "stone": 300, "planks": 200, "tools": 50}
	sim.reached.assign(["camp", "hamlet"])
	check(bool(_upgrade(sim, st)["ok"]), "level 2 needs no milestone")
	SimHelpers.run(sim, int(Levels.levels_of(st)[1]["time"]) + 1)
	var locked := _upgrade(sim, st)
	check(not bool(locked["ok"]) and str(locked["message"]).contains("Village"), "needs Village: %s" % locked["message"])
	sim.reached.append("village")
	check(bool(_upgrade(sim, st)["ok"]), "now allowed")
	SimHelpers.run(sim, int(Levels.levels_of(st)[2]["time"]) + 1)
	check(str(_upgrade(sim, st)["message"]).contains("highest"), "top level")
	var site: Building = null
	for r in range(4, 20):
		if site != null:
			break
		for x in range(-r, r + 1):
			if bool(Commands.apply(sim, {"type": "place", "building": "storehouse", "x": x, "y": r})["ok"]):
				site = sim.building_at(x, r)
				break
	check(site != null, "a site placed")
	if site != null:
		check(str(_upgrade(sim, site)["message"]).to_lower().contains("finish"), "unbuilt")


func test_cancel_refunds_and_reload_keeps_progress() -> void:
	var w := _world()
	var sim: Simulation = w[0]
	var st := _instant(sim, "storehouse", Vector2i(8, 6))
	_upgrade(sim, st)
	var paid: Dictionary = (st.upgrade["paid"] as Dictionary).duplicate()
	check_eq(paid, Inv.from_json(Levels.levels_of(st)[1]["cost"]), "paid the level's cost")
	SimHelpers.run(sim, 50)
	var text := JSON.stringify(SaveCodec.encode(sim, "Levels", 1), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	check_eq(str(loaded["error"]), "", "loads")
	var sim2: Simulation = loaded["sim"]
	var st2: Building = sim2.buildings[st.id]
	check_eq(int(st2.upgrade["progress"]), int(st.upgrade["progress"]), "progress kept")
	SimHelpers.run(sim2, 10)
	var before := {}
	for r: String in ["wood", "stone", "planks"]:
		before[r] = sim2.stored_total(r)
	check(bool(Commands.apply(sim2, {"type": "cancelUpgrade", "buildingId": st2.id})["ok"]), "cancelled")
	check(st2.upgrade.is_empty(), "cleared")
	check_eq(st2.level, 1, "still level 1")
	for r: String in ["wood", "stone", "planks"]:
		check_eq(sim2.stored_total(r), int(before[r]) + int(paid.get(r, 0)), "%s back" % r)


func test_cancel_into_full_stores_leaves_a_crate() -> void:
	var w := _world()
	var sim: Simulation = w[0]
	var st := _instant(sim, "storehouse", Vector2i(8, 6))
	_upgrade(sim, st)
	var paid: Dictionary = st.upgrade["paid"]
	for b in sim.storages():
		Inv.add(b.inventory, "stone", maxi(0, b.storage_capacity() - sim.storage_used(b)))
	var before := sim.stored_total("wood")
	check(bool(Commands.apply(sim, {"type": "cancelUpgrade", "buildingId": st.id})["ok"]), "cancelled")
	var crate: Building = null
	for b: Building in sim.buildings.values():
		if b.type == "crate":
			crate = b
	check(crate != null, "a crate")
	if crate != null:
		check_eq(int(crate.inventory.get("wood", 0)), int(paid.get("wood", 0)), "wood in the crate")
	check_eq(sim.stored_total("wood"), before + int(paid.get("wood", 0)), "nothing lost or doubled")


func test_homes_gain_beds_workshops_gain_a_worker_and_speed() -> void:
	var w := _world()
	var sim: Simulation = w[0]
	var house := _instant(sim, "house", Vector2i(5, -5))
	check_eq(house.beds(), 2, "two beds")
	_upgrade(sim, house)
	check(SimHelpers.run_until(sim, func() -> bool: return house.level == 2, 5000) >= 0, "house upgraded")
	check_eq(house.beds(), 3, "three beds")
	var ws := _instant(sim, "workshop", Vector2i(-8, -6))
	check_eq(int(ws.stat("maxWorkers")), 1, "one worker")
	check_eq(Production.speed_of(ws), 1.0, "speed 1")
	_upgrade(sim, ws)
	check(SimHelpers.run_until(sim, func() -> bool: return ws.level == 2, 5000) >= 0, "workshop upgraded")
	check_eq(int(ws.stat("maxWorkers")), 2, "two workers")
	check(Production.speed_of(ws) > 1.0, "faster")


func test_camp_grows_into_a_town_hall() -> void:
	# New valleys start with a Town Hall; camps come from older saves. Place one where a hall fits.
	var w := _world()
	var sim: Simulation = w[0]
	var hall_size: Dictionary = Defs.building("townHall")["size"]
	var camp_size: Dictionary = Defs.building("camp")["size"]
	var spot := Vector2i(-99999, 0)
	for r in range(6, 24):
		for x in range(-r, r + 1):
			if spot.x == -99999 and _hall_fits(sim, x, r, hall_size):
				spot = Vector2i(x, r)
	check(spot.x != -99999, "room for a hall")
	var camp := BuildingOps.place(sim, "camp", spot.x, spot.y + int(hall_size["h"]) - int(camp_size["h"]))
	camp.delivered = BuildingOps.cost_of(camp).duplicate()
	BuildingOps.complete(sim, camp, true)
	SimHelpers.camp(sim).inventory = {"food": 200, "wood": 400, "stone": 400, "planks": 200, "tools": 50}
	var id := camp.id
	var res := _upgrade(sim, camp)
	check(bool(res["ok"]), "started: %s" % res["message"])
	SimHelpers.run(sim, int(Levels.levels_of(camp)[1]["time"]) + 1)
	var hall: Building = sim.buildings.get(id)
	check(hall != null and hall.type == "townHall", "a town hall with the same id")
	if hall == null:
		return
	check_eq(Rect2i(hall.x, hall.y, hall.w, hall.h), Rect2i(spot.x, spot.y, int(hall_size["w"]), int(hall_size["h"])), "grew up from the same bottom row")
	for dy in hall.h:
		for dx in hall.w:
			check_eq(int(sim.occupancy.get(Simulation.tile_key(hall.x + dx, hall.y + dy), -1)), id, "occupies its footprint")
	check(SimHelpers.reservation_problems(sim).is_empty(), "reservations consistent")


## Every tile of a hall's footprint is free ground (the one-hall rule aside).
func _hall_fits(sim: Simulation, x: int, y: int, size: Dictionary) -> bool:
	for dy in range(-1, int(size["h"]) + 1):
		for dx in range(-1, int(size["w"]) + 1):
			if sim.building_at(x + dx, y + dy) != null or BuildingOps.tile_problem(sim, "townHall", x + dx, y + dy) != "":
				return false
	return true


func test_demolishing_mid_upgrade_refunds_the_upgrade() -> void:
	var w := _world()
	var sim: Simulation = w[0]
	var st := _instant(sim, "storehouse", Vector2i(8, 6))
	var wood := sim.stored_total("wood")
	_upgrade(sim, st)
	var paid_wood := int(st.upgrade["paid"].get("wood", 0))
	check(paid_wood > 0, "paid wood")
	Commands.apply(sim, {"type": "remove", "buildingId": st.id})
	check(sim.upgrading.is_empty(), "no upgrade left running")
	check_eq(sim.stored_total("wood"), wood + int(BuildingOps.cost_of(st).get("wood", 0)) / 2, "upgrade back in full, half the building")
