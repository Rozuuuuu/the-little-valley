class_name ArtPack
extends RefCounted
## The player's own art, kept on this device only (user://art_overrides):
##   pack.json            {version, name, sprites: {sprite: {source, ax, ay, scale, frames, frame, recolour}}}
##   sources/<file>.png   each uploaded image as it came (re-editable)
##   <sprite>.png         the baked result: exactly the game sprite's canvas size, with the
##                        player's anchor point placed on the sprite's anchor (Art loads these).
##
## An upload can be a strip of frames side by side: frame i is baked into the i-th sprite of a
## family (animal_deer_0, animal_deer_1...). Recolouring pulls every pixel toward the nearest
## palette colour. Packs travel as .zip files (Export / Import).

const VERSION := 1
const DIR := "user://art_overrides"
const MAX_UPLOAD_BYTES := 4 * 1024 * 1024
const MAX_SIDE := 2048
const MAX_SPRITES := 400
const MAX_PACK_BYTES := 48 * 1024 * 1024

var dir: String
var name := "My art"
## sprite -> settings
var sprites := {}


func _init(root: String = DIR) -> void:
	dir = root
	DirAccess.make_dir_recursive_absolute(dir.path_join("sources"))
	var text := FileAccess.get_file_as_string(dir.path_join("pack.json"))
	var d: Variant = JSON.parse_string(text) if text != "" else null
	if d is Dictionary:
		name = str(d.get("name", name))
		var s: Variant = d.get("sprites")
		if s is Dictionary:
			sprites = s


func save_index() -> String:
	var f := FileAccess.open(dir.path_join("pack.json"), FileAccess.WRITE)
	if f == null:
		return "Could not save the art pack (%s)" % error_string(FileAccess.get_open_error())
	f.store_string(JSON.stringify({"version": VERSION, "name": name, "sprites": sprites}, "\t"))
	f.close()
	return ""


## Reads an uploaded image (PNG, JPEG, WebP or SVG). Returns {image, error}.
static func read_image(bytes: PackedByteArray, file_name: String) -> Dictionary:
	if bytes.size() > MAX_UPLOAD_BYTES:
		return {"image": null, "error": "That image is larger than %d MB" % (MAX_UPLOAD_BYTES / 1048576)}
	var im := Image.new()
	var ext := file_name.get_extension().to_lower()
	var err := ERR_FILE_UNRECOGNIZED
	match ext:
		"png": err = im.load_png_from_buffer(bytes)
		"jpg", "jpeg": err = im.load_jpg_from_buffer(bytes)
		"webp": err = im.load_webp_from_buffer(bytes)
		"svg": err = im.load_svg_from_buffer(bytes)
	if err != OK or im.is_empty():
		return {"image": null, "error": "That file could not be read as an image (PNG, JPEG, WebP or SVG)"}
	if im.get_width() > MAX_SIDE or im.get_height() > MAX_SIDE:
		return {"image": null, "error": "Images can be at most %d pixels on a side" % MAX_SIDE}
	im.convert(Image.FORMAT_RGBA8)
	return {"image": im, "error": ""}


## The sprites of a family: "animal_deer_0" -> ["animal_deer_0", "animal_deer_1"]; a sprite without
## numbered siblings is its own family.
static func family(sprite: String, names: Array) -> Array[String]:
	var out: Array[String] = []
	var cut := sprite.rfind("_")
	if cut == -1 or not sprite.substr(cut + 1).is_valid_int():
		out.append(sprite)
		return out
	var base := sprite.substr(0, cut + 1)
	var i := 0
	while names.has(base + str(i)):
		out.append(base + str(i))
		i += 1
	if out.is_empty():
		out.append(sprite)
	return out


## Every palette colour (palette.json), for recolouring.
static func palette_colors() -> PackedColorArray:
	var out := PackedColorArray()
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://art/palette.json"))
	var stack: Array = [d]
	while not stack.is_empty():
		var v: Variant = stack.pop_back()
		if v is Dictionary:
			stack.append_array((v as Dictionary).values())
		elif v is Array:
			stack.append_array(v)
		elif v is String and str(v).begins_with("#") and Color.html_is_valid(v):
			var c := Color(str(v))
			if not out.has(c):
				out.append(c)
	return out


