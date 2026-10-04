class_name SettlerTasks
## Carrying out tasks: movement, gathering, delivering, hauling, building, farming, eating and
## sleeping, plus each tick's needs and map reveal (src/game/sim/settlers.ts). Choosing a task is
## SettlerBrain's job.

const BASE_SPEED := 0.24
const HUNGER_DECAY := 100.0 / (Defs.DAY_TICKS * 1.2)
const ENERGY_DECAY := 100.0 / (Defs.DAY_TICKS * 0.8)
const MEAL_VALUE := 65
const REVEAL_RADIUS := 6.5
## Open water gives a clear view: from a riverbank settlers can see the far side.
const RIVER_REVEAL_RADIUS := 12.0
const WAKE_ENERGY := 60.0
const STOP_TICKS := 40

const _GATHER_SFX := {"axe": "chop", "pick": "mine", "hand": "pick"}
const _GATHER_FX := {"axe": "woodchips", "pick": "stonechips", "hand": "leaves"}
const _STAT_FOR := {"wood": "woodGathered", "stone": "stoneGathered", "food": "foodGathered"}
const _FARM_TOOLS := {&"till": &"hoe", &"plant": &"hand", &"water": &"can", &"harvest": &"sickle"}

enum Move { ARRIVED, MOVING, FAILED }


# ---- per tick ---------------------------------------------------------------------------------

static func update_settler(sim: Simulation, s: Settler) -> void:
	s.hunger = maxf(0.0, s.hunger - HUNGER_DECAY)
	var sleeping := s.task != null and s.task.kind == Task.SLEEP and s.task.stage == &"sleep"
	if not sleeping:
		s.energy = maxf(0.0, s.energy - ENERGY_DECAY)
	if (s.task == null or s.task.kind == Task.WANDER) and (sim.tick + s.id) % 4 == 0 and sim.tick >= s.next_think:
		var t0 := Prof.begin()
		SettlerBrain.assign_task(sim, s)
		Prof.end("assign_task", t0)
	if s.task != null:
		var t1 := Prof.begin()
		var kind := s.task.kind
		run_task(sim, s)
		Prof.end("run_" + kind, t1)
	else:
		s.anim = &"idle"
		s.tool = &""
	if (sim.tick + s.id) % 10 == 0 and not s.hidden:
		# Only re-reveal after moving to a new tile.
		var k := Simulation.tile_key(s.tile_x(), s.tile_y())
		if k != s.last_reveal_key:
			s.last_reveal_key = k
			var t2 := Prof.begin()
			sim.world.reveal(s.x, s.y, RIVER_REVEAL_RADIUS if _near_water(sim, s) else REVEAL_RADIUS)
			Prof.end("reveal", t2)


static func _near_water(sim: Simulation, s: Settler) -> bool:
	var x := s.tile_x()
	var y := s.tile_y()
	for d: Vector2i in [Vector2i(2, 0), Vector2i(-2, 0), Vector2i(0, 2), Vector2i(0, -2)]:
		var t := sim.world.terrain(x + d.x, y + d.y)
		if t == Tiles.WATER or t == Tiles.DEEP_WATER:
			return true
	return false


static func run_task(sim: Simulation, s: Settler) -> void:
	var t := s.task
	match t.kind:
		Task.MOVE, Task.WANDER:
			_run_move(sim, s, t)
		Task.GATHER:
			_run_gather(sim, s, t)
		Task.DELIVER:
			_run_deliver(sim, s, t)
		Task.HAUL:
			_run_haul(sim, s, t)
		Task.BUILD:
			_run_build(sim, s, t)
		Task.FARM:
			_run_farm(sim, s, t)
		Task.EAT:
			_run_eat(sim, s, t)
		Task.SLEEP:
			_run_sleep(sim, s, t)


# ---- speed and facing ----------------------------------------------------------------------------

static func work_speed(sim: Simulation, s: Settler) -> float:
	var v := 1.0
	if s.hunger < 15:
		v *= 0.7
	if s.energy < 15:
		v *= 0.8
	if sim.well_equipped():
		v *= 1.25
	# The ruler's aura and Rally, and a castle town's bonus, come with the ruler and levels.
	return v


static func move_speed(sim: Simulation, s: Settler) -> float:
	var t := sim.world.terrain(s.tile_x(), s.tile_y())
	var v := BASE_SPEED / (Tiles.move_cost[t] if t != World.UNKNOWN else 1.0)
	if s.hunger < 15:
		v *= 0.8
	if s.carrying():
		v *= 0.92
	return v


