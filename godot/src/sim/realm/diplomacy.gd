class_name Diplomacy
## Relations between kingdoms (src/game/sim/diplomacy.ts): stance (neutral, trading, ally, enemy),
## how far each side trusts the other, treaties with typed terms and escrowed payments, and
## border incidents. The AI answers every offer with its reasons, and uses only what it has been told.
##
## Offers: {id, kind, proposer, recipient, terms {durationDays, payment, transfers?}, escrow,
## state proposed|active|rejected|expired|breached|fulfilled, reasons, createdTick, expiresTick,
## decideTick | null, activatedTick | null, endsTick | null}.
## Incidents: {id, kind civilianPassage|armedPassage|hostileAttack, from, to, sector, tick, state}.


static func treaty(kind: String) -> Dictionary:
	return (Content.get_value("treaties", "TREATIES") as Dictionary)[kind]


static func is_treaty(kind: Variant) -> bool:
	return kind is String and (Content.get_value("treaties", "TREATIES") as Dictionary).has(kind)


static func pair_key(a: int, b: int) -> String:
	return "%d:%d" % [a, b] if a < b else "%d:%d" % [b, a]


static func at_war(sim: Simulation, a: int, b: int) -> bool:
	return sim.wars.has(pair_key(a, b))


static func stance_of(sim: Simulation, a: int, b: int) -> String:
	return str(sim.stances.get(pair_key(a, b), "neutral"))


static func trust_of(sim: Simulation, from: int, to: int) -> float:
	return float(sim.trust.get("%d>%d" % [from, to], float(Content.get_value("treaties", "DEFAULT_TRUST"))))


static func change_trust(sim: Simulation, from: int, to: int, by: float) -> void:
	sim.trust["%d>%d" % [from, to]] = maxf(0.0, minf(100.0, trust_of(sim, from, to) + by))


## Where a kingdom sits, for travel times.
static func seat_of(sim: Simulation, id: int) -> Vector2:
	var k := Kingdoms.by_id(sim, id)
	if k.is_empty() or k["capital"] == null:
		return Vector2.ZERO
	return Vector2(float(k["capital"]["x"]), float(k["capital"]["y"]))


## Ticks for a letter between two kingdoms.
static func letter_ticks(sim: Simulation, a: int, b: int) -> int:
	var p := seat_of(sim, a)
	var q := seat_of(sim, b)
	var t := roundi(JsMath.hypot(p.x - q.x, p.y - q.y) / Regions.ROAD_SPEED)
	# A messenger carries the player's letters twice as fast.
	var fast := (a == Kingdoms.PLAYER or b == Kingdoms.PLAYER) and News.has_messenger(sim)
	return maxi(60, roundi(t / 2.0) if fast else t)


static func active_treaty(sim: Simulation, a: int, b: int, kind: String) -> Dictionary:
	for o: Dictionary in sim.offers:
		if o["kind"] == kind and o["state"] == "active" and ((int(o["proposer"]) == a and int(o["recipient"]) == b) or (int(o["proposer"]) == b and int(o["recipient"]) == a)):
			return o
	return {}


## Recomputes a pair's stance from their treaties and wars.
static func refresh_stance(sim: Simulation, a: int, b: int) -> void:
	var k := pair_key(a, b)
	if sim.wars.has(k):
		sim.stances[k] = "enemy"
	elif not active_treaty(sim, a, b, "defensiveAlliance").is_empty():
		sim.stances[k] = "ally"
	elif not active_treaty(sim, a, b, "trade").is_empty():
		sim.stances[k] = "trading"
	else:
		sim.stances.erase(k)


## The rival's companies: created with the kingdom, at home unless pledged.
static func rival_companies(id: int) -> Array:
	var n := 3 + (id % 3)
	var kinds := ["infantry", "archer", "infantry", "knight", "archer", "infantry"]
	var out: Array = []
	for i in n:
		out.append({"id": id * 100 + i, "kind": kinds[i % kinds.size()], "strength": 10, "pledgedTo": null, "owner": id})
	return out


static func find_offer(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is int or id is float):
		return {}
	for o: Dictionary in sim.offers:
		if int(o["id"]) == int(id):
			return o
	return {}


