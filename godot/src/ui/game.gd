class_name Game
extends Node2D
## The running game: owns the Simulation, steps it at a fixed 10 ticks per second (scaled by game
## speed), draws it through WorldView, and turns player input into Commands. It never changes
## simulation state directly; every change is a command, which can refuse with a reason.
##
## Input: left click selects (drag for a box), right click gives the smart order (gather a
## resource, otherwise walk there), the wheel zooms, middle-drag or keys or the screen edge pan.
## Touch: tap selects or, with people selected, gives the order; one finger pans; two fingers
## pinch to zoom; press and hold, then drag, to select a group.

const TICK_MS := 100.0
const MAX_STEPS_PER_FRAME := 8
## Simulation time allowed per frame (ms) before the rest of a tick waits for the next frame.
var SIM_BUDGET_MS := 6.0
const LONG_PRESS := 0.4

var sim: Simulation
var art := Art.new()
## Saves live in the game's own folder (%APPDATA%\Little Valley on Windows); bring over any from
## the earlier location before settings and saves are read (members initialise in order).
var _user_dir_ready := UserDir.migrate_old()
var settings := Settings.load_saved()
var store := SaveStore.new()
var view := WorldView.new()
var camera := CameraRig.new()
var overlay := WorldOverlay.new()
var hud: Hud
var audio := AudioEngine.new()
var particles := Particles.new()
var pwa := Pwa.new()

var world_id := ""
var world_name := ""
var created_at := 0
var speed := 1
var paused := false
var selected: Array[int] = []
var selected_building := -1
var selected_animal := -1
## The people selected just before a building was clicked (the enlist button uses them).
var selected_before_building: Array[int] = []
var hover_tile := Vector2i(-99999, 0)
## Building type being placed, "mark"/"unmark" for harvest marks, "area:<kind>" for a new work
## area, or "".
var placing := ""
var ghost_tiles: Array = []
## The building being placed, drawn see-through at its spot (red where it can't go): its sprite
## name, footprint bottom-left tile and whether the spot is allowed. "" when none.
## What Valley today or a "find" just pointed at: {rect (tiles), t0 (seconds)}, or empty.
var highlight := {}
var ghost_sprite := ""
var ghost_at := Vector2i.ZERO
var ghost_ok := false
var drag_box := Rect2()
var markers: Array[Dictionary] = []

var _acc := 0.0
## Time spent this frame in the simulation and in updating the view (ms), for benchmarks.
var last_sim_ms := 0.0
var last_view_ms := 0.0
var _drag_start: Variant = null
var _autosave_at := 0.0
## The introduction: {step, done}; kept in the save file.
var tutorial := {"step": 0, "done": true}
var _tutorial_saved := false
## While the introduction's closing words show (msec).
var tutorial_outro_until := 0
## Valley today opens once settlers have picked their work (tick), summarising this session mark.
var _today_at := -1
var _today_prev := {}
var _touches := {}
var _pinch := 0.0
var _touch_down_at := 0.0
var _touch_moved := false
var _touch_box := false


## Startup timings (ms), printed by capture mode: engine start to _ready, art, first valley.
var startup := {}


func _ready() -> void:
	startup["engineToReady"] = Time.get_ticks_msec()
	var t0 := Time.get_ticks_msec()
	art.load_all(1.0)
	startup["art"] = Time.get_ticks_msec() - t0
	add_child(view)
	add_child(particles)
	view.life.particles = particles
	add_child(overlay)
	add_child(camera)
	add_child(audio)
	settings.apply_audio(audio)
	camera.make_current()
	camera.edge_scroll = settings.edge_scroll
	camera.scroll_speed = settings.scroll_speed
	camera.bindings = settings.bindings
	overlay.game = self
	hud = Hud.new()
	hud.game = self
	add_child(hud)
	pwa.update_ready.connect(_on_update_ready)
	add_child(pwa)
	if is_studio_app():
		# The Asset Studio is its own program (LittleValleyAssetStudio.exe, or `-- --studio-app`):
		# it opens straight into the studio over a living valley and shares the game's art folder.
		get_window().title = "Little Valley Asset Studio"
		_show_backdrop()
		hud._studio.app_mode = true
		hud.open_studio()
		for a in OS.get_cmdline_user_args():
			if a.begins_with("--shot="):
				_studio_shot.call_deferred(a.substr(7))
	elif not _capture_requested():
		_show_backdrop()
		hud.show_title()


func _studio_shot(path: String) -> void:
	for i in 60:
		await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png(path)
	print("captured studio app %s" % path)
	get_tree().quit()


static func is_studio_app() -> bool:
	return OS.has_feature("studio") or OS.get_cmdline_user_args().has("--studio-app")


# ---- capture mode (screenshots for review and benchmarks) ------------------------------------
# godot --path . -- --shot=<png> [--seed=N] [--ticks=N] [--zoom=Z] [--settlers=N] [--x=tile --y=tile]
# starts a new valley without the title screen, runs N ticks, frames a view and saves a screenshot.

func _capture_requested() -> bool:
	var opts := {}
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--") and a.contains("="):
			opts[a.substr(2, a.find("=") - 2)] = a.substr(a.find("=") + 1)
	# On the web there is no command line: the same options come from the page address,
	# e.g. index.html?bench=600&settlers=100 (results go to the browser console).
	if OS.has_feature("web"):
		var query := str(JavaScriptBridge.eval("location.search", true)).trim_prefix("?")
		for pair in query.split("&", false):
			var kv := pair.split("=")
			if kv.size() == 2:
				opts[kv[0]] = kv[1].uri_decode()
		if opts.has("bench"):
			opts["frames"] = opts["bench"]
			opts["shot"] = ""
	if opts.has("oldsaves"):
		_old_saves_check.call_deferred()
		return true
	if not opts.has("shot"):
		return false
	if opts.get("title", "0") == "1":
		_title_capture.call_deferred(opts)
		return true
	_capture.call_deferred(opts)
	return true


## `--title=1`: the opening title over its living backdrop, as a player first sees it.
func _title_capture(opts: Dictionary) -> void:
	_show_backdrop()
	hud.show_title()
	if opts.get("newworld", "0") == "1":
		hud.show_new_world()
	match str(opts.get("modal", "")):
		"load": hud.show_load()
		"settings": hud.show_settings()
	for i in 90:
		await get_tree().process_frame
	if str(opts["shot"]) != "":
		get_viewport().get_texture().get_image().save_png(str(opts["shot"]))
		print("captured title %s" % opts["shot"])
	print("CAPTURE DONE")
	if not OS.has_feature("web"):
		get_tree().quit()


## Web check (scripts/godot-web-oldsaves.ts): brings the old game's valleys in, opens each, and
## prints OLDSAVES {found, problems, worlds: [{id, name, day, people}]}.
func _old_saves_check() -> void:
	var pending := await old_game_pending()
	var problems := import_old_game(pending)
	var worlds := []
	for w: Dictionary in store.worlds():
		var got := store.load_point(w["id"])
		var r := SaveCodec.decode(got["data"]) if got["data"] != null else {"sim": null}
		var s: Simulation = r["sim"]
		worlds.append({"id": w["id"], "name": w["name"], "version": int(got["data"]["version"]) if got["data"] != null else -1,
			"people": s.settlers.size() if s != null else -1})
	var again := await old_game_pending()
	print("OLDSAVES %s" % JSON.stringify({"found": pending.size(), "problems": problems, "worlds": worlds, "pendingAfter": again.size()}))


