import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { applyCommand } from '../src/game/sim/commands';
import { fieldStage } from '../src/game/sim/farming';
import { createNewGame, STARTING_GOODS } from '../src/game/sim/newGame';
import { housingCapacity } from '../src/game/sim/buildings';
import type { Simulation } from '../src/game/sim/Simulation';
import { O } from '../src/game/world/tiles';
import type { BuildingId } from '../src/game/data/buildings';
import {
  accountedFor, assertNoNegativeReservations, consumedByConstruction, consumedByCrafting, nearestResource, run, runUntil,
} from './helpers';

function camp(sim: Simulation) {
  return [...sim.buildings.values()].find((b) => b.type === 'camp')!;
}

/** Finds a clear, explored tile rectangle for a building near the camp. */
function findSpot(sim: Simulation, type: BuildingId) {
  for (let r = 3; r < 14; r++) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const res = applyCommand(sim, { type: 'place', building: type, x, y });
        if (res.ok) return [...sim.buildings.values()].find((b) => b.x === x && b.y === y && b.type === type)!;
      }
    }
  }
  throw new Error(`No spot for ${type}`);
}

describe('new game', () => {
  it('starts with five settlers, a camp and starting goods', () => {
    const sim = createNewGame(101);
    expect(sim.settlers).toHaveLength(5);
    expect(camp(sim).built).toBe(true);
    expect(sim.totals().food).toBe(STARTING_GOODS.food);
    expect(housingCapacity(sim)).toBe(5);
    expect(new Set(sim.settlers.map((s) => s.name)).size).toBe(5);
  });

  it('keeps the camp from being demolished', () => {
    const sim = createNewGame(101);
    expect(applyCommand(sim, { type: 'remove', buildingId: camp(sim).id }).ok).toBe(false);
  });
});

