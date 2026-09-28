import { afterEach, describe, expect, it } from 'vitest';
import { loadSettings } from '../src/engine/settings';

const KEY = 'little-valley:settings';

function withStorage(saved: unknown) {
  const store = new Map<string, string>([[KEY, JSON.stringify(saved)]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('settings', () => {
  it('turns Warcraft-style edge scrolling on for players whose settings predate it', () => {
    // Saved by an older version, when edge panning defaulted to off and had no speed setting.
    withStorage({ masterVolume: 0.5, edgePan: false, autosaveMinutes: 2 });
    const s = loadSettings();
    expect(s.edgePan).toBe(true);
    expect(s.masterVolume).toBe(0.5);
  });

  it('keeps edge scrolling off once the player has chosen that in the new settings', () => {
    withStorage({ edgePan: false, edgeSpeed: 1.5 });
    const s = loadSettings();
    expect(s.edgePan).toBe(false);
    expect(s.edgeSpeed).toBe(1.5);
  });
});