# ---- offers ------------------------------------------------------------------------------------

static func _incompatible(sim: Simulation, from: int, to: int, kind: String) -> String:
	var war := at_war(sim, from, to)
	if (kind == "truce" or kind == "peace") and not war:
		return "A truce or peace is only needed between kingdoms at war"
	if war and kind != "truce" and kind != "peace":
		return "You are at war: agree a truce or peace first"
	if kind == "defensiveAlliance":
		for other: Dictionary in sim.kingdoms:
			var oid := int(other["id"])
			if oid == to or oid == from:
				continue
			if stance_of(sim, from, oid) == "ally" and at_war(sim, to, oid):
				return "%s is at war with your ally %s — you can't promise to defend both" % [Kingdoms.name_of(sim, to), other["name"]]
	return ""


## Creates an offer (the proposer's payment goes into escrow). Used by the AI and by propose().
static func make_offer(sim: Simulation, from: int, to: int, kind: String, terms: Dictionary, expires_in: int) -> Dictionary:
	var payment := maxi(0, floori(float(terms.get("payment", 0))))
	var k := Kingdoms.by_id(sim, from)
	if not k.is_empty():
		k["treasury"] = float(k["treasury"]) - payment
	var o := {"id": sim.alloc_id(), "kind": kind, "proposer": from, "recipient": to,
		"terms": {"durationDays": maxi(1, floori(float(terms["durationDays"]))), "payment": payment},
		"escrow": payment, "state": "proposed", "reasons": [], "createdTick": sim.tick, "expiresTick": sim.tick + expires_in,
		"decideTick": null if to == Kingdoms.PLAYER else sim.tick + letter_ticks(sim, from, to), "activatedTick": null, "endsTick": null}
	sim.offers.append(o)
	return o


static func propose(sim: Simulation, kind: Variant, to: Variant, terms: Variant) -> Dictionary:
	var me := Kingdoms.player(sim)
	if not me["crowned"]:
		return {"ok": false, "message": "Crown your ruler first — kingdoms treat with crowned rulers"}
	if not is_treaty(kind):
		return {"ok": false, "message": "Unknown treaty"}
	var other := Kingdoms.by_id(sim, int(to)) if (to is int or to is float) else {}
	if other.is_empty() or other["player"]:
		return {"ok": false, "message": "Choose a kingdom you know of"}
	if me["council"]["envoy"] == null:
		return {"ok": false, "message": "Appoint an %s to carry your letters" % Kingdoms.value("COUNCIL_POSTS")["envoy"]["name"]}
	var t: Dictionary = terms if terms is Dictionary else {}
	var days_v: Variant = t.get("durationDays")
	var pay_v: Variant = t.get("payment", 0)
	var days_ok := (days_v is int or days_v is float) and float(days_v) == floorf(float(days_v)) and float(days_v) >= 1 and float(days_v) <= 64
	var pay_ok := (pay_v is int or pay_v is float) and float(pay_v) == floorf(float(pay_v)) and float(pay_v) >= 0
	if not days_ok or not pay_ok:
		return {"ok": false, "message": "Invalid terms"}
	var pay := int(pay_v)
	var oid := int(other["id"])
	if pay > float(me["treasury"]):
		return {"ok": false, "message": "The treasury holds only %d coins" % int(me["treasury"])}
	for o: Dictionary in sim.offers:
		if o["state"] == "proposed" and o["kind"] == kind and ((int(o["proposer"]) == 0 and int(o["recipient"]) == oid) or (int(o["proposer"]) == oid and int(o["recipient"]) == 0)):
			return {"ok": false, "message": "That offer is already on its way — wait for the answer"}
	if not active_treaty(sim, 0, oid, kind).is_empty():
		return {"ok": false, "message": "You already have a %s with %s" % [str(treaty(kind)["name"]).to_lower(), other["name"]]}
	var bad := _incompatible(sim, 0, oid, kind)
	if bad != "":
		return {"ok": false, "message": bad}
	var transfers: Array = []
	if kind == "peace":
		for s: Variant in t.get("transfers", []):
			if s is Dictionary and ((s as Dictionary).get("x") is int or (s as Dictionary).get("x") is float):
				transfers.append({"x": int(s["x"]), "y": int(s["y"])})
		for s: Dictionary in transfers:
			var o := Territory.owner_of(sim, Vector2i(s["x"], s["y"]))
			if o.is_empty() or int(o["legalOwner"]) != oid or o["protectedHomeland"]:
				return {"ok": false, "message": "Sector %d,%d is not %s's frontier land" % [s["x"], s["y"], other["name"]]}
			if o["occupyingKingdom"] == null or int(o["occupyingKingdom"]) != 0:
				return {"ok": false, "message": "You can only ask for land your soldiers hold (sector %d,%d)" % [s["x"], s["y"]]}
		var unmet := Combat.unmet_rewards(sim, oid, transfers)
		if not unmet.is_empty() and t.get("waiveUnmet") != true:
			var parts: PackedStringArray = []
			for u: Dictionary in unmet:
				parts.append("%s: %s" % [Kingdoms.name_of(sim, int(u["ally"]), "?"), " ".join(PackedStringArray((u["sectors"] as Array).map(func(q: Dictionary) -> String: return "%d,%d" % [q["x"], q["y"]])))])
			return {"ok": false, "message": "This peace would leave promises unmet: %s. Include that land or waive the promises (it costs their trust)." % "; ".join(parts)}
		for u: Dictionary in unmet:
			change_trust(sim, int(u["ally"]), 0, -20)
			for cm: Dictionary in sim.commitments:
				if int(cm["contributor"]) == int(u["ally"]):
					(cm["reasons"] as Array).append("The land promised to them was waived in the peace")
	var offer := make_offer(sim, 0, oid, kind, {"durationDays": int(days_v), "payment": pay}, 4 * Defs.DAY_TICKS)
	if not transfers.is_empty():
		offer["terms"]["transfers"] = transfers
	sim.emit({"type": "important"})
	return {"ok": true, "id": offer["id"], "message": "Your envoy is taking the %s to %s%s." % [str(treaty(kind)["name"]).to_lower(), other["name"], " with %d coins held until they answer" % pay if pay > 0 else ""]}


