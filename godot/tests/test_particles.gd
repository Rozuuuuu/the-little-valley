extends TestCase
## Cosmetic particles: bursts, lifetimes, the cap, and building life.


func test_bursts_live_and_expire() -> void:
	var p := Particles.new()
	p._ready()
	p.fx("woodchips", 1, 1)
	check_eq(p.list.size(), 5, "five wood chips")
	p.on_event({"type": "hit", "target": "animal", "id": 1, "amount": 3, "reach": 4.0, "x": 2.0, "y": 2.0, "fromX": 0.0, "fromY": 0.0})
	check(p.list.any(func(q: Array) -> bool: return q[9] == "arrow") and p.list.any(func(q: Array) -> bool: return q[9] == "text" and q[11] == "-3"),
		"a hit from afar flies an arrow and shows the damage")
	var y0: float = p.list[0][1]
	p.step(0.1, null, Rect2(), null, true, false)
	check(p.list[0][1] != y0, "particles move")
	for i in 40:
		p.step(0.1, null, Rect2(), null, true, false)
	check(p.list.is_empty(), "and are gone after their life")
	for i in Particles.MAX + 50:
		p.fx("glint", 0, 0)
	check_eq(p.list.size(), Particles.MAX, "never more than the cap")
	p.free()


func test_homes_smoke_and_effects_can_be_turned_down() -> void:
	var sim := NewGame.create(101)
	var art := Art.new()
	art.load_all(0.25)
	var hall := BuildingOps.camp_of(sim)
	var view := Rect2(Vector2(hall.x - 10, hall.y - 10) * WorldView.TILE_PX, Vector2(20, 20) * WorldView.TILE_PX)
	var p := Particles.new()
	p._ready()
	for i in 700:
		p.step(1.0 / 60.0, sim, view, art, true, true)
	check(not p.list.any(func(q: Array) -> bool: return q[9] == "smoke"), "low effects: no chimney smoke")
	for i in 700:
		p.step(1.0 / 60.0, sim, view, art, false, true)
	check(p.list.any(func(q: Array) -> bool: return q[9] == "smoke"), "the Town Hall smokes at night")
	var top: Variant = art.point("house", "chimney")
	check(top is Vector2 and (top as Vector2).y < 0.0, "houses know where their chimney is")
	p.free()
