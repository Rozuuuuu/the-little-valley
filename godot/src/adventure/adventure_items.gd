class_name AdventureItems
extends RefCounted
## Pure JSON inventory transactions. `items` owns carried instances (including equipped
## gear); equipment contains ID references, never copies. Cache and quest pouch own
## separate instances. All returned items are snapshots, not mutable catalogue/state.
## Materials holds salvage credits; recipes also consume unlocked carried material
## stacks, never cached materials. IDs are monotonic and are never recycled.

const RARITIES := ["Common", "Uncommon", "Rare", "Very Rare", "Epic", "Legendary", "Mythic", "Relic"]
const SLOTS := ["main", "off", "head", "chest", "hands", "boots", "amulet", "ring1", "ring2"]
const STAT_KEYS := ["damage", "armor", "health", "mana"]
const BUDGETS := [0, 2, 5, 8, 12, 17, 23, 30]
const REWARD_POOLS := [
	["roadworn_sword", "reedbow", "ash_focus"],
	["trailguard_boots", "reedbow", "ash_focus"],
	["wayfinder_bow", "roadworn_sword", "ash_focus"],
	["oathbound_shield", "wayfinder_bow", "ash_focus"],
	["stormwatch_blade", "wayfinder_bow", "ash_focus"],
	["elders_promise", "wayfinder_bow", "ash_focus"],
	["dawnwarden_aegis", "wayfinder_bow", "ash_focus"],
	["crownless_kings_standard", "wayfinder_bow", "ash_focus"]
]


static func create() -> Dictionary:
	var equipment: Dictionary = {}
	for slot: String in SLOTS:
		equipment[slot] = 0
	return {"items": [], "equipment": equipment, "gold": 0, "next_id": 1,
		"capacity": 30, "cache": [], "materials": {}, "claims": {}, "quest_items": [], "buyback": []}


## Definitions are freshly built on each call; callers cannot mutate the catalogue.
## Prices and recipes are shared by every economic operation.
static func catalogue() -> Array[Dictionary]:
	return [
		_def("roadworn_sword", "Roadworn Sword", "weapon", "main", {"damage": 5}, 30, {"ore": 3}, 0),
		_def("reedbow", "Reedrunner Bow", "weapon", "main", {"damage": 5}, 30, {"fibres": 3}, 0, true),
		_def("ash_focus", "Ashlight Staff", "weapon", "main", {"damage": 3, "mana": 8}, 30, {"focus_shard": 3}, 0, true),
		_def("trailguard_boots", "Trailguard Boots", "armor", "boots", {"armor": 2}, 40, {"fibres": 4}, 1),
		_def("wayfinder_bow", "Wayfinder Bow", "weapon", "main", {"damage": 7}, 70, {"fibres": 6, "resin": 2}, 2, true),
		_def("oathbound_shield", "Oathbound Shield", "armor", "off", {"armor": 4}, 100, {"ore": 8}, 3),
		_def("stormwatch_blade", "Stormwatch Blade", "weapon", "main", {"damage": 8}, 150, {"ore": 10, "focus_shard": 3}, 4),
		_def("elders_promise", "Elder's Promise", "accessory", "amulet", {"health": 12, "mana": 8}, 240, {"carved_core": 4}, 5),
		_def("dawnwarden_aegis", "Dawnwarden Aegis", "armor", "off", {"armor": 7, "health": 10}, 350, {"carved_core": 6, "ore": 15}, 6),
		_def("crownless_kings_standard", "Crownless King's Standard", "weapon", "main", {"damage": 10, "health": 15}, 500, {"relic_fragment": 4, "carved_core": 8}, 7, true),
		_def("hearthguard_helm", "Hearthguard Helm", "armor", "head", {"armor": 2}, 25, {"ore": 3}),
		_def("wanderer_coat", "Wanderer's Coat", "armor", "chest", {"armor": 3, "health": 5}, 35, {"fibres": 4}),
		_def("pathkeeper_gloves", "Pathkeeper Gloves", "armor", "hands", {"armor": 1}, 20, {"fibres": 2}),
		_def("brookstone_ring", "Brookstone Ring", "accessory", "ring", {"health": 6}, 25, {"ore": 2}),
		_def("lamplight_ring", "Lamplight Ring", "accessory", "ring", {"mana": 6}, 25, {"focus_shard": 2}),
		_def("healing_draught", "Meadow Healing Draught", "consumable", "", {"health": 35}, 12, {"resin": 2}),
		_def("mana_draught", "Moonwell Mana Draught", "consumable", "", {"mana": 25}, 12, {"focus_shard": 2}),
		_def("ore", "Valley Ore", "material", "", {}, 5),
		_def("fibres", "Moss Fibres", "material", "", {}, 5),
		_def("resin", "Amber Resin", "material", "", {}, 5),
		_def("focus_shard", "Focus Shard", "material", "", {}, 8),
		_def("carved_core", "Carved Core", "material", "", {}, 20),
		_def("relic_fragment", "Crownless Fragment", "material", "", {}, 60),
		_def("river_pearl", "River Pearl", "trade", "", {}, 25),
		_def("elder_supply_seal", "Elder's Supply Seal", "quest", "", {}, 0)
	]


