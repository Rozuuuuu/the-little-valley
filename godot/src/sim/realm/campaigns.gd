class_name Campaigns
## The war council (src/game/sim/campaigns.ts). A war plan is private drafting: nobody hears of it
## until an ally is asked. Allies answer requests for support with their reasons — accept,
## counter-offer or refuse — and an identical request gets the same answer rather than a new roll.
## Accepting escrows the fee and reserves the ally's real companies (never the same ones twice,
## never their last company).
##
## Plans: {id, target, objective, createdTick, state, staging}. Commitments: the browser's
## CoalitionCommitment shape.


static func find_plan(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is int or id is float):
		return {}
	for p: Dictionary in sim.war_plans:
		if int(p["id"]) == int(id):
			return p
	return {}


static func find_commitment(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is int or id is float):
		return {}
	for c: Dictionary in sim.commitments:
		if int(c["id"]) == int(id):
			return c
	return {}


static func _available(k: Dictionary) -> Array:
	return (k["companies"] as Array).filter(func(c: Dictionary) -> bool: return c["pledgedTo"] == null)


## Companies an ally could spare: all at home but its defence reserve.
static func spare_companies(sim: Simulation, ally_id: int) -> int:
	var k := Kingdoms.by_id(sim, ally_id)
	return maxi(0, _available(k).size() - int(Content.get_value("treaties", "DEFENCE_RESERVE"))) if not k.is_empty() else 0


static func create_plan(sim: Simulation, target: Variant, objective: Variant) -> Dictionary:
	if not Kingdoms.player(sim)["crowned"]:
		return {"ok": false, "message": "Only a crowned ruler can plan a war"}
	var t := Kingdoms.by_id(sim, int(target)) if (target is int or target is float) else {}
	if t.is_empty() or t["player"]:
		return {"ok": false, "message": "Choose a kingdom you know of"}
	if objective != "raid" and objective != "capture" and objective != "defend":
		return {"ok": false, "message": "Choose a limited objective: raid, capture frontier land, or defend"}
	var plan := {"id": sim.alloc_id(), "target": int(t["id"]), "objective": objective, "createdTick": sim.tick, "state": "drafting", "staging": null}
	sim.war_plans.append(plan)
	return {"ok": true, "id": plan["id"], "message": "A private plan against %s. Nobody else knows until you ask an ally." % t["name"]}


static func _valid_rewards(sim: Simulation, plan: Dictionary, rewards: Array, for_ally: int) -> String:
	var tname := Kingdoms.name_of(sim, int(plan["target"]))
	for s: Variant in rewards:
		if not (s is Dictionary) or not ((s as Dictionary).get("x") is int or (s as Dictionary).get("x") is float):
			return "Invalid land"
		var sec := Vector2i(int(s["x"]), int(s["y"]))
		var o := Territory.owner_of(sim, sec)
		if o.is_empty() or int(o["legalOwner"]) != int(plan["target"]):
			return "That land does not belong to %s, the target" % tname
		if o["protectedHomeland"]:
			return "That is %s's protected homeland — it can't be promised" % tname
		for c: Dictionary in sim.commitments:
			if int(c["contributor"]) == for_ally or ["refused", "expired", "cancelled"].has(c["state"]):
				continue
			for q: Dictionary in c["terms"]["rewardSectors"]:
				if int(q["x"]) == sec.x and int(q["y"]) == sec.y:
					return "That land is already promised to %s" % Kingdoms.name_of(sim, int(c["contributor"]), "?")
	return ""


static func _same_request(a: Dictionary, b: Dictionary) -> bool:
	for k: String in ["companies", "coinFee", "supplyPayer", "serviceDays", "commandRights", "reciprocalDefenseDays", "unit"]:
		if str(a.get(k)) != str(b.get(k)):
			return false
	var ra: Array = (a.get("rewardSectors", []) as Array).map(func(s: Dictionary) -> String: return "%d,%d" % [int(s["x"]), int(s["y"])])
	var rb: Array = (b.get("rewardSectors", []) as Array).map(func(s: Dictionary) -> String: return "%d,%d" % [int(s["x"]), int(s["y"])])
	return ra == rb


static func _int_ok(v: Variant, minimum: int) -> bool:
	return (v is int or v is float) and float(v) == floorf(float(v)) and int(v) >= minimum


