class_name Tiles
## Terrain and object ids (stored in chunk byte arrays) and their definitions.
## The ids mirror `src/game/world/tiles.ts`; tests/test_world.gd checks them against the content
## export, so the two can never drift apart.

# Terrain ids.
const DEEP_WATER := 0
const WATER := 1
const SAND := 2
const GRASS := 3
const MEADOW := 4
const FOREST := 5
const ROCKY := 6
const ROAD := 7
const BRIDGE := 8
const STONE_BRIDGE := 9
## Generator 3+: walkable, buildable slopes.
const HILL := 10
## Generator 3+: impassable cliff faces.
const MOUNTAIN := 11

# Object ids.
const O_NONE := 0
const O_OAK := 1
const O_PINE := 2
const O_BERRY := 3
const O_BERRY_EMPTY := 4
const O_ROCK := 5
const O_BOULDER := 6
const O_STUMP := 7
const O_SAPLING := 8

## Per-terrain flags and costs, indexed by terrain id (filled from content on first use).
static var walkable := PackedByteArray()
static var buildable := PackedByteArray()
static var move_cost := PackedFloat64Array()
static var fertility := PackedFloat64Array()
## Per-object data, indexed by object id.
static var blocks := PackedByteArray()
static var start_amount := PackedByteArray()
## Resource the object yields ("" for none), work ticks per unit, and display name.
static var object_resource := PackedStringArray()
static var object_work_ticks := PackedFloat64Array()
static var object_name := PackedStringArray()
static var _loaded := false


static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	var terrain: Dictionary = Content.get_value("tiles", "TERRAIN")
	var n := terrain.size()
	walkable.resize(n)
	buildable.resize(n)
	move_cost.resize(n)
	fertility.resize(n)
	for k: String in terrain:
		var d: Dictionary = terrain[k]
		var i := int(k)
		walkable[i] = 1 if d["walkable"] else 0
		buildable[i] = 1 if d["buildable"] else 0
		move_cost[i] = float(d["moveCost"])
		fertility[i] = float(d["fertility"])
	var objects: Dictionary = Content.get_value("tiles", "OBJECTS")
	blocks.resize(objects.size())
	start_amount.resize(objects.size())
	object_resource.resize(objects.size())
	object_work_ticks.resize(objects.size())
	object_name.resize(objects.size())
	for k: String in objects:
		var d: Dictionary = objects[k]
		var i := int(k)
		blocks[i] = 1 if d["blocks"] else 0
		start_amount[i] = int(d["amount"])
		object_resource[i] = d.get("resource", "")
		object_work_ticks[i] = float(d["workTicks"])
		object_name[i] = d["name"]


static func object_def(o: int) -> Dictionary:
	var objects: Dictionary = Content.get_value("tiles", "OBJECTS")
	return objects[str(o)]


static func terrain_def(t: int) -> Dictionary:
	var terrain: Dictionary = Content.get_value("tiles", "TERRAIN")
	return terrain[str(t)]
