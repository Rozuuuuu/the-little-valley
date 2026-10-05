extends TestCase
## Treaties, incidents and concern, ported from tests/diplomacy.test.ts and tests/concern.test.ts
## (same seeds and scenarios).


func _coins_held(sim: Simulation) -> float:
	var n := 0.0
	for k: Dictionary in sim.kingdoms:
		n += float(k["treasury"])
	for o: Dictionary in sim.offers:
		n += float(o["escrow"])
	for c: Dictionary in sim.commitments:
		n += float(c["escrow"])
	return n


func _answer(sim: Simulation, offer_id: int) -> Dictionary:
	SimHelpers.run_until(sim, func() -> bool: return Diplomacy.find_offer(sim, offer_id)["state"] != "proposed", Defs.DAY_TICKS * 3)
	return Diplomacy.find_offer(sim, offer_id)


func _respond(sim: Simulation, offer: Dictionary, accept: bool) -> Dictionary:
	return Commands.apply(sim, {"type": "respondToOffer", "offerId": offer["id"], "accept": accept})


# ---- treaties ----------------------------------------------------------------------------------

func test_proposing_needs_crown_and_envoy_and_escrows_payment() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var k := Kingdoms.player(sim)
	var total := _coins_held(sim)
	var res := Commands.apply(sim, {"type": "proposeTreaty", "kind": "trade", "to": a, "terms": {"durationDays": 8, "payment": 30}})
	check(bool(res["ok"]), "proposed: %s" % res["message"])
	check_eq(float(k["treasury"]), 370.0, "payment held")
	check_eq(_coins_held(sim), total, "no coins created")
	var o := _answer(sim, int(res["id"]))
	check(["active", "rejected"].has(o["state"]), "answered: %s" % o["state"])
	check(not (o["reasons"] as Array).is_empty(), "with reasons")
	check_eq(_coins_held(sim), total, "still no coins created")
	if o["state"] == "rejected":
		check_eq(float(k["treasury"]), 400.0, "refunded")
	else:
		check(not Diplomacy.active_treaty(sim, 0, a, "trade").is_empty(), "signed")
	Commands.apply(sim, {"type": "appointCouncil", "post": "envoy", "settlerId": null})
	check(str(Commands.apply(sim, {"type": "proposeTreaty", "kind": "passage", "to": a, "terms": {"durationDays": 4}})["message"]).to_lower().contains("envoy"), "needs an envoy")


func test_same_offer_twice_refused_and_expired_cannot_be_accepted() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	check(bool(Commands.apply(sim, {"type": "proposeTreaty", "kind": "nonAggression", "to": a, "terms": {"durationDays": 8}})["ok"]), "first")
	check(str(Commands.apply(sim, {"type": "proposeTreaty", "kind": "nonAggression", "to": a, "terms": {"durationDays": 8}})["message"]).to_lower().contains("already"), "second refused")
	var offer := Diplomacy.make_offer(sim, a, 0, "trade", {"durationDays": 6, "payment": 0}, 50)
	SimHelpers.run(sim, 60)
	check_eq(offer["state"], "expired", "expired")
	var m := str(_respond(sim, offer, true)["message"]).to_lower()
	check(m.contains("expired") or m.contains("no longer"), "can't accept: %s" % m)


func test_refusing_an_alliance_makes_no_enemy() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var offer := Diplomacy.make_offer(sim, a, 0, "defensiveAlliance", {"durationDays": 16, "payment": 0}, Defs.DAY_TICKS)
	check(bool(_respond(sim, offer, false)["ok"]), "declined")
	check_eq(Diplomacy.stance_of(sim, 0, a), "neutral", "still neutral")
	check_eq(offer["state"], "rejected", "rejected")


func test_incompatible_promises_are_refused() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var b := int(r["b"]["id"])
	Diplomacy.set_war(sim, a, b, true)
	Diplomacy.set_stance_direct(sim, 0, a, "ally")
	var res := Commands.apply(sim, {"type": "proposeTreaty", "kind": "defensiveAlliance", "to": b, "terms": {"durationDays": 16}})
	check(not bool(res["ok"]), "refused")
	var m := str(res["message"]).to_lower()
	check(m.contains("at war") or m.contains("ally"), "says why: %s" % m)


