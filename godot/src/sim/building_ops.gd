class_name BuildingOps
## Placing, finishing and removing buildings, homes and regrowth (src/game/sim/buildings.ts).
##
## Placement also respects settlement spacing, mine and shore sites, and other kingdoms' land.


static func is_unlocked(sim: Simulation, unlock: Variant) -> bool:
	return unlock == null or str(unlock) == "" or sim.reached.has(str(unlock))


## The building's construction cost (shared for ordinary buildings: do not modify). A span (the
## stone bridge) costs per tile.
static func cost_of(b: Building) -> Dictionary:
	var d := b.def()
	if not d.has("span"):
		return Defs.cost(b.type)
	var out := {}
	for e in Inv.entries(Inv.from_json(d["span"]["costPerTile"])):
		out[e[0]] = int(e[1]) * b.w * b.h
	return out


static func work_of(b: Building) -> float:
	var d := b.def()
	if d.has("span"):
		return float(d["span"]["workPerTile"]) * b.w * b.h
	return float(d.get("work", 0))


static func materials_complete(b: Building) -> bool:
	return Inv.has_all(b.delivered, cost_of(b))


static func camp_of(sim: Simulation) -> Building:
	if not sim.settlements.is_empty():
		var first: Building = sim.buildings.get(int(sim.settlements[0]["id"]))
		if first != null and (first.type == "townHall" or first.type == "camp"):
			return first
	for b: Building in sim.buildings.values():
		if b.type == "townHall" or b.type == "camp":
			return b
	return null


# ---- placement --------------------------------------------------------------------------------

## Why a building can't go on this tile, or "".
static func tile_problem(sim: Simulation, type: String, x: int, y: int) -> String:
	var d := Defs.building(type)
	if not sim.world.explored(x, y):
		return "Explore this area first"
	if sim.occupancy.has(Simulation.tile_key(x, y)):
		return "Something is already built here"
	var t := sim.world.terrain(x, y)
	if t == World.UNKNOWN:
		return "Explore this area first"
	var tdef := Tiles.terrain_def(t)
	var o := sim.world.obj(x, y)
	var placement: String = d.get("placement", "land")
	if placement == "water":
		if t != Tiles.WATER:
			return "Too deep for a wooden bridge — a stone bridge can cross here" if t == Tiles.DEEP_WATER else "Bridges go on shallow water"
		return ""
	if placement == "farmland":
		if float(tdef["fertility"]) <= 0.0:
			return "Nothing grows on %s" % str(tdef["name"]).to_lower()
	elif not bool(tdef["buildable"]):
		return "There is already a path here" if t == Tiles.ROAD else "Can't build on %s" % str(tdef["name"]).to_lower()
	if Tiles.blocks[o] == 1:
		return "Blocked by a %s — harvest it first" % str(Tiles.object_def(o)["name"]).to_lower()
	return ""


static func gate_problem(sim: Simulation, type: String) -> String:
	var d := Defs.building(type)
	if not bool(d.get("buildable", false)):
		return "This cannot be built"
	if not is_unlocked(sim, d.get("unlock")):
		return "Unlocks at %s" % str(d.get("unlock"))
	return ""


## {ok, reason, tiles: [[x, y, ok], ...]} for the placement preview and the command.
static func check_placement(sim: Simulation, type: String, x: int, y: int) -> Dictionary:
	var d := Defs.building(type)
	var size: Dictionary = d["size"]
	var tiles: Array = []
	var reason := gate_problem(sim, type)
	for dy in int(size["h"]):
		for dx in int(size["w"]):
			var p := tile_problem(sim, type, x + dx, y + dy)
			if p != "" and reason == "":
				reason = p
			tiles.append([x + dx, y + dy, p == ""])
	var site := Settlements.spacing_problem(sim, type, x, y)
	if site == "" and d.has("site"):
		site = Mining.site_problem(sim, type, x, y)
	if site == "":
		site = Territory.land_problem(sim, x, y, int(size["w"]), int(size["h"]))
	if site != "":
		if reason == "":
			reason = site
		for t: Array in tiles:
			t[2] = false
	return {"ok": reason == "", "reason": reason, "tiles": tiles}


## What stock is missing to build `count` of a type, or "".
static func shortfall(sim: Simulation, type: String, count: int = 1) -> String:
	var totals := sim.totals()
	var missing: PackedStringArray = []
	for e in Inv.entries(Inv.from_json(Defs.building(type).get("cost", {}))):
		var need: int = int(e[1]) * count
		var have: int = totals.get(e[0], 0)
		if have < need:
			missing.append("%d more %s" % [need - have, str(Defs.resource(e[0])["name"]).to_lower()])
	return ", ".join(missing)


