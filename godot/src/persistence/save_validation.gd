class_name SaveValidation
extends RefCounted
## Structural check of a current-version save, the same checks as validateSave in
## src/game/save/migrations.ts, so a file the browser game would refuse is refused here too (and
## nothing damaged reaches the simulation). Returns the first problem in the browser's words, or "".


static func _num(v: Variant) -> bool:
	return v is int or (v is float and is_finite(v))


static func _int(v: Variant) -> bool:
	return v is int or (v is float and is_finite(v) and float(v) == floorf(v))


static func _arr(v: Variant) -> bool:
	return v is Array


static func _all_int(v: Variant) -> bool:
	if not v is Array:
		return false
	for x: Variant in v:
		if not _int(x):
			return false
	return true


static func _resource(v: Variant) -> bool:
	return v is String and (Content.get_value("resources", "RESOURCES") as Dictionary).has(v)


static func _job(v: Variant) -> bool:
	return v is String and Defs.is_job(v)


static func _inventory(v: Variant, what: String) -> String:
	if not v is Dictionary:
		return "%s inventory" % what
	for k: Variant in v:
		if not _resource(k):
			return "%s has unknown resource \"%s\"" % [what, k]
		if not _num(v[k]) or float(v[k]) < 0:
			return "%s has a bad amount of %s" % [what, k]
	return ""


static func _levels(type: String, b: Dictionary = {}) -> int:
	var lv: Array = Defs.building(type).get("levels", [])
	# A new player's founding camp has the campaign's steps (see Campaign).
	# (A building's extra fields are saved beside its own; Building.extra.)
	if type == "camp" and b.get("foundingCamp") == true:
		return Campaign.CAMP_LEVELS.size()
	return maxi(1, lv.size())


static func check(save: Dictionary) -> String:
	var meta: Variant = save.get("meta")
	if not (meta is Dictionary and meta.get("name") is String and _int(meta.get("seed"))):
		return "meta"
	var sim: Variant = save.get("sim")
	if not (sim is Dictionary and _int(sim.get("tick")) and float(sim["tick"]) >= 0 and _int(sim.get("nextId"))):
		return "simulation header"
	if not _int(sim.get("rngState")):
		return "random state"
	var r := _settlers(sim)
	if r == "":
		r = _buildings(sim)
	if r == "":
		r = _rest(sim)
	if r == "":
		r = _world(save.get("world"))
	return r


static func _settlers(sim: Dictionary) -> String:
	if not _arr(sim.get("settlers")):
		return "settler list"
	var ids := {}
	var rulers := 0
	for sv: Variant in sim["settlers"]:
		if not sv is Dictionary:
			return "settler id"
		var s: Dictionary = sv
		if not _int(s.get("id")) or ids.has(int(s["id"])):
			return "settler id"
		var id := int(s["id"])
		ids[id] = true
		if not (s.get("name") is String and _num(s.get("x")) and _num(s.get("y"))):
			return "settler %d position" % id
		if not _job(s.get("job")):
			return "settler %d job" % id
		if not (_num(s.get("hunger")) and _num(s.get("energy"))):
			return "settler %d needs" % id
		if not s.get("appearance") is Dictionary:
			return "settler %d appearance" % id
		var c: Variant = s.get("carrying")
		if c != null and not (c is Dictionary and _resource(c.get("res")) and _num(c.get("amount"))):
			return "settler %d carrying" % id
		if not (s.get("areaId") == null or _int(s.get("areaId"))):
			return "settler %d work area" % id
		var pr: Variant = s.get("priorities")
		if pr != null:
			var ok: bool = pr is Array
			if ok:
				for k: Variant in pr:
					if not (k is String and SettlerBrain.WORK_KINDS.has(k)):
						ok = false
			if not ok:
				return "settler %d work order" % id
		if not (s.get("settlementId") == null or _int(s.get("settlementId"))):
			return "settler %d settlement" % id
		if not ((s.get("lifeStage") == "adult" or s.get("lifeStage") == "child") and _int(s.get("ageTicks")) and float(s["ageTicks"]) >= 0):
			return "settler %d age" % id
		if not (s.get("householdId") == null or _int(s.get("householdId"))):
			return "settler %d household" % id
		if not (s.get("awayOn") == null or _int(s.get("awayOn"))):
			return "settler %d caravan" % id
		if not _int(s.get("kingdomId")):
			return "settler %d allegiance" % id
		if not s.has("military") or s["military"] != null:
			var m: Variant = s.get("military")
			if not (m is Dictionary and ["infantry", "archer", "knight"].has(m.get("unit")) and ["training", "ready", "deployed"].has(m.get("state"))
					and _num(m.get("trained")) and _int(m.get("companyId"))):
				return "settler %d service" % id
			var g := _inventory(m.get("gear"), "settler %d gear" % id)
			if g != "":
				return g
		var cap: Variant = s.get("captive")
		if not (cap == null or (cap is Dictionary and _int(cap.get("by")))):
			return "settler %d captivity" % id
		if s.has("ruler") and not s["ruler"] is bool:
			return "settler %d ruler" % id
		if s.get("ruler") == true:
			rulers += 1
		if s.has("boostUntil") and not _num(s["boostUntil"]):
			return "settler %d rally" % id
		if s.has("hp") and not (_num(s["hp"]) and float(s["hp"]) > 0 and float(s["hp"]) <= 100):
			return "settler %d health" % id
		if s.has("training"):
			var t: Variant = s["training"]
			if not (t is Dictionary and _job(t.get("role")) and _int(t.get("hall")) and _num(t.get("progress")) and float(t["progress"]) >= 0):
				return "settler %d training" % id
		if s.has("sideJob") and not _job(s["sideJob"]):
			return "settler %d side job" % id
		if s.has("hold") and not s["hold"] is bool:
			return "settler %d hold" % id
	if rulers > 1:
		return "more than one ruler"
	return ""


