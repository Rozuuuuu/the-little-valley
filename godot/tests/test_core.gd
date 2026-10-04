extends TestCase
## The core numeric ports must match the browser game bit for bit (golden data from
## scripts/export-golden.ts and scripts/export-content.ts).

const GOLDEN := "res://tests/golden"


func test_i32_helpers() -> void:
	check_eq(I32.to_i32(0x80000000), -2147483648, "wrap 2^31")
	check_eq(I32.to_i32(-2147483649), 2147483647, "wrap -2^31-1")
	check_eq(I32.ushr(-1, 0), 4294967295, "-1 >>> 0")
	check_eq(I32.ushr(-1, 28), 15, "-1 >>> 28")
	check_eq(I32.imul(0x7fffffff, 0x7fffffff), 1, "imul max*max")
	check_eq(I32.imul(-5, 12345), -61725, "imul negative")
	check_eq(I32.imul(0xffffffff, 5), -5, "imul with uint input")
	check_eq(I32.from_float(-3.7), -3, "(-3.7)|0")
	check_eq(I32.from_float(4294967301.0), 5, "(2^32+5)|0")
	check_eq(I32.from_float(2147483648.0), -2147483648, "(2^31)|0")


func test_rng_sequences() -> void:
	var data: Dictionary = load_json(GOLDEN + "/rng.json")
	if data == null:
		return
	for case: Dictionary in data["rng"]:
		var seed_value := int(case["seed"])
		var r := Rng.new(seed_value)
		var values: Array = case["values"]
		var states: Array = case["states"]
		for i in values.size():
			var v := r.next()
			if not check_eq(bits_of(v), values[i], "seed %d value %d" % [seed_value, i]):
				break
			check_eq(r.state, int(states[i]), "seed %d state %d" % [seed_value, i])
		var r2 := Rng.new(seed_value)
		var ints: Array = case["ints"]
		for i in ints.size():
			check_eq(r2.int_below(i + 1), int(ints[i]), "seed %d int(%d)" % [seed_value, i + 1])


func test_hash2() -> void:
	var data: Dictionary = load_json(GOLDEN + "/rng.json")
	if data == null:
		return
	for h: Array in data["hashes"]:
		check_eq(WorldNoise.hash2(int(h[0]), int(h[1]), int(h[2])), int(h[3]), "hash2(%d, %d, %d)" % [int(h[0]), int(h[1]), int(h[2])])


func test_value_noise_and_fbm() -> void:
	var data: Array = load_json(GOLDEN + "/noise.json")
	if data == null:
		return
	for n: Dictionary in data:
		var x := float_from_bits(n["x"])
		var y := float_from_bits(n["y"])
		var s := int(n["s"])
		var where := "(%s, %s, %d)" % [str(x), str(y), s]
		check_eq(bits_of(WorldNoise.value_noise(x, y, s)), n["v"], "valueNoise" + where)
		check_eq(bits_of(WorldNoise.fbm(x, y, s, 2)), n["f2"], "fbm2" + where)
		check_eq(bits_of(WorldNoise.fbm(x, y, s, 3)), n["f3"], "fbm3" + where)
		check_eq(bits_of(WorldNoise.fbm(x, y, s, 4)), n["f4"], "fbm4" + where)


func test_hypot_matches_v8() -> void:
	var data: Dictionary = load_json(GOLDEN + "/math.json")
	if data == null:
		return
	for h: Array in data["hypot"]:
		var a := float_from_bits(h[0])
		var b := float_from_bits(h[1])
		check_eq(bits_of(JsMath.hypot(a, b)), h[2], "hypot(%s, %s)" % [str(a), str(b)])


func test_sin_matches_v8() -> void:
	var data: Dictionary = load_json(GOLDEN + "/math.json")
	if data == null:
		return
	var mismatches := 0
	var worst := 0.0
	for s: Array in data["sin"]:
		var a := float_from_bits(s[0])
		var expected := float_from_bits(s[1])
		var got := JsMath.sin_js(a)
		if got != expected:
			mismatches += 1
			worst = maxf(worst, absf(got - expected))
	var total: int = (data["sin"] as Array).size()
	check(mismatches == 0, "sin differs from V8 for %d of %d arguments (largest difference %s)" % [mismatches, total, str(worst)])


func test_content_floats_parse_exactly() -> void:
	var manifest: Dictionary = load_json("res://content/_manifest.json")
	if manifest == null:
		return
	var tables := {}
	for entry: Array in manifest["floats"]:
		var path: String = entry[0]
		var table := path.get_slice(".", 0)
		if not tables.has(table):
			tables[table] = load_json("res://content/%s.json" % table)
		var node: Variant = tables[table]
		for part in _path_parts(path.substr(table.length() + 1)):
			node = node[part] if node is Dictionary else (node as Array)[int(part)]
		check_eq(bits_of(float(node)), entry[1], "content %s" % path)


## GDScript reads long decimal literals inexactly (measured: 21-digit fdlibm constants came out one
## bit off), so game code may not contain them. Use JsMath.from_bits for exact constants.
func test_no_long_decimal_literals_in_game_code() -> void:
	var re := RegEx.create_from_string("(?<![\\w.])(\\d+\\.\\d+(?:[eE][-+]?\\d+)?)")
	for path in _gd_files("res://src"):
		var lines := FileAccess.get_file_as_string(path).split("\n")
		for i in lines.size():
			var line := lines[i]
			var code := line.get_slice("#", 0)
			for m in re.search_all(code):
				var digits := m.get_string(1).get_slice("e", 0).get_slice("E", 0).replace(".", "").lstrip("0")
				check(digits.length() <= 15, "%s:%d has a %d-digit literal %s" % [path, i + 1, digits.length(), m.get_string(1)])


func _gd_files(dir: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_gd_files(dir.path_join(d)))
	return out


## Splits `a.b[2].c` into ["a", "b", "2", "c"].
func _path_parts(path: String) -> PackedStringArray:
	var out: PackedStringArray = []
	for dotted in path.split("."):
		var pieces := dotted.replace("]", "").split("[")
		for p in pieces:
			out.append(p)
	return out
