extends TestCase
## GridAStar must reproduce the browser game's searches exactly (tests/golden/paths.json: 80
## searches over real terrain, with rectangle and adjacent goals, node caps and partial paths).


## Terrain-only grid over a fixed square of a world, like the golden export.
class RegionGrid:
	extends PathGrid
	var world: World
	var lo: int
	var hi: int

	func walkable(x: int, y: int) -> bool:
		return x >= lo and x <= hi and y >= lo and y <= hi and world.naturally_walkable(x, y)

	func cost(x: int, y: int) -> float:
		return Tiles.move_cost[world.terrain(x, y)]


static var _grid: RegionGrid
static var _data: Dictionary


func _setup() -> bool:
	if _grid != null:
		return true
	_data = load_json("res://tests/golden/paths.json")
	if _data == null:
		return false
	var w := World.new(int(_data["seed"]), int(_data["gen"]), _data["habitat"])
	for cy in range(-3, 4):
		for cx in range(-3, 4):
			w.request(cx, cy)
	w.finish_pending()
	_grid = RegionGrid.new()
	_grid.world = w
	_grid.lo = int(_data["lo"])
	_grid.hi = int(_data["hi"])
	return true


func test_golden_searches_match_step_for_step() -> void:
	if not _setup():
		return
	var i := 0
	var total_nodes := 0
	var t0 := Time.get_ticks_usec()
	for p: Dictionary in _data["paths"]:
		var gd: Dictionary = p["goal"]
		var goal := GridAStar.Goal.new(int(gd["x"]), int(gd["y"]), int(gd["w"]), int(gd["h"]), bool(gd["adjacent"]))
		var r := GridAStar.find_path(_grid, int(p["sx"]), int(p["sy"]), goal, int(p["maxNodes"]), bool(p["partial"]))
		var where := "search %d from %d,%d" % [i, int(p["sx"]), int(p["sy"])]
		check_eq(r.expanded, int(p["expanded"]), where + " nodes expanded")
		if p["steps"] == null:
			check(not r.found, where + " should find no path")
		else:
			var expected := PackedInt32Array(p["steps"] as Array)
			check(r.found, where + " should find a path")
			check_eq(r.steps, expected, where + " steps")
		total_nodes += r.expanded
		i += 1
	var ms := (Time.get_ticks_usec() - t0) / 1000.0
	print("    80 golden searches: %d nodes in %.0f ms (%.2f µs per node)" % [total_nodes, ms, ms * 1000.0 / maxi(1, total_nodes)])


func test_blocked_and_unloaded_land() -> void:
	var w := World.new(7)
	w.ensure(0, 0)
	var grid := RegionGrid.new()
	grid.world = w
	grid.lo = -1000
	grid.hi = 1000
	# A goal in a chunk that is not loaded is unknown, not walkable: no path, and no generation.
	var r := GridAStar.find_path(grid, 0, 0, GridAStar.Goal.new(100, 100), 4000)
	check(not r.found, "no path into unloaded land")
	check_eq(w.loaded_count(), 1, "searching generated no chunks")
	# Partial paths still go as close as the known land allows.
	var p := GridAStar.find_path(grid, 0, 0, GridAStar.Goal.new(100, 100), 4000, true)
	check(p.found and p.step_count() > 0, "partial path toward unloaded land")
	var last := Vector2i(p.steps[p.steps.size() - 2], p.steps[p.steps.size() - 1])
	check(last.x < 32 and last.y < 32, "partial path ends inside the loaded chunk: %s" % last)
	# The start already satisfies the goal: found, no steps.
	var here := GridAStar.find_path(grid, 0, 0, GridAStar.Goal.new(0, 0))
	check(here.found and here.step_count() == 0, "already there")


func test_dense_window_matches_golden_searches() -> void:
	if not _setup():
		return
	var span := _grid.hi - _grid.lo + 1
	var dense := DenseAStar.new(_grid.lo, _grid.lo, span, span)
	dense.fill_from(_grid)
	var i := 0
	var total_nodes := 0
	var t0 := Time.get_ticks_usec()
	for p: Dictionary in _data["paths"]:
		var gd: Dictionary = p["goal"]
		var goal := GridAStar.Goal.new(int(gd["x"]), int(gd["y"]), int(gd["w"]), int(gd["h"]), bool(gd["adjacent"]))
		var r := dense.find_path(int(p["sx"]), int(p["sy"]), goal, int(p["maxNodes"]), bool(p["partial"]))
		var where := "dense search %d" % i
		check_eq(r.expanded, int(p["expanded"]), where + " nodes expanded")
		if p["steps"] == null:
			check(not r.found, where + " should find no path")
		else:
			check_eq(r.steps, PackedInt32Array(p["steps"] as Array), where + " steps")
		total_nodes += r.expanded
		i += 1
	var ms := (Time.get_ticks_usec() - t0) / 1000.0
	print("    dense window: %d nodes in %.0f ms (%.2f µs per node)" % [total_nodes, ms, ms * 1000.0 / maxi(1, total_nodes)])


