import { EVENT_LIMIT, INBOX_LIMIT } from '../data/treaties';
import type { Simulation } from './Simulation';
import type { Certainty, ClaimSector, NewsReport, WorldEvent, WorldEventKind } from './types';

/**
 * News and knowledge. `sim.worldEvents` is the internal truth; kingdoms (and the
 * player) only ever act on *delivered* reports. A report names its source, how
 * sure it is, when the thing was seen and when the report arrived. Relaying
 * keeps the original event id, so news passed around a circle of allies is
 * never mistaken for independent confirmation. Reports carry positions only
 * when the source actually knew them, and reading news never reveals the map.
 */

const RANK: Record<Certainty, number> = { rumor: 0, observed: 1, confirmed: 2 };

export function recordEvent(sim: Simulation, kind: WorldEventKind, subject: number, magnitude: number, location: ClaimSector | null): WorldEvent {
  const e: WorldEvent = { id: sim.allocId(), kind, subject, magnitude, location: location ? { ...location } : null, tick: sim.tick };
  sim.worldEvents.push(e);
  if (sim.worldEvents.length > EVENT_LIMIT) sim.worldEvents.splice(0, sim.worldEvents.length - EVENT_LIMIT);
  return e;
}

export interface ObservationOptions {
  eventId?: number;
  certainty?: Certainty;
  /** How the recipient came to know: scout, border, envoy, merchant, ally… */
  source?: string;
  /** Ticks until it arrives; null means it waits for a merchant to carry it. */
  delay?: number | null;
  /** Override the size reported (rumours exaggerate or understate). */
  magnitude?: number;
  sourceKingdomId?: number | null;
  relayedBy?: number[];
}

/**
 * Queues a report of something `subject` did, for `observer`. Returns the report
 * id (an existing one when this adds nothing new).
 */
export function recordObservation(
  sim: Simulation, observer: number, subject: number, kind: WorldEventKind, location: ClaimSector | null, opts: ObservationOptions = {},
): number {
  const ev = opts.eventId !== undefined ? sim.worldEvents.find((e) => e.id === opts.eventId) : recordEvent(sim, kind, subject, opts.magnitude ?? 1, location);
  const eventId = ev?.id ?? opts.eventId ?? -1;
  const certainty = opts.certainty ?? 'observed';
  // One report per event per recipient, unless the new one is surer.
  const prior = sim.reports.filter((r) => r.recipientKingdomId === observer && r.eventId === eventId && !r.superseded);
  const best = prior.sort((a, b) => RANK[b.certainty] - RANK[a.certainty])[0];
  if (best && RANK[best.certainty] >= RANK[certainty]) return best.id;
  const delay = opts.delay === undefined ? 0 : opts.delay;
  const r: NewsReport = {
    id: sim.allocId(), eventId, kind, sourceKingdomId: opts.sourceKingdomId ?? null, sourceKind: opts.source ?? 'scout',
    subjectKingdomId: subject, recipientKingdomId: observer, certainty,
    observedTick: sim.tick, arrivalTick: delay === null ? null : sim.tick + delay,
    supersedes: best?.id ?? null, superseded: false, delivered: false,
    magnitude: opts.magnitude ?? ev?.magnitude ?? 1,
    location: location ? { ...location } : null,
    relayedBy: [...(opts.relayedBy ?? [])],
    eventTick: ev?.tick ?? sim.tick,
  };
  sim.reports.push(r);
  return r.id;
}

function deliver(sim: Simulation, r: NewsReport): void {
  r.delivered = true;
  if (r.supersedes !== null) {
    const old = sim.reports.find((x) => x.id === r.supersedes);
    if (old) old.superseded = true;
  }
  sim.newsFlags.add(r.recipientKingdomId);
}

/** Moves every report whose time has come into its recipient's knowledge, keeping inboxes bounded. */
export function deliverReports(sim: Simulation): void {
  for (const r of sim.reports) if (!r.delivered && r.arrivalTick !== null && r.arrivalTick <= sim.tick) deliver(sim, r);
  // Bound each recipient's delivered news; the oldest are summarised as a count.
  const byRecipient = new Map<number, NewsReport[]>();
  for (const r of sim.reports) {
    if (!r.delivered) continue;
    const list = byRecipient.get(r.recipientKingdomId) ?? [];
    list.push(r);
    byRecipient.set(r.recipientKingdomId, list);
  }
  const drop = new Set<number>();
  for (const [who, list] of byRecipient) {
    if (list.length <= INBOX_LIMIT) continue;
    list.sort((a, b) => a.arrivalTick! - b.arrivalTick!);
    const extra = list.length - INBOX_LIMIT;
    for (let i = 0; i < extra; i++) drop.add(list[i].id);
    sim.newsSummaries.set(who, (sim.newsSummaries.get(who) ?? 0) + extra);
  }
  if (drop.size) sim.reports = sim.reports.filter((r) => !drop.has(r.id));
}

/** Merchant-carried news arrives with a merchant. */
export function deliverMerchantNews(sim: Simulation, recipient: number): void {
  for (const r of sim.reports) {
    if (r.delivered || r.recipientKingdomId !== recipient || r.arrivalTick !== null) continue;
    r.arrivalTick = sim.tick;
    deliver(sim, r);
  }
}

/** What a kingdom has actually been told, newest first. */
export function knowledgeOf(sim: Simulation, recipient: number): NewsReport[] {
  return sim.reports.filter((r) => r.recipientKingdomId === recipient && r.delivered).sort((a, b) => b.arrivalTick! - a.arrivalTick!);
}

/** The most recent thing a kingdom knows of this kind about a subject (by when it happened, not when it arrived). */
export function latestAbout(sim: Simulation, recipient: number, subject: number, kind: WorldEvent['kind']): NewsReport | null {
  let best: NewsReport | null = null;
  for (const r of sim.reports) {
    if (!r.delivered || r.superseded || r.recipientKingdomId !== recipient || r.subjectKingdomId !== subject || r.kind !== kind) continue;
    if (!best || r.eventTick > best.eventTick || (r.eventTick === best.eventTick && RANK[r.certainty] > RANK[best.certainty])) best = r;
  }
  return best;
}

/** Passes a delivered report on (an ally sharing news). The event id and chain of relayers are kept. */
export function relayReport(sim: Simulation, reportId: number, to: number, delay = 0): number | null {
  const r = sim.reports.find((x) => x.id === reportId);
  if (!r || !r.delivered || to === r.recipientKingdomId) return null;
  return recordObservation(sim, to, r.subjectKingdomId, r.kind, r.location, {
    eventId: r.eventId, certainty: r.certainty, source: 'ally', delay, magnitude: r.magnitude,
    sourceKingdomId: r.recipientKingdomId, relayedBy: [...r.relayedBy, r.recipientKingdomId],
  });
}
