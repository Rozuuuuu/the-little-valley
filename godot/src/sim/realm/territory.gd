class_name Territory
## Land and who holds it (src/game/sim/territory.ts). The world is split into 16×16-tile sectors.
## Owning a sector (legal title) is separate from occupying it, and exploring land never makes it
## yours. The player's protected homeland is fixed at coronation; frontier claims must touch your
## land or hold a supplied settlement. Claims live in sim.claims: "x,y" -> {legalOwner, occupyingKingdom}.


static func sector_size() -> int:
	return int(Kingdoms.value("SECTOR"))


static func sector_of(x: float, y: float) -> Vector2i:
	var n := float(sector_size())
	return Vector2i(floori(x / n), floori(y / n))


static func key(s: Vector2i) -> String:
	return "%d,%d" % [s.x, s.y]


static func from_key(k: String) -> Vector2i:
	var p := k.split(",")
	return Vector2i(int(p[0]), int(p[1]))


static func _in(list: Variant, s: Vector2i) -> bool:
	if not (list is Array):
		return false
	for q: Dictionary in list:
		if int(q["x"]) == s.x and int(q["y"]) == s.y:
			return true
	return false


## The homeland the player would get if crowned now: the starting 3×3 chunks plus every sector
## holding one of your buildings. [{x, y}], sorted by row then column.
static func homeland_preview(sim: Simulation) -> Array:
	var set := {}
	var per := Chunk.SIZE / sector_size()
	var hc: Dictionary = Kingdoms.value("HOMELAND_CHUNKS")
	for cy in range(int(hc["from"]), int(hc["to"]) + 1):
		for cx in range(int(hc["from"]), int(hc["to"]) + 1):
			for j in per:
				for i in per:
					set[Vector2i(cx * per + i, cy * per + j)] = true
	for b: Building in sim.buildings.values():
		if b.type == "crate":
			continue
		set[sector_of(b.x, b.y)] = true
		set[sector_of(b.x + b.w - 1, b.y + b.h - 1)] = true
	var keys: Array = set.keys()
	keys.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.y < b.y or (a.y == b.y and a.x < b.x))
	return keys.map(func(s: Vector2i) -> Dictionary: return {"x": s.x, "y": s.y})


## Who holds a sector: {legalOwner, occupyingKingdom, protectedHomeland}, or empty for unowned land.
static func owner_of(sim: Simulation, s: Vector2i) -> Dictionary:
	var me := Kingdoms.player(sim)
	var conquest: bool = me["conflictMode"] == "full-conquest"
	if _in(me["homeland"], s):
		return {"legalOwner": int(me["id"]), "occupyingKingdom": null, "protectedHomeland": not conquest}
	var claim: Dictionary = sim.claims.get(key(s), {})
	if not claim.is_empty():
		return {"legalOwner": int(claim["legalOwner"]), "occupyingKingdom": claim["occupyingKingdom"], "protectedHomeland": false}
	var rival_land := int(Kingdoms.value("RIVAL_LAND"))
	for r: Dictionary in sim.kingdoms:
		if r["player"] or r["capital"] == null:
			continue
		var c := sector_of(float(r["capital"]["x"]), float(r["capital"]["y"]))
		var d := maxi(absi(c.x - s.x), absi(c.y - s.y))
		# The town and the ring around it are its protected core; beyond that is its frontier.
		if d <= rival_land:
			return {"legalOwner": int(r["id"]), "occupyingKingdom": null, "protectedHomeland": d <= 1 and not conquest}
	return {}


## Why the player can't build at a tile (someone else's land), or "".
static func land_problem(sim: Simulation, x: int, y: int, w: int, h: int) -> String:
	if sim.kingdoms.size() <= 1:
		return ""
	for p: Vector2i in [Vector2i(x, y), Vector2i(x + w - 1, y), Vector2i(x, y + h - 1), Vector2i(x + w - 1, y + h - 1)]:
		var o := owner_of(sim, sector_of(p.x, p.y))
		if not o.is_empty() and int(o["legalOwner"]) != Kingdoms.PLAYER:
			return "That land belongs to %s" % Kingdoms.name_of(sim, int(o["legalOwner"]))
	return ""


static func _mine(sim: Simulation, s: Vector2i) -> bool:
	var o := owner_of(sim, s)
	return not o.is_empty() and int(o["legalOwner"]) == Kingdoms.PLAYER


## A player settlement centre in this sector that a supply route serves.
static func _supplied_settlement(sim: Simulation, s: Vector2i) -> bool:
	for st: Dictionary in sim.settlements:
		var hall: Building = sim.buildings.get(int(st["id"]))
		if hall == null or sector_of(hall.x, hall.y) != s:
			continue
		for r: Dictionary in sim.routes:
			var src: Building = sim.buildings.get(int(r["sourceId"]))
			var dst: Building = sim.buildings.get(int(r["destId"]))
			if (src != null and Settlements.id_of_building(sim, src) == int(st["id"])) or (dst != null and Settlements.id_of_building(sim, dst) == int(st["id"])):
				return true
	return false