func _capture(opts: Dictionary) -> void:
	world_name = "Capture"
	world_id = "capture"
	var t0 := Time.get_ticks_msec()
	# --camp=1: a new player's valley, starting from the founding camp (NewGame.create_camp).
	var make := NewGame.create_camp if opts.get("camp", "0") == "1" else NewGame.create
	_start(make.call(int(opts.get("seed", "4242")), WorldGen.CURRENT_GEN, str(opts.get("habitat", "valley")), str(opts.get("ruler", ""))))
	startup["newValley"] = Time.get_ticks_msec() - t0
	print("STARTUP %s" % JSON.stringify(startup))
	var extra := int(opts.get("settlers", "0"))
	for i in extra:
		sim.add_settler(-4 + (i % 9), 5 + i / 9, ["laborer", "farmer", "gatherer", "builder", "hauler"][i % 5])
	BuildingOps.camp_of(sim).inventory = {"food": 120, "wood": 80, "stone": 40}
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": -9, "y0": 3, "x1": -6, "y1": 6, "crop": "turnip"})
	Commands.apply(sim, {"type": "placeArea", "building": "field", "x0": 4, "y0": 4, "x1": 6, "y1": 6, "crop": "wheat"})
	_place_near_hall(["house", "storehouse"])
	Commands.apply(sim, {"type": "designate", "x0": -16, "y0": -16, "x1": 16, "y1": 16, "on": true})
	if opts.has("realm"):
		# A crowned kingdom that knows its neighbours, with an offer and some news waiting.
		for m: String in ["hamlet", "village", "town", "region"]:
			sim.reached.append(m)
		Commands.apply(sim, {"type": "coronate", "rulerName": "Lloyd", "kingdomName": "Valleyhold", "banner": {"color": "#3a6ea5", "emblem": "oak"}})
		Kingdoms.player(sim)["treasury"] = 300
		Commands.apply(sim, {"type": "appointCouncil", "post": "envoy", "settlerId": sim.settlers[0].id})
		var towns := Regions.nearby_towns(sim.seed_value)
		for i in mini(3, towns.size()):
			Kingdoms.know_of(sim, int(towns[i]["id"]))
		var rival := sim.kingdoms[1] as Dictionary
		Diplomacy.make_offer(sim, int(rival["id"]), 0, "trade", {"durationDays": 8, "payment": 0}, Defs.DAY_TICKS * 2)
		var ev := News.record_event(sim, "military-buildup", int(rival["id"]), 4, null)
		News.record_observation(sim, 0, int(rival["id"]), "military-buildup", null, {"eventId": ev["id"], "certainty": "rumor", "source": "merchant", "delay": 0})
	if opts.get("army", "0") == "1":
		# Soldiers: an infantry company marching east of the hall, a knight and an archer at home,
		# and a rival company of archers in the field.
		Commands.apply(sim, {"type": "coronate", "rulerName": "Lloyd", "kingdomName": "Valleyhold", "banner": {"color": "#3a6ea5", "emblem": "oak"}})
		var me := Kingdoms.player(sim)
		var hall := BuildingOps.camp_of(sim)
		var at := Vector2(hall.x + hall.w + 4.5, hall.y + 1.5)
		var company := {"id": sim.alloc_id(), "kind": "infantry", "strength": 3, "pledgedTo": null, "owner": Kingdoms.PLAYER, "members": [], "state": "deployed",
			"supplies": 3, "readiness": 100, "x": at.x, "y": at.y, "home": {"x": at.x, "y": at.y}, "target": {"x": at.x + 6.0, "y": at.y}, "path": null}
		for i in range(1, 3):
			var s := sim.settlers[i]
			s.military = {"unit": "infantry", "state": "deployed", "trained": 1.0, "companyId": company["id"], "buildingId": hall.id, "gear": {"swords": 1}}
			s.hidden = true
			(company["members"] as Array).append(s.id)
		(me["companies"] as Array).append(company)
		sim.settlers[3].military = {"unit": "knight", "state": "ready", "trained": 1.0, "companyId": company["id"], "buildingId": hall.id, "gear": {"swords": 1}}
		sim.settlers[4].military = {"unit": "archer", "state": "ready", "trained": 1.0, "companyId": company["id"], "buildingId": hall.id, "gear": {"bows": 1}}
		var towns := Regions.nearby_towns(sim.seed_value)
		if not towns.is_empty():
			var rival := Kingdoms.know_of(sim, int(towns[0]["id"]))
			var rc := Diplomacy.rival_companies(int(rival["id"]))
			if not rc.is_empty():
				var foe: Dictionary = rc[0]
				foe["kind"] = "archer"
				foe["state"] = "deployed"
				foe["x"] = at.x + 1.0
				foe["y"] = at.y + 4.0
				foe["health"] = 70
				rival["companies"] = [foe]
		opts["x"] = str(at.x)
		opts["y"] = str(at.y)
	if opts.get("towns", "0") == "1":
		# A waystation to the west with a depot at home and a wood route: carts on the road.
		sim.reached.append("hamlet")
		sim.reached.append("village")
		var tx := 6
		while tx >= -60:
			sim.world.reveal(tx, 0, 11)
			tx -= 3
		_place_near_hall(["depot"])
		var ws: Building = null
		for r in 12:
			for oy in range(-r, r + 1):
				for ox in range(-r, r + 1):
					if ws == null and bool(BuildingOps.check_placement(sim, "waystation", -40 + ox, oy)["ok"]):
						ws = BuildingOps.place(sim, "waystation", -40 + ox, oy)
						ws.delivered = BuildingOps.cost_of(ws).duplicate()
						BuildingOps.complete(sim, ws)
		for b: Building in sim.buildings.values():
			if b.type == "depot":
				b.delivered = BuildingOps.cost_of(b).duplicate()
				BuildingOps.complete(sim, b, true)
				Commands.apply(sim, {"type": "assignWorker", "buildingId": b.id, "ids": [sim.settlers[3].id]})
		BuildingOps.camp_of(sim).inventory["wood"] = 120
		if ws != null:
			Commands.apply(sim, {"type": "createRoute", "sourceId": BuildingOps.camp_of(sim).id, "destinationId": ws.id, "resource": "wood", "target": 60})
		opts["x"] = "-18"
		opts["y"] = "2"
	if opts.get("mining", "0") == "1":
		# The starter copper surveyed with a finished mine on it, and a quarry beside it.
		sim.reached.append("hamlet")
		var dep: Dictionary = Geology.starter_deposits(sim.seed_value, 3)["copper"]
		var dx := int(dep["x"])
		var dy := int(dep["y"])
		sim.world.reveal(dx, dy, 12)
		Mining.complete_survey(sim, sim.settlers[0], dx, dy)
		for type: String in ["mine", "quarry"]:
			var done := false
			for r in 8:
				for oy in range(-r, r + 1):
					for ox in range(-r, r + 1):
						if not done and bool(BuildingOps.check_placement(sim, type, dx + ox, dy + oy)["ok"]):
							var mb := BuildingOps.place(sim, type, dx + ox, dy + oy)
							mb.delivered = BuildingOps.cost_of(mb).duplicate()
							BuildingOps.complete(sim, mb, true)
							if type == "quarry":
								mb.quarry["extracted"] = 70
							done = true
		opts["x"] = str(dx)
		opts["y"] = str(dy)
	if opts.get("animals", "0") == "1":
		sim.reached.append("hamlet")
		_place_near_hall(["chickenCoop", "sheepPen", "hunterLodge"])
	if opts.get("areas", "0") == "1":
		Commands.apply(sim, {"type": "createArea", "kind": "farm", "x0": -14, "y0": 8, "x1": -6, "y1": 13, "wanted": 2, "crop": "turnip"})
		Commands.apply(sim, {"type": "createArea", "kind": "wood", "x0": 6, "y0": -14, "x1": 16, "y1": -6, "wanted": 2})
	for i in int(opts.get("ticks", "600")):
		sim.step()
	sim.drain_events()
	if not sim.settlers.is_empty():
		selected = [sim.settlers[0].id]
	camera.target_zoom = float(opts.get("zoom", "0.75"))
	view.sway_enabled = opts.get("sway", "1") != "0"
	view.ground_visible = opts.get("ground", "1") != "0"
	camera.zoom = Vector2.ONE * camera.target_zoom
	if opts.has("x"):
		camera.position = Vector2(float(opts["x"]), float(opts["y"])) * WorldView.TILE_PX
		camera.target_pos = camera.position
	if opts.get("people", "0") == "1":
		hud.toggle_people()
	if opts.get("areas", "0") == "1":
		hud.toggle_areas()
	if opts.get("towns", "0") == "1":
		hud.toggle_towns()
	if opts.get("studio", "0") == "1":
		# The Asset Studio on a house, with a drawn image uploaded into a separate capture pack
		# (the player's own art folder is never touched by captures).
		hud._studio.pack = ArtPack.new("user://capture_art")
		var im := Image.create(120, 100, false, Image.FORMAT_RGBA8)
		im.fill_rect(Rect2i(10, 40, 100, 60), Color("#c9a26b"))
		for y in 40:
			im.fill_rect(Rect2i(60 - y * 5 / 4 - 2, y, y * 5 / 2 + 4, 1), Color("#8a3b2e"))
		im.fill_rect(Rect2i(50, 70, 20, 30), Color("#5a3a22"))
		hud._studio.pack.set_image("house", im.save_png_to_buffer(), "my-house.png", 1, art.sprites)
		hud._studio.sprite = "house"
		hud.open_studio()
		hud._studio.choose("house")
	if opts.get("today", "0") == "1":
		# The introduction on its third step, and Valley today with a recorded session.
		tutorial = {"step": 2, "done": false}
		var mark := {"startTick": 0, "startStats": Simulation.empty_stats(), "startPopulation": sim.settlers.size()}
		sim.record("built", "Built a storehouse")
		hud.show_today(ValleyToday.build(sim, mark))
		hud.refresh_now()
	if opts.has("realm"):
		hud.toggle_realm()
		hud._realm.tab = str(opts["realm"]) if str(opts["realm"]) in RealmWindow.TABS else "Kingdoms"
		hud._realm._key = ""
		hud.refresh_now()
	if opts.get("upgrade", "0") == "1":
		# Starts upgrading the storehouse and selects it, to review the level UI.
		BuildingOps.camp_of(sim).inventory = {"food": 120, "wood": 300, "stone": 200, "planks": 80, "tools": 20}
		for b: Building in sim.buildings.values():
			if b.type == "storehouse" and b.built:
				Commands.apply(sim, {"type": "upgradeBuilding", "buildingId": b.id})
				for i in 300:
					sim.step()
				selected = []
				selected_building = b.id
				camera.position = Vector2(b.center_x(), b.center_y()) * WorldView.TILE_PX
				camera.target_pos = camera.position
	# Review captures of the interface: a window open, a selection, the build menu.
	match str(opts.get("window", "")):
		"people": hud.toggle_people()
		"families": hud.toggle_families()
		"goals": hud.toggle_goals()
		"goods": hud.toggle_goods()
		"areas": hud.toggle_areas()
		"towns": hud.toggle_towns()
		"realm": hud.toggle_realm()
		"help": hud.toggle_help()
	match str(opts.get("select", "")):
		"none":
			selected.clear()
		"settler":
			selected = [sim.settlers[0].id]
		"hall":
			var hall := BuildingOps.camp_of(sim)
			if hall != null:
				selected_building = hall.id
		"animal":
			if not sim.animals.is_empty():
				selected_animal = sim.animals[0].id
	if opts.get("totitle", "0") == "1":
		# Play, then Save and return to title: the menu must show a fresh world, not this village.
		return_to_title()
		for i in 90:
			await get_tree().process_frame
		get_viewport().get_texture().get_image().save_png(str(opts["shot"]))
		print("captured %s after returning to the title" % opts["shot"])
		get_tree().quit()
		return
	if opts.get("night", "0") == "1":
		# Jump the clock (only the clock) to the middle of the night, to see the lights.
		while sim.time_of_day() < 0.85 and sim.time_of_day() > 0.1:
			sim.tick += 1
		# Then live into the night, so people are in bed.
		while sim.time_of_day() < 0.95 and sim.time_of_day() > 0.1:
			sim.step()
	if opts.get("rain", "0") == "1":
		sim.raining = true
		view.life._weather.rain_amount = 1.0
	if opts.has("guide"):
		# The new player's guide at step N.
		tutorial = {"step": int(opts["guide"]), "done": false, "guided": true}
	if opts.get("story", "0") == "1":
		hud.show_origin_story()
	if opts.has("celebrate"):
		hud.show_celebration(str(opts["celebrate"]))
	if opts.get("advice", "0") == "1":
		hud.show_advice(sim.settlers[0], "We have more mouths than beds. Two more houses near the fields would settle everyone.")
	if opts.has("card"):
		# See more open on the selection, in one of its action modes (side, order, crop, job).
		hud.show_details()
	if opts.get("grid", "0") == "1":
		settings.show_grid = true
	if opts.has("place"):
		# Placing a building beside the hall, its see-through preview under the cursor.
		var camp := BuildingOps.camp_of(sim)
		placing = str(opts["place"])
		hover_tile = Vector2i(camp.x + camp.w + 3, camp.y + camp.h) if camp != null else Vector2i(4, 4)
		_update_ghost()
	if opts.get("build", "0") == "1":
		hud.console.menu = "build"
	elif opts.has("build"):
		hud.console.menu = str(opts["build"])
	for i in 20:
		await get_tree().process_frame
	if opts.has("frames"):
		await _frame_benchmark(int(opts["frames"]))
	if str(opts["shot"]) != "":
		var img := get_viewport().get_texture().get_image()
		img.save_png(str(opts["shot"]))
		print("captured %s (%dx%d), %d settlers, tick %d" % [opts["shot"], img.get_width(), img.get_height(), sim.settlers.size(), sim.tick])
	print("CAPTURE DONE")
	if not OS.has_feature("web"):
		get_tree().quit()


