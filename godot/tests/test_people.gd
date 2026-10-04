extends TestCase
## Families, children and welcomed travellers, ported from tests/households.test.ts and
## tests/recruitment.test.ts (same seeds and scenarios). The two-settlement case waits for
## settlements to be ported.


func _instant(sim: Simulation, type: String, near: Vector2i) -> Building:
	var d := Defs.building(type)
	for r in 30:
		for y in range(near.y - r, near.y + r + 1):
			for x in range(near.x - r, near.x + r + 1):
				var ok := true
				for dy in range(-1, int(d["size"]["h"]) + 1):
					for dx in range(-1, int(d["size"]["w"]) + 1):
						if not ok:
							break
						var t := sim.world.terrain(x + dx, y + dy)
						var o := sim.world.obj(x + dx, y + dy)
						ok = sim.world.explored(x + dx, y + dy) and sim.building_at(x + dx, y + dy) == null and (t == Tiles.GRASS or t == Tiles.MEADOW or t == Tiles.FOREST) and o != World.UNKNOWN and Tiles.blocks[o] == 0
				if ok:
					var b := BuildingOps.place(sim, type, x, y)
					b.delivered = BuildingOps.cost_of(b).duplicate()
					BuildingOps.complete(sim, b, true)
					return b
	return null


## A valley with one finished family home (3 beds) and plenty of food; the first two settlers live there.
func _family_world(seed_value: int = 7070) -> Array:
	var sim := NewGame.create(seed_value)
	SimHelpers.camp(sim).inventory = {"food": 200, "wood": 40, "stone": 20}
	var home := _instant(sim, "familyHome", Vector2i(4, -5))
	var a := sim.settlers[0]
	var b := sim.settlers[1]
	var camp := SimHelpers.camp(sim)
	for s in sim.settlers:
		if s.home_id == home.id and s != a and s != b:
			s.home_id = camp.id
	a.home_id = home.id
	b.home_id = home.id
	return [sim, home, a, b]


func _household(sim: Simulation, a: Settler, b: Settler) -> int:
	var r := Commands.apply(sim, {"type": "formHousehold", "ids": [a.id, b.id]})
	check(bool(r["ok"]), "household formed: %s" % r["message"])
	return int(r.get("id", -1))


func _claims_on(sim: Simulation, home: Building) -> int:
	var n := 0
	for c: Dictionary in sim.bed_claims:
		if int(c["homeId"]) == home.id:
			n += 1
	return n


func _residents(sim: Simulation, home: Building) -> int:
	var n := 0
	for s in sim.settlers:
		if s.home_id == home.id:
			n += 1
	return n


func test_new_valleys_grow_deliberately() -> void:
	var sim := NewGame.create(1111)
	check_eq(sim.growth_mode, "deliberate", "growth mode")
	SimHelpers.camp(sim).inventory = {"food": 200}
	_instant(sim, "house", Vector2i(4, -5))
	SimHelpers.run(sim, Defs.DAY_TICKS)
	check_eq(sim.settlers.size(), 5, "nobody arrives on their own")
	var st := sim.population_status.to_lower()
	check(st.contains("visitor") or st.contains("family") or st.contains("household"), "status: %s" % sim.population_status)


func test_legacy_worlds_keep_arrivals_until_they_adopt() -> void:
	var sim := NewGame.create(1112)
	sim.growth_mode = "legacy"
	SimHelpers.camp(sim).inventory = {"food": 200}
	_instant(sim, "house", Vector2i(4, -5))
	SimHelpers.run(sim, 1200)
	check(sim.settlers.size() > 5, "a newcomer arrives in a legacy world (%d settlers)" % sim.settlers.size())
	check(not bool(Commands.apply(sim, {"type": "formHousehold", "ids": [sim.settlers[0].id, sim.settlers[1].id]})["ok"]), "families need the new rules")
	check(bool(Commands.apply(sim, {"type": "adoptDeliberateGrowth"})["ok"]), "adopt")
	check(not bool(Commands.apply(sim, {"type": "adoptDeliberateGrowth"})["ok"]), "only once")
	var re: Simulation = SaveCodec.decode(JSON.parse_string(JSON.stringify(SaveCodec.encode(sim, "x", 0), "", true, true)))["sim"]
	check_eq(re.growth_mode, "deliberate", "kept across a reload")


