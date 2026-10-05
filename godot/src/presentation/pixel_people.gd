class_name PixelPeople
extends RefCounted
## Settler sprite sheets in the browser game's pixel style: a port of src/render/sprites/
## characters.ts (drawFront, drawSide, the 13 poses and the outline), painting into an Image.
## Each appearance gets one sheet, made the first time it is needed and cached: 4 facings
## (down, up, left, right) x 13 poses of 18x22 art pixels. Right is the left view mirrored.

const FW := 18
const FH := 22
const AX := 9
const AY := 20
const FRAME_COUNT := 13
## Frame starts, as in the browser: idle 0-1, walk 2-5, carry 6-9, work 10-11, sleep 12.
const FRAME := {"idle": 0, "walk": 2, "carry": 6, "work": 10, "sleep": 12}

# The browser palette (src/render/palette.ts).
const SKIN := ["#f3cfa6", "#e0aa7e", "#b87a52", "#7c4e35"]
const SKIN_SHADE := ["#dcae84", "#c48c62", "#9a6242", "#613b28"]
const HAIR := ["#3a2820", "#7a4a2a", "#d9a441", "#b0472a", "#2e2e3e", "#e6dcc6"]
const SHIRT := ["#c9544b", "#4f7fb8", "#5f9e52", "#d9a441", "#8e62b0", "#df8446"]
const SHIRT_DARK := ["#9a3a36", "#3a5f8c", "#44773c", "#a87b2c", "#6a4686", "#aa5f2c"]
const PANTS := ["#4a4a6a", "#5a4636", "#3d5a5a"]
const SHOE := "#3b2a22"
const BLUSH := "#e79a8a"
const OUTLINE := "#2b2033"
const BELT_BUCKLE := "#d8b048"

## {leg, bob, arms, closed}
const POSES := [
	[0, 0, "swing", false], [0, 1, "swing", false],
	[0, 0, "swing", false], [1, 1, "swing", false], [2, 0, "swing", false], [3, 1, "swing", false],
	[0, 0, "up", false], [1, 1, "up", false], [2, 0, "up", false], [3, 1, "up", false],
	[0, 0, "up", false], [0, 1, "forward", false],
	[0, 0, "swing", true],
]

## appearance key -> ImageTexture sheet (FW*13 x FH*4).
var _sheets := {}


static func key_of(a: Dictionary) -> String:
	return "%d%d%d%d%d" % [int(a.get("skin", 0)), int(a.get("hair", 0)), int(a.get("hairStyle", 0)), int(a.get("shirt", 0)), int(a.get("pants", 0))]


## The sheet for an appearance; region of (facing, frame) is Rect2(frame * FW, facing * FH, FW, FH).
func sheet(a: Dictionary) -> ImageTexture:
	var k := key_of(a)
	var t: ImageTexture = _sheets.get(k)
	if t == null:
		t = ImageTexture.create_from_image(paint_sheet(a))
		_sheets[k] = t
	return t


static func paint_sheet(a: Dictionary) -> Image:
	var look := _look(a)
	var img := Image.create(FW * FRAME_COUNT, FH * 4, false, Image.FORMAT_RGBA8)
	for f in FRAME_COUNT:
		for dir in 3:
			var p := Image.create(FW, FH, false, Image.FORMAT_RGBA8)
			var pose: Array = POSES[f]
			if dir == 2:
				_draw_side(p, look, pose)
			else:
				_draw_front(p, look, pose, dir == 1)
			_outline(p, Color(OUTLINE))
			img.blit_rect(p, Rect2i(0, 0, FW, FH), Vector2i(f * FW, dir * FH))
			if dir == 2:
				p.flip_x()
				img.blit_rect(p, Rect2i(0, 0, FW, FH), Vector2i(f * FW, 3 * FH))
	return img


static func _look(a: Dictionary) -> Dictionary:
	var skin := int(a.get("skin", 0))
	var shirt := int(a.get("shirt", 0))
	return {
		"skin": Color(SKIN[skin % SKIN.size()]), "skinShade": Color(SKIN_SHADE[skin % SKIN_SHADE.size()]),
		"hair": Color(HAIR[int(a.get("hair", 0)) % HAIR.size()]),
		"shirt": Color(SHIRT[shirt % SHIRT.size()]), "shirtDark": Color(SHIRT_DARK[shirt % SHIRT_DARK.size()]),
		"pants": Color(PANTS[int(a.get("pants", 0)) % PANTS.size()]), "style": int(a.get("hairStyle", 0)) % 3,
	}


