class_name Military
## The realm's soldiers (src/game/sim/military.ts). Recruits are real adults: their gear leaves the
## stores the moment they enlist (so the last sword can't go to two people), their old job and
## work order are kept for when they return, and they drill at a barracks or archery range until
## ready. Companies on the move carry food from the stores; without it their readiness falls day
## by day and they come home. Nobody is removed by hunger, and allied soldiers never join your
## population.
##
## A settler's service (Settler.military): {unit, state training|ready|deployed, trained, buildingId,
## companyId, gear, priorJob, priorPriorities, priorArea}. Companies are Dictionaries in the
## kingdom's "companies" list (see the browser's Company type).

## How close a company must pass to a travellers' camp to rest there.
const CAMP_REACH := 4


static func unit(id: String) -> Dictionary:
	return (Content.get_value("units", "UNITS") as Dictionary)[id]


static func is_unit(id: Variant) -> bool:
	return id is String and (Content.get_value("units", "UNITS") as Dictionary).has(id)


static func uval(key: String) -> Variant:
	return Content.get_value("units", key)


static func player_companies(sim: Simulation) -> Array:
	return Kingdoms.player(sim)["companies"]


static func company_by_id(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is int or id is float):
		return {}
	for c: Dictionary in player_companies(sim):
		if int(c["id"]) == int(id):
			return c
	return {}


static func company_of(sim: Simulation, s: Settler) -> Dictionary:
	return company_by_id(sim, s.military["companyId"]) if not s.military.is_empty() else {}


static func _members(c: Dictionary) -> Array:
	if not c.has("members") or c["members"] == null:
		c["members"] = []
	return c["members"]


## A company counts as an army once at least one member has finished training.
static func ready_companies(sim: Simulation) -> Array:
	return player_companies(sim).filter(func(c: Dictionary) -> bool:
		for id: Variant in _members(c):
			var s := sim.settler(int(id))
			if s != null and not s.military.is_empty() and s.military["state"] != "training":
				return true
		return false)


static func _company_strength(sim: Simulation, c: Dictionary) -> int:
	var n := 0.0
	for id: Variant in _members(c):
		var s := sim.settler(int(id))
		if s != null and not s.military.is_empty() and s.military["state"] != "training":
			n += float(unit(s.military["unit"])["strength"])
	return roundi(n * (float(c.get("readiness", 100)) / 100.0))


static func _free_stock(sim: Simulation, r: String) -> int:
	var n := 0
	for b in sim.storages():
		n += maxi(0, sim.available(b, r))
	return n


## Takes gear for one recruit from unreserved stock, all or nothing. Returns a problem or "".
static func _take_gear(sim: Simulation, gear: Dictionary) -> String:
	for r: String in gear:
		var free := _free_stock(sim, r)
		if free < int(gear[r]):
			return "Not enough %s in store (%d; needs %d)" % [str(Defs.resource(r)["name"]).to_lower(), free, int(gear[r])]
	for r: String in gear:
		var left := int(gear[r])
		for b in sim.storages():
			var k := mini(left, maxi(0, sim.available(b, r)))
			if k > 0:
				Inv.add(b.inventory, r, -k)
				left -= k
	return ""


## Puts gear back: horses to stalls, the rest to any store (an armory first), anything left into a crate.
static func _return_gear(sim: Simulation, gear: Dictionary, at: Vector2) -> void:
	var left := {}
	var stores: Array = sim.storages().duplicate()
	stores.sort_custom(func(a: Building, b: Building) -> bool: return a.def().has("accepts") and not b.def().has("accepts"))
	for r: String in gear:
		var rest := int(gear[r])
		for b: Building in stores:
			if rest <= 0:
				break
			if not Simulation.stores_resource(b, r):
				continue
			rest -= sim.deposit(b, r, rest)
		if rest > 0:
			left[r] = rest
	Levels.drop_crate(sim, at, left)


static func _training_slots(b: Building) -> int:
	var v: Variant = b.stat("trainingSlots")
	if v != null:
		return int(v)
	var t: Dictionary = b.def().get("training", {})
	return int(t.get("slots", 0))


