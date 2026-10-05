extends RefCounted
## Small original pixel symbols, cached once; labels remain visible beside every meaning.
static var cache: Dictionary = {}

static func texture(action: String, label: String) -> Texture2D:
	var kind := action
	if kind == "":
		kind = {"Back": "cancel", "Cancel": "cancel", "No train": "cancel", "Sites": "build", "Waiting": "waiting", "Home": "homeView"}.get(label, "")
	if kind not in ["move", "stop", "hold", "cancel", "unmark", "areas", "trainRole", "seeMore", "waiting", "homeView"]:
		return null
	if cache.has(kind):
		return cache[kind]
	var im := Image.create(20, 20, false, Image.FORMAT_RGBA8)
	im.fill(Color.TRANSPARENT)
	var ink := Color("#f7dd95")
	var shade := Color("#754c29")
	match kind:
		"stop":
			im.fill_rect(Rect2i(4, 4, 12, 12), Color("#c65a47"))
			im.fill_rect(Rect2i(6, 6, 8, 8), ink)
		"hold":
			im.fill_rect(Rect2i(5, 3, 3, 14), ink)
			im.fill_rect(Rect2i(12, 3, 3, 14), ink)
		"cancel", "unmark":
			for i in range(4, 16):
				im.fill_rect(Rect2i(i, i, 2, 2), ink)
				im.fill_rect(Rect2i(19 - i, i, 2, 2), ink)
		"move":
			im.fill_rect(Rect2i(3, 9, 11, 3), ink)
			for i in 7:
				im.fill_rect(Rect2i(10 + i, 4 + i, 2, 2), ink)
				im.fill_rect(Rect2i(10 + i, 16 - i, 2, 2), ink)
		"areas":
			im.fill_rect(Rect2i(3, 3, 14, 14), shade)
			for i: int in [3, 9, 16]:
				im.fill_rect(Rect2i(i, 3, 1, 14), ink)
				im.fill_rect(Rect2i(3, i, 14, 1), ink)
		"trainRole", "seeMore":
			im.fill_rect(Rect2i(2, 5, 16, 11), ink)
			im.fill_rect(Rect2i(9, 4, 2, 13), shade)
			for i: int in [7, 10, 13]:
				im.fill_rect(Rect2i(4, i, 3, 1), shade)
				im.fill_rect(Rect2i(13, i, 3, 1), shade)
		"waiting":
			im.fill_rect(Rect2i(4, 3, 12, 2), ink)
			im.fill_rect(Rect2i(4, 15, 12, 2), ink)
			for i in range(5, 15):
				var inset := mini(i - 5, 14 - i)
				im.fill_rect(Rect2i(5 + inset, i, 10 - inset * 2, 1), ink)
		"homeView":
			im.fill_rect(Rect2i(5, 9, 10, 8), ink)
			for i in range(3, 10):
				im.fill_rect(Rect2i(10 - i, i, i * 2, 1), Color("#c96d47"))
			im.fill_rect(Rect2i(9, 12, 3, 5), shade)
	cache[kind] = ImageTexture.create_from_image(im)
	return cache[kind]