## Creates a building without validation (callers check placement first).
static func place(sim: Simulation, type: String, x: int, y: int, crop: String = "turnip", size: Vector2i = Vector2i.ZERO) -> Building:
	var d := Defs.building(type)
	var b := Building.new()
	b.id = sim.alloc_id()
	b.type = type
	b.x = x
	b.y = y
	b.w = size.x if size.x > 0 else int(d["size"]["w"])
	b.h = size.y if size.y > 0 else int(d["size"]["h"])
	b.placed_tick = sim.tick
	sim.buildings[b.id] = b
	for dy in b.h:
		for dx in b.w:
			var tx := x + dx
			var ty := y + dy
			var k := Simulation.tile_key(tx, ty)
			sim.occupancy[k] = b.id
			var o := sim.world.obj(tx, ty)
			if o != Tiles.O_NONE and o != World.UNKNOWN and Tiles.blocks[o] == 0:
				sim.world.set_obj(tx, ty, Tiles.O_NONE)
				sim.regrowth.erase(k)
			sim.designations.erase(k)
	if type == "field":
		b.field = Farming.new_field(crop)
	Mining.init_site(sim, b)
	sim.buildings_changed()
	sim.refresh_nav_rect(b.x, b.y, b.w, b.h)
	if work_of(b) == 0.0 and cost_of(b).is_empty():
		complete(sim, b, true)
	else:
		sim.map_changed()
	return b


static func complete(sim: Simulation, b: Building, silent: bool = false) -> void:
	var d := b.def()
	b.built = true
	b.progress = work_of(b)
	sim.buildings_changed()
	# Construction materials are consumed.
	for e in Inv.entries(cost_of(b)):
		Inv.add(b.delivered, e[0], -int(e[1]))
	var cx := b.center_x()
	var cy := b.center_y()
	if d.has("convertsTo"):
		for dy in b.h:
			for dx in b.w:
				sim.occupancy.erase(Simulation.tile_key(b.x + dx, b.y + dy))
				sim.world.set_terrain(b.x + dx, b.y + dy, Tiles.ROAD if d["convertsTo"] == "road" else Tiles.BRIDGE)
		sim.buildings.erase(b.id)
		sim.refresh_nav_rect(b.x, b.y, b.w, b.h)
		sim.map_changed()
		if d["convertsTo"] == "road":
			sim.stats["pathsBuilt"] = int(sim.stats["pathsBuilt"]) + b.w * b.h
		sim.emit({"type": "fx", "kind": "dust", "x": cx, "y": cy})
		return
	if b.type == "stoneBridge":
		# The building stays as a landmark; its tiles become stone deck anyone can walk.
		for dy in b.h:
			for dx in b.w:
				sim.world.set_terrain(b.x + dx, b.y + dy, Tiles.STONE_BRIDGE)
	if d.has("recipes"):
		Production.init_workshop(b)
	if b.type == "orchard":
		Orchards.init_orchard(sim, b)
	if d.has("pen"):
		Animals.stock_pen(sim, b)
	if d.has("settlementCenter") and b.type != "camp" and Settlements.find(sim, b.id).is_empty() and not silent:
		Settlements.found(sim, b)
	if d.has("reveal"):
		var r: Variant = b.stat("reveal")
		sim.world.reveal(cx, cy, float(r))
	if d.has("housing"):
		assign_homes(sim)
	sim.refresh_nav_rect(b.x, b.y, b.w, b.h)
	sim.map_changed()
	if not silent:
		sim.emit({"type": "fx", "kind": "sparkle", "x": cx, "y": cy})
		sim.emit({"type": "sfx", "name": "complete", "x": cx, "y": cy})
		if not bool(d.get("paint", false)):
			sim.toast("%s completed!" % d["name"], "good")
			sim.record("built", "Built a %s" % str(d["name"]).to_lower(), cx, cy)
			sim.emit({"type": "important"})


