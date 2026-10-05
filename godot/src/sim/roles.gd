class_name Roles
## The ruler and roles (src/game/sim/ruler.ts, roles.ts).
##
## The ruler is the player on the map: they walk where sent, eat and sleep like anyone, never do
## chores, never enlist and never fight. Their presence speeds up the people around them, and
## Rally, once a day, inspires everyone close by for a while.
##
## Everyone has a role (their job). A new one is learned at the Town Hall: the person walks there
## and studies for a while. The Town Hall teaches every working role; the Keep adds travellers and
## messengers, the Castle the Assistant Chief.
##  - Travellers roam past the edge of the known land and lift the fog.
##  - Messengers halve the time letters take (with diplomacy).
##  - The Assistant Chief puts idle hands to work where a workplace has nobody, and now and then
##    comes to the ruler with advice: a "?" shows over them while they stand close.

## Regal colours: a deep purple tunic.
const ROYAL_SHIRT := 5
## A castle's royal presence speeds up its whole town.
const CASTLE_SPEED := 1.1
## The chief comes this close to the ruler to give advice.
const ADVICE_RANGE := 3.0
const ADVICE_COOLDOWN := Defs.DAY_TICKS / 3
const ADVICE_WAIT := Defs.DAY_TICKS / 4
## How far the chief looks for idle people to put to work.
const CHIEF_SIGHT := 14.0


static func balance(key: String) -> Variant:
	return Content.get_value("kingdomBalance", key)


static func job_name(role: String) -> String:
	return str(Defs.job(role)["name"])


static func _plural(role: String) -> String:
	return "Assistant Chiefs" if role == "chief" else job_name(role) + "s"


# ---- the ruler ----------------------------------------------------------------------------------

static func add_ruler(sim: Simulation, ruler_name: String, x: int, y: int) -> Settler:
	var s := sim.add_settler(x, y, "laborer", ruler_name)
	s.ruler = true
	s.has_priorities = true
	s.priorities = []
	s.appearance["shirt"] = ROYAL_SHIRT
	sim.ruler_name = ruler_name
	return s


static func rally(sim: Simulation) -> Dictionary:
	var r := sim.ruler()
	if r == null:
		return {"ok": false, "message": "There is no ruler in this world yet — take the throne first"}
	if r.hidden:
		return {"ok": false, "message": "%s is away" % r.name}
	var wait := sim.rally_ready_at - sim.tick
	if wait > 0:
		return {"ok": false, "message": "%s can rally the people again in %d min" % [r.name, ceili(wait / 10.0 / 60.0)]}
	var n := 0
	for s in sim.settlers:
		if s == r or s.hidden or s.life_stage != "adult":
			continue
		if JsMath.hypot(s.x - r.x, s.y - r.y) > float(balance("RALLY_RADIUS")):
			continue
		s.boost_until = sim.tick + int(balance("RALLY_TICKS"))
		n += 1
	sim.rally_ready_at = sim.tick + int(balance("RALLY_COOLDOWN"))
	sim.emit({"type": "fx", "kind": "hearts", "x": r.x + 0.5, "y": r.y})
	sim.emit({"type": "sfx", "name": "milestone", "x": r.x, "y": r.y})
	if n == 0:
		return {"ok": true, "message": "%s gives a fine speech, but nobody is close enough to hear it." % r.name}
	return {"ok": true, "message": "%s rallies %d %s: they work 30%% faster for the next hour." % [r.name, n, "person" if n == 1 else "people"]}


## For worlds from before the ruler walked the map: the player takes the throne at the hall.
static func take_throne(sim: Simulation, ruler_name: Variant) -> Dictionary:
	if sim.ruler() != null:
		return {"ok": false, "message": "%s already rules here" % sim.ruler().name}
	var clean: String = str(ruler_name).strip_edges().left(24) if ruler_name is String else ""
	if clean == "":
		return {"ok": false, "message": "Choose a name for your ruler"}
	var hall := BuildingOps.camp_of(sim)
	var at := hall.entrance() if hall != null else Vector2i(0, 2)
	var s := add_ruler(sim, clean, at.x, at.y)
	if hall != null:
		for st: Dictionary in sim.settlements:
			if int(st["id"]) == hall.id:
				s.settlement_id = hall.id
	Kingdoms.player(sim)["ruler"] = {"name": s.name, "appearance": s.appearance.duplicate()}
	BuildingOps.assign_homes(sim)
	sim.emit({"type": "important"})
	return {"ok": true, "message": "%s takes the throne. Select them to walk the realm and Rally your people." % clean, "id": s.id}


