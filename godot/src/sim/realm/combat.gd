class_name Combat
## Frontier war (src/game/sim/combat.ts). Companies on the map fight only enemies they can reach:
## within their range (archers further), with a clear line of sight for arrows, never into or out
## of a protected homeland. Losing morale sends a company home to regroup. Holding enemy frontier
## land unopposed occupies it, but legal title only changes by peace. A town falls only when a
## supplied siege fills its surrender meter; defenders arriving interrupt it. Under the default
## rules beaten soldiers are captured and come home at peace; under full conquest they can die,
## and everything about them is cleaned up.
##
## sim.war_states: pair key -> {attacker, defender, objective, startedTick, planId, truceUntilTick,
## routs {kingdom: n}, lastDeploy {kingdom: tick}, lastSkirmishDay}. sim.sieges: kingdom -> {besieger,
## progress}. sim.occupation_timers: sector key -> {kingdom, since}.


static func wval(key: String) -> Variant:
	return Content.get_value("war", key)


static func war_state(sim: Simulation, a: int, b: int) -> Dictionary:
	return sim.war_states.get(Diplomacy.pair_key(a, b), {})


static func all_companies(sim: Simulation) -> Array:
	var out: Array = []
	for k: Dictionary in sim.kingdoms:
		out.append_array(k["companies"])
	return out


static func _in_field(c: Dictionary) -> bool:
	return c.get("state") == "deployed"


static func _pos(c: Dictionary) -> Vector2:
	return Vector2(float(c.get("x", 0)), float(c.get("y", 0)))


## Soldiers in the field on every side (the shared budget).
static func deployed_soldiers(sim: Simulation) -> int:
	var n := 0
	for c: Dictionary in all_companies(sim):
		if c.get("state") != "deployed" and c.get("state") != "returning":
			continue
		n += (c.get("members", []) as Array).size() if int(c["owner"]) == Kingdoms.PLAYER else int(wval("RIVAL_COMPANY_SOLDIERS"))
	return n


static func _hostile(sim: Simulation, a: Dictionary, b: Dictionary) -> bool:
	if int(a["owner"]) == int(b["owner"]):
		return false
	if Diplomacy.at_war(sim, int(a["owner"]), int(b["owner"])):
		return true
	# Allied contingents fight the campaign's target.
	for c: Dictionary in [a, b]:
		if c["pledgedTo"] == null:
			continue
		var cm := Campaigns.find_commitment(sim, c["pledgedTo"])
		if cm.is_empty() or cm["state"] != "active":
			continue
		var plan := Campaigns.find_plan(sim, cm["campaignId"])
		var other: Dictionary = b if c == a else a
		if not plan.is_empty() and int(plan["target"]) == int(other["owner"]):
			return true
	return false


static func _protected_at(sim: Simulation, x: float, y: float) -> bool:
	var o := Territory.owner_of(sim, Territory.sector_of(x, y))
	return not o.is_empty() and bool(o["protectedHomeland"])


## Arrows need a clear line: mountain faces and blocking buildings stop them.
static func line_of_sight(sim: Simulation, x0: float, y0: float, x1: float, y1: float) -> bool:
	var steps := ceili(maxf(absf(x1 - x0), absf(y1 - y0)))
	for i in range(1, steps):
		var x := floori(x0 + (x1 - x0) * i / steps)
		var y := floori(y0 + (y1 - y0) * i / steps)
		if sim.world.terrain(x, y) == Tiles.MOUNTAIN:
			return false
		var b := sim.building_at(x, y)
		if b != null and b.blocks():
			return false
	return true


static func _strength_of(sim: Simulation, c: Dictionary) -> float:
	if int(c["owner"]) != Kingdoms.PLAYER:
		return float(c["strength"]) * (float(c.get("readiness", 100)) / 100.0)
	var n := 0.0
	for id: Variant in c.get("members", []):
		var s := sim.settler(int(id))
		if s != null and not s.military.is_empty() and s.military["state"] == "deployed":
			n += float(Military.unit(s.military["unit"])["strength"])
	return n * (float(c.get("readiness", 100)) / 100.0)


static func _range_of(c: Dictionary) -> float:
	return float(Military.unit(c["kind"])["range"]) + 0.5


# ---- rival companies in the field ----------------------------------------------------------------

## Sends a rival company at home into the field. With `place` it starts at the target (scenes);
## otherwise it marches from its capital. Returns the company, or empty.
static func deploy_rival(sim: Simulation, kingdom_id: int, target: Vector2, place: bool = false) -> Dictionary:
	var k := Kingdoms.by_id(sim, kingdom_id)
	if k.is_empty() or k["player"]:
		return {}
	var c := {}
	for q: Dictionary in k["companies"]:
		if q["pledgedTo"] == null and (q.get("state") == null or q.get("state") == "home"):
			c = q
			break
	if c.is_empty():
		return {}
	if deployed_soldiers(sim) + int(wval("RIVAL_COMPANY_SOLDIERS")) > int(wval("ACTIVE_BUDGET")):
		return {}
	var cap := Vector2(float(k["capital"]["x"]), float(k["capital"]["y"])) if k["capital"] != null else target
	var from := target if place else cap
	c["state"] = "deployed"
	c["x"] = from.x + 0.5
	c["y"] = from.y + 0.5
	c["home"] = {"x": cap.x + 0.5, "y": cap.y + 0.5}
	c["target"] = null if place else {"x": target.x + 0.5, "y": target.y + 0.5}
	c["health"] = 100
	c["morale"] = 100
	c["readiness"] = 100
	c["supplies"] = int(wval("RIVAL_SUPPLY_DAYS"))
	c["suppliesDay"] = sim.day()
	return c


