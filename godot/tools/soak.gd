extends SceneTree
## Long-play soak: plays one representative valley for many in-game days, headless, and checks it
## stays healthy. From godot/:
##   godot --headless --path . -s res://tools/soak.gd -- [days=60] [every=5] [seed=4242] [out.json]
##
## The valley has fields, crafts, animals, a crowned realm with known neighbours, and an inn
## so merchants visit. It has no work areas or woodlot: finite gathering can exhaust inputs.
## This baseline checks state integrity, not a self-sustaining economy. Every `every` days it:
## - saves and reloads (through JSON text, as on disk), requires the reloaded state to equal the
##   state before exactly, and plays on with the reloaded copy, as a player who quits would;
## - requires reservations and promised goods to be consistent;
## - measures growth: collections that could leak (events, news, caches, reservations), loaded and
##   generated chunks, engine objects, static memory, settlers, buildings, and ms per game day;
## - reports wood conservation drift over each stretch with no merchant trade or upgrade.
## Prints one SOAK line per checkpoint and a SOAK SUMMARY; exits 1 if a hard check failed.

const DAY := Defs.DAY_TICKS

var _failures: PackedStringArray = []


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var days := int(args[0]) if args.size() > 0 else 60
	var every := maxi(1, int(args[1]) if args.size() > 1 else 5)
	var seed_value := int(args[2]) if args.size() > 2 else 4242
	var out_path := args[3] if args.size() > 3 else ""
	var sim := _valley(seed_value)
	var rows: Array[Dictionary] = []
	rows.append(_measure(sim, 0, 0.0, "start"))
	print("SOAK %s" % JSON.stringify(rows[0]))
	var day := 0
	while day < days:
		var stretch := mini(every, days - day)
		var wood_before := _wood_balance(sim)
		var trades_before := int(sim.stats["trades"])
		var levels_before := _levels(sim)
		var t0 := Time.get_ticks_usec()
		var auto_us := 0
		for d in stretch:
			SimHelpers.run(sim, DAY)
			var a0 := Time.get_ticks_usec()
			_autopilot(sim)
			auto_us += Time.get_ticks_usec() - a0
		var ms_per_day := (Time.get_ticks_usec() - t0 - auto_us) / 1000.0 / stretch
		day += stretch
		var drift: Variant = null
		if int(sim.stats["trades"]) == trades_before and _levels(sim) == levels_before:
			drift = _wood_balance(sim) - wood_before
		var problems := SimHelpers.reservation_problems(sim)
		if not problems.is_empty():
			_fail("day %d: reservations: %s" % [day, "; ".join(problems.slice(0, 3))])
		# Save and reload through text, then carry on with the reloaded valley.
		# Workshop status is derived and deliberately omitted from saves. Capture before decode.
		var production_before := production_snapshot(sim)
		var before := _state(sim)
		var text := JSON.stringify(SaveCodec.encode(sim, "Soak", 0), "", true, true)
		var loaded := SaveCodec.decode(JSON.parse_string(text))
		if loaded["sim"] == null:
			_fail("day %d: reload failed: %s" % [day, loaded["error"]])
			break
		if not (loaded["report"] as PackedStringArray).is_empty():
			_fail("day %d: our own save reported unsupported data: %s" % [day, "; ".join(loaded["report"])])
		var diff := _first_diff(before, _state(loaded["sim"]), "")
		if diff != "":
			_fail("day %d: reload differs: %s" % [day, diff])
		sim = loaded["sim"]
		var row := _measure(sim, day, ms_per_day, "ok" if problems.is_empty() and diff == "" else "FAIL")
		row["production"] = production_before
		row["saveKB"] = text.length() / 1024
		row["woodDrift"] = drift
		rows.append(row)
		print("SOAK %s" % JSON.stringify(row))
	var summary := _summary(rows)
	print("SOAK SUMMARY %s" % JSON.stringify(summary))
	for f in _failures:
		print("SOAK FAILURE %s" % f)
	if out_path != "":
		var fa := FileAccess.open(out_path, FileAccess.WRITE)
		fa.store_string(JSON.stringify({"rows": rows, "summary": summary, "failures": _failures}, "  "))
	quit(1 if not _failures.is_empty() else 0)


## Plays like a careful player once a day, so the valley keeps growing instead of stalling:
## more storage when stores pass 80%, a house when every home bed is taken and food allows,
## and visitors welcomed when there is food to spare. Orders go through Commands, as a
## player's would, and builders carry them out.
func _autopilot(sim: Simulation) -> void:
	if not sim.sites().is_empty():
		return
	var cap := sim.total_capacity()
	var food := sim.stored_total("food")
	if cap.y > 0 and cap.x > cap.y * 0.8:
		_order(sim, "storehouse")
		return
	var beds := 0
	var used := 0
	for b: Building in sim.buildings.values():
		if b.is_permanent_home():
			beds += b.beds()
			for st in sim.settlers:
				if st.home_id == b.id:
					used += 1
	if used >= beds and food > 60:
		_order(sim, "house")
		return
	if not sim.offer.is_empty() and food > 80 and used < beds:
		Commands.apply(sim, {"type": "acceptRecruit", "offerId": sim.offer.get("id"), "settlementId": sim.settlements[0]["id"]})


