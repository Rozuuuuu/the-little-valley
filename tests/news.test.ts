import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { INBOX_LIMIT } from '../src/game/data/treaties';
import { deliverReports, knowledgeOf, latestAbout, recordEvent, recordObservation, relayReport } from '../src/game/sim/news';
import { run, runUntil } from './helpers';
import { realm, reload } from './realm-helpers';

describe('source-aware news', () => {
  it('a queued report is not knowledge until it arrives', () => {
    const { sim, me, a } = realm();
    const ev = recordEvent(sim, 'military-buildup', a.id, 3, null);
    recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: ev.id, certainty: 'observed', source: 'scout', delay: 200 });
    deliverReports(sim);
    expect(knowledgeOf(sim, me.id)).toHaveLength(0);
    run(sim, 210);
    const k = knowledgeOf(sim, me.id);
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ subjectKingdomId: a.id, certainty: 'observed', sourceKind: 'scout', eventId: ev.id });
    expect(k[0].arrivalTick).toBeGreaterThan(k[0].observedTick);
  });

  it('late reports never overwrite newer knowledge, and duplicates are dropped', () => {
    const { sim, me, a } = realm();
    const old = recordEvent(sim, 'military-buildup', a.id, 2, null);
    run(sim, 50);
    const fresh = recordEvent(sim, 'military-buildup', a.id, 6, null);
    recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: fresh.id, certainty: 'observed', source: 'scout', delay: 10 });
    recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: old.id, certainty: 'observed', source: 'merchant-letter', delay: 300 });
    recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: fresh.id, certainty: 'observed', source: 'scout', delay: 20 });
    run(sim, 320);
    expect(knowledgeOf(sim, me.id).filter((r) => r.eventId === fresh.id)).toHaveLength(1);
    expect(latestAbout(sim, me.id, a.id, 'military-buildup')!.magnitude).toBe(6);
  });

  it('a confirmed report corrects an earlier rumour about the same thing', () => {
    const { sim, me, a } = realm();
    const ev = recordEvent(sim, 'military-buildup', a.id, 4, null);
    const rumour = recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: 0, magnitude: 9 });
    deliverReports(sim);
    expect(latestAbout(sim, me.id, a.id, 'military-buildup')!.magnitude).toBe(9);
    const conf = recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: ev.id, certainty: 'confirmed', source: 'envoy', delay: 0 });
    deliverReports(sim);
    const now = latestAbout(sim, me.id, a.id, 'military-buildup')!;
    expect(now.id).toBe(conf);
    expect(now.supersedes).toBe(rumour);
    expect(now.magnitude).toBe(4);
  });

  it('relayed reports keep the original event, so passing news around is not independent corroboration', () => {
    const { sim, me, a, b } = realm();
    const ev = recordEvent(sim, 'military-buildup', b.id, 5, null);
    const r1 = recordObservation(sim, a.id, b.id, 'military-buildup', null, { eventId: ev.id, certainty: 'observed', source: 'scout', delay: 0 });
    deliverReports(sim);
    relayReport(sim, r1, me.id, 30);
    run(sim, 40);
    // Relaying back to A adds no second copy of the same event.
    const mine = knowledgeOf(sim, me.id).find((r) => r.eventId === ev.id)!;
    relayReport(sim, mine.id, a.id, 0);
    deliverReports(sim);
    expect(knowledgeOf(sim, a.id).filter((r) => r.eventId === ev.id)).toHaveLength(1);
    expect(mine.sourceKingdomId).toBe(a.id);
    expect(mine.relayedBy).toContain(a.id);
  });

  it('merchant-carried news waits for a merchant; with no inn it never arrives', () => {
    const { sim, me, a } = realm();
    const ev = recordEvent(sim, 'prosperity', a.id, 1, null);
    recordObservation(sim, me.id, a.id, 'prosperity', null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: null });
    run(sim, DAY_TICKS * 3);
    expect(knowledgeOf(sim, me.id)).toHaveLength(0);
    expect(sim.reports.some((r) => !r.delivered)).toBe(true);
  });

  it('a report still on its way survives a reload and arrives once', () => {
    const { sim, me, a } = realm();
    const ev = recordEvent(sim, 'claim', a.id, 1, { x: 9, y: 9 });
    recordObservation(sim, me.id, a.id, 'claim', { x: 9, y: 9 }, { eventId: ev.id, certainty: 'observed', source: 'scout', delay: 300 });
    const loaded = reload(sim);
    runUntil(loaded, () => knowledgeOf(loaded, me.id).length > 0, 400);
    run(loaded, 100);
    expect(knowledgeOf(loaded, me.id)).toHaveLength(1);
  });

  it('news never reveals fog, unknown places stay unknown, and inboxes stay bounded', () => {
    const { sim, me, a } = realm();
    const explored = sim.world.exploredTileCount();
    for (let i = 0; i < INBOX_LIMIT + 25; i++) {
      const ev = recordEvent(sim, 'military-buildup', a.id, 1, i % 2 ? { x: 40 + i, y: -40 } : null);
      recordObservation(sim, me.id, a.id, 'military-buildup', i % 2 ? { x: 40 + i, y: -40 } : null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: 0 });
    }
    deliverReports(sim);
    expect(sim.world.exploredTileCount()).toBe(explored);
    expect(knowledgeOf(sim, me.id).length).toBeLessThanOrEqual(INBOX_LIMIT);
    expect(sim.newsSummaries.get(me.id)).toBeGreaterThan(0);
    expect(knowledgeOf(sim, me.id).some((r) => r.location === null)).toBe(true);
  });
});

describe('realm panels show only what the player knows', () => {
  it('news items name source, certainty and age; strangers never reveal how many soldiers they could spare', async () => {
    const { newsInfo, warCouncilInfo, diplomacyInfo } = await import('../src/engine/kingdomSnapshot');
    const { sim, me, a, b } = realm();
    const ev = recordEvent(sim, 'military-buildup', a.id, 5, null);
    recordObservation(sim, me.id, a.id, 'military-buildup', null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: 0 });
    deliverReports(sim);
    const n = newsInfo(sim);
    expect(n.items[0].text).toMatch(new RegExp(`${a.name} raised soldiers`));
    expect(n.items[0].certainty).toBe('rumor');
    expect(n.items[0].where).toBe('place unknown');
    expect(warCouncilInfo(sim).allies).toEqual([]);
    sim.setStance(me.id, b.id, 'ally');
    expect(warCouncilInfo(sim).allies.map((x) => x.id)).toEqual([b.id]);
    const d = diplomacyInfo(sim);
    expect(d.kingdoms.find((k) => k.id === b.id)!.stance).toBe('ally');
    expect(JSON.stringify(d)).not.toMatch(/companies/);
  });
});