static func _activate(sim: Simulation, o: Dictionary) -> void:
	o["state"] = "active"
	o["activatedTick"] = sim.tick
	o["endsTick"] = sim.tick + int(o["terms"]["durationDays"]) * Defs.DAY_TICKS
	var to := Kingdoms.by_id(sim, int(o["recipient"]))
	if not to.is_empty():
		to["treasury"] = float(to["treasury"]) + float(o["escrow"])
	o["escrow"] = 0
	if o["kind"] == "peace":
		Combat.apply_peace(sim, o)
	refresh_stance(sim, int(o["proposer"]), int(o["recipient"]))
	change_trust(sim, int(o["recipient"]), int(o["proposer"]), 5)
	change_trust(sim, int(o["proposer"]), int(o["recipient"]), 5)
	if o["kind"] == "defensiveAlliance":
		var ev := News.record_event(sim, "alliance", int(o["proposer"]), 1, null)
		for k: Dictionary in sim.kingdoms:
			if int(k["id"]) != int(o["proposer"]) and int(k["id"]) != int(o["recipient"]):
				News.record_observation(sim, int(k["id"]), int(o["proposer"]), "alliance", null, {"eventId": ev["id"], "certainty": "observed", "source": "envoy", "delay": Defs.DAY_TICKS})


static func _refund(sim: Simulation, o: Dictionary) -> void:
	var from := Kingdoms.by_id(sim, int(o["proposer"]))
	if not from.is_empty():
		from["treasury"] = float(from["treasury"]) + float(o["escrow"])
	o["escrow"] = 0


