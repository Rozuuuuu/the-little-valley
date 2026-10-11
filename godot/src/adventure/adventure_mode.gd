class_name AdventureMode
extends RefCounted
## Authoritative adventure rules. Everything in data() survives JSON save/load.
const VERSION := 1
const ATTRIBUTES := ["strength", "agility", "intelligence"]

static func active(sim: Simulation) -> bool:
	return sim != null and sim.passthrough.get("adventure") is Dictionary

static func data(sim: Simulation) -> Dictionary:
	return sim.passthrough.get("adventure", {}) if sim != null else {}

static func create(seed_value: int, hero_name: String, discipline: String = "Knight") -> Simulation:
	var sim := Simulation.new(seed_value)
	sim.load_nav_area(0, 0)
	sim.growth_mode = "deliberate"
	sim.next_visitor = 100000000
	var h := {"name": hero_name.strip_edges().left(24), "discipline": discipline, "x": 0.5, "y": 0.5, "px": 0.5, "py": 0.5,
		"hp": 160.0, "max_hp": 160.0, "mana": 60.0, "max_mana": 60.0, "level": 1, "xp": 0, "points": 0,
		"strength": 7, "agility": 5, "intelligence": 5, "attack_until": 0, "ready": 0, "face": 0, "ward_until": 0,
		"cooldowns": {}, "path": [], "target": ""}
	if discipline == "Scout":
		h.strength = 5
		h.agility = 7
	elif discipline == "Scholar-knight":
		h.strength = 5
		h.intelligence = 7
	var state := {"version": VERSION, "hero": h, "bag": AdventureItems.create(), "social": AdventureSocial.create(),
		"sites": [], "enemies": [], "tick": 0, "leader": false, "kills": 0, "discoveries": 0, "trial_done": false,
		"supplies": false, "message": "A road, a blade, and a new beginning. Right-click the road to walk. Meet the refuge steward.",
		"refuge": [0.5, 0.5], "grace_until": 30, "tokens": {}, "loot_claims": {}, "guide": true}
	sim.passthrough["adventure"] = state
	_generate(sim)
	sim.world.reveal(0.5, 0.5, 9.0)
	sim.start_session()
	_sync_stats(sim, true)
	return sim

static func _generate(sim: Simulation) -> void:
	var d := data(sim)
	# A authored road graph with seeded branches: every objective has a traversable route.
	var shift := int(posmod(sim.seed_value, 5)) - 2
	var definitions := [
		["refuge", "Wayfarer's Rest", 0, 0, "human", "refuge", false, "Steward Rowan"],
		["warrior", "The Lone Vanguard", 9, -3, "human", "recruit", false, "Mira of the Road"],
		["human", "Crownford", 24, -7, "human", "village", false, "Captain Alden"],
		["elf", "Willow Court", -25, -12, "elf", "village", false, "Warden Lethiel"],
		["kingless", "Briarhaven", 23 + shift, 25, "human", "village", true, "Elder Elowen"],
		["orc", "Ember Clan", -27, 23 + shift, "orc", "village", false, "Speaker Rukh"],
		["medicine", "Moonflower Grove", -13, -30, "elf", "grove", false, "Herbalist Sera"],
		["watchtower", "The Fallen Watch", 39, 4, "undead", "ruin", false, "Weathered inscription"],
		["trial", "Gravecall Hollow", 34, 31, "undead", "ruin", false, "The Gravecaller"],
		["relic", "The Dawn Vault", -42, -37, "undead", "ruin", false, "Ancient oathstone"]]
	for def: Array in definitions:
		var s := {"id": def[0], "name": def[1], "x": float(def[2]) + 0.5, "y": float(def[3]) + 0.5,
			"faction": def[4], "kind": def[5], "kingless": def[6], "elder": def[7], "discovered": def[0] == "refuge",
			"residents": ["Elowen", "Bram", "Tessa", "Orin", "Fenn"], "stock": {"food": 80, "wood": 60, "stone": 30}}
		d.sites.append(s)
		_clear(sim, int(def[2]), int(def[3]), 5)
		_road(sim, Vector2i.ZERO, Vector2i(int(def[2]), int(def[3])))
	# Repeatable camps progress from the introductory mossling to the final relic guardian.
	var camps := [[12, 6, "mossling"], [-12, 8, "skeleton"], [33, -19, "orc"], [-32, -20, "hexling"],
		[38, 34, "gravecaller"], [-37, 32, "stone_brute"], [39, -37, "bone_archer"], [-44, -40, "stone_brute"]]
	for i in camps.size():
		var p: Array = camps[i]
		_clear(sim, int(p[0]), int(p[1]), 4)
		_road(sim, Vector2i.ZERO, Vector2i(int(p[0]), int(p[1])))
		var hp := 34.0 + i * 26.0
		d.enemies.append({"id": "camp_%d" % i, "kind": p[2], "x": float(p[0]) + 0.5, "y": float(p[1]) + 0.5,
			"px": float(p[0]) + 0.5, "py": float(p[1]) + 0.5, "home_x": float(p[0]) + 0.5, "home_y": float(p[1]) + 0.5,
			"hp": hp, "max_hp": hp, "tier": i, "dead": false, "windup": 0, "ready": 0, "attack_until": 0,
			"warned": false, "generation": 0, "respawn": 0, "path": [], "quest": i == 4})
	sim.setup_nav(0, 0)

