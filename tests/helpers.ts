import { BUILDINGS } from '../src/game/data/buildings';
import { RECIPES } from '../src/game/data/recipes';
import { RESOURCE_IDS, type ResourceId } from '../src/game/data/resources';
import { OBJECTS } from '../src/game/world/tiles';
import type { Simulation } from '../src/game/sim/Simulation';

export function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

/** Runs until `cond` holds, failing loudly if it never does. */
export function runUntil(sim: Simulation, cond: () => boolean, maxTicks: number): number {
  for (let i = 0; i < maxTicks; i++) {
    if (cond()) return i;
    sim.step();
  }
  if (cond()) return maxTicks;
  throw new Error(`Condition not met within ${maxTicks} ticks`);
}

/** Finds the nearest explored object tile that yields a resource. */
export function nearestResource(sim: Simulation, res: ResourceId, from = { x: 0, y: 0 }, radius = 20) {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = from.y - radius; y <= from.y + radius; y++) {
    for (let x = from.x - radius; x <= from.x + radius; x++) {
      if (OBJECTS[sim.world.obj(x, y)].resource !== res || !sim.world.explored(x, y)) continue;
      const d = Math.hypot(x - from.x, y - from.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Every unit of a resource that exists anywhere in the settlement. */
export function accountedFor(sim: Simulation, res: ResourceId): number {
  let n = 0;
  for (const b of sim.buildings.values()) {
    n += b.inventory[res] ?? 0;
    n += b.delivered[res] ?? 0;
  }
  for (const s of sim.settlers) if (s.carrying?.res === res) n += s.carrying.amount;
  return n;
}

/** Resource consumed by completed buildings (including ones converted to terrain). */
export function consumedByConstruction(sim: Simulation, res: ResourceId, convertedCounts: Record<string, number> = {}): number {
  let n = 0;
  for (const b of sim.buildings.values()) if (b.built && b.type !== 'camp') n += BUILDINGS[b.type].cost[res] ?? 0;
  for (const [type, count] of Object.entries(convertedCounts)) n += (BUILDINGS[type as keyof typeof BUILDINGS].cost[res] ?? 0) * count;
  return n;
}

export function consumedByCrafting(sim: Simulation, res: ResourceId): number {
  return sim.stats.planksCrafted * (RECIPES.planks.inputs[res] ?? 0) + sim.stats.toolsCrafted * (RECIPES.tools.inputs[res] ?? 0);
}

export function assertNoNegativeReservations(sim: Simulation): void {
  for (const b of sim.buildings.values()) {
    for (const r of RESOURCE_IDS) {
      if ((b.reservedOut[r] ?? 0) < 0) throw new Error(`Negative reservedOut ${r} on ${b.type}#${b.id}`);
      if ((b.incoming[r] ?? 0) < 0) throw new Error(`Negative incoming ${r} on ${b.type}#${b.id}`);
      if ((b.inventory[r] ?? 0) < 0) throw new Error(`Negative inventory ${r} on ${b.type}#${b.id}`);
      if ((b.reservedOut[r] ?? 0) > (b.inventory[r] ?? 0)) throw new Error(`Over-reserved ${r} on ${b.type}#${b.id}`);
    }
  }
}
