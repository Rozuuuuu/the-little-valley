class_name People
## How the valley grows (src/game/sim/households.ts, travelers.ts visitors, population.ts).
##
## New valleys grow deliberately: a visitor comes by and settles for food and a free bed when the
## player welcomes them, and two adults can form a household and ask for a child, who is born
## after two steady days and grows up after twelve. Worlds from before families (save v4 and
## older) keep automatic arrivals ("legacy") until the player adopts deliberate growth.
##
## Guarantees kept from the browser game:
## - A bed is claimed the moment a child or traveller is promised it; claims count as used beds,
##   so no bed is ever promised twice. Claims are saved.
## - Welcome food moves into escrow when the traveller is accepted and is handed over on arrival;
##   calling them off returns all of it (held until the stores have room).
## - One traveller settles at a time, at most one every two days.
## - Children eat and sleep but take no work or orders; growth only ever pauses, with a reason.
##
## Population: the browser game stopped at 300. Here the only limit is SAFETY_LIMIT, far above any
## supported scale, so beds and food are what limit growth (owner's decision: no design cap).

const SAFETY_LIMIT := 5000
## Legacy (automatic) arrivals: food that must be in storage, food shared on arrival, cooldown.
const ARRIVAL_FOOD := 20
const ARRIVAL_COST := 10
const ARRIVAL_COOLDOWN := 900


static func _k(name: String) -> int:
	return int(Content.get_value("kingdomBalance", name))


static func _days(ticks: int) -> String:
	var d := maxi(1, ceili(float(ticks) / Defs.DAY_TICKS))
	return "%d day%s" % [d, "" if d == 1 else "s"]


# ---- counts --------------------------------------------------------------------------------

static func adults(sim: Simulation) -> Array[Settler]:
	var out: Array[Settler] = []
	for s in sim.settlers:
		if s.life_stage == "adult":
			out.append(s)
	return out


## People who will soon need a bed: settlers, expected children and travellers on their way.
static func committed_population(sim: Simulation) -> int:
	var n := sim.settlers.size()
	for h: Dictionary in sim.households:
		if h["pending"] != null:
			n += 1
	for r: Dictionary in sim.recruits:
		if r["state"] == "travelling":
			n += 1
	return n


## Unreserved goods in a settlement's stores (one settlement until settlements are ported).
static func local_available(sim: Simulation, _settlement_id: int, res: String) -> int:
	var n := 0
	for b in sim.storages():
		n += maxi(0, sim.available(b, res))
	return n


static func settlement_name(sim: Simulation, id: int) -> String:
	for st: Dictionary in sim.settlements:
		if int(st["id"]) == id:
			return str(st["name"])
	return "the valley"


# ---- bed claims ---------------------------------------------------------------------------

static func claim_counts(sim: Simulation) -> Dictionary:
	var m := {}
	for c: Dictionary in sim.bed_claims:
		m[int(c["homeId"])] = int(m.get(int(c["homeId"]), 0)) + 1
	return m


## Residents plus claims, per home.
static func bed_use_counts(sim: Simulation) -> Dictionary:
	var m := claim_counts(sim)
	for s in sim.settlers:
		if s.home_id != -1:
			m[s.home_id] = int(m.get(s.home_id, 0)) + 1
	return m


## Holds a free bed (in a real home unless `permanent_only` is false), preferring `prefer`.
## Returns the claim Dictionary, or {} if none is free.
static func claim_bed(sim: Simulation, owner_kind: String, owner_id: int, prefer: int = -1, permanent_only: bool = true) -> Dictionary:
	var counts := bed_use_counts(sim)
	var home: Building = null
	var own: Building = sim.buildings.get(prefer) if prefer != -1 else null
	if own != null and own.is_permanent_home() and int(counts.get(own.id, 0)) < own.beds():
		home = own
	if home == null:
		home = BuildingOps.find_free_bed(sim, counts, permanent_only)
	if home == null:
		return {}
	var claim := {"id": sim.alloc_id(), "homeId": home.id, "owner": {"kind": owner_kind, "id": owner_id}}
	sim.bed_claims.append(claim)
	return claim


