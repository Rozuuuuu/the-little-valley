class_name TileSetIndex
extends RefCounted
## A set of tiles bucketed by 8×8 cells, for "nearest marked tile" queries that don't scan the whole
## set. Used for harvest marks: in the 100-settler benchmark, scanning every mark on every gather
## decision cost 4.6 ms per decision (docs/godot/BASELINE.md, "Simulation in GDScript").
##
## Order: `keys()` returns tiles in insertion order (saves and the UI see the same order as before).
## Nearest queries visit chunks in rings around the query point and stop once no closer tile can
## exist, so the answer is a nearest tile; among tiles at exactly equal distance the choice may
## differ from a full scan.

## Bucket size: 8×8 tiles, so a nearest query near a dense patch of marks only scores the marks
## in the few cells around it.
const CELL_SHIFT := 3
const CELL := 1 << CELL_SHIFT

var _all := {}
var _buckets := {}


static func _bucket_key(tile_key: int) -> int:
	return Simulation.tile_key(Simulation.key_x(tile_key) >> CELL_SHIFT, Simulation.key_y(tile_key) >> CELL_SHIFT)


func add(tile_key: int) -> bool:
	if _all.has(tile_key):
		return false
	_all[tile_key] = true
	var bk := _bucket_key(tile_key)
	var bucket: Dictionary = _buckets.get(bk, {})
	if bucket.is_empty():
		_buckets[bk] = bucket
	bucket[tile_key] = true
	return true


func erase(tile_key: int) -> bool:
	if not _all.erase(tile_key):
		return false
	var bk := _bucket_key(tile_key)
	var bucket: Dictionary = _buckets.get(bk, {})
	bucket.erase(tile_key)
	if bucket.is_empty():
		_buckets.erase(bk)
	return true


func has(tile_key: int) -> bool:
	return _all.has(tile_key)


func size() -> int:
	return _all.size()


func keys() -> Array:
	return _all.keys()


func clear() -> void:
	_all.clear()
	_buckets.clear()


## The tile minimising `score(tile_key) -> float` (INF to skip a tile), searching chunks outward
## from (x, y), cell ring by cell ring. `score` must never be less than the straight-line distance from (x, y) to the
## tile's centre, which lets the search stop early. With `bounds` (in tiles), cells outside it are
## skipped. Returns -1 if no tile qualifies.
func nearest(x: float, y: float, score: Callable, bounds: Rect2i = Rect2i()) -> int:
	if _all.is_empty():
		return -1
	var cx := floori(x) >> CELL_SHIFT
	var cy := floori(y) >> CELL_SHIFT
	# Cells to consider: those with tiles, limited to `bounds` (tiles) when it is given.
	var bounded := bounds.has_area()
	var bx0 := bounds.position.x >> CELL_SHIFT
	var by0 := bounds.position.y >> CELL_SHIFT
	var bx1 := (bounds.end.x - 1) >> CELL_SHIFT
	var by1 := (bounds.end.y - 1) >> CELL_SHIFT
	# The farthest ring (in cells, Chebyshev) worth visiting.
	var max_ring := 0
	if bounded:
		max_ring = maxi(maxi(absi(bx0 - cx), absi(bx1 - cx)), maxi(absi(by0 - cy), absi(by1 - cy)))
	else:
		for bk: int in _buckets:
			max_ring = maxi(max_ring, maxi(absi(Simulation.key_x(bk) - cx), absi(Simulation.key_y(bk) - cy)))
	var best := -1
	var best_score := INF
	for ring in max_ring + 1:
		# Every tile in this ring is at least (ring - 1) cells away.
		if ring > 0 and (ring - 1) * CELL >= best_score:
			break
		for dy in range(-ring, ring + 1):
			var gy := cy + dy
			if bounded and (gy < by0 or gy > by1):
				continue
			for dx in range(-ring, ring + 1):
				if maxi(absi(dx), absi(dy)) != ring:
					continue
				var gx := cx + dx
				if bounded and (gx < bx0 or gx > bx1):
					continue
				var bucket: Dictionary = _buckets.get(Simulation.tile_key(gx, gy), {})
				for k: int in bucket.keys():
					var sc: float = score.call(k)
					if sc < best_score:
						best_score = sc
						best = k
	return best
