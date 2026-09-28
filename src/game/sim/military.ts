import { DAY_TICKS } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { COUNCIL_POSTS } from '../data/kingdoms';
import { RESOURCES, type Inventory, type ResourceId } from '../data/resources';
import { COMPANY_SIZE, HORSE_FEED, HUNGRY_READINESS_LOSS, isUnitType, MARCH_SPEED, RATION, UNITS, type UnitType } from '../data/units';
import { entranceOf } from './buildings';
import { letterTicks, changeTrust } from './diplomacy';
import { isChild } from './households';
import { addInv, invEntries } from './inventory';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from './kingdoms';
import { dropCrate } from './logistics';
import { findPath } from './pathfinding';
import { abortTask } from './settlers';
import { canEnterTerritory, ownerOf, sectorOf } from './territory';
import type { Simulation } from './Simulation';
import type { Building, CommandResult, Company, Settler } from './types';
import { deployedSoldiers } from './combat';
import { ACTIVE_BUDGET } from '../data/war';
import { trainingSlotsOf } from './levels';

/**
 * The realm's soldiers. Recruits are real adults: their gear leaves the stores
 * the moment they enlist (so the last sword can't go to two people), their old
 * job and home are kept for when they return, and they drill at a barracks or
 * archery range until ready. Companies on the move carry food from the stores;
 * without it their readiness falls day by day and they come home. Nobody is
 * ever removed by hunger, and allied soldiers never join your population.
 */

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

/** Whether a store may hold a resource (horses need stalls; armories hold only equipment). */
export function storesResource(b: Building, res: ResourceId): boolean {
  const def = BUILDINGS[b.type];
  if (def.accepts) return def.accepts.includes(res);
  if (res === 'horses') return b.type === 'crate';
  return true;
}

export function playerCompanies(sim: Simulation): Company[] {
  return playerKingdom(sim).companies;
}

export function companyOf(sim: Simulation, s: Settler): Company | undefined {
  return s.military ? playerCompanies(sim).find((c) => c.id === s.military!.companyId) : undefined;
}

/** A company counts as an army once at least one member has finished training. */
export function readyCompanies(sim: Simulation): Company[] {
  return playerCompanies(sim).filter((c) => (c.members ?? []).some((id) => sim.settler(id)?.military?.state !== 'training'));
}

function companyStrength(sim: Simulation, c: Company): number {
  let n = 0;
  for (const id of c.members ?? []) {
    const m = sim.settler(id)?.military;
    if (m && m.state !== 'training') n += UNITS[m.unit].strength;
  }
  return Math.round(n * ((c.readiness ?? 100) / 100));
}

/** Takes gear for one recruit from unreserved stock, all or nothing. */
function takeGear(sim: Simulation, gear: Inventory): string | null {
  for (const [r, n] of invEntries(gear)) {
    const free = sim.storages().reduce((a, b) => a + Math.max(0, sim.available(b, r)), 0);
    if (free < n) return `Not enough ${RESOURCES[r].name.toLowerCase()} in store (${free}; needs ${n})`;
  }
  for (const [r, n] of invEntries(gear)) {
    let left = n;
    for (const b of sim.storages()) {
      const k = Math.min(left, Math.max(0, sim.available(b, r)));
      if (k > 0) {
        addInv(b.inventory, r, -k);
        left -= k;
      }
    }
  }
  return null;
}

/** Puts gear back: horses to stalls, the rest to any store (an armory first), anything left into a crate. */
function returnGear(sim: Simulation, gear: Inventory, at: { x: number; y: number }): void {
  const left: Inventory = {};
  const stores = sim.storages().sort((a, b) => Number(!!BUILDINGS[b.type].accepts) - Number(!!BUILDINGS[a.type].accepts));
  for (const [r, n] of invEntries(gear)) {
    let rest = n;
    for (const b of stores) {
      if (rest <= 0) break;
      if (!storesResource(b, r)) continue;
      rest -= sim.deposit(b, r, rest);
    }
    if (rest > 0) left[r] = rest;
  }
  dropCrate(sim, at, left);
}

