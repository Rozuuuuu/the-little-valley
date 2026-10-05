extends TestCase
## The war council (tests/coalition.test.ts) and merchants at the inn (the merchant cases of
## tests/travelers.test.ts), with the same seeds and scenarios.


func _coins(sim: Simulation) -> float:
	var n := 0.0
	for k: Dictionary in sim.kingdoms:
		n += float(k["treasury"])
	for o: Dictionary in sim.offers:
		n += float(o["escrow"])
	for c: Dictionary in sim.commitments:
		n += float(c["escrow"])
	return n


## A realm allied with A and B, planning a limited war against C.
func _council() -> Dictionary:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var b := int(r["b"]["id"])
	Diplomacy.set_stance_direct(sim, 0, a, "ally")
	Diplomacy.set_stance_direct(sim, 0, b, "ally")
	sim.trust["%d>0" % a] = 80.0
	sim.trust["%d>0" % b] = 55.0
	var plan := Commands.apply(sim, {"type": "createWarPlan", "target": r["c"]["id"], "objective": "raid"})
	check(bool(plan["ok"]), "plan: %s" % plan["message"])
	r["planId"] = plan["id"]
	return r


func _terms(companies: int, fee: int, payer: String, days: int, command: String = "coordinated", rewards: Array = [], unit_id: Variant = null) -> Dictionary:
	var t := {"companies": companies, "coinFee": fee, "supplyPayer": payer, "serviceDays": days, "commandRights": command, "rewardSectors": rewards, "reciprocalDefenseDays": 0}
	if unit_id != null:
		t["unit"] = unit_id
	return t


func _ask(sim: Simulation, plan_id: Variant, ally: Variant, terms: Dictionary) -> Dictionary:
	return Commands.apply(sim, {"type": "requestCampaignSupport", "planId": plan_id, "ally": ally, "terms": terms})


func _reply(sim: Simulation, id: Variant) -> Dictionary:
	SimHelpers.run_until(sim, func() -> bool: return Campaigns.find_commitment(sim, id)["state"] != "proposed", Defs.DAY_TICKS * 3)
	return Campaigns.find_commitment(sim, id)


func test_a_war_plan_is_private() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	for k: int in [int(r["a"]["id"]), int(r["c"]["id"])]:
		check(not News.knowledge_of(sim, k).any(func(x: Dictionary) -> bool: return x["kind"] == "war-declared"), "nobody heard")
	check(not sim.world_events.any(func(e: Dictionary) -> bool: return e["kind"] == "war-declared"), "no event")


func test_allies_answer_with_reasons_and_identical_requests_are_not_rerolled() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	var ra := _ask(sim, r["planId"], r["a"]["id"], _terms(1, 40, "requester", 4))
	check(bool(ra["ok"]), "asked a: %s" % ra["message"])
	var ca := _reply(sim, ra["id"])
	check(["countered", "accepted", "refused"].has(ca["state"]), "answered: %s" % ca["state"])
	check(not (ca["reasons"] as Array).is_empty(), "with reasons")
	var rb := _ask(sim, r["planId"], r["b"]["id"], _terms(3, 0, "contributor", 20, "delegated"))
	var cb := _reply(sim, rb["id"])
	check(cb["state"] != "accepted", "b won't give freely")
	check_eq(Diplomacy.stance_of(sim, 0, int(r["b"]["id"])), "ally", "still an ally")
	var again := _ask(sim, r["planId"], r["b"]["id"], _terms(3, 0, "contributor", 20, "delegated"))
	var m := str(again["message"]).to_lower()
	check(not bool(again["ok"]) and (m.contains("same") or m.contains("already") or m.contains("change")), "not re-rolled: %s" % m)


