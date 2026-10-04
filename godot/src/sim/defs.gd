class_name Defs
## Typed shortcuts into the content tables (content/*.json) that the simulation reads often.
## Definitions are plain Dictionaries straight from the browser game's tables, so field names
## match the TypeScript (camelCase), e.g. `Defs.building("house")["cost"]`.

const DAY_TICKS := 2880
const TICKS_PER_SECOND := 10
const START_TIME := 0.26
const DUSK := 0.8
const NIGHT_START := 0.87
const MORNING := 0.21

static var _resource_ids := PackedStringArray()
static var _cost_cache := {}
static var _cost_entries_cache := {}


static func building(id: String) -> Dictionary:
	var all: Dictionary = Content.get_value("buildings", "BUILDINGS")
	assert(all.has(id), "Unknown building %s" % id)
	return all[id]


## A building type's construction cost as int counts (cached; do not modify the result).
static func cost(id: String) -> Dictionary:
	var c: Variant = _cost_cache.get(id)
	if c == null:
		c = Inv.from_json(building(id).get("cost", {}))
		_cost_cache[id] = c
	return c


## The cost as [res, n] pairs in resource order (cached; do not modify the result).
static func cost_entries(id: String) -> Array[Array]:
	var c: Variant = _cost_entries_cache.get(id)
	if c == null:
		c = Inv.entries(cost(id))
		_cost_entries_cache[id] = c
	return c


static func is_building(id: String) -> bool:
	var all: Dictionary = Content.get_value("buildings", "BUILDINGS")
	return all.has(id)


static func job(id: String) -> Dictionary:
	var all: Dictionary = Content.get_value("jobs", "JOBS")
	assert(all.has(id), "Unknown job %s" % id)
	return all[id]


static func is_job(id: String) -> bool:
	var all: Dictionary = Content.get_value("jobs", "JOBS")
	return all.has(id)


static func crop(id: String) -> Dictionary:
	var all: Dictionary = Content.get_value("crops", "CROPS")
	assert(all.has(id), "Unknown crop %s" % id)
	return all[id]


static func is_crop(id: String) -> bool:
	var all: Dictionary = Content.get_value("crops", "CROPS")
	return all.has(id)


static func resource(id: String) -> Dictionary:
	var all: Dictionary = Content.get_value("resources", "RESOURCES")
	return all[id]


## Resource ids in the browser game's order (inventories iterate in this order).
static func resource_ids() -> PackedStringArray:
	if _resource_ids.is_empty():
		_resource_ids = PackedStringArray(Content.get_value("resources", "RESOURCE_IDS") as Array)
	return _resource_ids


static func season(id: String) -> Dictionary:
	var all: Dictionary = Content.get_value("seasons", "SEASONS")
	return all[id]
