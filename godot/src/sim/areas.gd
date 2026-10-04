class_name Areas
## Work areas that look after themselves (src/game/sim/areas.ts):
##  - an area with a wanted number of workers staffs itself from free adults (idle ones first,
##    then the nearest) and lets the most recently added go when the number drops;
##  - a farm area with a crop lays out its own fields on every free fertile tile;
##  - woodlots replant (SettlerTasks.run_gather).
## Hunting grounds keep their settlers but find no work until animals are ported.

const AREA_STEP := 100
## Most new fields a farm area lays out per step (they are free and instant).
const FIELDS_PER_STEP := 24


## Adults nobody has claimed: no area and no workplace. (Rulers, soldiers, councillors and
## people away are excluded too once those systems are ported.)
static func _free(s: Settler, assigned: Dictionary) -> bool:
	return s.life_stage == "adult" and s.area_id == -1 and not assigned.has(s.id)


static func lay_out_fields(sim: Simulation, a: WorkArea) -> int:
	if a.kind != "farm" or a.crop == "":
		return 0
	var n := 0
	for y in range(a.y0, a.y1 + 1):
		if n >= FIELDS_PER_STEP:
			break
		for x in range(a.x0, a.x1 + 1):
			if n >= FIELDS_PER_STEP:
				break
			if sim.building_at(x, y) != null or not sim.world.explored(x, y):
				continue
			if not bool(BuildingOps.check_placement(sim, "field", x, y)["ok"]):
				continue
			BuildingOps.place(sim, "field", x, y, a.crop)
			n += 1
	if n > 0:
		sim.map_changed()
	return n


static func update(sim: Simulation) -> void:
	if sim.work_areas.is_empty():
		return
	var assigned := {}
	var any_staffed := false
	for a in sim.work_areas:
		if a.wanted >= 0:
			any_staffed = true
	if any_staffed:
		for b: Building in sim.buildings.values():
			for id in b.workers:
				assigned[id] = true
	for a in sim.work_areas:
		if a.wanted < 0:
			continue
		var crew: Array[Settler] = []
		for s in sim.settlers:
			if s.area_id == a.id:
				crew.append(s)
		if crew.size() > a.wanted:
			# Let the most recently added go back to their usual work.
			for i in range(a.wanted, crew.size()):
				crew[i].area_id = -1
				crew[i].next_think = 0
		elif crew.size() < a.wanted:
			var cx := (a.x0 + a.x1) / 2.0
			var cy := (a.y0 + a.y1) / 2.0
			var pool: Array[Array] = []
			for s in sim.settlers:
				if _free(s, assigned):
					pool.append([0 if s.idle_reason != "" else 1, JsMath.hypot(s.x - cx, s.y - cy), pool.size(), s])
			pool.sort_custom(func(p: Array, q: Array) -> bool:
				if int(p[0]) != int(q[0]):
					return int(p[0]) < int(q[0])
				if float(p[1]) != float(q[1]):
					return float(p[1]) < float(q[1])
				return int(p[2]) < int(q[2]))
			for i in mini(pool.size(), a.wanted - crew.size()):
				var s: Settler = pool[i][3]
				s.area_id = a.id
				s.next_think = 0
	for a in sim.work_areas:
		if a.kind == "farm" and a.crop != "":
			lay_out_fields(sim, a)


## Settlers working in an area.
static func crew_of(sim: Simulation, area_id: int) -> Array[Settler]:
	var out: Array[Settler] = []
	for s in sim.settlers:
		if s.area_id == area_id:
			out.append(s)
	return out


## Areas with at least one settler assigned (the Village milestone counts them).
static func staffed_count(sim: Simulation) -> int:
	var staffed := {}
	for s in sim.settlers:
		if s.area_id != -1 and sim.area(s.area_id) != null:
			staffed[s.area_id] = true
	return staffed.size()


## Is a tile inside any woodlot? Trees cut there are replanted at once.
static func in_woodlot(sim: Simulation, x: int, y: int) -> bool:
	for a in sim.work_areas:
		if a.kind == "wood" and a.contains(x, y):
			return true
	return false
