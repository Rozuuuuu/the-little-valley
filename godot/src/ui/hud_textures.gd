class_name HudTextures
## The browser game's HUD textures (src/ui/hudTextures.ts), painted the same way, pixel for pixel:
## - dirt: the inside of every box, a flat warm brown with small scuff marks (16×16 tile);
## - the grass frame round every box: tufts along the top, turf at the sides with little tufts
##   poking out, a hem below (48×48; slices top 14, sides 6, bottom 6);
## - the grass edge: a strip of blades along the top of the bottom console (48×8);
## - the arrow pointer (drawn at 2×).

const FRAME_TOP := 14
const FRAME_SIDE := 6
const FRAME_BOTTOM := 6
const FRAME_SIZE := 48
const DIRT_BASE := "#7c5230"
const DIRT_DARK := "#684427"
const DIRT_LIGHT := "#8f6039"
const DASHES := [[2, 2], [10, 1], [6, 7], [13, 9], [1, 11], [9, 13]]
## Root, dark, mid, lit, tip greens.
const GR_ROOT := "#143614"
const GR_DARK := "#1d4a1b"
const GR_MID := "#2a6323"
const GR_LIT := "#387a2b"
const GR_TIP := "#4f9636"

static var _marks := {}


## hash() from hudTextures.ts. JavaScript multiplies these in doubles (not Math.imul): the sum is
## exact, but (h ^ h >>> 13) * 1274126177 can exceed 2^53 and is rounded before `^` truncates
## it to 32 bits, so that rounding is reproduced here.
static func _hash(x: int, y: int, seed: int) -> float:
	var h := _i32(x * 374761393 + y * 668265263 + seed * 2147483647)
	h = _js_mul_i32(h ^ _ushr(h, 13), 1274126177)
	return float(_ushr(h ^ _ushr(h, 16), 0)) / 4294967296.0


## ToInt32(a * b) where the product is a JavaScript double (rounded to 53 bits, ties to even).
static func _js_mul_i32(a: int, b: int) -> int:
	var p := a * b
	var mag := absi(p)
	if mag >= 1 << 53:
		var bits := 0
		var t := mag
		while t > 0:
			t >>= 1
			bits += 1
		var shift := bits - 53
		var q := mag >> shift
		var rem := mag - (q << shift)
		var half := 1 << (shift - 1)
		if rem > half or (rem == half and (q & 1) == 1):
			q += 1
		mag = q << shift
		p = mag if p > 0 else -mag
	return _i32(p)


static func _i32(v: int) -> int:
	v = v & 0xFFFFFFFF
	return v - 0x100000000 if v >= 0x80000000 else v


static func _ushr(v: int, n: int) -> int:
	return (v & 0xFFFFFFFF) >> n


static func _loam(x: int, y: int) -> Color:
	if _marks.is_empty():
		for d: Array in DASHES:
			var dx: int = d[0]
			var dy: int = d[1]
			_marks[dy * 16 + dx] = DIRT_DARK
			_marks[dy * 16 + ((dx + 1) & 15)] = DIRT_DARK
			_marks[((dy + 1) & 15) * 16 + ((dx + 1) & 15)] = DIRT_LIGHT
	return Color(str(_marks.get((y & 15) * 16 + (x & 15), DIRT_BASE)))


static func dirt_tile() -> Image:
	var im := Image.create(16, 16, false, Image.FORMAT_RGBA8)
	for y in 16:
		for x in 16:
			im.set_pixel(x, y, _loam(x, y))
	return im


static func _blade_color(i: int, h: int, lit: bool) -> String:
	if i == 0:
		return GR_ROOT
	if i == h - 1 and h >= 5:
		return GR_TIP if lit else GR_LIT
	if i >= h / 2.0:
		return GR_LIT if lit else GR_MID
	return GR_DARK


static func _px(im: Image, x: int, y: int, col: String) -> void:
	if x >= 0 and y >= 0 and x < im.get_width() and y < im.get_height():
		im.set_pixel(x, y, Color(col))


static func _paint_tufts(im: Image, width: int, base: int, max_h: int, seed: int) -> void:
	for x in width:
		var h := 2 if _hash(x, 1, seed) > 0.5 else 1
		for i in h:
			_px(im, x, base - 1 - i, GR_ROOT if i == 0 else GR_DARK)
	var x := floori(_hash(0, 2, seed) * 3.0)
	while x < width + 2:
		var tall := mini(max_h, 4 + floori(_hash(x, 3, seed) * (max_h - 3)))
		var side := maxi(2, tall - 2 - floori(_hash(x, 4, seed) * 2.0))
		for b: Array in [[x - 1, side, -1, true], [x + 1, side, 1, false], [x, tall, 0, true]]:
			var bx: int = b[0]
			var bh: int = b[1]
			var lean: int = b[2]
			for i in bh:
				var px := (((bx + (lean if i >= bh - 2 else 0)) % width) + width) % width
				_px(im, px, base - 1 - i, _blade_color(i, bh, b[3]))
		x += 4 + floori(_hash(x, 5, seed) * 4.0)


