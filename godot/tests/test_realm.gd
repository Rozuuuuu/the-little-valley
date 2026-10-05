extends TestCase
## Kingdoms, territory and news, ported from tests/kingdoms.test.ts, tests/territory.test.ts and
## tests/news.test.ts (same seeds and scenarios; the panel snapshots are covered by UI captures).

const IDENTITY := {"rulerName": "Queen Alder", "kingdomName": "Alderholt", "banner": {"color": "#3a6ea5", "emblem": "oak"}}


func _region_ready(seed_value: int = 4040) -> Simulation:
	var sim := NewGame.create(seed_value)
	for m: String in ["hamlet", "village", "town"]:
		sim.reached.append(m)
	return sim


func _coronate(sim: Simulation, identity: Dictionary = IDENTITY) -> Dictionary:
	var cmd := identity.duplicate(true)
	cmd["type"] = "coronate"
	return Commands.apply(sim, cmd)


# ---- the kingdom -------------------------------------------------------------------------------

func test_kingdom_exists_from_the_start_and_allegiance_is_separate() -> void:
	var sim := NewGame.create(1)
	var k := Kingdoms.player(sim)
	check(not k["crowned"], "not crowned")
	check(sim.settlers.all(func(s: Settler) -> bool: return s.kingdom_id == int(k["id"])), "everyone belongs")
	sim.reached.append("hamlet")
	sim.reached.append("village")
	var x := 0
	while x >= -60:
		sim.world.reveal(x, 0, 10)
		x -= 4
	sim.load_nav_area(0, 0)
	var hall := RealmHelpers.instant(sim, "waystation", Vector2i(-40, 0))
	Commands.apply(sim, {"type": "assignSettlement", "ids": [sim.settlers[0].id], "settlementId": hall.id})
	check_eq(sim.settlers[0].kingdom_id, int(k["id"]), "same kingdom")
	check_eq(sim.settlers[0].settlement_id, hall.id, "new settlement")


func test_coronation_is_explicit_once_and_checked() -> void:
	var sim := _region_ready()
	check(str(_coronate(sim)["message"]).contains("Region"), "needs Region")
	sim.reached.append("region")
	for bad: Dictionary in [{"rulerName": ""}, {"kingdomName": "x".repeat(60)}, {"banner": {"color": "red; drop table", "emblem": "oak"}}, {"banner": {"color": "#3a6ea5", "emblem": "skull-and-bones"}}]:
		var id := IDENTITY.duplicate(true)
		id.merge(bad, true)
		check(not bool(_coronate(sim, id)["ok"]), "refused: %s" % bad)
	var res := _coronate(sim)
	check(bool(res["ok"]), "crowned: %s" % res["message"])
	var k := Kingdoms.player(sim)
	check(k["crowned"], "crowned flag")
	check_eq(k["ruler"]["name"], "Queen Alder", "ruler")
	check_eq(k["name"], "Alderholt", "kingdom name")
	check((k["homeland"] as Array).size() > 0, "homeland set")
	check(str(_coronate(sim)["message"]).contains("already"), "only once")
	check(sim.chronicle.any(func(c: Dictionary) -> bool: return str(c["text"]).to_lower().contains("crowned")), "chronicled")
	check_eq(Kingdoms.player(RealmHelpers.reload_sim(sim))["ruler"]["name"], "Queen Alder", "kept on reload")


func test_taxes_apply_only_to_trade_that_happens() -> void:
	var sim := _region_ready(3131)
	sim.reached.append("region")
	SimHelpers.camp(sim).inventory = {"food": 100, "tools": 20, "wood": 40}
	RealmHelpers.instant(sim, "storehouse", Vector2i(-8, -8))
	RealmHelpers.instant(sim, "inn", Vector2i(6, -6))
	check(bool(Commands.apply(sim, {"type": "setPolicy", "policy": "modest"})["ok"]), "policy set")
	var k := Kingdoms.player(sim)
	SimHelpers.run(sim, Defs.DAY_TICKS)
	check_eq(float(k["treasury"]), 0.0, "no trade, no tax")
	check(SimHelpers.run_until(sim, func() -> bool: return sim.parties.any(func(p: Dictionary) -> bool: return p["state"] == "lodging"), Defs.DAY_TICKS * 5) >= 0, "a merchant lodges")
	var p: Dictionary = sim.parties.filter(func(q: Dictionary) -> bool: return q["state"] == "lodging")[0]
	var purse := int(p["coins"])
	var res := Commands.apply(sim, {"type": "barter", "partyId": p["id"], "give": {"tools": 5}, "take": {}, "coins": -20})
	check(bool(res["ok"]), "sold tools: %s" % res["message"])
	var tax := floori(20 * float(Kingdoms.policy("modest")["tradeTax"]))
	check_eq(float(k["treasury"]), float(20 + tax), "treasury")
	check_eq(int(p["coins"]), purse - 20 - tax, "merchant's purse")
	check_eq(float(k["taxCollected"]), float(tax), "tax collected")
	var first: String = (p["stock"] as Dictionary).keys()[0]
	check(not bool(Commands.apply(sim, {"type": "barter", "partyId": p["id"], "give": {}, "take": {first: 1}, "coins": 10000})["ok"]), "no coins beyond the treasury")


