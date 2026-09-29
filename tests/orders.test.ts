import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { addAnimal } from '../src/game/sim/animals';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import { effectivePriorities } from '../src/game/sim/priorities';
import { STOP_TICKS } from '../src/game/sim/orders';
import type { Simulation } from '../src/game/sim/Simulation';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { nearestResource, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Orders', createdAt: 1 })))));

function world(seed = 8801) {
  const sim = createNewGame(seed, CURRENT_GEN, 'valley', { rulerName: 'Lloyd' });
  campOf(sim)!.inventory = { food: 200, wood: 60, stone: 40 };
  for (const s of sim.settlers) {
    s.hunger = 100;
    s.energy = 100;
  }
  return sim;
}
const people = (sim: Simulation) => sim.settlers.filter((s) => !s.ruler);

describe('main job and side job', () => {
  it('the side job is done right after the main job’s own work', () => {
    const sim = world();
    const s = people(sim).find((p) => p.job === 'farmer')!;
    const res = applyCommand(sim, { type: 'setSideJob', ids: [s.id], job: 'builder' });
    expect(res.ok, res.message).toBe(true);
    expect(s.sideJob).toBe('builder');
    expect(effectivePriorities(s)).toEqual(['farm', 'build', 'haul', 'gather']);
    applyCommand(sim, { type: 'setSideJob', ids: [s.id], job: null });
    expect(effectivePriorities(s)).toEqual(['farm', 'haul', 'build', 'gather']);
  });

  it('side jobs follow what the Town Hall teaches', () => {
    const sim = world();
    const s = people(sim)[0];
    const res = applyCommand(sim, { type: 'setSideJob', ids: [s.id], job: 'hunter' });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Keep/);
    expect(applyCommand(sim, { type: 'setSideJob', ids: [s.id], job: 'chief' }).ok).toBe(false);
    expect(applyCommand(sim, { type: 'setSideJob', ids: [s.id], job: s.job }).message).toMatch(/main job/i);
  });

  it('a traveller or chief falls back on their side job for work', () => {
    const sim = world();
    const s = people(sim)[0];
    s.job = 'traveler';
    s.sideJob = 'gatherer';
    expect(effectivePriorities(s)).toEqual(['gather', 'haul', 'build']);
  });
});

describe('Warcraft-style orders', () => {
  it('Stop drops what they are doing and holds still for a moment, then they carry on', () => {
    const sim = world();
    const s = people(sim).find((p) => p.job === 'gatherer')!;
    const tree = nearestResource(sim, 'wood')!;
    applyCommand(sim, { type: 'gather', ids: [s.id], x: tree.x, y: tree.y });
    run(sim, 5);
    expect(s.task).not.toBeNull();
    expect(applyCommand(sim, { type: 'stop', ids: [s.id] }).ok).toBe(true);
    expect(s.task).toBeNull();
    expect(s.focus).toBeNull();
    run(sim, STOP_TICKS - 2);
    expect(s.task === null || s.task.kind === 'wander').toBe(true);
    runUntil(sim, () => !!s.task && s.task.kind !== 'wander', STOP_TICKS * 20);
  });

  it('Hold keeps them where they stand until another order', () => {
    const sim = world();
    const s = people(sim).find((p) => p.job === 'builder')!;
    applyCommand(sim, { type: 'hold', ids: [s.id] });
    expect(s.hold).toBe(true);
    const at = { x: s.x, y: s.y };
    run(sim, 600);
    expect(Math.hypot(s.x - at.x, s.y - at.y)).toBeLessThan(0.01);
    expect(s.idleReason).toMatch(/Holding/);
    applyCommand(sim, { type: 'move', ids: [s.id], x: Math.floor(s.x) + 3, y: Math.floor(s.y) });
    expect(s.hold).toBeFalsy();
  });

  it('Attack sends them after an animal, bare-handed, and the meat comes home', () => {
    const sim = world(8802);
    sim.animals = [];
    const s = people(sim).find((p) => p.job === 'laborer')!;
    const rabbit = addAnimal(sim, 'rabbit', Math.floor(s.x) + 5, Math.floor(s.y) + 1);
    const before = sim.storedTotal('food');
    const res = applyCommand(sim, { type: 'hunt', ids: [s.id], animalId: rabbit.id });
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => !sim.animals.includes(rabbit), DAY_TICKS / 2);
    runUntil(sim, () => sim.storedTotal('food') > before - 20 && !s.carrying, DAY_TICKS / 2);
    expect(sim.stats.foodGathered).toBeGreaterThan(0);
  });

  it('Attack refuses penned animals, and the ruler never fights', () => {
    const sim = world();
    const me = sim.settlers.find((x) => x.ruler)!;
    const a = addAnimal(sim, 'deer', 4, 4);
    expect(applyCommand(sim, { type: 'hunt', ids: [me.id], animalId: a.id }).ok).toBe(false);
    a.penId = 1;
    expect(applyCommand(sim, { type: 'hunt', ids: [people(sim)[0].id], animalId: a.id }).message).toMatch(/pen/i);
  });

  it('Return goods sends a carrier to the nearest store', () => {
    const sim = world();
    const s = people(sim)[0];
    s.carrying = { res: 'wood', amount: 5 };
    const wood = sim.storedTotal('wood');
    expect(applyCommand(sim, { type: 'returnGoods', ids: [s.id] }).ok).toBe(true);
    runUntil(sim, () => !s.carrying, 600);
    expect(sim.storedTotal('wood')).toBe(wood + 5);
    expect(applyCommand(sim, { type: 'returnGoods', ids: [s.id] }).ok).toBe(false);
  });

  it('side job and hold survive a save', () => {
    const sim = world();
    const [a, b] = people(sim);
    applyCommand(sim, { type: 'setSideJob', ids: [a.id], job: 'hauler' });
    applyCommand(sim, { type: 'hold', ids: [b.id] });
    const back = reload(sim);
    expect(back.settler(a.id)!.sideJob).toBe('hauler');
    expect(back.settler(b.id)!.hold).toBe(true);
  });
});
