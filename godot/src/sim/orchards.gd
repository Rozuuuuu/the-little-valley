class_name Orchards
## Orchards (src/game/sim/orchards.ts): planted at Camp, they establish over two growing-season
## days, then ripen apples while a farmer tends them. Nothing grows in winter. Farmers pick when
## enough apples are ripe and carry them to storage; the workshop can dry apples into food.

const WORK := {&"tend": 40, &"pick": 30}


static func _k(name: String) -> int:
	return int(Content.get_value("kingdomBalance", name))


static func init_orchard(sim: Simulation, b: Building) -> void:
	b.orchard = {"growth": 0.0, "fruit": 0.0, "careUntil": sim.tick + _k("ORCHARD_CARE_TICKS")}


static func established(b: Building) -> bool:
	return not b.orchard.is_empty() and float(b.orchard["growth"]) >= _k("ORCHARD_ESTABLISH_TICKS")


static func _resting(sim: Simulation) -> bool:
	return float((sim.season()["def"] as Dictionary)["growth"]) <= 0.0


## What the orchard needs from a farmer now (&"pick", &"tend"), or &"".
static func action(sim: Simulation, b: Building) -> StringName:
	var o := b.orchard
	if o.is_empty() or not b.built:
		return &""
	if floori(float(o["fruit"])) >= _k("ORCHARD_PICK_MIN"):
		return &"pick"
	if not _resting(sim) and established(b) and int(o["careUntil"]) - sim.tick < _k("ORCHARD_CARE_TICKS") / 2:
		return &"tend"
	return &""


## Trees establish, then ripen apples while tended; everything rests in winter. Every 5 ticks.
static func update(sim: Simulation, dt: int) -> void:
	if _resting(sim):
		return
	var est := float(_k("ORCHARD_ESTABLISH_TICKS"))
	for b in sim.orchards():
		var o := b.orchard
		if float(o["growth"]) < est:
			o["growth"] = minf(est, float(o["growth"]) + dt)
		elif sim.tick < int(o["careUntil"]):
			o["fruit"] = minf(float(_k("ORCHARD_MAX_FRUIT")), float(o["fruit"]) + float(dt * _k("ORCHARD_APPLES_PER_DAY")) / Defs.DAY_TICKS)


## Applies a finished job; returns the apples picked (the farmer carries them to storage).
static func apply_action(sim: Simulation, b: Building, what: StringName, capacity: int) -> int:
	var o := b.orchard
	if what == &"tend":
		o["careUntil"] = sim.tick + _k("ORCHARD_CARE_TICKS")
		return 0
	var n := mini(floori(float(o["fruit"])), capacity)
	o["fruit"] = float(o["fruit"]) - n
	sim.stats["applesPicked"] = int(sim.stats["applesPicked"]) + n
	return n


static func run(sim: Simulation, s: Settler, t: Task) -> void:
	var b: Building = sim.buildings.get(t.field)
	if b == null or b.orchard.is_empty() or action(sim, b) != t.action:
		SettlerTasks.abort_task(sim, s)
		return
	if t.action == &"pick" and s.carrying():
		SettlerTasks.abort_task(sim, s)
		return
	if t.stage == &"walk":
		var m := SettlerTasks.go_to(sim, s, b.goal_adjacent())
		if m == SettlerTasks.Move.FAILED:
			SettlerTasks.fail(sim, s, "Can't reach the orchard", Simulation.T_BUILDING + b.id)
		elif m == SettlerTasks.Move.ARRIVED:
			t.stage = &"work"
		return
	SettlerTasks.face_rect(s, b.x, b.y, b.w, b.h)
	s.anim = &"work"
	s.tool = &"hand" if t.action == &"pick" else &"sickle"
	t.timer += SettlerTasks.work_speed(sim, s)
	if t.timer < float(WORK[t.action]):
		return
	var n := apply_action(sim, b, t.action, s.capacity)
	if n > 0:
		s.set_carry("apples", n)
		sim.emit({"type": "sfx", "name": "pick", "x": s.x, "y": s.y})
	sim.emit({"type": "fx", "kind": "leaves", "x": b.x + 1.0, "y": b.y + 1.0})
	SettlerTasks.abort_task(sim, s)


## Plain status for the inspector.
static func status(sim: Simulation, b: Building) -> String:
	var o := b.orchard
	if not b.built or o.is_empty():
		return "Being planted"
	var winter := _resting(sim)
	if not established(b):
		var left := ceilf((_k("ORCHARD_ESTABLISH_TICKS") - float(o["growth"])) / Defs.DAY_TICKS * 10.0) / 10.0
		return "Young trees resting for winter" if winter else "Young trees establishing (%s growing days to go)" % str(left)
	if winter:
		return "Resting for winter · %d apples on the trees" % floori(float(o["fruit"]))
	var tended := sim.tick < int(o["careUntil"])
	return "%d/%d apples ripe · %s" % [floori(float(o["fruit"])), _k("ORCHARD_MAX_FRUIT"), "tended" if tended else "needs a farmer to tend it before it bears again"]


## Which picture to draw: saplings, leafy, fruit1–3, autumn, winter.
static func look(sim: Simulation, b: Building) -> String:
	var season: String = sim.season()["id"]
	if not established(b):
		return "winter" if season == "winter" else "saplings"
	if season == "winter":
		return "winter"
	var fruit := floori(float(b.orchard["fruit"]))
	if fruit >= 24:
		return "fruit3"
	if fruit >= 12:
		return "fruit2"
	if fruit >= 4:
		return "fruit1"
	return "autumn" if season == "autumn" else "leafy"
