class_name Simulation
extends PathGrid
## Authoritative game state and the fixed-step update (10 ticks per second). No nodes, no
## rendering: it runs headless in tests and benchmarks. Mirrors `src/game/sim/Simulation.ts`.
##
## Ownership: everything here is changed only by `step()` and by `Commands.apply()`.
## Presentation and UI read it.
##
## Update order per tick (systems not yet ported are listed where they run in the browser game):
##   tick++, path budget reset, px/py snapshot
##   season, weather; fields every 5 ticks [orchards]; regrowth every 20 ticks
##   every settler (needs, decisions, tasks, movement, reveal)
##   [parties, military, war, logistics, diplomacy, campaigns, news, workshops, kingdoms,
##    upgrades, animals, areas]
##   every GROWTH_STEP ticks: [households, travellers, population], storage warning,
##   milestones, pruning of unreachable notes; world chunk housekeeping

const STARTING_SETTLERS := 5
const SETTLER_CAPACITY := 10
## Path searches allowed per tick across all settlers. A settler whose search does not fit waits a
## tick. (The browser game budgets A* nodes; native searches are budgeted by count, which keeps
## the simulation deterministic. See docs/godot/BASELINE.md, "Pathfinding".)
const PATH_SEARCHES_PER_TICK := 16
const CHRONICLE_LIMIT := 80
## A shared "can't reach" note only holds back settlers within this many tiles (Manhattan).
const SHARED_UNREACHABLE_RANGE := 12
const GROWTH_STEP := 50
## Navigation window: tiles around the first settlement that paths can use (half-size).
const NAV_HALF := 64

# Reservation and target key namespaces (high bits), so one int names any target.
const K_OBJ := 1 << 48
const K_BUILD := 2 << 48
const K_FIELD := 3 << 48
const K_CRAFT := 4 << 48
const K_ORCHARD := 5 << 48
const K_HUNT := 6 << 48
const K_HERD := 7 << 48
const K_EXTRACT := 8 << 48
const T_BUILDING := 1 << 48
const T_OBJECT := 2 << 48
const T_ANIMAL := 3 << 48

var world: World
var tick := 0
var settlers: Array[Settler] = []
var _settler_by_id := {}
## Building id -> Building, in placement order.
var buildings := {}
## Tile key -> building id for every footprint tile. Derived; rebuilt on load.
var occupancy := {}
## Tiles whose resource object is marked for harvest, in marking order, indexed for nearest queries.
var designations := TileSetIndex.new()
## Work reservations: key -> settler id. Transient.
var reservations := {}
## Tile key -> [object id it becomes, tick].
var regrowth := {}
var work_areas: Array[WorkArea] = []
## Ids of buildings with an upgrade under way (rebuilt from buildings on load).
var upgrading := {}
var animals: Array[Animal] = []
## Surveyed geology cells (saved): cell id -> ore left (null when the cell holds no deposit).
var geology := {}
## Ore promised to miners on their way, per deposit (cell id). Not saved: digs re-plan on load.
var ore_reserved := {}
## Animals draw from their own stream, so they never change what settlers do.
var animal_rng: Rng
## Target key -> [until tick, x, y] of the failed search (shared notes). Transient.
var shared_unreachable := {}
var _unreachable_count := {}
var stats := {}
var reached: Array[String] = ["camp"]
var raining := false
var weather_next_change := roundi(Defs.DAY_TICKS * 0.9)
var rng: Rng
var next_id := 1
var events: Array[Dictionary] = []
## Settlements, oldest first: {id (centre building id), name}.
var settlements: Array[Dictionary] = []
var chronicle: Array[Dictionary] = []
var session := {}
var last_season := ""
var path_searches_left := PATH_SEARCHES_PER_TICK
## Growth (People): "deliberate" for new valleys, "legacy" for worlds from before families.
var growth_mode := "legacy"
## {id, adults [a, b], children [], pending {requestedTick, stableTicks, claimId, blocked} or null, cooldownUntil}
var households: Array[Dictionary] = []
## Beds held for expected children and accepted travellers: {id, homeId, owner {kind, id}}.
var bed_claims: Array[Dictionary] = []
## The visitor waiting for an answer ({} when none): {id, name, appearance, arrivedTick, expiresTick}.
var offer := {}
var next_visitor := 0
## Accepted travellers: {id, name, appearance, settlementId, claimId, state, escrow, arrivesTick, blocked}.
var recruits: Array[Dictionary] = []
var last_recruit := -1000000000
var last_arrival := 0
## What growth is waiting on, in plain words.
var population_status := ""
var nav: NavWindow
## Building id -> [reachable from the camp, tick checked] (BuildingOps.bed_reachable). Transient.
var bed_reach_cache := {}
## Bumped whenever a building is placed, finished or removed; the lists below rebuild lazily.
var _buildings_version := 0
var _lists_version := -1
var _storages: Array[Building] = []
var _sites: Array[Building] = []
var _fields: Array[Building] = []
var _workshops: Array[Building] = []
var _orchards: Array[Building] = []
var _lodges: Array[Building] = []
var _pens: Array[Building] = []
var _extraction: Array[Building] = []
## Settler id -> the building they are assigned to work at.
var _workplace := {}
var _workplace_tick := -1
var _season_tick := -1
var _season := {}
## Loaded tiles holding a harvestable object, by resource ("wood", "stone", "food"), for nearest
## queries (gatherers, focus orders). Kept current from chunk loads and object changes. Derived.
var resource_index := {}
var _res_of_tile := {}
var _storage_warned := false


