import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { applyCommand } from '../src/game/sim/commands';
import { playerKingdom } from '../src/game/sim/kingdoms';
import { activeTreaty, openIncident, stanceOf, trustOf } from '../src/game/sim/diplomacy';
import { knowledgeOf } from '../src/game/sim/news';
import { canEnterTerritory, sectorOf } from '../src/game/sim/territory';
import type { Simulation } from '../src/game/sim/Simulation';
import { run, runUntil } from './helpers';
import { realm, reload } from './realm-helpers';

function coinsHeld(sim: Simulation): number {
  let n = 0;
  for (const k of sim.kingdoms) n += k.treasury;
  for (const o of sim.offers) n += o.escrow;
  for (const c of sim.commitments) n += c.escrow;
  return n;
}

function answer(sim: Simulation, offerId: number) {
  runUntil(sim, () => sim.offers.find((o) => o.id === offerId)!.state !== 'proposed', DAY_TICKS * 3);
  return sim.offers.find((o) => o.id === offerId)!;
}

describe('treaties', () => {
  it('proposing needs a crowned ruler and an envoy; payments are held in escrow until the answer', () => {
    const { sim, me, a } = realm();
    const k = playerKingdom(sim);
    const total = coinsHeld(sim);
    const res = applyCommand(sim, { type: 'proposeTreaty', kind: 'trade', to: a.id, terms: { durationDays: 8, payment: 30 } });
    expect(res.ok, res.message).toBe(true);
    expect(k.treasury).toBe(400 - 30);
    expect(coinsHeld(sim)).toBe(total);
    const o = answer(sim, res.id!);
    expect(['active', 'rejected']).toContain(o.state);
    expect(o.reasons.length).toBeGreaterThan(0);
    expect(coinsHeld(sim)).toBe(total);
    if (o.state === 'rejected') expect(k.treasury).toBe(400);
    else expect(activeTreaty(sim, me.id, a.id, 'trade')).toBeTruthy();
    // No envoy, no letters.
    applyCommand(sim, { type: 'appointCouncil', post: 'envoy', settlerId: null });
    expect(applyCommand(sim, { type: 'proposeTreaty', kind: 'passage', to: a.id, terms: { durationDays: 4 } }).message).toMatch(/envoy/i);
  });

  it('the same offer twice is refused, and an expired offer cannot be accepted', () => {
    const { sim, a } = realm();
    const first = applyCommand(sim, { type: 'proposeTreaty', kind: 'nonAggression', to: a.id, terms: { durationDays: 8 } });
    expect(first.ok).toBe(true);
    expect(applyCommand(sim, { type: 'proposeTreaty', kind: 'nonAggression', to: a.id, terms: { durationDays: 8 } }).message).toMatch(/already/i);
    // An AI offer to the player that expires unanswered.
    const offer = sim.makeOffer(a.id, 0, 'trade', { durationDays: 6, payment: 0 }, 50);
    run(sim, 60);
    expect(offer.state).toBe('expired');
    expect(applyCommand(sim, { type: 'respondToOffer', offerId: offer.id, accept: true }).message).toMatch(/expired|no longer/i);
  });

  it('refusing an alliance does not make an enemy', () => {
    const { sim, me, a } = realm();
    const offer = sim.makeOffer(a.id, me.id, 'defensiveAlliance', { durationDays: 16, payment: 0 }, DAY_TICKS);
    expect(applyCommand(sim, { type: 'respondToOffer', offerId: offer.id, accept: false }).ok).toBe(true);
    expect(stanceOf(sim, me.id, a.id)).toBe('neutral');
    expect(offer.state).toBe('rejected');
  });

  it('refuses incompatible promises: an alliance with two kingdoms at war with each other', () => {
    const { sim, me, a, b } = realm();
    sim.setWar(a.id, b.id, true);
    sim.setStance(me.id, a.id, 'ally');
    const res = applyCommand(sim, { type: 'proposeTreaty', kind: 'defensiveAlliance', to: b.id, terms: { durationDays: 16 } });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/at war|ally/i);
  });

  it('a passage agreement opens armed passage through frontier land, never a protected core', () => {
    const { sim, me, a } = realm();
    const offer = sim.makeOffer(a.id, me.id, 'passage', { durationDays: 8, payment: 0 }, DAY_TICKS);
    expect(applyCommand(sim, { type: 'respondToOffer', offerId: offer.id, accept: true }).ok).toBe(true);
    expect(offer.state).toBe('active');
    const cap = sectorOf(a.capital!.x, a.capital!.y);
    expect(canEnterTerritory(sim, me.id, { x: cap.x + 2, y: cap.y }, true).allowed).toBe(true);
    expect(canEnterTerritory(sim, me.id, cap, true).allowed).toBe(false);
  });

  it('ending a treaty early is a breach others hear about; it lowers trust', () => {
    const { sim, me, a, b } = realm();
    const offer = sim.makeOffer(a.id, me.id, 'nonAggression', { durationDays: 16, payment: 0 }, DAY_TICKS);
    applyCommand(sim, { type: 'respondToOffer', offerId: offer.id, accept: true });
    const t0 = trustOf(sim, a.id, me.id);
    const res = applyCommand(sim, { type: 'cancelTreaty', offerId: offer.id });
    expect(res.ok).toBe(true);
    expect(offer.state).toBe('breached');
    expect(trustOf(sim, a.id, me.id)).toBeLessThan(t0);
    run(sim, DAY_TICKS * 2);
    expect(knowledgeOf(sim, a.id).some((r) => r.kind === 'treaty-broken' && r.subjectKingdomId === me.id)).toBe(true);
    void b;
  });

  it('treaties run their course and expire; state survives a reload', () => {
    const { sim, me, a } = realm();
    const offer = sim.makeOffer(a.id, me.id, 'trade', { durationDays: 1, payment: 0 }, DAY_TICKS);
    applyCommand(sim, { type: 'respondToOffer', offerId: offer.id, accept: true });
    const loaded = reload(sim);
    expect(loaded.offers.find((o) => o.id === offer.id)!.state).toBe('active');
    run(loaded, DAY_TICKS + 60);
    expect(loaded.offers.find((o) => o.id === offer.id)!.state).toBe('fulfilled');
    expect(activeTreaty(loaded, me.id, a.id, 'trade')).toBeFalsy();
  });
});

describe('border incidents', () => {
  it('civilian passage, armed passage and a hostile attack are different things; a first intrusion allows talks', () => {
    const { sim, me, a } = realm();
    const civ = openIncident(sim, 'civilianPassage', a.id, me.id, { x: 4, y: 0 });
    const arm = openIncident(sim, 'armedPassage', a.id, me.id, { x: 4, y: 0 });
    expect(civ.kind).not.toBe(arm.kind);
    expect(openIncident(sim, 'hostileAttack', a.id, me.id, { x: 4, y: 0 }).state).toBe('refused');
    const res = applyCommand(sim, { type: 'respondToIncident', incidentId: arm.id, response: 'askWithdraw' });
    expect(res.ok).toBe(true);
    expect(arm.state).toBe('withdrawn');
    expect(stanceOf(sim, me.id, a.id)).not.toBe('enemy');
  });
});
