import { DAY_TICKS } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { TREATIES } from '../data/treaties';
import { UNITS } from '../data/units';
import {
  ACTIVE_BUDGET, AI_WAR_DAYS, CAPTURE_RANGE, COMBAT_STEP, DAMAGE_RATE, MORALE_BREAK, OCCUPY_TICKS, REGROUP_TICKS, RIVAL_COMPANY_SOLDIERS, RIVAL_SUPPLY_DAYS, SIEGE_TICKS,
} from '../data/war';
import { T } from '../world/tiles';
import { activeTreaty, changeTrust, letterTicks, pairKey, refreshStance, stanceOf, trustOf } from './diplomacy';
import { releaseClaim } from './households';
import { invEntries } from './inventory';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from './kingdoms';
import { cartPosition } from './logistics';
import { MARCH_SPEED } from '../data/units';
import { playerCompanies, readyCompanies } from './military';
import { recordEvent, recordObservation } from './news';
import { abortTask } from './settlers';
import { canEnterTerritory, ownerOf, sectorKey, sectorOf } from './territory';
import type { Simulation } from './Simulation';
import type { ClaimSector, CommandResult, Company, Settler, TreatyOffer, WarState } from './types';

/**
 * Frontier war. Companies on the map fight only enemies they can reach: within
 * their range (archers further), with a clear line of sight for arrows, never
 * into or out of a protected homeland. Losing morale sends a company home to
 * regroup. Holding enemy frontier land unopposed occupies it, but legal title
 * only changes by peace. A town falls only when a supplied siege fills its
 * surrender meter; defenders arriving interrupt it. Under the default rules
 * beaten soldiers are captured and come home at peace; under full conquest
 * they can die, and everything about them is cleaned up.
 */

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

export function warState(sim: Simulation, a: number, b: number): WarState | undefined {
  return sim.warStates.get(pairKey(a, b));
}

function allCompanies(sim: Simulation): Company[] {
  const out: Company[] = [];
  for (const k of sim.kingdoms) for (const c of k.companies) out.push(c);
  return out;
}

function inField(c: Company): boolean {
  return c.state === 'deployed';
}

/** Soldiers in the field on every side (the shared budget). */
export function deployedSoldiers(sim: Simulation): number {
  let n = 0;
  for (const c of allCompanies(sim)) {
    if (c.state !== 'deployed' && c.state !== 'returning') continue;
    n += c.owner === PLAYER_KINGDOM ? (c.members ?? []).length : RIVAL_COMPANY_SOLDIERS;
  }
  return n;
}

function hostile(sim: Simulation, a: Company, b: Company): boolean {
  if (a.owner === b.owner) return false;
  if (sim.wars.has(pairKey(a.owner, b.owner))) return true;
  // Allied contingents fight the campaign's target.
  for (const c of [a, b]) {
    if (c.pledgedTo === null) continue;
    const cm = sim.commitments.find((x) => x.id === c.pledgedTo);
    if (!cm || cm.state !== 'active') continue;
    const plan = sim.warPlans.find((p) => p.id === cm.campaignId);
    const other = c === a ? b : a;
    if (plan && plan.target === other.owner) return true;
  }
  return false;
}

function protectedAt(sim: Simulation, x: number, y: number): boolean {
  return !!ownerOf(sim, sectorOf(x, y))?.protectedHomeland;
}

/** Arrows need a clear line: mountain faces and blocking buildings stop them. */
export function lineOfSight(sim: Simulation, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 1; i < steps; i++) {
    const x = Math.floor(x0 + ((x1 - x0) * i) / steps);
    const y = Math.floor(y0 + ((y1 - y0) * i) / steps);
    if (sim.world.terrain(x, y) === T.Mountain) return false;
    const b = sim.buildingAt(x, y);
    if (b && BUILDINGS[b.type].blocks) return false;
  }
  return true;
}

function strengthOf(sim: Simulation, c: Company): number {
  if (c.owner !== PLAYER_KINGDOM) return c.strength * ((c.readiness ?? 100) / 100);
  let n = 0;
  for (const id of c.members ?? []) {
    const m = sim.settler(id)?.military;
    if (m && m.state === 'deployed') n += UNITS[m.unit].strength;
  }
  return n * ((c.readiness ?? 100) / 100);
}

function rangeOf(c: Company): number {
  return UNITS[c.kind].range + 0.5;
}

// ---- rival companies in the field ----------------------------------------------------

/**
 * Sends a rival company at home into the field. With `place` it starts at the
 * target (for setting up scenes); otherwise it marches from its capital.
 * Returns null when there is no free company or the field is full.
 */
