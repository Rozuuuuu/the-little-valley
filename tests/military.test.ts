import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { MILESTONES } from '../src/game/data/progression';
import { UNITS } from '../src/game/data/units';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { playerKingdom } from '../src/game/sim/kingdoms';
import { requirementProgress } from '../src/game/sim/progression';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { accountedFor, instant, run, runUntil } from './helpers';
import { realm, reload } from './realm-helpers';

/** A crowned realm with barracks, archery range, armory and stable. */
function garrison(gear = { swords: 6, bows: 4, armor: 2 }) {
  const r = realm(6161);
  const { sim } = r;
  const camp = campOf(sim)!;
  camp.inventory = { food: 150, wood: 40, stone: 20, planks: 20, ...gear };
  sim.world.reveal(0, 0, 24);
  instant(sim, 'storehouse', { x: -8, y: -8 });
  const barracks = instant(sim, 'barracks', { x: 8, y: -8 });
  const range = instant(sim, 'archeryRange', { x: -12, y: 6 });
  const stable = instant(sim, 'stable', { x: 12, y: 6 });
  return { ...r, camp, barracks, range, stable };
}

function enlist(sim: Simulation, ids: number[], unit: 'infantry' | 'archer' | 'knight', b: Building) {
  return applyCommand(sim, { type: 'enlist', ids, unit, buildingId: b.id });
}

const swordsHeld = (sim: Simulation) => accountedFor(sim, 'swords') + sim.settlers.reduce((n, s) => n + (s.military?.gear.swords ?? 0), 0);

describe('enlisting', () => {
  it('only adults can enlist; their gear leaves the stores at once, so the last sword goes to one recruit only', () => {
    const { sim, barracks, camp } = garrison({ swords: 1, bows: 0, armor: 0 });
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    expect(enlist(sim, [kid.id], 'infantry', barracks).message).toMatch(/child/i);
    const [a, b] = sim.settlers.slice(1, 3);
    const total = swordsHeld(sim);
    expect(enlist(sim, [a.id], 'infantry', barracks).ok).toBe(true);
    const second = enlist(sim, [b.id], 'infantry', barracks);
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/sword/i);
    expect(camp.inventory.swords ?? 0).toBe(0);
    expect(a.military!.gear.swords).toBe(1);
    expect(swordsHeld(sim)).toBe(total);
    expect(b.military).toBeNull();
  });

  it('enlisting releases civilian claims but keeps home, household and the old job to return to', () => {
    const { sim, barracks } = garrison();
    const ws = instant(sim, 'workshop', { x: 4, y: 8 });
    const s = sim.settlers[1];
    applyCommand(sim, { type: 'assignWorker', buildingId: ws.id, ids: [s.id] });
    const home = s.homeId;
    const job = s.job;
    expect(enlist(sim, [s.id], 'infantry', barracks).ok).toBe(true);
    expect(ws.workers).not.toContain(s.id);
    expect(s.homeId).toBe(home);
    expect(s.military!.priorJob).toBe(job);
    run(sim, 100);
    expect(['build', 'haul', 'farm', 'gather', 'craft']).not.toContain(s.task?.kind);
  });

  it('training slots are limited, training survives a reload, and cancelling returns the gear', () => {
    const { sim, barracks } = garrison({ swords: 6, bows: 0, armor: 0 });
    for (let i = 0; i < 3; i++) sim.addSettler(0, 3, 'laborer');
    // settlers[0] is the envoy; council members can't enlist.
    const ids = sim.settlers.slice(1).map((s) => s.id);
    const res = enlist(sim, ids.slice(0, 5), 'infantry', barracks);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/4 of 5|full|slots/i);
    expect(sim.settlers.filter((s) => s.military).length).toBe(4);
    run(sim, DAY_TICKS / 2);
    const loaded = reload(sim);
    const t = loaded.settler(ids[0])!.military!;
    expect(t.state).toBe('training');
    expect(t.trained).toBe(sim.settler(ids[0])!.military!.trained);
    const swords0 = swordsHeld(loaded);
    expect(applyCommand(loaded, { type: 'cancelTraining', settlerId: ids[1] }).ok).toBe(true);
    expect(loaded.settler(ids[1])!.military).toBeNull();
    expect(swordsHeld(loaded)).toBe(swords0);
    runUntil(loaded, () => loaded.settler(ids[0])!.military!.state === 'ready', UNITS.infantry.trainTicks * 3);
    expect(playerKingdom(loaded).companies.length).toBeGreaterThan(0);
  });
});

