import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { routeInfo, updateLogistics } from '../src/game/sim/logistics';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { riverCenter } from '../src/game/world/worldgen';
import { T } from '../src/game/world/tiles';
import { accountedFor, assertNoNegativeReservations, assertReservationsConsistent, instant, run, runUntil } from './helpers';

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Routes', createdAt: 0 })))));
}

/** Every unit of a resource, including goods on carts and in crates. */
function held(sim: Simulation, res: 'wood' | 'food' | 'stone'): number {
  let n = accountedFor(sim, res);
  for (const m of sim.manifests) n += m.cargo[res] ?? 0;
  return n;
}

/** Home and a waystation 34+ tiles west (same bank, explored between), with a depot at each. */
function twoTowns(seed = 6060) {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet', 'village');
  for (let x = 6; x >= -60; x -= 3) sim.world.reveal(x, 0, 11);
  const hall = instant(sim, 'waystation', { x: -40, y: 0 });
  expect(sim.settlements).toHaveLength(2);
  const home = campOf(sim)!;
  home.inventory = { food: 120, wood: 100, stone: 20 };
  const depot = instant(sim, 'depot', { x: 5, y: 5 });
  const [a, b] = sim.settlers;
  expect(applyCommand(sim, { type: 'assignWorker', buildingId: depot.id, ids: [a.id, b.id] }).ok).toBe(true);
  return { sim, home, hall, depot, a, b };
}

function route(sim: Simulation, src: Building, dst: Building, res: 'wood' | 'food' | 'stone', target: number) {
  const r = applyCommand(sim, { type: 'createRoute', sourceId: src.id, destinationId: dst.id, resource: res, target });
  expect(r.ok, r.message).toBe(true);
  return r.id!;
}

