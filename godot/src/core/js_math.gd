class_name JsMath
## JavaScript Math functions whose results can differ in the last bit between engines.
## World generation compares against thresholds, so one bit can change a tile. These reproduce
## V8 (the engine the browser game was fingerprinted on) exactly; tests/test_core.gd checks them
## against golden values exported from the browser game.
##
## Measured on Godot 4.7.2 / Windows: the engine's own `sin` differed from V8 in the last bit for
## 90 of 2,574 generator arguments, so `sin_js` is a port of fdlibm (which V8 uses), not `sin`.



## A double from its IEEE-754 bits (16 hex digits, big-endian).
## Exact constants must be written this way: measured on Godot 4.7.2, GDScript reads long decimal
## literals inexactly (0.636619772367581382433 came out one bit high). tests/test_core.gd rejects
## decimal literals with more than 15 significant digits anywhere under res://src.
static func from_bits(hex: String) -> float:
	var bytes := hex.hex_decode()
	bytes.reverse()
	return bytes.decode_double(0)


## `Math.hypot(a, b)` as V8 computes it: normalise by the larger value, Kahan-sum the squares.
## A plain `sqrt(a*a + b*b)` rounds differently.
static func hypot(a: float, b: float) -> float:
	var x := absf(a)
	var y := absf(b)
	if is_inf(x) or is_inf(y):
		return INF
	if is_nan(x) or is_nan(y):
		return NAN
	var m := maxf(x, y)
	if m == 0.0:
		return 0.0
	var n := x / m
	var summand := n * n
	var sum := summand
	var comp := (sum - 0.0) - summand
	n = y / m
	summand = n * n - comp
	sum = sum + summand
	return sqrt(sum) * m


## JS `Math.round`: halves round toward +infinity (GDScript's `round` rounds them away from zero).
static func round_js(x: float) -> float:
	return floorf(x + 0.5)


# ---- fdlibm sin (as in V8's base/ieee754.cc) -----------------------------------------------
# Constants are fdlibm's, given by their bits (see `from_bits`).

## The high 32 bits of a double (sign, exponent, top of the mantissa), as a signed int32.
## Uses its own buffer, so world generation can run on worker threads.
static func _high_word(x: float) -> int:
	var buf := PackedByteArray()
	buf.resize(8)
	buf.encode_double(0, x)
	return buf.decode_s32(4)


## A double from a high word and a zero low word.
static func _from_high_word(hi: int) -> float:
	var buf := PackedByteArray()
	buf.resize(8)
	buf.encode_u32(4, hi & 0xFFFFFFFF)
	return buf.decode_double(0)


static var _S1 := from_bits("bfc5555555555549")
static var _S2 := from_bits("3f8111111110f8a6")
static var _S3 := from_bits("bf2a01a019c161d5")
static var _S4 := from_bits("3ec71de357b1fe7d")
static var _S5 := from_bits("be5ae5e68a2b9ceb")
static var _S6 := from_bits("3de5d93a5acfd57c")

static var _C1 := from_bits("3fa555555555554c")
static var _C2 := from_bits("bf56c16c16c15177")
static var _C3 := from_bits("3efa01a019cb1590")
static var _C4 := from_bits("be927e4f809c52ad")
static var _C5 := from_bits("3e21ee9ebdb4b1c4")
static var _C6 := from_bits("bda8fae9be8838d4")

static var _INVPIO2 := from_bits("3fe45f306dc9c883")
static var _PIO2_1 := from_bits("3ff921fb54400000")
static var _PIO2_1T := from_bits("3dd0b4611a626331")
static var _PIO2_2 := from_bits("3dd0b4611a600000")
static var _PIO2_2T := from_bits("3ba3198a2e037073")
static var _PIO2_3 := from_bits("3ba3198a2e000000")
static var _PIO2_3T := from_bits("397b839a252049c1")

const _NPIO2_HW: Array[int] = [
	0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
	0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
	0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
	0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
]


## `Math.sin` exactly as V8 computes it. Arguments beyond about 823,550 (2^19·π/2) would need
## fdlibm's large-argument reduction; the generators never get there (they divide tile
## coordinates by 21 or more), so those fall back to the engine's `sin` with an error logged.
static func sin_js(x: float) -> float:
	var ix := _high_word(x) & 0x7FFFFFFF
	if ix <= 0x3FE921FB:
		return _kernel_sin(x, 0.0, 0)
	if ix >= 0x7FF00000:
		return x - x
	var y := PackedFloat64Array([0.0, 0.0])
	var n := _rem_pio2(x, y)
	match n & 3:
		0:
			return _kernel_sin(y[0], y[1], 1)
		1:
			return _kernel_cos(y[0], y[1])
		2:
			return -_kernel_sin(y[0], y[1], 1)
		_:
			return -_kernel_cos(y[0], y[1])


