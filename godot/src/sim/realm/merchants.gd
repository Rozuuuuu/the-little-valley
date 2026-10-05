class_name Merchants
## Travelling merchants (src/game/sim/travelers.ts, merchants). While an inn stands, a merchant sets
## off from a nearby town now and then, walks in from the edge of the known land, lodges at the inn
## for a day and leaves. Barter is explicit and fair at their prices; their stock and purse are
## finite, and everything moves at once or nothing does. Merchants carry news both ways.
##
## Parties: {id, name, appearance, homeRegion, stock, state travelling|arriving|lodging|leaving,
## innId, arriveTick, leaveTick, x, y, edge {x, y}, coins}; their walking path is transient.

const INTERVAL := 2 * Defs.DAY_TICKS
const STAY := Defs.DAY_TICKS
## Walking speed on the map (tiles per tick).
const WALK := 0.18


static func price(res: String) -> float:
	return float((Content.get_value("trade", "PRICES") as Dictionary)[res])


## What a merchant asks for one unit.
static func sell_price(res: String) -> int:
	return ceili(price(res) * 1.25)


## What a merchant pays for one unit.
static func buy_price(res: String) -> int:
	return maxi(1, floori(price(res) * 0.8))


static func inn_of(sim: Simulation, id: int = -1) -> Building:
	if id != -1:
		var b: Building = sim.buildings.get(id)
		if b != null and b.built and b.def().has("lodging"):
			return b
	for b: Building in sim.buildings.values():
		if b.built and b.def().has("lodging"):
			return b
	return null


static func find(sim: Simulation, id: Variant) -> Dictionary:
	if not (id is int or id is float):
		return {}
	for p: Dictionary in sim.parties:
		if int(p["id"]) == int(id):
			return p
	return {}


static func _spawn(sim: Simulation, inn: Building) -> void:
	var towns := Regions.nearby_towns(sim.seed_value)
	var home: Dictionary = towns[floori(sim.rng.next() * mini(3, towns.size()))]
	Kingdoms.know_of(sim, int(home["id"]))
	var stock := {}
	var ores: Array = Content.get_value("trade", "MERCHANT_ORES")
	stock[ores[sim.rng.int_below(ores.size())]] = 10 + sim.rng.int_below(11)
	# A random pick of three, from the merchant stream (the browser game sorts with a random comparator).
	var goods: Array = (Content.get_value("trade", "MERCHANT_GOODS") as Array).duplicate()
	goods = _js_sort_random(sim, goods)
	for g: Dictionary in goods.slice(0, 3):
		stock[g["res"]] = int(g["min"]) + sim.rng.int_below(int(g["max"]) - int(g["min"]) + 1)
	var dist := JsMath.hypot(float(home["x"]), float(home["y"]))
	var purse: Dictionary = Kingdoms.value("MERCHANT_PURSE")
	var p := {"id": sim.alloc_id(), "name": sim.pick_name(), "appearance": sim.random_appearance(), "homeRegion": home["id"], "stock": stock,
		"state": "travelling", "innId": inn.id, "arriveTick": sim.tick + roundi(dist / Regions.ROAD_SPEED), "leaveTick": 0,
		"x": float(inn.x), "y": float(inn.y), "edge": {"x": inn.x, "y": inn.y}, "coins": int(purse["min"]) + sim.rng.int_below(int(purse["max"]) - int(purse["min"]) + 1)}
	sim.parties.append(p)
	sim.next_merchant = sim.tick + roundi(INTERVAL * float(Kingdoms.policy(Kingdoms.player(sim)["policy"])["merchantDelay"]))
	sim.toast("A merchant, %s, has set off from %s (%s) to trade at your inn." % [p["name"], home["name"], Regions.direction(float(home["x"]), float(home["y"]))], "info")
	sim.emit({"type": "important"})


## A shuffle in the spirit of sort(() => rng.next() - 0.5): an insertion sort with a random comparator.
static func _js_sort_random(sim: Simulation, arr: Array) -> Array:
	var a := arr.duplicate()
	for i in range(1, a.size()):
		var v: Variant = a[i]
		var j := i - 1
		while j >= 0 and sim.rng.next() - 0.5 > 0:
			a[j + 1] = a[j]
			j -= 1
		a[j + 1] = v
	return a


## An explored, walkable spot about 14 tiles from the inn, towards the merchant's home.
static func _edge_spot(sim: Simulation, inn: Building, home: Dictionary) -> Vector2i:
	var a := atan2(float(home["y"]) - inn.y, float(home["x"]) - inn.x)
	for r in range(14, 2, -1):
		for da: float in [0.0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0]:
			var x := int(JsMath.round_js(inn.x + JsMath.cos_js(a + da) * r))
			var y := int(JsMath.round_js(inn.y + JsMath.sin_js(a + da) * r))
			if sim.world.explored(x, y) and sim.walkable(x, y):
				return Vector2i(x, y)
	return inn.entrance()


