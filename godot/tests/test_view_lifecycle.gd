extends TestCase

func test_exiting_before_starting_a_valley_releases_drawing_layers() -> void:
	var view := WorldView.new()
	var layers: Array[Node] = [view._ground_layer, view._field_layer, view.entities, view._night, view._lights]
	for layer: Node in layers:
		check(layer.get_parent() == view, "drawing layers have an owner before the first valley")
	view.free()
	for layer: Node in layers:
		check(not is_instance_valid(layer), "closing the title releases every drawing layer")
		if is_instance_valid(layer):
			layer.free()
