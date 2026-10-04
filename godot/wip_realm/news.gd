class_name News
## News and knowledge (src/game/sim/news.ts). sim.world_events is the internal truth; kingdoms (and
## the player) only ever act on delivered reports. A report names its source, how sure it is, when
## the thing was seen and when the report arrived. Relaying keeps the original event id, so news
## passed around a circle of allies is never mistaken for independent confirmation. Reading news
## never reveals the map.
##
## Events: {id, kind, subject, magnitude, location {x, y} | null, tick}.
## Reports: {id, eventId, kind, sourceKingdomId, sourceKind, subjectKingdomId, recipientKingdomId,
## certainty rumor|observed|confirmed, observedTick, arrivalTick | null, supersedes, superseded,
## delivered, magnitude, location, relayedBy, eventTick}.

const RANK := {"rumor": 0, "observed": 1, "confirmed": 2}


static func _loc(location: Variant) -> Variant:
	if location is Vector2i:
		return {"x": (location as Vector2i).x, "y": (location as Vector2i).y}
	if location is Dictionary:
		return (location as Dictionary).duplicate()
	return null


static func record_event(sim: Simulation, kind: String, subject: int, magnitude: float, location: Variant) -> Dictionary:
	var e := {"id": sim.alloc_id(), "kind": kind, "subject": subject, "magnitude": magnitude, "location": _loc(location), "tick": sim.tick}
	sim.world_events.append(e)
	var limit := int(Content.get_value("treaties", "EVENT_LIMIT"))
	if sim.world_events.size() > limit:
		sim.world_events = sim.world_events.slice(sim.world_events.size() - limit)
	return e


## Queues a report of something `subject` did, for `observer`. Options: eventId, certainty, source,
## delay (ticks, or null to wait for a merchant), magnitude, sourceKingdomId, relayedBy. Returns
## the report id (an existing one when this adds nothing new).
static func record_observation(sim: Simulation, observer: int, subject: int, kind: String, location: Variant, opts: Dictionary = {}) -> int:
	var ev := {}
	if opts.has("eventId"):
		for e: Dictionary in sim.world_events:
			if int(e["id"]) == int(opts["eventId"]):
				ev = e
				break
	else:
		ev = record_event(sim, kind, subject, float(opts.get("magnitude", 1)), location)
	var event_id := int(ev["id"]) if not ev.is_empty() else int(opts.get("eventId", -1))
	var certainty: String = opts.get("certainty", "observed")
	# One report per event per recipient, unless the new one is surer.
	var best := {}
	for r: Dictionary in sim.reports:
		if int(r["recipientKingdomId"]) == observer and int(r["eventId"]) == event_id and not r["superseded"]:
			if best.is_empty() or int(RANK[r["certainty"]]) > int(RANK[best["certainty"]]):
				best = r
	if not best.is_empty() and int(RANK[best["certainty"]]) >= int(RANK[certainty]):
		return int(best["id"])
	var delay: Variant = opts.get("delay", 0)
	# A messenger brings news home twice as fast.
	if observer == 0 and delay != null and int(delay) > 0 and has_messenger(sim):
		delay = roundi(int(delay) / 2.0)
	var r := {"id": sim.alloc_id(), "eventId": event_id, "kind": kind, "sourceKingdomId": opts.get("sourceKingdomId"), "sourceKind": opts.get("source", "scout"),
		"subjectKingdomId": subject, "recipientKingdomId": observer, "certainty": certainty,
		"observedTick": sim.tick, "arrivalTick": null if delay == null else sim.tick + int(delay),
		"supersedes": best["id"] if not best.is_empty() else null, "superseded": false, "delivered": false,
		"magnitude": opts.get("magnitude", ev.get("magnitude", 1)), "location": _loc(location),
		"relayedBy": (opts.get("relayedBy", []) as Array).duplicate(), "eventTick": ev.get("tick", sim.tick)}
	sim.reports.append(r)
	return int(r["id"])


## Letters and news reach the player twice as fast while a messenger serves them.
static func has_messenger(sim: Simulation) -> bool:
	for s in sim.settlers:
		if s.job == "messenger" and s.kingdom_id == 0 and s.captive.is_empty() and s.life_stage == "adult":
			return true
	return false


