extends TestCase
## Valley today (overview.ts) and the introduction (tutorial.ts).


func test_valley_today_recaps_the_last_session_from_records_only() -> void:
	var sim := NewGame.create(101)
	var none := ValleyToday.since_last(sim, {})
	check(none["lines"] == null and str(none["note"]).contains("no record"), "no mark: says so")
	sim.start_session()
	var mark := sim.session.duplicate(true)
	var quiet := ValleyToday.since_last(sim, mark)
	check(quiet["lines"] == null and str(quiet["note"]).contains("nothing notable"), "an empty session says nothing was recorded")
	sim.tick += Defs.DAY_TICKS * 3 / 2
	sim.record("built", "Built a house")
	sim.record("built", "Built a house")
	sim.record("built", "Built an orchard")
	sim.record("arrival", "Wren arrived")
	sim.record("milestone", "Became a Hamlet")
	sim.stats["woodGathered"] = int(sim.stats["woodGathered"]) + 12
	sim.stats["harvested"] = int(sim.stats["harvested"]) + 5
	var r := ValleyToday.since_last(sim, mark)
	check_eq(r["note"], "Last session, over about 1.5 in-game days:", "the session length")
	check_eq(r["lines"], ["Built: 2× house, orchard.", "Welcomed Wren.", "Became a Hamlet!", "Brought in 5 food, 12 wood."], "the recap")


func test_valley_today_lists_issues_and_goals() -> void:
	var sim := NewGame.create(101)
	SimHelpers.run(sim, 20)
	var o := ValleyToday.build(sim, {})
	var issues: Array = o["issues"]
	check(issues.size() <= 3 and (o["goals"] as Array).size() <= 3, "at most three of each")
	check(issues.any(func(i: Dictionary) -> bool: return str(i["text"]).contains("idle") and (i["target"] as Dictionary).has("settlerId")), "idle settlers are pointed out, with one to jump to: %s" % str(issues))
	var goals: Array = o["goals"]
	check(not goals.is_empty() and goals.all(func(g: Dictionary) -> bool: return g["target"] is Dictionary), "every goal has somewhere to jump to")
	check_eq(o["milestone"]["current"], "Camp", "the current milestone")
	check(o["milestone"]["next"] == "Hamlet" and not (o["milestone"]["reqs"] as Array).is_empty(), "the next milestone and its requirements")


func test_valley_today_opens_on_an_old_save() -> void:
	var r := SaveCodec.decode(load_json("res://tests/golden/v4-save.json"))
	var sim: Simulation = r["sim"]
	var o := ValleyToday.build(sim, sim.session)
	var goals: Array = o["goals"]
	check(goals.any(func(g: Dictionary) -> bool: return g["text"] == "Take the throne"), "a world from before rulers suggests taking the throne")


func test_the_introduction_follows_the_player() -> void:
	var sim := NewGame.create(101)
	var t := {"step": 0, "done": false}
	check(not Tutorial.advance(t, sim, 0, false) and int(t["step"]) == 0, "waits for a selection")
	Tutorial.advance(t, sim, 1, false)
	check_eq(int(t["step"]), 1, "one selected: next step")
	Tutorial.advance(t, sim, 3, false)
	check_eq(int(t["step"]), 2, "a group selected: next step")
	sim.stats["woodGathered"] = 6
	sim.stats["stoneGathered"] = 3
	Tutorial.advance(t, sim, 0, false)
	Tutorial.advance(t, sim, 0, false)
	check_eq(int(t["step"]), 4, "wood and stone gathered")
	t["step"] = 8
	check(not Tutorial.advance(t, sim, 0, false), "waits for a save")
	check(Tutorial.advance(t, sim, 0, true) and t["done"] == true, "saving finishes the introduction")
	var skipped := {"step": 3, "done": true}
	check(not Tutorial.advance(skipped, sim, 5, true) and int(skipped["step"]) == 3, "a skipped introduction stays put")