## Checks a path obeys the movement rules: 8-way single steps, walkable, no corner cutting,
## ending where the goal is satisfied.
func _valid_path(grid: PathGrid, sx: int, sy: int, goal: GridAStar.Goal, steps: PackedInt32Array, where: String) -> bool:
	var px := sx
	var py := sy
	for i in range(0, steps.size(), 2):
		var x := steps[i]
		var y := steps[i + 1]
		if absi(x - px) > 1 or absi(y - py) > 1 or (x == px and y == py):
			return check(false, "%s: step %d is not a single move (%d,%d -> %d,%d)" % [where, i / 2, px, py, x, y])
		if not grid.walkable(x, y):
			return check(false, "%s: step %d onto a blocked tile %d,%d" % [where, i / 2, x, y])
		if x != px and y != py and (not grid.walkable(x, py) or not grid.walkable(px, y)):
			return check(false, "%s: step %d cuts a corner at %d,%d" % [where, i / 2, x, y])
		px = x
		py = y
	return check(goal.satisfied(px, py), "%s: ends at %d,%d, which does not satisfy the goal" % [where, px, py])


func test_nav_window_paths_are_valid_and_optimal() -> void:
	if not _setup():
		return
	var span := _grid.hi - _grid.lo + 1
	var dense := DenseAStar.new(_grid.lo, _grid.lo, span, span)
	dense.fill_from(_grid)
	var nav := NavWindow.new(Rect2i(_grid.lo, _grid.lo, span, span))
	nav.fill_from(_grid)
	var i := 0
	var equal := 0
	var reachable := 0
	for p: Dictionary in _data["paths"]:
		var gd: Dictionary = p["goal"]
		var goal := GridAStar.Goal.new(int(gd["x"]), int(gd["y"]), int(gd["w"]), int(gd["h"]), bool(gd["adjacent"]))
		var sx := int(p["sx"])
		var sy := int(p["sy"])
		# The exact search without a node cap tells us the true answer.
		var ref := dense.find_path(sx, sy, goal, 1 << 30)
		var got := nav.find_path(sx, sy, goal)
		var where := "nav search %d" % i
		check_eq(got.found, ref.found, where + " reachability")
		if ref.found and got.found:
			reachable += 1
			_valid_path(_grid, sx, sy, goal, got.steps, where)
			var rc := _steps_cost(sx, sy, ref.steps)
			var gc := _steps_cost(sx, sy, got.steps)
			check(gc <= rc + 1e-9 or gc - rc < 0.05 * rc, "%s: cost %.3f vs optimal %.3f" % [where, gc, rc])
			if absf(gc - rc) < 1e-9:
				equal += 1
		i += 1
	print("    nav window: %d reachable searches, %d with exactly the optimal cost" % [reachable, equal])


func test_nav_window_replans_around_new_obstacles() -> void:
	var w := World.new(7)
	for cy in range(-1, 1):
		for cx in range(-1, 1):
			w.ensure(cx, cy)
	var grid := RegionGrid.new()
	grid.world = w
	grid.lo = -32
	grid.hi = 31
	var nav := NavWindow.new(Rect2i(-32, -32, 64, 64))
	nav.fill_from(grid)
	var goal := GridAStar.Goal.new(20, 0)
	var first := nav.find_path(-20, 0, goal)
	if not check(first.found, "a path across the clearing"):
		return
	# Block the middle of the first path, as a new building would.
	var mid := first.step_count() / 2
	var bx := first.steps[mid * 2]
	var by := first.steps[mid * 2 + 1]
	nav.set_tile(bx, by, false, 1.0)
	var second := nav.find_path(-20, 0, goal)
	check(second.found, "still reachable around one blocked tile")
	for j in second.step_count():
		check(not (second.steps[j * 2] == bx and second.steps[j * 2 + 1] == by), "the new path avoids the blocked tile")
	# Wall off the goal completely: no path, and a partial path still makes progress.
	for y in range(-2, 3):
		for x in range(18, 23):
			if not (x == 20 and y == 0):
				nav.set_tile(x, y, false, 1.0)
	check(not nav.find_path(-20, 0, goal).found, "a walled-in goal is unreachable")
	var part := nav.find_path(-20, 0, goal, true)
	check(part.found and part.step_count() > 10, "a partial path heads toward the walled-in goal")


func _steps_cost(sx: int, sy: int, steps: PackedInt32Array) -> float:
	var total := 0.0
	var px := sx
	var py := sy
	for i in range(0, steps.size(), 2):
		var x := steps[i]
		var y := steps[i + 1]
		total += (1.0 if x == px or y == py else GridAStar.SQRT2) * _grid.cost(x, y)
		px = x
		py = y
	return total