describe('horses and knights', () => {
  it('horses live only in stable stalls and eat; a knight needs a horse and armour; demobilising returns them', () => {
    const { sim, barracks, stable, camp } = garrison({ swords: 4, bows: 0, armor: 2 });
    const s = sim.settlers[1];
    expect(enlist(sim, [s.id], 'knight', barracks).message).toMatch(/horse/i);
    // Horses can't be put in an ordinary store.
    expect(sim.deposit(camp, 'horses', 1)).toBe(0);
    expect(sim.deposit(stable, 'horses', 1)).toBe(1);
    expect(sim.storedTotal('horses')).toBe(1);
    const food0 = sim.storedTotal('food');
    const d0 = sim.day;
    runUntil(sim, () => sim.day === d0 + 1, DAY_TICKS);
    run(sim, 60);
    expect(sim.stats.horseFeed).toBeGreaterThanOrEqual(1);
    expect(sim.storedTotal('food')).toBeLessThan(food0);
    expect(enlist(sim, [s.id], 'knight', barracks).ok).toBe(true);
    expect(sim.storedTotal('horses')).toBe(0);
    expect(s.military!.gear.horses).toBe(1);
    runUntil(sim, () => s.military!.state === 'ready', UNITS.knight.trainTicks * 3);
    const company = playerKingdom(sim).companies.find((c) => c.members?.includes(s.id))!;
    expect(applyCommand(sim, { type: 'demobilize', companyId: company.id }).ok).toBe(true);
    expect(s.military).toBeNull();
    expect(sim.storedTotal('horses')).toBe(1);
    expect(stable.inventory.horses).toBe(1);
  });
});

describe('supplied companies', () => {
  function readyCompany() {
    const g = garrison({ swords: 4, bows: 0, armor: 0 });
    const ids = g.sim.settlers.slice(1, 3).map((s) => s.id);
    enlist(g.sim, ids, 'infantry', g.barracks);
    runUntil(g.sim, () => ids.every((id) => g.sim.settler(id)!.military?.state === 'ready'), UNITS.infantry.trainTicks * 3);
    const company = playerKingdom(g.sim).companies[0];
    return { ...g, ids, company };
  }

  it("a company passing a travellers' camp rests: it restocks two days of food and recovers its readiness, once a day", () => {
    const { sim, company, ids } = readyCompany();
    const camp = instant(sim, 'travelCamp', { x: 12, y: 12 });
    const res = applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: camp.x + 1, y: camp.y + 3, supplyDays: 1 });
    expect(res.ok, res.message).toBe(true);
    company.readiness = 40;
    company.morale = 50;
    const food0 = sim.storedTotal('food');
    runUntil(sim, () => company.restedDay === sim.day, DAY_TICKS);
    expect(company.readiness).toBe(100);
    expect(company.morale).toBe(75);
    expect(company.supplies).toBeGreaterThanOrEqual(ids.length * 2);
    expect(sim.storedTotal('food')).toBeLessThan(food0);
    const s = company.supplies;
    company.readiness = 60;
    run(sim, 200);
    // Not twice on the same day.
    expect(company.readiness).toBeLessThan(100);
    expect(company.supplies).toBeLessThanOrEqual(s!);
  });

  it('a patrol carries food from the stores; when it runs out readiness falls day by day and they come home — nobody is lost', () => {
    const { sim, company, ids } = readyCompany();
    const res = applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: 14, y: 14, supplyDays: 1 });
    expect(res.ok, res.message).toBe(true);
    expect(company.state).toBe('deployed');
    expect(company.supplies).toBe(ids.length * 1);
    for (const id of ids) expect(sim.settler(id)!.hidden).toBe(true);
    const d0 = sim.day;
    runUntil(sim, () => sim.day === d0 + 2, DAY_TICKS * 3);
    run(sim, 60);
    expect(company.supplies).toBe(0);
    expect(company.readiness).toBeLessThan(100);
    runUntil(sim, () => company.state === 'home', DAY_TICKS * 8);
    expect(company.members).toHaveLength(ids.length);
    for (const id of ids) {
      expect(sim.settler(id)).toBeTruthy();
      expect(sim.settler(id)!.hidden).toBe(false);
    }
  });

  it('soldiers cannot enter a protected homeland or foreign land without leave; demobilising a deployed company is refused', () => {
    const { sim, company, b } = { ...readyCompany(), b: undefined as never };
    void b;
    const rival = sim.kingdoms.find((k) => !k.player)!;
    const res = applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: rival.capital!.x, y: rival.capital!.y, supplyDays: 2 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/protected|permission|passage/i);
    applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: 14, y: 14, supplyDays: 2 });
    expect(applyCommand(sim, { type: 'demobilize', companyId: company.id }).message).toMatch(/recall|home/i);
  });

  it('a parent away with the army pauses a new child request', () => {
    const { sim, company, ids } = readyCompany();
    const partner = sim.settlers.find((s) => !ids.includes(s.id) && s.lifeStage === 'adult' && !s.military)!;
    const hh = applyCommand(sim, { type: 'formHousehold', ids: [ids[0], partner.id] });
    expect(hh.ok, hh.message).toBe(true);
    applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: 14, y: 14, supplyDays: 2 });
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh.id! }).message).toMatch(/away|army|deployed/i);
  });
});