## Orders a building where a sensible player would: the nearest spot (rings of 4 to 24 tiles round
## the hall) with a one-tile walkable margin all round, so nothing is ever boxed in. (Tightly packed
## buildings walled settlers in and starved them: a setup artifact, not the game.)
func _order(sim: Simulation, type: String) -> bool:
	var d := Defs.building(type)
	var w := int(d["size"]["w"])
	var h := int(d["size"]["h"])
	for r in range(4, 25):
		for y in range(-r, r + 1):
			for x in range(-r, r + 1):
				if maxi(absi(x), absi(y)) != r or not bool(BuildingOps.check_placement(sim, type, x, y)["ok"]):
					continue
				var clear := true
				for yy in range(y - 1, y + h + 1):
					for xx in range(x - 1, x + w + 1):
						if clear and (sim.building_at(xx, yy) != null or not sim.walkable(xx, yy)):
							clear = false
				if clear and bool(Commands.apply(sim, {"type": "place", "building": type, "x": x, "y": y})["ok"]):
					return true
	return false


## Baseline valley: production, animals, fields, realm and an inn, all built; no work areas.
func _valley(seed_value: int) -> Simulation:
	var sim := NewGame.create(seed_value)
	for m: String in ["hamlet", "village", "town", "region"]:
		sim.reached.append(m)
	# A modest stock: stores filled to capacity leave nowhere to put a harvest, and everyone idles.
	SimHelpers.camp(sim).inventory = {"food": 120, "wood": 80, "stone": 40, "planks": 20, "tools": 4}
	# Spread round the hall with room to walk between, so nobody is walled in (a packed ring of
	# finished buildings left every settler unable to reach anything).
	var types := ["storehouse", "storehouse", "house", "house", "familyHome", "workshop", "granary", "mill", "bakery", "well",
			"chickenCoop", "sheepPen", "hunterLodge", "inn", "charcoalKiln"]
	for i in types.size():
		var a := TAU * i / types.size()
		var near := Vector2i(roundi(cos(a) * 11.0), roundi(sin(a) * 9.0))
		if RealmHelpers.instant(sim, types[i], near) == null:
			_fail("setup: no room for a %s" % types[i])
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 6, "x1": -5, "y1": 9, "crop": "wheat"})
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": 6, "y0": 6, "x1": 9, "y1": 9, "crop": "turnip"})
	Commands.apply(sim, {"type": "designate", "x0": -18, "y0": -18, "x1": 18, "y1": 18, "on": true})
	var res := Commands.apply(sim, {"type": "coronate", "rulerName": "Soak", "kingdomName": "Soakmere", "banner": {"color": "#3a6ea5", "emblem": "oak"}})
	if not bool(res["ok"]):
		_fail("setup: coronation: %s" % res["message"])
	for t: Dictionary in Regions.nearby_towns(sim.seed_value).slice(0, 3):
		Kingdoms.know_of(sim, int(t["id"]))
	for i in 4:
		sim.add_settler(-3 + i, 4, ["farmer", "gatherer", "builder", "hauler"][i])
	# Newcomers get beds, as arrivals do (loading a save assigns homes, so this must hold).
	BuildingOps.assign_homes(sim)
	return sim


## The economy at a glance, so a stalled valley shows up.
func _stats(sim: Simulation) -> Dictionary:
	var out := {}
	for k: String in ["harvested", "wheatHarvested", "foodGathered", "woodGathered", "stoneGathered", "planksCrafted", "bakedFood", "arrivals", "births", "trades", "merchantVisits"]:
		out[k] = int(sim.stats.get(k, 0))
	out["fields"] = sim.fields().size()
	out["sites"] = sim.sites().size()
	out["reached"] = sim.reached.size()
	return out


func _levels(sim: Simulation) -> int:
	var n := 0
	for b: Building in sim.buildings.values():
		n += b.level + (0 if b.upgrade.is_empty() else 100)
	return n


## Wood held, built in and crafted away, minus wood ever gathered: constant while nothing trades.
func _wood_balance(sim: Simulation) -> int:
	return SimHelpers.accounted_for(sim, "wood") + SimHelpers.consumed_by_construction(sim, "wood") \
		+ SimHelpers.consumed_by_crafting(sim, "wood") - int(sim.stats["woodGathered"])