static func release_claim(sim: Simulation, claim_id: int) -> void:
	if claim_id == -1:
		return
	sim.bed_claims = sim.bed_claims.filter(func(c: Dictionary) -> bool: return int(c["id"]) != claim_id)


static func find_claim(sim: Simulation, claim_id: int) -> Dictionary:
	for c: Dictionary in sim.bed_claims:
		if int(c["id"]) == claim_id:
			return c
	return {}


## A home with claims is going away: move each claim to another free bed, or release it (the
## owner then waits for a bed). Call after the home is removed from sim.buildings.
static func relocate_claims(sim: Simulation, home_id: int) -> void:
	var affected := sim.bed_claims.filter(func(c: Dictionary) -> bool: return int(c["homeId"]) == home_id)
	for c: Dictionary in affected:
		sim.bed_claims.erase(c)
		var owner: Dictionary = c["owner"]
		var next := claim_bed(sim, owner["kind"], int(owner["id"]), -1, owner["kind"] == "birth")
		_set_owner_claim(sim, owner, int(next["id"]) if not next.is_empty() else -1)


static func _set_owner_claim(sim: Simulation, owner: Dictionary, claim_id: int) -> void:
	if owner["kind"] == "recruit":
		for r: Dictionary in sim.recruits:
			if int(r["id"]) == int(owner["id"]):
				r["claimId"] = claim_id
	else:
		for h: Dictionary in sim.households:
			if int(h["id"]) == int(owner["id"]) and h["pending"] != null:
				(h["pending"] as Dictionary)["claimId"] = claim_id


## After loading: drop claims on missing, unfinished or wrong homes, claims nobody owns, and claims
## beyond a home's beds (residents keep their beds).
static func validate_claims(sim: Simulation) -> void:
	var used := {}
	for s in sim.settlers:
		if s.home_id != -1:
			used[s.home_id] = int(used.get(s.home_id, 0)) + 1
	var kept: Array[Dictionary] = []
	for c: Dictionary in sim.bed_claims:
		var home: Building = sim.buildings.get(int(c["homeId"]))
		var n := int(used.get(int(c["homeId"]), 0))
		var owner: Dictionary = c["owner"]
		var owned := false
		if owner["kind"] == "recruit":
			for r: Dictionary in sim.recruits:
				if int(r["claimId"]) == int(c["id"]) and r["state"] == "travelling":
					owned = true
		else:
			for h: Dictionary in sim.households:
				if h["pending"] != null and int(h["pending"]["claimId"]) == int(c["id"]):
					owned = true
		var bed_ok: bool = home != null and (home.beds() > 0 if owner["kind"] == "recruit" else home.is_permanent_home())
		if home != null and home.built and bed_ok and owned and n < home.beds():
			kept.append(c)
			used[int(c["homeId"])] = n + 1
	var kept_ids := {}
	for c in kept:
		kept_ids[int(c["id"])] = true
	for h: Dictionary in sim.households:
		if h["pending"] != null and int(h["pending"]["claimId"]) != -1 and not kept_ids.has(int(h["pending"]["claimId"])):
			(h["pending"] as Dictionary)["claimId"] = -1
	for r: Dictionary in sim.recruits:
		if int(r["claimId"]) != -1 and not kept_ids.has(int(r["claimId"])):
			r["claimId"] = -1
	sim.bed_claims = kept


# ---- households -----------------------------------------------------------------------------

static func household(sim: Simulation, id: int) -> Dictionary:
	for h: Dictionary in sim.households:
		if int(h["id"]) == id:
			return h
	return {}


