class_name PixelGround
extends RefCounted
## The ground palette of the browser game's terrain painter (src/render/terrainPainter.ts and
## palette.ts), with its seasonal overrides, as a 1-pixel-high texture the pixel ground shader
## reads by slot. Slot order must match the SLOT constants in ground.gdshader.

const SLOTS := ["grass0", "grass1", "grass2", "grass3", "meadow0", "meadow1", "meadow2", "meadow3",
	"forest0", "forest1", "forest2", "forestLeaf", "sand0", "sand1", "sand2", "sand3",
	"hill0", "hill1", "hill2", "hill3", "cliff0", "cliff1", "cliff2", "cliff3", "snowcap",
	"rock1", "rock2", "rock3", "dirt0", "dirt1", "dirt2", "dirt3",
	"water0", "water1", "water2", "water3", "foam", "deep0", "deep1",
	"stone0", "stone1", "stone2", "stone3", "wood0", "wood1", "wood2", "wood3",
	"flowerY", "flowerW", "flowerP", "flowerV", "flowerR", "fire1", "leaf1", "berry"]

const BASE := {
	"grass0": "#467f39", "grass1": "#56913f", "grass2": "#63a045", "grass3": "#85bd55",
	"meadow0": "#5a9c43", "meadow1": "#6aac4a", "meadow2": "#7aba52", "meadow3": "#98cc62",
	"forest0": "#2f5a2f", "forest1": "#3a6a36", "forest2": "#44773c", "forestLeaf": "#7a6a3a",
	"sand0": "#c9ae6c", "sand1": "#dbc284", "sand2": "#e8d49a", "sand3": "#b89a5c",
	"hill0": "#4c7437", "hill1": "#66903f", "hill2": "#76a049", "hill3": "#9dbd62",
	"cliff0": "#3d3845", "cliff1": "#625c6a", "cliff2": "#7f7987", "cliff3": "#aaa3b0", "snowcap": "#f3f7fa",
	"rock1": "#908a79", "rock2": "#a59f8b", "rock3": "#6a6558",
	"dirt0": "#9c7449", "dirt1": "#b18555", "dirt2": "#c39a66", "dirt3": "#84603c",
	"water0": "#2f6a9a", "water1": "#3b82b4", "water2": "#4d9dc9", "water3": "#6fbad9", "foam": "#d8f1f4",
	"deep0": "#244f7e", "deep1": "#2b5d8e",
	"stone0": "#5f646b", "stone1": "#80868c", "stone2": "#a3a8ab", "stone3": "#c8cccc",
	"wood0": "#5c3a22", "wood1": "#7a4e2c", "wood2": "#9a6538", "wood3": "#b98049",
	"flowerY": "#f4dc5c", "flowerW": "#f6f1e4", "flowerP": "#ec8fb0", "flowerV": "#a98bdc", "flowerR": "#e0584a",
	"fire1": "#f28a2e", "leaf1": "#3b7536", "berry": "#d9435a",
}

const SEASONS := {
	"spring": {},
	"summer": {"grass1": "#5a9a3c", "grass2": "#6aa742", "meadow1": "#72b046", "meadow2": "#83bf4c"},
	"autumn": {
		"grass0": "#6b7a34", "grass1": "#84913f", "grass2": "#98a147", "grass3": "#c3a44c",
		"meadow0": "#7d8a3a", "meadow1": "#9aa548", "meadow2": "#b3ad50", "meadow3": "#d0a24e",
		"forest0": "#4a4a26", "forest1": "#5b5a2c", "forest2": "#6a6230", "forestLeaf": "#c8702e",
		"hill0": "#5f6a30", "hill1": "#7f8a3c", "hill2": "#929a44", "hill3": "#bba34a",
	},
	"winter": {
		"grass0": "#aebdca", "grass1": "#e3eaf0", "grass2": "#edf2f6", "grass3": "#f8fbfd",
		"meadow0": "#aebdca", "meadow1": "#e6ecf1", "meadow2": "#f0f4f7", "meadow3": "#fafcfe",
		"forest0": "#9fb0be", "forest1": "#d7e0e8", "forest2": "#e2e9ef", "forestLeaf": "#8a7a5a",
		"sand0": "#c4ccd2", "sand1": "#dde4ea", "sand2": "#eef2f5", "sand3": "#b3bec8",
		"rock1": "#cfd7de", "rock2": "#e3e9ee", "rock3": "#97a2ac",
		"dirt0": "#8a7862", "dirt1": "#b9ab98", "dirt2": "#d6ccbf", "dirt3": "#9a8a74",
		"hill0": "#a3b3c1", "hill1": "#dfe7ee", "hill2": "#ebf1f5", "hill3": "#f8fbfd",
		"cliff3": "#f3f7fa",
	},
}


## The palette texture for a season (spring, summer, autumn, winter).
static func palette(season: String) -> ImageTexture:
	var over: Dictionary = SEASONS.get(season, {})
	var im := Image.create(SLOTS.size(), 1, false, Image.FORMAT_RGBA8)
	for i in SLOTS.size():
		im.set_pixel(i, 0, Color(str(over.get(SLOTS[i], BASE[SLOTS[i]]))))
	return ImageTexture.create_from_image(im)
