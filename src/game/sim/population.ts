import type { JobId } from '../data/jobs';
import { BUILDINGS } from '../data/buildings';
import { assignHomes, campOf, entranceOf, findFreeBed, housingCapacity, isPermanentHome } from './buildings';
import { MAX_POPULATION, type Simulation } from './Simulation';
import type { Building } from './types';
import { settlementAt } from './settlements';
import { committedPopulation } from './households';
import { RECRUIT_APPLES } from '../data/kingdomBalance';

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

function arrivalSpot(sim: Simulation, bed: Building): { x: number; y: number } | null {
  // Arrive near the hall of the settlement where the bed is.
  const st = settlementAt(sim, bed.x + bed.w / 2, bed.y + bed.h / 2);
  const camp = (st ? sim.buildings.get(st.id) : undefined) ?? campOf(sim);
  const cx = camp ? camp.x + 1 : bed.x;
  const cy = camp ? camp.y + 1 : bed.y;
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = sim.rng.next() * Math.PI * 2;
    const r = 9 + sim.rng.next() * 4;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (sim.world.explored(x, y) && sim.walkable(x, y)) return { x, y };
  }
  const e = entranceOf(bed);
  return sim.walkable(e.x, e.y) ? e : null;
}

/** Plain-language summary of beds, for the UI. */
export function bedSummary(sim: Simulation): string {
  let houseBeds = 0;
  let houseUsed = 0;
  let campBeds = 0;
  let campUsed = 0;
  const counts = new Map<number, number>();
  for (const s of sim.settlers) if (s.homeId !== null) counts.set(s.homeId, (counts.get(s.homeId) ?? 0) + 1);
  for (const b of sim.buildings.values()) {
    if (!b.built || !BUILDINGS[b.type].housing) continue;
    const beds = BUILDINGS[b.type].housing ?? 0;
    if (isPermanentHome(b)) {
      houseBeds += beds;
      houseUsed += counts.get(b.id) ?? 0;
    } else {
      campBeds += beds;
      campUsed += counts.get(b.id) ?? 0;
    }
  }
  return `Home beds ${houseUsed}/${houseBeds} · camp bedrolls ${campUsed}/${campBeds}`;
}

/**
 * Brings in one newcomer if a free, reachable bed exists. The bed is assigned
 * before anything else happens, so two arrivals can never claim the same bed.
 * Returns the new settler's id, or null.
 */
export function welcomeNewcomer(sim: Simulation): number | null {
  if (sim.settlers.length >= MAX_POPULATION) return null;
  const bed = findFreeBed(sim);
  if (!bed) return null;
  const spot = arrivalSpot(sim, bed);
  if (!spot) return null;
  sim.withdrawUnreserved('food', ARRIVAL_COST);
  const home = settlementAt(sim, bed.x + bed.w / 2, bed.y + bed.h / 2);
  const s = sim.addSettler(spot.x, spot.y, pickNewcomerJob(sim), undefined, home?.id ?? sim.settlements[0]?.id ?? null);
  s.homeId = bed.id;
  sim.lastArrival = sim.tick;
  sim.stats.arrivals++;
  // Settle anyone still in bedrolls into free house beds too.
  assignHomes(sim);
  const place = sim.settlements.length > 1 && home ? ` in ${home.name}` : '';
  const where = isPermanentHome(bed) ? `a bed in the ${BUILDINGS[bed.type].name.toLowerCase()}${place}` : `a bedroll${place || ' at the camp'}`;
  sim.toast(`${s.name} has settled in the valley and taken ${where}!`, 'good');
  sim.record('arrival', `${s.name} arrived`, s.x, s.y);
  sim.emit({ type: 'sfx', name: 'arrival', x: s.x, y: s.y });
  sim.emit({ type: 'fx', kind: 'hearts', x: s.x, y: s.y });
  sim.emit({ type: 'arrival', settlerId: s.id });
  sim.emit({ type: 'important' });
  return s.id;
}

/** What deliberate growth is waiting on, in plain words. */
function deliberateStatus(sim: Simulation): string {
  if (committedPopulation(sim) >= MAX_POPULATION) return `Your valley has reached the simulation limit of ${MAX_POPULATION} people.`;
  const expecting = sim.households.filter((h) => h.pending).length;
  const travelling = sim.recruits.filter((r) => r.state === 'travelling').length;
  const parts: string[] = [];
  if (expecting) parts.push(`${expecting} household${expecting > 1 ? 's are' : ' is'} expecting a child`);
  if (travelling) parts.push(`${travelling} traveller${travelling > 1 ? 's are' : ' is'} on the way`);
  if (sim.offer) parts.push(`${sim.offer.name} is visiting and would settle for ${RECRUIT_APPLES} apples`);
  if (parts.length) return `${parts.join('; ')}.`;
  return 'New people come from households (People panel) and from visitors you welcome with apples.';
}

/**
 * Housing and food together draw newcomers, one at a time. Population never
 * shrinks: a shortage only slows growth, it never punishes the player.
 * The status line always says exactly what is (or isn't) holding growth back.
 */
export function updatePopulation(sim: Simulation): void {
  if (sim.growthMode === 'deliberate') {
    sim.populationStatus = deliberateStatus(sim);
    return;
  }
  const pop = sim.settlers.length;
  const food = sim.storedTotal('food');
  if (pop >= MAX_POPULATION) {
    sim.populationStatus = `Your valley has reached the simulation limit of ${MAX_POPULATION} settlers. No more newcomers will arrive.`;
    return;
  }
  const cap = housingCapacity(sim);
  const bed = findFreeBed(sim);
  if (!bed) {
    sim.populationStatus = pop >= cap
      ? `Every bed is taken (${bedSummary(sim)}). Build a house to welcome newcomers.`
      : 'The free beds are cut off — make sure settlers can walk to every home.';
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
  if (welcomeNewcomer(sim) !== null) sim.populationStatus = '';
}

