class_name Prof
## A minimal section profiler for benchmarks: `var t := Prof.begin()` ... `Prof.end("name", t)`.
## Off by default (begin returns 0 and end returns at once), so instrumented code costs almost
## nothing in play. tools/bench_sim.gd turns it on and prints the totals.

static var enabled := false
static var usec := {}
static var calls := {}


static func begin() -> int:
	return Time.get_ticks_usec() if enabled else 0


static func end(section: String, started: int) -> void:
	if not enabled:
		return
	usec[section] = int(usec.get(section, 0)) + Time.get_ticks_usec() - started
	calls[section] = int(calls.get(section, 0)) + 1


static func reset() -> void:
	usec.clear()
	calls.clear()


## Sections sorted by total time: [[name, ms, calls, µs per call], ...].
static func report() -> Array[Array]:
	var out: Array[Array] = []
	for k: String in usec:
		var c: int = calls[k]
		out.append([k, snappedf(int(usec[k]) / 1000.0, 0.1), c, snappedf(float(usec[k]) / c, 0.01)])
	out.sort_custom(func(a: Array, b: Array) -> bool: return float(a[1]) > float(b[1]))
	return out
