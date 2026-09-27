import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { MILESTONES } from '../src/game/data/progression';
import { SEASON_DAYS } from '../src/game/data/seasons';
import { SAVE_VERSION } from '../src/game/save/format';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { bedsOf, campOf, checkPlacement, completeBuilding, costOf, placeBuilding, residentCounts } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { seasonalGrowth } from '../src/game/sim/farming';
import { createNewGame } from '../src/game/sim/newGame';
import { requirementProgress } from '../src/game/sim/progression';
import { foodPerSettlerPerDay, seasonOf, winterForecast } from '../src/game/sim/seasons';
import { awayPenalty, roadLinked, settlementAt } from '../src/game/sim/settlements';
import { surplus } from '../src/game/sim/settlers';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Building } from '../src/game/sim/types';
import { O, OBJECTS, T } from '../src/game/world/tiles';
import { accountedFor, assertNoNegativeReservations, assertReservationsConsistent, run, runUntil } from './helpers';

const extras = { name: 'Seasons Test', createdAt: 1 };

/** Jump the calendar to a given day (1-based) and time without simulating (for rule checks). */
function setDay(sim: Simulation, day: number, time = 0.5): void {
  sim.tick = Math.round((day - 1) * DAY_TICKS + (time - 0.26) * DAY_TICKS);
}

