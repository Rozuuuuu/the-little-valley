class_name Husbandry
## Hunting and herding work (src/game/sim/settlers.ts findHunt, findHuntInArea, findHerd,
## runHunt, runHerd; src/game/sim/orders.ts huntAnimal).
##
## Hunters fight by damage. Bare hands and knives need the hunter right beside the animal; bows
## reach five tiles. Each blow takes a bite of the animal's health, and prey bolts; the hunter
## follows. Boar, wolves, bears, moose and bison strike back, and a hunter hurt badly breaks off to
## heal. Nobody dies.

## Herder work per visit (ticks).
const HERD_WORK := 40
## How far a direct Attack order follows the quarry.
const DIRECT_HUNT_RANGE := 40.0


static func _weapon(lodge: Building) -> Dictionary:
	return (Animals.value("WEAPONS") as Dictionary)[Animals.weapon_of_lodge(lodge)]


static func _healed(s: Settler) -> bool:
	return s.hp >= float(Animals.value("HUNT_HEALED"))


## Settlers working at `b`, or anyone when nobody is assigned.
static func may_work_at(b: Building, settler_id: int) -> bool:
	return b.workers.is_empty() or b.workers.has(settler_id)


static func _begin_hunt(sim: Simulation, s: Settler, a: Animal, lodge_id: int, area_id: int, direct: bool) -> Task:
	a.hunted_by = s.id
	sim.reserve(Simulation.K_HUNT + a.id, s.id)
	return Task.hunt(a.id, lodge_id, area_id, direct, floori(a.x), floori(a.y))


## Wild game for a hunter from a lodge they may work at: a Task, a reason, or null.
static func find_hunt(sim: Simulation, s: Settler) -> Variant:
	if not _healed(s):
		return "Healing before hunting again"
	var reason: Variant = null
	var best_b: Building = null
	var best_a: Animal = null
	var best_d := INF
	for b in sim.lodges():
		if not may_work_at(b, s.id):
			continue
		var busy := 0
		for o in sim.settlers:
			if o != s and o.task != null and o.task.kind == Task.HUNT and o.task.site == b.id:
				busy += 1
		var cap_v: Variant = b.stat("maxWorkers")
		if busy >= maxi(1, int(cap_v) if cap_v != null else 0):
			continue
		var prey: Array[Animal] = []
		for a in Animals.prey_near(sim, b):
			if a.hunted_by == -1:
				prey.append(a)
		if prey.is_empty():
			if reason == null:
				reason = "No game within reach of the lodge — animals roam back in time"
			continue
		for a in prey:
			var d := JsMath.hypot(s.x - a.x, s.y - a.y) - (1000.0 if b.workers.has(s.id) else 0.0)
			if best_a == null or d < best_d:
				best_d = d
				best_a = a
				best_b = b
	if best_a == null:
		return reason
	if sim.nearest_storage_with_space(s.x, s.y, "food") == null:
		return "Storage is full — nowhere to put the meat"
	return _begin_hunt(sim, s, best_a, best_b.id, -1, false)


## Game inside a hunting ground: a Task or a reason.
static func find_hunt_in_area(sim: Simulation, s: Settler, area: WorkArea) -> Variant:
	if not _healed(s):
		return "Healing before hunting again"
	var best: Animal = null
	var best_d := INF
	var any := false
	for a in sim.animals:
		if a.pen_id != -1 or not a.def().has("hunt") or a.x < area.x0 or a.x > area.x1 + 1 or a.y < area.y0 or a.y > area.y1 + 1:
			continue
		any = true
		if a.hunted_by != -1:
			continue
		var d := JsMath.hypot(s.x - a.x, s.y - a.y)
		if d < best_d:
			best_d = d
			best = a
	if best == null:
		return "Every animal in %s is already being stalked" % area.name if any else "No game in %s right now — animals roam back in time" % area.name
	if sim.nearest_storage_with_space(s.x, s.y, "food") == null:
		return "Storage is full — nowhere to put the meat"
	return _begin_hunt(sim, s, best, -1, area.id, false)


