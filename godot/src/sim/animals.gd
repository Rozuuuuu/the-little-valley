class_name Animals
## Animals (src/game/sim/animals.ts): wild herds wander near a home spot and run from people;
## livestock stays inside its pen, breeds, and gives eggs, milk, wool or foals for herders to
## collect. They draw from their own random stream, so adding animals never changes what
## settlers do. Hunting and herding work is in Husbandry.

const FLEE_CHECK := 6


static func species(id: String) -> Dictionary:
	return (Content.get_value("animals", "SPECIES") as Dictionary)[id]


static func is_species(id: String) -> bool:
	return (Content.get_value("animals", "SPECIES") as Dictionary).has(id)


static func value(key: String) -> Variant:
	return Content.get_value("animals", key)


## The fauna of a world: its habitat, or the meadow valley for worlds from before habitats.
static func habitat_of(sim: Simulation) -> String:
	return sim.world.habitat_id if sim.world.gen >= 4 else "valley"


static func can_stand(sim: Simulation, sp: String, x: int, y: int) -> bool:
	var t := sim.world.terrain(x, y)
	if bool(species(sp).get("swims", false)):
		return t == Tiles.WATER or t == Tiles.DEEP_WATER
	return sim.walkable(x, y) and sim.building_at(x, y) == null


static func likes(sim: Simulation, sp: String, x: int, y: int) -> bool:
	# Content numbers arrive as floats from JSON, so compare by value.
	var t := float(sim.world.terrain(x, y))
	for v: Variant in species(sp)["terrain"]:
		if float(v) == t:
			return can_stand(sim, sp, x, y)
	return false


static func add(sim: Simulation, sp: String, x: int, y: int, pen_id: int = -1) -> Animal:
	var a := Animal.new()
	a.id = sim.alloc_id()
	a.species = sp
	a.x = x + 0.5
	a.y = y + 0.5
	a.px = a.x
	a.py = a.y
	a.rpx = a.x
	a.rpy = a.y
	a.rx = a.x
	a.ry = a.y
	a.home_x = x
	a.home_y = y
	a.tx = a.x
	a.ty = a.y
	a.timer = sim.animal_rng.int_below(60)
	a.facing = 2 if sim.animal_rng.chance(0.5) else 3
	a.pen_id = pen_id
	sim.animals.append(a)
	return a


static func remove(sim: Simulation, a: Animal) -> void:
	var i := sim.animals.find(a)
	if i >= 0:
		sim.animals.remove_at(i)
		sim.emit({"type": "death", "species": a.species, "id": a.id, "x": a.x, "y": a.y, "facing": a.facing})
	if a.hunted_by != -1:
		sim.release(Simulation.K_HUNT + a.id, a.hunted_by)


static func find(sim: Simulation, id: int) -> Animal:
	for a in sim.animals:
		if a.id == id:
			return a
	return null


static func _pick_species(sim: Simulation) -> String:
	var list: Array = (value("WILDLIFE") as Dictionary)[habitat_of(sim)]
	var total := 0.0
	for e: Dictionary in list:
		total += float(e["weight"])
	var r := sim.animal_rng.next() * total
	for e: Dictionary in list:
		r -= float(e["weight"])
		if r < 0:
			return str(e["species"])
	return str(list[0]["species"])


## Places one wild herd at a spot the species likes, away from the settlements. Returns how many
## appeared.
static func spawn_herd(sim: Simulation, min_d: float, max_d: float) -> int:
	var sp := _pick_species(sim)
	var d := species(sp)
	var centres: Array[Building] = []
	for st: Dictionary in sim.settlements:
		var b: Building = sim.buildings.get(int(st["id"]))
		if b != null:
			centres.append(b)
	var origin: Building = centres[sim.animal_rng.int_below(centres.size())] if not centres.is_empty() else null
	var ox := origin.x + origin.w / 2.0 if origin != null else 0.0
	var oy := origin.y + origin.h / 2.0 if origin != null else 0.0
	for attempt in 24:
		var ang := sim.animal_rng.next() * PI * 2.0
		var dist := min_d + sim.animal_rng.next() * (max_d - min_d)
		var x := floori(ox + JsMath.cos_js(ang) * dist)
		var y := floori(oy + JsMath.sin_js(ang) * dist)
		if not sim.world.explored(x, y) or not likes(sim, sp, x, y):
			continue
		var too_close := false
		for c in centres:
			if JsMath.hypot(c.x - x, c.y - y) < min_d:
				too_close = true
		if too_close:
			continue
		var herd: Array = d["herd"]
		var n := int(herd[0]) + sim.animal_rng.int_below(int(herd[1]) - int(herd[0]) + 1)
		var placed := 0
		var i := 0
		while i < n * 4 and placed < n:
			i += 1
			var hx := x + sim.animal_rng.int_below(5) - 2
			var hy := y + sim.animal_rng.int_below(5) - 2
			if not likes(sim, sp, hx, hy):
				continue
			var a := add(sim, sp, hx, hy)
			a.home_x = x
			a.home_y = y
			placed += 1
		if placed > 0:
			return placed
	return 0


