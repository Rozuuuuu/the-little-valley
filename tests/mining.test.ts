import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { BUILDINGS } from '../src/game/data/buildings';
import { RECIPES } from '../src/game/data/recipes';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf, checkPlacement, completeBuilding, costOf, placeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { completeSurvey, knownCell, MINE_YIELD } from '../src/game/sim/mining';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { cellOf, starterDeposits } from '../src/game/world/geology';
import { T } from '../src/game/world/tiles';
import { accountedFor, assertNoNegativeReservations, assertReservationsConsistent, consumedByCrafting, instant, run, runUntil } from './helpers';

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Mine', createdAt: 0 })))));
}

/** A Hamlet valley with the starter copper surveyed, revealed and reachable, plus a storehouse near it. */
function mineWorld(seed = 424242) {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet');
  const dep = starterDeposits(sim.seed, 3).copper!;
  for (let i = 0; i <= 12; i++) sim.world.reveal((dep.x * i) / 12, (dep.y * i) / 12, 7);
  sim.world.reveal(dep.x, dep.y, 10);
  completeSurvey(sim, sim.settlers[0], dep.x, dep.y);
  campOf(sim)!.inventory = { food: 100, wood: 60, stone: 40, planks: 30, tools: 6 };
  // A storehouse halfway, so ore has room and a short walk.
  instant(sim, 'storehouse', { x: Math.round(dep.x / 2), y: Math.round(dep.y / 2) });
  return { sim, dep };
}

/** Places a finished mine over the deposit (trying footprints that cover it). */
function placeMine(sim: Simulation, dep: { x: number; y: number }): Building {
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    if (checkPlacement(sim, 'mine', dep.x + dx, dep.y + dy).ok) {
      const b = placeBuilding(sim, 'mine', dep.x + dx, dep.y + dy);
      b.delivered = { ...costOf(b) };
      completeBuilding(sim, b);
      return b;
    }
  }
  throw new Error(`no mine footprint: ${checkPlacement(sim, 'mine', dep.x, dep.y).reason}`);
}

describe('placement', () => {
  it('a mine needs a surveyed deposit under it; a quarry needs rocky ground or hills', () => {
    const { sim, dep } = mineWorld();
    const unsurveyed = starterDeposits(sim.seed, 3).iron!;
    sim.world.reveal(unsurveyed.x, unsurveyed.y, 8);
    expect(checkPlacement(sim, 'mine', unsurveyed.x, unsurveyed.y).reason).toMatch(/survey/i);
    expect(checkPlacement(sim, 'mine', 2, 3).reason).toMatch(/survey|deposit/i);
    const mine = placeMine(sim, dep);
    expect(mine.mine!.level).toBe(1);
    expect(mine.mine!.depositId).toBe(knownCell(sim, cellOf(dep.x, dep.y).cx, cellOf(dep.x, dep.y).cy)!.deposit!.id);
    // One mine per deposit.
    expect(checkPlacement(sim, 'mine', dep.x + 1, dep.y).ok).toBe(false);
    // Quarries: grass is refused, the hill slopes are fine.
    expect(checkPlacement(sim, 'quarry', 3, 3).reason).toMatch(/rock|hill/i);
    let ok = false;
    for (let dx = -5; dx <= 5 && !ok; dx++) {
      for (let dy = -5; dy <= 5 && !ok; dy++) {
        const x = dep.x + dx;
        const y = dep.y + dy;
        if (sim.world.terrain(x, y) === T.Hill && checkPlacement(sim, 'quarry', x, y).ok) ok = true;
      }
    }
    expect(ok).toBe(true);
  });

  it('precious minerals never gate a building or recipe', () => {
    for (const def of Object.values(BUILDINGS)) for (const r of ['silverOre', 'goldOre', 'diamonds']) expect(def.cost[r as never]).toBeUndefined();
    for (const r of Object.values(RECIPES)) for (const p of ['silverOre', 'goldOre', 'diamonds']) expect(r.inputs[p as never]).toBeUndefined();
  });
});

