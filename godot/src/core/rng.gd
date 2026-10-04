class_name Rng
extends RefCounted
## Deterministic PRNG (mulberry32), bit-for-bit the same as `src/game/core/rng.ts`.
## State is a single int32, so it saves trivially.

var state: int


func _init(seed_state: int) -> void:
	state = I32.to_i32(seed_state)


## Uniform float in [0, 1).
func next() -> float:
	state = I32.to_i32(state + 0x6d2b79f5)
	var t := state
	t = I32.imul(t ^ I32.ushr(t, 15), t | 1)
	t = I32.to_i32(t ^ I32.to_i32(t + I32.imul(t ^ I32.ushr(t, 7), t | 61)))
	return float(I32.ushr(t ^ I32.ushr(t, 14), 0)) / 4294967296.0


## Integer in [0, n).
func int_below(n: int) -> int:
	return int(floorf(next() * n))


func range_f(a: float, b: float) -> float:
	return a + next() * (b - a)


func pick(arr: Array) -> Variant:
	return arr[int_below(arr.size())]


func chance(p: float) -> bool:
	return next() < p
