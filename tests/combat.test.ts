import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { ACTIVE_BUDGET, OCCUPY_TICKS } from '../src/game/data/war';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { declarePreview, deployRival, deployedSoldiers, lineOfSight, siegeOf } from '../src/game/sim/combat';
import { playerKingdom } from '../src/game/sim/kingdoms';
import { ownerOf, sectorOf } from '../src/game/sim/territory';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Company, Kingdom } from '../src/game/sim/types';
import { T } from '../src/game/world/tiles';
import { run, runUntil } from './helpers';
import { realm, reload, warWorld } from './realm-helpers';

function rivalAt(sim: Simulation, k: Kingdom, x: number, y: number): Company {
  const c = deployRival(sim, k.id, { x, y }, true)!;
  expect(c).toBeTruthy();
  return c;
}

describe('declaring war', () => {
  it('needs Civilization and an opened frontier; the preview lists pacts it would break; a breach needs confirming', () => {
    const { sim, a } = warWorld();
    const offer = sim.makeOffer(a.id, 0, 'nonAggression', { durationDays: 16 }, DAY_TICKS);
    applyCommand(sim, { type: 'respondToOffer', offerId: offer.id, accept: true });
    const p = declarePreview(sim, a.id);
    expect(p.breaches.join(' ')).toMatch(/Non-aggression/i);
    expect(p.exposed.length).toBeGreaterThan(0);
    const no = applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: false });
    expect(no.ok).toBe(false);
    expect(no.message).toMatch(/break|breach/i);
    expect(applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true }).ok).toBe(true);
    expect(offer.state).toBe('breached');
    expect(sim.atWar(0, a.id)).toBe(true);
    expect(sim.worldEvents.some((e) => e.kind === 'war-declared' && e.subject === 0)).toBe(true);
  });

  it('refused without Civilization and an explicit frontier choice', () => {
    const { sim, a } = realm();
    expect(applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true }).message).toMatch(/Civilization|frontier/i);
  });
});