static func enlist(sim: Simulation, ids: Variant, unit_id: Variant, building_id: Variant) -> Dictionary:
	if not is_unit(unit_id):
		return {"ok": false, "message": "Unknown kind of soldier"}
	var b: Building = sim.buildings.get(int(building_id)) if (building_id is int or building_id is float) else null
	var def := b.def() if b != null else {}
	if b == null or not b.built or not def.has("training"):
		return {"ok": false, "message": "Choose a finished barracks or archery range"}
	var u := unit(unit_id)
	if not (def["training"]["units"] as Array).has(unit_id):
		return {"ok": false, "message": "%s don't train at the %s" % [u["name"], str(def["name"]).to_lower()]}
	if not (ids is Array) or (ids as Array).is_empty():
		return {"ok": false, "message": "Select adults to enlist"}
	var people: Array[Settler] = []
	for id: Variant in ids:
		var s := sim.settler(int(id)) if (id is int or id is float) else null
		if s != null:
			people.append(s)
	for s in people:
		if s.life_stage == "child":
			return {"ok": false, "message": "%s is a child — only adults can enlist" % s.name}
	var counts := 0
	for s in sim.settlers:
		if not s.military.is_empty() and s.military["state"] == "training" and int(s.military["buildingId"]) == b.id:
			counts += 1
	var slots := _training_slots(b) - counts
	if slots <= 0:
		return {"ok": false, "message": "The %s is full (%d in training)" % [str(def["name"]).to_lower(), _training_slots(b)]}
	var done: PackedStringArray = []
	var problem := ""
	var k := Kingdoms.player(sim)
	for s in people:
		if s.ruler:
			if problem == "":
				problem = "%s is the ruler and does not enlist" % s.name
			continue
		if not s.military.is_empty():
			if problem == "":
				problem = "%s is already a soldier" % s.name
			continue
		if s.away_on != -1:
			if problem == "":
				problem = "%s is away" % s.name
			continue
		if slots <= 0:
			if problem == "":
				problem = "the training yard is full"
			break
		if Kingdoms.council_post_of(sim, s) != "":
			if problem == "":
				problem = "%s serves on the council" % s.name
			continue
		var missing := _take_gear(sim, Inv.from_json(u["gear"]))
		if missing != "":
			if problem == "":
				problem = missing
			break
		# Free them from civilian work; keep their home, household and old job.
		SettlerTasks.abort_task(sim, s)
		for w: Building in sim.buildings.values():
			w.workers.erase(s.id)
		sim.forget_work_index()
		var company := _join_company(sim, unit_id, b)
		s.military = {"unit": unit_id, "state": "training", "trained": 0.0, "buildingId": b.id, "companyId": company["id"], "gear": Inv.from_json(u["gear"]),
			"priorJob": s.job, "priorPriorities": s.priorities.duplicate() if s.has_priorities else null, "priorArea": s.area_id if s.area_id != -1 else null}
		s.area_id = -1
		s.focus = {}
		_members(company).append(s.id)
		slots -= 1
		done.append(s.name)
	if done.is_empty():
		return {"ok": false, "message": problem if problem != "" else "Nobody could enlist"}
	sim.emit({"type": "important"})
	var of := " (%d of %d%s)" % [done.size(), (ids as Array).size(), ": " + problem if problem != "" else ""] if (ids as Array).size() > 1 else ""
	return {"ok": true, "message": "%s enlisted as %s and began drilling%s." % [", ".join(done), str(u["name"]).to_lower(), of]}


static func _join_company(sim: Simulation, unit_id: String, b: Building) -> Dictionary:
	var k := Kingdoms.player(sim)
	var size := int(uval("COMPANY_SIZE"))
	for c: Dictionary in k["companies"]:
		if c["kind"] == unit_id and c.get("state") != "deployed" and c.get("state") != "returning" and _members(c).size() < size:
			return c
	var e := b.entrance()
	var c := {"id": sim.alloc_id(), "kind": unit_id, "strength": 0, "pledgedTo": null, "owner": Kingdoms.PLAYER, "members": [], "state": "home",
		"supplies": 0, "readiness": 100, "x": e.x + 0.5, "y": e.y + 0.5, "home": {"x": e.x + 0.5, "y": e.y + 0.5}, "target": null, "path": null}
	(k["companies"] as Array).append(c)
	return c


