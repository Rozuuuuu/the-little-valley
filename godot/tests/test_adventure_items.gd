extends TestCase

const Items = preload("res://src/adventure/adventure_items.gd")


func test_reward_claim_survives_reload_and_full_bag() -> void:
	var bag := Items.create()
	for i: int in range(30):
		Items.grant(bag, "roadworn_sword")
	var result := Items.reward(bag, "brute:1", 3)
	check(result.ok, "first reward succeeds")
	check_eq(bag.items.size(), 30, "capacity respected")
	check_eq(bag.cache.size(), 1, "reward kept in cache")
	var restored: Dictionary = JSON.parse_string(JSON.stringify(bag))
	var before := JSON.stringify(restored)
	check(not Items.reward(restored, "brute:1", 7).ok, "reload cannot reroll a claimed life")
	check_eq(JSON.stringify(restored), before, "duplicate claim changes nothing")
	check(Items.reward(restored, "brute:2", 3).ok, "new life can reward again")


func test_cache_recovery_preserves_equipment_id() -> void:
	var bag := Items.create()
	bag.capacity = 1
	var first := Items.grant(bag, "roadworn_sword")
	var second := Items.grant(bag, "trailguard_boots")
	check(not Items.recover_cache(bag, second.id).ok, "full bag refuses recovery")
	check(Items.sell(bag, first.id).ok, "sale opens space")
	check(Items.recover_cache(bag, second.id).ok, "recover after making room")
	check_eq(bag.items[0].id, second.id, "recovery preserves identity")
	check_eq(bag.cache.size(), 0, "no duplicate owner")
	check(not Items.recover_cache(bag, second.id).ok, "cannot recover twice")


func test_two_handed_conflicts_and_invalid_equip_are_atomic() -> void:
	var bag := Items.create()
	var sword := Items.grant(bag, "roadworn_sword")
	var shield := Items.grant(bag, "oathbound_shield")
	var bow := Items.grant(bag, "wayfinder_bow")
	check(Items.equip(bag, sword.id).ok, "sword equipped")
	check(Items.equip(bag, shield.id, "off").ok, "shield equipped")
	check(Items.equip(bag, bow.id).ok, "bow replaces both hands")
	check_eq(bag.equipment.main, bow.id, "bow main reference")
	check_eq(bag.equipment.off, bow.id, "two hands reference one instance")
	check_eq(Items.stats(bag).damage, bow.stats.damage, "two-handed stats counted once")
	check(Items.equip(bag, shield.id, "off").ok, "shield removes conflicting bow")
	check_eq(bag.equipment.main, 0, "bow cleared from main")
	var before := JSON.stringify(bag)
	check(not Items.equip(bag, sword.id, "head").ok, "incompatible slot rejected")
	check_eq(JSON.stringify(bag), before, "failed equip changes nothing")
	check_eq(bag.items.size(), 3, "all equipment conserved")
	check(Items.unequip(bag, "off").ok, "unequip succeeds")
	check_eq(Items.stats(bag).armor, 0, "unequip removes bonus")


func test_equipped_favourite_and_quest_items_are_protected() -> void:
	var bag := Items.create()
	var sword := Items.grant(bag, "roadworn_sword")
	Items.equip(bag, sword.id)
	check(not Items.sell(bag, sword.id).ok, "cannot sell equipped gear")
	check(not Items.salvage(bag, sword.id).ok, "cannot salvage equipped gear")
	Items.unequip(bag, "main")
	check(Items.set_favourite(bag, sword.id, true).ok, "lock favourite")
	var before := JSON.stringify(bag)
	check(not Items.sell(bag, sword.id).ok, "cannot sell favourite")
	check(not Items.salvage(bag, sword.id).ok, "cannot salvage favourite")
	check_eq(JSON.stringify(bag), before, "protected failures are atomic")
	var quest := Items.grant(bag, "elder_supply_seal")
	check_eq(bag.items.size(), 1, "quest pouch costs no bag slot")
	check(not Items.sell(bag, quest.id).ok, "quest items cannot be sold")
	check(not Items.salvage(bag, quest.id).ok, "quest items cannot be salvaged")
	Items.set_favourite(bag, sword.id, false)
	check(Items.salvage(bag, sword.id).ok, "unlocked gear can be salvaged")
	check_eq(bag.materials.ore, 2, "salvage awards exact materials")
	check(not Items.salvage(bag, sword.id).ok, "cannot salvage twice")


