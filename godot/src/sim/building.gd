class_name Building
extends RefCounted
## A placed building: a construction site until `built`. Mirrors the browser game's `Building`.

# ---- saved -----------------------------------------------------------------------------------
var id: int
var type: String
var x: int
var y: int
var w: int
var h: int
var built := false
## Builder work applied so far.
var progress := 0.0
## Materials on site (construction materials, or workshop inputs).
var delivered := {}
## Stored goods (storage buildings).
var inventory := {}
## Fields only: {crop, state wild|tilled|growing|ripe, growth, moisture}.
var field := {}
## Recipe buildings only: {recipe, progress, paused, status (transient)}.
var workshop := {}
## Orchards only: {growth, fruit, careUntil}.
var orchard := {}
var level := 1
## An upgrade under way: {to, progress, paid}, or empty.
var upgrade := {}
var placed_tick := 0
## Settler ids assigned to work here (production buildings).
var workers: Array[int] = []
## Storage only: amounts haulers keep stocked here from other stores.
var wants := {}

# ---- transient (rebuilt after loading) --------------------------------------------------------
## Materials on their way in.
var incoming := {}
## Stored goods promised to a hauler or an eater.
var reserved_out := {}


func def() -> Dictionary:
	return Defs.building(type)


func is_field() -> bool:
	return not field.is_empty()


func center_x() -> float:
	return x + w / 2.0


func center_y() -> float:
	return y + h / 2.0


## The tile in front of the door, where residents enter.
func entrance() -> Vector2i:
	return Vector2i(x + w / 2, y + h)


## A goal of standing next to the footprint.
func goal_adjacent() -> GridAStar.Goal:
	return GridAStar.Goal.new(x, y, w, h, true)


func covers(tx: int, ty: int) -> bool:
	return tx >= x and tx < x + w and ty >= y and ty < y + h


## A stat at the building's level, falling back to lower levels, then the building's own value
## (the browser game's `stat()` in levels.ts).
func stat(key: String) -> Variant:
	var d := def()
	if d.has("levels"):
		var levels: Array = d["levels"]
		for i in range(mini(level, levels.size()) - 1, -1, -1):
			var lv: Dictionary = levels[i]
			if lv.has(key):
				return lv[key]
	return d.get(key)


func storage_capacity() -> int:
	var v: Variant = stat("storage")
	return 0 if v == null else int(v)


func beds() -> int:
	if not built:
		return 0
	var v: Variant = stat("housing")
	return 0 if v == null else int(v)


func is_storage() -> bool:
	return def().has("storage")


func is_permanent_home() -> bool:
	var d := def()
	return d.has("housing") and not d.get("temporaryBeds", false)


func blocks() -> bool:
	return bool(def().get("blocks", false))
