extends SceneTree
## Renders every generated sprite onto one contact sheet, for reviewing the art. From godot/:
##   godot --headless --path . -s res://tools/art_sheet.gd -- <out.png> [filter] [scale=0.5]
## People are drawn assembled (legs, body, head, hair, hat) and tinted, as the game draws them.

const BUNDLE := "res://art/sprites.json"


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0] if args.size() > 0 else "user://art_sheet.png"
	var filter := args[1] if args.size() > 1 else ""
	var scale := float(args[2]) if args.size() > 2 else 0.5
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(BUNDLE))
	var sprites: Dictionary = manifest["sprites"]
	_sprites = sprites
	# The filter may list several substrings separated by commas.
	var parts := filter.split(",", false)
	var names: Array = sprites.keys().filter(func(n: String) -> bool:
		if parts.is_empty():
			return true
		for p in parts:
			if n.contains(p):
				return true
		return false)
	names.sort()
	var palette: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/palette.json"))
	var bg := Color(str((palette["ground"]["meadow"] as Array)[1]))
	var images: Array[Image] = []
	var labels: Array[String] = []
	# Assembled people first: one per role and direction.
	if parts.is_empty() or filter.contains("person"):
		var people := palette["people"] as Dictionary
		var roles := ["farmer", "builder", "gatherer", "hauler", "crafter", ""]
		var i := 0
		for role: String in roles:
			for d: String in ["down", "side", "up"]:
				images.append(_person(d, role, i, people, scale))
				labels.append("person %s %s" % [role, d])
				i += 1
	for n: String in names:
		if n.begins_with("person_"):
			continue
		images.append(_raster(n, scale))
		labels.append(n)
	var cell := 0
	for im in images:
		cell = maxi(cell, maxi(im.get_width(), im.get_height()))
	cell += 8
	var cols := 10
	var rows := ceili(images.size() / float(cols))
	var sheet := Image.create(cols * cell, rows * cell, false, Image.FORMAT_RGBA8)
	sheet.fill(bg)
	for i in images.size():
		var im := images[i]
		var x := (i % cols) * cell + (cell - im.get_width()) / 2
		var y := (i / cols) * cell + (cell - im.get_height()) - 4
		sheet.blend_rect(im, Rect2i(Vector2i.ZERO, im.get_size()), Vector2i(x, y))
	sheet.save_png(out)
	print("%d sprites -> %s (%dx%d)" % [images.size(), out, sheet.get_width(), sheet.get_height()])
	print(", ".join(labels))
	quit()


var _sprites := {}


func _raster(sprite_name: String, scale: float) -> Image:
	var im := Image.new()
	im.load_svg_from_string(str(_sprites[sprite_name]["svg"]), scale)
	return im


func _person(dir: String, role: String, i: int, people: Dictionary, scale: float) -> Image:
	var layers: Array[Array] = [
		["person_legs_%s_%d" % [dir, i % 4], Color(str((people["pants"] as Array)[i % 3]))],
		["person_body_%s" % dir, Color(str((people["shirt"] as Array)[i % 6]))],
		["person_head_%s" % dir, Color(str((people["skin"] as Array)[i % 4]))],
		["person_hair_%d_%s" % [i % 3, dir], Color(str((people["hair"] as Array)[i % 6]))],
	]
	if role != "":
		layers.append(["person_hat_%s_%s" % [role, dir], Color.WHITE])
	var out: Image = null
	for l in layers:
		var im := _raster(l[0], scale)
		var tint: Color = l[1]
		if tint != Color.WHITE:
			for y in im.get_height():
				for x in im.get_width():
					var c := im.get_pixel(x, y)
					if c.a > 0.0:
						im.set_pixel(x, y, Color(c.r * tint.r, c.g * tint.g, c.b * tint.b, c.a))
		if out == null:
			out = im
		else:
			out.blend_rect(im, Rect2i(Vector2i.ZERO, im.get_size()), Vector2i.ZERO)
	return out