func test_stacks_use_and_partial_cache_recovery() -> void:
	var bag := Items.create()
	bag.capacity = 1
	for i: int in range(22):
		Items.grant(bag, "healing_draught")
	check_eq(bag.items[0].count, 20, "consumable stack cap")
	check_eq(bag.cache[0].count, 2, "overflow stacks in cache")
	var cached_id: int = bag.cache[0].id
	var used := Items.use_item(bag, bag.items[0].id)
	check_eq(used.health, 35, "caller receives healing effect")
	check(Items.recover_cache(bag, cached_id).ok, "merge into partial stack despite full bag")
	check_eq(bag.items[0].count, 20, "merge respects cap")
	check_eq(bag.cache[0].count, 1, "unmoved remainder retained")
	check_eq(bag.cache[0].id, cached_id, "partial remainder keeps ID")
	Items.set_favourite(bag, bag.items[0].id, true)
	check(not Items.use_item(bag, bag.items[0].id).ok, "locked consumable cannot be consumed")


func test_buy_craft_and_buyback_conserve_currency_and_ids() -> void:
	var bag := Items.create()
	var before := JSON.stringify(bag)
	check(not Items.buy(bag, "roadworn_sword").ok, "no free purchase")
	check(not Items.craft(bag, "roadworn_sword").ok, "no free craft")
	check_eq(JSON.stringify(bag), before, "failed transactions preserve all state")
	bag.gold = 100
	var purchase := Items.buy(bag, "roadworn_sword")
	check(purchase.ok, "purchase succeeds")
	check_eq(bag.gold, 70, "buy price charged")
	var item_id: int = purchase.item.id
	check(Items.sell(bag, item_id).ok, "sale succeeds")
	check_eq(bag.gold, 79, "sale proceeds")
	check(Items.buyback(bag, item_id).ok, "buyback succeeds")
	check_eq(bag.gold, 70, "buyback reverses sale proceeds")
	check_eq(bag.items[0].id, item_id, "buyback restores original instance")
	check(not Items.buyback(bag, item_id).ok, "buyback cannot duplicate")
	bag.materials.ore = 3
	check(Items.craft(bag, "roadworn_sword").ok, "deterministic craft")
	check_eq(bag.materials.ore, 0, "recipe consumed exactly once")
	check_eq(bag.gold, 62, "craft fee charged")
	check(bag.items[0].id != bag.items[1].id, "crafted equipment has new ID")


func test_all_rarities_obtainable_bounded_and_catalogue_isolated() -> void:
	var bag := Items.create()
	var names := ["Common", "Uncommon", "Rare", "Very Rare", "Epic", "Legendary", "Mythic", "Relic"]
	for tier: int in range(8):
		var result := Items.reward(bag, "tier:%d" % tier, tier)
		check(result.ok, "tier reward available")
		check_eq(result.item.tier, tier, "requested tier")
		check_eq(result.item.rarity, names[tier], "rarity label")
		for stat: Variant in result.item.stats.values():
			check(stat >= 0 and stat <= 100, "bounded additive item stats")
	var defs := Items.catalogue()
	defs[0].name = "corrupted"
	check(Items.catalogue()[0].name != "corrupted", "catalogue returns independent data")
	var before := JSON.stringify(bag)
	check_eq(Items.grant(bag, "unknown"), {}, "unknown definition refused")
	check_eq(Items.grant(bag, "roadworn_sword", 8), {}, "invalid tier refused")
	check_eq(JSON.stringify(bag), before, "invalid grants allocate nothing")


