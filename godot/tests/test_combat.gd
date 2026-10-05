extends TestCase
## Declaring war, combat, occupation, sieges, plunder and saving a war, ported from
## tests/combat.test.ts (same seeds and scenarios; the war panel snapshot is a UI concern).


func _rival_at(sim: Simulation, k: Dictionary, x: float, y: float) -> Dictionary:
	var c := Combat.deploy_rival(sim, int(k["id"]), Vector2(x, y), true)
	check(not c.is_empty(), "a rival company deployed")
	return c


func _declare(sim: Simulation, k: Dictionary, objective: String = "raid") -> Dictionary:
	return Commands.apply(sim, {"type": "declareWar", "target": k["id"], "objective": objective, "confirmBreach": true})


func test_declaring_war_previews_breaches_and_needs_confirmation() -> void:
	var w := RealmHelpers.war_world()
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["a"]
	var offer := Diplomacy.make_offer(sim, int(a["id"]), 0, "nonAggression", {"durationDays": 16}, Defs.DAY_TICKS)
	Commands.apply(sim, {"type": "respondToOffer", "offerId": offer["id"], "accept": true})
	var p := Combat.declare_preview(sim, int(a["id"]))
	check(" ".join(PackedStringArray(p["breaches"])).to_lower().contains("non-aggression"), "lists the pact")
	check(not (p["exposed"] as Array).is_empty(), "shows exposed land")
	var no := Commands.apply(sim, {"type": "declareWar", "target": a["id"], "objective": "raid", "confirmBreach": false})
	check(not bool(no["ok"]) and str(no["message"]).to_lower().contains("break"), "needs confirming: %s" % no["message"])
	check(bool(_declare(sim, a)["ok"]), "declared")
	check_eq(offer["state"], "breached", "pact broken")
	check(Diplomacy.at_war(sim, 0, int(a["id"])), "at war")
	check(sim.world_events.any(func(e: Dictionary) -> bool: return e["kind"] == "war-declared" and int(e["subject"]) == 0), "news of it")


func test_war_needs_civilization_and_the_frontier() -> void:
	var r := RealmHelpers.realm()
	var m := str(_declare(r["sim"], r["a"])["message"])
	check(m.contains("Civilization") or m.to_lower().contains("frontier"), "refused: %s" % m)


func test_companies_fight_and_the_weaker_routs_with_nobody_dying() -> void:
	var w := RealmHelpers.war_world("protected-frontier", 3)
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	var company: Dictionary = w["company"]
	_declare(sim, a)
	var enemy := _rival_at(sim, a, -4 * 16 + 8, 8)
	var res := Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "defend", "x": -3 * 16 + 4, "y": 8, "supplyDays": 4})
	check(bool(res["ok"]), "defending: %s" % res["message"])
	var people := sim.settlers.size()
	SimHelpers.run_until(sim, func() -> bool: return enemy.get("state") == "returning" or company.get("state") == "returning", Defs.DAY_TICKS * 2)
	check_eq(sim.settlers.size(), people, "nobody died")
	check(enemy.get("state") == "returning" or company.get("state") == "returning", "someone routed")
	for id: int in w["ids"]:
		check(sim.settler(id) != null, "soldier alive")
	check(int(sim.stats["battles"]) > 0, "a battle counted")


func test_a_protected_homeland_is_never_entered_or_fired_from() -> void:
	var w := RealmHelpers.war_world()
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	var company: Dictionary = w["company"]
	_declare(sim, a)
	var enemy := _rival_at(sim, a, -4 * 16 + 8, 8)
	enemy["target"] = {"x": 2, "y": 2}
	SimHelpers.run(sim, Defs.DAY_TICKS / 2)
	var s := Territory.sector_of(float(enemy["x"]), float(enemy["y"]))
	check(not (Kingdoms.player(sim)["homeland"] as Array).any(func(q: Dictionary) -> bool: return int(q["x"]) == s.x and int(q["y"]) == s.y), "stopped at the edge")
	check_eq(company.get("state", "home"), "home", "our company at home")
	var hp: Variant = enemy.get("health")
	SimHelpers.run(sim, 200)
	check_eq(enemy.get("health"), hp, "never shot from inside")


func test_arrows_need_a_line_of_sight() -> void:
	var w := RealmHelpers.war_world()
	var sim: Simulation = w["sim"]
	var block := Vector2i(-99999, 0)
	for y in range(-120, -10):
		for x in range(-120, 40):
			if block.x == -99999 and sim.world.terrain(x, y) == Tiles.MOUNTAIN and sim.world.terrain(x, y - 3) != Tiles.MOUNTAIN and sim.world.terrain(x, y + 3) != Tiles.MOUNTAIN:
				block = Vector2i(x, y)
	check(block.x != -99999, "a thin mountain face")
	if block.x != -99999:
		check(not Combat.line_of_sight(sim, block.x, block.y - 3, block.x, block.y + 3), "blocked")
	check(Combat.line_of_sight(sim, 0, 6, 3, 6), "clear in the open")


