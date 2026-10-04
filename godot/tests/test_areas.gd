extends TestCase
## Work areas, ported from tests/village.test.ts ("work areas") and tests/areas-auto.test.ts (same
## seeds and scenarios). Hunting grounds wait for animals; the ruler is not ported yet, so the
## "never the ruler" part of the staffing case is not checked.


func _crew(sim: Simulation, id: int) -> Array[Settler]:
	return Areas.crew_of(sim, id)


func _create(sim: Simulation, cmd: Dictionary) -> int:
	cmd["type"] = "createArea"
	var r := Commands.apply(sim, cmd)
	check(bool(r["ok"]), "area created: %s" % r["message"])
	return int(r.get("id", -1))


func _no_reservation_problems(sim: Simulation, when: String) -> void:
	var p := SimHelpers.reservation_problems(sim)
	check(p.is_empty(), "%s: %s" % [when, "; ".join(p)])


func test_woodlot_workers_chop_inside_without_marks() -> void:
	var sim := NewGame.create(111)
	var s := sim.settlers[3]
	s.job = "hauler"
	var tree := Vector2i(-99999, 0)
	for r in range(7, 16):
		if tree.x != -99999:
			break
		for x in range(-r, r + 1):
			var o := sim.world.obj(x, -r)
			if o != World.UNKNOWN and Tiles.object_resource[o] == "wood":
				tree = Vector2i(x, -r)
				break
	check(tree.x != -99999, "a tree near the camp")
	var id := _create(sim, {"kind": "wood", "x0": tree.x - 2, "y0": tree.y - 2, "x1": tree.x + 2, "y1": tree.y + 2})
	check(bool(Commands.apply(sim, {"type": "assignArea", "ids": [s.id], "areaId": id})["ok"]), "assigned")
	SimHelpers.run(sim, 8)
	check(s.task != null and s.task.kind == Task.GATHER, "gathering")
	if s.task != null:
		check(sim.area(id).contains(s.task.x, s.task.y), "inside the woodlot")
	_no_reservation_problems(sim, "woodlot")


func test_direct_orders_first_then_back_to_area_work() -> void:
	var sim := NewGame.create(111)
	var s := sim.settlers[3]
	var id := _create(sim, {"kind": "stone", "x0": -16, "y0": -16, "x1": 16, "y1": 16})
	Commands.apply(sim, {"type": "assignArea", "ids": [s.id], "areaId": id})
	SimHelpers.run(sim, 8)
	check(bool(Commands.apply(sim, {"type": "move", "ids": [s.id], "x": 3, "y": 3})["ok"]), "move order")
	check(s.task != null and s.task.kind == Task.MOVE, "moving")
	SimHelpers.run_until(sim, func() -> bool: return s.task == null or s.task.kind != Task.MOVE, 400)
	var t := SimHelpers.run_until(sim, func() -> bool: return s.task != null and s.task.kind == Task.GATHER and sim.world.obj(s.task.x, s.task.y) != Tiles.O_NONE, 200)
	check(t >= 0, "back to quarrying")
	if s.task != null and s.task.kind == Task.GATHER:
		check_eq(Tiles.object_resource[sim.world.obj(s.task.x, s.task.y)], "stone", "a rock")


func test_farm_areas_tend_their_own_fields_and_explain() -> void:
	var sim := NewGame.create(222)
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 3, "x1": -8, "y1": 4, "crop": "turnip"})
	var meadow := _create(sim, {"kind": "farm", "x0": -9, "y0": 3, "x1": -8, "y1": 4, "name": "Meadow farm"})
	var empty := _create(sim, {"kind": "farm", "x0": 4, "y0": 6, "x1": 6, "y1": 8, "name": "Empty farm"})
	var a := sim.settlers[3]
	var b := sim.settlers[4]
	Commands.apply(sim, {"type": "assignArea", "ids": [a.id], "areaId": meadow})
	Commands.apply(sim, {"type": "assignArea", "ids": [b.id], "areaId": empty})
	Commands.apply(sim, {"type": "setPriorities", "ids": [b.id], "priorities": []})
	SimHelpers.run(sim, 12)
	check(a.task != null and a.task.kind == Task.FARM, "farming in the meadow")
	check(b.idle_reason.contains("Empty farm has no fields"), "reason: %s" % b.idle_reason)