## The player's answer to an offer from another kingdom.
static func respond(sim: Simulation, offer_id: Variant, accept: Variant) -> Dictionary:
	var o := find_offer(sim, offer_id)
	if o.is_empty() or int(o["recipient"]) != 0:
		return {"ok": false, "message": "That offer is not addressed to you"}
	if o["state"] == "expired" or (o["state"] == "proposed" and sim.tick >= int(o["expiresTick"])):
		return {"ok": false, "message": "That offer has expired and is no longer on the table"}
	if o["state"] != "proposed":
		return {"ok": false, "message": "That offer has already been answered"}
	var from_name := Kingdoms.name_of(sim, int(o["proposer"]))
	var tname := str(treaty(o["kind"])["name"]).to_lower()
	if not accept:
		o["state"] = "rejected"
		_refund(sim, o)
		# A refusal is not an insult; trust barely moves and nobody becomes an enemy.
		change_trust(sim, int(o["proposer"]), 0, -1)
		return {"ok": true, "message": "You declined %s's %s. Relations are unchanged." % [from_name, tname]}
	var bad := _incompatible(sim, int(o["proposer"]), 0, o["kind"])
	if bad != "":
		return {"ok": false, "message": bad}
	_activate(sim, o)
	return {"ok": true, "message": "You signed the %s with %s." % [tname, from_name]}


## How willing an AI kingdom is to sign, with its reasons: {accept, reasons}.
static func ai_verdict(sim: Simulation, o: Dictionary) -> Dictionary:
	var def := treaty(o["kind"])
	if o["kind"] == "peace" or o["kind"] == "truce":
		var p := Combat.peace_score(sim, o)
		var acc: bool = float(p["score"]) >= float(def["threshold"])
		var rs: Array = (p["reasons"] as Array).duplicate()
		rs.append("We accept the %s" % str(def["name"]).to_lower() if acc else "Not on these terms")
		return {"accept": acc, "reasons": rs}
	var me := Kingdoms.by_id(sim, int(o["recipient"]))
	var them := Kingdoms.by_id(sim, int(o["proposer"]))
	var reasons: Array = []
	var score := trust_of(sim, int(me["id"]), int(them["id"]))
	reasons.append("We trust %s %s (%s/100)" % [them["name"], "well" if score >= 60 else ("somewhat" if score >= 40 else "little"), _num(score)])
	var concern := Concern.evaluate(sim, int(me["id"]), int(them["id"]))
	if int(concern["score"]) > 0:
		score -= float(concern["score"]) / 2.0
		reasons.append("We are %s about them%s" % [concern["band"], ": %s" % (concern["reasons"] as Array)[0] if not (concern["reasons"] as Array).is_empty() else ""])
	var payment := float(o["terms"].get("payment", 0))
	if payment > 0:
		score += payment / 5.0
		reasons.append("They offer %d coins" % int(payment))
	if me["personality"] == "mercantile" and o["kind"] == "trade":
		score += 15
		reasons.append("Trade suits our merchants")
	if me["personality"] == "proud" and (o["kind"] == "passage" or o["kind"] == "defensiveAlliance"):
		score -= 10
		reasons.append("We are wary of foreign soldiers and entanglements")
	if me["personality"] == "cautious" and o["kind"] == "nonAggression":
		score += 10
		reasons.append("A pact eases our worries")
	var bad := _incompatible(sim, int(o["proposer"]), int(o["recipient"]), o["kind"])
	if bad != "":
		reasons.append(bad)
		return {"accept": false, "reasons": reasons}
	var accept := score >= float(def["threshold"])
	reasons.append("This is enough for a %s" % str(def["name"]).to_lower() if accept else "Not enough for a %s yet" % str(def["name"]).to_lower())
	return {"accept": accept, "reasons": reasons}


## A number as JavaScript prints it (no ".0" on whole numbers).
static func _num(v: float) -> String:
	return str(int(v)) if v == floorf(v) else str(v)


## Ends a treaty before its time: a broken promise that others hear about.
static func cancel(sim: Simulation, offer_id: Variant) -> Dictionary:
	var o := find_offer(sim, offer_id)
	if o.is_empty() or o["state"] != "active" or (int(o["proposer"]) != 0 and int(o["recipient"]) != 0):
		return {"ok": false, "message": "No such treaty"}
	var other := int(o["recipient"]) if int(o["proposer"]) == 0 else int(o["proposer"])
	o["state"] = "breached"
	refresh_stance(sim, int(o["proposer"]), int(o["recipient"]))
	change_trust(sim, other, 0, -25)
	var ev := News.record_event(sim, "treaty-broken", 0, 1, null)
	for k: Dictionary in sim.kingdoms:
		if k["player"]:
			continue
		var them := int(k["id"]) == other
		News.record_observation(sim, int(k["id"]), 0, "treaty-broken", null, {"eventId": ev["id"], "certainty": "confirmed" if them else "observed",
			"source": "envoy" if them else "rumour-of-envoys", "delay": 0 if them else Defs.DAY_TICKS})
	var tname := str(treaty(o["kind"])["name"]).to_lower()
	sim.record("shortage", "%s broke its %s with %s" % [Kingdoms.player(sim)["name"], tname, Kingdoms.name_of(sim, other, "?")])
	return {"ok": true, "message": "You ended the %s. It was a broken promise: %s" % [tname, treaty(o["kind"])["breach"]]}


