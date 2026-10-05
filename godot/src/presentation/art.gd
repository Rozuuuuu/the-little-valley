class_name Art
extends RefCounted
## The game's sprites: every generated SVG in res://art/generated rasterised once, packed into a
## shared atlas texture (so many sprites draw in few batches), and looked up by name.
##
## Scale: sprites are 96 px per tile and drawn at World TILE_PX (64) per tile. The shipped art
## is the browser game's pixel art at 16 art px per tile, stored 6x nearest-neighbour, so one art
## pixel is exactly 4 screen px at zoom 1; it is drawn with nearest filtering and no mipmaps.
## (Smooth SVG art, if a bundle holds it, keeps mipmaps and linear filtering.)
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
## True when the bundle is pixel art (PNG sprites): drawn with nearest-neighbour filtering and
## no mipmaps, so every art pixel stays a crisp square.
var pixel := false
## The generated manifest entries by name (for reloading single sprites).
var _entries := {}
## Sprites drawn from the player's or final art instead of the generated bundle.
var _custom := {}


## Loads every sprite. `raster_scale` < 1 rasterises smaller (for low-memory devices).
func load_all(scale: float = 1.0) -> void:
	raster_scale = scale
	var bundle: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(BUNDLE))
	var entries: Dictionary = bundle["sprites"]
	_entries = entries
	pixel = bundle.has("artPxPerTile")
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
	if not pixel:
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
		sprites[p[0]] = {"texture": at, "ax": float(e["ax"]), "ay": float(e["ay"]), "w": float(e["w"]), "h": float(e["h"]), "points": e.get("points", {})}


func _load_image(sprite_name: String, entry: Dictionary) -> Image:
	_custom.erase(sprite_name)
	var target := Vector2i(roundi(float(entry["w"]) * raster_scale), roundi(float(entry["h"]) * raster_scale))
	for dir: String in [OVERRIDE_DIR, FINAL_DIR]:
		for ext: String in ["png", "svg"]:
			var path := "%s/%s.%s" % [dir, sprite_name, ext]
			if FileAccess.file_exists(path):
				var im := Image.new()
				var err := im.load_svg_from_string(FileAccess.get_file_as_string(path), raster_scale) if ext == "svg" else im.load(path)
				if err == OK:
					if im.get_size() != target:
						im.resize(target.x, target.y, Image.INTERPOLATE_NEAREST if pixel else Image.INTERPOLATE_LANCZOS)
					im.convert(Image.FORMAT_RGBA8)
					_custom[sprite_name] = true
					return im
	var gen := Image.new()
	if entry.has("png"):
		gen.load_png_from_buffer(Marshalls.base64_to_raw(str(entry["png"])))
		if raster_scale != 1.0:
			gen.resize(target.x, target.y, Image.INTERPOLATE_NEAREST)
	else:
		gen.load_svg_from_string(str(entry["svg"]), raster_scale)
	gen.convert(Image.FORMAT_RGBA8)
	return gen


func has(sprite_name: String) -> bool:
	return sprites.has(sprite_name)


## True when this sprite comes from the player's art (or res://art/final), not the bundle.
func is_custom(sprite_name: String) -> bool:
	return _custom.has(sprite_name)


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


## A named point of a sprite (buildings: "chimney", "top") in world pixels from its anchor, or
## null when the sprite has no such point.
func point(sprite_name: String, key: String) -> Variant:
	var pts: Dictionary = sprites.get(sprite_name, {}).get("points", {})
	if not pts.has(key):
		return null
	var k := WorldView.TILE_PX / SOURCE_PX_PER_TILE
	return Vector2(float(pts[key][0]), float(pts[key][1])) * k


## Loads these sprites again (after the Asset Studio changed them): each gets its own texture
## from the player's image, or the game's own art when the player's was removed. Sprite2D nodes
## already on screen keep their old texture until they are applied again.
func reload(names: Array[String]) -> void:
	for n: String in names:
		if not _entries.has(n):
			continue
		var im := _load_image(n, _entries[n])
		if not pixel:
			im.generate_mipmaps()
		var e: Dictionary = _entries[n]
		sprites[n] = {"texture": ImageTexture.create_from_image(im), "ax": float(e["ax"]), "ay": float(e["ay"]), "w": float(e["w"]), "h": float(e["h"]), "points": e.get("points", {})}
