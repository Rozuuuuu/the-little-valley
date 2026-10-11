extends TestCase

const Social = preload("res://src/adventure/adventure_social.gd")

func _site(faction: String = "human", kind: String = "village") -> Dictionary:
	return {"id": "oak", "name": "Oakford", "faction": faction, "kind": kind, "kingless": true, "elder": "Mara"}

func test_refusal_has_alternative_and_leadership_is_once() -> void:
	var s := Social.create()
	var p := {"kills": 0, "discoveries": 1, "gold": 0, "level": 1}
	check(Social.choose(s, _site(), p, "decline").ok, "polite decline")
	check(Social.choose(s, _site(), p, "rumour").ok, "another route after refusal")
	check(Social.choose(s, _site(), p, "trial").ok, "trial remains available")
	check(not Social.choose(s, _site(), p, "leadership").ok, "cannot skip trial")
	p.trial_done = true
	check(Social.choose(s, _site(), p, "protector").ok, "optional protector")
	check_eq(Social.choose(s, _site(), p, "leadership").effect, "leadership", "reversible decision")
	check(not Social.choose(s, _site(), p, "leadership").ok, "no duplicate transfer")

func test_elf_proof_warning_and_local_relations() -> void:
	var s := Social.create()
	var elf := _site("elf")
	check(not Social.choose(s, elf, {}, "passage").ok, "wary refusal")
	check_eq(s.relations.oak.disposition, "neutral", "refusal is peaceful")
	check(Social.choose(s, elf, {}, "conditions").ok, "concrete next step")
	check(not Social.choose(s, elf, {"kills": 99}, "proof").ok, "kills do not fabricate proof")
	check(Social.choose(s, elf, {"trial_done": true}, "proof").ok, "verified service")
	check(Social.choose(s, elf, {}, "alliance").ok, "alliance after proof")
	check_eq(s.companions.size(), 0, "alliance does not recruit")
	check_eq(Social.choose(s, elf, {}, "threaten").effect, "warning", "first threat warns")
	check(Social.choose(s, elf, {}, "withdraw").ok, "withdraw safely")
	check(not Social.choose(s, elf, {}, "attack").ok, "withdraw cancels escalation")
	Social.choose(s, elf, {}, "threaten")
	check_eq(Social.choose(s, elf, {}, "attack").effect, "hostile", "explicit escalation")
	check(not Social.choose(s, elf, {}, "proof").ok, "proof cannot erase hostility")
	var other := _site("orc")
	other.id = "clan"
	check(Social.choose(s, other, {}, "passage").ok, "other settlement stays peaceful")

func test_reward_claim_survives_reload_and_return_required() -> void:
	var s := Social.create()
	var site := _site()
	check(Social.choose(s, site, {}, "accept:roadside_camp").ok, "accept bounty")
	check(not Social.choose(s, site, {}, "claim:roadside_camp").ok, "no premature reward")
	Social.update_quests(s, {"kills": 3})
	var wrong := _site()
	wrong.id = "elsewhere"
	check(not Social.choose(s, wrong, {"kills": 3}, "claim:roadside_camp").ok, "return to giver")
	var r := Social.choose(s, site, {"kills": 3}, "claim:roadside_camp")
	check_eq(r.effect, "quest_reward", "reward event")
	check(r.reward.gold > 0, "useful reward")
	s = JSON.parse_string(JSON.stringify(s))
	check(not Social.choose(s, site, {"kills": 3}, "claim:roadside_camp").ok, "save retains claim")
	check(s.history.size() > 0, "conversation persisted")

func test_party_limits_contracts_and_recovery() -> void:
	var s := Social.create()
	check(not Social.recruit(s, "bad", "King", "Bad").ok, "validate role")
	for i in range(10):
		check(Social.recruit(s, str(i), "Medic", "Healer " + str(i)).ok, "recruit within limits")
	check_eq(s.companions[2].assignment, "reserve", "overflow to refuge")
	check(not Social.recruit(s, "10", "Ranger", "Eleventh").ok, "reserve limit")
	check(not Social.recruit(s, "0", "Medic", "Duplicate").ok, "identity unique")
	Social.update_quests(s, {"leader": true})
	check(Social.order(s, "2", "activate").ok, "leader expands party")
	check(Social.order(s, "3", "activate").ok, "fourth active")
	check(not Social.order(s, "4", "activate").ok, "four active maximum")
	check(Social.order(s, "0", "wound").ok, "wound retains identity")
	check(not Social.order(s, "0", "activate").ok, "must recover first")
	check(Social.order(s, "0", "rest").ok, "free recovery avoids softlock")
	check(Social.order(s, "0", "activate").ok, "recovered companion returns")
	check(not Social.order(s, "0", "teleport").ok, "reject unknown orders")

func test_paid_recruit_transaction_and_personal_quest() -> void:
	var s := Social.create()
	var site := _site("human", "recruit")
	check(not Social.choose(s, site, {"gold": 0}, "recruit").ok, "insufficient fee")
	check(Social.choose(s, site, {}, "rumour").ok, "refused recruit still gives directions")
	var r := Social.choose(s, site, {"gold": 30}, "recruit")
	check_eq(r.cost, 20, "disclosed contract")
	check_eq(r.effect, "recruit", "coordinator receives cost once")
	check(not Social.choose(s, site, {"gold": 30}, "recruit").ok, "no double charge")
	var id: String = s.companions[0].personal_quest
	check(s.quests.has(id), "personal quest represented")
	check(Social.order(s, "oak", "dismiss").ok, "dismiss")
	check(not Social.recruit(s, "oak", "Vanguard", "Mara").ok, "dismissed identity preserved")

func test_dialogue_read_is_deterministic_and_bounded() -> void:
	var s := Social.create()
	for faction: String in ["human", "elf", "orc", "undead"]:
		var site := _site(faction)
		var first := Social.dialogue(s, site, {})
		check_eq(Social.dialogue(s, site, {}), first, "no reroll")
		check(first.choices.size() >= 2 and first.choices.size() <= 4, "short conversation")
	check_eq(s.history.size(), 0, "rendering does not add choices")