func test_accepting_escrows_and_reserves_companies_with_a_reserve() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	var a: Dictionary = r["a"]
	var total := _coins(sim)
	var req := _ask(sim, r["planId"], a["id"], _terms(1, 60, "shared", 4))
	var cm := _reply(sim, req["id"])
	if cm["state"] == "countered":
		check(bool(Commands.apply(sim, {"type": "acceptCampaignOffer", "commitmentId": cm["id"]})["ok"]), "accepted the counter")
	if cm["state"] != "accepted":
		return
	check_eq(_coins(sim), total, "no coins created")
	check_eq(float(cm["escrow"]), float(cm["terms"]["coinFee"]), "fee held")
	var pledged := (a["companies"] as Array).filter(func(q: Dictionary) -> bool: return q["pledgedTo"] != null and int(q["pledgedTo"]) == int(cm["id"]))
	check_eq(pledged.size(), (cm["terms"]["companies"] as Array).size(), "real companies reserved")
	check((a["companies"] as Array).any(func(q: Dictionary) -> bool: return q["pledgedTo"] == null), "a reserve stays home")
	var plan2 := Commands.apply(sim, {"type": "createWarPlan", "target": r["c"]["id"], "objective": "raid"})
	var req2 := _ask(sim, plan2["id"], a["id"], _terms((a["companies"] as Array).size(), 200, "requester", 4))
	var m := str(req2["message"]).to_lower()
	check(not bool(req2["ok"]) and (m.contains("compan") or m.contains("reserve")), "no double pledge: %s" % m)


func test_unaffordable_fee_refused_and_cancelling_refunds() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	var me: Dictionary = r["me"]
	var a: Dictionary = r["a"]
	me["treasury"] = 10
	var bad := _ask(sim, r["planId"], a["id"], _terms(1, 90, "requester", 4))
	var m := str(bad["message"]).to_lower()
	check(not bool(bad["ok"]) and (m.contains("coins") or m.contains("treasury")), "refused: %s" % m)
	me["treasury"] = 400
	var total := _coins(sim)
	var req := _ask(sim, r["planId"], a["id"], _terms(1, 50, "requester", 4))
	var cm := _reply(sim, req["id"])
	if cm["state"] == "countered":
		Commands.apply(sim, {"type": "acceptCampaignOffer", "commitmentId": cm["id"]})
	check(bool(Commands.apply(sim, {"type": "cancelWarPlan", "planId": r["planId"]})["ok"]), "cancelled")
	check_eq(_coins(sim), total, "no coins lost")
	check_eq(float(me["treasury"]), 400.0, "fee back")
	check((a["companies"] as Array).all(func(q: Dictionary) -> bool: return q["pledgedTo"] == null), "troops released")
	check_eq(Campaigns.find_commitment(sim, req["id"])["state"], "cancelled", "commitment cancelled")


func test_land_rewards_must_be_the_targets_frontier_and_promised_once() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	var c: Dictionary = r["c"]
	var cap := Territory.sector_of(float(c["capital"]["x"]), float(c["capital"]["y"]))
	var core := {"x": cap.x, "y": cap.y}
	var ring := {"x": cap.x + 2, "y": cap.y}
	var m1 := str(_ask(sim, r["planId"], r["a"]["id"], _terms(1, 20, "requester", 4, "coordinated", [core]))["message"]).to_lower()
	check(m1.contains("protected") or m1.contains("homeland"), "core refused: %s" % m1)
	var m2 := str(_ask(sim, r["planId"], r["a"]["id"], _terms(1, 20, "requester", 4, "coordinated", [{"x": 50, "y": 50}]))["message"]).to_lower()
	check(m2.contains("belong"), "not theirs: %s" % m2)
	check(bool(_ask(sim, r["planId"], r["a"]["id"], _terms(1, 20, "requester", 4, "coordinated", [ring]))["ok"]), "ring promised")
	check(str(_ask(sim, r["planId"], r["b"]["id"], _terms(1, 20, "requester", 4, "coordinated", [ring]))["message"]).to_lower().contains("already promised"), "only once")


