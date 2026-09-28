import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { DAY_TICKS, MORNING, START_TIME } from '../src/game/core/constants';
import { BUILDINGS } from '../src/game/data/buildings';
import { SAVE_VERSION, SaveError } from '../src/game/save/format';
import { migrate } from '../src/game/save/migrations';
import { SaveManager } from '../src/game/save/SaveManager';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { MemoryStore } from '../src/game/save/storage';
import {
  assignHomes, bedsOf, builtCount, campOf, completeBuilding, costOf, housingCapacity, permanentBeds, placeBuilding, residentCounts,
} from '../src/game/sim/buildings';
import { AREA_MAX_WORKERS, applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import { findPath } from '../src/game/sim/pathfinding';
import { welcomeNewcomer } from '../src/game/sim/population';
import { requirementProgress } from '../src/game/sim/progression';
import { MILESTONES } from '../src/game/data/progression';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { O, OBJECTS, T } from '../src/game/world/tiles';
import { CURRENT_GEN, riverCenter } from '../src/game/world/worldgen';
import {
  accountedFor, assertNoNegativeReservations, assertReservationsConsistent, consumedByConstruction, consumedByCrafting, legacyCampWorld, run, runUntil,
} from './helpers';

const extras = { name: 'Village Test', createdAt: 1 };

function camp(sim: Simulation): Building {
  return campOf(sim)!;
}

/** Places and instantly finishes a building (for tests about what happens after). */
function instant(sim: Simulation, type: Parameters<typeof placeBuilding>[1], x: number, y: number): Building {
  const b = placeBuilding(sim, type, x, y);
  b.delivered = { ...costOf(b) };
  completeBuilding(sim, b, true);
  return b;
}

/** A clear rectangle of explored buildable land near the camp. */
function clearSpot(sim: Simulation, w: number, h: number, near = { x: 0, y: -6 }): { x: number; y: number } {
  for (let r = 0; r < 20; r++) {
    for (let y = near.y - r; y <= near.y + r; y++) {
      for (let x = near.x - r; x <= near.x + r; x++) {
        let ok = true;
        for (let dy = -1; dy <= h && ok; dy++) {
          for (let dx = -1; dx <= w && ok; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            const t = sim.world.terrain(tx, ty);
            ok = sim.world.explored(tx, ty) && !sim.buildingAt(tx, ty) && (t === T.Grass || t === T.Meadow || t === T.Forest)
              && !OBJECTS[sim.world.obj(tx, ty)].blocks;
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  throw new Error('no clear spot');
}

function toNight(sim: Simulation): void {
  runUntil(sim, () => sim.isNight(), DAY_TICKS);
}
function toMorning(sim: Simulation): void {
  runUntil(sim, () => !sim.isNight() && sim.timeOfDay > MORNING + 0.02, DAY_TICKS);
}

const HOUSE_BEDS = BUILDINGS.house.housing;
afterEach(() => {
  (BUILDINGS.house as { housing?: number }).housing = HOUSE_BEDS;
});

// ---------------------------------------------------------------------------------

describe('work areas', () => {
  it('assigned settlers chop trees inside a woodlot without harvest marks, and nothing outside it', () => {
    const sim = createNewGame(111);
    const s = sim.settlers[3];
    s.job = 'hauler';
    // Pick a rectangle around the nearest tree.
    let tree: { x: number; y: number } | null = null;
    for (let r = 7; r < 16 && !tree; r++) for (let x = -r; x <= r && !tree; x++) if (OBJECTS[sim.world.obj(x, -r)].resource === 'wood') tree = { x, y: -r };
    expect(tree).not.toBeNull();
    const res = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: tree!.x - 2, y0: tree!.y - 2, x1: tree!.x + 2, y1: tree!.y + 2 });
    expect(res.ok).toBe(true);
    const areaId = res.id!;
    expect(applyCommand(sim, { type: 'assignArea', ids: [s.id], areaId }).ok).toBe(true);
    run(sim, 8);
    expect(s.task?.kind).toBe('gather');
    const t = s.task as { x: number; y: number };
    const a = sim.area(areaId)!;
    expect(t.x >= a.x0 && t.x <= a.x1 && t.y >= a.y0 && t.y <= a.y1).toBe(true);
    assertReservationsConsistent(sim);
  });

  it('direct orders take precedence, then the settler returns to area work', () => {
    const sim = createNewGame(111);
    const s = sim.settlers[3];
    const res = applyCommand(sim, { type: 'createArea', kind: 'stone', x0: -16, y0: -16, x1: 16, y1: 16 });
    applyCommand(sim, { type: 'assignArea', ids: [s.id], areaId: res.id! });
    run(sim, 8);
    expect(applyCommand(sim, { type: 'move', ids: [s.id], x: 3, y: 3 }).ok).toBe(true);
    expect(s.task?.kind).toBe('move');
    runUntil(sim, () => s.task?.kind !== 'move', 400);
    runUntil(sim, () => s.task?.kind === 'gather' && sim.world.obj((s.task as { x: number }).x, (s.task as { y: number }).y) !== O.None, 200);
    const t = s.task as { x: number; y: number };
    expect(OBJECTS[sim.world.obj(t.x, t.y)].resource).toBe('stone');
  });

  it('farm areas tend only their own fields first and explain when there is nothing to do', () => {
    const sim = createNewGame(222);
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -8, y1: 4, crop: 'turnip' });
    const area = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -9, y0: 3, x1: -8, y1: 4, name: 'Meadow farm' });
    const empty = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: 4, y0: 6, x1: 6, y1: 8, name: 'Empty farm' });
    const [a, b] = [sim.settlers[3], sim.settlers[4]];
    applyCommand(sim, { type: 'assignArea', ids: [a.id], areaId: area.id! });
    applyCommand(sim, { type: 'assignArea', ids: [b.id], areaId: empty.id! });
    applyCommand(sim, { type: 'setPriorities', ids: [b.id], priorities: [] });
    run(sim, 12);
    expect(a.task?.kind).toBe('farm');
    expect(b.idleReason).toMatch(/Empty farm has no fields/);
  });

  it('areas respect fog and have a worker limit', () => {
    const sim = createNewGame(333);
    expect(applyCommand(sim, { type: 'createArea', kind: 'wood', x0: 300, y0: 300, x1: 310, y1: 310 }).message).toMatch(/Explore/);
    expect(applyCommand(sim, { type: 'createArea', kind: 'wood', x0: 0, y0: 0, x1: 60, y1: 60 }).message).toMatch(/too large/);
    const id = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -5, y0: -5, x1: 5, y1: 5 }).id!;
    for (let i = 0; i < AREA_MAX_WORKERS + 3; i++) sim.addSettler(0, 3, 'laborer');
    const res = applyCommand(sim, { type: 'assignArea', ids: sim.settlers.map((s) => s.id), areaId: id });
    expect(res.message).toMatch(/didn't fit/);
    expect(sim.settlers.filter((s) => s.areaId === id)).toHaveLength(AREA_MAX_WORKERS);
    expect(applyCommand(sim, { type: 'assignArea', ids: [sim.settlers.at(-1)!.id], areaId: id }).ok).toBe(false);
  });

  it('releases every reservation when areas and work orders change mid-task', () => {
    const sim = createNewGame(444);
    camp(sim).inventory = { food: 80, wood: 60, stone: 30 };
    const wood = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -16, y0: -16, x1: 16, y1: 16 }).id!;
    const farm = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -10, y0: 2, x1: -5, y1: 6 }).id!;
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -6, y1: 5, crop: 'turnip' });
    applyCommand(sim, { type: 'assignArea', ids: sim.settlers.slice(0, 3).map((s) => s.id), areaId: wood });
    applyCommand(sim, { type: 'assignArea', ids: sim.settlers.slice(3).map((s) => s.id), areaId: farm });
    for (let i = 0; i < 12; i++) {
      run(sim, 37);
      assertReservationsConsistent(sim);
      if (i === 3) applyCommand(sim, { type: 'deleteArea', areaId: wood });
      if (i === 5) applyCommand(sim, { type: 'updateArea', areaId: farm, rect: { x0: -9, y0: 3, x1: -8, y1: 3 } });
      if (i === 7) applyCommand(sim, { type: 'setPriorities', ids: sim.settlers.map((s) => s.id), priorities: ['haul', 'build'] });
      if (i === 9) applyCommand(sim, { type: 'setJob', ids: sim.settlers.map((s) => s.id), job: 'laborer' });
      assertReservationsConsistent(sim);
      assertNoNegativeReservations(sim);
    }
    expect(accountedFor(sim, 'wood') + consumedByConstruction(sim, 'wood')).toBe(60 + sim.stats.woodGathered);
  });
});

