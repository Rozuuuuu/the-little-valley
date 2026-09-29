import { describe, expect, it } from 'vitest';
import { computePixels, terrainGrid, type GroundSeason } from '../src/render/terrainPainter';
import { createNewGame } from '../src/game/sim/newGame';
import { CURRENT_GEN } from '../src/game/world/worldgen';

/** FNV-1a over the painted pixels: any change to the picture changes it. */
function fingerprint(px: Uint32Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < px.length; i++) {
    h = Math.imul(h ^ (px[i] & 0xff), 16777619);
    h = Math.imul(h ^ ((px[i] >>> 8) & 0xff), 16777619);
    h = Math.imul(h ^ ((px[i] >>> 16) & 0xff), 16777619);
  }
  return (h >>> 0).toString(16);
}

// Chunks with meadow, forest, the river, sand, hills and the mountain range, in two habitats.
const CASES: { seed: number; habitat: 'valley' | 'highlands'; chunks: [number, number][] }[] = [
  { seed: 4242, habitat: 'valley', chunks: [[0, 0], [-1, -1], [1, 0], [2, 0], [0, -2], [3, 1]] },
  { seed: 777, habitat: 'highlands', chunks: [[0, 0], [1, -1], [-2, 1]] },
];
const SEASONS: GroundSeason[] = ['spring', 'summer', 'autumn', 'winter'];

function paintAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of CASES) {
    const sim = createNewGame(c.seed, CURRENT_GEN, c.habitat);
    for (const [cx, cy] of c.chunks) {
      const chunk = sim.world.chunk(cx, cy);
      const grid = terrainGrid(sim.world, chunk);
      for (const s of SEASONS) out[`${c.habitat}:${cx},${cy}:${s}`] = fingerprint(computePixels(sim.seed, cx, cy, grid, s));
    }
  }
  return out;
}

describe('terrain painter', () => {
  it('paints exactly the same ground as before it was made faster', () => {
    expect(paintAll()).toMatchSnapshot();
  });
});