export function deployRival(sim: Simulation, kingdomId: number, target: { x: number; y: number }, place = false): Company | null {
  const k = kingdomById(sim, kingdomId);
  if (!k || k.player) return null;
  const c = k.companies.find((q) => q.pledgedTo === null && (q.state === undefined || q.state === 'home'));
  if (!c) return null;
  if (deployedSoldiers(sim) + RIVAL_COMPANY_SOLDIERS > ACTIVE_BUDGET) return null;
  const from = place ? target : k.capital ?? target;
  c.state = 'deployed';
  c.x = from.x + 0.5;
  c.y = from.y + 0.5;
  c.home = { x: (k.capital?.x ?? 0) + 0.5, y: (k.capital?.y ?? 0) + 0.5 };
  c.target = place ? null : { x: target.x + 0.5, y: target.y + 0.5 };
  c.health = 100;
  c.morale = 100;
  c.readiness = 100;
  c.supplies = RIVAL_SUPPLY_DAYS;
  c.suppliesDay = sim.day;
  return c;
}

/** Straight-line march for rival companies, stopping wherever they may not enter. */
function marchRival(sim: Simulation, c: Company): void {
  if (!c.target) return;
  const dx = c.target.x - (c.x ?? 0);
  const dy = c.target.y - (c.y ?? 0);
  const d = Math.hypot(dx, dy);
  if (d < 0.3) {
    c.target = null;
    if (c.state === 'returning') {
      c.state = 'home';
      c.health = 100;
      c.morale = 100;
    }
    return;
  }
  const v = Math.min(d, MARCH_SPEED);
  const nx = (c.x ?? 0) + (dx / d) * v;
  const ny = (c.y ?? 0) + (dy / d) * v;
  if (c.state === 'deployed') {
    const entry = canEnterTerritory(sim, c.owner, sectorOf(nx, ny), true);
    if (!entry.allowed) {
      c.target = null;
      return;
    }
  }
  c.x = nx;
  c.y = ny;
}

// ---- casualties -----------------------------------------------------------------------

/** Removes a settler for good (full conquest only), cleaning up every reference to them. */
export function removeSettler(sim: Simulation, s: Settler): void {
  abortTask(sim, s);
  sim.settlers = sim.settlers.filter((x) => x !== s);
  for (const k of sim.kingdoms) {
    for (const c of k.companies) if (c.members) c.members = c.members.filter((id) => id !== s.id);
    for (const post of Object.keys(k.council) as (keyof typeof k.council)[]) if (k.council[post] === s.id) k.council[post] = null;
  }
  for (const b of sim.buildings.values()) b.workers = b.workers.filter((id) => id !== s.id);
  for (const h of [...sim.households]) {
    h.children = h.children.filter((id) => id !== s.id);
    if (!h.adults.includes(s.id)) continue;
    if (h.pending) releaseClaim(sim, h.pending.claimId);
    for (const id of [...h.adults, ...h.children]) {
      const m = sim.settler(id);
      if (m) m.householdId = null;
    }
    sim.households = sim.households.filter((x) => x !== h);
  }
  if (s.military) sim.stats.gearLost += invEntries(s.military.gear).reduce((a, [, n]) => a + n, 0);
  sim.stats.soldiersLost++;
  sim.record('shortage', `${s.name} fell in battle`, s.x, s.y);
  sim.toast(`${s.name} fell in battle.`, 'warn');
}

function rout(sim: Simulation, c: Company, by: number): void {
  const mode = playerKingdom(sim).conflictMode;
  // A company that breaks with heavy losses leaves someone behind.
  const beaten = (c.health ?? 100) < 50;
  c.state = 'returning';
  c.target = c.home ? { ...c.home } : null;
  c.path = null;
  c.regroupUntil = sim.tick + REGROUP_TICKS;
  sim.stats.battles++;
  const ws = warState(sim, c.owner, by);
  if (ws) ws.routs[c.owner] = (ws.routs[c.owner] ?? 0) + 1;
  if (c.owner === PLAYER_KINGDOM) {
    if (beaten) {
      const members = (c.members ?? []).map((id) => sim.settler(id)).filter((x): x is Settler => !!x);
      const victim = members[sim.rng.int(Math.max(1, members.length))];
      if (victim) {
        if (mode === 'full-conquest') removeSettler(sim, victim);
        else {
          // Captured: held by the enemy until peace. Their gear is lost to them.
          c.members = (c.members ?? []).filter((id) => id !== victim.id);
          sim.stats.gearLost += invEntries(victim.military?.gear ?? {}).reduce((a, [, n]) => a + n, 0);
          victim.military = null;
          victim.captive = { by };
          victim.hidden = true;
          victim.task = null;
          sim.toast(`${victim.name} was captured. They will come home at peace.`, 'warn');
        }
      }
      if ((c.members ?? []).length === 0) {
        const k = playerKingdom(sim);
        k.companies = k.companies.filter((x) => x !== c);
        return;
      }
      c.health = 40;
    }
    sim.toast('A company broke off and is marching home.', 'warn');
  } else if ((c.health ?? 100) <= 0 && mode === 'full-conquest') {
    const k = kingdomById(sim, c.owner);
    if (k) k.companies = k.companies.filter((x) => x !== c);
    sim.stats.enemyLosses++;
  }
}