describe('supply routes', () => {
  it('a caravan tops the far store up to its target and then rests; goods only move, never appear', () => {
    const { sim, home, hall } = twoTowns();
    const wood0 = held(sim, 'wood');
    route(sim, home, hall, 'wood', 40);
    runUntil(sim, () => (hall.inventory.wood ?? 0) >= 40, DAY_TICKS * 3);
    run(sim, DAY_TICKS / 2);
    expect(hall.inventory.wood).toBeLessThanOrEqual(40 + 20);
    expect(sim.stats.caravanDeliveries).toBeGreaterThan(0);
    expect(held(sim, 'wood')).toBe(wood0 + sim.stats.woodGathered);
    assertReservationsConsistent(sim);
    assertNoNegativeReservations(sim);
  });

  it('needs a depot with a teamster at the source, and names what is missing', () => {
    const { sim, home, hall, depot } = twoTowns();
    applyCommand(sim, { type: 'unassignWorker', buildingId: depot.id, settlerId: depot.workers[0] });
    applyCommand(sim, { type: 'unassignWorker', buildingId: depot.id, settlerId: depot.workers[0] });
    const id = route(sim, home, hall, 'wood', 30);
    run(sim, 200);
    expect(routeInfo(sim, id).status).toMatch(/teamster/i);
    expect(applyCommand(sim, { type: 'createRoute', sourceId: home.id, destinationId: home.id, resource: 'wood', target: 5 }).ok).toBe(false);
  });

  it('the teamster leaves the village, travels with the cart and comes back exactly once — across a reload mid-journey', () => {
    const { sim, home, hall, a, b } = twoTowns();
    route(sim, home, hall, 'wood', 20); // exactly one cartload
    runUntil(sim, () => sim.manifests.some((m) => m.state === 'outbound'), DAY_TICKS);
    const m = sim.manifests[0];
    const crew = sim.settler(m.crewId)!;
    expect([a.id, b.id]).toContain(crew.id);
    expect(crew.awayOn).toBe(m.id);
    const loaded = reload(sim);
    expect(loaded.manifests).toHaveLength(1);
    expect(loaded.settler(crew.id)!.awayOn).toBe(m.id);
    expect(loaded.manifests[0].cargo).toEqual(m.cargo);
    for (const world of [sim, loaded]) {
      const before = world.stats.caravanDeliveries;
      runUntil(world, () => world.manifests.length === 0, DAY_TICKS * 2);
      expect(world.stats.caravanDeliveries).toBe(before + 1);
      expect(world.settler(crew.id)!.awayOn).toBeNull();
      expect(world.settler(crew.id)!.hidden).toBe(false);
      assertReservationsConsistent(world);
    }
    expect(loaded.buildings.get(hall.id)!.inventory.wood).toBe(sim.buildings.get(hall.id)!.inventory.wood);
  });

  it('two routes into one store never overfill it; opposing routes settle down instead of shuttling forever', () => {
    const { sim, home, hall, depot } = twoTowns();
    home.inventory = { food: 120, wood: 60, stone: 60 };
    const far = hall;
    far.inventory = {};
    route(sim, home, far, 'wood', 100);
    route(sim, home, far, 'stone', 100);
    run(sim, DAY_TICKS * 2);
    expect(sim.storageUsed(far)).toBeLessThanOrEqual(sim.storageCapacity(far));
    // Now the far hall sends wood back to a target at home too.
    const depot2 = instant(sim, 'depot', { x: far.x + 4, y: far.y + 5 });
    const helper = sim.settlers.find((s) => !depot.workers.includes(s.id) && s.lifeStage === 'adult')!;
    applyCommand(sim, { type: 'assignSettlement', ids: [helper.id], settlementId: far.id });
    applyCommand(sim, { type: 'assignWorker', buildingId: depot2.id, ids: [helper.id] });
    route(sim, far, home, 'wood', 30);
    const trips0 = sim.stats.caravanDeliveries;
    run(sim, DAY_TICKS * 3);
    const trips = sim.stats.caravanDeliveries - trips0;
    expect(trips).toBeLessThan(12);
    assertReservationsConsistent(sim);
  });

  it('a source never gives below its own stock target, and the route explains a dry source', () => {
    const { sim, home, hall } = twoTowns();
    home.inventory = { food: 100, wood: 12 };
    home.wants = { wood: 10 };
    const id = route(sim, home, hall, 'wood', 50);
    run(sim, DAY_TICKS);
    expect(home.inventory.wood ?? 0).toBeGreaterThanOrEqual(10 - 0);
    expect((hall.inventory.wood ?? 0)).toBeLessThanOrEqual(2 + sim.stats.woodGathered);
    expect(routeInfo(sim, id).status).toMatch(/nothing to spare|no spare|waiting/i);
  });

  it('cancelling a route turns the cart around: every unit comes home, nothing is credited twice', () => {
    const { sim, home, hall } = twoTowns();
    const wood0 = held(sim, 'wood');
    const id = route(sim, home, hall, 'wood', 40);
    runUntil(sim, () => sim.manifests.some((m) => m.state === 'outbound'), DAY_TICKS);
    const cargo = sim.manifests[0].cargo.wood!;
    expect(applyCommand(sim, { type: 'cancelRoute', routeId: id }).ok).toBe(true);
    expect(sim.manifests[0].state).toBe('returning');
    expect(held(sim, 'wood')).toBe(wood0 + sim.stats.woodGathered);
    runUntil(sim, () => sim.manifests.length === 0, DAY_TICKS * 2);
    expect(hall.inventory.wood ?? 0).toBe(0);
    expect(held(sim, 'wood')).toBe(wood0 + sim.stats.woodGathered);
    expect(cargo).toBeGreaterThan(0);
  });

  it('when both ends are gone or full, the goods wait in a crate settlers can use', () => {
    const { sim, home, hall } = twoTowns();
    const wood0 = held(sim, 'wood');
    route(sim, home, hall, 'wood', 40);
    runUntil(sim, () => sim.manifests.some((m) => m.state === 'outbound'), DAY_TICKS);
    // Fill every store so nothing fits anywhere.
    for (const st of sim.storages()) st.inventory.stone = (st.inventory.stone ?? 0) + sim.storageCapacity(st) - sim.storageUsed(st);
    const stone0 = held(sim, 'stone');
    runUntil(sim, () => sim.manifests.length === 0, DAY_TICKS * 3);
    const crates = [...sim.buildings.values()].filter((b) => b.type === 'crate');
    expect(crates.length).toBeGreaterThan(0);
    expect(held(sim, 'wood')).toBe(wood0 + sim.stats.woodGathered);
    expect(held(sim, 'stone')).toBe(stone0 + sim.stats.stoneGathered);
  });

  it('freight cannot cross an unbridged river; the route says so, and works once a bridge stands', () => {
    const sim = createNewGame(9090);
    sim.progression.reached.push('hamlet', 'village');
    let c: { y: number; x0: number; x1: number } | null = null;
    for (let dy = 0; dy < 30 && !c; dy++) {
      for (const y of [dy, -dy]) {
        if (c) break;
        const m = Math.round(riverCenter(sim.seed, y));
        let x0 = m;
        let x1 = m;
        while ([T.Water, T.DeepWater].includes(sim.world.terrain(x0 - 1, y) as never)) x0--;
        while ([T.Water, T.DeepWater].includes(sim.world.terrain(x1 + 1, y) as never)) x1++;
        if ([x0 - 1, x1 + 1].every((x) => sim.walkable(x, y)) && x1 - x0 + 1 <= 12 && sim.world.terrain(m, y) === T.DeepWater) c = { y, x0, x1 };
      }
    }
    for (let x = 0; x <= c!.x1 + 30; x += 3) sim.world.reveal(x, c!.y, 11);
    const hall = instant(sim, 'waystation', { x: c!.x1 + 14, y: c!.y });
    const home = campOf(sim)!;
    home.inventory = { food: 120, wood: 80, stone: 90, planks: 40 };
    const depot = instant(sim, 'depot', { x: 5, y: 5 });
    applyCommand(sim, { type: 'assignWorker', buildingId: depot.id, ids: [sim.settlers[0].id] });
    const id = route(sim, home, hall, 'wood', 20);
    run(sim, 300);
    expect(routeInfo(sim, id).status).toMatch(/no road|bridge|connect/i);
    expect(sim.manifests).toHaveLength(0);
    const br = applyCommand(sim, { type: 'placeSpan', building: 'stoneBridge', x0: c!.x0, y0: c!.y, x1: c!.x1, y1: c!.y });
    expect(br.ok).toBe(true);
    runUntil(sim, () => sim.buildings.get(br.id!)!.built, DAY_TICKS * 4);
    runUntil(sim, () => (hall.inventory.wood ?? 0) >= 20, DAY_TICKS * 3);
  });

  it('route travel never generates map chunks', () => {
    const { sim, home, hall } = twoTowns();
    const before = sim.world.chunks.size;
    route(sim, home, hall, 'wood', 30);
    for (let i = 0; i < 5; i++) updateLogistics(sim);
    expect(sim.world.chunks.size).toBe(before);
  });
});