export function enlist(sim: Simulation, ids: unknown, unit: unknown, buildingId: unknown): CommandResult {
  if (!isUnitType(unit)) return err('Unknown kind of soldier');
  const b = sim.buildings.get(buildingId as number);
  const def = b ? BUILDINGS[b.type] : undefined;
  if (!b || !b.built || !def?.training) return err('Choose a finished barracks or archery range');
  if (!def.training.units.includes(unit)) return err(`${UNITS[unit].name} don't train at the ${def.name.toLowerCase()}`);
  if (!Array.isArray(ids) || ids.length === 0) return err('Select adults to enlist');
  const people = ids.map((id) => sim.settler(id as number)).filter((s): s is Settler => !!s);
  const kid = people.find((s) => isChild(s));
  if (kid) return err(`${kid.name} is a child — only adults can enlist`);
  const counts = sim.settlers.filter((s) => s.military?.state === 'training' && s.military.buildingId === b.id).length;
  let slots = trainingSlotsOf(b) - counts;
  if (slots <= 0) return err(`The ${def.name.toLowerCase()} is full (${trainingSlotsOf(b)} in training)`);
  const done: string[] = [];
  let problem = '';
  for (const s of people) {
    if (s.ruler) {
      problem ||= `${s.name} is the ruler and does not enlist`;
      continue;
    }
    if (s.military) {
      problem ||= `${s.name} is already a soldier`;
      continue;
    }
    if (s.awayOn !== null) {
      problem ||= `${s.name} is away`;
      continue;
    }
    if (slots <= 0) {
      problem ||= 'the training yard is full';
      break;
    }
    const k = playerKingdom(sim);
    if (Object.values(k.council).includes(s.id)) {
      problem ||= `${s.name} serves on the council`;
      continue;
    }
    const missing = takeGear(sim, UNITS[unit].gear);
    if (missing) {
      problem ||= missing;
      break;
    }
    // Free them from civilian work; keep their home, household and old job.
    abortTask(sim, s);
    for (const w of sim.buildings.values()) w.workers = w.workers.filter((id) => id !== s.id);
    const company = joinCompany(sim, unit, b);
    s.military = { unit, state: 'training', trained: 0, buildingId: b.id, companyId: company.id, gear: { ...UNITS[unit].gear }, priorJob: s.job, priorPriorities: s.priorities ? [...s.priorities] : null, priorArea: s.areaId };
    s.areaId = null;
    s.focus = null;
    company.members!.push(s.id);
    slots--;
    done.push(s.name);
  }
  if (!done.length) return err(problem || 'Nobody could enlist');
  sim.emit({ type: 'important' });
  const of = ids.length > 1 ? ` (${done.length} of ${ids.length}${problem ? `: ${problem}` : ''})` : '';
  return ok(`${done.join(', ')} enlisted as ${UNITS[unit].name.toLowerCase()} and began drilling${of}.`);
}

function joinCompany(sim: Simulation, unit: UnitType, b: Building): Company {
  const k = playerKingdom(sim);
  const open = k.companies.find((c) => c.kind === unit && c.state !== 'deployed' && c.state !== 'returning' && (c.members?.length ?? 0) < COMPANY_SIZE);
  if (open) return open;
  const e = entranceOf(b);
  const c: Company = {
    id: sim.allocId(), kind: unit, strength: 0, pledgedTo: null, owner: PLAYER_KINGDOM, members: [], state: 'home',
    supplies: 0, readiness: 100, x: e.x + 0.5, y: e.y + 0.5, home: { x: e.x + 0.5, y: e.y + 0.5 }, target: null, path: null,
  };
  k.companies.push(c);
  return c;
}

function discharge(sim: Simulation, s: Settler, at: { x: number; y: number }): void {
  const m = s.military!;
  returnGear(sim, m.gear, at);
  s.job = m.priorJob;
  s.priorities = m.priorPriorities ? [...m.priorPriorities] : null;
  s.areaId = m.priorArea !== null && sim.area(m.priorArea) ? m.priorArea : null;
  s.military = null;
  s.task = null;
  s.hidden = false;
  s.nextThink = 0;
}

export function cancelTraining(sim: Simulation, settlerId: unknown): CommandResult {
  const s = sim.settler(settlerId as number);
  if (!s?.military || s.military.state !== 'training') return err('They are not in training');
  const c = companyOf(sim, s);
  const b = sim.buildings.get(s.military.buildingId);
  discharge(sim, s, b ? entranceOf(b) : { x: s.x, y: s.y });
  if (c) {
    c.members = (c.members ?? []).filter((id) => id !== s.id);
    if (c.members.length === 0) playerKingdom(sim).companies = playerKingdom(sim).companies.filter((x) => x !== c);
  }
  return ok(`${s.name} went back to being a ${s.job}; their gear is back in store.`);
}