/** Companies holding or defending close on the nearest enemy within a sector's width (16 tiles). */
function engage(sim: Simulation, field: Company[]): void {
  for (const a of field) {
    if (a.target || (a.regroupUntil ?? 0) > sim.tick || a.state !== 'deployed') continue;
    let best: Company | null = null;
    let bestD = 16;
    for (const b of field) {
      if (a === b || !hostile(sim, a, b) || protectedAt(sim, b.x ?? 0, b.y ?? 0)) continue;
      const d = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
      if (d < bestD && d > rangeOf(a)) {
        best = b;
        bestD = d;
      }
    }
    if (!best) continue;
    a.target = { x: best.x ?? 0, y: best.y ?? 0 };
    a.path = null;
  }
}

/** One round of fighting between every pair of hostile companies in reach. */
export function updateCombat(sim: Simulation): void {
  const field = allCompanies(sim).filter(inField);
  if (field.length < 2) return;
  engage(sim, field);
  const hits = new Map<Company, { dmg: number; by: number }>();
  for (const a of field) {
    if ((a.regroupUntil ?? 0) > sim.tick) continue;
    // Protected land is never a firing platform.
    if (protectedAt(sim, a.x ?? 0, a.y ?? 0)) continue;
    let best: Company | null = null;
    let bestD = Infinity;
    for (const b of field) {
      if (a === b || !hostile(sim, a, b)) continue;
      if (protectedAt(sim, b.x ?? 0, b.y ?? 0)) continue;
      const d = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
      if (d > rangeOf(a) || d >= bestD) continue;
      if (rangeOf(a) > 2 && !lineOfSight(sim, a.x ?? 0, a.y ?? 0, b.x ?? 0, b.y ?? 0)) continue;
      best = b;
      bestD = d;
    }
    if (!best) continue;
    const dmg = strengthOf(sim, a) * DAMAGE_RATE * ((a.morale ?? 100) / 100) * (0.8 + sim.rng.next() * 0.4);
    const prev = hits.get(best);
    hits.set(best, { dmg: (prev?.dmg ?? 0) + dmg, by: a.owner });
    a.target = null;
  }
  for (const [c, h] of hits) {
    // Checked again as the blow lands: nothing is hurt inside a protected homeland.
    if (protectedAt(sim, c.x ?? 0, c.y ?? 0) || c.state !== 'deployed') continue;
    c.health = Math.max(0, (c.health ?? 100) - h.dmg);
    c.morale = Math.max(0, (c.morale ?? 100) - h.dmg * 1.2);
    if ((c.health ?? 0) <= 0 || (c.morale ?? 0) < MORALE_BREAK) rout(sim, c, h.by);
  }
}

// ---- occupation, sieges and plunder -------------------------------------------------------

function occupy(sim: Simulation, s: ClaimSector, by: number, legalOwner: number): void {
  const key = sectorKey(s);
  const existing = sim.claims.get(key);
  if (existing) existing.occupyingKingdom = by;
  else sim.claims.set(key, { legalOwner, occupyingKingdom: by, protectedHomeland: false });
  const ev = recordEvent(sim, 'conquest', by, 1, s);
  for (const k of sim.kingdoms) {
    if (k.id === by) continue;
    const near = k.capital ? Math.hypot(k.capital.x - s.x * 16, k.capital.y - s.y * 16) < 320 : false;
    if (k.id === legalOwner || near || (k.player && (stanceOf(sim, 0, by) === 'ally' || stanceOf(sim, 0, legalOwner) === 'ally'))) {
      recordObservation(sim, k.id, by, 'conquest', s, { eventId: ev.id, certainty: 'observed', source: k.id === legalOwner ? 'border' : 'scout', delay: k.id === legalOwner ? 0 : DAY_TICKS / 2 });
    }
  }
  if (legalOwner === PLAYER_KINGDOM || by === PLAYER_KINGDOM) {
    sim.toast(by === PLAYER_KINGDOM ? `Your soldiers now hold sector ${s.x},${s.y}. Title changes only by peace.` : `${kingdomById(sim, by)?.name} has occupied your land at sector ${s.x},${s.y}.`, by === PLAYER_KINGDOM ? 'good' : 'warn');
    sim.emit({ type: 'important' });
  }
}

