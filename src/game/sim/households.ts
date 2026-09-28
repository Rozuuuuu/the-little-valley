import { BUILDINGS } from '../data/buildings';
import { CHILD_ADULT_TICKS, CHILD_STABLE_TICKS, FAMILY_COOLDOWN, GROWTH_MIN_FOOD, GROWTH_STEP } from '../data/kingdomBalance';
import { DAY_TICKS } from '../core/constants';
import { bedsOf, bedUseCounts, entranceOf, findFreeBed, isPermanentHome } from './buildings';
import { localAvailable, settlementAt, settlementName } from './settlements';
import { MAX_POPULATION, type Simulation } from './Simulation';
import type { BedClaim, Building, CommandResult, Household, Settler } from './types';

// ---- people ---------------------------------------------------------------------

export function adults(sim: Simulation): Settler[] {
  return sim.settlers.filter((s) => s.lifeStage === 'adult');
}

export function children(sim: Simulation): Settler[] {
  return sim.settlers.filter((s) => s.lifeStage === 'child');
}

export function isChild(s: Settler): boolean {
  return s.lifeStage === 'child';
}

/** Whole game days until a child grows up. */
export function daysToAdult(s: Settler): number {
  return Math.max(0, Math.ceil((CHILD_ADULT_TICKS - s.ageTicks) / DAY_TICKS));
}

export function householdOf(sim: Simulation, s: Settler): Household | undefined {
  return s.householdId === null ? undefined : sim.households.find((h) => h.id === s.householdId);
}

/** People who will soon need a bed: settlers, expected children and travellers on their way. */
export function committedPopulation(sim: Simulation): number {
  let n = sim.settlers.length;
  for (const h of sim.households) if (h.pending) n++;
  for (const r of sim.recruits) if (r.state === 'travelling') n++;
  return n;
}

function days(ticks: number): string {
  const d = Math.max(1, Math.ceil(ticks / DAY_TICKS));
  return `${d} day${d === 1 ? '' : 's'}`;
}

// ---- bed claims ------------------------------------------------------------------

function settlementOfHome(sim: Simulation, b: Building): number | null {
  return settlementAt(sim, b.x + b.w / 2, b.y + b.h / 2)?.id ?? null;
}

/**
 * Holds a free bed in a permanent home of the given settlement, preferring
 * `prefer` (the family's own home). Returns the claim, or null if none is free.
 */
export function claimBed(sim: Simulation, owner: BedClaim['owner'], settlementId: number | null, prefer: number | null = null, permanentOnly = true): BedClaim | null {
  const counts = bedUseCounts(sim);
  let home: Building | null = null;
  const own = prefer !== null ? sim.buildings.get(prefer) : undefined;
  if (own && isPermanentHome(own) && (counts.get(own.id) ?? 0) < bedsOf(own)) home = own;
  if (!home) {
    const bed = findFreeBed(sim, counts, permanentOnly, settlementId);
    const multi = sim.settlements.length > 1;
    if (bed && (!multi || settlementId === null || settlementOfHome(sim, bed) === settlementId)) home = bed;
  }
  if (!home) return null;
  const claim: BedClaim = { id: sim.allocId(), homeId: home.id, owner };
  sim.bedClaims.push(claim);
  return claim;
}

export function releaseClaim(sim: Simulation, claimId: number | null): void {
  if (claimId === null) return;
  sim.bedClaims = sim.bedClaims.filter((c) => c.id !== claimId);
}

function ownerSettlement(sim: Simulation, claim: BedClaim): number | null {
  const id = claim.owner.id;
  if (claim.owner.kind === 'recruit') return sim.recruits.find((r) => r.id === id)?.settlementId ?? null;
  const h = sim.households.find((x) => x.id === id);
  return h ? sim.settler(h.adults[0])?.settlementId ?? null : null;
}

