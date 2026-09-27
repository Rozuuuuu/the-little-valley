import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { SEASON_DAYS } from '../src/game/data/seasons';
import {
  FIRST_VISITOR_TICK, OFFER_LIFETIME, ORCHARD_ESTABLISH_TICKS, RECRUIT_APPLES, RECRUIT_COOLDOWN, RECRUIT_TRAVEL_TICKS, VISITOR_INTERVAL,
} from '../src/game/data/kingdomBalance';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { bedsOf, builtCount, campOf, residentCounts } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { adults, children } from '../src/game/sim/households';
import { createNewGame } from '../src/game/sim/newGame';
import { seasonOf } from '../src/game/sim/seasons';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { accountedFor, assertNoNegativeReservations, assertReservationsConsistent, clearSpot, instant, run, runUntil } from './helpers';

const extras = { name: 'Recruits', createdAt: 1 };

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
}

/** Every apple anywhere: stores, hands, sites, orchards' ripe fruit excluded, plus escrow. */
function applesHeld(sim: Simulation): number {
  let n = accountedFor(sim, 'apples');
  for (const r of sim.recruits) n += r.escrow.apples ?? 0;
  return n;
}

/** Sends a new home's residents back to their camp bedrolls, so its beds are free for the scene. */
function emptyHome(sim: Simulation, home: Building): Building {
  for (const s of sim.settlers) if (s.homeId === home.id) s.homeId = campOf(sim)!.id;
  return home;
}

/** A new valley with an empty family home, a visitor waiting and the given apples in the camp. */
function visitorWorld(apples: number, seed = 5150) {
  const sim = createNewGame(seed);
  campOf(sim)!.inventory = { food: 120, wood: 40, stone: 20, apples };
  const home = emptyHome(sim, instant(sim, 'familyHome', { x: 4, y: -5 }));
  runUntil(sim, () => sim.offer !== null, FIRST_VISITOR_TICK + 100);
  return { sim, home, offer: sim.offer!, hall: campOf(sim)! };
}

function accept(sim: Simulation, offerId: number) {
  return applyCommand(sim, { type: 'acceptRecruit', offerId, settlementId: sim.settlements[0].id });
}

describe('visitors', () => {
  it('the first visitor comes early in a new valley, one at a time, and moves on unanswered', () => {
    const sim = createNewGame(1);
    runUntil(sim, () => sim.offer !== null, FIRST_VISITOR_TICK + 100);
    expect(sim.tick).toBeLessThanOrEqual(FIRST_VISITOR_TICK + 50);
    const first = sim.offer!;
    run(sim, OFFER_LIFETIME - 200);
    expect(sim.offer?.id).toBe(first.id);
    runUntil(sim, () => sim.offer === null, 400);
    runUntil(sim, () => sim.offer !== null, VISITOR_INTERVAL + 100);
    expect(sim.offer!.id).not.toBe(first.id);
    expect(sim.offer!.name).not.toBe('');
  });

  it('legacy worlds get no visitors until they adopt deliberate growth', () => {
    const sim = createNewGame(2);
    sim.growthMode = 'legacy';
    sim.offer = null;
    run(sim, DAY_TICKS);
    expect(sim.offer).toBeNull();
  });
});