## Plays normally for `n` frames with vsync off, panning slowly, and prints frame-time
## percentiles, draw calls and memory (the Phase 3 frame benchmark).
func _frame_benchmark(n: int) -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = 0
	var times: Array[float] = []
	var sim_total := 0.0
	var view_total := 0.0
	var proc_total := 0.0
	var rcpu_total := 0.0
	var rgpu_total := 0.0
	var vp := get_viewport().get_viewport_rid()
	RenderingServer.viewport_set_measure_render_time(vp, true)
	var last := Time.get_ticks_usec()
	var start_pos := camera.target_pos
	for i in n:
		camera.target_pos = start_pos + Vector2(sin(i / 90.0), cos(i / 130.0)) * 600.0
		await get_tree().process_frame
		var now := Time.get_ticks_usec()
		times.append((now - last) / 1000.0)
		sim_total += last_sim_ms
		view_total += last_view_ms
		proc_total += Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
		rcpu_total += RenderingServer.viewport_get_measured_render_time_cpu(vp) + RenderingServer.get_frame_setup_time_cpu()
		rgpu_total += RenderingServer.viewport_get_measured_render_time_gpu(vp)
		last = now
	times.sort()
	var q := func(p: float) -> float: return times[mini(times.size() - 1, floori(times.size() * p))]
	var total := 0.0
	for t in times:
		total += t
	print("FRAMES %s" % JSON.stringify({
		"settlers": sim.settlers.size(), "frames": n, "avgMs": snappedf(total / n, 0.01), "p50": snappedf(q.call(0.5), 0.01),
		"p95": snappedf(q.call(0.95), 0.01), "p99": snappedf(q.call(0.99), 0.01), "max": snappedf(times[times.size() - 1], 0.01),
		"fps": snappedf(1000.0 / (total / n), 0.1),
		"simMsPerFrame": snappedf(sim_total / n, 0.01), "viewMsPerFrame": snappedf(view_total / n, 0.01),
		"processMs": snappedf(proc_total / n, 0.01), "renderCpuMs": snappedf(rcpu_total / n, 0.01), "renderGpuMs": snappedf(rgpu_total / n, 0.01),
		"sway": view.sway_enabled, "ground": view.ground_visible,
		"drawCalls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"objects": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"staticMemMB": snappedf(Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, 0.1),
		"videoMemMB": snappedf(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0, 0.1),
		"gpu": RenderingServer.get_video_adapter_name(),
	}))


