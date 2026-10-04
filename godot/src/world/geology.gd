class_name Geology
## Where ore lies (src/game/world/geology.ts). A sparse layer beside the terrain, versioned on its
## own, so changing it never changes anyone's land. The world is divided into 16×16-tile cells;
## each holds at most one deposit, at a qualifying site:
##   - rocky ground (any generator),
##   - a rock or boulder the generator placed (any generator), or
##   - a hill tile at the foot of a mountain face (generator 3+).
## Deposits are pure functions of (seed, generator, habitat, cell): only cells a settler has
## surveyed or mined are saved. Everything here reads the generator directly and never creates
## chunks. A deposit is {id, mineral, x, y, initial}.

const VERSION := 1
const CELL := 16
## Chance that a cell with a qualifying site holds a deposit.
const DEPOSIT_CHANCE := 0.5

static var _site_cache := {}
static var _starter_cache := {}


static func mineral(id: String) -> Dictionary:
	return (Content.get_value("minerals", "MINERALS") as Dictionary)[id]


static func cell_of(x: int, y: int) -> Vector2i:
	return Vector2i(floori(x / float(CELL)), floori(y / float(CELL)))


static func cell_id(cx: int, cy: int) -> int:
	return (cx + 32768) * 65536 + (cy + 32768)


static func cell_from_id(id: int) -> Vector2i:
	return Vector2i(floori(id / 65536.0) - 32768, (id % 65536) - 32768)


## A tile where ore can be worked, read straight from the generator.
static func qualifying_site(seed_value: int, gen: int, x: int, y: int, habitat: String = "valley") -> bool:
	var h := HabitatDef.of(habitat)
	var t := WorldGen.terrain_at(seed_value, x, y, gen, h)
	if t == Tiles.ROCKY:
		return true
	if gen >= 3 and t == Tiles.HILL:
		for d: Vector2i in [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]:
			if WorldGen.terrain_at(seed_value, x + d.x, y + d.y, gen, h) == Tiles.MOUNTAIN:
				return true
	if t == Tiles.WATER or t == Tiles.DEEP_WATER or t == Tiles.MOUNTAIN:
		return false
	var o := WorldGen.object_at(seed_value, x, y, t, gen, h)
	return o == Tiles.O_ROCK or o == Tiles.O_BOULDER


## The cell's deposit site: the first qualifying tile in a seeded scan order, or (-99999, 0).
static func cell_site(seed_value: int, gen: int, cx: int, cy: int, habitat: String = "valley") -> Vector2i:
	var k := "%d:%d:%s:%d:%d" % [seed_value, gen, habitat, cx, cy]
	if _site_cache.has(k):
		return _site_cache[k]
	var start := floori(WorldNoise.hash01(cx, cy, seed_value ^ 0x51e7) * 256)
	var site := Vector2i(-99999, 0)
	for i in 256:
		# 97 is coprime with 256, so this visits every tile once in a scattered order.
		var j := (start + i * 97) % 256
		var x := cx * CELL + (j % CELL)
		var y := cy * CELL + j / CELL
		if qualifying_site(seed_value, gen, x, y, habitat):
			site = Vector2i(x, y)
			break
	if _site_cache.size() > 20000:
		_site_cache.clear()
	_site_cache[k] = site
	return site


static func _pick_mineral(seed_value: int, cx: int, cy: int) -> String:
	var ids: Array = Content.get_value("minerals", "MINERAL_IDS")
	var total := 0.0
	for m: String in ids:
		total += float(mineral(m)["weight"])
	var r := WorldNoise.hash01(cx, cy, seed_value ^ 0x31ce) * total
	for m: String in ids:
		r -= float(mineral(m)["weight"])
		if r < 0:
			return m
	return "coal"


static func _amount_for(seed_value: int, cx: int, cy: int, m: String) -> int:
	return maxi(1, int(JsMath.round_js(float(mineral(m)["amount"]) * (0.75 + 0.5 * WorldNoise.hash01(cx, cy, seed_value ^ 0x2a7)))))


static func _make(m: String, x: int, y: int) -> Dictionary:
	var c := cell_of(x, y)
	return {"id": cell_id(c.x, c.y), "mineral": m, "x": x, "y": y, "initial": int(mineral(m)["amount"])}


## Guaranteed copper and iron near the camp, so tools never depend on luck: {copper, iron}, each a
## deposit or empty. New worlds put them on the starter outcrops' hill faces; older worlds use the
## two nearest cells with any qualifying site.
static func starter_deposits(seed_value: int, gen: int, habitat: String = "valley") -> Dictionary:
	var k := "%d:%d:%s" % [seed_value, gen, habitat]
	if _starter_cache.has(k):
		return _starter_cache[k]
	var out := {"copper": {}, "iron": {}}
	if gen >= 3:
		for o: Dictionary in WorldGen.STARTER_OUTCROPS:
			out[o["mineral"]] = _make(str(o["mineral"]), int(o["x"]), int(o["y"]) + 3)
	else:
		var cells: Array[Array] = []
		for cy in range(-5, 5):
			for cx in range(-5, 5):
				cells.append([JsMath.hypot(cx * CELL + CELL / 2.0, cy * CELL + CELL / 2.0), cells.size(), cx, cy])
		cells.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]) or (float(a[0]) == float(b[0]) and int(a[1]) < int(b[1])))
		for c in cells:
			if not (out["copper"] as Dictionary).is_empty() and not (out["iron"] as Dictionary).is_empty():
				break
			var site := cell_site(seed_value, gen, int(c[2]), int(c[3]), habitat)
			if site.x == -99999:
				continue
			if (out["copper"] as Dictionary).is_empty():
				out["copper"] = _make("copper", site.x, site.y)
			else:
				out["iron"] = _make("iron", site.x, site.y)
	_starter_cache[k] = out
	return out


## The deposit in a cell as the world was generated (before any mining), or empty.
static func deposit_in_cell(seed_value: int, gen: int, cx: int, cy: int, habitat: String = "valley") -> Dictionary:
	var id := cell_id(cx, cy)
	var st := starter_deposits(seed_value, gen, habitat)
	for m: String in ["copper", "iron"]:
		var d: Dictionary = st[m]
		if not d.is_empty() and int(d["id"]) == id:
			return d
	var site := cell_site(seed_value, gen, cx, cy, habitat)
	if site.x == -99999 or WorldNoise.hash01(cx, cy, seed_value ^ 0x6e0) >= DEPOSIT_CHANCE:
		return {}
	var m := _pick_mineral(seed_value, cx, cy)
	return {"id": id, "mineral": m, "x": site.x, "y": site.y, "initial": _amount_for(seed_value, cx, cy, m)}
