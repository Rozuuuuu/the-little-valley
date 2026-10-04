class_name WorldGen
## Deterministic world generation: a line-by-line port of `src/game/world/worldgen.ts`.
##
## Every function is pure in (seed, x, y), so any chunk can be regenerated on demand and only
## player changes need saving. Old worlds keep their generator version forever: never change a
## shipped generator, add a new one. tests/test_world.gd checks every generator against the
## browser game's fingerprints.
##
## Porting rules that keep the output identical:
## - every division has a float operand (GDScript's int / int truncates);
## - `Math.hypot`/`Math.sin` go through JsMath (V8-exact), never `sqrt(x*x+y*y)`/`sin`;
## - operation order follows the TypeScript exactly (floating-point addition is not associative).

const CURRENT_GEN := 4
const SUPPORTED_GENS: Array[int] = [1, 2, 3, 4]

const SPAWN_CLEAR := 6.5
const SPAWN_SAFE := 11.0
const POND_X := 9.0
const POND_Y := 6.0
const POND_R := 2.7
const MEADOW_X := -7.0
const MEADOW_Y := 5.0
const MEADOW_R := 5.5

## Small rocky outcrops near the camp (generator 3+); their hill faces hold the starter ore.
const STARTER_OUTCROPS: Array[Dictionary] = [
	{"x": -20, "y": -24, "mineral": "copper"},
	{"x": -36, "y": 16, "mineral": "iron"},
]
const _OUT_AX := -20.0
const _OUT_AY := -24.0
const _OUT_BX := -36.0
const _OUT_BY := 16.0
const OUTCROP_CORE := 2.2
const OUTCROP_SLOPE := 4.8
## A pass through the ridge every this many tiles, so the north is never sealed off.
const PASS_EVERY := 48
const PASS_WIDTH := 7

## A small craggy peak in plain sight of the hall in every generator-4 world.
const SENTINEL_X := 14.0
const SENTINEL_Y := -6.0
const SENTINEL_CORE := 2.3
const SENTINEL_SLOPE := 4.4

## "No high ground here" from the high-ground functions (TypeScript returns null).
const NONE := -1


## Per-chunk cache of values that depend only on a row, a column or a tile, so generating a chunk
## computes each once instead of once per use. It only skips repeated work: every value is still
## computed by the same function from the same inputs, so the output is unchanged (the fingerprint
## tests prove it). Covers the chunk plus a one-tile border; anything outside is computed directly.
class GenCache:
	var x0: int
	var y0: int
	const N := Chunk.SIZE + 2
	## By row (y - y0): the great river's centre line and half width.
	var river_c := PackedFloat64Array()
	var river_hw := PackedFloat64Array()
	## By column (x - x0): the ridge (generator 3) or near range (generator 4) line and core.
	var range_y := PackedFloat64Array()
	var range_core := PackedFloat64Array()
	## By tile ((y - y0) * N + (x - x0)): elevation, NaN until first asked.
	var elev := PackedFloat64Array()

	func _init(seed_value: int, ox: int, oy: int, gen: int, h: HabitatDef) -> void:
		x0 = ox - 1
		y0 = oy - 1
		river_c.resize(N)
		river_hw.resize(N)
		range_y.resize(N)
		range_core.resize(N)
		elev.resize(N * N)
		elev.fill(NAN)
		for i in N:
			var fy := float(y0 + i)
			var fx := float(x0 + i)
			if gen >= 2:
				river_c[i] = WorldGen.river_center(seed_value, fy)
				river_hw[i] = WorldGen.river_half_width(seed_value, fy)
			if gen >= 4:
				range_y[i] = WorldGen._range_y4(seed_value, fx, h)
				range_core[i] = WorldGen._range_core4(seed_value, fx, h)
			elif gen == 3:
				range_y[i] = WorldGen.ridge_y(seed_value, fx)
				range_core[i] = WorldGen.ridge_core(seed_value, fx)