static func _clear(sim: Simulation, x: int, y: int, radius: int) -> void:
	for yy in range(y - radius, y + radius + 1):
		for xx in range(x - radius, x + radius + 1):
			sim.world.set_terrain(xx, yy, Tiles.MEADOW)
			sim.world.set_obj(xx, yy, Tiles.O_NONE)

static func _road(sim: Simulation, start: Vector2i, finish: Vector2i) -> void:
	var p := start
	while p != finish:
		for offset in [-1, 0, 1]:
			var q := p + Vector2i(0, offset)
			sim.world.set_terrain(q.x, q.y, Tiles.ROAD)
			sim.world.set_obj(q.x, q.y, Tiles.O_NONE)
		if p.x != finish.x:
			p.x += signi(finish.x - p.x)
		else:
			p.y += signi(finish.y - p.y)

static func hero_stats(sim: Simulation) -> Dictionary:
	var h: Dictionary = data(sim).hero
	var gear := AdventureItems.stats(data(sim).bag)
	return {"damage": 9.0 + float(h.strength) * 1.4 + float(gear.get("damage", 0)),
		"armor": float(h.agility) * 0.3 + float(gear.get("armor", 0)),
		"max_hp": 100.0 + float(h.strength) * 9.0 + float(gear.get("health", 0)),
		"max_mana": 30.0 + float(h.intelligence) * 6.0 + float(gear.get("mana", 0)),
		"interval": maxi(5, 14 - int(h.agility) / 5), "next_xp": int(h.level) * 60}

static func _sync_stats(sim: Simulation, heal: bool = false) -> void:
	var h: Dictionary = data(sim).hero
	var st := hero_stats(sim)
	h.max_hp = st.max_hp
	h.max_mana = st.max_mana
	h.hp = h.max_hp if heal else minf(float(h.hp), float(h.max_hp))
	h.mana = h.max_mana if heal else minf(float(h.mana), float(h.max_mana))

static func _pos(a: Dictionary) -> Vector2:
	return Vector2(float(a.x), float(a.y))

static func _distance(a: Dictionary, b: Dictionary) -> float:
	return _pos(a).distance_to(_pos(b))

static func site(sim: Simulation, id: String) -> Dictionary:
	for s: Dictionary in data(sim).get("sites", []):
		if str(s.id) == id:
			return s
	return {}

static func _enemy(sim: Simulation, id: String) -> Dictionary:
	for e: Dictionary in data(sim).get("enemies", []):
		if str(e.id) == id:
			return e
	return {}

static func progress(sim: Simulation) -> Dictionary:
	var d := data(sim)
	return {"kills": int(d.kills), "discoveries": int(d.discoveries), "trial_done": bool(d.trial_done), "leader": bool(d.leader),
		"gold": int(d.bag.get("gold", 0)), "level": int(d.hero.level), "supplies": bool(d.supplies), "sites": d.sites}

static func objective(sim: Simulation) -> String:
	var d := data(sim)
	if int(d.kills) == 0:
		return "First steps • Meet Mira east of the refuge; defeat the mossling southeast of the road."
	if not bool(site(sim, "kingless").discovered):
		return "An empty throne • Follow the eastern road south to find Briarhaven."
	if not bool(d.trial_done):
		return "An elder's trial • Talk to Elowen, recover grove medicine, defeat the Gravecaller east of Briarhaven."
	if not bool(d.leader):
		return "A choice of duty • Return to Elowen. Lead Briarhaven, protect it, or continue wandering."
	return "A home worth defending • Manage Briarhaven or explore the outer camps for Epic–Relic equipment."

