class_name ValleyToday
extends RefCounted
## "Valley today" (src/engine/overview.ts): shown when a saved valley is resumed. It recaps what
## was recorded last session, lists up to three things that need attention and a few sensible next
## goals. Every item carries a target {x, y, w, h, settlerId?, buildingId?} to jump to.
##
## build() returns {since: Array[String] or null, sinceNote, issues: [item], goals: [item],
## milestone: {current, next, reqs}}; an item is {text, detail, target (Dictionary or null)}.


static func _rect(b: Building) -> Dictionary:
	return {"x": b.x, "y": b.y, "w": b.w, "h": b.h, "buildingId": b.id}


static func _at(s: Settler) -> Dictionary:
	return {"x": floori(s.x), "y": floori(s.y), "w": 1, "h": 1, "settlerId": s.id}


static func _plural(n: int, word: String) -> String:
	return "%d %s%s" % [n, word, "" if n == 1 else "s"]


static func _item(text: String, detail: String, target: Variant) -> Dictionary:
	return {"text": text, "detail": detail, "target": target}


## A number the way JavaScript prints it (1, 1.5).
static func _num(x: float) -> String:
	return str(int(x)) if x == floorf(x) else str(x)


static func _built_count(sim: Simulation, type: String) -> int:
	var n := 0
	for b: Building in sim.buildings.values():
		if b.built and b.type == type:
			n += 1
	return n


static func _of_type(sim: Simulation, type: String) -> Array[Building]:
	var out: Array[Building] = []
	for b: Building in sim.buildings.values():
		if b.type == type:
			out.append(b)
	return out


static func _permanent_beds(sim: Simulation) -> int:
	var n := 0
	for b: Building in sim.buildings.values():
		if b.is_permanent_home():
			n += b.beds()
	return n


static func build(sim: Simulation, previous: Dictionary) -> Dictionary:
	var since := since_last(sim, previous)
	var next := Progression.next_milestone(sim)
	var milestones: Dictionary = Content.get_value("progression", "MILESTONES")
	var next_def: Dictionary = milestones.get(next, {}) if next != "" else {}
	var open: bool = not next_def.is_empty() and not next_def.get("future", false)
	var reqs: Array = []
	if open:
		for r: Dictionary in next_def["requirements"]:
			reqs.append(Progression.requirement_progress(sim, r))
	return {
		"since": since["lines"], "sinceNote": since["note"], "issues": issues(sim), "goals": goals(sim),
		"milestone": {"current": milestones[Progression.current(sim)]["name"], "next": next_def["name"] if open else null, "reqs": reqs},
	}


## Summary of the previous session, built only from what the game recorded.
static func since_last(sim: Simulation, prev: Dictionary) -> Dictionary:
	if prev.is_empty():
		return {"lines": null, "note": "There is no record of your last visit for this valley yet, so here is how things stand today."}
	var start_stats: Dictionary = prev.get("startStats", {})
	var d := func(k: String) -> int: return int(sim.stats.get(k, 0)) - int(start_stats.get(k, 0))
	var start_tick := int(prev.get("startTick", 0))
	var days := maxf(0.0, JsMath.round_js((sim.tick - start_tick) / float(Defs.DAY_TICKS) * 10.0) / 10.0)
	var events: Array[Dictionary] = []
	for c: Dictionary in sim.chronicle:
		if int(c["tick"]) >= start_tick:
			events.append(c)
	var lines: Array[String] = []
	var built: Array[String] = []
	for e: Dictionary in events:
		if e["kind"] == "built" or e["kind"] == "bridge":
			var t: String = e["text"]
			for prefix: String in ["Built a ", "Built an "]:
				if t.begins_with(prefix):
					t = t.substr(prefix.length())
			built.append(t.trim_prefix("Finished the "))
	if not built.is_empty():
		var seen: Array[String] = []
		var parts: Array[String] = []
		for b: String in built:
			if seen.has(b):
				continue
			seen.append(b)
			var n := built.count(b)
			parts.append(("%d× " % n if n > 1 else "") + b)
		lines.append("Built: %s." % ", ".join(parts))
	var arrivals: Array[String] = []
	for e: Dictionary in events:
		if e["kind"] == "arrival":
			arrivals.append(str(e["text"]).trim_suffix(" arrived"))
	if not arrivals.is_empty():
		lines.append("Welcomed %s." % ", ".join(arrivals))
	for e: Dictionary in events:
		if e["kind"] == "birth":
			lines.append("%s." % e["text"])
	for e: Dictionary in events:
		if e["kind"] == "milestone":
			lines.append("%s!" % e["text"])
	var food: int = d.call("harvested") + d.call("foodGathered") + d.call("bakedFood")
	var goods: Array[String] = []
	if food > 0:
		goods.append("%d food" % food)
	for pair: Array in [["wheatHarvested", "wheat"], ["woodGathered", "wood"], ["stoneGathered", "stone"], ["planksCrafted", "planks"]]:
		var n: int = d.call(pair[0])
		if n > 0:
			goods.append("%d %s" % [n, pair[1]])
	if not goods.is_empty():
		lines.append("Brought in %s." % ", ".join(goods))
	for e: Dictionary in events:
		if e["kind"] == "shortage":
			lines.append("%s." % e["text"])
	if lines.is_empty():
		return {"lines": null, "note": "Last time you played for about %s in-game days, but nothing notable was recorded." % _num(days)}
	return {"lines": lines.slice(0, 5), "note": "Last session, over about %s in-game day%s:" % [_num(days), "" if days == 1.0 else "s"]}


