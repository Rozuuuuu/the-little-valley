class_name SettlerBrain
## Choosing what a settler does next: the browser game's deterministic priority cascade
## (`assignTask` in src/game/sim/settlers.ts), kept because players set work orders explicitly and
## must be able to predict them.
##
##   1. needs: deliver goods in hand (if storage has room), eat when hungry, sleep at bedtime or
##      when exhausted
##   2. [children, soldiers]; Stop and Hold; [the ruler, learning a role, council posts]
##   3. the focus left by a direct gather order (keep working the same kind nearby)
##   4. [the chief, travellers]; [the assigned work area]
##   5. the work order (the settler's own, or their job's): build, haul, farm, gather, craft
##   6. otherwise idle, with the most relevant reason, and a short back-off before looking again
## Bracketed steps arrive with their systems.
##
## Work finders scan candidates linearly, as the browser game does. Spatial indexes replace the
## scans where profiling shows the need (docs/godot/MIGRATION.md, "Settler AI").

const EAT_THRESHOLD := 32.0
## Below this energy a settler takes a daytime nap; they wake once rested.
const NAP_THRESHOLD := 12.0
## Ticks an idle settler waits before searching for work again.
const IDLE_BACKOFF := 14
const AUTO_GATHER_RADIUS := 18
const FOCUS_RADIUS := 7
const WORK_KINDS: Array[String] = ["build", "haul", "farm", "gather", "craft"]


static func assign_task(sim: Simulation, s: Settler) -> void:
	var wandering := s.task != null and s.task.kind == Task.WANDER
	# With full hands a settler can still till, plant, water and build, but not fetch or harvest.
	var hands_full := false
	if s.carrying():
		if sim.nearest_storage_with_space(s.x, s.y, s.carry_res) != null:
			_start(sim, s, Task.deliver(), wandering)
			return
		hands_full = true
	if s.hunger < EAT_THRESHOLD:
		var src := sim.nearest_storage_with("food", s.x, s.y)
		if src != null:
			Inv.add(src.reserved_out, "food", 1)
			_start(sim, s, Task.eat(src.id), wandering)
			return
	if sim.is_bedtime(s.id) or s.energy < NAP_THRESHOLD:
		var home := _home_for(sim, s)
		_start(sim, s, Task.sleep(home.id if home != null else -1), wandering)
		return
	# Warcraft-style Stop and Hold: stand still (needs above still come first).
	if s.stopped_until != -1:
		if s.stopped_until > sim.tick:
			s.next_think = s.stopped_until
			return
		s.stopped_until = -1
	if s.hold:
		s.idle_reason = "Holding position — give any order to release"
		s.next_think = sim.tick + IDLE_BACKOFF * 3
		return
	if not s.focus.is_empty():
		var ft := _find_focus(sim, s)
		if ft != null:
			_start(sim, s, ft, wandering)
			return
		s.focus = {}
	var reason := ""
	var order := effective_priorities(s)
	for kind in order:
		if hands_full and kind != "farm" and kind != "build":
			continue
		var r: Variant = _find(sim, s, kind)
		if r is Task:
			_start(sim, s, r, wandering)
			return
		if r is String and r != "" and reason == "":
			reason = r
	if hands_full:
		reason = "Storage is full — build a storehouse"
	if s.hunger < EAT_THRESHOLD:
		reason = "Hungry, but there is no food in storage"
	if order.is_empty():
		reason = "Every kind of work is switched off in their work order"
	s.idle_reason = reason if reason != "" else "Nothing to do"
	# Nothing to do rarely changes within a second: look again a little later.
	s.next_think = sim.tick + IDLE_BACKOFF + (s.id % 5)
	if s.task == null and sim.rng.chance(0.08):
		var x := s.tile_x() + sim.rng.int_below(5) - 2
		var y := s.tile_y() + sim.rng.int_below(5) - 2
		if sim.walkable(x, y) and sim.world.explored(x, y):
			s.task = Task.move(x, y, true)


static func _start(sim: Simulation, s: Settler, t: Task, wandering: bool) -> void:
	if wandering:
		SettlerTasks.abort_task(sim, s)
	s.task = t
	s.idle_reason = ""


