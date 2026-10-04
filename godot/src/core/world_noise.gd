class_name WorldNoise
## Stateless hashes and value noise, bit-for-bit the same as `src/game/core/rng.ts`.
## Coordinates passed to the float functions must be floats: GDScript's `int / int` is integer
## division, which would silently change the terrain.


## Stateless integer hash of a coordinate pair, as an unsigned 32-bit value.
##
## Hot path (millions of calls per chunk), so it is written out inline: every step only needs the
## low 32 bits, so the whole hash runs on unsigned 32-bit values, and each `Math.imul(v, K)` is
## `(v_lo * K + ((v_hi * K) & 0xFFFF) << 16) & MASK` with 16-bit halves (no 64-bit overflow).
## tests/test_core.gd checks it against the browser game's values.
static func hash2(x: int, y: int, seed_value: int) -> int:
	const M := 0xFFFFFFFF
	var xu := x & M
	var yu := y & M
	var h := (seed_value + (xu & 0xFFFF) * 374761393 + ((((xu >> 16) * 374761393) & 0xFFFF) << 16) \
		+ (yu & 0xFFFF) * 668265263 + ((((yu >> 16) * 668265263) & 0xFFFF) << 16)) & M
	h ^= h >> 13
	h = ((h & 0xFFFF) * 1274126177 + ((((h >> 16) * 1274126177) & 0xFFFF) << 16)) & M
	h ^= h >> 16
	h = ((h & 0xFFFF) * 0x85ebca6b + ((((h >> 16) * 0x85ebca6b) & 0xFFFF) << 16)) & M
	return h ^ (h >> 13)


static func hash01(x: int, y: int, seed_value: int) -> float:
	return float(hash2(x, y, seed_value)) / 4294967296.0


static func _smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)


## Smooth value noise in [0, 1).
static func value_noise(x: float, y: float, seed_value: int) -> float:
	var x0 := floorf(x)
	var y0 := floorf(y)
	var fx := _smooth(x - x0)
	var fy := _smooth(y - y0)
	var ix := int(x0)
	var iy := int(y0)
	var a := hash2(ix, iy, seed_value) / 4294967296.0
	var b := hash2(ix + 1, iy, seed_value) / 4294967296.0
	var c := hash2(ix, iy + 1, seed_value) / 4294967296.0
	var d := hash2(ix + 1, iy + 1, seed_value) / 4294967296.0
	var top := a + (b - a) * fx
	var bottom := c + (d - c) * fx
	return top + (bottom - top) * fy


## Fractal value noise, normalised to roughly [0, 1].
static func fbm(x: float, y: float, seed_value: int, octaves: int = 4) -> float:
	var sum := 0.0
	var amp := 1.0
	var norm := 0.0
	var freq := 1.0
	for i in octaves:
		sum += value_noise(x * freq, y * freq, seed_value + i * 1013) * amp
		norm += amp
		amp *= 0.5
		freq *= 2.0
	return sum / norm


## FNV-1a over bytes, as used by the generator fingerprints.
static func fnv(bytes: PackedByteArray) -> int:
	var h := 2166136261
	for b in bytes:
		h = I32.ushr(I32.imul(h ^ b, 16777619), 0)
	return h