## Steps along a walking path to a goal; true on arrival.
static func _walk(sim: Simulation, p: Dictionary, goal: Rect2i, adjacent: bool) -> bool:
	if p.get("path") == null:
		var r := GridAStar.find_path(sim, floori(float(p["x"])), floori(float(p["y"])), GridAStar.Goal.new(goal.position.x, goal.position.y, goal.size.x, goal.size.y, adjacent), 20000)
		var path: Array = []
		if r != null and r.found:
			for i in r.steps.size() / 2:
				path.append(Vector2i(r.steps[i * 2], r.steps[i * 2 + 1]))
		p["path"] = path
		var fx := floori(float(p["x"]))
		var fy := floori(float(p["y"]))
		if path.is_empty() and not (fx >= goal.position.x - 1 and fx <= goal.end.x and fy >= goal.position.y - 1 and fy <= goal.end.y):
			# No path: step straight to the goal rather than getting stuck on the way.
			p["x"] = goal.position.x + 0.5
			p["y"] = goal.end.y + 0.5
			return true
	var path2: Array = p["path"]
	if path2.is_empty():
		return true
	var next: Vector2i = path2[0]
	var dx := next.x + 0.5 - float(p["x"])
	var dy := next.y + 0.5 - float(p["y"])
	var d := JsMath.hypot(dx, dy)
	if d <= WALK:
		p["x"] = next.x + 0.5
		p["y"] = next.y + 0.5
		path2.remove_at(0)
		return path2.is_empty()
	p["x"] = float(p["x"]) + dx / d * WALK
	p["y"] = float(p["y"]) + dy / d * WALK
	return false


static func _update_party(sim: Simulation, p: Dictionary) -> void:
	var inn := inn_of(sim, int(p["innId"]))
	match str(p["state"]):
		"travelling":
			if sim.tick < int(p["arriveTick"]):
				return
			if inn == null:
				# The inn is gone: they turn back without ever entering the valley.
				sim.parties.erase(p)
				return
			p["innId"] = inn.id
			var e := _edge_spot(sim, inn, Regions.by_id(sim.seed_value, int(p["homeRegion"])))
			p["edge"] = {"x": e.x, "y": e.y}
			p["x"] = e.x + 0.5
			p["y"] = e.y + 0.5
			p["path"] = null
			p["state"] = "arriving"
		"arriving":
			if inn == null:
				p["state"] = "leaving"
				p["path"] = null
				return
			if not _walk(sim, p, Rect2i(inn.x, inn.y, inn.w, inn.h), true):
				return
			p["state"] = "lodging"
			p["leaveTick"] = sim.tick + STAY
			Diplomacy.merchant_brings_news(sim, int(p["homeRegion"]))
			p["path"] = null
			sim.stats["merchantVisits"] = int(sim.stats["merchantVisits"]) + 1
			sim.toast("%s has taken a room at the inn. Open the inn to barter." % p["name"], "good")
			sim.record("arrival", "%s came to trade from %s" % [p["name"], Regions.by_id(sim.seed_value, int(p["homeRegion"]))["name"]], inn.x, inn.y)
			sim.emit({"type": "important"})
		"lodging":
			if inn != null and sim.tick < int(p["leaveTick"]):
				return
			var e := inn.entrance() if inn != null else Vector2i(floori(float(p["x"])), floori(float(p["y"])))
			p["x"] = e.x + 0.5
			p["y"] = e.y + 0.5
			p["state"] = "leaving"
			p["path"] = null
		"leaving":
			if not _walk(sim, p, Rect2i(int(p["edge"]["x"]), int(p["edge"]["y"]), 1, 1), false):
				return
			Diplomacy.merchant_carries_news(sim, int(p["homeRegion"]))
			sim.parties.erase(p)


static func update(sim: Simulation) -> void:
	for p: Dictionary in sim.parties.duplicate():
		_update_party(sim, p)
	if sim.tick % 50 != 0:
		return
	var inn := inn_of(sim)
	if inn == null:
		return
	if sim.next_merchant == 0:
		sim.next_merchant = sim.tick + Defs.DAY_TICKS / 4
	if sim.tick >= sim.next_merchant and sim.parties.is_empty():
		_spawn(sim, inn)


static func _clean_inv(v: Variant) -> Variant:
	if not (v is Dictionary):
		return null
	var out := {}
	for k: Variant in v:
		var n: Variant = v[k]
		if not (k is String) or not Defs.resource_ids().has(k) or not (n is int or n is float) or float(n) != floorf(float(n)) or int(n) < 0:
			return null
		if int(n) > 0:
			out[k] = int(n)
	return out


