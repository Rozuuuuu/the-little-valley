class_name UiFonts
## The interface fonts: Pixelify Sans, the browser game's pixel font (SIL Open Font License,
## fonts/OFL-PixelifySans.txt), with Atkinson Hyperlegible as the fallback for any character the
## pixel font lacks. On the web there is no system font, so the fallback must be bundled too.


static func regular() -> FontFile:
	return _with_fallback("res://fonts/PixelifySans-Regular.woff2", "res://fonts/AtkinsonHyperlegible-Regular.woff2")


static func bold() -> FontFile:
	return _with_fallback("res://fonts/PixelifySans-Bold.woff2", "res://fonts/AtkinsonHyperlegible-Bold.woff2")


static func _with_fallback(main: String, fallback: String) -> FontFile:
	var f: FontFile = load(main)
	if f.fallbacks.is_empty():
		f.fallbacks = [load(fallback)]
	return f


## True when `font` or one of its fallbacks can draw character `c`.
static func covers(font: Font, c: int) -> bool:
	if font.has_char(c):
		return true
	for fb: Font in font.fallbacks:
		if fb.has_char(c):
			return true
	return false
