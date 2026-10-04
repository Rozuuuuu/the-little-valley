class_name DenseAStar
extends RefCounted
## GridAStar's search over a fixed rectangle of tiles held in flat arrays: same expansion order,
## same costs, same results (tests/test_path.gd checks it against the golden searches), but no
## dictionaries or virtual calls in the inner loop. Tiles outside the rectangle are not walkable.
##
## Per-cell search state is reused between searches and invalidated with a generation stamp,
## so a search allocates nothing proportional to the window. Not thread-safe: one per thread.

var x0: int
var y0: int
var w: int
var h: int
## 1 = walkable, by cell index (y - y0) * w + (x - x0).
var walk := PackedByteArray()
## Movement cost multiplier for entering the cell.
var cost := PackedFloat64Array()

var _g := PackedFloat64Array()
var _f := PackedFloat64Array()
var _parent := PackedInt32Array()
## Generation the cell's g/f/parent belong to; equal to _gen means "seen in this search".
var _seen := PackedInt32Array()
var _closed := PackedInt32Array()
var _gen := 0
var _heap := PackedInt32Array()

static var SQRT2 := sqrt(2.0)


func _init(rx: int, ry: int, rw: int, rh: int) -> void:
	x0 = rx
	y0 = ry
	w = rw
	h = rh
	var n := rw * rh
	walk.resize(n)
	cost.resize(n)
	_g.resize(n)
	_f.resize(n)
	_parent.resize(n)
	_seen.resize(n)
	_closed.resize(n)


## Fills walkability and costs from a PathGrid (once per window, or when tiles change).
func fill_from(grid: PathGrid) -> void:
	for y in h:
		for x in w:
			var i := y * w + x
			var ok := grid.walkable(x0 + x, y0 + y)
			walk[i] = 1 if ok else 0
			cost[i] = grid.cost(x0 + x, y0 + y) if ok else 1.0


## Same contract as GridAStar.find_path.
func find_path(sx: int, sy: int, goal: GridAStar.Goal, max_nodes: int = 4000, partial: bool = false) -> GridAStar.Result:
	var result := GridAStar.Result.new()
	var gx := goal.x
	var gy := goal.y
	var gx2 := goal.x + goal.w
	var gy2 := goal.y + goal.h
	var adj := goal.adjacent
	if goal.satisfied(sx, sy):
		result.found = true
		return result
	_gen += 1
	var gen := _gen
	_heap.resize(0)
	var start := (sy - y0) * w + (sx - x0)
	var hs := goal.heuristic(sx, sy)
	_g[start] = 0.0
	_f[start] = hs
	_parent[start] = -1
	_seen[start] = gen
	_heap_push(start)
	var expanded := 0
	var closest := start
	var closest_h := hs
	while _heap.size() > 0:
		var cur := _heap_pop()
		if _closed[cur] == gen:
			continue
		_closed[cur] = gen
		var cx := cur % w + x0
		var cy := cur / w + y0
		# goal.satisfied, inlined.
		var inside := cx >= gx and cx < gx2 and cy >= gy and cy < gy2
		var done := inside if not adj else (not inside and cx >= gx - 1 and cx <= gx2 and cy >= gy - 1 and cy <= gy2)
		if done:
			result.found = true
			result.expanded = expanded
			GridAStar.total_expanded += expanded
			result.steps = _trace(cur)
			return result
		var hh := _heur(gx, gy, gx2, gy2, cx, cy)
		if hh < closest_h:
			closest_h = hh
			closest = cur
		expanded += 1
		if expanded > max_nodes:
			break
		var lx := cx - x0
		var ly := cy - y0
		for d in 8:
			var dx: int = GridAStar._DX[d]
			var dy: int = GridAStar._DY[d]
			var nlx := lx + dx
			var nly := ly + dy
			if nlx < 0 or nly < 0 or nlx >= w or nly >= h:
				continue
			var ni := nly * w + nlx
			if walk[ni] == 0:
				continue
			if d >= 4:
				# No corner cutting: both orthogonal neighbours must be walkable (and inside).
				var ax := lx + dx
				var by := ly + dy
				if ax < 0 or ax >= w or by < 0 or by >= h or walk[ly * w + ax] == 0 or walk[by * w + lx] == 0:
					continue
			var ng := _g[cur] + (1.0 if d < 4 else SQRT2) * cost[ni]
			if _seen[ni] != gen:
				_seen[ni] = gen
				_g[ni] = ng
				_f[ni] = ng + _heur(gx, gy, gx2, gy2, nlx + x0, nly + y0)
				_parent[ni] = cur
				_heap_push(ni)
			elif _closed[ni] != gen and ng < _g[ni]:
				_g[ni] = ng
				_f[ni] = ng + _heur(gx, gy, gx2, gy2, nlx + x0, nly + y0)
				_parent[ni] = cur
				_heap_push(ni)
	result.expanded = expanded
	GridAStar.total_expanded += expanded
	if partial and closest != start:
		result.found = true
		result.steps = _trace(closest)
	return result


static func _heur(gx: int, gy: int, gx2: int, gy2: int, px: int, py: int) -> float:
	var dx := gx - px if px < gx else (px - (gx2 - 1) if px >= gx2 else 0)
	var dy := gy - py if py < gy else (py - (gy2 - 1) if py >= gy2 else 0)
	var lo := mini(dx, dy)
	return (maxi(dx, dy) - lo + lo * SQRT2) * 0.85


func _trace(last: int) -> PackedInt32Array:
	var rev := PackedInt32Array()
	var n := last
	while _parent[n] != -1:
		rev.append(n / w + y0)
		rev.append(n % w + x0)
		n = _parent[n]
	rev.reverse()
	return rev


# The same heap rules as GridAStar (push stops on <=, pop prefers the left child on ties).
# Ties are broken by insertion order, which differs from GridAStar only in node numbering, not
# in which cell is pushed when, so the pop order is identical.

func _heap_push(n: int) -> void:
	_heap.append(n)
	var i := _heap.size() - 1
	while i > 0:
		var p := (i - 1) >> 1
		if _f[_heap[p]] <= _f[_heap[i]]:
			break
		var tmp := _heap[p]
		_heap[p] = _heap[i]
		_heap[i] = tmp
		i = p


func _heap_pop() -> int:
	var top := _heap[0]
	var last := _heap[_heap.size() - 1]
	_heap.resize(_heap.size() - 1)
	var size := _heap.size()
	if size > 0:
		_heap[0] = last
		var i := 0
		while true:
			var l := i * 2 + 1
			var r := l + 1
			var m := i
			if l < size and _f[_heap[l]] < _f[_heap[m]]:
				m = l
			if r < size and _f[_heap[r]] < _f[_heap[m]]:
				m = r
			if m == i:
				break
			var tmp := _heap[m]
			_heap[m] = _heap[i]
			_heap[i] = tmp
			i = m
	return top
