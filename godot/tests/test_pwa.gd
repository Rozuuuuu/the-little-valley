extends TestCase
## Install help per device (platform.ts detectDevice / installSteps).

class UpdateProbe:
	extends Pwa
	var applied := false
	func apply_update() -> void:
		applied = true

class SavedGame:
	extends Game
	var save_ok := false
	func save_now(_label: String = "") -> bool:
		return save_ok


func test_update_does_not_reload_without_a_saved_valley() -> void:
	var game := SavedGame.new()
	var original := game.pwa
	var probe := UpdateProbe.new()
	game.pwa = probe
	game.update_now()
	check(not probe.applied, "a failed save must prevent reloading")
	game.save_ok = true
	game.update_now()
	check(probe.applied, "a successful save permits the requested update")
	original.free()
	game.audio.free()
	game.particles.free()
	game.overlay.free()
	game.camera.free()
	for layer: Node in [game.view._ground_layer, game.view._field_layer, game.view.entities, game.view._night, game.view._lights]:
		layer.free()
	game.view.free()
	probe.free()
	game.free()


func test_devices_and_their_install_steps() -> void:
	var iphone := Pwa.detect_device("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", 5)
	check_eq(iphone, {"os": "ios", "browser": "safari"}, "iPhone Safari")
	var ipad := Pwa.detect_device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", 5)
	check_eq(ipad["os"], "ios", "an iPad asking for the desktop site")
	var edge := Pwa.detect_device("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0", 0)
	check_eq(edge, {"os": "desktop", "browser": "edge"}, "Edge on Windows")
	var samsung := Pwa.detect_device("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36", 5)
	check_eq(samsung, {"os": "android", "browser": "samsung"}, "Samsung Internet")
	check(Pwa.install_steps(iphone)[1].contains("Add to Home Screen"), "iPhone steps")
	check(Pwa.install_steps({"os": "ios", "browser": "chrome"})[0].contains("Share"), "iOS Chrome offers the Share menu")
	check(Pwa.install_steps({"os": "desktop", "browser": "firefox"})[0].contains("can’t install"), "desktop Firefox can't install apps")
	check(Pwa.runs_as_app(), "off the web the game is always the app")