describe('gathering and hauling', () => {
  it('chops a tree, carries the wood to storage and leaves a stump', () => {
    const sim = createNewGame(202);
    const tree = nearestResource(sim, 'wood')!;
    const woodBefore = sim.totals().wood;
    const s = sim.settlers[3];
    s.job = 'hauler'; // keep other jobs from interfering
    expect(applyCommand(sim, { type: 'gather', ids: [s.id], x: tree.x, y: tree.y }).ok).toBe(true);
    runUntil(sim, () => sim.world.obj(tree.x, tree.y) === O.Stump, 3000);
    runUntil(sim, () => !s.carrying, 1000);
    expect(sim.totals().wood).toBeGreaterThanOrEqual(woodBefore + 8);
    expect(sim.regrowth.size).toBeGreaterThan(0);
  });

  it('rejects gathering from empty ground with a reason', () => {
    const sim = createNewGame(202);
    const res = applyCommand(sim, { type: 'gather', ids: [sim.settlers[0].id], x: 0, y: 1 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Nothing to gather/);
  });

  it('marks resources for harvest and laborers collect them', () => {
    const sim = createNewGame(303);
    const rock = nearestResource(sim, 'stone')!;
    const res = applyCommand(sim, { type: 'designate', x0: rock.x, y0: rock.y, x1: rock.x, y1: rock.y, on: true });
    expect(res.ok).toBe(true);
    runUntil(sim, () => sim.world.obj(rock.x, rock.y) !== O.Rock && sim.world.obj(rock.x, rock.y) !== O.Boulder, 4000);
    expect(sim.designations.size).toBe(0);
  });
});

describe('construction', () => {
  it('hauls materials to a house site, builds it and consumes exactly its cost', () => {
    const sim = createNewGame(404);
    camp(sim).inventory = { food: 60, wood: 40, stone: 20 };
    const house = findSpot(sim, 'house');
    expect(house.built).toBe(false);
    runUntil(sim, () => house.built, DAY_TICKS);
    // Gatherers may add more, but the 20 wood and 6 stone must have left storage.
    expect(accountedFor(sim, 'wood') + consumedByConstruction(sim, 'wood')).toBe(40 + sim.stats.woodGathered);
    expect(accountedFor(sim, 'stone') + consumedByConstruction(sim, 'stone')).toBe(20 + sim.stats.stoneGathered);
    expect(housingCapacity(sim)).toBe(7);
    assertNoNegativeReservations(sim);
  });

  it('refuses placement on water, trees and unexplored land', () => {
    const sim = createNewGame(404);
    const tree = nearestResource(sim, 'wood')!;
    const onTree = applyCommand(sim, { type: 'place', building: 'house', x: tree.x, y: tree.y });
    expect(onTree.ok).toBe(false);
    expect(onTree.message).toMatch(/harvest it first/);
    const far = applyCommand(sim, { type: 'place', building: 'house', x: 200, y: 200 });
    expect(far.message).toMatch(/Explore/);
    // The spawn pond is at (9,6).
    const pond = applyCommand(sim, { type: 'place', building: 'storehouse', x: 8, y: 5 });
    expect(pond.ok).toBe(false);
  });

  it('refunds delivered materials when a site is cancelled', () => {
    const sim = createNewGame(505);
    camp(sim).inventory = { wood: 40, stone: 20, food: 50 };
    const house = findSpot(sim, 'house');
    runUntil(sim, () => (house.delivered.wood ?? 0) >= 10, 2000);
    applyCommand(sim, { type: 'remove', buildingId: house.id });
    run(sim, 400);
    expect(accountedFor(sim, 'wood')).toBe(40 + sim.stats.woodGathered);
    assertNoNegativeReservations(sim);
  });

  it('turns path sites into road terrain', () => {
    const sim = createNewGame(606);
    const res = applyCommand(sim, { type: 'placeArea', building: 'path', x0: -3, y0: 3, x1: 3, y1: 3 });
    expect(res.ok).toBe(true);
    runUntil(sim, () => [...sim.buildings.values()].every((b) => b.type !== 'path'), DAY_TICKS);
    expect(sim.world.terrain(0, 3)).toBe(7);
  });
});

describe('bridges', () => {
  it('builds a bridge over shallow water once unlocked', () => {
    const sim = createNewGame(707);
    camp(sim).inventory = { planks: 10, food: 60 };
    // Find a shallow water tile at the pond's edge (next to land).
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < 14 && !spot; y++) for (let x = 4; x < 16 && !spot; x++) {
      if (sim.world.terrain(x, y) === 1 && sim.world.terrain(x - 1, y) !== 1 && sim.world.explored(x, y)) spot = { x, y };
    }
    expect(spot).not.toBeNull();
    const locked = applyCommand(sim, { type: 'place', building: 'bridge', x: spot!.x, y: spot!.y });
    expect(locked.message).toMatch(/Hamlet/);
    sim.progression.reached.push('hamlet');
    expect(applyCommand(sim, { type: 'place', building: 'bridge', x: spot!.x, y: spot!.y }).ok).toBe(true);
    runUntil(sim, () => sim.world.terrain(spot!.x, spot!.y) === 8, DAY_TICKS);
    expect(sim.walkable(spot!.x, spot!.y)).toBe(true);
    expect(sim.totals().planks).toBe(8);
  });
});

describe('farming', () => {
  it('tills, plants, grows through each stage and harvests food', () => {
    const sim = createNewGame(707);
    const res = applyCommand(sim, { type: 'placeArea', building: 'field', x0: -8, y0: 4, x1: -7, y1: 5, crop: 'turnip' });
    expect(res.ok).toBe(true);
    const fields = [...sim.buildings.values()].filter((b) => b.field);
    // A stray berry bush may block one tile of the rectangle.
    expect(fields.length).toBeGreaterThanOrEqual(3);
    const f = fields[0].field!;
    const seen = new Set<number>();
    runUntil(sim, () => {
      seen.add(fieldStage(f));
      return sim.stats.harvested > 0;
    }, DAY_TICKS * 3);
    expect([...seen].filter((s) => s >= 0).sort()).toEqual([0, 1, 2, 3]);
  });

  it('dry fields grow slower but never die', () => {
    const sim = createNewGame(808);
    applyCommand(sim, { type: 'place', building: 'field', x: -7, y: 5, crop: 'wheat' });
    const b = [...sim.buildings.values()].find((x) => x.field)!;
    b.field!.state = 'growing';
    b.field!.moisture = 0;
    sim.settlers.length = 0; // nobody to water it
    camp(sim).inventory = {}; // and no food to attract anyone
    run(sim, 500);
    expect(b.field!.state).toBe('growing');
    expect(b.field!.growth).toBeGreaterThan(0);
    expect(b.field!.growth).toBeLessThan(500);
  });

  it('only allows unlocked crops', () => {
    const sim = createNewGame(808);
    applyCommand(sim, { type: 'place', building: 'field', x: -7, y: 5 });
    const b = [...sim.buildings.values()].find((x) => x.field)!;
    expect(applyCommand(sim, { type: 'setCrop', buildingIds: [b.id], crop: 'pumpkin' }).ok).toBe(false);
    sim.progression.reached.push('hamlet');
    expect(applyCommand(sim, { type: 'setCrop', buildingIds: [b.id], crop: 'pumpkin' }).ok).toBe(true);
  });
});