static func step(sim: Simulation) -> void:
	var d := data(sim)
	if d.is_empty():
		return
	d.tick = sim.tick
	var h: Dictionary = d.hero
	h.px = h.x
	h.py = h.y
	_sync_stats(sim)
	h.mana = minf(float(h.max_mana), float(h.mana) + 0.12)
	var target := _enemy(sim, str(h.target))
	if not target.is_empty() and not bool(target.dead):
		if _distance(h, target) > 1.6:
			if sim.tick % 8 == 0 or (h.path as Array).is_empty():
				_path(sim, h, _pos(target))
		elif sim.tick >= int(h.ready):
			h.path = []
			h.ready = sim.tick + int(hero_stats(sim).interval)
			h.attack_until = sim.tick + 4
			_damage(sim, target, float(hero_stats(sim).damage))
	else:
		h.target = ""
	_move(sim, h, 0.25)
	sim.world.reveal(float(h.x), float(h.y), 8.0)
	for s: Dictionary in d.sites:
		if not bool(s.discovered) and _distance(h, s) < 8.0:
			s.discovered = true
			d.discoveries = int(d.discoveries) + 1
			_xp(sim, 20)
			d.message = "Discovered %s. Approach and click to speak." % s.name
	for e: Dictionary in d.enemies:
		_enemy_step(sim, e)
	_party_step(sim)
	if float(h.hp) <= 0:
		h.x = d.refuge[0]
		h.y = d.refuge[1]
		h.px = h.x
		h.py = h.y
		h.target = ""
		h.path = []
		h.hp = float(h.max_hp) * 0.75
		h.mana = float(h.max_mana) * 0.5
		d.grace_until = sim.tick + 100
		d.message = "The refuge watch rescued you. Your gear and progress are safe. Rest before returning."
		for c: Dictionary in d.social.get("companions", []):
			c.x = h.x
			c.y = h.y
			c.hp = 100.0
	AdventureSocial.update_quests(d.social, progress(sim))

static func _path(sim: Simulation, actor: Dictionary, to: Vector2) -> bool:
	if not sim.walkable(floori(to.x), floori(to.y)):
		return false
	var result := sim.nav.find_path(floori(float(actor.x)), floori(float(actor.y)), GridAStar.Goal.new(floori(to.x), floori(to.y)))
	if not result.found:
		return false
	var steps: Array = []
	for p: Vector2 in result.steps:
		steps.append([p.x + 0.5, p.y + 0.5])
	actor.path = steps
	return true

static func _move(sim: Simulation, actor: Dictionary, amount: float) -> void:
	var path: Array = actor.get("path", [])
	if path.is_empty():
		return
	var goal := Vector2(float(path[0][0]), float(path[0][1]))
	if not sim.walkable(floori(goal.x), floori(goal.y)):
		actor.path = []
		return
	var p := _pos(actor)
	var delta := goal - p
	actor.face = 3 if delta.x > 0 else 2 if delta.x < 0 else 0 if delta.y > 0 else 1
	p = p.move_toward(goal, amount)
	actor.x = p.x
	actor.y = p.y
	if p.distance_to(goal) < 0.01:
		path.pop_front()

static func _enemy_step(sim: Simulation, e: Dictionary) -> void:
	var d := data(sim)
	var h: Dictionary = d.hero
	e.px = e.x
	e.py = e.y
	if bool(e.dead):
		if not bool(e.quest) and sim.tick >= int(e.respawn) and _distance(e, h) > 14:
			e.dead = false
			e.hp = e.max_hp
			e.generation = int(e.generation) + 1
			e.x = e.home_x
			e.y = e.home_y
			e.warned = false
		return
	var dist := _distance(e, h)
	if dist < 9 and not bool(e.warned):
		e.warned = true
		d.message = "Danger ahead: %s. Right-click to attack, or take another road." % str(e.kind).replace("_", " ")
	if sim.tick < int(d.grace_until) or dist > 10 or _safe(sim, h):
		e.windup = 0
		if _pos(e).distance_to(Vector2(float(e.home_x), float(e.home_y))) > 1:
			if sim.tick % 15 == 0:
				_path(sim, e, Vector2(float(e.home_x), float(e.home_y)))
			_move(sim, e, 0.15)
		return
	var reach := 4.5 if str(e.kind) in ["hexling", "bone_archer", "gravecaller"] else 1.5
	if int(e.windup) > 0:
		if sim.tick >= int(e.windup):
			e.windup = 0
			e.ready = sim.tick + 23
			e.attack_until = sim.tick + 4
			if dist <= reach:
				var damage := maxf(2.0, 7.0 + int(e.tier) * 2.5 - float(hero_stats(sim).armor))
				if sim.tick < int(h.ward_until):
					damage *= 0.3
				h.hp = float(h.hp) - damage
		return
	if dist <= reach:
		if sim.tick >= int(e.ready):
			e.windup = sim.tick + 9
	elif _pos(e).distance_to(Vector2(float(e.home_x), float(e.home_y))) < 12:
		if sim.tick % 10 == 0:
			_path(sim, e, _pos(h))
		_move(sim, e, 0.13 if str(e.kind) == "stone_brute" else 0.17)

