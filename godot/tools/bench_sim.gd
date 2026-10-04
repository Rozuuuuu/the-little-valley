extends SceneTree
## Simulation tick benchmark: a developed village at several sizes. From godot/:
##   godot --headless --path . -s res://tools/bench_sim.gd -- [settlers=100] [ticks=2880] [seed=777001]
##
## Mirrors scripts/profile-village.ts as far as the slice allows: generator 3 land, seed 777001,
## 16 cottages, 3 storehouses, two blocks of fields, construction sites, a 61×61 area marked for
## harvest, settlers in five jobs. Not in the slice yet (so not in this workload): the mill,
## bakery and workshop, and the four work areas. Prints tick percentiles (ms), split day/night,
## plus path searches per tick and busy settlers, as JSON.


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var n := int(args[0]) if args.size() > 0 else 100
	var ticks := int(args[1]) if args.size() > 1 else Defs.DAY_TICKS
	var seed_value := int(args[2]) if args.size() > 2 else 777001
	var t_setup := Time.get_ticks_msec()
	var sim := NewGame.create(seed_value, 3)
	sim.reached.append_array(["hamlet", "village"])
	sim.world.reveal(0.0, 0.0, 40.0)
	var camp := BuildingOps.camp_of(sim)
	camp.inventory = {"food": 200, "wood": 30, "stone": 20}
	for i in 16:
		_instant(sim, "cottage", Vector2i(-20 + (i % 8) * 5, -14 if i < 8 else 16))
	for i in 3:
		_instant(sim, "storehouse", Vector2i(-12 + i * 12, -6))
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -12, "y0": 3, "x1": -4, "y1": 10, "crop": "turnip"})
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": 4, "y0": 3, "x1": 10, "y1": 10, "crop": "wheat"})
	var jobs: Array[String] = ["laborer", "farmer", "gatherer", "builder", "hauler"]
	while sim.settlers.size() < n:
		var i := sim.settlers.size()
		sim.add_settler(-4 + (i % 9), 12 + (i % 27) / 9, jobs[i % 5])
	BuildingOps.assign_homes(sim)
	for i in 4:
		var p := _spot(sim, 3, 2, Vector2i(24, -4 + i * 5))
		if p.x != -99999:
			Commands.apply(sim, {"type": "place", "building": "cottage", "x": p.x, "y": p.y})
	Commands.apply(sim, {"type": "designate", "x0": -30, "y0": -30, "x1": 30, "y1": 30, "on": true})
	var setup_ms := Time.get_ticks_msec() - t_setup
	for i in 300:
		sim.step()
		sim.drain_events()
	Prof.enabled = OS.get_environment("PROF") != ""
	Prof.reset()
	var day: Array[float] = []
	var night: Array[float] = []
	var searches := 0
	var busy_total := 0
	var busy_samples := 0
	for i in ticks:
		var is_night := sim.is_night()
		var before := sim.path_searches_left
		var t0 := Time.get_ticks_usec()
		sim.step()
		var dt := (Time.get_ticks_usec() - t0) / 1000.0
		searches += Simulation.PATH_SEARCHES_PER_TICK - sim.path_searches_left
		(night if is_night else day).append(dt)
		sim.drain_events()
		if i % 100 == 0 and not is_night:
			busy_samples += 1
			for s in sim.settlers:
				if s.task != null and s.task.kind != Task.WANDER and s.task.kind != Task.SLEEP:
					busy_total += 1
	var homeless := 0
	for s in sim.settlers:
		if s.home_id == -1:
			homeless += 1
	print(JSON.stringify({
		"settlers": sim.settlers.size(), "buildings": sim.buildings.size(), "homeless": homeless,
		"avgBusyDaytime": busy_total / maxi(1, busy_samples), "pathSearchesPerTick": snappedf(float(searches) / ticks, 0.01),
		"setupMs": setup_ms, "day": _stats(day), "night": _stats(night),
		"godot": Engine.get_version_info()["string"], "cpu": OS.get_processor_name(),
	}))
	if Prof.enabled:
		for row in Prof.report():
			print("  %-22s %9.1f ms %8d calls %9.2f µs/call" % row)
	quit()


static func _stats(a: Array[float]) -> Dictionary:
	if a.is_empty():
		return {}
	var s := a.duplicate()
	s.sort()
	var total := 0.0
	for v: float in s:
		total += v
	var q := func(p: float) -> float: return s[mini(s.size() - 1, floori(s.size() * p))]
	return {"ticks": s.size(), "avg": snappedf(total / s.size(), 0.001), "p50": snappedf(q.call(0.5), 0.001),
		"p95": snappedf(q.call(0.95), 0.001), "p99": snappedf(q.call(0.99), 0.001), "max": snappedf(s[s.size() - 1], 0.01)}


static func _spot(sim: Simulation, w: int, h: int, near: Vector2i) -> Vector2i:
	for r in 40:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				var ok := true
				for dy in range(-1, h + 1):
					for dx in range(-1, w + 1):
						if not ok:
							break
						var t := sim.world.terrain(x + dx, y + dy)
						var o := sim.world.obj(x + dx, y + dy)
						ok = sim.world.explored(x + dx, y + dy) and sim.building_at(x + dx, y + dy) == null \
							and (t == Tiles.GRASS or t == Tiles.MEADOW or t == Tiles.FOREST) and o != World.UNKNOWN and Tiles.blocks[o] == 0
				if ok:
					return Vector2i(x, y)
	return Vector2i(-99999, 0)


static func _instant(sim: Simulation, type: String, near: Vector2i) -> Building:
	var d := Defs.building(type)
	var p := _spot(sim, int(d["size"]["w"]), int(d["size"]["h"]), near)
	if p.x == -99999:
		return null
	var b := BuildingOps.place(sim, type, p.x, p.y)
	b.delivered = BuildingOps.cost_of(b).duplicate()
	BuildingOps.complete(sim, b, true)
	return b