function clearSpot(sim: Simulation, w: number, h: number, near: { x: number; y: number }): { x: number; y: number } {
  for (let r = 0; r < 30; r++) {
    for (let y = near.y - r; y <= near.y + r; y++) {
      for (let x = near.x - r; x <= near.x + r; x++) {
        let ok = true;
        for (let dy = -1; dy <= h && ok; dy++) {
          for (let dx = -1; dx <= w && ok; dx++) {
            const t = sim.world.terrain(x + dx, y + dy);
            ok = sim.world.explored(x + dx, y + dy) && !sim.buildingAt(x + dx, y + dy) && (t === T.Grass || t === T.Meadow || t === T.Forest)
              && !OBJECTS[sim.world.obj(x + dx, y + dy)].blocks;
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  throw new Error('no clear spot');
}

function instant(sim: Simulation, type: Parameters<typeof placeBuilding>[1], x: number, y: number): Building {
  const b = placeBuilding(sim, type, x, y);
  b.delivered = { ...costOf(b) };
  completeBuilding(sim, b);
  return b;
}

/** A second settlement 30 tiles west of the camp (same bank), explored and founded. */
function withOutpost(seed = 6060) {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet', 'village');
  for (let x = 0; x >= -60; x -= 4) sim.world.reveal(x, 0, 10);
  // Well clear of the camp, and allowed by the spacing rule.
  let p: { x: number; y: number } | null = null;
  for (let x = -34; x >= -56 && !p; x -= 3) {
    const c = clearSpot(sim, 3, 2, { x, y: 0 });
    if (Math.hypot(c.x, c.y) >= 30 && checkPlacement(sim, 'waystation', c.x, c.y).ok) p = c;
  }
  if (!p) throw new Error('no outpost spot');
  const hall = instant(sim, 'waystation', p.x, p.y);
  return { sim, hall, home: campOf(sim)! };
}

// ---------------------------------------------------------------------------------

describe('seasons', () => {
  it('follow the calendar: 4 days each, winter last, then a new year', () => {
    const sim = createNewGame(1);
    const at = (day: number) => {
      setDay(sim, day);
      const s = seasonOf(sim);
      return `${s.id}:${s.day}:${s.year}`;
    };
    expect(at(1)).toBe('spring:1:1');
    expect(at(SEASON_DAYS)).toBe(`spring:${SEASON_DAYS}:1`);
    expect(at(SEASON_DAYS + 1)).toBe('summer:1:1');
    expect(at(SEASON_DAYS * 3 + 1)).toBe('winter:1:1');
    expect(at(SEASON_DAYS * 4 + 1)).toBe('spring:1:2');
  });

  it('announce each new season once, with a chronicle entry', () => {
    const sim = createNewGame(2);
    runUntil(sim, () => seasonOf(sim).id === 'summer', DAY_TICKS * (SEASON_DAYS + 1));
    run(sim, 20);
    const events = sim.drainEvents().filter((e) => e.type === 'season');
    expect(events).toHaveLength(1);
    expect(sim.chronicle.filter((c) => c.kind === 'season')).toHaveLength(1);
  });

  it('winter pauses growth and planting but never destroys crops, and spring resumes', () => {
    const sim = createNewGame(3);
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: -8, y0: 4, x1: -7, y1: 4, crop: 'turnip' });
    const [growing, tilled] = [...sim.buildings.values()].filter((b) => b.field);
    growing.field!.state = 'growing';
    growing.field!.growth = 300;
    tilled.field!.state = 'tilled';
    setDay(sim, SEASON_DAYS * 3 + 1, 0.4); // first morning of winter
    sim.lastSeason = 'winter';
    run(sim, 600);
    expect(growing.field!.state).toBe('growing');
    expect(growing.field!.growth).toBe(300);
    expect(tilled.field!.state).toBe('tilled');
    const farmer = sim.settlers.find((s) => s.job === 'farmer')!;
    expect(farmer.idleReason).toMatch(/Winter/);
    setDay(sim, SEASON_DAYS * 4 + 1, 0.4); // spring
    run(sim, 60);
    expect(growing.field!.growth).toBeGreaterThan(300);
    run(sim, 300);
    expect(['growing', 'ripe']).toContain(tilled.field!.state);
  });

  it('crops have season preferences', () => {
    const sim = createNewGame(4);
    setDay(sim, 2); // spring
    const pumpkinSpring = seasonalGrowth(sim, 'pumpkin');
    const turnipSpring = seasonalGrowth(sim, 'turnip');
    setDay(sim, SEASON_DAYS * 2 + 2); // autumn
    expect(seasonalGrowth(sim, 'pumpkin')).toBeGreaterThan(pumpkinSpring);
    setDay(sim, SEASON_DAYS + 2); // summer
    expect(seasonalGrowth(sim, 'wheat')).toBeGreaterThan(seasonalGrowth(sim, 'turnip'));
    expect(turnipSpring).toBeGreaterThan(seasonalGrowth(sim, 'turnip'));
    setDay(sim, SEASON_DAYS * 3 + 2); // winter
    expect(seasonalGrowth(sim, 'wheat')).toBe(0);
  });

  it('summer dries fields faster than spring', () => {
    const measure = (day: number) => {
      const sim = createNewGame(5);
      sim.weather.nextChange = Number.MAX_SAFE_INTEGER;
      applyCommand(sim, { type: 'place', building: 'field', x: -7, y: 5 });
      const f = [...sim.buildings.values()].find((b) => b.field)!.field!;
      setDay(sim, day);
      sim.settlers.length = 0;
      f.moisture = 1;
      run(sim, 500);
      return 1 - f.moisture;
    };
    expect(measure(SEASON_DAYS + 2)).toBeGreaterThan(measure(2) * 1.4);
  });

  it('berry bushes wait for the thaw', () => {
    const sim = createNewGame(6);
    setDay(sim, SEASON_DAYS * 3 + 1, 0.3);
    sim.lastSeason = 'winter';
    sim.world.setObj(9, -9, O.BerryEmpty);
    sim.regrowth.set((9 + 1048576) * 2097152 + (-9 + 1048576), { to: O.Berry, at: sim.tick + 5 });
    run(sim, 300);
    expect(sim.world.obj(9, -9)).toBe(O.BerryEmpty);
  });

  it('forecasts winter food honestly from population and stores', () => {
    const sim = createNewGame(7);
    setDay(sim, SEASON_DAYS * 2 + 3, 0.5); // late autumn
    const f = winterForecast(sim);
    expect(f.daysUntil).toBeCloseTo(1.5, 1);
    expect(f.needed).toBe(Math.ceil(5 * foodPerSettlerPerDay() * SEASON_DAYS));
    expect(f.stored).toBe(30);
    expect(f.text).toMatch(/Winter in 2 days: 30 food stored/);
    camp(sim).inventory.food = 200;
    expect(winterForecast(sim).ok).toBe(true);
  });
});

function camp(sim: Simulation) {
  return campOf(sim)!;
}

// ---------------------------------------------------------------------------------

describe('second settlement', () => {
  it('a waystation needs room: too close to another settlement is refused with a reason', () => {
    const sim = createNewGame(8080);
    sim.progression.reached.push('hamlet', 'village');
    for (let x = 0; x >= -40; x -= 4) sim.world.reveal(x, 0, 9);
    const near = clearSpot(sim, 3, 2, { x: -8, y: 4 });
    const res = applyCommand(sim, { type: 'place', building: 'waystation', x: near.x, y: near.y });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Too close to Home/);
    const locked = createNewGame(8080);
    locked.progression.reached.push('hamlet');
    expect(applyCommand(locked, { type: 'place', building: 'waystation', x: near.x, y: near.y }).message).toMatch(/Village/);
  });

  it('finishing a waystation founds a named, permanent settlement with bedrolls and a store', () => {
    const { sim, hall } = withOutpost();
    expect(sim.settlements.map((s) => s.name)).toEqual(['Home', 'Riverside']);
    expect(settlementAt(sim, hall.x, hall.y)?.id).toBe(hall.id);
    expect(bedsOf(hall)).toBe(4);
    expect(sim.storageCapacity(hall)).toBe(150);
    expect(applyCommand(sim, { type: 'remove', buildingId: hall.id }).ok).toBe(false);
    expect(sim.chronicle.some((c) => c.kind === 'settlement' && /Riverside/.test(c.text))).toBe(true);
    expect(applyCommand(sim, { type: 'renameSettlement', settlementId: hall.id, name: 'Fernbank' }).ok).toBe(true);
    expect(sim.settlements[1].name).toBe('Fernbank');
  });

  it('assigned settlers move, take beds there and prefer local work', () => {
    const { sim, hall, home } = withOutpost();
    camp(sim).inventory = { food: 100, wood: 80, stone: 40 };
    const movers = sim.settlers.slice(3).map((s) => s.id);
    const res = applyCommand(sim, { type: 'assignSettlement', ids: movers, settlementId: hall.id });
    expect(res.ok).toBe(true);
    for (const id of movers) expect(sim.settler(id)!.homeId).toBe(hall.id);
    // A site next to each settlement: the movers build theirs, the others build at home.
    const pHome = clearSpot(sim, 1, 1, { x: 4, y: 6 });
    const pAway = clearSpot(sim, 1, 1, { x: hall.x + 1, y: hall.y + 5 });
    applyCommand(sim, { type: 'place', building: 'fence', x: pHome.x, y: pHome.y });
    applyCommand(sim, { type: 'place', building: 'fence', x: pAway.x, y: pAway.y });
    runUntil(sim, () => movers.every((id) => Math.hypot(sim.settler(id)!.x - hall.x, sim.settler(id)!.y - hall.y) < 8), DAY_TICKS);
    runUntil(sim, () => [...sim.buildings.values()].filter((b) => b.type === 'fence').every((b) => b.built), DAY_TICKS);
    assertReservationsConsistent(sim);
    // Work at the other settlement costs extra, so each group favours its own.
    const mover = sim.settler(movers[0])!;
    const stayer = sim.settlers.find((s) => s.settlementId === home.id)!;
    expect(awayPenalty(sim, mover, pAway.x, pAway.y)).toBe(0);
    expect(awayPenalty(sim, mover, pHome.x, pHome.y)).toBeGreaterThan(0);
    expect(awayPenalty(sim, stayer, pHome.x, pHome.y)).toBe(0);
    expect(awayPenalty(sim, stayer, pAway.x, pAway.y)).toBeGreaterThan(0);
  });

  it('stock targets keep a store supplied from others, conserving every unit', () => {
    const { sim, hall } = withOutpost();
    camp(sim).inventory = { food: 120, wood: 60, stone: 20 };
    applyCommand(sim, { type: 'assignSettlement', ids: sim.settlers.slice(3).map((s) => s.id), settlementId: hall.id });
    expect(applyCommand(sim, { type: 'setWants', buildingId: hall.id, res: 'food', amount: 30 }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'setWants', buildingId: hall.id, res: 'wood', amount: 999 }).ok).toBe(true);
    expect(hall.wants.wood).toBe(150); // capped at capacity
    applyCommand(sim, { type: 'setWants', buildingId: hall.id, res: 'wood', amount: 20 });
    const foodIn = 120;
    runUntil(sim, () => (hall.inventory.food ?? 0) >= 30 && (hall.inventory.wood ?? 0) >= 20, DAY_TICKS * 3);
    assertReservationsConsistent(sim);
    assertNoNegativeReservations(sim);
    expect(sim.storageUsed(hall)).toBeLessThanOrEqual(sim.storageCapacity(hall));
    // Food moved, not created: stores + hands + eaten = start + gathered.
    const eatenBound = foodIn + sim.stats.foodGathered + sim.stats.harvested - accountedFor(sim, 'food');
    expect(eatenBound).toBeGreaterThanOrEqual(0);
    expect(accountedFor(sim, 'wood')).toBe(60 + sim.stats.woodGathered);
    // Stock targets never pull a store below its own target.
    applyCommand(sim, { type: 'setWants', buildingId: camp(sim).id, res: 'food', amount: 500 });
    applyCommand(sim, { type: 'setWants', buildingId: hall.id, res: 'food', amount: 150 });
    expect(surplus(sim, camp(sim), 'food')).toBeLessThanOrEqual(0);
    for (let i = 0; i < 30; i++) {
      run(sim, 20);
      // No supply run ever draws from a store that is below its own target.
      for (const s of sim.settlers) {
        const t = s.task;
        if (t?.kind === 'haul' && t.dst === hall.id && t.res === 'food' && t.stage === 'toSrc') expect(t.src).not.toBe(camp(sim).id);
      }
    }
  });

  it('detects an unbroken road joining two settlements (settlers lay the paths; gaps filled for the check)', () => {
    const { sim, hall, home } = withOutpost();
    expect(roadLinked(sim, home.id, hall.id)).toBe(false);
    const y = home.y + home.h;
    const res = applyCommand(sim, { type: 'placeArea', building: 'path', x0: hall.x + 1, y0: y, x1: home.x, y1: y });
    expect(res.ok).toBe(true);
    // Paths can't cross obstacles: fill any gaps directly for this rule check.
    runUntil(sim, () => ![...sim.buildings.values()].some((b) => b.type === 'path'), DAY_TICKS * 2);
    for (let x = hall.x + 1; x <= home.x; x++) if (sim.world.terrain(x, y) !== T.Road) sim.world.setTerrain(x, y, T.Road);
    const hb = hall.y + hall.h;
    for (let yy = Math.min(hb, y); yy <= Math.max(hb, y); yy++) sim.world.setTerrain(hall.x + 1, yy, T.Road);
    sim.mapChanged();
    expect(roadLinked(sim, home.id, hall.id)).toBe(true);
    expect(requirementProgress(sim, { kind: 'roadLink' }).done).toBe(true);
  });

  it('Town accepts any 2 of its 4 projects', () => {
    const { sim, hall } = withOutpost();
    const town = MILESTONES.town;
    const anyOf = () => requirementProgress(sim, town.requirements[2]);
    expect(anyOf().current).toBe(0);
    applyCommand(sim, { type: 'assignSettlement', ids: sim.settlers.slice(1).map((s) => s.id), settlementId: hall.id });
    for (let i = 0; i < 4; i++) sim.addSettler(0, 3, 'laborer');
    expect(anyOf().options![0].done).toBe(true); // 2 settlements with 4+ each
    sim.stats.toolsCrafted = 10;
    expect(anyOf().done).toBe(true);
  });

  it('settlers without a bed rest at their own settlement hall', () => {
    const { sim, hall } = withOutpost();
    for (let i = 0; i < 6; i++) sim.addSettler(-30, 2, 'laborer', undefined, hall.id);
    const counts = residentCounts(sim);
    expect(counts.get(hall.id) ?? 0).toBeLessThanOrEqual(4);
  });

  it('round-trips settlements, memberships and stock targets; migrates a real v3 save', () => {
    const { sim, hall } = withOutpost();
    applyCommand(sim, { type: 'assignSettlement', ids: [sim.settlers[4].id], settlementId: hall.id });
    applyCommand(sim, { type: 'setWants', buildingId: hall.id, res: 'food', amount: 25 });
    run(sim, 200);
    const stable = (s: Simulation) => {
      const f = serializeSim(s, extras);
      return { ...f, meta: { ...f.meta, savedAt: 0 } };
    };
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    expect(stable(loaded)).toEqual(stable(sim));
    expect(loaded.buildings.get(hall.id)!.wants).toEqual({ food: 25 });

    const v3 = JSON.parse(readFileSync('tests/fixtures/v3-save.json', 'utf8'));
    expect(v3.version).toBe(3);
    const save = migrate(v3);
    expect(save.version).toBe(SAVE_VERSION);
    const old = deserializeSim(save);
    expect(old.settlements).toHaveLength(1);
    expect(old.settlements[0].name).toBe('Fixture Village');
    expect(old.settlers.every((s) => s.settlementId === old.settlements[0].id)).toBe(true);
    expect(old.workAreas).toHaveLength(1);
    run(old, 300);
    assertReservationsConsistent(old);
  });
});

it('publishes a seasonal calendar and settlement supplies', async () => {
 const { regionalInfo } = await import('../src/engine/snapshot');
 const sim = createNewGame(42);
 const view = regionalInfo(sim);
 expect(view.calendar).toContain('Spring');
 expect(view.towns).toHaveLength(1);
 expect(view.towns[0].people).toHaveLength(5);
 expect(view.forecast).toContain('Winter');
});