## A pen with eggs, milk, wool or a foal to collect, or full and due a cull.
static func find_herd(sim: Simulation, s: Settler) -> Variant:
	var best: Building = null
	var best_d := INF
	var reason: Variant = null
	for b in sim.pens():
		var d := Animals.pen_def(b)
		if b.pen.is_empty() or not may_work_at(b, s.id):
			continue
		if sim.is_reserved(Simulation.K_HERD + b.id, s.id) or sim.is_unreachable(s, Simulation.T_BUILDING + b.id):
			continue
		var ready := float(b.pen["ready"]) >= 1.0
		var full := d.has("cull") and Animals.pen_animals(sim, b).size() >= Animals.pen_capacity(b)
		if not ready and not full:
			if reason == null:
				reason = "The animals have nothing to collect yet"
			continue
		var res := str(d["product"]["res"]) if ready else "food"
		if sim.nearest_storage_with_space(b.x, b.y, res) == null:
			if reason == null:
				reason = "The stable is full — build or upgrade a stable for new horses" if res == "horses" else "Storage is full — nowhere to put what the animals give"
			continue
		var dist := JsMath.hypot(s.x - b.center_x(), s.y - b.center_y()) - (1000.0 if b.workers.has(s.id) else 0.0)
		if best == null or dist < best_d:
			best_d = dist
			best = b
	if best == null:
		return reason
	sim.reserve(Simulation.K_HERD + best.id, s.id)
	return Task.herd(best.id)


## The settler works at a building matching `pred` (hunters at lodges, herders at pens).
static func _assigned_to(sim: Simulation, s: Settler, lodge: bool) -> bool:
	var b := sim.workplace_of(s.id)
	if b == null:
		return false
	return b.def().has("hunting") if lodge else b.def().has("pen")


## The farm work kind with pens: assigned herders herd first; others farm, then herd.
static func find_farm_or_herd(sim: Simulation, s: Settler, find_farm: Callable) -> Variant:
	if sim.pens().is_empty():
		return find_farm.call()
	if _assigned_to(sim, s, false):
		var h: Variant = find_herd(sim, s)
		if h is Task:
			return h
	var f: Variant = find_farm.call()
	if f is Task:
		return f
	var h2: Variant = find_herd(sim, s)
	if h2 is Task:
		return h2
	return f if f != null else h2


## The gather work kind with lodges: assigned hunters hunt first; others gather, then hunt.
static func find_gather_or_hunt(sim: Simulation, s: Settler, find_gather: Callable) -> Variant:
	if sim.lodges().is_empty():
		return find_gather.call()
	if _assigned_to(sim, s, true):
		var h: Variant = find_hunt(sim, s)
		if h is Task:
			return h
	var g: Variant = find_gather.call()
	if g is Task:
		return g
	var h2: Variant = find_hunt(sim, s)
	if h2 is Task:
		return h2
	return g if g != null else h2


# ---- running ------------------------------------------------------------------------------------

