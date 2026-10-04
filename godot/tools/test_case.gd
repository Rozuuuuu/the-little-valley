class_name TestCase
extends RefCounted
## Base class for headless tests. A test file extends this and defines `test_*` methods.
## Run every test: see tools/run_tests.gd.

var failures: PackedStringArray = []
var checks := 0
## Stop reporting after this many failures in one test, so one broken table can't flood the log.
const MAX_REPORTED := 12


func check(ok: bool, message: String) -> bool:
	checks += 1
	if not ok and failures.size() < MAX_REPORTED:
		failures.append(message)
	return ok


func check_eq(actual: Variant, expected: Variant, message: String) -> bool:
	return check(actual == expected, "%s: expected %s, got %s" % [message, str(expected), str(actual)])


## Reads a JSON file and fails loudly (rather than returning null) if it is missing or malformed.
func load_json(path: String) -> Variant:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		check(false, "cannot read %s (error %d)" % [path, FileAccess.get_open_error()])
		return null
	var parsed: Variant = JSON.parse_string(text)
	check(parsed != null, "%s is not valid JSON" % path)
	return parsed


## IEEE-754 bits (16 hex digits, big-endian, as exported by scripts/export-golden.ts) to a float.
static func float_from_bits(hex: String) -> float:
	var bytes := hex.hex_decode()
	bytes.reverse()
	return bytes.decode_double(0)


static func bits_of(f: float) -> String:
	var bytes := PackedByteArray()
	bytes.resize(8)
	bytes.encode_double(0, f)
	bytes.reverse()
	return bytes.hex_encode()