## Moves a new couple into one home when some home has room for both.
static func _move_in_together(sim: Simulation, a: Settler, b: Settler) -> String:
	var counts := bed_use_counts(sim)
	if a.home_id != -1 and a.home_id == b.home_id:
		var shared: Building = sim.buildings.get(a.home_id)
		if shared != null and shared.is_permanent_home():
			return ""
	var candidates: Array[Building] = []
	for id: int in [a.home_id, b.home_id]:
		var h: Building = sim.buildings.get(id) if id != -1 else null
		if h != null:
			candidates.append(h)
	for h: Building in sim.buildings.values():
		if h.type == "familyHome":
			candidates.append(h)
	for h: Building in sim.buildings.values():
		candidates.append(h)
	for h in candidates:
		if not h.built or not h.is_permanent_home():
			continue
		var already := (1 if a.home_id == h.id else 0) + (1 if b.home_id == h.id else 0)
		if h.beds() - int(counts.get(h.id, 0)) + already >= 2:
			a.home_id = h.id
			b.home_id = h.id
			return " They now live together in the %s." % str(h.def()["name"]).to_lower()
	return " They will share a home once one has two free beds."


static func form_household(sim: Simulation, ids: Variant) -> Dictionary:
	if sim.growth_mode != "deliberate":
		return _err("Families need the deliberate growth rules — adopt them in the People panel first")
	if not ids is Array or (ids as Array).size() != 2:
		return _err("Choose exactly two adults")
	if int(ids[0]) == int(ids[1]):
		return _err("Choose two different adults")
	var a := sim.settler(int(ids[0]))
	var b := sim.settler(int(ids[1]))
	if a == null or b == null:
		return _err("Those settlers are not here any more")
	if a.life_stage == "child" or b.life_stage == "child":
		return _err("Only adults can start a household — a child must grow up first")
	for s: Settler in [a, b]:
		if s.household_id != -1:
			return _err("%s is already part of a household" % s.name)
	if a.settlement_id != b.settlement_id:
		return _err("%s and %s live in different settlements — move one of them first" % [a.name, b.name])
	var h := {"id": sim.alloc_id(), "adults": [a.id, b.id], "children": [], "pending": null, "cooldownUntil": 0}
	sim.households.append(h)
	a.household_id = int(h["id"])
	b.household_id = int(h["id"])
	var where := _move_in_together(sim, a, b)
	sim.record("family", "%s and %s started a household" % [a.name, b.name], a.x, a.y)
	sim.emit({"type": "fx", "kind": "hearts", "x": a.x, "y": a.y - 0.6})
	sim.emit({"type": "important"})
	return {"ok": true, "message": "%s and %s are now a household.%s" % [a.name, b.name, where], "id": h["id"]}


static func request_child(sim: Simulation, household_id: Variant) -> Dictionary:
	var h := household(sim, int(household_id) if household_id != null else -1)
	if h.is_empty():
		return _err("That household is gone")
	if h["pending"] != null:
		return _err("This household is already expecting a child")
	if sim.tick < int(h["cooldownUntil"]):
		return _err("This household needs to rest %s more before another child" % _days(int(h["cooldownUntil"]) - sim.tick))
	if committed_population(sim) >= SAFETY_LIMIT:
		return _err("The valley has reached %d people, the most this version can hold" % SAFETY_LIMIT)
	var a := sim.settler(int(h["adults"][0]))
	var b := sim.settler(int(h["adults"][1]))
	if a == null or b == null:
		return _err("Both parents need to be in the valley")
	if a.settlement_id != b.settlement_id:
		return _err("The parents live in different settlements")
	var min_food := _k("GROWTH_MIN_FOOD")
	var food := local_available(sim, a.settlement_id, "food")
	if food < min_food:
		return _err("Not enough food: %s needs %d food in its stores (%d now)" % [settlement_name(sim, a.settlement_id), min_food, food])
	var claim := claim_bed(sim, "birth", int(h["id"]), a.home_id)
	if claim.is_empty():
		var campers := 0
		for s in sim.settlers:
			var home: Building = sim.buildings.get(s.home_id) if s.home_id != -1 else null
			if home == null or not home.is_permanent_home():
				campers += 1
		var first := " (%d settler%s still sleep in hall bunks or camp bedrolls and will take new beds first)" % [campers, "" if campers == 1 else "s"] if campers > 0 else ""
		return _err("No free bed for a child — build a family home or house in %s%s" % [settlement_name(sim, a.settlement_id), first])
	h["pending"] = {"requestedTick": sim.tick, "stableTicks": 0, "claimId": int(claim["id"]), "blocked": ""}
	var home_b: Building = sim.buildings.get(int(claim["homeId"]))
	sim.emit({"type": "important"})
	return _ok("%s and %s are hoping for a child. A bed in the %s is set aside; the baby arrives after %s of steady food and shelter." % [a.name, b.name, str(home_b.def()["name"]).to_lower(), _days(_k("CHILD_STABLE_TICKS"))])


