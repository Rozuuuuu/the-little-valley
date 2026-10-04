class_name Art
extends RefCounted
## The game's sprites: every generated SVG in res://art/generated rasterised once, packed into a
## shared atlas texture (so many sprites draw in few batches), and looked up by name.
##
## Scale: the art is authored at 96 px per tile and drawn at World TILE_PX (64) per tile, so
## sprites are scaled by DRAW_SCALE; the atlas keeps full resolution plus mipmaps, which keeps
## edges smooth when zoomed in or out (never pixel-snapped).
##
## Replacement pipeline: a PNG or SVG with the same name in user://art_overrides (the Asset
## Studio's folder) or res://art/final is used instead of the generated one, provided it
## keeps the manifest's size and anchor (scaled versions are accepted and fitted to the size).

const SOURCE_PX_PER_TILE := 96.0
## Every generated sprite's SVG, size and anchor (scripts/art/make-svgs.ts writes it).
const BUNDLE := "res://art/sprites.json"
const FINAL_DIR := "res://art/final"
const OVERRIDE_DIR := "user://art_overrides"
const ATLAS_SIZE := 4096
const PAD := 4

## name -> {texture: AtlasTexture, ax, ay (anchor in source px), w, h}
var sprites := {}
var atlases: Array[ImageTexture] = []
var raster_scale := 1.0


## Loads every sprite. `raster_scale` < 1 rasterises smaller (for low-memory devices).
func load_all(scale: float = 1.0) -> void:
	raster_scale = scale
	var bundle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(BUNDLE))
	var entries: Dictionary = bundle["sprites"]
	var images := {}
	var names: Array = entries.keys()
	for n: String in names:
		images[n] = _load_image(n, entries[n])
	# Pack tallest first on shelves.
	names.sort_custom(func(a: String, b: String) -> bool: return (images[a] as Image).get_height() > (images[b] as Image).get_height())
	var atlas := Image.create(ATLAS_SIZE, ATLAS_SIZE, false, Image.FORMAT_RGBA8)
	var x := PAD
	var y := PAD
	var shelf := 0
	var placed: Array[Array] = []
	for n: String in names:
		var im: Image = images[n]
		if x + im.get_width() + PAD > ATLAS_SIZE:
			x = PAD
			y += shelf + PAD * 2
			shelf = 0
		if y + im.get_height() + PAD > ATLAS_SIZE:
			_finish_atlas(atlas, placed)
			atlas = Image.create(ATLAS_SIZE, ATLAS_SIZE, false, Image.FORMAT_RGBA8)
			placed = []
			x = PAD
			y = PAD
			shelf = 0
		atlas.blit_rect(im, Rect2i(Vector2i.ZERO, im.get_size()), Vector2i(x, y))
		placed.append([n, Rect2(x, y, im.get_width(), im.get_height()), entries[n]])
		x += im.get_width() + PAD * 2
		shelf = maxi(shelf, im.get_height())
	_finish_atlas(atlas, placed)


func _finish_atlas(atlas: Image, placed: Array[Array]) -> void:
	atlas.generate_mipmaps()
	var tex := ImageTexture.create_from_image(atlas)
	atlases.append(tex)
	for p in placed:
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = p[1]
		# No filter_clip: the atlas pads every sprite, and clipping per sprite stops batching.
		at.filter_clip = false
		var e: Dictionary = p[2]
		sprites[p[0]] = {"texture": at, "ax": float(e["ax"]), "ay": float(e["ay"]), "w": float(e["w"]), "h": float(e["h"])}


func _load_image(sprite_name: String, entry: Dictionary) -> Image:
	var target := Vector2i(roundi(float(entry["w"]) * raster_scale), roundi(float(entry["h"]) * raster_scale))
	for dir: String in [OVERRIDE_DIR, FINAL_DIR]:
		for ext: String in ["png", "svg"]:
			var path := "%s/%s.%s" % [dir, sprite_name, ext]
			if FileAccess.file_exists(path):
				var im := Image.new()
				var err := im.load_svg_from_string(FileAccess.get_file_as_string(path), raster_scale) if ext == "svg" else im.load(path)
				if err == OK:
					if im.get_size() != target:
						im.resize(target.x, target.y, Image.INTERPOLATE_LANCZOS)
					im.convert(Image.FORMAT_RGBA8)
					return im
	var gen := Image.new()
	gen.load_svg_from_string(str(entry["svg"]), raster_scale)
	gen.convert(Image.FORMAT_RGBA8)
	return gen


func has(sprite_name: String) -> bool:
	return sprites.has(sprite_name)


## Configures a Sprite2D to draw `sprite_name` with its anchor at the node's position.
func apply(sprite: Sprite2D, sprite_name: String) -> void:
	var s: Dictionary = sprites.get(sprite_name, {})
	if s.is_empty():
		push_error("Missing sprite %s" % sprite_name)
		return
	sprite.texture = s["texture"]
	sprite.centered = false
	var k := WorldView.TILE_PX / SOURCE_PX_PER_TILE
	sprite.scale = Vector2(k, k) / raster_scale
	sprite.offset = Vector2(-float(s["ax"]), -float(s["ay"])) * raster_scale