static func _buildings(sim: Dictionary) -> String:
	if not _arr(sim.get("buildings")):
		return "building list"
	var ids := {}
	for sv: Variant in sim["settlers"]:
		ids[int(sv["id"])] = true
	for bv: Variant in sim["buildings"]:
		if not bv is Dictionary:
			return "building id"
		var b: Dictionary = bv
		if not _int(b.get("id")) or ids.has(int(b["id"])):
			return "building id"
		var id := int(b["id"])
		ids[id] = true
		if not (b.get("type") is String and Defs.is_building(b["type"])):
			return "building %d type" % id
		var type: String = b["type"]
		if not (_int(b.get("x")) and _int(b.get("y")) and b.get("built") is bool and _num(b.get("progress"))):
			return "building %d fields" % id
		for pair: Array in [["delivered", "building %d delivered" % id], ["inventory", "building %d" % id], ["wants", "building %d stock targets" % id]]:
			var e := _inventory(b.get(pair[0]), pair[1])
			if e != "":
				return e
		if not _all_int(b.get("workers")):
			return "building %d workers" % id
		if b.has("mine"):
			var m: Variant = b["mine"]
			if not (m is Dictionary and _int(m.get("depositId")) and [1, 2, 3].has(int(m.get("level", 0))) and _int(m.get("level"))):
				return "building %d mine" % id
		if b.has("level") and not (_int(b["level"]) and int(b["level"]) >= 1 and int(b["level"]) <= _levels(type, b)):
			return "building %d level" % id
		if b.has("upgrade"):
			var u: Variant = b["upgrade"]
			if not (u is Dictionary and _int(u.get("to")) and _int(u.get("progress")) and float(u["progress"]) >= 0 and int(u["to"]) <= _levels(type, b)):
				return "building %d upgrade" % id
			var e := _inventory(u.get("paid"), "building %d upgrade payment" % id)
			if e != "":
				return e
		if b.has("quarry"):
			var q: Variant = b["quarry"]
			if not (q is Dictionary and _int(q.get("extracted")) and float(q["extracted"]) >= 0):
				return "building %d quarry" % id
		if Defs.building(type).get("span", false):
			if not (_int(b.get("w")) and _int(b.get("h")) and float(b["w"]) >= 1 and float(b["h"]) >= 1):
				return "building %d size" % id
		var f: Variant = b.get("field")
		if f is Dictionary and not f.is_empty():
			if not (f.get("crop") == null or (f.get("crop") is String and Defs.is_crop(f["crop"]))):
				return "field %d crop" % id
			if not ["wild", "tilled", "growing", "ripe"].has(f.get("state")):
				return "field %d state" % id
		if b.has("pen"):
			var p: Variant = b["pen"]
			if not (p is Dictionary and _num(p.get("breed")) and _num(p.get("ready")) and float(p["ready"]) >= 0):
				return "building %d pen" % id
	for k: int in ids:
		if k >= float(sim["nextId"]):
			return "id counter"
	return ""


