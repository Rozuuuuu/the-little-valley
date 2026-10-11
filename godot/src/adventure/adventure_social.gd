class_name AdventureSocial
extends RefCounted
## Pure saved data. Callers persist state and apply successful effect payloads atomically.
## Costs/rewards are returned, never applied to progress. Persist both together; do not
## save between choose() and applying its effect. Replayed claims return ok=false.
## Optional progress.objectives maps objective IDs to verified bool/int evidence.
## Specific deliveries/recoveries require that evidence, never generic kill counts.

const ROLES := ["Vanguard", "Ranger", "Arcanist", "Medic", "Skirmisher"]
const SKILLS := ["Shield interpose", "Scouting shot", "Arcane pulse", "Field dressing", "Disrupting flank"]

static func create() -> Dictionary:
	var state := {"quests": {}, "companions": [], "relations": {}, "history": [], "claims": {}}
	for definition: Dictionary in quest_definitions():
		var entry := definition.duplicate(true)
		entry.merge({"status": "active" if entry.id == "first_steps" else "locked", "progress": 0, "giver_site": ""})
		state.quests[entry.id] = entry
	return state

static func quest_definitions() -> Array[Dictionary]:
	return [
		_quest("first_steps", "First Steps", "main", "Roadkeeper Iona", "Discover your first landmark.", "discoveries", 1, 10, 0),
		_quest("rumours", "Rumours of an Empty Throne", "main", "Roadkeeper Iona", "Ask a traveller or steward about the kingless village.", "rumour", 1, 10, 0),
		_quest("find_village", "Find the Kingless Village", "main", "Elder Mara", "Speak to the elder of a kingless village.", "village", 1, 20, 0),
		_quest("elder_trial", "An Elder's Trial", "main", "Elder Mara", "Resolve the nearby threat and recover village supplies; return to the elder.", "trial", 1, 50, 20),
		_quest("duty", "A Choice of Duty", "main", "Elder Mara", "Choose leadership or serve as protector. You may reconsider.", "duty", 1, 25, 0),
		_quest("home", "A Home Worth Defending", "main", "Steward Oren", "Bring supplies back to the village as ruler or protector.", "home_supplies", 1, 60, 30),
		_quest("letter", "A Letter Across the Valley", "side", "Courier Nessa", "Deliver Nessa's sealed letter to another discovered settlement, then report back.", "letter_delivered", 1, 30, 15),
		_quest("medicine", "The Lost Medicine Satchel", "side", "Healer Tamsin", "Recover Tamsin's satchel from the grove and return it.", "medicine_recovered", 1, 40, 20),
		_quest("roadside_camp", "Clear the Road", "side", "Warden Bram", "Defeat three roadside monsters after accepting, then return to Bram.", "kills", 3, 45, 25),
		_quest("watchtower", "The Silent Watchtower", "side", "Archivist Edda", "Inspect the ruined watchtower's signal tablet and report your findings.", "watchtower_inspected", 1, 40, 20),
	]

static func _quest(id: String, title: String, category: String, giver: String, objective: String, evidence: String, target: int, xp: int, gold: int) -> Dictionary:
	return {"id": id, "title": title, "category": category, "giver": giver, "objective": objective, "evidence": evidence, "target": target, "reward": {"xp": xp, "gold": gold}}

static func _relation(state: Dictionary, site: Dictionary) -> Dictionary:
	var id := str(site.get("id", ""))
	if not state.relations.has(id):
		state.relations[id] = {"speaker": str(site.get("elder", site.get("name", "Traveller"))), "faction": str(site.get("faction", "human")), "disposition": "neutral", "node": "opening", "passage": false, "alliance": false, "proof": false, "warning": false, "refused": false}
	return state.relations[id]

static func _choice(id: String, label: String) -> Dictionary:
	return {"id": id, "label": label}

