import { DAY_TICKS } from '../core/constants';
import { BAND_HYSTERESIS, BANDS, CONCERN_MEMORY_DAYS, REASSURANCE_DAYS } from '../data/treaties';
import { COUNCIL_POSTS } from '../data/kingdoms';
import { activeTreaty, changeTrust, letterTicks, proposeTreaty, seatOf, stanceOf, trustOf } from './diplomacy';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from './kingdoms';
import { latestAbout, recordObservation } from './news';
import { sectorOf } from './territory';
import type { Simulation } from './Simulation';
import type { CommandResult, ConcernBand, NewsReport, Warning } from './types';

/**
 * How worried one kingdom is about another, from what the observer has been
 * told (never from hidden truth). Troops near its land, claims on its border,
 * conquests and broken promises raise concern; distance, trust, trade and
 * alliances temper it. Prosperity alone never goes past watchful, and a rumour
 * alone can never prove aggression or a broken promise.
 */

const WEIGHT = { rumor: 0.3, observed: 0.7, confirmed: 1 } as const;

export function bandFor(score: number): ConcernBand {
  if (score >= BANDS.alarmed) return 'alarmed';
  if (score >= BANDS.concerned) return 'concerned';
  if (score >= BANDS.watchful) return 'watchful';
  return 'calm';
}

const ORDER: ConcernBand[] = ['calm', 'watchful', 'concerned', 'alarmed'];
const ENTRY: Record<ConcernBand, number> = { calm: 0, watchful: BANDS.watchful, concerned: BANDS.concerned, alarmed: BANDS.alarmed };

function recent(sim: Simulation, observer: number, subject: number): NewsReport[] {
  const since = sim.tick - CONCERN_MEMORY_DAYS * DAY_TICKS;
  // One report per event (the surest), so repeated news of one thing counts once.
  const byEvent = new Map<number, NewsReport>();
  for (const r of sim.reports) {
    if (!r.delivered || r.superseded || r.recipientKingdomId !== observer || r.subjectKingdomId !== subject || r.eventTick < since) continue;
    const prev = byEvent.get(r.eventId);
    if (!prev || WEIGHT[r.certainty] > WEIGHT[prev.certainty]) byEvent.set(r.eventId, r);
  }
  return [...byEvent.values()];
}

export function evaluateConcern(sim: Simulation, observer: number, subject: number): { score: number; band: ConcernBand; reasons: string[] } {
  if (observer === subject) return { score: 0, band: 'calm', reasons: [] };
  const news = recent(sim, observer, subject);
  const name = kingdomById(sim, subject)?.name ?? 'They';
  const reasons: string[] = [];
  const ally = stanceOf(sim, observer, subject) === 'ally';
  let military = 0;
  // Troops at a border are near by definition; only distant build-ups are discounted for distance.
  let border = 0;
  let claims = 0;
  let conquest = 0;
  let broken = 0;
  let prosperity = 0;
  for (const r of news) {
    const w = WEIGHT[r.certainty];
    if (r.kind === 'border-forces') border += r.magnitude * 3 * w;
    else if (r.kind === 'military-buildup') military += r.magnitude * 2 * w;
    else if (r.kind === 'claim' && r.certainty !== 'rumor') claims += 8;
    else if (r.kind === 'conquest' && r.certainty !== 'rumor') conquest += 25;
    else if (r.kind === 'treaty-broken' && r.certainty !== 'rumor') broken += 20;
    else if (r.kind === 'prosperity') prosperity += 2 * r.magnitude * w;
  }
  military = Math.min(40, military);
  border = Math.min(60, border);
  claims = Math.min(20, claims);
  broken = Math.min(30, broken);
  prosperity = Math.min(20, prosperity);
  let score = 0;
  let near = 0;
  if (border > 0) {
    if (ally) near -= border / 2;
    else {
      near += border;
      reasons.push(`${name} has troops at the border`);
    }
  }
  if (military > 0) {
    if (ally) {
      score -= military / 2;
      reasons.push(`${name}'s soldiers are allies' soldiers — a comfort`);
    } else {
      score += military;
      reasons.push(`${name} has troops or soldiers where we can see them`);
    }
  }
  if (claims) {
    score += claims;
    reasons.push(`${name} has claimed land near our borders`);
  }
  if (conquest) {
    score += conquest;
    reasons.push(`${name} has conquered land`);
  }
  if (broken) {
    score += broken;
    reasons.push(`${name} broke a promise`);
  }
  if (prosperity) {
    score += prosperity;
    reasons.push(`${name} is growing prosperous`);
  }
  // Tempering: distance, trust, treaties.
  const a = seatOf(sim, observer);
  const b = seatOf(sim, subject);
  const far = Math.min(0.4, Math.hypot(a.x - b.x, a.y - b.y) / 1000);
  score *= 1 - far;
  score += near;
  score -= (trustOf(sim, observer, subject) - 50) / 5;
  if (activeTreaty(sim, observer, subject, 'trade')) score -= 10;
  if (activeTreaty(sim, observer, subject, 'nonAggression')) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));
  // Prosperity alone can make a neighbour watchful, never more.
  const onlyProsperity = prosperity > 0 && military === 0 && border === 0 && claims === 0 && conquest === 0 && broken === 0;
  if (onlyProsperity) score = Math.min(score, BANDS.concerned - 1);
  return { score, band: bandFor(score), reasons };
}

