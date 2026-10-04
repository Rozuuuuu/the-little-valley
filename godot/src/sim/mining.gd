class_name Mining
## Surveying, quarries, mines and fisher's huts (src/game/sim/mining.ts). Surveying a spot records
## its whole 16×16 geology cell; a mine goes over a surveyed deposit and digs it out a few ore per
## trip (more as the shaft is deepened); a quarry cuts stone forever; a fisher's hut on the shore
## lands fish. Ore promised to a miner on the way is held back so two miners never take the
## same last unit.

## Work ticks for one survey at the spot.
const SURVEY_WORK := 60
## Ore a miner carries per trip at each shaft level.
const MINE_YIELD: Array[int] = [0, 2, 3, 4]
const QUARRY_YIELD := 3
const FISH_YIELD := 3
const EXTRACT_WORK := {"quarry": 90, "mine": 120, "fish": 100}
## Materials to deepen a shaft to level 2 and 3, paid from storage at once.
const MINE_UPGRADES := {2: {"planks": 10, "stone": 10}, 3: {"planks": 20, "stone": 20, "tools": 4}}
## Stone cut per visible excavation stage of a quarry (4 stages).
const QUARRY_STAGE := 30


static func _deposit_at(sim: Simulation, cx: int, cy: int) -> Dictionary:
	return Geology.deposit_in_cell(sim.seed_value, sim.world.gen, cx, cy, sim.world.habitat_id)


## What surveying found in a cell: {cx, cy, deposit} (deposit with "remaining", or empty), or an
## empty Dictionary when nobody has surveyed it.
static func known_cell(sim: Simulation, cx: int, cy: int) -> Dictionary:
	var id := Geology.cell_id(cx, cy)
	if not sim.geology.has(id):
		return {}
	var d := _deposit_at(sim, cx, cy).duplicate()
	if not d.is_empty():
		var rem: Variant = sim.geology[id]
		d["remaining"] = int(rem) if rem != null else int(d["initial"])
	return {"cx": cx, "cy": cy, "deposit": d}


static func surveyed_cell(sim: Simulation, x: int, y: int) -> Dictionary:
	var c := Geology.cell_of(x, y)
	return known_cell(sim, c.x, c.y)


## Every deposit found so far.
static func known_deposits(sim: Simulation) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for id: int in sim.geology:
		var c := Geology.cell_from_id(id)
		var k := known_cell(sim, c.x, c.y)
		if not (k["deposit"] as Dictionary).is_empty():
			out.append(k["deposit"])
	return out


static func describe_cell(c: Dictionary) -> String:
	var d: Dictionary = c["deposit"]
	if d.is_empty():
		return "no workable ore"
	var m := Geology.mineral(str(d["mineral"]))
	if int(d["remaining"]) > 0:
		return "%s (%d %s left)" % [str(m["name"]).to_lower(), int(d["remaining"]), str(Defs.resource(str(m["resource"]))["name"]).to_lower()]
	return "a worked-out %s seam" % str(m["name"]).to_lower()


## Sends an adult to survey the ground at (x, y). The whole cell around it is surveyed.
static func survey(sim: Simulation, settler_id: Variant, x: Variant, y: Variant) -> Dictionary:
	var s := sim.settler(int(settler_id)) if (settler_id is int or settler_id is float) else null
	if s == null:
		return {"ok": false, "message": "Select a settler first"}
	if s.life_stage == "child":
		return {"ok": false, "message": "%s is a child — children can't survey until they grow up" % s.name}
	if not (x is int or x is float) or not (y is int or y is float) or float(x) != floorf(float(x)) or float(y) != floorf(float(y)):
		return {"ok": false, "message": "Invalid location"}
	var tx := int(x)
	var ty := int(y)
	if not sim.world.explored(tx, ty):
		return {"ok": false, "message": "Explore this spot first"}
	var known := surveyed_cell(sim, tx, ty)
	if not known.is_empty():
		return {"ok": false, "message": "Already surveyed: %s" % describe_cell(known)}
	var c := Geology.cell_of(tx, ty)
	for o in sim.settlers:
		if o != s and o.task != null and o.task.kind == Task.SURVEY and Geology.cell_of(o.task.x, o.task.y) == c:
			return {"ok": false, "message": "%s is already surveying here" % o.name}
	SettlerTasks.abort_task(sim, s)
	s.focus = {}
	s.idle_reason = ""
	s.task = Task.survey(tx, ty)
	return {"ok": true, "message": "%s is off to survey the ground." % s.name}