static func dialogue(state: Dictionary, site: Dictionary, progress: Dictionary) -> Dictionary:
	# Rendering is read-only, including on the first encounter.
	var relation: Dictionary = state.relations.get(str(site.get("id", "")), {})
	var speaker := str(relation.get("speaker", site.get("elder", site.get("name", "Traveller"))))
	var choices: Array[Dictionary] = []
	var message := "Welcome. I can share directions, work, or news of the vacant stewardship."
	if relation.get("disposition", "neutral") == "hostile":
		message = "Our quarrel remains. Leave the border; a mediator will be needed before we talk again."
		choices = [_choice("withdraw", "Withdraw safely"), _choice("leave", "End conversation")]
	elif relation.get("warning", false):
		message = "That is a threat. Withdraw now, or explicitly choose to fight."
		choices = [_choice("withdraw", "Withdraw — avoid combat"), _choice("attack", "Force passage — begin hostilities")]
	elif relation.get("node", "") == "quests":
		message = "Choose work. Each entry names its objective; return here to claim its reward."
		for id: String in ["letter", "medicine", "roadside_camp", "watchtower"]:
			var q: Dictionary = state.quests[id]
			choices.append(_choice(("claim:" if q.status in ["active", "ready"] else "accept:") + id, str(q.title) + ": " + str(q.objective)))
	elif relation.get("node", "") == "journal":
		message = "Report completed work here. Leave when you are ready."
		for id: String in state.quests:
			var q: Dictionary = state.quests[id]
			if q.status == "ready" and q.giver_site == str(site.get("id", "")) and choices.size() < 3:
				choices.append(_choice("claim:" + id, "Claim: " + str(q.title)))
		choices.append(_choice("leave", "Return to conversation"))
		if choices.size() == 1:
			choices.push_front(_choice("rumour", "Ask for directions"))
	elif relation.get("node", "") == "services":
		message = "There is useful work here. Report finished tasks or ask for a safe route."
		choices = [_choice("quests", "Ask about local quests"), _choice("journal", "Report completed quests"), _choice("rumour", "Directions to the kingless village"), _choice("leave", "Back")]
	elif str(site.get("kind", "")) == "recruit":
		message = "%s offers a Vanguard's shield. Contract: 20 gold once, no ongoing wage; or complete the elder's trial. Full parties use refuge reserves." % speaker
		choices = [_choice("recruit", "Recruit Vanguard — 20 gold (free after trial)"), _choice("conditions", "Ask about service instead of payment"), _choice("rumour", "Ask for another contact or safe route"), _choice("decline", "Decline peacefully")]
	elif str(site.get("faction", "human")) == "elf":
		message = "Respect the grove. Complete the elder's trial or bring verified border-clearance evidence to earn our trust."
		if relation.get("proof", false):
			choices = [_choice("passage", "Request safe passage"), _choice("alliance", "Propose alliance — does not recruit anyone"), _choice("services", "Discuss local work"), _choice("threaten", "Threaten force — warning before combat")]
		else:
			choices = [_choice("passage", "Request passage peacefully"), _choice("proof", "Present verified service"), _choice("conditions", "What would earn trust?"), _choice("threaten", "Threaten force — provocative")]
	elif str(site.get("faction", "")) == "undead":
		message = "A bound sentinel bars the ruin. You can investigate the outer tablet or withdraw."
		choices = [_choice("quests", "Investigate available tasks"), _choice("withdraw", "Withdraw"), _choice("threaten", "Challenge sentinel — provocative")]
	elif bool(site.get("kingless", false)) and str(site.get("kind", "")) == "village":
		if _trial_complete(progress):
			message = "You have earned our trust. Rule here, protect us freely, or decide later."
			choices = [_choice("leadership", "Accept leadership"), _choice("protector", "Serve as protector"), _choice("decline", "Decide later"), _choice("services", "Quests and reports")]
		else:
			message = "We have no ruler. Resolve the nearby threat and recover our supplies to earn the village's trust."
			choices = [_choice("trial", "Accept the elder's trial"), _choice("rumour", "Ask for directions and an alternative route"), _choice("services", "Quests and reports"), _choice("decline", "Decline for now")]
	else:
		choices = [_choice("passage", "Request peaceful passage"), _choice("services", "Quests and directions"), _choice("decline", "Decline peacefully"), _choice("threaten", "Threaten force — provocative")]
	return {"speaker": speaker, "text": message, "choices": choices}

static func _result(ok: bool, message: String, effect: String = "") -> Dictionary:
	return {"ok": ok, "message": message, "effect": effect}