static func request_support(sim: Simulation, plan_id: Variant, ally_id: Variant, terms_raw: Variant) -> Dictionary:
	var plan := find_plan(sim, plan_id)
	if plan.is_empty() or plan["state"] != "drafting":
		return {"ok": false, "message": "That war plan is not open"}
	var ally := Kingdoms.by_id(sim, int(ally_id)) if (ally_id is int or ally_id is float) else {}
	if ally.is_empty() or ally["player"] or int(ally["id"]) == int(plan["target"]):
		return {"ok": false, "message": "Choose another kingdom to ask"}
	var aid := int(ally["id"])
	var me := Kingdoms.player(sim)
	if me["council"]["envoy"] == null:
		return {"ok": false, "message": "Appoint an %s to carry the request" % Kingdoms.value("COUNCIL_POSTS")["envoy"]["name"]}
	if Diplomacy.at_war(sim, aid, 0):
		return {"ok": false, "message": "You are at war with %s" % ally["name"]}
	var t: Dictionary = terms_raw if terms_raw is Dictionary else {}
	if not _int_ok(t.get("companies"), 1) or not _int_ok(t.get("coinFee"), 0) or not _int_ok(t.get("serviceDays"), 1):
		return {"ok": false, "message": "Invalid terms"}
	if not ["requester", "contributor", "shared"].has(t.get("supplyPayer")) or not ["coordinated", "delegated"].has(t.get("commandRights")):
		return {"ok": false, "message": "Invalid terms"}
	var rewards: Array = t.get("rewardSectors", []) if t.get("rewardSectors") is Array else []
	var bad := _valid_rewards(sim, plan, rewards, aid)
	if bad != "":
		return {"ok": false, "message": bad}
	if int(t["coinFee"]) > float(me["treasury"]):
		return {"ok": false, "message": "The treasury holds only %d coins" % int(me["treasury"])}
	var spare := spare_companies(sim, aid)
	if int(t["companies"]) > spare:
		return {"ok": false, "message": "%s can spare only %d %s — the rest are already pledged or its defence reserve" % [ally["name"], spare, "company" if spare == 1 else "companies"]}
	var clean_rewards: Array = rewards.map(func(s: Dictionary) -> Dictionary: return {"x": int(s["x"]), "y": int(s["y"])})
	var requested := {"companies": int(t["companies"]), "coinFee": int(t["coinFee"]), "supplyPayer": t["supplyPayer"], "serviceDays": int(t["serviceDays"]),
		"commandRights": t["commandRights"], "rewardSectors": clean_rewards, "reciprocalDefenseDays": int(t.get("reciprocalDefenseDays", 0))}
	if t.get("unit") != null:
		requested["unit"] = t["unit"]
	for c: Dictionary in sim.commitments:
		if int(c["campaignId"]) != int(plan["id"]) or int(c["contributor"]) != aid:
			continue
		if _same_request(c["requested"], requested):
			return {"ok": false, "message": "You already asked %s with these same terms — change the terms to ask again" % ally["name"]}
		if c["state"] == "proposed":
			return {"ok": false, "message": "%s has not answered your last request yet" % ally["name"]}
	var payer: String = t["supplyPayer"]
	var c := {"id": sim.alloc_id(), "campaignId": plan["id"], "contributor": aid, "beneficiary": 0, "state": "proposed", "requested": requested,
		"terms": {"companies": [], "coinFee": int(t["coinFee"]), "supplyPayer": payer, "requesterSupplyShare": 0.5 if payer == "shared" else (1 if payer == "requester" else 0),
			"serviceDays": int(t["serviceDays"]), "commandRights": t["commandRights"], "rewardSectors": clean_rewards.duplicate(true), "reciprocalDefenseDays": int(t.get("reciprocalDefenseDays", 0))},
		"expiresTick": sim.tick + 3 * Defs.DAY_TICKS, "activatedTick": null, "escrow": 0, "reasons": [],
		"decideTick": sim.tick + Diplomacy.letter_ticks(sim, 0, aid) * 2, "unit": t.get("unit")}
	sim.commitments.append(c)
	return {"ok": true, "id": c["id"], "message": "Your envoy carries the request to %s. Only they learn of the plan." % ally["name"]}