## A new world starts with a few herds in sight of the hall.
static func seed_wildlife(sim: Simulation) -> void:
	for i in 4:
		spawn_herd(sim, 9, 22)


static func wild_count(sim: Simulation) -> int:
	var n := 0
	for a in sim.animals:
		if a.pen_id == -1:
			n += 1
	return n


# ---- pens -------------------------------------------------------------------------------------

static func pen_def(b: Building) -> Dictionary:
	return b.def().get("pen", {})


static func pen_capacity(b: Building) -> int:
	var d := pen_def(b)
	if d.is_empty():
		return 0
	var v: Variant = b.stat("penCapacity")
	return int(v) if v != null else int(d["capacity"])


static func pen_animals(sim: Simulation, b: Building) -> Array[Animal]:
	var out: Array[Animal] = []
	for a in sim.animals:
		if a.pen_id == b.id:
			out.append(a)
	return out


static func _random_tile_in(sim: Simulation, b: Building) -> Vector2i:
	return Vector2i(b.x + sim.animal_rng.int_below(b.w), b.y + sim.animal_rng.int_below(b.h))


## A finished pen gets its breeding pair (bought with the build cost).
static func stock_pen(sim: Simulation, b: Building) -> void:
	var d := pen_def(b)
	if d.is_empty():
		return
	b.pen = {"breed": 0.0, "ready": 0.0}
	for i in 2:
		var t := _random_tile_in(sim, b)
		add(sim, str(d["species"]), t.x, t.y, b.id)


## Pens breed and produce in steps; products wait for a herder to collect them.
static func update_pens(sim: Simulation) -> void:
	var step := int(value("PEN_STEP"))
	for b in sim.pens():
		var d := pen_def(b)
		if b.pen.is_empty():
			continue
		var herd := pen_animals(sim, b).size()
		var cap := pen_capacity(b)
		if herd >= 2 and herd < cap:
			b.pen["breed"] = float(b.pen["breed"]) + step
			if float(b.pen["breed"]) >= float(d["breedTicks"]):
				b.pen["breed"] = 0.0
				var t := _random_tile_in(sim, b)
				add(sim, str(d["species"]), t.x, t.y, b.id)
		else:
			b.pen["breed"] = 0.0
		if d.has("product") and herd > 0:
			var p: Dictionary = d["product"]
			b.pen["ready"] = minf(float(value("PEN_PRODUCT_CAP")), float(b.pen["ready"]) + (herd * float(p["amount"]) * step) / float(p["everyTicks"]))


## Why a pen is or isn't producing, in words.
static func pen_status(sim: Simulation, b: Building) -> String:
	var d := pen_def(b)
	var n := pen_animals(sim, b).size()
	var cap := pen_capacity(b)
	var sp := species(str(d["species"]))
	if n == 0:
		return "No %s left — the pen is empty" % sp["plural"]
	var ready := floori(float(b.pen.get("ready", 0.0)))
	for s in sim.settlers:
		if s.task != null and s.task.kind == Task.HERD and s.task.site == b.id:
			return "A herder is tending the animals"
	if ready > 0:
		var res := str(d["product"]["res"])
		return "%d %s waiting for a herder" % [ready, "food (eggs and milk)" if res == "food" else res]
	if n >= cap and d.has("cull"):
		return "Full: a herder will take one %s to the butcher" % str(sp["name"]).to_lower()
	if n < 2:
		return "Only one %s — it can't breed alone" % str(sp["name"]).to_lower()
	return "%d/%d %s · breeding" % [n, cap, sp["plural"]]


# ---- movement -----------------------------------------------------------------------------------

static func _nearest_person(sim: Simulation, a: Animal, radius: float) -> Settler:
	var best: Settler = null
	var best_d := radius
	for s in sim.settlers:
		if s.hidden or s.id == a.hunted_by:
			continue
		var dx := s.x - a.x
		var dy := s.y - a.y
		if absf(dx) > best_d or absf(dy) > best_d:
			continue
		var d := JsMath.hypot(dx, dy)
		if d < best_d:
			best_d = d
			best = s
	return best


static func _set_target(a: Animal, x: int, y: int) -> void:
	a.tx = x + 0.5
	a.ty = y + 0.5
	a.moving = true
	if a.tx < a.x - 0.05:
		a.facing = 2
	elif a.tx > a.x + 0.05:
		a.facing = 3