static func _discharge(sim: Simulation, s: Settler, at: Vector2) -> void:
	var m := s.military
	_return_gear(sim, m["gear"], at)
	s.job = str(m["priorJob"])
	s.has_priorities = m["priorPriorities"] != null
	s.priorities = (m["priorPriorities"] as Array).duplicate() if m["priorPriorities"] != null else []
	s.area_id = int(m["priorArea"]) if m["priorArea"] != null and sim.area(int(m["priorArea"])) != null else -1
	s.military = {}
	s.task = null
	s.hidden = false
	s.next_think = 0


static func cancel_training(sim: Simulation, settler_id: Variant) -> Dictionary:
	var s := sim.settler(int(settler_id)) if (settler_id is int or settler_id is float) else null
	if s == null or s.military.is_empty() or s.military["state"] != "training":
		return {"ok": false, "message": "They are not in training"}
	var c := company_of(sim, s)
	var b: Building = sim.buildings.get(int(s.military["buildingId"]))
	_discharge(sim, s, Vector2(b.entrance()) if b != null else Vector2(s.x, s.y))
	if not c.is_empty():
		_members(c).erase(s.id)
		if _members(c).is_empty():
			player_companies(sim).erase(c)
	return {"ok": true, "message": "%s went back to being a %s; their gear is back in store." % [s.name, s.job]}


static func demobilize(sim: Simulation, company_id: Variant) -> Dictionary:
	var c := company_by_id(sim, company_id)
	if c.is_empty():
		return {"ok": false, "message": "No such company"}
	if c.get("state") == "deployed" or c.get("state") == "returning":
		return {"ok": false, "message": "Recall the company home before standing it down"}
	for id: Variant in _members(c).duplicate():
		var s := sim.settler(int(id))
		if s != null and not s.military.is_empty():
			var home: Variant = c.get("home")
			_discharge(sim, s, Vector2(float(home["x"]), float(home["y"])) if home != null else Vector2(s.x, s.y))
	if int(c.get("supplies", 0)) > 0:
		sim.deposit_anywhere("food", int(c["supplies"]), float(c.get("x", 0)), float(c.get("y", 0)))
		c["supplies"] = 0
	player_companies(sim).erase(c)
	sim.emit({"type": "important"})
	return {"ok": true, "message": "The company stood down. Everyone returns to their old work and their gear goes back to store."}


## Loads the explored chunks between two points (and a chunk around), so a march can be planned
## over known land without generating anything unexplored.
static func _load_known(sim: Simulation, from: Vector2i, to: Vector2i) -> void:
	var c0 := Vector2i(mini(from.x, to.x) >> Chunk.SHIFT, mini(from.y, to.y) >> Chunk.SHIFT) - Vector2i.ONE
	var c1 := Vector2i(maxi(from.x, to.x) >> Chunk.SHIFT, maxi(from.y, to.y) >> Chunk.SHIFT) + Vector2i.ONE
	for k in sim.world.explored_chunk_keys():
		var cx := World.key_cx(k)
		var cy := World.key_cy(k)
		if cx >= c0.x and cx <= c1.x and cy >= c0.y and cy <= c1.y:
			sim.world.ensure(cx, cy)


static func _path_to(sim: Simulation, from: Vector2i, to: Vector2i, adjacent: bool) -> Variant:
	_load_known(sim, from, to)
	var r := GridAStar.find_path(sim, from.x, from.y, GridAStar.Goal.new(to.x, to.y, 1, 1, adjacent), 60000)
	if r == null or not r.found:
		return null
	var out: Array = []
	for i in r.steps.size() / 2:
		out.append({"x": r.steps[i * 2], "y": r.steps[i * 2 + 1]})
	return out


