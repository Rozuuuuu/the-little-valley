class_name AudioEngine
extends Node
## Sound effects, ambience and music, as in the browser game (src/audio/AudioEngine.ts): the same
## synthesised sounds, a slow pad with sparse pentatonic plucks through an echo at 72 bpm, birds by
## day, crickets at night and rain. Sounds are rendered by Synth on this device, a little each frame
## (the web build has no threads), so nothing waits for audio; a sound asked for before it is ready
## is skipped once.

const RATE := 22050
## The pads are low and slow (the highest note is 330 Hz), so they render at a low rate.
const PAD_RATE := 8000
const VARIANTS := 2
## Milliseconds of rendering per frame, done in slices of SLICE samples: little while the valley
## runs, more on the title screen, in menus or while paused (`busy` false).
const BUDGET_MS := 1.5
const IDLE_BUDGET_MS := 8.0
const SLICE := 600
const PENTA: Array[int] = [0, 2, 4, 7, 9]
const CHORDS: Array[Array] = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]
const BEAT := 60.0 / 72.0
const POOL := 24
const PANS: Array[float] = [-0.8, -0.4, 0.0, 0.4, 0.8]
const NAMES: Array[String] = ["chop", "mine", "pick", "dig", "plant", "water", "harvest", "hammer", "saw", "mill", "bake", "drop", "eat",
	"complete", "place", "arrival", "milestone", "error", "ui", "uiOpen", "uiClose", "select", "command"]

var master_volume := 0.8
var music_volume := 0.5
var sfx_volume := 0.7
var muted := false

var _rng := RandomNumberGenerator.new()
## name -> Array[AudioStreamWAV] (filled as they render)
var _sfx := {}
var _plucks := {}
var _pads: Array = [null, null, null, null]
var _chirps: Array[AudioStreamWAV] = []
var _crickets: Array[AudioStreamWAV] = []
var _rain_stream: AudioStreamWAV
var _rain: AudioStreamPlayer
## Render jobs: Callables taking a sample budget, returning true when finished.
var _jobs: Array[Callable] = []
var _players: Array[AudioStreamPlayer] = []
var _next_player := 0
var _last := {}
## Plays waiting for their moment: [time, stream, volume, bus].
var _pending: Array[Array] = []
var _clock := 0.0
var _next_bar := 0.3
var _bar := 0
var _next_critter := 0.0
var night := false
var raining := false
var music_on := true
## Whether the game is running (render jobs then take less of each frame).
var busy := false


func _ready() -> void:
	_rng.randomize()
	_buses()
	for i in POOL:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	_rain = AudioStreamPlayer.new()
	_rain.bus = "Ambience"
	add_child(_rain)
	# Interface and work sounds first, then the music.
	for name: String in NAMES:
		_sfx[name] = []
		for k in VARIANTS:
			_jobs.append(_render_sfx(name))
	for deg: int in PENTA:
		for oct: int in [12, 24]:
			_jobs.append(_render_pluck(deg + oct))
	for c in CHORDS.size():
		_jobs.append(_pad_job(c))
	for k in 4:
		_jobs.append(_render_critter(false))
		_jobs.append(_render_critter(true))
	_jobs.append(_render_rain())
	apply_volumes()


func _bus(bus_name: String, send: String) -> int:
	var i := AudioServer.get_bus_index(bus_name)
	if i == -1:
		AudioServer.add_bus()
		i = AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, bus_name)
	AudioServer.set_bus_send(i, send)
	return i


func _buses() -> void:
	_bus("Music", "Master")
	_bus("Sfx", "Master")
	_bus("Ambience", "Master")
	# The soft echo on the plucked melody: only the repeats, darkened, back into Music.
	var echo := _bus("Echo", "Music")
	if AudioServer.get_bus_effect_count(echo) == 0:
		var d := AudioEffectDelay.new()
		d.dry = 0.0
		d.tap1_active = true
		d.tap1_delay_ms = 420.0
		d.tap1_level_db = 0.0
		d.tap2_active = false
		d.feedback_active = true
		d.feedback_delay_ms = 420.0
		d.feedback_level_db = linear_to_db(0.32)
		d.feedback_lowpass = 1800.0
		AudioServer.add_bus_effect(echo, d)
	# Positional effects pan through one of a few fixed buses.
	for p: float in PANS:
		var i := _bus("Sfx%+.1f" % p, "Sfx")
		if p != 0.0 and AudioServer.get_bus_effect_count(i) == 0:
			var pan := AudioEffectPanner.new()
			pan.pan = p
			AudioServer.add_bus_effect(i, pan)


