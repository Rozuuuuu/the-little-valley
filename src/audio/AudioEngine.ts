import type { SfxName } from '../game/sim/types';

export type UiSound = 'ui' | 'uiOpen' | 'uiClose' | 'select' | 'command';
export type SoundName = SfxName | UiSound;

interface Volumes {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [
  [0, 4, 7],
  [-3, 0, 4],
  [-7, -3, 0],
  [-5, -1, 2],
];

function hz(semi: number, base = 261.63): number {
  return base * Math.pow(2, semi / 12);
}

/**
 * Every sound is synthesised with WebAudio, so the game ships no audio files.
 * The context starts on the first user gesture, as browsers require.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private echo!: DelayNode;
  private noise!: AudioBuffer;
  private rainGain: GainNode | null = null;
  private last = new Map<string, number>();
  private timer: number | null = null;
  private nextBar = 0;
  private bar = 0;
  private night = false;
  private raining = false;
  private vol: Volumes = { masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.7, muted: false };

  get started(): boolean {
    return !!this.ctx;
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.ambience = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.ambience.connect(this.master);
    // A soft echo gives the plucked melody some space.
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    this.echo.connect(lp).connect(fb).connect(this.echo);
    lp.connect(this.music);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.nextBar = ctx.currentTime + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 250);
  }

  setVolumes(v: Volumes): void {
    this.vol = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : this.vol.masterVolume, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.musicVolume * 0.55, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.vol.sfxVolume * 0.6, t, 0.05);
    this.ambience.gain.setTargetAtTime(this.vol.sfxVolume * 0.35, t, 0.2);
  }

  setMood(night: boolean, raining: boolean): void {
    this.night = night;
    if (raining !== this.raining) {
      this.raining = raining;
      this.updateRain();
    }
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    void this.ctx?.resume();
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---- building blocks ----------------------------------------------------

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; when?: number; slide?: number; attack?: number; dest?: AudioNode; pan?: number } = {}): void {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p);
      node = p;
    }
    o.connect(g);
    node.connect(opts.dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, opts: { freq: number; q?: number; type?: BiquadFilterType; vol?: number; when?: number; dest?: AudioNode; sweep?: number; pan?: number }): void {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.freq * opts.sweep, t + dur);
    f.Q.value = opts.q ?? 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      g.connect(p);
      out = p;
    }
    src.connect(f).connect(g);
    out.connect(opts.dest ?? this.sfx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  // ---- sound effects ------------------------------------------------------

  /** Plays a sound. `vol` scales it (e.g. by distance), `pan` is -1..1. */
  play(name: SoundName, vol = 1, pan = 0): void {
    if (!this.ctx || vol <= 0.02) return;
    const now = this.ctx.currentTime;
    const minGap = name === 'hammer' || name === 'chop' || name === 'mine' ? 0.09 : 0.05;
    if (now - (this.last.get(name) ?? 0) < minGap) return;
    this.last.set(name, now);
    const v = vol;
    const p = pan;
    switch (name) {
      case 'chop':
        this.burst(0.09, { freq: 900, q: 2, vol: 0.28 * v, pan: p });
        this.tone(140, 0.1, { vol: 0.2 * v, slide: 0.6, pan: p });
        break;
      case 'mine':
        this.burst(0.05, { freq: 3000, q: 4, vol: 0.2 * v, pan: p });
        this.tone(640 + Math.random() * 60, 0.14, { type: 'triangle', vol: 0.09 * v, pan: p });
        break;
      case 'pick':
        this.tone(900, 0.09, { type: 'triangle', vol: 0.12 * v, slide: 0.75, pan: p });
        break;
      case 'dig':
        this.burst(0.14, { freq: 380, type: 'lowpass', vol: 0.3 * v, pan: p });
        break;
      case 'plant':
        this.tone(523, 0.12, { vol: 0.1 * v, pan: p });
        this.tone(784, 0.16, { vol: 0.08 * v, when: now + 0.07, pan: p });
        break;
      case 'water':
        this.burst(0.3, { freq: 2500, type: 'highpass', vol: 0.12 * v, sweep: 0.5, pan: p });
        break;
      case 'harvest':
        [0, 4, 7].forEach((s, i) => this.tone(hz(s + 12), 0.18, { type: 'triangle', vol: 0.1 * v, when: now + i * 0.06, pan: p }));
        break;
      case 'hammer':
        this.tone(220, 0.07, { vol: 0.18 * v, slide: 0.5, pan: p });
        this.burst(0.03, { freq: 1800, q: 3, vol: 0.12 * v, pan: p });
        break;
      case 'saw':
        for (let i = 0; i < 2; i++) this.burst(0.12, { freq: 1400 + i * 300, q: 3, vol: 0.09 * v, when: now + i * 0.14, sweep: 1.4, pan: p });
        break;
      case 'drop':
        this.tone(160, 0.1, { vol: 0.16 * v, slide: 0.55, pan: p });
        break;
      case 'eat':
        this.tone(700, 0.05, { type: 'triangle', vol: 0.07 * v, pan: p });
        this.tone(820, 0.05, { type: 'triangle', vol: 0.07 * v, when: now + 0.08, pan: p });
        break;
      case 'complete':
        [0, 4, 7, 12].forEach((s, i) => this.tone(hz(s + 12), 0.5, { type: 'triangle', vol: 0.09 * v, when: now + i * 0.08 }));
        break;
      case 'place':
        this.tone(330, 0.06, { type: 'triangle', vol: 0.12 * v, slide: 0.8 });
        this.burst(0.04, { freq: 1200, vol: 0.08 * v });
        break;
      case 'arrival':
        [7, 12, 16].forEach((s, i) => this.tone(hz(s), 0.6, { vol: 0.08, when: now + i * 0.16, attack: 0.02 }));
        break;
      case 'milestone':
        [0, 4, 7, 12, 16].forEach((s, i) => this.tone(hz(s + 12), 0.8, { type: 'triangle', vol: 0.09, when: now + i * 0.11, attack: 0.01 }));
        break;
      case 'error':
        this.tone(240, 0.12, { type: 'square', vol: 0.035 });
        this.tone(190, 0.16, { type: 'square', vol: 0.035, when: now + 0.1 });
        break;
      case 'ui':
        this.tone(880, 0.05, { vol: 0.06 });
        break;
      case 'uiOpen':
        this.tone(660, 0.06, { vol: 0.06 });
        this.tone(990, 0.07, { vol: 0.05, when: now + 0.05 });
        break;
      case 'uiClose':
        this.tone(760, 0.06, { vol: 0.05 });
        this.tone(520, 0.07, { vol: 0.05, when: now + 0.05 });
        break;
      case 'select':
        this.tone(1040, 0.05, { type: 'triangle', vol: 0.05 });
        break;
      case 'command':
        this.tone(620, 0.06, { type: 'triangle', vol: 0.06 });
        this.tone(930, 0.06, { type: 'triangle', vol: 0.05, when: now + 0.05 });
        break;
    }
  }

