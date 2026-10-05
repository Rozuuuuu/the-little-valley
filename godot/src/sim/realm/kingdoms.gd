class_name Kingdoms
## Kingdoms (src/game/sim/kingdoms.ts). The player's kingdom always has id 0; a rival kingdom's id
## is its home region's id. Kingdoms are Dictionaries in the browser save's own shape:
## {id, name, player, crowned, ruler {name, appearance} | null, banner {color, emblem}, treasury,
## taxCollected, policy, trust, trustDay, council {steward, envoy, marshal}, homeland [sectors] | null,
## conflictMode, modeLocked, frontierActive, capitalRegion, capital {x, y}, personality, companies}.

const PLAYER := 0
const NAME_OK := "^[\\p{L}\\p{N} '’.-]{1,40}$"


static func value(key: String) -> Variant:
	return Content.get_value("kingdoms", key)


static func policy(id: String) -> Dictionary:
	return (value("POLICIES") as Dictionary)[id]


static func new_player(kingdom_name: String) -> Dictionary:
	return {"id": PLAYER, "name": kingdom_name, "player": true, "crowned": false, "ruler": null,
		"banner": {"color": (value("BANNER_COLORS") as Array)[0], "emblem": "oak"}, "treasury": 0, "taxCollected": 0, "policy": "none",
		"trust": int(value("START_TRUST")), "trustDay": 0, "council": {"steward": null, "envoy": null, "marshal": null},
		"homeland": null, "conflictMode": "protected-frontier", "modeLocked": false, "frontierActive": false,
		"capitalRegion": null, "capital": {"x": 0, "y": 0}, "personality": "cautious", "companies": []}


static func player(sim: Simulation) -> Dictionary:
	for k: Dictionary in sim.kingdoms:
		if k["player"]:
			return k
	var k := new_player(str(sim.settlements[0]["name"]) if not sim.settlements.is_empty() else "The Valley")
	sim.kingdoms.push_front(k)
	return k


static func by_id(sim: Simulation, id: int) -> Dictionary:
	for k: Dictionary in sim.kingdoms:
		if int(k["id"]) == id:
			return k
	return {}


static func name_of(sim: Simulation, id: int, fallback: String = "another kingdom") -> String:
	var k := by_id(sim, id)
	return str(k["name"]) if not k.is_empty() else fallback


## The kingdom seated at a distant town; it joins the game the first time anyone hears of it.
static func know_of(sim: Simulation, region_id: int) -> Dictionary:
	sim.known_regions[region_id] = true
	var found := by_id(sim, region_id)
	if not found.is_empty():
		return found
	var town := Regions.by_id(sim.seed_value, region_id)
	var colors: Array = value("BANNER_COLORS")
	var emblems: Array = value("EMBLEMS")
	var k := {"id": region_id, "name": town["name"], "player": false, "crowned": true,
		"ruler": {"name": "the lord of %s" % town["name"], "appearance": sim.random_appearance()},
		"banner": {"color": colors[(region_id % (colors.size() - 1)) + 1], "emblem": emblems[region_id % emblems.size()]},
		"treasury": 200, "taxCollected": 0, "policy": "modest", "trust": int(value("START_TRUST")), "trustDay": sim.day(),
		"council": {"steward": null, "envoy": null, "marshal": null}, "homeland": null, "conflictMode": "protected-frontier",
		"modeLocked": true, "frontierActive": false, "capitalRegion": region_id, "capital": {"x": town["x"], "y": town["y"]},
		"personality": ["cautious", "mercantile", "proud"][region_id % 3], "companies": Diplomacy.rival_companies(region_id)}
	sim.kingdoms.append(k)
	return k