func test_policies_move_trust_and_low_trust_turns_settlers_away() -> void:
	var sim := _region_ready()
	var k := Kingdoms.player(sim)
	var t0 := float(k["trust"])
	Commands.apply(sim, {"type": "setPolicy", "policy": "high"})
	var d0 := sim.day()
	SimHelpers.run_until(sim, func() -> bool: return sim.day() == d0 + 2, Defs.DAY_TICKS * 3)
	SimHelpers.run(sim, 1)
	var high := float(Kingdoms.policy("high")["trustPerDay"])
	check_eq(float(k["trust"]), t0 + 2 * high, "two days of high tax")
	Commands.apply(sim, {"type": "setPolicy", "policy": "none"})
	SimHelpers.run_until(sim, func() -> bool: return sim.day() == d0 + 3, Defs.DAY_TICKS * 2)
	SimHelpers.run(sim, 1)
	check_eq(float(k["trust"]), t0 + 2 * high + float(Kingdoms.policy("none")["trustPerDay"]), "then a day of none")
	k["trust"] = 10
	SimHelpers.camp(sim).inventory["food"] = 200
	RealmHelpers.instant(sim, "house", Vector2i(5, -5))
	SimHelpers.run_until(sim, func() -> bool: return not sim.offer.is_empty(), Defs.DAY_TICKS)
	if check(not sim.offer.is_empty(), "a visitor came"):
		var m := str(Commands.apply(sim, {"type": "acceptRecruit", "offerId": sim.offer["id"], "settlementId": sim.settlements[0]["id"]})["message"]).to_lower()
		check(m.contains("trust") or m.contains("tax"), "turned away: %s" % m)
	check(not bool(Commands.apply(sim, {"type": "setPolicy", "policy": "crushing"})["ok"]), "unknown policy")


func test_council_posts_take_adults_off_work() -> void:
	var sim := _region_ready()
	var s := sim.settlers[0]
	check(bool(Commands.apply(sim, {"type": "appointCouncil", "post": "steward", "settlerId": s.id})["ok"]), "appointed")
	check_eq(int(Kingdoms.player(sim)["council"]["steward"]), s.id, "steward")
	SimHelpers.run(sim, 100)
	check(s.task == null or not [Task.BUILD, Task.HAUL, Task.FARM, Task.GATHER, Task.CRAFT].has(s.task.kind), "no ordinary work")
	check(s.idle_reason.to_lower().contains("council") or s.idle_reason.to_lower().contains("steward"), "says so: %s" % s.idle_reason)
	var kid := sim.add_settler(0, 2, "laborer")
	kid.life_stage = "child"
	check(str(Commands.apply(sim, {"type": "appointCouncil", "post": "envoy", "settlerId": kid.id})["message"]).to_lower().contains("child"), "no children")
	check(bool(Commands.apply(sim, {"type": "appointCouncil", "post": "steward", "settlerId": null})["ok"]), "cleared")
	check(Kingdoms.player(sim)["council"]["steward"] == null, "empty post")


# ---- territory --------------------------------------------------------------------------------

func _crowned(seed_value: int = 5050, before: Callable = Callable()) -> Simulation:
	var sim := NewGame.create(seed_value)
	for m: String in ["hamlet", "village", "town", "region"]:
		sim.reached.append(m)
	if before.is_valid():
		before.call(sim)
	var res := _coronate(sim, {"rulerName": "King Ash", "kingdomName": "Ashvale", "banner": {"color": "#a53a3a", "emblem": "wheat"}})
	check(bool(res["ok"]), "crowned: %s" % res["message"])
	Kingdoms.player(sim)["treasury"] = 500
	return sim