static func run_hunt(sim: Simulation, s: Settler, t: Task) -> void:
	var lodge: Building = sim.buildings.get(t.site) if t.site != -1 else null
	var ground := sim.area(t.target) if t.target != -1 else null
	var a := Animals.find(sim, t.animal)
	if (lodge == null and ground == null and not t.direct) or a == null or a.pen_id != -1 or s.carrying():
		SettlerTasks.abort_task(sim, s)
		return
	var sp := a.def()
	var weapon := _weapon(lodge)
	var d := JsMath.hypot(a.x - s.x, a.y - s.y)
	# A direct order (Attack) follows the quarry farther than a lodge's hunters would.
	var range_limit := 0.0
	if t.direct:
		range_limit = DIRECT_HUNT_RANGE
	elif lodge != null:
		range_limit = Animals.hunt_radius_of(lodge) + 12
	elif ground != null:
		range_limit = maxf(ground.x1 - ground.x0, ground.y1 - ground.y0) + 12
	if d > range_limit:
		SettlerTasks.abort_task(sim, s, "The quarry got away")
		return
	# Dangerous animals hit back at anyone close enough.
	if sp.has("fightsBack") and d <= 1.8 and (sim.tick + a.id) % int(sp["fightsBack"]["every"]) == 0:
		var dmg := float(sp["fightsBack"]["damage"])
		s.hp = maxf(1.0, s.hp - dmg)
		s.hit_at = sim.tick
		sim.emit({"type": "hit", "target": "settler", "id": s.id, "amount": dmg, "reach": d, "x": s.x, "y": s.y})
		if s.hp < float(Animals.value("HUNT_BREAK_OFF")):
			SettlerTasks.abort_task(sim, s, "Hurt by a %s — resting before hunting again" % str(sp["name"]).to_lower())
			return
	var reach := float(weapon["reach"])
	if t.stage == &"stalk":
		if d <= reach:
			t.stage = &"aim"
			t.timer = float(weapon["every"]) / 2.0
			s.has_path = false
			return
		# Close in on foot for the last few tiles; plan a path only when farther away.
		if d < 3:
			var v := SettlerTasks.move_speed(sim, s)
			var nx := s.x + ((a.x - s.x) / d) * v
			var ny := s.y + ((a.y - s.y) / d) * v
			if sim.walkable(floori(nx), floori(ny)):
				s.anim = &"walk"
				s.has_path = false
				SettlerTasks.step_toward(sim, s, a.x, a.y)
				return
		if JsMath.hypot(a.x - (t.x + 0.5), a.y - (t.y + 0.5)) > 2.5:
			t.x = floori(a.x)
			t.y = floori(a.y)
		var r := SettlerTasks.go_to(sim, s, GridAStar.Goal.new(t.x, t.y, 1, 1, true))
		if r == SettlerTasks.Move.FAILED:
			SettlerTasks.fail(sim, s, "Can't reach the game", Simulation.T_ANIMAL + a.id)
			return
		if r == SettlerTasks.Move.ARRIVED and d <= reach:
			t.stage = &"aim"
		return
	if d > reach + 0.4:
		t.stage = &"stalk"
		return
	SettlerTasks.face(s, a.x, a.y)
	s.anim = &"work"
	var wid := Animals.weapon_of_lodge(lodge)
	s.tool = &"bow" if wid == "bow" else (&"knife" if wid == "knife" else &"hand")
	t.timer += SettlerTasks.work_speed(sim, s)
	if t.timer < float(weapon["every"]):
		return
	t.timer = 0.0
	var blow := float(weapon["damage"])
	a.hp = a.health() - blow
	a.hit_at = sim.tick
	sim.emit({"type": "hit", "target": "animal", "id": a.id, "amount": blow, "reach": d, "x": a.x, "y": a.y, "fromX": s.x, "fromY": s.y})
	sim.emit({"type": "sfx", "name": "chop", "x": a.x, "y": a.y})
	if a.hp > 0:
		# Prey bolts; fighters stand their ground.
		if not sp.has("fightsBack"):
			Animals.startle(sim, a, s.x, s.y)
		return
	var hunt: Dictionary = sp["hunt"]
	var food := int(hunt["food"])
	var hides := int(hunt["hides"])
	Animals.remove(sim, a)
	s.set_carry("food", food)
	sim.stats["foodGathered"] = int(sim.stats["foodGathered"]) + food
	if hides > 0:
		var left := hides - sim.deposit(lodge, "hides", hides) if lodge != null else hides
		if left > 0:
			sim.deposit_anywhere("hides", left, lodge.x if lodge != null else s.x, lodge.y if lodge != null else s.y)
	sim.emit({"type": "sfx", "name": "harvest", "x": a.x, "y": a.y})
	sim.emit({"type": "fx", "kind": "leaves", "x": a.x, "y": a.y})
	SettlerTasks.abort_task(sim, s)