function updateOccupation(sim: Simulation): void {
  const field = allCompanies(sim).filter(inField);
  const seen = new Set<string>();
  for (const c of field) {
    const s = sectorOf(c.x ?? 0, c.y ?? 0);
    const key = sectorKey(s);
    const o = ownerOf(sim, s);
    if (!o || o.legalOwner === c.owner || o.protectedHomeland || o.occupyingKingdom === c.owner) continue;
    if (!sim.wars.has(pairKey(c.owner, o.legalOwner))) continue;
    const contested = field.some((q) => q !== c && hostile(sim, c, q) && sectorKey(sectorOf(q.x ?? 0, q.y ?? 0)) === key);
    if (contested) {
      sim.occupationTimers.delete(key);
      continue;
    }
    seen.add(key);
    const t = sim.occupationTimers.get(key);
    if (!t || t.kingdom !== c.owner) sim.occupationTimers.set(key, { kingdom: c.owner, since: sim.tick });
    else if (sim.tick - t.since >= OCCUPY_TICKS) {
      occupy(sim, s, c.owner, o.legalOwner);
      sim.occupationTimers.delete(key);
    }
  }
  for (const k of [...sim.occupationTimers.keys()]) if (!seen.has(k)) sim.occupationTimers.delete(k);
}

export function siegeOf(sim: Simulation, kingdomId: number): { besieger: number; progress: number } | undefined {
  return sim.sieges.get(kingdomId);
}

/** Supplied soldiers holding an undefended town's approaches fill its surrender meter. */
function updateSieges(sim: Simulation, step: number): void {
  const rate = (100 / SIEGE_TICKS) * step;
  for (const k of sim.kingdoms) {
    if (k.player || !k.capital) continue;
    const cap = sectorOf(k.capital.x, k.capital.y);
    if (protectedAt(sim, k.capital.x, k.capital.y)) continue;
    const here = (c: Company) => {
      const s = sectorOf(c.x ?? 0, c.y ?? 0);
      return Math.max(Math.abs(s.x - cap.x), Math.abs(s.y - cap.y)) <= 1;
    };
    const besiegers = allCompanies(sim).filter((c) => inField(c) && here(c) && sim.wars.has(pairKey(c.owner, k.id)) && ((c.supplies ?? 0) > 0));
    const defended = k.companies.some((c) => (inField(c) && here(c)) || (c.pledgedTo === null && (c.state === undefined || c.state === 'home')));
    const cur = sim.sieges.get(k.id);
    if (besiegers.length && !defended) {
      const next = { besieger: besiegers[0].owner, progress: Math.min(100, (cur?.progress ?? 0) + rate) };
      sim.sieges.set(k.id, next);
      if (next.progress >= 100 && (cur?.progress ?? 0) < 100) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupy(sim, { x: cap.x + dx, y: cap.y + dy }, next.besieger, k.id);
        sim.record('milestone', `${k.name} surrendered to ${kingdomById(sim, next.besieger)?.name}`);
      }
    } else if (cur) {
      // Relief, retreat or empty supplies: the meter drains.
      cur.progress = Math.max(0, cur.progress - rate * 2);
      if (cur.progress === 0) sim.sieges.delete(k.id);
    }
  }
}

/** Enemy soldiers next to a cart seize its cargo; it is lost once and only once. */
function updatePlunder(sim: Simulation): void {
  for (const m of sim.manifests) {
    const total = invEntries(m.cargo).reduce((a, [, n]) => a + n, 0);
    if (!total) continue;
    const at = cartPosition(sim, m);
    const raider = allCompanies(sim).find((c) => inField(c) && sim.wars.has(pairKey(c.owner, PLAYER_KINGDOM)) && Math.hypot((c.x ?? 0) - at.x, (c.y ?? 0) - at.y) <= CAPTURE_RANGE);
    if (!raider) continue;
    m.cargo = {};
    sim.stats.cargoLost += total;
    sim.toast(`${kingdomById(sim, raider.owner)?.name} soldiers seized a caravan's ${total} goods.`, 'warn');
  }
}