func test_sectors_handle_negative_corners() -> void:
	check_eq(Territory.sector_of(0, 0), Vector2i(0, 0), "origin")
	check_eq(Territory.sector_of(-1, -1), Vector2i(-1, -1), "just negative")
	check_eq(Territory.sector_of(15, 16), Vector2i(0, 1), "edges")
	check_eq(Territory.sector_of(-16, -17), Vector2i(-1, -2), "negative edges")


func test_homeland_is_frozen_at_coronation() -> void:
	var sim := _crowned(5050, func(s: Simulation) -> void:
		s.world.reveal(90, 90, 3)
		BuildingOps.place(s, "field", 90, 90)
		var far := Territory.sector_of(90, 90)
		check(Territory.homeland_preview(s).any(func(q: Dictionary) -> bool: return int(q["x"]) == far.x and int(q["y"]) == far.y), "previewed"))
	var k := Kingdoms.player(sim)
	var home := {}
	for q: Dictionary in k["homeland"]:
		home["%d,%d" % [q["x"], q["y"]]] = true
	check(home.has("0,0") and home.has("-2,-2"), "starting chunks")
	var far := Territory.sector_of(90, 90)
	check(home.has("%d,%d" % [far.x, far.y]), "the far field's sector")
	var before := (k["homeland"] as Array).size()
	sim.world.reveal(-150, 10, 3)
	BuildingOps.place(sim, "field", -150, 10)
	check_eq((Kingdoms.player(sim)["homeland"] as Array).size(), before, "never grows")
	check(Territory.owner_of(sim, Territory.sector_of(-150, 10)).is_empty(), "the new field's land is not owned")
	check_eq(JSON.stringify(Kingdoms.player(RealmHelpers.reload_sim(sim))["homeland"]), JSON.stringify(k["homeland"]), "kept on reload")


