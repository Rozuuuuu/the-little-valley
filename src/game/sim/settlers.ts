import { DAY_TICKS, tileKey, keyX, keyY } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { CROPS } from '../data/crops';
import type { WorkKind } from '../data/jobs';
import { RECIPES, type RecipeId } from '../data/recipes';
import { AURA_RADIUS, CHILD_ADULT_TICKS, RALLY_BOOST, ROYAL_AURA } from '../data/kingdomBalance';
import { COUNCIL_POSTS } from '../data/kingdoms';
import { councilPostOf } from './kingdoms';
import { UNITS } from '../data/units';
import { drill, storesResource } from './military';
import { RESOURCES, type ResourceId } from '../data/resources';
import { O, OBJECTS, T, TERRAIN, type ObjectId } from '../world/tiles';
import {
  campOf, completeBuilding, costOf, entranceOf, isPermanentHome, materialsComplete, mayWorkAt, scheduleRegrowth, workOf, workshopNeeds,
} from './buildings';
import { applyFieldAction, FIELD_WORK, fieldAction } from './farming';
import { applyOrchardAction, ORCHARD_WORK, orchardAction } from './orchards';
import { completeExtraction, completeSurvey, EXTRACT_WORK, findExtract, releaseExtraction, SURVEY_WORK } from './mining';
import { burnFuel, recipeReady } from './buildings';
import { addInv, invEntries } from './inventory';
import { findPath, goalSatisfied, lastPathStats, type Goal } from './pathfinding';
import { effectivePriorities } from './priorities';
import { seasonOf } from './seasons';
import { awayPenalty } from './settlements';
import type { Simulation } from './Simulation';
import type { Building, OrchardAction, Settler, Task, ToolKind, WorkArea } from './types';
import { speedOf, workersOf } from './levels';
import { huntRadiusOf, penAnimals, penCapacity, preyNear, removeAnimal } from './animals';
import { SPECIES } from '../data/animals';
import type { Animal } from './types';

/** A woodlot sapling grows into a tree this fast. */
const REPLANT_TICKS = Math.round(DAY_TICKS * 0.75);
/** Hunters shoot from this far (tiles). */
const HUNT_RANGE = 4;
/** Herder work per visit (ticks). */
const HERD_WORK = 40;

export const BASE_SPEED = 0.24;
export const HUNGER_DECAY = 100 / (DAY_TICKS * 1.2);
export const ENERGY_DECAY = 100 / (DAY_TICKS * 0.8);
export const EAT_THRESHOLD = 32;
export const MEAL_VALUE = 65;
export const REVEAL_RADIUS = 6.5;
/** Open water gives a clear view: from a riverbank settlers can see the far side. */
export const RIVER_REVEAL_RADIUS = 12;

const lastReveal = new WeakMap<Settler, number>();

function nearWater(sim: Simulation, s: Settler): boolean {
  const x = Math.floor(s.x);
  const y = Math.floor(s.y);
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const t = sim.world.terrain(x + dx, y + dy);
    if (t === T.Water || t === T.DeepWater) return true;
  }
  return false;
}
export const AUTO_GATHER_RADIUS = 18;
export const FOCUS_RADIUS = 7;
/** Below this energy a settler takes a daytime nap; they wake once rested. */
export const NAP_THRESHOLD = 12;
export const WAKE_ENERGY = 60;
/** Ticks an idle settler waits before searching for work again. */
export const IDLE_BACKOFF = 14;

type MoveResult = 'arrived' | 'moving' | 'failed';
type Finder = (sim: Simulation, s: Settler) => Task | string | null;

// ---- helpers ---------------------------------------------------------------

export function tileOf(s: Settler): { x: number; y: number } {
  return { x: Math.floor(s.x), y: Math.floor(s.y) };
}

function dist(s: Settler, x: number, y: number): number {
  return Math.hypot(s.x - x, s.y - y);
}

function bGoal(b: Building): Goal {
  return { x: b.x, y: b.y, w: b.w, h: b.h, adjacent: true };
}

function centre(b: Building): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Work speed in a town whose hall is a Castle. */
export const CASTLE_SPEED = 1.1;

export function workSpeed(sim: Simulation, s: Settler): number {
  let v = 1;
  if (s.hunger < 15) v *= 0.7;
  if (s.energy < 15) v *= 0.8;
  if (sim.wellEquipped()) v *= 1.25;
  // A castle's royal presence speeds up its whole town.
  const hall = s.settlementId !== null ? sim.buildings.get(s.settlementId) : undefined;
  if (hall && hall.type === 'townHall' && (hall.level ?? 1) >= 3) v *= CASTLE_SPEED;
  // The ruler's presence and Rally.
  if (!s.ruler) {
    const r = sim.ruler();
    if (r && !r.hidden && Math.abs(r.x - s.x) <= AURA_RADIUS && Math.abs(r.y - s.y) <= AURA_RADIUS && Math.hypot(r.x - s.x, r.y - s.y) <= AURA_RADIUS) v *= ROYAL_AURA;
    if (s.boostUntil !== undefined && s.boostUntil > sim.tick) v *= RALLY_BOOST;
  }
  return v;
}

function moveSpeed(sim: Simulation, s: Settler): number {
  const t = tileOf(s);
  let v = BASE_SPEED / TERRAIN[sim.world.terrain(t.x, t.y)].moveCost;
  if (s.hunger < 15) v *= 0.8;
  if (s.carrying) v *= 0.92;
  return v;
}

function face(s: Settler, tx: number, ty: number): void {
  const dx = tx - s.x;
  const dy = ty - s.y;
  if (Math.abs(dx) > Math.abs(dy)) s.facing = dx < 0 ? 2 : 3;
  else if (dy !== 0) s.facing = dy < 0 ? 1 : 0;
}

function faceRect(s: Settler, x: number, y: number, w: number, h: number): void {
  const tx = Math.max(x, Math.min(x + w, s.x));
  const ty = Math.max(y, Math.min(y + h, s.y));
  face(s, tx, ty);
}

/** Walks towards a goal, planning a bounded path when needed. */
export function goTo(sim: Simulation, s: Settler, g: Goal, maxNodes = 4000, partial = false): MoveResult {
  const gk = `${g.x},${g.y},${g.w},${g.h},${g.adjacent ? 1 : 0}`;
  const here = tileOf(s);
  if (s.goalKey !== gk) {
    s.goalKey = gk;
    s.path = null;
    s.repaths = 0;
  }
  if (!s.path) {
    if (goalSatisfied(g, here.x, here.y)) return settle(sim, s, here.x, here.y);
    // Out of search budget this tick: wait a moment rather than stall the frame.
    if (sim.pathBudget <= 0) {
      s.anim = 'idle';
      return 'moving';
    }
    const p = findPath(sim, here.x, here.y, g, maxNodes, partial);
    sim.pathBudget -= lastPathStats.expanded + 1;
    if (!p) return 'failed';
    s.path = p;
    s.pathIndex = 0;
  }
  if (s.pathIndex >= s.path.length) {
    s.path = null;
    return goalSatisfied(g, here.x, here.y) ? 'arrived' : 'moving';
  }
  const next = s.path[s.pathIndex];
  if (!sim.walkable(next.x, next.y)) {
    // Something appeared in the way (a building or a regrown tree): plan again.
    s.path = null;
    s.repaths++;
    return s.repaths > 4 ? 'failed' : 'moving';
  }
  s.anim = 'walk';
  if (stepToward(sim, s, next.x + 0.5, next.y + 0.5)) {
    s.pathIndex++;
    if (s.pathIndex >= s.path.length) {
      s.path = null;
      const t = tileOf(s);
      if (goalSatisfied(g, t.x, t.y)) return 'arrived';
      // A partial path ends as close as we can get.
      return partial ? 'failed' : 'moving';
    }
  }
  return 'moving';
}

/** Makes sure the settler stands on the centre of its tile before working. */
function settle(sim: Simulation, s: Settler, tx: number, ty: number): MoveResult {
  const cx = tx + 0.5;
  const cy = ty + 0.5;
  if (Math.abs(s.x - cx) < 0.01 && Math.abs(s.y - cy) < 0.01) return 'arrived';
  s.anim = 'walk';
  return stepToward(sim, s, cx, cy) ? 'arrived' : 'moving';
}

