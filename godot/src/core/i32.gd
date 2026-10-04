class_name I32
## JavaScript's 32-bit integer operators on GDScript's 64-bit ints.
##
## The browser game hashes and seeds with `|0`, `>>>`, `^` and `Math.imul`, which wrap at 32 bits.
## GDScript ints are 64-bit, so every such step goes through these helpers to give the same bits.
## Values passed around are "sign-extended int32": in [-2^31, 2^31).

const MASK := 0xFFFFFFFF


## ToInt32: wraps any integer into [-2^31, 2^31), like `x | 0`.
static func to_i32(x: int) -> int:
	x &= MASK
	return x - 0x100000000 if x >= 0x80000000 else x


## `x >>> n`: the unsigned 32-bit value shifted right. `ushr(x, 0)` is `x >>> 0`.
static func ushr(x: int, n: int) -> int:
	return (x & MASK) >> n


## `Math.imul(a, b)`: the low 32 bits of the product, as int32.
## Split into 16-bit halves so no intermediate product leaves 64-bit range.
static func imul(a: int, b: int) -> int:
	var au := a & MASK
	var bu := b & MASK
	var lo := (au & 0xFFFF) * bu
	var hi := (((au >> 16) * bu) & 0xFFFF) << 16
	return to_i32(lo + hi)


## ToInt32 of a float (`f | 0`): truncates toward zero, then wraps. NaN and infinities give 0.
static func from_float(f: float) -> int:
	if is_nan(f) or is_inf(f):
		return 0
	var truncated := floorf(absf(f)) * signf(f)
	return to_i32(int(fmod(truncated, 4294967296.0)))