## Places each building at the first valid spot near the hall (capture scenes only).
func _place_near_hall(types: Array) -> void:
	for type: String in types:
		var done := false
		for r in range(5, 16):
			for y in range(-r, r + 1):
				for x in range(-r, r + 1):
					if not done and bool(Commands.apply(sim, {"type": "place", "building": type, "x": x, "y": y})["ok"]):
						done = true


# ---- title backdrop -----------------------------------------------------------------------------

## The title's backdrop: a random wild world drifting by behind the menu, its animals going about
## their day. It is never saved; the first real valley replaces it.
var backdrop: Simulation = null
var _backdrop_acc := 0.0


func _show_backdrop() -> void:
	# A new, random world every time the title opens: its own seed and kind of land, framed on
	# wild country well away from where its people start, with the wildlife going about its day.
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var ids: Array = Content.get_value("habitats", "HABITAT_IDS")
	var s := NewGame.create(rng.randi() & 0x7FFFFFFF, WorldGen.CURRENT_GEN, str(ids[rng.randi() % ids.size()]))
	backdrop = s
	if view.art == null:
		view.setup(s, art)
	else:
		view.set_simulation(s)
	view.fog.veil = false
	camera.target_zoom = CameraRig.default_zoom()
	camera.zoom = Vector2.ONE * camera.target_zoom
	var camp := BuildingOps.camp_of(s)
	var home := Vector2(camp.center_x(), camp.y + camp.h) if camp != null else Vector2.ZERO
	var spot := _wild_spot(s, home, rng)
	s.world.reveal(spot.x, spot.y, 56.0)
	_backdrop_reveal_at = spot
	_backdrop_t = 0.0
	camera.position = spot * WorldView.TILE_PX
	camera.target_pos = camera.position


var _backdrop_reveal_at := Vector2.ZERO
var _backdrop_t := 0.0


## Mostly dry land, ideally with some water, 30–45 tiles from the start, so the title shows country, not the hamlet.
func _wild_spot(s: Simulation, home: Vector2, rng: RandomNumberGenerator) -> Vector2:
	var best := home + Vector2(36, 0)
	var best_score := -1
	for attempt in 10:
		var a := rng.randf() * TAU
		var p := home + Vector2(cos(a), sin(a)) * rng.randf_range(30.0, 45.0)
		var score := 0
		var water := false
		for dy in range(-8, 9, 4):
			for dx in range(-14, 15, 4):
				var tx := floori(p.x) + dx
				var ty := floori(p.y) + dy
				s.world.ensure(tx >> Chunk.SHIFT, ty >> Chunk.SHIFT)
				var t := s.world.terrain(tx, ty)
				water = water or t == Tiles.WATER
				if s.world.naturally_walkable(tx, ty):
					score += 2 if s.world.obj(tx, ty) != Tiles.O_NONE else 1
		# A lake or river in view makes a better picture.
		if water:
			score += 20
		if score > best_score:
			best_score = score
			best = p
	return best


## Runs the backdrop at normal speed and drifts the camera slowly east.
func _step_backdrop(delta: float) -> void:
	_backdrop_acc = minf(_backdrop_acc + delta * 1000.0, TICK_MS * 2)
	while _backdrop_acc >= TICK_MS:
		backdrop.begin_tick()
		backdrop.update_settlers(0, backdrop.settlers.size())
		backdrop.end_tick()
		backdrop.drain_events()
		_backdrop_acc -= TICK_MS
	# A slow, endless glide over the land, like a game menu's panorama: a wide figure of eight
	# around the chosen spot (all of it explored when the backdrop was made).
	if settings.motion() > 0.0:
		_backdrop_t += delta
	var drift := Vector2(sin(_backdrop_t * 0.03) * 14.0, sin(_backdrop_t * 0.06) * 5.0)
	camera.target_pos = (_backdrop_reveal_at + drift) * WorldView.TILE_PX
	view.motion = settings.motion()
	# Animals glide between ticks as in play.
	view.refresh(clampf(_backdrop_acc / TICK_MS, 0.0, 1.0), camera.view_rect(), delta)
	particles.step(delta, backdrop, camera.view_rect(), art, settings.effects == "low", backdrop.is_night())


# ---- worlds -----------------------------------------------------------------------------------

## The Assistant Chief's advice, read in a window (the game waits while it is open).
func hear_advice() -> void:
	var chief := Roles.chief_of(sim)
	var text := str(sim.chief["advice"])
	if chief == null or not bool(command({"type": "hearAdvice"})["ok"]):
		return
	hud.show_advice(chief, text)


## Leaves the valley for the title: saves it, then shows a fresh random world behind the menu
## (never the village just left).
func return_to_title(message: String = "") -> void:
	if sim != null:
		save_now()
	sim = null
	selected.clear()
	selected_building = -1
	selected_animal = -1
	cancel_placing()
	paused = false
	_show_backdrop()
	hud.show_title(message)


func new_world(seed_value: int, habitat: String, valley_name: String, ruler_name: String = "", introduction: bool = true) -> void:
	hud.show_busy("Shaping the valley…")
	await get_tree().process_frame
	var s := NewGame.create_camp(seed_value, WorldGen.CURRENT_GEN, habitat, ruler_name)
	world_id = "valley-%d-%d" % [seed_value, Time.get_ticks_msec()]
	world_name = valley_name
	created_at = int(Time.get_unix_time_from_system() * 1000)
	_start(s)
	tutorial = {"step": 0, "done": not introduction, "guided": true}
	save_now("New valley")
	_tutorial_saved = false


func load_world(id: String, point: String = "") -> void:
	hud.show_busy("Opening the valley…")
	await get_tree().process_frame
	var got := store.load_point(id, point)
	if got["data"] == null:
		hud.show_title(got["error"])
		return
	var r := SaveCodec.decode(got["data"])
	if r["sim"] == null:
		hud.show_title("This valley could not be opened: %s. Nothing was changed or deleted." % r["error"])
		return
	world_id = id
	# Summarise the previous session before this one starts overwriting the mark; settlers pick
	# their work during the first second, so the summary is gathered a moment later.
	var s: Simulation = r["sim"]
	_today_prev = s.session.duplicate(true)
	s.start_session()
	var tut: Variant = got["data"].get("tutorial")
	var meta: Dictionary = got["data"]["meta"]
	world_name = str(meta.get("name", id))
	created_at = int(meta.get("createdAt", 0))
	_start(s)
	_today_at = s.tick + 12
	tutorial = {"step": int(tut.get("step", 0)), "done": tut.get("done", true) == true, "guided": bool(tut.get("guided", false)), "awaiting": bool(tut.get("awaiting", false))} if tut is Dictionary else {"step": 0, "done": true}
	if str(got["error"]) != "":
		hud.toast(got["error"], "warn")
	var report: PackedStringArray = r["report"]
	if not report.is_empty():
		hud.toast("Not in this version yet, kept in the save file: " + "; ".join(report), "warn")
	var view_data: Dictionary = got["data"].get("view", {})
	if view_data.has("camX"):
		camera.position = Vector2(float(view_data["camX"]), float(view_data["camY"]))
		camera.target_pos = camera.position