function rivalSupplies(sim: Simulation): void {
  for (const k of sim.kingdoms) {
    if (k.player) continue;
    for (const c of k.companies) {
      if (!inField(c) || c.suppliesDay === sim.day) continue;
      c.suppliesDay = sim.day;
      c.supplies = Math.max(0, (c.supplies ?? 0) - 1);
      if (c.supplies <= 0) {
        c.state = 'returning';
        c.target = c.home ? { ...c.home } : null;
      }
    }
  }
}

// ---- AI at war ----------------------------------------------------------------------------

function exhaustion(sim: Simulation, ws: WarState, k: number): number {
  let occupied = 0;
  for (const c of sim.claims.values()) if (c.legalOwner === k && c.occupyingKingdom !== null && c.occupyingKingdom !== k) occupied++;
  return (ws.routs[k] ?? 0) * 10 + occupied * 15 + Math.floor((sim.tick - ws.startedTick) / DAY_TICKS) * 3;
}

/** How willing a kingdom at war is to make peace on these terms (used by aiVerdict for peace). */
export function peaceScore(sim: Simulation, o: TreatyOffer): { score: number; reasons: string[] } {
  const ws = warState(sim, o.proposer, o.recipient);
  const reasons: string[] = [];
  let score = trustOf(sim, o.recipient, o.proposer);
  if (ws) {
    const ex = exhaustion(sim, ws, o.recipient);
    score += ex;
    if (ex) reasons.push(`The war has cost us (${ex})`);
  }
  if (o.terms.payment) {
    score += o.terms.payment / 5;
    reasons.push(`Reparations of ${o.terms.payment} coins`);
  }
  const transfers = o.terms.transfers ?? [];
  if (transfers.length) {
    score -= transfers.length * 15;
    reasons.push(`Giving up ${transfers.length} sector${transfers.length === 1 ? '' : 's'} weighs against it`);
  }
  return { score, reasons };
}

function nearestTarget(sim: Simulation, k: number, enemy: number): { x: number; y: number } | null {
  const me = kingdomById(sim, k)!;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const consider = (s: ClaimSector) => {
    const x = s.x * 16 + 8;
    const y = s.y * 16 + 8;
    const d = Math.hypot(x - (me.capital?.x ?? 0), y - (me.capital?.y ?? 0));
    if (d < bestD && !protectedAt(sim, x, y)) {
      bestD = d;
      best = { x, y };
    }
  };
  for (const [key, c] of sim.claims) if (c.legalOwner === enemy) consider({ x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) });
  return best;
}

function aiWar(sim: Simulation, ws: WarState): void {
  for (const side of [ws.attacker, ws.defender]) {
    const k = kingdomById(sim, side);
    const enemy = side === ws.attacker ? ws.defender : ws.attacker;
    if (!k || k.player) continue;
    if (sim.truceUntil(side, enemy) > sim.tick) continue;
    if (sim.tick - (ws.lastDeploy[side] ?? -Infinity) < DAY_TICKS) continue;
    const target = nearestTarget(sim, side, enemy);
    if (!target) continue;
    if (deployRival(sim, side, target)) ws.lastDeploy[side] = sim.tick;
  }
}

/** Two AI kingdoms at war skirmish each day; land changes hands; in time they make peace. */
function aiVsAi(sim: Simulation, ws: WarState): void {
  if (sim.day === ws.lastSkirmishDay) return;
  ws.lastSkirmishDay = sim.day;
  const a = kingdomById(sim, ws.attacker)!;
  const b = kingdomById(sim, ws.defender)!;
  const power = (k: typeof a) => k.companies.length * (0.7 + sim.rng.next() * 0.6);
  const [win, lose] = power(a) >= power(b) ? [a, b] : [b, a];
  ws.routs[lose.id] = (ws.routs[lose.id] ?? 0) + 1;
  if (lose.capital) {
    const cap = sectorOf(lose.capital.x, lose.capital.y);
    const dir = Math.sign((win.capital?.x ?? 0) - lose.capital.x) || 1;
    const s = { x: cap.x + 2 * dir, y: cap.y };
    if (ownerOf(sim, s)?.occupyingKingdom !== win.id) occupy(sim, s, win.id, lose.id);
  }
  if (sim.tick - ws.startedTick >= AI_WAR_DAYS * DAY_TICKS) {
    // Peace: the land each side holds is handed over, and the war ends.
    for (const [key, c] of sim.claims) {
      if (c.occupyingKingdom === null) continue;
      if ((c.legalOwner === a.id && c.occupyingKingdom === b.id) || (c.legalOwner === b.id && c.occupyingKingdom === a.id)) {
        sim.claims.set(key, { legalOwner: c.occupyingKingdom, occupyingKingdom: null, protectedHomeland: false });
      }
    }
    endWar(sim, a.id, b.id);
    sim.record('settlement', `${a.name} and ${b.name} made peace`);
  }
}

