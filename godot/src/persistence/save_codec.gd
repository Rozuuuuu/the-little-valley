class_name SaveCodec
## Saves in the browser game's JSON layout (version 15, docs/../src/game/save/format.ts), so Godot
## saves and browser saves are read by the same code.
##
## What is saved is authoritative state only. Tasks, paths, reservations, goods promised in transit,
## the occupancy map, navigation and indexes are rebuilt after loading, as in the browser game:
## settlers choose work again, so no reservation can outlive its task.
##
## Loading never drops data silently. `decode` returns a report of everything in the file that this
## version cannot simulate yet (systems not ported); callers show it and let the player decide.
## The file itself is never modified by loading.

const VERSION := 15
## Marks files written by the Godot version.
const PRODUCER := "little-valley-godot"


# ---- writing -----------------------------------------------------------------------------------

static func encode(sim: Simulation, save_name: String, created_at: int, view: Dictionary = {}) -> Dictionary:
	var settlers: Array = []
	for s in sim.settlers:
		var d := {
			"id": s.id, "name": s.name, "x": s.x, "y": s.y, "facing": s.facing, "job": s.job,
			"carrying": {"res": s.carry_res, "amount": s.carry_amount} if s.carrying() else null,
			"hunger": s.hunger, "energy": s.energy, "homeId": _id_or_null(s.home_id), "appearance": s.appearance.duplicate(),
			"focus": s.focus.duplicate() if not s.focus.is_empty() else null,
			"areaId": _id_or_null(s.area_id), "priorities": s.priorities.duplicate() if s.has_priorities else null,
			"settlementId": _id_or_null(s.settlement_id), "lifeStage": s.life_stage, "ageTicks": 0, "householdId": null,
			"awayOn": null, "kingdomId": 0, "military": null, "captive": null,
		}
		if s.side_job != "":
			d["sideJob"] = s.side_job
		if s.hold:
			d["hold"] = true
		settlers.append(d)
	var buildings: Array = []
	for b: Building in sim.buildings.values():
		var d := {
			"id": b.id, "type": b.type, "x": b.x, "y": b.y, "built": b.built, "progress": b.progress,
			"delivered": b.delivered.duplicate(), "inventory": b.inventory.duplicate(), "placedTick": b.placed_tick,
			"workers": b.workers.duplicate(), "wants": b.wants.duplicate(),
		}
		if b.is_field():
			var f := b.field
			d["field"] = {"crop": f["crop"] if f["crop"] != "" else null, "state": f["state"], "growth": f["growth"], "moisture": f["moisture"]}
		if b.level > 1:
			d["level"] = b.level
		buildings.append(d)
	var designations: Array = []
	for k: int in sim.designations.keys():
		designations.append([Simulation.key_x(k), Simulation.key_y(k)])
	var regrowth: Array = []
	for k: int in sim.regrowth:
		var r: Array = sim.regrowth[k]
		regrowth.append([Simulation.key_x(k), Simulation.key_y(k), r[0], r[1]])
	var chunks: Array = []
	for k: int in _saved_chunk_keys(sim):
		var cx := World.key_cx(k)
		var cy := World.key_cy(k)
		var c := sim.world.peek(cx, cy)
		var bits := sim.world.explored_bits(cx, cy)
		if bits.is_empty():
			bits.resize(World.BITSET_BYTES)
		var sc := {"cx": cx, "cy": cy, "explored": Marshalls.raw_to_base64(bits)}
		if c != null and c.modified:
			sc["terrain"] = Marshalls.raw_to_base64(c.terrain)
			sc["obj"] = Marshalls.raw_to_base64(c.obj)
			sc["amt"] = Marshalls.raw_to_base64(c.amt)
		chunks.append(sc)
	var adults := 0
	for s in sim.settlers:
		if s.life_stage == "adult":
			adults += 1
	return {
		"version": VERSION,
		"producer": PRODUCER,
		"meta": {
			"name": save_name, "seed": sim.seed_value, "createdAt": created_at, "savedAt": int(Time.get_unix_time_from_system() * 1000),
			"day": sim.day(), "population": adults, "milestone": sim.reached[sim.reached.size() - 1],
		},
		"sim": {
			"tick": sim.tick, "nextId": sim.next_id, "rngState": sim.rng.state, "lastArrival": 0,
			"settlers": settlers, "buildings": buildings, "designations": designations, "regrowth": regrowth,
			"stats": sim.stats.duplicate(), "reached": sim.reached.duplicate(),
			"weather": {"raining": sim.raining, "nextChange": sim.weather_next_change},
			"workAreas": [], "chronicle": sim.chronicle.duplicate(true),
			"session": sim.session.duplicate(true) if not sim.session.is_empty() else null,
			"settlements": sim.settlements.duplicate(true),
			# Systems not in this version yet, written empty so the layout stays complete.
			"growthMode": "deliberate", "households": [], "bedClaims": [], "offer": null, "nextVisitor": 0, "recruits": [], "lastRecruit": null,
			"geology": {"version": 1, "cells": []}, "routes": [], "manifests": [], "parties": [], "knownRegions": [], "nextMerchant": 0,
			"claims": [], "horseDay": 0, "animals": [],
		},
		"world": {"genVersion": sim.world.gen, "habitat": sim.world.habitat_id, "chunks": chunks},
		"view": view,
	}


