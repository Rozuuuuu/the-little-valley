import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { CHILD_ADULT_TICKS, CHILD_STABLE_TICKS, FAMILY_COOLDOWN, GROWTH_MIN_FOOD } from '../src/game/data/kingdomBalance';
import { SAVE_VERSION } from '../src/game/save/format';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { assignHomes, bedsOf, campOf, residentCounts } from '../src/game/sim/buildings';
import { applyCommand, type Command } from '../src/game/sim/commands';
import { adults, children } from '../src/game/sim/households';
import { createNewGame } from '../src/game/sim/newGame';
import { requirementProgress } from '../src/game/sim/progression';
import { MAX_POPULATION, type Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { assertReservationsConsistent, instant, run, runUntil } from './helpers';

const extras = { name: 'Households', createdAt: 1 };

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
}

/** A valley with one finished family home (3 beds) and plenty of food. */
function familyWorld(seed = 7070, before?: (sim: Simulation) => void) {
  const sim = createNewGame(seed);
  campOf(sim)!.inventory = { food: 200, wood: 40, stone: 20 };
  const home = instant(sim, 'familyHome', { x: 4, y: -5 });
  // Anything else finished now re-seats sleepers, so it happens before the couple is set up.
  before?.(sim);
  const [a, b] = sim.settlers;
  // Finishing the home moved three camp sleepers in; keep only the couple there.
  const camp = campOf(sim)!;
  for (const s of sim.settlers) if (s.homeId === home.id && s !== a && s !== b) s.homeId = camp.id;
  a.homeId = home.id;
  b.homeId = home.id;
  return { sim, home, a, b };
}

function household(sim: Simulation, a: number, b: number): number {
  const res = applyCommand(sim, { type: 'formHousehold', ids: [a, b] });
  expect(res.ok, res.message).toBe(true);
  return res.id!;
}

function claimsOn(sim: Simulation, home: Building): number {
  return sim.bedClaims.filter((c) => c.homeId === home.id).length;
}

describe('growth mode', () => {
  it('new valleys grow deliberately: a free bed and food no longer draw newcomers by themselves', () => {
    const sim = createNewGame(1111);
    expect(sim.growthMode).toBe('deliberate');
    campOf(sim)!.inventory = { food: 200 };
    instant(sim, 'house', { x: 4, y: -5 });
    run(sim, DAY_TICKS);
    expect(sim.settlers).toHaveLength(5);
    expect(sim.populationStatus).toMatch(/visitor|family|household/i);
  });

  it('older worlds keep newcomer arrivals until the player adopts deliberate growth', () => {
    const v4 = JSON.parse(readFileSync('tests/fixtures/v4-save.json', 'utf8'));
    const sim = deserializeSim(migrate(v4));
    expect(sim.growthMode).toBe('legacy');
    expect(sim.settlers.every((s) => s.lifeStage === 'adult' && s.householdId === null)).toBe(true);
    expect(sim.households).toEqual([]);
    // Families need the new rules first.
    const [a, b] = sim.settlers;
    expect(applyCommand(sim, { type: 'formHousehold', ids: [a.id, b.id] }).ok).toBe(false);
    const res = applyCommand(sim, { type: 'adoptDeliberateGrowth' });
    expect(res.ok).toBe(true);
    expect(sim.growthMode).toBe('deliberate');
    expect(applyCommand(sim, { type: 'adoptDeliberateGrowth' }).ok).toBe(false);
    expect(reload(sim).growthMode).toBe('deliberate');
  });
});

