class_name RealmHelpers
## Shared set-ups for realm tests (the Godot counterpart of tests/realm-helpers.ts).


static func reload_sim(sim: Simulation) -> Simulation:
	var text := JSON.stringify(SaveCodec.encode(sim, "Realm", 0), "", true, true)
	var loaded: Dictionary = SaveCodec.decode(JSON.parse_string(text))
	assert(str(loaded["error"]) == "", str(loaded["error"]))
	return loaded["sim"]


## Places a finished building on clear, explored ground near a spot (the browser's instant()).
static func instant(sim: Simulation, type: String, near: Vector2i) -> Building:
	var d := Defs.building(type)
	for r in 30:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				if maxi(absi(x - near.x), absi(y - near.y)) != r:
					continue
				var ok := true
				for dy in int(d["size"]["h"]):
					for dx in int(d["size"]["w"]):
						if ok and (BuildingOps.tile_problem(sim, type, x + dx, y + dy) != "" or sim.building_at(x + dx, y + dy) != null):
							ok = false
				if ok and Settlements.spacing_problem(sim, type, x, y) == "":
					var b := BuildingOps.place(sim, type, x, y)
					b.delivered = BuildingOps.cost_of(b).duplicate()
					BuildingOps.complete(sim, b)
					return b
	return null


## A crowned kingdom with an envoy, coins, and three known neighbouring kingdoms:
## {sim, me, a, b, c}.
static func realm(seed_value: int = 6161) -> Dictionary:
	var sim := NewGame.create(seed_value)
	for m: String in ["hamlet", "village", "town", "region"]:
		sim.reached.append(m)
	var res := Commands.apply(sim, {"type": "coronate", "rulerName": "Queen Rowan", "kingdomName": "Rowanmere", "banner": {"color": "#3a6ea5", "emblem": "oak"}})
	assert(bool(res["ok"]), str(res["message"]))
	var me := Kingdoms.player(sim)
	me["treasury"] = 400
	Commands.apply(sim, {"type": "appointCouncil", "post": "envoy", "settlerId": sim.settlers[0].id})
	var towns := Regions.nearby_towns(sim.seed_value)
	assert(towns.size() >= 3, "seed needs three towns")
	return {"sim": sim, "me": me, "a": Kingdoms.know_of(sim, int(towns[0]["id"])), "b": Kingdoms.know_of(sim, int(towns[1]["id"])), "c": Kingdoms.know_of(sim, int(towns[2]["id"]))}


## A civilised, crowned realm with an open frontier, two claimed frontier sectors, and a trained
## company: realm() plus {company, ids, barracks, foe}.
static func war_world(mode: String = "protected-frontier", soldiers: int = 2) -> Dictionary:
	var r := realm(6161)
	var sim: Simulation = r["sim"]
	var me: Dictionary = r["me"]
	sim.reached.append("civilization")
	Commands.apply(sim, {"type": "setConflictMode", "mode": mode})
	Commands.apply(sim, {"type": "activateFrontier"})
	sim.world.reveal(0, 0, 40)
	var x := 0
	while x >= -130:
		sim.world.reveal(x, 8, 12)
		x -= 8
	sim.load_nav_area(0, 0)
	SimHelpers.camp(sim).inventory = {"food": 200, "swords": 8, "wood": 20}
	instant(sim, "storehouse", Vector2i(-8, -8))
	var barracks := instant(sim, "barracks", Vector2i(8, -8))
	me["treasury"] = 400
	var c1 := Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": -3, "y": 0}})
	assert(bool(c1["ok"]), str(c1["message"]))
	var c2 := Commands.apply(sim, {"type": "claimFrontier", "sector": {"x": -4, "y": 0}})
	assert(bool(c2["ok"]), str(c2["message"]))
	var ids: Array = []
	for i in range(1, 1 + soldiers):
		ids.append(sim.settlers[i].id)
	var e := Commands.apply(sim, {"type": "enlist", "ids": ids, "unit": "infantry", "buildingId": barracks.id})
	assert(bool(e["ok"]), str(e["message"]))
	SimHelpers.run_until(sim, func() -> bool: return ids.all(func(id: int) -> bool: return sim.settler(id).military.get("state") == "ready"), int(Military.unit("infantry")["trainTicks"]) * 4)
	var foe := {}
	for k: Dictionary in [r["a"], r["b"], r["c"]]:
		if foe.is_empty() and float(k["capital"]["x"]) < 0:
			foe = k
	r["company"] = (me["companies"] as Array)[0]
	r["ids"] = ids
	r["barracks"] = barracks
	r["foe"] = foe
	return r
