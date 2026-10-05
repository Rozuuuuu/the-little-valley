class_name SettlerView
extends Node2D
## One settler on screen, drawn as in the browser game (Renderer.drawSettler): a pixel figure
## from the settler's own sheet (PixelPeople), the tool in hand while working, carried goods
## overhead, the ruler's crown, sleep and hunger marks, a contact shadow and a selection ring.
## Reads the Settler; never changes it.

## Soldiers always carry their weapon.
const UNIT_WEAPONS := {"infantry": &"sword", "archer": &"bow", "knight": &"sword"}
## World px per art pixel (64 per tile, 16 art pixels per tile).
const PX := 4.0

static var _people := PixelPeople.new()
## Health bars over everyone (the browser's default), or only over the hurt.
static var health_bars_all := true


## The shared sheet cache (portraits in the console use it too).
static func people() -> PixelPeople:
	return _people

var settler_id: int
var selected := false
var hovered := false

var _art: Art
var _figure := Sprite2D.new()
var _tool := Sprite2D.new()
var _carry := Sprite2D.new()
var _mark := Sprite2D.new()
var _shown_tool: StringName = &""
var _shown_carry := ""
var _shown_mark := ""
var _zzz2: Sprite2D = null
var _mark_base := Vector2.ONE
var _ring_state := -1
var _hp_shown := -1.0


func setup(art: Art, s: Settler, _people_palette: Dictionary = {}) -> void:
	_art = art
	settler_id = s.id
	_figure.texture = _people.sheet(s.appearance)
	_figure.region_enabled = true
	_figure.centered = false
	_figure.offset = Vector2(-PixelPeople.AX, -PixelPeople.AY)
	_figure.scale = Vector2(PX, PX)
	for sp: Sprite2D in [_tool, _figure, _carry, _mark]:
		add_child(sp)
		sp.visible = sp == _figure
	_set_frame(0, 0)


func _set_frame(facing: int, frame: int) -> void:
	_figure.region_rect = Rect2(frame * PixelPeople.FW, facing * PixelPeople.FH, PixelPeople.FW, PixelPeople.FH)


## The browser's frame choice for a settler's animation at time `t` (seconds).
static func frame_for(anim: StringName, carrying: bool, id: int, t: float) -> int:
	var phase := int(floorf(t * 8.0 + id * 0.37)) % 4
	match anim:
		&"walk":
			return (PixelPeople.FRAME["carry"] if carrying else PixelPeople.FRAME["walk"]) + phase
		&"work":
			return PixelPeople.FRAME["work"] + int(floorf(t * 3.2 + id * 0.5)) % 2
		&"sleep":
			return PixelPeople.FRAME["sleep"]
	return PixelPeople.FRAME["carry"] if carrying else PixelPeople.FRAME["idle"] + int(floorf(t * 1.4 + id)) % 2


## Called every frame with the interpolated position (world px).
func refresh(s: Settler, pos: Vector2, _delta: float, _motion: float) -> void:
	position = pos
	visible = not s.hidden
	if not visible:
		return
	var t := Time.get_ticks_msec() / 1000.0
	var carrying := s.carrying()
	var frame := frame_for(s.anim, carrying, s.id, t)
	_set_frame(s.facing, frame)
	scale = Vector2.ONE * (0.75 if s.life_stage == "child" else 1.0)
	var phase := int(floorf(t * 8.0 + s.id * 0.37)) % 4
	var tool: StringName = s.tool if s.anim == &"work" and s.tool != &"hand" else &""
	if not s.military.is_empty():
		tool = UNIT_WEAPONS.get(str(s.military.get("unit", "")), &"sword")
	_show_tool(tool, s.facing, frame == PixelPeople.FRAME["work"])
	# Goods overhead, bobbing with the step.
	var carry := s.carry_res if carrying else ""
	if carry != _shown_carry:
		_shown_carry = carry
		_carry.visible = carry != "" and _art.has("icon_" + carry)
		if _carry.visible:
			_art.apply(_carry, "icon_" + carry)
	_carry.position = Vector2(0, (-20 + phase % 2) * PX)
	# One mark overhead: the crown, else sleep or hunger.
	var mark := ""
	var lift := 0.0
	if s.ruler and s.anim != &"sleep":
		mark = "ui_crown"
		lift = -21 - (phase % 2 if s.anim == &"walk" else 0)
	elif s.anim == &"sleep":
		mark = "ui_zzz"
		lift = -25
	elif s.hunger < 15.0:
		mark = "ui_hungry"
		lift = -29 + roundf(sin(t * 4.0))
	elif (s.task == null or s.task.kind == Task.WANDER) and s.idle_reason != "" and s.idle_reason != "Stores are well stocked":
		mark = "ui_idle"
		lift = -29 + roundf(sin(t * 3.0 + s.id))
	if mark != _shown_mark:
		_shown_mark = mark
		_mark.visible = mark != "" and _art.has(mark)
		if _mark.visible:
			_art.apply(_mark, mark)
			_mark_base = _mark.scale
	_mark.position = Vector2(0, lift * PX)
	_mark.modulate.a = 1.0
	_mark.scale = _mark_base
	# Sleep: Z's drift up and to the side, growing and fading, two at a time (Renderer.drawSettler).
	var asleep := mark == "ui_zzz" and _mark.visible
	if asleep:
		var zt := fmod(t * 0.6 + s.id * 0.3, 1.0)
		_mark.position = Vector2(4.0 + zt * 3.0, -25.0 - zt * 8.0) * PX
		_mark.modulate.a = 1.0 - zt
		_mark.scale = _mark_base * (0.7 + zt * 0.5)
		if _zzz2 == null:
			_zzz2 = Sprite2D.new()
			_art.apply(_zzz2, "ui_zzz")
			add_child(_zzz2)
		var zt2 := fmod(zt + 0.5, 1.0)
		_zzz2.position = Vector2(4.0 + zt2 * 3.0, -25.0 - zt2 * 8.0) * PX
		_zzz2.modulate.a = (1.0 - zt2) * 0.8
		_zzz2.scale = _mark_base * (0.7 + zt2 * 0.5)
	if _zzz2 != null:
		_zzz2.visible = asleep
	var ring := 2 if selected else (1 if hovered else 0)
	var hp := s.hp if (health_bars_all or s.hp < 100.0) and s.anim != &"sleep" else -1.0
	if ring != _ring_state or hp != _hp_shown:
		_ring_state = ring
		_hp_shown = hp
		queue_redraw()