describe('work orders', () => {
  it('follows a personal order and explains an empty one', () => {
    const sim = createNewGame(555);
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -8, y1: 4 });
    const s = sim.settlers[1]; // gatherer by default
    applyCommand(sim, { type: 'setPriorities', ids: [s.id], priorities: ['farm', 'haul'] });
    run(sim, 8);
    expect(s.task?.kind).toBe('farm');
    applyCommand(sim, { type: 'setPriorities', ids: [s.id], priorities: [] });
    runUntil(sim, () => !s.task || s.task.kind === 'wander', 400);
    run(sim, 8);
    expect(s.idleReason).toMatch(/switched off/);
    applyCommand(sim, { type: 'setJob', ids: [s.id], job: 'farmer' });
    expect(s.priorities).toBeNull();
  });
});

// ---------------------------------------------------------------------------------

describe('wheat → mill → bakery', () => {
  function chain(seed: number) {
    const sim = createNewGame(seed);
    sim.progression.reached.push('hamlet');
    camp(sim).inventory = { food: 60, wood: 60, stone: 20, wheat: 30 };
    const m = clearSpot(sim, 2, 2, { x: 5, y: -4 });
    const mill = instant(sim, 'mill', m.x, m.y);
    const k = clearSpot(sim, 3, 2, { x: -5, y: -5 });
    const bakery = instant(sim, 'bakery', k.x, k.y);
    return { sim, mill, bakery };
  }

  it('wheat is harvested as wheat, milled into flour and baked into food, with every unit accounted for', () => {
    const { sim, mill, bakery } = chain(606);
    const [miller, baker] = [sim.settlers[3], sim.settlers[4]];
    expect(applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: [miller.id] }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'assignWorker', buildingId: bakery.id, ids: [baker.id] }).ok).toBe(true);
    runUntil(sim, () => sim.stats.bakedFood >= 10, DAY_TICKS * 2);
    expect(sim.stats.flourMilled).toBeGreaterThan(0);
    const wheatIn = 30 + sim.stats.wheatHarvested;
    expect(accountedFor(sim, 'wheat') + consumedByCrafting(sim, 'wheat')).toBe(wheatIn);
    expect(accountedFor(sim, 'flour') + consumedByCrafting(sim, 'flour')).toBe(sim.stats.flourMilled);
    expect(accountedFor(sim, 'wood') + consumedByCrafting(sim, 'wood') + consumedByConstruction(sim, 'wood') - consumedByConstruction(sim, 'wood')).toBe(60 + sim.stats.woodGathered);
    assertReservationsConsistent(sim);
  });

  it('harvesting a wheat field yields wheat for the mill, not food', () => {
    const sim = createNewGame(707);
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -7, y1: 5, crop: 'wheat' });
    runUntil(sim, () => sim.stats.wheatHarvested > 0, DAY_TICKS * 3);
    expect(sim.stats.harvested).toBe(0);
    runUntil(sim, () => sim.totals().wheat > 0, 600);
  });

  it('enforces worker limits and explains stopped production', () => {
    const { sim, mill } = chain(808);
    camp(sim).inventory = { food: 60 };
    run(sim, 20);
    expect(mill.workshop!.status).toMatch(/No worker/);
    const [a, b] = [sim.settlers[3], sim.settlers[4]];
    expect(applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: [a.id] }).ok).toBe(true);
    const second = applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: [b.id] });
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/1\/1 worker/);
    run(sim, 20);
    expect(mill.workshop!.status).toMatch(/Needs 3 wheat — none in storage/);
  });
});

