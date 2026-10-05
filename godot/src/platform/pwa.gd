class_name Pwa
extends Node
## The installed web app (src/ui/updates.ts, InstallGate.tsx, platform.ts): keeping it up to date
## and offering to install it.
##
## Updates: Godot's service worker fetches a newly published build in the background and
## JavaScriptBridge reports it (pwa_update_available). On the title screen the game switches
## offers "Update now"; mid-game the menu offers it after a successful save. A new build is looked
## for every ten minutes and whenever the game comes back to the front.
##
## Installing: the page catches the browser's install prompt (head_include in the export preset);
## the title offers it, or this device's steps, when the game runs in an ordinary browser tab.

signal update_ready

const CHECK_EVERY_S := 600.0

var update_waiting := false
var _check_at := 0.0
var _visible_cb: JavaScriptObject


func _ready() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.pwa_update_available.connect(_on_update)
	if JavaScriptBridge.pwa_needs_update():
		_on_update()
	_check_at = Time.get_ticks_msec() / 1000.0 + CHECK_EVERY_S
	_visible_cb = JavaScriptBridge.create_callback(func(_args: Array) -> void: check_now())
	JavaScriptBridge.get_interface("document").addEventListener("visibilitychange", _visible_cb)


func _on_update() -> void:
	update_waiting = true
	update_ready.emit()


## Asks the service worker to look for a newer build.
func check_now() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update(); }).catch(function () {})", true)


func _process(_delta: float) -> void:
	if _check_at > 0.0 and Time.get_ticks_msec() / 1000.0 >= _check_at:
		_check_at = Time.get_ticks_msec() / 1000.0 + CHECK_EVERY_S
		check_now()


## Switches to the downloaded build (the page reloads).
func apply_update() -> void:
	if update_waiting:
		JavaScriptBridge.pwa_update()


## Running as the installed app rather than in a browser tab.
static func runs_as_app() -> bool:
	if not OS.has_feature("web"):
		return true
	var v: Variant = JavaScriptBridge.eval("""(function () {
		var modes = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay'];
		for (var i = 0; i < modes.length; i++) if (window.matchMedia && window.matchMedia('(display-mode: ' + modes[i] + ')').matches) return true;
		return navigator.standalone === true || String(document.referrer).indexOf('android-app://') === 0;
	})()""", true)
	return v == true


## Whether the browser offered its own install button (caught by the page).
static func can_prompt() -> bool:
	return OS.has_feature("web") and JavaScriptBridge.eval("!!window.__lvInstall", true) == true


## Shows the browser's install prompt.
static func prompt_install() -> void:
	if can_prompt():
		JavaScriptBridge.eval("window.__lvInstall.prompt(); window.__lvInstall = null;", true)


## {os: ios|android|desktop, browser: safari|chrome|edge|firefox|samsung|other} (platform.ts).
static func detect_device(ua: String, touch_points: int) -> Dictionary:
	var ios := RegEx.create_from_string("iPhone|iPad|iPod").search(ua) != null or (ua.contains("Macintosh") and touch_points > 1)
	var os := "ios" if ios else ("android" if ua.contains("Android") else "desktop")
	var browser := "other"
	if ua.contains("SamsungBrowser"):
		browser = "samsung"
	elif RegEx.create_from_string("Edg(e|A|iOS)?/").search(ua) != null:
		browser = "edge"
	elif RegEx.create_from_string("Firefox|FxiOS").search(ua) != null:
		browser = "firefox"
	elif RegEx.create_from_string("Chrome|CriOS|Chromium").search(ua) != null:
		browser = "chrome"
	elif ua.contains("Safari"):
		browser = "safari"
	return {"os": os, "browser": browser}


## This page's device.
static func this_device() -> Dictionary:
	if not OS.has_feature("web"):
		return {"os": "desktop", "browser": "other"}
	return detect_device(str(JavaScriptBridge.eval("navigator.userAgent", true)), int(JavaScriptBridge.eval("navigator.maxTouchPoints || 0", true)))


## How to install the game on a device, step by step (platform.ts installSteps).
static func install_steps(d: Dictionary) -> PackedStringArray:
	var os: String = d["os"]
	var browser: String = d["browser"]
	if os == "ios":
		if browser != "safari":
			return ["Open the browser’s Share menu and choose “Add to Home Screen”.", "If that option is missing, open this page in Safari and use its Share menu.", "Tap “Add”, then open Little Valley from your Home Screen."]
		return ["Tap the Share button (the square with an arrow) at the bottom or top of Safari.", "Choose “Add to Home Screen”, then “Add”.", "Open Little Valley from your Home Screen."]
	if os == "android":
		if browser == "samsung":
			return ["Tap the menu (three lines) at the bottom of Samsung Internet.", "Choose “Add page to” › “Home screen”.", "Open Little Valley from your home screen."]
		if browser == "firefox":
			return ["Tap the menu (three dots) in Firefox.", "Choose “Install” (or “Add to Home screen”).", "Open Little Valley from your home screen."]
		return ["Tap the browser menu (three dots) at the top right.", "Choose “Install app” (or “Add to Home screen”).", "Open Little Valley from your home screen or app drawer."]
	if browser == "edge":
		return ["Open the Edge menu (…) at the top right.", "Choose “Apps” › “Install Little Valley”.", "Little Valley opens in its own window, and from now on from your Start menu or desktop."]
	if browser == "chrome":
		return ["Click the install icon at the right end of the address bar (a screen with an arrow), or open the menu (three dots) › “Cast, save and share” › “Install page as app”.", "Click “Install”.", "Little Valley opens in its own window, and from now on from your Start menu, dock or desktop."]
	if browser == "safari":
		return ["In Safari’s menu bar, choose File › “Add to Dock”.", "Click “Add”.", "Open Little Valley from your Dock or Applications folder."]
	return ["This browser can’t install apps. Open this page in Chrome or Microsoft Edge (or Safari on a Mac).", "Then install it from the browser’s menu.", "Little Valley opens in its own window from then on."]