func _init(world_seed: int, rng_state: int = 0, gen: int = WorldGen.CURRENT_GEN, habitat: String = "valley", rng_given: bool = false) -> void:
	world = World.new(world_seed, gen, habitat)
	rng = Rng.new(rng_state if rng_given else (world_seed ^ 0x5bd1e995))
	animal_rng = Rng.new(world_seed ^ 0x0a11a1)
	_reset_stats()
	world.on_tile_changed = _on_tile_changed
	world.on_chunk_installed = _on_chunk_installed
	world.on_object_changed = _index_tile
	world.on_chunk_evicted = _on_chunk_evicted


func _reset_stats() -> void:
	# Every stat the browser game keeps (emptyStats in Simulation.ts), so saves and milestones match.
	for k: String in ["woodGathered", "stoneGathered", "foodGathered", "harvested", "planksCrafted", "toolsCrafted", "arrivals",
			"wheatHarvested", "flourMilled", "bakedFood", "pathsBuilt", "births", "applesPicked", "driedApples",
			"surveys", "oreMined", "stoneQuarried", "charcoalMade", "coalBurned", "charcoalBurned", "copperSmelted", "ironSmelted",
			"copperToolsForged", "ironToolsForged", "caravanTrips", "caravanDeliveries", "provisions", "merchantVisits", "trades",
			"swordsMade", "bowsMade", "armorMade", "horseFeed", "soldiersTrained", "battles", "soldiersLost", "cargoLost", "gearLost", "enemyLosses"]:
		stats[k] = 0


var seed_value: int:
	get:
		return world.seed_value


# ---- time ------------------------------------------------------------------------------------

## 0..1, where 0 is midnight.
func time_of_day() -> float:
	return fmod(tick + Defs.START_TIME * Defs.DAY_TICKS, Defs.DAY_TICKS) / Defs.DAY_TICKS


func day() -> int:
	return floori((tick + Defs.START_TIME * Defs.DAY_TICKS) / Defs.DAY_TICKS) + 1


func is_night() -> bool:
	var t := time_of_day()
	return t >= Defs.NIGHT_START or t < Defs.MORNING


## Settlers turn in, and get up, over a few minutes rather than all at once.
func is_bedtime(settler_id: int) -> bool:
	var t := time_of_day()
	var off := (settler_id % 12) * 0.0025
	return t >= Defs.NIGHT_START + off or t < Defs.MORNING + off


# ---- grid --------------------------------------------------------------------------------------

static func tile_key(x: int, y: int) -> int:
	return (x + 1048576) * 2097152 + (y + 1048576)


static func key_x(k: int) -> int:
	return k / 2097152 - 1048576


static func key_y(k: int) -> int:
	return k % 2097152 - 1048576


func building_at(x: int, y: int) -> Building:
	var id: int = occupancy.get(tile_key(x, y), -1)
	return buildings.get(id) if id >= 0 else null


func walkable(x: int, y: int) -> bool:
	if not world.naturally_walkable(x, y):
		return false
	var b := building_at(x, y)
	return b == null or not b.blocks()


func cost(x: int, y: int) -> float:
	var t := world.terrain(x, y)
	return 1.0 if t == World.UNKNOWN else Tiles.move_cost[t]


# ---- navigation --------------------------------------------------------------------------------