static func _id_or_null(id: int) -> Variant:
	return null if id == -1 else id


## Chunks that must be saved: explored or modified.
static func _saved_chunk_keys(sim: Simulation) -> Array[int]:
	var keys := sim.world.explored_chunk_keys()
	var seen := {}
	for k in keys:
		seen[k] = true
	for k: int in sim.world.loaded_keys():
		if not seen.has(k) and sim.world.peek(World.key_cx(k), World.key_cy(k)).modified:
			keys.append(k)
	keys.sort()
	return keys


# ---- reading -----------------------------------------------------------------------------------

## Parses and validates a save. Returns {sim: Simulation or null, error: String, report: [String]}.
## `report` lists data present in the file that this version does not simulate yet.
static func decode(save: Variant) -> Dictionary:
	if not save is Dictionary:
		return _fail("This file is not a Little Valley save")
	var d: Dictionary = save
	var version := int(d.get("version", -1))
	if version > VERSION:
		return _fail("This save is from a newer version of Little Valley (save version %d); this version reads up to %d" % [version, VERSION])
	if version < VERSION:
		return _fail("This save is from an older version (save version %d). Converting older saves is not in this version yet; the file was not changed" % version)
	for section: String in ["meta", "sim", "world"]:
		if not d.get(section) is Dictionary:
			return _fail("The save is damaged: its %s section is missing" % section)
	var problems := validate(d)
	if not problems.is_empty():
		return _fail("The save is damaged: " + problems[0])
	var report := unsupported(d)
	var w: Dictionary = d["world"]
	var gen := int(w.get("genVersion", 1))
	if not WorldGen.SUPPORTED_GENS.has(gen):
		return _fail("This save uses world generator %d, which this version does not know" % gen)
	var meta: Dictionary = d["meta"]
	var sd: Dictionary = d["sim"]
	var sim := Simulation.new(int(meta["seed"]), int(sd["rngState"]), gen, str(w.get("habitat", "valley")), true)
	sim.tick = int(sd["tick"])
	sim.next_id = int(sd["nextId"])
	sim.reached.clear()
	for m: Variant in sd.get("reached", ["camp"]):
		sim.reached.append(str(m))
	for k: String in (sd.get("stats", {}) as Dictionary):
		sim.stats[k] = int(sd["stats"][k])
	var weather: Dictionary = sd.get("weather", {})
	sim.raining = bool(weather.get("raining", false))
	sim.weather_next_change = int(weather.get("nextChange", sim.tick))
	for c: Dictionary in sd.get("chronicle", []):
		sim.chronicle.append(c.duplicate(true))
	if sd.get("session") is Dictionary:
		sim.session = (sd["session"] as Dictionary).duplicate(true)
	for st: Dictionary in sd.get("settlements", []):
		sim.settlements.append({"id": int(st["id"]), "name": str(st["name"])})

	# World: modified chunks are restored as saved; explored-only chunks keep their bitset and
	# regenerate when needed (the generator is bit-identical to the one that made them).
	for sc: Dictionary in w.get("chunks", []):
		var bits := Marshalls.base64_to_raw(str(sc["explored"]))
		if sc.has("terrain") and sc.has("obj") and sc.has("amt"):
			sim.world.install_saved(int(sc["cx"]), int(sc["cy"]), Marshalls.base64_to_raw(str(sc["terrain"])),
				Marshalls.base64_to_raw(str(sc["obj"])), Marshalls.base64_to_raw(str(sc["amt"])), bits)
		else:
			sim.world.set_explored_bits(int(sc["cx"]), int(sc["cy"]), bits)

	for bd: Dictionary in sd.get("buildings", []):
		var b := Building.new()
		b.id = int(bd["id"])
		b.type = str(bd["type"])
		b.x = int(bd["x"])
		b.y = int(bd["y"])
		var def := Defs.building(b.type)
		b.w = int(bd["w"]) if bd.has("w") else int(def["size"]["w"])
		b.h = int(bd["h"]) if bd.has("h") else int(def["size"]["h"])
		b.built = bool(bd["built"])
		b.progress = float(bd["progress"])
		b.delivered = Inv.from_json(bd.get("delivered", {}))
		b.inventory = Inv.from_json(bd.get("inventory", {}))
		b.placed_tick = int(bd.get("placedTick", 0))
		b.level = int(bd.get("level", 1))
		for wid: Variant in bd.get("workers", []):
			b.workers.append(int(wid))
		b.wants = Inv.from_json(bd.get("wants", {}))
		if bd.get("field") is Dictionary:
			var f: Dictionary = bd["field"]
			b.field = {"crop": "" if f["crop"] == null else str(f["crop"]), "state": str(f["state"]), "growth": float(f["growth"]), "moisture": float(f["moisture"])}
		sim.buildings[b.id] = b
		for dy in b.h:
			for dx in b.w:
				sim.occupancy[Simulation.tile_key(b.x + dx, b.y + dy)] = b.id
	sim.buildings_changed()

	for sv: Dictionary in sd.get("settlers", []):
		var s := Settler.new()
		s.id = int(sv["id"])
		s.name = str(sv["name"])
		s.x = float(sv["x"])
		s.y = float(sv["y"])
		s.px = s.x
		s.py = s.y
		s.facing = int(sv.get("facing", 0))
		s.job = str(sv["job"])
		if sv.get("carrying") is Dictionary:
			s.set_carry(str(sv["carrying"]["res"]), int(sv["carrying"]["amount"]))
		s.hunger = float(sv["hunger"])
		s.energy = float(sv["energy"])
		s.home_id = int(sv["homeId"]) if sv.get("homeId") != null else -1
		s.appearance = (sv.get("appearance", {}) as Dictionary).duplicate()
		if sv.get("focus") is Dictionary:
			var f: Dictionary = sv["focus"]
			s.focus = {"res": str(f["res"]), "x": int(f["x"]), "y": int(f["y"]), "until": int(f["until"])}
		if sv.get("priorities") is Array:
			s.has_priorities = true
			for k: Variant in sv["priorities"]:
				s.priorities.append(str(k))
		s.settlement_id = int(sv["settlementId"]) if sv.get("settlementId") != null else -1
		s.life_stage = str(sv.get("lifeStage", "adult"))
		s.side_job = str(sv.get("sideJob", "")) if sv.get("sideJob") != null else ""
		s.hold = bool(sv.get("hold", false))
		s.capacity = Simulation.SETTLER_CAPACITY
		sim._add_settler_object(s)

	for p: Array in sd.get("designations", []):
		sim.designations.add(Simulation.tile_key(int(p[0]), int(p[1])))
	for r: Array in sd.get("regrowth", []):
		sim.regrowth[Simulation.tile_key(int(r[0]), int(r[1]))] = [int(r[2]), int(r[3])]

	# The land around the first settlement is generated before play continues.
	var camp := BuildingOps.camp_of(sim)
	var centre := Vector2i(camp.x, camp.y) if camp != null else Vector2i.ZERO
	var ccx := centre.x >> Chunk.SHIFT
	var ccy := centre.y >> Chunk.SHIFT
	for cy in range(ccy - NewGame.START_CHUNKS, ccy + NewGame.START_CHUNKS):
		for cx in range(ccx - NewGame.START_CHUNKS, ccx + NewGame.START_CHUNKS):
			sim.world.request(cx, cy)
	sim.world.finish_pending()
	sim.setup_nav(centre.x, centre.y)
	BuildingOps.assign_homes(sim)
	sim.last_season = str(sim.season()["id"])
	return {"sim": sim, "error": "", "report": report}


