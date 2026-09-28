import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { SPECIES, WILDLIFE } from '../src/game/data/animals';
import { HABITAT_IDS, type HabitatId } from '../src/game/data/habitats';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { penAnimals } from '../src/game/sim/animals';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { WATER_THRESHOLD } from '../src/game/sim/farming';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { T } from '../src/game/world/tiles';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { assertReservationsConsistent, clearSpot, instant, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Zoo', createdAt: 1 })))));

function stocked(seed: number, habitat: HabitatId = 'valley') {
  const sim = createNewGame(seed, CURRENT_GEN, habitat);
  // Well inside the hall's 600 so there is room for what the animals bring in.
  campOf(sim)!.inventory = { food: 150, wood: 100, stone: 80, planks: 40 };
  sim.progression.reached.push('hamlet', 'village');
  return sim;
}

describe('wild animals', () => {
  for (const habitat of HABITAT_IDS) {
    it(`${habitat}: a new world starts with its own animals in sight`, () => {
      const sim = createNewGame(8080, CURRENT_GEN, habitat);
      const wild = sim.animals.filter((a) => a.penId === null);
      expect(wild.length).toBeGreaterThanOrEqual(4);
      const allowed = new Set(WILDLIFE[habitat].map((e) => e.species));
      for (const a of wild) {
        expect(allowed.has(a.species), `${a.species} in ${habitat}`).toBe(true);
        expect(sim.world.explored(Math.floor(a.x), Math.floor(a.y))).toBe(true);
      }
    });
  }

  it('they wander where they belong (ducks on water, the rest on open ground) and never onto buildings', () => {
    const sim = createNewGame(8181, CURRENT_GEN, 'marsh');
    run(sim, 2000);
    for (const a of sim.animals) {
      const tx = Math.floor(a.x);
      const ty = Math.floor(a.y);
      const t = sim.world.terrain(tx, ty);
      if (SPECIES[a.species].swims) expect([T.Water, T.DeepWater]).toContain(t);
      else if (a.penId === null) expect(sim.walkable(tx, ty)).toBe(true);
    }
  });

  it('prey runs from people who come close', () => {
    const sim = createNewGame(8282);
    const a = sim.animals.find((x) => SPECIES[x.species].fleeFrom > 0 && !SPECIES[x.species].swims)!;
    const s = sim.settlers[0];
    s.x = a.x + 1;
    s.y = a.y;
    const p0 = { x: s.x, y: s.y };
    const d0 = Math.hypot(a.x - p0.x, a.y - p0.y);
    run(sim, 40);
    expect(Math.hypot(a.x - p0.x, a.y - p0.y)).toBeGreaterThan(d0 + 2);
  });

  it('older worlds get valley animals over time', () => {
    const sim = createNewGame(8383, 3);
    sim.animals = [];
    run(sim, 1200);
    expect(sim.animals.length).toBeGreaterThan(0);
    const valley = new Set(WILDLIFE.valley.map((e) => e.species));
    for (const a of sim.animals) expect(valley.has(a.species)).toBe(true);
  });
});

describe('hunting', () => {
  it("a hunter's lodge brings in meat and keeps the hides, and the game is gone", () => {
    const sim = stocked(8484, 'forest');
    const lodge = instant(sim, 'hunterLodge', { x: 6, y: 6 });
    const hunter = sim.settlers[1];
    expect(applyCommand(sim, { type: 'assignWorker', buildingId: lodge.id, ids: [hunter.id] }).ok).toBe(true);
    const before = sim.animals.filter((a) => a.penId === null).length;
    const food0 = sim.stats.foodGathered;
    let kills = 0;
    const ids = new Set(sim.animals.map((a) => a.id));
    runUntil(sim, () => (lodge.inventory.hides ?? 0) > 0, DAY_TICKS * 2);
    for (const id of ids) if (!sim.animals.some((a) => a.id === id)) kills++;
    expect(kills).toBeGreaterThan(0);
    expect(sim.stats.foodGathered).toBeGreaterThan(food0);
    void before;
    assertReservationsConsistent(sim);
    // Save mid-hunt: the reload re-plans cleanly.
    runUntil(sim, () => hunter.task?.kind === 'hunt', DAY_TICKS);
    const loaded = reload(sim);
    run(loaded, 300);
    assertReservationsConsistent(loaded);
  });
});

describe('livestock', () => {
  it('a chicken coop starts with a pair inside, breeds, and its herder brings in eggs', () => {
    const sim = stocked(8585);
    const coop = instant(sim, 'chickenCoop', { x: -8, y: -6 });
    expect(penAnimals(sim, coop)).toHaveLength(2);
    const herder = sim.settlers[0];
    applyCommand(sim, { type: 'assignWorker', buildingId: coop.id, ids: [herder.id] });
    const food0 = sim.stats.foodGathered;
    run(sim, DAY_TICKS * 2);
    expect(penAnimals(sim, coop).length).toBeGreaterThan(2);
    for (const a of penAnimals(sim, coop)) {
      expect(a.x).toBeGreaterThanOrEqual(coop.x);
      expect(a.x).toBeLessThanOrEqual(coop.x + coop.w);
      expect(a.y).toBeGreaterThanOrEqual(coop.y);
      expect(a.y).toBeLessThanOrEqual(coop.y + coop.h);
    }
    expect(sim.stats.foodGathered).toBeGreaterThan(food0);
  });

  it('sheep give wool; a full sty sends a pig to the butcher for meat and hides', () => {
    const sim = stocked(8686);
    const pen = instant(sim, 'sheepPen', { x: -9, y: -7 });
    const sty = instant(sim, 'pigsty', { x: 8, y: -7 });
    applyCommand(sim, { type: 'assignWorker', buildingId: pen.id, ids: [sim.settlers[0].id] });
    applyCommand(sim, { type: 'assignWorker', buildingId: sty.id, ids: [sim.settlers[1].id] });
    runUntil(sim, () => sim.storedTotal('wool') > 0, DAY_TICKS * 3);
    // Fill the sty to the top.
    while (penAnimals(sim, sty).length < BUILDINGS_CAP(sty.type)) {
      const { addAnimal } = animalsModule;
      addAnimal(sim, 'pig', sty.x, sty.y, sty.id);
    }
    runUntil(sim, () => sim.storedTotal('hides') > 0, DAY_TICKS * 2);
    expect(penAnimals(sim, sty).length).toBeLessThan(BUILDINGS_CAP(sty.type));
  });

  it('pens, their animals and their state survive a save', () => {
    const sim = stocked(8787);
    const coop = instant(sim, 'chickenCoop', { x: -8, y: -6 });
    run(sim, 500);
    const loaded = reload(sim);
    const c2 = loaded.buildings.get(coop.id)!;
    expect(penAnimals(loaded, c2).length).toBe(penAnimals(sim, coop).length);
    expect(c2.pen!.ready).toBeCloseTo(coop.pen!.ready, 5);
    expect(loaded.animals.length).toBe(sim.animals.length);
  });

  it('a horse paddock sends trained horses to the stable', () => {
    const sim = stocked(8888);
    sim.progression.reached.push('town', 'region');
    const paddock = instant(sim, 'horsePaddock', { x: -10, y: -8 });
    instant(sim, 'stable', { x: 9, y: -8 });
    applyCommand(sim, { type: 'assignWorker', buildingId: paddock.id, ids: [sim.settlers[2].id] });
    runUntil(sim, () => sim.storedTotal('horses') > 0, DAY_TICKS * 3);
    expect(sim.storedTotal('horses')).toBeGreaterThan(0);
  });
});

describe('fishing, wells and crafts', () => {
  it("a fisher's hut must touch water; its fishers land food", () => {
    const sim = stocked(8989);
    const dry = clearSpot(sim, 2, 2, { x: -4, y: -8 });
    expect(applyCommand(sim, { type: 'place', building: 'fisherHut', x: dry.x, y: dry.y }).message).toMatch(/shore|water/i);
    // The spawn pond is at (9, 6).
    let spot: { x: number; y: number } | null = null;
    for (let y = 1; y <= 11 && !spot; y++) for (let x = 3; x <= 15 && !spot; x++) {
      if (applyCommand(sim, { type: 'place', building: 'fisherHut', x, y }).ok) spot = { x, y };
    }
    expect(spot).not.toBeNull();
    const hut = sim.buildingAt(spot!.x, spot!.y)!;
    runUntil(sim, () => hut.built, DAY_TICKS * 2);
    applyCommand(sim, { type: 'assignWorker', buildingId: hut.id, ids: [sim.settlers[3].id] });
    const food0 = sim.stats.foodGathered;
    runUntil(sim, () => sim.stats.foodGathered >= food0 + 3, DAY_TICKS);
  });

  it('fields near a well never need watering', () => {
    const sim = stocked(9090);
    const well = instant(sim, 'well', { x: -7, y: 2 });
    applyCommand(sim, { type: 'placeArea', building: 'field', x0: well.x - 2, y0: well.y + 1, x1: well.x + 2, y1: well.y + 2, crop: 'turnip' });
    const fields = [...sim.buildings.values()].filter((b) => b.field);
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) f.field!.moisture = 0;
    sim.weather.raining = false;
    run(sim, 10);
    for (const f of fields) expect(f.field!.moisture).toBeGreaterThanOrEqual(WATER_THRESHOLD);
  });

  it('a tannery turns hides into leather and a weaver turns wool into cloth', () => {
    const sim = stocked(9191);
    campOf(sim)!.inventory.hides = 10;
    campOf(sim)!.inventory.wool = 10;
    const tan = instant(sim, 'tannery', { x: -9, y: -6 });
    const wv = instant(sim, 'weaver', { x: 8, y: -6 });
    applyCommand(sim, { type: 'assignWorker', buildingId: tan.id, ids: [sim.settlers[0].id] });
    applyCommand(sim, { type: 'assignWorker', buildingId: wv.id, ids: [sim.settlers[1].id] });
    applyCommand(sim, { type: 'setJob', ids: [sim.settlers[0].id, sim.settlers[1].id], job: 'crafter' });
    runUntil(sim, () => sim.storedTotal('leather') > 0 && sim.storedTotal('cloth') > 0, DAY_TICKS * 2);
  });
});

import * as animalsModule from '../src/game/sim/animals';
import type { BuildingId } from '../src/game/data/buildings';
function BUILDINGS_CAP(type: BuildingId): number {
  return animalsModule.penCapacity({ type, level: 1 } as never);
}
