class_name HabitatDef
extends RefCounted
## One habitat's generation parameters, read from content/habitats.json into typed fields so the
## generator's inner loops avoid dictionary lookups.

var id: String
var range_distance: float
var range_core: float
var peak_above: float
var hill_above: float
var peak_min_distance: float
var forest_above: float
var meadow_below: float
var grass_trees: float
var lake_below: float
var ponds: float
var rocky_above: float
var river: bool

static var _cache := {}


static func of(habitat_id: String) -> HabitatDef:
	if _cache.has(habitat_id):
		return _cache[habitat_id]
	var all: Dictionary = Content.get_value("habitats", "HABITATS")
	assert(all.has(habitat_id), "Unknown habitat %s" % habitat_id)
	var d: Dictionary = all[habitat_id]
	var h := HabitatDef.new()
	h.id = habitat_id
	h.range_distance = float(d["rangeDistance"])
	h.range_core = float(d["rangeCore"])
	h.peak_above = float(d["peakAbove"])
	h.hill_above = float(d["hillAbove"])
	h.peak_min_distance = float(d["peakMinDistance"])
	h.forest_above = float(d["forestAbove"])
	h.meadow_below = float(d["meadowBelow"])
	h.grass_trees = float(d["grassTrees"])
	h.lake_below = float(d["lakeBelow"])
	h.ponds = float(d["ponds"])
	h.rocky_above = float(d["rockyAbove"])
	h.river = bool(d["river"])
	_cache[habitat_id] = h
	return h


static func ids() -> PackedStringArray:
	var all: Dictionary = Content.get_value("habitats", "HABITATS")
	return PackedStringArray(all.keys())
