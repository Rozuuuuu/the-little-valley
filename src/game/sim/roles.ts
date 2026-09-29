import { DAY_TICKS } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { HALL_LEVEL_NAMES, HALL_TRAINING_PLACES, JOBS, ROLE_TRAIN_TICKS, type JobId } from '../data/jobs';
import { MILESTONES } from '../data/progression';
import { campOf, permanentBeds } from './buildings';
import { applyCommand } from './commands';
import { isChild } from './households';
import { levelOf, workersOf } from './levels';
import { nextMilestone, requirementProgress } from './progression';
import { abortTask, faceRect, goTo, tileOf, workSpeed } from './settlers';
import type { Simulation } from './Simulation';
import type { Building, CommandResult, Settler, Task } from './types';

/**
 * Roles. Everyone has one (their job), and a new one is learned at the Town
 * Hall: the person walks there and studies for a while. What the hall can teach
 * depends on its level — the Keep adds crafters, hunters, herders, travellers and
 * messengers, the Castle the Assistant Chief.
 *
 *  - Travellers roam past the edge of the known land and lift the fog.
 *  - Messengers halve the time letters and news take to reach you.
 *  - The Assistant Chief walks among the people, puts idle hands to work where a
 *    workplace has nobody, and now and then comes to the ruler with advice: a "?"
 *    shows over them while they stand close, and clicking it hears them out.
 */

const ok = (message?: string): CommandResult => ({ ok: true, message });
const err = (message: string): CommandResult => ({ ok: false, message });

/** The chief comes this close to the ruler to give advice. */
export const ADVICE_RANGE = 3;
/** Time between pieces of advice once heard (a third of a day). */
export const ADVICE_COOLDOWN = DAY_TICKS / 3;
/** How long the chief waits beside an ignored ruler before going back to work. */
export const ADVICE_WAIT = DAY_TICKS / 4;
/** How far the chief looks for idle people to put to work. */
const CHIEF_SIGHT = 14;

const roleName = (role: JobId) => JOBS[role].name;
const plural = (role: JobId) => (role === 'chief' ? 'Assistant Chiefs' : `${roleName(role)}s`);

/** The Town Hall a settler would train at: their own town's, else the first. */
export function hallFor(sim: Simulation, s: Settler): Building | null {
  const own = s.settlementId !== null ? sim.buildings.get(s.settlementId) : undefined;
  if (own && own.built && own.type === 'townHall') return own;
  const first = campOf(sim);
  return first && first.built && first.type === 'townHall' ? first : null;
}

export function trainingPlaces(hall: Building): number {
  return HALL_TRAINING_PLACES[Math.min(3, levelOf(hall))];
}

export function trainingAt(sim: Simulation, hall: Building): Settler[] {
  return sim.settlers.filter((s) => s.training?.hall === hall.id);
}

/** Roles a hall of this level teaches. */
export function rolesAt(level: number): JobId[] {
  return (Object.keys(JOBS) as JobId[]).filter((j) => JOBS[j].hallLevel <= level);
}

/** Why a settler can't start learning this role, or null. */
function roleProblem(sim: Simulation, s: Settler, role: JobId): string | null {
  if (s.job === role && !s.training) return `${s.name} is already a ${roleName(role)}`;
  if (s.training?.role === role) return `${s.name} is already training as a ${roleName(role)}`;
  const limit = JOBS[role].limit;
  if (limit !== undefined) {
    const held = sim.settlers.filter((o) => o !== s && (o.job === role || o.training?.role === role)).length;
    if (held >= limit) return `You already have ${limit === 1 ? 'an' : limit} ${roleName(role)}${limit === 1 ? '' : 's'} — only ${limit} at a time`;
  }
  return null;
}