# ---- incidents ----------------------------------------------------------------------------------

## A border incident. A hostile attack is only possible in a war; otherwise it is refused.
static func open_incident(sim: Simulation, kind: String, from: int, to: int, sector: Vector2i) -> Dictionary:
	var inc := {"id": sim.alloc_id(), "kind": kind, "from": from, "to": to, "sector": {"x": sector.x, "y": sector.y}, "tick": sim.tick, "state": "open"}
	if kind == "hostileAttack" and not at_war(sim, from, to):
		inc["state"] = "refused"
		return inc
	sim.incidents.append(inc)
	if to == 0:
		var what := "travellers are crossing" if kind == "civilianPassage" else ("armed men are crossing" if kind == "armedPassage" else "soldiers attacked")
		sim.toast("%s: %s your land. Open the Realm window to respond." % [Kingdoms.name_of(sim, from, "A neighbour"), what], "info" if kind == "civilianPassage" else "warn")
		sim.emit({"type": "important"})
	return inc


static func respond_to_incident(sim: Simulation, incident_id: Variant, response: Variant) -> Dictionary:
	var inc := {}
	for x: Dictionary in sim.incidents:
		if (incident_id is int or incident_id is float) and int(x["id"]) == int(incident_id):
			inc = x
	if inc.is_empty() or int(inc["to"]) != 0:
		return {"ok": false, "message": "No such incident"}
	if inc["state"] != "open":
		return {"ok": false, "message": "That incident is already settled"}
	var from := int(inc["from"])
	var nm := Kingdoms.name_of(sim, from)
	match response:
		"allow":
			inc["state"] = "allowed"
			change_trust(sim, from, 0, 3)
			return {"ok": true, "message": "You let %s's people pass." % nm}
		"askWithdraw":
			if inc["kind"] == "hostileAttack":
				return {"ok": false, "message": "An attack in war is not settled by asking — defend, retreat or seek a truce"}
			if trust_of(sim, from, 0) >= 25 or inc["kind"] == "civilianPassage":
				inc["state"] = "withdrawn"
				return {"ok": true, "message": "%s apologised and withdrew." % nm}
			inc["state"] = "standoff"
			change_trust(sim, 0, from, -5)
			return {"ok": true, "message": "%s refused to withdraw. Consider talks, a passage treaty, or preparing your defences." % nm}
		"protest":
			inc["state"] = "withdrawn"
			change_trust(sim, from, 0, -4)
			return {"ok": true, "message": "You lodged a protest; %s withdrew, cooler towards you." % nm}
	return {"ok": false, "message": "Unknown response"}


# ---- the daily round -------------------------------------------------------------------------------

static func _concern_band(sim: Simulation, key: String) -> String:
	var st: Dictionary = sim.concern_states.get(key, {})
	return str(st.get("band", "calm"))


