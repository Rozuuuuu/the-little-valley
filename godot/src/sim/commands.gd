class_name Commands
## Every change the player makes goes through `apply`, which validates it and returns
## {ok: bool, message: String} so the interface can explain refusals (src/game/sim/commands.ts).
## Commands are plain Dictionaries with a "type", the same shapes as the browser game's.
##
## Ported: move, gather, work, place, placeArea, remove, designate, setJob, setPriorities, setCrop,
## setRecipe, toggleWorkshop, assignWorker, unassignWorker, stop, hold, returnGoods,
## formHousehold, requestChild, cancelChildRequest, adoptDeliberateGrowth, acceptRecruit, cancelRecruit.
## Others report that they are not available yet.

const MAX_AREA := 40 * 40


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
		if s.life_stage != "child":
			list.append(s)
	if not list.is_empty():
		return list
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
	if k == Task.GATHER or k == Task.FARM or k == Task.BUILD or (k == Task.HAUL and s.task.stage == &"toSrc"):
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
	if b == null or b.workshop.is_empty() or not b.built:
		return _err("Workers can only be assigned to finished workshops, mills, bakeries, kilns, smelters and forges")
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
		_take_order(sim, s)
		# Make sure crafting is in their work order, and first.
		if not s.has_priorities and s.job != "crafter":
			s.job = "crafter"
		elif s.has_priorities:
			var order: Array = ["craft"]
			for k: String in s.priorities:
				if k != "craft":
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
