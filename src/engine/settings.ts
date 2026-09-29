import { BINDINGS_VERSION, defaultBindings, type Action, type Bindings } from '../input/bindings';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  edgePan: boolean;
  /** Edge-scroll speed multiplier (0.5–2). */
  edgeSpeed: number;
  /** Health bars over every living thing, or only over the hurt. */
  healthBars: 'always' | 'hurt';
  /** "See more" opens inside the bottom console (true) or as a floating window. */
  detailsInHud: boolean;
  /** A faint tile grid over the map. */
  showGrid: boolean;
  bindings: Bindings;
  /** Which default key layout the bindings were saved under (see BINDINGS_VERSION). */
  bindingsVersion: number;
  /** Keep the mouse inside the game while it runs (Warcraft-style); it is let go while paused. */
  lockMouse: boolean;
  /** The player switched lockMouse themselves (earlier versions turned it on for everyone). */
  lockMouseChosen: boolean;
  /** Draw the map at the screen's full pixel density (sharper, but much more work on high-DPI screens). */
  sharpGraphics: boolean;
  /** Minutes between autosaves. */
  autosaveMinutes: number;
}

/**
 * Canvas pixels per CSS pixel for the map. Pixel art doesn't need the extra density of a
 * high-DPI screen, and drawing at 1× is 2–4 times less work there; Sharp graphics opts back in.
 */
export function renderDpr(s: Pick<Settings, 'sharpGraphics'>): number {
  const d = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return s.sharpGraphics ? d : Math.min(d, 1);
}

const KEY = 'little-valley:settings';

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.8, musicVolume: 0.5, sfxVolume: 0.7, muted: false,
    edgePan: true, edgeSpeed: 1, healthBars: 'always', detailsInHud: true, showGrid: false, bindings: defaultBindings(), bindingsVersion: BINDINGS_VERSION,
    lockMouse: false, lockMouseChosen: false, sharpGraphics: false, autosaveMinutes: 2,
  };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    const bindings = { ...d.bindings };
    // Keys saved under an older default layout (WASD panning) give way to the Warcraft layout.
    const current = (s.bindingsVersion ?? 1) >= BINDINGS_VERSION;
    for (const [k, v] of Object.entries(current ? s.bindings ?? {} : {})) {
      if (k in bindings && Array.isArray(v) && v.every((x) => typeof x === 'string')) bindings[k as Action] = v;
    }
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
    return {
      masterVolume: num(s.masterVolume, d.masterVolume),
      musicVolume: num(s.musicVolume, d.musicVolume),
      sfxVolume: num(s.sfxVolume, d.sfxVolume),
      muted: typeof s.muted === 'boolean' ? s.muted : d.muted,
      // Settings saved before Warcraft-style scrolling (no edgeSpeed) had it off by default: turn it on.
      edgePan: typeof s.edgePan === 'boolean' && typeof s.edgeSpeed === 'number' ? s.edgePan : d.edgePan,
      edgeSpeed: typeof s.edgeSpeed === 'number' && Number.isFinite(s.edgeSpeed) ? Math.max(0.5, Math.min(2, s.edgeSpeed)) : d.edgeSpeed,
      healthBars: s.healthBars === 'hurt' || s.healthBars === 'always' ? s.healthBars : d.healthBars,
      detailsInHud: typeof s.detailsInHud === 'boolean' ? s.detailsInHud : d.detailsInHud,
      showGrid: typeof s.showGrid === 'boolean' ? s.showGrid : d.showGrid,
      autosaveMinutes: typeof s.autosaveMinutes === 'number' && s.autosaveMinutes >= 1 ? s.autosaveMinutes : d.autosaveMinutes,
      bindings,
      bindingsVersion: BINDINGS_VERSION,
      // Off unless the player turned it on: the drawn cursor it needs freezes whenever the page
      // is busy, so the real cursor is the default (edge scrolling works without it).
      lockMouse: s.lockMouseChosen === true && s.lockMouse === true,
      lockMouseChosen: s.lockMouseChosen === true,
      sharpGraphics: typeof s.sharpGraphics === 'boolean' ? s.sharpGraphics : d.sharpGraphics,
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