// ---------------------------------------------------------------------------------

/** Finds a straight east-west crossing of the great river near the camp. */
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

describe('stone bridge', () => {
  function bridgeWorld() {
    const sim = createNewGame(9090);
    sim.progression.reached.push('hamlet');
    const c = riverCrossing(sim);
    // Reveal the river and a corridor from camp so builders can get there.
    for (let x = 0; x <= c.x1 + 8; x += 4) sim.world.reveal(x, c.y, 7);
    return { sim, c };
  }

  it('shows clear placement reasons before confirming', () => {
    const { sim, c } = bridgeWorld();
    const tooShort = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x0, y1: c.y });
    expect(tooShort.message).toMatch(/Too short|dry land/);
    const half = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1 - 1, y1: c.y });
    expect(half.message).toMatch(/dry land/);
    const onLand = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0 - 2, y0: c.y, x1: c.x1, y1: c.y });
    expect(onLand.message).toMatch(/water only/);
    const woodenDeep = applyCommand(sim, { type: 'place', building: 'bridge', x: Math.round(riverCenter(sim.seed, c.y)), y: c.y });
    expect(woodenDeep.message).toMatch(/stone bridge/);
    const locked = createNewGame(9090);
    expect(applyCommand(locked, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1, y1: c.y }).message).toMatch(/Hamlet|Explore/);
  });

  it('is supplied by haulers, costs exactly its length, and opens a path across when finished', () => {
    const { sim, c } = bridgeWorld();
    const len = c.x1 - c.x0 + 1;
    camp(sim).inventory = { food: 120, stone: 100, planks: 40 };
    const west = { x: c.x0 - 1, y: c.y };
    const east = { x: c.x1 + 1, y: c.y };
    expect(findPath(sim, west.x, west.y, { x: east.x, y: east.y, w: 1, h: 1, adjacent: false }, 20000)).toBeNull();
    const res = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1, y1: c.y });
    expect(res.ok).toBe(true);
    const bridge = sim.buildings.get(res.id!)!;
    expect(costOf(bridge)).toEqual({ stone: 6 * len, planks: 2 * len });
    // Settlers already walking somewhere keep a sane path when it completes.
    runUntil(sim, () => bridge.built, DAY_TICKS * 4);
    for (let x = c.x0; x <= c.x1; x++) expect(sim.world.terrain(x, c.y)).toBe(T.StoneBridge);
    expect(sim.totals().stone).toBe(100 - 6 * len + sim.stats.stoneGathered - (accountedFor(sim, 'stone') - sim.totals().stone));
    expect(accountedFor(sim, 'planks') + consumedByConstruction(sim, 'planks')).toBe(40);
    expect(findPath(sim, west.x, west.y, { x: east.x, y: east.y, w: 1, h: 1, adjacent: false }, 20000)).not.toBeNull();
    expect(builtCount(sim, 'stoneBridge')).toBe(1);
    // A settler ordered across walks over the new deck.
    const s = sim.settlers[0];
    applyCommand(sim, { type: 'move', ids: [s.id], x: east.x + 2, y: east.y });
    runUntil(sim, () => Math.floor(s.x) >= east.x, DAY_TICKS);
    // Permanent, and it survives a save.
    expect(applyCommand(sim, { type: 'remove', buildingId: bridge.id }).ok).toBe(false);
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    const lb = [...loaded.buildings.values()].find((b) => b.type === 'stoneBridge')!;
    expect([lb.w, lb.h, lb.built]).toEqual([len, 1, true]);
    expect(loaded.walkable(c.x0 + 1, c.y)).toBe(true);
  });

  it('cancelling a half-supplied bridge returns every stone and plank', () => {
    const { sim, c } = bridgeWorld();
    camp(sim).inventory = { food: 120, stone: 100, planks: 40 };
    const res = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1, y1: c.y });
    const bridge = sim.buildings.get(res.id!)!;
    runUntil(sim, () => (bridge.delivered.stone ?? 0) >= 12, DAY_TICKS * 2);
    expect(applyCommand(sim, { type: 'remove', buildingId: bridge.id }).ok).toBe(true);
    run(sim, 300);
    expect(accountedFor(sim, 'stone')).toBe(100 + sim.stats.stoneGathered);
    expect(accountedFor(sim, 'planks')).toBe(40);
    assertReservationsConsistent(sim);
    for (let x = c.x0; x <= c.x1; x++) expect(sim.world.terrain(x, c.y)).not.toBe(T.StoneBridge);
  });
});