## Straight-line march for rival companies, stopping wherever they may not enter.
static func _march_rival(sim: Simulation, c: Dictionary) -> void:
	if c.get("target") == null:
		return
	var dx := float(c["target"]["x"]) - float(c.get("x", 0))
	var dy := float(c["target"]["y"]) - float(c.get("y", 0))
	var d := JsMath.hypot(dx, dy)
	if d < 0.3:
		c["target"] = null
		if c["state"] == "returning":
			c["state"] = "home"
			c["health"] = 100
			c["morale"] = 100
		return
	var v := minf(d, float(Military.uval("MARCH_SPEED")))
	var nx := float(c.get("x", 0)) + dx / d * v
	var ny := float(c.get("y", 0)) + dy / d * v
	if c["state"] == "deployed" and not Territory.can_enter(sim, int(c["owner"]), Territory.sector_of(nx, ny), true)["allowed"]:
		c["target"] = null
		return
	c["x"] = nx
	c["y"] = ny


# ---- casualties ------------------------------------------------------------------------------------

## Removes a settler for good (full conquest only), cleaning up every reference to them.
static func remove_settler(sim: Simulation, s: Settler) -> void:
	SettlerTasks.abort_task(sim, s)
	sim.remove_settler_object(s)
	for k: Dictionary in sim.kingdoms:
		for c: Dictionary in k["companies"]:
			if c.get("members") != null:
				(c["members"] as Array).erase(s.id)
		for post: String in k["council"]:
			if k["council"][post] != null and int(k["council"][post]) == s.id:
				k["council"][post] = null
	for b: Building in sim.buildings.values():
		b.workers.erase(s.id)
	for h: Dictionary in sim.households.duplicate():
		(h["children"] as Array).erase(s.id)
		if not (h["adults"] as Array).has(s.id):
			continue
		if h["pending"] != null:
			People.release_claim(sim, int(h["pending"]["claimId"]))
		for id: Variant in (h["adults"] as Array) + (h["children"] as Array):
			var m := sim.settler(int(id))
			if m != null:
				m.household_id = -1
		sim.households.erase(h)
	if not s.military.is_empty():
		sim.stats["gearLost"] = int(sim.stats["gearLost"]) + Inv.total(s.military["gear"])
	sim.stats["soldiersLost"] = int(sim.stats["soldiersLost"]) + 1
	sim.record("shortage", "%s fell in battle" % s.name, s.x, s.y)
	sim.toast("%s fell in battle." % s.name, "warn")


static func _rout(sim: Simulation, c: Dictionary, by: int) -> void:
	var mode: String = Kingdoms.player(sim)["conflictMode"]
	# A company that breaks with heavy losses leaves someone behind.
	var beaten := float(c.get("health", 100)) < 50
	c["state"] = "returning"
	c["target"] = (c["home"] as Dictionary).duplicate() if c.get("home") != null else null
	c["path"] = null
	c["regroupUntil"] = sim.tick + int(wval("REGROUP_TICKS"))
	sim.stats["battles"] = int(sim.stats["battles"]) + 1
	var ws := war_state(sim, int(c["owner"]), by)
	if not ws.is_empty():
		var key := str(int(c["owner"]))
		ws["routs"][key] = int((ws["routs"] as Dictionary).get(key, 0)) + 1
	if int(c["owner"]) == Kingdoms.PLAYER:
		if beaten:
			var members: Array[Settler] = []
			for id: Variant in c.get("members", []):
				var m := sim.settler(int(id))
				if m != null:
					members.append(m)
			var pick := sim.rng.int_below(maxi(1, members.size()))
			var victim: Settler = members[pick] if pick < members.size() else null
			if victim != null:
				if mode == "full-conquest":
					remove_settler(sim, victim)
				else:
					# Captured: held by the enemy until peace. Their gear is lost to them.
					(c["members"] as Array).erase(victim.id)
					sim.stats["gearLost"] = int(sim.stats["gearLost"]) + Inv.total(victim.military.get("gear", {}))
					victim.military = {}
					victim.captive = {"by": by}
					victim.hidden = true
					victim.task = null
					sim.toast("%s was captured. They will come home at peace." % victim.name, "warn")
			if (c.get("members", []) as Array).is_empty():
				Military.player_companies(sim).erase(c)
				return
			c["health"] = 40
		sim.toast("A company broke off and is marching home.", "warn")
	elif float(c.get("health", 100)) <= 0 and mode == "full-conquest":
		var k := Kingdoms.by_id(sim, int(c["owner"]))
		if not k.is_empty():
			(k["companies"] as Array).erase(c)
		sim.stats["enemyLosses"] = int(sim.stats["enemyLosses"]) + 1


