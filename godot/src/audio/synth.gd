class_name Synth
extends RefCounted
## Offline renderer for the browser game's WebAudio sounds (src/audio/AudioEngine.ts): the same
## oscillators, filtered noise bursts and exponential envelopes, mixed into a mono AudioStreamWAV.
## Nothing is shipped as a file; every sound is rendered on this device, once, a slice at a time
## (Job), so no frame waits on it.
##
## A voice is a Dictionary:
##   tone:  {kind: "tone", freq, dur, type: sine|triangle|square, vol, when, slide, attack}
##   burst: {kind: "burst", freq, dur, type: bandpass|lowpass|highpass, q, vol, when, sweep}

const TABLE_SIZE := 4096
static var _sine := PackedFloat32Array()


static func hz(semi: float, base: float = 261.63) -> float:
	return base * pow(2.0, semi / 12.0)


static func tone(freq: float, dur: float, opts: Dictionary = {}) -> Dictionary:
	var v := {"kind": "tone", "freq": freq, "dur": dur, "type": "sine", "vol": 0.2, "when": 0.0, "slide": 0.0, "attack": 0.005}
	v.merge(opts, true)
	return v


static func burst(dur: float, opts: Dictionary) -> Dictionary:
	var v := {"kind": "burst", "dur": dur, "type": "bandpass", "q": 1.2, "vol": 0.25, "when": 0.0, "sweep": 0.0}
	v.merge(opts, true)
	return v


static func _table() -> PackedFloat32Array:
	if _sine.is_empty():
		_sine.resize(TABLE_SIZE)
		for i in TABLE_SIZE:
			_sine[i] = sin(TAU * i / TABLE_SIZE)
	return _sine


## Length in seconds of a list of voices (last one to finish, plus the release tail).
static func length_of(voices: Array) -> float:
	var end := 0.0
	for v: Dictionary in voices:
		end = maxf(end, float(v["when"]) + float(v["dur"]) + 0.05)
	return end


## Mixes `voices` into a new buffer in one go (tests and tools). `rng` drives the noise.
static func render(voices: Array, rate: int, rng: RandomNumberGenerator) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(ceili(length_of(voices) * rate))
	for v: Dictionary in voices:
		if v["kind"] == "tone":
			tone_slice(out, v, rate, {}, 1 << 30)
		else:
			burst_slice(out, v, rate, rng, {}, 1 << 30)
	return out


## Adds up to `budget` more samples of a tone voice to `out`, carrying its progress in `state`.
## Returns true when the voice is complete.
static func tone_slice(out: PackedFloat32Array, v: Dictionary, rate: int, state: Dictionary, budget: int) -> bool:
	var table := _table()
	var start := int(float(v["when"]) * rate)
	var dur := float(v["dur"])
	var n := mini(int((dur + 0.05) * rate), out.size() - start)
	var attack_n := maxi(1, int(float(v["attack"]) * rate))
	var decay_n := maxi(1, int(dur * rate) - attack_n)
	var vol := float(v["vol"])
	# Exponential ramps (WebAudio exponentialRampToValueAtTime): 0.0001 → vol, then → 0.0001.
	var up := pow(vol / 0.0001, 1.0 / attack_n)
	var down := pow(0.0001 / vol, 1.0 / decay_n)
	var f0 := float(v["freq"])
	var slide := float(v["slide"])
	var slide_end := maxi(1, int(dur * rate))
	var fmul := pow(maxf(20.0, f0 * slide) / f0, 1.0 / slide_end) if slide > 0.0 else 1.0
	var kind: String = v["type"]
	var i0: int = state.get("i", 0)
	var phase: float = state.get("phase", 0.0)
	var freq: float = state.get("freq", f0)
	var g: float = state.get("g", 0.0001)
	var i1 := mini(n, i0 + budget)
	for i in range(i0, i1):
		var s: float
		match kind:
			"triangle":
				s = 4.0 * absf(phase - 0.5) - 1.0
			"square":
				s = 1.0 if phase < 0.5 else -1.0
			_:
				s = table[int(phase * TABLE_SIZE) & (TABLE_SIZE - 1)]
		out[start + i] += s * g
		phase += freq / rate
		if phase >= 1.0:
			phase -= 1.0
		if i < slide_end:
			freq *= fmul
		if i < attack_n:
			g *= up
		elif i < attack_n + decay_n:
			g *= down
		else:
			g = 0.0
	state["i"] = i1
	state["phase"] = phase
	state["freq"] = freq
	state["g"] = g
	return i1 >= n