# ---- the browser's Painter, on an Image (origin offset (1, 3) as in makeSettlerSheet) --------

const OX := 1
const OY := 3


static func _px(p: Image, x: int, y: int, c: Color) -> void:
	var xx := x + OX
	var yy := y + OY
	if xx >= 0 and yy >= 0 and xx < FW and yy < FH:
		p.set_pixel(xx, yy, c)


static func _rect(p: Image, x: int, y: int, w: int, h: int, c: Color) -> void:
	for yy in range(y, y + h):
		for xx in range(x, x + w):
			_px(p, xx, yy, c)


static func _hline(p: Image, x0: int, x1: int, y: int, c: Color) -> void:
	_rect(p, mini(x0, x1), y, absi(x1 - x0) + 1, 1, c)


static func _vline(p: Image, x: int, y0: int, y1: int, c: Color) -> void:
	_rect(p, x, mini(y0, y1), 1, absi(y1 - y0) + 1, c)


## The browser's light(): a tint toward white by k (rounded per channel as it does).
static func _light(c: Color, k: float = 0.3) -> Color:
	var f := func(v: float) -> float: return minf(255.0, roundf(v * 255.0 + (255.0 - v * 255.0) * k)) / 255.0
	return Color(f.call(c.r), f.call(c.g), f.call(c.b))


static func _dark(c: Color, k: float = 0.3) -> Color:
	var f := func(v: float) -> float: return roundf(v * 255.0 * (1.0 - k)) / 255.0
	return Color(f.call(c.r), f.call(c.g), f.call(c.b))


## A 1px outline around every opaque pixel (alpha > 40/255), as Painter.outline().
static func _outline(p: Image, color: Color) -> void:
	var solid := PackedByteArray()
	solid.resize(FW * FH)
	for y in FH:
		for x in FW:
			solid[y * FW + x] = 1 if p.get_pixel(x, y).a > 40.0 / 255.0 else 0
	for y in FH:
		for x in FW:
			var i := y * FW + x
			if solid[i] == 1:
				continue
			if (x > 0 and solid[i - 1] == 1) or (x < FW - 1 and solid[i + 1] == 1) or (y > 0 and solid[i - FW] == 1) or (y < FH - 1 and solid[i + FW] == 1):
				p.set_pixel(x, y, color)


# ---- drawFront / drawSide (characters.ts) ---------------------------------------------------

static func _draw_front(p: Image, l: Dictionary, pose: Array, back: bool) -> void:
	var leg: int = pose[0]
	var b: int = pose[1]
	var arms: String = pose[2]
	var closed: bool = pose[3]
	var l_up := 1 if leg == 1 else 0
	var r_up := 1 if leg == 3 else 0
	_rect(p, 6, 13, 2, 3 - l_up, l["pants"])
	_rect(p, 8, 13, 2, 3 - r_up, l["pants"])
	_hline(p, 6, 7, 16 - l_up, Color(SHOE))
	_hline(p, 8, 9, 16 - r_up, Color(SHOE))
	_rect(p, 5, 8 + b, 6, 5, l["shirt"])
	_vline(p, 10, 8 + b, 12 + b, l["shirtDark"])
	_hline(p, 5, 10, 12 + b, l["shirtDark"])
	_vline(p, 5, 8 + b, 10 + b, _light(l["shirt"]))
	_hline(p, 5, 10, 11 + b, _dark(l["pants"], 0.35))
	if not back:
		_px(p, 8, 11 + b, Color(BELT_BUCKLE))
	if arms == "up":
		_rect(p, 4, 5 + b, 1, 4, l["shirt"])
		_rect(p, 11, 5 + b, 1, 4, l["shirtDark"])
		_px(p, 4, 4 + b, l["skin"])
		_px(p, 11, 4 + b, l["skin"])
	elif arms == "forward":
		_rect(p, 4, 8 + b, 1, 2, l["shirt"])
		_rect(p, 11, 8 + b, 1, 2, l["shirtDark"])
		if not back:
			_hline(p, 5, 6, 10 + b, l["shirt"])
			_hline(p, 9, 10, 10 + b, l["shirtDark"])
			_hline(p, 6, 9, 11 + b, l["skin"])
	else:
		var swing := 1 if leg == 1 else (-1 if leg == 3 else 0)
		_rect(p, 4, 8 + b + swing, 1, 3, l["shirt"])
		_px(p, 4, 11 + b + swing, l["skin"])
		_rect(p, 11, 8 + b - swing, 1, 3, l["shirtDark"])
		_px(p, 11, 11 + b - swing, l["skin"])
	var hy := 1 + b
	var style: int = l["style"]
	_rect(p, 5, hy + 2, 6, 5, l["skin"])
	_vline(p, 10, hy + 3, hy + 6, l["skinShade"])
	_hline(p, 5, 10, hy, l["hair"])
	_hline(p, 5, 10, hy + 1, l["hair"])
	if back:
		_rect(p, 5, hy + 2, 6, 4, l["hair"])
		_vline(p, 4, hy + 1, hy + 4, l["hair"])
		_vline(p, 11, hy + 1, hy + 4, l["hair"])
		if style == 1:
			_rect(p, 5, hy + 6, 6, 2, l["hair"])
	else:
		_px(p, 4, hy + 2, l["hair"])
		_px(p, 5, hy + 2, l["hair"])
		_px(p, 10, hy + 2, l["hair"])
		_px(p, 11, hy + 2, l["hair"])
		_vline(p, 4, hy + 1, hy + (7 if style == 1 else 4), l["hair"])
		_vline(p, 11, hy + 1, hy + (7 if style == 1 else 4), l["hair"])
		var eye: Color = l["skinShade"] if closed else Color(OUTLINE)
		_px(p, 6, hy + 4, eye)
		_px(p, 9, hy + 4, eye)
		_px(p, 5, hy + 5, Color(BLUSH))
		_px(p, 10, hy + 5, Color(BLUSH))
	if style == 2:
		_hline(p, 7, 8, hy - 1, l["hair"])
	_hline(p, 6, 7, hy, _light(l["hair"], 0.35))


