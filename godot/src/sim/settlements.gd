class_name Settlements
## Several settlements (src/game/sim/settlements.ts). A finished waystation founds a new one; each
## owns the stores within its radius, its residents prefer local work, and roads can join them.

## Tiles around a settlement centre that count as part of it.
const RADIUS := 26.0
## Extra "distance" a settler adds to work outside their settlement, so they prefer local jobs.
const AWAY_PENALTY := 60.0
const NAMES: Array[String] = ["Riverside", "Brookhollow", "Fernbank", "Willowmere", "Thistledown", "Amberfield", "Mossgate", "Larkspur",
	"Heatherby", "Cloverdell", "Pinecrest", "Marigold Rise"]


static func center(b: Building) -> Vector2:
	return Vector2(b.center_x(), b.center_y())


static func find(sim: Simulation, id: int) -> Dictionary:
	for st: Dictionary in sim.settlements:
		if int(st["id"]) == id:
			return st
	return {}


static func name_of(sim: Simulation, id: int) -> String:
	if id == -1:
		return "No settlement"
	var st := find(sim, id)
	return str(st["name"]) if not st.is_empty() else "Unknown"


## The settlement whose centre is nearest to a point, within its radius; empty for the wilds.
static func at(sim: Simulation, x: float, y: float) -> Dictionary:
	var best := {}
	var best_d := RADIUS
	for st: Dictionary in sim.settlements:
		var c: Building = sim.buildings.get(int(st["id"]))
		if c == null:
			continue
		var d := JsMath.hypot(c.center_x() - x, c.center_y() - y)
		if d <= best_d:
			best_d = d
			best = st
	return best


static func of_building(sim: Simulation, b: Building) -> Dictionary:
	return at(sim, b.center_x(), b.center_y())


static func id_of_building(sim: Simulation, b: Building) -> int:
	var st := of_building(sim, b)
	return int(st["id"]) if not st.is_empty() else -1


## Stores that belong to a settlement (every store while there is only one settlement).
static func local_stores(sim: Simulation, settlement_id: int) -> Array[Building]:
	var all := sim.storages()
	if sim.settlements.size() <= 1 or settlement_id == -1:
		return all
	var out: Array[Building] = []
	for b in all:
		if id_of_building(sim, b) == settlement_id:
			out.append(b)
	return out


## Unreserved goods in a settlement's own stores.
static func local_available(sim: Simulation, settlement_id: int, res: String) -> int:
	var n := 0
	for b in local_stores(sim, settlement_id):
		n += maxi(0, sim.available(b, res))
	return n


static func residents(sim: Simulation, id: int) -> Array[Settler]:
	var out: Array[Settler] = []
	for s in sim.settlers:
		if s.settlement_id == id:
			out.append(s)
	return out


## A new settlement centre must leave room around the others; "" when it does.
static func spacing_problem(sim: Simulation, type: String, x: int, y: int) -> String:
	var d := Defs.building(type)
	if not d.has("settlementCenter"):
		return ""
	var cx := x + int(d["size"]["w"]) / 2.0
	var cy := y + int(d["size"]["h"]) / 2.0
	for b: Building in sim.buildings.values():
		var other: Dictionary = b.def().get("settlementCenter", {})
		if other.is_empty():
			continue
		var dist := JsMath.hypot(b.center_x() - cx, b.center_y() - cy)
		var need := maxi(int(d["settlementCenter"]["minSpacing"]), int(other["minSpacing"]))
		if dist < need:
			var st := find(sim, b.id)
			var nm := str(st["name"]) if not st.is_empty() else ("another settlement" if b.built else "a planned waystation")
			return "Too close to %s — a new settlement needs %d tiles of room (%d here)" % [nm, need, floori(dist)]
	return ""


## Called when a waystation is finished: a new settlement appears on the map.
static func found(sim: Simulation, b: Building) -> Dictionary:
	var used := {}
	for st: Dictionary in sim.settlements:
		used[str(st["name"])] = true
	var nm := "Settlement %d" % (sim.settlements.size() + 1)
	for n in NAMES:
		if not used.has(n):
			nm = n
			break
	var st := {"id": b.id, "name": nm}
	sim.settlements.append(st)
	sim.toast("%s is founded! Assign settlers to it and give its store some stock targets." % nm, "good")
	sim.record("settlement", "Founded %s" % nm, b.center_x(), b.center_y())
	sim.emit({"type": "important"})
	return st


## Extra cost for work outside a settler's own settlement.
static func away_penalty(sim: Simulation, s: Settler, x: float, y: float) -> float:
	if s.settlement_id == -1 or sim.settlements.size() < 2:
		return 0.0
	var c: Building = sim.buildings.get(s.settlement_id)
	if c == null:
		return 0.0
	return AWAY_PENALTY if JsMath.hypot(c.center_x() - x, c.center_y() - y) > RADIUS else 0.0


static func _is_road(t: int) -> bool:
	return t == Tiles.ROAD or t == Tiles.BRIDGE or t == Tiles.STONE_BRIDGE


static func _road_tiles_near(sim: Simulation, b: Building, reach: int) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for y in range(b.y - reach, b.y + b.h + reach):
		for x in range(b.x - reach, b.x + b.w + reach):
			if _is_road(sim.world.terrain(x, y)):
				out.append(Vector2i(x, y))
	return out


## Whether two settlements are joined by an unbroken road (paths, wooden and stone bridges)
## starting and ending within a few tiles of each centre. Cached until the map changes.
static func road_linked(sim: Simulation, a: int, b: int) -> bool:
	var key := "%d-%d" % [mini(a, b), maxi(a, b)]
	if sim.road_cache.has(key):
		return sim.road_cache[key]
	var ca: Building = sim.buildings.get(a)
	var cb: Building = sim.buildings.get(b)
	var result := false
	if ca != null and cb != null:
		var goal := {}
		for t in _road_tiles_near(sim, cb, 4):
			goal[t] = true
		var queue := _road_tiles_near(sim, ca, 4)
		var seen := {}
		for t in queue:
			seen[t] = true
		var head := 0
		while head < queue.size() and head < 60000 and not goal.is_empty():
			var t := queue[head]
			head += 1
			if goal.has(t):
				result = true
				break
			for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(-1, -1)]:
				var n := t + d
				if seen.has(n) or not _is_road(sim.world.terrain(n.x, n.y)):
					continue
				seen[n] = true
				queue.append(n)
	sim.road_cache[key] = result
	return result


static func any_road_link(sim: Simulation) -> bool:
	for i in sim.settlements.size():
		for j in range(i + 1, sim.settlements.size()):
			if road_linked(sim, int(sim.settlements[i]["id"]), int(sim.settlements[j]["id"])):
				return true
	return false
