import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/game/data/buildings';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { bedsOf, campOf, placeBuilding, completeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { levelOf, levelName } from '../src/game/sim/levels';
import { createNewGame } from '../src/game/sim/newGame';
import { workSpeed } from '../src/game/sim/settlers';
import { visitorInterval } from '../src/game/sim/travelers';
import type { Simulation } from '../src/game/sim/Simulation';
import { instant, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Hall', createdAt: 1 })))));

describe('the Town Hall', () => {
  it('is the first building of a new valley: many bunks, a big store, the settlement centre', () => {
    const sim = createNewGame(777);
    const hall = campOf(sim)!;
    expect(hall.type).toBe('townHall');
    expect([...sim.buildings.values()].some((b) => b.type === 'camp')).toBe(false);
    expect(bedsOf(hall)).toBeGreaterThanOrEqual(10);
    expect(sim.storageCapacity(hall)).toBeGreaterThanOrEqual(600);
    expect(sim.settlements[0].id).toBe(hall.id);
    expect(sim.settlers.every((s) => s.homeId === hall.id)).toBe(true);
    expect(hall.w * hall.h).toBeGreaterThan(6);
    expect(applyCommand(sim, { type: 'remove', buildingId: hall.id }).ok).toBe(false);
  });

  it('upgrades to a Keep at Hamlet and a Castle at Village; the castle speeds up its town', () => {
    const sim = createNewGame(778);
    const hall = campOf(sim)!;
    hall.inventory = { food: 200, wood: 300, stone: 400, planks: 200, tools: 40, ironIngot: 20 };
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: hall.id }).message).toMatch(/Hamlet/);
    sim.progression.reached.push('hamlet');
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: hall.id }).ok).toBe(true);
    runUntil(sim, () => levelOf(hall) === 2, 20000);
    expect(levelName(hall)).toBe('Keep');
    const keep = BUILDINGS.townHall.levels![1];
    expect(bedsOf(hall)).toBe(keep.housing);
    expect(sim.storageCapacity(hall)).toBe(keep.storage);
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: hall.id }).message).toMatch(/Village/);
    sim.progression.reached.push('village');
    const s = sim.settlers[0];
    s.hunger = 100;
    s.energy = 100;
    const before = workSpeed(sim, s);
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: hall.id }).ok).toBe(true);
    runUntil(sim, () => levelOf(hall) === 3, 30000);
    expect(levelName(hall)).toBe('Castle');
    s.hunger = 100;
    s.energy = 100;
    expect(workSpeed(sim, s)).toBeCloseTo(before * 1.1, 5);
    const loaded = reload(sim);
    expect(levelOf(loaded.buildings.get(hall.id)!)).toBe(3);
  });

  it('an old world keeps its camp, which can be raised into a Town Hall in place (same settlement, same residents)', () => {
    const sim = createNewGame(779);
    // Build the old way: remove the hall and found a camp, like a v11 world.
    const hall = campOf(sim)!;
    sim.buildings.delete(hall.id);
    for (const k of [...sim.occupancy.keys()]) if (sim.occupancy.get(k) === hall.id) sim.occupancy.delete(k);
    const camp = placeBuilding(sim, 'camp', -1, -1);
    completeBuilding(sim, camp, true);
    camp.inventory = { food: 100, wood: 100, stone: 100, planks: 30 };
    sim.settlements = [{ id: camp.id, name: 'Home' }];
    for (const p of sim.settlers) {
      p.homeId = camp.id;
      p.settlementId = camp.id;
    }
    expect(campOf(sim)!.id).toBe(camp.id);
    expect(levelName(camp)).toBe('Camp');
    const res = applyCommand(sim, { type: 'upgradeBuilding', buildingId: camp.id });
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => camp.type === 'townHall', 20000);
    expect(sim.buildings.get(camp.id)).toBe(camp);
    expect(camp.w).toBe(BUILDINGS.townHall.size.w);
    expect(camp.h).toBe(BUILDINGS.townHall.size.h);
    for (let y = camp.y; y < camp.y + camp.h; y++) for (let x = camp.x; x < camp.x + camp.w; x++) expect(sim.buildingAt(x, y)).toBe(camp);
    expect(sim.settlements[0].id).toBe(camp.id);
    expect(sim.settlers.every((p) => p.homeId === camp.id)).toBe(true);
    expect(sim.storedTotal('food')).toBeGreaterThan(0);
  });

  it('refuses to raise the hall when something stands where it would grow, and says so', () => {
    const sim = createNewGame(780);
    const hall = campOf(sim)!;
    sim.buildings.delete(hall.id);
    for (const k of [...sim.occupancy.keys()]) if (sim.occupancy.get(k) === hall.id) sim.occupancy.delete(k);
    const camp = placeBuilding(sim, 'camp', -1, -1);
    completeBuilding(sim, camp, true);
    camp.inventory = { wood: 100, stone: 100, planks: 30 };
    sim.settlements = [{ id: camp.id, name: 'Home' }];
    // A flower bed right where the hall would grow.
    const bed = placeBuilding(sim, 'flowerbed', camp.x + 3, camp.y);
    completeBuilding(sim, bed, true);
    const res = applyCommand(sim, { type: 'upgradeBuilding', buildingId: camp.id });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/room|clear|flower/i);
  });

  it('the Travellers\' Camp is a separate buildable stop that makes visitors come more often', () => {
    const sim = createNewGame(781);
    expect(BUILDINGS.travelCamp.buildable).toBe(true);
    expect(BUILDINGS.travelCamp.settlementCenter).toBeUndefined();
    const before = visitorInterval(sim);
    instant(sim, 'travelCamp', { x: 8, y: 8 });
    expect(visitorInterval(sim)).toBeLessThan(before);
    run(sim, 10);
  });
});
