import { BUILDINGS, type BuildingId } from '../data/buildings';
import { MINERALS } from '../data/minerals';
import { RESOURCES, type Inventory, type ResourceId } from '../data/resources';
import { cellFromId, cellId, cellOf, depositInCell, type Deposit } from '../world/geology';
import { T } from '../world/tiles';
import { mayWorkAt } from './buildings';
import { invEntries } from './inventory';
import { canDo } from './priorities';
import { isChild } from './households';
import { abortTask } from './settlers';
import type { Simulation } from './Simulation';
import type { Building, CommandResult, Settler, Task } from './types';
import { workersOf } from './levels';

/** Work ticks for one survey at the spot. */
export const SURVEY_WORK = 60;

export interface KnownDeposit extends Deposit {
  remaining: number;
}

export interface SurveyedCell {
  cx: number;
  cy: number;
  deposit: KnownDeposit | null;
}

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

/** What surveying found in the cell holding (x, y), or null if nobody has surveyed it. */
export function surveyedCell(sim: Simulation, x: number, y: number): SurveyedCell | null {
  const { cx, cy } = cellOf(x, y);
  return knownCell(sim, cx, cy);
}

export function knownCell(sim: Simulation, cx: number, cy: number): SurveyedCell | null {
  const state = sim.geology.get(cellId(cx, cy));
  if (state === undefined) return null;
  const d = depositInCell(sim.seed, sim.world.genVersion, cx, cy, sim.world.habitat);
  return { cx, cy, deposit: d ? { ...d, remaining: state.remaining ?? d.initial } : null };
}

/** Every deposit found so far (for the map, inspectors and mine placement). */
export function knownDeposits(sim: Simulation): KnownDeposit[] {
  const out: KnownDeposit[] = [];
  for (const id of sim.geology.keys()) {
    const cx = Math.floor(id / 65536) - 32768;
    const cy = (id % 65536) - 32768;
    const c = knownCell(sim, cx, cy);
    if (c?.deposit) out.push(c.deposit);
  }
  return out;
}

export function describeCell(c: SurveyedCell): string {
  if (!c.deposit) return 'no workable ore';
  const m = MINERALS[c.deposit.mineral];
  return c.deposit.remaining > 0 ? `${m.name.toLowerCase()} (${c.deposit.remaining} ${RESOURCES[m.resource].name.toLowerCase()} left)` : `a worked-out ${m.name.toLowerCase()} seam`;
}

/** Sends an adult to survey the ground at (x, y). The whole 16×16 cell around it is surveyed. */
export function surveyDeposit(sim: Simulation, settlerId: unknown, x: unknown, y: unknown): CommandResult {
  const s = sim.settler(settlerId as number);
  if (!s) return err('Select a settler first');
  if (isChild(s)) return err(`${s.name} is a child — children can't survey until they grow up`);
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return err('Invalid location');
  if (!sim.world.explored(x, y)) return err('Explore this spot first');
  const known = surveyedCell(sim, x, y);
  if (known) return err(`Already surveyed: ${describeCell(known)}`);
  const { cx, cy } = cellOf(x, y);
  const busy = sim.settlers.find((o) => o.task?.kind === 'survey' && cellOf(o.task.x, o.task.y).cx === cx && cellOf(o.task.x, o.task.y).cy === cy);
  if (busy && busy !== s) return err(`${busy.name} is already surveying here`);
  abortTask(sim, s);
  s.focus = null;
  s.idleReason = '';
  s.task = { kind: 'survey', x, y, stage: 'walk', timer: 0 };
  return ok(`${s.name} is off to survey the ground.`);
}

/** Records a finished survey. Returns the plain-language result. */
export function completeSurvey(sim: Simulation, s: Settler, x: number, y: number): string {
  const { cx, cy } = cellOf(x, y);
  const id = cellId(cx, cy);
  if (!sim.geology.has(id)) {
    const d = depositInCell(sim.seed, sim.world.genVersion, cx, cy, sim.world.habitat);
    sim.geology.set(id, { remaining: d ? d.initial : null });
    sim.stats.surveys++;
  }
  const c = knownCell(sim, cx, cy)!;
  const found = describeCell(c);
  if (c.deposit) {
    const name = MINERALS[c.deposit.mineral].name.toLowerCase();
    sim.toast(`${s.name} found ${found}! Build a mine on the marked spot.`, 'good');
    sim.record('built', `Found ${name} ore`, c.deposit.x, c.deposit.y);
    sim.emit({ type: 'fx', kind: 'sparkle', x: c.deposit.x + 0.5, y: c.deposit.y + 0.5 });
  } else {
    sim.toast(`${s.name} surveyed the ground: no workable ore here.`, 'info');
  }
  sim.emit({ type: 'important' });
  return found;
}

// ---- extraction ---------------------------------------------------------------------

