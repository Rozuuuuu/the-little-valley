class_name Migrations
extends RefCounted
## Upgrades older browser saves one version at a time, step for step the same as
## src/game/save/migrations.ts. `step(n)` turns a version-n save into version n+1. The input is
## never changed: every step works on a deep copy, so a refused file is left as it came.


## Runs every step from the save's version up to `target`. Returns {save, error}.
static func migrate(raw: Dictionary, target: int) -> Dictionary:
	var v: Variant = raw.get("version")
	if not (v is int or v is float) or float(v) != floorf(float(v)) or int(v) < 1:
		return {"save": null, "error": "The save has no valid version"}
	var version := int(v)
	if version > target:
		return {"save": null, "error": "This save is from a newer version of Little Valley (save version %d)" % version}
	var save: Dictionary = raw.duplicate(true)
	while version < target:
		if version < 1 or version > 14:
			return {"save": null, "error": "There is no conversion from save version %d" % version}
		save = step(version, save)
		version = int(save["version"])
	return {"save": save, "error": ""}


static func step(version: int, save: Dictionary) -> Dictionary:
	match version:
		1: return _v1(save)
		2: return _v2(save)
		3: return _v3(save)
		4: return _v4(save)
		5: return _v5(save)
		6: return _v6(save)
		7: return _v7(save)
		8: return _v8(save)
		9: return _v9(save)
		10: return _v10(save)
	# v11 → v15 only bump the version: levels, health, roles and side jobs start empty.
	var out := save.duplicate()
	out["version"] = version + 1
	return out


static func _stats(sim: Dictionary) -> Dictionary:
	var given: Variant = sim.get("stats")
	return Simulation.empty_stats().merged(given if given is Dictionary else {}, true)


static func _list(d: Dictionary, key: String) -> Array:
	var v: Variant = d.get(key)
	return v if v is Array else []


## Every entry of `list` with `extra` merged over it (the browser's `{...s, ...extra}`).
static func _each(list: Array, extra: Dictionary) -> Array:
	var out := []
	for item: Variant in list:
		out.append((item as Dictionary).merged(extra, true) if item is Dictionary else item)
	return out


static func _or(d: Dictionary, key: String, fallback: Variant) -> Variant:
	var v: Variant = d.get(key)
	return fallback if v == null else v


## v1 was the prototype: everything at the top level and the generic job was called "worker".
static func _v1(v1: Dictionary) -> Dictionary:
	var settlers := []
	for s: Variant in _list(v1, "settlers"):
		var o: Dictionary = (s as Dictionary).duplicate()
		if o.get("job") == "worker":
			o["job"] = "laborer"
		o["energy"] = _or(o, "energy", 100)
		o["focus"] = null
		settlers.append(o)
	var buildings := []
	for b: Variant in _list(v1, "buildings"):
		buildings.append({"placedTick": 0, "delivered": {}, "inventory": {}}.merged(b as Dictionary, true))
	var tick: Variant = _or(v1, "tick", 0)
	return {
		"version": 2,
		"meta": {
			"name": _or(v1, "name", "Old valley"), "seed": v1.get("seed"),
			"createdAt": _or(v1, "createdAt", _or(v1, "savedAt", 0)), "savedAt": _or(v1, "savedAt", 0),
			"day": _or(v1, "day", 1), "population": settlers.size(), "milestone": "camp",
		},
		"sim": {
			"tick": tick, "nextId": v1.get("nextId"), "rngState": _or(v1, "rngState", v1.get("seed")), "lastArrival": 0,
			"settlers": settlers, "buildings": buildings,
			"designations": _or(v1, "designations", []), "regrowth": _or(v1, "regrowth", []),
			"stats": _stats(v1), "reached": _or(v1, "reached", ["camp"]),
			"weather": {"raining": false, "nextChange": float(tick) + 2000},
		},
		"world": {"chunks": _or(v1, "chunks", [])},
	}


## v2 → v3: generator version, work areas, work orders, production workers, the chronicle.
static func _v2(v2: Dictionary) -> Dictionary:
	var sim: Dictionary = v2["sim"]
	var out := v2.duplicate()
	out["version"] = 3
	out["sim"] = sim.merged({
		"settlers": _each(_list(sim, "settlers"), {"areaId": null, "priorities": null}),
		"buildings": _each(_list(sim, "buildings"), {"workers": []}),
		"stats": _stats(sim), "workAreas": [], "chronicle": [], "session": null,
	}, true)
	out["world"] = (v2["world"] as Dictionary).merged({"genVersion": 1}, true)
	return out


