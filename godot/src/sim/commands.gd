class_name Commands
## Every change the player makes goes through `apply`, which validates it and returns
## {ok: bool, message: String} so the interface can explain refusals (src/game/sim/commands.ts).
## Commands are plain Dictionaries with a "type", the same shapes as the browser game's.
##
## Ported: move, gather, work, place, placeArea, remove, designate, setJob, setPriorities, setCrop,
## setRecipe, toggleWorkshop, assignWorker, unassignWorker, stop, hold, returnGoods,
## formHousehold, requestChild, cancelChildRequest, adoptDeliberateGrowth, acceptRecruit, cancelRecruit,
## createArea, updateArea, deleteArea, assignArea, upgradeBuilding, cancelUpgrade, hunt,
## surveyDeposit, upgradeMine, rally, takeThrone, trainRole, cancelRoleTraining, hearAdvice, placeSpan,
## assignSettlement, renameSettlement, setWants, createRoute, setRouteTarget, cancelRoute, setSideJob,
## and the realm: coronate, setPolicy, appointCouncil, claimFrontier, setConflictMode,
## activateFrontier, proposeTreaty, respondToOffer, cancelTreaty, respondToIncident,
## respondToWarning, barter, enlist, cancelTraining, demobilize, orderCompany, createWarPlan,
## requestCampaignSupport, acceptCampaignOffer, counterCampaignOffer, cancelWarPlan,
## mobilizeCampaign, launchCampaign, declareWar, evacuate. That is every browser command.

const MAX_AREA := 40 * 40
## Jobs that can be worked on the side of a main job.
const SIDE_JOBS: Array[String] = ["laborer", "farmer", "gatherer", "builder", "hauler", "crafter", "hunter", "herder"]


static func apply(sim: Simulation, cmd: Dictionary) -> Dictionary:
	var res := _apply(sim, cmd)
	var t: String = cmd.get("type", "")
	if bool(res["ok"]) and t != "move" and t != "gather":
		sim.wake_idle()
	return res


static func _ok(message: String = "") -> Dictionary:
	return {"ok": true, "message": message}


static func _err(message: String) -> Dictionary:
	return {"ok": false, "message": message}


static func _is_int(v: Variant) -> bool:
	return (v is int or (v is float and float(v) == floorf(float(v)))) and absf(float(v)) < 1000000


static func _pick_settlers(sim: Simulation, ids: Variant) -> Array[Settler]:
	var out: Array[Settler] = []
	if ids is Array:
		for id: Variant in ids:
			if _is_int(id):
				var s := sim.settler(int(id))
				if s != null:
					out.append(s)
	return out


## Settlers who can take a work order (children are left out), or an error message.
static func _pick_workers(sim: Simulation, ids: Variant, what: String) -> Variant:
	var all := _pick_settlers(sim, ids)
	if all.is_empty():
		return "Select a settler first"
	var list: Array[Settler] = []
	for s in all:
		if s.life_stage != "child" and not s.ruler and s.military.is_empty():
			list.append(s)
	if not list.is_empty():
		return list
	for s in all:
		if s.ruler:
			return "%s is the ruler — rulers give orders and inspire, but don't do chores. Right-click the ground to walk there." % s.name
	for s in all:
		if not s.military.is_empty():
			return "%s is a soldier — stand their company down first" % s.name
	var who := "%s is a child" % all[0].name if all.size() == 1 else "These are children"
	return "%s — children play near home and can't %s until they grow up" % [who, what]


## Interrupts whatever a settler was doing for a direct order.
static func _take_order(sim: Simulation, s: Settler) -> void:
	SettlerTasks.abort_task(sim, s)
	s.focus = {}
	s.hold = false
	s.stopped_until = -1
	s.idle_reason = ""


## Stops work that came from a job or work order the player just changed, so the settler
## re-plans at once. Goods in hand are kept; direct orders and needs are left alone.
static func _replan(sim: Simulation, s: Settler) -> void:
	s.next_think = 0
	if s.task == null:
		return
	var k := s.task.kind
	if k == Task.GATHER or k == Task.FARM or k == Task.BUILD or k == Task.CRAFT or (k == Task.HAUL and s.task.stage == &"toSrc"):
		SettlerTasks.abort_task(sim, s)


