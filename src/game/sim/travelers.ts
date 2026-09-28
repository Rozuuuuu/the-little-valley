import {
  GROWTH_MIN_FOOD, OFFER_LIFETIME, RECRUIT_FOOD, RECRUIT_COOLDOWN, RECRUIT_TRAVEL_TICKS, VISITOR_INTERVAL,
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
import type { Building, CommandResult, Party, Recruitment } from './types';
import { entranceOf } from './buildings';
import { findPath } from './pathfinding';
import { isResourceId, RESOURCES, type Inventory } from '../data/resources';
import { buyPrice, MERCHANT_GOODS, MERCHANT_ORES, sellPrice } from '../data/trade';
import { direction, nearbyTowns, regionById, ROAD_SPEED } from '../world/regions';
import { knowKingdomOf, playerKingdom } from './kingdoms';
import { merchantBringsNews, merchantCarriesNews } from './diplomacy';
import { storesResource } from './military';
import { MERCHANT_PURSE, POLICIES, TRUST_MIN_RECRUIT } from '../data/kingdoms';

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
  const trust = playerKingdom(sim).trust;
  if (trust < TRUST_MIN_RECRUIT) return `Travellers have heard the realm taxes harshly (trust ${trust}/100) — lower taxes to rebuild trust`;
  const needs = recruitNeeds(sim, settlementId);
  return needs.length ? `${settlementName(sim, settlementId)} still needs ${needs.join(', ')}` : null;
}

/** Everything a settlement still lacks to welcome a traveller (empty when ready). */
export function recruitNeeds(sim: Simulation, settlementId: number): string[] {
  const out: string[] = [];
  const food = localAvailable(sim, settlementId, 'food');
  const need = RECRUIT_FOOD + GROWTH_MIN_FOOD;
  if (food < need) out.push(`${need} food in store: ${RECRUIT_FOOD} to welcome them and ${GROWTH_MIN_FOOD} to keep (${food} now)`);
  const multi = sim.settlements.length > 1;
  const bed = findFreeBed(sim, bedUseCounts(sim), false, settlementId);
  if (!bed || (multi && settlementOfBuilding(sim, bed)?.id !== settlementId)) out.push('a free bed (build a house or family home)');
  return out;
}

/**
 * Welcomes the waiting traveller to a settlement. The bed is claimed and the
 * food goes into escrow in the same step, so repeated clicks, a second visitor
 * or a reload can never promise the same bed or spend the same food twice.
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
  const taken = withdrawLocal(sim, st.id, 'food', RECRUIT_FOOD);
  const r: Recruitment = {
    id, name: offer.name, appearance: { ...offer.appearance }, settlementId: st.id, claimId: claim.id,
    state: 'travelling', escrow: { food: taken }, arrivesTick: sim.tick + RECRUIT_TRAVEL_TICKS, blocked: '',
  };
  sim.recruits.push(r);
  sim.offer = null;
  sim.nextVisitor = sim.tick + visitorInterval(sim);
  const home = sim.buildings.get(claim.homeId)!;
  const bed = isPermanentHome(home) ? `a bed in the ${BUILDINGS[home.type].name.toLowerCase()}` : 'a camp bedroll';
  sim.emit({ type: 'important' });
  return ok(`${r.name} accepted ${RECRUIT_FOOD} food and is fetching their things. They will settle in ${st.name} shortly, in ${bed}.`, id);
}

/** Calls off a traveller who hasn't arrived: the bed is freed and all the food goes back. */
export function cancelRecruit(sim: Simulation, recruitId: unknown): CommandResult {
  const r = sim.recruits.find((x) => x.id === recruitId);
  if (!r || r.state !== 'travelling') return err('That traveller is not on the way');
  releaseClaim(sim, r.claimId);
  r.claimId = null;
  r.state = 'refunding';
  r.blocked = '';
  refund(sim, r);
  return ok(`${r.name} will not settle after all. ${r.state === 'refunding' ? 'Their welcome food waits at the gate until the stores have room.' : 'The food is back in storage.'}`);
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
  sim.toast(`A traveller, ${name}, is visiting. They would settle for ${RECRUIT_FOOD} food — see the People panel.`, 'info');
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
    sim.nextVisitor = sim.tick + visitorInterval(sim);
  }
  if (!sim.offer && sim.tick >= sim.nextVisitor && committedPopulation(sim) < MAX_POPULATION) newVisitor(sim);
}