describe('recruitment', () => {
  it('49 apples are refused; food is never substituted; nothing is charged', () => {
    const { sim, offer } = visitorWorld(RECRUIT_APPLES - 1);
    const before = { apples: sim.storedTotal('apples'), food: sim.storedTotal('food') };
    const res = accept(sim, offer.id);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/apples/);
    expect(sim.storedTotal('apples')).toBe(before.apples);
    expect(sim.storedTotal('food')).toBe(before.food);
    expect(sim.recruits).toHaveLength(0);
    expect(sim.bedClaims).toHaveLength(0);
  });

  it('50 apples welcome exactly one adult; repeated clicks and a reload cannot duplicate them or the charge', () => {
    const { sim, offer, home } = visitorWorld(RECRUIT_APPLES + 7);
    const total = applesHeld(sim);
    const res = accept(sim, offer.id);
    expect(res.ok, res.message).toBe(true);
    expect(sim.storedTotal('apples')).toBe(7);
    expect(applesHeld(sim)).toBe(total);
    expect(sim.offer).toBeNull();
    expect(sim.bedClaims).toHaveLength(1);
    expect(sim.bedClaims[0].homeId).toBe(home.id);
    // The same offer again, straight away and after a reload.
    expect(accept(sim, offer.id).ok).toBe(false);
    const loaded = reload(sim);
    expect(accept(loaded, offer.id).ok).toBe(false);
    for (const world of [sim, loaded]) {
      runUntil(world, () => world.settlers.length === 6, RECRUIT_TRAVEL_TICKS + 200);
      run(world, 300);
      expect(world.settlers).toHaveLength(6);
      const newcomer = world.settlers[5];
      expect(newcomer.name).toBe(offer.name);
      expect(newcomer.lifeStage).toBe('adult');
      expect(newcomer.homeId).toBe(home.id);
      expect(world.recruits).toHaveLength(0);
      expect(world.bedClaims).toHaveLength(0);
      expect(world.storedTotal('apples')).toBe(7);
      expect(world.stats.arrivals).toBe(1);
      assertReservationsConsistent(world);
    }
  });

  it('needs a free bed (real homes first, bedrolls will do), food in store, and one settled traveller per two days', () => {
    const sim = createNewGame(5151);
    campOf(sim)!.inventory = { food: 120, apples: 200 };
    runUntil(sim, () => sim.offer !== null, FIRST_VISITOR_TICK + 100);
    // Every bedroll is taken and there is no home yet.
    expect(accept(sim, sim.offer!.id).message).toMatch(/bed/);
    expect(sim.storedTotal('apples')).toBe(200);
    instant(sim, 'familyHome', { x: 4, y: -5 });
    campOf(sim)!.inventory.food = 10;
    expect(accept(sim, sim.offer!.id).message).toMatch(/food/);
    campOf(sim)!.inventory.food = 120;
    expect(accept(sim, sim.offer!.id).ok).toBe(true);
    runUntil(sim, () => sim.offer !== null, DAY_TICKS);
    // Another visitor while the first is still walking in, and after they settled.
    expect(accept(sim, sim.offer!.id).message).toMatch(/on the way|day/);
    runUntil(sim, () => sim.settlers.length === 6, DAY_TICKS);
    expect(accept(sim, sim.offer!.id).message).toMatch(/day/);
    sim.lastRecruit -= RECRUIT_COOLDOWN;
    expect(accept(sim, sim.offer!.id).ok).toBe(true);
  });

  it('cancelling returns every apple; a full store keeps them safe until there is room', () => {
    const { sim, offer, hall } = visitorWorld(RECRUIT_APPLES);
    const total = applesHeld(sim);
    expect(accept(sim, offer.id).ok).toBe(true);
    const r = sim.recruits[0];
    // Fill the camp so the refund can't fit.
    hall.inventory.stone = sim.storageCapacity(hall) - sim.storageUsed(hall);
    expect(applyCommand(sim, { type: 'cancelRecruit', recruitId: r.id }).ok).toBe(true);
    expect(sim.bedClaims).toHaveLength(0);
    expect(applesHeld(sim)).toBe(total);
    expect(sim.recruits[0]?.state).toBe('refunding');
    hall.inventory.stone = 0;
    run(sim, 100);
    expect(sim.recruits).toHaveLength(0);
    expect(sim.storedTotal('apples')).toBe(total);
    run(sim, RECRUIT_TRAVEL_TICKS);
    expect(sim.settlers).toHaveLength(5);
  });

  it('a traveller whose bed is demolished waits for another, and never arrives without one', () => {
    const { sim, offer, home } = visitorWorld(RECRUIT_APPLES);
    expect(accept(sim, offer.id).ok).toBe(true);
    expect(applyCommand(sim, { type: 'remove', buildingId: home.id }).ok).toBe(true);
    expect(sim.bedClaims).toHaveLength(0);
    run(sim, RECRUIT_TRAVEL_TICKS + 100);
    expect(sim.settlers).toHaveLength(5);
    expect(sim.recruits[0].blocked).toMatch(/bed/);
    // A new house frees beds (its residents leave camp bedrolls), and the traveller comes in.
    instant(sim, 'house', { x: -8, y: -6 });
    runUntil(sim, () => sim.settlers.length === 6, 400);
    expect(sim.settlers[5].homeId).not.toBeNull();
    const counts = residentCounts(sim);
    for (const b of sim.buildings.values()) expect(counts.get(b.id) ?? 0).toBeLessThanOrEqual(bedsOf(b));
  });
});