static func choose(state: Dictionary, site: Dictionary, progress: Dictionary, choice_id: String) -> Dictionary:
	if str(site.get("id", "")).is_empty():
		return _result(false, "This encounter needs a stable site ID.")
	update_quests(state, progress)
	var relation := _relation(state, site)
	var result := _choose(state, site, progress, choice_id, relation)
	state.history.append({"site": str(site.id), "speaker": relation.speaker, "choice": choice_id, "ok": result.ok, "message": result.message, "effect": result.effect})
	return result

static func _choose(state: Dictionary, site: Dictionary, progress: Dictionary, choice_id: String, relation: Dictionary) -> Dictionary:
	var id := str(site.id)
	var faction := str(site.get("faction", "human"))
	if choice_id in ["withdraw", "leave"]:
		relation.warning = false
		relation.node = "opening"
		return _result(true, "We part without further conflict. The road around the border remains open.", "withdraw")
	if relation.disposition == "hostile":
		return _result(false, "We need a mediator before negotiations can resume. Withdraw by the outer road.")
	if choice_id == "threaten":
		relation.warning = true
		return _result(true, "Withdraw now. Forcing passage will begin hostilities.", "warning")
	if choice_id == "attack":
		if not relation.warning:
			return _result(false, "No hostile escalation has been confirmed.")
		relation.warning = false
		relation.disposition = "hostile"
		relation.alliance = false
		relation.passage = false
		return _result(true, "This settlement is now hostile. Combat may begin.", "hostile")
	if relation.warning:
		return _result(false, "Withdraw or confirm the threat first.")
	if choice_id == "decline":
		relation.refused = true
		relation.node = "opening"
		return _result(true, "Your refusal is peaceful. Ask for directions, undertake service, or return later.", "refusal")
	if choice_id == "rumour":
		_mark(state, "rumours", id)
		return _result(true, "Follow the old road past the watchtower and ask the next village's steward about the vacant seat. The outer road bypasses the border.", "rumour")
	if choice_id in ["services", "quests", "journal"]:
		relation.node = choice_id
		return _result(true, "Local work and reports are available.")
	if choice_id == "conditions":
		return _result(true, "Complete the elder's threat-and-supplies trial. Wardens also accept verified border clearance; a human Vanguard accepts a 20-gold contract instead. The outer road remains free.", "condition")
	if choice_id == "proof":
		var objectives: Dictionary = progress.get("objectives", {})
		if not (_trial_complete(progress) or bool(objectives.get("border_cleared", false))):
			relation.refused = true
			return _result(false, "We need verified service, not a count of unrelated victories. Ask about conditions or use the outer road.")
		relation.proof = true
		relation.disposition = "friendly"
		return _result(true, "Your service is recognized. Passage and an alliance are now open for discussion.", "trust")
	if choice_id in ["passage", "alliance"]:
		if faction == "undead" or (faction == "elf" and not relation.proof) or (choice_id == "alliance" and not relation.proof):
			relation.refused = true
			return _result(false, "We decline peacefully. Earn trust through service, or take the outer road.")
		if relation[choice_id]:
			return _result(false, "That agreement is already in place.")
		relation[choice_id] = true
		return _result(true, "We agree to %s. No warrior has joined your party." % choice_id, choice_id)
	if choice_id == "trial":
		if not _is_elder(site):
			return _result(false, "Ask the elder of a kingless village.")
		if state.quests.elder_trial.status != "locked":
			return _result(false, "The trial is already recorded in your journal.")
		_mark(state, "find_village", id)
		state.quests.elder_trial.status = "active"
		state.quests.elder_trial.giver_site = id
		return _result(true, "Resolve the nearby threat and recover our supplies, then return here.", "trial")
	if choice_id in ["leadership", "protector"]:
		if not _is_elder(site) or not _trial_complete(progress):
			return _result(false, "First complete the elder's trial; declining never closes that path.")
		if state.quests.elder_trial.giver_site != id:
			return _result(false, "Return to the elder whose trial you accepted.")
		if state.claims.has("leadership") or (choice_id == "leadership" and bool(progress.get("leader", false))):
			return _result(false, "Leadership has already been assigned.")
		if state.claims.has(choice_id):
			return _result(false, "That duty is already recorded; leadership remains available.")
		state.claims[choice_id] = id
		_mark(state, "duty", id)
		state.quests.home.status = "active" if state.quests.home.status == "locked" else state.quests.home.status
		state.quests.home.giver_site = id
		return _result(true, "The village recognizes you as its %s." % choice_id, choice_id)
	if choice_id == "recruit":
		if str(site.get("kind", "")) != "recruit" or faction == "undead":
			return _result(false, "No willing travelling warrior is available here.")
		var cost := 0 if _trial_complete(progress) else 20
		if int(progress.get("gold", 0)) < cost:
			return _result(false, "The contract costs 20 gold once. Complete the elder's trial for free service, or ask for directions.")
		var result := recruit(state, id, "Vanguard", str(relation.speaker))
		if result.ok:
			result.cost = cost
			state.companions.back().contract.paid = cost
		return result
	if choice_id.begins_with("accept:") or choice_id.begins_with("claim:"):
		return _quest_choice(state, site, progress, choice_id)
	return _result(false, "Unknown choice. No agreement was changed.")