// ---- merchants -----------------------------------------------------------------------

/** How often would-be settlers come by: twice as often once an inn stands. */
export function visitorInterval(sim: Simulation): number {
  const inn = [...sim.buildings.values()].some((b) => b.built && BUILDINGS[b.type].lodging);
  return inn ? VISITOR_INTERVAL / 2 : VISITOR_INTERVAL;
}

/** Merchants set off this often while an inn stands. */
export const MERCHANT_INTERVAL = 2 * DAY_TICKS;
/** A merchant lodges this long. */
export const MERCHANT_STAY = DAY_TICKS;
/** Walking speed on the map (tiles per tick). */
const WALK = 0.18;

function innOf(sim: Simulation, id?: number): Building | undefined {
  if (id !== undefined) {
    const b = sim.buildings.get(id);
    if (b && b.built && BUILDINGS[b.type].lodging) return b;
  }
  return [...sim.buildings.values()].find((b) => b.built && BUILDINGS[b.type].lodging);
}

function spawnMerchant(sim: Simulation, inn: Building): void {
  const towns = nearbyTowns(sim.seed);
  const home = towns[Math.floor(sim.rng.next() * Math.min(3, towns.length))];
  knowKingdomOf(sim, home.id);
  const stock: Inventory = {};
  const ore = MERCHANT_ORES[sim.rng.int(MERCHANT_ORES.length)];
  stock[ore] = 10 + sim.rng.int(11);
  const extras = [...MERCHANT_GOODS].sort(() => sim.rng.next() - 0.5).slice(0, 3);
  for (const g of extras) stock[g.res] = g.min + sim.rng.int(g.max - g.min + 1);
  const dist = Math.hypot(home.x, home.y);
  const p: Party = {
    id: sim.allocId(), name: sim.pickName(), appearance: sim.randomAppearance(), homeRegion: home.id, stock,
    state: 'travelling', innId: inn.id, arriveTick: sim.tick + Math.round(dist / ROAD_SPEED), leaveTick: 0,
    x: inn.x, y: inn.y, path: null, edge: { x: inn.x, y: inn.y },
    coins: MERCHANT_PURSE.min + sim.rng.int(MERCHANT_PURSE.max - MERCHANT_PURSE.min + 1),
  };
  sim.parties.push(p);
  sim.nextMerchant = sim.tick + Math.round(MERCHANT_INTERVAL * POLICIES[playerKingdom(sim).policy].merchantDelay);
  sim.toast(`A merchant, ${p.name}, has set off from ${home.name} (${direction(home.x, home.y)}) to trade at your inn.`, 'info');
  sim.emit({ type: 'important' });
}

/** An explored, walkable spot about 14 tiles from the inn, towards the merchant's home. */
function edgeSpot(sim: Simulation, inn: Building, home: { x: number; y: number }): { x: number; y: number } {
  const a = Math.atan2(home.y - inn.y, home.x - inn.x);
  for (let r = 14; r >= 3; r--) {
    for (const da of [0, 0.3, -0.3, 0.6, -0.6, 1, -1]) {
      const x = Math.round(inn.x + Math.cos(a + da) * r);
      const y = Math.round(inn.y + Math.sin(a + da) * r);
      if (sim.world.explored(x, y) && sim.walkable(x, y)) return { x, y };
    }
  }
  return entranceOf(inn);
}