describe('extraction', () => {
  it('miners bring ore to storage; the deposit shrinks by exactly what was mined, across a reload', () => {
    const { sim, dep } = mineWorld();
    const mine = placeMine(sim, dep);
    const [a] = sim.settlers;
    expect(applyCommand(sim, { type: 'assignWorker', buildingId: mine.id, ids: [a.id] }).ok).toBe(true);
    runUntil(sim, () => sim.stats.oreMined > 0, DAY_TICKS * 2);
    const left = () => knownCell(sim, cellOf(dep.x, dep.y).cx, cellOf(dep.x, dep.y).cy)!.deposit!.remaining;
    expect(left() + sim.stats.oreMined).toBe(dep.initial);
    run(sim, 300);
    const loaded = reload(sim);
    const lleft = knownCell(loaded, cellOf(dep.x, dep.y).cx, cellOf(dep.x, dep.y).cy)!.deposit!.remaining;
    expect(lleft).toBe(left());
    run(loaded, DAY_TICKS / 2);
    const now = knownCell(loaded, cellOf(dep.x, dep.y).cx, cellOf(dep.x, dep.y).cy)!.deposit!.remaining;
    expect(now + loaded.stats.oreMined).toBe(dep.initial);
    expect(accountedFor(loaded, 'copperOre')).toBe(loaded.stats.oreMined);
    assertReservationsConsistent(loaded);
    assertNoNegativeReservations(loaded);
  });

  it('two miners racing for the last unit: exactly one gets it, then the mine reports it is worked out', () => {
    const { sim, dep } = mineWorld();
    const mine = placeMine(sim, dep);
    const id = mine.mine!.depositId;
    sim.geology.set(id, { remaining: 1 });
    const [a, b] = sim.settlers;
    applyCommand(sim, { type: 'assignWorker', buildingId: mine.id, ids: [a.id, b.id] });
    expect(mine.workers).toHaveLength(2);
    run(sim, DAY_TICKS / 2);
    expect(sim.stats.oreMined).toBe(1);
    expect(accountedFor(sim, 'copperOre')).toBe(1);
    expect(sim.geology.get(id)!.remaining).toBe(0);
    expect(sim.oreReserved.get(id) ?? 0).toBe(0);
    expect(sim.settlers.filter((s) => s.task?.kind === 'extract')).toHaveLength(0);
    assertReservationsConsistent(sim);
  });

  it('deepening the shaft costs real materials, raises the yield per trip, and refuses without charging when short', () => {
    const { sim, dep } = mineWorld();
    const mine = placeMine(sim, dep);
    const before = { planks: sim.storedTotal('planks'), stone: sim.storedTotal('stone') };
    expect(applyCommand(sim, { type: 'upgradeMine', buildingId: mine.id }).ok).toBe(true);
    expect(mine.mine!.level).toBe(2);
    expect(sim.storedTotal('planks')).toBeLessThan(before.planks);
    expect(MINE_YIELD[2]).toBeGreaterThan(MINE_YIELD[1]);
    campOf(sim)!.inventory.tools = 0;
    const snapshot = sim.totals();
    const res = applyCommand(sim, { type: 'upgradeMine', buildingId: mine.id });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/tools/);
    expect(sim.totals()).toEqual(snapshot);
    campOf(sim)!.inventory.tools = 10;
    expect(applyCommand(sim, { type: 'upgradeMine', buildingId: mine.id }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'upgradeMine', buildingId: mine.id }).message).toMatch(/deepest/);
    expect(reload(sim).buildings.get(mine.id)!.mine!.level).toBe(3);
  });

  it('a quarry cuts stone forever and its excavation deepens visibly and persists', () => {
    const { sim, dep } = mineWorld();
    let q: Building | null = null;
    for (let dx = -5; dx <= 5 && !q; dx++) {
      for (let dy = -5; dy <= 5 && !q; dy++) {
        if (checkPlacement(sim, 'quarry', dep.x + dx, dep.y + dy).ok) {
          q = placeBuilding(sim, 'quarry', dep.x + dx, dep.y + dy);
          q.delivered = { ...costOf(q) };
          completeBuilding(sim, q);
        }
      }
    }
    applyCommand(sim, { type: 'assignWorker', buildingId: q!.id, ids: [sim.settlers[2].id] });
    runUntil(sim, () => q!.quarry!.extracted >= 12, DAY_TICKS * 2);
    expect(sim.stats.stoneQuarried).toBe(q!.quarry!.extracted);
    expect(reload(sim).buildings.get(q!.id)!.quarry!.extracted).toBe(q!.quarry!.extracted);
  });

  it('with storage full, miners stop and say why instead of losing ore', () => {
    const { sim, dep } = mineWorld();
    const mine = placeMine(sim, dep);
    for (const st of sim.storages()) st.inventory.stone = (st.inventory.stone ?? 0) + sim.storageCapacity(st) - sim.storageUsed(st);
    applyCommand(sim, { type: 'assignWorker', buildingId: mine.id, ids: [sim.settlers[0].id] });
    run(sim, 600);
    expect(sim.stats.oreMined).toBe(0);
    expect(sim.settlers[0].idleReason).toMatch(/storage/i);
  });
});

