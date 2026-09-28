import { DAY_TICKS } from '../core/constants';
import { COUNCIL_POSTS } from '../data/kingdoms';
import { DEFAULT_TRUST, isTreatyKind, MAX_RIVAL_COMPANIES, TREATIES, type TreatyKind } from '../data/treaties';
import { ROAD_SPEED } from '../world/regions';
import { evaluateConcern, updateConcern } from './concern';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from './kingdoms';
import { deliverMerchantNews, recordEvent, recordObservation } from './news';
import { sectorOf } from './territory';
import type { Simulation } from './Simulation';
import type { ClaimSector, CommandResult, Company, Incident, Kingdom, Stance, TreatyOffer } from './types';

/**
 * Relations between kingdoms: stance (neutral, trading, ally, enemy), how far
 * each side trusts the other, treaties with typed terms and escrowed payments,
 * and border incidents. The AI answers every offer with its reasons, and uses
 * only what it has actually been told.
 */

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

export const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function stanceOf(sim: Simulation, a: number, b: number): Stance {
  return sim.stances.get(pairKey(a, b)) ?? 'neutral';
}

export function trustOf(sim: Simulation, from: number, to: number): number {
  return sim.trust.get(`${from}>${to}`) ?? DEFAULT_TRUST;
}

export function changeTrust(sim: Simulation, from: number, to: number, by: number): void {
  sim.trust.set(`${from}>${to}`, Math.max(0, Math.min(100, trustOf(sim, from, to) + by)));
}

/** Where a kingdom sits, for travel times. */
export function seatOf(sim: Simulation, id: number): { x: number; y: number } {
  return kingdomById(sim, id)?.capital ?? { x: 0, y: 0 };
}

/** Ticks for a letter between two kingdoms. */
export function letterTicks(sim: Simulation, a: number, b: number): number {
  const p = seatOf(sim, a);
  const q = seatOf(sim, b);
  return Math.max(60, Math.round(Math.hypot(p.x - q.x, p.y - q.y) / ROAD_SPEED));
}

export function activeTreaty(sim: Simulation, a: number, b: number, kind: TreatyKind): TreatyOffer | undefined {
  return sim.offers.find((o) => o.kind === kind && o.state === 'active' && ((o.proposer === a && o.recipient === b) || (o.proposer === b && o.recipient === a)));
}

/** Recomputes a pair's stance from their treaties and wars. */
export function refreshStance(sim: Simulation, a: number, b: number): void {
  const k = pairKey(a, b);
  if (sim.wars.has(k)) sim.stances.set(k, 'enemy');
  else if (activeTreaty(sim, a, b, 'defensiveAlliance')) sim.stances.set(k, 'ally');
  else if (activeTreaty(sim, a, b, 'trade')) sim.stances.set(k, 'trading');
  else sim.stances.delete(k);
}

/** The rival's companies: created with the kingdom, at home unless pledged. */
export function rivalCompanies(id: number): Company[] {
  const n = 3 + (id % 3);
  const kinds: Company['kind'][] = ['infantry', 'archer', 'infantry', 'knight', 'archer', 'infantry'];
  return Array.from({ length: n }, (_, i) => ({ id: id * 100 + i, kind: kinds[i % kinds.length], strength: 10, pledgedTo: null, owner: id }));
}

// ---- offers ------------------------------------------------------------------------

function incompatible(sim: Simulation, from: number, to: number, kind: TreatyKind): string | null {
  const atWar = sim.wars.has(pairKey(from, to));
  if ((kind === 'truce' || kind === 'peace') && !atWar) return 'A truce or peace is only needed between kingdoms at war';
  if (atWar && kind !== 'truce' && kind !== 'peace') return 'You are at war: agree a truce or peace first';
  if (kind === 'defensiveAlliance') {
    for (const other of sim.kingdoms) {
      if (other.id === to || other.id === from) continue;
      if (stanceOf(sim, from, other.id) === 'ally' && sim.wars.has(pairKey(to, other.id))) {
        return `${kingdomById(sim, to)?.name} is at war with your ally ${other.name} — you can't promise to defend both`;
      }
    }
  }
  return null;
}