/** Recomputes concern (every other day per pair, or now with `force`), warns the player, and catches broken reassurances. */
export function updateConcern(sim: Simulation, force = false): void {
  const ks = sim.kingdoms;
  for (let i = 0; i < ks.length; i++) {
    for (let j = 0; j < ks.length; j++) {
      if (i === j) continue;
      if (!force && (i + j + sim.day) % 2 !== 0) continue;
      const obs = ks[i];
      const subj = ks[j];
      const key = `${obs.id}>${subj.id}`;
      const c = evaluateConcern(sim, obs.id, subj.id);
      const st = sim.concernStates.get(key) ?? { band: 'calm' as ConcernBand, score: 0, lastWarnTick: -Infinity, lastWarnBand: 'calm' as ConcernBand, reassuredTick: null as number | null, reassuredEvidence: 0, lastEvidence: 0 };
      // Bands rise at once but only fall once the score is well below where they began.
      let band = c.band;
      if (ORDER.indexOf(band) < ORDER.indexOf(st.band) && c.score > ENTRY[st.band] - BAND_HYSTERESIS) band = st.band;
      const evidence = sim.reports.filter((r) => r.delivered && r.recipientKingdomId === obs.id && r.subjectKingdomId === subj.id && (r.kind === 'border-forces' || r.kind === 'military-buildup' || r.kind === 'claim')).reduce((m, r) => Math.max(m, r.id), 0);
      // A reassurance contradicted by troops or claims seen soon after costs more trust than it earned.
      if (st.reassuredTick !== null && evidence > st.reassuredEvidence && sim.tick - st.reassuredTick <= REASSURANCE_DAYS * DAY_TICKS) {
        changeTrust(sim, obs.id, subj.id, -25);
        st.reassuredTick = null;
        c.reasons.push(`${subj.name} broke its reassurance`);
      }
      const newCause = evidence > st.lastEvidence;
      if (!obs.player && subj.player && ORDER.indexOf(band) >= ORDER.indexOf('concerned')) {
        const rose = ORDER.indexOf(band) > ORDER.indexOf(st.lastWarnBand);
        const repeat = newCause && sim.tick - st.lastWarnTick >= DAY_TICKS;
        if (rose || repeat) {
          const w: Warning = {
            id: sim.allocId(), from: obs.id, to: subj.id, band, reasons: c.reasons.slice(0, 4), tick: sim.tick, state: 'open', response: null,
            actions: ['reassure', 'investigate', 'negotiate', 'propose-pact', 'prepare', 'dismiss'],
          };
          sim.warnings.push(w);
          st.lastWarnTick = sim.tick;
          st.lastWarnBand = band;
          sim.toast(`${obs.name} is ${band} about you: ${w.reasons[0] ?? 'see the Realm tab'}.`, 'warn');
          sim.emit({ type: 'important' });
        }
      }
      if (ORDER.indexOf(band) < ORDER.indexOf('concerned')) st.lastWarnBand = band;
      sim.concernStates.set(key, { ...st, band, score: c.score, lastEvidence: Math.max(st.lastEvidence, evidence) });
    }
  }
  if (sim.warnings.length > 60) sim.warnings.splice(0, sim.warnings.length - 60);
}

/** The player's answer to a warning. */
export function respondToWarning(sim: Simulation, warningId: unknown, action: unknown): CommandResult {
  const w = sim.warnings.find((x) => x.id === warningId);
  if (!w || w.to !== PLAYER_KINGDOM) return { ok: false, message: 'No such warning' };
  if (w.state !== 'open') return { ok: false, message: 'You have already answered that warning' };
  const from = kingdomById(sim, w.from)!;
  const me = playerKingdom(sim);
  const key = `${w.from}>${PLAYER_KINGDOM}`;
  const st = sim.concernStates.get(key);
  let message = '';
  switch (action) {
    case 'reassure':
      changeTrust(sim, w.from, PLAYER_KINGDOM, 10);
      if (st) {
        st.reassuredTick = sim.tick;
        st.reassuredEvidence = st.lastEvidence;
      }
      message = `You assured ${from.name} of your peaceful intent. Troops or claims seen near them soon would make this a broken promise.`;
      break;
    case 'investigate': {
      if (me.council.envoy === null) return { ok: false, message: `Appoint an ${COUNCIL_POSTS.envoy.name} to investigate` };
      const latest = latestAbout(sim, PLAYER_KINGDOM, w.from, 'military-buildup');
      const ev = sim.worldEvents.filter((e) => e.subject === w.from).at(-1);
      if (ev) recordObservation(sim, PLAYER_KINGDOM, w.from, ev.kind, null, { eventId: ev.id, certainty: 'confirmed', source: 'envoy', delay: letterTicks(sim, PLAYER_KINGDOM, w.from) * 2 });
      message = ev ? `Your envoy rides to ${from.name}; a confirmed report will follow.${latest ? '' : ''}` : `Your envoy found nothing new to report from ${from.name}.`;
      break;
    }
    case 'negotiate':
      message = `Open talks with ${from.name}: propose a treaty from the Realm tab.`;
      break;
    case 'propose-pact': {
      const res = proposeTreaty(sim, 'nonAggression', w.from, { durationDays: 16 });
      if (!res.ok) return res;
      message = res.message ?? '';
      break;
    }
    case 'prepare':
      message = `You take ${from.name}'s warning as a sign to look to your defences.`;
      break;
    case 'dismiss':
      changeTrust(sim, w.from, PLAYER_KINGDOM, -3);
      message = `You dismissed ${from.name}'s concerns.`;
      break;
    default:
      return { ok: false, message: 'Unknown answer' };
  }
  w.state = 'answered';
  w.response = action as string;
  return { ok: true, message };
}

/** Sector distance from a kingdom's seat (for UI). */
export function sectorsFrom(sim: Simulation, id: number, x: number, y: number): number {
  const s = seatOf(sim, id);
  const a = sectorOf(s.x, s.y);
  const b = sectorOf(x, y);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