static func _rc(seed_value: int, y: int, c: GenCache) -> float:
	if c != null:
		var i := y - c.y0
		if i >= 0 and i < GenCache.N:
			return c.river_c[i]
	return river_center(seed_value, y)


static func _rhw(seed_value: int, y: int, c: GenCache) -> float:
	if c != null:
		var i := y - c.y0
		if i >= 0 and i < GenCache.N:
			return c.river_hw[i]
	return river_half_width(seed_value, y)


## Generator 3's ridge line or generator 4's range line at column x.
static func _ry(seed_value: int, x: int, gen: int, h: HabitatDef, c: GenCache) -> float:
	if c != null:
		var i := x - c.x0
		if i >= 0 and i < GenCache.N:
			return c.range_y[i]
	return _range_y4(seed_value, x, h) if gen >= 4 else ridge_y(seed_value, x)


static func _rcore(seed_value: int, x: int, gen: int, h: HabitatDef, c: GenCache) -> float:
	if c != null:
		var i := x - c.x0
		if i >= 0 and i < GenCache.N:
			return c.range_core[i]
	return _range_core4(seed_value, x, h) if gen >= 4 else ridge_core(seed_value, x)


static func _elev(seed_value: int, x: int, y: int, c: GenCache) -> float:
	if c != null:
		var ix := x - c.x0
		var iy := y - c.y0
		if ix >= 0 and ix < GenCache.N and iy >= 0 and iy < GenCache.N:
			var k := iy * GenCache.N + ix
			var v := c.elev[k]
			if is_nan(v):
				v = elevation(seed_value, x, y)
				c.elev[k] = v
			return v
	return elevation(seed_value, x, y)


static func elevation(seed_value: int, x: float, y: float) -> float:
	return WorldNoise.fbm(x / 72.0, y / 72.0, seed_value, 4)


static func moisture(seed_value: int, x: float, y: float) -> float:
	return WorldNoise.fbm(x / 46.0 + 300.0, y / 46.0 - 200.0, seed_value ^ 0x9e37, 3)


# ---- generator 3: ridge and outcrops ------------------------------------------------------

static func ridge_y(seed_value: int, x: float) -> float:
	return -56.0 + 9.0 * JsMath.sin_js(x / 41.0 + float(absi(seed_value) % 314) / 50.0) + (WorldNoise.fbm(x / 53.0, 7.3, seed_value ^ 0x41d6, 2) - 0.5) * 14.0


static func ridge_core(seed_value: int, x: float) -> float:
	return 3.0 + WorldNoise.fbm(x / 19.0, 2.1, seed_value ^ 0x2c1, 2) * 4.0


static func in_pass(seed_value: int, x: int) -> bool:
	var phase := absi(seed_value) % PASS_EVERY
	return (((x - phase) % PASS_EVERY) + PASS_EVERY) % PASS_EVERY < PASS_WIDTH


## Within the northern ridge's band of cliffs and foothills (generator 3+).
static func on_ridge(seed_value: int, x: int, y: int, c: GenCache = null) -> bool:
	return absf(float(y) - _ry(seed_value, x, 3, null, c)) < _rcore(seed_value, x, 3, null, c) + 5.0


static func outcrop_distance(x: float, y: float) -> float:
	var d := INF
	d = minf(d, JsMath.hypot(x - _OUT_AX, y - _OUT_AY))
	d = minf(d, JsMath.hypot(x - _OUT_BX, y - _OUT_BY))
	return d


## Mountain, hill or NONE for generator 3's high ground.
static func high_ground(seed_value: int, x: int, y: int, c: GenCache = null) -> int:
	var fx := float(x)
	var fy := float(y)
	var od := outcrop_distance(fx, fy)
	if od < OUTCROP_CORE:
		return Tiles.MOUNTAIN
	if od < OUTCROP_SLOPE:
		return Tiles.HILL
	var dy := absf(fy - _ry(seed_value, x, 3, null, c))
	var core := _rcore(seed_value, x, 3, null, c)
	if dy < core:
		return Tiles.HILL if in_pass(seed_value, x) else Tiles.MOUNTAIN
	if dy < core + 5.0:
		return Tiles.HILL
	var d := JsMath.hypot(fx, fy)
	var e := _elev(seed_value, x, y, c)
	if d > 40.0 and e > 0.74:
		return Tiles.MOUNTAIN
	if d > 34.0 and e > 0.66:
		return Tiles.HILL
	return NONE