## Pulls each pixel toward its nearest palette colour by `strength` (0..1); alpha is kept.
static func recolour(im: Image, colors: PackedColorArray, strength: float) -> Image:
	var out := im.duplicate() as Image
	if strength <= 0.0 or colors.is_empty():
		return out
	var cache := {}
	for y in out.get_height():
		for x in out.get_width():
			var c := out.get_pixel(x, y)
			if c.a <= 0.01:
				continue
			var key := c.to_rgba32() | 0xff
			var near: Color = cache.get(key, Color(-1, 0, 0))
			if near.r < 0.0:
				var best := INF
				for p: Color in colors:
					var d := (p.r - c.r) * (p.r - c.r) * 0.3 + (p.g - c.g) * (p.g - c.g) * 0.59 + (p.b - c.b) * (p.b - c.b) * 0.11
					if d < best:
						best = d
						near = p
				cache[key] = near
			out.set_pixel(x, y, Color(c.lerp(near, strength), c.a))
	return out


## Bakes one frame of an upload into a sprite's canvas: the upload's anchor point (ax, ay, in the
## frame's pixels) lands on the sprite's anchor, scaled by `scale`.
static func bake(frame: Image, ax: float, ay: float, scale: float, canvas: Vector2i, anchor: Vector2) -> Image:
	var scaled := frame.duplicate() as Image
	var size := Vector2i(maxi(1, roundi(frame.get_width() * scale)), maxi(1, roundi(frame.get_height() * scale)))
	if size != frame.get_size():
		scaled.resize(size.x, size.y, Image.INTERPOLATE_LANCZOS)
	var out := Image.create(canvas.x, canvas.y, false, Image.FORMAT_RGBA8)
	var at := Vector2i(roundi(anchor.x - ax * scale), roundi(anchor.y - ay * scale))
	out.blend_rect(scaled, Rect2i(Vector2i.ZERO, size), at)
	return out


## The default settings for a new upload onto `sprite`: scaled so a frame fills the sprite's
## canvas width, centred across it, with its bottom edge on the sprite's ground line. (Anchors
## differ: a building's is its footprint's bottom-left corner, a person's the feet.)
static func defaults(im: Image, frames: int, entry: Dictionary) -> Dictionary:
	var fw := im.get_width() / maxi(1, frames)
	var scale := float(entry["w"]) / fw
	return {"ax": float(entry["ax"]) / scale, "ay": float(im.get_height()), "scale": scale, "frames": frames, "recolour": 0.0}


## Adds or replaces the player's image for `sprite` (and its family when `frames` > 1).
## `entries` is the game's sprite manifest (Art.sprites). Returns "" or the problem.
func set_image(sprite: String, bytes: PackedByteArray, file_name: String, frames: int, entries: Dictionary) -> String:
	if not entries.has(sprite):
		return "There is no game sprite called %s" % sprite
	if not sprites.has(sprite) and sprites.size() >= MAX_SPRITES:
		return "A pack can replace at most %d sprites" % MAX_SPRITES
	var r := read_image(bytes, file_name)
	if r["image"] == null:
		return r["error"]
	var im: Image = r["image"]
	frames = clampi(frames, 1, family(sprite, entries.keys()).size())
	var source := "%s.png" % sprite
	var err := im.save_png(dir.path_join("sources").path_join(source))
	if err != OK:
		return "Could not keep the image (%s)" % error_string(err)
	var s := defaults(im, frames, entries[sprite])
	s["source"] = source
	sprites[sprite] = s
	return rebake(sprite, entries)


## Changes a setting (ax, ay, scale, frames, recolour) and bakes again.
func set_setting(sprite: String, key: String, value: float, entries: Dictionary) -> String:
	if not sprites.has(sprite):
		return "No image for %s yet" % sprite
	(sprites[sprite] as Dictionary)[key] = value
	return rebake(sprite, entries)


## The sprites an entry bakes into (itself, or its family's first `frames` members).
func targets(sprite: String, entries: Dictionary) -> Array[String]:
	var s: Dictionary = sprites[sprite]
	var fam := family(sprite, entries.keys())
	var n := clampi(int(s.get("frames", 1)), 1, fam.size())
	if n == 1:
		var one: Array[String] = [sprite]
		return one
	return fam.slice(0, n)


