import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { applyCommand } from '../src/game/sim/commands';
import { builtCount } from '../src/game/sim/buildings';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { assertNoNegativeReservations, nearestResource, run, runUntil } from './helpers';

function placeNear(sim: Simulation, building: 'house' | 'workshop' | 'storehouse', cx: number, cy: number) {
  for (let r = 0; r < 16; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (applyCommand(sim, { type: 'place', building, x, y }).ok) return;
      }
    }
  }
  throw new Error(`No room for ${building}`);
}

/**
 * The first complete player journey from the design brief, played headless
 * through the same commands the UI sends.
 */
describe('first player journey (legacy growth)', () => {
  it('start → gather → farm → harvest → house & workshop → newcomer → explore → save & resume', () => {
    const sim = createNewGame(20260927);
    sim.growthMode = 'legacy'; // the original journey; the deliberate-growth journey is in recruitment.test.ts
    const ids = sim.settlers.map((s) => s.id);

    // Gather wood and stone with direct orders.
    const tree = nearestResource(sim, 'wood')!;
    const rock = nearestResource(sim, 'stone')!;
    expect(applyCommand(sim, { type: 'gather', ids: ids.slice(0, 2), x: tree.x, y: tree.y }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'gather', ids: [ids[2]], x: rock.x, y: rock.y }).ok).toBe(true);

    // Prepare and plant fields in the meadow.
    expect(applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -6, y1: 5, crop: 'turnip' }).ok).toBe(true);

    runUntil(sim, () => sim.totals().wood >= 25 && sim.totals().stone >= 8, DAY_TICKS * 2);

    // Build a house, then harvest food.
    placeNear(sim, 'house', 4, -4);
    runUntil(sim, () => builtCount(sim, 'house') === 1, DAY_TICKS * 2);
    runUntil(sim, () => sim.stats.harvested > 0, DAY_TICKS * 2);

    // Support a newcomer.
    runUntil(sim, () => sim.settlers.length >= 6, DAY_TICKS * 3);

    // Workshop (keep the choppers going so wood is there).
    const moreTrees = nearestResource(sim, 'wood', { x: 0, y: 0 }, 24)!;
    applyCommand(sim, { type: 'gather', ids: ids.slice(0, 2), x: moreTrees.x, y: moreTrees.y });
    placeNear(sim, 'workshop', -3, -6);
    runUntil(sim, () => builtCount(sim, 'workshop') === 1, DAY_TICKS * 4);

    // Explore beyond the clearing.
    const explored = sim.world.exploredTileCount();
    applyCommand(sim, { type: 'move', ids: [ids[4]], x: 0, y: 26 });
    run(sim, 600);
    expect(sim.world.exploredTileCount()).toBeGreaterThan(explored);
    assertNoNegativeReservations(sim);

    // Save, "close the browser", resume.
    const text = JSON.stringify(serializeSim(sim, { name: 'Journey', createdAt: 0 }));
    const resumed = deserializeSim(migrate(JSON.parse(text)));
    expect(resumed.settlers.length).toBe(sim.settlers.length);
    expect(builtCount(resumed, 'house')).toBe(1);
    expect(builtCount(resumed, 'workshop')).toBe(1);
    expect(resumed.world.exploredTileCount()).toBe(sim.world.exploredTileCount());
    run(resumed, DAY_TICKS / 2);
    assertNoNegativeReservations(resumed);
    expect(resumed.progression.reached).toContain('hamlet');
  });
});