func test_fog_size_and_worker_limit() -> void:
	var sim := NewGame.create(333)
	check(str(Commands.apply(sim, {"type": "createArea", "kind": "wood", "x0": 300, "y0": 300, "x1": 310, "y1": 310})["message"]).contains("Explore"), "fog")
	check(str(Commands.apply(sim, {"type": "createArea", "kind": "wood", "x0": 0, "y0": 0, "x1": 60, "y1": 60})["message"]).contains("too large"), "size")
	var id := _create(sim, {"kind": "wood", "x0": -5, "y0": -5, "x1": 5, "y1": 5})
	for i in WorkArea.MAX_WORKERS + 3:
		sim.add_settler(0, 3, "laborer")
	var ids: Array = sim.settlers.map(func(s: Settler) -> int: return s.id)
	var res := Commands.apply(sim, {"type": "assignArea", "ids": ids, "areaId": id})
	check(str(res["message"]).contains("didn't fit"), "message: %s" % res["message"])
	check_eq(_crew(sim, id).size(), WorkArea.MAX_WORKERS, "full crew")
	check(not bool(Commands.apply(sim, {"type": "assignArea", "ids": [sim.settlers[-1].id], "areaId": id})["ok"]), "no room")


func test_reservations_released_when_areas_change() -> void:
	var sim := NewGame.create(444)
	SimHelpers.camp(sim).inventory = {"food": 80, "wood": 60, "stone": 30}
	var wood := _create(sim, {"kind": "wood", "x0": -16, "y0": -16, "x1": 16, "y1": 16})
	var farm := _create(sim, {"kind": "farm", "x0": -10, "y0": 2, "x1": -5, "y1": 6})
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 3, "x1": -6, "y1": 5, "crop": "turnip"})
	var ids: Array = sim.settlers.map(func(s: Settler) -> int: return s.id)
	Commands.apply(sim, {"type": "assignArea", "ids": ids.slice(0, 3), "areaId": wood})
	Commands.apply(sim, {"type": "assignArea", "ids": ids.slice(3), "areaId": farm})
	for i in 12:
		SimHelpers.run(sim, 37)
		_no_reservation_problems(sim, "step %d" % i)
		if i == 3:
			Commands.apply(sim, {"type": "deleteArea", "areaId": wood})
		if i == 5:
			Commands.apply(sim, {"type": "updateArea", "areaId": farm, "rect": {"x0": -9, "y0": 3, "x1": -8, "y1": 3}})
		if i == 7:
			Commands.apply(sim, {"type": "setPriorities", "ids": ids, "priorities": ["haul", "build"]})
		if i == 9:
			Commands.apply(sim, {"type": "setJob", "ids": ids, "job": "laborer"})
		_no_reservation_problems(sim, "after change %d" % i)
	check_eq(SimHelpers.accounted_for(sim, "wood") + SimHelpers.consumed_by_construction(sim, "wood"), 60 + int(sim.stats["woodGathered"]), "wood conserved")


# ---- areas that look after themselves (areas-auto.test.ts) ---------------------------------------

func _world(seed_value: int) -> Simulation:
	var sim := NewGame.create(seed_value)
	SimHelpers.camp(sim).inventory = {"food": 200, "wood": 60, "stone": 40}
	return sim


func test_staff_themselves_from_free_adults() -> void:
	var sim := _world(7001)
	var ws := _place_built(sim, "workshop", Vector2i(8, -6))
	check(ws != null, "workshop placed")
	var crafter := sim.settlers[1]
	Commands.apply(sim, {"type": "assignWorker", "buildingId": ws.id, "ids": [crafter.id]})
	var id := _create(sim, {"kind": "wood", "x0": -20, "y0": -14, "x1": -8, "y1": -4, "wanted": 3})
	check(SimHelpers.run_until(sim, func() -> bool: return _crew(sim, id).size() == 3, 400) >= 0, "three workers came")
	for s in _crew(sim, id):
		check(s.id != crafter.id, "not the workshop's worker")
	check(bool(Commands.apply(sim, {"type": "updateArea", "areaId": id, "wanted": 1})["ok"]), "fewer wanted")
	check(SimHelpers.run_until(sim, func() -> bool: return _crew(sim, id).size() == 1, 400) >= 0, "two let go")
	var manual := _create(sim, {"kind": "stone", "x0": 8, "y0": 8, "x1": 16, "y1": 14})
	SimHelpers.run(sim, 400)
	check_eq(_crew(sim, manual).size(), 0, "a manual area is left to the player")