## Records a finished survey. Returns the plain-language result.
static func complete_survey(sim: Simulation, s: Settler, x: int, y: int) -> String:
	var c := Geology.cell_of(x, y)
	var id := Geology.cell_id(c.x, c.y)
	if not sim.geology.has(id):
		var d := _deposit_at(sim, c.x, c.y)
		sim.geology[id] = int(d["initial"]) if not d.is_empty() else null
		sim.stats["surveys"] = int(sim.stats["surveys"]) + 1
	var k := known_cell(sim, c.x, c.y)
	var found := describe_cell(k)
	var dep: Dictionary = k["deposit"]
	if not dep.is_empty():
		var mname := str(Geology.mineral(str(dep["mineral"]))["name"]).to_lower()
		sim.toast("%s found %s! Build a mine on the marked spot." % [s.name, found], "good")
		sim.record("built", "Found %s ore" % mname, int(dep["x"]), int(dep["y"]))
		sim.emit({"type": "fx", "kind": "sparkle", "x": int(dep["x"]) + 0.5, "y": int(dep["y"]) + 0.5})
	else:
		sim.toast("%s surveyed the ground: no workable ore here." % s.name, "info")
	sim.emit({"type": "important"})
	return found


static func run_survey(sim: Simulation, s: Settler, t: Task) -> void:
	if t.stage == &"walk":
		var r := SettlerTasks.go_to(sim, s, GridAStar.Goal.new(t.x, t.y, 1, 1, not sim.walkable(t.x, t.y)))
		if r == SettlerTasks.Move.FAILED:
			SettlerTasks.abort_task(sim, s, "Can't reach the spot to survey")
			return
		if r == SettlerTasks.Move.ARRIVED:
			t.stage = &"work"
		return
	SettlerTasks.face(s, t.x + 0.5, t.y + 0.5)
	s.anim = &"work"
	s.tool = &"pick"
	t.timer += SettlerTasks.work_speed(sim, s)
	if (sim.tick + s.id) % 15 == 0:
		sim.emit({"type": "sfx", "name": "mine", "x": float(t.x), "y": float(t.y)})
	if t.timer < SURVEY_WORK:
		return
	complete_survey(sim, s, t.x, t.y)
	SettlerTasks.abort_task(sim, s)


# ---- placement ------------------------------------------------------------------------------------

static func quarry_stage(b: Building) -> int:
	return mini(3, floori(int(b.quarry.get("extracted", 0)) / float(QUARRY_STAGE)))


## A surveyed deposit whose tile lies inside the footprint, or empty.
static func deposit_under(sim: Simulation, x: int, y: int, w: int, h: int) -> Dictionary:
	for dy in h:
		for dx in w:
			var k := surveyed_cell(sim, x + dx, y + dy)
			if k.is_empty():
				continue
			var d: Dictionary = k["deposit"]
			if not d.is_empty() and int(d["x"]) >= x and int(d["x"]) < x + w and int(d["y"]) >= y and int(d["y"]) < y + h:
				return d
	return {}