## Companies holding or defending close on the nearest enemy within a sector's width (16 tiles).
static func _engage(sim: Simulation, field: Array) -> void:
	for a: Dictionary in field:
		if a.get("target") != null or int(a.get("regroupUntil", 0)) > sim.tick or a["state"] != "deployed":
			continue
		var best := {}
		var best_d := 16.0
		for b: Dictionary in field:
			if a == b or not _hostile(sim, a, b) or _protected_at(sim, float(b.get("x", 0)), float(b.get("y", 0))):
				continue
			var d := JsMath.hypot(_pos(a).x - _pos(b).x, _pos(a).y - _pos(b).y)
			if d < best_d and d > _range_of(a):
				best = b
				best_d = d
		if best.is_empty():
			continue
		a["target"] = {"x": float(best.get("x", 0)), "y": float(best.get("y", 0))}
		a["path"] = null


## One round of fighting between every pair of hostile companies in reach.
static func update_combat(sim: Simulation) -> void:
	var field: Array = all_companies(sim).filter(_in_field)
	if field.size() < 2:
		return
	_engage(sim, field)
	var hits: Array = []
	for a: Dictionary in field:
		if int(a.get("regroupUntil", 0)) > sim.tick:
			continue
		# Protected land is never a firing platform.
		if _protected_at(sim, float(a.get("x", 0)), float(a.get("y", 0))):
			continue
		var best := {}
		var best_d := INF
		for b: Dictionary in field:
			if a == b or not _hostile(sim, a, b) or _protected_at(sim, float(b.get("x", 0)), float(b.get("y", 0))):
				continue
			var d := JsMath.hypot(_pos(a).x - _pos(b).x, _pos(a).y - _pos(b).y)
			if d > _range_of(a) or d >= best_d:
				continue
			if _range_of(a) > 2 and not line_of_sight(sim, _pos(a).x, _pos(a).y, _pos(b).x, _pos(b).y):
				continue
			best = b
			best_d = d
		if best.is_empty():
			continue
		var dmg := _strength_of(sim, a) * float(wval("DAMAGE_RATE")) * (float(a.get("morale", 100)) / 100.0) * (0.8 + sim.rng.next() * 0.4)
		var found := false
		for h: Array in hits:
			if h[0] == best:
				h[1] = float(h[1]) + dmg
				h[2] = int(a["owner"])
				found = true
		if not found:
			hits.append([best, dmg, int(a["owner"])])
		a["target"] = null
	for h: Array in hits:
		var c: Dictionary = h[0]
		# Checked again as the blow lands: nothing is hurt inside a protected homeland.
		if _protected_at(sim, float(c.get("x", 0)), float(c.get("y", 0))) or c["state"] != "deployed":
			continue
		c["health"] = maxf(0, float(c.get("health", 100)) - float(h[1]))
		c["morale"] = maxf(0, float(c.get("morale", 100)) - float(h[1]) * 1.2)
		if float(c["health"]) <= 0 or float(c["morale"]) < float(wval("MORALE_BREAK")):
			_rout(sim, c, int(h[2]))


# ---- occupation, sieges and plunder -------------------------------------------------------------------

static func _occupy(sim: Simulation, s: Vector2i, by: int, legal_owner: int) -> void:
	var key := Territory.key(s)
	if sim.claims.has(key):
		sim.claims[key]["occupyingKingdom"] = by
	else:
		sim.claims[key] = {"legalOwner": legal_owner, "occupyingKingdom": by}
	var ev := News.record_event(sim, "conquest", by, 1, s)
	for k: Dictionary in sim.kingdoms:
		var kid := int(k["id"])
		if kid == by:
			continue
		var near := k["capital"] != null and JsMath.hypot(float(k["capital"]["x"]) - s.x * 16, float(k["capital"]["y"]) - s.y * 16) < 320
		if kid == legal_owner or near or (k["player"] and (Diplomacy.stance_of(sim, 0, by) == "ally" or Diplomacy.stance_of(sim, 0, legal_owner) == "ally")):
			News.record_observation(sim, kid, by, "conquest", s, {"eventId": ev["id"], "certainty": "observed", "source": "border" if kid == legal_owner else "scout", "delay": 0 if kid == legal_owner else Defs.DAY_TICKS / 2})
	if legal_owner == 0 or by == 0:
		if by == 0:
			sim.toast("Your soldiers now hold sector %d,%d. Title changes only by peace." % [s.x, s.y], "good")
		else:
			sim.toast("%s has occupied your land at sector %d,%d." % [Kingdoms.name_of(sim, by), s.x, s.y], "warn")
		sim.emit({"type": "important"})


