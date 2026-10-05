extends TestCase
## The synthesised sounds (Synth, AudioEngine.voices) against AudioEngine.ts's recipes.


## Pitch from upward zero crossings over [from, to).
static func _pitch(buf: PackedFloat32Array, rate: int, from: int, to: int) -> float:
	var crossings := 0
	for i in range(from + 1, to):
		if buf[i - 1] < 0.0 and buf[i] >= 0.0:
			crossings += 1
	return crossings * float(rate) / (to - from)


static func _peak(buf: PackedFloat32Array, from: int = 0, to: int = -1) -> float:
	var p := 0.0
	for i in range(from, buf.size() if to < 0 else to):
		p = maxf(p, absf(buf[i]))
	return p


func test_every_sound_renders_at_a_sane_level() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var t0 := Time.get_ticks_usec()
	for name: String in AudioEngine.NAMES:
		var vs := AudioEngine.voices(name, rng)
		if not check(not vs.is_empty(), "%s has a recipe" % name):
			continue
		var buf := Synth.render(vs, AudioEngine.RATE, rng)
		var peak := _peak(buf)
		check(peak > 0.01 and peak < 0.6, "%s is audible and does not clip (peak %.3f)" % [name, peak])
		check(_peak(buf, buf.size() - 50) < 0.002, "%s fades out to silence" % name)
	var ms := (Time.get_ticks_usec() - t0) / 1000.0
	print("    every sound effect once: %.1f ms" % ms)
	# The browser's lengths: complete = 3 × 0.08 + 0.5, milestone = 4 × 0.11 + 0.8 (each + 0.05 release).
	check(is_equal_approx(Synth.length_of(AudioEngine.voices("complete", rng)), 0.24 + 0.5 + 0.05), "complete lasts as long as in the browser")
	check(is_equal_approx(Synth.length_of(AudioEngine.voices("milestone", rng)), 0.44 + 0.8 + 0.05), "milestone lasts as long as in the browser")


func test_oscillators_envelopes_and_slides() -> void:
	var rng := RandomNumberGenerator.new()
	var rate := 22050
	var sine := Synth.render([Synth.tone(440.0, 0.5, {"vol": 0.2})], rate, rng)
	var p := _pitch(sine, rate, 0, int(0.4 * rate))
	check(absf(p - 440.0) < 6.0, "a 440 Hz sine measures %.1f Hz" % p)
	check(absf(_peak(sine, 0, 400) - 0.2) < 0.02, "the attack reaches the volume quickly")
	check(_peak(sine, int(0.3 * rate), int(0.31 * rate)) < 0.01, "the exponential decay is far down by 0.3 s")
	var tri := Synth.render([Synth.tone(Synth.hz(12), 0.5, {"type": "triangle", "vol": 0.2})], rate, rng)
	check(absf(_pitch(tri, rate, 0, int(0.3 * rate)) - 523.26) < 8.0, "hz(12) is the C above middle C")
	var slide := Synth.render([Synth.tone(400.0, 0.4, {"vol": 0.2, "slide": 0.5})], rate, rng)
	var early := _pitch(slide, rate, 0, int(0.05 * rate))
	var late := _pitch(slide, rate, int(0.25 * rate), int(0.35 * rate))
	check(early > 360.0 and late < early * 0.8, "a slide falls (%.0f → %.0f Hz)" % [early, late])
	var noise := Synth.render([Synth.burst(0.2, {"freq": 900.0, "q": 12.0, "vol": 0.28})], rate, rng)
	var np := _pitch(noise, rate, 0, int(0.1 * rate))
	check(np > 700.0 and np < 1100.0, "narrow band-passed noise centres near its frequency (%.0f)" % np)


func test_music_pads_render_in_slices_identically() -> void:
	var v := Synth.tone(Synth.hz(-12), AudioEngine.BEAT * 8, {"type": "sine", "vol": 0.05, "attack": 1.2})
	var rate := AudioEngine.PAD_RATE
	var rng := RandomNumberGenerator.new()
	var whole := Synth.render([v], rate, rng)
	var sliced := PackedFloat32Array()
	sliced.resize(whole.size())
	var state := {}
	var slices := 0
	while not Synth.tone_slice(sliced, v, rate, state, 5000):
		slices += 1
	check(slices > 5, "a pad takes several slices")
	var worst := 0.0
	for i in whole.size():
		worst = maxf(worst, absf(whole[i] - sliced[i]))
	check(worst < 1e-6, "slices join seamlessly (largest difference %s)" % str(worst))
	check(absf(whole.size() / float(rate) - (AudioEngine.BEAT * 8 + 0.05)) < 0.01, "a pad lasts two bars")
	check(_peak(whole, int(1.2 * rate) - 50, int(1.2 * rate) + 50) > 0.045, "the slow attack peaks at 1.2 s")


func test_a_wav_holds_the_samples() -> void:
	var samples := PackedFloat32Array([0.0, 0.5, -0.5, 1.5])
	var w := Synth.to_wav(samples, 22050, true)
	check_eq(w.data.size(), 8, "16-bit mono")
	check_eq(w.data.decode_s16(2), 16383, "half scale")
	check_eq(w.data.decode_s16(6), 32767, "clipped, not wrapped")
	check_eq(w.loop_mode, AudioStreamWAV.LOOP_FORWARD, "rain loops")