func apply_volumes() -> void:
	AudioServer.set_bus_volume_db(0, linear_to_db(0.0 if muted else master_volume))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), linear_to_db(music_volume * 0.55 if music_on else 0.0))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Sfx"), linear_to_db(sfx_volume * 0.6))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Ambience"), linear_to_db(sfx_volume * 0.35))


func set_mood(is_night: bool, is_raining: bool) -> void:
	night = is_night
	if is_raining != raining:
		raining = is_raining
		_update_rain()


# ---- rendering ---------------------------------------------------------------------------------

## A render job: a Synth.Job plus where its result goes. Called with a sample budget; true when done.
func _job(voices: Array, rate: int, done: Callable, loop: bool = false, samples: PackedFloat32Array = PackedFloat32Array()) -> Callable:
	var j := Synth.Job.new(voices, rate, _rng, loop, samples)
	return func(budget: int) -> bool:
		if j.step(budget):
			done.call(j.wav)
			return true
		return false


func _render_sfx(name: String) -> Callable:
	return _job(voices(name, _rng), RATE, func(w: AudioStreamWAV) -> void: (_sfx[name] as Array).append(w))


func _render_pluck(semi: int) -> Callable:
	return _job([Synth.tone(Synth.hz(semi), 0.7, {"type": "triangle", "vol": 0.045})], RATE, func(w: AudioStreamWAV) -> void: _plucks[semi] = w)


## The pad voices of a chord: sustained, two bars long.
static func pad_voices(c: int) -> Array:
	var chord: Array = CHORDS[c]
	var vs: Array = []
	for s: int in chord:
		vs.append(Synth.tone(Synth.hz(s - 12), BEAT * 8, {"type": "sine", "vol": 0.05, "attack": 1.2}))
		vs.append(Synth.tone(Synth.hz(s), BEAT * 8, {"type": "triangle", "vol": 0.018, "attack": 1.6}))
	vs.append(Synth.tone(Synth.hz(int(chord[0]) - 24), BEAT * 8, {"type": "sine", "vol": 0.05, "attack": 0.8}))
	return vs


func _pad_job(c: int) -> Callable:
	return _job(pad_voices(c), PAD_RATE, func(w: AudioStreamWAV) -> void: _pads[c] = w)


func _render_critter(at_night: bool) -> Callable:
	var vs: Array = []
	if at_night:
		var fn := 4200.0 + _rng.randf() * 300.0
		for i in 3:
			vs.append(Synth.tone(fn, 0.03, {"vol": 0.02, "when": i * 0.06}))
		return _job(vs, RATE, func(w: AudioStreamWAV) -> void: _crickets.append(w))
	var f := 2200.0 + _rng.randf() * 1400.0
	vs.append(Synth.tone(f, 0.09, {"vol": 0.03, "slide": 1.3}))
	vs.append(Synth.tone(f * 1.1, 0.08, {"vol": 0.025, "slide": 0.8, "when": 0.12}))
	return _job(vs, RATE, func(w: AudioStreamWAV) -> void: _chirps.append(w))


## Rain: steady lowpassed noise (the browser loops filtered noise at 0.18), two seconds, looped.
func _render_rain() -> Callable:
	var noise := PackedFloat32Array()
	noise.resize(RATE * 2)
	var a := 1.0 - exp(-TAU * 1100.0 / RATE)
	var state := {"i": 0, "y": 0.0, "conv": null}
	return func(budget: int) -> bool:
		var i0: int = state["i"]
		if i0 < noise.size():
			var y: float = state["y"]
			var i1 := mini(noise.size(), i0 + budget)
			for i in range(i0, i1):
				y += a * ((_rng.randf() * 2.0 - 1.0) - y)
				noise[i] = y * 0.36
			state["i"] = i1
			state["y"] = y
			return false
		if state["conv"] == null:
			state["conv"] = _job([], RATE, _rain_ready, true, noise)
		return (state["conv"] as Callable).call(budget)


func _rain_ready(w: AudioStreamWAV) -> void:
	_rain_stream = w
	if raining:
		_update_rain()