## Herders collect eggs, milk, wool or a foal, or take one animal from a full pen to the butcher.
static func run_herd(sim: Simulation, s: Settler, t: Task) -> void:
	var b: Building = sim.buildings.get(t.site)
	var d := Animals.pen_def(b) if b != null else {}
	if b == null or d.is_empty() or b.pen.is_empty() or s.carrying():
		SettlerTasks.abort_task(sim, s)
		return
	if t.stage == &"walk":
		var r := SettlerTasks.go_to(sim, s, b.goal_adjacent())
		if r == SettlerTasks.Move.FAILED:
			SettlerTasks.fail(sim, s, "Can't reach the %s" % str(b.def()["name"]).to_lower(), Simulation.T_BUILDING + b.id)
			return
		if r == SettlerTasks.Move.ARRIVED:
			t.stage = &"work"
		return
	SettlerTasks.face_rect(s, b.x, b.y, b.w, b.h)
	s.anim = &"work"
	s.tool = &"hand"
	t.timer += SettlerTasks.work_speed(sim, s)
	if t.timer < HERD_WORK:
		return
	if float(b.pen["ready"]) >= 1.0 and d.has("product"):
		var n := mini(10, floori(float(b.pen["ready"])))
		b.pen["ready"] = float(b.pen["ready"]) - n
		var res := str(d["product"]["res"])
		s.set_carry(res, n)
		if res == "food":
			sim.stats["foodGathered"] = int(sim.stats["foodGathered"]) + n
	elif d.has("cull"):
		var herd := Animals.pen_animals(sim, b)
		if herd.size() >= Animals.pen_capacity(b):
			Animals.remove(sim, herd[herd.size() - 1])
			var food := int(d["cull"]["food"])
			s.set_carry("food", food)
			sim.stats["foodGathered"] = int(sim.stats["foodGathered"]) + food
			if int(d["cull"]["hides"]) > 0:
				sim.deposit_anywhere("hides", int(d["cull"]["hides"]), b.x, b.y)
	sim.emit({"type": "sfx", "name": "pick", "x": b.x + 1.0, "y": b.y + 1.0})
	SettlerTasks.abort_task(sim, s)


# ---- the Attack order --------------------------------------------------------------------------

static func hunt_animal(sim: Simulation, list: Array, animal_id: Variant) -> Dictionary:
	var a := Animals.find(sim, int(animal_id)) if (animal_id is int or animal_id is float) else null
	if a == null:
		return {"ok": false, "message": "That animal is gone"}
	if a.pen_id != -1:
		return {"ok": false, "message": "That animal lives in a pen — herders cull pens when they are full"}
	var sp := a.def()
	if not sp.has("hunt"):
		return {"ok": false, "message": "%s can't be hunted" % sp["plural"]}
	var s: Settler = list[0]
	for o: Settler in list:
		if not o.carrying():
			s = o
			break
	if s.carrying():
		return {"ok": false, "message": "%s has full hands — Return goods (C) first" % s.name}
	if a.hunted_by != -1 and a.hunted_by != s.id:
		var other := sim.settler(a.hunted_by)
		if other != null and other.task != null and other.task.kind == Task.HUNT:
			SettlerTasks.abort_task(sim, other)
		a.hunted_by = -1
	SettlerTasks.abort_task(sim, s)
	s.focus = {}
	s.hold = false
	var lodge: Building = null
	for b: Building in sim.buildings.values():
		if b.def().has("hunting") and b.workers.has(s.id):
			lodge = b
			break
	s.task = _begin_hunt(sim, s, a, lodge.id if lodge != null else -1, -1, true)
	s.idle_reason = ""
	# Anyone else selected closes in to help.
	for o: Settler in list:
		if o == s or o.carrying():
			continue
		SettlerTasks.abort_task(sim, o)
		o.hold = false
		o.task = Task.move(floori(a.x), floori(a.y))
	return {"ok": true, "message": "%s goes after the %s%s." % [s.name, str(sp["name"]).to_lower(), "" if lodge != null else " bare-handed"]}