## Orders for a company: march to a spot (carrying food for some days), hold, or come home.
static func order(sim: Simulation, company_id: Variant, what: Variant, x: Variant = null, y: Variant = null, supply_days: Variant = null) -> Dictionary:
	var c := company_by_id(sim, company_id)
	if c.is_empty():
		return {"ok": false, "message": "No such company"}
	var ready: Array = _members(c).filter(func(id: Variant) -> bool:
		var s := sim.settler(int(id))
		return s != null and not s.military.is_empty() and s.military["state"] != "training")
	if ready.is_empty():
		return {"ok": false, "message": "Nobody in this company has finished training"}
	if what == "hold":
		c["target"] = null
		c["path"] = null
		return {"ok": true, "message": "Holding position."}
	if what == "retreat":
		if c.get("state", "home") == "home":
			return {"ok": true, "message": "Already home."}
		c["state"] = "returning"
		c["target"] = (c["home"] as Dictionary).duplicate() if c.get("home") != null else null
		c["path"] = null
		return {"ok": true, "message": "Coming home."}
	if what != "move" and what != "defend":
		return {"ok": false, "message": "Unknown order"}
	if not (x is int or x is float) or not (y is int or y is float) or float(x) != floorf(float(x)) or float(y) != floorf(float(y)):
		return {"ok": false, "message": "Choose a place"}
	var tx := int(x)
	var ty := int(y)
	var entry := Territory.can_enter(sim, Kingdoms.PLAYER, Territory.sector_of(tx, ty), true)
	if not entry["allowed"]:
		return {"ok": false, "message": entry["reason"]}
	if not sim.world.explored(tx, ty):
		return {"ok": false, "message": "Explore there first"}
	var path: Variant = _path_to(sim, Vector2i(floori(float(c.get("x", 0))), floori(float(c.get("y", 0)))), Vector2i(tx, ty), not sim.walkable(tx, ty))
	if path == null:
		return {"ok": false, "message": "No way there on foot"}
	var budget := int(Content.get_value("war", "ACTIVE_BUDGET"))
	if c.get("state", "home") == "home" and Combat.deployed_soldiers(sim) + ready.size() > budget:
		return {"ok": false, "message": "The field is crowded (%d soldiers at most across every side) — wait for others to come home" % budget}
	if c.get("state", "home") == "home":
		var days := int(supply_days) if (supply_days is int or supply_days is float) and int(supply_days) >= 1 else 2
		var food := ready.size() * int(uval("RATION")) * days
		if sim.stored_total("food") < food:
			return {"ok": false, "message": "The company needs %d food for %d days (only %d in store)" % [food, days, sim.stored_total("food")]}
		sim.withdraw_unreserved("food", food)
		c["supplies"] = food
		c["readiness"] = 100
		c["health"] = 100
		c["morale"] = 100
		for id: Variant in ready:
			var s := sim.settler(int(id))
			SettlerTasks.abort_task(sim, s)
			s.military["state"] = "deployed"
			s.hidden = true
	c["state"] = "deployed"
	c["target"] = {"x": tx + 0.5, "y": ty + 0.5}
	c["path"] = path
	c["orders"] = what
	c["suppliesDay"] = sim.day()
	return {"ok": true, "message": "Marching with %d food." % int(c["supplies"])}


static func _march(sim: Simulation, c: Dictionary) -> void:
	if c.get("target") == null:
		return
	if c.get("path") == null:
		var p: Variant = _path_to(sim, Vector2i(floori(float(c.get("x", 0))), floori(float(c.get("y", 0)))), Vector2i(floori(float(c["target"]["x"])), floori(float(c["target"]["y"]))), false)
		c["path"] = p if p != null else []
	var path: Array = c["path"]
	if path.is_empty():
		c["x"] = c["target"]["x"]
		c["y"] = c["target"]["y"]
		_arrive(sim, c)
		return
	var next: Dictionary = path[0]
	# Checked at every step: soldiers never walk into land they may not enter.
	if c["state"] == "deployed" and not Territory.can_enter(sim, Kingdoms.PLAYER, Territory.sector_of(int(next["x"]), int(next["y"])), true)["allowed"]:
		c["target"] = null
		c["path"] = null
		return
	var dx := int(next["x"]) + 0.5 - float(c.get("x", 0))
	var dy := int(next["y"]) + 0.5 - float(c.get("y", 0))
	var d := JsMath.hypot(dx, dy)
	var v := float(uval("MARCH_SPEED")) * (0.5 + float(c.get("readiness", 100)) / 200.0)
	if d <= v:
		c["x"] = int(next["x"]) + 0.5
		c["y"] = int(next["y"]) + 0.5
		path.remove_at(0)
	else:
		c["x"] = float(c.get("x", 0)) + dx / d * v
		c["y"] = float(c.get("y", 0)) + dy / d * v