static func _safe(sim: Simulation, actor: Dictionary) -> bool:
	for s: Dictionary in data(sim).sites:
		if str(s.kind) in ["refuge", "village"] and _distance(s, actor) < 5:
			return true
	return false

static func _party_step(sim: Simulation) -> void:
	var d := data(sim)
	var index := 0
	for c: Dictionary in d.social.get("companions", []):
		if str(c.get("status", "active")) != "active":
			continue
		if not c.has("x"):
			c.x = d.hero.x
			c.y = d.hero.y
			c.hp = 100.0
		c.px = c.x
		c.py = c.y
		var order := str(c.get("order", "follow"))
		if order != "hold" and _distance(c, d.hero) > 2.0 + index * 0.4:
			if sim.tick % 10 == 0:
				_path(sim, c, _pos(d.hero))
			_move(sim, c, 0.27)
		if order != "passive" and sim.tick % 16 == 0:
			for e: Dictionary in d.enemies:
				if not bool(e.dead) and _distance(c, e) < (5.0 if str(c.get("role")) in ["Ranger", "Arcanist"] else 2.5) and (_distance(d.hero, e) < 5 or str(d.hero.target) == str(e.id)):
					_damage(sim, e, 7.0 + int(d.hero.level) * 1.5)
					c.attack_until = sim.tick + 4
					break
		if str(c.get("role")) == "Medic" and sim.tick % 50 == 0:
			d.hero.hp = minf(float(d.hero.max_hp), float(d.hero.hp) + 8.0)
		index += 1

static func _damage(sim: Simulation, enemy: Dictionary, amount: float) -> void:
	if bool(enemy.dead):
		return
	enemy.hp = float(enemy.hp) - amount
	if float(enemy.hp) > 0:
		return
	var d := data(sim)
	enemy.dead = true
	enemy.windup = 0
	enemy.respawn = sim.tick + 900
	d.kills = int(d.kills) + 1
	_xp(sim, 30 + int(enemy.tier) * 20)
	var claim := "%s:%d" % [enemy.id, int(enemy.generation)]
	AdventureItems.reward(d.bag, claim, int(enemy.tier))
	d.bag.gold = int(d.bag.get("gold", 0)) + 15 + int(enemy.tier) * 10
	d.tokens[enemy.id] = int(d.tokens.get(enemy.id, 0)) + 1
	if bool(enemy.quest):
		d.trial_done = true
	d.message = "%s defeated • experience and loot received. Open Inventory to compare equipment." % str(enemy.kind).capitalize()

static func _xp(sim: Simulation, amount: int) -> void:
	var h: Dictionary = data(sim).hero
	h.xp = int(h.xp) + amount
	while int(h.xp) >= int(h.level) * 60:
		h.xp = int(h.xp) - int(h.level) * 60
		h.level = int(h.level) + 1
		h.points = int(h.points) + 3
		_sync_stats(sim, true)
		data(sim).message = "Level %d • Open Character to assign 3 attribute points." % h.level

static func interact(sim: Simulation, site_id: String) -> Dictionary:
	var s := site(sim, site_id)
	if s.is_empty() or not bool(s.discovered) or _distance(data(sim).hero, s) > 6:
		return {"speaker": "Too far away", "text": "Walk closer to this place to speak.", "choices": []}
	return AdventureSocial.dialogue(data(sim).social, s, progress(sim))

