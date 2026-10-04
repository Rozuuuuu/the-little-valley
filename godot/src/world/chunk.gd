class_name Chunk
extends RefCounted
## A 32×32 square of tiles stored as flat byte arrays (index = ly * SIZE + lx).
## `version` bumps when any tile changes, `terrain_version` when the ground must be repainted,
## `fog_version` when exploration changes, so presentation can cache per chunk.

const SIZE := 32
const SHIFT := 5
const MASK := SIZE - 1
const AREA := SIZE * SIZE

var cx: int
var cy: int
var terrain := PackedByteArray()
var obj := PackedByteArray()
var amt := PackedByteArray()
var explored := PackedByteArray()
## Tiles differ from what the seed generates, so the chunk is saved in full.
var modified := false
var explored_count := 0
var version := 0
var terrain_version := 0
var fog_version := 0


func _init(chunk_x: int, chunk_y: int) -> void:
	cx = chunk_x
	cy = chunk_y
	terrain.resize(AREA)
	obj.resize(AREA)
	amt.resize(AREA)
	explored.resize(AREA)