func test_household_refusals() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var a: Settler = w[2]
	var b: Settler = w[3]
	var c := sim.settlers[2]
	check(not bool(Commands.apply(sim, {"type": "formHousehold", "ids": [a.id, a.id]})["ok"]), "same adult twice")
	check(not bool(Commands.apply(sim, {"type": "formHousehold", "ids": [a.id, 9999]})["ok"]), "unknown person")
	_household(sim, a, b)
	check(str(Commands.apply(sim, {"type": "formHousehold", "ids": [a.id, c.id]})["message"]).contains("already"), "already in a household")
	var kid := sim.add_settler(0, 2, "laborer")
	kid.life_stage = "child"
	check(str(Commands.apply(sim, {"type": "formHousehold", "ids": [c.id, kid.id]})["message"]).to_lower().contains("child"), "children can't")


func test_the_couple_moves_in_together() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var home: Building = w[1]
	var a: Settler = w[2]
	var b: Settler = w[3]
	a.home_id = SimHelpers.camp(sim).id
	_household(sim, a, b)
	check_eq([a.home_id, b.home_id], [home.id, home.id], "both live in the family home")


func test_a_pending_child_holds_the_third_bed() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var home: Building = w[1]
	var hh := _household(sim, w[2], w[3])
	check(bool(Commands.apply(sim, {"type": "requestChild", "householdId": hh})["ok"]), "child requested")
	check_eq(_claims_on(sim, home), 1, "one claim")
	check_eq(_residents(sim, home) + _claims_on(sim, home), home.beds(), "the home is full with the claim")
	var extra := sim.add_settler(0, 2, "laborer")
	BuildingOps.assign_homes(sim)
	check(extra.home_id != home.id, "nobody else takes the claimed bed")


func test_child_request_refusals() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var a: Settler = w[2]
	var hh := _household(sim, a, w[3])
	var lodger := sim.add_settler(0, 2, "laborer")
	lodger.home_id = a.home_id
	var no_bed := str(Commands.apply(sim, {"type": "requestChild", "householdId": hh})["message"])
	check(no_bed.contains("bed") and no_bed.contains("3 settlers") and no_bed.contains("bedrolls"), "no bed: %s" % no_bed)
	lodger.home_id = SimHelpers.camp(sim).id
	var camp := SimHelpers.camp(sim)
	var food: int = camp.inventory["food"]
	camp.inventory["food"] = 19
	check(str(Commands.apply(sim, {"type": "requestChild", "householdId": hh})["message"]).contains("food"), "short of food")
	camp.inventory["food"] = food
	check(bool(Commands.apply(sim, {"type": "requestChild", "householdId": hh})["ok"]), "requested")
	check(str(Commands.apply(sim, {"type": "requestChild", "householdId": hh})["message"]).contains("already"), "only one at a time")
	check_eq(sim.bed_claims.size(), 1, "one claim")
	check(bool(Commands.apply(sim, {"type": "cancelChildRequest", "householdId": hh})["ok"]), "cancelled")
	check_eq(sim.bed_claims.size(), 0, "claim released")


func test_a_child_is_born_exactly_once_even_across_a_save() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var home: Building = w[1]
	var hh := _household(sim, w[2], w[3])
	check(bool(Commands.apply(sim, {"type": "requestChild", "householdId": hh})["ok"]), "requested")
	var h := People.household(sim, hh)
	var stable := int(Content.get_value("kingdomBalance", "CHILD_STABLE_TICKS"))
	SimHelpers.run_until(sim, func() -> bool: return h["pending"] != null and int(h["pending"]["stableTicks"]) >= stable - 50, stable + Defs.DAY_TICKS)
	check_eq(sim.settlers.size(), 5, "not born yet")
	var loaded: Simulation = SaveCodec.decode(JSON.parse_string(JSON.stringify(SaveCodec.encode(sim, "x", 0), "", true, true)))["sim"]
	for world: Simulation in [sim, loaded]:
		SimHelpers.run_until(world, func() -> bool: return world.settlers.size() == 6, Defs.DAY_TICKS)
		SimHelpers.run(world, 200)
		check_eq(world.settlers.size(), 6, "exactly one child")
		var kid := world.settlers[5]
		check_eq(kid.life_stage, "child", "a child")
		check_eq(kid.home_id, home.id, "in the family home")
		check_eq(kid.household_id, hh, "in the household")
		check_eq(world.bed_claims.size(), 0, "claim used up")
		var wh := People.household(world, hh)
		check(wh["pending"] == null, "no longer expecting")
		check_eq(int(world.stats["births"]), 1, "one birth")
		check(str(Commands.apply(world, {"type": "requestChild", "householdId": hh})["message"]).contains("rest"), "the family rests before another")
		check_eq(SimHelpers.reservation_problems(world), PackedStringArray(), "reservations")