describe('needs and population', () => {
  it('settlers eat from storage and sleep at night', () => {
    const sim = createNewGame(909);
    for (const s of sim.settlers) s.hunger = 20;
    const food = sim.totals().food;
    run(sim, 300);
    expect(sim.totals().food).toBeLessThan(food);
    expect(sim.settlers.every((s) => s.hunger > 40)).toBe(true);
    runUntil(sim, () => sim.isNight(), DAY_TICKS);
    run(sim, 200);
    expect(sim.settlers.filter((s) => s.anim === 'sleep').length).toBeGreaterThanOrEqual(4);
  });

  it('welcomes a newcomer when there is a free bed and food', () => {
    const sim = createNewGame(1010);
    camp(sim).inventory = { wood: 40, stone: 20, food: 80 };
    findSpot(sim, 'house');
    runUntil(sim, () => sim.settlers.length === 6, DAY_TICKS * 2);
    expect(sim.stats.arrivals).toBe(1);
    const house = [...sim.buildings.values()].find((b) => b.type === 'house')!;
    expect(sim.settlers.filter((s) => s.homeId === house.id)).toHaveLength(2);
    // Everyone else has an explicit camp bedroll.
    expect(sim.settlers.every((s) => s.homeId !== null)).toBe(true);
  });

  it('does not grow without housing', () => {
    const sim = createNewGame(1111);
    camp(sim).inventory = { food: 120 };
    run(sim, 1500);
    expect(sim.settlers).toHaveLength(5);
    expect(sim.populationStatus).toMatch(/house/);
  });
});

describe('production', () => {
  it('a crafter turns wood into planks at a workshop', () => {
    const sim = createNewGame(1212);
    camp(sim).inventory = { wood: 100, stone: 40, food: 60 };
    const ws = findSpot(sim, 'workshop');
    runUntil(sim, () => ws.built, DAY_TICKS * 2);
    expect(ws.workshop?.recipe).toBe('planks');
    applyCommand(sim, { type: 'setJob', ids: [sim.settlers[4].id], job: 'crafter' });
    runUntil(sim, () => sim.totals().planks >= 2, DAY_TICKS * 2);
    const woodTotal = 100 + sim.stats.woodGathered;
    expect(accountedFor(sim, 'wood') + consumedByConstruction(sim, 'wood') + consumedByCrafting(sim, 'wood')).toBe(woodTotal);
    assertNoNegativeReservations(sim);
  });

  it('explains why a workshop is idle', () => {
    const sim = createNewGame(1313);
    camp(sim).inventory = { wood: 60, stone: 40, food: 60 };
    const ws = findSpot(sim, 'workshop');
    runUntil(sim, () => ws.built, DAY_TICKS * 2);
    run(sim, 20);
    expect(ws.workshop!.status).toMatch(/No worker/i);
  });
});

describe('long run invariants', () => {
  it('never loses or duplicates goods over several days of autonomous play', () => {
    const sim = createNewGame(4242);
    camp(sim).inventory = { food: 40, wood: 60, stone: 30 };
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -6, y1: 6, crop: 'turnip' });
    findSpot(sim, 'house');
    const wood = nearestResource(sim, 'wood')!;
    applyCommand(sim, { type: 'gather', ids: [sim.settlers[1].id, sim.settlers[3].id], x: wood.x, y: wood.y });
    for (let i = 0; i < 6; i++) {
      run(sim, DAY_TICKS / 2);
      assertNoNegativeReservations(sim);
      for (const res of ['wood', 'stone'] as const) {
        const start = res === 'wood' ? 60 : 30;
        const gathered = res === 'wood' ? sim.stats.woodGathered : sim.stats.stoneGathered;
        expect(accountedFor(sim, res) + consumedByConstruction(sim, res) + consumedByCrafting(sim, res)).toBe(start + gathered);
      }
    }
    expect(sim.stats.harvested).toBeGreaterThan(0);
  });
});