function endWar(sim: Simulation, a: number, b: number): void {
  sim.wars.delete(pairKey(a, b));
  sim.warStates.delete(pairKey(a, b));
  refreshStance(sim, a, b);
  for (const k of [a, b]) {
    const kd = kingdomById(sim, k);
    for (const c of kd?.companies ?? []) {
      if (c.state === 'deployed') {
        c.state = 'returning';
        c.target = c.home ? { ...c.home } : null;
        c.path = null;
      }
    }
    if (kd && !kd.player) sim.sieges.delete(k);
  }
}

export function updateWar(sim: Simulation): void {
  for (const c of allCompanies(sim)) if (c.owner !== PLAYER_KINGDOM && (c.state === 'deployed' || c.state === 'returning')) marchRival(sim, c);
  if (sim.tick % COMBAT_STEP === 0) updateCombat(sim);
  if (sim.tick % 10 === 0) {
    updateSieges(sim, 10);
    updatePlunder(sim);
  }
  if (sim.tick % 50 === 0) {
    updateOccupation(sim);
    rivalSupplies(sim);
    for (const ws of [...sim.warStates.values()]) {
      const ai = !kingdomById(sim, ws.attacker)?.player && !kingdomById(sim, ws.defender)?.player;
      if (ai) aiVsAi(sim, ws);
      else aiWar(sim, ws);
    }
  }
}

// ---- declaring, launching and peace -------------------------------------------------------

export interface DeclarePreview {
  target: string;
  objective: string;
  breaches: string[];
  allies: { promised: number; arrived: number };
  supplyDays: number;
  exposed: { x: number; y: number }[];
  blockers: string[];
  theirAllies: string[];
}

export function declarePreview(sim: Simulation, target: number): DeclarePreview {
  const me = playerKingdom(sim);
  const t = kingdomById(sim, target);
  const breaches: string[] = [];
  for (const kind of ['nonAggression', 'truce', 'defensiveAlliance', 'passage', 'trade'] as const) {
    if (activeTreaty(sim, me.id, target, kind)) breaches.push(`${TREATIES[kind].name} with ${t?.name}`);
  }
  const blockers: string[] = [];
  if (!me.crowned) blockers.push('Crown your ruler first');
  if (!sim.progression.reached.includes('civilization')) blockers.push('War needs the Civilization milestone');
  if (!me.frontierActive) blockers.push('Open the frontier to conflict first (Realm → Crown → Land)');
  if (activeTreaty(sim, me.id, target, 'defensiveAlliance')) blockers.push(`${t?.name} is your ally`);
  const commitments = sim.commitments.filter((c) => sim.warPlans.find((p) => p.id === c.campaignId)?.target === target);
  const exposed: { x: number; y: number }[] = [];
  for (const [key, c] of sim.claims) if (c.legalOwner === me.id) exposed.push({ x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) });
  const theirAllies = sim.kingdoms.filter((k) => k.id !== target && !k.player && activeTreaty(sim, k.id, target, 'defensiveAlliance')).map((k) => k.name);
  return {
    target: t?.name ?? '?', objective: '', breaches,
    allies: { promised: commitments.filter((c) => ['accepted', 'assembling', 'enRoute'].includes(c.state)).length, arrived: commitments.filter((c) => c.state === 'arrived' || c.state === 'active').length },
    supplyDays: Math.floor(sim.storedTotal('food') / Math.max(1, readyCompanies(sim).reduce((n, c) => n + (c.members?.length ?? 0), 0))),
    exposed, blockers, theirAllies,
  };
}

