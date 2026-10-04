extends SceneTree
## Compares pathfinders on the golden corpus's terrain (godot/tests/golden/paths.json). From godot/:
##   godot --headless --path . -s res://tools/bench_path.gd
## For each golden search, the target is reduced to one walkable tile (the goal's first walkable
## tile), so all three solvers answer the same question:
## - GridAStar (faithful port, PathGrid callbacks)
## - DenseAStar (same algorithm on flat arrays)
## - AStarGrid2D (Godot's native C++ solver, octile, no corner cutting, per-cell weights)
## Prints total time, per-search time, and whether path costs agree.


class RegionGrid:
	extends PathGrid
	var world: World
	var lo: int
	var hi: int

	func walkable(x: int, y: int) -> bool:
		return x >= lo and x <= hi and y >= lo and y <= hi and world.naturally_walkable(x, y)

	func cost(x: int, y: int) -> float:
		return Tiles.move_cost[world.terrain(x, y)]


func _initialize() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/golden/paths.json"))
	var w := World.new(int(data["seed"]), int(data["gen"]), data["habitat"])
	for cy in range(-3, 4):
		for cx in range(-3, 4):
			w.request(cx, cy)
	w.finish_pending()
	var grid := RegionGrid.new()
	grid.world = w
	grid.lo = int(data["lo"])
	grid.hi = int(data["hi"])
	var span := grid.hi - grid.lo + 1

	var t_fill := Time.get_ticks_usec()
	var dense := DenseAStar.new(grid.lo, grid.lo, span, span)
	dense.fill_from(grid)
	var fill_ms := (Time.get_ticks_usec() - t_fill) / 1000.0

	var t_native_setup := Time.get_ticks_usec()
	var native := AStarGrid2D.new()
	native.region = Rect2i(grid.lo, grid.lo, span, span)
	native.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	native.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	native.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	native.update()
	for y in range(grid.lo, grid.hi + 1):
		for x in range(grid.lo, grid.hi + 1):
			var p := Vector2i(x, y)
			if grid.walkable(x, y):
				native.set_point_weight_scale(p, grid.cost(x, y))
			else:
				native.set_point_solid(p, true)
	var native_setup_ms := (Time.get_ticks_usec() - t_native_setup) / 1000.0

	# Single-tile versions of the golden searches.
	var cases: Array[Array] = []
	for p: Dictionary in data["paths"]:
		var gd: Dictionary = p["goal"]
		var target := Vector2i(-99999, 0)
		for yy in range(int(gd["y"]), int(gd["y"]) + int(gd["h"])):
			for xx in range(int(gd["x"]), int(gd["x"]) + int(gd["w"])):
				if target.x == -99999 and grid.walkable(xx, yy):
					target = Vector2i(xx, yy)
		if target.x != -99999:
			cases.append([Vector2i(int(p["sx"]), int(p["sy"])), target])

	var res := {}
	for solver: String in ["GridAStar", "DenseAStar", "AStarGrid2D"]:
		var found := 0
		var nodes := 0
		var costs: Array[float] = []
		var t0 := Time.get_ticks_usec()
		for c in cases:
			var s: Vector2i = c[0]
			var t: Vector2i = c[1]
			var steps := PackedInt32Array()
			var ok := false
			match solver:
				"GridAStar":
					var r := GridAStar.find_path(grid, s.x, s.y, GridAStar.Goal.new(t.x, t.y), 100000)
					ok = r.found
					steps = r.steps
					nodes += r.expanded
				"DenseAStar":
					var r := dense.find_path(s.x, s.y, GridAStar.Goal.new(t.x, t.y), 100000)
					ok = r.found
					steps = r.steps
					nodes += r.expanded
				"AStarGrid2D":
					var path := native.get_id_path(s, t)
					ok = path.size() > 0
					for i in range(1, path.size()):
						steps.append(path[i].x)
						steps.append(path[i].y)
			if ok:
				found += 1
			costs.append(_path_cost(grid, s, steps) if ok else -1.0)
		var ms := (Time.get_ticks_usec() - t0) / 1000.0
		res[solver] = costs
		print("%-12s %3d searches, %3d found, %8.1f ms total, %7.3f ms per search%s" % [solver, cases.size(), found, ms, ms / cases.size(),
			("" if nodes == 0 else ", %.2f µs per node" % (ms * 1000.0 / nodes))])
	var agree := 0
	for i in cases.size():
		if absf(res["DenseAStar"][i] - res["AStarGrid2D"][i]) < 1e-6:
			agree += 1
	print("Path costs equal (DenseAStar vs AStarGrid2D): %d of %d" % [agree, cases.size()])
	print("Setup: dense window fill %.1f ms; AStarGrid2D region setup %.1f ms (%dx%d cells)" % [fill_ms, native_setup_ms, span, span])
	quit()


## Cost of a path under the game's rules (1 or √2 per step times the entered tile's cost).
func _path_cost(grid: PathGrid, start: Vector2i, steps: PackedInt32Array) -> float:
	var total := 0.0
	var px := start.x
	var py := start.y
	for i in range(0, steps.size(), 2):
		var x := steps[i]
		var y := steps[i + 1]
		total += (1.0 if (x == px or y == py) else sqrt(2.0)) * grid.cost(x, y)
		px = x
		py = y
	return total
