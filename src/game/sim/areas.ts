import { BUILDINGS } from '../data/buildings';
import { checkPlacement, placeBuilding } from './buildings';
import { councilPostOf } from './kingdoms';
import type { Simulation } from './Simulation';
import type { Settler, WorkArea } from './types';

/**
 * Work areas that look after themselves:
 *  - an area with a wanted number of workers staffs itself from free adults
 *    (nearest idle ones first) and lets extras go when the number drops;
 *  - a farm area with a crop lays out its own fields on every free fertile tile;
 *  - woodlots replant (see runGather) and hunting grounds hunt (see findHuntInArea).
 */
export const AREA_STEP = 100;
/** Most new fields a farm area lays out per step (they are free and instant). */
const FIELDS_PER_STEP = 24;

/** Adults nobody has claimed: no area, no workplace, not a soldier, the ruler, a councillor or away. */
function free(sim: Simulation, s: Settler, assigned: Set<number>): boolean {
  return s.lifeStage === 'adult' && !s.ruler && !s.military && !s.captive && s.awayOn === null && s.areaId === null && !assigned.has(s.id) && !councilPostOf(sim, s);
}

export function layOutFields(sim: Simulation, a: WorkArea): number {
  if (a.kind !== 'farm' || !a.crop) return 0;
  let n = 0;
  for (let y = a.y0; y <= a.y1 && n < FIELDS_PER_STEP; y++) {
    for (let x = a.x0; x <= a.x1 && n < FIELDS_PER_STEP; x++) {
      if (sim.buildingAt(x, y) || !sim.world.explored(x, y)) continue;
      if (!checkPlacement(sim, 'field', x, y).ok) continue;
      placeBuilding(sim, 'field', x, y, a.crop);
      n++;
    }
  }
  if (n) sim.mapChanged();
  return n;
}

export function updateAreas(sim: Simulation): void {
  if (sim.workAreas.length === 0) return;
  const staffed = sim.workAreas.filter((a) => a.wanted !== undefined);
  if (staffed.length) {
    const assigned = new Set<number>();
    for (const b of sim.buildings.values()) for (const id of b.workers) assigned.add(id);
    for (const a of staffed) {
      const crew = sim.settlers.filter((s) => s.areaId === a.id);
      const want = a.wanted ?? 0;
      if (crew.length > want) {
        // Let the most recently added go back to their usual work.
        for (const s of crew.slice(want)) {
          s.areaId = null;
          s.nextThink = 0;
        }
      } else if (crew.length < want) {
        const cx = (a.x0 + a.x1) / 2;
        const cy = (a.y0 + a.y1) / 2;
        const pool = sim.settlers
          .filter((s) => free(sim, s, assigned))
          .sort((p, q) => Number(!!q.idleReason) - Number(!!p.idleReason) || Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy));
        for (const s of pool.slice(0, want - crew.length)) {
          s.areaId = a.id;
          s.nextThink = 0;
        }
      }
    }
  }
  for (const a of sim.workAreas) if (a.kind === 'farm' && a.crop && BUILDINGS.field) layOutFields(sim, a);
}
