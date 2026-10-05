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

## A new player's guide (state "guided"): the valley's story told through what they do. Each step
## is one line of story, one action and something on screen to point at ("target"): a settler, the
## nearest tree or rock, the meadow for fields, the camp, or a button on the command card
## ("command:<action>" or "label:<text>"). The game keeps running; the guide never pauses it.
const GUIDE: Array[Dictionary] = [
	{"title": "The founders arrive", "story": "After weeks on the road, your people pitch their tents in a quiet valley.",
		"do": "Click one of your settlers to choose them.", "target": "settler"},
	{"title": "Many hands", "story": "There is too much to do alone.",
		"do": "Hold the left button and drag a box around several settlers.", "target": "settler"},
	{"title": "Wood for shelter", "story": "Tents will not last the winter. We need timber.",
		"do": "With settlers chosen, right-click the tree the arrow points at.", "target": "tree"},
	{"title": "Stone for hearths", "story": "A fire needs a ring of stone; a hall needs footings.",
		"do": "Choose a settler and right-click the grey rock.", "target": "rock"},
	{"title": "The first fields", "story": "The meadow by the camp is good soil.",
		"do": "Click Build, then Field, and drag across the meadow. Lay at least two.", "target": "command:build|label:Field|meadow"},
	{"title": "A roof over our heads", "story": "Families want a home of their own, not a tent.",
		"do": "Click Build, then House, and place it near the camp.", "target": "command:build|label:House"},
	{"title": "The Longhouse", "story": "With a home and fields, the camp can become a proper timber hall.",
		"do": "Click the camp, then Upgrade on the command card, to raise the Longhouse.", "target": "camp|label:Upgrade"},
	{"title": "Stores and tools", "story": "A Town Hall needs a storehouse for the harvest and a workshop for planks.",
		"do": "Build a Storehouse and a Workshop.", "target": "command:build|label:Storehouse|label:Workshop"},
	{"title": "Keep it safe", "story": "Whatever happens, the valley remembers.",
		"do": "Press F5 to save (the game also saves by itself).", "target": ""},
]

const GUIDE_OUTRO := "The valley is yours. Grow the Longhouse into a Town Hall, then a Keep and a Castle: select it to see what each step needs."

const OUTRO := "That covers the basics. Explore past the clearing, lay paths, and shape the valley however you like."


## Older saves kept the guide waiting for "Begin step"; the guide no longer pauses the game.
static func waiting(_state: Dictionary) -> bool:
	return false


static func steps(state: Dictionary) -> Array[Dictionary]:
	return GUIDE if bool(state.get("guided", false)) else STEPS


static func _guide_done(i: int, sim: Simulation, selected: int, saved: bool) -> bool:
	match i:
		0: return selected >= 1
		1: return selected >= 2
		2: return int(sim.stats.get("woodGathered", 0)) >= 6
		3: return int(sim.stats.get("stoneGathered", 0)) >= 3
		4: return _count(sim, "field", false) >= 2
		5: return _count(sim, "house", false) + _count(sim, "familyHome", false) + _count(sim, "cottage", false) >= 1
		6:
			var camp := BuildingOps.camp_of(sim)
			return camp == null or camp.type != "camp" or camp.level >= 2 or not camp.upgrade.is_empty()
		7: return _count(sim, "storehouse", false) >= 1 and _count(sim, "workshop", false) >= 1
		8: return saved
	return true


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
	if state.get("done", true):
		return false
	var guided := bool(state.get("guided", false))
	var list := steps(state)
	var i := int(state.get("step", 0))
	if i >= list.size() or (_guide_done(i, sim, selected, saved) if guided else step_done(i, sim, selected, saved)):
		state["step"] = i + 1
		state.erase("awaiting")
		if int(state["step"]) >= list.size():
			state["done"] = true
			return true
	return false