## The tool at the hand: raised above the head on the swing frame, at the side otherwise; behind
## the figure when facing away, mirrored when facing left.
func _show_tool(tool: StringName, facing: int, raised: bool) -> void:
	if tool != _shown_tool:
		_shown_tool = tool
		_tool.visible = tool != &"" and _art.has("tool_%s" % tool)
		if _tool.visible:
			_art.apply(_tool, "tool_%s" % tool)
	if not _tool.visible:
		return
	var side := -1.0 if facing == 2 else 1.0
	_tool.position = Vector2(side * (3.0 if raised else 6.0), -(16.0 if raised else 7.0)) * PX
	_tool.scale.x = -absf(_tool.scale.x) if facing == 2 else absf(_tool.scale.x)
	_tool.z_index = -1 if facing == 1 else 1


func _draw() -> void:
	if not visible:
		return
	# The browser's contact shadow: a dark 8x2 bar at the feet.
	draw_rect(Rect2(Vector2(-4, -1) * PX, Vector2(8, 2) * PX), Color(0.08, 0.05, 0.11, 0.3))
	if _hp_shown >= 0.0:
		draw_hp_bar(self, Vector2(0, -22) * PX, _hp_shown / 100.0, false)
	if selected:
		draw_set_transform(Vector2(0, -2), 0.0, Vector2(1.0, 0.45))
		draw_arc(Vector2.ZERO, 17.0, 0.0, TAU, 32, WorldView.GOLD, 3.0)
		draw_arc(Vector2.ZERO, 21.0, 0.0, TAU, 32, Color(WorldView.GOLD, 0.35), 3.0)
	elif hovered:
		draw_set_transform(Vector2(0, -2), 0.0, Vector2(1.0, 0.45))
		draw_arc(Vector2.ZERO, 17.0, 0.0, TAU, 32, Color(WorldView.MINT, 0.9), 2.0)


## The browser's health bar (Renderer.drawHpBar): 12×2 art pixels in a dark frame, green, then
## amber, then red; amber when healthy for animals that fight back.
static func draw_hp_bar(ci: CanvasItem, at: Vector2, frac: float, danger: bool) -> void:
	var f := clampf(frac, 0.0, 1.0)
	var fill := Color("#e0a040") if f > 0.6 and danger else (Color("#5ecb4a") if f > 0.6 else (Color("#e8c040") if f > 0.3 else Color("#e04848")))
	var w := 12.0 * PX
	ci.draw_rect(Rect2(at + Vector2(-w / 2.0 - PX, -PX), Vector2(w + 2.0 * PX, 4.0 * PX)), Color(0.1, 0.08, 0.13, 0.9))
	ci.draw_rect(Rect2(at + Vector2(-w / 2.0, 0), Vector2(w, 2.0 * PX)), Color("#4a3a3a"))
	ci.draw_rect(Rect2(at + Vector2(-w / 2.0, 0), Vector2(maxf(PX, roundf(12.0 * f) * PX), 2.0 * PX)), fill)


## Draws this figure as a soldier of a company in the field (the settler itself is hidden while
## deployed): facing `facing` (0 down, 1 up, 2 left, 3 right), marching or standing.
func pose(s: Settler, facing: int, marching: bool, _delta: float, _motion: float) -> void:
	visible = true
	var t := Time.get_ticks_msec() / 1000.0
	_set_frame(facing, frame_for(&"walk" if marching else &"idle", false, s.id, t))
	_show_tool(UNIT_WEAPONS.get(str(s.military.get("unit", "")), &"sword"), facing, false)
	_carry.visible = false
	_shown_carry = ""
	_mark.visible = false
	_shown_mark = ""