// ---------------------------------------------------------------------------------

describe('village progression', () => {
  it('lets the player pick any two village projects and unlocks cottages', () => {
    const sim = createNewGame(1212);
    sim.progression.reached.push('hamlet');
    for (let i = 0; i < 5; i++) sim.addSettler(0, 3, 'laborer');
    const houses: Building[] = [];
    for (let i = 0; i < 4; i++) {
      const p = clearSpot(sim, 2, 2, { x: -3 + i * 3, y: -7 });
      houses.push(instant(sim, 'house', p.x, p.y));
    }
    assignHomes(sim);
    const village = MILESTONES.village;
    const anyOf = requirementProgress(sim, village.requirements[2]);
    expect(anyOf.current).toBe(0);
    expect(anyOf.options).toHaveLength(4);
    sim.stats.pathsBuilt = 25;
    run(sim, 60);
    expect(sim.progression.reached).not.toContain('village');
    const a1 = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -10, y0: 2, x1: -5, y1: 6 }).id!;
    const a2 = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -16, y0: -16, x1: -8, y1: -8 }).id!;
    applyCommand(sim, { type: 'assignArea', ids: [sim.settlers[0].id], areaId: a1 });
    applyCommand(sim, { type: 'assignArea', ids: [sim.settlers[1].id], areaId: a2 });
    expect(requirementProgress(sim, village.requirements[2]).done).toBe(true);
    runUntil(sim, () => sim.progression.reached.includes('village'), 200);
    expect(sim.chronicle.some((c) => c.kind === 'milestone' && /Village/.test(c.text))).toBe(true);
    const p = clearSpot(sim, 3, 2, { x: 4, y: 6 });
    expect(applyCommand(sim, { type: 'place', building: 'cottage', x: p.x, y: p.y }).ok).toBe(true);
  });

  it('hall bunks and camp bedrolls never count as village beds', () => {
    const hall = createNewGame(1313);
    expect(housingCapacity(hall)).toBe(10);
    expect(permanentBeds(hall)).toBe(0);
    const sim = legacyCampWorld(1313);
    expect(housingCapacity(sim)).toBe(5);
    expect(permanentBeds(sim)).toBe(0);
    expect(requirementProgress(sim, { kind: 'beds', count: 8 }).current).toBe(0);
  });
});

// ---------------------------------------------------------------------------------