## The settler's work order: their own, or their main job's with the side job worked in
## (main job's first kind, side job's first kind, then the rest of both).
static func effective_priorities(s: Settler) -> Array[String]:
	var out: Array[String] = []
	if s.life_stage == "child":
		return out
	if s.has_priorities:
		for k: String in s.priorities:
			out.append(k)
		return out
	var main: Array = Defs.job(s.job)["priorities"]
	if s.side_job == "" or s.side_job == s.job:
		for k: String in main:
			out.append(k)
		return out
	var other: Array = Defs.job(s.side_job)["priorities"]
	var merged: Array = main.slice(0, 1) + other.slice(0, 1) + main.slice(1) + other.slice(1)
	for k: String in merged:
		if not out.has(k):
			out.append(k)
	return out


## Returns a Task, a reason String, or null (nothing to say).
static func _find(sim: Simulation, s: Settler, kind: String) -> Variant:
	var t0 := Prof.begin()
	var r: Variant = _find_kind(sim, s, kind)
	Prof.end("find_" + kind, t0)
	return r


static func _find_kind(sim: Simulation, s: Settler, kind: String) -> Variant:
	match kind:
		"build":
			return _find_build(sim, s)
		"haul":
			return _find_haul(sim, s)
		"farm":
			return _find_farm(sim, s)
		"gather":
			return _find_gather(sim, s)
		"craft":
			# Quarries and mines (digging) come with mining.
			return Production.find_craft(sim, s)
	return null


static func _dist(s: Settler, x: float, y: float) -> float:
	return JsMath.hypot(s.x - x, s.y - y)


# ---- build ------------------------------------------------------------------------------------

static func _find_build(sim: Simulation, s: Settler) -> Variant:
	var best: Building = null
	var best_slot := -1
	var best_d := INF
	for b: Building in sim.sites():
		if not BuildingOps.materials_complete(b):
			continue
		if sim.is_unreachable(s, Simulation.T_BUILDING + b.id):
			continue
		var max_builders: int = b.def().get("maxBuilders", 2)
		var slot := -1
		for i in max_builders:
			if not sim.is_reserved(SettlerTasks.build_key(b.id, i), s.id):
				slot = i
				break
		if slot < 0:
			continue
		var d := _dist(s, b.center_x(), b.center_y())
		if d < best_d:
			best_d = d
			best = b
			best_slot = slot
	if best == null:
		return null
	sim.reserve(SettlerTasks.build_key(best.id, best_slot), s.id)
	return Task.build(best.id, best_slot)


# ---- haul -----------------------------------------------------------------------------------------

## Goods construction sites and stocked stores still need: [{dst, res, need, priority, supply}].
static func haul_needs(sim: Simulation) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for b: Building in sim.sites():
		for e in Defs.cost_entries(b.type):
			var need: int = int(e[1]) - int(b.delivered.get(e[0], 0)) - int(b.incoming.get(e[0], 0))
			if need > 0:
				out.append({"dst": b, "res": e[0], "need": need, "priority": 0, "supply": false})
	for b: Building in sim.workshops():
		for n in Production.workshop_needs(sim, b):
			out.append({"dst": b, "res": n["res"], "need": n["need"], "priority": 12, "supply": false})
	for b: Building in sim.storages():
		if not b.wants.is_empty():
			# Stock targets: keep this store supplied from others with a surplus.
			var free := b.storage_capacity() - sim.storage_used(b) - Inv.total(b.incoming)
			for e in Inv.entries(b.wants):
				var need := mini(int(e[1]) - int(b.inventory.get(e[0], 0)) - int(b.incoming.get(e[0], 0)), free)
				if need <= 0:
					continue
				free -= need
				out.append({"dst": b, "res": e[0], "need": need, "priority": 30, "supply": true})
	return out


## Goods a store can spare: what it holds beyond its own stock target and promised loads.
static func surplus(sim: Simulation, b: Building, res: String) -> int:
	return sim.available(b, res) - int(b.wants.get(res, 0))


static func _supply_source(sim: Simulation, n: Dictionary) -> Building:
	var dst: Building = n["dst"]
	var best: Building = null
	var best_d := INF
	for b: Building in sim.storages():
		if b == dst or surplus(sim, b, n["res"]) <= 0:
			continue
		var d := JsMath.hypot(b.x - dst.x, b.y - dst.y)
		if d < best_d:
			best_d = d
			best = b
	return best