## v3 → v4: the camp becomes the first settlement, named after the valley.
static func _v3(v3: Dictionary) -> Dictionary:
	var sim: Dictionary = v3["sim"]
	var buildings := _list(sim, "buildings")
	var camp_id: Variant = null
	for b: Variant in buildings:
		if b is Dictionary and b.get("type") == "camp":
			camp_id = b.get("id")
			break
	var meta: Variant = v3.get("meta")
	var vname := "Home"
	if meta is Dictionary and meta.get("name") is String and str(meta["name"]) != "":
		vname = meta["name"]
	var out := v3.duplicate()
	out["version"] = 4
	out["sim"] = sim.merged({
		"settlers": _each(_list(sim, "settlers"), {"settlementId": camp_id}),
		"buildings": _each(buildings, {"wants": {}}),
		"settlements": [{"id": camp_id, "name": vname}] if camp_id != null else [],
		"stats": _stats(sim),
	}, true)
	return out


## v4 → v5: everyone is an adult with no household; old worlds keep their newcomer arrivals.
static func _v4(v4: Dictionary) -> Dictionary:
	var sim: Dictionary = v4["sim"]
	var out := v4.duplicate()
	out["version"] = 5
	out["sim"] = sim.merged({
		"settlers": _each(_list(sim, "settlers"), {"lifeStage": "adult", "ageTicks": 0, "householdId": null}),
		"stats": _stats(sim), "growthMode": "legacy", "households": [], "bedClaims": [], "offer": null,
		"nextVisitor": 0, "recruits": [], "lastRecruit": null,
	}, true)
	return out


## v5 → v6: geology, nothing surveyed yet.
static func _v5(v5: Dictionary) -> Dictionary:
	var sim: Dictionary = v5["sim"]
	var out := v5.duplicate()
	out["version"] = 6
	out["sim"] = sim.merged({"stats": _stats(sim), "geology": {"version": 1, "cells": []}}, true)
	return out


## v6 → v7: routes, caravans, merchants and known towns, none yet; nobody is away.
static func _v6(v6: Dictionary) -> Dictionary:
	var sim: Dictionary = v6["sim"]
	var out := v6.duplicate()
	out["version"] = 7
	out["sim"] = sim.merged({
		"settlers": _each(_list(sim, "settlers"), {"awayOn": null}),
		"stats": _stats(sim), "routes": [], "manifests": [], "parties": [], "knownRegions": [], "nextMerchant": 0,
	}, true)
	return out


## v7 → v8: the player's kingdom, named after the first settlement; merchants get purses.
static func _v7(v7: Dictionary) -> Dictionary:
	var sim: Dictionary = v7["sim"]
	var settlements := _list(sim, "settlements")
	var kname := "The Valley"
	if not settlements.is_empty() and settlements[0] is Dictionary and settlements[0].get("name") is String:
		kname = settlements[0]["name"]
	var out := v7.duplicate()
	out["version"] = 8
	out["sim"] = sim.merged({
		"settlers": _each(_list(sim, "settlers"), {"kingdomId": 0}),
		"parties": _each(_list(sim, "parties"), {"coins": 50}),
		"kingdoms": [Kingdoms.new_player(kname)], "claims": [],
	}, true)
	return out


## v8 → v9: temperaments and rival companies; no news, treaties or wars yet.
static func _v8(v8: Dictionary) -> Dictionary:
	var sim: Dictionary = v8["sim"]
	var kingdoms := []
	for k: Variant in _list(sim, "kingdoms"):
		var kd: Dictionary = k
		var player: bool = kd.get("player") == true
		var id := int(kd.get("id", 0))
		kingdoms.append(kd.merged({
			"personality": "cautious" if player else ["cautious", "mercantile", "proud"][id % 3],
			"companies": [] if player else Diplomacy.rival_companies(id),
		}, true))
	var out := v8.duplicate()
	out["version"] = 9
	out["sim"] = sim.merged({
		"kingdoms": kingdoms,
		"diplomacy": {
			"worldEvents": [], "reports": [], "newsSummaries": [], "stances": [], "trust": [], "wars": [], "offers": [],
			"incidents": [], "warnings": [], "concernStates": [], "warPlans": [], "commitments": [], "diplomacyDay": 0, "lastProsperity": 0,
		},
	}, true)
	return out


## v9 → v10: the army; nobody has enlisted and horses have never been fed.
static func _v9(v9: Dictionary) -> Dictionary:
	var sim: Dictionary = v9["sim"]
	var out := v9.duplicate()
	out["version"] = 10
	out["sim"] = sim.merged({"settlers": _each(_list(sim, "settlers"), {"military": null}), "stats": _stats(sim), "horseDay": 0}, true)
	return out


## v10 → v11: war; nothing in progress, nobody captive, nothing besieged.
static func _v10(v10: Dictionary) -> Dictionary:
	var sim: Dictionary = v10["sim"]
	var out := v10.duplicate()
	out["version"] = 11
	out["sim"] = sim.merged({
		"settlers": _each(_list(sim, "settlers"), {"captive": null}),
		"stats": _stats(sim), "war": {"states": [], "sieges": [], "occupationTimers": []},
	}, true)
	return out
