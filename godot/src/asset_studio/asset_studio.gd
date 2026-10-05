class_name AssetStudio
extends PanelContainer
## The Asset Studio: the player's own art for any game sprite, kept on this device only.
## Pick a sprite, upload an image (or a strip of frames for animated sprites), place its anchor
## (click on your image or type it), scale it, pull its colours toward the game's palette, and
## see it in the valley at once. Packs export and import as .zip files.

const KINDS := {"All": "", "Buildings": "building", "Lit windows": "night", "Animals": "animal", "Pens": "pen", "People": "person",
	"Trees and rocks": "object", "Crops and fields": "crop", "Tools": "tool", "Icons": "icon", "Building sites": "site"}
const PREVIEW := Vector2(215, 260)

var hud: Hud
var pack: ArtPack
var sprite := ""

var _kind := OptionButton.new()
var _search := LineEdit.new()
var _list := ItemList.new()
var _title := Label.new()
var _status := Label.new()
var _game_preview := _Preview.new()
var _your_preview := _Preview.new()
var _result_preview := _Preview.new()
var _frames := SpinBox.new()
var _ax := SpinBox.new()
var _ay := SpinBox.new()
var _scale := HSlider.new()
var _scale_label := Label.new()
var _recolour := HSlider.new()
var _name := LineEdit.new()
var _controls := VBoxContainer.new()
var _quiet := false


## A sprite drawn on a checkerboard with its anchor marked.
class _Preview:
	extends Control
	var texture: Texture2D
	## Anchor in the texture's pixels (drawn as a gold cross), or null.
	var anchor: Variant = null
	var caption := ""
	var on_click: Callable

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var cell := 12.0
		for y in ceili(size.y / cell):
			for x in ceili(size.x / cell):
				draw_rect(Rect2(x * cell, y * cell, cell, cell), Color(0.2, 0.3, 0.3) if (x + y) % 2 == 0 else Color(0.25, 0.36, 0.36))
		if texture != null:
			var fit := fit_rect()
			draw_texture_rect(texture, fit, false)
			if anchor != null:
				var a: Vector2 = fit.position + (anchor as Vector2) * (fit.size.x / texture.get_width())
				draw_line(a - Vector2(10, 0), a + Vector2(10, 0), WorldView.GOLD, 2.0)
				draw_line(a - Vector2(0, 10), a + Vector2(0, 10), WorldView.GOLD, 2.0)
		draw_rect(r, Color(0.8, 0.93, 0.86, 0.5), false, 1.0)
		if caption != "":
			draw_string(ThemeDB.fallback_font, Vector2(6, size.y - 8), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.8, 0.93, 0.86))

	func fit_rect() -> Rect2:
		var tw := float(texture.get_width())
		var th := float(texture.get_height())
		var k := minf((size.x - 12) / tw, (size.y - 28) / th)
		var sz := Vector2(tw, th) * k
		return Rect2((size - sz) / 2.0 - Vector2(0, 8), sz)

	func _gui_input(event: InputEvent) -> void:
		if texture != null and on_click.is_valid() and event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			var fit := fit_rect()
			on_click.call((event.position - fit.position) / (fit.size.x / texture.get_width()))