describe('combat', () => {
  it('two companies in range fight; the weaker one routs home — under default rules nobody dies', () => {
    const { sim, foe: a, company, ids } = warWorld('protected-frontier', 3);
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    const enemy = rivalAt(sim, a, -4 * 16 + 8, 8);
    expect(applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'defend', x: -3 * 16 + 4, y: 8, supplyDays: 4 }).ok).toBe(true);
    const people = sim.settlers.length;
    runUntil(sim, () => enemy.state === 'returning' || company.state === 'returning', DAY_TICKS * 2);
    expect(sim.settlers.length).toBe(people);
    expect(enemy.state === 'returning' || company.state === 'returning').toBe(true);
    for (const id of ids) expect(sim.settler(id)).toBeTruthy();
    expect(sim.stats.battles).toBeGreaterThan(0);
  });

  it('a protected homeland is never entered, never shot into, and never a firing platform', () => {
    const { sim, foe: a, company } = warWorld();
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    // The rival marches on the camp: it stops at the homeland's edge.
    const enemy = rivalAt(sim, a, -4 * 16 + 8, 8);
    enemy.target = { x: 2, y: 2 };
    run(sim, DAY_TICKS / 2);
    const home = playerKingdom(sim).homeland!;
    expect(home.some((q) => q.x === sectorOf(enemy.x!, enemy.y!).x && q.y === sectorOf(enemy.x!, enemy.y!).y)).toBe(false);
    // Our company inside the homeland is out of reach, and can't shoot out either.
    expect(company.state).toBe('home');
    const hp = enemy.health;
    run(sim, 200);
    expect(enemy.health).toBe(hp);
  });

  it('arrows need a clear line of sight: a mountain face blocks them', () => {
    const { sim } = warWorld();
    let block: { x: number; y: number } | null = null;
    for (let y = -120; y < -10 && !block; y++) for (let x = -120; x < 40 && !block; x++) if (sim.world.terrain(x, y) === T.Mountain && sim.world.terrain(x, y - 3) !== T.Mountain && sim.world.terrain(x, y + 3) !== T.Mountain) block = { x, y };
    expect(block).not.toBeNull();
    expect(lineOfSight(sim, block!.x, block!.y - 3, block!.x, block!.y + 3)).toBe(false);
    expect(lineOfSight(sim, 0, 6, 3, 6)).toBe(true);
  });

  it('under full conquest a defeated company can lose a soldier for good — and everything about them is cleaned up', () => {
    const { sim, foe: a, company, ids } = warWorld('full-conquest', 1);
    const s = sim.settler(ids[0])!;
    const hh = applyCommand(sim, { type: 'formHousehold', ids: [s.id, sim.settlers.find((x) => x.id !== s.id && !x.military && x.lifeStage === 'adult' && !Object.values(playerKingdom(sim).council).includes(x.id))!.id] });
    expect(hh.ok, hh.message).toBe(true);
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    for (let i = 0; i < 3; i++) rivalAt(sim, a, -3 * 16 + 2 + i, 8);
    applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'defend', x: -3 * 16 + 6, y: 8, supplyDays: 4 });
    runUntil(sim, () => !sim.settler(s.id), DAY_TICKS * 2);
    expect(sim.stats.soldiersLost).toBe(1);
    expect(sim.households.some((h) => h.adults.includes(s.id))).toBe(false);
    expect(sim.bedClaims.every((c) => c.owner.kind !== 'birth' || c.owner.id !== hh.id)).toBe(true);
    for (const k of sim.kingdoms) for (const c of k.companies) expect(c.members ?? []).not.toContain(s.id);
    for (const b of sim.buildings.values()) expect(b.workers).not.toContain(s.id);
  });

  it('the active deployment budget is shared by every side', () => {
    const { sim, a, b } = warWorld();
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    for (const k of [a, b]) while (k.companies.length < 12) k.companies.push({ id: k.id * 100 + k.companies.length, kind: 'infantry', strength: 10, pledgedTo: null, owner: k.id });
    sim.setWar(a.id, b.id, true);
    for (let i = 0; i < 30; i++) for (const k of [a, b]) deployRival(sim, k.id, { x: -60 - i, y: 8 });
    expect(deployedSoldiers(sim)).toBeLessThanOrEqual(ACTIVE_BUDGET);
    expect(deployRival(sim, a.id, { x: -60, y: 8 })).toBeNull();
  });
});