## Cancels a site or demolishes a building. Delivered materials go back to storage; demolishing a
## finished building returns half its cost. Goods that fit nowhere are lost and reported (as in the
## browser game). Returns the message for the player.
static func remove(sim: Simulation, b: Building) -> String:
	var d := b.def()
	var cx := b.center_x()
	var cy := b.center_y()
	sim.buildings.erase(b.id)
	sim.buildings_changed()
	for dy in b.h:
		for dx in b.w:
			sim.occupancy.erase(Simulation.tile_key(b.x + dx, b.y + dy))
	sim.refresh_nav_rect(b.x, b.y, b.w, b.h)
	var lost := 0
	var refund := b.delivered.duplicate()
	if b.built:
		for e in Inv.entries(cost_of(b)):
			Inv.add(refund, e[0], int(e[1]) / 2)
	# An upgrade under way is refunded in full, like a cancel.
	if not b.upgrade.is_empty():
		for e in Inv.entries(b.upgrade["paid"]):
			Inv.add(refund, e[0], int(e[1]))
		b.upgrade = {}
		sim.upgrading.erase(b.id)
	for e in Inv.entries(refund):
		lost += sim.deposit_anywhere(e[0], int(e[1]), cx, cy)
	for e in Inv.entries(b.inventory):
		lost += sim.deposit_anywhere(e[0], int(e[1]), cx, cy)
	var displaced := 0
	for s in sim.settlers:
		if s.home_id == b.id:
			s.home_id = -1
			displaced += 1
		if s.inside_id == b.id:
			s.inside_id = -1
			s.hidden = false
	sim.map_changed()
	# Beds promised to an expected child or a traveller move elsewhere, or wait.
	for c: Dictionary in sim.bed_claims:
		if int(c["homeId"]) == b.id:
			People.relocate_claims(sim, b.id)
			break
	var homeless := assign_homes(sim) if displaced > 0 else 0
	sim.emit({"type": "fx", "kind": "dust", "x": cx, "y": cy})
	sim.emit({"type": "important"})
	var parts: PackedStringArray = ["%s %s." % ["Demolished" if b.built else "Cancelled", d["name"]]]
	if lost > 0:
		parts.append("%d goods didn't fit in storage and were lost." % lost)
	if displaced > 0:
		if homeless > 0:
			parts.append("%d settler%s no bed now and will rest by the campfire until you build another home." % [homeless, "s have" if homeless > 1 else " has"])
			sim.record("shortage", "%d settler%s lost their bed" % [homeless, "s" if homeless > 1 else ""], cx, cy)
		else:
			parts.append("Its %d resident%s moved to other beds." % [displaced, "s" if displaced > 1 else ""])
	return " ".join(parts)


# ---- homes ---------------------------------------------------------------------------------

## Whether settlers can walk from the camp to this home (searched once per 600 ticks per home).
static func bed_reachable(sim: Simulation, b: Building) -> bool:
	var camp := camp_of(sim)
	if camp == null or camp.id == b.id or sim.nav == null:
		return true
	var hit: Array = sim.bed_reach_cache.get(b.id, [])
	if not hit.is_empty() and sim.tick - int(hit[1]) < 600:
		return bool(hit[0])
	var e := camp.entrance()
	var from := e if sim.walkable(e.x, e.y) else Vector2i(camp.x - 1, camp.y)
	var ok := sim.nav.find_path(from.x, from.y, b.goal_adjacent()).found
	sim.bed_reach_cache[b.id] = [ok, sim.tick]
	return ok


## A free bed: a real home first, the hall's bunks last. Null when every reachable bed is taken.
static func find_free_bed(sim: Simulation, counts: Dictionary, permanent_only: bool = false) -> Building:
	var best: Building = null
	var best_score := -1
	for b: Building in sim.buildings.values():
		var beds := b.beds()
		if beds == 0 or int(counts.get(b.id, 0)) >= beds:
			continue
		if permanent_only and not b.is_permanent_home():
			continue
		if not bed_reachable(sim, b):
			continue
		var score := 2 if b.is_permanent_home() else 0
		if score > best_score:
			best_score = score
			best = b
	return best


## Keeps every home within its bed count, moves hall sleepers into real homes when beds free up,
## and gives anyone left over a hall bunk if one is free. Returns how many are left without a bed.
## (Bed claims for expected children and travellers come with households.)
static func assign_homes(sim: Simulation) -> int:
	# Claimed beds (an expected child, a traveller on the way) are not free.
	var counts := People.claim_counts(sim)
	for s in sim.settlers:
		if s.home_id == -1:
			continue
		var home: Building = sim.buildings.get(s.home_id)
		var n: int = counts.get(s.home_id, 0)
		if home == null or n >= home.beds():
			s.home_id = -1
			continue
		counts[s.home_id] = n + 1
	for s in sim.settlers:
		var home: Building = sim.buildings.get(s.home_id) if s.home_id != -1 else null
		if home != null and home.is_permanent_home():
			continue
		var bed := find_free_bed(sim, counts, true)
		if bed == null:
			continue
		if home != null:
			counts[home.id] = int(counts.get(home.id, 1)) - 1
		s.home_id = bed.id
		counts[bed.id] = int(counts.get(bed.id, 0)) + 1
	var homeless := 0
	for s in sim.settlers:
		if s.home_id != -1:
			continue
		var bed := find_free_bed(sim, counts)
		if bed == null:
			homeless += 1
			continue
		s.home_id = bed.id
		counts[bed.id] = int(counts.get(bed.id, 0)) + 1
	return homeless