func test_children_take_no_work_then_grow_up() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var kid := sim.add_settler(0, 2, "laborer")
	kid.life_stage = "child"
	for cmd: Dictionary in [{"type": "setJob", "ids": [kid.id], "job": "builder"}, {"type": "setPriorities", "ids": [kid.id], "priorities": ["build"]}, {"type": "gather", "ids": [kid.id], "x": 3, "y": 3}]:
		var r := Commands.apply(sim, cmd)
		check(not bool(r["ok"]) and str(r["message"]).to_lower().contains("child"), "%s refused: %s" % [cmd["type"], r["message"]])
	for i in 20:
		SimHelpers.run(sim, 50)
		check(kid.task == null or not [Task.BUILD, Task.HAUL, Task.FARM, Task.GATHER, Task.CRAFT, Task.DELIVER].has(kid.task.kind), "no adult work")
	check(kid.idle_reason.to_lower().contains("child") or kid.idle_reason.to_lower().contains("play"), "reason: %s" % kid.idle_reason)
	kid.age_ticks = int(Content.get_value("kingdomBalance", "CHILD_ADULT_TICKS")) - 10
	SimHelpers.run(sim, 60)
	check_eq(kid.life_stage, "adult", "grown up")
	check_eq(kid.job, "laborer", "a labourer")


func test_a_food_shortage_pauses_the_child_then_resumes() -> void:
	var w := _family_world()
	var sim: Simulation = w[0]
	var hh := _household(sim, w[2], w[3])
	Commands.apply(sim, {"type": "requestChild", "householdId": hh})
	var h := People.household(sim, hh)
	SimHelpers.run(sim, 500)
	var before := int(h["pending"]["stableTicks"])
	check(before > 0, "progressing")
	SimHelpers.camp(sim).inventory["food"] = 5
	var at := int(h["pending"]["stableTicks"])
	SimHelpers.run(sim, 100)
	check(int(h["pending"]["stableTicks"]) <= at + 50, "paused")
	check(str(h["pending"]["blocked"]).contains("food"), "reason: %s" % h["pending"]["blocked"])
	check_eq(sim.settlers.size(), 5, "nobody harmed")
	SimHelpers.camp(sim).inventory["food"] = 200
	SimHelpers.run(sim, 200)
	check_eq(str(h["pending"]["blocked"]), "", "resumed")
	check(int(h["pending"]["stableTicks"]) > before, "progressing again")


func test_demolishing_the_home_moves_the_claim_or_pauses() -> void:
	var sim := NewGame.create(7070)
	SimHelpers.camp(sim).inventory = {"food": 200, "wood": 40, "stone": 20}
	var home := _instant(sim, "familyHome", Vector2i(4, -5))
	var spare := _instant(sim, "familyHome", Vector2i(-8, -6))
	var a := sim.settlers[0]
	var b := sim.settlers[1]
	for s in sim.settlers:
		if (s.home_id == home.id or s.home_id == spare.id) and s != a and s != b:
			s.home_id = SimHelpers.camp(sim).id
	a.home_id = home.id
	b.home_id = home.id
	var hh := _household(sim, a, b)
	Commands.apply(sim, {"type": "requestChild", "householdId": hh})
	check_eq(int(sim.bed_claims[0]["homeId"]), home.id, "claim in the home")
	check(bool(Commands.apply(sim, {"type": "remove", "buildingId": home.id})["ok"]), "demolished")
	check_eq(sim.settlers.size(), 5, "everyone kept")
	check_eq(sim.bed_claims.size(), 1, "claim kept")
	check_eq(int(sim.bed_claims[0]["homeId"]), spare.id, "claim moved to the spare home")
	check(_residents(sim, spare) + _claims_on(sim, spare) <= spare.beds(), "the spare home is not over-full")
	check(bool(Commands.apply(sim, {"type": "remove", "buildingId": spare.id})["ok"]), "spare demolished")
	check_eq(sim.bed_claims.size(), 0, "no permanent bed left: claim released")
	var h := People.household(sim, hh)
	check(h["pending"] != null, "still expecting")
	SimHelpers.run(sim, 100)
	check(str(h["pending"]["blocked"]).contains("bed"), "waits for a bed: %s" % h["pending"]["blocked"])


