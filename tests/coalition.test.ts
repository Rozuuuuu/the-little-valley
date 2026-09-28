import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { applyCommand } from '../src/game/sim/commands';
import { assessCampaign } from '../src/game/sim/campaigns';
import { knowledgeOf } from '../src/game/sim/news';
import { sectorOf } from '../src/game/sim/territory';
import type { Simulation } from '../src/game/sim/Simulation';
import { runUntil } from './helpers';
import { realm, reload } from './realm-helpers';

function coins(sim: Simulation): number {
  let n = 0;
  for (const k of sim.kingdoms) n += k.treasury;
  for (const o of sim.offers) n += o.escrow;
  for (const c of sim.commitments) n += c.escrow;
  return n;
}

/** A realm allied with A and B, planning a limited war against C. */
function council() {
  const r = realm();
  const { sim, me, a, b, c } = r;
  sim.setStance(me.id, a.id, 'ally');
  sim.setStance(me.id, b.id, 'ally');
  sim.setTrust(a.id, me.id, 80);
  sim.setTrust(b.id, me.id, 55);
  const plan = applyCommand(sim, { type: 'createWarPlan', target: c.id, objective: 'raid' });
  expect(plan.ok, plan.message).toBe(true);
  return { ...r, planId: plan.id! };
}

function reply(sim: Simulation, id: number) {
  runUntil(sim, () => sim.commitments.find((x) => x.id === id)!.state !== 'proposed', DAY_TICKS * 3);
  return sim.commitments.find((x) => x.id === id)!;
}