## Why a quarry, mine or fisher's hut can't go here, or "".
static func site_problem(sim: Simulation, type: String, x: int, y: int) -> String:
	var def := Defs.building(type)
	var w := int(def["size"]["w"])
	var h := int(def["size"]["h"])
	match str(def.get("site", "")):
		"rock":
			var rocky := 0
			for dy in h:
				for dx in w:
					var t := sim.world.terrain(x + dx, y + dy)
					if t == Tiles.ROCKY or t == Tiles.HILL:
						rocky += 1
			return "" if rocky * 2 >= w * h else "A quarry needs rocky ground or hill slopes under at least half of it"
		"shore":
			# Some water must touch the footprint's edge.
			for dy in range(-1, h + 1):
				for dx in range(-1, w + 1):
					if dx >= 0 and dx < w and dy >= 0 and dy < h:
						continue
					var t := sim.world.terrain(x + dx, y + dy)
					if t == Tiles.WATER or t == Tiles.DEEP_WATER:
						return ""
			return "A fisher's hut must stand on the shore, right beside water"
		"deposit":
			var d := deposit_under(sim, x, y, w, h)
			if d.is_empty():
				return "Build a mine over a surveyed deposit — send a settler to survey rocky ground or hill faces first"
			if int(d["remaining"]) <= 0:
				return "This seam is worked out"
			for b: Building in sim.buildings.values():
				if not b.mine.is_empty() and int(b.mine["depositId"]) == int(d["id"]):
					return "This deposit already has a mine"
	return ""


## Sets up a placed quarry or mine.
static func init_site(sim: Simulation, b: Building) -> void:
	var kind := str(b.def().get("extraction", ""))
	if kind == "quarry":
		b.quarry = {"extracted": 0}
	elif kind == "mine":
		var d := deposit_under(sim, b.x, b.y, b.w, b.h)
		if not d.is_empty():
			b.mine = {"depositId": int(d["id"]), "level": 1}


# ---- extraction -----------------------------------------------------------------------------------

## Ore still undug and not promised to a miner on the way.
static func ore_available(sim: Simulation, b: Building) -> int:
	if b.mine.is_empty():
		return 0
	var id := int(b.mine["depositId"])
	var left: Variant = sim.geology.get(id)
	return (int(left) if left != null else 0) - int(sim.ore_reserved.get(id, 0))


static func mine_deposit(sim: Simulation, b: Building) -> Dictionary:
	if b.mine.is_empty():
		return {}
	var c := Geology.cell_from_id(int(b.mine["depositId"]))
	var k := known_cell(sim, c.x, c.y)
	return k["deposit"] if not k.is_empty() else {}


## What a finished trip yields: {res, amount}, or empty. Ore leaves the deposit here only.
static func complete_extraction(sim: Simulation, b: Building, amount: int) -> Dictionary:
	if b.def().get("extraction") == "fish":
		sim.stats["foodGathered"] = int(sim.stats["foodGathered"]) + amount
		return {"res": "food", "amount": amount}
	if not b.quarry.is_empty():
		b.quarry["extracted"] = int(b.quarry["extracted"]) + amount
		sim.stats["stoneQuarried"] = int(sim.stats["stoneQuarried"]) + amount
		return {"res": "stone", "amount": amount}
	var d := mine_deposit(sim, b)
	if b.mine.is_empty() or d.is_empty() or not sim.geology.has(int(b.mine["depositId"])):
		return {}
	var id := int(b.mine["depositId"])
	sim.ore_reserved[id] = maxi(0, int(sim.ore_reserved.get(id, 0)) - amount)
	var rem: Variant = sim.geology[id]
	var have := int(rem) if rem != null else 0
	var n := mini(amount, have)
	sim.geology[id] = have - n
	sim.stats["oreMined"] = int(sim.stats["oreMined"]) + n
	var m := Geology.mineral(str(d["mineral"]))
	if have - n <= 0:
		sim.toast("The %s mine is worked out. Survey for another deposit." % str(m["name"]).to_lower(), "warn")
		sim.record("shortage", "A %s seam ran out" % str(m["name"]).to_lower(), b.x, b.y)
	return {"res": str(m["resource"]), "amount": n} if n > 0 else {}


