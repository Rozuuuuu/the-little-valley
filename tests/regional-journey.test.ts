import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { riverCenter } from '../src/game/world/worldgen';
import { T, TERRAIN } from '../src/game/world/tiles';
import { SEASON_DAYS } from '../src/game/data/seasons';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf, checkPlacement } from '../src/game/sim/buildings';
import { seasonOf } from '../src/game/sim/seasons';
import { accountedFor, assertNoNegativeReservations, assertReservationsConsistent, consumedByConstruction, consumedByCrafting, run, runUntil } from './helpers';

/** A straight east-west crossing of the great river near the camp. */
function riverCrossing(sim: Simulation): { y: number; x0: number; x1: number } {
  for (let dy = 0; dy < 30; dy++) {
    for (const y of [dy, -dy]) {
      const c = Math.round(riverCenter(sim.seed, y));
      let x0 = c;
      let x1 = c;
      while (sim.world.terrain(x0 - 1, y) === T.Water || sim.world.terrain(x0 - 1, y) === T.DeepWater) x0--;
      while (sim.world.terrain(x1 + 1, y) === T.Water || sim.world.terrain(x1 + 1, y) === T.DeepWater) x1++;
      const ok = [x0 - 1, x1 + 1].every((x) => sim.walkable(x, y)) && x1 - x0 + 1 <= 12;
      if (ok && sim.world.terrain(c, y) === T.DeepWater) return { y, x0, x1 };
    }
  }
  throw new Error('no crossing');
}

describe('unreachable notes across the river', () => {
  it('a settler on the far bank is not blocked by failures of settlers on the near bank', () => {
    const sim = createNewGame(9090);
    const c = riverCrossing(sim);
    for (let x = 0; x <= c.x1 + 12; x += 4) sim.world.reveal(x, c.y, 8);
    // A field on the far bank, which nobody on the camp side can walk to.
    let spot: { x: number; y: number } | null = null;
    for (let x = c.x1 + 3; x <= c.x1 + 10 && !spot; x++) {
      for (let y = c.y - 3; y <= c.y + 3 && !spot; y++) {
        if (TERRAIN[sim.world.terrain(x, y)].fertility > 0 && applyCommand(sim, { type: 'place', building: 'field', x, y, crop: 'turnip' }).ok) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    const field = sim.buildingAt(spot!.x, spot!.y)!;
    // Everyone at camp is a farmer: they all try the field and fail first.
    applyCommand(sim, { type: 'setJob', ids: sim.settlers.map((s) => s.id), job: 'farmer' });
    runUntil(sim, () => sim.unreachableForAll(`b${field.id}`), DAY_TICKS / 2);
    // Now a farmer who stands on the far bank should still be able to work it.
    const far = sim.settlers[0];
    far.task = null;
    far.x = c.x1 + 1.5;
    far.y = c.y + 0.5;
    far.px = far.x;
    far.py = far.y;
    far.nextThink = 0;
    const t = runUntil(sim, () => field.field!.state !== 'wild', DAY_TICKS);
    expect(t).toBeLessThan(DAY_TICKS / 4);
  });
});

describe('two-town journey', () => {
  it('bridge → far-bank waystation → move settlers → stock targets → winter → save & resume', () => {
    const sim = createNewGame(9090);
    // Milestones are not under test here; the journey starts at Village.
    sim.progression.reached.push('hamlet', 'village');
    const camp = campOf(sim)!;
    camp.inventory = { food: 150, wood: 90, stone: 90, planks: 40 };
    const start = { wood: 90, stone: 90, planks: 40 };
    const c = riverCrossing(sim);
    for (let x = 0; x <= c.x1 + 16; x += 4) sim.world.reveal(x, c.y, 8);

    // 1. Cross the river.
    const bridgeRes = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1, y1: c.y });
    expect(bridgeRes.ok).toBe(true);
    const bridge = sim.buildings.get(bridgeRes.id!)!;
    runUntil(sim, () => bridge.built, DAY_TICKS * 4);

    // 2. Found a second settlement on the far bank.
    let hallId = 0;
    for (let x = c.x1 + 4; x <= c.x1 + 14 && !hallId; x++) {
      for (let y = c.y - 6; y <= c.y + 6 && !hallId; y++) {
        if (checkPlacement(sim, 'waystation', x, y).ok && applyCommand(sim, { type: 'place', building: 'waystation', x, y }).ok) hallId = sim.buildingAt(x, y)!.id;
      }
    }
    expect(hallId).toBeGreaterThan(0);
    const hall = sim.buildings.get(hallId)!;
    runUntil(sim, () => hall.built, DAY_TICKS * 4);
    expect(sim.settlements.map((s) => s.id)).toContain(hall.id);

    // 3. Move two settlers there, give them a local work area and a food target.
    const movers = sim.settlers.slice(3).map((s) => s.id);
    expect(applyCommand(sim, { type: 'assignSettlement', ids: movers, settlementId: hall.id }).ok).toBe(true);
    for (const id of movers) expect(sim.settler(id)!.homeId).toBe(hall.id);
    const area = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: hall.x - 6, y0: hall.y - 8, x1: hall.x + 8, y1: hall.y + 8, name: 'Far wood' });
    expect(area.ok).toBe(true);
    expect(applyCommand(sim, { type: 'assignArea', ids: movers, areaId: area.id! }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'setWants', buildingId: hall.id, res: 'food', amount: 30 }).ok).toBe(true);
    runUntil(sim, () => (hall.inventory.food ?? 0) >= 30, DAY_TICKS * 3);
    runUntil(sim, () => movers.every((id) => Math.abs(sim.settler(id)!.x - hall.x) < 14), DAY_TICKS);
    assertReservationsConsistent(sim);

    // 4. Through winter: jump to the last evening of autumn (time is accelerated, not goods).
    const winterDay = 3 * SEASON_DAYS + 1;
    sim.tick = Math.max(sim.tick, Math.round((winterDay - 1) * DAY_TICKS - DAY_TICKS * 0.3));
    runUntil(sim, () => seasonOf(sim).id === 'winter', DAY_TICKS);
    run(sim, DAY_TICKS / 2);
    assertReservationsConsistent(sim);
    assertNoNegativeReservations(sim);

    // 5. Save and resume: same people, homes, settlements, targets and goods.
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Two towns', createdAt: 0 })))));
    expect(loaded.settlements).toEqual(sim.settlements);
    expect(loaded.settlers.map((s) => [s.id, s.homeId, s.settlementId, s.areaId])).toEqual(sim.settlers.map((s) => [s.id, s.homeId, s.settlementId, s.areaId]));
    expect(loaded.buildings.get(hall.id)!.wants).toEqual({ food: 30 });
    for (const r of ['wood', 'stone', 'planks', 'food'] as const) expect(accountedFor(loaded, r)).toBe(accountedFor(sim, r));
    run(loaded, DAY_TICKS / 2);
    assertReservationsConsistent(loaded);
    // Nothing was created or lost: start + gathered = held + built into things.
    expect(accountedFor(loaded, 'planks') + consumedByConstruction(loaded, 'planks') + consumedByCrafting(loaded, 'planks')).toBe(start.planks + loaded.stats.planksCrafted);
    expect(accountedFor(loaded, 'stone') + consumedByConstruction(loaded, 'stone') + consumedByCrafting(loaded, 'stone')).toBe(start.stone + loaded.stats.stoneGathered);
  });
});
