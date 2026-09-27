import { defaultBindings, type Action, type Bindings } from '../input/bindings';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  edgePan: boolean;
  bindings: Bindings;
  /** Minutes between autosaves. */
  autosaveMinutes: number;
}

const KEY = 'little-valley:settings';

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.7, muted: false,
    edgePan: false, bindings: defaultBindings(), autosaveMinutes: 2,
  };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    const bindings = { ...d.bindings };
    for (const [k, v] of Object.entries(s.bindings ?? {})) {
      if (k in bindings && Array.isArray(v) && v.every((x) => typeof x === 'string')) bindings[k as Action] = v;
    }
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
    return {
      masterVolume: num(s.masterVolume, d.masterVolume),
      musicVolume: num(s.musicVolume, d.musicVolume),
      sfxVolume: num(s.sfxVolume, d.sfxVolume),
      muted: typeof s.muted === 'boolean' ? s.muted : d.muted,
      edgePan: typeof s.edgePan === 'boolean' ? s.edgePan : d.edgePan,
      autosaveMinutes: typeof s.autosaveMinutes === 'number' && s.autosaveMinutes >= 1 ? s.autosaveMinutes : d.autosaveMinutes,
      bindings,
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode); settings then last for the session.
  }
}
