extends TestCase
## Ore deposits match the browser game cell for cell (golden geology.json from
## scripts/export-golden.ts): every generator, and every habitat on generator 4.


func test_deposits_match_the_browser_game() -> void:
	var data: Array = load_json("res://tests/golden/geology.json")
	for entry: Dictionary in data:
		var seed_value := int(entry["seed"])
		var gen := int(entry["gen"])
		var habitat := str(entry["habitat"])
		var label := "seed %d gen %d %s" % [seed_value, gen, habitat]
		var bad := 0
		var first := ""
		for c: Array in entry["cells"]:
			var d := Geology.deposit_in_cell(seed_value, gen, int(c[0]), int(c[1]), habitat)
			var want_none: bool = c[2] == null
			var same := d.is_empty() if want_none else (not d.is_empty() and int(d["id"]) == int(c[2]) and str(d["mineral"]) == str(c[3]) and int(d["x"]) == int(c[4]) and int(d["y"]) == int(c[5]) and int(d["initial"]) == int(c[6]))
			if not same:
				bad += 1
				if first == "":
					first = "cell %s,%s: got %s, want %s" % [c[0], c[1], d, c.slice(2)]
		check(bad == 0, "%s: %d cells differ (%s)" % [label, bad, first])
		var st := Geology.starter_deposits(seed_value, gen, habitat)
		for i in 2:
			var m: String = ["copper", "iron"][i]
			var want: Variant = (entry["starter"] as Array)[i]
			var got: Dictionary = st[m]
			if want == null:
				check(got.is_empty(), "%s: no starter %s" % [label, m])
			else:
				check(not got.is_empty() and int(got["x"]) == int(want[0]) and int(got["y"]) == int(want[1]), "%s: starter %s at %s, got %s" % [label, m, want, got])
