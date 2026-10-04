class_name Production
## Recipe buildings: workshop, mill, bakery, kiln, smelter, forge, tannery and weaver
## (src/game/sim/buildings.ts "production", settlers.ts findCraft/runCraft).
##
## Rules kept from the browser game:
## - Haulers keep inputs for two batches on hand (priority 12 in the haul list); fuel is asked for
##   as whichever fuel the stores hold more of (coal on a tie).
## - A building with assigned workers is worked only by them; one with none is open to anyone whose
##   work order includes Craft (labourers lend a hand at idle workshops).
## - The crafter carries the output to storage; nobody starts a batch with nowhere to put it.
## - Every stop is explained in `workshop.status`.

const CRAFT_TOOL := {
	"planks": &"saw", "tools": &"hammer", "flour": &"hand", "bread": &"hand", "driedApples": &"hand",
	"charcoal": &"hand", "smeltCopper": &"hammer", "smeltIron": &"hammer", "forgeCopperTools": &"hammer", "forgeIronTools": &"hammer",
	"forgeSwords": &"hammer", "forgeArmor": &"hammer", "makeBows": &"saw", "tanLeather": &"hand", "weaveCloth": &"hand",
}
const CRAFT_SFX := {
	"planks": "saw", "tools": "hammer", "flour": "mill", "bread": "bake", "driedApples": "bake",
	"charcoal": "bake", "smeltCopper": "bake", "smeltIron": "bake", "forgeCopperTools": "hammer", "forgeIronTools": "hammer",
	"forgeSwords": "hammer", "forgeArmor": "hammer", "makeBows": "saw", "tanLeather": "hammer", "weaveCloth": "saw",
}
## Recipe -> the stat its output counts toward.
const OUTPUT_STATS := {
	"planks": "planksCrafted", "tools": "toolsCrafted", "flour": "flourMilled", "bread": "bakedFood", "driedApples": "driedApples",
	"charcoal": "charcoalMade", "smeltCopper": "copperSmelted", "smeltIron": "ironSmelted", "forgeCopperTools": "copperToolsForged",
	"forgeIronTools": "ironToolsForged", "forgeSwords": "swordsMade", "forgeArmor": "armorMade", "makeBows": "bowsMade",
}
const FUELS: Array[String] = ["coal", "charcoal"]


static func recipe(id: String) -> Dictionary:
	var all: Dictionary = Content.get_value("recipes", "RECIPES")
	return all[id]


static func is_recipe(id: String) -> bool:
	return (Content.get_value("recipes", "RECIPES") as Dictionary).has(id)


## A new workshop state for a finished recipe building: its first recipe, not paused.
static func init_workshop(b: Building) -> void:
	var recipes: Array = b.def().get("recipes", [])
	if not recipes.is_empty():
		b.workshop = {"recipe": str(recipes[0]), "progress": 0.0, "paused": false, "status": ""}


static func fuel_in(inv: Dictionary) -> int:
	var n := 0
	for f in FUELS:
		n += int(inv.get(f, 0))
	return n


## Inputs and fuel for one batch are on hand.
static func recipe_ready(have: Dictionary, r: Dictionary) -> bool:
	return Inv.has_all(have, Inv.from_json(r["inputs"])) and fuel_in(have) >= int(r.get("fuel", 0))


## Burns fuel for a batch, coal first, recording what was burned.
static func burn_fuel(sim: Simulation, have: Dictionary, amount: int) -> void:
	var left := amount
	for f in FUELS:
		var n := mini(left, int(have.get(f, 0)))
		if n <= 0:
			continue
		Inv.add(have, f, -n)
		left -= n
		var stat := "coalBurned" if f == "coal" else "charcoalBurned"
		sim.stats[stat] = int(sim.stats[stat]) + n