describe('war council', () => {
  it('a war plan is private: nobody else hears of it', () => {
    const { sim, c, a } = council();
    for (const k of [a.id, c.id]) expect(knowledgeOf(sim, k).some((r) => r.kind === 'war-declared')).toBe(false);
    expect(sim.worldEvents.some((e) => e.kind === 'war-declared')).toBe(false);
  });

  it('allies answer with reasons: accept, counter-offer or refuse — never becoming enemies — and the same request is not re-rolled', () => {
    const { sim, a, b, planId, me } = council();
    const ra = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: a.id, terms: { companies: 1, coinFee: 40, supplyPayer: 'requester', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    expect(ra.ok, ra.message).toBe(true);
    const ca = reply(sim, ra.id!);
    expect(['countered', 'accepted', 'refused']).toContain(ca.state);
    expect(ca.reasons.length).toBeGreaterThan(0);
    const rb = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: b.id, terms: { companies: 3, coinFee: 0, supplyPayer: 'contributor', serviceDays: 20, commandRights: 'delegated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    const cb = reply(sim, rb.id!);
    expect(cb.state).not.toBe('accepted');
    expect(sim.stanceOf(me.id, b.id)).toBe('ally');
    // Asking again with identical terms gives the same answer, not a new roll.
    const again = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: b.id, terms: { companies: 3, coinFee: 0, supplyPayer: 'contributor', serviceDays: 20, commandRights: 'delegated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/same|already|change/i);
  });

  it('accepting escrows the fee, reserves real companies exclusively, and keeps a defence reserve', () => {
    const { sim, a, planId, c } = council();
    const total = coins(sim);
    const req = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: a.id, terms: { companies: 1, coinFee: 60, supplyPayer: 'shared', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    let cm = reply(sim, req.id!);
    if (cm.state === 'countered') {
      expect(applyCommand(sim, { type: 'acceptCampaignOffer', commitmentId: cm.id }).ok).toBe(true);
    } else if (cm.state === 'accepted') {
      // already accepted by the ally's own reply
    }
    cm = sim.commitments.find((x) => x.id === req.id)!;
    if (cm.state !== 'accepted') return; // a refusal is a valid answer; covered elsewhere
    expect(coins(sim)).toBe(total);
    expect(cm.escrow).toBe(cm.terms.coinFee);
    const pledged = a.companies.filter((q) => q.pledgedTo === cm.id);
    expect(pledged).toHaveLength(cm.terms.companies.length);
    expect(a.companies.some((q) => q.pledgedTo === null)).toBe(true); // a defence reserve stays home
    // A second plan cannot pledge the same companies.
    const plan2 = applyCommand(sim, { type: 'createWarPlan', target: c.id, objective: 'raid' });
    const req2 = applyCommand(sim, { type: 'requestCampaignSupport', planId: plan2.id!, ally: a.id, terms: { companies: a.companies.length, coinFee: 200, supplyPayer: 'requester', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    expect(req2.ok).toBe(false);
    expect(req2.message).toMatch(/companies|reserve|already pledged/i);
  });

  it('cannot afford the fee → refused without charge; cancelling the war refunds unearned escrow and releases troops', () => {
    const { sim, me, a, planId } = council();
    me.treasury = 10;
    const bad = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: a.id, terms: { companies: 1, coinFee: 90, supplyPayer: 'requester', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/coins|treasury/i);
    me.treasury = 400;
    const total = coins(sim);
    const req = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: a.id, terms: { companies: 1, coinFee: 50, supplyPayer: 'requester', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    const cm = reply(sim, req.id!);
    if (cm.state === 'countered') applyCommand(sim, { type: 'acceptCampaignOffer', commitmentId: cm.id });
    expect(applyCommand(sim, { type: 'cancelWarPlan', planId }).ok).toBe(true);
    expect(coins(sim)).toBe(total);
    expect(me.treasury).toBe(400);
    expect(a.companies.every((q) => q.pledgedTo === null)).toBe(true);
    expect(sim.commitments.find((x) => x.id === req.id)!.state).toBe('cancelled');
  });

  it('land rewards must be the target\'s frontier and can be promised to only one ally', () => {
    const { sim, a, b, c, planId } = council();
    const cap = sectorOf(c.capital!.x, c.capital!.y);
    const core = { x: cap.x, y: cap.y };
    const ring = { x: cap.x + 2, y: cap.y };
    const t = (rewardSectors: { x: number; y: number }[], ally: number) =>
      applyCommand(sim, { type: 'requestCampaignSupport', planId, ally, terms: { companies: 1, coinFee: 20, supplyPayer: 'requester', serviceDays: 4, commandRights: 'coordinated', rewardSectors, reciprocalDefenseDays: 0 } });
    expect(t([core], a.id).message).toMatch(/protected|homeland/i);
    expect(t([{ x: 50, y: 50 }], a.id).message).toMatch(/belong|not .*target/i);
    expect(t([ring], a.id).ok).toBe(true);
    expect(t([ring], b.id).message).toMatch(/already promised/i);
  });

  it('the assessment gives a strength range from reports, and counts only allies that have arrived', () => {
    const { sim, a, planId } = council();
    const req = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: a.id, terms: { companies: 1, coinFee: 40, supplyPayer: 'shared', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    const cm = reply(sim, req.id!);
    if (cm.state === 'countered') applyCommand(sim, { type: 'acceptCampaignOffer', commitmentId: cm.id });
    const as = assessCampaign(sim, planId);
    expect(as.enemy.known).toBe(false);
    expect(as.enemy.range).toBeNull();
    expect(as.allies.arrived).toBe(0);
    expect(as.blockers.join(' ')).toMatch(/army|barracks|soldiers/i);
    const loaded = reload(sim);
    expect(loaded.warPlans).toHaveLength(1);
    expect(loaded.commitments.map((x) => x.state)).toEqual(sim.commitments.map((x) => x.state));
  });

  it('two allies: one lends archers for supplies, the other wants payment and a short service; neither counts until it arrives', () => {
    const { sim, a, b, planId } = council();
    const r1 = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: a.id, terms: { companies: 1, coinFee: 0, supplyPayer: 'requester', serviceDays: 6, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0, unit: 'archer' } });
    const r2 = applyCommand(sim, { type: 'requestCampaignSupport', planId, ally: b.id, terms: { companies: 1, coinFee: 0, supplyPayer: 'contributor', serviceDays: 12, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    const c1 = reply(sim, r1.id!);
    const c2 = reply(sim, r2.id!);
    for (const cm of [c1, c2]) expect(cm.reasons.length).toBeGreaterThan(0);
    // b trusts us less: it asks for coins or a shorter term rather than giving freely.
    if (c2.state === 'countered') expect(c2.terms.coinFee > 0 || c2.terms.serviceDays < 12).toBe(true);
    const as = assessCampaign(sim, planId);
    expect(as.allies.arrived).toBe(0);
    expect(as.allies.pledged + as.allies.proposed).toBeGreaterThan(0);
  });
});