static func coronate(sim: Simulation, ruler_name: Variant, kingdom_name: Variant, banner: Variant) -> Dictionary:
	var k := player(sim)
	if k["crowned"]:
		return {"ok": false, "message": "%s is already crowned" % (str(k["ruler"]["name"]) if k["ruler"] != null else "Your ruler")}
	if not sim.reached.has("region"):
		return {"ok": false, "message": "Coronation needs the Region milestone"}
	var re := RegEx.create_from_string(NAME_OK)
	var rn: String = str(ruler_name).strip_edges() if ruler_name is String else ""
	var kn: String = str(kingdom_name).strip_edges() if kingdom_name is String else ""
	if re.search(rn) == null:
		return {"ok": false, "message": "Give your ruler a name (letters, up to 40)"}
	if re.search(kn) == null:
		return {"ok": false, "message": "Give your kingdom a name (letters, up to 40)"}
	var b: Dictionary = banner if banner is Dictionary else {}
	if not (value("BANNER_COLORS") as Array).has(b.get("color")) or not (value("EMBLEMS") as Array).has(b.get("emblem")):
		return {"ok": false, "message": "Choose a banner colour and emblem from the list"}
	k["crowned"] = true
	k["name"] = kn
	# The ruler who walks the map is the one crowned (taking the crowned name).
	var walker := sim.ruler()
	if walker != null:
		walker.name = rn
		sim.ruler_name = rn
	k["ruler"] = {"name": rn, "appearance": walker.appearance.duplicate() if walker != null else sim.random_appearance()}
	k["banner"] = {"color": b["color"], "emblem": b["emblem"]}
	# The protected homeland is fixed now, exactly as previewed; later building never grows it.
	k["homeland"] = Territory.homeland_preview(sim)
	k["trustDay"] = sim.day()
	sim.toast("%s is crowned ruler of %s!" % [rn, kn], "good")
	sim.record("milestone", "%s was crowned ruler of %s" % [rn, kn])
	sim.emit({"type": "sfx", "name": "milestone"})
	sim.emit({"type": "important"})
	return {"ok": true, "message": "Long live %s! %s's homeland is set: %d sectors that later building never changes." % [rn, kn, (k["homeland"] as Array).size()]}


static func set_policy(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is String) or not (value("POLICIES") as Dictionary).has(id):
		return {"ok": false, "message": "Unknown policy"}
	player(sim)["policy"] = id
	var p := policy(id)
	return {"ok": true, "message": "%s: %s" % [p["name"], p["description"]]}


## The council post a settler holds, or "".
static func council_post_of(sim: Simulation, s: Settler) -> String:
	var k := {}
	for kk: Dictionary in sim.kingdoms:
		if kk["player"]:
			k = kk
			break
	if k.is_empty():
		return ""
	for post: String in k["council"]:
		if k["council"][post] != null and int(k["council"][post]) == s.id:
			return post
	return ""


static func appoint_council(sim: Simulation, post: Variant, settler_id: Variant) -> Dictionary:
	var posts: Dictionary = value("COUNCIL_POSTS")
	if not (post is String) or not posts.has(post):
		return {"ok": false, "message": "Unknown council post"}
	var k := player(sim)
	if settler_id == null:
		k["council"][post] = null
		return {"ok": true, "message": "The %s post is empty." % posts[post]["name"]}
	var s := sim.settler(int(settler_id)) if (settler_id is int or settler_id is float) else null
	if s == null:
		return {"ok": false, "message": "Choose a settler"}
	if s.life_stage == "child":
		return {"ok": false, "message": "%s is a child — only adults can serve on the council" % s.name}
	if s.ruler:
		return {"ok": false, "message": "%s is the ruler — the council serves the ruler, not the other way round" % s.name}
	if s.away_on != -1:
		return {"ok": false, "message": "%s is away" % s.name}
	for other: String in k["council"]:
		if k["council"][other] != null and int(k["council"][other]) == s.id:
			k["council"][other] = null
	k["council"][post] = s.id
	s.area_id = -1
	for b: Building in sim.buildings.values():
		b.workers.erase(s.id)
	sim.forget_work_index()
	SettlerTasks.abort_task(sim, s)
	s.next_think = 0
	return {"ok": true, "message": "%s now serves as %s and leaves ordinary work: %s" % [s.name, posts[post]["name"], posts[post]["duty"]]}


## Daily trust and council effects; drop council members who are gone.
static func update(sim: Simulation) -> void:
	var k := player(sim)
	for post: String in k["council"]:
		var id: Variant = k["council"][post]
		if id != null and sim.settler(int(id)) == null:
			k["council"][post] = null
	# Days start at 1: a kingdom that has never ticked starts counting today, without a change.
	var today := sim.day()
	if int(k["trustDay"]) == 0:
		k["trustDay"] = today
		return
	if today == int(k["trustDay"]):
		return
	var days := maxi(1, today - int(k["trustDay"]))
	k["trustDay"] = today
	var change := float(policy(str(k["policy"]))["trustPerDay"]) * days
	if k["council"]["steward"] != null:
		change += days
	k["trust"] = maxf(0.0, minf(100.0, float(k["trust"]) + change))