## High ground is never flooded by the small rivers and lakes (the great river still cuts through).
static func dry_high_ground(seed_value: int, x: int, y: int, c: GenCache = null) -> bool:
	return outcrop_distance(x, y) < OUTCROP_SLOPE + 1.5 or on_ridge(seed_value, x, y, c)


# ---- generator 2: the great river -----------------------------------------------------------

## Centre line of the great river (generator 2+), meandering north to south.
static func river_center(seed_value: int, y: float) -> float:
	return 28.0 + 5.0 * JsMath.sin_js(y / 21.0 + float(absi(seed_value) % 628) / 100.0) + (WorldNoise.fbm(y / 37.0, 0.5, seed_value ^ 0xb1e5, 2) - 0.5) * 12.0


static func river_half_width(seed_value: int, y: float) -> float:
	return 3.0 + WorldNoise.fbm(y / 13.0, 1.5, seed_value ^ 0x77aa, 2) * 1.6


# ---- water -------------------------------------------------------------------------------------

## 0 = land, 1 = shallow water, 2 = deep water.
static func water_at(seed_value: int, x: int, y: int, gen: int = 1, habitat: HabitatDef = null, c: GenCache = null) -> int:
	if gen >= 4:
		return _water_at4(seed_value, x, y, habitat if habitat else HabitatDef.of("valley"), c)
	if gen >= 2:
		var d := absf(float(x) - _rc(seed_value, y, c))
		var hw := _rhw(seed_value, y, c)
		# No fords: the deep channel can only be crossed by a stone bridge.
		if d < hw:
			return 2 if d < hw - 1.6 else 1
	if gen >= 3 and dry_high_ground(seed_value, x, y, c):
		return 0
	return _water_at_v1(seed_value, x, y, c)


static func _water_at_v1(seed_value: int, x: int, y: int, c: GenCache = null) -> int:
	var fx := float(x)
	var fy := float(y)
	var pond := JsMath.hypot(fx - POND_X, fy - POND_Y) - (WorldNoise.hash01(x, y, seed_value ^ 0x77) * 0.6)
	if pond < POND_R:
		return 1
	var d := JsMath.hypot(fx, fy)
	if d < SPAWN_SAFE:
		return 0
	var fade := minf(1.0, (d - SPAWN_SAFE) / 12.0)
	var river := absf(WorldNoise.fbm(fx / 120.0, fy / 120.0, seed_value ^ 0x51f1, 3) - 0.5)
	var width := (0.004 + 0.006 * WorldNoise.fbm(fx / 40.0, fy / 40.0, seed_value ^ 0x3a, 2)) * fade
	# Fords break every river loop so the spawn is never sealed in by water.
	var ford := WorldNoise.fbm(fx / 26.0, fy / 26.0, seed_value ^ 0x0f0d, 2) > 0.6
	if river < width and not ford:
		return 2 if river < width * 0.3 and d > 40.0 else 1
	var e := _elev(seed_value, x, y, c)
	var lake := 0.33 - (1.0 - fade) * 0.3
	if e < lake:
		return 2 if e < lake - 0.045 else 1
	return 0


## True east of the great river, where the riverlands lie (generator 2+).
static func on_far_bank(seed_value: int, x: int, y: int, gen: int, habitat: HabitatDef = null, c: GenCache = null) -> bool:
	if gen < 2 or (gen >= 4 and not (habitat if habitat else HabitatDef.of("valley")).river):
		return false
	var edge := _rc(seed_value, y, c) + _rhw(seed_value, y, c)
	return x > edge + 1.0 and x < edge + 34.0


# ---- terrain and objects ---------------------------------------------------------------------

