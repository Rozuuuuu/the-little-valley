class_name Regions
## The wider land beyond the valley as a coarse graph (src/game/world/regions.ts). Each 96×96-tile
## region may hold a distant town. Nodes are pure functions of the seed, so distant places cost
## nothing until someone hears of them, and nothing here ever generates chunks.
## A node is {id, rx, ry, kind town|wild, name, x, y}.

const REGION := 96
## Regions searched around the valley for towns that trade with it.
const REACH := 3
## Regional travel speed for parties on the road (tiles per tick).
const ROAD_SPEED := 0.5
const TOWN_NAMES: Array[String] = ["Ashford", "Wrenmoor", "Kettlebrook", "Harrowgate", "Dunmere", "Oakhollow", "Saltmarsh", "Brightwater",
	"Stonebridge", "Fallowfield", "Hollins", "Redcliff", "Elderwick", "Marrowdale", "Thornbury", "Greywell"]

static var _town_cache := {}


static func region_id(rx: int, ry: int) -> int:
	return (rx + 1000) * 2000 + (ry + 1000)


static func node(seed_value: int, rx: int, ry: int) -> Dictionary:
	var home := rx == 0 and ry == 0
	var kind := "town" if not home and WorldNoise.hash01(rx, ry, seed_value ^ 0x7e61) < 0.45 else "wild"
	var nm := TOWN_NAMES[floori(WorldNoise.hash01(rx, ry, seed_value ^ 0x2b3) * TOWN_NAMES.size())]
	var x := rx * REGION + 20 + floori(WorldNoise.hash01(rx, ry, seed_value ^ 0x1a) * 56)
	var y := ry * REGION + 20 + floori(WorldNoise.hash01(rx, ry, seed_value ^ 0x2b) * 56)
	return {"id": region_id(rx, ry), "rx": rx, "ry": ry, "kind": kind, "name": nm, "x": x, "y": y}


static func by_id(seed_value: int, id: int) -> Dictionary:
	return node(seed_value, floori(id / 2000.0) - 1000, (id % 2000) - 1000)


## Towns within reach of the valley, nearest first. There is always at least one.
static func nearby_towns(seed_value: int) -> Array[Dictionary]:
	if _town_cache.has(seed_value):
		return _town_cache[seed_value]
	var out: Array[Dictionary] = []
	for ry in range(-REACH, REACH + 1):
		for rx in range(-REACH, REACH + 1):
			var n := node(seed_value, rx, ry)
			if n["kind"] == "town" and JsMath.hypot(n["x"], n["y"]) > 90:
				out.append(n)
	if out.is_empty():
		var n2 := node(seed_value, 2, 0)
		n2["kind"] = "town"
		out.append(n2)
	# Stable by distance, as Array.prototype.sort is.
	var keyed: Array[Array] = []
	for i in out.size():
		keyed.append([JsMath.hypot(out[i]["x"], out[i]["y"]), i, out[i]])
	keyed.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]) or (float(a[0]) == float(b[0]) and int(a[1]) < int(b[1])))
	var sorted: Array[Dictionary] = []
	for e in keyed:
		sorted.append(e[2])
	_town_cache[seed_value] = sorted
	return sorted


## Compass words for the direction from the valley to a place.
static func direction(x: float, y: float) -> String:
	var a := atan2(y, x)
	var names := ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]
	return names[(int(JsMath.round_js(a / (PI / 4.0))) + 8) % 8]