static func act(sim: Simulation, cmd: Dictionary) -> Dictionary:
	if not active(sim):
		return _result(false, "No adventure is running.")
	var d := data(sim)
	var h: Dictionary = d.hero
	var result := _result(false, "That action is unavailable.")
	match str(cmd.get("type", "")):
		"move":
			h.target = ""
			result = _result(_path(sim, h, Vector2(float(cmd.get("x", h.x)), float(cmd.get("y", h.y)))), "Follow the road. Blocked terrain cannot be crossed.")
		"attack":
			var e := _enemy(sim, str(cmd.get("id", "")))
			if not e.is_empty() and not bool(e.dead) and sim.world.explored(floori(float(e.x)), floori(float(e.y))):
				h.target = str(e.id)
				result = _result(true, "Attacking %s" % str(e.kind).replace("_", " "))
		"stop":
			h.target = ""
			h.path = []
			result = _result(true, "Holding position.")
		"spend":
			var attr := str(cmd.get("attribute", ""))
			if attr in ATTRIBUTES and int(h.points) > 0:
				h[attr] = int(h[attr]) + 1
				h.points = int(h.points) - 1
				_sync_stats(sim)
				result = _result(true, "%s increased." % attr.capitalize())
		"skill":
			result = _skill(sim, str(cmd.get("id", "")))
		"rest":
			if _safe(sim, h):
				_sync_stats(sim, true)
				d.refuge = [h.x, h.y]
				result = _result(true, "Rested. This settlement is now your recovery point.")
			else:
				result = _result(false, "Rest at a refuge or peaceful village.")
		"dialogue":
			var s := site(sim, str(cmd.get("site", "")))
			if not s.is_empty() and bool(s.discovered) and _distance(h, s) <= 6:
				result = AdventureSocial.choose(d.social, s, progress(sim), str(cmd.get("choice", "")))
				if bool(result.get("ok", false)):
					var effect := str(result.get("effect", ""))
					if effect == "leadership":
						result = _lead(sim, s)
					elif effect == "hostile":
						_spawn_hostile(sim, s)
					elif effect == "quest_reward":
						AdventureItems.reward(d.bag, "social:" + str(s.id) + ":" + str(cmd.choice), 2)
		"equip": result = AdventureItems.equip(d.bag, int(cmd.get("item", -1)), str(cmd.get("slot", "")))
		"unequip": result = AdventureItems.unequip(d.bag, str(cmd.get("slot", "")))
		"use":
			result = AdventureItems.use_item(d.bag, int(cmd.get("item", -1)))
			if bool(result.get("ok", false)):
				h.hp = minf(float(h.max_hp), float(h.hp) + float(result.get("heal", 50)))
		"sell", "salvage", "buy", "craft", "cache":
			if _safe(sim, h):
				match str(cmd.type):
					"sell": result = AdventureItems.sell(d.bag, int(cmd.get("item", -1)))
					"salvage": result = AdventureItems.salvage(d.bag, int(cmd.get("item", -1)))
					"buy": result = AdventureItems.buy(d.bag, str(cmd.get("definition", "")))
					"craft": result = AdventureItems.craft(d.bag, str(cmd.get("definition", "")))
					"cache": result = _recover_cache(d.bag)
			else:
				result = _result(false, "Visit a peaceful settlement for supplies and crafting.")
		"party": result = AdventureSocial.order(d.social, str(cmd.get("id", "")), str(cmd.get("order", "follow")))
		"claim": result = _claim(sim, str(cmd.get("quest", "")))
	_sync_stats(sim)
	d.message = str(result.get("message", ""))
	return result

static func _skill(sim: Simulation, id: String) -> Dictionary:
	var d := data(sim)
	var h: Dictionary = d.hero
	if not id in ["cleave", "ward", "recover"]:
		return _result(false, "Unknown skill.")
	if sim.tick < int(h.cooldowns.get(id, 0)):
		return _result(false, "That skill is recovering.")
	if float(h.mana) < 15:
		return _result(false, "Not enough mana.")
	h.mana = float(h.mana) - 15
	h.cooldowns[id] = sim.tick + (100 if id == "recover" else 60)
	match id:
		"cleave":
			h.attack_until = sim.tick + 6
			for e: Dictionary in d.enemies:
				if not bool(e.dead) and _distance(h, e) <= 3:
					_damage(sim, e, float(hero_stats(sim).damage) * 1.5 + float(h.intelligence))
		"ward": h.ward_until = sim.tick + 45
		"recover": h.hp = minf(float(h.max_hp), float(h.hp) + 30 + float(h.intelligence) * 3)
	return _result(true, "%s used." % id.capitalize())

