class_name Campaign
## A new player's valley (NewGame.create_camp): the settlement centre grows one historical step at
## a time instead of jumping from tents to a fortress. The order follows how medieval settlements
## grew (settlement hierarchy: hamlet, village, town; castles began as timber keeps on a motte
## before stone):
##   Camp      tents and a campfire where the founders arrive;
##   Longhouse a chieftain's timber hall, the heart of a hamlet;
##   Town Hall a village's hall, rebuilt larger in stone and timber;
##   Keep      a fortified tower, once the valley is a village;
##   Castle    walls and towers, once it is a town.
## Each step needs the buildings that make the settlement what it is, and the milestone before it.
## Only centres marked as a campaign's (extra.foundingCamp) use this; older valleys and the
## browser-parity fixtures keep the browser game's levels.

const CAMP_LEVELS: Array[Dictionary] = [
	{"name": "Camp", "cost": {}, "time": 0, "perks": []},
	{"name": "Longhouse", "cost": {"wood": 30, "stone": 6}, "time": 900,
		"perks": ["A timber hall for the founders: beds for 8, holds 400 goods", "Its fire lights and watches further"],
		"housing": 8, "storage": 400, "reveal": 15},
	{"name": "Town Hall", "cost": {"wood": 40, "stone": 30, "planks": 10}, "time": 1200, "requires": "hamlet",
		"perks": ["Rebuilt in place as a Town Hall: bunks for 10, holds 600 goods", "Can later become a Keep and a Castle"],
		"becomes": "townHall"},
]

## What each step needs built first: [list of types (any one counts), how many, label].
const NEEDS := {
	"Longhouse": [[["house", "familyHome", "cottage"], 1, "a home"], [["field"], 2, "fields"]],
	"Town Hall": [[["house", "familyHome", "cottage"], 2, "homes"], [["storehouse"], 1, "a storehouse"], [["workshop"], 1, "a workshop"], [["field"], 3, "fields"]],
	"Keep": [[["well"], 1, "a well"], [["mill", "bakery"], 1, "a mill or bakery"], [["house", "familyHome", "cottage"], 4, "homes"]],
	"Castle": [[["forge", "smelter"], 1, "a forge or smelter"], [["barracks", "archeryRange"], 1, "a barracks or archery range"], [["market", "inn"], 1, "a market or inn"]],
}

## The milestone each step of the Town Hall needs in a campaign (one stage later than the
## browser game's, so the hall does not jump straight to a keep).
const HALL_REQUIRES := {"Keep": "village", "Castle": "town"}


static func is_campaign(b: Building) -> bool:
	return bool(b.extra.get("foundingCamp", false))


static func levels(b: Building) -> Array:
	if not is_campaign(b):
		return b.def().get("levels", [])
	if b.type == "camp":
		return CAMP_LEVELS
	var lv: Array = (b.def().get("levels", []) as Array).duplicate(true)
	for d: Dictionary in lv:
		if HALL_REQUIRES.has(str(d.get("name", ""))):
			d["requires"] = HALL_REQUIRES[str(d["name"])]
	return lv


## What is still missing before the next step (e.g. "2 homes (1/2), a storehouse"), or "".
static func missing(sim: Simulation, b: Building, next_name: String) -> String:
	if not is_campaign(b) or not NEEDS.has(next_name):
		return ""
	var parts: PackedStringArray = []
	for need: Array in NEEDS[next_name]:
		var types: Array = need[0]
		var want := int(need[1])
		var have := 0
		for other: Building in sim.buildings.values():
			if other.built and other.id != b.id and types.has("field" if other.is_field() else other.type):
				have += 1
		if have < want:
			parts.append(str(need[2]) if want == 1 else "%d %s (%d/%d)" % [want, need[2], have, want])
	return ", ".join(parts)


## The whole road for the story and the help: "Camp > Longhouse > Town Hall > Keep > Castle".
static func road() -> String:
	return "Camp > Longhouse > Town Hall > Keep > Castle"
