class_name Logistics
## Supply routes between settlements (src/game/sim/logistics.ts). A route keeps a store in another
## settlement stocked to a target. Carts from a caravan depot carry the goods on an abstract leg:
## they leave the source at once (into the manifest), the teamster is away with them, and they are
## unloaded on arrival. Travel time comes from a path over explored land, roads and bridges only,
## found without generating any chunks, so freight can never cross an unbridged river.
##
## A route is {id, sourceId, destId, res, target, status}; a manifest is {id, routeId, crewId,
## sourceId, destId, cargo, state outbound|returning, departTick, arriveTick, legTicks, from, to}.

const STEP := 25
const CART_CAPACITY := 20
## Tiles per tick for a loaded cart.
const CARAVAN_SPEED := 0.2
## Food a teamster takes for the trip, from the source settlement's stores.
const PROVISIONS := 1


## Walkable, explored ground in chunks already loaded: searches never create chunks.
class KnownGround extends PathGrid:
	var sim: Simulation

	func _init(s: Simulation) -> void:
		sim = s

	func walkable(x: int, y: int) -> bool:
		var c := sim.world.peek(x >> Chunk.SHIFT, y >> Chunk.SHIFT)
		if c == null:
			return false
		if c.explored[(y & (Chunk.SIZE - 1)) * Chunk.SIZE + (x & (Chunk.SIZE - 1))] == 0:
			return false
		return sim.walkable(x, y)

	func cost(x: int, y: int) -> float:
		var c := sim.world.peek(x >> Chunk.SHIFT, y >> Chunk.SHIFT)
		if c == null:
			return 1.0
		return Tiles.move_cost[c.terrain[(y & (Chunk.SIZE - 1)) * Chunk.SIZE + (x & (Chunk.SIZE - 1))]]


static func _bname(b: Building) -> String:
	return str(b.def()["name"]).to_lower()


static func _res_name(r: String) -> String:
	return str(Defs.resource(r)["name"]).to_lower()


## The cart's leg between two buildings: {ticks, path: [Vector2i...]}, or empty if no known road
## or bridge joins them. Cached until the map changes.
static func leg(sim: Simulation, from: Building, to: Building) -> Dictionary:
	var k := "%d:%d" % [from.id, to.id]
	if sim.leg_cache.has(k):
		return sim.leg_cache[k]
	var grid := KnownGround.new(sim)
	var start := from.entrance()
	if not grid.walkable(start.x, start.y):
		var found := Vector2i(-99999, 0)
		for y in range(from.y - 1, from.y + from.h + 1):
			for x in range(from.x - 1, from.x + from.w + 1):
				if found.x == -99999 and grid.walkable(x, y):
					found = Vector2i(x, y)
		if found.x == -99999:
			sim.leg_cache[k] = {}
			return {}
		start = found
	var r := GridAStar.find_path(grid, start.x, start.y, GridAStar.Goal.new(to.x, to.y, to.w, to.h, true), 80000)
	var result := {}
	if r != null and r.found:
		var total := 0.0
		var path: Array[Vector2i] = [start]
		for i in r.steps.size() / 2:
			var p := Vector2i(r.steps[i * 2], r.steps[i * 2 + 1])
			total += grid.cost(p.x, p.y)
			path.append(p)
		result = {"ticks": maxi(30, ceili(total / CARAVAN_SPEED)), "path": path}
	sim.leg_cache[k] = result
	return result


## Goods on carts heading to a store (all resources), which must still fit when they arrive.
static func _claimed_space(sim: Simulation, dst_id: int) -> int:
	var n := 0
	for m: Dictionary in sim.manifests:
		if m["state"] == "outbound" and int(m["destId"]) == dst_id:
			n += Inv.total(m["cargo"])
	return n


static func _in_flight(sim: Simulation, dst_id: int, res: String) -> int:
	var n := 0
	for m: Dictionary in sim.manifests:
		if m["state"] == "outbound" and int(m["destId"]) == dst_id:
			n += int((m["cargo"] as Dictionary).get(res, 0))
	return n