static func cancel_child_request(sim: Simulation, household_id: Variant) -> Dictionary:
	var h := household(sim, int(household_id) if household_id != null else -1)
	if h.is_empty():
		return _err("That household is gone")
	if h["pending"] == null:
		return _err("This household is not expecting a child")
	release_claim(sim, int(h["pending"]["claimId"]))
	h["pending"] = null
	return _ok("The household has decided to wait. The bed is free again.")


static func adopt_deliberate_growth(sim: Simulation) -> Dictionary:
	if sim.growth_mode == "deliberate":
		return _err("This valley already grows through families and travellers")
	sim.growth_mode = "deliberate"
	sim.next_visitor = sim.tick
	sim.record("family", "Adopted deliberate growth: families and welcomed travellers")
	sim.emit({"type": "important"})
	return _ok("From now on newcomers only settle when you welcome a traveller, and households can ask for children. Everyone already here stays.")


static func _birth(sim: Simulation, h: Dictionary, a: Settler, b: Settler, claim: Dictionary) -> void:
	var home: Building = sim.buildings.get(int(claim["homeId"]))
	release_claim(sim, int(claim["id"]))
	h["pending"] = null
	var e := home.entrance()
	var kid := sim.add_settler(e.x, e.y, "laborer", "", a.settlement_id)
	# Children take after their parents.
	kid.appearance["skin"] = a.appearance.get("skin", 0) if sim.rng.chance(0.5) else b.appearance.get("skin", 0)
	kid.appearance["hair"] = a.appearance.get("hair", 0) if sim.rng.chance(0.5) else b.appearance.get("hair", 0)
	kid.life_stage = "child"
	kid.age_ticks = 0
	kid.household_id = int(h["id"])
	kid.home_id = home.id
	(h["children"] as Array).append(kid.id)
	h["cooldownUntil"] = sim.tick + _k("FAMILY_COOLDOWN")
	sim.stats["births"] = int(sim.stats["births"]) + 1
	sim.toast("%s and %s welcomed a baby, %s!" % [a.name, b.name, kid.name], "good")
	sim.record("birth", "%s was born to %s and %s" % [kid.name, a.name, b.name], kid.x, kid.y)
	sim.emit({"type": "fx", "kind": "hearts", "x": kid.x, "y": kid.y - 0.6})
	sim.emit({"type": "sfx", "name": "arrival", "x": kid.x, "y": kid.y})
	sim.emit({"type": "important"})


static func _update_pending(sim: Simulation, h: Dictionary) -> void:
	var p: Dictionary = h["pending"]
	var a := sim.settler(int(h["adults"][0]))
	var b := sim.settler(int(h["adults"][1]))
	var blocked := ""
	if a == null or b == null:
		blocked = "Both parents need to be in the valley"
	elif a.settlement_id != b.settlement_id:
		blocked = "The parents live in different settlements — move them back together"
	else:
		if int(p["claimId"]) == -1:
			var c := claim_bed(sim, "birth", int(h["id"]), a.home_id)
			p["claimId"] = int(c["id"]) if not c.is_empty() else -1
		var min_food := _k("GROWTH_MIN_FOOD")
		var food := local_available(sim, a.settlement_id, "food")
		if int(p["claimId"]) == -1:
			blocked = "Waiting for a free bed in a permanent home in %s" % settlement_name(sim, a.settlement_id)
		elif food < min_food:
			blocked = "Waiting for %d food in %s's stores (%d now)" % [min_food, settlement_name(sim, a.settlement_id), food]
	p["blocked"] = blocked
	if blocked != "":
		return
	p["stableTicks"] = int(p["stableTicks"]) + Simulation.GROWTH_STEP
	var claim := find_claim(sim, int(p["claimId"]))
	if int(p["stableTicks"]) >= _k("CHILD_STABLE_TICKS") and not claim.is_empty():
		_birth(sim, h, a, b, claim)


