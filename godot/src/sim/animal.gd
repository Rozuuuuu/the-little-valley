class_name Animal
extends RefCounted
## A wild or penned animal (`Animal` in src/game/sim/types.ts): a light entity, not a settler.

# ---- saved -----------------------------------------------------------------------------------
var id: int
var species: String
var x: float
var y: float
## Wild animals roam around this tile.
var home_x: int
var home_y: int
## 2 = left, 3 = right.
var facing := 3
## The pen it lives in, or -1 for wild animals.
var pen_id := -1
## Health; -1 means full (the species' own hp).
var hp := -1.0

# ---- transient -------------------------------------------------------------------------------
var px: float
var py: float
## Start and end of the last completed tick, for drawing (as Settler).
var rpx: float
var rpy: float
var rx: float
var ry: float
var tx: float
var ty: float
var moving := false
var flee := false
var timer := 0
## The hunter stalking it (-1: none). Hunts are re-planned after loading.
var hunted_by := -1
## Tick of the last blow it took, for the hit flash.
var hit_at := -1000000


func def() -> Dictionary:
	return Animals.species(species)


func health() -> float:
	return hp if hp >= 0.0 else float(def()["hp"])