/** Creates an offer (the proposer's payment goes into escrow). Used by the AI and by proposeTreaty. */
export function makeOffer(sim: Simulation, from: number, to: number, kind: TreatyKind, terms: { durationDays: number; payment?: number }, expiresIn: number): TreatyOffer {
  const payment = Math.max(0, Math.floor(terms.payment ?? 0));
  const k = kingdomById(sim, from);
  if (k) k.treasury -= payment;
  const o: TreatyOffer = {
    id: sim.allocId(), kind, proposer: from, recipient: to,
    terms: { durationDays: Math.max(1, Math.floor(terms.durationDays)), payment },
    escrow: payment, state: 'proposed', reasons: [], createdTick: sim.tick, expiresTick: sim.tick + expiresIn,
    decideTick: to === PLAYER_KINGDOM ? null : sim.tick + letterTicks(sim, from, to), activatedTick: null, endsTick: null,
  };
  sim.offers.push(o);
  return o;
}

export function proposeTreaty(sim: Simulation, kind: unknown, to: unknown, terms: unknown): CommandResult {
  const me = playerKingdom(sim);
  if (!me.crowned) return err('Crown your ruler first — kingdoms treat with crowned rulers');
  if (!isTreatyKind(kind)) return err('Unknown treaty');
  const other = kingdomById(sim, to as number);
  if (!other || other.player) return err('Choose a kingdom you know of');
  if (me.council.envoy === null) return err(`Appoint an ${COUNCIL_POSTS.envoy.name} to carry your letters`);
  const t = (terms ?? {}) as { durationDays?: unknown; payment?: unknown };
  const days = typeof t.durationDays === 'number' && Number.isInteger(t.durationDays) ? t.durationDays : NaN;
  const pay = t.payment === undefined ? 0 : typeof t.payment === 'number' && Number.isInteger(t.payment) && t.payment >= 0 ? t.payment : NaN;
  if (!(days >= 1 && days <= 64) || Number.isNaN(pay)) return err('Invalid terms');
  if (pay > me.treasury) return err(`The treasury holds only ${me.treasury} coins`);
  if (sim.offers.some((o) => o.state === 'proposed' && o.kind === kind && ((o.proposer === me.id && o.recipient === other.id) || (o.proposer === other.id && o.recipient === me.id)))) {
    return err('That offer is already on its way — wait for the answer');
  }
  if (activeTreaty(sim, me.id, other.id, kind)) return err(`You already have a ${TREATIES[kind].name.toLowerCase()} with ${other.name}`);
  const bad = incompatible(sim, me.id, other.id, kind);
  if (bad) return err(bad);
  const o = makeOffer(sim, me.id, other.id, kind, { durationDays: days, payment: pay }, 4 * DAY_TICKS);
  sim.emit({ type: 'important' });
  return ok(`Your envoy is taking the ${TREATIES[kind].name.toLowerCase()} to ${other.name}${pay ? ` with ${pay} coins held until they answer` : ''}.`, o.id);
}

function activate(sim: Simulation, o: TreatyOffer): void {
  o.state = 'active';
  o.activatedTick = sim.tick;
  o.endsTick = sim.tick + o.terms.durationDays * DAY_TICKS;
  const to = kingdomById(sim, o.recipient);
  if (to) to.treasury += o.escrow;
  o.escrow = 0;
  if (o.kind === 'peace' || o.kind === 'truce') {
    if (o.kind === 'peace') sim.wars.delete(pairKey(o.proposer, o.recipient));
  }
  refreshStance(sim, o.proposer, o.recipient);
  changeTrust(sim, o.recipient, o.proposer, 5);
  changeTrust(sim, o.proposer, o.recipient, 5);
  if (o.kind === 'defensiveAlliance') {
    const ev = recordEvent(sim, 'alliance', o.proposer, 1, null);
    for (const k of sim.kingdoms) if (k.id !== o.proposer && k.id !== o.recipient) recordObservation(sim, k.id, o.proposer, 'alliance', null, { eventId: ev.id, certainty: 'observed', source: 'envoy', delay: DAY_TICKS });
  }
}