static func face(s: Settler, tx: float, ty: float) -> void:
	var dx := tx - s.x
	var dy := ty - s.y
	if absf(dx) > absf(dy):
		s.facing = 2 if dx < 0 else 3
	elif dy != 0:
		s.facing = 1 if dy < 0 else 0


static func face_rect(s: Settler, x: int, y: int, w: int, h: int) -> void:
	face(s, maxf(x, minf(x + w, s.x)), maxf(y, minf(y + h, s.y)))


# ---- movement -----------------------------------------------------------------------------------

## Walks towards a goal, planning a path when needed (within the tick's search budget).
static func go_to(sim: Simulation, s: Settler, g: GridAStar.Goal, partial: bool = false) -> Move:
	var hx := s.tile_x()
	var hy := s.tile_y()
	if not s.has_goal or s.goal_x != g.x or s.goal_y != g.y or s.goal_w != g.w or s.goal_h != g.h or s.goal_adjacent != g.adjacent:
		s.has_goal = true
		s.goal_x = g.x
		s.goal_y = g.y
		s.goal_w = g.w
		s.goal_h = g.h
		s.goal_adjacent = g.adjacent
		s.has_path = false
		s.repaths = 0
	if not s.has_path:
		if g.satisfied(hx, hy):
			return _settle(sim, s, hx, hy)
		var tp := Prof.begin()
		var r := sim.find_path(hx, hy, g, partial)
		Prof.end("find_path", tp)
		if r == null:
			# Out of search budget this tick: wait a moment rather than stall the frame.
			s.anim = &"idle"
			return Move.MOVING
		if not r.found:
			return Move.FAILED
		s.path = r.steps
		s.path_index = 0
		s.has_path = true
	if s.path_index >= s.path.size() / 2:
		s.has_path = false
		return Move.ARRIVED if g.satisfied(hx, hy) else Move.MOVING
	var nx := s.path[s.path_index * 2]
	var ny := s.path[s.path_index * 2 + 1]
	if not sim.walkable(nx, ny):
		# Something appeared in the way (a building or a regrown tree): plan again.
		s.has_path = false
		s.repaths += 1
		return Move.FAILED if s.repaths > 4 else Move.MOVING
	s.anim = &"walk"
	if _step_toward(sim, s, nx + 0.5, ny + 0.5):
		s.path_index += 1
		if s.path_index >= s.path.size() / 2:
			s.has_path = false
			if g.satisfied(s.tile_x(), s.tile_y()):
				return Move.ARRIVED
			# A partial path ends as close as we can get.
			return Move.FAILED if partial else Move.MOVING
	return Move.MOVING


## Makes sure the settler stands on the centre of its tile before working.
static func _settle(sim: Simulation, s: Settler, tx: int, ty: int) -> Move:
	var cx := tx + 0.5
	var cy := ty + 0.5
	if absf(s.x - cx) < 0.01 and absf(s.y - cy) < 0.01:
		return Move.ARRIVED
	s.anim = &"walk"
	return Move.ARRIVED if _step_toward(sim, s, cx, cy) else Move.MOVING


static func _step_toward(sim: Simulation, s: Settler, tx: float, ty: float) -> bool:
	var dx := tx - s.x
	var dy := ty - s.y
	var d := JsMath.hypot(dx, dy)
	var v := move_speed(sim, s)
	face(s, tx, ty)
	if d <= v:
		s.x = tx
		s.y = ty
		return true
	s.x += dx / d * v
	s.y += dy / d * v
	return false


# ---- task lifecycle ----------------------------------------------------------------------------

## Reservation keys the settler's current task holds.
static func task_keys(s: Settler) -> Array[int]:
	var t := s.task
	if t == null:
		return []
	match t.kind:
		Task.GATHER:
			return [Simulation.K_OBJ + Simulation.tile_key(t.x, t.y)]
		Task.BUILD:
			return [build_key(t.site, t.slot)]
		Task.FARM:
			return [Simulation.K_FIELD + t.field]
	return []


static func build_key(site: int, slot: int) -> int:
	return Simulation.K_BUILD + site * 64 + slot


## Gives back everything the current task reserved, including goods promised in transit.
static func _release_task(sim: Simulation, s: Settler) -> void:
	var t := s.task
	if t == null:
		return
	match t.kind:
		Task.GATHER:
			sim.release(Simulation.K_OBJ + Simulation.tile_key(t.x, t.y), s.id)
		Task.BUILD:
			sim.release(build_key(t.site, t.slot), s.id)
		Task.FARM:
			sim.release(Simulation.K_FIELD + t.field, s.id)
		Task.HAUL:
			var src: Building = sim.buildings.get(t.src)
			var dst: Building = sim.buildings.get(t.dst)
			if t.stage == &"toSrc" and src != null:
				Inv.add(src.reserved_out, t.res, -t.amount)
			if dst != null:
				Inv.add(dst.incoming, t.res, -t.amount)
		Task.EAT:
			var src: Building = sim.buildings.get(t.src)
			if src != null:
				Inv.add(src.reserved_out, "food", -1)