static func _update_occupation(sim: Simulation) -> void:
	var field: Array = all_companies(sim).filter(_in_field)
	var seen := {}
	var ticks := int(wval("OCCUPY_TICKS"))
	for c: Dictionary in field:
		var s := Territory.sector_of(float(c.get("x", 0)), float(c.get("y", 0)))
		var key := Territory.key(s)
		var o := Territory.owner_of(sim, s)
		if o.is_empty() or int(o["legalOwner"]) == int(c["owner"]) or o["protectedHomeland"] or (o["occupyingKingdom"] != null and int(o["occupyingKingdom"]) == int(c["owner"])):
			continue
		if not Diplomacy.at_war(sim, int(c["owner"]), int(o["legalOwner"])):
			continue
		var contested := false
		for q: Dictionary in field:
			if q != c and _hostile(sim, c, q) and Territory.key(Territory.sector_of(float(q.get("x", 0)), float(q.get("y", 0)))) == key:
				contested = true
		if contested:
			sim.occupation_timers.erase(key)
			continue
		seen[key] = true
		var t: Dictionary = sim.occupation_timers.get(key, {})
		if t.is_empty() or int(t["kingdom"]) != int(c["owner"]):
			sim.occupation_timers[key] = {"kingdom": int(c["owner"]), "since": sim.tick}
		elif sim.tick - int(t["since"]) >= ticks:
			_occupy(sim, s, int(c["owner"]), int(o["legalOwner"]))
			sim.occupation_timers.erase(key)
	for k: String in sim.occupation_timers.keys():
		if not seen.has(k):
			sim.occupation_timers.erase(k)


## Supplied soldiers holding an undefended town's approaches fill its surrender meter.
static func _update_sieges(sim: Simulation, step: int) -> void:
	var rate := (100.0 / float(wval("SIEGE_TICKS"))) * step
	for k: Dictionary in sim.kingdoms:
		if k["player"] or k["capital"] == null:
			continue
		var kid := int(k["id"])
		var cx := float(k["capital"]["x"])
		var cy := float(k["capital"]["y"])
		var cap := Territory.sector_of(cx, cy)
		if _protected_at(sim, cx, cy):
			continue
		var here := func(c: Dictionary) -> bool:
			var s := Territory.sector_of(float(c.get("x", 0)), float(c.get("y", 0)))
			return maxi(absi(s.x - cap.x), absi(s.y - cap.y)) <= 1
		var besiegers: Array = all_companies(sim).filter(func(c: Dictionary) -> bool: return _in_field(c) and here.call(c) and Diplomacy.at_war(sim, int(c["owner"]), kid) and int(c.get("supplies", 0)) > 0)
		var defended := false
		for c: Dictionary in k["companies"]:
			if (_in_field(c) and here.call(c)) or (c["pledgedTo"] == null and (c.get("state") == null or c.get("state") == "home")):
				defended = true
		var cur: Dictionary = sim.sieges.get(kid, {})
		if not besiegers.is_empty() and not defended:
			var before := float(cur.get("progress", 0))
			var next := {"besieger": int(besiegers[0]["owner"]), "progress": minf(100, before + rate)}
			sim.sieges[kid] = next
			if float(next["progress"]) >= 100 and before < 100:
				for dy in range(-1, 2):
					for dx in range(-1, 2):
						_occupy(sim, Vector2i(cap.x + dx, cap.y + dy), int(next["besieger"]), kid)
				sim.record("milestone", "%s surrendered to %s" % [k["name"], Kingdoms.name_of(sim, int(next["besieger"]), "?")])
		elif not cur.is_empty():
			# Relief, retreat or empty supplies: the meter drains.
			cur["progress"] = maxf(0, float(cur["progress"]) - rate * 2)
			if float(cur["progress"]) == 0:
				sim.sieges.erase(kid)


## Enemy soldiers next to a cart seize its cargo; it is lost once and only once.
static func _update_plunder(sim: Simulation) -> void:
	for m: Dictionary in sim.manifests:
		var total := Inv.total(m["cargo"])
		if total == 0:
			continue
		var at := Logistics.cart_position(sim, m)
		for c: Dictionary in all_companies(sim):
			if _in_field(c) and Diplomacy.at_war(sim, int(c["owner"]), 0) and JsMath.hypot(float(c.get("x", 0)) - at.x, float(c.get("y", 0)) - at.y) <= float(wval("CAPTURE_RANGE")):
				m["cargo"] = {}
				sim.stats["cargoLost"] = int(sim.stats["cargoLost"]) + total
				sim.toast("%s soldiers seized a caravan's %d goods." % [Kingdoms.name_of(sim, int(c["owner"]), "Enemy"), total], "warn")
				break


static func _rival_supplies(sim: Simulation) -> void:
	for k: Dictionary in sim.kingdoms:
		if k["player"]:
			continue
		for c: Dictionary in k["companies"]:
			if not _in_field(c) or c.get("suppliesDay") == sim.day():
				continue
			c["suppliesDay"] = sim.day()
			c["supplies"] = maxi(0, int(c.get("supplies", 0)) - 1)
			if int(c["supplies"]) <= 0:
				c["state"] = "returning"
				c["target"] = (c["home"] as Dictionary).duplicate() if c.get("home") != null else null


# ---- AI at war --------------------------------------------------------------------------------------

