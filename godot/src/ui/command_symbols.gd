extends RefCounted
## Small original pixel symbols, cached once; labels remain visible beside every meaning.
static var cache: Dictionary = {}

static func texture(action: String, label: String) -> Texture2D:
	var kind := action
	if kind == "":
		kind = {"Back": "cancel", "Cancel": "cancel", "No train": "cancel", "Sites": "build", "Waiting": "waiting", "Home": "homeView"}.get(label, "")
	if kind not in ["move", "stop", "hold", "cancel", "unmark", "areas", "trainRole", "seeMore", "waiting", "homeView", "survey", "rally", "advice"]:
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
			# A shield: stand your ground.
			im.fill_rect(Rect2i(4, 3, 12, 8), Color("#8fa7c0"))
			for i in range(0, 7):
				im.fill_rect(Rect2i(4 + i, 11 + i, 12 - i * 2, 1), Color("#8fa7c0"))
			im.fill_rect(Rect2i(9, 4, 2, 12), ink)
			im.fill_rect(Rect2i(5, 7, 10, 2), ink)
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
		"trainRole":
			# A scholar's cap: learn a new main job.
			for i in range(0, 5):
				im.fill_rect(Rect2i(2 + i * 2, 8 - i, 16 - i * 4, 1), ink)
				im.fill_rect(Rect2i(2 + i * 2, 8 + i, 16 - i * 4, 1), ink)
			im.fill_rect(Rect2i(6, 11, 8, 4), shade)
			im.fill_rect(Rect2i(15, 8, 1, 7), Color("#f4cf5a"))
			im.fill_rect(Rect2i(14, 14, 3, 2), Color("#f4cf5a"))
		"seeMore":
			# An eye: everything about the selection.
			for i in range(0, 4):
				im.fill_rect(Rect2i(3 + i * 2, 9 - i, 14 - i * 4, 1), ink)
				im.fill_rect(Rect2i(3 + i * 2, 10 + i, 14 - i * 4, 1), ink)
			im.fill_rect(Rect2i(8, 7, 4, 6), Color("#4f7fb8"))
			im.fill_rect(Rect2i(9, 8, 2, 4), Color("#1a1208"))
			im.fill_rect(Rect2i(8, 7, 1, 1), Color.WHITE)
		"survey":
			# A magnifying glass over the rock: look for ore.
			for a in 16:
				var ang := a / 16.0 * TAU
				im.fill_rect(Rect2i(8 + roundi(cos(ang) * 5.0), 8 + roundi(sin(ang) * 5.0), 2, 2), ink)
			im.fill_rect(Rect2i(6, 6, 5, 5), Color("#9fd3e6"))
			for i in 5:
				im.fill_rect(Rect2i(13 + i, 13 + i, 2, 2), shade)
		"rally":
			# A horn: call the people together.
			for i in 10:
				var r := 1 + i / 3
				im.fill_rect(Rect2i(3 + i, 10 - r, 1, r * 2), Color("#e6c46a"))
			im.fill_rect(Rect2i(13, 5, 3, 10), Color("#e6c46a"))
			im.fill_rect(Rect2i(16, 6, 1, 8), shade)
			for i in 3:
				im.fill_rect(Rect2i(17 + (i % 2), 4 + i * 5, 2, 1), ink)
		"advice":
			# A question mark: hear the Assistant Chief.
			im.fill_rect(Rect2i(6, 3, 8, 2), ink)
			im.fill_rect(Rect2i(13, 4, 2, 5), ink)
			im.fill_rect(Rect2i(9, 9, 5, 2), ink)
			im.fill_rect(Rect2i(9, 11, 2, 2), ink)
			im.fill_rect(Rect2i(9, 15, 2, 2), ink)
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
