class_name PathGrid
extends RefCounted
## What A* searches over. The simulation's grid combines terrain, objects and buildings.


## Whether a walker may stand on the tile.
func walkable(_x: int, _y: int) -> bool:
	return false


## Movement cost multiplier for entering the tile (roads are cheaper than 1).
func cost(_x: int, _y: int) -> float:
	return 1.0
