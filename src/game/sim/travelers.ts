import {
  GROWTH_MIN_FOOD, OFFER_LIFETIME, RECRUIT_APPLES, RECRUIT_COOLDOWN, RECRUIT_TRAVEL_TICKS, VISITOR_INTERVAL,
} from '../data/kingdomBalance';
import { DAY_TICKS } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { addInv, invEntries } from './inventory';
import { bedUseCounts, findFreeBed, isPermanentHome } from './buildings';
import { claimBed, committedPopulation, releaseClaim } from './households';
import { arrivalSpot } from './population';
import { localAvailable, localStores, settlementName, settlementOfBuilding } from './settlements';
import { MAX_POPULATION, type Simulation } from './Simulation';
import type { CommandResult, Recruitment } from './types';

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

function days(ticks: number): string {
  const d = Math.max(1, Math.ceil(ticks / DAY_TICKS));
  return `${d} day${d === 1 ? '' : 's'}`;
}

/** Takes unreserved goods out of a settlement's stores. Returns how many were taken. */
function withdrawLocal(sim: Simulation, settlementId: number, res: ResourceId, amount: number): number {
  let left = amount;
  for (const b of localStores(sim, settlementId)) {
    if (left <= 0) break;
    const n = Math.min(left, Math.max(0, sim.available(b, res)));
    if (n > 0) {
      addInv(b.inventory, res, -n);
      left -= n;
    }
  }
  return amount - left;
}

/** Why a traveller can't be welcomed right now, or null if they can. */
export function recruitProblem(sim: Simulation, settlementId: number): string | null {
  if (sim.growthMode !== 'deliberate') return 'Adopt deliberate growth first (People panel)';
  if (sim.recruits.some((r) => r.state === 'travelling')) return 'A traveller is already on the way — one settles at a time';
  const wait = sim.lastRecruit + RECRUIT_COOLDOWN - sim.tick;
  if (wait > 0) return `The valley can welcome its next traveller in ${days(wait)}`;
  if (committedPopulation(sim) >= MAX_POPULATION) return `The valley is at the simulation limit of ${MAX_POPULATION} people`;
  const needs = recruitNeeds(sim, settlementId);
  return needs.length ? `${settlementName(sim, settlementId)} still needs ${needs.join(', ')}` : null;
}

/** Everything a settlement still lacks to welcome a traveller (empty when ready). */
export function recruitNeeds(sim: Simulation, settlementId: number): string[] {
  const out: string[] = [];
  const apples = localAvailable(sim, settlementId, 'apples');
  if (apples < RECRUIT_APPLES) out.push(`${RECRUIT_APPLES} apples in store (${apples} now — orchards grow them)`);
  const food = localAvailable(sim, settlementId, 'food');
  if (food < GROWTH_MIN_FOOD) out.push(`${GROWTH_MIN_FOOD} food in store (${food} now)`);
  const multi = sim.settlements.length > 1;
  const bed = findFreeBed(sim, bedUseCounts(sim), false, settlementId);
  if (!bed || (multi && settlementOfBuilding(sim, bed)?.id !== settlementId)) out.push('a free bed (build a house or family home)');
  return out;
}

/**
 * Welcomes the waiting traveller to a settlement. The bed is claimed and the
 * apples go into escrow in the same step, so repeated clicks, a second visitor
 * or a reload can never promise the same bed or spend the same apples twice.
 */
export function acceptRecruit(sim: Simulation, offerId: unknown, settlementId: unknown): CommandResult {
  const offer = sim.offer;
  if (!offer || offer.id !== offerId) return err('That traveller is no longer waiting');
  const st = sim.settlements.find((s) => s.id === settlementId);
  if (!st) return err('That settlement is gone');
  const problem = recruitProblem(sim, st.id);
  if (problem) return err(problem);
  const id = sim.allocId();
  // Real homes first; a free camp bedroll will do for a newcomer.
  const claim = claimBed(sim, { kind: 'recruit', id }, st.id, null, false);
  if (!claim) return err(`No free bed in ${st.name} — build a house or family home so the traveller has somewhere to sleep`);
  const taken = withdrawLocal(sim, st.id, 'apples', RECRUIT_APPLES);
  const r: Recruitment = {
    id, name: offer.name, appearance: { ...offer.appearance }, settlementId: st.id, claimId: claim.id,
    state: 'travelling', escrow: { apples: taken }, arrivesTick: sim.tick + RECRUIT_TRAVEL_TICKS, blocked: '',
  };
  sim.recruits.push(r);
  sim.offer = null;
  sim.nextVisitor = sim.tick + VISITOR_INTERVAL;
  const home = sim.buildings.get(claim.homeId)!;
  const bed = isPermanentHome(home) ? `a bed in the ${BUILDINGS[home.type].name.toLowerCase()}` : 'a camp bedroll';
  sim.emit({ type: 'important' });
  return ok(`${r.name} accepted ${RECRUIT_APPLES} apples and is fetching their things. They will settle in ${st.name} shortly, in ${bed}.`, id);
}