static func _draw_side(p: Image, l: Dictionary, pose: Array) -> void:
	var leg: int = pose[0]
	var b: int = pose[1]
	var arms: String = pose[2]
	var closed: bool = pose[3]
	if leg == 1:
		_rect(p, 5, 13, 2, 3, l["pants"])
		_rect(p, 9, 13, 2, 2, l["pants"])
		_hline(p, 4, 6, 16, Color(SHOE))
		_hline(p, 9, 10, 15, Color(SHOE))
	elif leg == 3:
		_rect(p, 9, 13, 2, 3, l["pants"])
		_rect(p, 5, 13, 2, 2, l["pants"])
		_hline(p, 8, 10, 16, Color(SHOE))
		_hline(p, 4, 6, 15, Color(SHOE))
	else:
		_rect(p, 7, 13, 2, 3, l["pants"])
		_hline(p, 6, 8, 16, Color(SHOE))
	_rect(p, 6, 8 + b, 4, 5, l["shirt"])
	_vline(p, 9, 8 + b, 12 + b, l["shirtDark"])
	_hline(p, 6, 9, 12 + b, l["shirtDark"])
	_vline(p, 6, 8 + b, 10 + b, _light(l["shirt"]))
	_hline(p, 6, 9, 11 + b, _dark(l["pants"], 0.35))
	if arms == "up":
		_rect(p, 6, 5 + b, 1, 4, l["shirt"])
		_px(p, 6, 4 + b, l["skin"])
	elif arms == "forward":
		_hline(p, 4, 7, 9 + b, l["shirt"])
		_px(p, 3, 9 + b, l["skin"])
	else:
		var swing := -1 if leg == 1 else (1 if leg == 3 else 0)
		_rect(p, 7 + swing, 8 + b, 2, 3, l["shirtDark"])
		_px(p, 7 + swing, 11 + b, l["skin"])
	var hy := 1 + b
	var style: int = l["style"]
	_rect(p, 5, hy + 2, 6, 5, l["skin"])
	_px(p, 4, hy + 4, l["skin"])
	_hline(p, 5, 10, hy, l["hair"])
	_hline(p, 5, 11, hy + 1, l["hair"])
	_rect(p, 8, hy + 2, 3, 3, l["hair"])
	_vline(p, 11, hy + 1, hy + (7 if style == 1 else 4), l["hair"])
	_vline(p, 10, hy + 5, hy + (7 if style == 1 else 5), l["hair"])
	_px(p, 5, hy + 2, l["hair"])
	_px(p, 6, hy + 4, l["skinShade"] if closed else Color(OUTLINE))
	_px(p, 6, hy + 5, Color(BLUSH))
	if style == 2:
		_hline(p, 9, 10, hy - 1, l["hair"])
	_hline(p, 6, 7, hy, _light(l["hair"], 0.35))