func _measure(sim: Simulation, day: int, ms_per_day: float, status: String) -> Dictionary:
	var growth := {}
	for k: String in ["world_events", "reports", "offers", "incidents", "warnings", "war_plans", "commitments", "parties",
			"chronicle", "events", "households", "bed_claims", "recruits", "routes", "manifests", "animals", "work_areas"]:
		growth[k] = (sim.get(k) as Array).size()
	for k: String in ["reservations", "occupancy", "regrowth", "road_cache", "leg_cache", "shared_unreachable",
			"bed_reach_cache", "news_flags", "news_summaries", "claims", "upgrading"]:
		growth[k] = (sim.get(k) as Dictionary).size()
	growth["designations"] = sim.designations.size()
	return {
		"day": day, "status": status, "msPerDay": snappedf(ms_per_day, 0.1),
		"settlers": sim.settlers.size(), "buildings": sim.buildings.size(), "kingdoms": sim.kingdoms.size(),
		"chunksLoaded": sim.world._chunks.size(), "chunksGenerated": sim.world.generated_count, "chunksEvicted": sim.world.evicted_count,
		"objects": int(Performance.get_monitor(Performance.OBJECT_COUNT)), "staticMB": snappedf(Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, 0.1),
		"food": SimHelpers.accounted_for(sim, "food"), "growth": growth,
		"stats": _stats(sim),
		"production": production_snapshot(sim),
	}


## Capture the supply chain as well as output totals, so a plateau has an inspectable cause.
static func production_snapshot(sim: Simulation) -> Dictionary:
	var workshops: Array[Dictionary] = []
	for b: Building in sim.workshops():
		workshops.append({"id": b.id, "type": b.type, "state": b.workshop.duplicate(true),
			"delivered": b.delivered.duplicate(), "incoming": b.incoming.duplicate(),
			"workers": Array(b.workers), "reservation": sim.reservations.get(Simulation.K_CRAFT + b.id, 0)})
	var stock := {}
	for resource: String in ["food", "wheat", "flour", "wood", "planks", "stone", "coal", "charcoal"]:
		stock[resource] = sim.stored_total(resource)
	var sites: Array[Dictionary] = []
	for b: Building in sim.sites():
		sites.append({"id": b.id, "type": b.type, "delivered": b.delivered.duplicate(), "incoming": b.incoming.duplicate()})
	var capacity := sim.total_capacity()
	return {"stock": stock, "storageUsed": capacity.x, "storageCapacity": capacity.y,
		"workshops": workshops, "sites": sites}


## How each measure moved from the first checkpoint after setup to the last: anything that
## grows every stretch without levelling off is worth a look.
func _summary(rows: Array[Dictionary]) -> Dictionary:
	if rows.size() < 3:
		return {"failures": _failures.size()}
	var a: Dictionary = rows[1]
	var z: Dictionary = rows[rows.size() - 1]
	var grew := {}
	for k: String in (z["growth"] as Dictionary):
		var steadily := true
		for i in range(2, rows.size()):
			if int(rows[i]["growth"][k]) <= int(rows[i - 1]["growth"][k]):
				steadily = false
		if steadily and int(z["growth"][k]) > int(a["growth"][k]):
			grew[k] = [int(a["growth"][k]), int(z["growth"][k])]
	var ms: Array = rows.slice(1).map(func(r: Dictionary) -> float: return float(r["msPerDay"]))
	return {
		"days": z["day"], "failures": _failures.size(), "growsEveryCheckpoint": grew,
		"objects": [a["objects"], z["objects"]], "staticMB": [a["staticMB"], z["staticMB"]],
		"settlers": [a["settlers"], z["settlers"]], "msPerDay": [ms.min(), ms.max()],
		"chunksLoaded": [a["chunksLoaded"], z["chunksLoaded"]],
	}


func _fail(msg: String) -> void:
	_failures.append(msg)
	push_error("SOAK " + msg)


func _state(sim: Simulation) -> Dictionary:
	var d := SaveCodec.encode(sim, "x", 0)
	(d["meta"] as Dictionary).erase("savedAt")
	return d


## The first difference between two save states (decimals may move in the last digits: Godot's
## JSON reader rounds 17-digit numbers inexactly; see test_saves.gd).
static func _first_diff(a: Variant, b: Variant, path: String) -> String:
	if a is Dictionary and b is Dictionary:
		for k: Variant in a:
			if not (b as Dictionary).has(k):
				return "%s.%s missing after reload" % [path, k]
			var d := _first_diff(a[k], b[k], "%s.%s" % [path, k])
			if d != "":
				return d
		for k: Variant in b:
			if not (a as Dictionary).has(k):
				return "%s.%s appeared after reload" % [path, k]
		return ""
	if a is Array and b is Array:
		if (a as Array).size() != (b as Array).size():
			return "%s: %d items before, %d after" % [path, (a as Array).size(), (b as Array).size()]
		for i in (a as Array).size():
			var d := _first_diff(a[i], b[i], "%s[%d]" % [path, i])
			if d != "":
				return d
		return ""
	if a is float and b is float and absf(float(a) - float(b)) <= 1e-9 * maxf(1.0, absf(float(a))):
		return ""
	return "" if a == b else "%s: %s before, %s after" % [path, str(a), str(b)]