describe('households', () => {
  it('rejects the same adult twice, unknown people, children and adults already in a household', () => {
    const { sim, a, b } = familyWorld();
    const c = sim.settlers[2];
    expect(applyCommand(sim, { type: 'formHousehold', ids: [a.id, a.id] }).ok).toBe(false);
    expect(applyCommand(sim, { type: 'formHousehold', ids: [a.id, 9999] }).ok).toBe(false);
    household(sim, a.id, b.id);
    expect(applyCommand(sim, { type: 'formHousehold', ids: [a.id, c.id] }).message).toMatch(/already/);
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    expect(applyCommand(sim, { type: 'formHousehold', ids: [c.id, kid.id] }).message).toMatch(/child/i);
  });

  it('moves the couple into one home together when a home has room', () => {
    const { sim, home, a, b } = familyWorld();
    a.homeId = campOf(sim)!.id;
    household(sim, a.id, b.id);
    expect(a.homeId).toBe(home.id);
    expect(b.homeId).toBe(home.id);
  });

  it('two adults plus a pending child fill a three-bed home; nobody else can take that bed', () => {
    const { sim, home, a, b } = familyWorld();
    const hh = household(sim, a.id, b.id);
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).ok).toBe(true);
    expect(claimsOn(sim, home)).toBe(1);
    expect((residentCounts(sim).get(home.id) ?? 0) + claimsOn(sim, home)).toBe(bedsOf(home));
    // A homeless adult looking for a real bed is not given the claimed one.
    const extra = sim.addSettler(0, 2, 'laborer');
    assignHomes(sim);
    expect(extra.homeId).not.toBe(home.id);
    expect((residentCounts(sim).get(home.id) ?? 0) + claimsOn(sim, home)).toBeLessThanOrEqual(bedsOf(home));
  });

  it('refuses a child without a free permanent bed, during a food shortage, twice at once, or at the population limit', () => {
    const { sim, a, b } = familyWorld();
    const hh = household(sim, a.id, b.id);
    // Fill the third bed.
    const lodger = sim.addSettler(0, 2, 'laborer');
    lodger.homeId = a.homeId;
    // Three settlers still sleep in camp bedrolls; the refusal says they take new beds first.
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).message).toMatch(/bed.*3 settlers.*bedrolls/);
    lodger.homeId = campOf(sim)!.id;

    const food = campOf(sim)!.inventory.food;
    campOf(sim)!.inventory.food = GROWTH_MIN_FOOD - 1;
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).message).toMatch(/food/);
    campOf(sim)!.inventory.food = food;

    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).message).toMatch(/already/);
    expect(sim.bedClaims).toHaveLength(1);
    expect(applyCommand(sim, { type: 'cancelChildRequest', householdId: hh }).ok).toBe(true);
    expect(sim.bedClaims).toHaveLength(0);

    while (sim.settlers.length < MAX_POPULATION) sim.addSettler(0, 2, 'laborer');
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).message).toMatch(/limit/);
  });

  it('a child is born after two stable days — exactly once, even across a save one tick before', () => {
    const { sim, home, a, b } = familyWorld();
    const hh = household(sim, a.id, b.id);
    expect(applyCommand(sim, { type: 'requestChild', householdId: hh }).ok).toBe(true);
    const h = sim.households.find((x) => x.id === hh)!;
    runUntil(sim, () => (h.pending?.stableTicks ?? 0) >= CHILD_STABLE_TICKS - 50, CHILD_STABLE_TICKS + DAY_TICKS);
    expect(sim.settlers).toHaveLength(5);

    const loaded = reload(sim);
    for (const world of [sim, loaded]) {
      runUntil(world, () => world.settlers.length === 6, DAY_TICKS);
      run(world, 200);
      expect(world.settlers).toHaveLength(6);
      const kid = world.settlers[5];
      expect(kid.lifeStage).toBe('child');
      expect(kid.homeId).toBe(home.id);
      expect(kid.householdId).toBe(hh);
      expect(world.bedClaims).toHaveLength(0);
      const wh = world.households.find((x) => x.id === hh)!;
      expect(wh.pending).toBeNull();
      expect(wh.children).toEqual([kid.id]);
      expect(wh.cooldownUntil).toBeGreaterThanOrEqual(world.tick + FAMILY_COOLDOWN - 300);
      expect(world.stats.births).toBe(1);
      // A second child has to wait for the cooldown.
      expect(applyCommand(world, { type: 'requestChild', householdId: hh }).message).toMatch(/rest|wait|day/i);
      assertReservationsConsistent(world);
    }
  });

  it('children eat and sleep but take no adult work, then grow up into laborers', () => {
    const { sim } = familyWorld();
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    kid.ageTicks = 0;
    for (const cmd of [
      { type: 'setJob', ids: [kid.id], job: 'builder' },
      { type: 'setPriorities', ids: [kid.id], priorities: ['build'] },
      { type: 'gather', ids: [kid.id], x: 3, y: 3 },
    ] as Command[]) {
      const res = applyCommand(sim, cmd);
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/child/i);
    }
    applyCommand(sim, { type: 'place', building: 'fence', x: 3, y: 6 });
    for (let i = 0; i < 20; i++) {
      run(sim, 50);
      expect(['build', 'haul', 'farm', 'gather', 'craft', 'deliver']).not.toContain(kid.task?.kind);
    }
    expect(kid.idleReason).toMatch(/child|play/i);
    kid.ageTicks = CHILD_ADULT_TICKS - 10;
    run(sim, 60);
    expect(kid.lifeStage).toBe('adult');
    expect(kid.job).toBe('laborer');
  });

  it('a food shortage pauses the pending child without harming anyone, then resumes', () => {
    const { sim, a, b } = familyWorld();
    const hh = household(sim, a.id, b.id);
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    const h = sim.households.find((x) => x.id === hh)!;
    run(sim, 500);
    const before = h.pending!.stableTicks;
    expect(before).toBeGreaterThan(0);
    campOf(sim)!.inventory.food = 5;
    const at = h.pending!.stableTicks;
    run(sim, 100);
    expect(h.pending!.stableTicks).toBeLessThanOrEqual(at + 50);
    expect(h.pending!.blocked).toMatch(/food/);
    expect(sim.settlers).toHaveLength(5);
    campOf(sim)!.inventory.food = 200;
    run(sim, 200);
    expect(h.pending!.blocked).toBe('');
    expect(h.pending!.stableTicks).toBeGreaterThan(before);
  });

  it('demolishing the home keeps everyone and moves the bed claim, or pauses until a bed is free', () => {
    let spare!: Building;
    const { sim, home, a, b } = familyWorld(7070, (w) => {
      spare = instant(w, 'familyHome', { x: -8, y: -6 });
    });
    const hh = household(sim, a.id, b.id);
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    expect(sim.bedClaims[0].homeId).toBe(home.id);
    expect(applyCommand(sim, { type: 'remove', buildingId: home.id }).ok).toBe(true);
    expect(sim.settlers).toHaveLength(5);
    expect(sim.bedClaims).toHaveLength(1);
    expect(sim.bedClaims[0].homeId).toBe(spare.id);
    expect((residentCounts(sim).get(spare.id) ?? 0) + claimsOn(sim, spare)).toBeLessThanOrEqual(bedsOf(spare));
    // With no permanent bed left at all, the claim is released and the child waits.
    expect(applyCommand(sim, { type: 'remove', buildingId: spare.id }).ok).toBe(true);
    expect(sim.bedClaims).toHaveLength(0);
    const h = sim.households.find((x) => x.id === hh)!;
    expect(h.pending).not.toBeNull();
    run(sim, 100);
    expect(h.pending!.blocked).toMatch(/bed/);
    expect(sim.settlers).toHaveLength(5);
  });

  it('parents living in different settlements pause the pending child', () => {
    let hall!: Building;
    const { sim, a, b } = familyWorld(7070, (w) => {
      w.progression.reached.push('hamlet', 'village');
      for (let x = 0; x >= -60; x -= 4) w.world.reveal(x, 0, 10);
      hall = instant(w, 'waystation', { x: -40, y: 0 });
    });
    expect(sim.settlements).toHaveLength(2);
    const hh = household(sim, a.id, b.id);
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    applyCommand(sim, { type: 'assignSettlement', ids: [b.id], settlementId: hall.id });
    run(sim, 100);
    expect(sim.households.find((x) => x.id === hh)!.pending!.blocked).toMatch(/different|apart/);
  });

  it('milestone population counts adults only', () => {
    const sim = createNewGame(3);
    for (let i = 0; i < 3; i++) sim.addSettler(0, 2, 'laborer').lifeStage = 'child';
    expect(adults(sim)).toHaveLength(5);
    expect(children(sim)).toHaveLength(3);
    expect(requirementProgress(sim, { kind: 'population', count: 6 }).current).toBe(5);
    sim.addSettler(0, 2, 'laborer');
    expect(requirementProgress(sim, { kind: 'population', count: 6 }).done).toBe(true);
  });

  it('round-trips households, claims, ages and growth mode; migrates the real v4 save', () => {
    const { sim, a, b } = familyWorld();
    const hh = household(sim, a.id, b.id);
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    kid.ageTicks = 1234;
    assignHomes(sim);
    run(sim, 300);
    const stable = (s: Simulation) => {
      const f = serializeSim(s, extras);
      return { ...f, meta: { ...f.meta, savedAt: 0 } };
    };
    expect(stable(reload(sim))).toEqual(stable(sim));
    const v4 = JSON.parse(readFileSync('tests/fixtures/v4-save.json', 'utf8'));
    expect(v4.version).toBe(4);
    const save = migrate(v4);
    expect(save.version).toBe(SAVE_VERSION);
    const old = deserializeSim(save);
    expect(old.settlements.map((s) => s.name)).toEqual(['Home', 'Westfold']);
    expect(old.bedClaims).toEqual([]);
    run(old, 300);
    assertReservationsConsistent(old);
  });

  it('a damaged save with a claim on a missing home loads without the claim', () => {
    const { sim, a, b } = familyWorld();
    const hh = household(sim, a.id, b.id);
    applyCommand(sim, { type: 'requestChild', householdId: hh });
    const file = JSON.parse(JSON.stringify(serializeSim(sim, extras)));
    file.sim.bedClaims[0].homeId = 99999;
    const loaded = deserializeSim(migrate(file));
    expect(loaded.bedClaims).toEqual([]);
    expect(loaded.households[0].pending).not.toBeNull();
  });
});