## Keeps a save brought in from outside (a file, or the old browser game) as a new world on this
## device and opens it. Older versions are stored converted; the source is never changed.
## Returns "" or the reason it could not be brought in.
func import_save(text: String, id: String, label: String, open_it: bool = true) -> String:
	var err := store.import_text(text, id, label)
	if err == "" and open_it:
		load_world(id)
	return err


## Brings in a save file the player picked.
func load_from_file() -> void:
	var picked := await Files.pick(self)
	if picked["text"] == "":
		return
	var err := import_save(picked["text"], "file-%d" % int(Time.get_unix_time_from_system() * 1000), "Loaded from %s" % picked["name"])
	if err != "":
		hud.show_title("%s could not be loaded: %s. The file was not changed." % [picked["name"], err])


## The old browser game's valleys not brought in yet (web only).
func old_game_pending() -> Array[Dictionary]:
	var have := {}
	for w: Dictionary in store.worlds():
		have[w["id"]] = true
	var out: Array[Dictionary] = []
	for e: Dictionary in await Files.old_game_saves():
		if e["slot"] != "" and not have.has(old_world_id(e["slot"])) and not (e["candidates"] as Array).is_empty():
			out.append(e)
	return out


static func old_world_id(slot: String) -> String:
	return "browser-" + slot.validate_filename()


## Brings in every given old-game valley, each from its newest copy that loads. Returns the problems.
func import_old_game(entries: Array[Dictionary]) -> PackedStringArray:
	var problems: PackedStringArray = []
	for e: Dictionary in entries:
		var first := ""
		var ok := false
		for text: String in e["candidates"]:
			var err := import_save(text, old_world_id(e["slot"]), "From the old game", false)
			if err == "":
				ok = true
				break
			if first == "":
				first = err
		if not ok:
			problems.append("%s: %s" % [e["name"], first])
	return problems


## Offers the current valley as a file.
func download_save() -> void:
	if sim == null:
		return
	var data := SaveCodec.encode(sim, world_name, created_at, {"camX": camera.position.x, "camY": camera.position.y, "zoom": camera.zoom.x})
	var r := Files.download(Files.save_file_name(world_name, int(data["meta"]["day"])), data)
	if not bool(r["ok"]):
		hud.toast(r["error"], "warn")
	elif str(r["path"]) != "":
		hud.toast("Saved a copy to %s" % r["path"], "good")


## Updates reload every browser tab: offer an explicit choice even on the title.
func _on_update_ready() -> void:
	if sim == null:
		hud.show_title("A new version is ready. Save and close any other Little Valley tabs before updating.")
	else:
		hud.toast("A new version of Little Valley is ready: Menu › Update now (your valley is saved first).", "info")


## Saves, then switches to the new version.
func update_now() -> void:
	if save_now("Before updating"):
		pwa.apply_update()


## Valley today on request: how things stand now (no session recap).
func open_today() -> void:
	if sim != null:
		hud.show_today(ValleyToday.build(sim, {}))


func skip_tutorial() -> void:
	tutorial["done"] = true


func restart_tutorial() -> void:
	tutorial = {"step": 0, "done": false, "guided": true}
	_tutorial_saved = false


## Moves the camera to a Valley today target and selects what it names.
func focus_target(t: Variant) -> void:
	if not t is Dictionary:
		return
	var c := Vector2(float(t["x"]) + float(t["w"]) / 2.0, float(t["y"]) + float(t["h"]) / 2.0) * WorldView.TILE_PX
	camera.target_pos = c
	# Pulsing corner brackets round what was named (Renderer.drawHighlight).
	highlight = {"rect": Rect2(float(t["x"]), float(t["y"]), float(t["w"]), float(t["h"])), "t0": Time.get_ticks_msec() / 1000.0}
	if t.has("settlerId"):
		selected = [int(t["settlerId"])]
		selected_building = -1
	elif t.has("buildingId"):
		selected.clear()
		selected_building = int(t["buildingId"])


func _start(s: Simulation) -> void:
	sim = s
	backdrop = null
	view.set_simulation(s)
	if view.art == null:
		view.setup(s, art)
	view.fog.veil = true
	selected.clear()
	selected_building = -1
	placing = ""
	var camp := BuildingOps.camp_of(sim)
	var focus := Vector2(camp.center_x(), camp.y + camp.h + 1) if camp != null else Vector2.ZERO
	camera.position = focus * WorldView.TILE_PX
	camera.target_pos = camera.position
	camera.target_zoom = CameraRig.default_zoom()
	camera.zoom = Vector2.ONE * camera.target_zoom
	_autosave_at = Time.get_ticks_msec() / 1000.0 + settings.autosave_minutes * 60.0
	paused = false
	_today_at = -1
	_tutorial_saved = false
	tutorial_outro_until = 0
	hud.show_play()


func save_now(label: String = "") -> bool:
	if sim == null:
		return false
	_settle_tick()
	var data := SaveCodec.encode(sim, world_name, created_at, {"camX": camera.position.x, "camY": camera.position.y, "zoom": camera.zoom.x})
	data["tutorial"] = tutorial.duplicate()
	var r := store.save(world_id, world_name, data, label)
	if bool(r["ok"]):
		_tutorial_saved = true
	if bool(r["ok"]):
		hud.toast("Saved." if label == "" else "Saved: %s" % label, "good")
	else:
		hud.toast(r["error"], "warn")
	_autosave_at = Time.get_ticks_msec() / 1000.0 + settings.autosave_minutes * 60.0
	return bool(r["ok"])


# ---- the loop ---------------------------------------------------------------------------------

func _process(delta: float) -> void:
	var focus := get_viewport().gui_get_focus_owner()
	camera.keyboard_enabled = sim != null and not hud.blocking() and not (focus is LineEdit or focus is TextEdit)
	camera.edge_enabled = sim != null and not hud.title_or_window_open()
	if sim == null:
		audio.busy = false
		if backdrop != null:
			_step_backdrop(delta)
		return
	var t_sim := Time.get_ticks_usec()
	if not paused and not hud.blocking() and not Tutorial.waiting(tutorial):
		_acc += delta * 1000.0 * speed
		_run_ticks(t_sim)
		for e in sim.drain_events():
			_on_event(e)
	if _today_at != -1 and sim.tick >= _today_at:
		_today_at = -1
		hud.show_today(ValleyToday.build(sim, _today_prev))
	if Tutorial.advance(tutorial, sim, selected.size(), _tutorial_saved):
		tutorial_outro_until = Time.get_ticks_msec() + 12000
	var t_view := Time.get_ticks_usec()
	last_sim_ms = (t_view - t_sim) / 1000.0
	audio.set_mood(sim.is_night(), sim.raining)
	audio.busy = not paused and not hud.blocking()
	var alpha := clampf(_acc / TICK_MS, 0.0, 1.0)
	view.motion = settings.motion()
	SettlerView.health_bars_all = settings.health_bars == "always"
	view.refresh(alpha, camera.view_rect(), delta)
	particles.step(delta, sim, camera.view_rect(), art, settings.effects == "low", sim.is_night())
	last_view_ms = (Time.get_ticks_usec() - t_view) / 1000.0
	for id: int in view.settler_views:
		var v: SettlerView = view.settler_views[id]
		v.selected = selected.has(id)
	overlay.queue_redraw()
	hud.refresh(delta)
	if settings.autosave_minutes > 0 and Time.get_ticks_msec() / 1000.0 > _autosave_at:
		save_now()