## Plans a haul for one need. Returns a Task, or a reason when stock is missing.
static func _plan_haul(sim: Simulation, s: Settler, n: Dictionary) -> Variant:
	var dst: Building = n["dst"]
	var res: String = n["res"]
	var supply: bool = n["supply"]
	var src := _supply_source(sim, n) if supply else sim.nearest_storage_with(res, s.x, s.y)
	if src == null:
		return "" if supply else "Waiting for %s for the %s" % [str(Defs.resource(res)["name"]).to_lower(), str(dst.def()["name"]).to_lower()]
	var amount := mini(int(n["need"]), mini(surplus(sim, src, res) if supply else sim.available(src, res), s.capacity))
	Inv.add(src.reserved_out, res, amount)
	Inv.add(dst.incoming, res, amount)
	return Task.haul(src.id, dst.id, res, amount)


## A haul for one building's needs (the work command), or a reason.
static func find_haul_for(sim: Simulation, s: Settler, dst: Building) -> Variant:
	var reason: Variant = null
	for n in haul_needs(sim):
		if n["dst"] != dst:
			continue
		var r: Variant = _plan_haul(sim, s, n)
		if r is Task:
			return r
		if reason == null:
			reason = r
	return reason


static func _find_haul(sim: Simulation, s: Settler) -> Variant:
	var scored: Array[Array] = []
	for n in haul_needs(sim):
		var dst: Building = n["dst"]
		if sim.is_unreachable(s, Simulation.T_BUILDING + dst.id):
			continue
		scored.append([_dist(s, dst.center_x(), dst.center_y()) + int(n["priority"]), scored.size(), n])
	# Stable by score, as Array.prototype.sort is in the browser game.
	scored.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]) or (float(a[0]) == float(b[0]) and int(a[1]) < int(b[1])))
	var reason: Variant = null
	for e in scored:
		var r: Variant = _plan_haul(sim, s, e[2])
		if r is Task:
			return r
		if r != "" and reason == null:
			reason = r
	return reason


# ---- farm -----------------------------------------------------------------------------------------

static func _find_farm(sim: Simulation, s: Settler) -> Variant:
	var best: Building = null
	var best_score := INF
	var action: StringName = &""
	var any_fields := false
	for b: Building in sim.fields():
		any_fields = true
		var a := Farming.field_action(sim, b.field)
		if a == &"" or (a == &"harvest" and s.carrying()):
			continue
		if sim.is_reserved(Simulation.K_FIELD + b.id, s.id) or sim.is_unreachable(s, Simulation.T_BUILDING + b.id):
			continue
		var bonus := 10 if a == &"harvest" else (5 if a == &"plant" else (2 if a == &"till" else 0))
		var score := _dist(s, b.x + 0.5, b.y + 0.5) - bonus
		if score < best_score:
			best_score = score
			best = b
			action = a
	if best == null:
		if any_fields and sim.season()["id"] == "winter":
			return "Winter: the fields rest until spring"
		var first := effective_priorities(s)
		if not first.is_empty() and first[0] == "farm":
			return "Fields are growing — nothing to tend" if any_fields else "No fields yet — place some from the Build menu"
		return null
	sim.reserve(Simulation.K_FIELD + best.id, s.id)
	return Task.farm(best.id, action)


# ---- gather ---------------------------------------------------------------------------------------

static func _gatherable(sim: Simulation, s: Settler, x: int, y: int, res: String = "") -> bool:
	var o := sim.world.obj(x, y)
	if o == World.UNKNOWN:
		return false
	var r := Tiles.object_resource[o]
	if r == "" or (res != "" and r != res):
		return false
	if sim.world.amount(x, y) <= 0 or not sim.world.explored(x, y):
		return false
	var k := Simulation.tile_key(x, y)
	return not sim.is_reserved(Simulation.K_OBJ + k, s.id) and not sim.is_unreachable(s, Simulation.T_OBJECT + k)