## Children age; expected children advance while conditions hold. Every GROWTH_STEP ticks.
static func update_households(sim: Simulation) -> void:
	for s in sim.settlers:
		if s.life_stage != "child":
			continue
		s.age_ticks += Simulation.GROWTH_STEP
		if s.age_ticks >= _k("CHILD_ADULT_TICKS"):
			s.life_stage = "adult"
			s.age_ticks = 0
			s.job = "laborer"
			s.has_priorities = false
			s.priorities = []
			s.next_think = 0
			sim.toast("%s has grown up and is ready to work." % s.name, "good")
			sim.record("family", "%s grew up" % s.name, s.x, s.y)
			sim.emit({"type": "important"})
	for h: Dictionary in sim.households:
		if h["pending"] != null:
			_update_pending(sim, h)


## Where a child plays: a few tiles in front of home. Called from the settler brain.
static func play_near_home(sim: Simulation, s: Settler, home: Building) -> void:
	var days := maxi(1, ceili(float(_k("CHILD_ADULT_TICKS") - s.age_ticks) / Defs.DAY_TICKS))
	s.idle_reason = "A child — plays near home and grows up in %d day%s" % [days, "" if days == 1 else "s"]
	s.next_think = sim.tick + SettlerBrain.IDLE_BACKOFF * 3 + (s.id % 7)
	if s.task != null:
		return
	var c := Vector2i(home.x + home.w / 2, home.y + home.h + 1) if home != null else Vector2i(s.tile_x(), s.tile_y())
	var x := c.x + sim.rng.int_below(7) - 3
	var y := c.y + sim.rng.int_below(5) - 1
	if sim.walkable(x, y) and sim.world.explored(x, y):
		s.task = Task.move(x, y, true)


# ---- travellers (visitors who may settle) ---------------------------------------------------

## How often would-be settlers come by: twice as often with an inn, half again with a camp.
static func visitor_interval(sim: Simulation) -> int:
	var inn := false
	var camp := false
	for b: Building in sim.buildings.values():
		if not b.built:
			continue
		if b.def().has("lodging"):
			inn = true
		if b.type == "travelCamp":
			camp = true
	return roundi(_k("VISITOR_INTERVAL") / ((2.0 if inn else 1.0) * (1.5 if camp else 1.0)))


## Everything a settlement still lacks to welcome a traveller (empty when ready).
static func recruit_needs(sim: Simulation, settlement_id: int) -> PackedStringArray:
	var out: PackedStringArray = []
	var food := local_available(sim, settlement_id, "food")
	var need := _k("RECRUIT_FOOD") + _k("GROWTH_MIN_FOOD")
	if food < need:
		out.append("%d food in store: %d to welcome them and %d to keep (%d now)" % [need, _k("RECRUIT_FOOD"), _k("GROWTH_MIN_FOOD"), food])
	if BuildingOps.find_free_bed(sim, bed_use_counts(sim)) == null:
		out.append("a free bed (build a house or family home)")
	return out


## Why a traveller can't be welcomed right now, or "".
static func recruit_problem(sim: Simulation, settlement_id: int) -> String:
	if sim.growth_mode != "deliberate":
		return "Adopt deliberate growth first (People panel)"
	for r: Dictionary in sim.recruits:
		if r["state"] == "travelling":
			return "A traveller is already on the way — one settles at a time"
	var wait := sim.last_recruit + _k("RECRUIT_COOLDOWN") - sim.tick
	if wait > 0:
		return "The valley can welcome its next traveller in %s" % _days(wait)
	if committed_population(sim) >= SAFETY_LIMIT:
		return "The valley has reached %d people, the most this version can hold" % SAFETY_LIMIT
	var needs := recruit_needs(sim, settlement_id)
	return "%s still needs %s" % [settlement_name(sim, settlement_id), ", ".join(needs)] if not needs.is_empty() else ""


