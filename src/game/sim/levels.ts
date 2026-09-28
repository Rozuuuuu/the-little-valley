import { BUILDINGS, type LevelDef } from '../data/buildings';
import { MILESTONES } from '../data/progression';
import { RESOURCES, type Inventory } from '../data/resources';
import { addInv, invEntries } from './inventory';
import { dropCrate } from './logistics';
import { rebuildAs, roomToGrow } from './buildings';
import type { Simulation } from './Simulation';
import type { Building, CommandResult } from './types';

/**
 * Building levels, Warcraft-style: an upgrade is paid in full up front, then
 * finishes on a timer while the building keeps working. Cancelling returns
 * everything paid. Stats a level leaves out carry over from the level below.
 */

export function levelOf(b: Building): number {
  return b.level ?? 1;
}

export function levelsOf(b: Building): LevelDef[] | undefined {
  return BUILDINGS[b.type].levels;
}

export function levelName(b: Building): string {
  return levelsOf(b)?.[levelOf(b) - 1]?.name ?? BUILDINGS[b.type].name;
}

/** The value of a stat at the building's level, or the building's own value. */
function stat<K extends 'housing' | 'storage' | 'maxWorkers' | 'lodging' | 'speed' | 'light' | 'reveal' | 'trainingSlots'>(b: Building, key: K): number | undefined {
  const levels = levelsOf(b);
  if (levels) {
    for (let i = Math.min(levelOf(b), levels.length) - 1; i >= 0; i--) {
      const v = levels[i][key];
      if (v !== undefined) return v;
    }
  }
  if (key === 'speed') return undefined;
  if (key === 'trainingSlots') return BUILDINGS[b.type].training?.slots;
  return BUILDINGS[b.type][key as 'housing' | 'storage' | 'maxWorkers' | 'lodging' | 'light' | 'reveal'];
}

export const housingOf = (b: Building): number => stat(b, 'housing') ?? 0;
export const storageOf = (b: Building): number => stat(b, 'storage') ?? 0;
export const workersOf = (b: Building): number => stat(b, 'maxWorkers') ?? 0;
export const lodgingOf = (b: Building): number => stat(b, 'lodging') ?? 0;
export const lightOf = (b: Building): number => stat(b, 'light') ?? 0;
export const revealOf = (b: Building): number => stat(b, 'reveal') ?? 0;
export const trainingSlotsOf = (b: Building): number => stat(b, 'trainingSlots') ?? 0;
/** Work speed multiplier for crafting and digging here. */
export const speedOf = (b: Building): number => stat(b, 'speed') ?? 1;

/** The next level, if there is one. */
export function nextLevel(b: Building): LevelDef | null {
  return levelsOf(b)?.[levelOf(b)] ?? null;
}

function shortfall(sim: Simulation, cost: Inventory): string | null {
  const short = invEntries(cost)
    .map(([r, n]) => [r, n - Math.max(0, sim.storedTotal(r) - reservedTotal(sim, r))] as const)
    .filter(([, n]) => n > 0);
  return short.length ? short.map(([r, n]) => `${n} more ${RESOURCES[r].name.toLowerCase()}`).join(', ') : null;
}

function reservedTotal(sim: Simulation, res: keyof Inventory): number {
  let n = 0;
  for (const b of sim.storages()) n += b.reservedOut[res] ?? 0;
  return n;
}

/** Why this building can't start an upgrade now, or null if it can. */
export function upgradeProblem(sim: Simulation, b: Building): string | null {
  const def = BUILDINGS[b.type];
  if (!def.levels) return `The ${def.name.toLowerCase()} has no upgrades`;
  if (!b.built) return 'Finish building it first';
  if (b.upgrade) return 'Already upgrading';
  const next = nextLevel(b);
  if (!next) return `The ${levelName(b)} is already at its highest level`;
  if (next.requires && !sim.progression.reached.includes(next.requires)) return `${next.name} needs ${MILESTONES[next.requires].name}`;
  if (next.becomes) {
    const room = roomToGrow(sim, b, next.becomes);
    if (room) return room;
  }
  const short = shortfall(sim, next.cost);
  return short ? `Not enough in storage: ${short}` : null;
}

export function startUpgrade(sim: Simulation, b: Building): CommandResult {
  const problem = upgradeProblem(sim, b);
  if (problem) return { ok: false, message: problem };
  const next = nextLevel(b)!;
  const paid: Inventory = {};
  for (const [r, n] of invEntries(next.cost)) addInv(paid, r, sim.withdrawUnreserved(r, n));
  b.upgrade = { to: levelOf(b) + 1, progress: 0, paid };
  sim.upgrading.add(b.id);
  sim.emit({ type: 'important' });
  return { ok: true, message: `Upgrading to ${next.name}. It keeps working meanwhile.` };
}

export function cancelUpgrade(sim: Simulation, b: Building): CommandResult {
  if (!b.upgrade) return { ok: false, message: 'Nothing is being upgraded here' };
  const left: Inventory = {};
  for (const [r, n] of invEntries(b.upgrade.paid)) {
    // depositAnywhere returns what did not fit.
    const rest = sim.depositAnywhere(r, n, b.x + b.w / 2, b.y + b.h / 2);
    if (rest > 0) left[r] = rest;
  }
  // Whatever the stores can't hold waits in a crate beside it, never lost.
  dropCrate(sim, { x: b.x + b.w, y: b.y + b.h }, left);
  b.upgrade = undefined;
  sim.upgrading.delete(b.id);
  sim.emit({ type: 'important' });
  return { ok: true, message: 'Upgrade cancelled; everything paid is back.' };
}

/** Advances every upgrade by one tick. */
export function updateUpgrades(sim: Simulation): void {
  for (const id of sim.upgrading) {
    const b = sim.buildings.get(id);
    const up = b?.upgrade;
    const lv = b && up ? levelsOf(b)?.[up.to - 1] : undefined;
    if (!b || !up || !lv) {
      if (b) b.upgrade = undefined;
      sim.upgrading.delete(id);
      continue;
    }
    up.progress++;
    if (up.progress < lv.time) continue;
    const from = BUILDINGS[b.type].name.toLowerCase();
    b.upgrade = undefined;
    sim.upgrading.delete(id);
    if (lv.becomes) {
      if (roomToGrow(sim, b, lv.becomes)) {
        // Something was built in the way meanwhile: refund rather than overlap it.
        b.upgrade = { ...up };
        sim.upgrading.add(id);
        cancelUpgrade(sim, b);
        sim.toast(`The ${lv.name} could not be raised: something now stands where it would grow. Everything paid is back.`, 'warn');
        continue;
      }
      rebuildAs(sim, b, lv.becomes);
    } else b.level = up.to;
    const r = revealOf(b);
    if (r) sim.world.reveal(b.x + b.w / 2, b.y + b.h / 2, r);
    sim.toast(`The ${from} is now a ${lv.name}: ${lv.perks.join(', ')}.`, 'good');
    sim.record('built', `Upgraded a ${from} to a ${lv.name}`, b.x, b.y);
    sim.emit({ type: 'sfx', name: 'complete', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    sim.emit({ type: 'important' });
    sim.wakeIdle();
  }
}