function refund(sim: Simulation, o: TreatyOffer): void {
  const from = kingdomById(sim, o.proposer);
  if (from) from.treasury += o.escrow;
  o.escrow = 0;
}

/** The player's answer to an offer from another kingdom. */
export function respondToOffer(sim: Simulation, offerId: unknown, accept: unknown): CommandResult {
  const o = sim.offers.find((x) => x.id === offerId);
  if (!o || o.recipient !== PLAYER_KINGDOM) return err('That offer is not addressed to you');
  if (o.state === 'expired' || (o.state === 'proposed' && sim.tick >= o.expiresTick)) return err('That offer has expired and is no longer on the table');
  if (o.state !== 'proposed') return err('That offer has already been answered');
  const from = kingdomById(sim, o.proposer)!;
  if (!accept) {
    o.state = 'rejected';
    refund(sim, o);
    // A refusal is not an insult; trust barely moves and nobody becomes an enemy.
    changeTrust(sim, o.proposer, PLAYER_KINGDOM, -1);
    return ok(`You declined ${from.name}'s ${TREATIES[o.kind].name.toLowerCase()}. Relations are unchanged.`);
  }
  const bad = incompatible(sim, o.proposer, PLAYER_KINGDOM, o.kind);
  if (bad) return err(bad);
  activate(sim, o);
  return ok(`You signed the ${TREATIES[o.kind].name.toLowerCase()} with ${from.name}.`);
}

/** How willing an AI kingdom is to sign, with its reasons (from what it knows). */
export function aiVerdict(sim: Simulation, o: TreatyOffer): { accept: boolean; reasons: string[] } {
  const def = TREATIES[o.kind];
  const me = kingdomById(sim, o.recipient)!;
  const them = kingdomById(sim, o.proposer)!;
  const reasons: string[] = [];
  let score = trustOf(sim, me.id, them.id);
  reasons.push(`We trust ${them.name} ${score >= 60 ? 'well' : score >= 40 ? 'somewhat' : 'little'} (${score}/100)`);
  const concern = evaluateConcern(sim, me.id, them.id);
  if (concern.score > 0) {
    score -= concern.score / 2;
    reasons.push(`We are ${concern.band} about them${concern.reasons[0] ? `: ${concern.reasons[0]}` : ''}`);
  }
  if (o.terms.payment) {
    score += o.terms.payment / 5;
    reasons.push(`They offer ${o.terms.payment} coins`);
  }
  if (me.personality === 'mercantile' && o.kind === 'trade') {
    score += 15;
    reasons.push('Trade suits our merchants');
  }
  if (me.personality === 'proud' && (o.kind === 'passage' || o.kind === 'defensiveAlliance')) {
    score -= 10;
    reasons.push('We are wary of foreign soldiers and entanglements');
  }
  if (me.personality === 'cautious' && o.kind === 'nonAggression') {
    score += 10;
    reasons.push('A pact eases our worries');
  }
  const bad = incompatible(sim, o.proposer, o.recipient, o.kind);
  if (bad) return { accept: false, reasons: [...reasons, bad] };
  const accept = score >= def.threshold;
  reasons.push(accept ? `This is enough for a ${def.name.toLowerCase()}` : `Not enough for a ${def.name.toLowerCase()} yet`);
  return { accept, reasons };
}

