class_name GridAStar
## Bounded A* over the tile grid: a faithful port of `src/game/sim/pathfinding.ts`.
##
## 8-way movement without corner cutting, road discounts through `PathGrid.cost`, rectangle goals
## (stand on it, or next to it), a node cap so one unreachable target can't stall a tick, and
## optional partial paths for move orders. Expansion order, tie-breaking and costs are identical
## to the browser game; tests/test_path.gd checks 80 recorded searches step by step.

## Diagonal step cost. `sqrt(2.0)` is correctly rounded, so it equals JavaScript's Math.SQRT2.
static var SQRT2 := sqrt(2.0)
## Running totals for profiling (never reset by the game).
static var total_calls := 0
static var total_expanded := 0

const _DX: Array[int] = [1, -1, 0, 0, 1, 1, -1, -1]
const _DY: Array[int] = [0, 0, 1, -1, 1, -1, 1, -1]


## A rectangle to reach: standing on it, or (adjacent) standing next to it but not on it.
class Goal:
	var x: int
	var y: int
	var w: int
	var h: int
	var adjacent: bool

	func _init(gx: int, gy: int, gw: int = 1, gh: int = 1, adj: bool = false) -> void:
		x = gx
		y = gy
		w = gw
		h = gh
		adjacent = adj

	func satisfied(px: int, py: int) -> bool:
		var inside := px >= x and px < x + w and py >= y and py < y + h
		if not adjacent:
			return inside
		if inside:
			return false
		return px >= x - 1 and px <= x + w and py >= y - 1 and py <= y + h

	## Octile distance to the rectangle, scaled below 1 because roads make some steps cheaper.
	func heuristic(px: int, py: int) -> float:
		var dx := x - px if px < x else (px - (x + w - 1) if px >= x + w else 0)
		var dy := y - py if py < y else (py - (y + h - 1) if py >= y + h else 0)
		var lo := mini(dx, dy)
		var hi := maxi(dx, dy)
		return (hi - lo + lo * GridAStar.SQRT2) * 0.85


## The outcome of one search.
class Result:
	## A path was found (or the start already satisfies the goal, with no steps).
	var found := false
	## Steps to take, excluding the start: x0, y0, x1, y1, ...
	var steps := PackedInt32Array()
	## Nodes expanded (what the per-tick budget is charged).
	var expanded := 0

	func step_count() -> int:
		return steps.size() / 2


static func _key(x: int, y: int) -> int:
	return (x + 1048576) * 2097152 + (y + 1048576)


## Searches from (sx, sy) to `goal`. With `partial`, an unreachable goal yields a path to the
## closest tile reached instead of no path.
static func find_path(grid: PathGrid, sx: int, sy: int, goal: Goal, max_nodes: int = 4000, partial: bool = false) -> Result:
	var result := Result.new()
	if goal.satisfied(sx, sy):
		result.found = true
		return result
	total_calls += 1
	var xs := PackedInt32Array()
	var ys := PackedInt32Array()
	var g := PackedFloat64Array()
	var f := PackedFloat64Array()
	var parent := PackedInt32Array()
	var closed := PackedByteArray()
	var index := {}
	var heap := PackedInt32Array()

	# Node 0: the start.
	xs.append(sx)
	ys.append(sy)
	g.append(0.0)
	f.append(goal.heuristic(sx, sy))
	parent.append(-1)
	closed.append(0)
	index[_key(sx, sy)] = 0
	_push(heap, f, 0)

	var expanded := 0
	var closest := 0
	var closest_h := goal.heuristic(sx, sy)
	while heap.size() > 0:
		var cur := _pop(heap, f)
		if closed[cur] == 1:
			continue
		closed[cur] = 1
		var cx := xs[cur]
		var cy := ys[cur]
		if goal.satisfied(cx, cy):
			result.found = true
			result.expanded = expanded
			total_expanded += expanded
			result.steps = _trace(xs, ys, parent, cur)
			return result
		var h := goal.heuristic(cx, cy)
		if h < closest_h:
			closest_h = h
			closest = cur
		expanded += 1
		if expanded > max_nodes:
			break
		for d in 8:
			var dx := _DX[d]
			var dy := _DY[d]
			var nx := cx + dx
			var ny := cy + dy
			if not grid.walkable(nx, ny):
				continue
			if dx != 0 and dy != 0 and (not grid.walkable(cx + dx, cy) or not grid.walkable(cx, cy + dy)):
				continue
			var base := 1.0 if d < 4 else SQRT2
			var ng := g[cur] + base * grid.cost(nx, ny)
			var k := _key(nx, ny)
			var existing: int = index.get(k, -1)
			if existing == -1:
				var n := xs.size()
				xs.append(nx)
				ys.append(ny)
				g.append(ng)
				f.append(ng + goal.heuristic(nx, ny))
				parent.append(cur)
				closed.append(0)
				index[k] = n
				_push(heap, f, n)
			elif closed[existing] == 0 and ng < g[existing]:
				g[existing] = ng
				f[existing] = ng + goal.heuristic(nx, ny)
				parent[existing] = cur
				_push(heap, f, existing)
	result.expanded = expanded
	total_expanded += expanded
	if partial and closest != 0:
		result.found = true
		result.steps = _trace(xs, ys, parent, closest)
	return result


static func _trace(xs: PackedInt32Array, ys: PackedInt32Array, parent: PackedInt32Array, last: int) -> PackedInt32Array:
	var rev := PackedInt32Array()
	var n := last
	while parent[n] != -1:
		rev.append(ys[n])
		rev.append(xs[n])
		n = parent[n]
	rev.reverse()
	return rev


# A binary min-heap of node indices ordered by f, with exactly the browser game's sift rules
# (push stops on <=, pop picks the left child on ties), so equal-cost nodes come out in the same order.

static func _push(heap: PackedInt32Array, score: PackedFloat64Array, n: int) -> void:
	heap.append(n)
	var i := heap.size() - 1
	while i > 0:
		var p := (i - 1) >> 1
		if score[heap[p]] <= score[heap[i]]:
			break
		var tmp := heap[p]
		heap[p] = heap[i]
		heap[i] = tmp
		i = p


static func _pop(heap: PackedInt32Array, score: PackedFloat64Array) -> int:
	var top := heap[0]
	var last := heap[heap.size() - 1]
	heap.resize(heap.size() - 1)
	var size := heap.size()
	if size > 0:
		heap[0] = last
		var i := 0
		while true:
			var l := i * 2 + 1
			var r := l + 1
			var m := i
			if l < size and score[heap[l]] < score[heap[m]]:
				m = l
			if r < size and score[heap[r]] < score[heap[m]]:
				m = r
			if m == i:
				break
			var tmp := heap[m]
			heap[m] = heap[i]
			heap[i] = tmp
			i = m
	return top