## Terrain of one tile, computing its water and its neighbours' water directly.
static func terrain_at(seed_value: int, x: int, y: int, gen: int = 1, habitat: HabitatDef = null) -> int:
	var w := water_at(seed_value, x, y, gen, habitat)
	var shore := false
	if w == 0:
		for dy in range(-1, 2):
			for dx in range(-1, 2):
				if (dx != 0 or dy != 0) and water_at(seed_value, x + dx, y + dy, gen, habitat) != 0:
					shore = true
	return _terrain_from_water(seed_value, x, y, gen, habitat if habitat else HabitatDef.of("valley"), w, shore)


## The rest of `terrainAt` once the tile's water (0/1/2) and "any neighbour is water" are known.
static func _terrain_from_water(seed_value: int, x: int, y: int, gen: int, h: HabitatDef, w: int, shore: bool, c: GenCache = null) -> int:
	if w == 2:
		return Tiles.DEEP_WATER
	if w == 1:
		return Tiles.WATER
	if shore:
		return Tiles.SAND
	if gen >= 4:
		return _terrain_at4(seed_value, x, y, h, c)
	if gen >= 3:
		var hg := high_ground(seed_value, x, y, c)
		if hg != NONE:
			return hg
	var fx := float(x)
	var fy := float(y)
	var d := JsMath.hypot(fx, fy)
	if JsMath.hypot(fx - MEADOW_X, fy - MEADOW_Y) < MEADOW_R + WorldNoise.hash01(x, y, seed_value ^ 0x19) * 1.2:
		return Tiles.MEADOW
	var e := _elev(seed_value, x, y, c)
	var m := moisture(seed_value, fx, fy)
	if on_far_bank(seed_value, x, y, gen, null, c):
		# The riverlands: open fertile meadow with rocky knolls.
		if e > 0.62:
			return Tiles.ROCKY
		return Tiles.FOREST if m > 0.6 else Tiles.MEADOW
	if e > 0.6 and d > 14.0:
		return Tiles.ROCKY
	if m > 0.555 and d > 9.0:
		return Tiles.FOREST
	if m > 0.47 and m <= 0.555:
		return Tiles.MEADOW
	return Tiles.GRASS


static func object_at(seed_value: int, x: int, y: int, terrain: int, gen: int = 1, habitat: HabitatDef = null, c: GenCache = null) -> int:
	var fx := float(x)
	var fy := float(y)
	var d := JsMath.hypot(fx, fy)
	if d < SPAWN_CLEAR:
		return Tiles.O_NONE
	if terrain == Tiles.WATER or terrain == Tiles.DEEP_WATER or terrain == Tiles.ROAD or terrain == Tiles.BRIDGE or terrain == Tiles.MOUNTAIN:
		return Tiles.O_NONE
	if gen >= 4:
		return _object_at4(seed_value, x, y, terrain, habitat if habitat else HabitatDef.of("valley"), d, c)
	var r := WorldNoise.hash01(x, y, seed_value ^ 0xabc1)
	var kind := WorldNoise.hash01(x, y, seed_value ^ 0x5eed)
	var ring := WorldNoise.hash01(x, y, seed_value ^ 0x2222) if d < 16.0 else 1.0
	if on_far_bank(seed_value, x, y, gen, null, c) and terrain == Tiles.MEADOW:
		if r < 0.018:
			return Tiles.O_BOULDER
		if r < 0.04:
			return Tiles.O_BERRY
		if r < 0.055:
			return Tiles.O_OAK
		return Tiles.O_NONE
	# A friendly ring of resources around the camp, so the first minutes are about choices.
	if d < 16.0 and terrain != Tiles.SAND:
		if ring < 0.09:
			return Tiles.O_OAK if kind < 0.7 else Tiles.O_PINE
		if ring < 0.115:
			return Tiles.O_ROCK
		if ring < 0.14:
			return Tiles.O_BERRY
	match terrain:
		Tiles.FOREST:
			if r < 0.34:
				return Tiles.O_PINE if _elev(seed_value, x, y, c) > 0.55 or kind < 0.35 else Tiles.O_OAK
			if r < 0.37:
				return Tiles.O_BERRY
		Tiles.GRASS:
			if r < 0.045:
				return Tiles.O_OAK if kind < 0.75 else Tiles.O_PINE
			if r < 0.058:
				return Tiles.O_BERRY
			if r < 0.066:
				return Tiles.O_ROCK
		Tiles.MEADOW:
			if d < 14.0:
				return Tiles.O_NONE
			if r < 0.02:
				return Tiles.O_OAK
			if r < 0.045:
				return Tiles.O_BERRY
		Tiles.ROCKY:
			if r < 0.08:
				return Tiles.O_ROCK
			if r < 0.125:
				return Tiles.O_BOULDER
			if r < 0.16:
				return Tiles.O_PINE
		Tiles.SAND:
			if r < 0.012:
				return Tiles.O_ROCK
		Tiles.HILL:
			# Starter outcrop slopes stay clear so their mine faces are easy to reach.
			if outcrop_distance(fx, fy) < OUTCROP_SLOPE + 1.0:
				return Tiles.O_NONE
			if r < 0.05:
				return Tiles.O_PINE
			if r < 0.085:
				return Tiles.O_ROCK
			if r < 0.1:
				return Tiles.O_BOULDER
	return Tiles.O_NONE