/** Ends a treaty before its time: a broken promise that others hear about. */
export function cancelTreaty(sim: Simulation, offerId: unknown): CommandResult {
  const o = sim.offers.find((x) => x.id === offerId);
  if (!o || o.state !== 'active' || (o.proposer !== PLAYER_KINGDOM && o.recipient !== PLAYER_KINGDOM)) return err('No such treaty');
  const other = o.proposer === PLAYER_KINGDOM ? o.recipient : o.proposer;
  o.state = 'breached';
  refreshStance(sim, o.proposer, o.recipient);
  changeTrust(sim, other, PLAYER_KINGDOM, -25);
  const ev = recordEvent(sim, 'treaty-broken', PLAYER_KINGDOM, 1, null);
  for (const k of sim.kingdoms) {
    if (k.player) continue;
    recordObservation(sim, k.id, PLAYER_KINGDOM, 'treaty-broken', null, { eventId: ev.id, certainty: k.id === other ? 'confirmed' : 'observed', source: k.id === other ? 'envoy' : 'rumour-of-envoys', delay: k.id === other ? 0 : DAY_TICKS });
  }
  sim.record('shortage', `${playerKingdom(sim).name} broke its ${TREATIES[o.kind].name.toLowerCase()} with ${kingdomById(sim, other)?.name}`);
  return ok(`You ended the ${TREATIES[o.kind].name.toLowerCase()}. It was a broken promise: ${TREATIES[o.kind].breach}`);
}

// ---- incidents -----------------------------------------------------------------------

/** A border incident. A hostile attack is only possible in a war; otherwise it is refused. */
export function openIncident(sim: Simulation, kind: Incident['kind'], from: number, to: number, sector: ClaimSector): Incident {
  const inc: Incident = { id: sim.allocId(), kind, from, to, sector: { ...sector }, tick: sim.tick, state: 'open' };
  if (kind === 'hostileAttack' && !sim.wars.has(pairKey(from, to))) {
    inc.state = 'refused';
    return inc;
  }
  sim.incidents.push(inc);
  if (to === PLAYER_KINGDOM) {
    const name = kingdomById(sim, from)?.name ?? 'A neighbour';
    const what = kind === 'civilianPassage' ? 'travellers are crossing' : kind === 'armedPassage' ? 'armed men are crossing' : 'soldiers attacked';
    sim.toast(`${name}: ${what} your land. Open the Realm tab to respond.`, kind === 'civilianPassage' ? 'info' : 'warn');
    sim.emit({ type: 'important' });
  }
  return inc;
}

export function respondToIncident(sim: Simulation, incidentId: unknown, response: unknown): CommandResult {
  const inc = sim.incidents.find((x) => x.id === incidentId);
  if (!inc || inc.to !== PLAYER_KINGDOM) return err('No such incident');
  if (inc.state !== 'open') return err('That incident is already settled');
  const from = kingdomById(sim, inc.from)!;
  switch (response) {
    case 'allow':
      inc.state = 'allowed';
      changeTrust(sim, inc.from, PLAYER_KINGDOM, 3);
      return ok(`You let ${from.name}'s people pass.`);
    case 'askWithdraw':
      if (inc.kind === 'hostileAttack') return err('An attack in war is not settled by asking — defend, retreat or seek a truce');
      if (trustOf(sim, inc.from, PLAYER_KINGDOM) >= 25 || inc.kind === 'civilianPassage') {
        inc.state = 'withdrawn';
        return ok(`${from.name} apologised and withdrew.`);
      }
      inc.state = 'standoff';
      changeTrust(sim, PLAYER_KINGDOM, inc.from, -5);
      return ok(`${from.name} refused to withdraw. Consider talks, a passage treaty, or preparing your defences.`);
    case 'protest':
      inc.state = 'withdrawn';
      changeTrust(sim, inc.from, PLAYER_KINGDOM, -4);
      return ok(`You lodged a protest; ${from.name} withdrew, cooler towards you.`);
    default:
      return err('Unknown response');
  }
}

// ---- the daily round ----------------------------------------------------------------

