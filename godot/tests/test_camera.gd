extends TestCase

func _wheel(z: Vector2, factor: float, times: int) -> Vector2:
	for i in times:
		z = CameraRig.step_zoom(z.x, z.y, factor)
	return z

func test_wheel_zooms_in_again_from_the_farthest_step() -> void:
	var far := CameraRig.PIXEL_STEPS[0]
	var z := _wheel(Vector2(far, far), 1.12, 6)
	check(z.y > far, "six wheel steps in leave the farthest zoom (got %s)" % z.y)
	z = _wheel(z, 1.0 / 1.12, 60)
	check_eq(z.y, far, "zooming out stops at the farthest step")
	z = _wheel(z, 1.12, 60)
	check_eq(z.y, CameraRig.PIXEL_STEPS[-1], "zooming in reaches the closest")
	z = _wheel(z, 1.0 / 1.12, 3)
	check(z.y < CameraRig.PIXEL_STEPS[-1], "and three steps out leave it again")