## Adds up to `budget` more samples of a noise burst, carrying its progress (filter memory too) in
## `state`. Returns true when the voice is complete.
static func burst_slice(out: PackedFloat32Array, v: Dictionary, rate: int, rng: RandomNumberGenerator, state: Dictionary, budget: int) -> bool:
	var start := int(float(v["when"]) * rate)
	var dur := float(v["dur"])
	var n := mini(int((dur + 0.05) * rate), out.size() - start)
	var vol := float(v["vol"])
	var down := pow(0.0001 / vol, 1.0 / maxi(1, int(dur * rate)))
	var sweep := float(v["sweep"])
	var fmul := pow(sweep, 1.0 / maxi(1, int(dur * rate))) if sweep > 0.0 else 1.0
	var kind: String = v["type"]
	var q := float(v["q"])
	# WebAudio's lowpass/highpass Q is a resonance in dB; bandpass Q is plain.
	var q_lin := pow(10.0, q / 20.0) if kind != "bandpass" else q
	var i0: int = state.get("i", 0)
	var g: float = state.get("g", vol)
	var freq: float = state.get("freq", float(v["freq"]))
	var x1: float = state.get("x1", 0.0)
	var x2: float = state.get("x2", 0.0)
	var y1: float = state.get("y1", 0.0)
	var y2: float = state.get("y2", 0.0)
	var b0: float = state.get("b0", 0.0)
	var b1: float = state.get("b1", 0.0)
	var b2: float = state.get("b2", 0.0)
	var a1: float = state.get("a1", 0.0)
	var a2: float = state.get("a2", 0.0)
	var i1 := mini(n, i0 + budget)
	for i in range(i0, i1):
		# Coefficients (RBJ cookbook), refreshed as the sweep moves.
		if i % 32 == 0:
			var w := TAU * minf(freq, rate * 0.45) / rate
			var alpha := sin(w) / (2.0 * q_lin)
			var cw := cos(w)
			var a0 := 1.0 + alpha
			match kind:
				"lowpass":
					b0 = (1.0 - cw) / 2.0
					b1 = 1.0 - cw
					b2 = b0
				"highpass":
					b0 = (1.0 + cw) / 2.0
					b1 = -(1.0 + cw)
					b2 = b0
				_:
					b0 = alpha
					b1 = 0.0
					b2 = -alpha
			b0 /= a0
			b1 /= a0
			b2 /= a0
			a1 = -2.0 * cw / a0
			a2 = (1.0 - alpha) / a0
		var x := rng.randf() * 2.0 - 1.0
		var y := b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		out[start + i] += y * g
		g *= down
		freq *= fmul
	state.merge({"i": i1, "g": g, "freq": freq, "x1": x1, "x2": x2, "y1": y1, "y2": y2, "b0": b0, "b1": b1, "b2": b2, "a1": a1, "a2": a2}, true)
	return i1 >= n


static func to_wav(samples: PackedFloat32Array, rate: int, loop: bool = false) -> AudioStreamWAV:
	var j := Job.new([], rate, null, loop, samples)
	j.step(1 << 30)
	return j.wav


## A sound rendered a slice at a time: every voice mixed in, then converted to 16-bit samples.
## `step` returns true when `wav` is ready.
class Job:
	extends RefCounted
	var voices: Array
	var rate: int
	var rng: RandomNumberGenerator
	var loop: bool
	var buf := PackedFloat32Array()
	var bytes := PackedByteArray()
	var wav: AudioStreamWAV = null
	var _voice := 0
	var _state := {}
	var _converted := 0

	## `samples`, when given, is an already mixed buffer to convert (no voices).
	func _init(voice_list: Array, sample_rate: int, random: RandomNumberGenerator, looped: bool = false, samples: PackedFloat32Array = PackedFloat32Array()) -> void:
		voices = voice_list
		rate = sample_rate
		rng = random
		loop = looped
		buf = samples
		if buf.is_empty():
			buf.resize(ceili(Synth.length_of(voices) * rate))
		bytes.resize(buf.size() * 2)

	## Does about `budget` samples of work.
	func step(budget: int) -> bool:
		while budget > 0:
			if _voice < voices.size():
				var v: Dictionary = voices[_voice]
				var before: int = _state.get("i", 0)
				var finished := Synth.tone_slice(buf, v, rate, _state, budget) if v["kind"] == "tone" else Synth.burst_slice(buf, v, rate, rng, _state, budget)
				budget -= int(_state.get("i", 0)) - before + 1
				if finished:
					_voice += 1
					_state = {}
			elif _converted < buf.size():
				var to := mini(buf.size(), _converted + budget)
				for i in range(_converted, to):
					bytes.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32767.0))
				budget -= to - _converted
				_converted = to
			else:
				wav = AudioStreamWAV.new()
				wav.format = AudioStreamWAV.FORMAT_16_BITS
				wav.mix_rate = rate
				wav.stereo = false
				wav.data = bytes
				if loop:
					wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
					wav.loop_end = buf.size()
				return true
		return false