/** Sends people to the Town Hall to learn a new role. */
export function trainRole(sim: Simulation, list: Settler[], role: JobId): CommandResult {
  const hall = hallFor(sim, list[0]);
  if (!hall) return err('People learn new roles at a Town Hall — raise one first');
  const need = JOBS[role].hallLevel;
  if (levelOf(hall) < need) {
    return err(`${plural(role)} are trained at a ${HALL_LEVEL_NAMES[need]} — upgrade the Town Hall to a ${HALL_LEVEL_NAMES[need]} first`);
  }
  let free = trainingPlaces(hall) - trainingAt(sim, hall).length;
  const started: Settler[] = [];
  let firstProblem: string | null = null;
  let waiting = 0;
  for (const s of list) {
    const problem = roleProblem(sim, s, role);
    if (problem) {
      firstProblem ??= problem;
      continue;
    }
    if (free <= 0 && !s.training) {
      waiting++;
      continue;
    }
    if (!s.training) free--;
    s.training = { role, hall: hall.id, progress: 0 };
    abortTask(sim, s);
    s.focus = null;
    s.idleReason = '';
    started.push(s);
  }
  const hallName = BUILDINGS[hall.type].name;
  const places = trainingPlaces(hall);
  if (started.length === 0) {
    if (waiting > 0) return err(`The ${hallName} is full: it has ${places} training place${places === 1 ? '' : 's'} at this level, all taken`);
    return err(firstProblem ?? 'Nobody to train');
  }
  const who = started.length === 1 ? started[0].name : `${started.length} people`;
  const parts = [`${who} ${started.length === 1 ? 'walks' : 'walk'} to the ${hallName} to train as ${started.length === 1 ? `a ${roleName(role)}` : plural(role)}.`];
  if (waiting > 0) parts.push(`The hall is full: it has ${places} training places, so ${waiting} must wait.`);
  return ok(parts.join(' '));
}

export function cancelRoleTraining(sim: Simulation, s: Settler | undefined): CommandResult {
  if (!s || !s.training) return err('They are not training');
  const role = s.training.role;
  s.training = null;
  if (s.task?.kind === 'learn') abortTask(sim, s);
  return ok(`${s.name} stops training as a ${roleName(role)} and stays a ${roleName(s.job)}.`);
}

export function learnTask(s: Settler): Task | null {
  return s.training ? { kind: 'learn', hall: s.training.hall, stage: 'walk' } : null;
}

export function runLearn(sim: Simulation, s: Settler, t: Extract<Task, { kind: 'learn' }>): void {
  const hall = sim.buildings.get(t.hall);
  const tr = s.training;
  if (!tr || !hall || !hall.built) {
    s.training = null;
    return abortTask(sim, s, hall ? '' : 'The Town Hall is gone, so training stopped');
  }
  if (t.stage === 'walk') {
    const r = goTo(sim, s, { x: hall.x, y: hall.y, w: hall.w, h: hall.h, adjacent: true });
    if (r === 'failed') {
      s.training = null;
      return abortTask(sim, s, "Couldn't reach the Town Hall to train");
    }
    if (r === 'arrived') t.stage = 'study';
    return;
  }
  faceRect(s, hall.x, hall.y, hall.w, hall.h);
  s.anim = 'work';
  s.tool = 'hand';
  tr.progress += workSpeed(sim, s);
  if (tr.progress < ROLE_TRAIN_TICKS) return;
  s.job = tr.role;
  s.priorities = null;
  s.training = null;
  // The chief gets a moment before their first advice.
  if (tr.role === 'chief') sim.chief.nextAt = Math.max(sim.chief.nextAt, sim.tick + DAY_TICKS / 12);
  sim.emit({ type: 'toast', text: `${s.name} is now ${tr.role === 'chief' ? 'your Assistant Chief' : `a ${roleName(tr.role)}`}.`, level: 'good' });
  sim.emit({ type: 'fx', kind: 'sparkle', x: s.x, y: s.y - 0.5 });
  sim.emit({ type: 'sfx', name: 'complete', x: s.x, y: s.y });
  abortTask(sim, s);
}

// ---- messengers ------------------------------------------------------------------

/** Letters and news reach the player twice as fast while a messenger serves them. */
export function hasMessenger(sim: Simulation): boolean {
  return sim.settlers.some((s) => s.job === 'messenger' && s.kingdomId === 0 && !s.captive && s.lifeStage === 'adult');
}

// ---- travellers ------------------------------------------------------------------

/** A spot at the edge of the known land in a random direction from home. */
function frontierSpot(sim: Simulation, s: Settler): { x: number; y: number } | null {
  const home = hallFor(sim, s) ?? campOf(sim);
  const cx = home ? home.x + home.w / 2 : s.x;
  const cy = home ? home.y + home.h / 2 : s.y;
  for (let tries = 0; tries < 6; tries++) {
    const a = sim.rng.next() * Math.PI * 2;
    let last: { x: number; y: number } | null = null;
    for (let r = 6; r <= 90; r += 2) {
      const x = Math.floor(cx + Math.cos(a) * r);
      const y = Math.floor(cy + Math.sin(a) * r);
      if (!sim.world.explored(x, y)) break;
      if (sim.walkable(x, y)) last = { x, y };
    }
    if (last && Math.hypot(last.x - s.x, last.y - s.y) > 3) return last;
  }
  return null;
}

