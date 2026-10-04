class_name SettlerView
extends Node2D
## One settler on screen: tinted body parts (legs, body, head, hair, role hat), the tool in hand,
## carried goods over the shoulder, and a selection ring. Reads the Settler; never changes it.
##
## Animation: walking cycles four leg frames by distance moved and bobs; working swings the tool;
## sleeping outdoors lies down; asleep indoors hides. Side views are mirrored for facing right.

const ROLE_HATS := {"farmer": "farmer", "builder": "builder", "gatherer": "gatherer", "hauler": "hauler", "crafter": "crafter", "laborer": ""}

var settler_id: int
var selected := false
var hovered := false

var _art: Art
var _legs := Sprite2D.new()
var _body := Sprite2D.new()
var _head := Sprite2D.new()
var _hair := Sprite2D.new()
var _hat := Sprite2D.new()
var _tool := Sprite2D.new()
var _carry := Sprite2D.new()
var _parts: Node2D = Node2D.new()
var _walk_phase := 0.0
var _last_pos := Vector2.ZERO
var _dir := "down"
var _shown_carry := ""
var _shown_tool: StringName = &""
var _hair_style := 0


func setup(art: Art, s: Settler, people: Dictionary) -> void:
	_art = art
	settler_id = s.id
	add_child(_parts)
	for sp: Sprite2D in [_legs, _body, _head, _hair, _hat, _tool]:
		_parts.add_child(sp)
	add_child(_carry)
	var a := s.appearance
	_legs.self_modulate = Color(str((people["pants"] as Array)[int(a.get("pants", 0)) % 3]))
	_body.self_modulate = Color(str((people["shirt"] as Array)[int(a.get("shirt", 0)) % 6]))
	_head.self_modulate = Color(str((people["skin"] as Array)[int(a.get("skin", 0)) % 4]))
	_hair.self_modulate = Color(str((people["hair"] as Array)[int(a.get("hair", 0)) % 6]))
	_hair_style = int(a.get("hairStyle", 0)) % 3
	_carry.position = Vector2(12, -66)
	_carry.visible = false
	_last_pos = position
	_apply_dir("down", s.job)


func _apply_dir(dir: String, job: String) -> void:
	_dir = dir
	_art.apply(_body, "person_body_%s" % dir)
	_art.apply(_head, "person_head_%s" % dir)
	_art.apply(_hair, "person_hair_%d_%s" % [_hair_style, dir])
	var hat: String = ROLE_HATS.get(job, "")
	_hat.visible = hat != ""
	if hat != "":
		_art.apply(_hat, "person_hat_%s_%s" % [hat, dir])
	_art.apply(_legs, "person_legs_%s_0" % dir)


## Called every frame with the interpolated position (world px).
func refresh(s: Settler, pos: Vector2, delta: float, motion: float) -> void:
	position = pos
	visible = not s.hidden
	if not visible:
		return
	var dir := "down" if s.facing == 0 else ("up" if s.facing == 1 else "side")
	var job_key := s.job
	if dir != _dir or _hat.visible != (ROLE_HATS.get(job_key, "") != ""):
		_apply_dir(dir, job_key)
	_parts.scale.x = -1.0 if s.facing == 3 else 1.0
	var moved := pos.distance_to(_last_pos)
	_last_pos = pos
	var sleeping := s.anim == &"sleep"
	_parts.rotation = (PI / 2.0 if sleeping else 0.0)
	_parts.position = Vector2(-20, -8) if sleeping else Vector2.ZERO
	if s.anim == &"walk" and moved > 0.01:
		_walk_phase += moved / 9.0
		var frame := int(_walk_phase) % 4
		_art.apply(_legs, "person_legs_%s_%d" % [_dir, frame])
		_parts.position.y = -absf(sin(_walk_phase * PI / 2.0)) * 2.5 * motion
	elif not sleeping:
		_art.apply(_legs, "person_legs_%s_0" % _dir)
		# A slow breath while idle.
		_parts.position.y = sin(Time.get_ticks_msec() / 600.0 + settler_id) * 0.8 * motion
	# Tool in hand while working.
	var tool := s.tool if s.anim == &"work" else &""
	if tool != _shown_tool:
		_shown_tool = tool
		_tool.visible = tool != &"" and _art.has("tool_%s" % tool)
		if _tool.visible:
			_art.apply(_tool, "tool_%s" % tool)
	if _tool.visible:
		_tool.rotation = sin(Time.get_ticks_msec() / 130.0 + settler_id) * 0.22 * maxf(motion, 0.3)
	# Goods over the shoulder.
	var carry := s.carry_res if s.carrying() else ""
	if carry != _shown_carry:
		_shown_carry = carry
		_carry.visible = carry != "" and _art.has("icon_" + carry)
		if _carry.visible:
			_art.apply(_carry, "icon_" + carry)
			_carry.scale *= 0.42
	queue_redraw()


func _draw() -> void:
	if not visible:
		return
	# A flat ring on the ground under the feet.
	draw_set_transform(Vector2(0, -2), 0.0, Vector2(1.0, 0.45))
	if selected:
		draw_arc(Vector2.ZERO, 17.0, 0.0, TAU, 32, WorldView.GOLD, 3.0, true)
		draw_arc(Vector2.ZERO, 21.0, 0.0, TAU, 32, Color(WorldView.GOLD, 0.35), 3.0, true)
	elif hovered:
		draw_arc(Vector2.ZERO, 17.0, 0.0, TAU, 32, Color(WorldView.MINT, 0.9), 2.0, true)