/** Points the owning transaction at a new claim id (or null when released). */
function setOwnerClaim(sim: Simulation, claim: BedClaim, claimId: number | null): void {
  const id = claim.owner.id;
  if (claim.owner.kind === 'recruit') {
    const r = sim.recruits.find((x) => x.id === id);
    if (r) r.claimId = claimId;
  } else {
    const h = sim.households.find((x) => x.id === id);
    if (h?.pending) h.pending.claimId = claimId;
  }
}

/**
 * A home with claims on it is going away: move each claim to another free
 * permanent bed in the same settlement, or release it (the owner then waits
 * for a bed). Call after the home is removed from sim.buildings.
 */
export function relocateClaims(sim: Simulation, homeId: number): void {
  const affected = sim.bedClaims.filter((c) => c.homeId === homeId);
  for (const c of affected) {
    sim.bedClaims = sim.bedClaims.filter((x) => x !== c);
    // Children need a real home; a traveller will take a camp bedroll.
    const next = claimBed(sim, c.owner, ownerSettlement(sim, c), null, c.owner.kind === 'birth');
    setOwnerClaim(sim, c, next?.id ?? null);
  }
}

/**
 * After loading: drop claims on missing, unfinished or temporary homes, claims
 * nobody owns, and claims beyond a home's beds (residents keep their beds).
 */
export function validateClaims(sim: Simulation): void {
  const used = new Map<number, number>();
  for (const s of sim.settlers) if (s.homeId !== null) used.set(s.homeId, (used.get(s.homeId) ?? 0) + 1);
  const kept: BedClaim[] = [];
  for (const c of sim.bedClaims) {
    const home = sim.buildings.get(c.homeId);
    const n = used.get(c.homeId) ?? 0;
    const owned = c.owner.kind === 'recruit'
      ? sim.recruits.some((r) => r.claimId === c.id && r.state === 'travelling')
      : sim.households.some((h) => h.pending?.claimId === c.id);
    const bedOk = c.owner.kind === 'recruit' ? !!home && bedsOf(home) > 0 : !!home && isPermanentHome(home);
    if (home && home.built && bedOk && owned && n < bedsOf(home)) {
      kept.push(c);
      used.set(c.homeId, n + 1);
    }
  }
  const keptIds = new Set(kept.map((c) => c.id));
  for (const h of sim.households) if (h.pending && h.pending.claimId !== null && !keptIds.has(h.pending.claimId)) h.pending.claimId = null;
  for (const r of sim.recruits) if (r.claimId !== null && !keptIds.has(r.claimId)) r.claimId = null;
  sim.bedClaims = kept;
}

// ---- commands --------------------------------------------------------------------

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

/** Moves a new couple into one home when some home has room for both. */
function moveInTogether(sim: Simulation, a: Settler, b: Settler): string {
  const counts = bedUseCounts(sim);
  const multi = sim.settlements.length > 1;
  const fits = (h: Building) => {
    if (!h.built || !isPermanentHome(h)) return false;
    if (multi && settlementOfHome(sim, h) !== a.settlementId) return false;
    const already = [a, b].filter((p) => p.homeId === h.id).length;
    return bedsOf(h) - (counts.get(h.id) ?? 0) + already >= 2;
  };
  if (a.homeId !== null && a.homeId === b.homeId) {
    const shared = sim.buildings.get(a.homeId);
    if (shared && isPermanentHome(shared)) return '';
  }
  // Their own homes first, then family homes, then any home.
  const own = [a.homeId, b.homeId].map((id) => (id !== null ? sim.buildings.get(id) : undefined)).filter((h): h is Building => !!h);
  const all = [...sim.buildings.values()];
  const home = [...own, ...all.filter((h) => h.type === 'familyHome'), ...all].find(fits);
  if (!home) return ' They will share a home once one has two free beds.';
  a.homeId = home.id;
  b.homeId = home.id;
  return ` They now live together in the ${BUILDINGS[home.type].name.toLowerCase()}.`;
}