func test_milestones_count_adults_only() -> void:
	var sim := NewGame.create(3)
	for i in 3:
		sim.add_settler(0, 2, "laborer").life_stage = "child"
	check_eq(int(Progression.requirement_progress(sim, {"kind": "population", "count": 6})["current"]), 5, "five adults")
	sim.add_settler(0, 2, "laborer")
	check(bool(Progression.requirement_progress(sim, {"kind": "population", "count": 6})["done"]), "six adults")


# ---- travellers ---------------------------------------------------------------------------------

func test_the_first_visitor_comes_early_and_moves_on_unanswered() -> void:
	var sim := NewGame.create(2020)
	var first := int(Content.get_value("kingdomBalance", "FIRST_VISITOR_TICK"))
	SimHelpers.run(sim, first + 60)
	check(not sim.offer.is_empty(), "a visitor by the first visit time")
	var lifetime := int(Content.get_value("kingdomBalance", "OFFER_LIFETIME"))
	SimHelpers.run(sim, lifetime + 60)
	check(sim.offer.is_empty() or int(sim.offer["arrivedTick"]) > first + 60, "an unanswered visitor moves on")


func test_welcoming_brings_exactly_one_adult_and_charges_once() -> void:
	var sim := NewGame.create(3030)
	SimHelpers.camp(sim).inventory = {"food": 80}
	SimHelpers.run_until(sim, func() -> bool: return not sim.offer.is_empty(), 2000)
	var offer_id := int(sim.offer["id"])
	var hall := int(sim.settlements[0]["id"])
	var r := Commands.apply(sim, {"type": "acceptRecruit", "offerId": offer_id, "settlementId": hall})
	check(bool(r["ok"]), "accepted: %s" % r["message"])
	check(not bool(Commands.apply(sim, {"type": "acceptRecruit", "offerId": offer_id, "settlementId": hall})["ok"]), "a second click does nothing")
	check_eq(int(sim.totals()["food"]), 40, "40 food in escrow, 40 left")
	var loaded: Simulation = SaveCodec.decode(JSON.parse_string(JSON.stringify(SaveCodec.encode(sim, "x", 0), "", true, true)))["sim"]
	for world: Simulation in [sim, loaded]:
		SimHelpers.run_until(world, func() -> bool: return world.settlers.size() == 6, 1000)
		SimHelpers.run(world, 300)
		check_eq(world.settlers.size(), 6, "exactly one arrival")
		check_eq(int(world.stats["arrivals"]), 1, "counted once")
		check(world.recruits.is_empty(), "no traveller left on the road")


func test_one_food_short_is_refused_and_nothing_is_charged() -> void:
	var sim := NewGame.create(3031)
	SimHelpers.camp(sim).inventory = {"food": 59}
	SimHelpers.run_until(sim, func() -> bool: return not sim.offer.is_empty(), 2000)
	var food := int(sim.totals()["food"])
	var r := Commands.apply(sim, {"type": "acceptRecruit", "offerId": sim.offer["id"], "settlementId": sim.settlements[0]["id"]})
	check(not bool(r["ok"]) and str(r["message"]).contains("food"), "refused: %s" % r["message"])
	check_eq(int(sim.totals()["food"]), food, "nothing charged")
	check(sim.bed_claims.is_empty(), "no bed claimed")


func test_calling_off_returns_all_the_food() -> void:
	var sim := NewGame.create(3032)
	SimHelpers.camp(sim).inventory = {"food": 100}
	SimHelpers.run_until(sim, func() -> bool: return not sim.offer.is_empty(), 2000)
	var before := int(sim.totals()["food"])
	var r := Commands.apply(sim, {"type": "acceptRecruit", "offerId": sim.offer["id"], "settlementId": sim.settlements[0]["id"]})
	var rid := int(r.get("id", -1))
	check(bool(Commands.apply(sim, {"type": "cancelRecruit", "recruitId": rid})["ok"]), "called off")
	check_eq(int(sim.totals()["food"]), before, "every unit of food back")
	check(sim.bed_claims.is_empty() and sim.recruits.is_empty(), "nothing left promised")
