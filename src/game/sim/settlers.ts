import { DAY_TICKS, tileKey, keyX, keyY } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { CROPS } from '../data/crops';
import { JOBS, type WorkKind } from '../data/jobs';
import { RECIPES } from '../data/recipes';
import { RESOURCES, type ResourceId } from '../data/resources';
import { O, OBJECTS, TERRAIN, type ObjectId } from '../world/tiles';
import { completeBuilding, materialsComplete, scheduleRegrowth, workshopNeeds } from './buildings';
import { applyFieldAction, FIELD_WORK, fieldAction } from './farming';
import { addInv, hasAll, invEntries } from './inventory';
import { findPath, goalSatisfied, type Goal } from './pathfinding';
import type { Simulation } from './Simulation';
import type { Building, Settler, Task, ToolKind } from './types';

export const BASE_SPEED = 0.24;
export const HUNGER_DECAY = 100 / (DAY_TICKS * 1.2);
export const ENERGY_DECAY = 100 / (DAY_TICKS * 0.8);
export const EAT_THRESHOLD = 32;
export const MEAL_VALUE = 65;
export const REVEAL_RADIUS = 6.5;
export const AUTO_GATHER_RADIUS = 18;
export const FOCUS_RADIUS = 7;

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

export function workSpeed(sim: Simulation, s: Settler): number {
  let v = 1;
  if (s.hunger < 15) v *= 0.7;
  if (s.energy < 15) v *= 0.8;
  if (sim.wellEquipped()) v *= 1.25;
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
export function goTo(sim: Simulation, s: Settler, g: Goal, maxNodes = 4000): MoveResult {
  const gk = `${g.x},${g.y},${g.w},${g.h},${g.adjacent ? 1 : 0}`;
  const here = tileOf(s);
  if (s.goalKey !== gk) {
    s.goalKey = gk;
    s.path = null;
    s.repaths = 0;
  }
  if (!s.path) {
    if (goalSatisfied(g, here.x, here.y)) return settle(sim, s, here.x, here.y);
    const p = findPath(sim, here.x, here.y, g, maxNodes);
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
      return goalSatisfied(g, t.x, t.y) ? 'arrived' : 'moving';
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
    case 'craft':
      sim.release(`craft:${t.ws}`, s.id);
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
}

/** Stops the current task and gives back anything it had reserved. */
export function abortTask(sim: Simulation, s: Settler, reason?: string): void {
  releaseTask(sim, s);
  clearTask(s);
  if (s.hidden) s.hidden = false;
  if (reason) s.idleReason = reason;
}

function fail(sim: Simulation, s: Settler, reason: string, target?: string): void {
  if (target) sim.markUnreachable(s.id, target);
  abortTask(sim, s, reason);
}

// ---- job finders -----------------------------------------------------------

function findBuild(sim: Simulation, s: Settler): Task | string | null {
  let best: Building | null = null;
  let bestSlot = -1;
  let bestD = Infinity;
  for (const b of sim.buildings.values()) {
    if (b.built || !materialsComplete(b)) continue;
    if (sim.isUnreachable(s.id, `b${b.id}`)) continue;
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
    const d = dist(s, c.x, c.y);
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
}

function haulNeeds(sim: Simulation): HaulNeed[] {
  const out: HaulNeed[] = [];
  for (const b of sim.buildings.values()) {
    if (!b.built) {
      for (const [r, n] of invEntries(BUILDINGS[b.type].cost)) {
        const need = n - (b.delivered[r] ?? 0) - (b.incoming[r] ?? 0);
        if (need > 0) out.push({ dst: b, res: r, need, priority: 0 });
      }
    } else if (b.workshop) {
      for (const { res, need } of workshopNeeds(b)) out.push({ dst: b, res, need, priority: 12 });
    }
  }
  return out;
}

/** Plans a haul for one specific need. Returns a reason when stock is missing. */
function planHaul(sim: Simulation, s: Settler, n: HaulNeed): Task | string {
  const src = sim.nearestStorageWith(n.res, s.x, s.y);
  if (!src) return `Waiting for ${RESOURCES[n.res].name.toLowerCase()} for the ${BUILDINGS[n.dst.type].name.toLowerCase()}`;
  const amount = Math.min(n.need, sim.available(src, n.res), s.capacity);
  addInv(src.reservedOut, n.res, amount);
  addInv(n.dst.incoming, n.res, amount);
  return { kind: 'haul', src: src.id, dst: n.dst.id, res: n.res, amount, stage: 'toSrc' };
}

function findHaul(sim: Simulation, s: Settler): Task | string | null {
  let reason: string | null = null;
  const needs = haulNeeds(sim)
    .filter((n) => !sim.isUnreachable(s.id, `b${n.dst.id}`))
    .map((n) => {
      const c = centre(n.dst);
      return { n, score: dist(s, c.x, c.y) + n.priority };
    })
    .sort((a, b) => a.score - b.score);
  for (const { n } of needs) {
    if (!sim.nearestStorageWith(n.res, s.x, s.y)) {
      reason ??= planHaul(sim, s, n) as string;
      continue;
    }
    return planHaul(sim, s, n);
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

function findFarm(sim: Simulation, s: Settler): Task | string | null {
  let best: Building | null = null;
  let bestScore = Infinity;
  let action: ReturnType<typeof fieldAction> = null;
  let anyFields = false;
  for (const b of sim.buildings.values()) {
    if (!b.field) continue;
    anyFields = true;
    const a = fieldAction(sim, b.field);
    if (!a || (a === 'harvest' && s.carrying)) continue;
    if (sim.isReserved(`field:${b.id}`, s.id) || sim.isUnreachable(s.id, `b${b.id}`)) continue;
    const bonus = a === 'harvest' ? 10 : a === 'plant' ? 5 : a === 'till' ? 2 : 0;
    const score = dist(s, b.x + 0.5, b.y + 0.5) - bonus;
    if (score < bestScore) {
      bestScore = score;
      best = b;
      action = a;
    }
  }
  if (!best || !action) return s.job === 'farmer' ? (anyFields ? 'Fields are growing — nothing to tend' : 'No fields yet — place some from the Build menu') : null;
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
  return !sim.isReserved(`obj:${k}`, s.id) && !sim.isUnreachable(s.id, `o${k}`);
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
    const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y);
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
  const home = sim.storages()[0];
  const cx = home ? home.x + 1 : s.x;
  const cy = home ? home.y + 1 : s.y;
  for (const { r } of order) {
    const t = scanNearest(sim, s, cx, cy, AUTO_GATHER_RADIUS, r);
    if (t) return objectTask(sim, s, t.x, t.y);
  }
  return 'Nothing left to gather near storage — mark resources with the Harvest tool';
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
    if (ws.paused || !ws.recipe) continue;
    if (sim.isReserved(`craft:${b.id}`, s.id) || sim.isUnreachable(s.id, `b${b.id}`)) continue;
    if (!hasAll(b.delivered, RECIPES[ws.recipe].inputs)) {
      reason ??= `Workshop is waiting for ${invEntries(RECIPES[ws.recipe].inputs).map(([r]) => r).join(' and ')}`;
      continue;
    }
    const c = centre(b);
    const d = dist(s, c.x, c.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (!any) return 'No workshop built yet';
  if (!best) return reason;
  if (!sim.nearestStorageWithSpace(s.x, s.y)) return 'Storage is full';
  sim.reserve(`craft:${best.id}`, s.id);
  return { kind: 'craft', ws: best.id, stage: 'walk' };
}

const FINDERS: Record<WorkKind, Finder> = {
  build: findBuild,
  haul: findHaul,
  farm: findFarm,
  gather: findGather,
  craft: findCraft,
};

function findFocus(sim: Simulation, s: Settler): Task | null {
  const f = s.focus!;
  if (sim.tick > f.until) return null;
  const t = scanNearest(sim, s, f.x, f.y, FOCUS_RADIUS, f.res);
  return t ? objectTask(sim, s, t.x, t.y) : null;
}

function homeFor(sim: Simulation, s: Settler): Building | null {
  if (s.homeId !== null) {
    const h = sim.buildings.get(s.homeId);
    if (h && h.built) return h;
  }
  for (const b of sim.buildings.values()) if (b.type === 'camp') return b;
  return null;
}

/** Picks the next task by needs, standing orders, then job priorities. */
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
    if (sim.nearestStorageWithSpace(s.x, s.y)) {
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
  if (sim.isNight()) {
    const home = homeFor(sim, s);
    set({ kind: 'sleep', home: home?.id ?? null, stage: 'walk' });
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
  for (const kind of JOBS[s.job].priorities) {
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
  s.idleReason = reason ?? 'Nothing to do';
  if (!s.task && sim.rng.chance(0.08)) {
    const t = tileOf(s);
    const x = t.x + sim.rng.int(5) - 2;
    const y = t.y + sim.rng.int(5) - 2;
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
    scheduleRegrowth(sim, t.x, t.y);
    if (def.depletesTo === O.Stump) sim.emit({ type: 'fx', kind: 'leaves', x: t.x + 0.5, y: t.y });
    abortTask(sim, s);
    return;
  }
  if (s.carrying.amount >= s.capacity) abortTask(sim, s);
}

function runDeliver(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'deliver' }>): void {
  if (!s.carrying) return abortTask(sim, s);
  let target = t.target !== null ? sim.buildings.get(t.target) : undefined;
  if (!target || !target.built || sim.storageUsed(target) >= sim.storageCapacity(target)) {
    target = sim.nearestStorageWithSpace(s.x, s.y) ?? undefined;
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
  if (site.progress >= BUILDINGS[site.type].work) {
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
    const yieldFood = CROPS[b.field.crop].yield.food ?? 0;
    s.carrying = { res: 'food', amount: yieldFood };
    sim.stats.harvested += yieldFood;
  }
  applyFieldAction(sim, b, t.action);
  abortTask(sim, s);
}

function runCraft(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'craft' }>): void {
  const b = sim.buildings.get(t.ws);
  const ws = b?.workshop;
  if (!b || !ws || !ws.recipe || ws.paused || s.carrying) return abortTask(sim, s);
  const recipe = RECIPES[ws.recipe];
  if (!hasAll(b.delivered, recipe.inputs)) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const r = goTo(sim, s, bGoal(b));
    if (r === 'failed') return fail(sim, s, "Can't reach the workshop", `b${b.id}`);
    if (r === 'arrived') t.stage = 'work';
    return;
  }
  faceRect(s, b.x, b.y, b.w, b.h);
  s.anim = 'work';
  s.tool = ws.recipe === 'planks' ? 'saw' : 'hammer';
  ws.progress += workSpeed(sim, s);
  if ((sim.tick + s.id) % 10 === 0) sim.emit({ type: 'sfx', name: ws.recipe === 'planks' ? 'saw' : 'hammer', x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (ws.progress < recipe.work) return;
  ws.progress = 0;
  for (const [r, n] of invEntries(recipe.inputs)) addInv(b.delivered, r, -n);
  const [out, n] = invEntries(recipe.outputs)[0];
  s.carrying = { res: out, amount: n };
  if (out === 'planks') sim.stats.planksCrafted += n;
  if (out === 'tools') sim.stats.toolsCrafted += n;
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

function runSleep(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'sleep' }>): void {
  if (!sim.isNight()) return abortTask(sim, s);
  if (t.stage === 'walk') {
    const home = t.home !== null ? sim.buildings.get(t.home) : undefined;
    if (!home) {
      t.stage = 'sleep';
      return;
    }
    // Houses take everyone inside; around the camp each settler gets their own spot by the tents.
    const spot = home.type === 'house' ? null : campSpot(sim, home, s);
    const r = goTo(sim, s, spot ? { x: spot.x, y: spot.y, w: 1, h: 1, adjacent: false } : bGoal(home));
    if (r === 'failed') {
      t.stage = 'sleep';
      return;
    }
    if (r === 'arrived') {
      t.stage = 'sleep';
      s.hidden = home.type === 'house';
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
  const r = goTo(sim, s, { x: t.x, y: t.y, w: 1, h: 1, adjacent: false }, t.kind === 'move' ? 9000 : 400);
  if (r === 'failed') {
    if (t.kind === 'move') {
      s.lastNotice = sim.tick;
      return abortTask(sim, s, "Couldn't find a way there");
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
    case 'craft':
      return runCraft(sim, s, t);
    case 'eat':
      return runEat(sim, s, t);
    case 'sleep':
      return runSleep(sim, s, t);
  }
}

export function updateSettler(sim: Simulation, s: Settler): void {
  s.hunger = Math.max(0, s.hunger - HUNGER_DECAY);
  const sleeping = s.task?.kind === 'sleep' && s.task.stage === 'sleep';
  if (!sleeping) s.energy = Math.max(0, s.energy - ENERGY_DECAY);
  if ((!s.task || s.task.kind === 'wander') && (sim.tick + s.id) % 4 === 0) assignTask(sim, s);
  if (s.task) runTask(sim, s);
  else {
    s.anim = 'idle';
    s.tool = null;
  }
  if ((sim.tick + s.id) % 10 === 0 && !s.hidden) sim.world.reveal(s.x, s.y, REVEAL_RADIUS);
}

/** Short description of what a settler is doing, for the UI. */
export function describeTask(sim: Simulation, s: Settler): string {
  const t = s.task;
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
    case 'craft':
      return 'Crafting at the workshop';
    case 'eat':
      return 'Having a meal';
    case 'sleep':
      return t.stage === 'sleep' ? 'Sleeping' : 'Heading home for the night';
  }
}