static func _is_elder(site: Dictionary) -> bool:
	return bool(site.get("kingless", false)) and str(site.get("kind", "")) == "village" and str(site.get("faction", "")) != "undead"

static func _trial_complete(progress: Dictionary) -> bool:
	return bool(progress.get("trial_done", false)) or (int(progress.get("kills", 0)) >= 3 and bool(progress.get("supplies", false)))

static func _mark(state: Dictionary, id: String, site_id: String) -> void:
	var q: Dictionary = state.quests[id]
	if q.status == "claimed":
		return
	q.status = "ready"
	q.progress = q.target
	q.giver_site = site_id

static func _quest_choice(state: Dictionary, site: Dictionary, progress: Dictionary, choice_id: String) -> Dictionary:
	var id := choice_id.get_slice(":", 1)
	if not state.quests.has(id):
		return _result(false, "Unknown quest.")
	var q: Dictionary = state.quests[id]
	if choice_id.begins_with("accept:"):
		if q.category != "side" or q.status != "locked" or str(site.get("faction", "")) == "undead":
			return _result(false, "That quest cannot be accepted here or is already in your journal.")
		q.status = "active"
		q.giver_site = str(site.id)
		q.baseline = int(progress.get("kills", 0)) if q.evidence == "kills" else 0
		return _result(true, str(q.giver) + ": " + str(q.objective), "quest")
	if q.status != "ready" or state.claims.has("quest:" + id):
		return _result(false, "Finish the objective before claiming; rewards are granted once.")
	if q.giver_site != str(site.id):
		return _result(false, "Return to the quest giver to claim this reward.")
	state.claims["quest:" + id] = true
	q.status = "claimed"
	var result := _result(true, str(q.giver) + ": Thank you. Your reward is ready.", "quest_reward")
	result.reward = q.reward.duplicate(true)
	result.claim_id = "quest:" + id
	if q.category == "personal":
		for companion: Dictionary in state.companions:
			if companion.personal_quest == id:
				companion.loyalty += 1
				companion.skill_variant = "Veteran " + str(companion.skill)
	return result

static func update_quests(state: Dictionary, progress: Dictionary) -> void:
	# Leadership capacity is derived from saved acknowledgement, not a world dependency.
	if bool(progress.get("leader", false)):
		state.claims["leader_capacity"] = true
	var objectives: Dictionary = progress.get("objectives", {})
	for id: String in state.quests:
		var q: Dictionary = state.quests[id]
		if q.status != "active":
			continue
		var value := 0
		match str(q.evidence):
			"discoveries": value = int(progress.get("discoveries", 0))
			"kills": value = maxi(0, int(progress.get("kills", 0)) - int(q.get("baseline", 0)))
			"trial": value = int(_trial_complete(progress))
			"home_supplies": value = int(bool(progress.get("supplies", false)))
			_: value = int(objectives.get(q.evidence, 0))
		q.progress = maxi(int(q.progress), mini(value, int(q.target)))
		if int(q.progress) >= int(q.target):
			q.status = "ready"

