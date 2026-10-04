extends TestCase
## World generation must reproduce the browser game exactly: every generator's fingerprints
## (tests/fixtures/gen-v*-fingerprint.json in the browser repo) and full chunk dumps.

const GOLDEN := "res://tests/golden"


func test_tile_ids_match_content() -> void:
	var t: Dictionary = Content.get_value("tiles", "T")
	check_eq(int(t["DeepWater"]), Tiles.DEEP_WATER, "DeepWater")
	check_eq(int(t["Water"]), Tiles.WATER, "Water")
	check_eq(int(t["Sand"]), Tiles.SAND, "Sand")
	check_eq(int(t["Grass"]), Tiles.GRASS, "Grass")
	check_eq(int(t["Meadow"]), Tiles.MEADOW, "Meadow")
	check_eq(int(t["Forest"]), Tiles.FOREST, "Forest")
	check_eq(int(t["Rocky"]), Tiles.ROCKY, "Rocky")
	check_eq(int(t["Road"]), Tiles.ROAD, "Road")
	check_eq(int(t["Bridge"]), Tiles.BRIDGE, "Bridge")
	check_eq(int(t["StoneBridge"]), Tiles.STONE_BRIDGE, "StoneBridge")
	check_eq(int(t["Hill"]), Tiles.HILL, "Hill")
	check_eq(int(t["Mountain"]), Tiles.MOUNTAIN, "Mountain")
	var o: Dictionary = Content.get_value("tiles", "O")
	var names := {"None": Tiles.O_NONE, "Oak": Tiles.O_OAK, "Pine": Tiles.O_PINE, "Berry": Tiles.O_BERRY, "BerryEmpty": Tiles.O_BERRY_EMPTY,
		"Rock": Tiles.O_ROCK, "Boulder": Tiles.O_BOULDER, "Stump": Tiles.O_STUMP, "Sapling": Tiles.O_SAPLING}
	check_eq(o.size(), names.size(), "object id count")
	for k: String in names:
		check_eq(int(o[k]), names[k], "object %s" % k)


func test_river_center() -> void:
	var data: Dictionary = load_json(GOLDEN + "/math.json")
	if data == null:
		return
	for r: Array in data["riverCenter"]:
		check_eq(bits_of(WorldGen.river_center(int(r[0]), float(r[1]))), r[2], "riverCenter(%d, %d)" % [int(r[0]), int(r[1])])


func test_full_chunk_dumps() -> void:
	var data: Array = load_json(GOLDEN + "/chunks.json")
	if data == null:
		return
	for d: Dictionary in data:
		var c := WorldGen.generate_chunk(int(d["seed"]), int(d["cx"]), int(d["cy"]), int(d["gen"]), d["habitat"])
		var where := "gen %d %s seed %d chunk %d,%d" % [int(d["gen"]), d["habitat"], int(d["seed"]), int(d["cx"]), int(d["cy"])]
		_compare_bytes(c.terrain, (d["terrain"] as String).hex_decode(), where + " terrain")
		_compare_bytes(c.obj, (d["obj"] as String).hex_decode(), where + " objects")
		_compare_bytes(c.amt, (d["amt"] as String).hex_decode(), where + " amounts")


func test_generators_1_to_3_fingerprints() -> void:
	for gen: int in [1, 2, 3]:
		var fp: Dictionary = load_json(GOLDEN + "/gen-v%d-fingerprint.json" % gen)
		if fp == null:
			return
		for key: String in fp:
			var parts := key.split(":")
			var c := WorldGen.generate_chunk(int(parts[0]), int(parts[1]), int(parts[2]), gen)
			var expected: Array = fp[key]
			check_eq([WorldNoise.fnv(c.terrain), WorldNoise.fnv(c.obj)], [int(expected[0]), int(expected[1])], "gen %d chunk %s" % [gen, key])


func test_generator_4_fingerprints_every_habitat() -> void:
	var fp: Dictionary = load_json(GOLDEN + "/gen-v4-fingerprint.json")
	if fp == null:
		return
	check_eq(fp.size(), 135, "fingerprint count")
	for key: String in fp:
		var parts := key.split(":")
		var c := WorldGen.generate_chunk(int(parts[1]), int(parts[2]), int(parts[3]), 4, parts[0])
		var expected: Array = fp[key]
		check_eq([WorldNoise.fnv(c.terrain), WorldNoise.fnv(c.obj)], [int(expected[0]), int(expected[1])], "gen 4 chunk %s" % key)


func _compare_bytes(got: PackedByteArray, expected: PackedByteArray, where: String) -> void:
	if not check_eq(got.size(), expected.size(), where + " size"):
		return
	var diffs := 0
	var first := -1
	for i in got.size():
		if got[i] != expected[i]:
			diffs += 1
			if first < 0:
				first = i
	if diffs > 0:
		check(false, "%s: %d tiles differ, first at local (%d, %d): got %d, expected %d" % [where, diffs, first % 32, first / 32, got[first], expected[first]])
