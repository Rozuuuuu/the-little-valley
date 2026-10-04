class_name Concern
## How worried one kingdom is about another (src/game/sim/concern.ts), from what the observer has
## been told, never from hidden truth. Troops near its land, claims on its border, conquests and
## broken promises raise concern; distance, trust, trade and alliances temper it. Prosperity alone
## never goes past watchful, and a rumour alone can never prove aggression or a broken promise.
##
## sim.concern_states: "observer>subject" -> {band, score, lastWarnTick, lastWarnBand, reassuredTick,
## reassuredEvidence, lastEvidence}. Warnings: {id, from, to, band, reasons, tick, state, response, actions}.

const WEIGHT := {"rumor": 0.3, "observed": 0.7, "confirmed": 1.0}
const ORDER := ["calm", "watchful", "concerned", "alarmed"]
## Never warned yet (the browser game saves -Infinity as this).
const NEVER := -1000000000


static func bands() -> Dictionary:
	return Content.get_value("treaties", "BANDS")


static func band_for(score: float) -> String:
	var b := bands()
	if score >= float(b["alarmed"]):
		return "alarmed"
	if score >= float(b["concerned"]):
		return "concerned"
	if score >= float(b["watchful"]):
		return "watchful"
	return "calm"


static func _entry(band: String) -> float:
	return 0.0 if band == "calm" else float(bands()[band])


static func _recent(sim: Simulation, observer: int, subject: int) -> Array:
	var since := sim.tick - int(Content.get_value("treaties", "CONCERN_MEMORY_DAYS")) * Defs.DAY_TICKS
	# One report per event (the surest), so repeated news of one thing counts once.
	var by_event := {}
	var order: Array[int] = []
	for r: Dictionary in sim.reports:
		if not r["delivered"] or r["superseded"] or int(r["recipientKingdomId"]) != observer or int(r["subjectKingdomId"]) != subject or int(r["eventTick"]) < since:
			continue
		var e := int(r["eventId"])
		if not by_event.has(e):
			order.append(e)
			by_event[e] = r
		elif float(WEIGHT[r["certainty"]]) > float(WEIGHT[by_event[e]["certainty"]]):
			by_event[e] = r
	return order.map(func(e: int) -> Dictionary: return by_event[e])


## {score, band, reasons}.
static func evaluate(sim: Simulation, observer: int, subject: int) -> Dictionary:
	if observer == subject:
		return {"score": 0, "band": "calm", "reasons": []}
	var news := _recent(sim, observer, subject)
	var nm := Kingdoms.name_of(sim, subject, "They")
	var reasons: Array = []
	var ally := Diplomacy.stance_of(sim, observer, subject) == "ally"
	var military := 0.0
	# Troops at a border are near by definition; only distant build-ups are discounted for distance.
	var border := 0.0
	var claims := 0.0
	var conquest := 0.0
	var broken := 0.0
	var prosperity := 0.0
	for r: Dictionary in news:
		var w := float(WEIGHT[r["certainty"]])
		var mag := float(r["magnitude"])
		match str(r["kind"]):
			"border-forces":
				border += mag * 3 * w
			"military-buildup":
				military += mag * 2 * w
			"claim":
				if r["certainty"] != "rumor":
					claims += 8
			"conquest":
				if r["certainty"] != "rumor":
					conquest += 25
			"treaty-broken":
				if r["certainty"] != "rumor":
					broken += 20
			"prosperity":
				prosperity += 2 * mag * w
	military = minf(40, military)
	border = minf(60, border)
	claims = minf(20, claims)
	broken = minf(30, broken)
	prosperity = minf(20, prosperity)
	var score := 0.0
	var near := 0.0
	if border > 0:
		if ally:
			near -= border / 2
		else:
			near += border
			reasons.append("%s has troops at the border" % nm)
	if military > 0:
		if ally:
			score -= military / 2
			reasons.append("%s's soldiers are allies' soldiers — a comfort" % nm)
		else:
			score += military
			reasons.append("%s has troops or soldiers where we can see them" % nm)
	if claims > 0:
		score += claims
		reasons.append("%s has claimed land near our borders" % nm)
	if conquest > 0:
		score += conquest
		reasons.append("%s has conquered land" % nm)
	if broken > 0:
		score += broken
		reasons.append("%s broke a promise" % nm)
	if prosperity > 0:
		score += prosperity
		reasons.append("%s is growing prosperous" % nm)
	# Tempering: distance, trust, treaties.
	var a := Diplomacy.seat_of(sim, observer)
	var b := Diplomacy.seat_of(sim, subject)
	var far := minf(0.4, JsMath.hypot(a.x - b.x, a.y - b.y) / 1000.0)
	score *= 1 - far
	score += near
	score -= (Diplomacy.trust_of(sim, observer, subject) - 50) / 5.0
	if not Diplomacy.active_treaty(sim, observer, subject, "trade").is_empty():
		score -= 10
	if not Diplomacy.active_treaty(sim, observer, subject, "nonAggression").is_empty():
		score -= 15
	var final_score := maxi(0, mini(100, int(JsMath.round_js(score))))
	# Prosperity alone can make a neighbour watchful, never more.
	if prosperity > 0 and military == 0 and border == 0 and claims == 0 and conquest == 0 and broken == 0:
		final_score = mini(final_score, int(bands()["concerned"]) - 1)
	return {"score": final_score, "band": band_for(final_score), "reasons": reasons}