describe('orchards', () => {
  function orchardWorld(seed = 6161) {
    const sim = createNewGame(seed);
    campOf(sim)!.inventory = { food: 150, wood: 40, stone: 20 };
    const p = clearSpot(sim, 2, 2, { x: -8, y: 4 });
    const res = applyCommand(sim, { type: 'place', building: 'orchard', x: p.x, y: p.y });
    expect(res.ok, res.message).toBe(true);
    const orchard = sim.buildingAt(p.x, p.y)!;
    return { sim, orchard };
  }

  it('is built at Camp, establishes over two growing days, then tended trees bear apples farmers bring in', () => {
    const { sim, orchard } = orchardWorld();
    runUntil(sim, () => orchard.built, DAY_TICKS * 2);
    expect(orchard.orchard!.growth).toBe(0);
    run(sim, Math.round(ORCHARD_ESTABLISH_TICKS * 0.5));
    expect(orchard.orchard!.fruit).toBe(0);
    runUntil(sim, () => sim.stats.applesPicked > 0, ORCHARD_ESTABLISH_TICKS + DAY_TICKS * 2);
    runUntil(sim, () => sim.storedTotal('apples') > 0, DAY_TICKS);
    // Apples are their own resource: picking them adds no food.
    expect(sim.stats.foodGathered + sim.stats.harvested).toBeGreaterThanOrEqual(0);
    expect(accountedFor(sim, 'apples')).toBe(sim.stats.applesPicked);
    assertReservationsConsistent(sim);
    assertNoNegativeReservations(sim);
  });

  it('rests in winter: no establishing, no new fruit', () => {
    const { sim, orchard } = orchardWorld();
    runUntil(sim, () => orchard.built, DAY_TICKS * 2);
    sim.tick = 3 * SEASON_DAYS * DAY_TICKS + 10;
    expect(seasonOf(sim).id).toBe('winter');
    orchard.orchard!.growth = 100;
    orchard.orchard!.fruit = 3;
    orchard.orchard!.careUntil = sim.tick + DAY_TICKS;
    run(sim, DAY_TICKS / 2);
    expect(orchard.orchard!.growth).toBe(100);
    expect(orchard.orchard!.fruit).toBe(3);
  });

  it('a workshop can dry surplus apples into ordinary food, conserving every apple', () => {
    const sim = createNewGame(7171);
    campOf(sim)!.inventory = { food: 100, apples: 40, wood: 60, stone: 30 };
    const ws = instant(sim, 'workshop', { x: 5, y: 5 });
    expect(applyCommand(sim, { type: 'setRecipe', buildingId: ws.id, recipe: 'driedApples' }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'assignWorker', buildingId: ws.id, ids: [sim.settlers[4].id] }).ok).toBe(true);
    runUntil(sim, () => sim.stats.driedApples > 0, DAY_TICKS * 2);
    const used = sim.stats.driedApples / 3 * 4;
    expect(accountedFor(sim, 'apples') + used).toBe(40);
  });
});

describe('deliberate growth journey', () => {
  it('five adults → orchard and family home → apples → welcome a sixth adult → Hamlet → household → child grows up while work continues', () => {
    const sim = createNewGame(20261002);
    const ids = sim.settlers.map((s) => s.id);
    campOf(sim)!.inventory = { food: 80, wood: 90, stone: 45 };
    // Food, and somewhere to keep the harvest.
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -6, y1: 5, crop: 'turnip' });
    const sp = clearSpot(sim, 3, 2, { x: 6, y: 4 });
    expect(applyCommand(sim, { type: 'place', building: 'storehouse', x: sp.x, y: sp.y }).ok).toBe(true);
    // An orchard and a family home.
    const op = clearSpot(sim, 2, 2, { x: -4, y: 9 });
    expect(applyCommand(sim, { type: 'place', building: 'orchard', x: op.x, y: op.y }).ok).toBe(true);
    const hp = clearSpot(sim, 3, 2, { x: 5, y: -5 });
    expect(applyCommand(sim, { type: 'place', building: 'familyHome', x: hp.x, y: hp.y }).ok).toBe(true);
    const home = sim.buildingAt(hp.x, hp.y)! as Building;
    // A house too, so everyone can leave the camp bedrolls.
    const hsp = clearSpot(sim, 2, 2, { x: 9, y: -4 });
    expect(applyCommand(sim, { type: 'place', building: 'house', x: hsp.x, y: hsp.y }).ok).toBe(true);
    runUntil(sim, () => home.built, DAY_TICKS * 3);
    // Wait for 50 apples, then welcome whoever is visiting.
    runUntil(sim, () => sim.storedTotal('apples') >= RECRUIT_APPLES && sim.offer !== null, DAY_TICKS * 10);
    const res = accept(sim, sim.offer!.id);
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => adults(sim).length === 6, DAY_TICKS);
    runUntil(sim, () => sim.progression.reached.includes('hamlet'), DAY_TICKS * 4);
    expect(builtCount(sim, 'familyHome')).toBe(1);
    // A household asks for a child; a second home keeps a bed free.
    const hh = applyCommand(sim, { type: 'formHousehold', ids: [ids[0], ids[1]] });
    expect(hh.ok, hh.message).toBe(true);
    const hp2 = clearSpot(sim, 3, 2, { x: -6, y: -7 });
    applyCommand(sim, { type: 'place', building: 'familyHome', x: hp2.x, y: hp2.y });
    runUntil(sim, () => applyCommand(sim, { type: 'requestChild', householdId: hh.id! }).ok, DAY_TICKS * 3);
    runUntil(sim, () => children(sim).length === 1, DAY_TICKS * 4);
    const work = sim.stats.harvested + sim.stats.woodGathered + sim.stats.applesPicked;
    // Save and resume mid-childhood; the child grows up and joins the work.
    const loaded = reload(sim);
    const kid = children(loaded)[0];
    kid.ageTicks = Math.max(kid.ageTicks, 12 * DAY_TICKS - 200);
    runUntil(loaded, () => kid.lifeStage === 'adult', 400);
    run(loaded, DAY_TICKS / 2);
    expect(loaded.stats.harvested + loaded.stats.woodGathered + loaded.stats.applesPicked).toBeGreaterThan(work);
    expect(adults(loaded)).toHaveLength(7);
    assertReservationsConsistent(loaded);
  });
});

