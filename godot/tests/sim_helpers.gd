class_name SimHelpers
## Shared helpers for simulation tests (the Godot counterpart of tests/helpers.ts).


static func run(sim: Simulation, ticks: int) -> void:
	for i in ticks:
		sim.step()


## Steps until `cond` holds; returns the ticks taken, or -1 if it never held.
static func run_until(sim: Simulation, cond: Callable, max_ticks: int) -> int:
	for i in max_ticks:
		if cond.call():
			return i
		sim.step()
	return max_ticks if cond.call() else -1


static func camp(sim: Simulation) -> Building:
	return BuildingOps.camp_of(sim)


## The nearest explored object tile that yields a resource.
static func nearest_resource(sim: Simulation, res: String, from: Vector2i = Vector2i.ZERO, radius: int = 20) -> Vector2i:
	var best := Vector2i(-99999, 0)
	var best_d := INF
	for y in range(from.y - radius, from.y + radius + 1):
		for x in range(from.x - radius, from.x + radius + 1):
			var o := sim.world.obj(x, y)
			if o == World.UNKNOWN or Tiles.object_def(o).get("resource", "") != res or not sim.world.explored(x, y):
				continue
			var d := JsMath.hypot(x - from.x, y - from.y)
			if d < best_d:
				best_d = d
				best = Vector2i(x, y)
	return best


## Every unit of a resource that exists anywhere in the settlement.
static func accounted_for(sim: Simulation, res: String) -> int:
	var n := 0
	for b: Building in sim.buildings.values():
		n += int(b.inventory.get(res, 0)) + int(b.delivered.get(res, 0))
	for s in sim.settlers:
		if s.carry_res == res:
			n += s.carry_amount
	return n


## Resource consumed by completed buildings (plus ones converted to terrain, given by count).
static func consumed_by_construction(sim: Simulation, res: String, converted: Dictionary = {}) -> int:
	var n := 0
	for b: Building in sim.buildings.values():
		if b.built and b.type != "camp" and b.type != "townHall":
			n += int(BuildingOps.cost_of(b).get(res, 0))
	for type: String in converted:
		n += int(Inv.from_json(Defs.building(type).get("cost", {})).get(res, 0)) * int(converted[type])
	return n


## Places a building at the first valid spot in widening rings around the hall.
static func find_spot(sim: Simulation, type: String) -> Building:
	for r in range(3, 14):
		for y in range(-r, r + 1):
			for x in range(-r, r + 1):
				var res := Commands.apply(sim, {"type": "place", "building": type, "x": x, "y": y})
				if bool(res["ok"]):
					for b: Building in sim.buildings.values():
						if b.x == x and b.y == y and b.type == type:
							return b
	return null


## Problems with reservations and promised goods (empty when consistent).
static func reservation_problems(sim: Simulation) -> PackedStringArray:
	var out := sim.reservation_problems()
	for b: Building in sim.buildings.values():
		for inv: Dictionary in [b.inventory, b.delivered, b.incoming, b.reserved_out]:
			for k: String in inv:
				if int(inv[k]) < 0:
					out.append("building %d has %d %s" % [b.id, int(inv[k]), k])
		for k: String in b.reserved_out:
			if int(b.reserved_out[k]) > int(b.inventory.get(k, 0)):
				out.append("building %d promised %d %s but holds %d" % [b.id, int(b.reserved_out[k]), k, int(b.inventory.get(k, 0))])
	return out