## Generates one chunk. Water is computed once for the chunk plus a one-tile border.
static func generate_chunk(seed_value: int, cx: int, cy: int, gen: int = 1, habitat_id: String = "valley") -> Chunk:
	Tiles.ensure_loaded()
	var h := HabitatDef.of(habitat_id)
	var c := Chunk.new(cx, cy)
	var ox := cx * Chunk.SIZE
	var oy := cy * Chunk.SIZE
	var cache := GenCache.new(seed_value, ox, oy, gen, h)
	const G := Chunk.SIZE + 2
	var water := PackedByteArray()
	water.resize(G * G)
	for gy in G:
		for gx in G:
			water[gy * G + gx] = water_at(seed_value, ox + gx - 1, oy + gy - 1, gen, h, cache)
	for ly in Chunk.SIZE:
		for lx in Chunk.SIZE:
			var i := ly * Chunk.SIZE + lx
			var w := water[(ly + 1) * G + (lx + 1)]
			var shore := false
			if w == 0:
				for dy in range(-1, 2):
					for dx in range(-1, 2):
						if (dx != 0 or dy != 0) and water[(ly + 1 + dy) * G + (lx + 1 + dx)] != 0:
							shore = true
			var t := _terrain_from_water(seed_value, ox + lx, oy + ly, gen, h, w, shore, cache)
			var o := object_at(seed_value, ox + lx, oy + ly, t, gen, h, cache)
			c.terrain[i] = t
			c.obj[i] = o
			c.amt[i] = Tiles.start_amount[o]
	return c


# ---- generator 4: habitats -------------------------------------------------------------------

## Centre line of the near mountain range, north of the spawn.
static func _range_y4(seed_value: int, x: float, h: HabitatDef) -> float:
	return -h.range_distance + 6.0 * JsMath.sin_js(x / 29.0 + float(absi(seed_value) % 314) / 50.0) + (WorldNoise.fbm(x / 23.0, 3.1, seed_value ^ 0x6a11, 3) - 0.5) * 12.0


static func _range_core4(seed_value: int, x: float, h: HabitatDef) -> float:
	return h.range_core + WorldNoise.fbm(x / 11.0, 5.3, seed_value ^ 0x2c1, 3) * 5.0


## Passes through the near range every PASS_EVERY tiles, one always close above the spawn.
static func _in_pass4(seed_value: int, x: int) -> bool:
	var phase := absi(seed_value) % 13
	return (((x + 3 - phase) % PASS_EVERY) + PASS_EVERY) % PASS_EVERY < PASS_WIDTH