export function travelerRoutine(sim: Simulation, s: Settler): void {
  s.nextThink = sim.tick + 10;
  const spot = frontierSpot(sim, s);
  if (!spot) {
    s.idleReason = 'Nowhere left to explore within a day’s walk';
    s.nextThink = sim.tick + 200;
    return;
  }
  s.idleReason = '';
  s.task = { kind: 'move', x: spot.x, y: spot.y };
}

// ---- the Assistant Chief ----------------------------------------------------------

export function chiefOf(sim: Simulation): Settler | undefined {
  return sim.settlers.find((s) => s.job === 'chief' && !s.training && s.awayOn === null && !s.captive);
}

function idleHands(s: Settler): boolean {
  return !s.ruler && !s.military && !s.training && s.lifeStage === 'adult' && s.awayOn === null && s.areaId === null
    && s.job !== 'chief' && s.job !== 'traveler' && (!s.task || s.task.kind === 'wander') && !!s.idleReason;
}

/** Workplaces that stand empty: workshops, lodges and pens with no one assigned. */
function emptyWorkplaces(sim: Simulation): Building[] {
  const out: Building[] = [];
  for (const b of sim.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (!b.built || def.depot || workersOf(b) <= 0 || b.workers.length > 0) continue;
    if (!b.workshop && !def.hunting && !def.pen) continue;
    if (b.workshop && (b.workshop.paused || !b.workshop.recipe)) continue;
    out.push(b);
  }
  return out;
}

/** Puts one idle person the chief can see to work at the nearest empty workplace. */
function putToWork(sim: Simulation, chief: Settler): void {
  const places = emptyWorkplaces(sim);
  if (!places.length) return;
  const assigned = new Set<number>();
  for (const b of sim.buildings.values()) for (const id of b.workers) assigned.add(id);
  const idle = sim.settlers.filter((o) => o !== chief && idleHands(o) && !assigned.has(o.id) && Math.hypot(o.x - chief.x, o.y - chief.y) <= CHIEF_SIGHT);
  if (!idle.length) return;
  const who = idle[0];
  let best = places[0];
  let bestD = Infinity;
  for (const b of places) {
    const d = Math.hypot(b.x - who.x, b.y - who.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  const res = applyCommand(sim, { type: 'assignWorker', buildingId: best.id, ids: [who.id] });
  if (res.ok) {
    sim.emit({ type: 'toast', text: `${chief.name} (Assistant Chief) puts ${who.name} to work at the ${BUILDINGS[best.type].name.toLowerCase()}.`, level: 'info' });
    sim.emit({ type: 'fx', kind: 'sparkle', x: who.x, y: who.y - 0.5 });
  }
}

/** A walkable tile next to the ruler. */
function besideRuler(sim: Simulation, r: Settler, s: Settler): { x: number; y: number } | null {
  const t = tileOf(r);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!sim.walkable(t.x + dx, t.y + dy)) continue;
      const d = Math.hypot(t.x + dx - s.x, t.y + dy - s.y);
      if (d < bestD) {
        bestD = d;
        best = { x: t.x + dx, y: t.y + dy };
      }
    }
  }
  return best;
}

export function chiefRoutine(sim: Simulation, s: Settler): void {
  s.idleReason = '';
  s.nextThink = sim.tick + 8;
  const c = sim.chief;
  const r = sim.ruler();
  if (r && !r.hidden && sim.tick >= c.nextAt) {
    if (c.adviceReady && sim.tick > c.waitUntil) {
      // Ignored for a while: back to work, and try again later.
      c.adviceReady = false;
      c.nextAt = sim.tick + ADVICE_COOLDOWN / 2;
    } else {
      const d = Math.hypot(r.x - s.x, r.y - s.y);
      if (d <= ADVICE_RANGE) {
        s.facing = Math.abs(r.x - s.x) > Math.abs(r.y - s.y) ? (r.x < s.x ? 2 : 3) : r.y < s.y ? 1 : 0;
        if (!c.adviceReady) {
          c.adviceReady = true;
          c.advice = chiefAdvice(sim);
          c.waitUntil = sim.tick + ADVICE_WAIT;
          sim.emit({ type: 'advice', settlerId: s.id });
        }
        return;
      }
      const spot = besideRuler(sim, r, s);
      if (spot) {
        s.task = { kind: 'move', x: spot.x, y: spot.y };
        return;
      }
    }
  }
  // Observing: put idle hands to work, then walk over to someone to watch them.
  putToWork(sim, s);
  if (s.task || !sim.rng.chance(0.25)) return;
  const people = sim.settlers.filter((o) => o !== s && !o.ruler && !o.hidden && o.lifeStage === 'adult' && !o.military);
  if (!people.length) return;
  const who = people[sim.rng.int(people.length)];
  const x = Math.floor(who.x) + sim.rng.int(3) - 1;
  const y = Math.floor(who.y) + sim.rng.int(3) - 1;
  if (sim.walkable(x, y) && sim.world.explored(x, y)) s.task = { kind: 'move', x, y };
}

