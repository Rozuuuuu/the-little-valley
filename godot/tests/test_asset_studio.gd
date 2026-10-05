extends TestCase
## The Asset Studio's art packs: upload, bake to the sprite's canvas and anchor, frames, recolour,
## limits, removal, and export/import.


func _entries() -> Dictionary:
	return {
		"house": {"w": 216.0, "h": 300.0, "ax": 12.0, "ay": 290.0},
		"animal_deer_0": {"w": 120.0, "h": 100.0, "ax": 60.0, "ay": 90.0},
		"animal_deer_1": {"w": 120.0, "h": 100.0, "ax": 60.0, "ay": 90.0},
	}


func _png(w: int, h: int, color: Color) -> PackedByteArray:
	var im := Image.create(w, h, false, Image.FORMAT_RGBA8)
	im.fill(color)
	return im.save_png_to_buffer()


func _dir() -> String:
	return "user://test_art_%d" % Time.get_ticks_usec()


func test_an_upload_is_baked_onto_the_sprite_anchor() -> void:
	var pack := ArtPack.new(_dir())
	var e := _entries()
	check_eq(pack.set_image("house", _png(100, 50, Color.RED), "house.png", 1, e), "", "a PNG is taken")
	var baked := Image.load_from_file(pack.dir.path_join("house.png"))
	check_eq(baked.get_size(), Vector2i(216, 300), "baked at the sprite's canvas size")
	# Defaults: scaled to the canvas width, centred across it, bottom edge on the ground line.
	var s: Dictionary = pack.sprites["house"]
	check(is_equal_approx(float(s["scale"]), 2.16), "scaled to fill the width")
	check(baked.get_pixel(1, 289).r > 0.9 and baked.get_pixel(214, 289).r > 0.9, "across the whole width, just above the ground line")
	check(baked.get_pixel(12, 0).a < 0.01, "and nothing far above it")
	check_eq(pack.set_setting("house", "ay", 0.0, e), "", "anchor moved to the top edge")
	var moved := Image.load_from_file(pack.dir.path_join("house.png"))
	check(moved.get_pixel(20, 289).a < 0.01 and moved.get_pixel(20, 295).r > 0.9, "the image now hangs below the anchor")


func test_a_strip_of_frames_fills_a_family() -> void:
	var pack := ArtPack.new(_dir())
	var e := _entries()
	var strip := Image.create(40, 20, false, Image.FORMAT_RGBA8)
	strip.fill_rect(Rect2i(0, 0, 20, 20), Color.RED)
	strip.fill_rect(Rect2i(20, 0, 20, 20), Color.BLUE)
	check_eq(pack.set_image("animal_deer_0", strip.save_png_to_buffer(), "deer.png", 2, e), "", "a two-frame strip")
	check_eq(ArtPack.family("animal_deer_1", e.keys()), ["animal_deer_0", "animal_deer_1"] as Array[String], "deer frames are a family")
	var f0 := Image.load_from_file(pack.dir.path_join("animal_deer_0.png"))
	var f1 := Image.load_from_file(pack.dir.path_join("animal_deer_1.png"))
	check(f0.get_pixel(60, 85).r > 0.9 and f1.get_pixel(60, 85).b > 0.9, "each frame goes to its own sprite")
	check_eq(pack.remove("animal_deer_0", e), ["animal_deer_0", "animal_deer_1"] as Array[String], "removing takes the family")
	check(not FileAccess.file_exists(pack.dir.path_join("animal_deer_1.png")), "and its files")


func test_recolour_pulls_toward_the_palette() -> void:
	var colors := ArtPack.palette_colors()
	check(colors.size() > 20, "the palette has its colours")
	var im := Image.create(2, 1, false, Image.FORMAT_RGBA8)
	im.set_pixel(0, 0, Color(0.1, 0.25, 0.25))
	im.set_pixel(1, 0, Color(1, 0, 1, 0))
	var out := ArtPack.recolour(im, colors, 1.0)
	check(colors.has(Color(out.get_pixel(0, 0), 1.0)) or _near_any(out.get_pixel(0, 0), colors), "a pixel becomes a palette colour")
	check_eq(out.get_pixel(1, 0).a, 0.0, "transparent stays transparent")
	var half := ArtPack.recolour(im, colors, 0.5)
	check(half.get_pixel(0, 0) != out.get_pixel(0, 0), "half strength is in between")


func _near_any(c: Color, colors: PackedColorArray) -> bool:
	for p: Color in colors:
		if absf(p.r - c.r) < 0.01 and absf(p.g - c.g) < 0.01 and absf(p.b - c.b) < 0.01:
			return true
	return false


func test_limits_and_bad_files() -> void:
	var pack := ArtPack.new(_dir())
	var e := _entries()
	# The engine reports the damaged PNG as it rejects it.
	allowed_errors.append_array(["read beyond end of data", "ERR_FILE_CORRUPT", "Ref<Image>()", "image.is_null()"])
	check(pack.set_image("castle", _png(4, 4, Color.RED), "a.png", 1, e) != "", "unknown sprites are refused")
	check(pack.set_image("house", PackedByteArray([1, 2, 3]), "a.png", 1, e).contains("could not be read"), "junk is refused")
	var big := PackedByteArray()
	big.resize(ArtPack.MAX_UPLOAD_BYTES + 1)
	check(pack.set_image("house", big, "a.png", 1, e).contains("larger"), "huge files are refused")
	check(pack.sprites.is_empty(), "nothing was kept")


func test_packs_export_and_import() -> void:
	var a := ArtPack.new(_dir())
	var e := _entries()
	a.name = "Rosy roofs"
	a.set_image("house", _png(50, 30, Color.RED), "house.png", 1, e)
	a.set_setting("house", "recolour", 0.5, e)
	var zip := a.export_zip()
	check(zip.size() > 100, "a pack exports")
	var b := ArtPack.new(_dir())
	b.set_image("animal_deer_0", _png(10, 10, Color.BLUE), "d.png", 1, e)
	var r := b.import_zip(zip, e)
	check_eq(r["error"], "", "and imports")
	check_eq(int(r["count"]), 1, "one sprite")
	check_eq(b.name, "Rosy roofs", "with its name")
	check(b.sprites.has("house") and not b.sprites.has("animal_deer_0"), "replacing what was there")
	check(is_equal_approx(float(b.sprites["house"]["recolour"]), 0.5), "settings travel")
	check(FileAccess.file_exists(b.dir.path_join("house.png")), "and the image is baked")
	check(b.import_zip(PackedByteArray([80, 75, 1, 2]), e)["error"] != "", "junk is not a pack")
	var reopened := ArtPack.new(b.dir)
	check(reopened.sprites.has("house"), "the pack is remembered")


func test_the_game_uses_the_players_art() -> void:
	var art := Art.new()
	art.load_all(0.25)
	var pack := ArtPack.new(Art.OVERRIDE_DIR)
	var had := pack.sprites.duplicate(true)
	var before: Texture2D = art.sprites["well"]["texture"]
	check_eq(pack.set_image("well", _png(64, 64, Color.RED), "well.png", 1, art.sprites), "", "a well of the player's own")
	art.reload(["well"] as Array[String])
	var tex: Texture2D = art.sprites["well"]["texture"]
	check(tex != before and tex is ImageTexture, "the game swaps it in")
	pack.remove("well", art.sprites)
	art.reload(["well"] as Array[String])
	check(not pack.sprites.has("well"), "and removing brings the game's own back")
	check_eq(pack.sprites, had, "the player's other art is untouched")