static func _recover_cache(bag: Dictionary) -> Dictionary:
	var cache: Array = bag.get("cache", [])
	while not cache.is_empty() and (bag.items as Array).size() < int(bag.capacity):
		bag.items.append(cache.pop_front())
	return _result(true, "Recovered cached items where backpack space permits.")

static func _claim(sim: Simulation, id: String) -> Dictionary:
	var d := data(sim)
	if id == "medicine" and bool(site(sim, "medicine").discovered) and _distance(d.hero, site(sim, "medicine")) < 6:
		d.supplies = true
		AdventureItems.reward(d.bag, "medicine", 1)
		return _result(true, "Medicine recovered. Bring these supplies to the elder.")
	if id == "watchtower" and _distance(d.hero, site(sim, "watchtower")) < 6:
		AdventureItems.reward(d.bag, "watchtower", 2)
		return _result(true, "The watchtower ledger reveals the Gravecall Hollow east of Briarhaven.")
	return _result(false, "Complete this objective at its marked location first.")

static func _spawn_hostile(sim: Simulation, s: Dictionary) -> void:
	var id := "guard:" + str(s.id)
	if not _enemy(sim, id).is_empty():
		return
	var d := data(sim)
	s["hostile"] = true
	d.enemies.append({"id": id, "kind": s.faction, "x": float(s.x) + 6, "y": float(s.y), "px": float(s.x) + 6,
		"py": float(s.y), "home_x": float(s.x) + 6, "home_y": float(s.y), "hp": 80.0, "max_hp": 80.0,
		"tier": 2, "dead": false, "windup": 0, "ready": sim.tick + 40, "attack_until": 0, "warned": true,
		"generation": 0, "respawn": 0, "path": [], "quest": true})
	d.grace_until = sim.tick + 40

static func _lead(sim: Simulation, s: Dictionary) -> Dictionary:
	var d := data(sim)
	if bool(d.leader):
		return _result(false, "You already lead Briarhaven.")
	if not bool(s.kingless) or not bool(d.trial_done) or not bool(d.supplies):
		return _result(false, "Recover the medicine and defeat the Gravecaller before accepting leadership.")
	var x := floori(float(s.x))
	var y := floori(float(s.y))
	_clear(sim, x, y, 7)
	sim.world.reveal(x, y, 14)
	var hall := BuildingOps.place(sim, "camp", x - 2, y - 3)
	if hall == null:
		return _result(false, "This settlement cannot be established here.")
	BuildingOps.complete(sim, hall, true)
	hall.extra["foundingCamp"] = true
	hall.inventory = (s.stock as Dictionary).duplicate(true)
	sim.settlements.append({"id": hall.id, "name": str(s.name)})
	sim.kingdoms = [Kingdoms.new_player(str(s.name))]
	for i in 5:
		var villager := sim.add_settler(x - 2 + i, y + 3, NewGame.STARTING_JOBS[i])
		villager.name = str(s.residents[i])
		villager.settlement_id = hall.id
	BuildingOps.assign_homes(sim)
	sim.next_visitor = sim.tick + int(Content.get_value("kingdomBalance", "FIRST_VISITOR_TICK"))
	d.leader = true
	s.kingless = false
	s["owned"] = true
	d.social["leader"] = true
	return _result(true, "Briarhaven accepts your leadership. Use Settlement to build; Adventure returns to your hero.")

static func _result(ok: bool, message: String) -> Dictionary:
	return {"ok": ok, "message": message}

static func validate(value: Variant) -> String:
	if not value is Dictionary:
		return "Adventure state must be an object."
	if int(value.get("version", -1)) != VERSION:
		return "Unsupported Adventure version; open this save with the matching game release."
	for key: String in ["hero", "bag", "social"]:
		if not value.get(key) is Dictionary:
			return "Adventure %s is missing." % key
	for key: String in ["sites", "enemies"]:
		if not value.get(key) is Array:
			return "Adventure %s is missing." % key
	for key: String in ["x", "y", "hp", "mana", "level", "xp", "points", "strength", "agility", "intelligence"]:
		var v: Variant = value.hero.get(key)
		if not (v is int or v is float) or not is_finite(float(v)):
			return "Adventure hero has an invalid %s." % key
	return ""