func setup(h: Hud) -> void:
	hud = h
	pack = ArtPack.new()
	visible = false
	set_anchors_preset(Control.PRESET_CENTER)
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	add_child(root)
	var head := HBoxContainer.new()
	var t := Label.new()
	t.text = "Asset Studio"
	t.add_theme_font_override("font", hud._bold)
	t.add_theme_font_size_override("font_size", 24)
	t.add_theme_color_override("font_color", hud._c("accent"))
	head.add_child(t)
	var note := Label.new()
	note.text = "  Your own art for anything in the valley, kept on this device only."
	note.add_theme_color_override("font_color", hud._c("textDim"))
	note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(note)
	head.add_child(hud._button("Close", func() -> void: visible = false))
	root.add_child(head)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	root.add_child(body)
	# Left: what to replace.
	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(230, 420)
	for k: String in KINDS:
		_kind.add_item(k)
	_kind.item_selected.connect(func(_i: int) -> void: _fill_list())
	left.add_child(_kind)
	_search.placeholder_text = "Search sprites"
	_search.text_changed.connect(func(_t: String) -> void: _fill_list())
	left.add_child(_search)
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.item_selected.connect(func(i: int) -> void: choose(str(_list.get_item_metadata(i))))
	left.add_child(_list)
	body.add_child(left)
	# Middle: the game's art and the player's image.
	var mid := VBoxContainer.new()
	_title.add_theme_font_override("font", hud._bold)
	mid.add_child(_title)
	var previews := HBoxContainer.new()
	for p: _Preview in [_game_preview, _your_preview, _result_preview]:
		p.custom_minimum_size = PREVIEW
		previews.add_child(p)
	_your_preview.on_click = func(at: Vector2) -> void:
		if pack.sprites.has(sprite):
			_change("ax", roundf(at.x))
			_change("ay", roundf(at.y))
	mid.add_child(previews)
	var hint := Label.new()
	hint.text = "Click your image to put its anchor where it touches the ground (the gold cross)."
	hint.add_theme_color_override("font_color", hud._c("textDim"))
	mid.add_child(hint)
	body.add_child(mid)
	# Right: settings.
	_controls.custom_minimum_size = Vector2(240, 0)
	_controls.add_child(hud._button("Upload image…", upload, "PNG, JPEG, WebP or SVG. For an animated sprite, frames side by side in one image."))
	_frames.min_value = 1
	_frames.max_value = 1
	_frames.value_changed.connect(func(v: float) -> void: _change("frames", v))
	_controls.add_child(_row("Frames in the image", _frames))
	for sb: SpinBox in [_ax, _ay]:
		sb.min_value = -4096
		sb.max_value = 4096
		sb.step = 1
	_ax.value_changed.connect(func(v: float) -> void: _change("ax", v))
	_ay.value_changed.connect(func(v: float) -> void: _change("ay", v))
	_controls.add_child(_row("Anchor x", _ax))
	_controls.add_child(_row("Anchor y", _ay))
	_scale.min_value = -3.0
	_scale.max_value = 3.0
	_scale.step = 0.01
	_scale.custom_minimum_size = Vector2(150, 0)
	_scale.value_changed.connect(func(v: float) -> void: _scale_label.text = "Size %d%%" % roundi(exp(v) * 100))
	_scale.drag_ended.connect(func(_c: bool) -> void: _change("scale", exp(_scale.value)))
	_controls.add_child(_row("", _scale_label))
	_controls.add_child(_scale)
	_recolour.min_value = 0.0
	_recolour.max_value = 1.0
	_recolour.step = 0.05
	_recolour.drag_ended.connect(func(_c: bool) -> void: _change("recolour", _recolour.value))
	var rl := Label.new()
	rl.text = "Match the game's colours"
	_controls.add_child(rl)
	_controls.add_child(_recolour)
	_controls.add_child(hud._button("Use the game's art again", func() -> void:
		var gone := pack.remove(sprite, hud.game.art.sprites)
		_refresh_game(gone)
		choose(sprite)))
	body.add_child(_controls)
	# Bottom: the pack.
	var foot := HBoxContainer.new()
	_name.text = pack.name
	_name.custom_minimum_size = Vector2(220, 0)
	_name.text_submitted.connect(func(t: String) -> void:
		pack.name = t.strip_edges() if t.strip_edges() != "" else "My art"
		pack.save_index())
	foot.add_child(_name)
	foot.add_child(hud._button("Export pack…", export_pack, "Save your art as a .zip to keep or share"))
	foot.add_child(hud._button("Import pack…", import_pack, "Load a .zip pack (replaces your current art)"))
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_status.add_theme_color_override("font_color", hud._c("textDim"))
	foot.add_child(_status)
	root.add_child(foot)


func _row(text: String, c: Control) -> HBoxContainer:
	var r := HBoxContainer.new()
	var l := Label.new()
	l.text = text
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	r.add_child(l)
	r.add_child(c)
	return r


func open() -> void:
	visible = true
	_fill_list()
	if sprite == "" and _list.item_count > 0:
		_list.select(0)
		choose(str(_list.get_item_metadata(0)))
	hud._center(self)


func _fill_list() -> void:
	_list.clear()
	var kind: String = KINDS[_kind.get_item_text(_kind.selected)]
	var q := _search.text.strip_edges().to_lower()
	var entries: Dictionary = hud.game.art._entries
	var names: Array = entries.keys()
	names.sort()
	for n: String in names:
		if kind != "" and str(entries[n].get("kind", "")) != kind:
			continue
		if q != "" and not n.to_lower().contains(q):
			continue
		var mine := _owner_of(n) != ""
		var i := _list.add_item(("★ " if mine else "") + n.replace("_", " "))
		_list.set_item_metadata(i, n)
		if n == sprite:
			_list.select(i)
	_status.text = "%d sprite%s replaced" % [pack.sprites.size(), "" if pack.sprites.size() == 1 else "s"]


## The pack entry whose image covers this sprite ("" if none): itself, or a family strip.
func _owner_of(n: String) -> String:
	if pack.sprites.has(n):
		return n
	for k: String in pack.sprites:
		if pack.targets(k, hud.game.art.sprites).has(n):
			return k
	return ""