## `Math.cos` exactly as V8 computes it (fdlibm), with the same argument range as sin_js.
static func cos_js(x: float) -> float:
	var ix := _high_word(x) & 0x7FFFFFFF
	if ix <= 0x3FE921FB:
		return _kernel_cos(x, 0.0)
	if ix >= 0x7FF00000:
		return x - x
	var y := PackedFloat64Array([0.0, 0.0])
	var n := _rem_pio2(x, y)
	match n & 3:
		0:
			return _kernel_cos(y[0], y[1])
		1:
			return -_kernel_sin(y[0], y[1], 1)
		2:
			return -_kernel_cos(y[0], y[1])
		_:
			return _kernel_sin(y[0], y[1], 1)


static func _kernel_sin(x: float, y: float, iy: int) -> float:
	var ix := _high_word(x) & 0x7FFFFFFF
	if ix < 0x3E400000 and int(x) == 0:
		return x
	var z := x * x
	var v := z * x
	var r := _S2 + z * (_S3 + z * (_S4 + z * (_S5 + z * _S6)))
	if iy == 0:
		return x + v * (_S1 + z * r)
	return x - ((z * (0.5 * y - v * r) - y) - v * _S1)


static func _kernel_cos(x: float, y: float) -> float:
	var ix := _high_word(x) & 0x7FFFFFFF
	if ix < 0x3E400000 and int(x) == 0:
		return 1.0
	var z := x * x
	var r := z * (_C1 + z * (_C2 + z * (_C3 + z * (_C4 + z * (_C5 + z * _C6)))))
	if ix < 0x3FD33333:
		return 1.0 - (0.5 * z - (z * r - x * y))
	var qx: float
	if ix > 0x3FE90000:
		qx = 0.28125
	else:
		qx = _from_high_word(ix - 0x00200000)
	var hz := 0.5 * z - qx
	var a := 1.0 - qx
	return a - (hz - (z * r - x * y))


## Reduces x to y[0] + y[1] in [-π/4, π/4] and returns the quadrant count n.
static func _rem_pio2(x: float, y: PackedFloat64Array) -> int:
	var hx := _high_word(x)
	var ix := hx & 0x7FFFFFFF
	var z: float
	if ix < 0x4002D97C:
		if hx > 0:
			z = x - _PIO2_1
			if ix != 0x3FF921FB:
				y[0] = z - _PIO2_1T
				y[1] = (z - y[0]) - _PIO2_1T
			else:
				z -= _PIO2_2
				y[0] = z - _PIO2_2T
				y[1] = (z - y[0]) - _PIO2_2T
			return 1
		z = x + _PIO2_1
		if ix != 0x3FF921FB:
			y[0] = z + _PIO2_1T
			y[1] = (z - y[0]) + _PIO2_1T
		else:
			z += _PIO2_2
			y[0] = z + _PIO2_2T
			y[1] = (z - y[0]) + _PIO2_2T
		return -1
	if ix > 0x413921FB:
		push_error("JsMath.sin_js: argument %s is beyond the exact range; using the engine's sin" % str(x))
		var s := sin(x)
		y[0] = asin(s)
		y[1] = 0.0
		return 0
	var t := absf(x)
	var n := int(t * _INVPIO2 + 0.5)
	var fn := float(n)
	var r := t - fn * _PIO2_1
	var w := fn * _PIO2_1T
	if n < 32 and ix != _NPIO2_HW[n - 1]:
		y[0] = r - w
	else:
		var j := ix >> 20
		y[0] = r - w
		var i := j - ((_high_word(y[0]) >> 20) & 0x7FF)
		if i > 16:
			t = r
			w = fn * _PIO2_2
			r = t - w
			w = fn * _PIO2_2T - ((t - r) - w)
			y[0] = r - w
			i = j - ((_high_word(y[0]) >> 20) & 0x7FF)
			if i > 49:
				t = r
				w = fn * _PIO2_3
				r = t - w
				w = fn * _PIO2_3T - ((t - r) - w)
				y[0] = r - w
	y[1] = (r - y[0]) - w
	if hx < 0:
		y[0] = -y[0]
		y[1] = -y[1]
		return -n
	return n