static func _choose_wander(sim: Simulation, a: Animal) -> void:
	if a.pen_id != -1:
		var pen: Building = sim.buildings.get(a.pen_id)
		if pen == null:
			return
		var t := _random_tile_in(sim, pen)
		_set_target(a, t.x, t.y)
		return
	for i in 4:
		var x := a.home_x + sim.animal_rng.int_below(13) - 6
		var y := a.home_y + sim.animal_rng.int_below(13) - 6
		if likes(sim, a.species, x, y):
			_set_target(a, x, y)
			return


static func _step(sim: Simulation, a: Animal) -> void:
	var d := a.def()
	var speed := float(d["speed"]) * (1.8 if a.flee else 1.0)
	var dx := a.tx - a.x
	var dy := a.ty - a.y
	var dist := JsMath.hypot(dx, dy)
	if dist <= speed:
		a.x = a.tx
		a.y = a.ty
		a.moving = false
		a.flee = false
		a.timer = 30 + sim.animal_rng.int_below(90)
		return
	var nx := a.x + (dx / dist) * speed
	var ny := a.y + (dy / dist) * speed
	# Pen animals walk over their own pen; everyone else keeps to ground they can stand on.
	var under := sim.building_at(floori(nx), floori(ny))
	var in_pen := a.pen_id != -1 and under != null and under.id == a.pen_id
	if not in_pen and not can_stand(sim, a.species, floori(nx), floori(ny)):
		a.moving = false
		a.flee = false
		a.timer = 10 + sim.animal_rng.int_below(30)
		return
	a.x = nx
	a.y = ny


static func update(sim: Simulation) -> void:
	if sim.tick % int(value("WILD_SPAWN_EVERY")) == 0 and not sim.settlements.is_empty() and wild_count(sim) < int(value("WILD_CAP")):
		spawn_herd(sim, float(value("WILD_SPAWN_MIN")), float(value("WILD_SPAWN_MAX")))
	if sim.tick % int(value("PEN_STEP")) == 0:
		update_pens(sim)
	var check_flee := sim.tick % FLEE_CHECK == 0
	for i in range(sim.animals.size() - 1, -1, -1):
		var a := sim.animals[i]
		a.px = a.x
		a.py = a.y
		if a.pen_id != -1 and not sim.buildings.has(a.pen_id):
			# The pen was pulled down: the animals wander off into the wild.
			a.pen_id = -1
			a.home_x = floori(a.x)
			a.home_y = floori(a.y)
		var d := a.def()
		if check_flee and a.pen_id == -1 and float(d["fleeFrom"]) > 0 and not a.flee:
			var p := _nearest_person(sim, a, float(d["fleeFrom"]))
			if p != null:
				var dx := a.x - p.x
				var dy := a.y - p.y
				var dist := JsMath.hypot(dx, dy)
				if dist == 0.0:
					dist = 1.0
				var x := floori(a.x + (dx / dist) * 6)
				var y := floori(a.y + (dy / dist) * 6)
				if can_stand(sim, a.species, x, y):
					_set_target(a, x, y)
					a.flee = true
		if a.moving:
			_step(sim, a)
		else:
			a.timer -= 1
			if a.timer <= 0:
				_choose_wander(sim, a)
	for a in sim.animals:
		a.rpx = a.px
		a.rpy = a.py
		a.rx = a.x
		a.ry = a.y


# ---- hunting helpers ------------------------------------------------------------------------------

## The weapon a lodge's hunters carry: bare hands, then knives, then bows as it is upgraded.
static func weapon_of_lodge(b: Building) -> String:
	var level := b.level if b != null else 1
	return "bow" if level >= 3 else ("knife" if level == 2 else "hands")


## A struck animal bolts a few tiles away from whoever hit it.
static func startle(sim: Simulation, a: Animal, from_x: float, from_y: float) -> void:
	var dx := a.x - from_x
	var dy := a.y - from_y
	var d := JsMath.hypot(dx, dy)
	if d == 0.0:
		d = 1.0
	for dist: int in [4, 3, 2]:
		var x := floori(a.x + (dx / d) * dist)
		var y := floori(a.y + (dy / d) * dist)
		if can_stand(sim, a.species, x, y):
			_set_target(a, x, y)
			a.flee = true
			return


static func hunt_radius_of(b: Building) -> float:
	var v: Variant = b.stat("huntRadius")
	if v != null:
		return float(v)
	var h: Dictionary = b.def().get("hunting", {})
	return float(h.get("radius", 0))


## Wild game a lodge's hunters could go after (within its range).
static func prey_near(sim: Simulation, b: Building) -> Array[Animal]:
	var r := hunt_radius_of(b)
	var cx := b.center_x()
	var cy := b.center_y()
	var out: Array[Animal] = []
	for a in sim.animals:
		if a.pen_id == -1 and a.def().has("hunt") and JsMath.hypot(a.x - cx, a.y - cy) <= r:
			out.append(a)
	return out