## What a store may send away: unreserved stock minus its own stock target and minus the target of
## any route that supplies it with the same goods (so opposing routes never shuttle forever).
static func route_spare(sim: Simulation, b: Building, res: String) -> int:
	var keep := int(b.wants.get(res, 0))
	for r: Dictionary in sim.routes:
		if int(r["destId"]) == b.id and r["res"] == res:
			keep = maxi(keep, int(r["target"]))
	return sim.available(b, res) - keep


## The source settlement's depot and a free teamster at it: [depot or null, crew or null].
static func _teamster(sim: Simulation, src: Building) -> Array:
	var home := Settlements.id_of_building(sim, src)
	var depot: Building = null
	for b: Building in sim.buildings.values():
		if not b.built or not b.def().has("depot"):
			continue
		if sim.settlements.size() > 1 and Settlements.id_of_building(sim, b) != home:
			continue
		if depot == null:
			depot = b
		for id in b.workers:
			var s := sim.settler(id)
			if s != null and s.away_on == -1 and s.life_stage == "adult":
				return [b, s]
	return [depot, null]


static func find_route(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is int or id is float):
		return {}
	for r: Dictionary in sim.routes:
		if int(r["id"]) == int(id):
			return r
	return {}


static func create_route(sim: Simulation, source_id: Variant, dest_id: Variant, res: Variant, target: Variant) -> Dictionary:
	var src: Building = sim.buildings.get(int(source_id)) if (source_id is int or source_id is float) else null
	var dst: Building = sim.buildings.get(int(dest_id)) if (dest_id is int or dest_id is float) else null
	if src == null or dst == null or not src.built or not dst.built or not src.is_storage() or not dst.is_storage():
		return {"ok": false, "message": "A route runs between two finished stores or settlement halls"}
	if src.id == dst.id:
		return {"ok": false, "message": "Choose two different stores"}
	if not (res is String) or not Defs.resource_ids().has(str(res)):
		return {"ok": false, "message": "Choose what to carry"}
	if not (target is int or target is float) or float(target) != floorf(float(target)) or int(target) < 1:
		return {"ok": false, "message": "Choose how much to keep there"}
	var a := Settlements.of_building(sim, src)
	var b := Settlements.of_building(sim, dst)
	if not a.is_empty() and not b.is_empty() and int(a["id"]) == int(b["id"]):
		return {"ok": false, "message": "Both stores are in %s — haulers already move goods within a settlement" % a["name"]}
	for r: Dictionary in sim.routes:
		if int(r["sourceId"]) == src.id and int(r["destId"]) == dst.id and r["res"] == res:
			return {"ok": false, "message": "That route already exists — change its target instead"}
	var route := {"id": sim.alloc_id(), "sourceId": src.id, "destId": dst.id, "res": str(res), "target": mini(int(target), dst.storage_capacity()), "status": ""}
	sim.routes.append(route)
	sim.emit({"type": "important"})
	return {"ok": true, "id": route["id"], "message": "Caravans will keep %d %s at %s's %s, from %s." % [int(route["target"]), _res_name(str(res)),
		Settlements.name_of(sim, int(b["id"]) if not b.is_empty() else -1), _bname(dst), Settlements.name_of(sim, int(a["id"]) if not a.is_empty() else -1)]}


static func set_route_target(sim: Simulation, route_id: Variant, target: Variant) -> Dictionary:
	var r := find_route(sim, route_id)
	if r.is_empty():
		return {"ok": false, "message": "That route is gone"}
	if not (target is int or target is float) or float(target) != floorf(float(target)) or int(target) < 1:
		return {"ok": false, "message": "Invalid target"}
	var dst: Building = sim.buildings.get(int(r["destId"]))
	r["target"] = mini(int(target), dst.storage_capacity()) if dst != null else int(target)
	return {"ok": true, "message": ""}