static func _def(id: String, title: String, category: String, slot: String, bonuses: Dictionary,
		price: int, recipe: Dictionary = {}, tier: int = 0, two_handed: bool = false) -> Dictionary:
	return {"id": id, "name": title, "category": category, "slot": slot, "stats": bonuses,
		"price": price, "recipe": recipe, "craft_gold": 8, "tier": tier,
		"two_handed": two_handed, "stack_limit": 20 if category == "consumable" else (99 if category in ["material", "trade"] else 1)}


static func definition(definition_id: String) -> Dictionary:
	for entry: Dictionary in catalogue():
		if entry.id == definition_id:
			return entry
	return {}


## One unit per grant. Invalid definitions/tiers return {} without changing state.
## A grant at tier zero uses the definition's minimum authored tier.
static func grant(bag: Dictionary, definition_id: String, tier: int = 0) -> Dictionary:
	var def := definition(definition_id)
	if def.is_empty() or tier < 0 or tier > 7:
		return {}
	tier = maxi(tier, int(def.tier))
	var item := _instance(def, tier, int(bag.next_id))
	var destination: Array = bag.items
	if def.category == "quest":
		destination = bag.quest_items
	else:
		var stack := _stack_target(destination, item)
		if not stack.is_empty():
			stack.count = int(stack.count) + 1
			return stack.duplicate(true)
		if destination.size() >= int(bag.capacity):
			destination = bag.cache
			stack = _stack_target(destination, item)
			if not stack.is_empty():
				stack.count = int(stack.count) + 1
				return stack.duplicate(true)
	bag.next_id = int(bag.next_id) + 1
	destination.append(item)
	return item.duplicate(true)


static func _instance(def: Dictionary, tier: int, id: int) -> Dictionary:
	var bonuses := {"damage": 0, "armor": 0, "health": 0, "mana": 0}
	for key: String in def.stats:
		bonuses[key] = int(def.stats[key])
	var modifiers: Array[Dictionary] = []
	# Compatible additive modifiers: weapons improve damage, armour improves armour,
	# accessories improve health/mana. No multiplicative or recursive effects.
	if def.category in ["weapon", "armor", "accessory"]:
		var keys: Array = ["damage", "health", "mana"] if def.category == "weapon" else (["armor", "health", "mana"] if def.category == "armor" else ["health", "mana", "armor"])
		var modifier_count := mini(tier, 3)
		var remaining: int = BUDGETS[tier]
		for i: int in range(modifier_count):
			var amount := remaining / (modifier_count - i)
			remaining -= amount
			bonuses[keys[i]] += amount
			modifiers.append({"stat": keys[i], "amount": amount})
	return {"id": id, "definition_id": def.id, "name": def.name, "category": def.category,
		"slot": def.slot, "two_handed": def.two_handed, "tier": tier, "rarity": RARITIES[tier],
		"level": 1, "item_level": 1, "upgrade_rank": 0, "origin": "grant", "generator_version": 1,
		"modifiers": modifiers, "stats": bonuses, "count": 1, "stack_limit": def.stack_limit,
		"favourite": false, "price": int(def.price) + maxi(0, tier - int(def.tier)) * 15}