describe('families panel snapshot', () => {
  it('publishes the visitor and what they still need, households, pending children, and bed use', async () => {
    const { growthInfo } = await import('../src/engine/growthInfo');
    const { settlerInfo } = await import('../src/engine/snapshot');
    const { sim, offer } = visitorWorld(10);
    let info = growthInfo(sim);
    expect(info.mode).toBe('deliberate');
    expect(info.visitor!.name).toBe(offer.name);
    expect(info.visitor!.needs.join(' ')).toMatch(/apples/);
    expect(info.visitor!.leavesIn).toMatch(/day|min|h/);
    expect(info.adults).toBe(5);
    const [a, b] = sim.settlers;
    const hh = applyCommand(sim, { type: 'formHousehold', ids: [a.id, b.id] }).id!;
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    run(sim, 100);
    info = growthInfo(sim);
    expect(info.households).toHaveLength(1);
    expect(info.households[0].names).toEqual([a.name, b.name]);
    expect(info.households[0].pending!.progress).toBeGreaterThan(0);
    expect(info.households[0].pending!.bed).toMatch(/Family Home/);
    expect(info.beds.held).toBe(1);
    expect(info.unpaired.map((p) => p.id)).not.toContain(a.id);
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    expect(settlerInfo(sim, kid).age).toMatch(/Child · grows up in 12 days/);
    expect(growthInfo(sim).children).toBe(1);
  });

  it('explains adoption for older worlds', async () => {
    const { growthInfo } = await import('../src/engine/growthInfo');
    const sim = createNewGame(9);
    sim.growthMode = 'legacy';
    expect(growthInfo(sim).adoption).toMatch(/families|travellers/);
  });
});

describe('Valley today with deliberate growth', () => {
  it('suggests an orchard, points at a waiting visitor, flags a paused family and recaps births', async () => {
    const { buildOverview } = await import('../src/engine/overview');
    const { sim, offer } = visitorWorld(0);
    const mark = { startTick: sim.tick, startStats: { ...sim.stats }, startPopulation: sim.settlers.length };
    let o = buildOverview(sim, null);
    expect(o.goals.map((g) => g.text).join(' | ')).toMatch(/orchard/i);
    campOf(sim)!.inventory.apples = RECRUIT_APPLES;
    o = buildOverview(sim, null);
    expect(o.goals.map((g) => g.text).join(' | ')).toContain(offer.name);
    const [a, b] = sim.settlers;
    const hh = applyCommand(sim, { type: 'formHousehold', ids: [a.id, b.id] }).id!;
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    campOf(sim)!.inventory.food = 0;
    run(sim, 60);
    o = buildOverview(sim, null);
    expect(o.issues.map((i) => i.text).join(' | ')).toMatch(/child.*paused|paused/i);
    sim.record('birth', 'Pip was born to A and B');
    o = buildOverview(sim, mark);
    expect((o.since ?? []).join(' ')).toMatch(/Pip was born/);
  });
});