func test_assessment_uses_reports_and_counts_only_arrivals() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	var req := _ask(sim, r["planId"], r["a"]["id"], _terms(1, 40, "shared", 4))
	var cm := _reply(sim, req["id"])
	if cm["state"] == "countered":
		Commands.apply(sim, {"type": "acceptCampaignOffer", "commitmentId": cm["id"]})
	var asmt := Campaigns.assess(sim, int(r["planId"]))
	check(not asmt["enemy"]["known"], "no reports")
	check(asmt["enemy"]["range"] == null, "no range")
	check_eq(int(asmt["allies"]["arrived"]), 0, "nobody arrived")
	var why := " ".join(PackedStringArray(asmt["blockers"])).to_lower()
	check(why.contains("army") or why.contains("barracks") or why.contains("soldiers"), "blocked: %s" % why)
	var loaded := RealmHelpers.reload_sim(sim)
	check_eq(loaded.war_plans.size(), 1, "plan kept")
	check_eq(loaded.commitments.map(func(x: Dictionary) -> String: return x["state"]), sim.commitments.map(func(x: Dictionary) -> String: return x["state"]), "commitments kept")


func test_two_allies_answer_differently_and_count_only_on_arrival() -> void:
	var r := _council()
	var sim: Simulation = r["sim"]
	var r1 := _ask(sim, r["planId"], r["a"]["id"], _terms(1, 0, "requester", 6, "coordinated", [], "archer"))
	var r2 := _ask(sim, r["planId"], r["b"]["id"], _terms(1, 0, "contributor", 12))
	var c1 := _reply(sim, r1["id"])
	var c2 := _reply(sim, r2["id"])
	for cm: Dictionary in [c1, c2]:
		check(not (cm["reasons"] as Array).is_empty(), "reasons given")
	if c2["state"] == "countered":
		check(int(c2["terms"]["coinFee"]) > 0 or int(c2["terms"]["serviceDays"]) < 12, "b wants more")
	var asmt := Campaigns.assess(sim, int(r["planId"]))
	check_eq(int(asmt["allies"]["arrived"]), 0, "none arrived")
	check(int(asmt["allies"]["pledged"]) + int(asmt["allies"]["proposed"]) > 0, "some pledged or proposed")


# ---- merchants ----------------------------------------------------------------------------------

func _inn_world(seed_value: int = 3131) -> Dictionary:
	var sim := NewGame.create(seed_value)
	sim.reached.append("hamlet")
	sim.reached.append("village")
	SimHelpers.camp(sim).inventory = {"food": 120, "wood": 60, "stone": 30, "tools": 10, "silverOre": 6}
	RealmHelpers.instant(sim, "storehouse", Vector2i(-8, -8))
	return {"sim": sim, "inn": RealmHelpers.instant(sim, "inn", Vector2i(6, -6))}


func test_no_inn_no_merchants_and_each_stage_once() -> void:
	var plain := NewGame.create(3131)
	SimHelpers.run(plain, Defs.DAY_TICKS * 3)
	check(plain.parties.is_empty(), "no inn, no merchant")
	var sim: Simulation = _inn_world()["sim"]
	check(SimHelpers.run_until(sim, func() -> bool: return not sim.parties.is_empty(), Defs.DAY_TICKS * 3) >= 0, "a merchant set off")
	var p: Dictionary = sim.parties[0]
	check_eq(p["state"], "travelling", "travelling")
	check(sim.known_regions.has(int(p["homeRegion"])), "their home is known")
	var stages: Array = [p["state"]]
	var pid := int(p["id"])
	SimHelpers.run_until(sim, func() -> bool:
		var q := Merchants.find(sim, pid)
		var st: String = q["state"] if not q.is_empty() else "gone"
		if stages[stages.size() - 1] != st:
			stages.append(st)
		return st == "gone", Defs.DAY_TICKS * 6)
	check_eq(stages, ["travelling", "arriving", "lodging", "leaving", "gone"], "each stage once")
	check_eq(int(sim.stats["merchantVisits"]), 1, "one visit")