static func _arrive(sim: Simulation, c: Dictionary) -> void:
	c["target"] = null
	c["path"] = null
	if c["state"] != "returning":
		return
	c["state"] = "home"
	if int(c.get("supplies", 0)) > 0:
		sim.deposit_anywhere("food", int(c["supplies"]), float(c.get("x", 0)), float(c.get("y", 0)))
		c["supplies"] = 0
	for id: Variant in _members(c):
		var s := sim.settler(int(id))
		if s == null or s.military.is_empty():
			continue
		if s.military["state"] == "deployed":
			s.military["state"] = "ready"
		s.hidden = false
		if c.get("home") != null:
			s.x = float(c["home"]["x"])
			s.y = float(c["home"]["y"])
		s.px = s.x
		s.py = s.y
		s.rpx = s.x
		s.rpy = s.y
		s.rx = s.x
		s.ry = s.y
		s.next_think = 0
	sim.toast("A company has come home.", "info")


## A company on the march that passes one of your travellers' camps rests there once a day.
static func rest_at_camp(sim: Simulation, c: Dictionary) -> bool:
	if c["state"] != "deployed" or c.get("restedDay") == sim.day():
		return false
	var x := float(c.get("x", 0))
	var y := float(c.get("y", 0))
	var camp: Building = null
	for b: Building in sim.buildings.values():
		if b.type == "travelCamp" and b.built and JsMath.hypot(b.center_x() - x, b.center_y() - y) <= CAMP_REACH + 1.5:
			camp = b
	if camp == null:
		return false
	c["restedDay"] = sim.day()
	var mouths := _deployed_members(sim, c)
	var want := maxi(0, mouths * int(uval("RATION")) * 2 - int(c.get("supplies", 0)))
	var got := sim.withdraw_unreserved("food", want) if want > 0 else 0
	c["supplies"] = int(c.get("supplies", 0)) + got
	c["readiness"] = 100
	c["morale"] = minf(100, float(c.get("morale", 100)) + 25)
	sim.toast("A company rested at the travellers' camp%s." % (" and restocked %d food" % got if got > 0 else ""), "info")
	return true


static func _deployed_members(sim: Simulation, c: Dictionary) -> int:
	var n := 0
	for id: Variant in _members(c):
		var s := sim.settler(int(id))
		if s != null and not s.military.is_empty() and s.military["state"] == "deployed":
			n += 1
	return n


## Rations once a day; hunger costs readiness and brings them home — never lives.
static func _eat(sim: Simulation, c: Dictionary) -> void:
	if c.get("suppliesDay") == sim.day():
		return
	c["suppliesDay"] = sim.day()
	var need := _deployed_members(sim, c) * int(uval("RATION"))
	if int(c.get("supplies", 0)) >= need:
		c["supplies"] = int(c.get("supplies", 0)) - need
		c["readiness"] = minf(100, float(c.get("readiness", 100)) + 5)
		return
	c["supplies"] = 0
	c["readiness"] = maxf(0, float(c.get("readiness", 100)) - float(uval("HUNGRY_READINESS_LOSS")))
	if float(c["readiness"]) <= 0 and c["state"] == "deployed":
		c["state"] = "returning"
		c["target"] = (c["home"] as Dictionary).duplicate() if c.get("home") != null else null
		c["path"] = null
		sim.toast("A company ran out of food and is marching home.", "warn")
	else:
		sim.toast("A company is out of food: its readiness is falling.", "warn")


static func _train(sim: Simulation) -> void:
	for s in sim.settlers:
		var m := s.military
		if m.is_empty() or m["state"] != "training":
			continue
		var u := unit(m["unit"])
		if float(m["trained"]) >= float(u["trainTicks"]):
			m["state"] = "ready"
			sim.stats["soldiersTrained"] = int(sim.stats["soldiersTrained"]) + 1
			sim.toast("%s finished training as %s." % [s.name, str(u["name"]).to_lower()], "good")