## Welcomes the waiting traveller: the bed is claimed and the food goes into escrow in one step, so
## repeated clicks or a reload can never promise the same bed or spend the same food twice.
static func accept_recruit(sim: Simulation, offer_id: Variant, settlement_id: Variant) -> Dictionary:
	if sim.offer.is_empty() or int(sim.offer["id"]) != int(offer_id if offer_id != null else -1):
		return _err("That traveller is no longer waiting")
	var sid := int(settlement_id) if settlement_id != null else -1
	var found := false
	for st: Dictionary in sim.settlements:
		if int(st["id"]) == sid:
			found = true
	if not found:
		return _err("That settlement is gone")
	var problem := recruit_problem(sim, sid)
	if problem != "":
		return _err(problem)
	var id := sim.alloc_id()
	var claim := claim_bed(sim, "recruit", id, -1, false)
	if claim.is_empty():
		return _err("No free bed in %s — build a house or family home so the traveller has somewhere to sleep" % settlement_name(sim, sid))
	var taken := _withdraw_local(sim, sid, "food", _k("RECRUIT_FOOD"))
	var r := {"id": id, "name": sim.offer["name"], "appearance": (sim.offer["appearance"] as Dictionary).duplicate(), "settlementId": sid,
		"claimId": int(claim["id"]), "state": "travelling", "escrow": {"food": taken}, "arrivesTick": sim.tick + _k("RECRUIT_TRAVEL_TICKS"), "blocked": ""}
	sim.recruits.append(r)
	sim.offer = {}
	sim.next_visitor = sim.tick + visitor_interval(sim)
	var home: Building = sim.buildings.get(int(claim["homeId"]))
	var bed := "a bed in the %s" % str(home.def()["name"]).to_lower() if home.is_permanent_home() else ("a Town Hall bunk" if home.type == "townHall" else "a camp bedroll")
	sim.emit({"type": "important"})
	return {"ok": true, "message": "%s accepted %d food and is fetching their things. They will settle in %s shortly, in %s." % [r["name"], _k("RECRUIT_FOOD"), settlement_name(sim, sid), bed], "id": id}


## Calls off a traveller who hasn't arrived: the bed is freed and all the food goes back.
static func cancel_recruit(sim: Simulation, recruit_id: Variant) -> Dictionary:
	var r: Dictionary = {}
	for x: Dictionary in sim.recruits:
		if int(x["id"]) == int(recruit_id if recruit_id != null else -1):
			r = x
	if r.is_empty() or r["state"] != "travelling":
		return _err("That traveller is not on the way")
	release_claim(sim, int(r["claimId"]))
	r["claimId"] = -1
	r["state"] = "refunding"
	r["blocked"] = ""
	_refund(sim, r)
	var still := sim.recruits.has(r)
	return _ok("%s will not settle after all. %s" % [r["name"], "Their welcome food waits at the gate until the stores have room." if still else "The food is back in storage."])


static func _withdraw_local(sim: Simulation, _sid: int, res: String, amount: int) -> int:
	var left := amount
	for b in sim.storages():
		if left <= 0:
			break
		var n := mini(left, maxi(0, sim.available(b, res)))
		if n > 0:
			Inv.add(b.inventory, res, -n)
			left -= n
	return amount - left


## Returns escrowed goods to the stores (anything that doesn't fit stays in escrow).
static func _refund(sim: Simulation, r: Dictionary) -> void:
	var hall: Building = sim.buildings.get(int(r["settlementId"]))
	var x := hall.x if hall != null else 0
	var y := hall.y if hall != null else 0
	var escrow: Dictionary = r["escrow"]
	for e in Inv.entries(escrow):
		var left := sim.deposit_anywhere(e[0], int(e[1]), x, y)
		Inv.add(escrow, e[0], -(int(e[1]) - left))
	if escrow.is_empty():
		sim.recruits.erase(r)