## Loads every chunk the navigation window around (cx, cy) covers, then creates the window.
## Used when a valley starts or is loaded, so both see the same land.
func load_nav_area(cx: int, cy: int) -> void:
	for ky in range((cy - NAV_HALF) >> Chunk.SHIFT, ((cy + NAV_HALF - 1) >> Chunk.SHIFT) + 1):
		for kx in range((cx - NAV_HALF) >> Chunk.SHIFT, ((cx + NAV_HALF - 1) >> Chunk.SHIFT) + 1):
			world.request(kx, ky)
	world.finish_pending()
	setup_nav(cx, cy)


## Creates the navigation window around (cx, cy) and fills it from the loaded world.
func setup_nav(cx: int, cy: int) -> void:
	nav = NavWindow.new(Rect2i(cx - NAV_HALF, cy - NAV_HALF, NAV_HALF * 2, NAV_HALF * 2))
	nav.fill_from(self)


func refresh_nav_rect(x: int, y: int, w: int, h: int) -> void:
	if nav == null:
		return
	for ty in range(y, y + h):
		for tx in range(x, x + w):
			nav.set_tile(tx, ty, walkable(tx, ty), cost(tx, ty))


func _on_tile_changed(x: int, y: int) -> void:
	if nav != null:
		nav.set_tile(x, y, walkable(x, y), cost(x, y))


## Updates the resource index for one tile after its object or amount changed.
func _index_tile(x: int, y: int) -> void:
	var k := tile_key(x, y)
	var had: String = _res_of_tile.get(k, "")
	var o := world.obj(x, y)
	var res := Tiles.object_resource[o] if o != World.UNKNOWN and world.amount(x, y) > 0 else ""
	if had == res:
		return
	if had != "":
		(resource_index[had] as TileSetIndex).erase(k)
		_res_of_tile.erase(k)
	if res != "":
		_resource_set(res).add(k)
		_res_of_tile[k] = res


func _resource_set(res: String) -> TileSetIndex:
	var ix: TileSetIndex = resource_index.get(res)
	if ix == null:
		ix = TileSetIndex.new()
		resource_index[res] = ix
	return ix


func _on_chunk_evicted(c: Chunk) -> void:
	var ox := c.cx * Chunk.SIZE
	var oy := c.cy * Chunk.SIZE
	for i in Chunk.AREA:
		var k := tile_key(ox + (i & Chunk.MASK), oy + (i >> Chunk.SHIFT))
		var had: String = _res_of_tile.get(k, "")
		if had != "":
			(resource_index[had] as TileSetIndex).erase(k)
			_res_of_tile.erase(k)


func _on_chunk_installed(c: Chunk) -> void:
	var ox := c.cx * Chunk.SIZE
	var oy := c.cy * Chunk.SIZE
	for i in Chunk.AREA:
		var o := c.obj[i]
		if o != Tiles.O_NONE and c.amt[i] > 0:
			var res := Tiles.object_resource[o]
			if res != "":
				var k := tile_key(ox + (i & Chunk.MASK), oy + (i >> Chunk.SHIFT))
				_resource_set(res).add(k)
				_res_of_tile[k] = res
	if nav != null and nav.rect.intersects(Rect2i(c.cx * Chunk.SIZE, c.cy * Chunk.SIZE, Chunk.SIZE, Chunk.SIZE)):
		refresh_nav_rect(c.cx * Chunk.SIZE, c.cy * Chunk.SIZE, Chunk.SIZE, Chunk.SIZE)


## Plans a path within this tick's search budget. Returns null when the budget is spent (the
## caller waits a tick), otherwise the result (found or not).
func find_path(sx: int, sy: int, goal: GridAStar.Goal, partial: bool = false) -> GridAStar.Result:
	if path_searches_left <= 0:
		return null
	path_searches_left -= 1
	return nav.find_path(sx, sy, goal, partial)


# ---- events ------------------------------------------------------------------------------------

func emit(e: Dictionary) -> void:
	events.append(e)


func toast(text: String, level: String = "info") -> void:
	emit({"type": "toast", "text": text, "level": level})


func record(kind: String, text: String, x: float = NAN, y: float = NAN) -> void:
	var e := {"tick": tick, "kind": kind, "text": text}
	if not is_nan(x):
		e["x"] = x
		e["y"] = y
	chronicle.append(e)
	if chronicle.size() > CHRONICLE_LIMIT:
		chronicle = chronicle.slice(chronicle.size() - CHRONICLE_LIMIT)