export function formHousehold(sim: Simulation, ids: unknown): CommandResult {
  if (sim.growthMode !== 'deliberate') return err('Families need the deliberate growth rules — adopt them in the People panel first');
  if (!Array.isArray(ids) || ids.length !== 2) return err('Choose exactly two adults');
  if (ids[0] === ids[1]) return err('Choose two different adults');
  const a = sim.settler(ids[0] as number);
  const b = sim.settler(ids[1] as number);
  if (!a || !b) return err('Those settlers are not here any more');
  if (isChild(a) || isChild(b)) return err('Only adults can start a household — a child must grow up first');
  const taken = [a, b].find((s) => s.householdId !== null);
  if (taken) return err(`${taken.name} is already part of a household`);
  if (a.settlementId !== b.settlementId) return err(`${a.name} and ${b.name} live in different settlements — move one of them first`);
  const h: Household = { id: sim.allocId(), adults: [a.id, b.id], children: [], pending: null, cooldownUntil: 0 };
  sim.households.push(h);
  a.householdId = h.id;
  b.householdId = h.id;
  const where = moveInTogether(sim, a, b);
  sim.record('family', `${a.name} and ${b.name} started a household`, a.x, a.y);
  sim.emit({ type: 'fx', kind: 'hearts', x: a.x, y: a.y - 0.6 });
  sim.emit({ type: 'important' });
  return ok(`${a.name} and ${b.name} are now a household.${where}`, h.id);
}

export function requestChild(sim: Simulation, householdId: unknown): CommandResult {
  const h = sim.households.find((x) => x.id === householdId);
  if (!h) return err('That household is gone');
  if (h.pending) return err('This household is already expecting a child');
  if (sim.tick < h.cooldownUntil) return err(`This household needs to rest ${days(h.cooldownUntil - sim.tick)} more before another child`);
  if (committedPopulation(sim) >= MAX_POPULATION) return err(`The valley is at the simulation limit of ${MAX_POPULATION} people`);
  const a = sim.settler(h.adults[0]);
  const b = sim.settler(h.adults[1]);
  if (!a || !b) return err('Both parents need to be in the valley');
  if (a.settlementId !== b.settlementId) return err('The parents live in different settlements');
  const away = [a, b].find((p) => p.military?.state === 'deployed' || p.awayOn !== null);
  if (away) return err(`${away.name} is away with the army or a caravan — wait until they are home`);
  const food = localAvailable(sim, a.settlementId, 'food');
  if (food < GROWTH_MIN_FOOD) return err(`Not enough food: ${settlementName(sim, a.settlementId)} needs ${GROWTH_MIN_FOOD} food in its stores (${food} now)`);
  const claim = claimBed(sim, { kind: 'birth', id: h.id }, a.settlementId, a.homeId);
  if (!claim) {
    // Settlers in bedrolls move into new homes first, so say how many beds are really needed.
    const campers = sim.settlers.filter((s) => {
      const h = s.homeId !== null ? sim.buildings.get(s.homeId) : undefined;
      return !h || !isPermanentHome(h);
    }).length;
    const first = campers > 0 ? ` (${campers} settler${campers === 1 ? '' : 's'} still sleep in camp bedrolls and will take new beds first)` : '';
    return err(`No free bed for a child — build a family home or house in ${settlementName(sim, a.settlementId)}${first}`);
  }
  h.pending = { requestedTick: sim.tick, stableTicks: 0, claimId: claim.id, blocked: '' };
  const home = sim.buildings.get(claim.homeId)!;
  sim.emit({ type: 'important' });
  return ok(`${a.name} and ${b.name} are hoping for a child. A bed in the ${BUILDINGS[home.type].name.toLowerCase()} is set aside; the baby arrives after ${days(CHILD_STABLE_TICKS)} of steady food and shelter.`);
}

export function cancelChildRequest(sim: Simulation, householdId: unknown): CommandResult {
  const h = sim.households.find((x) => x.id === householdId);
  if (!h) return err('That household is gone');
  if (!h.pending) return err('This household is not expecting a child');
  releaseClaim(sim, h.pending.claimId);
  h.pending = null;
  return ok('The household has decided to wait. The bed is free again.');
}

