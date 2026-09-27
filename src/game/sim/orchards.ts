import { DAY_TICKS } from '../core/constants';
import {
  ORCHARD_APPLES_PER_DAY, ORCHARD_CARE_TICKS, ORCHARD_ESTABLISH_TICKS, ORCHARD_MAX_FRUIT, ORCHARD_PICK_MIN,
} from '../data/kingdomBalance';
import { seasonOf } from './seasons';
import type { Simulation } from './Simulation';
import type { Building, OrchardAction } from './types';

/** Work ticks for each orchard job. */
export const ORCHARD_WORK: Record<OrchardAction, number> = { tend: 40, pick: 30 };

export function initOrchard(sim: Simulation, b: Building): void {
  b.orchard = { growth: 0, fruit: 0, careUntil: sim.tick + ORCHARD_CARE_TICKS };
}

export function orchardEstablished(b: Building): boolean {
  return !!b.orchard && b.orchard.growth >= ORCHARD_ESTABLISH_TICKS;
}

/** What the orchard needs from a farmer right now, if anything. */
export function orchardAction(sim: Simulation, b: Building): OrchardAction | null {
  const o = b.orchard;
  if (!o || !b.built) return null;
  if (Math.floor(o.fruit) >= ORCHARD_PICK_MIN) return 'pick';
  const resting = seasonOf(sim).def.growth <= 0;
  if (!resting && orchardEstablished(b) && o.careUntil - sim.tick < ORCHARD_CARE_TICKS / 2) return 'tend';
  return null;
}

/** Trees establish, then ripen apples while tended; everything rests in winter. */
export function updateOrchards(sim: Simulation, dt: number): void {
  if (seasonOf(sim).def.growth <= 0) return;
  for (const b of sim.buildings.values()) {
    const o = b.orchard;
    if (!o || !b.built) continue;
    if (o.growth < ORCHARD_ESTABLISH_TICKS) o.growth = Math.min(ORCHARD_ESTABLISH_TICKS, o.growth + dt);
    else if (sim.tick < o.careUntil) o.fruit = Math.min(ORCHARD_MAX_FRUIT, o.fruit + (dt * ORCHARD_APPLES_PER_DAY) / DAY_TICKS);
  }
}

/** Applies a finished job. Returns apples picked (the farmer carries them to storage). */
export function applyOrchardAction(sim: Simulation, b: Building, action: OrchardAction, capacity: number): number {
  const o = b.orchard!;
  if (action === 'tend') {
    o.careUntil = sim.tick + ORCHARD_CARE_TICKS;
    return 0;
  }
  const n = Math.min(Math.floor(o.fruit), capacity);
  o.fruit -= n;
  sim.stats.applesPicked += n;
  return n;
}

/** Plain status for the inspector. */
export function orchardStatus(sim: Simulation, b: Building): string {
  const o = b.orchard;
  if (!b.built || !o) return 'Being planted';
  const winter = seasonOf(sim).def.growth <= 0;
  if (!orchardEstablished(b)) {
    const left = Math.ceil(((ORCHARD_ESTABLISH_TICKS - o.growth) / DAY_TICKS) * 10) / 10;
    return winter ? 'Young trees resting for winter' : `Young trees establishing (${left} growing days to go)`;
  }
  if (winter) return `Resting for winter · ${Math.floor(o.fruit)} apples on the trees`;
  const tended = sim.tick < o.careUntil;
  return `${Math.floor(o.fruit)}/${ORCHARD_MAX_FRUIT} apples ripe · ${tended ? 'tended' : 'needs a farmer to tend it before it bears again'}`;
}