export function demobilize(sim: Simulation, companyId: unknown): CommandResult {
  const k = playerKingdom(sim);
  const c = k.companies.find((x) => x.id === companyId);
  if (!c) return err('No such company');
  if (c.state === 'deployed' || c.state === 'returning') return err('Recall the company home before standing it down');
  for (const id of c.members ?? []) {
    const s = sim.settler(id);
    if (s?.military) discharge(sim, s, c.home ?? { x: s.x, y: s.y });
  }
  if (c.supplies) {
    sim.depositAnywhere('food', c.supplies, c.x ?? 0, c.y ?? 0);
    c.supplies = 0;
  }
  k.companies = k.companies.filter((x) => x !== c);
  sim.emit({ type: 'important' });
  return ok('The company stood down. Everyone returns to their old work and their gear goes back to store.');
}

/** Orders for a company: march to a spot (carrying food for some days), hold, or come home. */
export function orderCompany(sim: Simulation, companyId: unknown, order: unknown, x?: unknown, y?: unknown, supplyDays?: unknown): CommandResult {
  const c = playerCompanies(sim).find((q) => q.id === companyId);
  if (!c) return err('No such company');
  const ready = (c.members ?? []).filter((id) => sim.settler(id)?.military?.state !== 'training');
  if (!ready.length) return err('Nobody in this company has finished training');
  if (order === 'hold') {
    c.target = null;
    c.path = null;
    return ok('Holding position.');
  }
  if (order === 'retreat') {
    if (c.state === 'home') return ok('Already home.');
    c.state = 'returning';
    c.target = c.home ? { ...c.home } : null;
    c.path = null;
    return ok('Coming home.');
  }
  if (order !== 'move' && order !== 'defend') return err('Unknown order');
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return err('Choose a place');
  const entry = canEnterTerritory(sim, PLAYER_KINGDOM, sectorOf(x, y), true);
  if (!entry.allowed) return err(entry.reason);
  if (!sim.world.explored(x, y)) return err('Explore there first');
  const from = { x: Math.floor(c.x ?? 0), y: Math.floor(c.y ?? 0) };
  const path = findPath(sim, from.x, from.y, { x, y, w: 1, h: 1, adjacent: !sim.walkable(x, y) }, 60000);
  if (!path) return err('No way there on foot');
  if (c.state === 'home' && deployedSoldiers(sim) + ready.length > ACTIVE_BUDGET) return err(`The field is crowded (${ACTIVE_BUDGET} soldiers at most across every side) — wait for others to come home`);
  if (c.state === 'home') {
    const days = typeof supplyDays === 'number' && Number.isInteger(supplyDays) && supplyDays >= 1 ? supplyDays : 2;
    const food = ready.length * RATION * days;
    if (sim.storedTotal('food') < food) return err(`The company needs ${food} food for ${days} days (only ${sim.storedTotal('food')} in store)`);
    sim.withdrawUnreserved('food', food);
    c.supplies = food;
    c.readiness = 100;
    c.health = 100;
    c.morale = 100;
    for (const id of ready) {
      const s = sim.settler(id)!;
      abortTask(sim, s);
      s.military!.state = 'deployed';
      s.hidden = true;
    }
  }
  c.state = 'deployed';
  c.target = { x: x + 0.5, y: y + 0.5 };
  c.path = path;
  c.orders = order;
  c.suppliesDay = sim.day;
  return ok(`Marching with ${c.supplies} food.`);
}

function march(sim: Simulation, c: Company): void {
  if (!c.target) return;
  if (!c.path) {
    c.path = findPath(sim, Math.floor(c.x ?? 0), Math.floor(c.y ?? 0), { x: Math.floor(c.target.x), y: Math.floor(c.target.y), w: 1, h: 1, adjacent: false }, 60000) ?? [];
  }
  const next = c.path[0];
  if (!next) {
    c.x = c.target.x;
    c.y = c.target.y;
    arrive(sim, c);
    return;
  }
  // Checked at every step: soldiers never walk into land they may not enter.
  if (c.state === 'deployed' && !canEnterTerritory(sim, PLAYER_KINGDOM, sectorOf(next.x, next.y), true).allowed) {
    c.target = null;
    c.path = null;
    return;
  }
  const dx = next.x + 0.5 - (c.x ?? 0);
  const dy = next.y + 0.5 - (c.y ?? 0);
  const d = Math.hypot(dx, dy);
  const v = MARCH_SPEED * (0.5 + (c.readiness ?? 100) / 200);
  if (d <= v) {
    c.x = next.x + 0.5;
    c.y = next.y + 0.5;
    c.path.shift();
  } else {
    c.x = (c.x ?? 0) + (dx / d) * v;
    c.y = (c.y ?? 0) + (dy / d) * v;
  }
}