static func _digging(sim: Simulation, b: Building) -> int:
	var n := 0
	for s in sim.settlers:
		if s.task != null and s.task.kind == Task.EXTRACT and s.task.site == b.id:
			n += 1
	return n


static func _anyone_crafts(sim: Simulation) -> bool:
	for s in sim.settlers:
		if SettlerBrain.effective_priorities(s).has("craft"):
			return true
	return false


## Status line for a quarry, mine or fisher's hut.
static func extraction_status(sim: Simulation, b: Building) -> String:
	if not b.built:
		return ""
	var bname := str(b.def()["name"]).to_lower()
	var digging := _digging(sim, b)
	if b.def().get("extraction") == "fish":
		if digging > 0:
			return "%d fishing from the jetty" % digging
		if sim.nearest_storage_with_space(b.x, b.y, "food") == null:
			return "Storage is full — nowhere to put the catch"
		return "Waiting for a fisher" if not b.workers.is_empty() or _anyone_crafts(sim) else "No worker — select a settler and right-click the %s" % bname
	if not b.mine.is_empty():
		var d := mine_deposit(sim, b)
		if d.is_empty():
			return "No deposit here"
		var m := Geology.mineral(str(d["mineral"]))
		if int(d["remaining"]) <= 0:
			return "Worked out — this %s seam is empty" % str(m["name"]).to_lower()
		var head := "%d %s left · shaft level %d" % [int(d["remaining"]), str(Defs.resource(str(m["resource"]))["name"]).to_lower(), int(b.mine["level"])]
		if digging > 0:
			return "%s · %d digging" % [head, digging]
	elif digging > 0:
		return "%d cutting stone · pit stage %d/4" % [digging, quarry_stage(b) + 1]
	if sim.nearest_storage_with_space(b.x, b.y) == null:
		return "Storage is full — nowhere to put what is dug"
	if b.workers.is_empty() and not _anyone_crafts(sim):
		return "No worker — select a settler and right-click the %s" % bname
	return "Waiting for a miner · shaft level %d" % int(b.mine["level"]) if not b.mine.is_empty() else "Waiting for a worker · pit stage %d/4" % (quarry_stage(b) + 1)


static func extract_key(site: int, slot: int) -> int:
	return Simulation.K_EXTRACT + site * 64 + slot


## A dig at a quarry, mine or fisher's hut the settler may work at; reserves the slot and the ore.
static func find_extract(sim: Simulation, s: Settler) -> Variant:
	var reason: Variant = null
	var best: Building = null
	var best_slot := -1
	var best_d := INF
	for b in sim.extraction_sites():
		if not Husbandry.may_work_at(b, s.id):
			continue
		if sim.is_unreachable(s, Simulation.T_BUILDING + b.id):
			continue
		if not b.mine.is_empty() and ore_available(sim, b) <= 0:
			if reason == null:
				var rem: Variant = sim.geology.get(int(b.mine["depositId"]))
				reason = "The mine is worked out" if rem == null or int(rem) <= 0 else "Other miners are digging the last ore"
			continue
		var slot := -1
		var cap_v: Variant = b.stat("maxWorkers")
		for i in maxi(1, int(cap_v) if cap_v != null else 0):
			if not sim.is_reserved(extract_key(b.id, i), s.id):
				slot = i
				break
		if slot < 0:
			continue
		var d := JsMath.hypot(b.x - s.x, b.y - s.y) - (1000.0 if b.workers.has(s.id) else 0.0)
		if best == null or d < best_d:
			best_d = d
			best = b
			best_slot = slot
	if best == null:
		return reason
	if sim.nearest_storage_with_space(s.x, s.y) == null:
		return "Storage is full — nowhere to put what I dig"
	var amount := FISH_YIELD if best.def().get("extraction") == "fish" else QUARRY_YIELD
	if not best.mine.is_empty():
		var lvl := int(best.mine["level"])
		amount = mini(MINE_YIELD[lvl] if lvl < MINE_YIELD.size() else 2, ore_available(sim, best))
		var id := int(best.mine["depositId"])
		sim.ore_reserved[id] = int(sim.ore_reserved.get(id, 0)) + amount
	sim.reserve(extract_key(best.id, best_slot), s.id)
	return Task.extract(best.id, best_slot, amount)


