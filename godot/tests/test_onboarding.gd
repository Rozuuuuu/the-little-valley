extends TestCase


func test_new_campaign_grows_camp_longhouse_hall_keep_in_order() -> void:
	var sim := NewGame.create_camp(4242)
	var camp := BuildingOps.camp_of(sim)
	var id := camp.id
	check_eq(camp.type, "camp", "campaign begins with tents")
	check_eq(Levels.next_level(camp)["name"], "Longhouse", "the camp grows into a longhouse first, not a keep")
	check(Levels.upgrade_problem(sim, camp).contains("a home"), "the longhouse needs a home: %s" % Levels.upgrade_problem(sim, camp))
	check(RealmHelpers.instant(sim, "house", Vector2i(8, 6)) != null, "house placed")
	for i in 2:
		check(RealmHelpers.instant(sim, "field", Vector2i(-8 + i * 2, 6)) != null, "field placed")
	camp.inventory = {"food": 30, "wood": 120, "stone": 60, "planks": 20}
	sim = RealmHelpers.reload_sim(sim)
	camp = sim.buildings[id]
	check(bool(camp.extra.get("foundingCamp", false)), "campaign marker survives reload")
	check_eq(Levels.upgrade_problem(sim, camp), "", "longhouse allowed")
	check(bool(Commands.apply(sim, {"type": "upgradeBuilding", "buildingId": id})["ok"]), "longhouse upgrade accepted")
	sim = RealmHelpers.reload_sim(sim)
	camp = sim.buildings[id]
	check(not camp.upgrade.is_empty(), "an upgrade in progress survives save and load")
	for i in 901:
		Levels.update(sim)
	check_eq(camp.type, "camp", "still the camp building")
	check_eq(Levels.level_name(camp), "Longhouse", "now a longhouse")
	check_eq(int(camp.stat("housing")), 8, "longhouse beds")
	check_eq(Levels.next_level(camp)["name"], "Town Hall", "then the town hall")
	var why := Levels.upgrade_problem(sim, camp)
	check(why.contains("storehouse") and why.contains("workshop"), "the hall needs a storehouse and workshop: %s" % why)
	for type: String in ["house", "storehouse", "workshop"]:
		check(RealmHelpers.instant(sim, type, Vector2i(14, 10 + ["house", "storehouse", "workshop"].find(type) * 4)) != null, "placed " + type)
	check(RealmHelpers.instant(sim, "field", Vector2i(-4, 6)) != null, "third field")
	camp.inventory = {"food": 30, "wood": 120, "stone": 60, "planks": 20}
	check(Levels.upgrade_problem(sim, camp).contains("Hamlet"), "the hall needs the hamlet milestone")
	sim.reached.append("hamlet")
	check_eq(Levels.upgrade_problem(sim, camp), "", "town hall allowed")
	check(bool(Commands.apply(sim, {"type": "upgradeBuilding", "buildingId": id})["ok"]), "town hall upgrade accepted")
	for i in 1201:
		Levels.update(sim)
	check_eq(camp.type, "townHall", "camp became the hall")
	check_eq(camp.id, id, "upgrade preserves references")
	check_eq(Levels.next_level(camp)["name"], "Keep", "keep follows hall")
	check(Levels.upgrade_problem(sim, camp) != "", "but the keep waits for a village")


func test_guide_follows_play_without_pausing() -> void:
	var sim := NewGame.create_camp(4242)
	var state := {"step": 0, "done": false, "guided": true, "awaiting": true}
	check(not Tutorial.waiting(state), "the guide never pauses the game, even for an old save")
	Tutorial.advance(state, sim, 1, false)
	check_eq(state["step"], 1, "choosing a settler completes the first step")
	Tutorial.advance(state, sim, 3, false)
	check_eq(state["step"], 2, "a group completes the second")
	check_eq(Tutorial.steps(state)[2]["target"], "tree", "the next step points at a tree")
	sim.stats["woodGathered"] = 6
	sim.stats["stoneGathered"] = 3
	Tutorial.advance(state, sim, 0, false)
	Tutorial.advance(state, sim, 0, false)
	check_eq(state["step"], 4, "wood and stone")
	state["done"] = true
	check(not Tutorial.advance(state, sim, 5, true), "a skipped guide stays put")


func test_missing_shortcut_is_safe_and_new_shortcuts_have_keys() -> void:
	var keys := KeyBindings.new()
	check_eq(keys.label("unknownFutureAction"), "Unassigned", "unknown hint cannot crash settings")
	check_eq(keys.keys["toggleGrid"], [KEY_QUOTELEFT], "grid registered")
	check_eq(keys.keys["advice"], [KEY_O], "advice registered")
