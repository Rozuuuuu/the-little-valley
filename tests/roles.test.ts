import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { JOBS, ROLE_TRAIN_TICKS } from '../src/game/data/jobs';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { addAnimal } from '../src/game/sim/animals';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { letterTicks } from '../src/game/sim/diplomacy';
import { newPlayerKingdom } from '../src/game/sim/kingdoms';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import type { SimEvent } from '../src/game/sim/types';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { instant, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Roles', createdAt: 1 })))));

function world(level: 1 | 2 | 3 = 1, seed = 7701) {
  const sim = createNewGame(seed, CURRENT_GEN, 'valley', { rulerName: 'Lloyd' });
  const hall = campOf(sim)!;
  hall.inventory = { food: 300, wood: 100, stone: 80 };
  hall.level = level;
  sim.progression.reached.push('hamlet', 'village');
  for (const s of sim.settlers) {
    s.hunger = 100;
    s.energy = 100;
  }
  return { sim, hall };
}

const people = (sim: Simulation) => sim.settlers.filter((s) => !s.ruler);

describe('roles trained at the Town Hall', () => {
  it('a settler walks to the hall, trains for a while, and comes out with the new role', () => {
    const { sim } = world();
    const s = people(sim).find((p) => p.job === 'laborer')!;
    const res = applyCommand(sim, { type: 'trainRole', ids: [s.id], role: 'farmer' });
    expect(res.ok, res.message).toBe(true);
    expect(s.job).toBe('laborer');
    expect(s.training?.role).toBe('farmer');
    runUntil(sim, () => s.job === 'farmer', ROLE_TRAIN_TICKS * 4);
    expect(s.training).toBeFalsy();
  });

  it('the hall level decides the roles: working roles at once, travellers and messengers at a Keep, the Assistant Chief at a Castle', () => {
    const { sim, hall } = world(1);
    const s = people(sim)[0];
    expect(applyCommand(sim, { type: 'trainRole', ids: [people(sim)[2].id], role: 'crafter' }).ok).toBe(true);
    const messenger = applyCommand(sim, { type: 'trainRole', ids: [s.id], role: 'messenger' });
    expect(messenger.ok).toBe(false);
    expect(messenger.message).toMatch(/Keep/);
    hall.level = 2;
    expect(applyCommand(sim, { type: 'trainRole', ids: [s.id], role: 'traveler' }).ok).toBe(true);
    const chief = applyCommand(sim, { type: 'trainRole', ids: [people(sim)[1].id], role: 'chief' });
    expect(chief.message).toMatch(/Castle/);
    hall.level = 3;
    expect(applyCommand(sim, { type: 'trainRole', ids: [people(sim)[1].id], role: 'chief' }).ok).toBe(true);
    // Only one Assistant Chief.
    expect(applyCommand(sim, { type: 'trainRole', ids: [people(sim)[2].id], role: 'chief' }).message).toMatch(/already/i);
    expect(JOBS.chief.hallLevel).toBe(3);
  });

  it('the ruler, children and anyone already in the role cannot train; the hall has only so many places', () => {
    const { sim } = world(1);
    const me = sim.settlers.find((x) => x.ruler)!;
    expect(applyCommand(sim, { type: 'trainRole', ids: [me.id], role: 'farmer' }).ok).toBe(false);
    const farmer = people(sim).find((p) => p.job === 'farmer')!;
    expect(applyCommand(sim, { type: 'trainRole', ids: [farmer.id], role: 'farmer' }).message).toMatch(/already/i);
    const others = people(sim).filter((p) => p.job !== 'builder');
    const res = applyCommand(sim, { type: 'trainRole', ids: others.map((p) => p.id), role: 'builder' });
    expect(res.ok).toBe(true);
    expect(sim.settlers.filter((p) => p.training).length).toBe(2);
    expect(res.message).toMatch(/full|places/i);
  });

  it('training survives a save, and can be cancelled', () => {
    const { sim } = world();
    const s = people(sim).find((p) => p.job === 'laborer')!;
    applyCommand(sim, { type: 'trainRole', ids: [s.id], role: 'hauler' });
    run(sim, 100);
    const loaded = reload(sim);
    const s2 = loaded.settler(s.id)!;
    expect(s2.training?.role).toBe('hauler');
    expect(applyCommand(loaded, { type: 'cancelRoleTraining', settlerId: s2.id }).ok).toBe(true);
    expect(s2.training).toBeFalsy();
    expect(s2.job).toBe('laborer');
  });
});

describe('travellers, messengers and the Assistant Chief', () => {
  it('travellers explore the land on their own', () => {
    const a = world(2, 7702);
    const b = world(2, 7702);
    const t = people(b.sim).find((p) => p.job === 'laborer')!;
    t.job = 'traveler';
    const before = a.sim.world.exploredTileCount();
    run(a.sim, DAY_TICKS / 2);
    run(b.sim, DAY_TICKS / 2);
    expect(b.sim.world.exploredTileCount()).toBeGreaterThan(a.sim.world.exploredTileCount() + 200);
    expect(a.sim.world.exploredTileCount()).toBeGreaterThanOrEqual(before);
  });

  it('a messenger halves the time letters take', () => {
    const { sim } = world(2);
    sim.kingdoms.push({ ...newPlayerKingdom('Farland'), id: 900, player: false, capital: { x: 400, y: 0 } });
    const slow = letterTicks(sim, 0, 900);
    people(sim)[0].job = 'messenger';
    expect(letterTicks(sim, 0, 900)).toBe(Math.max(60, Math.round(slow / 2)));
  });

  it('the Assistant Chief puts idle people to work where hands are missing', () => {
    const { sim } = world(3, 7703);
    const ws = instant(sim, 'workshop', { x: 8, y: -6 });
    const chief = people(sim)[0];
    chief.job = 'chief';
    for (const p of people(sim)) if (p !== chief) p.priorities = ['craft'];
    runUntil(sim, () => ws.workers.length > 0, DAY_TICKS);
    expect(ws.workers.some((id) => id !== chief.id)).toBe(true);
  });

  it('the Assistant Chief comes to the ruler with advice; the question mark opens it', () => {
    const { sim } = world(3, 7704);
    const chief = people(sim)[0];
    chief.job = 'chief';
    campOf(sim)!.inventory.food = 2;
    runUntil(sim, () => sim.chief.adviceReady, DAY_TICKS);
    const me = sim.settlers.find((x) => x.ruler)!;
    expect(Math.hypot(chief.x - me.x, chief.y - me.y)).toBeLessThanOrEqual(3.5);
    const res = applyCommand(sim, { type: 'hearAdvice' });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/food/i);
    expect(sim.chief.adviceReady).toBe(false);
    expect(applyCommand(sim, { type: 'hearAdvice' }).ok).toBe(false);
    const loaded = reload(sim);
    expect(loaded.chief.nextAt).toBe(sim.chief.nextAt);
  });
});

describe('animal deaths', () => {
  it('a kill announces the death so it can be animated', () => {
    const { sim } = world(2, 7705);
    const lodge = instant(sim, 'hunterLodge', { x: 6, y: 6 });
    sim.animals = [];
    const prey = addAnimal(sim, 'rabbit', lodge.x + 6, lodge.y + 1);
    applyCommand(sim, { type: 'assignWorker', buildingId: lodge.id, ids: [people(sim)[1].id] });
    const deaths: SimEvent[] = [];
    runUntil(sim, () => {
      deaths.push(...sim.drainEvents().filter((e) => e.type === 'death'));
      return deaths.length > 0;
    }, DAY_TICKS);
    const d = deaths[0] as Extract<SimEvent, { type: 'death' }>;
    expect(d.species).toBe('rabbit');
    expect(sim.animals.includes(prey)).toBe(false);
  });
});
