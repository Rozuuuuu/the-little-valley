extends TestCase
## The ruler and roles, ported from tests/ruler.test.ts and tests/roles.test.ts (same seeds and
## scenarios). Coronation, the council and letters wait for kingdoms and diplomacy.


func _reload(sim: Simulation) -> Simulation:
	var text := JSON.stringify(SaveCodec.encode(sim, "Roles", 1), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	check_eq(str(loaded["error"]), "", "reloads")
	return loaded["sim"]


func _new_world(seed_value: int = 3131) -> Simulation:
	return NewGame.create(seed_value, WorldGen.CURRENT_GEN, "valley", "Lloyd")


func _people(sim: Simulation) -> Array[Settler]:
	var out: Array[Settler] = []
	for s in sim.settlers:
		if not s.ruler:
			out.append(s)
	return out


# ---- the ruler -----------------------------------------------------------------------------------

func test_ruler_starts_beside_the_hall_on_top_of_five_settlers() -> void:
	var sim := _new_world()
	var me := sim.ruler()
	check(me != null, "a ruler")
	check_eq(me.name, "Lloyd", "named")
	check_eq(sim.settlers.size(), 6, "six people")
	check_eq(People.adults(sim).size(), 5, "five working adults")
	check_eq(me.home_id, SimHelpers.camp(sim).id, "sleeps in the hall")


func test_ruler_walks_but_never_does_chores() -> void:
	var sim := _new_world()
	var me := sim.ruler()
	var tree := SimHelpers.nearest_resource(sim, "wood")
	var res := Commands.apply(sim, {"type": "gather", "ids": [me.id], "x": tree.x, "y": tree.y})
	check(not bool(res["ok"]) and str(res["message"]).to_lower().contains("ruler"), "no chores: %s" % res["message"])
	check(bool(Commands.apply(sim, {"type": "move", "ids": [me.id], "x": 4, "y": 6})["ok"]), "walks")
	SimHelpers.run_until(sim, func() -> bool: return JsMath.hypot(me.x - 4, me.y - 6) < 1.5, 600)
	var kinds := {}
	for i in Defs.DAY_TICKS * 2:
		sim.step()
		if me.task != null:
			kinds[me.task.kind] = true
	for k: StringName in [Task.GATHER, Task.BUILD, Task.HAUL, Task.FARM, Task.CRAFT]:
		check(not kinds.has(k), "never %s" % k)
	check(kinds.has(Task.EAT) or kinds.has(Task.SLEEP), "eats or sleeps")
	check_eq(me.idle_reason, "", "never idle with a complaint")


func test_royal_presence_speeds_up_people_nearby() -> void:
	var sim := _new_world()
	var me := sim.ruler()
	var ps := _people(sim)
	var near := ps[0]
	var far := ps[1]
	for s: Settler in [near, far]:
		s.hunger = 100
		s.energy = 100
	near.x = me.x + 2
	near.y = me.y
	far.x = me.x + 30
	far.y = me.y
	check(absf(SettlerTasks.work_speed(sim, near) - SettlerTasks.work_speed(sim, far) * float(Roles.balance("ROYAL_AURA"))) < 1e-9, "aura")


func test_rally_inspires_people_close_by_then_recharges() -> void:
	var sim := _new_world()
	var me := sim.ruler()
	var helper := _people(sim)[0]
	helper.x = me.x + 20
	helper.y = me.y
	helper.hunger = 100
	helper.energy = 100
	var before := SettlerTasks.work_speed(sim, helper)
	var res := Commands.apply(sim, {"type": "rally"})
	check(bool(res["ok"]), "rallied: %s" % res["message"])
	var near := 0
	for s in _people(sim):
		if JsMath.hypot(s.x - me.x, s.y - me.y) <= 12:
			near += 1
			check_eq(s.boost_until, sim.tick + int(Roles.balance("RALLY_TICKS")), "%s boosted" % s.name)
	check(near > 0, "someone near")
	check(helper.boost_until <= sim.tick, "the far one not boosted")
	check_eq(SettlerTasks.work_speed(sim, helper), before, "the far one works as before")
	check(str(Commands.apply(sim, {"type": "rally"})["message"]).contains("again"), "recharging")
	var loaded := _reload(sim)
	check(not bool(Commands.apply(loaded, {"type": "rally"})["ok"]), "still recharging after reload")
	SimHelpers.run(loaded, int(Roles.balance("RALLY_COOLDOWN")))
	check(bool(Commands.apply(loaded, {"type": "rally"})["ok"]), "ready again")


func test_ruler_cannot_join_a_household() -> void:
	var sim := _new_world()
	var me := sim.ruler()
	check(not bool(Commands.apply(sim, {"type": "formHousehold", "ids": [me.id, _people(sim)[0].id]})["ok"]), "refused")


func test_ruler_survives_a_reload() -> void:
	var loaded := _reload(_new_world())
	check(loaded.ruler() != null and loaded.ruler().name == "Lloyd", "the ruler is back")
	var n := 0
	for s in loaded.settlers:
		if s.ruler:
			n += 1
	check_eq(n, 1, "exactly one")


func test_older_world_takes_the_throne_once() -> void:
	var sim := NewGame.create(3232, 3)
	check(sim.ruler() == null, "no ruler yet")
	check(not bool(Commands.apply(sim, {"type": "takeThrone", "name": ""})["ok"]), "needs a name")
	var res := Commands.apply(sim, {"type": "takeThrone", "name": "Lloyd"})
	check(bool(res["ok"]), "takes it: %s" % res["message"])
	check_eq(sim.ruler().name, "Lloyd", "named")
	check(not bool(Commands.apply(sim, {"type": "takeThrone", "name": "Other"})["ok"]), "only once")


# ---- roles ---------------------------------------------------------------------------------------

func _world(level: int = 1, seed_value: int = 7701) -> Array:
	var sim := NewGame.create(seed_value, WorldGen.CURRENT_GEN, "valley", "Lloyd")
	var hall := SimHelpers.camp(sim)
	hall.inventory = {"food": 300, "wood": 100, "stone": 80}
	hall.level = level
	sim.reached.append("hamlet")
	sim.reached.append("village")
	for s in sim.settlers:
		s.hunger = 100
		s.energy = 100
	return [sim, hall]


func test_a_settler_trains_at_the_hall_and_comes_out_with_the_role() -> void:
	var sim: Simulation = _world()[0]
	var s: Settler = null
	for p in _people(sim):
		if p.job == "laborer":
			s = p
			break
	var res := Commands.apply(sim, {"type": "trainRole", "ids": [s.id], "role": "farmer"})
	check(bool(res["ok"]), "training: %s" % res["message"])
	check_eq(s.job, "laborer", "still a laborer meanwhile")
	check_eq(str(s.training.get("role", "")), "farmer", "training as a farmer")
	check(SimHelpers.run_until(sim, func() -> bool: return s.job == "farmer", int(Content.get_value("jobs", "ROLE_TRAIN_TICKS")) * 4) >= 0, "became a farmer")
	check(s.training.is_empty(), "done training")


func test_hall_level_decides_the_roles() -> void:
	var w := _world(1)
	var sim: Simulation = w[0]
	var hall: Building = w[1]
	var ps := _people(sim)
	check(bool(Commands.apply(sim, {"type": "trainRole", "ids": [ps[2].id], "role": "crafter"})["ok"]), "crafters at once")
	var messenger := Commands.apply(sim, {"type": "trainRole", "ids": [ps[0].id], "role": "messenger"})
	check(not bool(messenger["ok"]) and str(messenger["message"]).contains("Keep"), "messengers need a Keep: %s" % messenger["message"])
	hall.level = 2
	check(bool(Commands.apply(sim, {"type": "trainRole", "ids": [ps[0].id], "role": "traveler"})["ok"]), "travellers at a Keep")
	check(str(Commands.apply(sim, {"type": "trainRole", "ids": [ps[1].id], "role": "chief"})["message"]).contains("Castle"), "the chief needs a Castle")
	hall.level = 3
	check(bool(Commands.apply(sim, {"type": "trainRole", "ids": [ps[1].id], "role": "chief"})["ok"]), "chief at a Castle")
	check(str(Commands.apply(sim, {"type": "trainRole", "ids": [ps[2].id], "role": "chief"})["message"]).to_lower().contains("already"), "only one chief")


func test_ruler_children_and_holders_cannot_train_and_places_are_limited() -> void:
	var sim: Simulation = _world(1)[0]
	check(not bool(Commands.apply(sim, {"type": "trainRole", "ids": [sim.ruler().id], "role": "farmer"})["ok"]), "not the ruler")
	var farmer: Settler = null
	for p in _people(sim):
		if p.job == "farmer":
			farmer = p
	check(str(Commands.apply(sim, {"type": "trainRole", "ids": [farmer.id], "role": "farmer"})["message"]).to_lower().contains("already"), "already a farmer")
	var ids: Array = []
	for p in _people(sim):
		if p.job != "builder":
			ids.append(p.id)
	var res := Commands.apply(sim, {"type": "trainRole", "ids": ids, "role": "builder"})
	check(bool(res["ok"]), "some train")
	var training := 0
	for p in sim.settlers:
		if not p.training.is_empty():
			training += 1
	check_eq(training, 2, "two places at a Town Hall")
	var m := str(res["message"]).to_lower()
	check(m.contains("full") or m.contains("places"), "says the hall is full: %s" % m)


func test_training_survives_a_save_and_can_be_cancelled() -> void:
	var sim: Simulation = _world()[0]
	var s: Settler = null
	for p in _people(sim):
		if p.job == "laborer":
			s = p
			break
	Commands.apply(sim, {"type": "trainRole", "ids": [s.id], "role": "hauler"})
	SimHelpers.run(sim, 100)
	var loaded := _reload(sim)
	var s2 := loaded.settler(s.id)
	check_eq(str(s2.training.get("role", "")), "hauler", "still training")
	check(bool(Commands.apply(loaded, {"type": "cancelRoleTraining", "settlerId": s2.id})["ok"]), "cancelled")
	check(s2.training.is_empty(), "not training")
	check_eq(s2.job, "laborer", "still a laborer")


func test_travellers_explore_on_their_own() -> void:
	var a: Simulation = _world(2, 7702)[0]
	var b: Simulation = _world(2, 7702)[0]
	for p in _people(b):
		if p.job == "laborer":
			p.job = "traveler"
			break
	var before := a.world.explored_tile_count()
	SimHelpers.run(a, Defs.DAY_TICKS / 2)
	SimHelpers.run(b, Defs.DAY_TICKS / 2)
	check(b.world.explored_tile_count() > a.world.explored_tile_count() + 200, "the traveller lifted the fog: %d vs %d" % [b.world.explored_tile_count(), a.world.explored_tile_count()])
	check(a.world.explored_tile_count() >= before, "nothing forgotten")


func test_chief_puts_idle_people_to_work() -> void:
	var sim: Simulation = _world(3, 7703)[0]
	var ws: Building = null
	for r in 20:
		for y in range(-6 - r, -6 + r + 1):
			for x in range(8 - r, 8 + r + 1):
				if ws == null and bool(BuildingOps.check_placement(sim, "workshop", x, y)["ok"]):
					ws = BuildingOps.place(sim, "workshop", x, y)
					ws.delivered = BuildingOps.cost_of(ws).duplicate()
					BuildingOps.complete(sim, ws, true)
	var chief := _people(sim)[0]
	chief.job = "chief"
	for p in _people(sim):
		if p != chief:
			p.has_priorities = true
			p.priorities = ["craft"]
	check(SimHelpers.run_until(sim, func() -> bool: return not ws.workers.is_empty(), Defs.DAY_TICKS) >= 0, "someone assigned")
	check(ws.workers.any(func(id: int) -> bool: return id != chief.id), "not the chief")


func test_chief_brings_advice_to_the_ruler() -> void:
	var sim: Simulation = _world(3, 7704)[0]
	var chief := _people(sim)[0]
	chief.job = "chief"
	SimHelpers.camp(sim).inventory["food"] = 2
	check(SimHelpers.run_until(sim, func() -> bool: return bool(sim.chief["adviceReady"]), Defs.DAY_TICKS) >= 0, "advice ready")
	var me := sim.ruler()
	check(JsMath.hypot(chief.x - me.x, chief.y - me.y) <= 3.5, "beside the ruler")
	var res := Commands.apply(sim, {"type": "hearAdvice"})
	check(bool(res["ok"]) and str(res["message"]).to_lower().contains("food"), "about food: %s" % res["message"])
	check(not bool(sim.chief["adviceReady"]), "heard")
	check(not bool(Commands.apply(sim, {"type": "hearAdvice"})["ok"]), "nothing more yet")
	check_eq(int(_reload(sim).chief["nextAt"]), int(sim.chief["nextAt"]), "kept on reload")