## Everything the player should know before claiming a sector: {cost, owner, protectedHomeland, supplied, problem}.
static func claim_preview(sim: Simulation, s: Vector2i) -> Dictionary:
	var me := Kingdoms.player(sim)
	var o := owner_of(sim, s)
	var owner := Kingdoms.name_of(sim, int(o["legalOwner"])) if not o.is_empty() else ""
	var touching := false
	for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		if _mine(sim, s + d):
			touching = true
	var supplied := touching or _supplied_settlement(sim, s)
	var cost := int(Kingdoms.value("CLAIM_COST"))
	var problem := ""
	if not me["crowned"]:
		problem = "Crown your ruler first (Region milestone)"
	elif not o.is_empty() and int(o["legalOwner"]) == int(me["id"]):
		problem = "This is already your homeland" if _in(me["homeland"], s) else "This land is already yours"
	elif not o.is_empty():
		problem = "This land belongs to %s — its homeland is protected" % owner if o["protectedHomeland"] else "This land belongs to %s — taking it needs a war and a peace treaty" % owner
	elif not supplied:
		problem = "Claims must touch your land, or hold one of your settlements supplied by a route"
	elif float(me["treasury"]) < cost:
		problem = "Claiming costs %d coins (the treasury has %d)" % [cost, int(me["treasury"])]
	return {"cost": cost, "owner": owner, "protectedHomeland": not o.is_empty() and bool(o["protectedHomeland"]), "supplied": supplied, "problem": problem}


static func claim_frontier(sim: Simulation, sector: Variant) -> Dictionary:
	var sd: Dictionary = sector if sector is Dictionary else {}
	if not (sd.get("x") is int or sd.get("x") is float) or not (sd.get("y") is int or sd.get("y") is float):
		return {"ok": false, "message": "Invalid sector"}
	var s := Vector2i(int(sd["x"]), int(sd["y"]))
	var p := claim_preview(sim, s)
	if p["problem"] != "":
		return {"ok": false, "message": p["problem"]}
	var me := Kingdoms.player(sim)
	me["treasury"] = float(me["treasury"]) - int(p["cost"])
	me["modeLocked"] = true
	sim.claims[key(s)] = {"legalOwner": int(me["id"]), "occupyingKingdom": null}
	Diplomacy.report_claim(sim, s)
	sim.record("settlement", "%s claimed new frontier land" % me["name"])
	sim.emit({"type": "important"})
	return {"ok": true, "message": "Claimed for %d coins. Frontier land is not protected like the homeland." % int(p["cost"])}


static func set_conflict_mode(sim: Simulation, mode: Variant) -> Dictionary:
	if mode != "protected-frontier" and mode != "full-conquest":
		return {"ok": false, "message": "Unknown setting"}
	var me := Kingdoms.player(sim)
	if me["modeLocked"]:
		return {"ok": false, "message": "The conflict setting is locked once you claim frontier land"}
	me["conflictMode"] = mode
	return {"ok": true, "message": "Full conquest: homelands, yours included, can be taken in war." if mode == "full-conquest" else "Protected frontier: homelands are safe; only frontier land can change hands."}


static func activate_frontier(sim: Simulation) -> Dictionary:
	if not sim.reached.has("civilization"):
		return {"ok": false, "message": "Frontier conflict can only be enabled at the Civilization milestone"}
	var me := Kingdoms.player(sim)
	if not me["crowned"]:
		return {"ok": false, "message": "Crown your ruler first"}
	me["frontierActive"] = true
	me["modeLocked"] = true
	return {"ok": true, "message": "The frontier is open: border incidents and war become possible. Your homeland rules still apply."}


## Whether a kingdom's people may enter a sector: {allowed, reason}. Civilians may travel anywhere;
## armed parties need to own the land, a passage agreement or a war, and never enter a protected
## homeland.
static func can_enter(sim: Simulation, kingdom_id: int, s: Vector2i, armed: bool) -> Dictionary:
	var o := owner_of(sim, s)
	if o.is_empty() or int(o["legalOwner"]) == kingdom_id:
		return {"allowed": true, "reason": "Your own land" if not o.is_empty() else "Unclaimed land"}
	var owner := Kingdoms.name_of(sim, int(o["legalOwner"]))
	if not armed:
		return {"allowed": true, "reason": "Civilians may travel through %s's land" % owner}
	if o["protectedHomeland"]:
		return {"allowed": false, "reason": "%s's homeland is protected" % owner}
	if not Diplomacy.active_treaty(sim, kingdom_id, int(o["legalOwner"]), "passage").is_empty():
		return {"allowed": true, "reason": "A passage agreement with %s" % owner}
	if Diplomacy.at_war(sim, kingdom_id, int(o["legalOwner"])):
		return {"allowed": true, "reason": "At war with %s" % owner}
	return {"allowed": false, "reason": "Armed entry into %s's land needs permission (a passage treaty) or war" % owner}