static func _find(items: Array, item_id: int) -> Dictionary:
	for item: Dictionary in items:
		if int(item.id) == item_id:
			return item
	return {}


static func _stack_target(items: Array, incoming: Dictionary) -> Dictionary:
	if int(incoming.stack_limit) <= 1:
		return {}
	for item: Dictionary in items:
		if item.definition_id == incoming.definition_id and int(item.tier) == int(incoming.tier) and bool(item.favourite) == bool(incoming.favourite) and int(item.count) < int(item.stack_limit):
			return item
	return {}


static func _report(ok: bool, message: String) -> Dictionary:
	return {"ok": ok, "message": message}


static func _equipped(bag: Dictionary, item_id: int) -> bool:
	for value: Variant in bag.equipment.values():
		if int(value) == item_id:
			return true
	return false


static func _clear_equipment(bag: Dictionary, item_id: int) -> void:
	for slot: String in bag.equipment:
		if int(bag.equipment[slot]) == item_id:
			bag.equipment[slot] = 0


static func equip(bag: Dictionary, item_id: int, slot: String = "main") -> Dictionary:
	var item := _find(bag.items, item_id)
	if item.is_empty() or not SLOTS.has(slot):
		return _report(false, "Choose a carried item and a valid equipment slot.")
	if item.slot != slot and not (item.slot == "ring" and slot in ["ring1", "ring2"]):
		return _report(false, "That item does not fit this slot.")
	_clear_equipment(bag, item_id)
	_clear_equipment(bag, int(bag.equipment.get(slot, 0)))
	if bool(item.two_handed):
		_clear_equipment(bag, int(bag.equipment.get("off", 0)))
		bag.equipment.off = item_id
	bag.equipment[slot] = item_id
	return _report(true, "%s equipped." % item.name)


static func unequip(bag: Dictionary, slot: String) -> Dictionary:
	if not SLOTS.has(slot) or int(bag.equipment.get(slot, 0)) == 0:
		return _report(false, "There is no equipment in that slot.")
	_clear_equipment(bag, int(bag.equipment[slot]))
	return _report(true, "Equipment returned to backpack.")


static func stats(bag: Dictionary) -> Dictionary:
	var total := {"damage": 0, "armor": 0, "health": 0, "mana": 0}
	var seen: Array[int] = []
	for value: Variant in bag.equipment.values():
		var id := int(value)
		if id == 0 or seen.has(id):
			continue
		seen.append(id)
		var item := _find(bag.items, id)
		if item.is_empty():
			continue
		for key: String in STAT_KEYS:
			total[key] += clampi(int(item.stats.get(key, 0)), 0, 100)
	return total


## Preview the net change including two-hand conflicts, without touching live state.
static func compare(bag: Dictionary, item_id: int, slot: String = "main") -> Dictionary:
	var trial := bag.duplicate(true)
	var report := equip(trial, item_id, slot)
	if report.ok:
		var before := stats(bag)
		var after := stats(trial)
		for key: String in STAT_KEYS:
			after[key] -= int(before[key])
		report["delta"] = after
	return report


static func set_favourite(bag: Dictionary, item_id: int, locked: bool = true) -> Dictionary:
	var item := _find(bag.items, item_id)
	if item.is_empty():
		item = _find(bag.cache, item_id)
	if item.is_empty():
		return _report(false, "Item not found.")
	item.favourite = locked
	return _report(true, "Favourite updated.")