static func _clear_task(s: Settler) -> void:
	s.task = null
	s.has_path = false
	s.has_goal = false
	s.anim = &"idle"
	s.tool = &""
	s.inside_id = -1


## Stops the current task and gives back anything it reserved.
static func abort_task(sim: Simulation, s: Settler, reason: String = "") -> void:
	_release_task(sim, s)
	_clear_task(s)
	s.next_think = 0
	s.hidden = false
	if reason != "":
		s.idle_reason = reason


## Ends a task without releasing (the run function already settled its reservations).
static func _finish(sim: Simulation, s: Settler) -> void:
	s.task = null
	abort_task(sim, s)


static func _fail(sim: Simulation, s: Settler, reason: String, target: int = -1) -> void:
	if target != -1:
		sim.mark_unreachable(s, target)
	abort_task(sim, s, reason)


# ---- running tasks --------------------------------------------------------------------------------

static func _run_move(sim: Simulation, s: Settler, t: Task) -> void:
	var r := go_to(sim, s, GridAStar.Goal.new(t.x, t.y), t.kind == Task.MOVE)
	if r == Move.FAILED:
		if t.kind == Task.MOVE:
			s.last_notice = sim.tick
			var close := JsMath.hypot(s.tile_x() - t.x, s.tile_y() - t.y) < 1.5
			abort_task(sim, s, "" if close else "Went as close as the path allows")
		else:
			abort_task(sim, s)
	elif r == Move.ARRIVED:
		var keep := s.idle_reason if t.kind == Task.WANDER else ""
		abort_task(sim, s)
		s.idle_reason = keep


static func _run_gather(sim: Simulation, s: Settler, t: Task) -> void:
	var o := sim.world.obj(t.x, t.y)
	if o == World.UNKNOWN:
		abort_task(sim, s)
		return
	var left := sim.world.amount(t.x, t.y)
	var res := Tiles.object_resource[o]
	if res == "" or left <= 0:
		abort_task(sim, s)
		return
	var od := Tiles.object_def(o)
	if s.carrying() and (s.carry_res != res or s.carry_amount >= s.capacity):
		abort_task(sim, s)
		return
	if t.stage == &"walk":
		var r := go_to(sim, s, GridAStar.Goal.new(t.x, t.y, 1, 1, true))
		if r == Move.FAILED:
			_fail(sim, s, "Can't reach the %s" % str(od["name"]).to_lower(), Simulation.T_OBJECT + Simulation.tile_key(t.x, t.y))
		elif r == Move.ARRIVED:
			t.stage = &"work"
		return
	face_rect(s, t.x, t.y, 1, 1)
	s.anim = &"work"
	var tool: String = od.get("tool", "hand")
	s.tool = StringName(tool)
	t.timer += work_speed(sim, s)
	var work_ticks := Tiles.object_work_ticks[o]
	if t.timer < work_ticks:
		return
	t.timer -= work_ticks
	sim.world.set_amount(t.x, t.y, left - 1)
	s.set_carry(res, s.carry_amount + 1)
	sim.stats[_STAT_FOR[res]] = int(sim.stats[_STAT_FOR[res]]) + 1
	sim.emit({"type": "sfx", "name": _GATHER_SFX[tool], "x": t.x + 0.5, "y": t.y + 0.5})
	sim.emit({"type": "fx", "kind": _GATHER_FX[tool], "x": t.x + 0.5, "y": t.y + 0.5})
	if left - 1 <= 0:
		var depletes: int = od["depletesTo"]
		sim.world.set_obj(t.x, t.y, depletes)
		sim.designations.erase(Simulation.tile_key(t.x, t.y))
		# Woodlot replanting comes with work areas.
		BuildingOps.schedule_regrowth(sim, t.x, t.y)
		if depletes == Tiles.O_STUMP:
			sim.emit({"type": "fx", "kind": "leaves", "x": t.x + 0.5, "y": float(t.y)})
		abort_task(sim, s)
		return
	if s.carry_amount >= s.capacity:
		abort_task(sim, s)