static func recruit(state: Dictionary, npc_id: String, role: String, name: String) -> Dictionary:
	if npc_id.strip_edges().is_empty() or name.strip_edges().is_empty() or not ROLES.has(role):
		return _result(false, "Recruitment requires a stable identity, name and supported role.")
	for companion: Dictionary in state.companions:
		if companion.id == npc_id:
			return _result(false, "This warrior is already recorded, including wounds or dismissal.")
	var assignment := "active" if _count(state, "active") < _capacity(state) else "reserve"
	if assignment == "reserve" and _count(state, "reserve") >= 8:
		return _result(false, "Party and refuge reserves are full.")
	var index := ROLES.find(role)
	var quest_id := "personal:" + npc_id
	var objectives := ["Recover my company's banner from the old battlefield.", "Find the missing scouts' trail markers.", "Retrieve my mentor's notes from the ruined observatory.", "Recover a field medicine kit for the refuge.", "Free my former patrol's trapped lookout."]
	var q := _quest(quest_id, name + "'s unfinished duty", "personal", name, objectives[index], quest_id, 1, 60, 15)
	q.merge({"status": "active", "progress": 0, "giver_site": npc_id})
	state.quests[quest_id] = q
	state.companions.append({"id": npc_id, "name": name, "role": role, "assignment": assignment, "reserve_home": "refuge", "health": "ready", "order": "follow", "stance": "defensive", "level": 1, "xp": 0, "morale": 70, "loyalty": 0, "equipment": [], "skill": SKILLS[index], "skill_variant": "", "auto_skill": true, "personal_quest": quest_id, "contract": {"paid": 0, "wage": 0, "status": "settled"}, "history": ["Joined the wandering party."]})
	state.history.append({"npc": npc_id, "choice": "recruit", "message": name + " joined as " + role})
	var result := _result(true, name + " joins the " + assignment + " roster.", "recruit")
	result.npc_id = npc_id
	result.assignment = assignment
	return result

static func _capacity(state: Dictionary) -> int:
	return 4 if state.claims.has("leadership") or state.claims.has("leader_capacity") else 2

static func _count(state: Dictionary, assignment: String) -> int:
	var count := 0
	for companion: Dictionary in state.companions:
		if companion.assignment == assignment:
			count += 1
	return count

static func order(state: Dictionary, id: String, command: String) -> Dictionary:
	for companion: Dictionary in state.companions:
		if companion.id != id:
			continue
		if companion.assignment == "dismissed":
			return _result(false, "This warrior is dismissed; their identity remains recorded.")
		var result := _result(true, companion.name + ": " + command, "order")
		match command:
			"follow", "hold", "defend", "focus", "retreat":
				if companion.assignment != "active" or companion.health != "ready":
					return _result(false, "Only healthy active companions take field orders.")
				companion.order = command
			"aggressive", "defensive", "passive": companion.stance = command
			"activate":
				if companion.assignment == "active" or companion.health != "ready" or companion.contract.status == "unpaid" or _count(state, "active") >= _capacity(state):
					return _result(false, "Activation requires recovery, a settled contract, and an open party slot.")
				companion.assignment = "active"
			"reserve":
				if companion.assignment != "reserve" and _count(state, "reserve") >= 8:
					return _result(false, "The reserve roster is full.")
				companion.assignment = "reserve"
			"wound":
				# Keep an occupied party slot if reserves are full; never lose a person.
				companion.health = "wounded"
				companion.order = "retreat"
				if _count(state, "reserve") < 8:
					companion.assignment = "reserve"
			"rest":
				if companion.health != "wounded":
					return _result(false, "No recovery is needed.")
				companion.health = "ready"
				companion.order = "follow"
			"barracks":
				if _capacity(state) < 4:
					return _result(false, "Village reassignment requires leadership.")
				companion.reserve_home = "village"
			"dismiss":
				result.equipment_return = companion.equipment.duplicate(true)
				companion.equipment.clear()
				companion.assignment = "dismissed"
				result.effect = "dismiss"
			_: return _result(false, "Unknown companion order.")
		companion.history.append(command)
		state.history.append({"npc": id, "choice": command, "message": result.message})
		return result
	return _result(false, "No companion has that identity.")