/** Calls off a traveller who hasn't arrived: the bed is freed and every apple goes back. */
export function cancelRecruit(sim: Simulation, recruitId: unknown): CommandResult {
  const r = sim.recruits.find((x) => x.id === recruitId);
  if (!r || r.state !== 'travelling') return err('That traveller is not on the way');
  releaseClaim(sim, r.claimId);
  r.claimId = null;
  r.state = 'refunding';
  r.blocked = '';
  refund(sim, r);
  return ok(`${r.name} will not settle after all. ${r.state === 'refunding' ? 'Their apples wait at the gate until the stores have room.' : 'The apples are back in storage.'}`);
}

/** Returns escrowed goods to the settlement's stores (anything that doesn't fit stays in escrow). */
function refund(sim: Simulation, r: Recruitment): void {
  const hall = sim.buildings.get(r.settlementId);
  const x = hall ? hall.x : 0;
  const y = hall ? hall.y : 0;
  for (const [res, n] of invEntries(r.escrow)) {
    const left = sim.depositAnywhere(res, n, x, y);
    addInv(r.escrow, res, -(n - left));
  }
  if (invEntries(r.escrow).length === 0) sim.recruits = sim.recruits.filter((q) => q !== r);
}

function arrive(sim: Simulation, r: Recruitment): void {
  if (r.claimId === null) {
    r.claimId = claimBed(sim, { kind: 'recruit', id: r.id }, r.settlementId, null, false)?.id ?? null;
    if (r.claimId === null) {
      r.blocked = `Waiting for a free bed in ${settlementName(sim, r.settlementId)}`;
      return;
    }
  }
  const claim = sim.bedClaims.find((c) => c.id === r.claimId);
  const home = claim ? sim.buildings.get(claim.homeId) : undefined;
  if (!claim || !home) {
    r.claimId = null;
    return;
  }
  const spot = arrivalSpot(sim, home);
  if (!spot) {
    r.blocked = 'Waiting for a clear path into the settlement';
    return;
  }
  releaseClaim(sim, claim.id);
  const s = sim.addSettler(spot.x, spot.y, 'laborer', r.name, r.settlementId);
  s.appearance = { ...r.appearance };
  s.homeId = home.id;
  // The welcome package is handed over and shared out.
  r.escrow = {};
  sim.recruits = sim.recruits.filter((q) => q !== r);
  sim.lastRecruit = sim.tick;
  sim.lastArrival = sim.tick;
  sim.stats.arrivals++;
  sim.toast(`${s.name} has settled in ${settlementName(sim, r.settlementId)}!`, 'good');
  sim.record('arrival', `${s.name} arrived`, s.x, s.y);
  sim.emit({ type: 'sfx', name: 'arrival', x: s.x, y: s.y });
  sim.emit({ type: 'fx', kind: 'hearts', x: s.x, y: s.y });
  sim.emit({ type: 'arrival', settlerId: s.id });
  sim.emit({ type: 'important' });
}

function newVisitor(sim: Simulation): void {
  const used = new Set([...sim.settlers.map((s) => s.name), ...sim.recruits.map((r) => r.name)]);
  let name = sim.pickName();
  for (let i = 0; i < 5 && used.has(name); i++) name = sim.pickName();
  sim.offer = { id: sim.allocId(), name, appearance: sim.randomAppearance(), arrivedTick: sim.tick, expiresTick: sim.tick + OFFER_LIFETIME };
  sim.toast(`A traveller, ${name}, is visiting. They would settle for ${RECRUIT_APPLES} apples — see the People panel.`, 'info');
  sim.emit({ type: 'important' });
}

/** Visitors come and go; accepted travellers walk in; cancelled ones get their apples back. */
export function updateTravelers(sim: Simulation): void {
  for (const r of [...sim.recruits]) {
    if (r.state === 'refunding') refund(sim, r);
    else if (sim.tick >= r.arrivesTick) arrive(sim, r);
  }
  if (sim.growthMode !== 'deliberate') return;
  if (sim.offer && sim.tick >= sim.offer.expiresTick) {
    sim.toast(`${sim.offer.name} could not stay any longer and moved on.`, 'info');
    sim.offer = null;
    sim.nextVisitor = sim.tick + VISITOR_INTERVAL;
  }
  if (!sim.offer && sim.tick >= sim.nextVisitor && committedPopulation(sim) < MAX_POPULATION) newVisitor(sim);
}