static func _feed_horses(sim: Simulation) -> void:
	if sim.day() == sim.horse_day:
		return
	sim.horse_day = sim.day()
	var horses := sim.stored_total("horses")
	for s in sim.settlers:
		if not s.military.is_empty():
			horses += int((s.military["gear"] as Dictionary).get("horses", 0))
	if horses == 0:
		return
	var need := horses * int(uval("HORSE_FEED"))
	var fed := sim.withdraw_unreserved("food", need)
	sim.stats["horseFeed"] = int(sim.stats["horseFeed"]) + fed
	if fed < need:
		sim.toast("The horses went hungry today — keep food in store.", "warn")


# ---- allied contingents -----------------------------------------------------------------------------

## The staging ground: the player's own sector nearest the target.
static func _staging_for(sim: Simulation, target_id: int) -> Dictionary:
	var t := Diplomacy.seat_of(sim, target_id)
	var me := Kingdoms.player(sim)
	var mine: Array = []
	if me["homeland"] != null:
		mine.append_array(me["homeland"])
	for k: String in sim.claims:
		if int(sim.claims[k]["legalOwner"]) == int(me["id"]):
			var s := Territory.from_key(k)
			mine.append({"x": s.x, "y": s.y})
	var best := {"x": 0, "y": 0}
	var best_d := INF
	for s: Dictionary in mine:
		var d := JsMath.hypot(int(s["x"]) * 16 + 8 - t.x, int(s["y"]) * 16 + 8 - t.y)
		if d < best_d:
			best_d = d
			best = {"x": int(s["x"]), "y": int(s["y"])}
	return best


static func mobilize(sim: Simulation, plan_id: Variant) -> Dictionary:
	var plan := Campaigns.find_plan(sim, plan_id)
	if plan.is_empty() or plan["state"] != "drafting":
		return {"ok": false, "message": "That plan is not open"}
	if ready_companies(sim).is_empty():
		return {"ok": false, "message": "Mustering needs an army: train at least one company first"}
	plan["state"] = "mobilizing"
	plan["staging"] = _staging_for(sim, int(plan["target"]))
	var n := 0
	for c: Dictionary in sim.commitments:
		if int(c["campaignId"]) != int(plan["id"]) or c["state"] != "accepted":
			continue
		c["state"] = "assembling"
		c["arriveTick"] = sim.tick + Defs.DAY_TICKS / 4 + Diplomacy.letter_ticks(sim, int(c["contributor"]), 0)
		n += 1
	sim.emit({"type": "important"})
	var allies := ("%d allied contingent%s assembling." % [n, " is" if n == 1 else "s are"]) if n > 0 else "No allies have agreed to come."
	return {"ok": true, "message": "Mustering at your sector %d,%d. %s Nothing marches until you launch." % [plan["staging"]["x"], plan["staging"]["y"], allies]}


static func _update_contingents(sim: Simulation) -> void:
	var me := Kingdoms.player(sim)
	for c: Dictionary in sim.commitments:
		var ally := Kingdoms.by_id(sim, int(c["contributor"]))
		if ally.is_empty():
			continue
		var letters := Diplomacy.letter_ticks(sim, int(c["contributor"]), 0)
		if c["state"] == "assembling" and sim.tick >= int(c.get("arriveTick", 0)) - letters:
			c["state"] = "enRoute"
		if c["state"] == "enRoute" and sim.tick >= int(c.get("arriveTick", 0)):
			# Service begins on arrival at the staging ground, and the fee is earned.
			c["state"] = "arrived"
			ally["treasury"] = float(ally["treasury"]) + float(c["escrow"])
			c["escrow"] = 0
			c["serviceEnds"] = sim.tick + int(c["terms"]["serviceDays"]) * Defs.DAY_TICKS
			c["supplyDay"] = sim.day()
			sim.toast("%s's soldiers have reached your staging ground." % ally["name"], "good")
			sim.emit({"type": "important"})
		if (c["state"] == "arrived" or c["state"] == "active") and c.get("supplyDay") != sim.day():
			c["supplyDay"] = sim.day()
			var food := ceili((c["terms"]["companies"] as Array).size() * 4 * float(c["terms"]["requesterSupplyShare"]))
			var got := sim.withdraw_unreserved("food", food) if food > 0 else 0
			if got < food:
				c["supplyMissed"] = int(c.get("supplyMissed", 0)) + 1
				if int(c["supplyMissed"]) >= 2:
					# After a day's grace, an unpaid supply share is a broken promise: they go home.
					c["state"] = "returning"
					(c["reasons"] as Array).append("You did not supply their soldiers as agreed")
					Diplomacy.change_trust(sim, int(ally["id"]), int(me["id"]), -15)
					c["returnTick"] = sim.tick + letters
					sim.toast("%s is withdrawing: you did not feed their soldiers as agreed." % ally["name"], "warn")
				else:
					sim.toast("%s's soldiers went unfed today — one more day and they leave." % ally["name"], "warn")
			else:
				c["supplyMissed"] = 0
		if (c["state"] == "arrived" or c["state"] == "active") and c.get("serviceEnds") != null and sim.tick >= int(c["serviceEnds"]):
			c["state"] = "returning"
			c["returnTick"] = sim.tick + letters
		if c["state"] == "returning" and sim.tick >= int(c.get("returnTick", 0)):
			c["state"] = "fulfilled"
			for q: Dictionary in ally["companies"]:
				if q["pledgedTo"] != null and int(q["pledgedTo"]) == int(c["id"]):
					q["pledgedTo"] = null