function rivalDay(sim: Simulation, r: Kingdom): void {
  // A worried kingdom raises another company (and its neighbours notice).
  const worried = sim.kingdoms.some((k) => k.id !== r.id && (sim.concernStates.get(`${r.id}>${k.id}`)?.band === 'concerned' || sim.concernStates.get(`${r.id}>${k.id}`)?.band === 'alarmed'));
  if (worried && r.companies.length < MAX_RIVAL_COMPANIES && sim.rng.chance(0.5)) {
    r.companies.push({ id: r.id * 100 + r.companies.length, kind: sim.rng.chance(0.5) ? 'infantry' : 'archer', strength: 10, pledgedTo: null, owner: r.id });
    // Reports carry the company count seen at the time; it goes stale as things change.
    const ev = recordEvent(sim, 'military-buildup', r.id, r.companies.length, null);
    for (const k of sim.kingdoms) {
      if (k.id === r.id) continue;
      const near = Math.hypot((k.capital?.x ?? 0) - (r.capital?.x ?? 0), (k.capital?.y ?? 0) - (r.capital?.y ?? 0)) < 320;
      const letters = activeTreaty(sim, k.id, r.id, 'trade') || stanceOf(sim, k.id, r.id) === 'ally';
      if (k.player ? letters : near) recordObservation(sim, k.id, r.id, 'military-buildup', null, { eventId: ev.id, certainty: 'observed', source: k.player ? 'letters' : 'scout', delay: DAY_TICKS / 2 });
    }
  }
  // Trust drifts gently back towards neutral; trade partners warm up.
  for (const k of sim.kingdoms) {
    if (k.id === r.id) continue;
    const t = trustOf(sim, r.id, k.id);
    if (activeTreaty(sim, r.id, k.id, 'trade')) changeTrust(sim, r.id, k.id, 1);
    else if (t > DEFAULT_TRUST) changeTrust(sim, r.id, k.id, -0.5);
    else if (t < DEFAULT_TRUST) changeTrust(sim, r.id, k.id, 0.5);
  }
  // A friendly neighbour proposes trade now and then.
  const me = playerKingdom(sim);
  if (me.crowned && trustOf(sim, r.id, me.id) >= 65 && !activeTreaty(sim, r.id, me.id, 'trade') && !sim.offers.some((o) => o.state === 'proposed' && o.proposer === r.id)) {
    makeOffer(sim, r.id, me.id, 'trade', { durationDays: 8, payment: 0 }, 2 * DAY_TICKS);
    sim.toast(`${r.name} proposes a trade agreement. See the Realm tab.`, 'info');
  }
  // Frontier patrols from a worried neighbour, once the player has opened the frontier.
  if (me.frontierActive && sim.concernStates.get(`${r.id}>${me.id}`)?.band === 'alarmed' && sim.rng.chance(0.25)) {
    const claims = [...sim.claims.entries()].filter(([, c]) => c.legalOwner === me.id);
    if (claims.length) {
      const [key] = claims[sim.rng.int(claims.length)];
      const [x, y] = key.split(',').map(Number);
      openIncident(sim, 'armedPassage', r.id, me.id, { x, y });
    }
  }
}

