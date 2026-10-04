class_name World
extends RefCounted
## The infinite tile world, streamed in 32×32 chunks.
##
## Differences from the browser game's `World` (see docs/godot/BASELINE.md for why):
## - **Queries never generate.** `terrain`, `obj`, `walkable` and friends answer UNKNOWN or false
##   for tiles whose chunk is not loaded. Pathfinding and work finders can no longer create land
##   as a side effect (the browser game ends up with 5× more chunks in memory than explored).
## - **Generation is explicit**: `ensure` generates now (tests, loading, placing things);
##   `request` queues a chunk and `pump` generates queued chunks on worker threads (or within a
##   time budget where threads are unavailable) and installs them on the calling thread.
## - **Chunks can be unloaded.** `evict` drops unmodified chunks outside the working set. Their
##   exploration is kept as a 128-byte bitset, so nothing the player saw is forgotten, and the
##   terrain regenerates bit-for-bit on the next `ensure`/`request`. Modified chunks hold
##   authoritative data and stay loaded.
##
## Chunk keys and the explored bitset layout (lowest bit first) match the browser game's saves.

const UNKNOWN := 255
const BITSET_BYTES := Chunk.AREA / 8

var seed_value: int
var gen: int
var habitat_id: String
## Generate on WorkerThreadPool threads. Off where the platform has no threads.
var threaded: bool
## At most this many chunks generating at once on worker threads.
var max_in_flight := 2

## Loaded chunks by key.
var _chunks := {}
## Exploration of chunks that are not loaded, by key (PackedByteArray bitsets).
var _explored_unloaded := {}
## Queued chunk keys, oldest first, and their queue membership.
var _queue: Array[int] = []
var _queued := {}
## Worker tasks in flight: key -> WorkerThreadPool task id.
var _in_flight := {}
## Finished worker results waiting to be installed: key -> Chunk. Guarded by _mutex.
var _done := {}
var _mutex := Mutex.new()
## The chunk being generated a few rows at a time (single-threaded builds).
var _job: WorldGen.ChunkJob = null
var _job_key := -1

## Called with (x, y) after a tile's terrain or object changes, and with a chunk after it is
## installed (generated or restored), so navigation can refresh. Set by the simulation.
var on_tile_changed: Callable
var on_chunk_installed: Callable
## Called with (x, y) after a tile's object or amount changes, and with a chunk before it is
## unloaded. Set by the simulation to keep its resource index current.
var on_object_changed: Callable
var on_chunk_evicted: Callable

## Counters for tests, benchmarks and the debug overlay.
var generated_count := 0
var evicted_count := 0


func _init(world_seed: int, generator: int = WorldGen.CURRENT_GEN, habitat: String = "valley") -> void:
	assert(generator in WorldGen.SUPPORTED_GENS, "Unsupported world generator %d" % generator)
	seed_value = world_seed
	gen = generator
	habitat_id = habitat
	threaded = OS.get_processor_count() > 1 and not OS.has_feature("nothreads")
	# Shared tables are filled here, on the owning thread, so worker threads only ever read them.
	Tiles.ensure_loaded()
	HabitatDef.of(habitat)


static func key(cx: int, cy: int) -> int:
	return (cx + 32768) * 65536 + (cy + 32768)


static func key_cx(k: int) -> int:
	return k / 65536 - 32768


static func key_cy(k: int) -> int:
	return k % 65536 - 32768


static func chunk_of(t: int) -> int:
	return t >> Chunk.SHIFT


static func index_in_chunk(x: int, y: int) -> int:
	return (y & Chunk.MASK) * Chunk.SIZE + (x & Chunk.MASK)


# ---- loading ---------------------------------------------------------------------------------

## The chunk if it is loaded, else null. Never generates.
func peek(cx: int, cy: int) -> Chunk:
	return _chunks.get(key(cx, cy))


func is_loaded(cx: int, cy: int) -> bool:
	return _chunks.has(key(cx, cy))


func loaded_count() -> int:
	return _chunks.size()


func loaded_keys() -> Array:
	return _chunks.keys()