function arrive(sim: Simulation, c: Company): void {
  c.target = null;
  c.path = null;
  if (c.state !== 'returning') return;
  c.state = 'home';
  if (c.supplies) {
    sim.depositAnywhere('food', c.supplies, c.x ?? 0, c.y ?? 0);
    c.supplies = 0;
  }
  for (const id of c.members ?? []) {
    const s = sim.settler(id);
    if (!s?.military) continue;
    if (s.military.state === 'deployed') s.military.state = 'ready';
    s.hidden = false;
    s.x = (c.home?.x ?? s.x);
    s.y = (c.home?.y ?? s.y);
    s.px = s.x;
    s.py = s.y;
    s.nextThink = 0;
  }
  sim.toast('A company has come home.', 'info');
}

/** Rations once a day; hunger costs readiness and brings them home — never lives. */
function eat(sim: Simulation, c: Company): void {
  if (c.suppliesDay === sim.day) return;
  c.suppliesDay = sim.day;
  const mouths = (c.members ?? []).filter((id) => sim.settler(id)?.military?.state === 'deployed').length;
  const need = mouths * RATION;
  if ((c.supplies ?? 0) >= need) {
    c.supplies = (c.supplies ?? 0) - need;
    c.readiness = Math.min(100, (c.readiness ?? 100) + 5);
    return;
  }
  c.supplies = 0;
  c.readiness = Math.max(0, (c.readiness ?? 100) - HUNGRY_READINESS_LOSS);
  if (c.readiness <= 0 && c.state === 'deployed') {
    c.state = 'returning';
    c.target = c.home ? { ...c.home } : null;
    c.path = null;
    sim.toast('A company ran out of food and is marching home.', 'warn');
  } else sim.toast('A company is out of food: its readiness is falling.', 'warn');
}

function train(sim: Simulation): void {
  for (const s of sim.settlers) {
    const m = s.military;
    if (!m || m.state !== 'training') continue;
    if (m.trained >= UNITS[m.unit].trainTicks) {
      m.state = 'ready';
      sim.stats.soldiersTrained++;
      sim.toast(`${s.name} finished training as ${UNITS[m.unit].name.toLowerCase()}.`, 'good');
    }
  }
}

function feedHorses(sim: Simulation): void {
  if (sim.day === sim.horseDay) return;
  sim.horseDay = sim.day;
  let horses = sim.storedTotal('horses');
  for (const s of sim.settlers) horses += s.military?.gear.horses ?? 0;
  if (!horses) return;
  const fed = sim.withdrawUnreserved('food', horses * HORSE_FEED);
  sim.stats.horseFeed += fed;
  if (fed < horses * HORSE_FEED) sim.toast('The horses went hungry today — keep food in store.', 'warn');
}

// ---- allied contingents -------------------------------------------------------------

/** The staging ground: the player's own sector nearest the target. */
function stagingFor(sim: Simulation, targetId: number): { x: number; y: number } {
  const t = kingdomById(sim, targetId)?.capital ?? { x: 0, y: 0 };
  const me = playerKingdom(sim);
  const mine = [...(me.homeland ?? []), ...[...sim.claims.entries()].filter(([, c]) => c.legalOwner === me.id).map(([k]) => ({ x: Number(k.split(',')[0]), y: Number(k.split(',')[1]) }))];
  let best = { x: 0, y: 0 };
  let bestD = Infinity;
  for (const s of mine) {
    const d = Math.hypot(s.x * 16 + 8 - t.x, s.y * 16 + 8 - t.y);
    if (d < bestD) {
      bestD = d;
      best = { x: s.x, y: s.y };
    }
  }
  return best;
}