static func _fail(message: String) -> Dictionary:
	return {"sim": null, "error": message, "report": PackedStringArray()}


## Structural problems that make a save unusable (empty when it is sound).
static func validate(d: Dictionary) -> PackedStringArray:
	var out: PackedStringArray = []
	var sd: Dictionary = d["sim"]
	for k: String in ["tick", "nextId", "rngState", "settlers", "buildings"]:
		if not sd.has(k):
			out.append("sim.%s is missing" % k)
	if not out.is_empty():
		return out
	var ids := {}
	var building_ids := {}
	for bd: Variant in sd["buildings"]:
		if not bd is Dictionary or not (bd as Dictionary).has("id") or not (bd as Dictionary).has("type"):
			out.append("a building has no id or type")
			continue
		var id := int(bd["id"])
		if ids.has(id):
			out.append("id %d is used twice" % id)
		ids[id] = true
		building_ids[id] = true
		if not Defs.is_building(str(bd["type"])):
			out.append("building %d has an unknown type “%s”" % [id, bd["type"]])
		for inv_key: String in ["delivered", "inventory"]:
			for r: String in (bd.get(inv_key, {}) as Dictionary):
				if int(bd[inv_key][r]) < 0:
					out.append("building %d has a negative %s of %s" % [id, inv_key, r])
	for sv: Variant in sd["settlers"]:
		if not sv is Dictionary or not (sv as Dictionary).has("id"):
			out.append("a settler has no id")
			continue
		var id := int(sv["id"])
		if ids.has(id):
			out.append("id %d is used twice" % id)
		ids[id] = true
		if not Defs.is_job(str(sv.get("job", ""))):
			out.append("settler %d has an unknown job “%s”" % [id, sv.get("job")])
		if sv.get("homeId") != null and not building_ids.has(int(sv["homeId"])):
			out.append("settler %d lives in building %d, which does not exist" % [id, int(sv["homeId"])])
		if sv.get("carrying") is Dictionary and int(sv["carrying"]["amount"]) < 0:
			out.append("settler %d carries a negative amount" % id)
	for k: int in ids:
		if k >= int(sd["nextId"]):
			out.append("id %d is not below nextId %d" % [k, int(sd["nextId"])])
			break
	for st: Variant in sd.get("settlements", []):
		if not building_ids.has(int((st as Dictionary).get("id", -1))):
			out.append("a settlement's centre building does not exist")
	for sc: Variant in (d["world"] as Dictionary).get("chunks", []):
		var c: Dictionary = sc
		if Marshalls.base64_to_raw(str(c.get("explored", ""))).size() != World.BITSET_BYTES:
			out.append("chunk %s,%s has damaged exploration data" % [c.get("cx"), c.get("cy")])
		for layer: String in ["terrain", "obj", "amt"]:
			if c.has(layer) and Marshalls.base64_to_raw(str(c[layer])).size() != Chunk.AREA:
				out.append("chunk %s,%s has damaged %s data" % [c.get("cx"), c.get("cy"), layer])
	return out