## Generates the chunk now if it is not loaded (waiting for its worker task if one is running).
func ensure(cx: int, cy: int) -> Chunk:
	var k := key(cx, cy)
	var c: Chunk = _chunks.get(k)
	if c != null:
		return c
	if _in_flight.has(k) and _collect(k):
		return _chunks[k]
	if _job != null and _job_key == k:
		# Finish the chunk already part-way through.
		while not _job.step(1 << 30):
			pass
		c = _job.chunk
		_job = null
	else:
		c = WorldGen.generate_chunk(seed_value, cx, cy, gen, habitat_id)
	_install(k, c)
	return c


## Queues a chunk for generation by `pump`. Does nothing if it is loaded or already on its way.
func request(cx: int, cy: int) -> void:
	var k := key(cx, cy)
	if _chunks.has(k) or _queued.has(k) or _in_flight.has(k):
		return
	_queue.append(k)
	_queued[k] = true


func pending_count() -> int:
	return _queue.size() + _in_flight.size() + (1 if _job != null else 0)


## Installs finished chunks and starts or runs queued generation. Call once per frame.
## Without threads, generates queued chunks until `budget_usec` is spent (at least one).
## Returns how many chunks were installed.
func pump(budget_usec: int = 4000) -> int:
	var installed := 0
	if threaded:
		for k: int in _in_flight.keys():
			if WorkerThreadPool.is_task_completed(_in_flight[k]) and _collect(k):
				installed += 1
		while _in_flight.size() < max_in_flight and not _queue.is_empty():
			var k: int = _queue.pop_front()
			_queued.erase(k)
			_in_flight[k] = WorkerThreadPool.add_task(_generate_task.bind(k), false, "Little Valley chunk")
	else:
		# No threads (the single-threaded web build): generate a few rows per frame, resuming the
		# same chunk next frame, so no frame waits for a whole chunk.
		var t0 := Time.get_ticks_usec()
		while true:
			if _job == null:
				if _queue.is_empty():
					break
				var k: int = _queue.pop_front()
				_queued.erase(k)
				if _chunks.has(k):
					continue
				_job_key = k
				_job = WorldGen.ChunkJob.new(seed_value, key_cx(k), key_cy(k), gen, habitat_id)
			var left := budget_usec - (Time.get_ticks_usec() - t0)
			if _job.step(maxi(1, left)):
				if not _chunks.has(_job_key):
					_install(_job_key, _job.chunk)
					installed += 1
				_job = null
			if Time.get_ticks_usec() - t0 >= budget_usec:
				break
	return installed


## Waits for every queued and running chunk (tests, loading screens).
func finish_pending() -> void:
	var was := max_in_flight
	max_in_flight = maxi(was, 64)
	while pending_count() > 0:
		pump(1 << 30)
		for k: int in _in_flight.keys():
			_collect(k)
	max_in_flight = was


## Waits for one worker task, forgets its id (Godot frees it after the wait) and installs its
## chunk. Returns true if a chunk was installed. The only place a task id is waited on.
func _collect(k: int) -> bool:
	WorkerThreadPool.wait_for_task_completion(_in_flight[k])
	_in_flight.erase(k)
	_mutex.lock()
	var c: Chunk = _done.get(k)
	_done.erase(k)
	_mutex.unlock()
	if c == null or _chunks.has(k):
		return false
	_install(k, c)
	return true


func _generate_task(k: int) -> void:
	var c := WorldGen.generate_chunk(seed_value, key_cx(k), key_cy(k), gen, habitat_id)
	_mutex.lock()
	_done[k] = c
	_mutex.unlock()


func _install(k: int, c: Chunk) -> void:
	var bits: PackedByteArray = _explored_unloaded.get(k, PackedByteArray())
	if not bits.is_empty():
		c.explored_count = unpack_bits(bits, c.explored)
		c.fog_version += 1
		_explored_unloaded.erase(k)
	_chunks[k] = c
	generated_count += 1
	if on_chunk_installed.is_valid():
		on_chunk_installed.call(c)


## Installs a chunk restored from a save (modified terrain, objects and amounts).
func install_saved(cx: int, cy: int, terrain: PackedByteArray, obj: PackedByteArray, amt: PackedByteArray, explored_bits: PackedByteArray) -> void:
	assert(terrain.size() == Chunk.AREA and obj.size() == Chunk.AREA and amt.size() == Chunk.AREA, "Chunk %d,%d is damaged" % [cx, cy])
	var c := Chunk.new(cx, cy)
	c.terrain = terrain
	c.obj = obj
	c.amt = amt
	c.modified = true
	c.explored_count = unpack_bits(explored_bits, c.explored)
	_chunks[key(cx, cy)] = c
	if on_chunk_installed.is_valid():
		on_chunk_installed.call(c)