## Recomputes concern (every other day per pair, or now with `force`), warns the player, and
## catches broken reassurances.
static func update(sim: Simulation, force: bool = false) -> void:
	var ks := sim.kingdoms
	var hysteresis := float(Content.get_value("treaties", "BAND_HYSTERESIS"))
	var reassurance := int(Content.get_value("treaties", "REASSURANCE_DAYS")) * Defs.DAY_TICKS
	for i in ks.size():
		for j in ks.size():
			if i == j:
				continue
			if not force and (i + j + sim.day()) % 2 != 0:
				continue
			var obs: Dictionary = ks[i]
			var subj: Dictionary = ks[j]
			var oid := int(obs["id"])
			var sid := int(subj["id"])
			var key := "%d>%d" % [oid, sid]
			var c := evaluate(sim, oid, sid)
			var st: Dictionary = sim.concern_states.get(key, {"band": "calm", "score": 0, "lastWarnTick": NEVER, "lastWarnBand": "calm", "reassuredTick": null, "reassuredEvidence": 0, "lastEvidence": 0})
			# Bands rise at once but only fall once the score is well below where they began.
			var band: String = c["band"]
			if ORDER.find(band) < ORDER.find(st["band"]) and float(c["score"]) > _entry(st["band"]) - hysteresis:
				band = st["band"]
			var evidence := 0
			for r: Dictionary in sim.reports:
				if r["delivered"] and int(r["recipientKingdomId"]) == oid and int(r["subjectKingdomId"]) == sid and (r["kind"] == "border-forces" or r["kind"] == "military-buildup" or r["kind"] == "claim"):
					evidence = maxi(evidence, int(r["id"]))
			# A reassurance contradicted by troops or claims seen soon after costs more trust than it earned.
			if st["reassuredTick"] != null and evidence > int(st["reassuredEvidence"]) and sim.tick - int(st["reassuredTick"]) <= reassurance:
				Diplomacy.change_trust(sim, oid, sid, -25)
				st["reassuredTick"] = null
				(c["reasons"] as Array).append("%s broke its reassurance" % subj["name"])
			var new_cause := evidence > int(st["lastEvidence"])
			if not obs["player"] and subj["player"] and ORDER.find(band) >= ORDER.find("concerned"):
				var rose := ORDER.find(band) > ORDER.find(st["lastWarnBand"])
				var repeat := new_cause and sim.tick - int(st["lastWarnTick"]) >= Defs.DAY_TICKS
				if rose or repeat:
					var w := {"id": sim.alloc_id(), "from": oid, "to": sid, "band": band, "reasons": (c["reasons"] as Array).slice(0, 4), "tick": sim.tick, "state": "open", "response": null,
						"actions": ["reassure", "investigate", "negotiate", "propose-pact", "prepare", "dismiss"]}
					sim.warnings.append(w)
					st["lastWarnTick"] = sim.tick
					st["lastWarnBand"] = band
					sim.toast("%s is %s about you: %s." % [obs["name"], band, (w["reasons"] as Array)[0] if not (w["reasons"] as Array).is_empty() else "see the Realm window"], "warn")
					sim.emit({"type": "important"})
			if ORDER.find(band) < ORDER.find("concerned"):
				st["lastWarnBand"] = band
			var next := st.duplicate()
			next["band"] = band
			next["score"] = c["score"]
			next["lastEvidence"] = maxi(int(st["lastEvidence"]), evidence)
			sim.concern_states[key] = next
	if sim.warnings.size() > 60:
		sim.warnings = sim.warnings.slice(sim.warnings.size() - 60)


## The player's answer to a warning.
static func respond(sim: Simulation, warning_id: Variant, action: Variant) -> Dictionary:
	var w := {}
	for x: Dictionary in sim.warnings:
		if (warning_id is int or warning_id is float) and int(x["id"]) == int(warning_id):
			w = x
	if w.is_empty() or int(w["to"]) != 0:
		return {"ok": false, "message": "No such warning"}
	if w["state"] != "open":
		return {"ok": false, "message": "You have already answered that warning"}
	var from := int(w["from"])
	var nm := Kingdoms.name_of(sim, from)
	var me := Kingdoms.player(sim)
	var st: Dictionary = sim.concern_states.get("%d>0" % from, {})
	var message := ""
	match action:
		"reassure":
			Diplomacy.change_trust(sim, from, 0, 10)
			if not st.is_empty():
				st["reassuredTick"] = sim.tick
				st["reassuredEvidence"] = st["lastEvidence"]
			message = "You assured %s of your peaceful intent. Troops or claims seen near them soon would make this a broken promise." % nm
		"investigate":
			if me["council"]["envoy"] == null:
				return {"ok": false, "message": "Appoint an %s to investigate" % Kingdoms.value("COUNCIL_POSTS")["envoy"]["name"]}
			var ev := {}
			for e: Dictionary in sim.world_events:
				if int(e["subject"]) == from:
					ev = e
			if not ev.is_empty():
				News.record_observation(sim, 0, from, ev["kind"], null, {"eventId": ev["id"], "certainty": "confirmed", "source": "envoy", "delay": Diplomacy.letter_ticks(sim, 0, from) * 2})
			message = "Your envoy rides to %s; a confirmed report will follow." % nm if not ev.is_empty() else "Your envoy found nothing new to report from %s." % nm
		"negotiate":
			message = "Open talks with %s: propose a treaty from the Realm window." % nm
		"propose-pact":
			var res := Diplomacy.propose(sim, "nonAggression", from, {"durationDays": 16})
			if not bool(res["ok"]):
				return res
			message = str(res.get("message", ""))
		"prepare":
			message = "You take %s's warning as a sign to look to your defences." % nm
		"dismiss":
			Diplomacy.change_trust(sim, from, 0, -3)
			message = "You dismissed %s's concerns." % nm
		_:
			return {"ok": false, "message": "Unknown answer"}
	w["state"] = "answered"
	w["response"] = action
	return {"ok": true, "message": message}