static func _near_range4(seed_value: int, x: int, y: int, h: HabitatDef, c: GenCache = null) -> bool:
	return absf(float(y) - _ry(seed_value, x, 4, h, c)) < _rcore(seed_value, x, 4, h, c) + 10.0


static func _high_ground4(seed_value: int, x: int, y: int, h: HabitatDef, c: GenCache = null) -> int:
	var fx := float(x)
	var fy := float(y)
	var sd := JsMath.hypot(fx - SENTINEL_X, fy - SENTINEL_Y) - WorldNoise.hash01(x, y, seed_value ^ 0x5e71) * 0.5
	if sd < SENTINEL_CORE:
		return Tiles.MOUNTAIN
	if sd < SENTINEL_SLOPE:
		return Tiles.HILL
	var od := outcrop_distance(fx, fy)
	if od < OUTCROP_CORE:
		return Tiles.MOUNTAIN
	if od < OUTCROP_SLOPE:
		return Tiles.HILL
	var dy := absf(fy - _ry(seed_value, x, 4, h, c))
	var core := _rcore(seed_value, x, 4, h, c)
	# The range softens into walkable foothills around the starter outcrops.
	if od < OUTCROP_SLOPE + 8.0:
		return Tiles.HILL if dy < core + 4.0 else NONE
	if dy < core:
		return Tiles.HILL if _in_pass4(seed_value, x) else Tiles.MOUNTAIN
	# Spurs and foothills: craggy lumps off both flanks, never inside a pass.
	if dy < core + 9.0 and not _in_pass4(seed_value, x):
		var crag := WorldNoise.fbm(fx / 7.0, fy / 7.0, seed_value ^ 0x7c3a, 2) - (dy - core) * 0.035
		if crag > 0.6:
			return Tiles.MOUNTAIN
		if crag > 0.46:
			return Tiles.HILL
	if dy < core + 4.0:
		return Tiles.HILL
	var d := JsMath.hypot(fx, fy)
	var e := _elev(seed_value, x, y, c)
	if d > h.peak_min_distance and e > h.peak_above:
		return Tiles.MOUNTAIN
	if d > h.peak_min_distance - 6.0 and e > h.hill_above:
		return Tiles.HILL
	return NONE


static func _water_at4(seed_value: int, x: int, y: int, h: HabitatDef, c: GenCache = null) -> int:
	var fx := float(x)
	var fy := float(y)
	if h.river:
		var rd := absf(fx - _rc(seed_value, y, c))
		var hw := _rhw(seed_value, y, c)
		if rd < hw:
			return 2 if rd < hw - 1.6 else 1
	if outcrop_distance(fx, fy) < OUTCROP_SLOPE + 1.5 or _near_range4(seed_value, x, y, h, c) or JsMath.hypot(fx - SENTINEL_X, fy - SENTINEL_Y) < SENTINEL_SLOPE + 1.5:
		return 0
	var pond := JsMath.hypot(fx - POND_X, fy - POND_Y) - WorldNoise.hash01(x, y, seed_value ^ 0x77) * 0.6
	if pond < POND_R:
		return 1
	var d := JsMath.hypot(fx, fy)
	if d < SPAWN_SAFE:
		return 0
	var fade := minf(1.0, (d - SPAWN_SAFE) / 12.0)
	var river := absf(WorldNoise.fbm(fx / 120.0, fy / 120.0, seed_value ^ 0x51f1, 3) - 0.5)
	var width := (0.004 + 0.006 * WorldNoise.fbm(fx / 40.0, fy / 40.0, seed_value ^ 0x3a, 2)) * fade
	var ford := WorldNoise.fbm(fx / 26.0, fy / 26.0, seed_value ^ 0x0f0d, 2) > 0.6
	if river < width and not ford:
		return 2 if river < width * 0.3 and d > 40.0 else 1
	var e := _elev(seed_value, x, y, c)
	var lake := h.lake_below - (1.0 - fade) * 0.3
	if e < lake:
		return 2 if e < lake - 0.045 else 1
	# Marshland: scattered shallow ponds between the lakes.
	if h.ponds > 0.0 and d > 14.0 and WorldNoise.fbm(fx / 9.0, fy / 9.0, seed_value ^ 0x9d0d, 2) > h.ponds:
		return 1
	return 0