static func _deliver(sim: Simulation, r: Dictionary) -> void:
	r["delivered"] = true
	if r["supersedes"] != null:
		for old: Dictionary in sim.reports:
			if int(old["id"]) == int(r["supersedes"]):
				old["superseded"] = true
	sim.news_flags[int(r["recipientKingdomId"])] = true


## Moves every report whose time has come into its recipient's knowledge, keeping inboxes bounded.
static func deliver_reports(sim: Simulation) -> void:
	for r: Dictionary in sim.reports:
		if not r["delivered"] and r["arrivalTick"] != null and int(r["arrivalTick"]) <= sim.tick:
			_deliver(sim, r)
	var limit := int(Content.get_value("treaties", "INBOX_LIMIT"))
	var by_recipient := {}
	for r: Dictionary in sim.reports:
		if not r["delivered"]:
			continue
		var who := int(r["recipientKingdomId"])
		if not by_recipient.has(who):
			by_recipient[who] = []
		(by_recipient[who] as Array).append(r)
	var drop := {}
	for who: int in by_recipient:
		var list: Array = by_recipient[who]
		if list.size() <= limit:
			continue
		var keyed: Array[Array] = []
		for i in list.size():
			keyed.append([int(list[i]["arrivalTick"]), i, list[i]])
		keyed.sort_custom(func(a: Array, b: Array) -> bool: return int(a[0]) < int(b[0]) or (int(a[0]) == int(b[0]) and int(a[1]) < int(b[1])))
		var extra := list.size() - limit
		for i in extra:
			drop[int(keyed[i][2]["id"])] = true
		sim.news_summaries[who] = int(sim.news_summaries.get(who, 0)) + extra
	if not drop.is_empty():
		sim.reports = sim.reports.filter(func(r: Dictionary) -> bool: return not drop.has(int(r["id"])))


## Merchant-carried news arrives with a merchant.
static func deliver_merchant_news(sim: Simulation, recipient: int) -> void:
	for r: Dictionary in sim.reports:
		if r["delivered"] or int(r["recipientKingdomId"]) != recipient or r["arrivalTick"] != null:
			continue
		r["arrivalTick"] = sim.tick
		_deliver(sim, r)


## What a kingdom has actually been told, newest first.
static func knowledge_of(sim: Simulation, recipient: int) -> Array:
	var list: Array = sim.reports.filter(func(r: Dictionary) -> bool: return int(r["recipientKingdomId"]) == recipient and r["delivered"])
	var keyed: Array[Array] = []
	for i in list.size():
		keyed.append([int(list[i]["arrivalTick"]), i, list[i]])
	keyed.sort_custom(func(a: Array, b: Array) -> bool: return int(a[0]) > int(b[0]) or (int(a[0]) == int(b[0]) and int(a[1]) < int(b[1])))
	return keyed.map(func(e: Array) -> Dictionary: return e[2])


## The most recent thing a kingdom knows of this kind about a subject (by when it happened).
static func latest_about(sim: Simulation, recipient: int, subject: int, kind: String) -> Dictionary:
	var best := {}
	for r: Dictionary in sim.reports:
		if not r["delivered"] or r["superseded"] or int(r["recipientKingdomId"]) != recipient or int(r["subjectKingdomId"]) != subject or r["kind"] != kind:
			continue
		if best.is_empty() or int(r["eventTick"]) > int(best["eventTick"]) or (int(r["eventTick"]) == int(best["eventTick"]) and int(RANK[r["certainty"]]) > int(RANK[best["certainty"]])):
			best = r
	return best


## Passes a delivered report on (an ally sharing news). The event id and chain of relayers are kept.
static func relay(sim: Simulation, report_id: int, to: int, delay: int = 0) -> int:
	var r := {}
	for x: Dictionary in sim.reports:
		if int(x["id"]) == report_id:
			r = x
	if r.is_empty() or not r["delivered"] or to == int(r["recipientKingdomId"]):
		return -1
	var chain: Array = (r["relayedBy"] as Array).duplicate()
	chain.append(int(r["recipientKingdomId"]))
	return record_observation(sim, to, int(r["subjectKingdomId"]), r["kind"], r["location"], {"eventId": r["eventId"], "certainty": r["certainty"], "source": "ally",
		"delay": delay, "magnitude": r["magnitude"], "sourceKingdomId": r["recipientKingdomId"], "relayedBy": chain})