## Nearest harvestable object of a resource type within a square radius of (cx, cy), preferring
## ones close to the settler and to the centre (score: distance + half the distance to the centre).
## Searched through the resource index rather than tile by tile: in the 100-settler benchmark the
## square scan cost 3.1 ms per gatherer decision.
static func scan_nearest(sim: Simulation, s: Settler, cx: float, cy: float, radius: int, res: String) -> Vector2i:
	var ix: TileSetIndex = sim.resource_index.get(res)
	if ix == null:
		return Vector2i(-99999, 0)
	var x0 := floori(cx)
	var y0 := floori(cy)
	var k := ix.nearest(s.x, s.y, func(tk: int) -> float:
		var x := Simulation.key_x(tk)
		var y := Simulation.key_y(tk)
		if absi(x - x0) > radius or absi(y - y0) > radius or not _gatherable(sim, s, x, y, res):
			return INF
		return JsMath.hypot(x + 0.5 - s.x, y + 0.5 - s.y) + JsMath.hypot(x - cx, y - cy) * 0.5, Rect2i(x0 - radius, y0 - radius, radius * 2 + 1, radius * 2 + 1))
	return Vector2i(Simulation.key_x(k), Simulation.key_y(k)) if k != -1 else Vector2i(-99999, 0)


static func _object_task(sim: Simulation, s: Settler, x: int, y: int) -> Task:
	sim.reserve(Simulation.K_OBJ + Simulation.tile_key(x, y), s.id)
	return Task.gather(x, y)


static func _find_gather(sim: Simulation, s: Settler) -> Variant:
	# Nearest marked tile, searched outward through the mark index (marks whose object is gone
	# are dropped as they are met).
	var tm := Prof.begin()
	var stale: Array[int] = []
	var k := sim.designations.nearest(s.x, s.y, func(tk: int) -> float:
		var x := Simulation.key_x(tk)
		var y := Simulation.key_y(tk)
		if not _gatherable(sim, s, x, y):
			var o := sim.world.obj(x, y)
			if o != World.UNKNOWN and Tiles.object_resource[o] == "":
				stale.append(tk)
			return INF
		return JsMath.hypot(x + 0.5 - s.x, y + 0.5 - s.y))
	for tk in stale:
		sim.designations.erase(tk)
	Prof.end("gather_marks", tm)
	if k != -1:
		return _object_task(sim, s, Simulation.key_x(k), Simulation.key_y(k))
	if s.job != "gatherer":
		return null
	# Gatherers keep the stores balanced when nothing is marked.
	var totals := sim.totals()
	var targets := {"wood": 80.0, "stone": 50.0, "food": 30.0 + sim.settlers.size() * 6}
	var order: Array[Array] = []
	for r: String in ["wood", "stone", "food"]:
		var ratio := float(totals[r]) / float(targets[r])
		if ratio < 1.5:
			order.append([ratio, order.size(), r])
	order.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]) or (float(a[0]) == float(b[0]) and int(a[1]) < int(b[1])))
	if order.is_empty():
		return "Stores are well stocked"
	if sim.nearest_storage_with_space(s.x, s.y) == null:
		return "Storage is full — build a storehouse"
	# Gather around the settler's own settlement.
	var home: Building = sim.buildings.get(s.settlement_id) if s.settlement_id != -1 else null
	if home == null:
		var st := sim.storages()
		home = st[0] if not st.is_empty() else null
	var cx := home.x + 1.0 if home != null else s.x
	var cy := home.y + 1.0 if home != null else s.y
	for e in order:
		var ts := Prof.begin()
		var t := scan_nearest(sim, s, cx, cy, AUTO_GATHER_RADIUS, e[2])
		Prof.end("gather_auto_scan", ts)
		if t.x != -99999:
			return _object_task(sim, s, t.x, t.y)
	return "Nothing left to gather near storage — mark resources with the Harvest tool"


static func _find_focus(sim: Simulation, s: Settler) -> Task:
	if sim.tick > int(s.focus["until"]):
		return null
	var t := scan_nearest(sim, s, float(s.focus["x"]), float(s.focus["y"]), FOCUS_RADIUS, s.focus["res"])
	return _object_task(sim, s, t.x, t.y) if t.x != -99999 else null


## Where a settler sleeps: their own bed, or their settlement's hall if they have none.
static func _home_for(sim: Simulation, s: Settler) -> Building:
	if s.home_id != -1:
		var h: Building = sim.buildings.get(s.home_id)
		if h != null and h.built:
			return h
	var own: Building = sim.buildings.get(s.settlement_id) if s.settlement_id != -1 else null
	if own != null and own.built:
		return own
	return BuildingOps.camp_of(sim)