describe('housing and routines', () => {
  it('1: a house with three beds takes exactly three residents, never four', () => {
    (BUILDINGS.house as { housing?: number }).housing = 3;
    const sim = createNewGame(2121);
    const p = clearSpot(sim, 2, 2);
    const house = instant(sim, 'house', p.x, p.y);
    expect(bedsOf(house)).toBe(3);
    expect(residentCounts(sim).get(house.id)).toBe(3);
    const outsider = sim.settlers.find((s) => s.homeId !== house.id)!;
    const res = applyCommand(sim, { type: 'work', ids: [outsider.id], buildingId: house.id });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/3\/3 beds/);
    outsider.homeId = house.id; // even a forced over-assignment gets corrected
    assignHomes(sim);
    expect(residentCounts(sim).get(house.id)).toBe(3);
  });

  it('2: two newcomers competing for one free bed produce only one arrival', () => {
    const sim = legacyCampWorld(2222);
    camp(sim).inventory = { food: 200 };
    const p = clearSpot(sim, 2, 2);
    instant(sim, 'house', p.x, p.y); // 5 bedrolls + 2 beds = 7, 5 settlers
    sim.addSettler(0, 3, 'laborer');
    assignHomes(sim);
    expect(housingCapacity(sim) - sim.settlers.length).toBe(1);
    const first = welcomeNewcomer(sim);
    const second = welcomeNewcomer(sim);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(sim.settlers).toHaveLength(7);
    for (const [id, n] of residentCounts(sim)) expect(n).toBeLessThanOrEqual(bedsOf(sim.buildings.get(id)!));
  });

  it('3: an unfinished house adds no beds', () => {
    const sim = createNewGame(2323);
    const before = housingCapacity(sim);
    const p = clearSpot(sim, 2, 2);
    applyCommand(sim, { type: 'place', building: 'house', x: p.x, y: p.y });
    expect(housingCapacity(sim)).toBe(before);
    camp(sim).inventory = { food: 200 };
    run(sim, 200);
    expect(sim.settlers).toHaveLength(5);
  });

  it('4: removing an occupied house rehouses its residents where possible and reports the shortage', () => {
    const sim = legacyCampWorld(2424);
    for (let i = 0; i < 3; i++) sim.addSettler(0, 3, 'laborer'); // 8 settlers
    const p1 = clearSpot(sim, 2, 2, { x: -4, y: -7 });
    const h1 = instant(sim, 'house', p1.x, p1.y);
    const p2 = clearSpot(sim, 2, 2, { x: 4, y: -7 });
    const h2 = instant(sim, 'house', p2.x, p2.y);
    assignHomes(sim);
    expect(sim.settlers.every((s) => s.homeId !== null)).toBe(true); // 5 + 2 + 2 = 9 beds
    const res = applyCommand(sim, { type: 'remove', buildingId: h1.id });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/no bed now|moved to other beds/);
    const homeless = sim.settlers.filter((s) => s.homeId === null).length;
    expect(homeless).toBe(1); // 7 beds left for 8 settlers
    expect(res.message).toMatch(/1 settler has no bed/);
    expect(residentCounts(sim).get(h2.id)).toBe(2);
    expect(sim.chronicle.some((c) => c.kind === 'shortage')).toBe(true);
    expect(sim.settlers).toHaveLength(8);
  });

  it('5: housed settlers sleep inside their own homes at night and go back to work after waking', () => {
    const sim = createNewGame(2525);
    sim.growthMode = 'legacy'; // newcomer arrivals, as in worlds from before deliberate growth
    const p = clearSpot(sim, 2, 2);
    const house = instant(sim, 'house', p.x, p.y);
    assignHomes(sim);
    const residents = sim.settlers.filter((s) => s.homeId === house.id);
    expect(residents).toHaveLength(2);
    toNight(sim);
    run(sim, 300);
    for (const s of residents) {
      expect(s.hidden).toBe(true);
      expect(s.insideId).toBe(house.id);
    }
    const campers = sim.settlers.filter((s) => s.homeId === camp(sim).id);
    const spots = new Set(campers.map((s) => `${Math.floor(s.x)},${Math.floor(s.y)}`));
    expect(spots.size).toBe(campers.length); // no pile-up on one tile
    toMorning(sim);
    run(sim, 200);
    expect(residents.every((s) => !s.hidden && s.insideId === null)).toBe(true);
    expect(sim.settlers.filter((s) => s.task && s.task.kind !== 'sleep').length).toBeGreaterThan(0);
  });

  it('6: a walled-in home gives an understandable fallback instead of a loop', () => {
    const sim = createNewGame(2626);
    const p = clearSpot(sim, 2, 2, { x: 0, y: -8 });
    const house = instant(sim, 'house', p.x, p.y);
    assignHomes(sim);
    // Fence it in completely.
    for (let y = p.y - 1; y <= p.y + 2; y++) for (let x = p.x - 1; x <= p.x + 2; x++) if (!sim.buildingAt(x, y)) instant(sim, 'fence', x, y);
    const resident = sim.settlers.find((s) => s.homeId === house.id)!;
    toNight(sim);
    run(sim, 400);
    expect(resident.task?.kind).toBe('sleep');
    expect(resident.hidden).toBe(false);
    expect(resident.restNote).toMatch(/blocked|out of reach|Resting/);
    // New arrivals aren't offered the unreachable beds.
    const res = applyCommand(sim, { type: 'remove', buildingId: sim.buildingAt(p.x - 1, p.y + 2)!.id });
    expect(res.ok).toBe(true);
  });

  it('7: save and reload keep home assignments and occupancy', () => {
    const sim = createNewGame(2727);
    const p = clearSpot(sim, 2, 2);
    const house = instant(sim, 'house', p.x, p.y);
    sim.addSettler(0, 3, 'laborer');
    assignHomes(sim);
    const homes = sim.settlers.map((s) => [s.id, s.homeId]);
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    expect(loaded.settlers.map((s) => [s.id, s.homeId])).toEqual(homes);
    expect(residentCounts(loaded).get(house.id)).toBe(2);
    expect(residentCounts(loaded).get(camp(loaded).id)).toBe(4);
  });

  it('8: limits hold with a larger population, many areas and production buildings', () => {
    const sim = createNewGame(2828);
    sim.progression.reached.push('hamlet');
    camp(sim).inventory = { food: 200, wood: 60, stone: 40, wheat: 30 };
    for (let i = 0; i < 55; i++) sim.addSettler((i % 9) - 4, 3 + Math.floor(i / 9), (['laborer', 'hauler', 'builder', 'farmer', 'gatherer'] as const)[i % 5]);
    const m = clearSpot(sim, 2, 2, { x: 6, y: -5 });
    const mill = instant(sim, 'mill', m.x, m.y);
    const ws = clearSpot(sim, 3, 2, { x: -6, y: -6 });
    const workshop = instant(sim, 'workshop', ws.x, ws.y);
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -10, y0: 3, x1: -6, y1: 6, crop: 'wheat' });
    const areas = [
      applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -16, y0: -16, x1: 0, y1: -8 }).id!,
      applyCommand(sim, { type: 'createArea', kind: 'stone', x0: 0, y0: -16, x1: 16, y1: 16 }).id!,
      applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -10, y0: 3, x1: -6, y1: 6 }).id!,
    ];
    areas.forEach((a, i) => applyCommand(sim, { type: 'assignArea', ids: sim.settlers.slice(i * 20, i * 20 + 20).map((s) => s.id), areaId: a }));
    applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: sim.settlers.slice(56, 59).map((s) => s.id) });
    applyCommand(sim, { type: 'assignWorker', buildingId: workshop.id, ids: [sim.settlers[59].id] });
    for (let i = 0; i < 8; i++) {
      run(sim, 150);
      assertReservationsConsistent(sim);
      assertNoNegativeReservations(sim);
      for (const a of areas) expect(sim.settlers.filter((s) => s.areaId === a).length).toBeLessThanOrEqual(AREA_MAX_WORKERS);
      for (const b of sim.buildings.values()) expect(b.workers.length).toBeLessThanOrEqual(BUILDINGS[b.type].maxWorkers ?? 0);
      for (const s of sim.settlers) if (s.carrying) expect(s.carrying.amount).toBeLessThanOrEqual(Math.max(s.capacity, 9));
      for (const [id, n] of residentCounts(sim)) expect(n).toBeLessThanOrEqual(bedsOf(sim.buildings.get(id)!));
      // One active task per settler; each exclusive job has at most one worker.
      const craft = sim.settlers.filter((s) => s.task?.kind === 'craft').map((s) => (s.task as { ws: number }).ws);
      expect(new Set(craft).size).toBe(craft.length);
    }
    expect(mill.workers).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------