## What the ally makes of a request, deterministically: {verdict, terms, reasons}.
static func _ally_answer(sim: Simulation, c: Dictionary) -> Dictionary:
	var plan := find_plan(sim, c["campaignId"])
	var ally := Kingdoms.by_id(sim, int(c["contributor"]))
	var target := Kingdoms.by_id(sim, int(plan["target"]))
	var aid := int(ally["id"])
	var tid := int(target["id"])
	var reasons: Array = []
	var will := Diplomacy.trust_of(sim, aid, 0)
	reasons.append("Trust in you: %s/100" % Diplomacy._num(will))
	if Diplomacy.stance_of(sim, aid, 0) == "ally":
		will += 10
		reasons.append("You are allies")
	var worry := Concern.evaluate(sim, aid, tid)
	if int(worry["score"]) >= 25:
		will += 20
		reasons.append("They are %s about %s themselves" % [worry["band"], target["name"]])
	if Diplomacy.at_war(sim, aid, tid):
		will += 25
		reasons.append("They are already at war with %s" % target["name"])
	var a := Diplomacy.seat_of(sim, aid)
	var b := Diplomacy.seat_of(sim, tid)
	if JsMath.hypot(a.x - b.x, a.y - b.y) > 250:
		will -= 10
		reasons.append("%s is far from them" % target["name"])
	var req: Dictionary = c["requested"]
	if req["commandRights"] == "delegated":
		will -= 10
		reasons.append("They want to command their own soldiers")
	if int(req["serviceDays"]) > 8:
		will -= 10
		reasons.append("%d days is a long time away from home" % int(req["serviceDays"]))
	var committed := 0
	for x: Dictionary in sim.commitments:
		if int(x["contributor"]) == aid and x["state"] == "accepted":
			committed += 1
	if committed > 0:
		will -= 10 * committed
		reasons.append("They have already promised soldiers elsewhere")
	var offered := int(req["coinFee"]) / 3.0 + (8 if req["supplyPayer"] == "requester" else (4 if req["supplyPayer"] == "shared" else 0)) + (req["rewardSectors"] as Array).size() * 8
	will += offered
	if offered != 0:
		reasons.append("Your offer of payment, supplies or land counts in your favour")
	var terms: Dictionary = (c["terms"] as Dictionary).duplicate(true)
	if will >= 75:
		reasons.append("They agree to your terms")
		return {"verdict": "accept", "terms": terms, "reasons": reasons}
	if will >= 45:
		terms["coinFee"] = maxi(int(req["coinFee"]), 30 * int(req["companies"]))
		terms["serviceDays"] = mini(int(req["serviceDays"]), 8)
		terms["supplyPayer"] = "requester"
		terms["requesterSupplyShare"] = 1
		terms["commandRights"] = "coordinated"
		reasons.append("They would come for %d coins, %d days' service, you feeding their soldiers, under their own command" % [terms["coinFee"], terms["serviceDays"]])
		return {"verdict": "counter", "terms": terms, "reasons": reasons}
	reasons.append("They decline — this does not make them your enemy")
	return {"verdict": "refuse", "terms": terms, "reasons": reasons}


## Reserves the ally's companies and escrows the fee. Returns a problem or "".
static func _commit(sim: Simulation, c: Dictionary) -> String:
	var me := Kingdoms.player(sim)
	var ally := Kingdoms.by_id(sim, int(c["contributor"]))
	var fee := int(c["terms"]["coinFee"])
	if fee > float(me["treasury"]):
		return "The treasury can't cover the %d coin fee" % fee
	var want := int(c["requested"]["companies"])
	if want > spare_companies(sim, int(ally["id"])):
		return "%s no longer has %d companies to spare" % [ally["name"], want]
	var pool := _available(ally)
	var keyed: Array[Array] = []
	for i in pool.size():
		keyed.append([0 if pool[i]["kind"] == c.get("unit") else 1, i, pool[i]])
	keyed.sort_custom(func(x: Array, y: Array) -> bool: return int(x[0]) < int(y[0]) or (int(x[0]) == int(y[0]) and int(x[1]) < int(y[1])))
	var chosen: Array = []
	for i in mini(want, keyed.size()):
		var q: Dictionary = keyed[i][2]
		q["pledgedTo"] = c["id"]
		chosen.append(q["id"])
	c["terms"]["companies"] = chosen
	me["treasury"] = float(me["treasury"]) - fee
	c["escrow"] = fee
	c["state"] = "accepted"
	c["activatedTick"] = sim.tick
	return ""


static func accept_offer(sim: Simulation, commitment_id: Variant) -> Dictionary:
	var c := find_commitment(sim, commitment_id)
	if c.is_empty() or c["state"] != "countered":
		return {"ok": false, "message": "There is no counter-offer to accept"}
	if sim.tick >= int(c["expiresTick"]):
		c["state"] = "expired"
		return {"ok": false, "message": "That counter-offer has expired"}
	var problem := _commit(sim, c)
	if problem != "":
		return {"ok": false, "message": problem}
	return {"ok": true, "message": "Agreed. %d coins are held until their soldiers reach your staging ground; they are not refunded for service already given." % int(c["terms"]["coinFee"])}