static func issues(sim: Simulation) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var cap := sim.total_capacity()
	if cap.y > 0 and cap.x >= cap.y * 0.95:
		var stores := sim.storages()
		out.append(_item("Storage is full", "Settlers holding goods can’t harvest. Build a storehouse.", _rect(stores[0]) if not stores.is_empty() else null))
	var homeless := sim.settlers.filter(func(s: Settler) -> bool: return s.home_id == -1)
	if not homeless.is_empty():
		var camp := BuildingOps.camp_of(sim)
		out.append(_item("%s %s no bed" % [_plural(homeless.size(), "settler"), "has" if homeless.size() == 1 else "have"],
			"They rest by the campfire. Build a house or cottage.", _rect(camp) if camp != null else null))
	var busy := RegEx.create_from_string("^(Grind|Saw|Craft|Bake|Worker on|Ready)")
	var needs_re := RegEx.create_from_string("Needs (.+?) —")
	for b: Building in sim.buildings.values():
		if not b.built or b.workshop.is_empty():
			continue
		var s := str(b.workshop.get("status", ""))
		if s == "" or busy.search(s) != null:
			continue
		var bname := str(b.def()["name"])
		var m := needs_re.search(s)
		out.append(_item("The %s needs %s" % [bname.to_lower(), m.get_string(1)] if m != null else "%s: %s" % [bname, s], s, _rect(b)))
	for b: Building in sim.buildings.values():
		if b.built or b.is_field():
			continue
		for e: Array in Inv.entries(BuildingOps.cost_of(b)):
			var r: String = e[0]
			var left := int(e[1]) - int(b.delivered.get(r, 0)) - int(b.incoming.get(r, 0))
			if left > 0 and sim.stored_total(r) < left:
				out.append(_item("Deliver %d more %s to the %s" % [left, str(Defs.resource(r)["name"]).to_lower(), str(b.def()["name"]).to_lower()],
					"Only %d in storage." % sim.stored_total(r), _rect(b)))
				break
	for h: Dictionary in sim.households:
		var p: Variant = h.get("pending")
		if not (p is Dictionary and str(p.get("blocked", "")) != ""):
			continue
		var names: Array[String] = []
		for id: Variant in h["adults"]:
			var a := sim.settler(int(id))
			names.append(a.name if a != null else "?")
		var parent := sim.settler(int(h["adults"][0]))
		out.append(_item("%s's child is paused" % " and ".join(names), str(p["blocked"]), _at(parent) if parent != null else null))
	var idle: Array[Settler] = []
	for s: Settler in sim.settlers:
		if (s.task == null or s.task.kind == Task.WANDER) and s.idle_reason != "" and s.idle_reason != "Stores are well stocked":
			idle.append(s)
	if idle.size() >= 2 or (idle.size() == 1 and sim.settlers.size() <= 6):
		out.append(_item("%s %s idle" % [_plural(idle.size(), "settler"), "is" if idle.size() == 1 else "are"], "%s: %s" % [idle[0].name, idle[0].idle_reason], _at(idle[0])))
	return out.slice(0, 3)


## A good place to cross the great river: the shortest explored straight crossing near the camp.
static func suggest_crossing(sim: Simulation) -> Variant:
	if sim.world.gen < 2:
		return null
	var camp := BuildingOps.camp_of(sim)
	var cy := camp.y if camp != null else 0
	var best: Variant = null
	var is_water := func(x: int, y: int) -> bool:
		var t := sim.world.terrain(x, y)
		return t == Tiles.WATER or t == Tiles.DEEP_WATER
	for dy in 31:
		for y: int in ([cy] if dy == 0 else [cy + dy, cy - dy]):
			var x0 := int(JsMath.round_js(WorldGen.river_center(sim.seed_value, y)))
			if not is_water.call(x0, y) or not sim.world.explored(x0, y):
				continue
			var x1 := x0
			while is_water.call(x0 - 1, y) and x0 - x1 < 14:
				x0 -= 1
			while is_water.call(x1 + 1, y) and x1 - x0 < 14:
				x1 += 1
			var length := x1 - x0 + 1
			if length > 12 or not sim.walkable(x0 - 1, y) or not sim.walkable(x1 + 1, y):
				continue
			if not sim.world.explored(x0 - 1, y) or not sim.world.explored(x1 + 1, y):
				continue
			if best == null or length < int(best["w"]):
				best = {"x": x0, "y": y, "w": length, "h": 1}
		if best != null and dy > 6:
			break
	return best