func test_json_roundtrip_split_and_unique_ids() -> void:
	var bag := Items.create()
	for i: int in range(5):
		Items.grant(bag, "healing_draught")
	var original_id: int = bag.items[0].id
	check(Items.split_stack(bag, original_id, 2).ok, "split succeeds")
	check_eq(bag.items[0].count, 3, "original remainder")
	check_eq(bag.items[1].count, 2, "new stack quantity")
	check(bag.items[1].id != original_id, "split gets unique ID")
	var loaded: Dictionary = JSON.parse_string(JSON.stringify(bag))
	var sword := Items.grant(loaded, "roadworn_sword")
	check(sword.id > loaded.items[1].id, "ID sequence survives JSON numbers")
	check(Items.equip(loaded, sword.id).ok, "equipment usable after JSON roundtrip")
	check_eq(Items.stats(loaded).damage, 5, "base sword damage")


func test_material_stacks_can_fund_recipe_without_duplication() -> void:
	var bag := Items.create()
	bag.gold = 8
	for i: int in range(3):
		Items.grant(bag, "ore")
	check_eq(bag.items[0].count, 3, "material grants stack")
	check(Items.craft(bag, "roadworn_sword").ok, "carried materials pay recipe")
	check_eq(bag.items.size(), 1, "spent stack removed, crafted item added")
	check_eq(bag.items[0].definition_id, "roadworn_sword", "craft output")
	check(not Items.craft(bag, "roadworn_sword").ok, "materials cannot pay twice")


func test_material_cap_favourites_and_failed_recipe_are_atomic() -> void:
	var bag := Items.create()
	for i: int in range(100):
		Items.grant(bag, "ore")
	check_eq(bag.items[0].count, 99, "material stacks stop at 99")
	check_eq(bag.items[1].count, 1, "excess material starts another stack")
	Items.set_favourite(bag, bag.items[0].id)
	bag.gold = 100
	var before := JSON.stringify(bag)
	check(not Items.craft(bag, "roadworn_sword").ok, "favourite materials cannot fund recipe")
	check_eq(JSON.stringify(bag), before, "failed recipe spends neither gold nor material")
	Items.grant(bag, "ore")
	check_eq(bag.items[0].count, 99, "new grants do not change locked stacks")
	check_eq(bag.items[1].count, 2, "new units join unlocked stack")


func test_full_bag_purchase_and_craft_are_recoverable() -> void:
	var bag := Items.create()
	bag.capacity = 1
	Items.grant(bag, "roadworn_sword")
	bag.gold = 100
	bag.materials.ore = 3
	check(Items.buy(bag, "roadworn_sword").ok, "purchase while full succeeds")
	check(Items.craft(bag, "roadworn_sword").ok, "craft while full succeeds")
	check_eq(bag.gold, 62, "both exact fees charged")
	check_eq(bag.items.size(), 1, "bag capacity not exceeded")
	check_eq(bag.cache.size(), 2, "both outputs cached")
	check(bag.cache[0].id != bag.cache[1].id, "distinct equipment IDs")
	bag.capacity = 3
	check_eq(Items.recover_cache(bag).count, 2, "recover all when expanded")
	check_eq(bag.cache.size(), 0, "cache emptied")
	check_eq(bag.items.size(), 3, "all outputs present")


func test_compare_handles_both_hands_without_mutation() -> void:
	var bag := Items.create()
	var sword := Items.grant(bag, "roadworn_sword")
	var shield := Items.grant(bag, "oathbound_shield")
	var bow := Items.grant(bag, "reedbow")
	Items.equip(bag, sword.id)
	Items.equip(bag, shield.id, "off")
	var before := JSON.stringify(bag)
	var preview := Items.compare(bag, bow.id)
	check(preview.ok, "valid preview")
	check_eq(preview.delta.damage, 0, "same base damage")
	check_eq(preview.delta.armor, -6, "preview removes shield base and modifiers")
	check_eq(JSON.stringify(bag), before, "preview never changes live equipment")
	var ring := Items.grant(bag, "brookstone_ring")
	Items.equip(bag, ring.id, "ring1")
	Items.equip(bag, ring.id, "ring2")
	check_eq(bag.equipment.ring1, 0, "one ring cannot occupy two slots")
	check_eq(bag.equipment.ring2, ring.id, "ring moved to second slot")


