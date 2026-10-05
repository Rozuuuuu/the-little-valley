extends TestCase
## Soldiers, horses, supplied companies and allied mustering, ported from tests/military.test.ts
## (same seeds and scenarios).


## A crowned realm with barracks, archery range, storehouse and stable.
func _garrison(gear: Dictionary = {"swords": 6, "bows": 4, "armor": 2}) -> Dictionary:
	var r := RealmHelpers.realm(6161)
	var sim: Simulation = r["sim"]
	var camp := SimHelpers.camp(sim)
	camp.inventory = {"food": 150, "wood": 40, "stone": 20, "planks": 20}
	camp.inventory.merge(gear, true)
	sim.world.reveal(0, 0, 24)
	sim.load_nav_area(0, 0)
	RealmHelpers.instant(sim, "storehouse", Vector2i(-8, -8))
	r["camp"] = camp
	r["barracks"] = RealmHelpers.instant(sim, "barracks", Vector2i(8, -8))
	r["range"] = RealmHelpers.instant(sim, "archeryRange", Vector2i(-12, 6))
	r["stable"] = RealmHelpers.instant(sim, "stable", Vector2i(12, 6))
	return r


func _enlist(sim: Simulation, ids: Array, unit_id: String, b: Building) -> Dictionary:
	return Commands.apply(sim, {"type": "enlist", "ids": ids, "unit": unit_id, "buildingId": b.id})


func _swords_held(sim: Simulation) -> int:
	var n := SimHelpers.accounted_for(sim, "swords")
	for s in sim.settlers:
		if not s.military.is_empty():
			n += int((s.military["gear"] as Dictionary).get("swords", 0))
	return n


func test_only_adults_enlist_and_the_last_sword_goes_to_one() -> void:
	var g := _garrison({"swords": 1, "bows": 0, "armor": 0})
	var sim: Simulation = g["sim"]
	var kid := sim.add_settler(0, 2, "laborer")
	kid.life_stage = "child"
	check(str(_enlist(sim, [kid.id], "infantry", g["barracks"])["message"]).to_lower().contains("child"), "no children")
	var a := sim.settlers[1]
	var b := sim.settlers[2]
	var total := _swords_held(sim)
	check(bool(_enlist(sim, [a.id], "infantry", g["barracks"])["ok"]), "first enlisted")
	var second := _enlist(sim, [b.id], "infantry", g["barracks"])
	check(not bool(second["ok"]) and str(second["message"]).to_lower().contains("sword"), "no sword left: %s" % second["message"])
	check_eq(int((g["camp"] as Building).inventory.get("swords", 0)), 0, "store empty")
	check_eq(int(a.military["gear"]["swords"]), 1, "a carries it")
	check_eq(_swords_held(sim), total, "no sword created or lost")
	check(b.military.is_empty(), "b not a soldier")


func test_enlisting_keeps_home_and_old_job() -> void:
	var g := _garrison()
	var sim: Simulation = g["sim"]
	var ws := RealmHelpers.instant(sim, "workshop", Vector2i(4, 8))
	var s := sim.settlers[1]
	Commands.apply(sim, {"type": "assignWorker", "buildingId": ws.id, "ids": [s.id]})
	var home := s.home_id
	var job := s.job
	check(bool(_enlist(sim, [s.id], "infantry", g["barracks"])["ok"]), "enlisted")
	check(not ws.workers.has(s.id), "left the workshop")
	check_eq(s.home_id, home, "same home")
	check_eq(s.military["priorJob"], job, "old job kept")
	SimHelpers.run(sim, 100)
	check(s.task == null or not [Task.BUILD, Task.HAUL, Task.FARM, Task.GATHER, Task.CRAFT].has(s.task.kind), "no civilian work")