func drain_events() -> Array[Dictionary]:
	var out := events
	events = []
	return out


func start_session() -> void:
	session = {"startTick": tick, "startStats": stats.duplicate(), "startPopulation": settlers.size()}


## New work appeared: idle settlers look again right away.
func wake_idle() -> void:
	for s in settlers:
		s.next_think = 0


# ---- ids and settlers ----------------------------------------------------------------------

func alloc_id() -> int:
	next_id += 1
	return next_id - 1


func area(id: int) -> WorkArea:
	if id == -1:
		return null
	for a in work_areas:
		if a.id == id:
			return a
	return null


func settler(id: int) -> Settler:
	return _settler_by_id.get(id)


func random_appearance() -> Dictionary:
	return {"skin": rng.int_below(4), "hair": rng.int_below(6), "hairStyle": rng.int_below(3), "shirt": rng.int_below(6), "pants": rng.int_below(3)}


func pick_name() -> String:
	var used := {}
	for s in settlers:
		used[s.name] = true
	var free: Array = []
	for n: String in Content.get_value("names", "SETTLER_NAMES"):
		if not used.has(n):
			free.append(n)
	if not free.is_empty():
		return rng.pick(free)
	return "%s %d" % [rng.pick(Content.get_value("names", "SETTLER_NAMES")), settlers.size() + 1]


func add_settler(tx: int, ty: int, job: String, settler_name: String = "", settlement: int = -2) -> Settler:
	var s := Settler.new()
	s.id = alloc_id()
	s.name = settler_name if settler_name != "" else pick_name()
	s.x = tx + 0.5
	s.y = ty + 0.5
	s.px = s.x
	s.py = s.y
	s.rpx = s.x
	s.rpy = s.y
	s.rx = s.x
	s.ry = s.y
	s.job = job
	s.capacity = SETTLER_CAPACITY
	s.hunger = 85 + rng.int_below(15)
	s.energy = 90
	s.appearance = random_appearance()
	s.settlement_id = settlement if settlement != -2 else (int(settlements[0]["id"]) if not settlements.is_empty() else -1)
	s.next_think = 0
	_add_settler_object(s)
	return s


## Registers an already-built settler (loading).
func _add_settler_object(s: Settler) -> void:
	settlers.append(s)
	_settler_by_id[s.id] = s


# ---- reservations ---------------------------------------------------------------------------

func reserve(k: int, settler_id: int) -> bool:
	var owner: int = reservations.get(k, -1)
	if owner != -1 and owner != settler_id:
		return false
	reservations[k] = settler_id
	return true


func release(k: int, settler_id: int) -> void:
	if reservations.get(k, -1) == settler_id:
		reservations.erase(k)


func is_reserved(k: int, settler_id: int = -1) -> bool:
	var owner: int = reservations.get(k, -1)
	return owner != -1 and owner != settler_id


## Remembers that a target could not be reached. Shared notes back off exponentially (up to a day)
## until the map changes, and hold back only settlers near where the search started.
func mark_unreachable(s: Settler, target: int, ticks: int = 300) -> void:
	s.unreachable[target] = tick + ticks
	var n: int = _unreachable_count.get(target, 0) + 1
	_unreachable_count[target] = n
	var until := tick + mini(Defs.DAY_TICKS, roundi(ticks * 0.6) * (1 << mini(n - 1, 4)))
	shared_unreachable[target] = [until, s.x, s.y]


func is_unreachable(s: Settler, target: int) -> bool:
	var until: int = s.unreachable.get(target, -1)
	if until > tick:
		return true
	var shared: Array = shared_unreachable.get(target, [])
	if shared.is_empty() or int(shared[0]) <= tick:
		return false
	return absf(s.x - float(shared[1])) + absf(s.y - float(shared[2])) <= SHARED_UNREACHABLE_RANGE


## The map changed (something built, removed, a bridge finished): let everyone try again.
func map_changed() -> void:
	shared_unreachable.clear()
	_unreachable_count.clear()
	wake_idle()


# ---- building lists (cached) ------------------------------------------------------------------

## Call after a building is placed, finished or removed.
func buildings_changed() -> void:
	_buildings_version += 1


