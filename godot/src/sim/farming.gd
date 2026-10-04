class_name Farming
## Fields and weather (src/game/sim/farming.ts). Same constants and rules.

## Moisture lost per tick. A watered field stays moist for most of a day.
const DRYING_RATE := 0.00055
## Below this, farmers water the field.
const WATER_THRESHOLD := 0.3
## Below this, crops grow at DRY_GROWTH speed rather than stopping.
const DRY_LEVEL := 0.12
const DRY_GROWTH := 0.4
const FIELD_WORK := {&"till": 30, &"plant": 20, &"water": 14, &"harvest": 22}


static func new_field(crop: String) -> Dictionary:
	return {"crop": crop, "state": "wild", "growth": 0.0, "moisture": 0.5}


## The next job a field needs, or &"" when it needs none.
static func field_action(sim: Simulation, f: Dictionary) -> StringName:
	match f["state"]:
		"wild":
			return &"till"
		"tilled":
			# Nothing is sown in winter; tilled fields wait for spring.
			return &"plant" if f["crop"] != "" and bool((sim.season()["def"] as Dictionary)["planting"]) else &""
		"growing":
			var season: Dictionary = sim.season()["def"]
			return &"water" if not sim.raining and float(season["growth"]) > 0.0 and float(f["moisture"]) < WATER_THRESHOLD else &""
		"ripe":
			return &"harvest"
	return &""


## Visual stage 0..stages-1 (last = ripe), or -1 before planting.
static func field_stage(f: Dictionary) -> int:
	if f["crop"] == "":
		return 0
	var d := Defs.crop(f["crop"])
	var stages: int = d["stages"]
	if f["state"] == "ripe":
		return stages - 1
	if f["state"] != "growing":
		return -1
	return mini(stages - 2, floori(float(f["growth"]) / float(d["growTicks"]) * (stages - 1)))


static func seasonal_growth(sim: Simulation, crop: String) -> float:
	var s := sim.season()
	var def: Dictionary = s["def"]
	var pref: Dictionary = Defs.crop(crop).get("seasons", {})
	return float(def["growth"]) * float(pref.get(s["id"], 1.0))


static func update_fields(sim: Simulation, dt: int) -> void:
	var season: Dictionary = sim.season()["def"]
	# Snow in winter does not water anything (nothing grows); rain does.
	var rain := sim.raining and float(season["growth"]) > 0.0
	# Wells are not part of the slice yet (they keep nearby fields from drying below the threshold).
	for b: Building in sim.fields():
		var f := b.field
		if rain:
			f["moisture"] = 1.0
		else:
			f["moisture"] = maxf(0.0, float(f["moisture"]) - DRYING_RATE * float(season["drying"]) * dt)
		if f["state"] != "growing" or f["crop"] == "":
			continue
		var fertility: float = Tiles.fertility[sim.world.terrain(b.x, b.y)] if sim.world.terrain(b.x, b.y) != World.UNKNOWN else 1.0
		var rate := (1.0 if float(f["moisture"]) > DRY_LEVEL else DRY_GROWTH) * fertility * seasonal_growth(sim, f["crop"])
		f["growth"] = float(f["growth"]) + dt * rate
		var grow_ticks := float(Defs.crop(f["crop"])["growTicks"])
		if float(f["growth"]) >= grow_ticks:
			f["state"] = "ripe"
			f["growth"] = grow_ticks


static func apply_field_action(sim: Simulation, b: Building, action: StringName) -> void:
	var f := b.field
	var x := b.x + 0.5
	var y := b.y + 0.5
	match action:
		&"till":
			f["state"] = "tilled"
			sim.emit({"type": "sfx", "name": "dig", "x": x, "y": y})
			sim.emit({"type": "fx", "kind": "soil", "x": x, "y": y})
		&"plant":
			f["state"] = "growing"
			f["growth"] = 0.0
			f["moisture"] = maxf(float(f["moisture"]), 0.6)
			sim.emit({"type": "sfx", "name": "plant", "x": x, "y": y})
		&"water":
			f["moisture"] = 1.0
			sim.emit({"type": "sfx", "name": "water", "x": x, "y": y})
			sim.emit({"type": "fx", "kind": "splash", "x": x, "y": y})
		&"harvest":
			f["state"] = "tilled"
			f["growth"] = 0.0
			sim.emit({"type": "sfx", "name": "harvest", "x": x, "y": y})
			sim.emit({"type": "fx", "kind": "sparkle", "x": x, "y": y})


static func update_weather(sim: Simulation) -> void:
	if sim.tick < sim.weather_next_change:
		return
	var s := sim.season()
	if sim.raining:
		sim.raining = false
		sim.weather_next_change = sim.tick + roundi(Defs.DAY_TICKS * sim.rng.range_f(0.7, 1.6))
	elif sim.rng.chance(float((s["def"] as Dictionary)["rainChance"])):
		sim.raining = true
		sim.weather_next_change = sim.tick + roundi(sim.rng.range_f(300, 700))
		sim.toast("Snow begins to fall softly over the valley." if s["id"] == "winter" else "A gentle rain begins. The fields drink it up.")
	else:
		sim.weather_next_change = sim.tick + roundi(Defs.DAY_TICKS * sim.rng.range_f(0.4, 0.9))