## Runs the simulation in slices within a hard time budget per frame (SIM_BUDGET_MS, at least
## one slice). The next tick is worked on while the last one is still being shown (people glide
## from where they were to where it put them), and is applied only when its time comes: so the
## picture never waits for a tick to be computed, and walking stays smooth however many settlers
## there are. On a device too slow to keep up, game time runs slower rather than the frame rate
## collapsing: a backlog of more than MAX_BACKLOG ticks is dropped (never caught up in one frame).
func _run_ticks(started_usec: int) -> void:
	var frames_per_tick := maxf(1.0, TICK_MS / (1000.0 / maxf(1.0, Engine.get_frames_per_second())) / speed)
	# Aim to finish a tick's work in about two thirds of the tick, leaving room to spare.
	var slice := maxi(8, ceili(sim.settlers.size() / maxf(1.0, frames_per_tick * 0.66)))
	while true:
		if sim.slice_next == -1:
			sim.begin_tick()
		var n := sim.settlers.size()
		while sim.slice_next < n:
			sim.update_settlers(sim.slice_next, sim.slice_next + slice)
			if (Time.get_ticks_usec() - started_usec) / 1000.0 > SIM_BUDGET_MS:
				_trim_backlog()
				return
		if _acc < TICK_MS:
			break
		sim.end_tick()
		_acc -= TICK_MS
		if (Time.get_ticks_usec() - started_usec) / 1000.0 > SIM_BUDGET_MS:
			break
	_trim_backlog()


## Completes the tick being worked on ahead of time (before saving, so a save never holds half a
## tick).
func _settle_tick() -> void:
	if sim == null or sim.slice_next == -1:
		return
	sim.update_settlers(sim.slice_next, sim.settlers.size())
	sim.end_tick()
	_acc = maxf(0.0, _acc - TICK_MS)


## Ticks owed beyond this are dropped: the game slows down instead of stalling to catch up.
const MAX_BACKLOG := 3
## True while the device can't keep up at this speed (shown in the HUD).
var falling_behind := false


func _trim_backlog() -> void:
	falling_behind = _acc > TICK_MS * MAX_BACKLOG
	if falling_behind:
		_acc = TICK_MS * MAX_BACKLOG


func _on_event(e: Dictionary) -> void:
	match str(e["type"]):
		"toast":
			hud.toast(str(e["text"]), str(e.get("level", "info")))
		"sfx":
			sfx_at(str(e["name"]), e.get("x"), e.get("y"))
			# Goods into store float up from the storehouse door ("+3 wood").
			if int(e.get("n", 0)) > 0 and settings.effects != "low":
				var res_name := str(Defs.resource(str(e["res"])).get("name", e["res"])).to_lower()
				particles.float_text(float(e["x"]), float(e["y"]), "+%d %s" % [int(e["n"]), res_name], Color("#ffe08a"))
		"fx", "hit":
			particles.on_event(e)
		"death":
			view.life.add_corpse(e)
		"milestone":
			var ms: Dictionary = Content.get_value("progression", "MILESTONES")
			if int((ms.get(str(e["id"]), {}) as Dictionary).get("tier", 0)) >= 2:
				# A short, quiet celebration: sparkles around the camp and a card with what's next.
				var camp := BuildingOps.camp_of(sim)
				if camp != null:
					for i in 6:
						particles.fx("sparkle", camp.x + randf() * 3.0, camp.y + randf() * 2.0)
				hud.show_celebration(str(e["id"]))
		"advice":
			var c := sim.settler(int(e["settlerId"]))
			if c != null:
				hud.toast("%s, your Assistant Chief, has advice — click the “?” over them (or press %s)." % [c.name, settings.bindings.label("advice")])
				audio.play("uiOpen")


## Plays a sound from a place in the world: quieter with distance from the middle of the view,
## panned to its side (as GameController.sfxAt).
func sfx_at(name: String, x: Variant = null, y: Variant = null) -> void:
	if x == null or y == null:
		audio.play(name)
		return
	var r := camera.view_rect()
	var view := maxf(r.size.x, r.size.y)
	var dx := float(x) * WorldView.TILE_PX - r.get_center().x
	var dy := float(y) * WorldView.TILE_PX - r.get_center().y
	var d := Vector2(dx, dy).length() / view
	audio.play(name, maxf(0.0, 1.0 - d * 1.1), clampf(dx / (view / 2.0), -0.8, 0.8))


# ---- commands from the interface ----------------------------------------------------------------

## Sends a command and shows its message (refusals in warning colour).
func command(cmd: Dictionary) -> Dictionary:
	var r := Commands.apply(sim, cmd)
	var msg := str(r.get("message", ""))
	audio.play("command" if bool(r["ok"]) else "error")
	if not bool(r["ok"]):
		hud.toast(msg if msg != "" else "That can't be done", "warn")
	elif msg != "":
		hud.toast(msg, "info")
	return r


func start_placing(type: String) -> void:
	placing = type
	selected_building = -1
	hud.refresh_now()


func cancel_placing() -> void:
	placing = ""
	ghost_tiles = []
	drag_box = Rect2()
	_drag_start = null


# ---- input --------------------------------------------------------------------------------------

func _tile_at(screen: Vector2) -> Vector2i:
	var w := camera.screen_to_world(screen) / WorldView.TILE_PX
	return Vector2i(floori(w.x), floori(w.y))


