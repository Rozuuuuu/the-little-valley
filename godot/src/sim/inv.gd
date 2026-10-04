class_name Inv
## Inventories are Dictionaries of resource id -> positive int. A resource at zero is absent,
## as in the browser game (`addInv`), so empty inventories compare equal.


static func add(inv: Dictionary, res: String, n: int) -> void:
	var v: int = inv.get(res, 0) + n
	if v <= 0:
		inv.erase(res)
	else:
		inv[res] = v


static func get_n(inv: Dictionary, res: String) -> int:
	return inv.get(res, 0)


## [res, n] pairs in the content's resource order (deterministic iteration).
static func entries(inv: Dictionary) -> Array[Array]:
	var out: Array[Array] = []
	for r in Defs.resource_ids():
		var n: int = inv.get(r, 0)
		if n != 0:
			out.append([r, n])
	return out


static func total(inv: Dictionary) -> int:
	var n := 0
	for v: int in inv.values():
		n += v
	return n


static func has_all(have: Dictionary, need: Dictionary, times: int = 1) -> bool:
	for k: String in need:
		if int(have.get(k, 0)) < int(need[k]) * times:
			return false
	return true


static func format(inv: Dictionary) -> String:
	var parts: PackedStringArray = []
	for e in entries(inv):
		parts.append("%d %s" % [e[1], e[0]])
	return ", ".join(parts)


## A copy with int values (JSON gives floats).
static func from_json(d: Variant) -> Dictionary:
	var out := {}
	if d is Dictionary:
		for k: String in d:
			var n := int(d[k])
			if n > 0:
				out[k] = n
	return out