export function declareWar(sim: Simulation, target: unknown, objective: unknown, confirmBreach: unknown): CommandResult {
  const t = kingdomById(sim, target as number);
  if (!t || t.player) return err('Choose a kingdom you know of');
  if (objective !== 'raid' && objective !== 'capture' && objective !== 'defend') return err('Choose a limited objective');
  const p = declarePreview(sim, t.id);
  if (p.blockers.length) return err(p.blockers.join('; '));
  if (sim.wars.has(pairKey(PLAYER_KINGDOM, t.id))) return err(`You are already at war with ${t.name}`);
  if (p.breaches.length && confirmBreach !== true) return err(`Declaring war would break: ${p.breaches.join(', ')}. Confirm to go ahead — others will hear of it.`);
  for (const o of sim.offers) {
    const pair = (o.proposer === 0 && o.recipient === t.id) || (o.proposer === t.id && o.recipient === 0);
    if (!pair || o.state !== 'active') continue;
    o.state = 'breached';
    changeTrust(sim, t.id, 0, -20);
  }
  sim.wars.add(pairKey(PLAYER_KINGDOM, t.id));
  sim.warStates.set(pairKey(PLAYER_KINGDOM, t.id), { attacker: 0, defender: t.id, objective, startedTick: sim.tick, planId: null, truceUntilTick: 0, routs: {}, lastDeploy: {}, lastSkirmishDay: 0 });
  refreshStance(sim, 0, t.id);
  changeTrust(sim, t.id, 0, -30);
  const ev = recordEvent(sim, 'war-declared', PLAYER_KINGDOM, 1, null);
  if (p.breaches.length) recordEvent(sim, 'treaty-broken', PLAYER_KINGDOM, 1, null);
  for (const k of sim.kingdoms) {
    if (k.player) continue;
    recordObservation(sim, k.id, PLAYER_KINGDOM, 'war-declared', null, { eventId: ev.id, certainty: 'confirmed', source: k.id === t.id ? 'herald' : 'envoy', delay: k.id === t.id ? 0 : letterTicks(sim, 0, k.id) });
  }
  // Their allies answer the call if they trust them enough.
  for (const k of sim.kingdoms) {
    if (k.player || k.id === t.id || !activeTreaty(sim, k.id, t.id, 'defensiveAlliance')) continue;
    if (trustOf(sim, k.id, t.id) >= 50) {
      sim.wars.add(pairKey(PLAYER_KINGDOM, k.id));
      sim.warStates.set(pairKey(PLAYER_KINGDOM, k.id), { attacker: k.id, defender: 0, objective: 'defend', startedTick: sim.tick, planId: null, truceUntilTick: 0, routs: {}, lastDeploy: {}, lastSkirmishDay: 0 });
      refreshStance(sim, 0, k.id);
      sim.toast(`${k.name} answers ${t.name}'s call for aid: they are at war with you too.`, 'warn');
    }
  }
  sim.record('milestone', `${me(sim)} declared war on ${t.name}`);
  sim.emit({ type: 'important' });
  return ok(`War with ${t.name}: objective ${objective}. Your homeland ${playerKingdom(sim).conflictMode === 'full-conquest' ? 'is not' : 'stays'} protected.`);
}

function me(sim: Simulation): string {
  return playerKingdom(sim).name;
}

