import { SPECIES } from '../data/animals';
import { BUILDINGS } from '../data/buildings';
import { HALL_LEVEL_NAMES, JOBS, type JobId } from '../data/jobs';
import { campOf } from './buildings';
import { levelOf } from './levels';
import { hallFor } from './roles';
import { abortTask } from './settlers';
import type { Simulation } from './Simulation';
import type { CommandResult, Settler } from './types';

/**
 * Warcraft-style unit orders for settlers: Stop (S), Hold (H), Attack (A — hunt an
 * animal), Return goods (C), plus the side job each person falls back on.
 */

const ok = (message?: string): CommandResult => ({ ok: true, message });
const err = (message: string): CommandResult => ({ ok: false, message });

/** How long Stop keeps someone still before they go back to their routine (4 seconds). */
export const STOP_TICKS = 40;
/** A direct hunt gives up when the quarry gets this far away. */
export const DIRECT_HUNT_RANGE = 40;

/** Roles that can be a side job: the working ones. */
export const SIDE_JOBS: JobId[] = ['laborer', 'farmer', 'gatherer', 'builder', 'hauler', 'crafter', 'hunter', 'herder'];

export function stop(sim: Simulation, list: Settler[]): CommandResult {
  for (const s of list) {
    abortTask(sim, s);
    s.focus = null;
    s.hold = false;
    s.idleReason = 'Stopped';
    s.stoppedUntil = sim.tick + STOP_TICKS;
  }
  return ok();
}

export function hold(sim: Simulation, list: Settler[]): CommandResult {
  for (const s of list) {
    abortTask(sim, s);
    s.focus = null;
    s.hold = true;
    s.idleReason = 'Holding position — give any order to release';
  }
  return ok(list.length === 1 ? `${list[0].name} holds position.` : `${list.length} people hold position.`);
}

/** Attack: hunt one wild animal, with whatever the hunter's lodge gives them (bare hands otherwise). */
export function huntAnimal(sim: Simulation, list: Settler[], animalId: unknown): CommandResult {
  const a = sim.animals.find((x) => x.id === animalId);
  if (!a) return err('That animal is gone');
  if (a.penId !== null) return err('That animal lives in a pen — herders cull pens when they are full');
  const sp = SPECIES[a.species];
  if (!sp.hunt) return err(`${sp.plural} can't be hunted`);
  const s = list.find((x) => !x.carrying) ?? list[0];
  if (s.carrying) return err(`${s.name} has full hands — Return goods (C) first`);
  if (a.huntedBy !== null && a.huntedBy !== s.id) {
    const other = sim.settler(a.huntedBy);
    if (other?.task?.kind === 'hunt') abortTask(sim, other);
    a.huntedBy = null;
  }
  abortTask(sim, s);
  s.focus = null;
  s.hold = false;
  const lodge = [...sim.buildings.values()].find((b) => BUILDINGS[b.type].hunting && b.workers.includes(s.id));
  a.huntedBy = s.id;
  sim.reserve(`hunt:${a.id}`, s.id);
  s.task = { kind: 'hunt', lodge: lodge?.id ?? null, direct: true, animal: a.id, stage: 'stalk', timer: 0, tx: Math.floor(a.x), ty: Math.floor(a.y) };
  s.idleReason = '';
  // Anyone else selected closes in to help.
  for (const o of list) {
    if (o === s || o.carrying) continue;
    abortTask(sim, o);
    o.hold = false;
    o.task = { kind: 'move', x: Math.floor(a.x), y: Math.floor(a.y) };
  }
  return ok(`${s.name} goes after the ${sp.name.toLowerCase()}${lodge ? '' : ' bare-handed'}.`);
}

export function returnGoods(sim: Simulation, list: Settler[]): CommandResult {
  const carriers = list.filter((s) => s.carrying);
  if (!carriers.length) return err(list.length === 1 ? `${list[0].name} isn't carrying anything` : 'Nobody selected is carrying anything');
  for (const s of carriers) {
    abortTask(sim, s);
    s.hold = false;
    s.task = { kind: 'deliver', target: null };
    s.idleReason = '';
  }
  return ok();
}

export function setSideJob(sim: Simulation, list: Settler[], job: JobId | null): CommandResult {
  if (job !== null) {
    if (!SIDE_JOBS.includes(job)) return err(`${JOBS[job].name} can only be a main job`);
    const hall = hallFor(sim, list[0]) ?? campOf(sim);
    const level = hall && hall.type === 'townHall' ? levelOf(hall) : 1;
    if (level < JOBS[job].hallLevel) return err(`${JOBS[job].name} work is taught at a ${HALL_LEVEL_NAMES[JOBS[job].hallLevel]} — upgrade the Town Hall first`);
    if (list.every((s) => s.job === job)) return err(`That is already their main job`);
  }
  for (const s of list) {
    s.sideJob = job === s.job ? null : job;
    s.nextThink = 0;
  }
  return ok(job ? `${list.length === 1 ? list[0].name : `${list.length} people`} will work as ${list.length === 1 ? 'a ' : ''}${JOBS[job].name}${list.length === 1 ? '' : 's'} whenever their main job has nothing to do.` : 'No side job: they help wherever they are needed.');
}