static func _rival_day(sim: Simulation, r: Dictionary) -> void:
	var rid := int(r["id"])
	# A worried kingdom raises another company (and its neighbours notice).
	var worried := false
	for k: Dictionary in sim.kingdoms:
		if int(k["id"]) != rid:
			var band := _concern_band(sim, "%d>%d" % [rid, int(k["id"])])
			if band == "concerned" or band == "alarmed":
				worried = true
	var companies: Array = r["companies"]
	if worried and companies.size() < int(Content.get_value("treaties", "MAX_RIVAL_COMPANIES")) and sim.rng.chance(0.5):
		companies.append({"id": rid * 100 + companies.size(), "kind": "infantry" if sim.rng.chance(0.5) else "archer", "strength": 10, "pledgedTo": null, "owner": rid})
		# Reports carry the company count seen at the time; it goes stale as things change.
		var ev := News.record_event(sim, "military-buildup", rid, companies.size(), null)
		for k: Dictionary in sim.kingdoms:
			var kid := int(k["id"])
			if kid == rid:
				continue
			var a := seat_of(sim, kid)
			var b := seat_of(sim, rid)
			var near := JsMath.hypot(a.x - b.x, a.y - b.y) < 320
			var letters := not active_treaty(sim, kid, rid, "trade").is_empty() or stance_of(sim, kid, rid) == "ally"
			if letters if k["player"] else near:
				News.record_observation(sim, kid, rid, "military-buildup", null, {"eventId": ev["id"], "certainty": "observed", "source": "letters" if k["player"] else "scout", "delay": Defs.DAY_TICKS / 2})
	# Trust drifts gently back towards neutral; trade partners warm up.
	var neutral := float(Content.get_value("treaties", "DEFAULT_TRUST"))
	for k: Dictionary in sim.kingdoms:
		var kid := int(k["id"])
		if kid == rid:
			continue
		var t := trust_of(sim, rid, kid)
		if not active_treaty(sim, rid, kid, "trade").is_empty():
			change_trust(sim, rid, kid, 1)
		elif t > neutral:
			change_trust(sim, rid, kid, -0.5)
		elif t < neutral:
			change_trust(sim, rid, kid, 0.5)
	# A friendly neighbour proposes trade now and then.
	var me := Kingdoms.player(sim)
	if me["crowned"] and trust_of(sim, rid, 0) >= 65 and active_treaty(sim, rid, 0, "trade").is_empty() \
			and not sim.offers.any(func(o: Dictionary) -> bool: return o["state"] == "proposed" and int(o["proposer"]) == rid):
		make_offer(sim, rid, 0, "trade", {"durationDays": 8, "payment": 0}, 2 * Defs.DAY_TICKS)
		sim.toast("%s proposes a trade agreement. See the Realm window." % r["name"], "info")
	# Frontier patrols from a worried neighbour, once the player has opened the frontier.
	if me["frontierActive"] and _concern_band(sim, "%d>0" % rid) == "alarmed" and sim.rng.chance(0.25):
		var mine: Array[String] = []
		for k2: String in sim.claims:
			if int(sim.claims[k2]["legalOwner"]) == 0:
				mine.append(k2)
		if not mine.is_empty():
			var key := mine[sim.rng.int_below(mine.size())]
			open_incident(sim, "armedPassage", rid, 0, Territory.from_key(key))


## Offers, treaties and incidents advance; each kingdom takes its daily turn.
static func update(sim: Simulation) -> void:
	for o: Dictionary in sim.offers:
		if o["state"] == "proposed" and sim.tick >= int(o["expiresTick"]):
			o["state"] = "expired"
			_refund(sim, o)
			continue
		if o["state"] == "proposed" and o["decideTick"] != null and sim.tick >= int(o["decideTick"]):
			var v := ai_verdict(sim, o)
			o["reasons"] = v["reasons"]
			if v["accept"]:
				_activate(sim, o)
			else:
				o["state"] = "rejected"
				_refund(sim, o)
			if int(o["proposer"]) == 0:
				sim.toast("%s %s your %s. Their reasons are in the Realm window." % [Kingdoms.name_of(sim, int(o["recipient"]), "?"), "accepted" if v["accept"] else "declined", str(treaty(o["kind"])["name"]).to_lower()], "good" if v["accept"] else "info")
				sim.emit({"type": "important"})
			continue
		if o["state"] == "active" and o["endsTick"] != null and sim.tick >= int(o["endsTick"]):
			o["state"] = "fulfilled"
			refresh_stance(sim, int(o["proposer"]), int(o["recipient"]))
	if sim.day() != sim.diplomacy_day:
		sim.diplomacy_day = sim.day()
		for r: Dictionary in sim.kingdoms.duplicate():
			if not r["player"]:
				_rival_day(sim, r)
		# The player's growth is news too (merchants carry it).
		var adults := 0
		for s in sim.settlers:
			if s.life_stage == "adult":
				adults += 1
		if adults >= sim.last_prosperity + 5:
			sim.last_prosperity = adults
			News.record_event(sim, "prosperity", 0, roundi(adults / 5.0), null)
		Concern.update(sim)