/** Ore a miner carries per trip at each shaft level. */
export const MINE_YIELD = [0, 2, 3, 4] as const;
/** Stone a quarry worker cuts per trip. */
export const QUARRY_YIELD = 3;
export const EXTRACT_WORK: Record<'quarry' | 'mine' | 'fish', number> = { quarry: 90, mine: 120, fish: 100 };
/** Fish a fisher lands per trip. */
export const FISH_YIELD = 3;
/** Materials to deepen a shaft to level 2 and 3, paid from storage at once. */
export const MINE_UPGRADES: Record<2 | 3, Inventory> = {
  2: { planks: 10, stone: 10 },
  3: { planks: 20, stone: 20, tools: 4 },
};
/** Stone cut per visible excavation stage of a quarry (4 stages). */
export const QUARRY_STAGE = 30;

export function quarryStage(b: Building): number {
  return Math.min(3, Math.floor((b.quarry?.extracted ?? 0) / QUARRY_STAGE));
}

/** A surveyed deposit whose tile lies inside the footprint, if any. */
export function depositUnder(sim: Simulation, x: number, y: number, w: number, h: number): KnownDeposit | null {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const d = surveyedCell(sim, x + dx, y + dy)?.deposit;
      if (d && d.x >= x && d.x < x + w && d.y >= y && d.y < y + h) return d;
    }
  }
  return null;
}

/** Why a quarry or mine can't go here (null when it can). */
export function siteProblem(sim: Simulation, type: BuildingId, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  if (def.site === 'rock') {
    let rocky = 0;
    for (let dy = 0; dy < def.size.h; dy++) {
      for (let dx = 0; dx < def.size.w; dx++) {
        const t = sim.world.terrain(x + dx, y + dy);
        if (t === T.Rocky || t === T.Hill) rocky++;
      }
    }
    return rocky * 2 >= def.size.w * def.size.h ? null : 'A quarry needs rocky ground or hill slopes under at least half of it';
  }
  if (def.site === 'shore') {
    // Some water must touch the footprint's edge.
    for (let dy = -1; dy <= def.size.h; dy++) {
      for (let dx = -1; dx <= def.size.w; dx++) {
        if (dx >= 0 && dx < def.size.w && dy >= 0 && dy < def.size.h) continue;
        const t = sim.world.terrain(x + dx, y + dy);
        if (t === T.Water || t === T.DeepWater) return null;
      }
    }
    return "A fisher's hut must stand on the shore, right beside water";
  }
  if (def.site === 'deposit') {
    const d = depositUnder(sim, x, y, def.size.w, def.size.h);
    if (!d) return 'Build a mine over a surveyed deposit — send a settler to survey rocky ground or hill faces first';
    if (d.remaining <= 0) return 'This seam is worked out';
    for (const b of sim.buildings.values()) if (b.mine?.depositId === d.id) return 'This deposit already has a mine';
  }
  return null;
}

/** Ore still undug and not promised to a miner on the way. */
export function oreAvailable(sim: Simulation, b: Building): number {
  if (!b.mine) return 0;
  const left = sim.geology.get(b.mine.depositId)?.remaining ?? 0;
  return left - (sim.oreReserved.get(b.mine.depositId) ?? 0);
}

export function mineDeposit(sim: Simulation, b: Building): KnownDeposit | null {
  if (!b.mine) return null;
  const { cx, cy } = cellFromId(b.mine.depositId);
  return knownCell(sim, cx, cy)?.deposit ?? null;
}

/** What a finished trip yields; the ore leaves the deposit here and nowhere else. */
export function completeExtraction(sim: Simulation, b: Building, amount: number): { res: ResourceId; amount: number } | null {
  if (BUILDINGS[b.type].extraction === 'fish') {
    sim.stats.foodGathered += amount;
    return { res: 'food', amount };
  }
  if (b.quarry) {
    b.quarry.extracted += amount;
    sim.stats.stoneQuarried += amount;
    return { res: 'stone', amount };
  }
  const d = mineDeposit(sim, b);
  const state = b.mine ? sim.geology.get(b.mine.depositId) : undefined;
  if (!b.mine || !d || !state) return null;
  const id = b.mine.depositId;
  sim.oreReserved.set(id, Math.max(0, (sim.oreReserved.get(id) ?? 0) - amount));
  const n = Math.min(amount, state.remaining ?? 0);
  state.remaining = (state.remaining ?? 0) - n;
  sim.stats.oreMined += n;
  if (state.remaining <= 0) {
    sim.toast(`The ${MINERALS[d.mineral].name.toLowerCase()} mine is worked out. Survey for another deposit.`, 'warn');
    sim.record('shortage', `A ${MINERALS[d.mineral].name.toLowerCase()} seam ran out`, b.x, b.y);
  }
  return n > 0 ? { res: MINERALS[d.mineral].resource, amount: n } : null;
}