func _unhandled_input(event: InputEvent) -> void:
	if sim == null:
		return
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		_touch_input(event)
		return
	if event is InputEventMouse and (event as InputEventMouse).device == InputEvent.DEVICE_ID_EMULATION:
		# Touch is handled above; ignore the mouse events Godot emulates from it.
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		match mb.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				camera.zoom_at(1.12, mb.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				camera.zoom_at(1.0 / 1.12, mb.position)
			MOUSE_BUTTON_MIDDLE:
				camera.drag(mb.position, mb.pressed)
			MOUSE_BUTTON_LEFT:
				if mb.pressed:
					_drag_start = camera.screen_to_world(mb.position)
				else:
					_primary_release(mb.position, mb.shift_pressed)
			MOUSE_BUTTON_RIGHT:
				if mb.pressed:
					if placing != "":
						cancel_placing()
					else:
						order_at(_tile_at(mb.position), camera.screen_to_world(mb.position) / WorldView.TILE_PX)
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if mm.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
			camera.drag(mm.position, true)
		_pointer_moved(mm.position)
	elif event is InputEventKey and event.pressed and not event.echo:
		_key(event as InputEventKey)


func _pointer_moved(p: Vector2) -> void:
	hover_tile = _tile_at(p)
	if _drag_start != null:
		var a: Vector2 = _drag_start
		var b := camera.screen_to_world(p)
		drag_box = Rect2(a, Vector2.ZERO).expand(b) if a.distance_to(b) > 6.0 / camera.zoom.x else Rect2()
	_update_ghost()


func _update_ghost() -> void:
	ghost_tiles = []
	ghost_sprite = ""
	if placing == "" or hover_tile.x == -99999 or placing.begins_with("area:") or placing.begins_with("order:") or placing == "survey" or placing == "claim" or placing.begins_with("company:"):
		return
	if placing != "mark" and placing != "unmark" and Defs.building(placing).has("span"):
		if drag_box.has_area():
			var sr := _tile_rect(drag_box)
			var sc := BuildingOps.check_span(sim, placing, sr.position.x, sr.position.y, sr.end.x - 1, sr.end.y - 1)
			ghost_tiles = sc["tiles"]
		else:
			ghost_tiles = [[hover_tile.x, hover_tile.y, sim.world.terrain(hover_tile.x, hover_tile.y) == Tiles.WATER or sim.world.terrain(hover_tile.x, hover_tile.y) == Tiles.DEEP_WATER]]
		return
	if placing == "mark" or placing == "unmark" or Defs.building(placing).get("paint", false):
		if drag_box.has_area():
			var r := _tile_rect(drag_box)
			if placing == "mark" or placing == "unmark":
				return
			for y in range(r.position.y, r.end.y):
				for x in range(r.position.x, r.end.x):
					ghost_tiles.append([x, y, bool(BuildingOps.check_placement(sim, placing, x, y)["ok"])])
			return
		ghost_tiles = BuildingOps.check_placement(sim, placing, hover_tile.x, hover_tile.y)["tiles"] if placing != "mark" and placing != "unmark" else []
		return
	var at := _placement_anchor(placing, hover_tile)
	var check := BuildingOps.check_placement(sim, placing, at.x, at.y)
	ghost_tiles = check["tiles"]
	if art.has(placing):
		ghost_sprite = placing
		ghost_at = Vector2i(at.x, at.y + int(Defs.building(placing)["size"]["h"]))
		ghost_ok = bool(check["ok"])


## Single buildings are placed centred on the cursor, sitting on the hovered row.
func _placement_anchor(type: String, tile: Vector2i) -> Vector2i:
	var size: Dictionary = Defs.building(type)["size"]
	return Vector2i(tile.x - (int(size["w"]) - 1) / 2, tile.y - (int(size["h"]) - 1))


func _tile_rect(world: Rect2) -> Rect2i:
	var a := Vector2i(floori(world.position.x / WorldView.TILE_PX), floori(world.position.y / WorldView.TILE_PX))
	var b := Vector2i(floori(world.end.x / WorldView.TILE_PX), floori(world.end.y / WorldView.TILE_PX))
	return Rect2i(a, b - a + Vector2i.ONE)


func _primary_release(screen: Vector2, additive: bool) -> void:
	var box := drag_box
	_drag_start = null
	drag_box = Rect2()
	if placing != "":
		_place(screen, box)
		return
	if box.has_area():
		if not additive:
			selected.clear()
		for s in sim.settlers:
			if not s.hidden and box.has_point(Vector2(s.x, s.y) * WorldView.TILE_PX) and not selected.has(s.id):
				selected.append(s.id)
		selected_building = -1
	else:
		click_select(screen, additive)
	if not selected.is_empty() or selected_building != -1 or selected_animal != -1:
		audio.play("select")
	hud.refresh_now()


func _place(screen: Vector2, box: Rect2) -> void:
	if placing.begins_with("order:"):
		# Move, Attack or Gather from the command card, then a click where (as the browser).
		var kind := placing.substr(6)
		var t := _tile_at(screen)
		var w := camera.screen_to_world(screen) / WorldView.TILE_PX
		if kind == "move":
			if bool(command({"type": "move", "ids": selected.duplicate(), "x": t.x, "y": t.y})["ok"]):
				markers.append({"p": (Vector2(t) + Vector2(0.5, 0.5)) * WorldView.TILE_PX, "t": Time.get_ticks_msec() / 1000.0, "kind": "move"})
		elif kind == "attack":
			var an := animal_at(w)
			if an == null or an.pen_id != -1:
				hud.toast("Click a wild animal to hunt it.", "info")
				return
			order_at(t, w)
		else:
			var o := sim.world.obj(t.x, t.y)
			if o == World.UNKNOWN or Tiles.object_resource[o] == "":
				hud.toast("Click a tree, rock or bush to gather it.", "info")
				return
			order_at(t, w)
		cancel_placing()
		return
	if placing == "claim":
		var sec := Territory.sector_of(_tile_at(screen).x, _tile_at(screen).y)
		if bool(command({"type": "claimFrontier", "sector": {"x": sec.x, "y": sec.y}})["ok"]):
			cancel_placing()
		return
	if placing.begins_with("company:"):
		var t := _tile_at(screen)
		if bool(command({"type": "orderCompany", "companyId": int(placing.substr(8)), "order": "move", "x": t.x, "y": t.y, "supplyDays": 2})["ok"]):
			cancel_placing()
		return
	if placing == "survey":
		if not selected.is_empty():
			var t := _tile_at(screen)
			if bool(command({"type": "surveyDeposit", "settlerId": selected[0], "x": t.x, "y": t.y})["ok"]):
				cancel_placing()
		return
	if placing.begins_with("area:"):
		if not box.has_area():
			return
		var ar := _tile_rect(box)
		var res := command({"type": "createArea", "kind": placing.substr(5), "x0": ar.position.x, "y0": ar.position.y, "x1": ar.end.x - 1, "y1": ar.end.y - 1})
		if bool(res["ok"]):
			# People selected while drawing go to work there.
			if not selected.is_empty():
				command({"type": "assignArea", "ids": selected.duplicate(), "areaId": res["id"]})
			cancel_placing()
			hud.show_areas()
		return
	if placing == "mark" or placing == "unmark":
		var r := _tile_rect(box) if box.has_area() else Rect2i(_tile_at(screen), Vector2i.ONE)
		command({"type": "designate", "x0": r.position.x, "y0": r.position.y, "x1": r.end.x - 1, "y1": r.end.y - 1, "on": placing == "mark"})
		return
	if Defs.building(placing).has("span"):
		var sr := _tile_rect(box) if box.has_area() else Rect2i(_tile_at(screen), Vector2i.ONE)
		if bool(command({"type": "placeSpan", "building": placing, "x0": sr.position.x, "y0": sr.position.y, "x1": sr.end.x - 1, "y1": sr.end.y - 1})["ok"]):
			cancel_placing()
		return
	if Defs.building(placing).get("paint", false):
		var r := _tile_rect(box) if box.has_area() else Rect2i(_tile_at(screen), Vector2i.ONE)
		command({"type": "placeArea", "building": placing, "x0": r.position.x, "y0": r.position.y, "x1": r.end.x - 1, "y1": r.end.y - 1})
		return
	var at := _placement_anchor(placing, _tile_at(screen))
	var res := command({"type": "place", "building": placing, "x": at.x, "y": at.y})
	if bool(res["ok"]) and not Input.is_key_pressed(KEY_SHIFT):
		cancel_placing()


## Selects the settler or building under a screen point.
func click_select(screen: Vector2, additive: bool) -> void:
	var w := camera.screen_to_world(screen) / WorldView.TILE_PX
	var best := -1
	var best_d := 0.7
	for s in sim.settlers:
		if s.hidden:
			continue
		# Settlers are drawn standing on their position; their body is above it.
		var d := Vector2(s.x, s.y - 0.5).distance_to(w)
		if d < best_d:
			best_d = d
			best = s.id
	var adviser := Roles.advice_showing(sim)
	if adviser != null and Vector2(adviser.x, adviser.y - 1.6).distance_to(w) < 0.6:
		hear_advice()
		return
	if not selected.is_empty():
		selected_before_building = selected.duplicate()
	if not additive:
		selected.clear()
	selected_building = -1
	selected_animal = -1
	if best == -1:
		var an := animal_at(w)
		if an != null:
			selected_animal = an.id
			return
	if best != -1:
		if selected.has(best):
			selected.erase(best)
		else:
			selected.append(best)
		return
	var b := sim.building_at(floori(w.x), floori(w.y))
	if b != null:
		selected_building = b.id


## The animal drawn under a point in tiles, or null.
func animal_at(w: Vector2) -> Animal:
	var best: Animal = null
	var best_d := 0.8
	for a in sim.animals:
		var d := Vector2(a.x, a.y - 0.3).distance_to(w)
		if d < best_d:
			best_d = d
			best = a
	return best


## The smart order: hunt an animal, work at a building under the cursor, gather a resource there,
## otherwise walk.
func order_at(tile: Vector2i, world: Vector2 = Vector2(INF, INF)) -> void:
	if selected.is_empty():
		return
	if world.x != INF:
		var an := animal_at(world)
		if an != null and an.pen_id == -1:
			if bool(command({"type": "hunt", "ids": selected.duplicate(), "animalId": an.id})["ok"]):
				markers.append({"p": Vector2(an.x, an.y) * WorldView.TILE_PX, "t": Time.get_ticks_msec() / 1000.0, "kind": "work"})
			return
	var o := sim.world.obj(tile.x, tile.y)
	var p := (Vector2(tile) + Vector2(0.5, 0.5)) * WorldView.TILE_PX
	var b := sim.building_at(tile.x, tile.y)
	if b != null:
		if bool(command({"type": "work", "ids": selected.duplicate(), "buildingId": b.id})["ok"]):
			markers.append({"p": p, "t": Time.get_ticks_msec() / 1000.0, "kind": "work"})
		return
	if o != World.UNKNOWN and Tiles.object_resource[o] != "" and sim.world.amount(tile.x, tile.y) > 0:
		if bool(command({"type": "gather", "ids": selected.duplicate(), "x": tile.x, "y": tile.y})["ok"]):
			markers.append({"p": p, "t": Time.get_ticks_msec() / 1000.0, "kind": "work"})
		return
	if bool(command({"type": "move", "ids": selected.duplicate(), "x": tile.x, "y": tile.y})["ok"]):
		markers.append({"p": p, "t": Time.get_ticks_msec() / 1000.0, "kind": "move"})


func _key(k: InputEventKey) -> void:
	var focus := get_viewport().gui_get_focus_owner()
	if focus is LineEdit or focus is TextEdit:
		return
	if k.ctrl_pressed and KeyBindings.code(k) == KEY_S and sim != null and not hud.title_or_window_open():
		hud.toast("Saved." if save_now() else "Could not save.")
		return
	var action := settings.bindings.action_for(k)
	if hud._studio.app_mode or (hud.blocking() and action != "cancel"):
		return
	# The command card answers to its own keys first (as the browser's console does).
	if hud.console.handle_key(k):
		return
	match action:
		"advice":
			if Roles.advice_showing(sim) != null:
				hear_advice()
			else:
				var c := Roles.chief_of(sim)
				if c != null:
					selected = [c.id]
					camera.jump_to(Vector2(c.x, c.y) * WorldView.TILE_PX)
					hud.toast("%s is on the way to you with advice." % c.name if bool(sim.chief["adviceReady"]) else "%s has no advice just now — they will come to you when they do." % c.name)
				else:
					hud.toast("You have no Assistant Chief yet — upgrade the Town Hall to a Castle and train one there.")
		"toggleGrid":
			settings.show_grid = not settings.show_grid
			settings.save()
			hud.toast("Tile grid on (%s to hide)." % settings.bindings.label("toggleGrid") if settings.show_grid else "Tile grid off.")
		"cancel":
			if placing != "":
				cancel_placing()
			elif not selected.is_empty() or selected_building != -1:
				selected.clear()
				selected_building = -1
			else:
				hud.toggle_menu()
		"pause":
			paused = not paused
		"speed1":
			speed = 1
		"speed2":
			speed = 2
		"speed3":
			speed = 4
		"stop":
			if not selected.is_empty():
				command({"type": "stop", "ids": selected.duplicate()})
		"hold":
			if not selected.is_empty():
				command({"type": "hold", "ids": selected.duplicate()})
		"returnGoods":
			if not selected.is_empty():
				command({"type": "returnGoods", "ids": selected.duplicate()})
		"harvest":
			start_placing("mark")
		"unmark":
			start_placing("unmark")
		"demolish":
			if selected_building != -1:
				command({"type": "remove", "buildingId": selected_building})
				selected_building = -1
		"save":
			save_now()
		"people":
			hud.toggle_people()
		"areas":
			hud.toggle_areas()
		"towns":
			hud.toggle_towns()
		"today":
			open_today()
		"realm":
			hud.toggle_realm()
		"rally":
			if sim.ruler() != null and selected.has(sim.ruler().id):
				command({"type": "rally"})
		"selectAll":
			selected.clear()
			for s in sim.settlers:
				selected.append(s.id)
		"zoomIn":
			camera.zoom_at(1.3, get_viewport().get_visible_rect().size / 2.0)
		"zoomOut":
			camera.zoom_at(1.0 / 1.3, get_viewport().get_visible_rect().size / 2.0)
		"build":
			hud.console.menu = "build"
		"nextIdle":
			hud.console.find_next("idle")
		"homeView":
			hud.console.find_next("home")
		"findRuler":
			hud.console.find_ruler()
		"seeMore":
			hud.show_details()
		"goods":
			hud.toggle_goods()
		"families":
			hud.toggle_families()
		"goals":
			hud.toggle_goals()
		"help":
			hud.toggle_help()
		"fullscreen":
			var full := DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if full else DisplayServer.WINDOW_MODE_FULLSCREEN)
		"healthBars":
			settings.health_bars = "hurt" if settings.health_bars == "always" else "always"
			hud.toast("Health bars: %s" % ("everyone" if settings.health_bars == "always" else "only the hurt"), "info")
	hud.refresh_now()