## A walkable, explored spot about ten tiles from the settlement's hall, where a newcomer appears.
static func arrival_spot(sim: Simulation, bed: Building) -> Vector2i:
	var camp := BuildingOps.camp_of(sim)
	var cx := camp.x + 1 if camp != null else bed.x
	var cy := camp.y + 1 if camp != null else bed.y
	for attempt in 40:
		var a := sim.rng.next() * PI * 2.0
		var rr := 9.0 + sim.rng.next() * 4.0
		var x := roundi(cx + cos(a) * rr)
		var y := roundi(cy + sin(a) * rr)
		if sim.world.explored(x, y) and sim.walkable(x, y):
			return Vector2i(x, y)
	var e := bed.entrance()
	return e if sim.walkable(e.x, e.y) else Vector2i(-99999, 0)


static func _arrive(sim: Simulation, r: Dictionary) -> void:
	if int(r["claimId"]) == -1:
		var c := claim_bed(sim, "recruit", int(r["id"]), -1, false)
		r["claimId"] = int(c["id"]) if not c.is_empty() else -1
		if int(r["claimId"]) == -1:
			r["blocked"] = "Waiting for a free bed in %s" % settlement_name(sim, int(r["settlementId"]))
			return
	var claim := find_claim(sim, int(r["claimId"]))
	var home: Building = sim.buildings.get(int(claim["homeId"])) if not claim.is_empty() else null
	if claim.is_empty() or home == null:
		r["claimId"] = -1
		return
	var spot := arrival_spot(sim, home)
	if spot.x == -99999:
		r["blocked"] = "Waiting for a clear path into the settlement"
		return
	release_claim(sim, int(claim["id"]))
	var s := sim.add_settler(spot.x, spot.y, "laborer", str(r["name"]), int(r["settlementId"]))
	s.appearance = (r["appearance"] as Dictionary).duplicate()
	s.home_id = home.id
	# The welcome package is handed over and shared out.
	r["escrow"] = {}
	sim.recruits.erase(r)
	sim.last_recruit = sim.tick
	sim.last_arrival = sim.tick
	sim.stats["arrivals"] = int(sim.stats["arrivals"]) + 1
	sim.toast("%s has settled in %s!" % [s.name, settlement_name(sim, int(r["settlementId"]))], "good")
	sim.record("arrival", "%s arrived" % s.name, s.x, s.y)
	sim.emit({"type": "sfx", "name": "arrival", "x": s.x, "y": s.y})
	sim.emit({"type": "fx", "kind": "hearts", "x": s.x, "y": s.y})
	sim.emit({"type": "arrival", "settlerId": s.id})
	sim.emit({"type": "important"})


static func _new_visitor(sim: Simulation) -> void:
	var used := {}
	for s in sim.settlers:
		used[s.name] = true
	for r: Dictionary in sim.recruits:
		used[str(r["name"])] = true
	var vname := sim.pick_name()
	for i in 5:
		if not used.has(vname):
			break
		vname = sim.pick_name()
	sim.offer = {"id": sim.alloc_id(), "name": vname, "appearance": sim.random_appearance(), "arrivedTick": sim.tick, "expiresTick": sim.tick + _k("OFFER_LIFETIME")}
	sim.toast("A traveller, %s, is visiting. They would settle for %d food — see the People panel." % [vname, _k("RECRUIT_FOOD")], "info")
	sim.emit({"type": "important"})


## Visitors come and go; accepted travellers walk in; called-off ones get their food back.
static func update_travelers(sim: Simulation) -> void:
	for r: Dictionary in sim.recruits.duplicate():
		if r["state"] == "refunding":
			_refund(sim, r)
		elif sim.tick >= int(r["arrivesTick"]):
			_arrive(sim, r)
	if sim.growth_mode != "deliberate":
		return
	if not sim.offer.is_empty() and sim.tick >= int(sim.offer["expiresTick"]):
		sim.toast("%s could not stay any longer and moved on." % sim.offer["name"], "info")
		sim.offer = {}
		sim.next_visitor = sim.tick + visitor_interval(sim)
	if sim.offer.is_empty() and sim.tick >= sim.next_visitor and committed_population(sim) < SAFETY_LIMIT:
		_new_visitor(sim)