/** Status line for a quarry or mine inspector. */
export function extractionStatus(sim: Simulation, b: Building): string {
  if (!b.built) return '';
  const name = BUILDINGS[b.type].name.toLowerCase();
  const digging = sim.settlers.filter((s) => s.task?.kind === 'extract' && s.task.site === b.id).length;
  if (BUILDINGS[b.type].extraction === 'fish') {
    if (digging) return `${digging} fishing from the jetty`;
    if (!sim.nearestStorageWithSpace(b.x, b.y, 'food')) return 'Storage is full — nowhere to put the catch';
    return b.workers.length > 0 || sim.settlers.some((s) => canDo(s, 'craft')) ? 'Waiting for a fisher' : `No worker — select a settler and right-click the ${name}`;
  }
  if (b.mine) {
    const d = mineDeposit(sim, b);
    if (!d) return 'No deposit here';
    if (d.remaining <= 0) return `Worked out — this ${MINERALS[d.mineral].name.toLowerCase()} seam is empty`;
    const head = `${d.remaining} ${RESOURCES[MINERALS[d.mineral].resource].name.toLowerCase()} left · shaft level ${b.mine.level}`;
    if (digging) return `${head} · ${digging} digging`;
  } else if (digging) return `${digging} cutting stone · pit stage ${quarryStage(b) + 1}/4`;
  if (!sim.nearestStorageWithSpace(b.x, b.y)) return 'Storage is full — nowhere to put what is dug';
  const anyone = b.workers.length > 0 || sim.settlers.some((s) => canDo(s, 'craft'));
  if (!anyone) return `No worker — select a settler and right-click the ${name}`;
  return b.mine ? `Waiting for a miner · shaft level ${b.mine.level}` : `Waiting for a worker · pit stage ${quarryStage(b) + 1}/4`;
}

/** Finds a dig for a settler at a quarry or mine they may work at. Reserves the slot and the ore. */
export function findExtract(sim: Simulation, s: Settler): Task | string | null {
  let reason: string | null = null;
  let best: { b: Building; slot: number; d: number } | null = null;
  for (const b of sim.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (!def.extraction || !b.built || !mayWorkAt(b, s.id)) continue;
    if (sim.isUnreachable(s.id, `b${b.id}`, s.x, s.y)) continue;
    if (b.mine && oreAvailable(sim, b) <= 0) {
      reason ??= (sim.geology.get(b.mine.depositId)?.remaining ?? 0) <= 0 ? 'The mine is worked out' : 'Other miners are digging the last ore';
      continue;
    }
    let slot = -1;
    for (let i = 0; i < Math.max(1, workersOf(b)) && slot < 0; i++) if (!sim.isReserved(`extract:${b.id}:${i}`, s.id)) slot = i;
    if (slot < 0) continue;
    const d = Math.hypot(b.x - s.x, b.y - s.y) - (b.workers.includes(s.id) ? 1000 : 0);
    if (!best || d < best.d) best = { b, slot, d };
  }
  if (!best) return reason;
  if (!sim.nearestStorageWithSpace(s.x, s.y)) return 'Storage is full — nowhere to put what I dig';
  const b = best.b;
  let amount: number = BUILDINGS[b.type].extraction === 'fish' ? FISH_YIELD : QUARRY_YIELD;
  if (b.mine) {
    amount = Math.min(MINE_YIELD[b.mine.level] ?? 2, oreAvailable(sim, b));
    sim.oreReserved.set(b.mine.depositId, (sim.oreReserved.get(b.mine.depositId) ?? 0) + amount);
  }
  sim.reserve(`extract:${b.id}:${best.slot}`, s.id);
  return { kind: 'extract', site: b.id, slot: best.slot, amount, stage: 'walk', timer: 0 };
}

/** Gives back what an unfinished dig had promised (the slot is released by the task). */
export function releaseExtraction(sim: Simulation, siteId: number, amount: number): void {
  const b = sim.buildings.get(siteId);
  if (!b?.mine || amount <= 0) return;
  const id = b.mine.depositId;
  sim.oreReserved.set(id, Math.max(0, (sim.oreReserved.get(id) ?? 0) - amount));
}

/** Deepens a mine's shaft, paying from storage at once (all or nothing). */
export function upgradeMine(sim: Simulation, buildingId: unknown): CommandResult {
  const b = sim.buildings.get(buildingId as number);
  if (!b?.mine || !b.built) return err('Only a finished mine can be deepened');
  if (b.mine.level >= 3) return err('The shaft is already at the deepest level');
  const next = (b.mine.level + 1) as 2 | 3;
  const cost = MINE_UPGRADES[next];
  const free = (r: ResourceId) => sim.storages().reduce((a, st) => a + Math.max(0, sim.available(st, r)), 0);
  const short = invEntries(cost).filter(([r, n]) => free(r) < n).map(([r, n]) => `${n - free(r)} more ${RESOURCES[r].name.toLowerCase()}`);
  if (short.length) return err(`Deepening the shaft needs ${short.join(', ')}`);
  for (const [r, n] of invEntries(cost)) sim.withdrawUnreserved(r, n);
  b.mine.level = next;
  sim.emit({ type: 'sfx', name: 'hammer', x: b.x + 1, y: b.y + 1 });
  sim.emit({ type: 'important' });
  return ok(`The shaft is now level ${next}: each trip brings up ${MINE_YIELD[next]} ore.`);
}