static func _run_deliver(sim: Simulation, s: Settler, t: Task) -> void:
	if not s.carrying():
		abort_task(sim, s)
		return
	var target: Building = sim.buildings.get(t.target) if t.target != -1 else null
	if target == null or not target.built or sim.storage_used(target) >= target.storage_capacity() or not Simulation.stores_resource(target, s.carry_res):
		target = sim.nearest_storage_with_space(s.x, s.y, s.carry_res)
		if target == null:
			abort_task(sim, s, "Storage is full — build a storehouse")
			return
		t.target = target.id
	var r := go_to(sim, s, target.goal_adjacent())
	if r == Move.FAILED:
		_fail(sim, s, "Can't reach storage", Simulation.T_BUILDING + target.id)
		return
	if r != Move.ARRIVED:
		return
	var n := sim.deposit(target, s.carry_res, s.carry_amount)
	s.set_carry(s.carry_res, s.carry_amount - n)
	sim.emit({"type": "sfx", "name": "drop", "x": s.x, "y": s.y})
	abort_task(sim, s)


static func _run_haul(sim: Simulation, s: Settler, t: Task) -> void:
	var dst: Building = sim.buildings.get(t.dst)
	if t.stage == &"toSrc":
		var src: Building = sim.buildings.get(t.src)
		if src == null or dst == null:
			abort_task(sim, s)
			return
		var r := go_to(sim, s, src.goal_adjacent())
		if r == Move.FAILED:
			_fail(sim, s, "Can't reach storage", Simulation.T_BUILDING + src.id)
			return
		if r != Move.ARRIVED:
			return
		var take := mini(t.amount, int(src.inventory.get(t.res, 0)))
		Inv.add(src.reserved_out, t.res, -t.amount)
		Inv.add(src.inventory, t.res, -take)
		if take < t.amount:
			Inv.add(dst.incoming, t.res, -(t.amount - take))
		t.amount = take
		if take <= 0:
			_finish(sim, s)
			return
		s.set_carry(t.res, take)
		t.stage = &"toDst"
		return
	if dst == null:
		# The site was cancelled; whatever we carry goes back to storage.
		_finish(sim, s)
		return
	var r := go_to(sim, s, dst.goal_adjacent())
	if r == Move.FAILED:
		_fail(sim, s, "Can't reach the %s" % str(dst.def()["name"]).to_lower(), Simulation.T_BUILDING + dst.id)
		return
	if r != Move.ARRIVED:
		return
	Inv.add(dst.incoming, t.res, -t.amount)
	if dst.is_storage() and dst.built:
		# Supply run: goods go into the store; anything that doesn't fit is delivered elsewhere.
		var n := sim.deposit(dst, t.res, t.amount)
		s.set_carry(t.res, t.amount - n)
		sim.emit({"type": "sfx", "name": "drop", "x": s.x, "y": s.y})
		_finish(sim, s)
		return
	Inv.add(dst.delivered, t.res, t.amount)
	s.set_carry("", 0)
	sim.emit({"type": "sfx", "name": "drop", "x": s.x, "y": s.y})
	_finish(sim, s)


static func _run_build(sim: Simulation, s: Settler, t: Task) -> void:
	var site: Building = sim.buildings.get(t.site)
	if site == null or site.built or not BuildingOps.materials_complete(site):
		abort_task(sim, s)
		return
	if t.stage == &"walk":
		var r := go_to(sim, s, site.goal_adjacent())
		if r == Move.FAILED:
			_fail(sim, s, "Can't reach the %s site" % str(site.def()["name"]).to_lower(), Simulation.T_BUILDING + site.id)
		elif r == Move.ARRIVED:
			t.stage = &"work"
		return
	face_rect(s, site.x, site.y, site.w, site.h)
	s.anim = &"work"
	s.tool = &"hammer"
	site.progress += work_speed(sim, s)
	if (sim.tick + s.id) % 9 == 0:
		sim.emit({"type": "sfx", "name": "hammer", "x": site.center_x(), "y": site.center_y()})
		sim.emit({"type": "fx", "kind": "dust", "x": site.center_x(), "y": site.y + site.h - 0.2})
	if site.progress >= BuildingOps.work_of(site):
		BuildingOps.complete(sim, site)
		abort_task(sim, s)


