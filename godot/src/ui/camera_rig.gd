class_name CameraRig
extends Camera2D
## The game camera: smooth panning (keys, screen edge, drag) and zoom toward the cursor, eased
## each frame. Positions and zoom are floats; nothing snaps to pixels.

const ZOOM_MIN := 0.3
const ZOOM_MAX := 2.5
## Pan speed in screen px per second (keys and screen edge).
const PAN_SPEED := 900.0
const EDGE := 6.0

var target_zoom := 1.0
var target_pos := Vector2.ZERO
var edge_scroll := true
var _drag_from: Variant = null


func _ready() -> void:
	target_pos = position
	target_zoom = zoom.x


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_action_pressed("ui_left") or Input.is_key_pressed(KEY_A):
		dir.x -= 1
	if Input.is_action_pressed("ui_right") or Input.is_key_pressed(KEY_D):
		dir.x += 1
	if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W):
		dir.y -= 1
	if Input.is_action_pressed("ui_down"):
		dir.y += 1
	if edge_scroll and DisplayServer.window_is_focused() and not OS.has_feature("mobile"):
		var m := get_viewport().get_mouse_position()
		var size := get_viewport().get_visible_rect().size
		if m.x >= 0 and m.y >= 0 and m.x <= size.x and m.y <= size.y:
			if m.x < EDGE:
				dir.x -= 1
			elif m.x > size.x - EDGE:
				dir.x += 1
			if m.y < EDGE:
				dir.y -= 1
			elif m.y > size.y - EDGE:
				dir.y += 1
	if dir != Vector2.ZERO:
		target_pos += dir.normalized() * PAN_SPEED * delta / zoom.x
	# Ease toward the targets (frame-rate independent).
	var k := 1.0 - exp(-delta * 14.0)
	position = position.lerp(target_pos, k)
	zoom = zoom.lerp(Vector2(target_zoom, target_zoom), k)


## Zooms by `factor`, keeping the world point under `screen_point` fixed.
func zoom_at(factor: float, screen_point: Vector2) -> void:
	var before := screen_to_world(screen_point, target_zoom, target_pos)
	target_zoom = clampf(target_zoom * factor, ZOOM_MIN, ZOOM_MAX)
	var after := screen_to_world(screen_point, target_zoom, target_pos)
	target_pos += before - after


func screen_to_world(p: Vector2, z: float = zoom.x, at: Vector2 = position) -> Vector2:
	var size := get_viewport().get_visible_rect().size
	return at + (p - size / 2.0) / z


## Starts or continues a drag pan (middle mouse, or one finger on touch).
func drag(screen_point: Vector2, pressed: bool) -> void:
	if not pressed:
		_drag_from = null
		return
	if _drag_from == null:
		_drag_from = screen_point
		return
	var from: Vector2 = _drag_from
	target_pos -= (screen_point - from) / zoom.x
	position = target_pos
	_drag_from = screen_point


func jump_to(world: Vector2) -> void:
	target_pos = world


## The visible world rectangle (px).
func view_rect() -> Rect2:
	var size := get_viewport().get_visible_rect().size / zoom.x
	return Rect2(position - size / 2.0, size)