/** The chief while their "?" shows: advice ready and standing by the ruler. */
export function adviceShowing(sim: Simulation): Settler | null {
  if (!sim.chief.adviceReady) return null;
  const c = chiefOf(sim);
  const r = sim.ruler();
  if (!c || !r || c.hidden || r.hidden) return null;
  return Math.hypot(c.x - r.x, c.y - r.y) <= ADVICE_RANGE + 0.75 ? c : null;
}

/** The ruler clicks the "?" over the chief. */
export function hearAdvice(sim: Simulation): CommandResult {
  const chief = chiefOf(sim);
  const c = sim.chief;
  if (!chief || !c.adviceReady) return err(chief ? `${chief.name} has no advice just now — they will come to you when they do` : 'You have no Assistant Chief — train one at a Castle');
  c.adviceReady = false;
  c.nextAt = sim.tick + ADVICE_COOLDOWN;
  return ok(`${chief.name}: “${c.advice}”`);
}

/** What the chief suggests, most pressing first. */
export function chiefAdvice(sim: Simulation): string {
  return adviceList(sim)[0];
}

export function adviceList(sim: Simulation): string[] {
  const out: string[] = [];
  const people = sim.settlers.filter((s) => !s.hidden);
  const food = sim.storedTotal('food');
  if (food < people.length * 4) {
    out.push(`Our stores hold only ${food} food for ${people.length} mouths, my liege. Put more hands on the fields, mark berry bushes to pick, or send hunters out.`);
  }
  const cap = sim.totalCapacity();
  if (cap.capacity > 0 && cap.used >= cap.capacity * 0.95) out.push('The stores are nearly full. A storehouse would let our people keep harvesting.');
  const homeless = sim.settlers.filter((s) => s.homeId === null && !s.hidden).length;
  if (homeless > 0) out.push(`${homeless} of our people ${homeless === 1 ? 'has' : 'have'} no bed of their own. A house or cottage would serve them well.`);
  const idle = sim.settlers.filter(idleHands);
  if (idle.length >= 2) out.push(`${idle.length} people stand idle — ${idle[0].name} says: “${idle[0].idleReason}”. Mark trees or rocks to harvest, or give them a work area.`);
  const hall = campOf(sim);
  const lvl = hall && hall.type === 'townHall' ? levelOf(hall) : 0;
  if (lvl >= 2 && !hasMessenger(sim)) out.push('Train a messenger at the Town Hall: letters and news from other kingdoms would reach us twice as fast.');
  if (lvl >= 2 && !sim.settlers.some((s) => s.job === 'traveler')) out.push('Train a traveller at the Town Hall: they would explore beyond the fog and find new land for us.');
  const next = nextMilestone(sim);
  const def = next ? MILESTONES[next] : null;
  if (def && !def.future) {
    const req = def.requirements.map((q) => requirementProgress(sim, q)).find((q) => !q.done);
    if (req) out.push(`To grow into a ${def.name.toLowerCase()}, we still need to: ${req.label.charAt(0).toLowerCase()}${req.label.slice(1)} (${req.current}/${req.target}).`);
  }
  if (permanentBeds(sim) < people.length) out.push('More homes would let new families settle here.');
  out.push('All is in order, my liege. The people work well — perhaps plan the next great building.');
  return out;
}

/** People who could be sent to train (not children, soldiers or the ruler). */
export function canTrain(s: Settler): boolean {
  return !isChild(s) && !s.military && !s.ruler && s.awayOn === null;
}