static func grass_frame() -> Image:
	var s := FRAME_SIZE
	var im := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var t0 := FRAME_TOP - 5
	for y in range(t0 + 3, s - 3):
		for x in range(3, s - 3):
			im.set_pixel(x, y, _loam(x, y))
	for y in range(t0, s):
		for x in s:
			if y < t0 + 3 or x < 3 or x >= s - 3 or y >= s - 3:
				var r := _hash(x, y, 41)
				_px(im, x, y, GR_LIT if r > 0.8 else (GR_DARK if r < 0.25 else GR_MID))
	for x in s:
		_px(im, x, t0 + 2, GR_DARK)
		var drip := 1 + floori(_hash(x, 7, 44) * 2.0) if _hash(x, 0, 43) > 0.6 else 0
		for d in drip:
			_px(im, x, t0 + 3 + d, GR_ROOT if d == drip - 1 else GR_DARK)
	for y in range(t0 + 3, s - 3):
		_px(im, 2, y, GR_DARK)
		_px(im, s - 3, y, GR_DARK)
	_paint_tufts(im, s, t0, t0, 47)
	var y := t0 + 2
	while y < s - 2:
		_px(im, 0, y, GR_LIT)
		_px(im, 0, y + 1, GR_MID)
		_px(im, s - 1, y + 1, GR_MID)
		_px(im, s - 1, y + 2, GR_DARK)
		y += 3 + floori(_hash(0, y, 81) * 3.0)
	for x in range(1, s - 1):
		if _hash(x, s, 85) > 0.72:
			_px(im, x, s - 1, GR_DARK)
	return im


static func grass_edge() -> Image:
	var w := 48
	var h := 8
	var im := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for x in w:
		_px(im, x, h - 1, GR_MID)
	_paint_tufts(im, w, h - 1, h - 1, 101)
	return im


const ARROW := ["X", "XX", "XGX", "XG.X", "XG..X", "XG...X", "XG....X", "XG.....X", "XG......X", "XG.......X",
	"XG....XXXXX", "XG.X..X", "XGXX..X", "XX  X..X", "X   X..X", "     XX"]


static func cursor_arrow() -> Image:
	var im := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	var cols := {"X": "#1a1208", ".": "#fffaf0", "G": "#f4cf5a"}
	for y in ARROW.size():
		var row: String = ARROW[y]
		for x in row.length():
			if cols.has(row[x]):
				im.fill_rect(Rect2i(x * 2, y * 2, 2, 2), Color(str(cols[row[x]])))
	return im


## A box's style: the grass frame (at `scale`) with the dirt tiling inside, as the browser's
## border-image plus dirt background. The texture is the frame's border slices round one dirt
## tile, so the middle tiles seamlessly.
static func panel_style(scale: int = 2) -> StyleBoxTexture:
	var frame := grass_frame()
	var s := FRAME_SIZE
	var w := FRAME_SIDE * 2 + 16
	var h := FRAME_TOP + FRAME_BOTTOM + 16
	var im := Image.create(w, h, false, Image.FORMAT_RGBA8)
	# Corners and edges from the frame; the edges take a 16 px run so they tile like the middle.
	im.blit_rect(frame, Rect2i(0, 0, FRAME_SIDE, FRAME_TOP), Vector2i(0, 0))
	im.blit_rect(frame, Rect2i(s - FRAME_SIDE, 0, FRAME_SIDE, FRAME_TOP), Vector2i(w - FRAME_SIDE, 0))
	im.blit_rect(frame, Rect2i(0, s - FRAME_BOTTOM, FRAME_SIDE, FRAME_BOTTOM), Vector2i(0, h - FRAME_BOTTOM))
	im.blit_rect(frame, Rect2i(s - FRAME_SIDE, s - FRAME_BOTTOM, FRAME_SIDE, FRAME_BOTTOM), Vector2i(w - FRAME_SIDE, h - FRAME_BOTTOM))
	im.blit_rect(frame, Rect2i(FRAME_SIDE, 0, 16, FRAME_TOP), Vector2i(FRAME_SIDE, 0))
	im.blit_rect(frame, Rect2i(FRAME_SIDE, s - FRAME_BOTTOM, 16, FRAME_BOTTOM), Vector2i(FRAME_SIDE, h - FRAME_BOTTOM))
	im.blit_rect(frame, Rect2i(0, FRAME_TOP, FRAME_SIDE, 16), Vector2i(0, FRAME_TOP))
	im.blit_rect(frame, Rect2i(s - FRAME_SIDE, FRAME_TOP, FRAME_SIDE, 16), Vector2i(w - FRAME_SIDE, FRAME_TOP))
	im.blit_rect(dirt_tile(), Rect2i(0, 0, 16, 16), Vector2i(FRAME_SIDE, FRAME_TOP))
	im.resize(w * scale, h * scale, Image.INTERPOLATE_NEAREST)
	var sb := StyleBoxTexture.new()
	sb.texture = ImageTexture.create_from_image(im)
	sb.texture_margin_left = FRAME_SIDE * scale
	sb.texture_margin_right = FRAME_SIDE * scale
	sb.texture_margin_top = FRAME_TOP * scale
	sb.texture_margin_bottom = FRAME_BOTTOM * scale
	sb.axis_stretch_horizontal = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	sb.axis_stretch_vertical = StyleBoxTexture.AXIS_STRETCH_MODE_TILE
	sb.content_margin_left = FRAME_SIDE * scale + 4
	sb.content_margin_right = FRAME_SIDE * scale + 4
	sb.content_margin_top = FRAME_TOP * scale + 2
	sb.content_margin_bottom = FRAME_BOTTOM * scale + 2
	return sb


static func texture(im: Image, scale: int = 1) -> ImageTexture:
	if scale != 1:
		im.resize(im.get_width() * scale, im.get_height() * scale, Image.INTERPOLATE_NEAREST)
	return ImageTexture.create_from_image(im)
