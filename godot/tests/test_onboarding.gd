extends TestCase


func test_new_campaign_starts_in_camp_and_gates_its_first_upgrade() -> void:
	var sim := NewGame.create_camp(4242)
	var camp := BuildingOps.camp_of(sim)
	check_eq(camp.type, "camp", "campaign begins with tents")
	check_eq(camp.level, 1, "first level")
	check_eq(camp.inventory, NewGame.STARTING_GOODS, "same starting goods")
	check_eq(int(sim.settlements[0]["id"]), camp.id, "settlement identity retained")
	check(Levels.upgrade_problem(sim, camp).contains("finish"), "founding requirements explained")
	for type: String in ["house", "storehouse", "workshop"]:
		check(RealmHelpers.instant(sim, type, Vector2i(8, 6)) != null, "placed " + type)
	for i in 3:
		check(RealmHelpers.instant(sim, "field", Vector2i(-8 + i * 2, 6)) != null, "field placed")
	camp.inventory = {"food": 30, "wood": 40, "stone": 30, "planks": 10}
	var id := camp.id
	sim = RealmHelpers.reload_sim(sim)
	camp = sim.buildings[id]
	check(bool(camp.extra.get("foundingCamp", false)), "requirements marker survives reload")
	check_eq(Levels.upgrade_problem(sim, camp), "", "requirements and resources allow upgrade")
	check(bool(Commands.apply(sim, {"type": "upgradeBuilding", "buildingId": id})["ok"]), "upgrade command accepted")
	for i in 1201:
		Levels.update(sim)
	check_eq(camp.type, "townHall", "camp becomes hall")
	check_eq(camp.id, id, "upgrade preserves references")
	check_eq(Levels.next_level(camp)["name"], "Keep", "keep follows hall")
	check_eq(camp.inventory.get("wood", 0), 0, "upgrade paid once")


func test_guided_steps_pause_until_acknowledged_and_skip_releases_pause() -> void:
	var sim := NewGame.create_camp(4242)
	var state := {"step": 0, "done": false, "guided": true, "awaiting": true}
	check(Tutorial.waiting(state), "first instruction waits")
	Tutorial.advance(state, sim, 3, false)
	check_eq(state["step"], 0, "existing selection cannot dismiss instruction")
	state["awaiting"] = false
	Tutorial.advance(state, sim, 3, false)
	check_eq(state["step"], 1, "action completes current step")
	check(Tutorial.waiting(state), "next instruction pauses again")
	state["done"] = true
	check(not Tutorial.waiting(state), "skip releases tutorial pause")


func test_missing_shortcut_is_safe_and_new_shortcuts_have_keys() -> void:
	var keys := KeyBindings.new()
	check_eq(keys.label("unknownFutureAction"), "Unassigned", "unknown hint cannot crash settings")
	check_eq(keys.keys["toggleGrid"], [KEY_QUOTELEFT], "grid registered")
	check_eq(keys.keys["advice"], [KEY_O], "advice registered")