## Inputs (and fuel) to keep two batches on hand: [{res, need}].
static func workshop_needs(sim: Simulation, b: Building) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var ws := b.workshop
	if not b.built or ws.is_empty() or str(ws.get("recipe", "")) == "" or bool(ws["paused"]):
		return out
	var r := recipe(ws["recipe"])
	for e in Inv.entries(Inv.from_json(r["inputs"])):
		var need: int = int(e[1]) * 2 - int(b.delivered.get(e[0], 0)) - int(b.incoming.get(e[0], 0))
		if need > 0:
			out.append({"res": e[0], "need": need})
	if r.has("fuel"):
		var need := int(r["fuel"]) * 2 - fuel_in(b.delivered) - fuel_in(b.incoming)
		if need > 0:
			out.append({"res": "charcoal" if sim.stored_total("charcoal") > sim.stored_total("coal") else "coal", "need": need})
	return out


static func may_work_at(b: Building, settler_id: int) -> bool:
	return b.workers.is_empty() or b.workers.has(settler_id)


## Work speed of a building at its level (stat "speed", 1 by default).
static func speed_of(b: Building) -> float:
	var v: Variant = b.stat("speed")
	return 1.0 if v == null else float(v)


## Explains, for every recipe building, what it is doing or why it has stopped (every 10 ticks).
static func update_workshops(sim: Simulation) -> void:
	for b: Building in sim.buildings.values():
		var ws := b.workshop
		if ws.is_empty() or not b.built:
			continue
		var bname := str(b.def()["name"]).to_lower()
		var staffed := false
		for id in b.workers:
			var s := sim.settler(id)
			if s != null and SettlerBrain.effective_priorities(s).has("craft"):
				staffed = true
		var anyone := staffed
		if not anyone and b.workers.is_empty():
			for s in sim.settlers:
				if SettlerBrain.effective_priorities(s).has("craft"):
					anyone = true
					break
		if bool(ws["paused"]):
			ws["status"] = "Paused"
		elif str(ws.get("recipe", "")) == "":
			ws["status"] = "Idle — choose a recipe"
		elif not anyone:
			ws["status"] = "Its worker has Craft turned off — edit their work order" if not b.workers.is_empty() \
				else "No worker — select a settler and right-click the %s, or train a Crafter at the Town Hall" % bname
		else:
			var r := recipe(ws["recipe"])
			var crafting := sim.reservations.has(Simulation.K_CRAFT + b.id)
			if crafting and float(ws["progress"]) > 0.0:
				ws["status"] = "%s (%d%%)" % [r["name"], floori(float(ws["progress"]) / float(r["work"]) * 100)]
			elif not recipe_ready(b.delivered, r):
				var missing := {}
				for e in Inv.entries(Inv.from_json(r["inputs"])):
					var have := int(b.delivered.get(e[0], 0))
					if have < int(e[1]):
						Inv.add(missing, e[0], int(e[1]) - have)
				var in_stock := true
				for e in Inv.entries(missing):
					if sim.stored_total(e[0]) + int(b.incoming.get(e[0], 0)) < int(e[1]):
						in_stock = false
				var fuel_short := int(r.get("fuel", 0)) - fuel_in(b.delivered)
				var fuel_stock := sim.stored_total("coal") + sim.stored_total("charcoal") + fuel_in(b.incoming)
				if missing.is_empty() and fuel_short > 0:
					ws["status"] = "Waiting for fuel (coal or charcoal)" if fuel_stock >= fuel_short else "Needs fuel — no coal or charcoal in storage; build a charcoal kiln or mine coal"
				else:
					ws["status"] = ("Waiting for delivery: %s" if in_stock else "Needs %s — none in storage") % Inv.format(missing)
			elif sim.nearest_storage_with_space(b.x, b.y) == null:
				ws["status"] = "Storage is full — nowhere to put the output"
			else:
				ws["status"] = "Worker on the way" if crafting else "Ready — waiting for a worker"