func _refresh_lists() -> void:
	if _lists_version == _buildings_version:
		return
	_lists_version = _buildings_version
	_storages.clear()
	_sites.clear()
	_fields.clear()
	_workshops.clear()
	_orchards.clear()
	_lodges.clear()
	_pens.clear()
	_extraction.clear()
	for b: Building in buildings.values():
		if b.built and b.def().has("extraction"):
			_extraction.append(b)
		if b.built and b.def().has("hunting"):
			_lodges.append(b)
		if b.built and b.def().has("pen"):
			_pens.append(b)
		if b.built and not b.orchard.is_empty():
			_orchards.append(b)
		if not b.built:
			_sites.append(b)
		elif b.is_storage():
			_storages.append(b)
		if b.built and not b.workshop.is_empty():
			_workshops.append(b)
		if b.is_field():
			_fields.append(b)


## Finished quarries, mines and fisher's huts.
func extraction_sites() -> Array[Building]:
	_refresh_lists()
	return _extraction


## Finished hunting lodges.
func lodges() -> Array[Building]:
	_refresh_lists()
	return _lodges


## Finished pens and pastures.
func pens() -> Array[Building]:
	_refresh_lists()
	return _pens


## Forgets the work index after assignments change.
func forget_work_index() -> void:
	_workplace_tick = -1


## The building a settler is assigned to work at, or null (rebuilt at most once a tick, like the
## browser game's work index; assignments can change between ticks).
func workplace_of(settler_id: int) -> Building:
	if _workplace_tick != tick:
		_workplace_tick = tick
		_workplace.clear()
		for b: Building in buildings.values():
			if b.built:
				for id in b.workers:
					_workplace[id] = b
	return _workplace.get(settler_id)


## Finished storage buildings, in placement order. Shared: do not modify the array.
func storages() -> Array[Building]:
	_refresh_lists()
	return _storages


## Construction sites (placed, not finished), in placement order. Shared: do not modify.
func sites() -> Array[Building]:
	_refresh_lists()
	return _sites


## Finished orchards, in placement order. Shared: do not modify.
func orchards() -> Array[Building]:
	_refresh_lists()
	return _orchards


## Finished recipe buildings, in placement order. Shared: do not modify.
func workshops() -> Array[Building]:
	_refresh_lists()
	return _workshops


## Fields, in placement order. Shared: do not modify.
func fields() -> Array[Building]:
	_refresh_lists()
	return _fields


## The season (Seasons.of), computed once per tick.
func season() -> Dictionary:
	if _season_tick != tick:
		_season_tick = tick
		_season = Seasons.of(self)
	return _season


# ---- storage ----------------------------------------------------------------------------------


func storage_used(b: Building) -> int:
	return Inv.total(b.inventory)


func available(b: Building, res: String) -> int:
	return int(b.inventory.get(res, 0)) - int(b.reserved_out.get(res, 0))


func stored_total(res: String) -> int:
	var n := 0
	for b: Building in storages():
		n += int(b.inventory.get(res, 0))
	return n


func totals() -> Dictionary:
	var out := {}
	for r in Defs.resource_ids():
		out[r] = 0
	for b: Building in storages():
		for r: String in b.inventory:
			out[r] = int(out[r]) + int(b.inventory[r])
	return out


func total_capacity() -> Vector2i:
	var used := 0
	var capacity := 0
	for b: Building in storages():
		used += storage_used(b)
		capacity += b.storage_capacity()
	return Vector2i(used, capacity)


static func stores_resource(b: Building, res: String) -> bool:
	var d := b.def()
	if d.has("accepts"):
		return (d["accepts"] as Array).has(res)
	if res == "horses":
		return b.type == "crate"
	return true


func nearest_storage_with(res: String, x: float, y: float, min_amount: int = 1) -> Building:
	var best: Building = null
	var best_d := INF
	for b: Building in storages():
		if available(b, res) < min_amount:
			continue
		var d := JsMath.hypot(b.center_x() - x, b.center_y() - y)
		if d < best_d:
			best_d = d
			best = b
	return best


## The nearest store with room for this resource.
func nearest_storage_with_space(x: float, y: float, res: String = "wood") -> Building:
	var best: Building = null
	var best_d := INF
	for b: Building in storages():
		if storage_used(b) >= b.storage_capacity() or not stores_resource(b, res):
			continue
		var d := JsMath.hypot(b.center_x() - x, b.center_y() - y)
		if d < best_d:
			best_d = d
			best = b
	return best