## The sound recipes, one for one with AudioEngine.ts `play`.
static func voices(name: String, rng: RandomNumberGenerator) -> Array:
	match name:
		"chop":
			return [Synth.burst(0.09, {"freq": 900.0, "q": 2.0, "vol": 0.28}), Synth.tone(140.0, 0.1, {"vol": 0.2, "slide": 0.6})]
		"mine":
			return [Synth.burst(0.05, {"freq": 3000.0, "q": 4.0, "vol": 0.2}), Synth.tone(640.0 + rng.randf() * 60.0, 0.14, {"type": "triangle", "vol": 0.09})]
		"pick":
			return [Synth.tone(900.0, 0.09, {"type": "triangle", "vol": 0.12, "slide": 0.75})]
		"dig":
			return [Synth.burst(0.14, {"freq": 380.0, "type": "lowpass", "vol": 0.3})]
		"plant":
			return [Synth.tone(523.0, 0.12, {"vol": 0.1}), Synth.tone(784.0, 0.16, {"vol": 0.08, "when": 0.07})]
		"water":
			return [Synth.burst(0.3, {"freq": 2500.0, "type": "highpass", "vol": 0.12, "sweep": 0.5})]
		"harvest":
			return _arpeggio([0, 4, 7], 12, 0.18, 0.1, 0.06, "triangle", 0.005)
		"hammer":
			return [Synth.tone(220.0, 0.07, {"vol": 0.18, "slide": 0.5}), Synth.burst(0.03, {"freq": 1800.0, "q": 3.0, "vol": 0.12})]
		"saw":
			return [Synth.burst(0.12, {"freq": 1400.0, "q": 3.0, "vol": 0.09, "sweep": 1.4}), Synth.burst(0.12, {"freq": 1700.0, "q": 3.0, "vol": 0.09, "when": 0.14, "sweep": 1.4})]
		"mill":
			return [Synth.burst(0.22, {"freq": 320.0, "q": 2.0, "vol": 0.1, "sweep": 0.8}), Synth.tone(110.0, 0.2, {"type": "triangle", "vol": 0.05, "slide": 0.9})]
		"bake":
			return [Synth.tone(180.0, 0.18, {"vol": 0.08, "slide": 1.2}), Synth.burst(0.25, {"freq": 700.0, "type": "lowpass", "vol": 0.06})]
		"drop":
			return [Synth.tone(160.0, 0.1, {"vol": 0.16, "slide": 0.55})]
		"eat":
			return [Synth.tone(700.0, 0.05, {"type": "triangle", "vol": 0.07}), Synth.tone(820.0, 0.05, {"type": "triangle", "vol": 0.07, "when": 0.08})]
		"complete":
			return _arpeggio([0, 4, 7, 12], 12, 0.5, 0.09, 0.08, "triangle", 0.005)
		"place":
			return [Synth.tone(330.0, 0.06, {"type": "triangle", "vol": 0.12, "slide": 0.8}), Synth.burst(0.04, {"freq": 1200.0, "vol": 0.08})]
		"arrival":
			return _arpeggio([7, 12, 16], 0, 0.6, 0.08, 0.16, "sine", 0.02)
		"milestone":
			return _arpeggio([0, 4, 7, 12, 16], 12, 0.8, 0.09, 0.11, "triangle", 0.01)
		"error":
			return [Synth.tone(240.0, 0.12, {"type": "square", "vol": 0.035}), Synth.tone(190.0, 0.16, {"type": "square", "vol": 0.035, "when": 0.1})]
		"ui":
			return [Synth.tone(880.0, 0.05, {"vol": 0.06})]
		"uiOpen":
			return [Synth.tone(660.0, 0.06, {"vol": 0.06}), Synth.tone(990.0, 0.07, {"vol": 0.05, "when": 0.05})]
		"uiClose":
			return [Synth.tone(760.0, 0.06, {"vol": 0.05}), Synth.tone(520.0, 0.07, {"vol": 0.05, "when": 0.05})]
		"select":
			return [Synth.tone(1040.0, 0.05, {"type": "triangle", "vol": 0.05})]
		"command":
			return [Synth.tone(620.0, 0.06, {"type": "triangle", "vol": 0.06}), Synth.tone(930.0, 0.06, {"type": "triangle", "vol": 0.05, "when": 0.05})]
	return []