## The craft finder: the nearest ready recipe building this settler may work at (their own
## building strongly preferred). Returns a Task, a reason, or null when there are no workshops.
static func find_craft(sim: Simulation, s: Settler) -> Variant:
	var reason: Variant = null
	var best: Building = null
	var best_d := INF
	var any := false
	for b: Building in sim.buildings.values():
		var ws := b.workshop
		if not b.built or ws.is_empty():
			continue
		any = true
		if bool(ws["paused"]) or str(ws.get("recipe", "")) == "" or not may_work_at(b, s.id):
			continue
		if sim.is_reserved(Simulation.K_CRAFT + b.id, s.id) or sim.is_unreachable(s, Simulation.T_BUILDING + b.id):
			continue
		var r := recipe(ws["recipe"])
		if not recipe_ready(b.delivered, r):
			if reason == null:
				var parts: PackedStringArray = []
				for e in Inv.entries(Inv.from_json(r["inputs"])):
					parts.append(e[0])
				if r.has("fuel"):
					parts.append("fuel")
				reason = "The %s is waiting for %s" % [str(b.def()["name"]).to_lower(), " and ".join(parts)]
			continue
		var d := JsMath.hypot(s.x - b.center_x(), s.y - b.center_y()) - (1000.0 if b.workers.has(s.id) else 0.0)
		if d < best_d:
			best_d = d
			best = b
	if not any:
		return "No workshop, mill, bakery, quarry or mine built yet"
	if best == null:
		return reason
	if sim.nearest_storage_with_space(s.x, s.y) == null:
		return "Storage is full — nowhere to put what I make"
	sim.reserve(Simulation.K_CRAFT + best.id, s.id)
	return Task.craft(best.id)


static func run_craft(sim: Simulation, s: Settler, t: Task) -> void:
	var b: Building = sim.buildings.get(t.site)
	var ws: Dictionary = b.workshop if b != null else {}
	if b == null or ws.is_empty() or str(ws.get("recipe", "")) == "" or bool(ws["paused"]) or s.carrying():
		SettlerTasks.abort_task(sim, s)
		return
	var r := recipe(ws["recipe"])
	if not recipe_ready(b.delivered, r):
		SettlerTasks.abort_task(sim, s)
		return
	if t.stage == &"walk":
		var m := SettlerTasks.go_to(sim, s, b.goal_adjacent())
		if m == SettlerTasks.Move.FAILED:
			SettlerTasks.fail(sim, s, "Can't reach the %s" % str(b.def()["name"]).to_lower(), Simulation.T_BUILDING + b.id)
		elif m == SettlerTasks.Move.ARRIVED:
			t.stage = &"work"
		return
	SettlerTasks.face_rect(s, b.x, b.y, b.w, b.h)
	s.anim = &"work"
	s.tool = CRAFT_TOOL.get(ws["recipe"], &"hand")
	ws["progress"] = float(ws["progress"]) + SettlerTasks.work_speed(sim, s) * speed_of(b)
	if (sim.tick + s.id) % 10 == 0:
		sim.emit({"type": "sfx", "name": CRAFT_SFX.get(ws["recipe"], "hammer"), "x": b.center_x(), "y": b.center_y()})
	if float(ws["progress"]) < float(r["work"]):
		return
	ws["progress"] = 0.0
	for e in Inv.entries(Inv.from_json(r["inputs"])):
		Inv.add(b.delivered, e[0], -int(e[1]))
	burn_fuel(sim, b.delivered, int(r.get("fuel", 0)))
	var out := Inv.entries(Inv.from_json(r["outputs"]))[0]
	s.set_carry(out[0], int(out[1]))
	var stat: String = OUTPUT_STATS.get(ws["recipe"], "")
	if stat != "":
		sim.stats[stat] = int(sim.stats[stat]) + int(out[1])
	# Forged tools count toward toolsCrafted too (the browser game counts them in both).
	if out[0] == "tools" and ws["recipe"] != "tools":
		sim.stats["toolsCrafted"] = int(sim.stats["toolsCrafted"]) + int(out[1])
	sim.emit({"type": "fx", "kind": "sparkle", "x": b.center_x(), "y": b.center_y()})
	SettlerTasks.abort_task(sim, s)