static func _exhaustion(sim: Simulation, ws: Dictionary, k: int) -> int:
	var occupied := 0
	for key: String in sim.claims:
		var c: Dictionary = sim.claims[key]
		if int(c["legalOwner"]) == k and c["occupyingKingdom"] != null and int(c["occupyingKingdom"]) != k:
			occupied += 1
	return int((ws["routs"] as Dictionary).get(str(k), 0)) * 10 + occupied * 15 + floori(float(sim.tick - int(ws["startedTick"])) / Defs.DAY_TICKS) * 3


## How willing a kingdom at war is to make peace on these terms: {score, reasons}.
static func peace_score(sim: Simulation, o: Dictionary) -> Dictionary:
	var ws := war_state(sim, int(o["proposer"]), int(o["recipient"]))
	var reasons: Array = []
	var score := Diplomacy.trust_of(sim, int(o["recipient"]), int(o["proposer"]))
	if not ws.is_empty():
		var ex := _exhaustion(sim, ws, int(o["recipient"]))
		score += ex
		if ex > 0:
			reasons.append("The war has cost us (%d)" % ex)
	var payment := float(o["terms"].get("payment", 0))
	if payment > 0:
		score += payment / 5.0
		reasons.append("Reparations of %d coins" % int(payment))
	var transfers: Array = o["terms"].get("transfers", [])
	if not transfers.is_empty():
		score -= transfers.size() * 15
		reasons.append("Giving up %d sector%s weighs against it" % [transfers.size(), "" if transfers.size() == 1 else "s"])
	return {"score": score, "reasons": reasons}


static func _nearest_target(sim: Simulation, k: int, enemy: int) -> Variant:
	var me := Kingdoms.by_id(sim, k)
	var cap := Vector2(float(me["capital"]["x"]), float(me["capital"]["y"])) if me["capital"] != null else Vector2.ZERO
	var best: Variant = null
	var best_d := INF
	for key: String in sim.claims:
		if int(sim.claims[key]["legalOwner"]) != enemy:
			continue
		var s := Territory.from_key(key)
		var x := s.x * 16 + 8.0
		var y := s.y * 16 + 8.0
		var d := JsMath.hypot(x - cap.x, y - cap.y)
		if d < best_d and not _protected_at(sim, x, y):
			best_d = d
			best = Vector2(x, y)
	return best


static func _ai_war(sim: Simulation, ws: Dictionary) -> void:
	for side: int in [int(ws["attacker"]), int(ws["defender"])]:
		var k := Kingdoms.by_id(sim, side)
		var enemy := int(ws["defender"]) if side == int(ws["attacker"]) else int(ws["attacker"])
		if k.is_empty() or k["player"]:
			continue
		if Diplomacy.truce_until(sim, side, enemy) > sim.tick:
			continue
		var last: Variant = (ws["lastDeploy"] as Dictionary).get(str(side))
		if last != null and sim.tick - int(last) < Defs.DAY_TICKS:
			continue
		var target: Variant = _nearest_target(sim, side, enemy)
		if target == null:
			continue
		if not deploy_rival(sim, side, target).is_empty():
			ws["lastDeploy"][str(side)] = sim.tick


## Two AI kingdoms at war skirmish each day; land changes hands; in time they make peace.
static func _ai_vs_ai(sim: Simulation, ws: Dictionary) -> void:
	if sim.day() == int(ws["lastSkirmishDay"]):
		return
	ws["lastSkirmishDay"] = sim.day()
	var a := Kingdoms.by_id(sim, int(ws["attacker"]))
	var b := Kingdoms.by_id(sim, int(ws["defender"]))
	var pa := (a["companies"] as Array).size() * (0.7 + sim.rng.next() * 0.6)
	var pb := (b["companies"] as Array).size() * (0.7 + sim.rng.next() * 0.6)
	var win: Dictionary = a if pa >= pb else b
	var lose: Dictionary = b if pa >= pb else a
	var lkey := str(int(lose["id"]))
	ws["routs"][lkey] = int((ws["routs"] as Dictionary).get(lkey, 0)) + 1
	if lose["capital"] != null:
		var cap := Territory.sector_of(float(lose["capital"]["x"]), float(lose["capital"]["y"]))
		var wx := float(win["capital"]["x"]) if win["capital"] != null else 0.0
		var dir := int(signf(wx - float(lose["capital"]["x"])))
		if dir == 0:
			dir = 1
		var s := Vector2i(cap.x + 2 * dir, cap.y)
		var o := Territory.owner_of(sim, s)
		if o.is_empty() or o["occupyingKingdom"] == null or int(o["occupyingKingdom"]) != int(win["id"]):
			_occupy(sim, s, int(win["id"]), int(lose["id"]))
	if sim.tick - int(ws["startedTick"]) >= int(wval("AI_WAR_DAYS")) * Defs.DAY_TICKS:
		# Peace: the land each side holds is handed over, and the war ends.
		var aid := int(a["id"])
		var bid := int(b["id"])
		for key: String in sim.claims.keys():
			var c: Dictionary = sim.claims[key]
			if c["occupyingKingdom"] == null:
				continue
			var occ := int(c["occupyingKingdom"])
			if (int(c["legalOwner"]) == aid and occ == bid) or (int(c["legalOwner"]) == bid and occ == aid):
				sim.claims[key] = {"legalOwner": occ, "occupyingKingdom": null}
		_end_war(sim, aid, bid)
		sim.record("settlement", "%s and %s made peace" % [a["name"], b["name"]])