func test_returns_are_snapshots_and_unknown_actions_preserve_state() -> void:
	var bag := Items.create()
	var item := Items.grant(bag, "roadworn_sword")
	item.stats.damage = 999
	item.favourite = true
	check_eq(bag.items[0].stats.damage, 5, "returned stats cannot corrupt item")
	check_eq(bag.items[0].favourite, false, "returned flags cannot bypass actions")
	var before := JSON.stringify(bag)
	check(not Items.use_item(bag, 1).ok, "equipment is not consumable")
	check(not Items.sell(bag, 999).ok, "unknown sale rejected")
	check(not Items.salvage(bag, 999).ok, "unknown salvage rejected")
	check(not Items.buy(bag, "unknown").ok, "unknown purchase rejected")
	check(not Items.craft(bag, "unknown").ok, "unknown recipe rejected")
	check(not Items.reward(bag, "", 0).ok, "blank claim rejected")
	check(not Items.reward(bag, "invalid", -1).ok, "invalid reward tier rejected")
	check(not Items.split_stack(bag, 1, 0).ok, "zero split rejected")
	check_eq(JSON.stringify(bag), before, "all invalid transactions are no-ops")


func test_high_rarity_destruction_requires_explicit_confirmation() -> void:
	var bag := Items.create()
	var item := Items.grant(bag, "stormwatch_blade")
	var before := JSON.stringify(bag)
	var sale := Items.sell(bag, item.id)
	check(not sale.ok and sale.get("requires_confirmation", false), "valuable sale requires confirmation")
	check_eq(sale.get("gold", 0), 45, "sale preview gives exact proceeds")
	var salvaged := Items.salvage(bag, item.id)
	check(not salvaged.ok and salvaged.get("requires_confirmation", false), "valuable salvage requires confirmation")
	check_eq(salvaged.get("materials", {}), {"ore": 6}, "salvage previews exact materials")
	check_eq(JSON.stringify(bag), before, "previews do not destroy item")
	Items.set_favourite(bag, item.id)
	check(not Items.salvage(bag, item.id, true).ok, "confirmation never bypasses favourite")
	Items.set_favourite(bag, item.id, false)
	check(Items.salvage(bag, item.id, true).ok, "explicit confirmation completes salvage")


func test_every_equipment_slot_and_serialized_item_conservation() -> void:
	var bag := Items.create()
	var outfits := {"main": "roadworn_sword", "off": "oathbound_shield", "head": "hearthguard_helm", "chest": "wanderer_coat", "hands": "pathkeeper_gloves", "boots": "trailguard_boots", "amulet": "elders_promise", "ring1": "brookstone_ring", "ring2": "lamplight_ring"}
	for slot: String in outfits:
		var item := Items.grant(bag, outfits[slot])
		check(Items.equip(bag, item.id, slot).ok, "valid equipment for " + slot)
	bag.capacity = 9
	var cached := Items.grant(bag, "roadworn_sword")
	var loaded: Dictionary = JSON.parse_string(JSON.stringify(bag))
	check_eq(Items.stats(loaded), Items.stats(bag), "equipped stats survive reload")
	check_eq(loaded.items.size() + loaded.cache.size(), 10, "exact instance conservation")
	var ids: Array[int] = []
	for item: Dictionary in loaded.items + loaded.cache:
		check(not ids.has(int(item.id)), "only one owner per ID")
		ids.append(int(item.id))
	check_eq(loaded.cache[0].id, cached.id, "cached ID survives reload")

