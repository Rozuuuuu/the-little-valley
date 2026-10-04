class_name Levels
## Building levels, Warcraft-style (src/game/sim/levels.ts): an upgrade is paid in full up front,
## then finishes on a timer while the building keeps working. Cancelling returns everything paid.
## Stats a level leaves out carry over from the level below (Building.stat).

## Ticks between checks that remove empty crates (the browser game's LOGISTICS_STEP).
const CRATE_STEP := 25


static func levels_of(b: Building) -> Array:
	return b.def().get("levels", [])


static func level_name(b: Building) -> String:
	var lv := levels_of(b)
	if b.level - 1 < lv.size() and b.level >= 1:
		return str((lv[b.level - 1] as Dictionary).get("name", b.def()["name"]))
	return str(b.def()["name"])


## The next level, or an empty Dictionary at the top.
static func next_level(b: Building) -> Dictionary:
	var lv := levels_of(b)
	return lv[b.level] if b.level < lv.size() else {}


static func _reserved_total(sim: Simulation, res: String) -> int:
	var n := 0
	for b in sim.storages():
		n += int(b.reserved_out.get(res, 0))
	return n


static func _shortfall(sim: Simulation, cost: Dictionary) -> String:
	var parts: PackedStringArray = []
	for e in Inv.entries(cost):
		var n := int(e[1]) - maxi(0, sim.stored_total(e[0]) - _reserved_total(sim, e[0]))
		if n > 0:
			parts.append("%d more %s" % [n, str(Defs.resource(e[0])["name"]).to_lower()])
	return ", ".join(parts)


## The rectangle a building grows into when an upgrade turns it into a bigger type: same
## left edge and bottom row, growing up.
static func grown_rect(b: Building, type: String) -> Rect2i:
	var size: Dictionary = Defs.building(type)["size"]
	return Rect2i(b.x, b.y - maxi(0, int(size["h"]) - b.h), int(size["w"]), int(size["h"]))


## Why a building can't grow into a bigger type in place, or "".
static func room_to_grow(sim: Simulation, b: Building, type: String) -> String:
	var r := grown_rect(b, type)
	var bname := str(Defs.building(type)["name"])
	for y in range(r.position.y, r.end.y):
		for x in range(r.position.x, r.end.x):
			var other: int = sim.occupancy.get(Simulation.tile_key(x, y), -1)
			if other == b.id:
				continue
			if other != -1:
				return "No room to raise the %s: clear the %s beside it first" % [bname, str((sim.buildings[other] as Building).def()["name"]).to_lower()]
			var p := BuildingOps.tile_problem(sim, type, x, y)
			if p != "":
				return "No room to raise the %s beside it: %s%s" % [bname, p.left(1).to_lower(), p.substr(1)]
	return ""


## Rebuilds a building in place as another type (same id, so settlements, homes and work stay).
static func rebuild_as(sim: Simulation, b: Building, type: String) -> void:
	var r := grown_rect(b, type)
	for dy in b.h:
		for dx in b.w:
			sim.occupancy.erase(Simulation.tile_key(b.x + dx, b.y + dy))
	var old := Rect2i(b.x, b.y, b.w, b.h)
	b.type = type
	b.x = r.position.x
	b.y = r.position.y
	b.w = r.size.x
	b.h = r.size.y
	b.level = 1
	for dy in b.h:
		for dx in b.w:
			sim.occupancy[Simulation.tile_key(b.x + dx, b.y + dy)] = b.id
	# Anyone standing where the new walls went steps out to the door.
	var door := b.entrance()
	for s in sim.settlers:
		if s.hidden or s.inside_id == b.id:
			continue
		if b.covers(floori(s.x), floori(s.y)) and s.x >= b.x and s.y >= b.y:
			s.x = door.x + 0.5
			s.px = s.x
			s.y = door.y + 0.5
			s.py = s.y
			s.has_path = false
	var d := b.def()
	if d.has("reveal"):
		sim.world.reveal(b.center_x(), b.center_y(), float(d["reveal"]))
	sim.buildings_changed()
	var all := old.merge(r)
	sim.refresh_nav_rect(all.position.x, all.position.y, all.size.x, all.size.y)
	sim.map_changed()
	if d.has("housing"):
		BuildingOps.assign_homes(sim)


## Why this building can't start an upgrade now, or "".
static func upgrade_problem(sim: Simulation, b: Building) -> String:
	var d := b.def()
	if not d.has("levels"):
		return "The %s has no upgrades" % str(d["name"]).to_lower()
	if not b.built:
		return "Finish building it first"
	if not b.upgrade.is_empty():
		return "Already upgrading"
	var next := next_level(b)
	if next.is_empty():
		return "The %s is already at its highest level" % level_name(b)
	if next.get("requires") != null and not sim.reached.has(str(next["requires"])):
		var ms: Dictionary = (Content.get_value("progression", "MILESTONES") as Dictionary)[str(next["requires"])]
		return "%s needs %s" % [next["name"], ms["name"]]
	if next.get("becomes") != null:
		var room := room_to_grow(sim, b, str(next["becomes"]))
		if room != "":
			return room
	var short := _shortfall(sim, Inv.from_json(next.get("cost", {})))
	return "Not enough in storage: %s" % short if short != "" else ""