static func _protected(bag: Dictionary, item: Dictionary) -> bool:
	return item.is_empty() or bool(item.get("favourite", false)) or item.get("category", "") == "quest" or _equipped(bag, int(item.get("id", 0)))


## Effects are returned for the owning adventure system to apply exactly once.
static func use_item(bag: Dictionary, item_id: int) -> Dictionary:
	var item := _find(bag.items, item_id)
	if _protected(bag, item) or item.category != "consumable":
		return _report(false, "Choose an unlocked carried consumable.")
	var result := _report(true, "%s used." % item.name)
	result["health"] = int(item.stats.health)
	result["mana"] = int(item.stats.mana)
	item.count = int(item.count) - 1
	if int(item.count) == 0:
		bag.items.erase(item)
	return result


static func salvage(bag: Dictionary, item_id: int) -> Dictionary:
	var item := _find(bag.items, item_id)
	if _protected(bag, item) or item.category not in ["weapon", "armor", "accessory"]:
		return _report(false, "Only unequipped, unlocked equipment can be salvaged.")
	var amount := 2 + int(item.tier)
	bag.materials["ore"] = int(bag.materials.get("ore", 0)) + amount
	bag.items.erase(item)
	var result := _report(true, "Salvaged for %d ore." % amount)
	result["materials"] = {"ore": amount}
	return result


## Sells the entire selected stack. Buyback retains the last ten sold instances.
static func sell(bag: Dictionary, item_id: int) -> Dictionary:
	var item := _find(bag.items, item_id)
	if _protected(bag, item):
		return _report(false, "Equipped, favourite and quest items cannot be sold.")
	var price := maxi(1, int(int(item.price) * 0.3)) * int(item.count)
	bag.gold = int(bag.gold) + price
	bag.items.erase(item)
	bag.buyback.append({"item": item, "price": price})
	if bag.buyback.size() > 10:
		bag.buyback.pop_front()
	var result := _report(true, "Sold for %d gold." % price)
	result["gold"] = price
	return result


## Full-bag purchases and crafting use the same recoverable cache as rewards.
static func buy(bag: Dictionary, definition_id: String) -> Dictionary:
	var def := definition(definition_id)
	if def.is_empty() or def.category == "quest" or int(bag.gold) < int(def.price):
		return _report(false, "Unknown stock or insufficient gold.")
	bag.gold = int(bag.gold) - int(def.price)
	var result := _report(true, "Purchased; overflow is available in the reward cache.")
	result["item"] = grant(bag, definition_id)
	return result


static func buyback(bag: Dictionary, item_id: int) -> Dictionary:
	for entry: Dictionary in bag.buyback:
		if int(entry.item.id) != item_id:
			continue
		if int(bag.gold) < int(entry.price):
			return _report(false, "Insufficient gold.")
		bag.gold = int(bag.gold) - int(entry.price)
		var destination: Array = bag.items if bag.items.size() < int(bag.capacity) else bag.cache
		destination.append(entry.item)
		bag.buyback.erase(entry)
		return _report(true, "Original item restored; overflow is in the cache.")
	return _report(false, "That sale is no longer available.")


static func _material_count(bag: Dictionary, material: String) -> int:
	var count := int(bag.materials.get(material, 0))
	for item: Dictionary in bag.items:
		if item.definition_id == material and not _protected(bag, item):
			count += int(item.count)
	return count


static func _spend_material(bag: Dictionary, material: String, amount: int) -> void:
	var credits := mini(amount, int(bag.materials.get(material, 0)))
	bag.materials[material] = int(bag.materials.get(material, 0)) - credits
	amount -= credits
	for index: int in range(bag.items.size() - 1, -1, -1):
		var item: Dictionary = bag.items[index]
		if amount == 0:
			break
		if item.definition_id != material or _protected(bag, item):
			continue
		var taken := mini(amount, int(item.count))
		item.count = int(item.count) - taken
		amount -= taken
		if int(item.count) == 0:
			bag.items.remove_at(index)


