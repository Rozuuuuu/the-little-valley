class_name WorkArea
extends RefCounted
## A rectangle of the valley with one kind of work in it (`WorkArea` in src/game/sim/types.ts).
## Settlers assigned to an area look for work inside it before their usual work order.

const KINDS: Array[String] = ["farm", "wood", "stone", "build", "hunt", "forage"]
const LABELS := {
	"farm": {"name": "Farm area", "noun": "Farm", "does": "Till, plant, water and harvest the fields inside"},
	"wood": {"name": "Woodlot", "noun": "Woodlot", "does": "Chop every tree inside (no marks needed) and replant a sapling in its place"},
	"stone": {"name": "Quarry", "noun": "Quarry", "does": "Mine every rock and boulder inside"},
	"build": {"name": "Building area", "noun": "Works", "does": "Build and supply construction sites inside"},
	"hunt": {"name": "Hunting ground", "noun": "Hunting ground", "does": "Hunt the wild game inside for meat and hides"},
	"forage": {"name": "Forage area", "noun": "Forage", "does": "Pick every berry bush inside"},
}
## Most settlers one work area can take.
const MAX_WORKERS := 12

var id := 0
var name := ""
var kind := "farm"
var x0 := 0
var y0 := 0
var x1 := 0
var y1 := 0
## Workers the area staffs itself with from free adults; -1: the player assigns by hand.
var wanted := -1
## Farm areas: the crop they lay out their own fields with ("" for none).
var crop := ""


func contains(x: int, y: int) -> bool:
	return x >= x0 and x <= x1 and y >= y0 and y <= y1


## Does a footprint overlap the area?
func overlaps(x: int, y: int, w: int = 1, h: int = 1) -> bool:
	return x <= x1 and x + w - 1 >= x0 and y <= y1 and y + h - 1 >= y0


func rect() -> Rect2i:
	return Rect2i(x0, y0, x1 - x0 + 1, y1 - y0 + 1)


func to_json() -> Dictionary:
	var d := {"id": id, "name": name, "kind": kind, "x0": x0, "y0": y0, "x1": x1, "y1": y1}
	if wanted >= 0:
		d["wanted"] = wanted
	if kind == "farm" and crop != "":
		d["crop"] = crop
	return d


static func from_json(d: Dictionary) -> WorkArea:
	var a := WorkArea.new()
	a.id = int(d["id"])
	a.name = str(d["name"])
	a.kind = str(d["kind"])
	a.x0 = int(d["x0"])
	a.y0 = int(d["y0"])
	a.x1 = int(d["x1"])
	a.y1 = int(d["y1"])
	a.wanted = int(d["wanted"]) if d.get("wanted") != null else -1
	a.crop = str(d["crop"]) if d.get("crop") != null else ""
	return a