static func start_upgrade(sim: Simulation, b: Building) -> Dictionary:
	var problem := upgrade_problem(sim, b)
	if problem != "":
		return {"ok": false, "message": problem}
	var next := next_level(b)
	var paid := {}
	for e in Inv.entries(Inv.from_json(next.get("cost", {}))):
		Inv.add(paid, e[0], sim.withdraw_unreserved(e[0], int(e[1])))
	b.upgrade = {"to": b.level + 1, "progress": 0, "paid": paid}
	sim.upgrading[b.id] = true
	sim.emit({"type": "important"})
	return {"ok": true, "message": "Upgrading to %s. It keeps working meanwhile." % next["name"]}


static func cancel_upgrade(sim: Simulation, b: Building) -> Dictionary:
	if b.upgrade.is_empty():
		return {"ok": false, "message": "Nothing is being upgraded here"}
	var left := {}
	for e in Inv.entries(b.upgrade["paid"]):
		var rest := sim.deposit_anywhere(e[0], int(e[1]), b.center_x(), b.center_y())
		if rest > 0:
			left[e[0]] = rest
	# Whatever the stores can't hold waits in a crate beside it, never lost.
	drop_crate(sim, Vector2(b.x + b.w, b.y + b.h), left)
	b.upgrade = {}
	sim.upgrading.erase(b.id)
	sim.emit({"type": "important"})
	return {"ok": true, "message": "Upgrade cancelled; everything paid is back."}


## Advances every upgrade by one tick.
static func update(sim: Simulation) -> void:
	for id: int in sim.upgrading.keys():
		var b: Building = sim.buildings.get(id)
		var up: Dictionary = b.upgrade if b != null else {}
		var lv: Dictionary = {}
		if b != null and not up.is_empty() and int(up["to"]) - 1 < levels_of(b).size():
			lv = levels_of(b)[int(up["to"]) - 1]
		if b == null or up.is_empty() or lv.is_empty():
			if b != null:
				b.upgrade = {}
			sim.upgrading.erase(id)
			continue
		up["progress"] = int(up["progress"]) + 1
		if int(up["progress"]) < int(lv["time"]):
			continue
		var from := str(b.def()["name"]).to_lower()
		b.upgrade = {}
		sim.upgrading.erase(id)
		if lv.get("becomes") != null:
			if room_to_grow(sim, b, str(lv["becomes"])) != "":
				# Something was built in the way meanwhile: refund rather than overlap it.
				b.upgrade = up.duplicate(true)
				sim.upgrading[id] = true
				cancel_upgrade(sim, b)
				sim.toast("The %s could not be raised: something now stands where it would grow. Everything paid is back." % lv["name"], "warn")
				continue
			rebuild_as(sim, b, str(lv["becomes"]))
		else:
			b.level = int(up["to"])
			sim.buildings_changed()
		var r: Variant = b.stat("reveal")
		if r != null and float(r) > 0:
			sim.world.reveal(b.center_x(), b.center_y(), float(r))
		sim.toast("The %s is now a %s: %s." % [from, lv["name"], ", ".join(PackedStringArray(lv.get("perks", []) as Array))], "good")
		sim.record("built", "Upgraded a %s to a %s" % [from, lv["name"]], b.x, b.y)
		sim.emit({"type": "sfx", "name": "complete", "x": b.center_x(), "y": b.center_y()})
		sim.emit({"type": "important"})
		sim.wake_idle()


# ---- crates -------------------------------------------------------------------------------------

## Leaves goods that fit nowhere in a crate near a spot; settlers use it like a store and it goes
## once empty (src/game/sim/logistics.ts, dropCrate).
static func drop_crate(sim: Simulation, at: Vector2, cargo: Dictionary) -> void:
	if Inv.entries(cargo).is_empty():
		return
	var cx := roundi(at.x)
	var cy := roundi(at.y)
	for r in 8:
		for y in range(cy - r, cy + r + 1):
			for x in range(cx - r, cx + r + 1):
				if maxi(absi(x - cx), absi(y - cy)) != r:
					continue
				if sim.building_at(x, y) != null or not sim.walkable(x, y) or not sim.world.explored(x, y) or Tiles.buildable[sim.world.terrain(x, y)] == 0:
					continue
				var crate := BuildingOps.place(sim, "crate", x, y)
				for e in Inv.entries(cargo):
					Inv.add(crate.inventory, e[0], int(e[1]))
				cargo.clear()
				sim.toast("Goods that fit nowhere wait in a crate: settlers will use it like a store.", "warn")
				return


## Removes empty crates.
static func tidy_crates(sim: Simulation) -> void:
	for b: Building in sim.buildings.values():
		if b.type != "crate":
			continue
		if Inv.total(b.inventory) == 0 and Inv.total(b.reserved_out) == 0 and Inv.total(b.incoming) == 0:
			sim.buildings.erase(b.id)
			sim.occupancy.erase(Simulation.tile_key(b.x, b.y))
			sim.buildings_changed()
			sim.refresh_nav_rect(b.x, b.y, 1, 1)
			sim.map_changed()