export function adoptDeliberateGrowth(sim: Simulation): CommandResult {
  if (sim.growthMode === 'deliberate') return err('This valley already grows through families and travellers');
  sim.growthMode = 'deliberate';
  sim.nextVisitor = sim.tick;
  sim.record('family', 'Adopted deliberate growth: families and welcomed travellers');
  sim.emit({ type: 'important' });
  return ok('From now on newcomers only settle when you welcome a traveller, and households can ask for children. Everyone already here stays.');
}

// ---- update ----------------------------------------------------------------------

function birth(sim: Simulation, h: Household, a: Settler, b: Settler, claim: BedClaim): void {
  const home = sim.buildings.get(claim.homeId)!;
  releaseClaim(sim, claim.id);
  h.pending = null;
  const e = entranceOf(home);
  const kid = sim.addSettler(e.x, e.y, 'laborer', undefined, a.settlementId);
  // Children take after their parents.
  kid.appearance.skin = sim.rng.chance(0.5) ? a.appearance.skin : b.appearance.skin;
  kid.appearance.hair = sim.rng.chance(0.5) ? a.appearance.hair : b.appearance.hair;
  kid.lifeStage = 'child';
  kid.ageTicks = 0;
  kid.householdId = h.id;
  kid.homeId = home.id;
  h.children.push(kid.id);
  h.cooldownUntil = sim.tick + FAMILY_COOLDOWN;
  sim.stats.births++;
  sim.toast(`${a.name} and ${b.name} welcomed a baby, ${kid.name}!`, 'good');
  sim.record('birth', `${kid.name} was born to ${a.name} and ${b.name}`, kid.x, kid.y);
  sim.emit({ type: 'fx', kind: 'hearts', x: kid.x, y: kid.y - 0.6 });
  sim.emit({ type: 'sfx', name: 'arrival', x: kid.x, y: kid.y });
  sim.emit({ type: 'important' });
}

function updatePending(sim: Simulation, h: Household): void {
  const p = h.pending!;
  const a = sim.settler(h.adults[0]);
  const b = sim.settler(h.adults[1]);
  let blocked = '';
  if (!a || !b) blocked = 'Both parents need to be in the valley';
  else if (a.settlementId !== b.settlementId) blocked = 'The parents live in different settlements — move them back together';
  else if (a.military?.state === 'deployed' || b.military?.state === 'deployed') blocked = 'A parent is away with the army';
  else {
    if (p.claimId === null) p.claimId = claimBed(sim, { kind: 'birth', id: h.id }, a.settlementId, a.homeId)?.id ?? null;
    const food = localAvailable(sim, a.settlementId, 'food');
    if (p.claimId === null) blocked = `Waiting for a free bed in a permanent home in ${settlementName(sim, a.settlementId)}`;
    else if (food < GROWTH_MIN_FOOD) blocked = `Waiting for ${GROWTH_MIN_FOOD} food in ${settlementName(sim, a.settlementId)}'s stores (${food} now)`;
  }
  p.blocked = blocked;
  if (blocked) return;
  p.stableTicks += GROWTH_STEP;
  const claim = sim.bedClaims.find((c) => c.id === p.claimId);
  if (p.stableTicks >= CHILD_STABLE_TICKS && claim) birth(sim, h, a!, b!, claim);
}

/** Children age; pending children advance while conditions hold. Runs every GROWTH_STEP ticks. */
export function updateHouseholds(sim: Simulation): void {
  for (const s of sim.settlers) {
    if (s.lifeStage !== 'child') continue;
    s.ageTicks += GROWTH_STEP;
    if (s.ageTicks >= CHILD_ADULT_TICKS) {
      s.lifeStage = 'adult';
      s.ageTicks = 0;
      s.job = 'laborer';
      s.priorities = null;
      s.nextThink = 0;
      sim.toast(`${s.name} has grown up and is ready to work.`, 'good');
      sim.record('family', `${s.name} grew up`, s.x, s.y);
      sim.emit({ type: 'important' });
    }
  }
  for (const h of sim.households) if (h.pending) updatePending(sim, h);
}