## Writes the baked PNG(s) for an entry. Returns "" or the problem.
func rebake(sprite: String, entries: Dictionary, colors: PackedColorArray = PackedColorArray()) -> String:
	var s: Dictionary = sprites[sprite]
	var src := Image.load_from_file(dir.path_join("sources").path_join(str(s["source"])))
	if src == null or src.is_empty():
		return "The uploaded image for %s is missing" % sprite
	src.convert(Image.FORMAT_RGBA8)
	var strength := float(s.get("recolour", 0.0))
	var pal := colors if not colors.is_empty() or strength <= 0.0 else palette_colors()
	var ts := targets(sprite, entries)
	var fw := src.get_width() / ts.size()
	for i in ts.size():
		var e: Dictionary = entries[ts[i]]
		var frame := src.get_region(Rect2i(i * fw, 0, fw, src.get_height()))
		var out := bake(frame, float(s["ax"]), float(s["ay"]), float(s["scale"]), Vector2i(int(e["w"]), int(e["h"])), Vector2(float(e["ax"]), float(e["ay"])))
		# Recoloured after baking: the canvas is small, however large the upload.
		if strength > 0.0:
			out = recolour(out, pal, strength)
		var err := out.save_png(dir.path_join(ts[i] + ".png"))
		if err != OK:
			return "Could not save %s (%s)" % [ts[i], error_string(err)]
	return save_index()


## Removes the player's image for an entry; the game's own art returns.
func remove(sprite: String, entries: Dictionary) -> Array[String]:
	if not sprites.has(sprite):
		return []
	var ts := targets(sprite, entries)
	for t: String in ts:
		DirAccess.remove_absolute(dir.path_join(t + ".png"))
	DirAccess.remove_absolute(dir.path_join("sources").path_join(str(sprites[sprite]["source"])))
	sprites.erase(sprite)
	save_index()
	return ts


## The whole pack as .zip bytes: pack.json, sources and baked images.
func export_zip() -> PackedByteArray:
	var tmp := dir.path_join("_export.zip")
	var z := ZIPPacker.new()
	if z.open(tmp) != OK:
		return PackedByteArray()
	var files: Array[String] = ["pack.json"]
	for sprite: String in sprites:
		files.append("sources/" + str(sprites[sprite]["source"]))
	for f: String in DirAccess.get_files_at(dir):
		if f.ends_with(".png"):
			files.append(f)
	for f: String in files:
		var bytes := FileAccess.get_file_as_bytes(dir.path_join(f))
		z.start_file(f)
		z.write_file(bytes)
		z.close_file()
	z.close()
	var out := FileAccess.get_file_as_bytes(tmp)
	DirAccess.remove_absolute(tmp)
	return out


## Replaces this pack with one from a .zip. Only images for sprites this game has are taken.
## Returns {error, count}.
func import_zip(bytes: PackedByteArray, entries: Dictionary) -> Dictionary:
	if bytes.size() > MAX_PACK_BYTES:
		return {"error": "That pack is larger than %d MB" % (MAX_PACK_BYTES / 1048576), "count": 0}
	var tmp := dir.path_join("_import.zip")
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return {"error": "Could not read the pack", "count": 0}
	f.store_buffer(bytes)
	f.close()
	var z := ZIPReader.new()
	if z.open(tmp) != OK:
		DirAccess.remove_absolute(tmp)
		return {"error": "That file is not an art pack (.zip)", "count": 0}
	var index: Variant = JSON.parse_string(z.read_file("pack.json").get_string_from_utf8()) if z.file_exists("pack.json") else null
	if not (index is Dictionary and (index as Dictionary).get("sprites") is Dictionary):
		z.close()
		DirAccess.remove_absolute(tmp)
		return {"error": "That pack has no pack.json", "count": 0}
	var incoming: Dictionary = index["sprites"]
	var taken := {}
	for sprite: String in incoming:
		var s: Variant = incoming[sprite]
		if not entries.has(sprite) or not s is Dictionary or not z.file_exists("sources/" + str(s.get("source", ""))):
			continue
		var src := Image.new()
		if src.load_png_from_buffer(z.read_file("sources/" + str(s["source"]))) != OK or src.get_width() > MAX_SIDE or src.get_height() > MAX_SIDE:
			continue
		taken[sprite] = {"image": src, "s": s}
		if taken.size() >= MAX_SPRITES:
			break
	z.close()
	DirAccess.remove_absolute(tmp)
	for sprite: String in sprites.keys():
		remove(sprite, entries)
	name = str(index.get("name", "Imported art"))
	for sprite: String in taken:
		var s: Dictionary = taken[sprite]["s"]
		var source := "%s.png" % sprite
		(taken[sprite]["image"] as Image).save_png(dir.path_join("sources").path_join(source))
		sprites[sprite] = {"source": source, "ax": float(s.get("ax", 0)), "ay": float(s.get("ay", 0)), "scale": clampf(float(s.get("scale", 1)), 0.01, 50.0),
			"frames": int(s.get("frames", 1)), "recolour": clampf(float(s.get("recolour", 0)), 0.0, 1.0)}
		rebake(sprite, entries)
	save_index()
	return {"error": "", "count": taken.size()}
