class_name NavWindow
extends RefCounted
## Local pathfinding over a rectangle of tiles, using Godot's native AStarGrid2D.
##
## Why native: on the golden corpus, AStarGrid2D answered single-tile searches in 0.75 ms on
## average against 39.7 ms for the fastest GDScript A* (DenseAStar), and every path had exactly
## the same cost (63 of 63). See docs/godot/BASELINE.md, "Pathfinding".
##
## What it adds on top of AStarGrid2D, to keep the browser game's rules:
## - **Rectangle goals** (stand on a building's footprint, or next to it): AStarGrid2D takes one
##   target tile, so the goal's tiles are tried nearest first (by octile distance) and the
##   cheapest path among the first CANDIDATES reachable ones wins.
## - **Partial paths** for move orders (AStarGrid2D's allow_partial_path).
## - **No corner cutting** (DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES) and per-tile costs (weight scale).
## Tiles outside the window are not walkable, like unloaded land.
##
## Costs to keep in mind (measured): about 90 bytes per tile (a 512×512 window is 22.5 MB), and a
## search for an unreachable target explores everything reachable (55 ms over half of 512×512).
## So windows stay small (around a settlement), and callers keep unreachable notes.

## Goal tiles tried per search (nearest first).
const CANDIDATES := 4

var rect: Rect2i
var _astar := AStarGrid2D.new()


func _init(window: Rect2i) -> void:
	rect = window
	_astar.region = window
	_astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_astar.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_astar.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_astar.update()


## Sets every tile from a PathGrid (after creating or moving the window).
func fill_from(grid: PathGrid) -> void:
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			set_tile(x, y, grid.walkable(x, y), grid.cost(x, y))


## Updates one tile (a building placed, a tree cut, a road laid).
func set_tile(x: int, y: int, walkable: bool, cost: float) -> void:
	var p := Vector2i(x, y)
	if not rect.has_point(p):
		return
	_astar.set_point_solid(p, not walkable)
	if walkable:
		_astar.set_point_weight_scale(p, cost)


func walkable(x: int, y: int) -> bool:
	var p := Vector2i(x, y)
	return rect.has_point(p) and not _astar.is_point_solid(p)


## Same contract as GridAStar.find_path (expanded is not reported: native searches are not
## counted in nodes; callers budget them by time).
func find_path(sx: int, sy: int, goal: GridAStar.Goal, partial: bool = false) -> GridAStar.Result:
	var result := GridAStar.Result.new()
	if goal.satisfied(sx, sy):
		result.found = true
		return result
	var start := Vector2i(sx, sy)
	if not walkable(sx, sy):
		return result
	var best := PackedVector2Array()
	var best_cost := INF
	var tried := 0
	for t in _goal_tiles(goal, start):
		var path := _astar.get_id_path(start, t)
		if path.is_empty():
			continue
		var c := _cost(path)
		if c < best_cost:
			best_cost = c
			best = _to_steps(path)
		tried += 1
		if tried >= CANDIDATES:
			break
	if best_cost < INF:
		result.found = true
		result.steps = _flat(best)
		return result
	if partial:
		# Head for the goal tile nearest the start; AStarGrid2D stops at the closest reachable tile.
		var tiles := _goal_tiles(goal, start, true)
		if not tiles.is_empty():
			var path := _astar.get_id_path(start, tiles[0], true)
			if path.size() > 1:
				result.found = true
				result.steps = _flat(_to_steps(path))
	return result


## The goal's standing tiles inside the window, nearest to `from` first. Walkable ones only,
## unless `any` (partial searches may aim at a solid tile).
func _goal_tiles(goal: GridAStar.Goal, from: Vector2i, any: bool = false) -> Array[Vector2i]:
	var tiles: Array[Vector2i] = []
	var x0 := goal.x - 1 if goal.adjacent else goal.x
	var y0 := goal.y - 1 if goal.adjacent else goal.y
	var x1 := goal.x + goal.w if goal.adjacent else goal.x + goal.w - 1
	var y1 := goal.y + goal.h if goal.adjacent else goal.y + goal.h - 1
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if goal.satisfied(x, y) and rect.has_point(Vector2i(x, y)) and (any or walkable(x, y)):
				tiles.append(Vector2i(x, y))
	tiles.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var da := _octile(a, from)
		var db := _octile(b, from)
		return da < db or (da == db and (a.y < b.y or (a.y == b.y and a.x < b.x))))
	return tiles


static func _octile(a: Vector2i, b: Vector2i) -> float:
	var dx := absi(a.x - b.x)
	var dy := absi(a.y - b.y)
	return maxi(dx, dy) - mini(dx, dy) + mini(dx, dy) * GridAStar.SQRT2


## Path cost under the game's rules: 1 or √2 per step times the entered tile's cost.
func _cost(path: Array[Vector2i]) -> float:
	var total := 0.0
	for i in range(1, path.size()):
		var a := path[i - 1]
		var b := path[i]
		total += (1.0 if a.x == b.x or a.y == b.y else GridAStar.SQRT2) * _astar.get_point_weight_scale(b)
	return total


func _to_steps(path: Array[Vector2i]) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in range(1, path.size()):
		out.append(path[i])
	return out


func _flat(steps: PackedVector2Array) -> PackedInt32Array:
	var out := PackedInt32Array()
	for p in steps:
		out.append(int(p.x))
		out.append(int(p.y))
	return out