## The ruler strolls where they were sent, greeting people; needs are handled before this.
static func ruler_routine(sim: Simulation, s: Settler) -> void:
	s.idle_reason = ""
	s.next_think = sim.tick + SettlerBrain.IDLE_BACKOFF * 2 + (s.id % 7)
	if s.task == null and sim.rng.chance(0.15):
		var x := s.tile_x() + sim.rng.int_below(3) - 1
		var y := s.tile_y() + sim.rng.int_below(3) - 1
		if sim.walkable(x, y) and sim.world.explored(x, y):
			s.task = Task.move(x, y, true)


## Work speed from the ruler: a castle town, the ruler's presence nearby, and Rally.
static func speed_factor(sim: Simulation, s: Settler) -> float:
	var v := 1.0
	var hall: Building = sim.buildings.get(s.settlement_id) if s.settlement_id != -1 else null
	if hall != null and hall.type == "townHall" and hall.level >= 3:
		v *= CASTLE_SPEED
	if not s.ruler:
		var r := sim.ruler()
		var aura := float(balance("AURA_RADIUS"))
		if r != null and not r.hidden and absf(r.x - s.x) <= aura and absf(r.y - s.y) <= aura and JsMath.hypot(r.x - s.x, r.y - s.y) <= aura:
			v *= float(balance("ROYAL_AURA"))
		if s.boost_until > sim.tick:
			v *= float(balance("RALLY_BOOST"))
	return v


# ---- training at the Town Hall -----------------------------------------------------------------

## The Town Hall a settler would train at: their own town's, else the first.
static func hall_for(sim: Simulation, s: Settler) -> Building:
	var own: Building = sim.buildings.get(s.settlement_id) if s.settlement_id != -1 else null
	if own != null and own.built and own.type == "townHall":
		return own
	var first := BuildingOps.camp_of(sim)
	return first if first != null and first.built and first.type == "townHall" else null


static func training_places(hall: Building) -> int:
	return int((Content.get_value("jobs", "HALL_TRAINING_PLACES") as Array)[mini(3, hall.level)])


static func training_at(sim: Simulation, hall: Building) -> Array[Settler]:
	var out: Array[Settler] = []
	for s in sim.settlers:
		if not s.training.is_empty() and int(s.training["hall"]) == hall.id:
			out.append(s)
	return out


## Roles a hall of this level teaches.
static func roles_at(level: int) -> Array[String]:
	var out: Array[String] = []
	for j: String in Content.get_value("jobs", "JOB_IDS"):
		if int(Defs.job(j).get("hallLevel", 99)) <= level:
			out.append(j)
	return out


static func _role_problem(sim: Simulation, s: Settler, role: String) -> String:
	if s.job == role and s.training.is_empty():
		return "%s is already a %s" % [s.name, job_name(role)]
	if not s.training.is_empty() and s.training["role"] == role:
		return "%s is already training as a %s" % [s.name, job_name(role)]
	var limit: Variant = Defs.job(role).get("limit")
	if limit != null:
		var held := 0
		for o in sim.settlers:
			if o != s and (o.job == role or (not o.training.is_empty() and o.training["role"] == role)):
				held += 1
		if held >= int(limit):
			return "You already have %s %s%s — only %d at a time" % ["an" if int(limit) == 1 else str(int(limit)), job_name(role), "" if int(limit) == 1 else "s", int(limit)]
	return ""