## Ends a route. A cart already on the road turns round and brings its goods home.
static func cancel_route(sim: Simulation, route_id: Variant) -> Dictionary:
	var r := find_route(sim, route_id)
	if r.is_empty():
		return {"ok": false, "message": "That route is gone"}
	sim.routes.erase(r)
	var turned := 0
	for m: Dictionary in sim.manifests:
		if m["routeId"] != null and int(m["routeId"]) == int(r["id"]) and m["state"] == "outbound":
			m["state"] = "returning"
			m["arriveTick"] = sim.tick + maxi(1, sim.tick - int(m["departTick"]))
			turned += 1
	return {"ok": true, "message": "Route ended. The cart on the road is turning back with its load." if turned > 0 else "Route ended."}


## Plain-language state of a route: {status, carrying}.
static func route_info(sim: Simulation, route_id: int) -> Dictionary:
	var r := find_route(sim, route_id)
	if r.is_empty():
		return {"status": "Gone", "carrying": 0}
	for m: Dictionary in sim.manifests:
		if m["routeId"] != null and int(m["routeId"]) == int(r["id"]):
			var n := int((m["cargo"] as Dictionary).get(r["res"], 0))
			return {"status": "A cart is on the way with %d" % n if m["state"] == "outbound" else "The cart is on its way back", "carrying": n}
	return {"status": str(r["status"]) if str(r["status"]) != "" else "Waiting", "carrying": 0}


static func _dispatch(sim: Simulation, r: Dictionary) -> void:
	var src: Building = sim.buildings.get(int(r["sourceId"]))
	var dst: Building = sim.buildings.get(int(r["destId"]))
	if src == null or dst == null:
		r["status"] = "One of its stores is gone"
		return
	for m: Dictionary in sim.manifests:
		if m["routeId"] != null and int(m["routeId"]) == int(r["id"]):
			r["status"] = ""
			return
	var res: String = r["res"]
	var have := int(dst.inventory.get(res, 0))
	var need := int(r["target"]) - have - _in_flight(sim, dst.id, res)
	if need <= 0:
		r["status"] = "Target reached (%d/%d)" % [have, int(r["target"])]
		return
	var spare := route_spare(sim, src, res)
	if spare <= 0:
		r["status"] = "Waiting: nothing to spare at the %s (it keeps what its own targets ask for)" % _bname(src)
		return
	var room := dst.storage_capacity() - sim.storage_used(dst) - _claimed_space(sim, dst.id)
	if room <= 0:
		r["status"] = "Waiting: the %s is full" % _bname(dst)
		return
	var from := Settlements.of_building(sim, src)
	var from_name := str(from["name"]) if not from.is_empty() else "the source settlement"
	var tm := _teamster(sim, src)
	var depot: Building = tm[0]
	var crew: Settler = tm[1]
	if depot == null:
		r["status"] = "Needs a caravan depot in %s" % from_name
		return
	if crew == null:
		r["status"] = "Needs a teamster: assign a settler to the depot in %s" % from_name
		return
	var way := leg(sim, depot, dst)
	if way.is_empty():
		var to := Settlements.of_building(sim, dst)
		r["status"] = "No road or bridge connects %s and %s over explored land" % [str(from["name"]) if not from.is_empty() else "the depot", str(to["name"]) if not to.is_empty() else "the destination"]
		return
	if Settlements.local_available(sim, int(from["id"]) if not from.is_empty() else -1, "food") < PROVISIONS:
		r["status"] = "Waiting: the teamster needs food for the road"
		return
	var amount := mini(mini(need, spare), mini(room, CART_CAPACITY))
	# Provisions and cargo leave the stores in the same step as the cart.
	sim.withdraw_unreserved("food", PROVISIONS)
	sim.stats["provisions"] = int(sim.stats["provisions"]) + PROVISIONS
	Inv.add(src.inventory, res, -amount)
	SettlerTasks.abort_task(sim, crew)
	var m := {"id": sim.alloc_id(), "routeId": r["id"], "crewId": crew.id, "sourceId": src.id, "destId": dst.id, "cargo": {res: amount},
		"state": "outbound", "departTick": sim.tick, "arriveTick": sim.tick + int(way["ticks"]), "legTicks": int(way["ticks"]),
		"from": {"x": depot.center_x(), "y": float(depot.y + depot.h)}, "to": {"x": dst.center_x(), "y": float(dst.y + dst.h)}}
	sim.manifests.append(m)
	crew.away_on = int(m["id"])
	crew.hidden = true
	crew.task = null
	crew.idle_reason = ""
	sim.stats["caravanTrips"] = int(sim.stats["caravanTrips"]) + 1
	r["status"] = ""
	sim.emit({"type": "sfx", "name": "drop", "x": depot.x + 1.0, "y": depot.y + 1.0})
	var to_st := Settlements.of_building(sim, dst)
	sim.toast("A caravan left for %s with %d %s." % [str(to_st["name"]) if not to_st.is_empty() else "the other settlement", amount, _res_name(res)], "info")