static func _arpeggio(semis: Array, up: int, dur: float, vol: float, step: float, type: String, attack: float) -> Array:
	var out := []
	for i in semis.size():
		out.append(Synth.tone(Synth.hz(int(semis[i]) + up), dur, {"type": type, "vol": vol, "when": i * step, "attack": attack}))
	return out


# ---- playing -----------------------------------------------------------------------------------

func _player() -> AudioStreamPlayer:
	for k in POOL:
		var p := _players[(_next_player + k) % POOL]
		if not p.playing:
			_next_player = (_next_player + k + 1) % POOL
			return p
	# All busy: take the oldest.
	var p := _players[_next_player]
	_next_player = (_next_player + 1) % POOL
	return p


func _start(stream: AudioStream, vol: float, bus: String) -> void:
	if stream == null or vol <= 0.0:
		return
	var p := _player()
	p.stream = stream
	p.bus = bus
	p.volume_db = linear_to_db(vol)
	p.play()


## Plays a sound. `vol` scales it (by distance), `pan` is -1..1.
func play(name: String, vol: float = 1.0, pan: float = 0.0) -> void:
	if vol <= 0.02 or not _sfx.has(name):
		return
	var min_gap := 0.09 if name in ["hammer", "chop", "mine"] else (0.6 if name in ["mill", "bake"] else 0.05)
	if _clock - float(_last.get(name, -10.0)) < min_gap:
		return
	_last[name] = _clock
	var variants: Array = _sfx[name]
	if variants.is_empty():
		return
	var bus := "Sfx%+.1f" % PANS[clampi(roundi((pan + 0.8) / 0.4), 0, PANS.size() - 1)]
	_start(variants[_rng.randi() % variants.size()], vol, bus)


func _update_rain() -> void:
	if _rain_stream == null:
		return
	var tw := create_tween()
	if raining:
		if not _rain.playing:
			_rain.stream = _rain_stream
			_rain.volume_db = -60.0
			_rain.play()
		tw.tween_property(_rain, "volume_db", 0.0, 3.0)
	else:
		tw.tween_property(_rain, "volume_db", -60.0, 2.5)
		tw.tween_callback(_rain.stop)


func _process(delta: float) -> void:
	_clock += delta
	# Render a little.
	var t0 := Time.get_ticks_usec()
	var budget := (BUDGET_MS if busy else IDLE_BUDGET_MS) * 1000.0
	while not _jobs.is_empty() and (Time.get_ticks_usec() - t0) < budget:
		if (_jobs[0] as Callable).call(SLICE):
			_jobs.pop_front()
	# Music, a bar ahead; plucks wait in _pending for their beat.
	while _next_bar < _clock + 0.1:
		_play_bar(_next_bar)
		_next_bar += BEAT * 4
		_bar += 1
	if _next_bar < _clock - 2.0:
		_next_bar = _clock + 0.1
	var i := 0
	while i < _pending.size():
		var e: Array = _pending[i]
		if float(e[0]) <= _clock:
			_start(e[1], e[2], e[3])
			_pending.remove_at(i)
		else:
			i += 1
	# Critters every quarter second, independent of the music.
	if _clock >= _next_critter:
		_next_critter = _clock + 0.25
		if not raining and _rng.randf() < (0.25 if night else 0.06):
			var pool: Array[AudioStreamWAV] = _crickets if night else _chirps
			if not pool.is_empty():
				_start(pool[_rng.randi() % pool.size()], 1.0, "Ambience")


func _play_bar(t: float) -> void:
	var chord_i := (_bar / 2) % CHORDS.size()
	var soft := 0.6 if night else 1.0
	if _bar % 2 == 0 and _pads[chord_i] != null:
		_pending.append([t, _pads[chord_i], soft, "Music"])
	var density := 0.25 if night else 0.45
	for k in 8:
		if _rng.randf() > density:
			continue
		var deg: int = PENTA[_rng.randi() % PENTA.size()]
		var oct := 24 if _rng.randf() < 0.3 else 12
		var note: AudioStreamWAV = _plucks.get(deg + oct)
		if note == null:
			continue
		var when := t + k * (BEAT / 2.0)
		_pending.append([when, note, soft, "Music"])
		_pending.append([when, note, soft * 0.03 / 0.045, "Echo"])


## Whether every sound has been rendered.
func ready_all() -> bool:
	return _jobs.is_empty()