## Sends people to the Town Hall to learn a new role.
static func train_role(sim: Simulation, list: Array, role: String) -> Dictionary:
	var hall := hall_for(sim, list[0])
	if hall == null:
		return {"ok": false, "message": "People learn new roles at a Town Hall — raise one first"}
	var need := int(Defs.job(role).get("hallLevel", 1))
	var names: Array = Content.get_value("jobs", "HALL_LEVEL_NAMES")
	if hall.level < need:
		return {"ok": false, "message": "%s are trained at a %s — upgrade the Town Hall to a %s first" % [_plural(role), names[need], names[need]]}
	var free := training_places(hall) - training_at(sim, hall).size()
	var started: Array[Settler] = []
	var first_problem := ""
	var waiting := 0
	for s: Settler in list:
		var problem := _role_problem(sim, s, role)
		if problem != "":
			if first_problem == "":
				first_problem = problem
			continue
		if free <= 0 and s.training.is_empty():
			waiting += 1
			continue
		if s.training.is_empty():
			free -= 1
		s.training = {"role": role, "hall": hall.id, "progress": 0.0}
		SettlerTasks.abort_task(sim, s)
		s.focus = {}
		s.idle_reason = ""
		started.append(s)
	var hall_name := str(hall.def()["name"])
	var places := training_places(hall)
	if started.is_empty():
		if waiting > 0:
			return {"ok": false, "message": "The %s is full: it has %d training place%s at this level, all taken" % [hall_name, places, "" if places == 1 else "s"]}
		return {"ok": false, "message": first_problem if first_problem != "" else "Nobody to train"}
	var who := started[0].name if started.size() == 1 else "%d people" % started.size()
	var msg := "%s %s to the %s to train as %s." % [who, "walks" if started.size() == 1 else "walk", hall_name, "a " + job_name(role) if started.size() == 1 else _plural(role)]
	if waiting > 0:
		msg += " The hall is full: it has %d training places, so %d must wait." % [places, waiting]
	return {"ok": true, "message": msg}


static func cancel_training(sim: Simulation, s: Settler) -> Dictionary:
	if s == null or s.training.is_empty():
		return {"ok": false, "message": "They are not training"}
	var role: String = s.training["role"]
	s.training = {}
	if s.task != null and s.task.kind == Task.LEARN:
		SettlerTasks.abort_task(sim, s)
	return {"ok": true, "message": "%s stops training as a %s and stays a %s." % [s.name, job_name(role), job_name(s.job)]}


static func run_learn(sim: Simulation, s: Settler, t: Task) -> void:
	var hall: Building = sim.buildings.get(t.site)
	if s.training.is_empty() or hall == null or not hall.built:
		s.training = {}
		SettlerTasks.abort_task(sim, s, "" if hall != null else "The Town Hall is gone, so training stopped")
		return
	if t.stage == &"walk":
		var r := SettlerTasks.go_to(sim, s, hall.goal_adjacent())
		if r == SettlerTasks.Move.FAILED:
			s.training = {}
			SettlerTasks.abort_task(sim, s, "Couldn't reach the Town Hall to train")
			return
		if r == SettlerTasks.Move.ARRIVED:
			t.stage = &"study"
		return
	SettlerTasks.face_rect(s, hall.x, hall.y, hall.w, hall.h)
	s.anim = &"work"
	s.tool = &"hand"
	s.training["progress"] = float(s.training["progress"]) + SettlerTasks.work_speed(sim, s)
	if float(s.training["progress"]) < float(Content.get_value("jobs", "ROLE_TRAIN_TICKS")):
		return
	var role: String = s.training["role"]
	s.job = role
	s.has_priorities = false
	s.priorities = []
	s.training = {}
	# The chief gets a moment before their first advice.
	if role == "chief":
		sim.chief["nextAt"] = maxi(int(sim.chief["nextAt"]), sim.tick + Defs.DAY_TICKS / 12)
	sim.toast("%s is now %s." % [s.name, "your Assistant Chief" if role == "chief" else "a " + job_name(role)], "good")
	sim.emit({"type": "fx", "kind": "sparkle", "x": s.x, "y": s.y - 0.5})
	sim.emit({"type": "sfx", "name": "complete", "x": s.x, "y": s.y})
	SettlerTasks.abort_task(sim, s)


# ---- travellers -----------------------------------------------------------------------------------

## A spot at the edge of the known land in a random direction from home, or (-99999, 0).
static func _frontier_spot(sim: Simulation, s: Settler) -> Vector2i:
	var home := hall_for(sim, s)
	if home == null:
		home = BuildingOps.camp_of(sim)
	var cx := home.center_x() if home != null else s.x
	var cy := home.center_y() if home != null else s.y
	for tries in 6:
		var a := sim.rng.next() * PI * 2.0
		var last := Vector2i(-99999, 0)
		var r := 6
		while r <= 90:
			var x := floori(cx + JsMath.cos_js(a) * r)
			var y := floori(cy + JsMath.sin_js(a) * r)
			if not sim.world.explored(x, y):
				break
			if sim.walkable(x, y):
				last = Vector2i(x, y)
			r += 2
		if last.x != -99999 and JsMath.hypot(last.x - s.x, last.y - s.y) > 3:
			return last
	return Vector2i(-99999, 0)