# ---- regrowth -------------------------------------------------------------------------------

static func update_regrowth(sim: Simulation) -> void:
	for k: int in sim.regrowth.keys():
		var r: Array = sim.regrowth[k]
		if sim.tick < int(r[1]):
			continue
		var x := Simulation.key_x(k)
		var y := Simulation.key_y(k)
		sim.regrowth.erase(k)
		if sim.occupancy.has(k) or not sim.world.is_loaded(x >> Chunk.SHIFT, y >> Chunk.SHIFT):
			if not sim.occupancy.has(k):
				sim.regrowth[k] = [r[0], sim.tick + 200]
			continue
		var to: int = r[0]
		# Berry bushes wait for the thaw.
		if to == Tiles.O_BERRY and not bool((sim.season()["def"] as Dictionary)["berriesRegrow"]):
			sim.regrowth[k] = [r[0], sim.tick + 400]
			continue
		if to == Tiles.O_OAK and WorldNoise.hash01(x, y, sim.seed_value ^ 0x7ee) < 0.35:
			to = Tiles.O_PINE
		# Never grow a blocking object on top of a settler.
		if Tiles.blocks[to] == 1:
			var blocked := false
			for s in sim.settlers:
				if s.tile_x() == x and s.tile_y() == y:
					blocked = true
					break
			if blocked:
				sim.regrowth[k] = [r[0], sim.tick + 200]
				continue
		sim.world.set_obj(x, y, to)
		var od := Tiles.object_def(to)
		if od.has("regrow"):
			sim.regrowth[k] = [int(od["regrow"]["to"]), sim.tick + int(od["regrow"]["ticks"])]


static func schedule_regrowth(sim: Simulation, x: int, y: int) -> void:
	var od := Tiles.object_def(sim.world.obj(x, y))
	if od.has("regrow"):
		sim.regrowth[Simulation.tile_key(x, y)] = [int(od["regrow"]["to"]), sim.tick + int(od["regrow"]["ticks"]) + floori(sim.rng.next() * Defs.DAY_TICKS * 0.3)]


## A span building (the stone bridge) runs straight over water only, with dry, walkable land just
## beyond both ends; the drag snaps to its longer axis. {ok, reason, tiles, rect: Rect2i}.
static func check_span(sim: Simulation, type: String, x0: int, y0: int, x1: int, y1: int) -> Dictionary:
	var d := Defs.building(type)
	var span: Dictionary = d["span"]
	var horizontal := absi(x1 - x0) >= absi(y1 - y0)
	if horizontal:
		y1 = y0
	else:
		x1 = x0
	var rect := Rect2i(mini(x0, x1), mini(y0, y1), absi(x1 - x0) + 1, absi(y1 - y0) + 1)
	var length := maxi(rect.size.x, rect.size.y)
	var tiles: Array = []
	var reason := gate_problem(sim, type)
	for dy in rect.size.y:
		for dx in rect.size.x:
			var tx := rect.position.x + dx
			var ty := rect.position.y + dy
			var p := ""
			if not sim.world.explored(tx, ty):
				p = "Explore this area first"
			elif sim.occupancy.has(Simulation.tile_key(tx, ty)):
				p = "Something is already built here"
			elif sim.world.terrain(tx, ty) != Tiles.WATER and sim.world.terrain(tx, ty) != Tiles.DEEP_WATER:
				p = "A stone bridge spans water only — start and end at the banks"
			if p != "" and reason == "":
				reason = p
			tiles.append([tx, ty, p == ""])
	if reason == "" and length < int(span["min"]):
		reason = "Too short: a bridge needs at least %d water tiles" % int(span["min"])
	if reason == "" and length > int(span["max"]):
		reason = "Too long: %d tiles at most — look for a narrower crossing" % int(span["max"])
	if reason == "":
		var ends: Array[Vector2i] = []
		if horizontal:
			ends.append_array([Vector2i(rect.position.x - 1, rect.position.y), Vector2i(rect.end.x, rect.position.y)])
		else:
			ends.append_array([Vector2i(rect.position.x, rect.position.y - 1), Vector2i(rect.position.x, rect.end.y)])
		for e in ends:
			var t := sim.world.terrain(e.x, e.y)
			if t == Tiles.WATER or t == Tiles.DEEP_WATER:
				reason = "Both ends must reach dry land — extend the bridge to the bank"
				break
			if not sim.world.explored(e.x, e.y) or not sim.walkable(e.x, e.y):
				reason = "Each end needs open, explored ground to walk onto"
				break
	return {"ok": reason == "", "reason": reason, "tiles": tiles, "rect": rect}