static func craft(bag: Dictionary, definition_id: String) -> Dictionary:
	var def := definition(definition_id)
	if def.is_empty() or def.recipe.is_empty():
		return _report(false, "No recipe for that item.")
	if int(bag.gold) < int(def.craft_gold):
		return _report(false, "Insufficient gold for crafting.")
	for material: String in def.recipe:
		if _material_count(bag, material) < int(def.recipe[material]):
			return _report(false, "Missing crafting material: %s." % material)
	for material: String in def.recipe:
		_spend_material(bag, material, int(def.recipe[material]))
	bag.gold = int(bag.gold) - int(def.craft_gold)
	var result := _report(true, "Crafted; overflow is available in the reward cache.")
	result["item"] = grant(bag, definition_id)
	return result


## Recover as much of a stack as fits, preserving the ID of any remainder. Entire
## equipment instances move without copying or allocating IDs. Success means progress.
static func recover_cache(bag: Dictionary, item_id: int = -1) -> Dictionary:
	var moved := 0
	for index: int in range(bag.cache.size() - 1, -1, -1):
		var item: Dictionary = bag.cache[index]
		if item_id != -1 and int(item.id) != item_id:
			continue
		var target := _stack_target(bag.items, item)
		while not target.is_empty():
			var amount := mini(int(item.count), int(target.stack_limit) - int(target.count))
			target.count = int(target.count) + amount
			item.count = int(item.count) - amount
			moved += amount
			if int(item.count) == 0:
				break
			target = _stack_target(bag.items, item)
		if int(item.count) == 0:
			bag.cache.remove_at(index)
		elif bag.items.size() < int(bag.capacity):
			bag.items.append(item)
			moved += int(item.count)
			bag.cache.remove_at(index)
	var result := _report(moved > 0, "Recovered %d units; remaining items stay cached." % moved)
	result["count"] = moved
	return result


static func split_stack(bag: Dictionary, item_id: int, count: int) -> Dictionary:
	var item := _find(bag.items, item_id)
	if _protected(bag, item) or count <= 0 or count >= int(item.count) or bag.items.size() >= int(bag.capacity):
		return _report(false, "Choose part of an unlocked stack and make room first.")
	var split := item.duplicate(true)
	split.id = int(bag.next_id)
	bag.next_id = int(bag.next_id) + 1
	split.count = count
	item.count = int(item.count) - count
	bag.items.append(split)
	var result := _report(true, "Stack split.")
	result["item"] = split.duplicate(true)
	return result


## Caller supplies a stable quest ID or spawn:life ID. Outcome is deterministic and
## persisted with the claim, so reloading never rerolls it. No external side effects.
static func reward(bag: Dictionary, reward_id: String, tier: int) -> Dictionary:
	if reward_id.strip_edges().is_empty() or tier < 0 or tier > 7:
		return _report(false, "A reward needs a stable ID and a valid tier.")
	if bag.get("claims", {}).has(reward_id):
		return _report(false, "Reward already claimed.")
	var pool: Array = REWARD_POOLS[tier]
	var choice := 0
	for byte: int in reward_id.to_utf8_buffer():
		choice = (choice * 31 + byte) % pool.size()
	var item := grant(bag, pool[choice], tier)
	var gold := 10 + tier * 5
	bag.gold = int(bag.gold) + gold
	if not bag.has("claims"):
		bag["claims"] = {}
	bag.claims[reward_id] = {"item_id": item.id, "definition_id": item.definition_id, "tier": tier, "gold": gold, "generator_version": 1}
	var result := _report(true, "Reward claimed; overflow is available in the reward cache.")
	result["item"] = item
	result["gold"] = gold
	return result
