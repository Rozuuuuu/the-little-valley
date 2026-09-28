import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { applyCommand } from '../src/game/sim/commands';
import { evaluateConcern, updateConcern } from '../src/game/sim/concern';
import { trustOf } from '../src/game/sim/diplomacy';
import { deliverReports, recordEvent, recordObservation } from '../src/game/sim/news';
import { run } from './helpers';
import { realm } from './realm-helpers';

describe('concern from known evidence', () => {
  it('forces nobody has seen do not raise concern; a queued report does not until it arrives', () => {
    const { sim, me, a } = realm();
    const before = evaluateConcern(sim, a.id, me.id).score;
    const ev = recordEvent(sim, 'border-forces', me.id, 6, { x: 5, y: 0 });
    expect(evaluateConcern(sim, a.id, me.id).score).toBe(before);
    recordObservation(sim, a.id, me.id, 'border-forces', { x: 5, y: 0 }, { eventId: ev.id, certainty: 'observed', source: 'border', delay: DAY_TICKS });
    expect(evaluateConcern(sim, a.id, me.id).score).toBe(before);
    run(sim, DAY_TICKS + 10);
    const after = evaluateConcern(sim, a.id, me.id);
    expect(after.score).toBeGreaterThan(before);
    expect(after.reasons.join(' ')).toMatch(/troops|forces|soldiers/i);
  });

  it('prosperity alone never goes past watchful', () => {
    const { sim, me, a } = realm();
    for (let i = 0; i < 12; i++) {
      const ev = recordEvent(sim, 'prosperity', me.id, 10, null);
      recordObservation(sim, a.id, me.id, 'prosperity', null, { eventId: ev.id, certainty: 'confirmed', source: 'envoy', delay: 0 });
    }
    deliverReports(sim);
    const c = evaluateConcern(sim, a.id, me.id);
    expect(c.score).toBeLessThan(50);
    expect(['calm', 'watchful']).toContain(c.band);
  });

  it('a rumour cannot prove aggression or a broken promise', () => {
    const { sim, me, a } = realm();
    for (const kind of ['conquest', 'treaty-broken'] as const) {
      const ev = recordEvent(sim, kind, me.id, 1, null);
      recordObservation(sim, a.id, me.id, kind, null, { eventId: ev.id, certainty: 'rumor', source: 'merchant', delay: 0 });
    }
    deliverReports(sim);
    const c = evaluateConcern(sim, a.id, me.id);
    expect(c.reasons.join(' ')).not.toMatch(/conquer|broke/i);
    expect(c.band === 'calm' || c.band === 'watchful').toBe(true);
  });

  it('a confirmed change gives exactly one warning, with its reasons and choices; the band only falls well below its threshold', () => {
    const { sim, me, a } = realm();
    const warn = () => sim.warnings.filter((w) => w.from === a.id);
    for (let i = 0; i < 3; i++) {
      const ev = recordEvent(sim, 'border-forces', me.id, 8, { x: 4, y: 0 });
      recordObservation(sim, a.id, me.id, 'border-forces', { x: 4, y: 0 }, { eventId: ev.id, certainty: 'confirmed', source: 'border', delay: 0 });
    }
    deliverReports(sim);
    updateConcern(sim, true);
    updateConcern(sim, true);
    expect(warn()).toHaveLength(1);
    const w = warn()[0];
    expect(w.reasons.length).toBeGreaterThan(0);
    expect(w.actions).toEqual(['reassure', 'investigate', 'negotiate', 'propose-pact', 'prepare', 'dismiss']);
    const st = sim.concernStates.get(`${a.id}>${me.id}`)!;
    const entered = st.band;
    expect(['concerned', 'alarmed']).toContain(entered);
    // Nudge the score a little below the entry threshold: the band holds.
    st.score -= 5;
    updateConcern(sim, true);
    expect(sim.concernStates.get(`${a.id}>${me.id}`)!.band).toBe(entered);
  });

  it('reassuring a worried neighbour helps, but troops seen afterwards cost more trust than was gained', () => {
    const { sim, me, a } = realm();
    const ev = recordEvent(sim, 'border-forces', me.id, 8, { x: 4, y: 0 });
    recordObservation(sim, a.id, me.id, 'border-forces', { x: 4, y: 0 }, { eventId: ev.id, certainty: 'confirmed', source: 'border', delay: 0 });
    for (let i = 0; i < 2; i++) {
      const e2 = recordEvent(sim, 'border-forces', me.id, 8, { x: 4, y: 0 });
      recordObservation(sim, a.id, me.id, 'border-forces', { x: 4, y: 0 }, { eventId: e2.id, certainty: 'confirmed', source: 'border', delay: 0 });
    }
    deliverReports(sim);
    updateConcern(sim, true);
    const w = sim.warnings.find((x) => x.from === a.id)!;
    const t0 = trustOf(sim, a.id, me.id);
    expect(applyCommand(sim, { type: 'respondToWarning', warningId: w.id, action: 'reassure' }).ok).toBe(true);
    const t1 = trustOf(sim, a.id, me.id);
    expect(t1).toBeGreaterThan(t0);
    const e3 = recordEvent(sim, 'border-forces', me.id, 9, { x: 4, y: 0 });
    recordObservation(sim, a.id, me.id, 'border-forces', { x: 4, y: 0 }, { eventId: e3.id, certainty: 'confirmed', source: 'border', delay: 0 });
    deliverReports(sim);
    updateConcern(sim, true);
    expect(trustOf(sim, a.id, me.id)).toBeLessThan(t0);
    expect(applyCommand(sim, { type: 'respondToWarning', warningId: w.id, action: 'reassure' }).message).toMatch(/already/i);
  });

  it('an ally growing stronger does not alarm you the way a stranger would', () => {
    const { sim, me, a, b } = realm();
    sim.setStance(me.id, a.id, 'ally');
    for (const k of [a, b]) {
      const ev = recordEvent(sim, 'military-buildup', k.id, 8, null);
      recordObservation(sim, me.id, k.id, 'military-buildup', null, { eventId: ev.id, certainty: 'confirmed', source: 'envoy', delay: 0 });
    }
    deliverReports(sim);
    expect(evaluateConcern(sim, me.id, a.id).score).toBeLessThan(evaluateConcern(sim, me.id, b.id).score);
  });

  it('kingdoms watch each other too: an AI kingdom becomes concerned about another from what it has heard', () => {
    const { sim, a, b } = realm();
    for (let i = 0; i < 3; i++) {
      const ev = recordEvent(sim, 'border-forces', b.id, 8, null);
      recordObservation(sim, a.id, b.id, 'border-forces', null, { eventId: ev.id, certainty: 'confirmed', source: 'scout', delay: 0 });
    }
    deliverReports(sim);
    updateConcern(sim, true);
    expect(['concerned', 'alarmed']).toContain(sim.concernStates.get(`${a.id}>${b.id}`)!.band);
    // The player hears nothing of it without a source.
    expect(sim.warnings.filter((w) => w.to === b.id)).toHaveLength(0);
  });
});
