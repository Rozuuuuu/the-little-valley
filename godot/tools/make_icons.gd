extends SceneTree
## Writes the PWA icons (144, 180, 512 px) from icon.svg. From godot/:
##   godot --headless --path . -s res://tools/make_icons.gd


func _initialize() -> void:
	var svg := FileAccess.get_file_as_string("res://icon.svg")
	for size: int in [144, 180, 512]:
		var im := Image.new()
		im.load_svg_from_string(svg, 1.0)
		im.resize(size, size, Image.INTERPOLATE_LANCZOS)
		im.save_png("res://web/icon-%d.png" % size)
	print("icons written")
	quit()