static func counter_offer(sim: Simulation, commitment_id: Variant, terms_raw: Variant) -> Dictionary:
	var c := find_commitment(sim, commitment_id)
	if c.is_empty() or (c["state"] != "countered" and c["state"] != "refused"):
		return {"ok": false, "message": "Nothing to counter"}
	c["state"] = "expired"
	return request_support(sim, c["campaignId"], c["contributor"], terms_raw)


## Calls off a war plan: unearned fees come back, every pledged company goes home.
static func cancel_plan(sim: Simulation, plan_id: Variant) -> Dictionary:
	var plan := find_plan(sim, plan_id)
	if plan.is_empty() or plan["state"] != "drafting":
		return {"ok": false, "message": "That plan is not open"}
	plan["state"] = "cancelled"
	var me := Kingdoms.player(sim)
	for c: Dictionary in sim.commitments:
		if int(c["campaignId"]) != int(plan["id"]) or ["refused", "expired", "cancelled", "fulfilled"].has(c["state"]):
			continue
		# Nothing has arrived yet, so the whole fee is unearned.
		me["treasury"] = float(me["treasury"]) + float(c["escrow"])
		c["escrow"] = 0
		var ally := Kingdoms.by_id(sim, int(c["contributor"]))
		for q: Dictionary in ally.get("companies", []):
			if q["pledgedTo"] != null and int(q["pledgedTo"]) == int(c["id"]):
				q["pledgedTo"] = null
		c["state"] = "cancelled"
	return {"ok": true, "message": "The plan is shelved. Fees held in escrow are back in the treasury and allied companies stand down."}


## What the council can say about a plan — only from reports the player has received.
static func assess(sim: Simulation, plan_id: int) -> Dictionary:
	var plan := find_plan(sim, plan_id)
	var target := Kingdoms.by_id(sim, int(plan["target"]))
	var tid := int(target["id"])
	var report := News.latest_about(sim, 0, tid, "military-buildup")
	if report.is_empty():
		report = News.latest_about(sim, 0, tid, "border-forces")
	var range_v: Variant = null
	if not report.is_empty():
		var strength := float(report["magnitude"])
		var spread := 0.0 if report["certainty"] == "confirmed" else (0.25 if report["certainty"] == "observed" else 0.5)
		range_v = [maxi(0, floori(strength * (1 - spread))), ceili(strength * (1 + spread))]
	var count := func(states: Array) -> int:
		var n := 0
		for c: Dictionary in sim.commitments:
			if int(c["campaignId"]) == int(plan["id"]) and states.has(c["state"]):
				var k := (c["terms"]["companies"] as Array).size()
				n += k if k > 0 else int(c["requested"]["companies"])
		return n
	var own := Military.ready_companies(sim).size()
	var blockers: Array = []
	if own == 0:
		blockers.append("No army yet: build barracks and train soldiers")
	if report.is_empty():
		blockers.append("No report on %s's strength — send your envoy or wait for news" % target["name"])
	return {"target": target["name"],
		"enemy": {"known": not report.is_empty(), "range": range_v, "reportAge": "%d days old" % roundi(float(sim.tick - int(report["eventTick"])) / Defs.DAY_TICKS) if not report.is_empty() else "no reports",
			"certainty": report.get("certainty")},
		"own": {"companies": own, "ready": own > 0},
		"allies": {"proposed": count.call(["proposed", "countered"]), "pledged": count.call(["accepted"]), "mustered": count.call(["assembling"]), "enRoute": count.call(["enRoute"]), "arrived": count.call(["arrived", "active"])},
		"supplyDays": floori(float(sim.stored_total("food")) / maxi(1, own * 4)), "blockers": blockers}


## Allies' letters arrive; offers lapse.
static func update(sim: Simulation) -> void:
	for c: Dictionary in sim.commitments:
		if c["state"] == "proposed" and sim.tick >= int(c["decideTick"]):
			var a := _ally_answer(sim, c)
			c["reasons"] = a["reasons"]
			c["terms"] = a["terms"]
			if a["verdict"] == "accept":
				var problem := _commit(sim, c)
				if problem != "":
					c["state"] = "refused"
					(c["reasons"] as Array).append(problem)
			else:
				c["state"] = "countered" if a["verdict"] == "counter" else "refused"
			sim.toast("%s answered your request for support: %s. See the war council." % [Kingdoms.name_of(sim, int(c["contributor"]), "?"), c["state"]], "good" if c["state"] == "accepted" else "info")
			sim.emit({"type": "important"})
		elif c["state"] == "countered" and sim.tick >= int(c["expiresTick"]):
			c["state"] = "expired"