  // ---- ambience and music -------------------------------------------------

  private updateRain(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.raining && !this.rainGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1100;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.18, ctx.currentTime, 1.5);
      src.connect(f).connect(g).connect(this.ambience);
      src.start();
      this.rainGain = g;
      (g as GainNode & { src?: AudioBufferSourceNode }).src = src;
    } else if (!this.raining && this.rainGain) {
      const g = this.rainGain as GainNode & { src?: AudioBufferSourceNode };
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.2);
      g.src?.stop(ctx.currentTime + 5);
      this.rainGain = null;
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const beat = 60 / 72;
    const barLen = beat * 4;
    while (this.nextBar < ctx.currentTime + 1.2) {
      this.playBar(this.nextBar, beat);
      this.nextBar += barLen;
      this.bar++;
    }
    // Ambient critters, independent of the music.
    if (Math.random() < (this.night ? 0.25 : 0.06) && !this.raining) {
      if (this.night) {
        for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.03, { vol: 0.02, when: ctx.currentTime + i * 0.06, dest: this.ambience });
      } else {
        const f = 2200 + Math.random() * 1400;
        const t = ctx.currentTime + Math.random() * 0.2;
        this.tone(f, 0.09, { vol: 0.03, slide: 1.3, when: t, dest: this.ambience });
        this.tone(f * 1.1, 0.08, { vol: 0.025, slide: 0.8, when: t + 0.12, dest: this.ambience });
      }
    }
  }

  private playBar(t: number, beat: number): void {
    const chord = CHORDS[Math.floor(this.bar / 2) % CHORDS.length];
    const soft = this.night ? 0.6 : 1;
    // Pad: sustained chord with slow attack.
    if (this.bar % 2 === 0) {
      for (const s of chord) {
        this.tone(hz(s - 12), beat * 8, { type: 'sine', vol: 0.05 * soft, attack: 1.2, when: t, dest: this.music });
        this.tone(hz(s), beat * 8, { type: 'triangle', vol: 0.018 * soft, attack: 1.6, when: t, dest: this.music });
      }
      this.tone(hz(chord[0] - 24), beat * 8, { type: 'sine', vol: 0.05 * soft, attack: 0.8, when: t, dest: this.music });
    }
    // Melody: sparse pentatonic plucks through the echo.
    const density = this.night ? 0.25 : 0.45;
    for (let i = 0; i < 8; i++) {
      if (Math.random() > density) continue;
      const deg = PENTA[Math.floor(Math.random() * PENTA.length)];
      const oct = Math.random() < 0.3 ? 24 : 12;
      const when = t + i * (beat / 2);
      this.tone(hz(deg + oct), 0.7, { type: 'triangle', vol: 0.045 * soft, when, dest: this.music });
      this.tone(hz(deg + oct), 0.7, { type: 'triangle', vol: 0.03 * soft, when, dest: this.echo });
    }
  }
}