static func _rest(sim: Dictionary) -> String:
	if not (_arr(sim.get("designations")) and _arr(sim.get("regrowth"))):
		return "designations"
	if not sim.get("stats") is Dictionary:
		return "stats"
	var milestones: Dictionary = Content.get_value("progression", "MILESTONES")
	if not _arr(sim.get("reached")):
		return "progression"
	for m: Variant in sim["reached"]:
		if not (m is String and milestones.has(m)):
			return "progression"
	if not _arr(sim.get("workAreas")):
		return "work areas"
	for av: Variant in sim["workAreas"]:
		if not av is Dictionary:
			return "work area"
		var a: Dictionary = av
		if not (_int(a.get("id")) and a.get("name") is String and a.get("kind") is String and WorkArea.KINDS.has(a["kind"])):
			return "work area"
		if a.has("wanted") and not (_int(a["wanted"]) and float(a["wanted"]) >= 0):
			return "work area staffing"
		if a.has("crop") and not (a["crop"] == null or (a["crop"] is String and Defs.is_crop(a["crop"]))):
			return "work area crop"
		if not (_int(a.get("x0")) and _int(a.get("y0")) and _int(a.get("x1")) and _int(a.get("y1"))):
			return "work area bounds"
	if not _arr(sim.get("chronicle")):
		return "chronicle"
	if not _arr(sim.get("settlements")):
		return "settlements"
	for st: Variant in sim["settlements"]:
		if not (st is Dictionary and _int(st.get("id")) and st.get("name") is String):
			return "settlements"
	if not (sim.get("growthMode") == "legacy" or sim.get("growthMode") == "deliberate"):
		return "growth mode"
	if not _arr(sim.get("households")):
		return "households"
	for hv: Variant in sim["households"]:
		if not (hv is Dictionary and _int(hv.get("id")) and _all_int(hv.get("adults")) and (hv["adults"] as Array).size() == 2):
			return "household"
		var h: Dictionary = hv
		if not (_all_int(h.get("children")) and _num(h.get("cooldownUntil"))):
			return "household %d" % int(h["id"])
		if not h.has("pending") or h["pending"] != null:
			var p: Variant = h.get("pending")
			if not (p is Dictionary and _int(p.get("stableTicks")) and float(p["stableTicks"]) >= 0 and (p.get("claimId") == null or _int(p.get("claimId"))) and p.get("blocked") is String):
				return "household %d pending child" % int(h["id"])
	if not _arr(sim.get("bedClaims")):
		return "bed claims"
	for cv: Variant in sim["bedClaims"]:
		var o: Variant = cv.get("owner") if cv is Dictionary else null
		if not (cv is Dictionary and _int(cv.get("id")) and _int(cv.get("homeId")) and o is Dictionary and (o.get("kind") == "birth" or o.get("kind") == "recruit") and _int(o.get("id"))):
			return "bed claim"
	var offer: Variant = sim.get("offer")
	if not (offer == null or (offer is Dictionary and _int(offer.get("id")) and _num(offer.get("expiresTick")))):
		return "visitor"
	if not _num(sim.get("nextVisitor")):
		return "next visitor"
	if not (sim.get("lastRecruit") == null or _num(sim.get("lastRecruit"))):
		return "last recruit"
	var geo: Variant = sim.get("geology")
	if not (geo is Dictionary and _int(geo.get("version")) and _arr(geo.get("cells"))):
		return "geology"
	for c: Variant in geo["cells"]:
		if not (c is Array and (c as Array).size() == 2 and _int(c[0]) and (c[1] == null or (_int(c[1]) and float(c[1]) >= 0))):
			return "geology cell"
	if not _arr(sim.get("routes")):
		return "routes"
	for rv: Variant in sim["routes"]:
		if not (rv is Dictionary and _int(rv.get("id")) and _int(rv.get("sourceId")) and _int(rv.get("destId")) and _resource(rv.get("res")) and _int(rv.get("target"))):
			return "routes"
	if not _arr(sim.get("manifests")):
		return "caravans"
	for mv: Variant in sim["manifests"]:
		if not (mv is Dictionary and _int(mv.get("id")) and _int(mv.get("crewId")) and _int(mv.get("sourceId")) and _int(mv.get("destId"))
				and ["outbound", "returning"].has(mv.get("state")) and _num(mv.get("arriveTick")) and _num(mv.get("legTicks"))):
			return "caravan"
		var e := _inventory(mv.get("cargo"), "caravan %d cargo" % int(mv["id"]))
		if e != "":
			return e
	if not _arr(sim.get("parties")):
		return "merchants"
	for pv: Variant in sim["parties"]:
		if not (pv is Dictionary and _int(pv.get("id")) and ["travelling", "arriving", "lodging", "leaving"].has(pv.get("state")) and _num(pv.get("x")) and _num(pv.get("y"))):
			return "merchant"
		var e := _inventory(pv.get("stock"), "merchant %d stock" % int(pv["id"]))
		if e != "":
			return e
	if not (_all_int(sim.get("knownRegions")) and _num(sim.get("nextMerchant"))):
		return "regions"
	var r := _realm(sim)
	if r != "":
		return r
	if not _arr(sim.get("claims")):
		return "claims"
	for c: Variant in sim["claims"]:
		if not (c is Array and (c as Array).size() >= 3 and _int(c[0]) and _int(c[1]) and _int(c[2])):
			return "claims"
	if not _arr(sim.get("recruits")):
		return "recruits"
	for rv: Variant in sim["recruits"]:
		if not (rv is Dictionary and _int(rv.get("id")) and _int(rv.get("settlementId")) and (rv.get("state") == "travelling" or rv.get("state") == "refunding") and _num(rv.get("arrivesTick"))):
			return "recruit"
		if not (rv.get("claimId") == null or _int(rv.get("claimId"))):
			return "recruit %d bed" % int(rv["id"])
		var e := _inventory(rv.get("escrow"), "recruit %d escrow" % int(rv["id"]))
		if e != "":
			return e
	var session: Variant = sim.get("session")
	if not (session == null or (session is Dictionary and _int(session.get("startTick")))):
		return "session"
	if sim.has("rallyReadyAt") and not _num(sim["rallyReadyAt"]):
		return "rally"
	if sim.has("chief"):
		var ch: Variant = sim["chief"]
		if not (ch is Dictionary and _num(ch.get("nextAt")) and ch.get("adviceReady") is bool and ch.get("advice") is String):
			return "assistant chief"
	if sim.has("animals"):
		if not _arr(sim["animals"]):
			return "animals"
		var building_ids := {}
		for bv: Variant in sim["buildings"]:
			building_ids[int(bv["id"])] = true
		for av: Variant in sim["animals"]:
			if not (av is Dictionary and _int(av.get("id")) and av.get("species") is String and Animals.is_species(av["species"])
					and _num(av.get("x")) and _num(av.get("y")) and _int(av.get("homeX")) and _int(av.get("homeY"))):
				return "animal"
			var a: Dictionary = av
			if not (a.get("penId") == null or (_int(a.get("penId")) and building_ids.has(int(a["penId"])))):
				return "animal %d pen" % int(a["id"])
			if a.has("hp") and not (_num(a["hp"]) and float(a["hp"]) > 0):
				return "animal %d health" % int(a["id"])
	if sim.has("animalRng") and not _int(sim["animalRng"]):
		return "animal random state"
	return ""