func test_frontier_claims_preview_and_rules() -> void:
	var sim := _crowned()
	var edge := Vector2i(4, 0)
	var p := Territory.claim_preview(sim, edge)
	check_eq(p["problem"], "", "claimable")
	check(int(p["cost"]) > 0 and bool(p["supplied"]) and not p["protectedHomeland"], "preview")
	var coins := float(Kingdoms.player(sim)["treasury"])
	check(bool(Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": 4, "y": 0}})["ok"]), "claimed")
	check_eq(float(Kingdoms.player(sim)["treasury"]), coins - int(p["cost"]), "paid")
	check_eq(int(Territory.owner_of(sim, edge)["legalOwner"]), 0, "ours")
	var far := str(Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": 20, "y": 20}})["message"]).to_lower()
	check(far.contains("touch") or far.contains("supplied"), "must touch: %s" % far)
	check(str(Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": 4, "y": 0}})["message"]).to_lower().contains("already"), "already ours")
	var home := str(Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": 0, "y": 0}})["message"]).to_lower()
	check(home.contains("homeland") or home.contains("already"), "homeland: %s" % home)


func test_conflict_setting_locks_after_first_claim() -> void:
	var sim := _crowned()
	check(bool(Commands.apply(sim, {"type": "setConflictMode", "mode": "full-conquest"})["ok"]), "set")
	check(bool(Commands.apply(sim, {"type": "setConflictMode", "mode": "protected-frontier"})["ok"]), "set back")
	Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": 4, "y": 0}})
	check(str(Commands.apply(sim, {"type": "setConflictMode", "mode": "full-conquest"})["message"]).to_lower().contains("locked"), "locked")
	check_eq(Kingdoms.player(sim)["conflictMode"], "protected-frontier", "unchanged")


func test_frontier_hostility_needs_civilization() -> void:
	var sim := _crowned()
	check(str(Commands.apply(sim, {"type": "activateFrontier"})["message"]).contains("Civilization"), "needs Civilization")
	sim.reached.append("civilization")
	check(bool(Commands.apply(sim, {"type": "activateFrontier"})["ok"]), "opened")
	check(Kingdoms.player(sim)["frontierActive"], "flag")


func test_known_towns_are_kingdoms_with_their_own_land() -> void:
	var sim := _crowned()
	var town: Dictionary = Regions.nearby_towns(sim.seed_value)[0]
	var rival := Kingdoms.know_of(sim, int(town["id"]))
	check(not rival["player"], "a rival")
	var sec := Territory.sector_of(float(town["x"]), float(town["y"]))
	check_eq(int(Territory.owner_of(sim, sec)["legalOwner"]), int(rival["id"]), "their land")
	check(Territory.owner_of(sim, sec)["protectedHomeland"], "protected")
	sim.world.ensure(int(town["x"]) >> Chunk.SHIFT, int(town["y"]) >> Chunk.SHIFT)
	sim.world.reveal(float(town["x"]), float(town["y"]), 4)
	var pc := BuildingOps.check_placement(sim, "field", int(town["x"]), int(town["y"]))
	check(not bool(pc["ok"]) and str(pc["reason"]).contains(str(rival["name"])), "no building there: %s" % pc["reason"])
	var pr := str(Territory.claim_preview(sim, sec)["problem"]).to_lower()
	check(pr.contains("belongs") or pr.contains("protected"), "no claiming: %s" % pr)


func test_armed_entry_needs_permission() -> void:
	var sim := _crowned()
	var town: Dictionary = Regions.nearby_towns(sim.seed_value)[0]
	var rival := Kingdoms.know_of(sim, int(town["id"]))
	var sec := Territory.sector_of(float(town["x"]), float(town["y"]))
	check(Territory.can_enter(sim, 0, sec, false)["allowed"], "civilians pass")
	var armed := Territory.can_enter(sim, 0, sec, true)
	check(not armed["allowed"], "armed refused: %s" % armed["reason"])
	check(not Territory.can_enter(sim, int(rival["id"]), Vector2i(0, 0), true)["allowed"], "not into our homeland either")
	check(Territory.can_enter(sim, 0, Vector2i(30, -30), true)["allowed"], "wild land open")


func test_full_conquest_lifts_homeland_immunity() -> void:
	var sim := _crowned()
	Commands.apply(sim, {"type": "setConflictMode", "mode": "full-conquest"})
	var town: Dictionary = Regions.nearby_towns(sim.seed_value)[0]
	Kingdoms.know_of(sim, int(town["id"]))
	check(not Territory.owner_of(sim, Territory.sector_of(float(town["x"]), float(town["y"])))["protectedHomeland"], "not immune")


# ---- news --------------------------------------------------------------------------------------

func test_a_queued_report_is_not_knowledge_until_it_arrives() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var ev := News.record_event(sim, "military-buildup", a, 3, null)
	News.record_observation(sim, 0, a, "military-buildup", null, {"eventId": ev["id"], "certainty": "observed", "source": "scout", "delay": 200})
	News.deliver_reports(sim)
	check_eq(News.knowledge_of(sim, 0).size(), 0, "not yet")
	SimHelpers.run(sim, 210)
	var k := News.knowledge_of(sim, 0)
	check_eq(k.size(), 1, "arrived")
	if k.size() == 1:
		check(int(k[0]["subjectKingdomId"]) == a and k[0]["certainty"] == "observed" and k[0]["sourceKind"] == "scout" and int(k[0]["eventId"]) == int(ev["id"]), "its details")
		check(int(k[0]["arrivalTick"]) > int(k[0]["observedTick"]), "arrived later")


func test_late_reports_never_overwrite_newer_knowledge() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var old := News.record_event(sim, "military-buildup", a, 2, null)
	SimHelpers.run(sim, 50)
	var fresh := News.record_event(sim, "military-buildup", a, 6, null)
	News.record_observation(sim, 0, a, "military-buildup", null, {"eventId": fresh["id"], "certainty": "observed", "source": "scout", "delay": 10})
	News.record_observation(sim, 0, a, "military-buildup", null, {"eventId": old["id"], "certainty": "observed", "source": "merchant-letter", "delay": 300})
	News.record_observation(sim, 0, a, "military-buildup", null, {"eventId": fresh["id"], "certainty": "observed", "source": "scout", "delay": 20})
	SimHelpers.run(sim, 320)
	check_eq(News.knowledge_of(sim, 0).filter(func(x: Dictionary) -> bool: return int(x["eventId"]) == int(fresh["id"])).size(), 1, "no duplicate")
	check_eq(float(News.latest_about(sim, 0, a, "military-buildup")["magnitude"]), 6.0, "the newest stands")


func test_confirmed_report_corrects_a_rumour() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var ev := News.record_event(sim, "military-buildup", a, 4, null)
	var rumour := News.record_observation(sim, 0, a, "military-buildup", null, {"eventId": ev["id"], "certainty": "rumor", "source": "merchant", "delay": 0, "magnitude": 9})
	News.deliver_reports(sim)
	check_eq(float(News.latest_about(sim, 0, a, "military-buildup")["magnitude"]), 9.0, "the rumour first")
	var conf := News.record_observation(sim, 0, a, "military-buildup", null, {"eventId": ev["id"], "certainty": "confirmed", "source": "envoy", "delay": 0})
	News.deliver_reports(sim)
	var now := News.latest_about(sim, 0, a, "military-buildup")
	check_eq(int(now["id"]), conf, "confirmed now")
	check_eq(int(now["supersedes"]), rumour, "replaces the rumour")
	check_eq(float(now["magnitude"]), 4.0, "true size")


func test_relayed_reports_keep_the_original_event() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var b := int(r["b"]["id"])
	var ev := News.record_event(sim, "military-buildup", b, 5, null)
	var r1 := News.record_observation(sim, a, b, "military-buildup", null, {"eventId": ev["id"], "certainty": "observed", "source": "scout", "delay": 0})
	News.deliver_reports(sim)
	News.relay(sim, r1, 0, 30)
	SimHelpers.run(sim, 40)
	var mine: Dictionary = News.knowledge_of(sim, 0).filter(func(x: Dictionary) -> bool: return int(x["eventId"]) == int(ev["id"]))[0]
	News.relay(sim, int(mine["id"]), a, 0)
	News.deliver_reports(sim)
	check_eq(News.knowledge_of(sim, a).filter(func(x: Dictionary) -> bool: return int(x["eventId"]) == int(ev["id"])).size(), 1, "no second copy")
	check_eq(int(mine["sourceKingdomId"]), a, "source kept")
	check((mine["relayedBy"] as Array).has(a), "chain kept")


func test_merchant_news_waits_for_a_merchant() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var ev := News.record_event(sim, "prosperity", a, 1, null)
	News.record_observation(sim, 0, a, "prosperity", null, {"eventId": ev["id"], "certainty": "rumor", "source": "merchant", "delay": null})
	SimHelpers.run(sim, Defs.DAY_TICKS * 3)
	check_eq(News.knowledge_of(sim, 0).size(), 0, "no inn, no news")
	check(sim.reports.any(func(x: Dictionary) -> bool: return not x["delivered"]), "still waiting")


func test_report_on_its_way_survives_a_reload() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var ev := News.record_event(sim, "claim", a, 1, Vector2i(9, 9))
	News.record_observation(sim, 0, a, "claim", Vector2i(9, 9), {"eventId": ev["id"], "certainty": "observed", "source": "scout", "delay": 300})
	var loaded := RealmHelpers.reload_sim(sim)
	SimHelpers.run_until(loaded, func() -> bool: return not News.knowledge_of(loaded, 0).is_empty(), 400)
	SimHelpers.run(loaded, 100)
	check_eq(News.knowledge_of(loaded, 0).size(), 1, "arrived once")


func test_news_never_reveals_fog_and_inboxes_stay_bounded() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var explored := sim.world.explored_tile_count()
	var limit := int(Content.get_value("treaties", "INBOX_LIMIT"))
	for i in limit + 25:
		var loc: Variant = Vector2i(40 + i, -40) if i % 2 == 1 else null
		var ev := News.record_event(sim, "military-buildup", a, 1, loc)
		News.record_observation(sim, 0, a, "military-buildup", loc, {"eventId": ev["id"], "certainty": "rumor", "source": "merchant", "delay": 0})
	News.deliver_reports(sim)
	check_eq(sim.world.explored_tile_count(), explored, "no fog lifted")
	check(News.knowledge_of(sim, 0).size() <= limit, "bounded")
	check(int(sim.news_summaries.get(0, 0)) > 0, "the rest summarised")
	check(News.knowledge_of(sim, 0).any(func(x: Dictionary) -> bool: return x["location"] == null), "places stay unknown")