describe('occupation, sieges and captured cargo', () => {
  it('holding enemy frontier land unopposed occupies it, but legal title only changes by peace', () => {
    const { sim, foe: a, company } = warWorld();
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'capture', confirmBreach: true });
    const cap = sectorOf(a.capital!.x, a.capital!.y);
    const ring = { x: cap.x + 2, y: cap.y };
    for (let i = 0; i <= 20; i++) sim.world.reveal((a.capital!.x * i) / 20, (a.capital!.y * i) / 20, 10);
    sim.world.reveal(ring.x * 16 + 8, ring.y * 16 + 8, 14);
    const res = applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: ring.x * 16 + 8, y: ring.y * 16 + 8, supplyDays: 8 });
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => ownerOf(sim, ring)?.occupyingKingdom === 0, DAY_TICKS * 6 + OCCUPY_TICKS);
    expect(ownerOf(sim, ring)!.legalOwner).toBe(a.id);
    const loaded = reload(sim);
    expect(ownerOf(loaded, ring)!.occupyingKingdom).toBe(0);
    // Peace transfers title.
    const peace = applyCommand(sim, { type: 'proposeTreaty', kind: 'peace', to: a.id, terms: { durationDays: 32, transfers: [ring] } });
    expect(peace.ok, peace.message).toBe(true);
    sim.setTrust(a.id, 0, 90);
    runUntil(sim, () => !sim.atWar(0, a.id) || sim.offers.find((o) => o.id === peace.id)!.state === 'rejected', DAY_TICKS * 3);
    const o = sim.offers.find((x) => x.id === peace.id)!;
    if (o.state === 'active') {
      expect(ownerOf(sim, ring)!.legalOwner).toBe(0);
      expect(ownerOf(sim, ring)!.occupyingKingdom).toBeNull();
    }
  });

  it('a town falls only through a surrender meter a supplied force advances; relief interrupts it', () => {
    const { sim, foe: a, company } = warWorld('full-conquest', 3);
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'capture', confirmBreach: true });
    for (let i = 0; i <= 20; i++) sim.world.reveal((a.capital!.x * i) / 20, (a.capital!.y * i) / 20, 10);
    for (const q of a.companies) q.pledgedTo = -1; // the town's own soldiers are away
    const res = applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'move', x: Math.floor(a.capital!.x), y: Math.floor(a.capital!.y), supplyDays: 8 });
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => (siegeOf(sim, a.id)?.progress ?? 0) > 20, DAY_TICKS * 8);
    expect(siegeOf(sim, a.id)!.progress).toBeLessThan(100);
    for (const q of a.companies) q.pledgedTo = null;
    const relief = deployRival(sim, a.id, { x: Math.floor(a.capital!.x), y: Math.floor(a.capital!.y) }, true)!;
    const before = siegeOf(sim, a.id)!.progress;
    run(sim, 200);
    expect(siegeOf(sim, a.id)!.progress).toBeLessThan(before + 1);
    void relief;
  });

  it('cargo on a cart caught by enemy soldiers is lost once, never counted twice', () => {
    const { sim, foe: a } = warWorld();
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    const m = { id: sim.allocId(), routeId: null, crewId: sim.settlers[4].id, sourceId: campOf(sim)!.id, destId: campOf(sim)!.id, cargo: { wood: 10 }, state: 'outbound' as const, departTick: sim.tick, arriveTick: sim.tick + 400, legTicks: 400, from: { x: -60, y: 8 }, to: { x: -100, y: 8 } };
    sim.manifests.push(m);
    sim.settlers[4].awayOn = m.id;
    rivalAt(sim, a, -62, 8);
    run(sim, 60);
    expect(m.cargo.wood ?? 0).toBe(0);
    expect(sim.stats.cargoLost).toBe(10);
    run(sim, 60);
    expect(sim.stats.cargoLost).toBe(10);
  });
});

describe('saving a war', () => {
  it('war records, surrender meters, occupation timers and captives survive a reload', () => {
    const { sim, foe: a, company } = warWorld('protected-frontier', 3);
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    sim.sieges.set(a.id, { besieger: 0, progress: 37 });
    sim.occupationTimers.set('-4,0', { kingdom: a.id, since: sim.tick - 10 });
    const s = sim.settlers.find((x) => !x.military && x.lifeStage === 'adult')!;
    s.captive = { by: a.id };
    s.hidden = true;
    const ws = sim.warStates.get([0, a.id].sort((x, y) => x - y).join(':'))!;
    ws.routs[a.id] = 2;
    const loaded = reload(sim);
    expect(loaded.warStates.get([0, a.id].sort((x, y) => x - y).join(':'))).toEqual(ws);
    expect(loaded.sieges.get(a.id)).toEqual({ besieger: 0, progress: 37 });
    expect(loaded.occupationTimers.get('-4,0')).toEqual({ kingdom: a.id, since: sim.tick - 10 });
    expect(loaded.settler(s.id)!.captive).toEqual({ by: a.id });
    expect(loaded.settler(s.id)!.hidden).toBe(true);
    void company;
  });
});

describe('war panel', () => {
  it('previews a declaration with its blockers and breaches, then lists the war with captives and held land', async () => {
    const { warInfo } = await import('../src/engine/kingdomSnapshot');
    const { sim, foe: a } = warWorld();
    let w = warInfo(sim);
    const p = w.previews.find((x) => x.id === a.id)!;
    expect(p.preview.blockers).toEqual([]);
    applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true });
    sim.settlers[3].captive = { by: a.id };
    w = warInfo(sim);
    expect(w.wars[0].name).toBe(a.name);
    expect(w.wars[0].captives).toEqual([sim.settlers[3].name]);
    expect(w.previews.some((x) => x.id === a.id)).toBe(false);
  });
});