func test_full_conquest_can_lose_a_soldier_and_cleans_up() -> void:
	var w := RealmHelpers.war_world("full-conquest", 1)
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	var company: Dictionary = w["company"]
	var s := sim.settler(int(w["ids"][0]))
	var partner: Settler = null
	for x in sim.settlers:
		if partner == null and x.id != s.id and x.military.is_empty() and x.life_stage == "adult" and not x.ruler and Kingdoms.council_post_of(sim, x) == "":
			partner = x
	var hh := Commands.apply(sim, {"type": "formHousehold", "ids": [s.id, partner.id]})
	check(bool(hh["ok"]), "household: %s" % hh["message"])
	_declare(sim, a)
	for i in 3:
		_rival_at(sim, a, -3 * 16 + 2 + i, 8)
	Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "defend", "x": -3 * 16 + 6, "y": 8, "supplyDays": 4})
	var sid := s.id
	check(SimHelpers.run_until(sim, func() -> bool: return sim.settler(sid) == null, Defs.DAY_TICKS * 2) >= 0, "fell in battle")
	check_eq(int(sim.stats["soldiersLost"]), 1, "counted")
	check(not sim.households.any(func(h: Dictionary) -> bool: return (h["adults"] as Array).has(sid)), "household gone")
	check(sim.bed_claims.all(func(c: Dictionary) -> bool: return c["owner"]["kind"] != "birth" or int(c["owner"]["id"]) != int(hh.get("id", -1))), "no bed claim left")
	for k: Dictionary in sim.kingdoms:
		for c: Dictionary in k["companies"]:
			check(not (c.get("members", []) as Array).has(sid), "not in a company")
	for b: Building in sim.buildings.values():
		check(not b.workers.has(sid), "not a worker")


func test_the_deployment_budget_is_shared() -> void:
	var w := RealmHelpers.war_world()
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["a"]
	var b: Dictionary = w["b"]
	_declare(sim, a)
	for k: Dictionary in [a, b]:
		var cs: Array = k["companies"]
		while cs.size() < 12:
			cs.append({"id": int(k["id"]) * 100 + cs.size(), "kind": "infantry", "strength": 10, "pledgedTo": null, "owner": k["id"]})
	Diplomacy.set_war(sim, int(a["id"]), int(b["id"]), true)
	for i in 30:
		for k: Dictionary in [a, b]:
			Combat.deploy_rival(sim, int(k["id"]), Vector2(-60 - i, 8))
	check(Combat.deployed_soldiers(sim) <= int(Combat.wval("ACTIVE_BUDGET")), "within the budget")
	check(Combat.deploy_rival(sim, int(a["id"]), Vector2(-60, 8)).is_empty(), "no more room")


func test_holding_land_occupies_it_and_peace_transfers_title() -> void:
	var w := RealmHelpers.war_world()
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	var company: Dictionary = w["company"]
	_declare(sim, a, "capture")
	var cx := float(a["capital"]["x"])
	var cy := float(a["capital"]["y"])
	var cap := Territory.sector_of(cx, cy)
	var ring := Vector2i(cap.x + 2, cap.y)
	for i in 21:
		sim.world.reveal(cx * i / 20.0, cy * i / 20.0, 10)
	sim.world.reveal(ring.x * 16 + 8, ring.y * 16 + 8, 14)
	var res := Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "move", "x": ring.x * 16 + 8, "y": ring.y * 16 + 8, "supplyDays": 8})
	check(bool(res["ok"]), "marching: %s" % res["message"])
	if not bool(res["ok"]):
		return
	var held := func() -> bool:
		var o := Territory.owner_of(sim, ring)
		return not o.is_empty() and o["occupyingKingdom"] != null and int(o["occupyingKingdom"]) == 0
	check(SimHelpers.run_until(sim, held, Defs.DAY_TICKS * 6 + int(Combat.wval("OCCUPY_TICKS"))) >= 0, "occupied")
	check_eq(int(Territory.owner_of(sim, ring)["legalOwner"]), int(a["id"]), "title unchanged")
	var loaded := RealmHelpers.reload_sim(sim)
	check_eq(Territory.owner_of(loaded, ring)["occupyingKingdom"], 0, "occupation kept on reload")
	var peace := Commands.apply(sim, {"type": "proposeTreaty", "kind": "peace", "to": a["id"], "terms": {"durationDays": 32, "transfers": [{"x": ring.x, "y": ring.y}]}})
	check(bool(peace["ok"]), "peace offered: %s" % peace["message"])
	sim.trust["%d>0" % int(a["id"])] = 90.0
	SimHelpers.run_until(sim, func() -> bool: return not Diplomacy.at_war(sim, 0, int(a["id"])) or Diplomacy.find_offer(sim, peace["id"])["state"] == "rejected", Defs.DAY_TICKS * 3)
	if Diplomacy.find_offer(sim, peace["id"])["state"] == "active":
		check_eq(int(Territory.owner_of(sim, ring)["legalOwner"]), 0, "title transferred")
		check(Territory.owner_of(sim, ring)["occupyingKingdom"] == null, "occupation ended")