describe('save compatibility', () => {
  const v2 = readFileSync('tests/fixtures/v2-save.json', 'utf8');
  const fingerprint = JSON.parse(readFileSync('tests/fixtures/gen-v1-fingerprint.json', 'utf8')) as Record<string, [number, number]>;
  const fnv = (bytes: Uint8Array) => {
    let h = 2166136261;
    for (const b of bytes) h = Math.imul(h ^ b, 16777619);
    return h >>> 0;
  };

  it('migrates a genuine v2 save with sensible defaults', () => {
    const raw = JSON.parse(v2);
    expect(raw.version).toBe(2);
    const save = migrate(raw);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.world.genVersion).toBe(1);
    const sim = deserializeSim(save);
    expect(sim.world.genVersion).toBe(1);
    expect(sim.workAreas).toEqual([]);
    expect(sim.settlers.every((s) => s.areaId === null && s.priorities === null)).toBe(true);
    expect(sim.settlers.every((s) => s.homeId !== null)).toBe(true);
    expect(sim.session).toBeNull();
    for (const [id, n] of residentCounts(sim)) expect(n).toBeLessThanOrEqual(bedsOf(sim.buildings.get(id)!));
    run(sim, 600);
    assertReservationsConsistent(sim);
  });

  it('old worlds keep generating unexplored land with generator 1', () => {
    const sim = deserializeSim(migrate(JSON.parse(v2)));
    for (const [key, [terrain, obj]] of Object.entries(fingerprint)) {
      const [seed, cx, cy] = key.split(':').map(Number);
      if (seed !== sim.seed) continue;
      if (sim.world.peekChunk(cx, cy)) continue; // already in the save
      const c = sim.world.chunk(cx, cy);
      expect([fnv(c.terrain), fnv(c.obj)]).toEqual([terrain, obj]);
    }
    // And new worlds get the new generator with the great river.
    const fresh = createNewGame(424242);
    expect(fresh.world.genVersion).toBe(CURRENT_GEN);
    const c = Math.round(riverCenter(424242, 0));
    expect([T.Water, T.DeepWater]).toContain(fresh.world.terrain(c, 0));
  });

  it('recovers a v2 world from its backup or an emergency copy', async () => {
    const store = new MemoryStore();
    store.meta.set('old', { slot: 'old', name: 'Fixture Valley', seed: 424242, savedAt: 1, day: 2, population: 7, milestone: 'hamlet' });
    store.data.set('old', { current: v2.slice(0, 500), backup: v2 });
    const mgr = new SaveManager(store);
    const res = await mgr.load('old');
    expect(res.usedBackup).toBe(true);
    expect(res.sim.world.genVersion).toBe(1);

    const em = new Map<string, string>();
    const withEmergency = new SaveManager(new MemoryStore(), { get: (s) => em.get(s) ?? null, set: (s, t) => void em.set(s, t), clear: (s) => void em.delete(s) });
    const newer = JSON.parse(v2);
    newer.meta.savedAt = Date.now();
    em.set('old', JSON.stringify(newer));
    const r2 = await withEmergency.load('old');
    expect(r2.sim.tick).toBe(newer.sim.tick);
  });

  it('reports an unrecoverable save clearly instead of starting over', async () => {
    const store = new MemoryStore();
    store.data.set('broken', { current: '{"version":3', backup: '{"version":2,"meta":{}}' });
    await expect(new SaveManager(store).load('broken')).rejects.toThrow(SaveError);
    await expect(new SaveManager(store).load('broken')).rejects.toThrow(/not readable.*Backup also failed/);
  });

  it('round-trips areas, work orders, workers, chronicle and session exactly', () => {
    const sim = createNewGame(3131);
    sim.progression.reached.push('hamlet');
    const a = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -12, y0: -12, x1: -4, y1: -4, name: 'North wood' }).id!;
    applyCommand(sim, { type: 'assignArea', ids: [sim.settlers[0].id], areaId: a });
    applyCommand(sim, { type: 'setPriorities', ids: [sim.settlers[1].id], priorities: ['haul', 'farm'] });
    const m = clearSpot(sim, 2, 2, { x: 6, y: -5 });
    const mill = instant(sim, 'mill', m.x, m.y);
    applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: [sim.settlers[2].id] });
    sim.record('built', 'Built a mill', m.x, m.y);
    run(sim, 300);
    const stable = (s: Simulation) => {
      const f = serializeSim(s, extras);
      return { ...f, meta: { ...f.meta, savedAt: 0 } };
    };
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    expect(stable(loaded)).toEqual(stable(sim));
    expect(loaded.settlers[0].areaId).toBe(a);
    expect(loaded.buildings.get(mill.id)!.workers).toEqual([sim.settlers[2].id]);
  });
});

