import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { VISITOR_INTERVAL } from '../src/game/data/kingdomBalance';
import { PRICES, sellPrice, buyPrice } from '../src/game/data/trade';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import { visitorInterval } from '../src/game/sim/travelers';
import type { Simulation } from '../src/game/sim/Simulation';
import { nearbyTowns, regionNode } from '../src/game/world/regions';
import { instant, run, runUntil } from './helpers';

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Inn', createdAt: 0 })))));
}

function innWorld(seed = 3131) {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet', 'village');
  campOf(sim)!.inventory = { food: 120, wood: 60, stone: 30, tools: 10, silverOre: 6 };
  instant(sim, 'storehouse', { x: -8, y: -8 });
  const inn = instant(sim, 'inn', { x: 6, y: -6 });
  return { sim, inn };
}

describe('regions', () => {
  it('distant towns are seeded, stable and never need map chunks', () => {
    const w = createNewGame(77);
    const before = w.world.chunks.size;
    const a = regionNode(77, 2, -1);
    expect(regionNode(77, 2, -1)).toEqual(a);
    const towns = nearbyTowns(77);
    expect(towns.length).toBeGreaterThan(0);
    for (const t of towns) expect(Math.hypot(t.x, t.y)).toBeGreaterThan(90);
    expect(w.world.chunks.size).toBe(before);
    expect(w.knownRegions.size).toBe(0);
  });
});

describe('merchants and the inn', () => {
  it('no inn, no merchants; with an inn a merchant travels in, lodges, and leaves — each stage once', () => {
    const plain = createNewGame(3131);
    run(plain, DAY_TICKS * 3);
    expect(plain.parties).toHaveLength(0);

    const { sim } = innWorld();
    runUntil(sim, () => sim.parties.length > 0, DAY_TICKS * 3);
    const p = sim.parties[0];
    expect(p.state).toBe('travelling');
    expect(sim.knownRegions.has(p.homeRegion)).toBe(true);
    const stages: string[] = [p.state];
    runUntil(sim, () => {
      const q = sim.parties.find((x) => x.id === p.id);
      const st = q ? q.state : 'gone';
      if (stages[stages.length - 1] !== st) stages.push(st);
      return st === 'gone';
    }, DAY_TICKS * 6);
    expect(stages).toEqual(['travelling', 'arriving', 'lodging', 'leaving', 'gone']);
    expect(sim.stats.merchantVisits).toBe(1);
  });

  it('barter is explicit and fair, stock is finite, and nothing moves on a refused offer', () => {
    const { sim } = innWorld();
    runUntil(sim, () => sim.parties.some((p) => p.state === 'lodging'), DAY_TICKS * 5);
    const p = sim.parties.find((x) => x.state === 'lodging')!;
    const [res, have] = Object.entries(p.stock).find(([, n]) => (n ?? 0) > 0)! as ['ironOre', number];
    const totals = sim.totals();
    // Asking for something for nothing is refused, and nothing changes.
    const greedy = applyCommand(sim, { type: 'barter', partyId: p.id, give: {}, take: { [res]: 1 } });
    expect(greedy.ok).toBe(false);
    expect(sim.totals()).toEqual(totals);
    // A fair offer: enough tools to cover the price.
    const need = Math.ceil((sellPrice(res) * 2) / buyPrice('tools'));
    const deal = applyCommand(sim, { type: 'barter', partyId: p.id, give: { tools: need }, take: { [res]: 2 } });
    expect(deal.ok, deal.message).toBe(true);
    expect(sim.totals()[res]).toBe(totals[res] + 2);
    expect(sim.totals().tools).toBe(totals.tools - need);
    expect(p.stock[res]).toBe(have - 2);
    // More than the merchant has is refused.
    expect(applyCommand(sim, { type: 'barter', partyId: p.id, give: { silverOre: 6 }, take: { [res]: have } }).message).toMatch(/only has|has only/);
    expect(sim.stats.trades).toBe(1);
    expect(PRICES.diamonds).toBeGreaterThan(PRICES.goldOre);
  });

  it('a reload while the merchant is walking in keeps exactly one merchant', () => {
    const { sim } = innWorld();
    runUntil(sim, () => sim.parties.some((p) => p.state === 'arriving'), DAY_TICKS * 5);
    const loaded = reload(sim);
    expect(loaded.parties).toHaveLength(1);
    expect(loaded.parties[0].state).toBe('arriving');
    runUntil(loaded, () => loaded.parties[0]?.state === 'lodging', DAY_TICKS);
    expect(loaded.parties).toHaveLength(1);
  });

  it('an inn brings would-be settlers by more often', () => {
    const { sim } = innWorld();
    expect(visitorInterval(sim)).toBeLessThan(VISITOR_INTERVAL);
    expect(visitorInterval(createNewGame(1))).toBe(VISITOR_INTERVAL);
  });

  it('merchants sell copper and iron ore, so ore never depends on luck', () => {
    const { sim } = innWorld();
    let seen = false;
    for (let i = 0; i < 4 && !seen; i++) {
      runUntil(sim, () => sim.parties.some((p) => p.state === 'lodging'), DAY_TICKS * 6);
      const p = sim.parties.find((x) => x.state === 'lodging')!;
      seen = (p.stock.copperOre ?? 0) > 0 || (p.stock.ironOre ?? 0) > 0;
      runUntil(sim, () => !sim.parties.some((x) => x.id === p.id), DAY_TICKS * 4);
    }
    expect(seen).toBe(true);
  });
});