func test_barter_is_fair_and_finite() -> void:
	var sim: Simulation = _inn_world()["sim"]
	SimHelpers.run_until(sim, func() -> bool: return sim.parties.any(func(q: Dictionary) -> bool: return q["state"] == "lodging"), Defs.DAY_TICKS * 5)
	var p: Dictionary = sim.parties.filter(func(q: Dictionary) -> bool: return q["state"] == "lodging")[0]
	var res := ""
	for k: String in p["stock"]:
		if res == "" and int(p["stock"][k]) > 0:
			res = k
	var have := int(p["stock"][res])
	var totals := sim.totals()
	check(not bool(Commands.apply(sim, {"type": "barter", "partyId": p["id"], "give": {}, "take": {res: 1}})["ok"]), "nothing for nothing")
	check_eq(sim.totals(), totals, "nothing moved")
	var need := ceili(float(Merchants.sell_price(res) * 2) / Merchants.buy_price("tools"))
	var deal := Commands.apply(sim, {"type": "barter", "partyId": p["id"], "give": {"tools": need}, "take": {res: 2}})
	check(bool(deal["ok"]), "fair deal: %s" % deal["message"])
	check_eq(int(sim.totals()[res]), int(totals.get(res, 0)) + 2, "got the goods")
	check_eq(int(sim.totals()["tools"]), int(totals["tools"]) - need, "paid in tools")
	check_eq(int(p["stock"][res]), have - 2, "their stock fell")
	var m := str(Commands.apply(sim, {"type": "barter", "partyId": p["id"], "give": {"silverOre": 6}, "take": {res: have}})["message"])
	check(m.contains("only has") or m.contains("has only"), "finite stock: %s" % m)
	check_eq(int(sim.stats["trades"]), 1, "one trade")
	check(Merchants.price("diamonds") > Merchants.price("goldOre"), "diamonds dearer than gold")


func test_a_reload_while_a_merchant_walks_in_keeps_one() -> void:
	var sim: Simulation = _inn_world()["sim"]
	SimHelpers.run_until(sim, func() -> bool: return sim.parties.any(func(q: Dictionary) -> bool: return q["state"] == "arriving"), Defs.DAY_TICKS * 5)
	var loaded := RealmHelpers.reload_sim(sim)
	check_eq(loaded.parties.size(), 1, "one merchant")
	check_eq(loaded.parties[0]["state"], "arriving", "still arriving")
	SimHelpers.run_until(loaded, func() -> bool: return not loaded.parties.is_empty() and loaded.parties[0]["state"] == "lodging", Defs.DAY_TICKS)
	check_eq(loaded.parties.size(), 1, "still one")


func test_an_inn_brings_visitors_more_often() -> void:
	var sim: Simulation = _inn_world()["sim"]
	var base := int(Content.get_value("kingdomBalance", "VISITOR_INTERVAL"))
	check(People.visitor_interval(sim) < base, "more often with an inn")
	check_eq(People.visitor_interval(NewGame.create(1)), base, "as usual without")


func test_merchants_sell_copper_or_iron_ore() -> void:
	var sim: Simulation = _inn_world()["sim"]
	var seen := false
	for i in 4:
		if seen:
			break
		SimHelpers.run_until(sim, func() -> bool: return sim.parties.any(func(q: Dictionary) -> bool: return q["state"] == "lodging"), Defs.DAY_TICKS * 6)
		var lodging := sim.parties.filter(func(q: Dictionary) -> bool: return q["state"] == "lodging")
		if lodging.is_empty():
			continue
		var p: Dictionary = lodging[0]
		seen = int(p["stock"].get("copperOre", 0)) > 0 or int(p["stock"].get("ironOre", 0)) > 0
		var pid := int(p["id"])
		SimHelpers.run_until(sim, func() -> bool: return Merchants.find(sim, pid).is_empty(), Defs.DAY_TICKS * 4)
	check(seen, "ore on sale")
