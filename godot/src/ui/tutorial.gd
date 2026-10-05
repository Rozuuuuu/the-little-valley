class_name Tutorial
extends RefCounted
## The optional introduction (src/engine/tutorial.ts). Each step completes through an action in the
## world; the words follow this version's controls. Its state {step, done} is kept in the save
## file's top-level "tutorial", as in the browser game.

const STEPS: Array[Dictionary] = [
	{"title": "Our first clearing", "text": "Your settlers have reached the valley and pitched their first camp. Left-click a settler to select them. Their details appear below."},
	{"title": "Gather the group", "text": "Hold the left button and drag a box around several settlers to select them together."},
	{"title": "Chop some wood", "text": "With settlers selected, right-click a tree. They chop it, carry the wood back to your settlement centre and move on to nearby trees."},
	{"title": "Gather stone", "text": "Select a settler and right-click a grey rock to mine stone."},
	{"title": "Lay out fields", "text": "With nobody selected, choose Build on the command card, then Field, and drag across the meadow. Farmers till, plant and water fields by themselves."},
	{"title": "Bring in the harvest", "text": "Crops grow through several stages. Press 2 or 3 to speed up time and wait for the first harvest to reach the Town Hall."},
	{"title": "A real home", "text": "From Build…, place a House or Family Home near the hall. Visiting travellers settle for 40 food and a free bed: welcome them in the People window (F2)."},
	{"title": "Set up a workshop", "text": "Place a Workshop from Build…. Once it stands, select a settler and right-click it, or use Assign on the command card, to make them a Crafter who saws wood into planks."},
	{"title": "Keep your valley safe", "text": "The game autosaves regularly. Press F5 or use Save to save now."},
]

const OUTRO := "That covers the basics. Explore past the clearing, lay paths, and shape the valley however you like."


static func waiting(state: Dictionary) -> bool:
	return not bool(state.get("done", true)) and bool(state.get("awaiting", false))


static func _count(sim: Simulation, type: String, built_only: bool) -> int:
	var n := 0
	for b: Building in sim.buildings.values():
		if b.type == type and (b.built or not built_only):
			n += 1
	return n


## Whether step `i` is complete. `selected` is how many settlers are selected, `saved` whether the
## player has saved since the introduction began.
static func step_done(i: int, sim: Simulation, selected: int, saved: bool) -> bool:
	match i:
		0: return selected >= 1
		1: return selected >= 2
		2: return int(sim.stats.get("woodGathered", 0)) >= 6
		3: return int(sim.stats.get("stoneGathered", 0)) >= 3
		4: return _count(sim, "field", false) >= 3
		5: return int(sim.stats.get("harvested", 0)) >= 1
		6: return _count(sim, "house", true) + _count(sim, "familyHome", true) >= 1
		7: return _count(sim, "workshop", false) >= 1
		8: return saved
	return true


## Moves `state` past its current step when that step is done. Returns true when the whole
## introduction was just finished.
static func advance(state: Dictionary, sim: Simulation, selected: int, saved: bool) -> bool:
	if state.get("done", true) or waiting(state):
		return false
	var i := int(state.get("step", 0))
	if i >= STEPS.size() or step_done(i, sim, selected, saved):
		state["step"] = i + 1
		if state.get("guided", false):
			state["awaiting"] = true
		if int(state["step"]) >= STEPS.size():
			state["done"] = true
			return true
	return false