func test_training_slots_reload_and_cancel() -> void:
	var g := _garrison({"swords": 6, "bows": 0, "armor": 0})
	var sim: Simulation = g["sim"]
	for i in 3:
		sim.add_settler(0, 3, "laborer")
	var ids: Array = []
	for i in range(1, sim.settlers.size()):
		if not sim.settlers[i].ruler:
			ids.append(sim.settlers[i].id)
	var res := _enlist(sim, ids.slice(0, 5), "infantry", g["barracks"])
	check(bool(res["ok"]), "some enlisted")
	var m := str(res["message"]).to_lower()
	check(m.contains("4 of 5") or m.contains("full"), "slots: %s" % m)
	check_eq(sim.settlers.filter(func(s: Settler) -> bool: return not s.military.is_empty()).size(), 4, "four in training")
	SimHelpers.run(sim, Defs.DAY_TICKS / 2)
	var loaded := RealmHelpers.reload_sim(sim)
	var t := loaded.settler(int(ids[0])).military
	check_eq(t["state"], "training", "still training")
	check_eq(float(t["trained"]), float(sim.settler(int(ids[0])).military["trained"]), "same progress")
	var swords0 := _swords_held(loaded)
	check(bool(Commands.apply(loaded, {"type": "cancelTraining", "settlerId": ids[1]})["ok"]), "cancelled")
	check(loaded.settler(int(ids[1])).military.is_empty(), "back to civilian")
	check_eq(_swords_held(loaded), swords0, "sword returned")
	check(SimHelpers.run_until(loaded, func() -> bool: return loaded.settler(int(ids[0])).military["state"] == "ready", int(Military.unit("infantry")["trainTicks"]) * 3) >= 0, "finished")
	check(not Military.player_companies(loaded).is_empty(), "a company")


func test_horses_live_in_stalls_and_knights_need_them() -> void:
	var g := _garrison({"swords": 4, "bows": 0, "armor": 2})
	var sim: Simulation = g["sim"]
	var camp: Building = g["camp"]
	var stable: Building = g["stable"]
	var s := sim.settlers[1]
	check(str(_enlist(sim, [s.id], "knight", g["barracks"])["message"]).to_lower().contains("horse"), "needs a horse")
	check_eq(sim.deposit(camp, "horses", 1), 0, "not in an ordinary store")
	check_eq(sim.deposit(stable, "horses", 1), 1, "in the stable")
	check_eq(sim.stored_total("horses"), 1, "one horse")
	var food0 := sim.stored_total("food")
	var d0 := sim.day()
	SimHelpers.run_until(sim, func() -> bool: return sim.day() == d0 + 1, Defs.DAY_TICKS)
	SimHelpers.run(sim, 60)
	check(int(sim.stats["horseFeed"]) >= 1, "fed")
	check(sim.stored_total("food") < food0, "from the stores")
	check(bool(_enlist(sim, [s.id], "knight", g["barracks"])["ok"]), "knight enlisted")
	check_eq(sim.stored_total("horses"), 0, "horse taken")
	check_eq(int(s.military["gear"]["horses"]), 1, "rides it")
	SimHelpers.run_until(sim, func() -> bool: return s.military["state"] == "ready", int(Military.unit("knight")["trainTicks"]) * 3)
	var company: Dictionary = Military.player_companies(sim).filter(func(c: Dictionary) -> bool: return (c["members"] as Array).has(s.id))[0]
	check(bool(Commands.apply(sim, {"type": "demobilize", "companyId": company["id"]})["ok"]), "stood down")
	check(s.military.is_empty(), "civilian again")
	check_eq(sim.stored_total("horses"), 1, "horse back")
	check_eq(int(stable.inventory.get("horses", 0)), 1, "in the stable")


func _ready_company() -> Dictionary:
	var g := _garrison({"swords": 4, "bows": 0, "armor": 0})
	var sim: Simulation = g["sim"]
	var ids: Array = [sim.settlers[1].id, sim.settlers[2].id]
	_enlist(sim, ids, "infantry", g["barracks"])
	SimHelpers.run_until(sim, func() -> bool: return ids.all(func(id: int) -> bool: return sim.settler(id).military.get("state") == "ready"), int(Military.unit("infantry")["trainTicks"]) * 3)
	g["ids"] = ids
	g["company"] = Military.player_companies(sim)[0]
	return g