/** Offers, treaties and incidents advance; each kingdom takes its daily turn. */
export function updateDiplomacy(sim: Simulation): void {
  for (const o of sim.offers) {
    if (o.state === 'proposed' && sim.tick >= o.expiresTick) {
      o.state = 'expired';
      refund(sim, o);
      continue;
    }
    if (o.state === 'proposed' && o.decideTick !== null && sim.tick >= o.decideTick) {
      const v = aiVerdict(sim, o);
      o.reasons = v.reasons;
      if (v.accept) activate(sim, o);
      else {
        o.state = 'rejected';
        refund(sim, o);
      }
      if (o.proposer === PLAYER_KINGDOM) {
        const name = kingdomById(sim, o.recipient)?.name;
        sim.toast(`${name} ${v.accept ? 'accepted' : 'declined'} your ${TREATIES[o.kind].name.toLowerCase()}. Their reasons are in the Realm tab.`, v.accept ? 'good' : 'info');
        sim.emit({ type: 'important' });
      }
      continue;
    }
    if (o.state === 'active' && o.endsTick !== null && sim.tick >= o.endsTick) {
      o.state = 'fulfilled';
      refreshStance(sim, o.proposer, o.recipient);
    }
  }
  if (sim.day !== sim.diplomacyDay) {
    sim.diplomacyDay = sim.day;
    for (const r of sim.kingdoms) if (!r.player) rivalDay(sim, r);
    // The player's growth is news too (merchants carry it).
    const adults = sim.settlers.filter((s) => s.lifeStage === 'adult').length;
    if (adults >= sim.lastProsperity + 5) {
      sim.lastProsperity = adults;
      recordEvent(sim, 'prosperity', PLAYER_KINGDOM, Math.round(adults / 5), null);
    }
    updateConcern(sim);
  }
}

/** A merchant from `home` has arrived: news they carry, and rumours of their home, reach the player. */
export function merchantBringsNews(sim: Simulation, home: number): void {
  deliverMerchantNews(sim, PLAYER_KINGDOM);
  for (const ev of sim.worldEvents) {
    if (ev.subject !== home || sim.tick - ev.tick > 4 * DAY_TICKS) continue;
    const jitter = 0.5 + sim.rng.next();
    recordObservation(sim, PLAYER_KINGDOM, home, ev.kind, null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: 0, magnitude: Math.max(1, Math.round(ev.magnitude * jitter)) });
  }
}

/** A merchant heading home carries rumours of the player's recent doings. */
export function merchantCarriesNews(sim: Simulation, home: number): void {
  for (const ev of sim.worldEvents) {
    if (ev.subject !== PLAYER_KINGDOM || sim.tick - ev.tick > 4 * DAY_TICKS) continue;
    recordObservation(sim, home, PLAYER_KINGDOM, ev.kind, null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: letterTicks(sim, PLAYER_KINGDOM, home) });
  }
}

/** Neighbours see a claim near their land at once; the event is recorded either way. */
export function reportClaim(sim: Simulation, sector: ClaimSector): void {
  const ev = recordEvent(sim, 'claim', PLAYER_KINGDOM, 1, sector);
  for (const k of sim.kingdoms) {
    if (k.player || !k.capital) continue;
    const c = sectorOf(k.capital.x, k.capital.y);
    if (Math.max(Math.abs(c.x - sector.x), Math.abs(c.y - sector.y)) <= 5) {
      recordObservation(sim, k.id, PLAYER_KINGDOM, 'claim', sector, { eventId: ev.id, certainty: 'observed', source: 'border', delay: DAY_TICKS / 4 });
    }
  }
}

/**
 * Sets up a relationship through the same records play would create: an ally
 * or trading partner has an active treaty, an enemy is at war. (Used when
 * setting up scenarios and by the AI.)
 */
export function setStanceDirect(sim: Simulation, a: number, b: number, stance: Stance): void {
  for (const o of sim.offers) {
    const pair = (o.proposer === a && o.recipient === b) || (o.proposer === b && o.recipient === a);
    if (pair && o.state === 'active' && (o.kind === 'defensiveAlliance' || o.kind === 'trade')) o.state = 'fulfilled';
  }
  sim.wars.delete(pairKey(a, b));
  if (stance === 'enemy') sim.wars.add(pairKey(a, b));
  if (stance === 'ally' || stance === 'trading') {
    const o = makeOffer(sim, a, b, stance === 'ally' ? 'defensiveAlliance' : 'trade', { durationDays: 64, payment: 0 }, DAY_TICKS);
    o.state = 'active';
    o.activatedTick = sim.tick;
    o.endsTick = sim.tick + 64 * DAY_TICKS;
  }
  refreshStance(sim, a, b);
}