describe('Civilization', () => {
  it('needs a crown, working supply lines and two of equipment, a trade treaty or a council hall — never war or rare ore', () => {
    const def = MILESTONES.civilization;
    expect(def.future).toBeFalsy();
    const text = JSON.stringify(def.requirements);
    expect(text).not.toMatch(/war|gold|silver|diamond/i);
    const { sim } = realm();
    const reqs = def.requirements.map((r) => requirementProgress(sim, r));
    expect(reqs[0].done).toBe(true); // crowned
    expect(reqs.some((r) => !r.done)).toBe(true);
  });
});

describe('coalition mustering', () => {
  it('accepted allies assemble, march and arrive; the fee is paid on arrival; they go home when service ends, never joining your people', () => {
    const { sim, me } = readyCompanyWithAlly();
    const plan = applyCommand(sim, { type: 'createWarPlan', target: sim.kingdoms.find((k) => !k.player && k.id !== sim.ally)!.id, objective: 'raid' });
    const req = applyCommand(sim, { type: 'requestCampaignSupport', planId: plan.id!, ally: sim.ally, terms: { companies: 1, coinFee: 40, supplyPayer: 'shared', serviceDays: 2, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
    runUntil(sim, () => sim.commitments.find((c) => c.id === req.id)!.state !== 'proposed', DAY_TICKS * 3);
    const cm = sim.commitments.find((c) => c.id === req.id)!;
    if (cm.state === 'countered') applyCommand(sim, { type: 'acceptCampaignOffer', commitmentId: cm.id });
    expect(cm.state).toBe('accepted');
    const people = sim.settlers.length;
    const ally = sim.kingdoms.find((k) => k.id === sim.ally)!;
    const allyCoins = ally.treasury;
    expect(applyCommand(sim, { type: 'mobilizeCampaign', planId: plan.id! }).ok).toBe(true);
    expect(['assembling', 'enRoute']).toContain(cm.state);
    runUntil(sim, () => cm.state === 'arrived' || cm.state === 'active', DAY_TICKS * 6);
    expect(ally.treasury).toBe(allyCoins + cm.terms.coinFee);
    expect(cm.escrow).toBe(0);
    expect(sim.settlers.length).toBe(people);
    runUntil(sim, () => cm.state === 'fulfilled', DAY_TICKS * 8);
    expect(ally.companies.every((q) => q.pledgedTo === null)).toBe(true);
    void me;
  });
});

function readyCompanyWithAlly() {
  const g = garrison({ swords: 4, bows: 0, armor: 0 });
  const ids = g.sim.settlers.slice(1, 3).map((s) => s.id);
  enlist(g.sim, ids, 'infantry', g.barracks);
  runUntil(g.sim, () => ids.every((id) => g.sim.settler(id)!.military?.state === 'ready'), UNITS.infantry.trainTicks * 3);
  g.sim.setStance(g.me.id, g.a.id, 'ally');
  g.sim.setTrust(g.a.id, g.me.id, 90);
  (g.sim as Simulation & { ally: number }).ally = g.a.id;
  return { sim: g.sim as Simulation & { ally: number }, me: g.me };
}

describe('special stores', () => {
  it('settlers never try to leave ordinary goods in a stable or armory (they would loop forever)', () => {
    const { sim, stable, camp } = garrison();
    const s = sim.settlers[2];
    s.x = stable.x + 1.5;
    s.y = stable.y + stable.h + 0.5;
    s.carrying = { res: 'wood', amount: 3 };
    s.task = null;
    const wood0 = camp.inventory.wood ?? 0;
    runUntil(sim, () => !s.carrying, 600);
    expect(stable.inventory.wood ?? 0).toBe(0);
    expect(sim.storedTotal('wood')).toBeGreaterThanOrEqual(wood0 + 3 - 0);
  });
});