// ---------------------------------------------------------------------------------

describe('Hamlet → Village journey', () => {
  it('reaches Village through player commands: bread, work areas, homes', () => {
    const sim = createNewGame(20261001);
    sim.growthMode = 'legacy'; // this journey covers the arrival rules older worlds keep
    const ids = () => sim.settlers.map((s) => s.id);
    camp(sim).inventory = { food: 60, wood: 90, stone: 50 };
    // Hamlet: a house, fields, a harvest.
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -10, y0: 3, x1: -6, y1: 6, crop: 'turnip' });
    const h = clearSpot(sim, 2, 2, { x: 3, y: -5 });
    applyCommand(sim, { type: 'place', building: 'house', x: h.x, y: h.y });
    const quarry = applyCommand(sim, { type: 'createArea', kind: 'stone', x0: -16, y0: -16, x1: 16, y1: 16, name: 'Quarry' }).id!;
    const woodlot = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -16, y0: -16, x1: 16, y1: 16, name: 'Woodlot' }).id!;
    applyCommand(sim, { type: 'assignArea', ids: [ids()[1]], areaId: woodlot });
    applyCommand(sim, { type: 'assignArea', ids: [ids()[2]], areaId: quarry });
    runUntil(sim, () => sim.progression.reached.includes('hamlet'), DAY_TICKS * 6);

    // Village prep: mill + bakery, wheat, more houses.
    const m = clearSpot(sim, 2, 2, { x: 7, y: -3 });
    expect(applyCommand(sim, { type: 'place', building: 'mill', x: m.x, y: m.y }).ok).toBe(true);
    const k = clearSpot(sim, 3, 2, { x: -4, y: -8 });
    expect(applyCommand(sim, { type: 'place', building: 'bakery', x: k.x, y: k.y }).ok).toBe(true);
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -14, y0: 6, x1: -10, y1: 9, crop: 'wheat' });
    for (const near of [{ x: 7, y: 4 }, { x: 0, y: 8 }, { x: -3, y: -12 }]) {
      const p = clearSpot(sim, 2, 2, near);
      applyCommand(sim, { type: 'place', building: 'house', x: p.x, y: p.y });
    }
    const farm = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -14, y0: 3, x1: -6, y1: 9, name: 'Home farm' }).id!;
    applyCommand(sim, { type: 'assignArea', ids: [ids()[0]], areaId: farm });
    // Areas fill the camp's stores quickly: a storehouse keeps goods flowing.
    const sh = clearSpot(sim, 3, 2, { x: 9, y: 0 });
    expect(applyCommand(sim, { type: 'place', building: 'storehouse', x: sh.x, y: sh.y }).ok).toBe(true);
    // The bakery needs planks, so a workshop and a crafter come first.
    const w = clearSpot(sim, 3, 2, { x: 5, y: 12 });
    expect(applyCommand(sim, { type: 'place', building: 'workshop', x: w.x, y: w.y }).ok).toBe(true);
    runUntil(sim, () => builtCount(sim, 'workshop') === 1, DAY_TICKS * 8);
    const workshop = [...sim.buildings.values()].find((b) => b.type === 'workshop')!;
    expect(applyCommand(sim, { type: 'work', ids: [ids()[4]], buildingId: workshop.id }).ok).toBe(true);
    runUntil(sim, () => builtCount(sim, 'mill') === 1 && builtCount(sim, 'bakery') === 1, DAY_TICKS * 10);
    const mill = [...sim.buildings.values()].find((b) => b.type === 'mill')!;
    const bakery = [...sim.buildings.values()].find((b) => b.type === 'bakery')!;
    const [miller, baker] = sim.settlers.slice(-2);
    expect(applyCommand(sim, { type: 'work', ids: [miller.id], buildingId: mill.id }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'work', ids: [baker.id], buildingId: bakery.id }).ok).toBe(true);
    runUntil(sim, () => sim.progression.reached.includes('village'), DAY_TICKS * 25);
    expect(sim.settlers.length).toBeGreaterThanOrEqual(10);
    expect(permanentBeds(sim)).toBeGreaterThanOrEqual(8);
    assertReservationsConsistent(sim);
    // Resume from a save and keep going.
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    expect(loaded.progression.reached).toContain('village');
    run(loaded, 300);
    assertReservationsConsistent(loaded);
    void START_TIME;
  });
});