## Sends a traveller to the edge of the fog. False when there is nowhere left to explore and they
## have a side job to do instead.
static func traveler_routine(sim: Simulation, s: Settler) -> bool:
	s.next_think = sim.tick + 10
	var spot := _frontier_spot(sim, s)
	if spot.x == -99999:
		if s.side_job != "":
			return false
		s.idle_reason = "Nowhere left to explore within a day’s walk — give them a side job"
		s.next_think = sim.tick + 200
		return true
	s.idle_reason = ""
	s.task = Task.move(spot.x, spot.y)
	return true


# ---- the Assistant Chief --------------------------------------------------------------------------

static func chief_of(sim: Simulation) -> Settler:
	for s in sim.settlers:
		if s.job == "chief" and s.training.is_empty():
			return s
	return null


static func idle_hands(s: Settler) -> bool:
	return not s.ruler and s.training.is_empty() and s.life_stage == "adult" and s.area_id == -1 \
		and s.job != "chief" and s.job != "traveler" and (s.task == null or s.task.kind == Task.WANDER) and s.idle_reason != ""


## Workplaces that stand empty: workshops, lodges and pens with no one assigned.
static func _empty_workplaces(sim: Simulation) -> Array[Building]:
	var out: Array[Building] = []
	for b: Building in sim.buildings.values():
		var d := b.def()
		var cap: Variant = b.stat("maxWorkers")
		if not b.built or d.has("depot") or cap == null or int(cap) <= 0 or not b.workers.is_empty():
			continue
		if b.workshop.is_empty() and not d.has("hunting") and not d.has("pen"):
			continue
		if not b.workshop.is_empty() and (bool(b.workshop["paused"]) or str(b.workshop.get("recipe", "")) == ""):
			continue
		out.append(b)
	return out


static func _put_to_work(sim: Simulation, chief: Settler) -> void:
	var places := _empty_workplaces(sim)
	if places.is_empty():
		return
	var assigned := {}
	for b: Building in sim.buildings.values():
		for id in b.workers:
			assigned[id] = true
	var who: Settler = null
	for o in sim.settlers:
		if o != chief and idle_hands(o) and not assigned.has(o.id) and JsMath.hypot(o.x - chief.x, o.y - chief.y) <= CHIEF_SIGHT:
			who = o
			break
	if who == null:
		return
	var best := places[0]
	var best_d := INF
	for b in places:
		var d := JsMath.hypot(b.x - who.x, b.y - who.y)
		if d < best_d:
			best_d = d
			best = b
	var res := Commands.apply(sim, {"type": "assignWorker", "buildingId": best.id, "ids": [who.id]})
	if bool(res["ok"]):
		sim.toast("%s (Assistant Chief) puts %s to work at the %s." % [chief.name, who.name, str(best.def()["name"]).to_lower()], "info")
		sim.emit({"type": "fx", "kind": "sparkle", "x": who.x, "y": who.y - 0.5})


static func _beside_ruler(sim: Simulation, r: Settler, s: Settler) -> Vector2i:
	var best := Vector2i(-99999, 0)
	var best_d := INF
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			if dx == 0 and dy == 0:
				continue
			var x := r.tile_x() + dx
			var y := r.tile_y() + dy
			if not sim.walkable(x, y):
				continue
			var d := JsMath.hypot(x - s.x, y - s.y)
			if d < best_d:
				best_d = d
				best = Vector2i(x, y)
	return best


static func chief_routine(sim: Simulation, s: Settler) -> void:
	s.idle_reason = ""
	s.next_think = sim.tick + 8
	var c := sim.chief
	var r := sim.ruler()
	if r != null and not r.hidden and sim.tick >= int(c["nextAt"]):
		if bool(c["adviceReady"]) and sim.tick > int(c["waitUntil"]):
			# Ignored for a while: back to work, and try again later.
			c["adviceReady"] = false
			c["nextAt"] = sim.tick + ADVICE_COOLDOWN / 2
		else:
			var d := JsMath.hypot(r.x - s.x, r.y - s.y)
			if d <= ADVICE_RANGE:
				if absf(r.x - s.x) > absf(r.y - s.y):
					s.facing = 2 if r.x < s.x else 3
				else:
					s.facing = 1 if r.y < s.y else 0
				if not bool(c["adviceReady"]):
					c["adviceReady"] = true
					c["advice"] = advice_list(sim)[0]
					c["waitUntil"] = sim.tick + ADVICE_WAIT
					sim.emit({"type": "advice", "settlerId": s.id})
				return
			var spot := _beside_ruler(sim, r, s)
			if spot.x != -99999:
				s.task = Task.move(spot.x, spot.y)
				return
	# Observing: put idle hands to work, then walk over to someone to watch them.
	_put_to_work(sim, s)
	if s.task != null or not sim.rng.chance(0.25):
		return
	var people: Array[Settler] = []
	for o in sim.settlers:
		if o != s and not o.ruler and not o.hidden and o.life_stage == "adult":
			people.append(o)
	if people.is_empty():
		return
	var who := people[sim.rng.int_below(people.size())]
	var x := floori(who.x) + sim.rng.int_below(3) - 1
	var y := floori(who.y) + sim.rng.int_below(3) - 1
	if sim.walkable(x, y) and sim.world.explored(x, y):
		s.task = Task.move(x, y)