/** Launches a mustered campaign: war (with confirmation), and arrived allies take the field. */
export function launchCampaign(sim: Simulation, planId: unknown, confirmBreach: unknown): CommandResult {
  const plan = sim.warPlans.find((p) => p.id === planId);
  if (!plan || plan.state !== 'mobilizing') return err('Muster the campaign first');
  if (!sim.wars.has(pairKey(PLAYER_KINGDOM, plan.target))) {
    const d = declareWar(sim, plan.target, plan.objective, confirmBreach);
    if (!d.ok) return d;
  }
  plan.state = 'launched';
  const ws = warState(sim, 0, plan.target);
  if (ws) ws.planId = plan.id;
  let arrived = 0;
  let missing = 0;
  for (const c of sim.commitments) {
    if (c.campaignId !== plan.id) continue;
    if (c.state === 'arrived') {
      c.state = 'active';
      arrived++;
      const ally = kingdomById(sim, c.contributor);
      for (const q of ally?.companies ?? []) {
        if (q.pledgedTo !== c.id) continue;
        const st = plan.staging ?? { x: 4, y: 0 };
        q.state = 'deployed';
        q.x = st.x * 16 + 8.5;
        q.y = st.y * 16 + 8.5;
        q.home = { x: (ally!.capital?.x ?? 0) + 0.5, y: (ally!.capital?.y ?? 0) + 0.5 };
        q.target = null;
        q.health = 100;
        q.morale = 100;
        q.readiness = 100;
        q.supplies = c.terms.serviceDays;
        q.suppliesDay = sim.day;
      }
    } else if (['accepted', 'assembling', 'enRoute'].includes(c.state)) missing++;
  }
  return ok(`Launched. ${arrived} allied contingent${arrived === 1 ? '' : 's'} in the field${missing ? `; ${missing} still on the way (they don't count until they arrive)` : ''}.`);
}

/** Applies an agreed peace: transfers, occupations lifted, captives home, allies paid in land or not. */
export function applyPeace(sim: Simulation, o: TreatyOffer): void {
  const a = o.proposer;
  const b = o.recipient;
  const toProposer = new Set((o.terms.transfers ?? []).map(sectorKey));
  // Land written into the peace changes hands; every other occupation between the two ends.
  for (const key of toProposer) sim.claims.set(key, { legalOwner: a, occupyingKingdom: null, protectedHomeland: false });
  for (const [key, c] of sim.claims) {
    if (toProposer.has(key) || c.occupyingKingdom === null) continue;
    const between = (c.legalOwner === a || c.legalOwner === b) && (c.occupyingKingdom === a || c.occupyingKingdom === b);
    if (between) sim.claims.set(key, { ...c, occupyingKingdom: null });
  }
  // Coalition rewards: land promised to allies that the peace delivers goes to them.
  for (const cm of sim.commitments) {
    const plan = sim.warPlans.find((p) => p.id === cm.campaignId);
    if (!plan || (plan.target !== a && plan.target !== b)) continue;
    for (const s of cm.terms.rewardSectors) {
      const key = sectorKey(s);
      if (toProposer.has(key) && a === PLAYER_KINGDOM) sim.claims.set(key, { legalOwner: cm.contributor, occupyingKingdom: null, protectedHomeland: false });
    }
    if (['active', 'arrived', 'assembling', 'enRoute', 'accepted'].includes(cm.state)) {
      cm.state = 'returning';
      cm.returnTick = sim.tick + letterTicks(sim, cm.contributor, PLAYER_KINGDOM);
      const ally = kingdomById(sim, cm.contributor);
      for (const q of ally?.companies ?? []) if (q.pledgedTo === cm.id && q.state === 'deployed') {
        q.state = 'returning';
        q.target = q.home ? { ...q.home } : null;
      }
    }
    if (plan.state === 'launched' || plan.state === 'mobilizing') plan.state = 'concluded';
  }
  // Captives come home.
  for (const s of sim.settlers) if (s.captive && (s.captive.by === a || s.captive.by === b)) {
    s.captive = null;
    s.hidden = false;
    s.nextThink = 0;
    const camp = sim.buildings.get(sim.settlements[0]?.id ?? -1);
    if (camp) {
      s.x = camp.x + 1.5;
      s.y = camp.y + camp.h + 0.5;
      s.px = s.x;
      s.py = s.y;
    }
  }
  endWar(sim, a, b);
  sim.record('milestone', `Peace between ${kingdomById(sim, a)?.name} and ${kingdomById(sim, b)?.name}`);
}

/** Rewards promised to allies that a peace proposal would leave unmet. */
export function unmetRewards(sim: Simulation, target: number, transfers: ClaimSector[]): { ally: number; sectors: ClaimSector[] }[] {
  const out: { ally: number; sectors: ClaimSector[] }[] = [];
  const got = new Set(transfers.map(sectorKey));
  for (const cm of sim.commitments) {
    const plan = sim.warPlans.find((p) => p.id === cm.campaignId);
    if (!plan || plan.target !== target || !['active', 'arrived', 'returning'].includes(cm.state)) continue;
    const missing = cm.terms.rewardSectors.filter((s) => !got.has(sectorKey(s)));
    if (missing.length) out.push({ ally: cm.contributor, sectors: missing });
  }
  return out;
}

/** Moves civilians out of a threatened settlement to another one. */
export function evacuate(sim: Simulation, from: unknown, to: unknown): CommandResult {
  const a = sim.settlements.find((s) => s.id === from);
  const b = sim.settlements.find((s) => s.id === to);
  if (!a || !b || a === b) return err('Choose two different settlements');
  const hall = sim.buildings.get(b.id);
  let n = 0;
  for (const s of sim.settlers) {
    if (s.settlementId !== a.id || s.military || s.awayOn !== null || s.captive) continue;
    abortTask(sim, s);
    s.settlementId = b.id;
    s.homeId = null;
    s.areaId = null;
    if (hall) s.task = { kind: 'move', x: hall.x + 1, y: hall.y + hall.h };
    n++;
  }
  sim.emit({ type: 'important' });
  return ok(`${n} people are leaving ${a.name} for ${b.name}.`);
}

export { playerCompanies };