function stepToward(sim: Simulation, s: Settler, tx: number, ty: number): boolean {
  const dx = tx - s.x;
  const dy = ty - s.y;
  const d = Math.hypot(dx, dy);
  const v = moveSpeed(sim, s);
  face(s, tx, ty);
  if (d <= v) {
    s.x = tx;
    s.y = ty;
    return true;
  }
  s.x += (dx / d) * v;
  s.y += (dy / d) * v;
  return false;
}

// ---- task lifecycle --------------------------------------------------------

/** Releases every reservation the current task holds, including goods promised in transit. */
function releaseTask(sim: Simulation, s: Settler): void {
  const t = s.task;
  if (!t) return;
  switch (t.kind) {
    case 'gather':
      sim.release(`obj:${tileKey(t.x, t.y)}`, s.id);
      break;
    case 'build':
      sim.release(`build:${t.site}:${t.slot}`, s.id);
      break;
    case 'farm':
      sim.release(`field:${t.field}`, s.id);
      break;
    case 'orchard':
      sim.release(`orchard:${t.orchard}`, s.id);
      break;
    case 'extract':
      sim.release(`extract:${t.site}:${t.slot}`, s.id);
      releaseExtraction(sim, t.site, t.amount);
      break;
    case 'craft':
      sim.release(`craft:${t.ws}`, s.id);
      break;
    case 'hunt': {
      sim.release(`hunt:${t.animal}`, s.id);
      const a = sim.animals.find((x) => x.id === t.animal);
      if (a && a.huntedBy === s.id) a.huntedBy = null;
      break;
    }
    case 'herd':
      sim.release(`herd:${t.pen}`, s.id);
      break;
    case 'haul': {
      const src = sim.buildings.get(t.src);
      const dst = sim.buildings.get(t.dst);
      if (t.stage === 'toSrc' && src) addInv(src.reservedOut, t.res, -t.amount);
      if (dst) addInv(dst.incoming, t.res, -t.amount);
      break;
    }
    case 'eat': {
      const src = sim.buildings.get(t.src);
      if (src) addInv(src.reservedOut, 'food', -1);
      break;
    }
    default:
      break;
  }
}

function clearTask(s: Settler): void {
  s.task = null;
  s.path = null;
  s.goalKey = null;
  s.anim = 'idle';
  s.tool = null;
  s.insideId = null;
}

/** Reservation keys the settler's current task holds (for consistency checks). */
export function taskKeys(s: Settler): string[] {
  const t = s.task;
  if (!t) return [];
  switch (t.kind) {
    case 'gather':
      return [`obj:${tileKey(t.x, t.y)}`];
    case 'build':
      return [`build:${t.site}:${t.slot}`];
    case 'farm':
      return [`field:${t.field}`];
    case 'orchard':
      return [`orchard:${t.orchard}`];
    case 'extract':
      return [`extract:${t.site}:${t.slot}`];
    case 'craft':
      return [`craft:${t.ws}`];
    case 'hunt':
      return [`hunt:${t.animal}`];
    case 'herd':
      return [`herd:${t.pen}`];
    default:
      return [];
  }
}

/** Stops the current task and gives back anything it had reserved. */
export function abortTask(sim: Simulation, s: Settler, reason?: string): void {
  releaseTask(sim, s);
  clearTask(s);
  s.nextThink = 0;
  if (s.hidden) s.hidden = false;
  if (reason) s.idleReason = reason;
}

function fail(sim: Simulation, s: Settler, reason: string, target?: string): void {
  if (target) sim.markUnreachable(s.id, target, 300, s.x, s.y);
  abortTask(sim, s, reason);
}

// ---- job finders -----------------------------------------------------------

/** Does a building's footprint overlap a work area? */
function inArea(a: WorkArea | undefined, x: number, y: number, w = 1, h = 1): boolean {
  if (!a) return true;
  return x <= a.x1 && x + w - 1 >= a.x0 && y <= a.y1 && y + h - 1 >= a.y0;
}

function findBuild(sim: Simulation, s: Settler, area?: WorkArea): Task | string | null {
  let best: Building | null = null;
  let bestSlot = -1;
  let bestD = Infinity;
  for (const b of sim.buildings.values()) {
    if (b.built || !materialsComplete(b) || !inArea(area, b.x, b.y, b.w, b.h)) continue;
    if (sim.isUnreachable(s.id, `b${b.id}`, s.x, s.y)) continue;
    const max = BUILDINGS[b.type].maxBuilders ?? 2;
    let slot = -1;
    for (let i = 0; i < max; i++) {
      if (!sim.isReserved(`build:${b.id}:${i}`, s.id)) {
        slot = i;
        break;
      }
    }
    if (slot < 0) continue;
    const c = centre(b);
    const d = dist(s, c.x, c.y) + awayPenalty(sim, s, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = b;
      bestSlot = slot;
    }
  }
  if (!best) return null;
  sim.reserve(`build:${best.id}:${bestSlot}`, s.id);
  return { kind: 'build', site: best.id, slot: bestSlot, stage: 'walk' };
}

interface HaulNeed {
  dst: Building;
  res: ResourceId;
  need: number;
  priority: number;
  /** A store topping up its stock target from another store. */
  supply?: boolean;
}

function haulNeeds(sim: Simulation, area?: WorkArea): HaulNeed[] {
  const out: HaulNeed[] = [];
  for (const b of sim.buildings.values()) {
    if (!inArea(area, b.x, b.y, b.w, b.h)) continue;
    if (!b.built) {
      for (const [r, n] of invEntries(costOf(b))) {
        const need = n - (b.delivered[r] ?? 0) - (b.incoming[r] ?? 0);
        if (need > 0) out.push({ dst: b, res: r, need, priority: 0 });
      }
    } else if (b.workshop) {
      for (const { res, need } of workshopNeeds(b, sim)) out.push({ dst: b, res, need, priority: 12 });
    } else if (BUILDINGS[b.type].storage) {
      // Stock targets: keep this store supplied from others with a surplus.
      const wants = invEntries(b.wants);
      if (!wants.length) continue;
      let incomingTotal = 0;
      for (const [, n] of invEntries(b.incoming)) incomingTotal += n;
      let free = sim.storageCapacity(b) - sim.storageUsed(b) - incomingTotal;
      for (const [r, want] of wants) {
        const need = Math.min(want - (b.inventory[r] ?? 0) - (b.incoming[r] ?? 0), free);
        if (need <= 0) continue;
        free -= need;
        out.push({ dst: b, res: r, need, priority: 30, supply: true });
      }
    }
  }
  return out;
}

/** Goods a store can spare: what it holds beyond its own stock target and promised loads. */
export function surplus(sim: Simulation, b: Building, res: ResourceId): number {
  return sim.available(b, res) - (b.wants[res] ?? 0);
}