## The chief while their "?" shows: advice ready and standing by the ruler; or null.
static func advice_showing(sim: Simulation) -> Settler:
	if not bool(sim.chief["adviceReady"]):
		return null
	var c := chief_of(sim)
	var r := sim.ruler()
	if c == null or r == null or c.hidden or r.hidden:
		return null
	return c if JsMath.hypot(c.x - r.x, c.y - r.y) <= ADVICE_RANGE + 0.75 else null


static func hear_advice(sim: Simulation) -> Dictionary:
	var chief := chief_of(sim)
	var c := sim.chief
	if chief == null or not bool(c["adviceReady"]):
		return {"ok": false, "message": "%s has no advice just now — they will come to you when they do" % chief.name if chief != null else "You have no Assistant Chief — train one at a Castle"}
	c["adviceReady"] = false
	c["nextAt"] = sim.tick + ADVICE_COOLDOWN
	return {"ok": true, "message": "%s: “%s”" % [chief.name, c["advice"]]}


## What the chief suggests, most pressing first.
static func advice_list(sim: Simulation) -> Array[String]:
	var out: Array[String] = []
	var people := 0
	var homeless := 0
	var idle: Array[Settler] = []
	for s in sim.settlers:
		if not s.hidden:
			people += 1
			if s.home_id == -1:
				homeless += 1
		if idle_hands(s):
			idle.append(s)
	var food := sim.stored_total("food")
	if food < people * 4:
		out.append("Our stores hold only %d food for %d mouths, my liege. Put more hands on the fields, mark berry bushes to pick, or send hunters out." % [food, people])
	var cap := sim.total_capacity()
	if cap.y > 0 and cap.x >= cap.y * 0.95:
		out.append("The stores are nearly full. A storehouse would let our people keep harvesting.")
	if homeless > 0:
		out.append("%d of our people %s no bed of their own. A house or cottage would serve them well." % [homeless, "has" if homeless == 1 else "have"])
	if idle.size() >= 2:
		out.append("%d people stand idle — %s says: “%s”. Mark trees or rocks to harvest, or give them a work area." % [idle.size(), idle[0].name, idle[0].idle_reason])
	var hall := BuildingOps.camp_of(sim)
	var lvl := hall.level if hall != null and hall.type == "townHall" else 0
	var messenger := false
	var traveller := false
	for s in sim.settlers:
		if s.job == "messenger" and s.life_stage == "adult":
			messenger = true
		if s.job == "traveler":
			traveller = true
	if lvl >= 2 and not messenger:
		out.append("Train a messenger at the Town Hall: letters and news from other kingdoms would reach us twice as fast.")
	if lvl >= 2 and not traveller:
		out.append("Train a traveller at the Town Hall: they would explore beyond the fog and find new land for us.")
	var next := Progression.next_milestone(sim)
	if next != "":
		var def: Dictionary = (Content.get_value("progression", "MILESTONES") as Dictionary)[next]
		if not def.get("future", false):
			for q: Dictionary in def["requirements"]:
				var p := Progression.requirement_progress(sim, q)
				if not bool(p["done"]):
					var label := str(p["label"])
					out.append("To grow into a %s, we still need to: %s%s (%d/%d)." % [str(def["name"]).to_lower(), label.left(1).to_lower(), label.substr(1), int(p["current"]), int(p["target"])])
					break
	var beds := 0
	for b: Building in sim.buildings.values():
		if b.is_permanent_home():
			beds += b.beds()
	if beds < people:
		out.append("More homes would let new families settle here.")
	out.append("All is in order, my liege. The people work well — perhaps plan the next great building.")
	return out


## People who could be sent to train (not children or the ruler).
static func can_train(s: Settler) -> bool:
	return s.life_stage == "adult" and not s.ruler
