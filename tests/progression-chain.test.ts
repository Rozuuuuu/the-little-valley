import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { BUILDINGS, type BuildingId } from '../src/game/data/buildings';
import { JOBS, JOB_IDS, type JobId } from '../src/game/data/jobs';
import { MINERALS } from '../src/game/data/minerals';
import { MILESTONE_ORDER, type MilestoneId } from '../src/game/data/progression';
import { RECIPES } from '../src/game/data/recipes';
import type { ResourceId } from '../src/game/data/resources';
import { campOf } from '../src/game/sim/buildings';
import { createNewGame } from '../src/game/sim/newGame';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { instant, run } from './helpers';

/**
 * Nothing the Town Hall's upgrades ask for may be out of reach: every material (and everything
 * it is made from) must come from a building that is open by then, worked by people in a role the
 * hall can already teach. (A Keep that needs planks, planks that need a crafter, and crafters
 * that need a Keep is a dead end.)
 */

const rank = (m: MilestoneId | undefined) => (m ? MILESTONE_ORDER.indexOf(m) : 0);
/** Gathered straight from the land (trees, rocks, bushes, fields) by the starting roles. */
const GATHERED: ResourceId[] = ['wood', 'stone', 'food', 'wheat', 'apples'];
const FUELS: ResourceId[] = ['charcoal', 'coal'];

/** The work kind a building's workers do, and so the roles that can do it. */
function rolesFor(id: BuildingId): JobId[] {
  const def = BUILDINGS[id];
  const kind = def.hunting ? 'gather' : def.pen ? 'farm' : 'craft';
  return JOB_IDS.filter((j) => JOBS[j].priorities.includes(kind));
}

/** How a resource can be made: [building, the resources that go in]. */
function sources(res: ResourceId): { building: BuildingId; inputs: ResourceId[] }[] {
  const out: { building: BuildingId; inputs: ResourceId[] }[] = [];
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const def = BUILDINGS[id];
    if (!def.buildable) continue;
    for (const r of def.recipes ?? []) {
      const rec = RECIPES[r];
      if (!(res in rec.outputs)) continue;
      const inputs = Object.keys(rec.inputs) as ResourceId[];
      out.push({ building: id, inputs: rec.fuel ? [...inputs, 'charcoal'] : inputs });
    }
    if (def.extraction === 'quarry' && res === 'stone') out.push({ building: id, inputs: [] });
    if (def.extraction === 'fish' && res === 'food') out.push({ building: id, inputs: [] });
    if (def.extraction === 'mine' && Object.values(MINERALS).some((m) => m.resource === res)) out.push({ building: id, inputs: [] });
    if (def.hunting && (res === 'food' || res === 'hides')) out.push({ building: id, inputs: [] });
    if (def.pen && (def.pen.product?.res === res || (def.pen.cull && res in def.pen.cull))) out.push({ building: id, inputs: [] });
  }
  return out;
}

/** Why a resource can't be had with these buildings open and this hall level, or null. */
function blocked(res: ResourceId, milestone: MilestoneId, hallLevel: number, seen = new Set<ResourceId>()): string | null {
  if (GATHERED.includes(res)) return null;
  if (seen.has(res)) return `${res} needs itself`;
  seen.add(res);
  const reasons: string[] = [];
  for (const s of sources(res)) {
    const def = BUILDINGS[s.building];
    if (rank(def.unlock) > rank(milestone)) {
      reasons.push(`${s.building} opens at ${def.unlock}`);
      continue;
    }
    const roles = rolesFor(s.building).filter((j) => JOBS[j].hallLevel <= hallLevel);
    if (!roles.length) {
      reasons.push(`nobody the ${hallLevel === 1 ? 'Town Hall' : hallLevel === 2 ? 'Keep' : 'Castle'} can teach works a ${s.building}`);
      continue;
    }
    const inputs = FUELS.includes(s.inputs[s.inputs.length - 1]) ? s.inputs.slice(0, -1) : s.inputs;
    const fuelOk = s.inputs.length === inputs.length || FUELS.some((f) => !blocked(f, milestone, hallLevel, new Set(seen)));
    const bad = inputs.map((i) => blocked(i, milestone, hallLevel, new Set(seen))).find(Boolean);
    if (!bad && fuelOk) return null;
    reasons.push(bad ?? 'no fuel');
  }
  return `${res}: ${reasons.join('; ') || 'nothing makes it'}`;
}

describe('the road to a Castle has no dead ends', () => {
  const levels = BUILDINGS.townHall.levels!;
  for (let i = 1; i < levels.length; i++) {
    const lv = levels[i];
    it(`${lv.name}: everything it costs can be made at the level below`, () => {
      // Upgrading from level i (the hall's current level) once its milestone is reached.
      for (const res of Object.keys(lv.cost) as ResourceId[]) {
        expect(blocked(res, lv.requires ?? 'camp', i), `${lv.name} needs ${res}`).toBeNull();
      }
    });
  }

  it('every workplace open from the start can be staffed by a role the Town Hall teaches', () => {
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
      const def = BUILDINGS[id];
      if (!def.buildable || def.unlock || !(def.recipes || def.extraction || def.hunting || def.pen)) continue;
      const roles = rolesFor(id).filter((j) => JOBS[j].hallLevel === 1);
      expect(roles.length, `${id} needs a role the Town Hall teaches`).toBeGreaterThan(0);
    }
  });

  it('a new valley saws planks at a workshop without training anyone first', () => {
    const sim = createNewGame(5151, CURRENT_GEN, 'valley', { rulerName: 'Lloyd' });
    campOf(sim)!.inventory = { food: 200, wood: 80, stone: 20 };
    for (const s of sim.settlers) {
      s.hunger = 100;
      s.energy = 100;
    }
    instant(sim, 'workshop', { x: 7, y: 3 });
    run(sim, DAY_TICKS / 2);
    expect(sim.stats.planksCrafted).toBeGreaterThan(0);
  });
});