static func goals(sim: Simulation) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var camp := BuildingOps.camp_of(sim)
	var camp_t: Variant = _rect(camp) if camp != null else null
	# Older worlds: the player's ruler and the Town Hall.
	if sim.ruler() == null:
		out.append(_item("Take the throne", "Name your ruler in the menu: you walk the map, speed up work nearby and can Rally your people.", camp_t))
	if camp != null and camp.type == "camp" and camp.upgrade.is_empty():
		out.append(_item("Raise a Town Hall", "Select the camp and choose Upgrade: it becomes a Town Hall with 10 bunks and room for 600 goods, then a Keep and a Castle.", camp_t))
	# Deliberate growth: a visitor who can be welcomed now, then the orchard that pays for them.
	var recruit_food := People._k("RECRUIT_FOOD")
	var min_food := People._k("GROWTH_MIN_FOOD")
	if sim.growth_mode == "deliberate" and not sim.offer.is_empty() and not sim.settlements.is_empty() and People.recruit_problem(sim, int(sim.settlements[0]["id"])) == "":
		out.append(_item("Welcome %s, who is visiting" % sim.offer["name"], "Families tab: they settle for %d food and a free bed." % recruit_food, camp_t))
	if sim.growth_mode == "deliberate" and sim.stored_total("food") < recruit_food + min_food:
		out.append(_item("Grow food for travellers", "Travellers settle for %d food (keeping %d in store). Fields, orchards, hunting and berries all help." % [recruit_food, min_food], camp_t))
	if not sim.reached.has("hamlet"):
		var milestones: Dictionary = Content.get_value("progression", "MILESTONES")
		var missing: Array[Dictionary] = []
		for r: Dictionary in milestones["hamlet"]["requirements"]:
			var p := Progression.requirement_progress(sim, r)
			if not p["done"]:
				missing.append(p)
		for p: Dictionary in missing.slice(0, 2):
			out.append(_item(p["label"], "%d/%d" % [int(p["current"]), int(p["target"])], camp_t))
		return out.slice(0, 3)
	var bridges := _of_type(sim, "stoneBridge")
	var bridge: Building = bridges[0] if not bridges.is_empty() else null
	if bridge != null and not bridge.built:
		var text := "Builders are raising the stone bridge"
		for e: Array in Inv.entries(BuildingOps.cost_of(bridge)):
			var left := int(e[1]) - int(bridge.delivered.get(e[0], 0))
			if left > 0:
				text = "Deliver %d more %s to the stone bridge" % [left, e[0]]
				break
		out.append(_item(text, "Once finished, the far bank opens up for new homes and fields.", _rect(bridge)))
	var mills := _of_type(sim, "mill")
	var fields: Array[Building] = []
	for b: Building in sim.buildings.values():
		if b.is_field():
			fields.append(b)
	if mills.is_empty():
		out.append(_item("Build a mill to grind wheat into flour", "Bread feeds a larger village from fewer fields.", camp_t))
	elif _of_type(sim, "bakery").is_empty():
		out.append(_item("Build a bakery to expand food production", "It bakes 2 flour and 1 wood into 5 food.", _rect(mills[0])))
	elif not fields.any(func(f: Building) -> bool: return f.field.get("crop") == "wheat"):
		out.append(_item("Plant wheat fields for the mill", "Select fields and choose Wheat in the inspector.", _rect(fields[0]) if not fields.is_empty() else camp_t))
	if sim.work_areas.is_empty():
		var t: Variant = camp_t
		if not fields.is_empty():
			var x0 := 1 << 30
			var y0 := 1 << 30
			var x1 := -(1 << 30)
			var y1 := -(1 << 30)
			for f: Building in fields:
				x0 = mini(x0, f.x)
				y0 = mini(y0, f.y)
				x1 = maxi(x1, f.x)
				y1 = maxi(y1, f.y)
			t = {"x": x0, "y": y0, "w": x1 - x0 + 1, "h": y1 - y0 + 1}
		out.append(_item("Assign farmers to a farm area", "Areas tab → Farm, then drag over your fields.", t))
	if bridge == null and sim.world.gen >= 2:
		var c: Variant = suggest_crossing(sim)
		if c != null:
			out.append(_item("Cross the great river with a stone bridge", "A %d-tile crossing here would open the fertile far bank." % int(c["w"]), c))
		else:
			out.append(_item("Explore east to find the great river", "Send a settler east of the camp. A stone bridge can open the far bank.",
				{"x": camp.x + 18, "y": camp.y, "w": 3, "h": 2} if camp != null else null))
	var beds := _permanent_beds(sim)
	if not sim.reached.has("village") and beds < 8:
		out.append(_item("Build homes: %d/8 beds for Village" % beds, "Houses have 2 beds.", camp_t))
	if sim.reached.has("village"):
		if _built_count(sim, "market") == 0:
			out.append(_item("Plan the Grand Market", "A long project that anchors a future town.", camp_t))
		out.append(_item("Grow toward Town: %d/16 adults" % People.adults(sim).size(), "Cottages hold 4 each.", camp_t))
	return out.slice(0, 3)