static func update(sim: Simulation) -> void:
	_train(sim)
	_feed_horses(sim)
	for c: Dictionary in player_companies(sim).duplicate():
		c["strength"] = _company_strength(sim, c)
		if c.get("state") == "deployed" or c.get("state") == "returning":
			_eat(sim, c)
			_march(sim, c)
			if sim.tick % 25 == 0:
				rest_at_camp(sim, c)
	_update_contingents(sim)


# ---- the soldier's own day -----------------------------------------------------------------------

## Recruits drill at their training ground; ready soldiers wait on duty near it.
static func soldier_routine(sim: Simulation, s: Settler) -> Task:
	var m := s.military
	var b: Building = sim.buildings.get(int(m["buildingId"]))
	if m["state"] == "training" and b != null:
		s.idle_reason = ""
		var t := Task.new()
		t.kind = Task.TRAIN
		t.site = b.id
		return t
	s.idle_reason = "On duty as %s — give orders from the Realm window" % str(unit(m["unit"])["name"]).to_lower()
	s.next_think = sim.tick + SettlerBrain.IDLE_BACKOFF * 3
	if b != null and s.task == null and sim.rng.chance(0.3):
		var e := b.entrance()
		var x := e.x + sim.rng.int_below(5) - 2
		var y := e.y + sim.rng.int_below(3)
		if sim.walkable(x, y):
			s.task = Task.move(x, y, true)
	return null


static func run_train(sim: Simulation, s: Settler, t: Task) -> void:
	var b: Building = sim.buildings.get(t.site)
	if b == null or s.military.is_empty() or s.military["state"] != "training":
		SettlerTasks.abort_task(sim, s)
		return
	if t.stage == &"walk":
		var r := SettlerTasks.go_to(sim, s, b.goal_adjacent())
		if r == SettlerTasks.Move.FAILED:
			SettlerTasks.fail(sim, s, "Can't reach the training ground", Simulation.T_BUILDING + b.id)
			return
		if r == SettlerTasks.Move.ARRIVED:
			t.stage = &"drill"
		return
	SettlerTasks.face_rect(s, b.x, b.y, b.w, b.h)
	s.anim = &"work"
	s.tool = &"hand" if s.military["unit"] == "archer" else &"hammer"
	s.military["trained"] = float(s.military["trained"]) + SettlerTasks.work_speed(sim, s)
	if float(s.military["trained"]) >= float(unit(s.military["unit"])["trainTicks"]):
		SettlerTasks.abort_task(sim, s)


## Where the land under a company belongs (for its inspector).
static func company_where(sim: Simulation, c: Dictionary) -> String:
	var o := Territory.owner_of(sim, Territory.sector_of(float(c.get("x", 0)), float(c.get("y", 0))))
	return "in %s's land" % Kingdoms.name_of(sim, int(o["legalOwner"]), "someone") if not o.is_empty() else "in unclaimed land"