func test_a_company_rests_at_a_travellers_camp_once_a_day() -> void:
	var g := _ready_company()
	var sim: Simulation = g["sim"]
	var company: Dictionary = g["company"]
	var camp := RealmHelpers.instant(sim, "travelCamp", Vector2i(12, 12))
	var res := Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "move", "x": camp.x + 1, "y": camp.y + 3, "supplyDays": 1})
	check(bool(res["ok"]), "marching: %s" % res["message"])
	company["readiness"] = 40
	company["morale"] = 50
	var food0 := sim.stored_total("food")
	check(SimHelpers.run_until(sim, func() -> bool: return company.get("restedDay") == sim.day(), Defs.DAY_TICKS) >= 0, "rested")
	check_eq(float(company["readiness"]), 100.0, "readiness restored")
	check_eq(float(company["morale"]), 75.0, "morale up")
	check(int(company["supplies"]) >= (g["ids"] as Array).size() * 2, "restocked")
	check(sim.stored_total("food") < food0, "from the stores")
	var s0 := int(company["supplies"])
	company["readiness"] = 60
	SimHelpers.run(sim, 200)
	check(float(company["readiness"]) < 100, "not twice a day")
	check(int(company["supplies"]) <= s0, "no second restock")


func test_patrol_runs_out_of_food_and_comes_home_with_nobody_lost() -> void:
	var g := _ready_company()
	var sim: Simulation = g["sim"]
	var company: Dictionary = g["company"]
	var ids: Array = g["ids"]
	var res := Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "move", "x": 14, "y": 14, "supplyDays": 1})
	check(bool(res["ok"]), "marching: %s" % res["message"])
	check_eq(company["state"], "deployed", "deployed")
	check_eq(int(company["supplies"]), ids.size(), "a day's food")
	for id: int in ids:
		check(sim.settler(id).hidden, "away")
	var d0 := sim.day()
	SimHelpers.run_until(sim, func() -> bool: return sim.day() == d0 + 2, Defs.DAY_TICKS * 3)
	SimHelpers.run(sim, 60)
	check_eq(int(company["supplies"]), 0, "eaten")
	check(float(company["readiness"]) < 100, "readiness falling")
	check(SimHelpers.run_until(sim, func() -> bool: return company["state"] == "home", Defs.DAY_TICKS * 8) >= 0, "came home")
	check_eq((company["members"] as Array).size(), ids.size(), "nobody lost")
	for id: int in ids:
		check(sim.settler(id) != null and not sim.settler(id).hidden, "back in the valley")


func test_soldiers_need_leave_and_deployed_companies_cannot_stand_down() -> void:
	var g := _ready_company()
	var sim: Simulation = g["sim"]
	var company: Dictionary = g["company"]
	var rival: Dictionary = sim.kingdoms.filter(func(k: Dictionary) -> bool: return not k["player"])[0]
	var res := Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "move", "x": int(rival["capital"]["x"]), "y": int(rival["capital"]["y"]), "supplyDays": 2})
	var m := str(res["message"]).to_lower()
	check(not bool(res["ok"]) and (m.contains("protected") or m.contains("permission") or m.contains("passage")), "refused: %s" % m)
	Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "move", "x": 14, "y": 14, "supplyDays": 2})
	var d := str(Commands.apply(sim, {"type": "demobilize", "companyId": company["id"]})["message"]).to_lower()
	check(d.contains("recall") or d.contains("home"), "refused: %s" % d)


func test_a_parent_away_with_the_army_pauses_a_child_request() -> void:
	var g := _ready_company()
	var sim: Simulation = g["sim"]
	var ids: Array = g["ids"]
	var partner: Settler = null
	for s in sim.settlers:
		if partner == null and not ids.has(s.id) and s.life_stage == "adult" and s.military.is_empty() and not s.ruler and Kingdoms.council_post_of(sim, s) == "":
			partner = s
	var hh := Commands.apply(sim, {"type": "formHousehold", "ids": [ids[0], partner.id]})
	check(bool(hh["ok"]), "household: %s" % hh["message"])
	Commands.apply(sim, {"type": "orderCompany", "companyId": g["company"]["id"], "order": "move", "x": 14, "y": 14, "supplyDays": 2})
	var m := str(Commands.apply(sim, {"type": "requestChild", "householdId": hh.get("id", -1)})["message"]).to_lower()
	check(m.contains("away") or m.contains("army"), "paused: %s" % m)


