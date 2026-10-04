extends TestCase
## Animals, hunting and livestock, ported from tests/animals.test.ts (same seeds and scenarios).
## The horse paddock case waits for the stable's horses to have a use (military); fishing waits
## for mining (fisher's huts are extraction buildings); wells, the tannery and the weaver are
## covered where their systems are.


func _stocked(seed_value: int, habitat: String = "valley") -> Simulation:
	var sim := NewGame.create(seed_value, WorldGen.CURRENT_GEN, habitat)
	SimHelpers.camp(sim).inventory = {"food": 150, "wood": 100, "stone": 80, "planks": 40}
	sim.reached.append("hamlet")
	sim.reached.append("village")
	return sim


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


func _reload(sim: Simulation) -> Simulation:
	var text := JSON.stringify(SaveCodec.encode(sim, "Zoo", 1), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	check_eq(str(loaded["error"]), "", "reloads")
	return loaded["sim"]


func test_each_habitat_starts_with_its_own_animals_in_sight() -> void:
	var habitats: Array = Content.get_value("habitats", "HABITAT_IDS")
	for h: String in habitats:
		var sim := NewGame.create(8080, WorldGen.CURRENT_GEN, h)
		var wild: Array[Animal] = []
		for a in sim.animals:
			if a.pen_id == -1:
				wild.append(a)
		check(wild.size() >= 4, "%s: %d wild animals" % [h, wild.size()])
		var allowed := {}
		for e: Dictionary in (Animals.value("WILDLIFE") as Dictionary)[h]:
			allowed[e["species"]] = true
		for a in wild:
			check(allowed.has(a.species), "%s in %s" % [a.species, h])
			check(sim.world.explored(floori(a.x), floori(a.y)), "%s in sight" % a.species)


func test_new_valley_herds_match_the_browser_game() -> void:
	var data: Array = load_json("res://tests/golden/wildlife.json")
	for entry: Dictionary in data:
		var sim := NewGame.create(8080, WorldGen.CURRENT_GEN, str(entry["habitat"]))
		var want: Array = entry["animals"]
		check_eq(sim.animals.size(), want.size(), "%s: herd count" % entry["habitat"])
		for i in mini(want.size(), sim.animals.size()):
			var a := sim.animals[i]
			var w: Array = want[i]
			var same: bool = a.species == str(w[0]) and a.x == float_from_bits(w[1]) and a.y == float_from_bits(w[2]) and a.home_x == int(w[3]) and a.home_y == int(w[4]) and a.facing == int(w[5])
			check(same, "%s animal %d: got %s at %s,%s, want %s at %s,%s" % [entry["habitat"], i, a.species, a.x, a.y, w[0], float_from_bits(w[1]), float_from_bits(w[2])])
		check_eq(I32.to_i32(sim.animal_rng.state), I32.to_i32(int(entry["rng"])), "%s: animal random state" % entry["habitat"])


func test_they_wander_where_they_belong() -> void:
	var sim := NewGame.create(8181, WorldGen.CURRENT_GEN, "marsh")
	SimHelpers.run(sim, 2000)
	for a in sim.animals:
		var tx := floori(a.x)
		var ty := floori(a.y)
		var t := sim.world.terrain(tx, ty)
		if bool(a.def().get("swims", false)):
			check(t == Tiles.WATER or t == Tiles.DEEP_WATER, "%s on water" % a.species)
		elif a.pen_id == -1:
			check(sim.walkable(tx, ty), "%s on open ground" % a.species)


func test_prey_runs_from_people() -> void:
	var sim := NewGame.create(8282)
	var a: Animal = null
	for x in sim.animals:
		if float(x.def()["fleeFrom"]) > 0 and not bool(x.def().get("swims", false)):
			a = x
			break
	check(a != null, "a land animal")
	var s := sim.settlers[0]
	s.x = a.x + 1
	s.y = a.y
	var p0 := Vector2(s.x, s.y)
	var d0 := JsMath.hypot(a.x - p0.x, a.y - p0.y)
	SimHelpers.run(sim, 40)
	check(JsMath.hypot(a.x - p0.x, a.y - p0.y) > d0 + 2, "ran off")


func test_older_worlds_get_valley_animals_over_time() -> void:
	var sim := NewGame.create(8383, 3)
	sim.animals.clear()
	SimHelpers.run(sim, 1200)
	check(sim.animals.size() > 0, "animals appeared")
	var valley := {}
	for e: Dictionary in (Animals.value("WILDLIFE") as Dictionary)["valley"]:
		valley[e["species"]] = true
	for a in sim.animals:
		check(valley.has(a.species), "%s is a valley animal" % a.species)


func test_lodge_brings_in_meat_and_keeps_hides() -> void:
	var sim := _stocked(8484, "forest")
	var lodge := _instant(sim, "hunterLodge", Vector2i(6, 6))
	var hunter := sim.settlers[1]
	check(bool(Commands.apply(sim, {"type": "assignWorker", "buildingId": lodge.id, "ids": [hunter.id]})["ok"]), "hunter assigned")
	var food0 := int(sim.stats["foodGathered"])
	var ids := {}
	for a in sim.animals:
		ids[a.id] = true
	check(SimHelpers.run_until(sim, func() -> bool: return int(lodge.inventory.get("hides", 0)) > 0, Defs.DAY_TICKS * 2) >= 0, "hides at the lodge")
	var kills := 0
	for id: int in ids:
		if Animals.find(sim, id) == null:
			kills += 1
	check(kills > 0, "game taken")
	check(int(sim.stats["foodGathered"]) > food0, "meat brought in")
	check(SimHelpers.reservation_problems(sim).is_empty(), "reservations consistent")
	# Save mid-hunt: the reload re-plans cleanly.
	SimHelpers.run_until(sim, func() -> bool: return hunter.task != null and hunter.task.kind == Task.HUNT, Defs.DAY_TICKS)
	var loaded := _reload(sim)
	SimHelpers.run(loaded, 300)
	var p := SimHelpers.reservation_problems(loaded)
	check(p.is_empty(), "after reload: %s" % "; ".join(p))


func test_coop_breeds_and_its_herder_brings_eggs() -> void:
	var sim := _stocked(8585)
	var coop := _instant(sim, "chickenCoop", Vector2i(-8, -6))
	check_eq(Animals.pen_animals(sim, coop).size(), 2, "a breeding pair")
	var herder := sim.settlers[0]
	Commands.apply(sim, {"type": "assignWorker", "buildingId": coop.id, "ids": [herder.id]})
	var food0 := int(sim.stats["foodGathered"])
	SimHelpers.run(sim, Defs.DAY_TICKS * 2)
	check(Animals.pen_animals(sim, coop).size() > 2, "chicks hatched")
	for a in Animals.pen_animals(sim, coop):
		check(a.x >= coop.x and a.x <= coop.x + coop.w and a.y >= coop.y and a.y <= coop.y + coop.h, "inside the coop")
	check(int(sim.stats["foodGathered"]) > food0, "eggs collected")


func test_sheep_give_wool_and_a_full_sty_sends_a_pig_to_the_butcher() -> void:
	var sim := _stocked(8686)
	var pen := _instant(sim, "sheepPen", Vector2i(-9, -7))
	var sty := _instant(sim, "pigsty", Vector2i(8, -7))
	Commands.apply(sim, {"type": "assignWorker", "buildingId": pen.id, "ids": [sim.settlers[0].id]})
	Commands.apply(sim, {"type": "assignWorker", "buildingId": sty.id, "ids": [sim.settlers[1].id]})
	check(SimHelpers.run_until(sim, func() -> bool: return sim.stored_total("wool") > 0, Defs.DAY_TICKS * 3) >= 0, "wool in store")
	var cap := Animals.pen_capacity(sty)
	while Animals.pen_animals(sim, sty).size() < cap:
		Animals.add(sim, "pig", sty.x, sty.y, sty.id)
	check(SimHelpers.run_until(sim, func() -> bool: return sim.stored_total("hides") > 0, Defs.DAY_TICKS * 2) >= 0, "hides in store")
	check(Animals.pen_animals(sim, sty).size() < cap, "one pig fewer")


func test_pens_and_animals_survive_a_save() -> void:
	var sim := _stocked(8787)
	var coop := _instant(sim, "chickenCoop", Vector2i(-8, -6))
	SimHelpers.run(sim, 500)
	var loaded := _reload(sim)
	var c2: Building = loaded.buildings[coop.id]
	check_eq(Animals.pen_animals(loaded, c2).size(), Animals.pen_animals(sim, coop).size(), "same flock")
	check(absf(float(c2.pen["ready"]) - float(coop.pen["ready"])) < 1e-5, "same eggs waiting")
	check_eq(loaded.animals.size(), sim.animals.size(), "same animals")
	check_eq(loaded.animal_rng.state, sim.animal_rng.state, "same animal random state")


func test_hunting_ground_takes_game() -> void:
	# From areas-auto.test.ts: hunting grounds' workers take game inside for food.
	var sim := NewGame.create(7004, WorldGen.CURRENT_GEN, "forest")
	SimHelpers.camp(sim).inventory = {"food": 100}
	var wild: Animal = null
	for a in sim.animals:
		if a.pen_id == -1 and a.species != "duck":
			wild = a
			break
	check(wild != null, "game nearby")
	var cx := floori(wild.x)
	var cy := floori(wild.y)
	var r := Commands.apply(sim, {"type": "createArea", "kind": "hunt", "x0": cx - 12, "y0": cy - 12, "x1": cx + 12, "y1": cy + 12, "wanted": 2})
	check(bool(r["ok"]), "ground created: %s" % r["message"])
	var food0 := int(sim.stats["foodGathered"])
	var ids := {}
	for a in sim.animals:
		ids[a.id] = true
	var gone := func() -> int:
		var n := 0
		for id: int in ids:
			if Animals.find(sim, id) == null:
				n += 1
		return n
	check(SimHelpers.run_until(sim, func() -> bool: return int(gone.call()) > 0 and int(sim.stats["foodGathered"]) > food0, Defs.DAY_TICKS) >= 0, "game taken for food")


func test_attack_order_and_dangerous_game_hurts_but_never_kills() -> void:
	var sim := NewGame.create(7004, WorldGen.CURRENT_GEN, "forest")
	SimHelpers.camp(sim).inventory = {"food": 100}
	var s := sim.settlers[2]
	var target: Animal = null
	for a in sim.animals:
		if a.def().has("hunt") and a.pen_id == -1:
			target = a
			break
	check(target != null, "something to hunt")
	var r := Commands.apply(sim, {"type": "hunt", "ids": [s.id], "animalId": target.id})
	check(bool(r["ok"]), "order taken: %s" % r["message"])
	check(s.task != null and s.task.kind == Task.HUNT and s.task.direct, "hunting")
	var tid := target.id
	SimHelpers.run_until(sim, func() -> bool: return Animals.find(sim, tid) == null or s.task == null, Defs.DAY_TICKS)
	check(SimHelpers.reservation_problems(sim).is_empty(), "reservations consistent")
	# A bear strikes back; the hunter breaks off hurt but alive, and heals.
	var bear := Animals.add(sim, "bear", s.tile_x() + 1, s.tile_y())
	s.hp = 100.0
	var rb := Commands.apply(sim, {"type": "hunt", "ids": [s.id], "animalId": bear.id})
	if not bool(rb["ok"]):
		Commands.apply(sim, {"type": "returnGoods", "ids": [s.id]})
		SimHelpers.run_until(sim, func() -> bool: return not s.carrying(), 600)
		rb = Commands.apply(sim, {"type": "hunt", "ids": [s.id], "animalId": bear.id})
	check(bool(rb["ok"]), "bear order: %s" % rb["message"])
	var hurt := SimHelpers.run_until(sim, func() -> bool: return s.hp < 100.0, 1200)
	check(hurt >= 0, "the bear struck back")
	SimHelpers.run_until(sim, func() -> bool: return s.task == null or s.task.kind != Task.HUNT, 2400)
	check(s.hp >= 1.0, "alive")
	var low := s.hp
	SimHelpers.run(sim, 400)
	check(s.hp > low or s.hp >= 100.0, "healing")
	check(SimHelpers.reservation_problems(sim).is_empty(), "reservations consistent after")