func test_passage_opens_frontier_not_the_core() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a: Dictionary = r["a"]
	var offer := Diplomacy.make_offer(sim, int(a["id"]), 0, "passage", {"durationDays": 8, "payment": 0}, Defs.DAY_TICKS)
	check(bool(_respond(sim, offer, true)["ok"]), "signed")
	check_eq(offer["state"], "active", "active")
	var cap := Territory.sector_of(float(a["capital"]["x"]), float(a["capital"]["y"]))
	check(Territory.can_enter(sim, 0, cap + Vector2i(2, 0), true)["allowed"], "frontier open")
	check(not Territory.can_enter(sim, 0, cap, true)["allowed"], "core closed")


func test_ending_a_treaty_early_is_a_breach_others_hear_of() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var offer := Diplomacy.make_offer(sim, a, 0, "nonAggression", {"durationDays": 16, "payment": 0}, Defs.DAY_TICKS)
	_respond(sim, offer, true)
	var t0 := Diplomacy.trust_of(sim, a, 0)
	check(bool(Commands.apply(sim, {"type": "cancelTreaty", "offerId": offer["id"]})["ok"]), "ended")
	check_eq(offer["state"], "breached", "breached")
	check(Diplomacy.trust_of(sim, a, 0) < t0, "trust fell")
	SimHelpers.run(sim, Defs.DAY_TICKS * 2)
	check(News.knowledge_of(sim, a).any(func(x: Dictionary) -> bool: return x["kind"] == "treaty-broken" and int(x["subjectKingdomId"]) == 0), "they heard")


func test_treaties_run_their_course_across_a_reload() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var offer := Diplomacy.make_offer(sim, a, 0, "trade", {"durationDays": 1, "payment": 0}, Defs.DAY_TICKS)
	_respond(sim, offer, true)
	var loaded := RealmHelpers.reload_sim(sim)
	check_eq(Diplomacy.find_offer(loaded, offer["id"])["state"], "active", "active after reload")
	SimHelpers.run(loaded, Defs.DAY_TICKS + 60)
	check_eq(Diplomacy.find_offer(loaded, offer["id"])["state"], "fulfilled", "fulfilled")
	check(Diplomacy.active_treaty(loaded, 0, a, "trade").is_empty(), "no longer active")


func test_border_incidents_differ_and_talks_settle_a_first_intrusion() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var civ := Diplomacy.open_incident(sim, "civilianPassage", a, 0, Vector2i(4, 0))
	var arm := Diplomacy.open_incident(sim, "armedPassage", a, 0, Vector2i(4, 0))
	check(civ["kind"] != arm["kind"], "different kinds")
	check_eq(Diplomacy.open_incident(sim, "hostileAttack", a, 0, Vector2i(4, 0))["state"], "refused", "no attack outside war")
	check(bool(Commands.apply(sim, {"type": "respondToIncident", "incidentId": arm["id"], "response": "askWithdraw"})["ok"]), "asked")
	check_eq(arm["state"], "withdrawn", "they withdrew")
	check(Diplomacy.stance_of(sim, 0, a) != "enemy", "no enemy")


# ---- concern ------------------------------------------------------------------------------------

func _observe(sim: Simulation, observer: int, subject: int, kind: String, magnitude: float, certainty: String, source: String, delay: Variant, loc: Variant = null) -> void:
	var ev := News.record_event(sim, kind, subject, magnitude, loc)
	News.record_observation(sim, observer, subject, kind, loc, {"eventId": ev["id"], "certainty": certainty, "source": source, "delay": delay})


func test_unseen_forces_raise_no_concern_until_reported() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var before := int(Concern.evaluate(sim, a, 0)["score"])
	var ev := News.record_event(sim, "border-forces", 0, 6, Vector2i(5, 0))
	check_eq(int(Concern.evaluate(sim, a, 0)["score"]), before, "unseen")
	News.record_observation(sim, a, 0, "border-forces", Vector2i(5, 0), {"eventId": ev["id"], "certainty": "observed", "source": "border", "delay": Defs.DAY_TICKS})
	check_eq(int(Concern.evaluate(sim, a, 0)["score"]), before, "not arrived")
	SimHelpers.run(sim, Defs.DAY_TICKS + 10)
	var after := Concern.evaluate(sim, a, 0)
	check(int(after["score"]) > before, "concerned now")
	var why := " ".join(PackedStringArray(after["reasons"])).to_lower()
	check(why.contains("troops") or why.contains("soldiers"), "reasons: %s" % why)