static func _realm(sim: Dictionary) -> String:
	if not _arr(sim.get("kingdoms")):
		return "kingdoms"
	var players := 0
	for kv: Variant in sim["kingdoms"]:
		if kv is Dictionary and kv.get("player") == true:
			players += 1
	if players != 1:
		return "kingdoms"
	for kv: Variant in sim["kingdoms"]:
		var k: Dictionary = kv
		var kid := str(k.get("id"))
		if not (_int(k.get("id")) and k.get("name") is String and _num(k.get("treasury")) and float(k["treasury"]) >= 0 and _num(k.get("trust"))):
			return "kingdom %s" % kid
		if not (["none", "modest", "high"].has(k.get("policy")) and ["protected-frontier", "full-conquest"].has(k.get("conflictMode"))):
			return "kingdom %s settings" % kid
		var home: Variant = k.get("homeland")
		if home != null:
			var ok: bool = home is Array
			if ok:
				for q: Variant in home:
					if not (q is Dictionary and _int(q.get("x")) and _int(q.get("y"))):
						ok = false
			if not ok:
				return "kingdom %s homeland" % kid
	var dip: Variant = sim.get("diplomacy")
	if not dip is Dictionary:
		return "diplomacy"
	for key: String in ["worldEvents", "reports", "newsSummaries", "stances", "trust", "wars", "offers", "incidents", "warnings", "concernStates", "warPlans", "commitments"]:
		if not _arr(dip.get(key)):
			return "diplomacy %s" % key
	for o: Variant in dip["offers"]:
		if not (o is Dictionary and _int(o.get("id")) and _num(o.get("escrow")) and float(o["escrow"]) >= 0 and o.get("state") is String):
			return "treaty offer"
	for c: Variant in dip["commitments"]:
		if not (c is Dictionary and _int(c.get("id")) and _num(c.get("escrow")) and float(c["escrow"]) >= 0 and c.get("terms") is Dictionary and _arr(c["terms"].get("companies"))):
			return "coalition commitment"
	for kv: Variant in sim["kingdoms"]:
		if not _arr((kv as Dictionary).get("companies")):
			return "kingdom %s companies" % str(kv.get("id"))
	if not _num(sim.get("horseDay")):
		return "stables"
	var war: Variant = sim.get("war")
	if not (war is Dictionary and _arr(war.get("states")) and _arr(war.get("sieges")) and _arr(war.get("occupationTimers"))):
		return "war"
	return ""


static func _world(world: Variant) -> String:
	if not (world is Dictionary and _arr(world.get("chunks"))):
		return "world"
	if world.has("habitat") and not (world["habitat"] is String and HabitatDef.ids().has(world["habitat"])):
		return "world habitat %s" % str(world["habitat"])
	for c: Variant in world["chunks"]:
		if not (c is Dictionary and _int(c.get("cx")) and _int(c.get("cy")) and c.get("explored") is String):
			return "chunk header"
	return ""