func test_farm_area_lays_out_fields() -> void:
	var sim := _world(7002)
	_create(sim, {"kind": "farm", "x0": -11, "y0": 2, "x1": -4, "y1": 8, "wanted": 2, "crop": "turnip"})
	SimHelpers.run(sim, 300)
	var fields: Array[Building] = []
	for b: Building in sim.buildings.values():
		if b.is_field() and b.x >= -11 and b.x <= -4 and b.y >= 2 and b.y <= 8:
			fields.append(b)
	check(fields.size() > 8, "fields laid out: %d" % fields.size())
	for f in fields:
		check_eq(f.field["crop"], "turnip", "crop")
	check(SimHelpers.run_until(sim, func() -> bool: return fields.any(func(f: Building) -> bool: return f.field["state"] == "growing"), Defs.DAY_TICKS) >= 0, "something grows")


func test_woodlots_replant() -> void:
	var sim := _world(7003)
	var id := _create(sim, {"kind": "wood", "x0": -18, "y0": -18, "x1": 18, "y1": 18})
	var a := sim.area(id)
	var s := sim.settlers[1]
	Commands.apply(sim, {"type": "assignArea", "ids": [s.id], "areaId": id})
	var replanted := func() -> int:
		for k: int in sim.regrowth:
			if a.contains(Simulation.key_x(k), Simulation.key_y(k)) and sim.world.obj(Simulation.key_x(k), Simulation.key_y(k)) == Tiles.O_SAPLING:
				return int(sim.regrowth[k][1])
		return -1
	check(SimHelpers.run_until(sim, func() -> bool: return int(replanted.call()) != -1, Defs.DAY_TICKS) >= 0, "a tree replanted")
	check(int(replanted.call()) - sim.tick < Defs.DAY_TICKS, "grows back within a day")


func test_forage_areas_pick_berries() -> void:
	var sim := _world(7005)
	var berry := Vector2i(-99999, 0)
	for r in 20:
		for y in range(-r, r + 1):
			for x in range(-r, r + 1):
				if berry.x == -99999 and sim.world.obj(x, y) == Tiles.O_BERRY and sim.world.explored(x, y):
					berry = Vector2i(x, y)
	check(berry.x != -99999, "a berry bush")
	var full := int(Tiles.object_def(Tiles.O_BERRY)["amount"])
	_create(sim, {"kind": "forage", "x0": berry.x - 3, "y0": berry.y - 3, "x1": berry.x + 3, "y1": berry.y + 3, "wanted": 1})
	check(SimHelpers.run_until(sim, func() -> bool: return sim.world.amount(berry.x, berry.y) < full or sim.world.obj(berry.x, berry.y) != Tiles.O_BERRY, Defs.DAY_TICKS) >= 0, "picked")


func test_areas_survive_a_save() -> void:
	var sim := _world(7006)
	var id := _create(sim, {"kind": "farm", "x0": -11, "y0": 2, "x1": -4, "y1": 8, "wanted": 2, "crop": "turnip"})
	SimHelpers.run(sim, 200)
	var crew := _crew(sim, id).size()
	var text := JSON.stringify(SaveCodec.encode(sim, "Areas", 1), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	check(str(loaded["error"]) == "", "loads: %s" % loaded["error"])
	var sim2: Simulation = loaded["sim"]
	var a := sim2.area(id)
	check(a != null, "area kept")
	if a != null:
		check_eq(a.wanted, 2, "wanted")
		check_eq(a.crop, "turnip", "crop")
		check_eq(a.rect(), Rect2i(-11, 2, 8, 7), "bounds")
	check_eq(_crew(sim2, id).size(), crew, "crew kept")
	check_eq(loaded["report"], PackedStringArray(), "nothing unsupported")


func test_staffed_areas_count_for_the_village() -> void:
	var sim := _world(7007)
	check_eq(Areas.staffed_count(sim), 0, "none")
	var id := _create(sim, {"kind": "stone", "x0": -10, "y0": -10, "x1": 10, "y1": 10})
	Commands.apply(sim, {"type": "assignArea", "ids": [sim.settlers[2].id], "areaId": id})
	check_eq(Areas.staffed_count(sim), 1, "one staffed")
	Commands.apply(sim, {"type": "deleteArea", "areaId": id})
	check_eq(sim.settlers[2].area_id, -1, "released on delete")
	check_eq(Areas.staffed_count(sim), 0, "none again")


func _place_built(sim: Simulation, type: String, near: Vector2i) -> Building:
	for r in 20:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				if bool(BuildingOps.check_placement(sim, type, x, y)["ok"]):
					var b := BuildingOps.place(sim, type, x, y)
					b.delivered = BuildingOps.cost_of(b).duplicate()
					BuildingOps.complete(sim, b, true)
					return b
	return null