## Gives back what an unfinished dig had promised (the slot is released with the task).
static func release_extraction(sim: Simulation, site_id: int, amount: int) -> void:
	var b: Building = sim.buildings.get(site_id)
	if b == null or b.mine.is_empty() or amount <= 0:
		return
	var id := int(b.mine["depositId"])
	sim.ore_reserved[id] = maxi(0, int(sim.ore_reserved.get(id, 0)) - amount)


static func run_extract(sim: Simulation, s: Settler, t: Task) -> void:
	var b: Building = sim.buildings.get(t.site)
	var kind := str(b.def().get("extraction", "")) if b != null else ""
	if b == null or kind == "" or not b.built or s.carrying():
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
	s.tool = &"hand" if kind == "fish" else &"pick"
	t.timer += SettlerTasks.work_speed(sim, s) * Production.speed_of(b)
	if (sim.tick + s.id) % 12 == 0:
		sim.emit({"type": "sfx", "name": "water" if kind == "fish" else "mine", "x": b.x + 1.0, "y": b.y + 1.0})
		sim.emit({"type": "fx", "kind": "splash" if kind == "fish" else "stonechips", "x": b.x + 1.0, "y": b.y + 1.0})
	if t.timer < float(EXTRACT_WORK[kind]):
		return
	var got := complete_extraction(sim, b, t.amount)
	# The promised ore is now dug (or gone); nothing is left to give back.
	t.amount = 0
	if not got.is_empty():
		s.set_carry(str(got["res"]), int(got["amount"]))
	SettlerTasks.abort_task(sim, s)


## Crafting and digging share the Craft work kind: assigned workers go to their own building first.
static func find_craft_or_dig(sim: Simulation, s: Settler) -> Variant:
	var dig: Variant = find_extract(sim, s)
	if dig is Task:
		return dig
	var craft: Variant = Production.find_craft(sim, s)
	if craft is Task:
		return craft
	if dig != null:
		return dig
	if craft != null:
		return craft
	return null if not sim.workshops().is_empty() or not sim.extraction_sites().is_empty() else "No workshop, mill, bakery, quarry or mine built yet"


## Deepens a mine's shaft, paying from storage at once (all or nothing).
static func upgrade_mine(sim: Simulation, building_id: Variant) -> Dictionary:
	var b: Building = sim.buildings.get(int(building_id)) if (building_id is int or building_id is float) else null
	if b == null or b.mine.is_empty() or not b.built:
		return {"ok": false, "message": "Only a finished mine can be deepened"}
	if int(b.mine["level"]) >= 3:
		return {"ok": false, "message": "The shaft is already at the deepest level"}
	var next := int(b.mine["level"]) + 1
	var cost: Dictionary = MINE_UPGRADES[next]
	var short: PackedStringArray = []
	for r: String in cost:
		var free := 0
		for st in sim.storages():
			free += maxi(0, sim.available(st, r))
		if free < int(cost[r]):
			short.append("%d more %s" % [int(cost[r]) - free, str(Defs.resource(r)["name"]).to_lower()])
	if not short.is_empty():
		return {"ok": false, "message": "Deepening the shaft needs %s" % ", ".join(short)}
	for r: String in cost:
		sim.withdraw_unreserved(r, int(cost[r]))
	b.mine["level"] = next
	sim.emit({"type": "sfx", "name": "hammer", "x": b.x + 1.0, "y": b.y + 1.0})
	sim.emit({"type": "important"})
	return {"ok": true, "message": "The shaft is now level %d: each trip brings up %d ore." % [next, MINE_YIELD[next]]}
