import type { JobId } from '../data/jobs';
import { assignHomes, housingCapacity } from './buildings';
import type { Simulation } from './Simulation';

/** Food that must be in storage before a newcomer will settle. */
export const ARRIVAL_FOOD = 20;
/** Food shared at the welcome meal when they arrive. */
export const ARRIVAL_COST = 10;
export const ARRIVAL_COOLDOWN = 900;

function pickNewcomerJob(sim: Simulation): JobId {
  const counts = new Map<JobId, number>();
  for (const s of sim.settlers) counts.set(s.job, (counts.get(s.job) ?? 0) + 1);
  const fields = [...sim.buildings.values()].filter((b) => b.field).length;
  if (fields > (counts.get('farmer') ?? 0) * 6) return 'farmer';
  return 'laborer';
}

function arrivalSpot(sim: Simulation): { x: number; y: number } | null {
  const camp = [...sim.buildings.values()].find((b) => b.type === 'camp');
  const cx = camp ? camp.x + 1 : 0;
  const cy = camp ? camp.y + 1 : 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = sim.rng.next() * Math.PI * 2;
    const r = 9 + sim.rng.next() * 4;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (sim.world.explored(x, y) && sim.walkable(x, y)) return { x, y };
  }
  return sim.walkable(cx, cy + 3) ? { x: cx, y: cy + 3 } : null;
}

/**
 * Housing and food together draw newcomers. Population never shrinks: a
 * shortage only slows growth, it never punishes the player.
 */
export function updatePopulation(sim: Simulation): void {
  const cap = housingCapacity(sim);
  const pop = sim.settlers.length;
  const food = sim.storedTotal('food');
  if (pop >= cap) {
    sim.populationStatus = 'All beds are taken. Build a house to welcome newcomers.';
    return;
  }
  if (food < ARRIVAL_FOOD) {
    sim.populationStatus = `A newcomer will come once ${ARRIVAL_FOOD} food is in storage (${food} now).`;
    return;
  }
  if (sim.tick - sim.lastArrival < ARRIVAL_COOLDOWN && sim.lastArrival > 0) {
    sim.populationStatus = 'A traveller has heard of your valley and is on the way.';
    return;
  }
  const spot = arrivalSpot(sim);
  if (!spot) return;
  sim.withdrawUnreserved('food', ARRIVAL_COST);
  const s = sim.addSettler(spot.x, spot.y, pickNewcomerJob(sim));
  sim.lastArrival = sim.tick;
  sim.stats.arrivals++;
  assignHomes(sim);
  sim.populationStatus = '';
  sim.toast(`${s.name} has settled in the valley!`, 'good');
  sim.emit({ type: 'sfx', name: 'arrival', x: s.x, y: s.y });
  sim.emit({ type: 'fx', kind: 'hearts', x: s.x, y: s.y });
  sim.emit({ type: 'arrival', settlerId: s.id });
  sim.emit({ type: 'important' });
}