static func _end_war(sim: Simulation, a: int, b: int) -> void:
	sim.wars.erase(Diplomacy.pair_key(a, b))
	sim.war_states.erase(Diplomacy.pair_key(a, b))
	Diplomacy.refresh_stance(sim, a, b)
	for k: int in [a, b]:
		var kd := Kingdoms.by_id(sim, k)
		if kd.is_empty():
			continue
		for c: Dictionary in kd["companies"]:
			if c.get("state") == "deployed":
				c["state"] = "returning"
				c["target"] = (c["home"] as Dictionary).duplicate() if c.get("home") != null else null
				c["path"] = null
		if not kd["player"]:
			sim.sieges.erase(k)


static func update(sim: Simulation) -> void:
	for c: Dictionary in all_companies(sim):
		if int(c["owner"]) != Kingdoms.PLAYER and (c.get("state") == "deployed" or c.get("state") == "returning"):
			_march_rival(sim, c)
	if sim.tick % int(wval("COMBAT_STEP")) == 0:
		update_combat(sim)
	if sim.tick % 10 == 0:
		_update_sieges(sim, 10)
		_update_plunder(sim)
	if sim.tick % 50 == 0:
		_update_occupation(sim)
		_rival_supplies(sim)
		for ws: Dictionary in sim.war_states.values():
			var ai: bool = not Kingdoms.by_id(sim, int(ws["attacker"])).get("player", false) and not Kingdoms.by_id(sim, int(ws["defender"])).get("player", false)
			if ai:
				_ai_vs_ai(sim, ws)
			else:
				_ai_war(sim, ws)


# ---- declaring, launching and peace -------------------------------------------------------------------

static func declare_preview(sim: Simulation, target: int) -> Dictionary:
	var me := Kingdoms.player(sim)
	var tname := Kingdoms.name_of(sim, target, "?")
	var breaches: Array = []
	for kind: String in ["nonAggression", "truce", "defensiveAlliance", "passage", "trade"]:
		if not Diplomacy.active_treaty(sim, 0, target, kind).is_empty():
			breaches.append("%s with %s" % [Diplomacy.treaty(kind)["name"], tname])
	var blockers: Array = []
	if not me["crowned"]:
		blockers.append("Crown your ruler first")
	if not sim.reached.has("civilization"):
		blockers.append("War needs the Civilization milestone")
	if not me["frontierActive"]:
		blockers.append("Open the frontier to conflict first (Realm › Land)")
	if not Diplomacy.active_treaty(sim, 0, target, "defensiveAlliance").is_empty():
		blockers.append("%s is your ally" % tname)
	var promised := 0
	var arrived := 0
	for c: Dictionary in sim.commitments:
		var plan := Campaigns.find_plan(sim, c["campaignId"])
		if plan.is_empty() or int(plan["target"]) != target:
			continue
		if ["accepted", "assembling", "enRoute"].has(c["state"]):
			promised += 1
		if c["state"] == "arrived" or c["state"] == "active":
			arrived += 1
	var exposed: Array = []
	for key: String in sim.claims:
		if int(sim.claims[key]["legalOwner"]) == 0:
			var s := Territory.from_key(key)
			exposed.append({"x": s.x, "y": s.y})
	var their_allies: Array = []
	for k: Dictionary in sim.kingdoms:
		if int(k["id"]) != target and not k["player"] and not Diplomacy.active_treaty(sim, int(k["id"]), target, "defensiveAlliance").is_empty():
			their_allies.append(k["name"])
	var soldiers := 0
	for c: Dictionary in Military.ready_companies(sim):
		soldiers += (c.get("members", []) as Array).size()
	return {"target": tname, "objective": "", "breaches": breaches, "allies": {"promised": promised, "arrived": arrived},
		"supplyDays": floori(float(sim.stored_total("food")) / maxi(1, soldiers)), "exposed": exposed, "blockers": blockers, "theirAllies": their_allies}


static func _new_war_state(sim: Simulation, attacker: int, defender: int, objective: String) -> Dictionary:
	return {"attacker": attacker, "defender": defender, "objective": objective, "startedTick": sim.tick, "planId": null, "truceUntilTick": 0, "routs": {}, "lastDeploy": {}, "lastSkirmishDay": 0}