describe('industry', () => {
  function industryWorld() {
    const { sim, dep } = mineWorld();
    campOf(sim)!.inventory = { food: 100, wood: 60, stone: 20, planks: 30, copperOre: 8, ironOre: 8, coal: 2 };
    const kiln = instant(sim, 'charcoalKiln', { x: 6, y: 6 });
    const smelter = instant(sim, 'smelter', { x: -8, y: -6 });
    const forge = instant(sim, 'forge', { x: 8, y: -8 });
    const [a, b, c] = sim.settlers;
    applyCommand(sim, { type: 'assignWorker', buildingId: kiln.id, ids: [a.id] });
    applyCommand(sim, { type: 'assignWorker', buildingId: smelter.id, ids: [b.id] });
    applyCommand(sim, { type: 'assignWorker', buildingId: forge.id, ids: [c.id] });
    return { sim, dep, kiln, smelter, forge };
  }

  it('coal or charcoal fuels the smelter; ore becomes ingots and ingots become tools, conserving every unit', () => {
    const { sim, smelter, forge } = industryWorld();
    applyCommand(sim, { type: 'setRecipe', buildingId: smelter.id, recipe: 'smeltIron' });
    applyCommand(sim, { type: 'setRecipe', buildingId: forge.id, recipe: 'forgeIronTools' });
    // 2 coal covers two smelts (4 tools); the third ingot needs charcoal.
    runUntil(sim, () => sim.stats.ironToolsForged >= 6, DAY_TICKS * 5);
    // Only 2 coal to start: the rest of the fuel had to be charcoal from the kiln.
    expect(sim.stats.coalBurned).toBeLessThanOrEqual(2);
    expect(sim.stats.charcoalBurned).toBeGreaterThan(0);
    // Every building here was set up ready-made, so nothing went into construction.
    for (const r of ['ironOre', 'ironIngot', 'coal', 'charcoal', 'planks'] as const) {
      const start = { ironOre: 8, ironIngot: 0, coal: 2, charcoal: 0, planks: 30 }[r];
      const made = r === 'ironIngot' ? sim.stats.ironSmelted : r === 'charcoal' ? sim.stats.charcoalMade : 0;
      expect(accountedFor(sim, r) + consumedByCrafting(sim, r), r).toBe(start + made);
    }
    assertReservationsConsistent(sim);
    assertNoNegativeReservations(sim);
  });

  it('a smelter without fuel explains what it is waiting for', () => {
    const { sim, smelter, kiln } = industryWorld();
    campOf(sim)!.inventory.coal = 0;
    campOf(sim)!.inventory.wood = 0;
    applyCommand(sim, { type: 'toggleWorkshop', buildingId: kiln.id });
    run(sim, 200);
    expect(smelter.workshop!.status).toMatch(/fuel|coal|charcoal/i);
  });
});

describe('mountains and metal journey', () => {
  it('survey → quarry → mine → ore and fuel → smelt → forge → tools in store, then save and resume', () => {
    const sim = createNewGame(20261003);
    sim.progression.reached.push('hamlet');
    campOf(sim)!.inventory = { food: 100, wood: 90, stone: 40, planks: 45 };
    instant(sim, 'storehouse', { x: -8, y: -12 });
    const dep = starterDeposits(sim.seed, 3).copper!;
    for (let i = 0; i <= 12; i++) sim.world.reveal((dep.x * i) / 12, (dep.y * i) / 12, 7);
    const ids = sim.settlers.map((s) => s.id);
    expect(applyCommand(sim, { type: 'surveyDeposit', settlerId: ids[0], x: dep.x, y: dep.y }).ok).toBe(true);
    runUntil(sim, () => sim.surveyedCell(dep.x, dep.y) !== null, DAY_TICKS);
    let mineAt: { x: number; y: number } | null = null;
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (!mineAt && checkPlacement(sim, 'mine', dep.x + dx, dep.y + dy).ok) mineAt = { x: dep.x + dx, y: dep.y + dy };
    expect(applyCommand(sim, { type: 'place', building: 'mine', x: mineAt!.x, y: mineAt!.y }).ok).toBe(true);
    const mine = sim.buildingAt(mineAt!.x, mineAt!.y)!;
    const place = (type: 'charcoalKiln' | 'smelter' | 'forge', near: { x: number; y: number }) => {
      for (let r = 0; r < 12; r++) for (let y = near.y - r; y <= near.y + r; y++) for (let x = near.x - r; x <= near.x + r; x++) {
        if (applyCommand(sim, { type: 'place', building: type, x, y }).ok) return sim.buildingAt(x, y)!;
      }
      throw new Error(`no room for ${type}`);
    };
    const kiln = place('charcoalKiln', { x: 6, y: 6 });
    const smelter = place('smelter', { x: -8, y: -6 });
    const forge = place('forge', { x: 8, y: -8 });
    runUntil(sim, () => [mine, kiln, smelter, forge].every((b) => b.built), DAY_TICKS * 5);
    applyCommand(sim, { type: 'assignWorker', buildingId: mine.id, ids: [ids[1]] });
    applyCommand(sim, { type: 'assignWorker', buildingId: kiln.id, ids: [ids[2]] });
    applyCommand(sim, { type: 'assignWorker', buildingId: smelter.id, ids: [ids[3]] });
    applyCommand(sim, { type: 'assignWorker', buildingId: forge.id, ids: [ids[4]] });
    runUntil(sim, () => sim.stats.copperSmelted > 0, DAY_TICKS * 6);
    const loaded = reload(sim);
    runUntil(loaded, () => loaded.stats.copperToolsForged > 0, DAY_TICKS * 6);
    expect(loaded.stats.toolsCrafted).toBeGreaterThan(0);
    assertReservationsConsistent(loaded);
  });
});