static func _unload(sim: Simulation, b: Building, cargo: Dictionary) -> int:
	if b == null or not b.built or not b.is_storage():
		return 0
	var n := 0
	for e in Inv.entries(cargo):
		var put := sim.deposit(b, e[0], int(e[1]))
		Inv.add(cargo, e[0], -put)
		n += put
	return n


static func _arrive(sim: Simulation, m: Dictionary) -> void:
	if m["state"] == "outbound":
		var dst: Building = sim.buildings.get(int(m["destId"]))
		if _unload(sim, dst, m["cargo"]) > 0:
			sim.stats["caravanDeliveries"] = int(sim.stats["caravanDeliveries"]) + 1
			if dst != null:
				sim.emit({"type": "sfx", "name": "drop", "x": dst.x + 1.0, "y": dst.y + 1.0})
		m["state"] = "returning"
		m["arriveTick"] = sim.tick + int(m["legTicks"])
		return
	# Home again: unload anything left, first into the source, then any store, then a crate.
	var cargo: Dictionary = m["cargo"]
	_unload(sim, sim.buildings.get(int(m["sourceId"])), cargo)
	var fx := float(m["from"]["x"])
	var fy := float(m["from"]["y"])
	for e in Inv.entries(cargo):
		var left := sim.deposit_anywhere(e[0], int(e[1]), fx, fy)
		Inv.add(cargo, e[0], -(int(e[1]) - left))
	Levels.drop_crate(sim, Vector2(fx, fy), cargo)
	sim.manifests.erase(m)
	var crew := sim.settler(int(m["crewId"]))
	if crew != null:
		crew.away_on = -1
		crew.hidden = false
		crew.x = fx
		crew.y = fy + 0.5
		crew.px = crew.x
		crew.py = crew.y
		crew.rpx = crew.x
		crew.rpy = crew.y
		crew.rx = crew.x
		crew.ry = crew.y
		crew.next_think = 0


static func update(sim: Simulation) -> void:
	for m: Dictionary in sim.manifests.duplicate():
		if sim.tick >= int(m["arriveTick"]):
			_arrive(sim, m)
	for r: Dictionary in sim.routes:
		_dispatch(sim, r)


## Where a cart is now, for drawing (tile coordinates).
static func cart_position(sim: Simulation, m: Dictionary, alpha: float = 0.0) -> Vector2:
	var t := clampf((sim.tick + alpha - (int(m["arriveTick"]) - int(m["legTicks"]))) / float(maxi(1, int(m["legTicks"]))), 0.0, 1.0)
	var a := Vector2(float(m["from"]["x"]), float(m["from"]["y"]))
	var b := Vector2(float(m["to"]["x"]), float(m["to"]["y"]))
	if m["state"] != "outbound":
		var tmp := a
		a = b
		b = tmp
	var src: Building = sim.buildings.get(int(m["sourceId"]))
	var dst: Building = sim.buildings.get(int(m["destId"]))
	if src != null and dst != null:
		var depot := _teamster(sim, src)[0] as Building
		if depot != null:
			var way := leg(sim, depot, dst)
			if not way.is_empty():
				var path: Array = way["path"]
				var i := clampi(floori(t * (path.size() - 1)), 0, path.size() - 1)
				if m["state"] != "outbound":
					i = path.size() - 1 - i
				var p: Vector2i = path[i]
				return Vector2(p.x + 0.5, p.y + 0.5)
	return a.lerp(b, t)