static func declare_war(sim: Simulation, target: Variant, objective: Variant, confirm_breach: Variant) -> Dictionary:
	var t := Kingdoms.by_id(sim, int(target)) if (target is int or target is float) else {}
	if t.is_empty() or t["player"]:
		return {"ok": false, "message": "Choose a kingdom you know of"}
	if objective != "raid" and objective != "capture" and objective != "defend":
		return {"ok": false, "message": "Choose a limited objective"}
	var tid := int(t["id"])
	var p := declare_preview(sim, tid)
	if not (p["blockers"] as Array).is_empty():
		return {"ok": false, "message": "; ".join(PackedStringArray(p["blockers"]))}
	if Diplomacy.at_war(sim, 0, tid):
		return {"ok": false, "message": "You are already at war with %s" % t["name"]}
	if not (p["breaches"] as Array).is_empty() and confirm_breach != true:
		return {"ok": false, "message": "Declaring war would break: %s. Confirm to go ahead — others will hear of it." % ", ".join(PackedStringArray(p["breaches"]))}
	for o: Dictionary in sim.offers:
		var pair := (int(o["proposer"]) == 0 and int(o["recipient"]) == tid) or (int(o["proposer"]) == tid and int(o["recipient"]) == 0)
		if not pair or o["state"] != "active":
			continue
		o["state"] = "breached"
		Diplomacy.change_trust(sim, tid, 0, -20)
	sim.wars[Diplomacy.pair_key(0, tid)] = true
	sim.war_states[Diplomacy.pair_key(0, tid)] = _new_war_state(sim, 0, tid, objective)
	Diplomacy.refresh_stance(sim, 0, tid)
	Diplomacy.change_trust(sim, tid, 0, -30)
	var ev := News.record_event(sim, "war-declared", 0, 1, null)
	if not (p["breaches"] as Array).is_empty():
		News.record_event(sim, "treaty-broken", 0, 1, null)
	for k: Dictionary in sim.kingdoms:
		if k["player"]:
			continue
		var kid := int(k["id"])
		News.record_observation(sim, kid, 0, "war-declared", null, {"eventId": ev["id"], "certainty": "confirmed", "source": "herald" if kid == tid else "envoy", "delay": 0 if kid == tid else Diplomacy.letter_ticks(sim, 0, kid)})
	# Their allies answer the call if they trust them enough.
	for k: Dictionary in sim.kingdoms.duplicate():
		var kid := int(k["id"])
		if k["player"] or kid == tid or Diplomacy.active_treaty(sim, kid, tid, "defensiveAlliance").is_empty():
			continue
		if Diplomacy.trust_of(sim, kid, tid) >= 50:
			sim.wars[Diplomacy.pair_key(0, kid)] = true
			sim.war_states[Diplomacy.pair_key(0, kid)] = _new_war_state(sim, kid, 0, "defend")
			Diplomacy.refresh_stance(sim, 0, kid)
			sim.toast("%s answers %s's call for aid: they are at war with you too." % [k["name"], t["name"]], "warn")
	var me := Kingdoms.player(sim)
	sim.record("milestone", "%s declared war on %s" % [me["name"], t["name"]])
	sim.emit({"type": "important"})
	return {"ok": true, "message": "War with %s: objective %s. Your homeland %s protected." % [t["name"], objective, "is not" if me["conflictMode"] == "full-conquest" else "stays"]}


## Launches a mustered campaign: war (with confirmation), and arrived allies take the field.
static func launch_campaign(sim: Simulation, plan_id: Variant, confirm_breach: Variant) -> Dictionary:
	var plan := Campaigns.find_plan(sim, plan_id)
	if plan.is_empty() or plan["state"] != "mobilizing":
		return {"ok": false, "message": "Muster the campaign first"}
	var target := int(plan["target"])
	if not Diplomacy.at_war(sim, 0, target):
		var d := declare_war(sim, target, plan["objective"], confirm_breach)
		if not bool(d["ok"]):
			return d
	plan["state"] = "launched"
	var ws := war_state(sim, 0, target)
	if not ws.is_empty():
		ws["planId"] = plan["id"]
	var arrived := 0
	var missing := 0
	for c: Dictionary in sim.commitments:
		if int(c["campaignId"]) != int(plan["id"]):
			continue
		if c["state"] == "arrived":
			c["state"] = "active"
			arrived += 1
			var ally := Kingdoms.by_id(sim, int(c["contributor"]))
			for q: Dictionary in ally.get("companies", []):
				if q["pledgedTo"] == null or int(q["pledgedTo"]) != int(c["id"]):
					continue
				var st: Dictionary = plan["staging"] if plan["staging"] != null else {"x": 4, "y": 0}
				q["state"] = "deployed"
				q["x"] = int(st["x"]) * 16 + 8.5
				q["y"] = int(st["y"]) * 16 + 8.5
				var cap: Variant = ally["capital"]
				q["home"] = {"x": (float(cap["x"]) if cap != null else 0.0) + 0.5, "y": (float(cap["y"]) if cap != null else 0.0) + 0.5}
				q["target"] = null
				q["health"] = 100
				q["morale"] = 100
				q["readiness"] = 100
				q["supplies"] = c["terms"]["serviceDays"]
				q["suppliesDay"] = sim.day()
		elif ["accepted", "assembling", "enRoute"].has(c["state"]):
			missing += 1
	return {"ok": true, "message": "Launched. %d allied contingent%s in the field%s." % [arrived, "" if arrived == 1 else "s", "; %d still on the way (they don't count until they arrive)" % missing if missing > 0 else ""]}