static func _run_farm(sim: Simulation, s: Settler, t: Task) -> void:
	var b: Building = sim.buildings.get(t.field)
	if b == null or not b.is_field() or Farming.field_action(sim, b.field) != t.action:
		abort_task(sim, s)
		return
	if t.action == &"harvest" and s.carrying():
		abort_task(sim, s)
		return
	if t.stage == &"walk":
		var r := go_to(sim, s, GridAStar.Goal.new(b.x, b.y))
		if r == Move.FAILED:
			_fail(sim, s, "Can't reach the field", Simulation.T_BUILDING + b.id)
		elif r == Move.ARRIVED:
			t.stage = &"work"
		return
	s.anim = &"work"
	s.tool = _FARM_TOOLS[t.action]
	t.timer += work_speed(sim, s)
	if t.timer < float(Farming.FIELD_WORK[t.action]):
		return
	if t.action == &"harvest" and b.field["crop"] != "":
		var y := Inv.entries(Inv.from_json(Defs.crop(b.field["crop"])["yield"]))[0]
		var res: String = y[0]
		var amount: int = y[1]
		s.set_carry(res, amount)
		if res == "food":
			sim.stats["harvested"] = int(sim.stats["harvested"]) + amount
		if res == "wheat":
			sim.stats["wheatHarvested"] = int(sim.stats["wheatHarvested"]) + amount
	Farming.apply_field_action(sim, b, t.action)
	abort_task(sim, s)


static func _run_eat(sim: Simulation, s: Settler, t: Task) -> void:
	var src: Building = sim.buildings.get(t.src)
	if src == null:
		_finish(sim, s)
		return
	var r := go_to(sim, s, src.goal_adjacent())
	if r == Move.FAILED:
		_fail(sim, s, "Can't reach the food store", Simulation.T_BUILDING + src.id)
		return
	if r != Move.ARRIVED:
		return
	Inv.add(src.reserved_out, "food", -1)
	if int(src.inventory.get("food", 0)) > 0:
		Inv.add(src.inventory, "food", -1)
		s.hunger = minf(100.0, s.hunger + MEAL_VALUE)
		sim.emit({"type": "sfx", "name": "eat", "x": s.x, "y": s.y})
		sim.emit({"type": "fx", "kind": "hearts", "x": s.x, "y": s.y - 0.6})
	_finish(sim, s)


static func _run_sleep(sim: Simulation, s: Settler, t: Task) -> void:
	if not sim.is_bedtime(s.id) and s.energy >= WAKE_ENERGY:
		s.rest_note = ""
		abort_task(sim, s)
		return
	if t.stage == &"walk":
		var home: Building = sim.buildings.get(t.home) if t.home != -1 else null
		if home == null:
			t.stage = &"sleep"
			s.rest_note = "No bed anywhere — dozing where they stand"
			return
		var hname := str(home.def()["name"]).to_lower()
		var own_home := home.is_permanent_home() and s.home_id == home.id
		var goal: GridAStar.Goal
		if own_home:
			# Walk to the door; if something stands in front of it, any side will do.
			var e := home.entrance()
			goal = GridAStar.Goal.new(e.x, e.y) if sim.walkable(e.x, e.y) else home.goal_adjacent()
		else:
			var spot := _camp_spot(sim, home, s)
			goal = GridAStar.Goal.new(spot.x, spot.y) if spot.x != -99999 else home.goal_adjacent()
		var r := go_to(sim, s, goal)
		if r == Move.FAILED:
			# Never loop: rest here tonight and try again tomorrow.
			t.stage = &"sleep"
			s.rest_note = "The way to their %s is blocked, so they are resting outside tonight" % hname if own_home else "Resting where they are — the camp is out of reach"
			return
		if r == Move.ARRIVED:
			t.stage = &"sleep"
			if own_home:
				s.hidden = true
				s.inside_id = home.id
				s.rest_note = "Asleep at home in the %s" % hname
			elif s.home_id == home.id:
				s.rest_note = "Asleep in a Town Hall bunk" if home.type == "townHall" else "Asleep in a camp bedroll"
			else:
				s.rest_note = "No free bed — resting by the campfire"
		return
	s.anim = &"sleep"
	s.tool = &""
	s.energy = minf(100.0, s.energy + 100.0 / (Defs.DAY_TICKS * 0.25))


## A spot in the ring around a hall where this settler sleeps (each settler gets their own).
static func _camp_spot(sim: Simulation, b: Building, s: Settler) -> Vector2i:
	var ring: Array[Vector2i] = []
	for y in range(b.y - 2, b.y + b.h + 2):
		for x in range(b.x - 2, b.x + b.w + 2):
			var inside := x >= b.x - 1 and x <= b.x + b.w and y >= b.y - 1 and y <= b.y + b.h
			if not inside and sim.walkable(x, y):
				ring.append(Vector2i(x, y))
	return ring[(s.id * 7) % ring.size()] if not ring.is_empty() else Vector2i(-99999, 0)