# ---- touch --------------------------------------------------------------------------------------

func _touch_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		if t.pressed:
			_touches[t.index] = t.position
			if _touches.size() == 1:
				_touch_down_at = Time.get_ticks_msec() / 1000.0
				_touch_moved = false
				_touch_box = false
				_pointer_moved(t.position)
			else:
				_pinch = _pinch_distance()
				_drag_start = null
				drag_box = Rect2()
		else:
			_touches.erase(t.index)
			camera.drag(t.position, false)
			if _touches.is_empty():
				if _touch_box:
					_primary_release(t.position, false)
				elif not _touch_moved:
					_tap(t.position)
				_drag_start = null
				drag_box = Rect2()
	else:
		var d := event as InputEventScreenDrag
		_touches[d.index] = d.position
		if _touches.size() >= 2:
			var dist := _pinch_distance()
			if _pinch > 0.0:
				camera.zoom_at(dist / _pinch, _pinch_centre())
			_pinch = dist
			return
		if not _touch_moved and d.relative.length() > 0.0:
			# Held still long enough first: a selection box (or a placement drag) instead of a pan.
			if Time.get_ticks_msec() / 1000.0 - _touch_down_at >= LONG_PRESS or placing != "":
				_touch_box = true
				_drag_start = camera.screen_to_world(d.position - d.relative)
		_touch_moved = true
		if _touch_box:
			_pointer_moved(d.position)
		else:
			camera.drag(d.position, true)


func _tap(p: Vector2) -> void:
	_pointer_moved(p)
	if placing != "":
		_place(p, Rect2())
		return
	# With people selected, tapping the ground or a resource gives the order (as right click does).
	var before := selected.duplicate()
	click_select(p, false)
	if selected.is_empty() and selected_building == -1 and not before.is_empty():
		selected = before
		order_at(_tile_at(p), camera.screen_to_world(p) / WorldView.TILE_PX)
	hud.refresh_now()


func _pinch_distance() -> float:
	var pts: Array = _touches.values()
	return (pts[0] as Vector2).distance_to(pts[1] as Vector2)


func _pinch_centre() -> Vector2:
	var pts: Array = _touches.values()
	return ((pts[0] as Vector2) + (pts[1] as Vector2)) / 2.0