## Applies an agreed peace: transfers, occupations lifted, captives home, allies paid in land or not.
static func apply_peace(sim: Simulation, o: Dictionary) -> void:
	var a := int(o["proposer"])
	var b := int(o["recipient"])
	var to_proposer := {}
	for s: Dictionary in o["terms"].get("transfers", []):
		to_proposer[Territory.key(Vector2i(int(s["x"]), int(s["y"])))] = true
	# Land written into the peace changes hands; every other occupation between the two ends.
	for key: String in to_proposer:
		sim.claims[key] = {"legalOwner": a, "occupyingKingdom": null}
	for key: String in sim.claims.keys():
		var c: Dictionary = sim.claims[key]
		if to_proposer.has(key) or c["occupyingKingdom"] == null:
			continue
		var lo := int(c["legalOwner"])
		var occ := int(c["occupyingKingdom"])
		if (lo == a or lo == b) and (occ == a or occ == b):
			sim.claims[key] = {"legalOwner": lo, "occupyingKingdom": null}
	# Coalition rewards: land promised to allies that the peace delivers goes to them.
	for cm: Dictionary in sim.commitments:
		var plan := Campaigns.find_plan(sim, cm["campaignId"])
		if plan.is_empty() or (int(plan["target"]) != a and int(plan["target"]) != b):
			continue
		for s: Dictionary in cm["terms"]["rewardSectors"]:
			var key := Territory.key(Vector2i(int(s["x"]), int(s["y"])))
			if to_proposer.has(key) and a == 0:
				sim.claims[key] = {"legalOwner": int(cm["contributor"]), "occupyingKingdom": null}
		if ["active", "arrived", "assembling", "enRoute", "accepted"].has(cm["state"]):
			cm["state"] = "returning"
			cm["returnTick"] = sim.tick + Diplomacy.letter_ticks(sim, int(cm["contributor"]), 0)
			var ally := Kingdoms.by_id(sim, int(cm["contributor"]))
			for q: Dictionary in ally.get("companies", []):
				if q["pledgedTo"] != null and int(q["pledgedTo"]) == int(cm["id"]) and q.get("state") == "deployed":
					q["state"] = "returning"
					q["target"] = (q["home"] as Dictionary).duplicate() if q.get("home") != null else null
		if plan["state"] == "launched" or plan["state"] == "mobilizing":
			plan["state"] = "concluded"
	# Captives come home.
	for s in sim.settlers:
		if not s.captive.is_empty() and (int(s.captive["by"]) == a or int(s.captive["by"]) == b):
			s.captive = {}
			s.hidden = false
			s.next_think = 0
			var camp: Building = sim.buildings.get(int(sim.settlements[0]["id"])) if not sim.settlements.is_empty() else null
			if camp != null:
				s.x = camp.x + 1.5
				s.y = camp.y + camp.h + 0.5
				s.px = s.x
				s.py = s.y
				s.rpx = s.x
				s.rpy = s.y
				s.rx = s.x
				s.ry = s.y
	_end_war(sim, a, b)
	sim.record("milestone", "Peace between %s and %s" % [Kingdoms.name_of(sim, a, "?"), Kingdoms.name_of(sim, b, "?")])


## Rewards promised to allies that a peace proposal would leave unmet: [{ally, sectors}].
static func unmet_rewards(sim: Simulation, target: int, transfers: Array) -> Array:
	var out: Array = []
	var got := {}
	for s: Dictionary in transfers:
		got[Territory.key(Vector2i(int(s["x"]), int(s["y"])))] = true
	for cm: Dictionary in sim.commitments:
		var plan := Campaigns.find_plan(sim, cm["campaignId"])
		if plan.is_empty() or int(plan["target"]) != target or not ["active", "arrived", "returning"].has(cm["state"]):
			continue
		var missing: Array = (cm["terms"]["rewardSectors"] as Array).filter(func(s: Dictionary) -> bool: return not got.has(Territory.key(Vector2i(int(s["x"]), int(s["y"])))))
		if not missing.is_empty():
			out.append({"ally": int(cm["contributor"]), "sectors": missing})
	return out


## Moves civilians out of a threatened settlement to another one.
static func evacuate(sim: Simulation, from: Variant, to: Variant) -> Dictionary:
	var a := Settlements.find(sim, int(from)) if (from is int or from is float) else {}
	var b := Settlements.find(sim, int(to)) if (to is int or to is float) else {}
	if a.is_empty() or b.is_empty() or int(a["id"]) == int(b["id"]):
		return {"ok": false, "message": "Choose two different settlements"}
	var hall: Building = sim.buildings.get(int(b["id"]))
	var n := 0
	for s in sim.settlers:
		if s.settlement_id != int(a["id"]) or not s.military.is_empty() or s.away_on != -1 or not s.captive.is_empty():
			continue
		SettlerTasks.abort_task(sim, s)
		s.settlement_id = int(b["id"])
		s.home_id = -1
		s.area_id = -1
		if hall != null:
			s.task = Task.move(hall.x + 1, hall.y + hall.h)
		n += 1
	sim.emit({"type": "important"})
	return {"ok": true, "message": "%d people are leaving %s for %s." % [n, a["name"], b["name"]]}