## Adds up to `amount`, limited by free space. Returns how many went in.
func deposit(b: Building, res: String, amount: int) -> int:
	if not stores_resource(b, res):
		return 0
	var space := b.storage_capacity() - storage_used(b)
	var n := maxi(0, mini(space, amount))
	if n > 0:
		Inv.add(b.inventory, res, n)
	return n


## Deposits into any storage, nearest first. Returns how many could not be stored.
## Removes unreserved goods from storage, spreading across buildings. Returns how many were taken.
func withdraw_unreserved(res: String, amount: int) -> int:
	var left := amount
	for b in storages():
		if left <= 0:
			break
		var n := mini(left, maxi(0, available(b, res)))
		if n > 0:
			Inv.add(b.inventory, res, -n)
			left -= n
	return amount - left


func deposit_anywhere(res: String, amount: int, x: float, y: float) -> int:
	var left := amount
	var list := storages().duplicate()
	list.sort_custom(func(a: Building, b: Building) -> bool:
		return JsMath.hypot(a.x - x, a.y - y) < JsMath.hypot(b.x - x, b.y - y))
	for b: Building in list:
		if left <= 0:
			break
		left -= deposit(b, res, left)
	return left


## Enough tools for everyone gives a work-speed bonus.
func well_equipped() -> bool:
	return not settlers.is_empty() and stored_total("tools") >= settlers.size()


# ---- update ------------------------------------------------------------------------------------

## One whole tick. The game may instead run a tick in slices across frames: begin_tick(), then
## update_settlers() over consecutive ranges until every settler is done, then end_tick(). The
## order of work is the same either way, so the results are identical.
func step() -> void:
	begin_tick()
	update_settlers(0, settlers.size())
	end_tick()


## How far the sliced tick in progress has got (settlers updated so far); -1 between ticks.
var slice_next := -1


func begin_tick() -> void:
	tick += 1
	slice_next = 0
	path_searches_left = PATH_SEARCHES_PER_TICK
	for s in settlers:
		s.px = s.x
		s.py = s.y
	Seasons.update(self)
	Farming.update_weather(self)
	var t0 := Prof.begin()
	if tick % 5 == 0:
		Farming.update_fields(self, 5)
		Orchards.update(self, 5)
	Prof.end("update_fields", t0)
	if tick % 20 == 0:
		BuildingOps.update_regrowth(self)


## Updates settlers [from, to) of the current tick.
func update_settlers(from: int, to: int) -> void:
	var t1 := Prof.begin()
	for i in range(from, mini(to, settlers.size())):
		SettlerTasks.update_settler(self, settlers[i])
	slice_next = to
	Prof.end("all_settlers", t1)


func end_tick() -> void:
	slice_next = -1
	if tick % 10 == 0:
		Production.update_workshops(self)
	if tick % Levels.CRATE_STEP == 0:
		Levels.tidy_crates(self)
	if not upgrading.is_empty():
		Levels.update(self)
	Animals.update(self)
	if tick % Areas.AREA_STEP == 0:
		Areas.update(self)
	# Where each settler stood at the start and end of this tick, for drawing between ticks.
	for s in settlers:
		s.rpx = s.px
		s.rpy = s.py
		s.rx = s.x
		s.ry = s.y
	if tick % GROWTH_STEP == 0:
		People.update_households(self)
		People.update_travelers(self)
		People.update_population(self)
		_check_storage()
		Progression.check(self)
		_prune_unreachable()
	world.pump()


func _check_storage() -> void:
	var c := total_capacity()
	var full := c.y > 0 and c.x >= c.y
	if full and not _storage_warned:
		toast("Storage is full. Build a storehouse so settlers can drop off their goods.", "warn")
	_storage_warned = full or (_storage_warned and c.x > c.y * 0.9)


func _prune_unreachable() -> void:
	for s in settlers:
		for k: int in s.unreachable.keys():
			if int(s.unreachable[k]) <= tick:
				s.unreachable.erase(k)
	for k: int in shared_unreachable.keys():
		if int(shared_unreachable[k][0]) <= tick:
			shared_unreachable.erase(k)


# ---- invariants (tests and debug builds) -----------------------------------------------------

## Every reservation belongs to a settler whose current task holds it. Returns problems found.
func reservation_problems() -> PackedStringArray:
	var out: PackedStringArray = []
	for k: int in reservations:
		var s := settler(int(reservations[k]))
		if s == null or not SettlerTasks.task_keys(s).has(k):
			out.append("reservation %d held by settler %d whose task does not hold it" % [k, int(reservations[k])])
	return out