export function mobilizeCampaign(sim: Simulation, planId: unknown): CommandResult {
  const plan = sim.warPlans.find((p) => p.id === planId);
  if (!plan || plan.state !== 'drafting') return err('That plan is not open');
  if (!readyCompanies(sim).length) return err('Mustering needs an army: train at least one company first');
  const k = playerKingdom(sim);
  if (k.council.marshal === null && readyCompanies(sim).length === 0) return err(`Appoint a ${COUNCIL_POSTS.marshal.name}`);
  plan.state = 'mobilizing';
  plan.staging = stagingFor(sim, plan.target);
  let n = 0;
  for (const c of sim.commitments) {
    if (c.campaignId !== plan.id || c.state !== 'accepted') continue;
    c.state = 'assembling';
    c.arriveTick = sim.tick + DAY_TICKS / 4 + letterTicks(sim, c.contributor, PLAYER_KINGDOM);
    n++;
  }
  sim.emit({ type: 'important' });
  return ok(`Mustering at your sector ${plan.staging.x},${plan.staging.y}. ${n ? `${n} allied contingent${n === 1 ? ' is' : 's are'} assembling.` : 'No allies have agreed to come.'} Nothing marches until you launch.`);
}

function updateContingents(sim: Simulation): void {
  const me = playerKingdom(sim);
  for (const c of sim.commitments) {
    const ally = kingdomById(sim, c.contributor);
    if (!ally) continue;
    if (c.state === 'assembling' && sim.tick >= (c.arriveTick ?? 0) - letterTicks(sim, c.contributor, PLAYER_KINGDOM)) c.state = 'enRoute';
    if (c.state === 'enRoute' && sim.tick >= (c.arriveTick ?? 0)) {
      // Service begins on arrival at the staging ground, and the fee is earned.
      c.state = 'arrived';
      ally.treasury += c.escrow;
      c.escrow = 0;
      c.serviceEnds = sim.tick + c.terms.serviceDays * DAY_TICKS;
      c.supplyDay = sim.day;
      sim.toast(`${ally.name}'s soldiers have reached your staging ground.`, 'good');
      sim.emit({ type: 'important' });
    }
    if ((c.state === 'arrived' || c.state === 'active') && c.supplyDay !== sim.day) {
      c.supplyDay = sim.day;
      const food = Math.ceil(c.terms.companies.length * 4 * c.terms.requesterSupplyShare);
      const got = food ? sim.withdrawUnreserved('food', food) : 0;
      if (got < food) {
        c.supplyMissed = (c.supplyMissed ?? 0) + 1;
        if (c.supplyMissed >= 2) {
          // After a day's grace, an unpaid supply share is a broken promise: they go home.
          c.state = 'returning';
          c.reasons.push('You did not supply their soldiers as agreed');
          changeTrust(sim, ally.id, me.id, -15);
          c.returnTick = sim.tick + letterTicks(sim, c.contributor, PLAYER_KINGDOM);
          sim.toast(`${ally.name} is withdrawing: you did not feed their soldiers as agreed.`, 'warn');
        } else sim.toast(`${ally.name}'s soldiers went unfed today — one more day and they leave.`, 'warn');
      } else c.supplyMissed = 0;
    }
    if ((c.state === 'arrived' || c.state === 'active') && sim.tick >= (c.serviceEnds ?? Infinity)) {
      c.state = 'returning';
      c.returnTick = sim.tick + letterTicks(sim, c.contributor, PLAYER_KINGDOM);
    }
    if (c.state === 'returning' && sim.tick >= (c.returnTick ?? 0)) {
      c.state = 'fulfilled';
      for (const q of ally.companies) if (q.pledgedTo === c.id) q.pledgedTo = null;
    }
  }
}

export function updateMilitary(sim: Simulation): void {
  train(sim);
  feedHorses(sim);
  for (const c of playerCompanies(sim)) {
    c.strength = companyStrength(sim, c);
    if (c.state === 'deployed' || c.state === 'returning') {
      eat(sim, c);
      march(sim, c);
    }
  }
  updateContingents(sim);
}

/** Drill progress for a recruit at their training ground (called from their task). */
export function drill(sim: Simulation, s: Settler, amount: number): void {
  if (s.military?.state === 'training') s.military.trained += amount;
  void sim;
}

/** Describes where the land under a company belongs (for its inspector). */
export function companyWhere(sim: Simulation, c: Company): string {
  const o = ownerOf(sim, sectorOf(c.x ?? 0, c.y ?? 0));
  return o ? `in ${kingdomById(sim, o.legalOwner)?.name ?? 'someone'}'s land` : 'in unclaimed land';
}