func test_civilization_needs_no_war_or_rare_ore() -> void:
	var def: Dictionary = (Content.get_value("progression", "MILESTONES") as Dictionary)["civilization"]
	check(not def.get("future", false), "a real milestone")
	var text := JSON.stringify(def["requirements"]).to_lower()
	check(not text.contains("war") and not text.contains("gold") and not text.contains("silver") and not text.contains("diamond"), "no war or rare ore")
	var sim: Simulation = RealmHelpers.realm()["sim"]
	var reqs: Array = (def["requirements"] as Array).map(func(q: Dictionary) -> Dictionary: return Progression.requirement_progress(sim, q))
	check(reqs[0]["done"], "crowned counts")
	check(reqs.any(func(q: Dictionary) -> bool: return not q["done"]), "not all done yet")


func test_coalition_allies_muster_arrive_and_go_home() -> void:
	var g := _ready_company()
	var sim: Simulation = g["sim"]
	var a: Dictionary = g["a"]
	var aid := int(a["id"])
	Diplomacy.set_stance_direct(sim, 0, aid, "ally")
	sim.trust["%d>0" % aid] = 90.0
	var target: Dictionary = sim.kingdoms.filter(func(k: Dictionary) -> bool: return not k["player"] and int(k["id"]) != aid)[0]
	var plan := Commands.apply(sim, {"type": "createWarPlan", "target": target["id"], "objective": "raid"})
	check(bool(plan["ok"]), "plan: %s" % plan["message"])
	var req := Commands.apply(sim, {"type": "requestCampaignSupport", "planId": plan["id"], "ally": aid, "terms": {"companies": 1, "coinFee": 40, "supplyPayer": "shared", "serviceDays": 2, "commandRights": "coordinated", "rewardSectors": [], "reciprocalDefenseDays": 0}})
	check(bool(req["ok"]), "asked: %s" % req["message"])
	var cm := Campaigns.find_commitment(sim, req["id"])
	SimHelpers.run_until(sim, func() -> bool: return cm["state"] != "proposed", Defs.DAY_TICKS * 3)
	if cm["state"] == "countered":
		Commands.apply(sim, {"type": "acceptCampaignOffer", "commitmentId": cm["id"]})
	check_eq(cm["state"], "accepted", "accepted")
	var people := sim.settlers.size()
	var coins := float(a["treasury"])
	check(bool(Commands.apply(sim, {"type": "mobilizeCampaign", "planId": plan["id"]})["ok"]), "mustering")
	check(["assembling", "enRoute"].has(cm["state"]), "assembling")
	check(SimHelpers.run_until(sim, func() -> bool: return cm["state"] == "arrived" or cm["state"] == "active", Defs.DAY_TICKS * 6) >= 0, "arrived")
	check_eq(float(a["treasury"]), coins + float(cm["terms"]["coinFee"]), "paid on arrival")
	check_eq(float(cm["escrow"]), 0.0, "escrow released")
	check_eq(sim.settlers.size(), people, "they never join your people")
	check(SimHelpers.run_until(sim, func() -> bool: return cm["state"] == "fulfilled", Defs.DAY_TICKS * 8) >= 0, "went home")
	check((a["companies"] as Array).all(func(q: Dictionary) -> bool: return q["pledgedTo"] == null), "free again")


func test_goods_never_go_into_a_stable() -> void:
	var g := _garrison()
	var sim: Simulation = g["sim"]
	var stable: Building = g["stable"]
	var camp: Building = g["camp"]
	var s := sim.settlers[2]
	s.x = stable.x + 1.5
	s.y = stable.y + stable.h + 0.5
	s.set_carry("wood", 3)
	s.task = null
	var wood0 := int(camp.inventory.get("wood", 0))
	check(SimHelpers.run_until(sim, func() -> bool: return not s.carrying(), 600) >= 0, "delivered")
	check_eq(int(stable.inventory.get("wood", 0)), 0, "not in the stable")
	check(sim.stored_total("wood") >= wood0 + 3, "in a store")