## Records exploration of a chunk that is not loaded (from a save, or revealed while unloaded).
func set_explored_bits(cx: int, cy: int, bits: PackedByteArray) -> void:
	var k := key(cx, cy)
	var c: Chunk = _chunks.get(k)
	if c != null:
		c.explored_count = unpack_bits(bits, c.explored)
		c.fog_version += 1
	else:
		_explored_unloaded[k] = bits


## Unloads chunks that are neither modified nor in `keep` (a Dictionary of chunk keys).
## Their exploration is kept. Returns how many were unloaded.
func evict(keep: Dictionary) -> int:
	var dropped := 0
	for k: int in _chunks.keys():
		if keep.has(k):
			continue
		var c: Chunk = _chunks[k]
		if c.modified:
			continue
		if c.explored_count > 0:
			_explored_unloaded[k] = pack_bits(c.explored)
		if on_chunk_evicted.is_valid():
			on_chunk_evicted.call(c)
		_chunks.erase(k)
		dropped += 1
	evicted_count += dropped
	return dropped


# ---- tile queries (never generate) ----------------------------------------------------------

func terrain(x: int, y: int) -> int:
	var c: Chunk = _chunks.get(key(x >> Chunk.SHIFT, y >> Chunk.SHIFT))
	return UNKNOWN if c == null else c.terrain[index_in_chunk(x, y)]


func obj(x: int, y: int) -> int:
	var c: Chunk = _chunks.get(key(x >> Chunk.SHIFT, y >> Chunk.SHIFT))
	return UNKNOWN if c == null else c.obj[index_in_chunk(x, y)]


func amount(x: int, y: int) -> int:
	var c: Chunk = _chunks.get(key(x >> Chunk.SHIFT, y >> Chunk.SHIFT))
	return 0 if c == null else c.amt[index_in_chunk(x, y)]


## Explored, whether or not the chunk is loaded.
func explored(x: int, y: int) -> bool:
	var k := key(x >> Chunk.SHIFT, y >> Chunk.SHIFT)
	var i := index_in_chunk(x, y)
	var c: Chunk = _chunks.get(k)
	if c != null:
		return c.explored[i] == 1
	var bits: PackedByteArray = _explored_unloaded.get(k, PackedByteArray())
	return not bits.is_empty() and ((bits[i >> 3] >> (i & 7)) & 1) == 1


## Terrain and object both allow walking. Unknown (unloaded) tiles are not walkable.
func naturally_walkable(x: int, y: int) -> bool:
	var c: Chunk = _chunks.get(key(x >> Chunk.SHIFT, y >> Chunk.SHIFT))
	if c == null:
		return false
	var i := index_in_chunk(x, y)
	return Tiles.walkable[c.terrain[i]] == 1 and Tiles.blocks[c.obj[i]] == 0


# ---- changes (the chunk must be loaded) ------------------------------------------------------

func _loaded_for_change(x: int, y: int) -> Chunk:
	var c: Chunk = _chunks.get(key(x >> Chunk.SHIFT, y >> Chunk.SHIFT))
	assert(c != null, "Tile %d,%d changed while its chunk is not loaded" % [x, y])
	return c


func set_terrain(x: int, y: int, t: int) -> void:
	var c := _loaded_for_change(x, y)
	c.terrain[index_in_chunk(x, y)] = t
	c.modified = true
	c.version += 1
	# Ground images blend across one tile, so neighbouring chunks near the edge repaint too.
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var n: Chunk = _chunks.get(key((x + dx) >> Chunk.SHIFT, (y + dy) >> Chunk.SHIFT))
			if n != null:
				n.terrain_version += 1
	if on_tile_changed.is_valid():
		on_tile_changed.call(x, y)