func test_prosperity_alone_never_goes_past_watchful() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	for i in 12:
		_observe(sim, a, 0, "prosperity", 10, "confirmed", "envoy", 0)
	News.deliver_reports(sim)
	var c := Concern.evaluate(sim, a, 0)
	check(int(c["score"]) < 50, "score %d" % int(c["score"]))
	check(["calm", "watchful"].has(c["band"]), "band %s" % c["band"])


func test_a_rumour_cannot_prove_aggression() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	for kind: String in ["conquest", "treaty-broken"]:
		_observe(sim, a, 0, kind, 1, "rumor", "merchant", 0)
	News.deliver_reports(sim)
	var c := Concern.evaluate(sim, a, 0)
	var why := " ".join(PackedStringArray(c["reasons"])).to_lower()
	check(not why.contains("conquer") and not why.contains("broke"), "no proof: %s" % why)
	check(c["band"] == "calm" or c["band"] == "watchful", "calm or watchful")


func test_one_warning_with_choices_and_band_hysteresis() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	for i in 3:
		_observe(sim, a, 0, "border-forces", 8, "confirmed", "border", 0, Vector2i(4, 0))
	News.deliver_reports(sim)
	Concern.update(sim, true)
	Concern.update(sim, true)
	var warns := sim.warnings.filter(func(w: Dictionary) -> bool: return int(w["from"]) == a)
	check_eq(warns.size(), 1, "exactly one warning")
	if warns.is_empty():
		return
	check(not (warns[0]["reasons"] as Array).is_empty(), "with reasons")
	check_eq(warns[0]["actions"], ["reassure", "investigate", "negotiate", "propose-pact", "prepare", "dismiss"], "choices")
	var key := "%d>0" % a
	var st: Dictionary = sim.concern_states[key]
	var entered: String = st["band"]
	check(["concerned", "alarmed"].has(entered), "entered %s" % entered)
	st["score"] = int(st["score"]) - 5
	Concern.update(sim, true)
	check_eq(sim.concern_states[key]["band"], entered, "the band holds")


func test_a_broken_reassurance_costs_more_than_it_gained() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	for i in 3:
		_observe(sim, a, 0, "border-forces", 8, "confirmed", "border", 0, Vector2i(4, 0))
	News.deliver_reports(sim)
	Concern.update(sim, true)
	var w: Dictionary = sim.warnings.filter(func(x: Dictionary) -> bool: return int(x["from"]) == a)[0]
	var t0 := Diplomacy.trust_of(sim, a, 0)
	check(bool(Commands.apply(sim, {"type": "respondToWarning", "warningId": w["id"], "action": "reassure"})["ok"]), "reassured")
	check(Diplomacy.trust_of(sim, a, 0) > t0, "trust rose")
	_observe(sim, a, 0, "border-forces", 9, "confirmed", "border", 0, Vector2i(4, 0))
	News.deliver_reports(sim)
	Concern.update(sim, true)
	check(Diplomacy.trust_of(sim, a, 0) < t0, "now lower than before")
	check(str(Commands.apply(sim, {"type": "respondToWarning", "warningId": w["id"], "action": "reassure"})["message"]).to_lower().contains("already"), "answered once")


func test_an_ally_growing_stronger_is_less_alarming() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var b := int(r["b"]["id"])
	Diplomacy.set_stance_direct(sim, 0, a, "ally")
	for k: int in [a, b]:
		_observe(sim, 0, k, "military-buildup", 8, "confirmed", "envoy", 0)
	News.deliver_reports(sim)
	check(int(Concern.evaluate(sim, 0, a)["score"]) < int(Concern.evaluate(sim, 0, b)["score"]), "ally less alarming")


func test_ai_kingdoms_watch_each_other() -> void:
	var r := RealmHelpers.realm()
	var sim: Simulation = r["sim"]
	var a := int(r["a"]["id"])
	var b := int(r["b"]["id"])
	for i in 3:
		_observe(sim, a, b, "border-forces", 8, "confirmed", "scout", 0)
	News.deliver_reports(sim)
	Concern.update(sim, true)
	check(["concerned", "alarmed"].has(sim.concern_states["%d>%d" % [a, b]]["band"]), "concerned")
	check_eq(sim.warnings.filter(func(w: Dictionary) -> bool: return int(w["to"]) == b).size(), 0, "the player hears nothing")