func test_a_siege_meter_advances_and_relief_interrupts_it() -> void:
	var w := RealmHelpers.war_world("full-conquest", 3)
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	var company: Dictionary = w["company"]
	_declare(sim, a, "capture")
	var cx := float(a["capital"]["x"])
	var cy := float(a["capital"]["y"])
	for i in 21:
		sim.world.reveal(cx * i / 20.0, cy * i / 20.0, 10)
	for q: Dictionary in a["companies"]:
		q["pledgedTo"] = -1
	var res := Commands.apply(sim, {"type": "orderCompany", "companyId": company["id"], "order": "move", "x": floori(cx), "y": floori(cy), "supplyDays": 8})
	check(bool(res["ok"]), "marching: %s" % res["message"])
	if not bool(res["ok"]):
		return
	var aid := int(a["id"])
	check(SimHelpers.run_until(sim, func() -> bool: return float(sim.sieges.get(aid, {}).get("progress", 0)) > 20, Defs.DAY_TICKS * 8) >= 0, "siege advancing")
	check(float(sim.sieges[aid]["progress"]) < 100, "not yet fallen")
	for q: Dictionary in a["companies"]:
		q["pledgedTo"] = null
	Combat.deploy_rival(sim, aid, Vector2(floori(cx), floori(cy)), true)
	var before := float(sim.sieges[aid]["progress"])
	SimHelpers.run(sim, 200)
	check(float(sim.sieges.get(aid, {}).get("progress", 0)) < before + 1, "relief stopped it")


func test_cargo_caught_by_enemies_is_lost_once() -> void:
	var w := RealmHelpers.war_world()
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	_declare(sim, a)
	var camp := SimHelpers.camp(sim)
	var m := {"id": sim.alloc_id(), "routeId": null, "crewId": sim.settlers[4].id, "sourceId": camp.id, "destId": camp.id, "cargo": {"wood": 10}, "state": "outbound",
		"departTick": sim.tick, "arriveTick": sim.tick + 400, "legTicks": 400, "from": {"x": -60.0, "y": 8.0}, "to": {"x": -100.0, "y": 8.0}}
	sim.manifests.append(m)
	sim.settlers[4].away_on = int(m["id"])
	_rival_at(sim, a, -62, 8)
	SimHelpers.run(sim, 60)
	check_eq(int((m["cargo"] as Dictionary).get("wood", 0)), 0, "seized")
	check_eq(int(sim.stats["cargoLost"]), 10, "counted")
	SimHelpers.run(sim, 60)
	check_eq(int(sim.stats["cargoLost"]), 10, "only once")


func test_a_war_survives_a_reload() -> void:
	var w := RealmHelpers.war_world("protected-frontier", 3)
	var sim: Simulation = w["sim"]
	var a: Dictionary = w["foe"]
	var aid := int(a["id"])
	_declare(sim, a)
	sim.sieges[aid] = {"besieger": 0, "progress": 37}
	sim.occupation_timers["-4,0"] = {"kingdom": aid, "since": sim.tick - 10}
	var s: Settler = null
	for x in sim.settlers:
		if s == null and x.military.is_empty() and x.life_stage == "adult" and not x.ruler:
			s = x
	s.captive = {"by": aid}
	s.hidden = true
	var ws: Dictionary = sim.war_states[Diplomacy.pair_key(0, aid)]
	ws["routs"][str(aid)] = 2
	var loaded := RealmHelpers.reload_sim(sim)
	check_eq(JSON.stringify(loaded.war_states[Diplomacy.pair_key(0, aid)]), JSON.stringify(ws), "war record")
	check_eq(JSON.stringify(loaded.sieges[aid]), JSON.stringify({"besieger": 0, "progress": 37}), "surrender meter")
	check_eq(JSON.stringify(loaded.occupation_timers["-4,0"]), JSON.stringify({"kingdom": aid, "since": sim.tick - 10}), "occupation timer")
	check_eq(loaded.settler(s.id).captive, {"by": aid}, "captive")
	check(loaded.settler(s.id).hidden, "still away")
