import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { POLICIES } from '../src/game/data/kingdoms';
import { MILESTONES } from '../src/game/data/progression';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { playerKingdom } from '../src/game/sim/kingdoms';
import { createNewGame } from '../src/game/sim/newGame';
import { requirementProgress } from '../src/game/sim/progression';
import type { Simulation } from '../src/game/sim/Simulation';
import { instant, run, runUntil } from './helpers';

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Crown', createdAt: 0 })))));
}

function regionReady(seed = 4040) {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet', 'village', 'town');
  return sim;
}

const identity = { rulerName: 'Queen Alder', kingdomName: 'Alderholt', banner: { color: '#3a6ea5', emblem: 'oak' } };

describe('the kingdom', () => {
  it('exists from the start; allegiance is separate from which settlement someone lives in', () => {
    const sim = createNewGame(1);
    const k = playerKingdom(sim);
    expect(k.crowned).toBe(false);
    expect(sim.settlers.every((s) => s.kingdomId === k.id)).toBe(true);
    sim.progression.reached.push('hamlet', 'village');
    for (let x = 0; x >= -60; x -= 4) sim.world.reveal(x, 0, 10);
    const hall = instant(sim, 'waystation', { x: -40, y: 0 });
    applyCommand(sim, { type: 'assignSettlement', ids: [sim.settlers[0].id], settlementId: hall.id });
    expect(sim.settlers[0].kingdomId).toBe(k.id);
    expect(sim.settlers[0].settlementId).toBe(hall.id);
  });

  it('Region is a real milestone now, and reaching it never removes earlier ones', () => {
    expect(MILESTONES.region.future).toBeFalsy();
    const sim = regionReady();
    const reqs = MILESTONES.region.requirements.map((r) => requirementProgress(sim, r));
    expect(reqs.length).toBeGreaterThan(1);
    expect(sim.progression.reached).toEqual(['camp', 'hamlet', 'village', 'town']);
  });

  it('coronation is an explicit command, only at Region, only once, and checks the identity given', () => {
    const sim = regionReady();
    expect(applyCommand(sim, { type: 'coronate', ...identity }).message).toMatch(/Region/);
    sim.progression.reached.push('region');
    expect(playerKingdom(sim).crowned).toBe(false);
    for (const bad of [
      { ...identity, rulerName: '' },
      { ...identity, kingdomName: 'x'.repeat(60) },
      { ...identity, banner: { color: 'red; drop table', emblem: 'oak' } },
      { ...identity, banner: { color: '#3a6ea5', emblem: 'skull-and-bones' } },
    ]) expect(applyCommand(sim, { type: 'coronate', ...bad }).ok).toBe(false);
    const res = applyCommand(sim, { type: 'coronate', ...identity });
    expect(res.ok, res.message).toBe(true);
    const k = playerKingdom(sim);
    expect(k.crowned).toBe(true);
    expect(k.ruler!.name).toBe('Queen Alder');
    expect(k.name).toBe('Alderholt');
    expect(k.homeland!.length).toBeGreaterThan(0);
    expect(applyCommand(sim, { type: 'coronate', ...identity }).message).toMatch(/already/);
    expect(sim.chronicle.some((c) => /crowned/i.test(c.text))).toBe(true);
    expect(reload(sim).kingdoms.find((x) => x.player)!.ruler!.name).toBe('Queen Alder');
  });

  it('taxes apply only to trade that happens: an exact share of each deal, paid by the merchant', () => {
    const sim = regionReady(3131);
    sim.progression.reached.push('region');
    campOf(sim)!.inventory = { food: 100, tools: 20, wood: 40 };
    instant(sim, 'storehouse', { x: -8, y: -8 });
    instant(sim, 'inn', { x: 6, y: -6 });
    expect(applyCommand(sim, { type: 'setPolicy', policy: 'modest' }).ok).toBe(true);
    const k = playerKingdom(sim);
    run(sim, DAY_TICKS);
    expect(k.treasury).toBe(0); // no trade, no tax
    runUntil(sim, () => sim.parties.some((p) => p.state === 'lodging'), DAY_TICKS * 5);
    const p = sim.parties.find((x) => x.state === 'lodging')!;
    const purse = p.coins;
    // Sell 5 tools for coins.
    const res = applyCommand(sim, { type: 'barter', partyId: p.id, give: { tools: 5 }, take: {}, coins: -20 });
    expect(res.ok, res.message).toBe(true);
    const tax = Math.floor(20 * POLICIES.modest.tradeTax);
    expect(k.treasury).toBe(20 + tax);
    expect(p.coins).toBe(purse - 20 - tax);
    expect(k.taxCollected).toBe(tax);
    // Paying more coins than the treasury holds is refused.
    expect(applyCommand(sim, { type: 'barter', partyId: p.id, give: {}, take: { [Object.keys(p.stock)[0]]: 1 }, coins: 10000 }).ok).toBe(false);
  });

  it('policies move public trust each day, explicitly, and low trust turns would-be settlers away', () => {
    const sim = regionReady();
    const k = playerKingdom(sim);
    const t0 = k.trust;
    applyCommand(sim, { type: 'setPolicy', policy: 'high' });
    const d0 = sim.day;
    runUntil(sim, () => sim.day === d0 + 2, DAY_TICKS * 3);
    run(sim, 1);
    expect(k.trust).toBe(t0 + 2 * POLICIES.high.trustPerDay);
    applyCommand(sim, { type: 'setPolicy', policy: 'none' });
    runUntil(sim, () => sim.day === d0 + 3, DAY_TICKS * 2);
    run(sim, 1);
    expect(k.trust).toBe(t0 + 2 * POLICIES.high.trustPerDay + POLICIES.none.trustPerDay);
    k.trust = 10;
    campOf(sim)!.inventory.food = 200;
    instant(sim, 'house', { x: 5, y: -5 });
    runUntil(sim, () => sim.offer !== null, DAY_TICKS);
    expect(applyCommand(sim, { type: 'acceptRecruit', offerId: sim.offer!.id, settlementId: sim.settlements[0].id }).message).toMatch(/trust|tax/i);
    expect(applyCommand(sim, { type: 'setPolicy', policy: 'crushing' }).ok).toBe(false);
  });

  it('council posts take real adults off ordinary work, visibly, and children are refused', () => {
    const sim = regionReady();
    const s = sim.settlers[0];
    expect(applyCommand(sim, { type: 'appointCouncil', post: 'steward', settlerId: s.id }).ok).toBe(true);
    expect(playerKingdom(sim).council.steward).toBe(s.id);
    run(sim, 100);
    expect(['build', 'haul', 'farm', 'gather', 'craft']).not.toContain(s.task?.kind);
    expect(s.idleReason).toMatch(/council|steward/i);
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    expect(applyCommand(sim, { type: 'appointCouncil', post: 'envoy', settlerId: kid.id }).message).toMatch(/child/i);
    expect(applyCommand(sim, { type: 'appointCouncil', post: 'steward', settlerId: null }).ok).toBe(true);
    expect(playerKingdom(sim).council.steward).toBeNull();
  });
});

describe('realm panel snapshot', () => {
  it('shows the crown, treasury, trust, council and known kingdoms from what the player knows', async () => {
    const { kingdomInfo } = await import('../src/engine/kingdomSnapshot');
    const sim = regionReady();
    let info = kingdomInfo(sim);
    expect(info.crowned).toBe(false);
    expect(info.canCoronate).toBe(false);
    expect(info.council.map((c) => c.post)).toEqual(['steward', 'envoy', 'marshal']);
    expect(info.homelandPreview).toBeGreaterThan(30);
    expect(info.rivals).toEqual([]);
    sim.progression.reached.push('region');
    expect(kingdomInfo(sim).canCoronate).toBe(true);
    applyCommand(sim, { type: 'coronate', ...identity });
    info = kingdomInfo(sim);
    expect(info.ruler).toBe('Queen Alder');
    expect(info.homeland).toBe(info.homelandPreview);
  });
});