describe('exploring to the river and the Valley today summary', () => {
  it('a scout at the riverbank can see the far bank, so a bridge can be planned without magic', () => {
    const sim = createNewGame(9090);
    sim.progression.reached.push('hamlet');
    const c = riverCrossing(sim);
    // Reveal only a corridor up to the west bank, as a player walking there would.
    for (let x = 0; x <= c.x0 - 4; x += 4) sim.world.reveal(x, c.y, 6);
    const scout = sim.settlers[0];
    applyCommand(sim, { type: 'move', ids: [scout.id], x: c.x0 - 1, y: c.y });
    runUntil(sim, () => Math.floor(scout.x) === c.x0 - 1 && Math.floor(scout.y) === c.y, DAY_TICKS);
    run(sim, 20);
    expect(sim.world.explored(c.x1 + 1, c.y)).toBe(true);
    expect(applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1, y1: c.y }).ok).toBe(true);
  });

  it('summarises only recorded events and targets real things', async () => {
    const { buildOverview } = await import('../src/engine/overview');
    const sim = createNewGame(4141);
    sim.growthMode = 'legacy';
    // No earlier session: say so rather than invent history.
    const first = buildOverview(sim, null);
    expect(first.since).toBeNull();
    expect(first.sinceNote).toMatch(/no record/i);
    const prev = sim.session;
    camp(sim).inventory = { food: 80, wood: 60, stone: 30 };
    const p = clearSpot(sim, 2, 2);
    applyCommand(sim, { type: 'place', building: 'house', x: p.x, y: p.y });
    runUntil(sim, () => builtCount(sim, 'house') === 1 && sim.settlers.length === 6, DAY_TICKS * 2);
    const o = buildOverview(sim, prev);
    expect(o.since!.join(' ')).toMatch(/house/);
    expect(o.since!.join(' ')).toMatch(new RegExp(sim.settlers.at(-1)!.name));
    expect(o.since!.join(' ')).not.toMatch(/bridge|mill|Village/);
    expect(o.issues.length).toBeLessThanOrEqual(3);
    expect(o.goals.length).toBeGreaterThan(0);
    for (const item of [...o.issues, ...o.goals]) {
      if (!item.target) continue;
      if (item.target.buildingId !== undefined) expect(sim.buildings.has(item.target.buildingId)).toBe(true);
      if (item.target.settlerId !== undefined) expect(sim.settler(item.target.settlerId)).toBeDefined();
    }
  });

  it('points out a mill waiting for wheat and a bridge short of stone', async () => {
    const { buildOverview } = await import('../src/engine/overview');
    const sim = createNewGame(9090);
    sim.progression.reached.push('hamlet');
    const m = clearSpot(sim, 2, 2, { x: 5, y: -4 });
    const mill = instant(sim, 'mill', m.x, m.y);
    applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: [sim.settlers[0].id] });
    const c = riverCrossing(sim);
    for (let x = 0; x <= c.x1 + 8; x += 4) sim.world.reveal(x, c.y, 7);
    applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c.x0, y0: c.y, x1: c.x1, y1: c.y });
    run(sim, 20);
    const o = buildOverview(sim, null);
    const text = [...o.issues, ...o.goals].map((i) => i.text).join(' | ');
    expect(text).toMatch(/mill needs 3 wheat/i);
    expect(text).toMatch(/Deliver \d+ more (stone|planks) to the stone bridge/);
  });
});
