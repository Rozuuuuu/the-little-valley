class_name CameraRig
extends Camera2D
## The game camera: smooth panning (keys, screen edge, drag) and zoom toward the cursor, eased
## each frame. With pixel art, zoom settles on steps of 0.25, where one art pixel (4 world px)
## covers a whole number of screen pixels, so pixels stay even squares, as in the browser game.

const ZOOM_MIN := 0.3
const ZOOM_MAX := 2.5
## Pan speed in screen px per second (keys and screen edge).
const PAN_SPEED := 900.0
const EDGE := 6.0

var target_zoom := 1.0
var target_pos := Vector2.ZERO
var edge_scroll := true
var bindings := KeyBindings.new()
var keyboard_enabled := true
## Edge scrolling: while a valley is on screen with no window over it (set by the game).
var edge_enabled := true
var _drag_from: Variant = null
## Edge scrolling waits until the mouse has moved over the game: before that its position is
## unknown (a page reports 0, 0, which would pan up and left on its own).
var _mouse_seen := false
## Settle zoom on PIXEL_STEPS (pixel art).
var pixel_steps := true
const PIXEL_STEPS: Array[float] = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5]
## The unsnapped zoom the wheel and pinches move; the target is its nearest step.
var _free_zoom := 1.0


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_mouse_seen = true


func _ready() -> void:
	target_pos = position
	target_zoom = zoom.x


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if keyboard_enabled and bindings.pressed("panLeft"):
		dir.x -= 1
	if keyboard_enabled and bindings.pressed("panRight"):
		dir.x += 1
	if keyboard_enabled and bindings.pressed("panUp"):
		dir.y -= 1
	if keyboard_enabled and bindings.pressed("panDown"):
		dir.y += 1
	if edge_scroll and edge_enabled and _mouse_seen and DisplayServer.window_is_focused() and not OS.has_feature("mobile"):
		dir += _edge_dir()
	if dir != Vector2.ZERO:
		target_pos += dir.normalized() * PAN_SPEED * delta / zoom.x
	# Ease toward the targets (frame-rate independent).
	var k := 1.0 - exp(-delta * 14.0)
	position = position.lerp(target_pos, k)
	zoom = zoom.lerp(Vector2(target_zoom, target_zoom), k)
	if absf(zoom.x - target_zoom) < 0.002:
		zoom = Vector2(target_zoom, target_zoom)


## The edge-scroll direction. Inside the window: within EDGE px of a side. In a window (not full
## screen) the mouse can slip past the side, so a pointer just outside it keeps scrolling that way.
func _edge_dir() -> Vector2:
	var dir := Vector2.ZERO
	var size := get_viewport().get_visible_rect().size
	var m := get_viewport().get_mouse_position()
	if not OS.has_feature("web") and DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_WINDOWED:
		var wp := Vector2(DisplayServer.window_get_position())
		var ws := Vector2(DisplayServer.window_get_size())
		var sm := Vector2(DisplayServer.mouse_get_position())
		var outside := sm - wp
		var margin := 400.0
		if outside.x < -margin or outside.y < -margin or outside.x > ws.x + margin or outside.y > ws.y + margin:
			return dir
		# Screen coordinates in window pixels, then in viewport pixels.
		m = outside * (size / ws)
	if m.x < EDGE:
		dir.x -= 1
	elif m.x > size.x - EDGE:
		dir.x += 1
	if m.y < EDGE:
		dir.y -= 1
	elif m.y > size.y - EDGE:
		dir.y += 1
	return dir


## Zooms by `factor`, keeping the world point under `screen_point` fixed.
func zoom_at(factor: float, screen_point: Vector2) -> void:
	var before := screen_to_world(screen_point, target_zoom, target_pos)
	if pixel_steps:
		var st := step_zoom(_free_zoom, target_zoom, factor)
		_free_zoom = st.x
		target_zoom = st.y
	else:
		target_zoom = clampf(target_zoom * factor, ZOOM_MIN, ZOOM_MAX)
	var after := screen_to_world(screen_point, target_zoom, target_pos)
	target_pos += before - after


## One wheel or pinch step on the pixel zoom steps: (running zoom, step) from the old ones.
## The running zoom carries on while it still rounds to the current step (it has to travel past
## halfway to reach the next one), and starts again from the step if the zoom changed some other
## way. (Comparing distances instead reset it short of halfway between 0.25 and 0.5, so the wheel
## could never zoom back in from the farthest step.)
static func step_zoom(free: float, target: float, factor: float) -> Vector2:
	if nearest_step(free) != target:
		free = target
	free = clampf(free * factor, PIXEL_STEPS[0], PIXEL_STEPS[-1])
	return Vector2(free, nearest_step(free))


## The display's scaling (Windows display scale, the browser's device pixel ratio), in quarter
## steps from 1 to 3. The game draws 1:1 like the browser, so this sizes the interface and the
## starting zoom for high-density screens.
static func screen_scale() -> float:
	var s := DisplayServer.screen_get_scale()
	if OS.get_name() == "Windows":
		s = DisplayServer.screen_get_dpi() / 96.0
	return clampf(snappedf(s, 0.25), 1.0, 3.0)


## The starting zoom: the browser's default of 3 screen pixels per art pixel (a tile is 48 px),
## times the display's scaling.
static func default_zoom() -> float:
	return nearest_step(0.75 * screen_scale())


## The pixel zoom step nearest `z` (compared in log space, so steps feel even).
static func nearest_step(z: float) -> float:
	var best := PIXEL_STEPS[0]
	for st in PIXEL_STEPS:
		if absf(log(st) - log(z)) < absf(log(best) - log(z)):
			best = st
	return best


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