## Nearby walkable tiles in a spiral, so a group spreads out instead of stacking.
static func _spread_targets(sim: Simulation, x: int, y: int, count: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for r in 5:
		if out.size() >= count:
			break
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				if out.size() >= count:
					break
				if maxi(absi(dx), absi(dy)) != r:
					continue
				if sim.walkable(x + dx, y + dy):
					out.append(Vector2i(x + dx, y + dy))
	return out


static func _rect(cmd: Dictionary) -> Rect2i:
	var x0 := mini(int(cmd["x0"]), int(cmd["x1"]))
	var y0 := mini(int(cmd["y0"]), int(cmd["y1"]))
	return Rect2i(x0, y0, maxi(int(cmd["x0"]), int(cmd["x1"])) - x0 + 1, maxi(int(cmd["y0"]), int(cmd["y1"])) - y0 + 1)


static func _rect_ok(cmd: Dictionary) -> bool:
	for k: String in ["x0", "y0", "x1", "y1"]:
		if not _is_int(cmd.get(k)):
			return false
	return true


static func _apply(sim: Simulation, cmd: Dictionary) -> Dictionary:
	match str(cmd.get("type", "")):
		"move":
			if not _is_int(cmd.get("x")) or not _is_int(cmd.get("y")):
				return _err("Invalid location")
			var list := _pick_settlers(sim, cmd.get("ids"))
			if list.is_empty():
				return _err("Select a settler first")
			var targets := _spread_targets(sim, int(cmd["x"]), int(cmd["y"]), list.size())
			if targets.is_empty():
				return _err("Can't walk there")
			for i in list.size():
				var t := targets[i % targets.size()]
				_take_order(sim, list[i])
				list[i].task = Task.move(t.x, t.y)
			return _ok()

		"gather":
			if not _is_int(cmd.get("x")) or not _is_int(cmd.get("y")):
				return _err("Invalid location")
			var picked: Variant = _pick_workers(sim, cmd.get("ids"), "gather")
			if picked is String:
				return _err(picked)
			var x := int(cmd["x"])
			var y := int(cmd["y"])
			var o := sim.world.obj(x, y)
			if o == World.UNKNOWN or not Tiles.object_def(o).has("resource") or sim.world.amount(x, y) <= 0:
				return _err("Nothing to gather there")
			var k := Simulation.K_OBJ + Simulation.tile_key(x, y)
			var first := true
			for s: Settler in picked:
				_take_order(sim, s)
				s.focus = {"res": Tiles.object_def(o)["resource"], "x": x, "y": y, "until": sim.tick + Defs.DAY_TICKS * 2}
				# The first free settler takes the clicked object; the rest fan out to its neighbours.
				if first and not s.carrying() and sim.reserve(k, s.id):
					s.task = Task.gather(x, y)
					first = false
			return _ok()

		"place":
			var type: String = str(cmd.get("building", ""))
			if not Defs.is_building(type) or not _is_int(cmd.get("x")) or not _is_int(cmd.get("y")):
				return _err("Invalid building")
			var check := BuildingOps.check_placement(sim, type, int(cmd["x"]), int(cmd["y"]))
			if not bool(check["ok"]):
				return _err(check["reason"] if check["reason"] != "" else "Can't build here")
			BuildingOps.place(sim, type, int(cmd["x"]), int(cmd["y"]), _crop_of(cmd))
			sim.emit({"type": "sfx", "name": "place", "x": float(cmd["x"]), "y": float(cmd["y"])})
			sim.emit({"type": "important"})
			var short := BuildingOps.shortfall(sim, type)
			return _ok("Builders will wait for %s." % short if short != "" else "")

		"placeArea":
			var type: String = str(cmd.get("building", ""))
			if not Defs.is_building(type) or not _rect_ok(cmd):
				return _err("Invalid area")
			var d := Defs.building(type)
			if not bool(d.get("paint", false)):
				return _err("This building is placed one at a time")
			var r := _rect(cmd)
			if r.get_area() > MAX_AREA:
				return _err("That area is too large")
			var placed := 0
			var reason := ""
			for y in range(r.position.y, r.end.y):
				for x in range(r.position.x, r.end.x):
					var check := BuildingOps.check_placement(sim, type, x, y)
					if bool(check["ok"]):
						BuildingOps.place(sim, type, x, y, _crop_of(cmd))
						placed += 1
					elif reason == "":
						reason = check["reason"]
			if placed == 0:
				return _err(reason if reason != "" else "Can't build here")
			sim.emit({"type": "sfx", "name": "place", "x": float(r.position.x), "y": float(r.position.y)})
			sim.emit({"type": "important"})
			var parts: PackedStringArray = ["Placed %d %s%s." % [placed, str(d["name"]).to_lower(), "s" if placed > 1 else ""]]
			var short := BuildingOps.shortfall(sim, type, placed)
			if short != "":
				parts.append("Builders will wait for %s." % short)
			return _ok(" ".join(parts))

		"remove":
			var b: Building = sim.buildings.get(int(cmd.get("buildingId", -1)))
			if b == null:
				return _err("Nothing to remove")
			if b.type == "camp":
				return _err("The camp is the heart of the valley and stays put")
			if b.built and bool(b.def().get("permanent", false)):
				return _err("The %s is permanent and can't be demolished" % str(b.def()["name"]).to_lower())
			return _ok(BuildingOps.remove(sim, b))

		"designate":
			if not _rect_ok(cmd):
				return _err("Invalid area")
			var r := _rect(cmd)
			if r.get_area() > MAX_AREA * 2:
				return _err("That area is too large")
			var on: bool = cmd.get("on", true)
			var n := 0
			for y in range(r.position.y, r.end.y):
				for x in range(r.position.x, r.end.x):
					var k := Simulation.tile_key(x, y)
					if not on:
						if sim.designations.erase(k):
							n += 1
						continue
					if not sim.world.explored(x, y):
						continue
					var o := sim.world.obj(x, y)
					if o != World.UNKNOWN and Tiles.object_resource[o] != "" and sim.world.amount(x, y) > 0 and sim.designations.add(k):
						n += 1
			if n == 0:
				return _err("No trees, rocks or bushes in that area" if on else "Nothing was marked there")
			return _ok("Marked %d for harvest." % n if on else "Unmarked %d." % n)

		"setJob":
			var job: String = str(cmd.get("job", ""))
			if not Defs.is_job(job):
				return _err("Unknown job")
			var picked: Variant = _pick_workers(sim, cmd.get("ids"), "take a job")
			if picked is String:
				return _err(picked)
			for s: Settler in picked:
				if s.job == job and not s.has_priorities:
					continue
				s.job = job
				# Choosing a job resets any custom work order to that job's default.
				s.has_priorities = false
				s.priorities = []
				_replan(sim, s)
			var list: Array = picked
			return _ok("%s is now a %s." % [(list[0] as Settler).name, Defs.job(job)["name"]] if list.size() == 1 else "")

		"setPriorities":
			var picked: Variant = _pick_workers(sim, cmd.get("ids"), "change their work order")
			if picked is String:
				return _err(picked)
			var raw: Variant = cmd.get("priorities")
			var clean: Array = []
			if raw is Array:
				for k: Variant in raw:
					if SettlerBrain.WORK_KINDS.has(str(k)) and not clean.has(str(k)):
						clean.append(str(k))
			for s: Settler in picked:
				s.has_priorities = raw != null
				s.priorities = clean if raw != null else []
				_replan(sim, s)
			return _ok()

		"setCrop":
			var crop: Variant = cmd.get("crop")
			if crop != null and not Defs.is_crop(str(crop)):
				return _err("Unknown crop")
			if crop != null and not BuildingOps.is_unlocked(sim, Defs.crop(str(crop)).get("unlock")):
				return _err("That crop is not unlocked yet")
			for id: Variant in cmd.get("buildingIds", []):
				var b: Building = sim.buildings.get(int(id))
				if b != null and b.is_field():
					var c := "" if crop == null else str(crop)
					if b.field["crop"] != c:
						b.field["crop"] = c
						if b.field["state"] == "growing" or b.field["state"] == "ripe":
							b.field["state"] = "tilled"
							b.field["growth"] = 0.0
			return _ok()

		"work":
			return _work(sim, cmd)

		"createArea":
			return _create_area(sim, cmd)

		"placeSpan":
			var st := str(cmd.get("building", ""))
			if not Defs.is_building(st) or not Defs.building(st).has("span"):
				return _err("Invalid building")
			if not _rect_ok(cmd):
				return _err("Invalid location")
			var sc := BuildingOps.check_span(sim, st, int(cmd["x0"]), int(cmd["y0"]), int(cmd["x1"]), int(cmd["y1"]))
			if not bool(sc["ok"]):
				return _err(sc["reason"] if sc["reason"] != "" else "Can't build here")
			var sr: Rect2i = sc["rect"]
			var span_b := BuildingOps.place(sim, st, sr.position.x, sr.position.y, "", sr.size)
			sim.emit({"type": "sfx", "name": "place", "x": float(sr.position.x), "y": float(sr.position.y)})
			sim.emit({"type": "important"})
			var short := ""
			var tot := sim.totals()
			for e in Inv.entries(BuildingOps.cost_of(span_b)):
				if int(tot.get(e[0], 0)) < int(e[1]):
					short += ("" if short == "" else ", ") + "%d more %s" % [int(e[1]) - int(tot.get(e[0], 0)), str(Defs.resource(e[0])["name"]).to_lower()]
			var span_res := _ok("Stone bridge planned: %d tiles.%s" % [maxi(sr.size.x, sr.size.y), " Builders will wait for %s." % short if short != "" else ""])
			span_res["id"] = span_b.id
			return span_res

		"assignSettlement":
			var st := Settlements.find(sim, int(cmd["settlementId"]) if _is_int(cmd.get("settlementId")) else -1)
			if st.is_empty():
				return _err("That settlement is gone")
			var hall: Building = sim.buildings.get(int(st["id"]))
			var movers: Array[Settler] = []
			for s0 in _pick_settlers(sim, cmd.get("ids")):
				if s0.settlement_id != int(st["id"]):
					movers.append(s0)
			if movers.is_empty():
				return _err("Select settlers who live somewhere else first")
			var names: PackedStringArray = []
			for s1 in movers:
				_take_order(sim, s1)
				s1.settlement_id = int(st["id"])
				# A new home means a new bed, and walking over there.
				s1.home_id = -1
				s1.area_id = -1
				for b2: Building in sim.buildings.values():
					b2.workers.erase(s1.id)
				if hall != null:
					s1.task = Task.move(hall.x + hall.w / 2, hall.y + hall.h)
				names.append(s1.name)
			sim.forget_work_index()
			var homeless := BuildingOps.assign_homes(sim)
			var beds := " %d settler%s no bed yet." % [homeless, " has" if homeless == 1 else "s have"] if homeless > 0 else ""
			return _ok("%s %s moving to %s.%s" % [", ".join(names), "is" if movers.size() == 1 else "are", st["name"], beds])

		"renameSettlement":
			var st2 := Settlements.find(sim, int(cmd["settlementId"]) if _is_int(cmd.get("settlementId")) else -1)
			if st2.is_empty():
				return _err("That settlement is gone")
			var nm: String = str(cmd["name"]).strip_edges().left(30) if cmd.get("name") is String else ""
			if nm == "":
				return _err("Give it a name")
			st2["name"] = nm
			return _ok()

		"setWants":
			var wb: Building = sim.buildings.get(int(cmd["buildingId"])) if _is_int(cmd.get("buildingId")) else null
			if wb == null or not wb.is_storage():
				return _err("Stock targets are for storehouses and settlement halls")
			if not Defs.resource_ids().has(str(cmd.get("res", ""))) or not _is_int(cmd.get("amount")) or int(cmd["amount"]) < 0:
				return _err("Invalid stock target")
			var amount := mini(int(cmd["amount"]), wb.storage_capacity())
			if amount == 0:
				wb.wants.erase(str(cmd["res"]))
			else:
				wb.wants[str(cmd["res"])] = amount
			return _ok()

		"createRoute":
			return Logistics.create_route(sim, cmd.get("sourceId"), cmd.get("destinationId"), cmd.get("resource"), cmd.get("target"))

		"setRouteTarget":
			return Logistics.set_route_target(sim, cmd.get("routeId"), cmd.get("target"))

		"cancelRoute":
			return Logistics.cancel_route(sim, cmd.get("routeId"))

		"coronate":
			return Kingdoms.coronate(sim, cmd.get("rulerName"), cmd.get("kingdomName"), cmd.get("banner"))
		"setPolicy":
			return Kingdoms.set_policy(sim, cmd.get("policy"))
		"appointCouncil":
			return Kingdoms.appoint_council(sim, cmd.get("post"), cmd.get("settlerId"))
		"claimFrontier":
			return Territory.claim_frontier(sim, cmd.get("sector"))
		"setConflictMode":
			return Territory.set_conflict_mode(sim, cmd.get("mode"))
		"activateFrontier":
			return Territory.activate_frontier(sim)
		"proposeTreaty":
			return Diplomacy.propose(sim, cmd.get("kind"), cmd.get("to"), cmd.get("terms"))
		"respondToOffer":
			return Diplomacy.respond(sim, cmd.get("offerId"), cmd.get("accept"))
		"cancelTreaty":
			return Diplomacy.cancel(sim, cmd.get("offerId"))
		"respondToIncident":
			return Diplomacy.respond_to_incident(sim, cmd.get("incidentId"), cmd.get("response"))
		"respondToWarning":
			return Concern.respond(sim, cmd.get("warningId"), cmd.get("action"))
		"barter":
			return Merchants.barter(sim, cmd.get("partyId"), cmd.get("give"), cmd.get("take"), cmd.get("coins", 0))
		"enlist":
			return Military.enlist(sim, cmd.get("ids"), cmd.get("unit"), cmd.get("buildingId"))
		"cancelTraining":
			return Military.cancel_training(sim, cmd.get("settlerId"))
		"demobilize":
			return Military.demobilize(sim, cmd.get("companyId"))
		"orderCompany":
			return Military.order(sim, cmd.get("companyId"), cmd.get("order"), cmd.get("x"), cmd.get("y"), cmd.get("supplyDays"))
		"createWarPlan":
			return Campaigns.create_plan(sim, cmd.get("target"), cmd.get("objective"))
		"requestCampaignSupport":
			return Campaigns.request_support(sim, cmd.get("planId"), cmd.get("ally"), cmd.get("terms"))
		"acceptCampaignOffer":
			return Campaigns.accept_offer(sim, cmd.get("commitmentId"))
		"counterCampaignOffer":
			return Campaigns.counter_offer(sim, cmd.get("commitmentId"), cmd.get("terms"))
		"cancelWarPlan":
			return Campaigns.cancel_plan(sim, cmd.get("planId"))
		"mobilizeCampaign":
			return Military.mobilize(sim, cmd.get("planId"))
		"launchCampaign":
			return Combat.launch_campaign(sim, cmd.get("planId"), cmd.get("confirmBreach"))
		"declareWar":
			return Combat.declare_war(sim, cmd.get("target"), cmd.get("objective"), cmd.get("confirmBreach"))
		"evacuate":
			return Combat.evacuate(sim, cmd.get("from"), cmd.get("to"))

		"setSideJob":
			var sj: Variant = cmd.get("job")
			if sj != null and not Defs.is_job(str(sj)):
				return _err("Unknown job")
			var sl: Variant = _pick_workers(sim, cmd.get("ids"), "take a side job")
			if sl is String:
				return _err(sl)
			var who: Array = sl
			if sj != null:
				var job := str(sj)
				if not SIDE_JOBS.has(job):
					return _err("%s can only be a main job" % Defs.job(job)["name"])
				var shall := Roles.hall_for(sim, who[0])
				if shall == null:
					shall = BuildingOps.camp_of(sim)
				var lvl := shall.level if shall != null and shall.type == "townHall" else 1
				var need := int(Defs.job(job).get("hallLevel", 1))
				if lvl < need:
					return _err("%s work is taught at a %s — upgrade the Town Hall first" % [Defs.job(job)["name"], (Content.get_value("jobs", "HALL_LEVEL_NAMES") as Array)[need]])
				if who.all(func(x: Settler) -> bool: return x.job == job):
					return _err("That is already their main job")
			for x: Settler in who:
				x.side_job = "" if sj == null or str(sj) == x.job else str(sj)
				x.next_think = 0
			if sj == null:
				return _ok("No side job: they help wherever they are needed.")
			var one := who.size() == 1
			return _ok("%s will work as %s%s%s whenever their main job has nothing to do." % [(who[0] as Settler).name if one else "%d people" % who.size(), "a " if one else "", Defs.job(str(sj))["name"], "" if one else "s"])

		"rally":
			return Roles.rally(sim)

		"takeThrone":
			return Roles.take_throne(sim, cmd.get("name"))

		"trainRole":
			var role := str(cmd.get("role", ""))
			if not Defs.is_job(role):
				return _err("Unknown role")
			var trainees: Variant = _pick_workers(sim, cmd.get("ids"), "train for a role")
			if trainees is String:
				return _err(trainees)
			return Roles.train_role(sim, trainees, role)

		"cancelRoleTraining":
			return Roles.cancel_training(sim, sim.settler(int(cmd["settlerId"])) if _is_int(cmd.get("settlerId")) else null)

		"hearAdvice":
			return Roles.hear_advice(sim)

		"surveyDeposit":
			return Mining.survey(sim, cmd.get("settlerId"), cmd.get("x"), cmd.get("y"))

		"upgradeMine":
			return Mining.upgrade_mine(sim, cmd.get("buildingId"))

		"hunt":
			var hunters: Variant = _pick_workers(sim, cmd.get("ids"), "hunt")
			if hunters is String:
				return _err(hunters)
			return Husbandry.hunt_animal(sim, hunters, cmd.get("animalId"))

		"upgradeBuilding", "cancelUpgrade":
			var ub: Building = sim.buildings.get(int(cmd["buildingId"])) if _is_int(cmd.get("buildingId")) else null
			if ub == null:
				return _err("That building is gone")
			return Levels.start_upgrade(sim, ub) if cmd["type"] == "upgradeBuilding" else Levels.cancel_upgrade(sim, ub)

		"updateArea":
			return _update_area(sim, cmd)

		"deleteArea":
			var a := sim.area(int(cmd.get("areaId", -1)) if _is_int(cmd.get("areaId")) else -1)
			if a == null:
				return _err("That work area is gone")
			sim.work_areas.erase(a)
			for s in sim.settlers:
				if s.area_id == a.id:
					s.area_id = -1
					_replan(sim, s)
			return _ok("Removed %s. Its settlers went back to their usual work." % a.name)

		"assignArea":
			return _assign_area(sim, cmd)

		"formHousehold":
			return People.form_household(sim, cmd.get("ids"))

		"requestChild":
			return People.request_child(sim, cmd.get("householdId"))

		"cancelChildRequest":
			return People.cancel_child_request(sim, cmd.get("householdId"))

		"adoptDeliberateGrowth":
			return People.adopt_deliberate_growth(sim)

		"acceptRecruit":
			return People.accept_recruit(sim, cmd.get("offerId"), cmd.get("settlementId"))

		"cancelRecruit":
			return People.cancel_recruit(sim, cmd.get("recruitId"))

		"assignWorker":
			return _assign_worker(sim, cmd)

		"unassignWorker":
			var b: Building = sim.buildings.get(int(cmd.get("buildingId", -1)))
			if b == null:
				return _err("That building is gone")
			var sid := int(cmd.get("settlerId", -1))
			b.workers.erase(sid)
			sim.forget_work_index()
			var s := sim.settler(sid)
			if s != null:
				_replan(sim, s)
			return _ok()

		"setRecipe":
			var b: Building = sim.buildings.get(int(cmd.get("buildingId", -1)))
			if b == null or b.workshop.is_empty():
				return _err("Not a workshop")
			var r: Variant = cmd.get("recipe")
			if r != null and (not Production.is_recipe(str(r)) or not (b.def().get("recipes", []) as Array).has(str(r))):
				return _err("Unknown recipe")
			b.workshop["recipe"] = "" if r == null else str(r)
			b.workshop["progress"] = 0.0
			return _ok()

		"toggleWorkshop":
			var b: Building = sim.buildings.get(int(cmd.get("buildingId", -1)))
			if b == null or b.workshop.is_empty():
				return _err("Not a workshop")
			b.workshop["paused"] = not bool(b.workshop["paused"])
			return _ok("Workshop paused." if b.workshop["paused"] else "Workshop resumed.")

		"stop":
			var list := _pick_settlers(sim, cmd.get("ids"))
			if list.is_empty():
				return _err("Select someone first")
			for s in list:
				SettlerTasks.abort_task(sim, s)
				s.focus = {}
				s.hold = false
				s.idle_reason = "Stopped"
				s.stopped_until = sim.tick + SettlerTasks.STOP_TICKS
			return _ok()

		"hold":
			var list := _pick_settlers(sim, cmd.get("ids"))
			if list.is_empty():
				return _err("Select someone first")
			for s in list:
				SettlerTasks.abort_task(sim, s)
				s.focus = {}
				s.hold = true
				s.idle_reason = "Holding position — give any order to release"
			return _ok("%s holds position." % list[0].name if list.size() == 1 else "%d people hold position." % list.size())

		"returnGoods":
			var list := _pick_settlers(sim, cmd.get("ids"))
			if list.is_empty():
				return _err("Select someone first")
			var carriers: Array[Settler] = []
			for s in list:
				if s.carrying():
					carriers.append(s)
			if carriers.is_empty():
				return _err("%s isn't carrying anything" % list[0].name if list.size() == 1 else "Nobody selected is carrying anything")
			for s in carriers:
				SettlerTasks.abort_task(sim, s)
				s.hold = false
				s.task = Task.deliver()
				s.idle_reason = ""
			return _ok()

	return _err("“%s” is not available in this version yet" % str(cmd.get("type", "?")))


## Right-clicking a building with people selected: build or supply a site, tend a field, work at a
## recipe building, deliver to a store, or move into a home.
static func _work(sim: Simulation, cmd: Dictionary) -> Dictionary:
	var b: Building = sim.buildings.get(int(cmd.get("buildingId", -1)))
	if b == null:
		return _err("That building is gone")
	var d := b.def()
	var home: bool = d.has("housing") and b.built and not bool(d.get("temporaryBeds", false))
	var picked: Variant = _pick_settlers(sim, cmd.get("ids")) if home else _pick_workers(sim, cmd.get("ids"), "work")
	if picked is String:
		return _err(picked)
	var list: Array[Settler] = []
	list.assign(picked)
	if list.is_empty():
		return _err("Select a settler first")
	if not b.built:
		var assigned := 0
		var reason := ""
		for s in list:
			if BuildingOps.materials_complete(b):
				for i in int(d.get("maxBuilders", 2)):
					var k := SettlerTasks.build_key(b.id, i)
					if not sim.is_reserved(k, s.id):
						_take_order(sim, s)
						sim.reserve(k, s.id)
						s.task = Task.build(b.id, i)
						assigned += 1
						break
			else:
				_take_order(sim, s)
				if s.carrying():
					continue
				var t: Variant = SettlerBrain.find_haul_for(sim, s, b)
				if t is Task:
					s.task = t
					assigned += 1
				elif t is String and reason == "":
					reason = t
		if assigned == 0:
			return _err(reason if reason != "" else "Enough hands are already on this site")
		return _ok()
	if b.is_field():
		var action := Farming.field_action(sim, b.field)
		if action == &"":
			return _err("This field needs nothing right now" if b.field["crop"] != "" else "Choose a crop for this field first")
		var s: Settler = list[0]
		for x in list:
			if not x.carrying():
				s = x
				break
		if sim.is_reserved(Simulation.K_FIELD + b.id, s.id):
			return _err("Someone is already tending this field")
		_take_order(sim, s)
		sim.reserve(Simulation.K_FIELD + b.id, s.id)
		s.task = Task.farm(b.id, action)
		return _ok()
	if not b.workshop.is_empty():
		var ids: Array = []
		for s in list:
			ids.append(s.id)
		return Commands.apply(sim, {"type": "assignWorker", "buildingId": b.id, "ids": ids})
	if b.is_storage():
		for s in list:
			_take_order(sim, s)
			var e := b.entrance()
			s.task = Task.deliver(b.id) if s.carrying() else Task.move(e.x, e.y)
		return _ok()
	if home:
		var cap := b.beds()
		var residents := 0
		for s in sim.settlers:
			if s.home_id == b.id:
				residents += 1
		var moved := 0
		for s in list:
			if s.home_id == b.id:
				continue
			if residents >= cap:
				break
			s.home_id = b.id
			residents += 1
			moved += 1
		if moved > 0:
			return _ok("%d settler%s moved in (%d/%d beds)." % [moved, "s" if moved > 1 else "", residents, cap])
		return _err("This %s is full (%d/%d beds)" % [str(d["name"]).to_lower(), cap, cap])
	for s in list:
		_take_order(sim, s)
		s.task = Task.move(b.x, b.y + b.h)
	return _ok()


static func _assign_worker(sim: Simulation, cmd: Dictionary) -> Dictionary:
	var b: Building = sim.buildings.get(int(cmd.get("buildingId", -1)))
	var hunting := b != null and b.def().has("hunting")
	var penned := b != null and b.def().has("pen")
	var digs := b != null and b.def().has("extraction")
	var depot := b != null and b.def().has("depot")
	if b == null or (b.workshop.is_empty() and not hunting and not penned and not digs and not depot) or not b.built:
		return _err("Workers can only be assigned to finished workshops, mills, bakeries, quarries, mines, fisheries, kilns, smelters, forges, lodges, pens and caravan depots")
	var picked: Variant = _pick_workers(sim, cmd.get("ids"), "work at a workshop")
	if picked is String:
		return _err(picked)
	var max_workers := int(b.stat("maxWorkers") if b.stat("maxWorkers") != null else 1)
	var bname := str(b.def()["name"]).to_lower()
	var added: PackedStringArray = []
	for s: Settler in picked:
		if b.workers.has(s.id):
			continue
		if b.workers.size() >= max_workers:
			break
		for other: Building in sim.buildings.values():
			if other != b:
				other.workers.erase(s.id)
		b.workers.append(s.id)
		sim.forget_work_index()
		_take_order(sim, s)
		# Make sure their kind of work comes first: hunters gather, herders farm, others craft.
		var kind := "gather" if hunting else ("farm" if penned else "craft")
		var job := "hunter" if hunting else ("herder" if penned else "crafter")
		if depot:
			pass
		elif not s.has_priorities and s.job != job:
			s.job = job
		elif s.has_priorities:
			var order: Array = [kind]
			for k: String in s.priorities:
				if k != kind:
					order.append(k)
			s.priorities = order
		added.append(s.name)
	if added.is_empty():
		var all_there := true
		for s: Settler in picked:
			if not b.workers.has(s.id):
				all_there = false
		if all_there:
			return _ok("Already working at the %s." % bname)
		return _err("The %s already has %d/%d worker%s — unassign someone in its panel first" % [bname, max_workers, max_workers, "s" if max_workers > 1 else ""])
	return _ok("%s now work%s at the %s (%d/%d)." % [", ".join(added), "s" if added.size() == 1 else "", bname, b.workers.size(), max_workers])


## The crop for a placed field: "turnip" when not given (the browser game's default).
static func _crop_of(cmd: Dictionary) -> String:
	if not cmd.has("crop"):
		return "turnip"
	var c: Variant = cmd["crop"]
	return str(c) if c != null and Defs.is_crop(str(c)) else ""


# ---- work areas ---------------------------------------------------------------------------------

## Why a rectangle can't be a work area, or "".
static func _area_rect_problem(sim: Simulation, r: Variant) -> String:
	if not r is Dictionary or not _rect_ok(r):
		return "Invalid area"
	var rect := _rect(r)
	if rect.get_area() > MAX_AREA:
		return "That area is too large (40×40 tiles at most)"
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			if sim.world.explored(x, y):
				return ""
	return "Explore this area first"


static func _area_crop(sim: Simulation, c: Variant) -> String:
	if c == null or not Defs.is_crop(str(c)) or not BuildingOps.is_unlocked(sim, Defs.crop(str(c)).get("unlock")):
		return ""
	return str(c)


static func _set_rect(a: WorkArea, r: Dictionary) -> void:
	var rect := _rect(r)
	a.x0 = rect.position.x
	a.y0 = rect.position.y
	a.x1 = rect.end.x - 1
	a.y1 = rect.end.y - 1


static func _create_area(sim: Simulation, cmd: Dictionary) -> Dictionary:
	var kind := str(cmd.get("kind", ""))
	if not WorkArea.KINDS.has(kind):
		return _err("Unknown kind of area")
	var bad := _area_rect_problem(sim, cmd)
	if bad != "":
		return _err(bad)
	var n := 1
	for other in sim.work_areas:
		if other.kind == kind:
			n += 1
	var a := WorkArea.new()
	a.id = sim.alloc_id()
	a.kind = kind
	var given: String = str(cmd["name"]).strip_edges().left(30) if cmd.get("name") is String else ""
	a.name = given if given != "" else "%s %d" % [WorkArea.LABELS[kind]["noun"], n]
	_set_rect(a, cmd)
	if _is_int(cmd.get("wanted")) and int(cmd["wanted"]) > 0:
		a.wanted = mini(WorkArea.MAX_WORKERS, int(cmd["wanted"]))
	if kind == "farm":
		a.crop = _area_crop(sim, cmd.get("crop"))
	sim.work_areas.append(a)
	if a.crop != "":
		Areas.lay_out_fields(sim, a)
	sim.emit({"type": "important"})
	var res := _ok("Created %s. %d free settlers will head there on their own." % [a.name, a.wanted] if a.wanted > 0 else "Created %s. Assign settlers to it from the Areas window." % a.name)
	res["id"] = a.id
	return res


static func _update_area(sim: Simulation, cmd: Dictionary) -> Dictionary:
	var a := sim.area(int(cmd["areaId"]) if _is_int(cmd.get("areaId")) else -1)
	if a == null:
		return _err("That work area is gone")
	if cmd.get("rect") != null:
		var bad := _area_rect_problem(sim, cmd["rect"])
		if bad != "":
			return _err(bad)
		_set_rect(a, cmd["rect"])
	if WorkArea.KINDS.has(str(cmd.get("kind", ""))):
		a.kind = str(cmd["kind"])
	if cmd.has("wanted"):
		var w: Variant = cmd["wanted"]
		if w == null or (_is_int(w) and int(w) == 0):
			a.wanted = -1
		elif _is_int(w) and int(w) > 0:
			a.wanted = mini(WorkArea.MAX_WORKERS, int(w))
	if cmd.has("crop"):
		if cmd["crop"] == null:
			a.crop = ""
		elif _area_crop(sim, cmd["crop"]) != "":
			a.crop = _area_crop(sim, cmd["crop"])
	if a.kind == "farm" and a.crop != "":
		Areas.lay_out_fields(sim, a)
	if cmd.get("name") is String and str(cmd["name"]).strip_edges() != "":
		a.name = str(cmd["name"]).strip_edges().left(30)
	for s in sim.settlers:
		if s.area_id == a.id:
			_replan(sim, s)
	return _ok()


static func _assign_area(sim: Simulation, cmd: Dictionary) -> Dictionary:
	var picked: Variant = _pick_workers(sim, cmd.get("ids"), "work in an area")
	if picked is String:
		return _err(picked)
	var list: Array = picked
	if cmd.get("areaId") == null:
		for s: Settler in list:
			s.area_id = -1
			_replan(sim, s)
		return _ok()
	var a := sim.area(int(cmd["areaId"]) if _is_int(cmd.get("areaId")) else -1)
	if a == null:
		return _err("That work area is gone")
	var count := Areas.crew_of(sim, a.id).size()
	var added := 0
	for s: Settler in list:
		if s.area_id == a.id:
			continue
		if count >= WorkArea.MAX_WORKERS:
			break
		s.area_id = a.id
		_replan(sim, s)
		count += 1
		added += 1
	var skipped := 0
	for s: Settler in list:
		if s.area_id != a.id:
			skipped += 1
	var cap := WorkArea.MAX_WORKERS
	if added == 0 and skipped > 0:
		return _err("%s already has %d/%d workers" % [a.name, cap, cap])
	return _ok("%d settler%s now work in %s (%d/%d).%s" % [added, "" if added == 1 else "s", a.name, count, cap, " %d didn't fit." % skipped if skipped > 0 else ""])