func choose(n: String) -> void:
	sprite = n
	var entries: Dictionary = hud.game.art._entries
	var e: Dictionary = entries.get(n, {})
	_title.text = "%s  (%d × %d)" % [n.replace("_", " "), int(e.get("w", 0)), int(e.get("h", 0))]
	var gen := Image.new()
	gen.load_svg_from_string(str(e.get("svg", "")), 1.0)
	_game_preview.texture = ImageTexture.create_from_image(gen) if not gen.is_empty() else null
	_game_preview.anchor = Vector2(float(e.get("ax", 0)), float(e.get("ay", 0)))
	_game_preview.caption = "The game's art"
	var owner := _owner_of(n)
	var has := owner != ""
	_quiet = true
	_frames.max_value = ArtPack.family(n, entries.keys()).size()
	if has:
		sprite = owner
		var s: Dictionary = pack.sprites[owner]
		var src := Image.load_from_file(pack.dir.path_join("sources").path_join(str(s["source"])))
		_your_preview.texture = ImageTexture.create_from_image(src) if src != null else null
		_your_preview.anchor = Vector2(float(s["ax"]), float(s["ay"]))
		_frames.value = int(s.get("frames", 1))
		_ax.value = float(s["ax"])
		_ay.value = float(s["ay"])
		_scale.value = log(maxf(0.01, float(s["scale"])))
		_recolour.value = float(s.get("recolour", 0.0))
		var baked := Image.load_from_file(pack.dir.path_join(n + ".png")) if FileAccess.file_exists(pack.dir.path_join(n + ".png")) else null
		_result_preview.texture = ImageTexture.create_from_image(baked) if baked != null else null
		_result_preview.anchor = _game_preview.anchor
	else:
		_your_preview.texture = null
		_your_preview.anchor = null
		_result_preview.texture = null
		_frames.value = 1
	_scale_label.text = "Size %d%%" % roundi(exp(_scale.value) * 100)
	_your_preview.caption = "Your image" if has else "Upload an image to replace it"
	_result_preview.caption = "In the game" if has else ""
	for c: Node in _controls.get_children():
		if c is Control and c != _controls.get_child(0):
			(c as Control).modulate.a = 1.0 if has else 0.4
	_quiet = false
	_game_preview.queue_redraw()
	_your_preview.queue_redraw()
	_result_preview.queue_redraw()


func _change(key: String, value: float) -> void:
	if _quiet or not pack.sprites.has(sprite):
		return
	var err := pack.set_setting(sprite, key, value, hud.game.art.sprites)
	if err != "":
		hud.toast(err, "warn")
		return
	_refresh_game(pack.targets(sprite, hud.game.art.sprites))
	choose(sprite)


## Puts changed sprites into the game at once.
func _refresh_game(names: Array[String]) -> void:
	hud.game.art.reload(names)
	if hud.game.sim != null:
		hud.game.view.set_simulation(hud.game.sim)
	_fill_list()


func upload() -> void:
	var picked := await Files.pick_bytes(hud.game, "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg",
		PackedStringArray(["*.png, *.jpg, *.jpeg, *.webp, *.svg ; Images"]))
	if (picked["bytes"] as PackedByteArray).is_empty():
		return
	var base := ArtPack.family(sprite, hud.game.art._entries.keys())[0] if int(_frames.value) > 1 else sprite
	var err := pack.set_image(base, picked["bytes"], picked["name"], int(_frames.value), hud.game.art.sprites)
	if err != "":
		hud.toast(err, "warn")
		return
	_refresh_game(pack.targets(base, hud.game.art.sprites))
	choose(base)
	hud.toast("Your %s is in the valley." % base.replace("_", " "), "good")


func export_pack() -> void:
	var bytes := pack.export_zip()
	if bytes.is_empty():
		hud.toast("The pack could not be written", "warn")
		return
	var r := Files.download_bytes("little-valley-art-%s.zip" % pack.name.to_lower().replace(" ", "-").validate_filename(), bytes, "application/zip")
	hud.toast(r["error"] if not bool(r["ok"]) else ("Saved %s" % r["path"] if str(r["path"]) != "" else "Pack downloaded"), "good" if bool(r["ok"]) else "warn")


func import_pack() -> void:
	var picked := await Files.pick_bytes(hud.game, ".zip,application/zip", PackedStringArray(["*.zip ; Art packs"]))
	if (picked["bytes"] as PackedByteArray).is_empty():
		return
	var before: Array[String] = []
	for k: String in pack.sprites:
		before.append_array(pack.targets(k, hud.game.art.sprites))
	var r := pack.import_zip(picked["bytes"], hud.game.art.sprites)
	if str(r["error"]) != "":
		hud.toast(r["error"], "warn")
		return
	var changed := before.duplicate()
	for k: String in pack.sprites:
		changed.append_array(pack.targets(k, hud.game.art.sprites))
	_refresh_game(changed)
	_name.text = pack.name
	choose(sprite)
	hud.toast("Imported %d sprite%s from %s" % [int(r["count"]), "" if int(r["count"]) == 1 else "s", picked["name"]], "good")