## A merchant from `home` has arrived: news they carry, and rumours of their home, reach the player.
static func merchant_brings_news(sim: Simulation, home: int) -> void:
	News.deliver_merchant_news(sim, 0)
	for ev: Dictionary in sim.world_events.duplicate():
		if int(ev["subject"]) != home or sim.tick - int(ev["tick"]) > 4 * Defs.DAY_TICKS:
			continue
		var jitter := 0.5 + sim.rng.next()
		News.record_observation(sim, 0, home, ev["kind"], null, {"eventId": ev["id"], "certainty": "rumor", "source": "merchant", "delay": 0,
			"magnitude": maxi(1, roundi(float(ev["magnitude"]) * jitter))})


## A merchant heading home carries rumours of the player's recent doings.
static func merchant_carries_news(sim: Simulation, home: int) -> void:
	for ev: Dictionary in sim.world_events.duplicate():
		if int(ev["subject"]) != 0 or sim.tick - int(ev["tick"]) > 4 * Defs.DAY_TICKS:
			continue
		News.record_observation(sim, home, 0, ev["kind"], null, {"eventId": ev["id"], "certainty": "rumor", "source": "merchant", "delay": letter_ticks(sim, 0, home)})


## Neighbours see a claim near their land at once; the event is recorded either way.
static func report_claim(sim: Simulation, sector: Vector2i) -> void:
	var ev := News.record_event(sim, "claim", 0, 1, sector)
	for k: Dictionary in sim.kingdoms:
		if k["player"] or k["capital"] == null:
			continue
		var c := Territory.sector_of(float(k["capital"]["x"]), float(k["capital"]["y"]))
		if maxi(absi(c.x - sector.x), absi(c.y - sector.y)) <= 5:
			News.record_observation(sim, int(k["id"]), 0, "claim", sector, {"eventId": ev["id"], "certainty": "observed", "source": "border", "delay": Defs.DAY_TICKS / 4})


## Sets up a relationship through the same records play would create (scenarios and the AI).
static func set_stance_direct(sim: Simulation, a: int, b: int, stance: String) -> void:
	for o: Dictionary in sim.offers:
		var pair := (int(o["proposer"]) == a and int(o["recipient"]) == b) or (int(o["proposer"]) == b and int(o["recipient"]) == a)
		if pair and o["state"] == "active" and (o["kind"] == "defensiveAlliance" or o["kind"] == "trade"):
			o["state"] = "fulfilled"
	sim.wars.erase(pair_key(a, b))
	if stance == "enemy":
		sim.wars[pair_key(a, b)] = true
	if stance == "ally" or stance == "trading":
		var o := make_offer(sim, a, b, "defensiveAlliance" if stance == "ally" else "trade", {"durationDays": 64, "payment": 0}, Defs.DAY_TICKS)
		o["state"] = "active"
		o["activatedTick"] = sim.tick
		o["endsTick"] = sim.tick + 64 * Defs.DAY_TICKS
	refresh_stance(sim, a, b)


## Starts or ends a war directly (scenarios).
static func set_war(sim: Simulation, a: int, b: int, on: bool) -> void:
	if on:
		sim.wars[pair_key(a, b)] = true
		if not sim.war_states.has(pair_key(a, b)):
			sim.war_states[pair_key(a, b)] = {"attacker": a, "defender": b, "objective": "raid", "startedTick": sim.tick, "planId": null, "truceUntilTick": 0, "routs": {}, "lastDeploy": {}, "lastSkirmishDay": 0}
	else:
		sim.wars.erase(pair_key(a, b))
		sim.war_states.erase(pair_key(a, b))
	refresh_stance(sim, a, b)


## While a truce holds, no attacks.
static func truce_until(sim: Simulation, a: int, b: int) -> int:
	var t := active_treaty(sim, a, b, "truce")
	return int(t["endsTick"]) if not t.is_empty() and t["endsTick"] != null else 0
