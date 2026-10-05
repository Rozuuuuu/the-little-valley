class_name CompanyView
extends Node2D
## A company in the field (src/render/Renderer.ts drawCompany / drawForeignCompany): its soldiers
## in a loose square, knights on horseback. The player's companies show their real soldiers (who
## are hidden from the map while deployed); other kingdoms' show four soldiers in a look made from
## the company's id. The banner and label are drawn by the overlay.

const SPACING := Vector2(54, 34)

var company_id := -1
var _art: Art
var _people: Dictionary
## settler id (or -1 - i for a foreign figure) -> [SettlerView, Sprite2D horse or null]
var _figures := {}
## Foreign companies' stand-in soldiers.
var _stand_ins: Array[Settler] = []


func setup(art: Art, people: Dictionary, c: Dictionary) -> void:
	_art = art
	_people = people
	company_id = int(c["id"])


static func _stand_in(c: Dictionary, i: int) -> Settler:
	var id := int(c["id"])
	var s := Settler.new()
	s.id = -1 - i
	s.appearance = {"skin": (id + i) % 4, "hair": ((id >> 2) + i) % 6, "hairStyle": (id + i) % 3, "shirt": 5, "pants": 2}
	s.military = {"unit": str(c.get("kind", "infantry")), "state": "deployed"}
	return s


## Places the soldiers. `members` are the settlers to draw (empty for a foreign company).
func refresh(c: Dictionary, members: Array, delta: float, motion: float) -> void:
	position = Vector2(float(c.get("x", 0)), float(c.get("y", 0))) * WorldView.TILE_PX
	var soldiers: Array = members
	if soldiers.is_empty():
		if _stand_ins.is_empty():
			for i in 4:
				_stand_ins.append(_stand_in(c, i))
		soldiers = _stand_ins
	var target: Variant = c.get("target")
	var marching: bool = target is Dictionary
	var facing := 0
	if marching:
		var dx := float(target["x"]) - float(c.get("x", 0))
		var dy := float(target["y"]) - float(c.get("y", 0))
		facing = (2 if dx < 0 else 3) if absf(dx) > absf(dy) else (1 if dy < 0 else 0)
	elif c.get("state") == "returning":
		facing = 1
	var seen := {}
	for i in soldiers.size():
		var s: Settler = soldiers[i]
		seen[s.id] = true
		var fig: Array = _figures.get(s.id, [])
		if fig.is_empty():
			var v := SettlerView.new()
			v.setup(_art, s, _people)
			var horse: Sprite2D = null
			if str(s.military.get("unit", "")) == "knight" and _art.has("animal_horse_0"):
				horse = Sprite2D.new()
				_art.apply(horse, "animal_horse_0")
				add_child(horse)
			add_child(v)
			fig = [v, horse]
			_figures[s.id] = fig
		var offset := Vector2((i % 2) * SPACING.x - SPACING.x / 2.0, floorf(i / 2.0) * SPACING.y - SPACING.y / 2.0)
		var view: SettlerView = fig[0]
		view.position = offset
		var horse_sprite: Sprite2D = fig[1]
		if horse_sprite != null:
			# The rider sits on the horse's back.
			horse_sprite.position = offset + Vector2(0, 6)
			horse_sprite.scale.x = -absf(horse_sprite.scale.x) if facing == 2 else absf(horse_sprite.scale.x)
			view.position = offset + Vector2(0, -22)
		view.pose(s, facing, marching, delta, motion)
	for id: int in _figures.keys():
		if not seen.has(id):
			for n: Variant in _figures[id]:
				if n != null:
					(n as Node).queue_free()
			_figures.erase(id)