## Barter with a lodging merchant. What you give must be worth at least what you take at their
## prices; everything moves at once or nothing does. coins > 0: the treasury pays the merchant;
## coins < 0: the merchant pays the treasury.
static func barter(sim: Simulation, party_id: Variant, give_raw: Variant, take_raw: Variant, coins_raw: Variant = 0) -> Dictionary:
	if not (coins_raw is int or coins_raw is float) or float(coins_raw) != floorf(float(coins_raw)):
		return {"ok": false, "message": "Invalid coin amount"}
	var coins := int(coins_raw)
	var p := find(sim, party_id)
	if p.is_empty() or p["state"] != "lodging":
		return {"ok": false, "message": "That merchant is not at the inn"}
	var give: Variant = _clean_inv(give_raw)
	var take: Variant = _clean_inv(take_raw)
	if give == null or take == null:
		return {"ok": false, "message": "Invalid trade"}
	if (give as Dictionary).is_empty() and (take as Dictionary).is_empty() and coins == 0:
		return {"ok": false, "message": "Choose what to trade"}
	var crown := Kingdoms.player(sim)
	if coins > float(crown["treasury"]):
		return {"ok": false, "message": "The treasury holds only %d coins" % int(crown["treasury"])}
	var inn := inn_of(sim, int(p["innId"]))
	if inn == null:
		return {"ok": false, "message": "The inn is gone"}
	var stock: Dictionary = p["stock"]
	for r: String in take:
		if int(stock.get(r, 0)) < int(take[r]):
			return {"ok": false, "message": "%s only has %d %s" % [p["name"], int(stock.get(r, 0)), str(Defs.resource(r)["name"]).to_lower()]}
	var settlement := Settlements.id_of_building(sim, inn)
	for r: String in give:
		var have := Settlements.local_available(sim, settlement, r)
		if have < int(give[r]):
			return {"ok": false, "message": "Your stores near the inn have only %d %s to spare" % [have, str(Defs.resource(r)["name"]).to_lower()]}
	var offered := maxi(0, coins)
	for r: String in give:
		offered += buy_price(r) * int(give[r])
	var asked := maxi(0, -coins)
	for r: String in take:
		asked += sell_price(r) * int(take[r])
	if offered < asked:
		return {"ok": false, "message": "%s wants goods worth %d for that; you offer %d" % [p["name"], asked, offered]}
	# Tax: a share of what the merchant hands over in this trade, paid from their purse.
	var tax := floori(asked * float(Kingdoms.policy(crown["policy"])["tradeTax"]))
	if -coins + tax > int(p["coins"]) and coins < 0:
		return {"ok": false, "message": "%s has only %d coins%s" % [p["name"], int(p["coins"]), " (and owes %d in tax)" % tax if tax > 0 else ""]}
	var levy := mini(tax, int(p["coins"]) - maxi(0, -coins))
	var stores := Settlements.local_stores(sim, settlement)
	var free := 0
	for b in stores:
		if Simulation.stores_resource(b, "food"):
			free += b.storage_capacity() - sim.storage_used(b)
	var take_total := 0
	var give_total := 0
	for r: String in take:
		if r != "horses":
			take_total += int(take[r])
	for r: String in give:
		if r != "horses":
			give_total += int(give[r])
	if free + give_total < take_total:
		return {"ok": false, "message": "Not enough room in your stores for what you would take"}
	var stalls := 0
	for b in sim.storages():
		if Simulation.stores_resource(b, "horses"):
			stalls += b.storage_capacity() - sim.storage_used(b)
	if int((take as Dictionary).get("horses", 0)) > stalls:
		return {"ok": false, "message": "Horses need free stable stalls (%d free) — build a stable" % stalls}
	# All checks passed: move everything.
	for r: String in give:
		var left := int(give[r])
		for b in stores:
			var k := mini(left, maxi(0, sim.available(b, r)))
			Inv.add(b.inventory, r, -k)
			left -= k
		Inv.add(stock, r, int(give[r]))
	for r: String in take:
		Inv.add(stock, r, -int(take[r]))
		var left := int(take[r])
		for b in (sim.storages() if r == "horses" else stores):
			left -= sim.deposit(b, r, left)
	p["coins"] = int(p["coins"]) + coins - levy
	crown["treasury"] = float(crown["treasury"]) - coins + levy
	crown["taxCollected"] = float(crown["taxCollected"]) + levy
	sim.stats["trades"] = int(sim.stats["trades"]) + 1
	sim.emit({"type": "sfx", "name": "complete", "x": inn.x + 1.0, "y": inn.y + 1.0})
	return {"ok": true, "message": "Traded with %s." % p["name"]}
