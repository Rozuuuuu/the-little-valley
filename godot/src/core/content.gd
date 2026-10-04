class_name Content
## Read-only access to the content tables in res://content/*.json.
##
## The tables are exported from the browser game by scripts/export-content.ts, so both versions
## share one set of balance numbers. Never edit them by hand while the browser game is the
## source of truth; re-run the export instead. Tables load once and are cached.

static var _tables := {}


## The whole table, e.g. `Content.table("buildings")["BUILDINGS"]`. Fails loudly if missing.
static func table(table_name: String) -> Dictionary:
	if _tables.has(table_name):
		return _tables[table_name]
	var path := "res://content/%s.json" % table_name
	var text := FileAccess.get_file_as_string(path)
	assert(not text.is_empty(), "Content table %s is missing (run scripts/export-content.ts)" % path)
	var parsed: Variant = JSON.parse_string(text)
	assert(parsed is Dictionary, "Content table %s is not a JSON object" % path)
	_tables[table_name] = parsed
	return parsed


## One named export of a table, e.g. `Content.get_value("habitats", "HABITATS")`.
static func get_value(table_name: String, key: String) -> Variant:
	var t := table(table_name)
	assert(t.has(key), "Content table %s has no %s" % [table_name, key])
	return t[key]
