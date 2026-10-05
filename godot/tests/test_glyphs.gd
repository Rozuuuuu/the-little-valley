extends TestCase
## Every character the interface can show is in the bundled font. On the web there is no system
## font to fall back on, so a missing glyph shows as a box.


func test_the_font_has_every_character_in_the_interface() -> void:
	var font: FontFile = load("res://fonts/AtkinsonHyperlegible-Regular.woff2")
	var bold: FontFile = load("res://fonts/AtkinsonHyperlegible-Bold.woff2")
	var string := RegEx.create_from_string(r'"(?:[^"\\]|\\.)*"')
	check(string.is_valid(), "string-literal scanner compiles")
	if not string.is_valid():
		return
	var missing := {}
	var files: Array[String] = []
	var dirs: Array[String] = ["res://src"]
	while not dirs.is_empty():
		var d: String = dirs.pop_back()
		for sub in DirAccess.get_directories_at(d):
			dirs.append(d.path_join(sub))
		for f in DirAccess.get_files_at(d):
			if f.ends_with(".gd"):
				files.append(d.path_join(f))
	for f in DirAccess.get_files_at("res://content"):
		if f.ends_with(".json"):
			files.append("res://content".path_join(f))
	for path in files:
		for line in FileAccess.get_file_as_string(path).split("\n"):
			if line.strip_edges().begins_with("#"):
				continue
			for m in string.search_all(line):
				var t := m.get_string()
				for i in t.length():
					var c := t.unicode_at(i)
					if c > 127 and not (font.has_char(c) and bold.has_char(c)):
						missing[t[i]] = path.get_file()
	check(missing.is_empty(), "characters the font lacks: %s" % str(missing))