static func _terrain_at4(seed_value: int, x: int, y: int, h: HabitatDef, c: GenCache = null) -> int:
	var hg := _high_ground4(seed_value, x, y, h, c)
	if hg != NONE:
		return hg
	var fx := float(x)
	var fy := float(y)
	var d := JsMath.hypot(fx, fy)
	if JsMath.hypot(fx - MEADOW_X, fy - MEADOW_Y) < MEADOW_R + WorldNoise.hash01(x, y, seed_value ^ 0x19) * 1.2:
		return Tiles.MEADOW
	var e := _elev(seed_value, x, y, c)
	var m := moisture(seed_value, fx, fy)
	if h.river and on_far_bank(seed_value, x, y, 4, h, c):
		if e > 0.62:
			return Tiles.ROCKY
		return Tiles.FOREST if m > 0.6 else Tiles.MEADOW
	if e > h.rocky_above and d > 14.0:
		return Tiles.ROCKY
	if m > h.forest_above and d > 9.0:
		return Tiles.FOREST
	if m > 0.47 and m <= h.meadow_below:
		return Tiles.MEADOW
	return Tiles.GRASS


static func _object_at4(seed_value: int, x: int, y: int, terrain: int, h: HabitatDef, d: float, c: GenCache = null) -> int:
	var r := WorldNoise.hash01(x, y, seed_value ^ 0xabc1)
	var kind := WorldNoise.hash01(x, y, seed_value ^ 0x5eed)
	var ring := WorldNoise.hash01(x, y, seed_value ^ 0x2222) if d < 16.0 else 1.0
	if h.river and on_far_bank(seed_value, x, y, 4, h, c) and terrain == Tiles.MEADOW:
		if r < 0.018:
			return Tiles.O_BOULDER
		if r < 0.04:
			return Tiles.O_BERRY
		if r < 0.055:
			return Tiles.O_OAK
		return Tiles.O_NONE
	# The same friendly ring of wood, stone and berries around the hall in every habitat.
	if d < 16.0 and terrain != Tiles.SAND:
		if ring < 0.09:
			return Tiles.O_OAK if kind < 0.7 else Tiles.O_PINE
		if ring < 0.115:
			return Tiles.O_ROCK
		if ring < 0.14:
			return Tiles.O_BERRY
	match terrain:
		Tiles.FOREST:
			if r < 0.34:
				return Tiles.O_PINE if _elev(seed_value, x, y, c) > 0.55 or kind < 0.35 else Tiles.O_OAK
			if r < 0.37:
				return Tiles.O_BERRY
		Tiles.GRASS:
			if r < h.grass_trees:
				return Tiles.O_OAK if kind < 0.75 else Tiles.O_PINE
			if r < h.grass_trees + 0.013:
				return Tiles.O_BERRY
			if r < h.grass_trees + 0.021:
				return Tiles.O_ROCK
		Tiles.MEADOW:
			if d < 14.0:
				return Tiles.O_NONE
			if r < h.grass_trees * 0.45:
				return Tiles.O_OAK
			if r < h.grass_trees * 0.45 + 0.025:
				return Tiles.O_BERRY
		Tiles.ROCKY:
			if r < 0.08:
				return Tiles.O_ROCK
			if r < 0.125:
				return Tiles.O_BOULDER
			if r < 0.16:
				return Tiles.O_PINE
		Tiles.SAND:
			if r < 0.012:
				return Tiles.O_ROCK
		Tiles.HILL:
			if outcrop_distance(x, y) < OUTCROP_SLOPE + 1.0:
				return Tiles.O_NONE
			if r < 0.06:
				return Tiles.O_PINE
			if r < 0.095:
				return Tiles.O_ROCK
			if r < 0.11:
				return Tiles.O_BOULDER
	return Tiles.O_NONE