function supplySource(sim: Simulation, n: HaulNeed): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of sim.storages()) {
    if (b === n.dst || surplus(sim, b, n.res) <= 0) continue;
    const d = Math.hypot(b.x - n.dst.x, b.y - n.dst.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Plans a haul for one specific need. Returns a reason when stock is missing. */
function planHaul(sim: Simulation, s: Settler, n: HaulNeed): Task | string {
  const src = n.supply ? supplySource(sim, n) : sim.nearestStorageWith(n.res, s.x, s.y);
  if (!src) return n.supply ? '' : `Waiting for ${RESOURCES[n.res].name.toLowerCase()} for the ${BUILDINGS[n.dst.type].name.toLowerCase()}`;
  const amount = Math.min(n.need, n.supply ? surplus(sim, src, n.res) : sim.available(src, n.res), s.capacity);
  addInv(src.reservedOut, n.res, amount);
  addInv(n.dst.incoming, n.res, amount);
  return { kind: 'haul', src: src.id, dst: n.dst.id, res: n.res, amount, stage: 'toSrc' };
}

function findHaul(sim: Simulation, s: Settler, area?: WorkArea): Task | string | null {
  let reason: string | null = null;
  const needs = haulNeeds(sim, area)
    .filter((n) => !sim.isUnreachable(s.id, `b${n.dst.id}`, s.x, s.y))
    .map((n) => {
      const c = centre(n.dst);
      return { n, score: dist(s, c.x, c.y) + n.priority + awayPenalty(sim, s, c.x, c.y) };
    })
    .sort((a, b) => a.score - b.score);
  for (const { n } of needs) {
    const r = planHaul(sim, s, n);
    if (typeof r === 'string') {
      if (r) reason ??= r;
      continue;
    }
    return r;
  }
  return reason;
}

export function findHaulFor(sim: Simulation, s: Settler, dst: Building): Task | string | null {
  const needs = haulNeeds(sim).filter((n) => n.dst.id === dst.id);
  let reason: string | null = null;
  for (const n of needs) {
    const r = planHaul(sim, s, n);
    if (typeof r !== 'string') return r;
    reason ??= r;
  }
  return reason;
}

function findFarm(sim: Simulation, s: Settler, area?: WorkArea): Task | string | null {
  let best: Building | null = null;
  let bestScore = Infinity;
  let action: ReturnType<typeof fieldAction> = null;
  let anyFields = false;
  // Orchards compete on the same score: picking ripe apples counts like a harvest.
  let bestOrchard: Building | null = null;
  let orchardJob: OrchardAction | null = null;
  for (const b of sim.buildings.values()) {
    if (b.orchard && b.built && inArea(area, b.x, b.y, b.w, b.h)) {
      anyFields = true;
      const a = orchardAction(sim, b);
      if (!a || (a === 'pick' && s.carrying)) continue;
      if (sim.isReserved(`orchard:${b.id}`, s.id) || sim.isUnreachable(s.id, `b${b.id}`, s.x, s.y)) continue;
      const score = dist(s, b.x + 1, b.y + 1) - (a === 'pick' ? 10 : 3) + (area ? 0 : awayPenalty(sim, s, b.x, b.y));
      if (score < bestScore) {
        bestScore = score;
        bestOrchard = b;
        orchardJob = a;
        best = null;
      }
      continue;
    }
    if (!b.field || !inArea(area, b.x, b.y)) continue;
    anyFields = true;
    const a = fieldAction(sim, b.field);
    if (!a || (a === 'harvest' && s.carrying)) continue;
    if (sim.isReserved(`field:${b.id}`, s.id) || sim.isUnreachable(s.id, `b${b.id}`, s.x, s.y)) continue;
    const bonus = a === 'harvest' ? 10 : a === 'plant' ? 5 : a === 'till' ? 2 : 0;
    const score = dist(s, b.x + 0.5, b.y + 0.5) - bonus + (area ? 0 : awayPenalty(sim, s, b.x, b.y));
    if (score < bestScore) {
      bestScore = score;
      best = b;
      action = a;
      bestOrchard = null;
    }
  }
  if (bestOrchard && orchardJob) {
    sim.reserve(`orchard:${bestOrchard.id}`, s.id);
    return { kind: 'orchard', orchard: bestOrchard.id, action: orchardJob, stage: 'walk', timer: 0 };
  }
  if (!best || !action) {
    if (anyFields && seasonOf(sim).id === 'winter') return 'Winter: the fields rest until spring';
    if (area) return anyFields ? `Fields in ${area.name} are growing — nothing to tend` : `${area.name} has no fields — place some inside it`;
    return effectivePriorities(s)[0] === 'farm' ? (anyFields ? 'Fields are growing — nothing to tend' : 'No fields yet — place some from the Build menu') : null;
  }
  sim.reserve(`field:${best.id}`, s.id);
  return { kind: 'farm', field: best.id, action, stage: 'walk', timer: 0 };
}

function objectTask(sim: Simulation, s: Settler, x: number, y: number): Task {
  sim.reserve(`obj:${tileKey(x, y)}`, s.id);
  return { kind: 'gather', x, y, stage: 'walk', timer: 0 };
}

function gatherable(sim: Simulation, s: Settler, x: number, y: number, res?: ResourceId): boolean {
  const o = sim.world.obj(x, y);
  const def = OBJECTS[o];
  if (!def.resource || (res && def.resource !== res)) return false;
  if (sim.world.amount(x, y) <= 0 || !sim.world.explored(x, y)) return false;
  const k = tileKey(x, y);
  return !sim.isReserved(`obj:${k}`, s.id) && !sim.isUnreachable(s.id, `o${k}`, s.x, s.y);
}

/** Nearest harvestable object of a resource type within a square radius. */
export function scanNearest(sim: Simulation, s: Settler, cx: number, cy: number, radius: number, res: ResourceId): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  for (let y = y0 - radius; y <= y0 + radius; y++) {
    for (let x = x0 - radius; x <= x0 + radius; x++) {
      if (!gatherable(sim, s, x, y, res)) continue;
      const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) + Math.hypot(x - cx, y - cy) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

const AUTO_TARGET: Record<'food' | 'wood' | 'stone', (sim: Simulation) => number> = {
  wood: () => 80,
  stone: () => 50,
  food: (sim) => 30 + sim.settlers.length * 6,
};

function findGather(sim: Simulation, s: Settler): Task | string | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const k of sim.designations) {
    const x = keyX(k);
    const y = keyY(k);
    if (!gatherable(sim, s, x, y)) {
      if (!OBJECTS[sim.world.obj(x, y)].resource) sim.designations.delete(k);
      continue;
    }
    const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) + awayPenalty(sim, s, x, y);
    if (d < bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  if (best) return objectTask(sim, s, best.x, best.y);
  if (s.job !== 'gatherer') return null;

  // Gatherers keep the stores balanced when nothing is marked.
  const totals = sim.totals();
  const order = (Object.keys(AUTO_TARGET) as ('food' | 'wood' | 'stone')[])
    .map((r) => ({ r, ratio: totals[r] / AUTO_TARGET[r](sim) }))
    .filter((e) => e.ratio < 1.5)
    .sort((a, b) => a.ratio - b.ratio);
  if (order.length === 0) return 'Stores are well stocked';
  if (!sim.nearestStorageWithSpace(s.x, s.y)) return 'Storage is full — build a storehouse';
  // Gather around the settler's own settlement.
  const home = (s.settlementId !== null ? sim.buildings.get(s.settlementId) : undefined) ?? sim.storages()[0];
  const cx = home ? home.x + 1 : s.x;
  const cy = home ? home.y + 1 : s.y;
  for (const { r } of order) {
    const t = scanNearest(sim, s, cx, cy, AUTO_GATHER_RADIUS, r);
    if (t) return objectTask(sim, s, t.x, t.y);
  }
  return 'Nothing left to gather near storage — mark resources with the Harvest tool';
}

/** Wood or stone inside a woodlot or quarry area. Areas harvest without needing marks. */
function findAreaGather(sim: Simulation, s: Settler, area: WorkArea, res: 'wood' | 'stone' | 'food'): Task | string {
  if (!sim.nearestStorageWithSpace(s.x, s.y)) return 'Storage is full — build a storehouse';
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  let any = 0;
  let unreachable = 0;
  for (let y = area.y0; y <= area.y1; y++) {
    for (let x = area.x0; x <= area.x1; x++) {
      const def = OBJECTS[sim.world.obj(x, y)];
      if (def.resource !== res || sim.world.amount(x, y) <= 0 || !sim.world.explored(x, y)) continue;
      any++;
      if (sim.isUnreachable(s.id, `o${tileKey(x, y)}`, s.x, s.y)) {
        unreachable++;
        continue;
      }
      if (sim.isReserved(`obj:${tileKey(x, y)}`, s.id)) continue;
      const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  if (best) return objectTask(sim, s, best.x, best.y);
  const noun = res === 'wood' ? 'trees' : res === 'food' ? 'berries' : 'rocks';
  if (any === 0) return `No ${noun} left in ${area.name} — ${res === 'wood' ? 'the saplings are growing back, or ' : res === 'food' ? 'the bushes will fruit again, or ' : ''}redraw the area`;
  if (unreachable === any) return `Can't reach the ${noun} in ${area.name} — a path may be blocked`;
  return `Every ${res === 'wood' ? 'tree' : res === 'food' ? 'bush' : 'rock'} in ${area.name} already has a worker`;
}

/** Work inside the settler's assigned area, or a reason why there is none. */
function findAreaWork(sim: Simulation, s: Settler, area: WorkArea, handsFull: boolean): Task | string | null {
  switch (area.kind) {
    case 'farm':
      return findFarm(sim, s, area);
    case 'wood':
    case 'stone':
      return handsFull ? null : findAreaGather(sim, s, area, area.kind);
    case 'forage':
      return handsFull ? null : findAreaGather(sim, s, area, 'food');
    case 'hunt':
      return handsFull ? null : findHuntInArea(sim, s, area);
    case 'build': {
      const b = findBuild(sim, s, area);
      if (b && typeof b === 'object') return b;
      if (!handsFull) {
        const h = findHaul(sim, s, area);
        if (h && typeof h === 'object') return h;
        if (typeof h === 'string') return h;
      }
      return `No construction in ${area.name}`;
    }
  }
}

function findCraft(sim: Simulation, s: Settler): Task | string | null {
  let reason: string | null = null;
  let best: Building | null = null;
  let bestD = Infinity;
  let any = false;
  for (const b of sim.buildings.values()) {
    const ws = b.workshop;
    if (!b.built || !ws) continue;
    any = true;
    if (ws.paused || !ws.recipe || !mayWorkAt(b, s.id)) continue;
    if (sim.isReserved(`craft:${b.id}`, s.id) || sim.isUnreachable(s.id, `b${b.id}`, s.x, s.y)) continue;
    const name = BUILDINGS[b.type].name.toLowerCase();
    if (!recipeReady(b.delivered, RECIPES[ws.recipe])) {
      reason ??= `The ${name} is waiting for ${[...invEntries(RECIPES[ws.recipe].inputs).map(([r]) => r), ...(RECIPES[ws.recipe].fuel ? ['fuel'] : [])].join(' and ')}`;
      continue;
    }
    const c = centre(b);
    // Assigned workers strongly prefer their own building.
    const d = dist(s, c.x, c.y) - (b.workers.includes(s.id) ? 1000 : 0) + awayPenalty(sim, s, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (!any) return null;
  if (!best) return reason;
  if (!sim.nearestStorageWithSpace(s.x, s.y)) return 'Storage is full — nowhere to put what I make';
  sim.reserve(`craft:${best.id}`, s.id);
  return { kind: 'craft', ws: best.id, stage: 'walk' };
}

/** Crafting and digging share the Craft work kind: assigned workers go to their own building first. */
function findCraftOrDig(sim: Simulation, s: Settler): Task | string | null {
  const dig = findExtract(sim, s);
  if (dig && typeof dig === 'object') return dig;
  const craft = findCraft(sim, s);
  if (craft && typeof craft === 'object') return craft;
  const anyShop = [...sim.buildings.values()].some((b) => b.built && (b.workshop || BUILDINGS[b.type].extraction));
  return dig ?? craft ?? (anyShop ? null : 'No workshop, mill, bakery, quarry or mine built yet');
}

/** Assigned hunters and herders go to their own work first; others fall back to it. */
function assignedTo(sim: Simulation, s: Settler, pred: (b: Building) => boolean): boolean {
  const b = sim.workIndex().assigned.get(s.id);
  return !!b && pred(b);
}

const FINDERS: Record<WorkKind, Finder> = {
  build: (sim, s) => findBuild(sim, s),
  haul: (sim, s) => findHaul(sim, s),
  farm: (sim, s) => {
    if (sim.workIndex().pens.length === 0) return findFarm(sim, s);
    if (assignedTo(sim, s, (b) => !!BUILDINGS[b.type].pen)) {
      const h = findHerd(sim, s);
      if (h && typeof h === 'object') return h;
    }
    const f = findFarm(sim, s);
    if (f && typeof f === 'object') return f;
    const h = findHerd(sim, s);
    return h && typeof h === 'object' ? h : (f ?? h);
  },
  gather: (sim, s) => {
    if (sim.workIndex().lodges.length === 0) return findGather(sim, s);
    if (assignedTo(sim, s, (b) => !!BUILDINGS[b.type].hunting)) {
      const h = findHunt(sim, s);
      if (h && typeof h === 'object') return h;
    }
    const g = findGather(sim, s);
    if (g && typeof g === 'object') return g;
    const h = findHunt(sim, s);
    return h && typeof h === 'object' ? h : (g ?? h);
  },
  craft: findCraftOrDig,
};

/** Wild game for a hunter from a lodge they may work at. */
function findHunt(sim: Simulation, s: Settler): Task | string | null {
  let reason: string | null = null;
  let best: { b: Building; a: Animal; d: number } | null = null;
  for (const b of sim.workIndex().lodges) {
    if (!mayWorkAt(b, s.id)) continue;
    const busy = sim.settlers.filter((o) => o !== s && o.task?.kind === 'hunt' && o.task.lodge === b.id).length;
    if (busy >= Math.max(1, workersOf(b))) continue;
    const prey = preyNear(sim, b).filter((a) => a.huntedBy === null);
    if (prey.length === 0) {
      reason ??= 'No game within reach of the lodge — animals roam back in time';
      continue;
    }
    for (const a of prey) {
      const d = dist(s, a.x, a.y) - (b.workers.includes(s.id) ? 1000 : 0);
      if (!best || d < best.d) best = { b, a, d };
    }
  }
  if (!best) return reason;
  if (!sim.nearestStorageWithSpace(s.x, s.y, 'food')) return 'Storage is full — nowhere to put the meat';
  best.a.huntedBy = s.id;
  sim.reserve(`hunt:${best.a.id}`, s.id);
  return { kind: 'hunt', lodge: best.b.id, animal: best.a.id, stage: 'stalk', timer: 0, tx: Math.floor(best.a.x), ty: Math.floor(best.a.y) };
}

/** Game inside a hunting ground. */
function findHuntInArea(sim: Simulation, s: Settler, area: WorkArea): Task | string {
  let best: Animal | null = null;
  let bestD = Infinity;
  let any = false;
  for (const a of sim.animals) {
    if (a.penId !== null || !SPECIES[a.species].hunt || a.x < area.x0 || a.x > area.x1 + 1 || a.y < area.y0 || a.y > area.y1 + 1) continue;
    any = true;
    if (a.huntedBy !== null) continue;
    const d = dist(s, a.x, a.y);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (!best) return any ? `Every animal in ${area.name} is already being stalked` : `No game in ${area.name} right now — animals roam back in time`;
  if (!sim.nearestStorageWithSpace(s.x, s.y, 'food')) return 'Storage is full — nowhere to put the meat';
  best.huntedBy = s.id;
  sim.reserve(`hunt:${best.id}`, s.id);
  return { kind: 'hunt', lodge: null, area: area.id, animal: best.id, stage: 'stalk', timer: 0, tx: Math.floor(best.x), ty: Math.floor(best.y) };
}

/** A pen with eggs, milk, wool or a foal to collect, or full and due a cull. */
function findHerd(sim: Simulation, s: Settler): Task | string | null {
  let best: { b: Building; d: number } | null = null;
  let reason: string | null = null;
  for (const b of sim.workIndex().pens) {
    const def = BUILDINGS[b.type].pen;
    if (!def || !b.pen || !mayWorkAt(b, s.id)) continue;
    if (sim.isReserved(`herd:${b.id}`, s.id) || sim.isUnreachable(s.id, `b${b.id}`, s.x, s.y)) continue;
    const ready = b.pen.ready >= 1;
    const full = !!def.cull && penAnimals(sim, b).length >= penCapacity(b);
    if (!ready && !full) {
      reason ??= 'The animals have nothing to collect yet';
      continue;
    }
    const res = ready ? def.product!.res : 'food';
    if (!sim.nearestStorageWithSpace(b.x, b.y, res)) {
      reason ??= res === 'horses' ? 'The stable is full — build or upgrade a stable for new horses' : 'Storage is full — nowhere to put what the animals give';
      continue;
    }
    const d = dist(s, b.x + b.w / 2, b.y + b.h / 2) - (b.workers.includes(s.id) ? 1000 : 0);
    if (!best || d < best.d) best = { b, d };
  }
  if (!best) return reason;
  sim.reserve(`herd:${best.b.id}`, s.id);
  return { kind: 'herd', pen: best.b.id, stage: 'walk', timer: 0 };
}

function findFocus(sim: Simulation, s: Settler): Task | null {
  const f = s.focus!;
  if (sim.tick > f.until) return null;
  const t = scanNearest(sim, s, f.x, f.y, FOCUS_RADIUS, f.res);
  return t ? objectTask(sim, s, t.x, t.y) : null;
}

/** Where a settler sleeps: their own bed, or the campfire if they have none. */
function homeFor(sim: Simulation, s: Settler): Building | null {
  if (s.homeId !== null) {
    const h = sim.buildings.get(s.homeId);
    if (h && h.built) return h;
  }
  // No bed: rest at their own settlement's hall (or the camp).
  const own = s.settlementId !== null ? sim.buildings.get(s.settlementId) : undefined;
  return (own && own.built ? own : campOf(sim)) ?? null;
}

/** Recruits drill at their training ground; ready soldiers wait on duty near it. */
function soldierRoutine(sim: Simulation, s: Settler): void {
  const m = s.military!;
  const b = sim.buildings.get(m.buildingId);
  if (m.state === 'training' && b) {
    s.task = { kind: 'train', site: b.id, stage: 'walk' };
    s.idleReason = '';
    return;
  }
  s.idleReason = `On duty as ${UNITS[m.unit].name.toLowerCase()} — give orders from Realm → Army`;
  s.nextThink = sim.tick + IDLE_BACKOFF * 3;
  if (b && !s.task && sim.rng.chance(0.3)) {
    const e = entranceOf(b);
    const x = e.x + sim.rng.int(5) - 2;
    const y = e.y + sim.rng.int(3);
    if (sim.walkable(x, y)) s.task = { kind: 'wander', x, y };
  }
}

function runTrain(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'train' }>): void {
  const b = sim.buildings.get(t.site);
  if (!b || s.military?.state !== 'training') return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(b));
    if (r === 'failed') return fail(sim, s, "Can't reach the training ground", `b${b.id}`);
    if (r === 'arrived') t.stage = 'drill';
    return;
  }
  faceRect(s, b.x, b.y, b.w, b.h);
  s.anim = 'work';
  s.tool = s.military.unit === 'archer' ? 'hand' : 'hammer';
  drill(sim, s, workSpeed(sim, s));
  if (s.military.trained >= UNITS[s.military.unit].trainTicks) abortTask(sim, s);
}

/** Children play within a few tiles of home (or their settlement hall) until they grow up. */
function playNearHome(sim: Simulation, s: Settler): void {
  const days = Math.max(1, Math.ceil((CHILD_ADULT_TICKS - s.ageTicks) / DAY_TICKS));
  s.idleReason = `A child — plays near home and grows up in ${days} day${days === 1 ? '' : 's'}`;
  s.nextThink = sim.tick + IDLE_BACKOFF * 3 + (s.id % 7);
  if (s.task) return;
  const home = homeFor(sim, s);
  const c = home ? { x: home.x + Math.floor(home.w / 2), y: home.y + home.h + 1 } : tileOf(s);
  const x = c.x + sim.rng.int(7) - 3;
  const y = c.y + sim.rng.int(5) - 1;
  if (sim.walkable(x, y) && sim.world.explored(x, y)) s.task = { kind: 'wander', x, y };
}

/**
 * Picks the next task: needs first (deliver, eat, sleep), then a temporary
 * direct order (focus), then the assigned work area, then the work order.
 */
export function assignTask(sim: Simulation, s: Settler): void {
  const wandering = s.task?.kind === 'wander';
  const set = (t: Task) => {
    if (wandering) abortTask(sim, s);
    s.task = t;
    s.idleReason = '';
  };

  // With full hands a settler can still till, plant, water and build, but not fetch or harvest.
  let handsFull = false;
  if (s.carrying) {
    if (sim.nearestStorageWithSpace(s.x, s.y, s.carrying.res)) {
      set({ kind: 'deliver', target: null });
      return;
    }
    handsFull = true;
  }
  if (s.hunger < EAT_THRESHOLD) {
    const src = sim.nearestStorageWith('food', s.x, s.y);
    if (src) {
      addInv(src.reservedOut, 'food', 1);
      set({ kind: 'eat', src: src.id });
      return;
    }
  }
  if (sim.isBedtime(s.id) || s.energy < NAP_THRESHOLD) {
    const home = homeFor(sim, s);
    set({ kind: 'sleep', home: home?.id ?? null, stage: 'walk' });
    return;
  }
  if (s.lifeStage === 'child') {
    playNearHome(sim, s);
    return;
  }
  if (s.military) {
    soldierRoutine(sim, s);
    return;
  }
  if (s.ruler) {
    rulerRoutine(sim, s);
    return;
  }
  const post = councilPostOf(sim, s);
  if (post) {
    s.idleReason = `Serving on the council as ${COUNCIL_POSTS[post].name} — not available for other work`;
    s.nextThink = sim.tick + IDLE_BACKOFF * 4;
    return;
  }
  if (s.focus) {
    const t = findFocus(sim, s);
    if (t) {
      set(t);
      return;
    }
    s.focus = null;
  }
  let reason: string | null = null;
  const area = sim.area(s.areaId);
  if (area) {
    const r = findAreaWork(sim, s, area, handsFull);
    if (r && typeof r === 'object') {
      set(r);
      return;
    }
    if (typeof r === 'string') reason = r;
  }
  for (const kind of effectivePriorities(s)) {
    if (handsFull && kind !== 'farm' && kind !== 'build') continue;
    const r = FINDERS[kind](sim, s);
    if (r && typeof r === 'object') {
      set(r);
      return;
    }
    if (typeof r === 'string') reason ??= r;
  }
  if (handsFull) reason = 'Storage is full — build a storehouse';
  if (s.hunger < EAT_THRESHOLD) reason = 'Hungry, but there is no food in storage';
  if (effectivePriorities(s).length === 0 && !area) reason = 'Every kind of work is switched off in their work order';
  s.idleReason = reason ?? 'Nothing to do';
  // Nothing to do rarely changes within a second: look again a little later.
  s.nextThink = sim.tick + IDLE_BACKOFF + (s.id % 5);
  if (!s.task && sim.rng.chance(0.08)) {
    const t = tileOf(s);
    const x = t.x + sim.rng.int(5) - 2;
    const y = t.y + sim.rng.int(5) - 2;
    if (sim.walkable(x, y) && sim.world.explored(x, y)) s.task = { kind: 'wander', x, y };
  }
}

/** The ruler strolls where they were sent, greeting people; needs are handled above. */
function rulerRoutine(sim: Simulation, s: Settler): void {
  s.idleReason = '';
  s.nextThink = sim.tick + IDLE_BACKOFF * 2 + (s.id % 7);
  if (!s.task && sim.rng.chance(0.15)) {
    const t = tileOf(s);
    const x = t.x + sim.rng.int(3) - 1;
    const y = t.y + sim.rng.int(3) - 1;
    if (sim.walkable(x, y) && sim.world.explored(x, y)) s.task = { kind: 'wander', x, y };
  }
}

// ---- task execution ---------------------------------------------------------

const GATHER_SFX: Record<string, 'chop' | 'mine' | 'pick'> = { axe: 'chop', pick: 'mine', hand: 'pick' };
const GATHER_FX: Record<string, 'woodchips' | 'stonechips' | 'leaves'> = { axe: 'woodchips', pick: 'stonechips', hand: 'leaves' };
const STAT_FOR: Record<string, 'woodGathered' | 'stoneGathered' | 'foodGathered'> = { wood: 'woodGathered', stone: 'stoneGathered', food: 'foodGathered' };

function runGather(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'gather' }>): void {
  const o = sim.world.obj(t.x, t.y) as ObjectId;
  const def = OBJECTS[o];
  const left = sim.world.amount(t.x, t.y);
  if (!def.resource || left <= 0) return abortTask(sim, s);
  if (s.carrying && (s.carrying.res !== def.resource || s.carrying.amount >= s.capacity)) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, { x: t.x, y: t.y, w: 1, h: 1, adjacent: true });
    if (r === 'failed') return fail(sim, s, `Can't reach the ${def.name.toLowerCase()}`, `o${tileKey(t.x, t.y)}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, t.x, t.y, 1, 1);
  s.anim = 'work';
  s.tool = (def.tool ?? 'hand') as ToolKind;
  t.timer += workSpeed(sim, s);
  if (t.timer < def.workTicks) return;
  t.timer -= def.workTicks;
  const res = def.resource;
  sim.world.setAmount(t.x, t.y, left - 1);
  s.carrying = { res, amount: (s.carrying?.amount ?? 0) + 1 };
  sim.stats[STAT_FOR[res]]++;
  sim.emit({ type: 'sfx', name: GATHER_SFX[def.tool ?? 'hand'], x: t.x + 0.5, y: t.y + 0.5 });
  sim.emit({ type: 'fx', kind: GATHER_FX[def.tool ?? 'hand'], x: t.x + 0.5, y: t.y + 0.5 });
  if (left - 1 <= 0) {
    sim.world.setObj(t.x, t.y, def.depletesTo);
    sim.designations.delete(tileKey(t.x, t.y));
    // Woodlots are replanted at once: a sapling that grows back within a day.
    if (def.depletesTo === O.Stump && sim.workAreas.some((a) => a.kind === 'wood' && t.x >= a.x0 && t.x <= a.x1 && t.y >= a.y0 && t.y <= a.y1)) {
      sim.world.setObj(t.x, t.y, O.Sapling);
      sim.regrowth.set(tileKey(t.x, t.y), { to: O.Oak, at: sim.tick + REPLANT_TICKS });
    } else scheduleRegrowth(sim, t.x, t.y);
    if (def.depletesTo === O.Stump) sim.emit({ type: 'fx', kind: 'leaves', x: t.x + 0.5, y: t.y });
    abortTask(sim, s);
    return;
  }
  if (s.carrying.amount >= s.capacity) abortTask(sim, s);
}

function runDeliver(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'deliver' }>): void {
  if (!s.carrying) return abortTask(sim, s);
  let target = t.target !== null ? sim.buildings.get(t.target) : undefined;
  if (!target || !target.built || sim.storageUsed(target) >= sim.storageCapacity(target) || !storesResource(target, s.carrying.res)) {
    target = sim.nearestStorageWithSpace(s.x, s.y, s.carrying.res) ?? undefined;
    if (!target) {
      abortTask(sim, s, 'Storage is full — build a storehouse');
      return;
    }
    t.target = target.id;
  }
  const r = goTo(sim, s, bGoal(target));
  if (r === 'failed') return fail(sim, s, "Can't reach storage", `b${target.id}`);
  if (r !== 'arrived') return;
  const n = sim.deposit(target, s.carrying.res, s.carrying.amount);
  s.carrying.amount -= n;
  if (s.carrying.amount <= 0) s.carrying = null;
  sim.emit({ type: 'sfx', name: 'drop', x: s.x, y: s.y });
  abortTask(sim, s);
}

function runHaul(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'haul' }>): void {
  const dst = sim.buildings.get(t.dst);
  if (t.stage === 'toSrc') {
    const src = sim.buildings.get(t.src);
    if (!src || !dst) return abortTask(sim, s);
    const r = goTo(sim, s, bGoal(src));
    if (r === 'failed') return fail(sim, s, "Can't reach storage", `b${src.id}`);
    if (r !== 'arrived') return;
    const take = Math.min(t.amount, src.inventory[t.res] ?? 0);
    addInv(src.reservedOut, t.res, -t.amount);
    addInv(src.inventory, t.res, -take);
    if (take < t.amount) addInv(dst.incoming, t.res, -(t.amount - take));
    t.amount = take;
    if (take <= 0) {
      s.task = null;
      return abortTask(sim, s);
    }
    s.carrying = { res: t.res, amount: take };
    t.stage = 'toDst';
    return;
  }
  if (!dst) {
    // The site was cancelled; whatever we carry goes back to storage.
    s.task = null;
    return abortTask(sim, s);
  }
  const r = goTo(sim, s, bGoal(dst));
  if (r === 'failed') return fail(sim, s, `Can't reach the ${BUILDINGS[dst.type].name.toLowerCase()}`, `b${dst.id}`);
  if (r !== 'arrived') return;
  addInv(dst.incoming, t.res, -t.amount);
  if (BUILDINGS[dst.type].storage && dst.built) {
    // Supply run: goods go into the store; anything that doesn't fit is delivered elsewhere.
    const n = sim.deposit(dst, t.res, t.amount);
    s.carrying = t.amount - n > 0 ? { res: t.res, amount: t.amount - n } : null;
    sim.emit({ type: 'sfx', name: 'drop', x: s.x, y: s.y });
    s.task = null;
    return abortTask(sim, s);
  }
  addInv(dst.delivered, t.res, t.amount);
  s.carrying = null;
  sim.emit({ type: 'sfx', name: 'drop', x: s.x, y: s.y });
  s.task = null;
  abortTask(sim, s);
}

function runBuild(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'build' }>): void {
  const site = sim.buildings.get(t.site);
  if (!site || site.built || !materialsComplete(site)) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(site));
    if (r === 'failed') return fail(sim, s, `Can't reach the ${BUILDINGS[site.type].name.toLowerCase()} site`, `b${site.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, site.x, site.y, site.w, site.h);
  s.anim = 'work';
  s.tool = 'hammer';
  site.progress += workSpeed(sim, s);
  if ((sim.tick + s.id) % 9 === 0) {
    sim.emit({ type: 'sfx', name: 'hammer', x: site.x + site.w / 2, y: site.y + site.h / 2 });
    sim.emit({ type: 'fx', kind: 'dust', x: site.x + site.w / 2, y: site.y + site.h - 0.2 });
  }
  if (site.progress >= workOf(site)) {
    completeBuilding(sim, site);
    abortTask(sim, s);
  }
}

const FARM_TOOLS: Record<string, ToolKind> = { till: 'hoe', plant: 'hand', water: 'can', harvest: 'sickle' };

function runFarm(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'farm' }>): void {
  const b = sim.buildings.get(t.field);
  if (!b || !b.field || fieldAction(sim, b.field) !== t.action) return abortTask(sim, s);
  if (t.action === 'harvest' && s.carrying) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, { x: b.x, y: b.y, w: 1, h: 1, adjacent: false });
    if (r === 'failed') return fail(sim, s, "Can't reach the field", `b${b.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  s.anim = 'work';
  s.tool = FARM_TOOLS[t.action];
  t.timer += workSpeed(sim, s);
  if (t.timer < FIELD_WORK[t.action]) return;
  if (t.action === 'harvest' && b.field.crop) {
    const [res, amount] = invEntries(CROPS[b.field.crop].yield)[0];
    s.carrying = { res, amount };
    if (res === 'food') sim.stats.harvested += amount;
    if (res === 'wheat') sim.stats.wheatHarvested += amount;
  }
  applyFieldAction(sim, b, t.action);
  abortTask(sim, s);
}

function runOrchard(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'orchard' }>): void {
  const b = sim.buildings.get(t.orchard);
  if (!b || !b.orchard || orchardAction(sim, b) !== t.action) return abortTask(sim, s);
  if (t.action === 'pick' && s.carrying) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(b));
    if (r === 'failed') return fail(sim, s, "Can't reach the orchard", `b${b.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, b.x, b.y, b.w, b.h);
  s.anim = 'work';
  s.tool = t.action === 'pick' ? 'hand' : 'sickle';
  t.timer += workSpeed(sim, s);
  if (t.timer < ORCHARD_WORK[t.action]) return;
  const n = applyOrchardAction(sim, b, t.action, s.capacity);
  if (n > 0) {
    s.carrying = { res: 'apples', amount: n };
    sim.emit({ type: 'sfx', name: 'pick', x: s.x, y: s.y });
  }
  sim.emit({ type: 'fx', kind: 'leaves', x: b.x + 1, y: b.y + 1 });
  abortTask(sim, s);
}

function runSurvey(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'survey' }>): void {
  if (t.stage === 'walk') {
    const r = goTo(sim, s, { x: t.x, y: t.y, w: 1, h: 1, adjacent: !sim.walkable(t.x, t.y) }, 9000);
    if (r === 'failed') return abortTask(sim, s, "Can't reach the spot to survey");
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  face(s, t.x + 0.5, t.y + 0.5);
  s.anim = 'work';
  s.tool = 'pick';
  t.timer += workSpeed(sim, s);
  if ((sim.tick + s.id) % 15 === 0) sim.emit({ type: 'sfx', name: 'mine', x: t.x, y: t.y });
  if (t.timer < SURVEY_WORK) return;
  completeSurvey(sim, s, t.x, t.y);
  abortTask(sim, s);
}

const CRAFT_TOOL: Record<RecipeId, ToolKind> = {
  planks: 'saw', tools: 'hammer', flour: 'hand', bread: 'hand', driedApples: 'hand',
  charcoal: 'hand', smeltCopper: 'hammer', smeltIron: 'hammer', forgeCopperTools: 'hammer', forgeIronTools: 'hammer',
  forgeSwords: 'hammer', forgeArmor: 'hammer', makeBows: 'saw', tanLeather: 'hand', weaveCloth: 'hand',
};
const CRAFT_SFX: Record<RecipeId, 'saw' | 'hammer' | 'mill' | 'bake'> = {
  planks: 'saw', tools: 'hammer', flour: 'mill', bread: 'bake', driedApples: 'bake',
  charcoal: 'bake', smeltCopper: 'bake', smeltIron: 'bake', forgeCopperTools: 'hammer', forgeIronTools: 'hammer',
  forgeSwords: 'hammer', forgeArmor: 'hammer', makeBows: 'saw', tanLeather: 'hammer', weaveCloth: 'saw',
};

function runExtract(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'extract' }>): void {
  const b = sim.buildings.get(t.site);
  const kind = b ? BUILDINGS[b.type].extraction : undefined;
  if (!b || !kind || !b.built || s.carrying) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(b));
    if (r === 'failed') return fail(sim, s, `Can't reach the ${BUILDINGS[b.type].name.toLowerCase()}`, `b${b.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, b.x, b.y, b.w, b.h);
  s.anim = 'work';
  s.tool = kind === 'fish' ? 'hand' : 'pick';
  t.timer += workSpeed(sim, s) * speedOf(b);
  if ((sim.tick + s.id) % 12 === 0) {
    sim.emit({ type: 'sfx', name: kind === 'fish' ? 'water' : 'mine', x: b.x + 1, y: b.y + 1 });
    sim.emit({ type: 'fx', kind: kind === 'fish' ? 'splash' : 'stonechips', x: b.x + 1, y: b.y + 1 });
  }
  if (t.timer < EXTRACT_WORK[kind]) return;
  const got = completeExtraction(sim, b, t.amount);
  // The promised ore is now dug (or gone); nothing is left to give back.
  t.amount = 0;
  if (got) s.carrying = got;
  abortTask(sim, s);
}


/** Hunters close to bow range of their quarry, aim, and bring the meat home; hides go to the lodge. */
function runHunt(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'hunt' }>): void {
  const lodge = t.lodge !== null ? sim.buildings.get(t.lodge) : undefined;
  const ground = t.area !== undefined ? sim.area(t.area) : undefined;
  const a = sim.animals.find((x) => x.id === t.animal);
  if ((!lodge && !ground) || !a || a.penId !== null || s.carrying) return abortTask(sim, s);
  const d = Math.hypot(a.x - s.x, a.y - s.y);
  const reach = lodge ? huntRadiusOf(lodge) + 12 : ground ? Math.max(ground.x1 - ground.x0, ground.y1 - ground.y0) + 12 : 0;
  if (d > reach) return abortTask(sim, s, 'The quarry got away');
  if (t.stage === 'stalk') {
    if (d <= HUNT_RANGE) {
      t.stage = 'aim';
      s.path = null;
      return;
    }
    // Follow the animal: plan again only when it has moved away from where we were heading.
    if (Math.hypot(a.x - (t.tx + 0.5), a.y - (t.ty + 0.5)) > 2.5) {
      t.tx = Math.floor(a.x);
      t.ty = Math.floor(a.y);
    }
    const r = goTo(sim, s, { x: t.tx - 1, y: t.ty - 1, w: 3, h: 3, adjacent: false }, 6000);
    if (r === 'failed') return fail(sim, s, "Can't reach the game", `hunt${a.id}`);
    if (r === 'arrived') t.stage = 'aim';
    return;
  }
  if (d > HUNT_RANGE + 2) {
    t.stage = 'stalk';
    return;
  }
  face(s, a.x, a.y);
  s.anim = 'work';
  s.tool = 'hand';
  t.timer += workSpeed(sim, s);
  const hunt = SPECIES[a.species].hunt!;
  if (t.timer < hunt.work) return;
  removeAnimal(sim, a);
  s.carrying = { res: 'food', amount: hunt.food };
  sim.stats.foodGathered += hunt.food;
  if (hunt.hides > 0) {
    const left = lodge ? hunt.hides - sim.deposit(lodge, 'hides', hunt.hides) : hunt.hides;
    if (left > 0) sim.depositAnywhere('hides', left, lodge ? lodge.x : s.x, lodge ? lodge.y : s.y);
  }
  sim.emit({ type: 'sfx', name: 'harvest', x: a.x, y: a.y });
  sim.emit({ type: 'fx', kind: 'leaves', x: a.x, y: a.y });
  abortTask(sim, s);
}

/** Herders collect eggs, milk, wool or a foal, or take one animal from a full pen to the butcher. */
function runHerd(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'herd' }>): void {
  const b = sim.buildings.get(t.pen);
  const def = b ? BUILDINGS[b.type].pen : undefined;
  if (!b || !def || !b.pen || s.carrying) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(b));
    if (r === 'failed') return fail(sim, s, `Can't reach the ${BUILDINGS[b.type].name.toLowerCase()}`, `b${b.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, b.x, b.y, b.w, b.h);
  s.anim = 'work';
  s.tool = 'hand';
  t.timer += workSpeed(sim, s);
  if (t.timer < HERD_WORK) return;
  if (b.pen.ready >= 1 && def.product) {
    const n = Math.min(10, Math.floor(b.pen.ready));
    b.pen.ready -= n;
    s.carrying = { res: def.product.res, amount: n };
    if (def.product.res === 'food') sim.stats.foodGathered += n;
  } else if (def.cull) {
    const herd = penAnimals(sim, b);
    if (herd.length >= penCapacity(b)) {
      removeAnimal(sim, herd[herd.length - 1]);
      s.carrying = { res: 'food', amount: def.cull.food };
      sim.stats.foodGathered += def.cull.food;
      if (def.cull.hides > 0) sim.depositAnywhere('hides', def.cull.hides, b.x, b.y);
    }
  }
  sim.emit({ type: 'sfx', name: 'pick', x: b.x + 1, y: b.y + 1 });
  abortTask(sim, s);
}

function runCraft(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'craft' }>): void {
  const b = sim.buildings.get(t.ws);
  const ws = b?.workshop;
  if (!b || !ws || !ws.recipe || ws.paused || s.carrying) return abortTask(sim, s);
  const recipe = RECIPES[ws.recipe];
  if (!recipeReady(b.delivered, recipe)) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(b));
    if (r === 'failed') return fail(sim, s, `Can't reach the ${BUILDINGS[b.type].name.toLowerCase()}`, `b${b.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, b.x, b.y, b.w, b.h);
  s.anim = 'work';
  s.tool = CRAFT_TOOL[ws.recipe];
  ws.progress += workSpeed(sim, s) * speedOf(b);
  if ((sim.tick + s.id) % 10 === 0) sim.emit({ type: 'sfx', name: CRAFT_SFX[ws.recipe], x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (ws.progress < recipe.work) return;
  ws.progress = 0;
  for (const [r, n] of invEntries(recipe.inputs)) addInv(b.delivered, r, -n);
  burnFuel(sim, b.delivered, recipe.fuel ?? 0);
  const [out, n] = invEntries(recipe.outputs)[0];
  s.carrying = { res: out, amount: n };
  if (out === 'planks') sim.stats.planksCrafted += n;
  if (out === 'tools') sim.stats.toolsCrafted += n;
  if (out === 'flour') sim.stats.flourMilled += n;
  if (ws.recipe === 'bread') sim.stats.bakedFood += n;
  if (ws.recipe === 'driedApples') sim.stats.driedApples += n;
  if (ws.recipe === 'charcoal') sim.stats.charcoalMade += n;
  if (ws.recipe === 'smeltCopper') sim.stats.copperSmelted += n;
  if (ws.recipe === 'smeltIron') sim.stats.ironSmelted += n;
  if (ws.recipe === 'forgeCopperTools') sim.stats.copperToolsForged += n;
  if (ws.recipe === 'forgeIronTools') sim.stats.ironToolsForged += n;
  if (ws.recipe === 'forgeSwords') sim.stats.swordsMade += n;
  if (ws.recipe === 'forgeArmor') sim.stats.armorMade += n;
  if (ws.recipe === 'makeBows') sim.stats.bowsMade += n;
  sim.emit({ type: 'fx', kind: 'sparkle', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  abortTask(sim, s);
}

function runEat(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'eat' }>): void {
  const src = sim.buildings.get(t.src);
  if (!src) {
    s.task = null;
    return abortTask(sim, s);
  }
  const r = goTo(sim, s, bGoal(src));
  if (r === 'failed') return fail(sim, s, "Can't reach the food store", `b${src.id}`);
  if (r !== 'arrived') return;
  addInv(src.reservedOut, 'food', -1);
  if ((src.inventory.food ?? 0) > 0) {
    addInv(src.inventory, 'food', -1);
    s.hunger = Math.min(100, s.hunger + MEAL_VALUE);
    sim.emit({ type: 'sfx', name: 'eat', x: s.x, y: s.y });
    sim.emit({ type: 'fx', kind: 'hearts', x: s.x, y: s.y - 0.6 });
  }
  s.task = null;
  abortTask(sim, s);
}

function wake(sim: Simulation, s: Settler): void {
  s.restNote = '';
  abortTask(sim, s);
}

function runSleep(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'sleep' }>): void {
  if (!sim.isBedtime(s.id) && s.energy >= WAKE_ENERGY) return wake(sim, s);
  if (t.stage === 'walk') {
    const home = t.home !== null ? sim.buildings.get(t.home) : undefined;
    if (!home) {
      t.stage = 'sleep';
      s.restNote = 'No bed anywhere — dozing where they stand';
      return;
    }
    const name = BUILDINGS[home.type].name.toLowerCase();
    const ownHome = isPermanentHome(home) && s.homeId === home.id;
    let goal: Goal;
    if (ownHome) {
      // Walk to the door; if something stands in front of it, any side will do.
      const e = entranceOf(home);
      goal = sim.walkable(e.x, e.y) ? { x: e.x, y: e.y, w: 1, h: 1, adjacent: false } : bGoal(home);
    } else {
      const spot = campSpot(sim, home, s);
      goal = spot ? { x: spot.x, y: spot.y, w: 1, h: 1, adjacent: false } : bGoal(home);
    }
    const r = goTo(sim, s, goal, 6000);
    if (r === 'failed') {
      // Never loop: rest here tonight and try again tomorrow.
      t.stage = 'sleep';
      s.restNote = ownHome ? `The way to their ${name} is blocked, so they are resting outside tonight` : 'Resting where they are — the camp is out of reach';
      return;
    }
    if (r === 'arrived') {
      t.stage = 'sleep';
      if (ownHome) {
        s.hidden = true;
        s.insideId = home.id;
        s.restNote = `Asleep at home in the ${name}`;
      } else if (s.homeId === home.id) s.restNote = home.type === 'townHall' ? 'Asleep in a Town Hall bunk' : 'Asleep in a camp bedroll';
      else s.restNote = 'No free bed — resting by the campfire';
    }
    return;
  }
  s.anim = 'sleep';
  s.tool = null;
  s.energy = Math.min(100, s.energy + 100 / (DAY_TICKS * 0.25));
}

function campSpot(sim: Simulation, b: Building, s: Settler): { x: number; y: number } | null {
  const ring: { x: number; y: number }[] = [];
  for (let y = b.y - 2; y <= b.y + b.h + 1; y++) {
    for (let x = b.x - 2; x <= b.x + b.w + 1; x++) {
      const inside = x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h;
      if (!inside && sim.walkable(x, y)) ring.push({ x, y });
    }
  }
  return ring.length ? ring[(s.id * 7) % ring.length] : null;
}

function runMove(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'move' } | { kind: 'wander' }>): void {
  const r = goTo(sim, s, { x: t.x, y: t.y, w: 1, h: 1, adjacent: false }, t.kind === 'move' ? 9000 : 400, t.kind === 'move');
  if (r === 'failed') {
    if (t.kind === 'move') {
      s.lastNotice = sim.tick;
      const here = tileOf(s);
      const close = Math.hypot(here.x - t.x, here.y - t.y) < 1.5;
      return abortTask(sim, s, close ? '' : 'Went as close as the path allows');
    }
    return abortTask(sim, s);
  }
  if (r === 'arrived') {
    const keepReason = t.kind === 'wander' ? s.idleReason : '';
    abortTask(sim, s);
    s.idleReason = keepReason;
  }
}

export function runTask(sim: Simulation, s: Settler): void {
  const t = s.task!;
  switch (t.kind) {
    case 'move':
    case 'wander':
      return runMove(sim, s, t);
    case 'gather':
      return runGather(sim, s, t);
    case 'deliver':
      return runDeliver(sim, s, t);
    case 'haul':
      return runHaul(sim, s, t);
    case 'build':
      return runBuild(sim, s, t);
    case 'farm':
      return runFarm(sim, s, t);
    case 'orchard':
      return runOrchard(sim, s, t);
    case 'survey':
      return runSurvey(sim, s, t);
    case 'train':
      return runTrain(sim, s, t);
    case 'extract':
      return runExtract(sim, s, t);
    case 'craft':
      return runCraft(sim, s, t);
    case 'hunt':
      return runHunt(sim, s, t);
    case 'herd':
      return runHerd(sim, s, t);
    case 'eat':
      return runEat(sim, s, t);
    case 'sleep':
      return runSleep(sim, s, t);
  }
}

export function updateSettler(sim: Simulation, s: Settler): void {
  // Away with a caravan or marching with a company: not simulated here until they are back.
  if (s.awayOn !== null || s.military?.state === 'deployed' || s.captive) return;
  s.hunger = Math.max(0, s.hunger - HUNGER_DECAY);
  const sleeping = s.task?.kind === 'sleep' && s.task.stage === 'sleep';
  if (!sleeping) s.energy = Math.max(0, s.energy - ENERGY_DECAY);
  if ((!s.task || s.task.kind === 'wander') && (sim.tick + s.id) % 4 === 0 && sim.tick >= s.nextThink) assignTask(sim, s);
  if (s.task) runTask(sim, s);
  else {
    s.anim = 'idle';
    s.tool = null;
  }
  if ((sim.tick + s.id) % 10 === 0 && !s.hidden) {
    // Only re-reveal after moving to a new tile.
    const key = Math.floor(s.x) * 100003 + Math.floor(s.y);
    if (key !== lastReveal.get(s)) {
      lastReveal.set(s, key);
      sim.world.reveal(s.x, s.y, nearWater(sim, s) ? RIVER_REVEAL_RADIUS : REVEAL_RADIUS);
    }
  }
}

/** Short description of what a settler is doing, for the UI. */
export function describeTask(sim: Simulation, s: Settler): string {
  if (s.awayOn !== null) return 'Away with a caravan';
  if (s.captive) return 'Held captive — home at peace';
  const t = s.task;
  if (s.ruler && (!t || t.kind === 'wander')) return 'Watching over the realm';
  if (!t) return s.idleReason ? 'Idle' : 'Looking for work';
  const bname = (id: number) => {
    const b = sim.buildings.get(id);
    return b ? BUILDINGS[b.type].name.toLowerCase() : 'building';
  };
  switch (t.kind) {
    case 'move':
      return 'Walking';
    case 'wander':
      return 'Idle';
    case 'gather': {
      const def = OBJECTS[sim.world.obj(t.x, t.y)];
      const verb = def.resource === 'wood' ? 'Chopping' : def.resource === 'stone' ? 'Mining' : 'Picking';
      return `${verb} ${def.name.toLowerCase()}`;
    }
    case 'deliver':
      return 'Carrying goods to storage';
    case 'haul':
      return `Hauling ${t.res} to the ${bname(t.dst)}`;
    case 'build':
      return `Building the ${bname(t.site)}`;
    case 'farm':
      return { till: 'Tilling a field', plant: 'Planting seeds', water: 'Watering a field', harvest: 'Harvesting' }[t.action];
    case 'orchard':
      return t.action === 'pick' ? 'Picking apples' : 'Tending the orchard';
    case 'survey':
      return 'Surveying for ore';
    case 'train':
      return s.military ? `Drilling as ${UNITS[s.military.unit].name.toLowerCase()} (${Math.floor((s.military.trained / UNITS[s.military.unit].trainTicks) * 100)}%)` : 'Drilling';
    case 'extract': {
      const b = sim.buildings.get(t.site);
      return b && BUILDINGS[b.type].extraction === 'fish' ? 'Fishing from the jetty' : b?.quarry ? 'Cutting stone at the quarry' : 'Digging ore in the mine';
    }
    case 'hunt': {
      const a = sim.animals.find((x) => x.id === t.animal);
      const name = a ? SPECIES[a.species].name.toLowerCase() : 'game';
      return t.stage === 'aim' ? `Taking aim at a ${name}` : `Stalking a ${name}`;
    }
    case 'herd': {
      const b = sim.buildings.get(t.pen);
      return `Tending the animals at the ${b ? BUILDINGS[b.type].name.toLowerCase() : 'pen'}`;
    }
    case 'craft': {
      const b = sim.buildings.get(t.ws);
      const r = b?.workshop?.recipe;
      return r ? `${RECIPES[r].name} at the ${bname(t.ws)}` : 'Working';
    }
    case 'eat':
      return 'Having a meal';
    case 'sleep':
      if (t.stage === 'sleep') return s.restNote || 'Sleeping';
      return sim.isNight() ? 'Heading to bed for the night' : 'Tired — going for a nap';
  }
}
