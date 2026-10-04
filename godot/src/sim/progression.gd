class_name Progression
## Milestones (Camp → Hamlet → Village → Town → Region → Civilization) from
## content/progression.json, checked every GROWTH_STEP ticks (src/game/sim/progression.ts).
## Reached milestones are never removed.
##
## Requirement kinds that belong to systems not yet ported (work areas, several settlements,
## roads between them, the crown, treaties) report their progress as 0, which is true of a world
## without those systems.


## {label, current, target, done, options?} for one requirement.
static func requirement_progress(sim: Simulation, req: Dictionary) -> Dictionary:
	var kind: String = req["kind"]
	var current := 0
	var label := ""
	var target := int(req.get("count", 1))
	match kind:
		"population":
			for s in sim.settlers:
				if s.life_stage == "adult":
					current += 1
			label = "Reach %d adult settlers" % target
		"built":
			for b: Building in sim.buildings.values():
				if b.built and b.type == req["building"]:
					current += 1
			label = str(req.get("label", "Build %s" % Defs.building(req["building"])["name"]))
		"stat":
			current = int(sim.stats.get(req["stat"], 0))
			label = str(req["label"])
		"statSum":
			for st: String in req["stats"]:
				current += int(sim.stats.get(st, 0))
			label = str(req["label"])
		"beds":
			for b: Building in sim.buildings.values():
				if b.is_permanent_home():
					current += b.beds()
			label = "Have %d beds in real homes (not hall bunks or bedrolls)" % target
		"staffedAreas":
			label = "Run %d work areas with settlers assigned" % target
		"anyOf":
			var options: Array[Dictionary] = []
			var done_count := 0
			for o: Dictionary in req["options"]:
				var p := requirement_progress(sim, o)
				options.append(p)
				if bool(p["done"]):
					done_count += 1
			return {"label": str(req["label"]), "current": mini(done_count, target), "target": target, "done": done_count >= target, "options": options}
		"settlements":
			label = "Have %d settlements with %d+ settlers each" % [target, int(req["minResidents"])]
		"crowned":
			return {"label": "Crown your ruler", "current": 0, "target": 1, "done": false}
		"treaty":
			return {"label": str(req["label"]), "current": 0, "target": 1, "done": false}
		"roadLink":
			return {"label": "Join two settlements with a road", "current": 0, "target": 1, "done": false}
	return {"label": label, "current": mini(current, target), "target": target, "done": current >= target}


static func current(sim: Simulation) -> String:
	return sim.reached[sim.reached.size() - 1] if not sim.reached.is_empty() else "camp"


static func next_milestone(sim: Simulation) -> String:
	for id: String in Content.get_value("progression", "MILESTONE_ORDER"):
		if not sim.reached.has(id):
			return id
	return ""


static func check(sim: Simulation) -> void:
	var next := next_milestone(sim)
	if next == "":
		return
	var def: Dictionary = (Content.get_value("progression", "MILESTONES") as Dictionary)[next]
	if def.get("future", false):
		return
	for r: Dictionary in def["requirements"]:
		if not bool(requirement_progress(sim, r)["done"]):
			return
	sim.reached.append(next)
	sim.toast("Your settlement is now a %s! Unlocked: %s." % [def["name"], ", ".join(PackedStringArray(def["unlocks"] as Array))], "good")
	sim.record("milestone", "Became a %s" % def["name"])
	sim.emit({"type": "milestone", "id": next})
	sim.emit({"type": "sfx", "name": "milestone"})
	sim.emit({"type": "important"})