func set_obj(x: int, y: int, o: int, amt_value: int = -1) -> void:
	var c := _loaded_for_change(x, y)
	var i := index_in_chunk(x, y)
	var was_blocking := Tiles.blocks[c.obj[i]] == 1
	c.obj[i] = o
	c.amt[i] = Tiles.start_amount[o] if amt_value < 0 else amt_value
	c.modified = true
	c.version += 1
	if on_tile_changed.is_valid() and was_blocking != (Tiles.blocks[o] == 1):
		on_tile_changed.call(x, y)
	if on_object_changed.is_valid():
		on_object_changed.call(x, y)


func set_amount(x: int, y: int, value: int) -> void:
	var c := _loaded_for_change(x, y)
	c.amt[index_in_chunk(x, y)] = value
	c.modified = true
	if on_object_changed.is_valid():
		on_object_changed.call(x, y)


## Reveals a disc of tiles; returns how many were newly explored. Tiles in unloaded chunks are
## recorded in their bitset and the chunk is requested, so exploration never waits for terrain.
func reveal(cx: float, cy: float, r: float) -> int:
	var count := 0
	var r2 := r * r
	var touched := {}
	var last_k := -1
	var c: Chunk = null
	for y in range(floori(cy - r), ceili(cy + r) + 1):
		for x in range(floori(cx - r), ceili(cx + r) + 1):
			var dx := x + 0.5 - cx
			var dy := y + 0.5 - cy
			if dx * dx + dy * dy > r2:
				continue
			var k := key(x >> Chunk.SHIFT, y >> Chunk.SHIFT)
			var i := index_in_chunk(x, y)
			if k != last_k:
				last_k = k
				c = _chunks.get(k)
			if c != null:
				if c.explored[i] == 0:
					c.explored[i] = 1
					c.explored_count += 1
					touched[k] = c
					count += 1
			else:
				var bits: PackedByteArray = _explored_unloaded.get(k, PackedByteArray())
				if bits.is_empty():
					bits.resize(BITSET_BYTES)
				if ((bits[i >> 3] >> (i & 7)) & 1) == 0:
					bits[i >> 3] |= 1 << (i & 7)
					count += 1
				_explored_unloaded[k] = bits
				request(x >> Chunk.SHIFT, y >> Chunk.SHIFT)
	for k: int in touched:
		var tc: Chunk = touched[k]
		tc.fog_version += 1
		# Neighbours sample our edge when drawing soft fog, so they refresh too.
		for ny in range(-1, 2):
			for nx in range(-1, 2):
				var n: Chunk = _chunks.get(key(tc.cx + nx, tc.cy + ny))
				if n != null and n != tc:
					n.fog_version += 1
	return count


## Explored chunks (loaded or not), for saving and statistics.
func explored_chunk_keys() -> Array[int]:
	var out: Array[int] = []
	for k: int in _chunks:
		var c: Chunk = _chunks[k]
		if c.explored_count > 0:
			out.append(k)
	for k: int in _explored_unloaded:
		out.append(k)
	return out


## Explored tiles in the whole world, loaded or not.
func explored_tile_count() -> int:
	var n := 0
	for c: Chunk in _chunks.values():
		n += c.explored_count
	for bits: PackedByteArray in _explored_unloaded.values():
		for byte in bits:
			while byte != 0:
				n += byte & 1
				byte >>= 1
	return n


## The exploration bitset of any chunk (empty if nothing explored there).
func explored_bits(cx: int, cy: int) -> PackedByteArray:
	var k := key(cx, cy)
	var c: Chunk = _chunks.get(k)
	if c != null:
		return pack_bits(c.explored) if c.explored_count > 0 else PackedByteArray()
	return _explored_unloaded.get(k, PackedByteArray())


# ---- bitsets (layout shared with the browser game's saves) -----------------------------------

static func pack_bits(flags: PackedByteArray) -> PackedByteArray:
	var out := PackedByteArray()
	out.resize((flags.size() + 7) / 8)
	for i in flags.size():
		if flags[i] != 0:
			out[i >> 3] |= 1 << (i & 7)
	return out


static func unpack_bits(bits: PackedByteArray, into: PackedByteArray) -> int:
	var n := 0
	for i in into.size():
		var v := (bits[i >> 3] >> (i & 7)) & 1 if (i >> 3) < bits.size() else 0
		into[i] = v
		n += v
	return n