function walk(sim: Simulation, p: Party, goal: { x: number; y: number; w: number; h: number; adjacent: boolean }): boolean {
  if (!p.path) {
    p.path = findPath(sim, Math.floor(p.x), Math.floor(p.y), goal, 20000) ?? [];
    if (p.path.length === 0 && !(Math.floor(p.x) >= goal.x - 1 && Math.floor(p.x) <= goal.x + goal.w && Math.floor(p.y) >= goal.y - 1 && Math.floor(p.y) <= goal.y + goal.h)) {
      // No path: step straight to the goal rather than getting stuck on the way.
      p.x = goal.x + 0.5;
      p.y = goal.y + goal.h + 0.5;
      return true;
    }
  }
  const next = p.path[0];
  if (!next) return true;
  const dx = next.x + 0.5 - p.x;
  const dy = next.y + 0.5 - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= WALK) {
    p.x = next.x + 0.5;
    p.y = next.y + 0.5;
    p.path.shift();
    return p.path.length === 0;
  }
  p.x += (dx / d) * WALK;
  p.y += (dy / d) * WALK;
  return false;
}

function updateParty(sim: Simulation, p: Party): void {
  const inn = innOf(sim, p.innId);
  switch (p.state) {
    case 'travelling': {
      if (sim.tick < p.arriveTick) return;
      if (!inn) {
        // The inn is gone: they turn back without ever entering the valley.
        sim.parties = sim.parties.filter((x) => x !== p);
        return;
      }
      p.innId = inn.id;
      const home = regionById(sim.seed, p.homeRegion);
      p.edge = edgeSpot(sim, inn, home);
      p.x = p.edge.x + 0.5;
      p.y = p.edge.y + 0.5;
      p.path = null;
      p.state = 'arriving';
      return;
    }
    case 'arriving': {
      if (!inn) {
        p.state = 'leaving';
        p.path = null;
        return;
      }
      if (!walk(sim, p, { x: inn.x, y: inn.y, w: inn.w, h: inn.h, adjacent: true })) return;
      p.state = 'lodging';
      p.leaveTick = sim.tick + MERCHANT_STAY;
      merchantBringsNews(sim, p.homeRegion);
      p.path = null;
      sim.stats.merchantVisits++;
      sim.toast(`${p.name} has taken a room at the inn. Open the inn to barter.`, 'good');
      sim.record('arrival', `${p.name} came to trade from ${regionById(sim.seed, p.homeRegion).name}`, inn.x, inn.y);
      sim.emit({ type: 'important' });
      return;
    }
    case 'lodging': {
      if (inn && sim.tick < p.leaveTick) return;
      const e = inn ? entranceOf(inn) : { x: Math.floor(p.x), y: Math.floor(p.y) };
      p.x = e.x + 0.5;
      p.y = e.y + 0.5;
      p.state = 'leaving';
      p.path = null;
      return;
    }
    case 'leaving': {
      if (!walk(sim, p, { x: p.edge.x, y: p.edge.y, w: 1, h: 1, adjacent: false })) return;
      merchantCarriesNews(sim, p.homeRegion);
      sim.parties = sim.parties.filter((x) => x !== p);
    }
  }
}

export function updateParties(sim: Simulation): void {
  for (const p of [...sim.parties]) updateParty(sim, p);
  if (sim.tick % 50 !== 0) return;
  const inn = innOf(sim);
  if (!inn) return;
  if (sim.nextMerchant === 0) sim.nextMerchant = sim.tick + DAY_TICKS / 4;
  if (sim.tick >= sim.nextMerchant && sim.parties.length === 0) spawnMerchant(sim, inn);
}

function cleanInv(v: unknown): Inventory | null {
  if (!v || typeof v !== 'object') return null;
  const out: Inventory = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (!isResourceId(k) || typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
    if (n > 0) out[k] = n;
  }
  return out;
}

/**
 * Barter with a lodging merchant. What you give must be worth at least what
 * you take at their prices; everything moves at once or nothing does.
 */