# ---- population status and legacy arrivals ------------------------------------------------

## Old worlds (legacy growth): one newcomer at a time while a free bed and food exist.
static func _welcome_newcomer(sim: Simulation) -> int:
	if sim.settlers.size() >= SAFETY_LIMIT:
		return -1
	var bed := BuildingOps.find_free_bed(sim, bed_use_counts(sim))
	if bed == null:
		return -1
	var spot := arrival_spot(sim, bed)
	if spot.x == -99999:
		return -1
	_withdraw_local(sim, -1, "food", ARRIVAL_COST)
	var farmers := 0
	for s in sim.settlers:
		if s.job == "farmer":
			farmers += 1
	var s := sim.add_settler(spot.x, spot.y, "farmer" if sim.fields().size() > farmers * 6 else "laborer")
	s.home_id = bed.id
	sim.last_arrival = sim.tick
	sim.stats["arrivals"] = int(sim.stats["arrivals"]) + 1
	BuildingOps.assign_homes(sim)
	var where := "a bed in the %s" % str(bed.def()["name"]).to_lower() if bed.is_permanent_home() else "a bedroll at the camp"
	sim.toast("%s has settled in the valley and taken %s!" % [s.name, where], "good")
	sim.record("arrival", "%s arrived" % s.name, s.x, s.y)
	sim.emit({"type": "sfx", "name": "arrival", "x": s.x, "y": s.y})
	sim.emit({"type": "arrival", "settlerId": s.id})
	sim.emit({"type": "important"})
	return s.id


## What growth is waiting on, in plain words (sim.population_status). Every GROWTH_STEP ticks.
static func update_population(sim: Simulation) -> void:
	if sim.growth_mode == "deliberate":
		var expecting := 0
		for h: Dictionary in sim.households:
			if h["pending"] != null:
				expecting += 1
		var travelling := 0
		for r: Dictionary in sim.recruits:
			if r["state"] == "travelling":
				travelling += 1
		var parts: PackedStringArray = []
		if expecting > 0:
			parts.append("%d household%s expecting a child" % [expecting, "s are" if expecting > 1 else " is"])
		if travelling > 0:
			parts.append("%d traveller%s on the way" % [travelling, "s are" if travelling > 1 else " is"])
		if not sim.offer.is_empty():
			var needs := recruit_needs(sim, int(sim.settlements[0]["id"])) if not sim.settlements.is_empty() else PackedStringArray()
			var tail := " — still needed: %s" % ", ".join(needs) if not needs.is_empty() else " — welcome them in the People panel"
			parts.append("A visitor, %s, would settle for %d food%s" % [sim.offer["name"], _k("RECRUIT_FOOD"), tail])
		sim.population_status = "; ".join(parts) + "." if not parts.is_empty() else "New people come from households (People panel) and from visitors you welcome with food."
		return
	var food := sim.stored_total("food")
	if sim.settlers.size() >= SAFETY_LIMIT:
		sim.population_status = "The valley has reached %d people, the most this version can hold." % SAFETY_LIMIT
		return
	if BuildingOps.find_free_bed(sim, bed_use_counts(sim)) == null:
		sim.population_status = "Every bed is taken. Build a house to welcome newcomers."
		return
	if food < ARRIVAL_FOOD:
		sim.population_status = "A newcomer will come once %d food is in storage (%d now)." % [ARRIVAL_FOOD, food]
		return
	if sim.tick - sim.last_arrival < ARRIVAL_COOLDOWN and sim.last_arrival > 0:
		sim.population_status = "A traveller has heard of your valley and is on the way."
		return
	if _welcome_newcomer(sim) != -1:
		sim.population_status = ""


static func _ok(message: String) -> Dictionary:
	return {"ok": true, "message": message}


static func _err(message: String) -> Dictionary:
	return {"ok": false, "message": message}