## Everything in a save that this version does not simulate yet, in words for the player.
static func unsupported(d: Dictionary) -> PackedStringArray:
	var out: PackedStringArray = []
	var sd: Dictionary = d["sim"]
	var counts := {
		"workAreas": "work area", "households": "household", "bedClaims": "promised bed", "recruits": "traveller on the way",
		"routes": "supply route", "manifests": "caravan on the road", "parties": "merchant", "animals": "animal", "claims": "land claim",
	}
	for k: String in counts:
		var n := (sd.get(k, []) as Array).size() if sd.get(k) is Array else 0
		if n > 0:
			out.append("%d %s%s" % [n, counts[k], "" if n == 1 else "s"])
	if sd.get("offer") is Dictionary:
		out.append("a visitor waiting to be welcomed")
	if sd.get("geology") is Dictionary and not (sd["geology"]["cells"] as Array).is_empty():
		out.append("%d surveyed ground cells" % (sd["geology"]["cells"] as Array).size())
	if sd.get("kingdoms") is Array:
		var ks: Array = sd["kingdoms"]
		if ks.size() > 1:
			out.append("%d known kingdoms" % (ks.size() - 1))
		if not ks.is_empty() and (ks[0] as Dictionary).get("crowned", false):
			out.append("a crowned kingdom (treasury, council and land)")
	if sd.get("diplomacy") is Dictionary:
		var dip: Dictionary = sd["diplomacy"]
		var n := 0
		for k: String in ["reports", "offers", "incidents", "warnings", "warPlans", "commitments"]:
			n += (dip.get(k, []) as Array).size()
		if n > 0:
			out.append("%d diplomatic records (news, treaties, warnings)" % n)
	if sd.get("war") is Dictionary and not (sd["war"].get("states", []) as Array).is_empty():
		out.append("a war in progress")
	var special := {"ruler": 0, "military": 0, "training": 0, "child": 0, "household": 0}
	for sv: Dictionary in sd.get("settlers", []):
		if sv.get("ruler", false):
			special["ruler"] += 1
		if sv.get("military") != null:
			special["military"] += 1
		if sv.get("training") != null:
			special["training"] += 1
		if sv.get("lifeStage", "adult") == "child":
			special["child"] += 1
	if special["ruler"] > 0:
		out.append("the ruler (they would load as an ordinary settler)")
	if special["military"] > 0:
		out.append("%d soldiers" % special["military"])
	if special["training"] > 0:
		out.append("%d settlers training a new role" % special["training"])
	if special["child"] > 0:
		out.append("%d children (growing up is not in this version yet)" % special["child"])
	var simulated := {"townHall": true, "camp": true, "house": true, "familyHome": true, "cottage": true, "storehouse": true, "field": true, "path": true, "bridge": true}
	var others := {}
	for bd: Dictionary in sd.get("buildings", []):
		var t := str(bd["type"])
		if not simulated.has(t):
			others[t] = int(others.get(t, 0)) + 1
	for t: String in others:
		out.append("%d %s (kept, but not working in this version yet)" % [others[t], str(Defs.building(t)["name"]).to_lower()])
	return out