export function barter(sim: Simulation, partyId: unknown, giveRaw: unknown, takeRaw: unknown, coinsRaw: unknown = 0): CommandResult {
  // coins > 0: the treasury pays the merchant; coins < 0: the merchant pays the treasury.
  const coins = typeof coinsRaw === 'number' && Number.isInteger(coinsRaw) ? coinsRaw : NaN;
  if (Number.isNaN(coins)) return err('Invalid coin amount');
  const p = sim.parties.find((x) => x.id === partyId);
  if (!p || p.state !== 'lodging') return err('That merchant is not at the inn');
  const give = cleanInv(giveRaw);
  const take = cleanInv(takeRaw);
  if (!give || !take) return err('Invalid trade');
  if (invEntries(give).length === 0 && invEntries(take).length === 0 && coins === 0) return err('Choose what to trade');
  const crown = playerKingdom(sim);
  if (coins > crown.treasury) return err(`The treasury holds only ${crown.treasury} coins`);
  const inn = innOf(sim, p.innId);
  if (!inn) return err('The inn is gone');
  for (const [r, n] of invEntries(take)) if ((p.stock[r] ?? 0) < n) return err(`${p.name} only has ${p.stock[r] ?? 0} ${RESOURCES[r].name.toLowerCase()}`);
  const settlement = settlementOfBuilding(sim, inn)?.id ?? null;
  for (const [r, n] of invEntries(give)) {
    const have = localAvailable(sim, settlement, r);
    if (have < n) return err(`Your stores near the inn have only ${have} ${RESOURCES[r].name.toLowerCase()} to spare`);
  }
  const offered = invEntries(give).reduce((a, [r, n]) => a + buyPrice(r) * n, 0) + Math.max(0, coins);
  const asked = invEntries(take).reduce((a, [r, n]) => a + sellPrice(r) * n, 0) + Math.max(0, -coins);
  if (offered < asked) return err(`${p.name} wants goods worth ${asked} for that; you offer ${offered}`);
  // Tax: a share of what the merchant hands over in this trade, paid from their purse.
  const tax = Math.floor(asked * POLICIES[crown.policy].tradeTax);
  if (-coins + tax > p.coins && coins < 0) return err(`${p.name} has only ${p.coins} coins${tax ? ` (and owes ${tax} in tax)` : ''}`);
  const levy = Math.min(tax, p.coins - Math.max(0, -coins));
  const stores = localStores(sim, settlement);
  const free = stores.filter((b) => storesResource(b, 'food')).reduce((a, b) => a + sim.storageCapacity(b) - sim.storageUsed(b), 0);
  const takeTotal = invEntries(take).filter(([r]) => r !== 'horses').reduce((a, [, n]) => a + n, 0);
  const giveTotal = invEntries(give).filter(([r]) => r !== 'horses').reduce((a, [, n]) => a + n, 0);
  if (free + giveTotal < takeTotal) return err('Not enough room in your stores for what you would take');
  const stalls = sim.storages().filter((b) => storesResource(b, 'horses')).reduce((a, b) => a + sim.storageCapacity(b) - sim.storageUsed(b), 0);
  if ((take.horses ?? 0) > stalls) return err(`Horses need free stable stalls (${stalls} free) — build a stable`);
  // All checks passed: move everything.
  for (const [r, n] of invEntries(give)) {
    let left = n;
    for (const b of stores) {
      const k = Math.min(left, Math.max(0, sim.available(b, r)));
      addInv(b.inventory, r, -k);
      left -= k;
    }
    addInv(p.stock, r, n);
  }
  for (const [r, n] of invEntries(take)) {
    addInv(p.stock, r, -n);
    let left = n;
    for (const b of r === 'horses' ? sim.storages() : stores) left -= sim.deposit(b, r, left);
  }
  p.coins += coins - levy;
  crown.treasury += -coins + levy;
  crown.taxCollected += levy;
  sim.stats.trades++;
  sim.emit({ type: 'sfx', name: 'complete', x: inn.x + 1, y: inn.y + 1 });
  return ok(`Traded with ${p.name}.`);
}
