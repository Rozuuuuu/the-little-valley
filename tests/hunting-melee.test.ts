import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { SPECIES, WEAPONS } from '../src/game/data/animals';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { addAnimal, weaponOfLodge } from '../src/game/sim/animals';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Animal, Building, SimEvent } from '../src/game/sim/types';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { assertReservationsConsistent, instant, run, runUntil } from './helpers';

type Hit = Extract<SimEvent, { type: 'hit' }>;

/** A world with one lodge at the given level, one hunter, and every wild animal but one deer cleared. */
function huntWorld(level: 1 | 2 | 3, species: Animal['species'] = 'deer', seed = 9301) {
  const sim = createNewGame(seed, CURRENT_GEN, 'valley');
  campOf(sim)!.inventory = { food: 200, wood: 80, stone: 40, planks: 40, tools: 10, leather: 10 };
  sim.progression.reached.push('hamlet', 'village');
  const lodge = instant(sim, 'hunterLodge', { x: 6, y: 6 });
  lodge.level = level;
  sim.animals = [];
  sim.animalRng.state = 1;
  const prey = addAnimal(sim, species, lodge.x + 9, lodge.y + 2);
  const hunter = sim.settlers[1];
  hunter.hunger = 100;
  hunter.energy = 100;
  expect(applyCommand(sim, { type: 'assignWorker', buildingId: lodge.id, ids: [hunter.id] }).ok).toBe(true);
  return { sim, lodge, prey, hunter };
}

function hits(sim: Simulation): Hit[] {
  return sim.events.filter((e): e is Hit => e.type === 'hit');
}

/** Runs until the prey is gone, collecting every blow struck. */
function huntDown(sim: Simulation, prey: Animal, max = DAY_TICKS): { ticks: number; blows: Hit[] } {
  const blows: Hit[] = [];
  let t = 0;
  while (sim.animals.includes(prey) && t < max) {
    sim.step();
    blows.push(...hits(sim));
    sim.drainEvents();
    t++;
  }
  expect(sim.animals.includes(prey), 'the prey should be hunted down').toBe(false);
  return { ticks: t, blows };
}

describe('melee hunting by damage', () => {
  it('weapons follow the lodge level: bare hands, then knives, then bows', () => {
    const { lodge } = huntWorld(1);
    expect(weaponOfLodge(lodge)).toBe('hands');
    expect(weaponOfLodge({ ...lodge, level: 2 } as Building)).toBe('knife');
    expect(weaponOfLodge({ ...lodge, level: 3 } as Building)).toBe('bow');
    expect(WEAPONS.knife.damage).toBeGreaterThan(WEAPONS.hands.damage);
    expect(WEAPONS.bow.reach).toBeGreaterThan(3);
    expect(WEAPONS.hands.reach).toBeLessThanOrEqual(1.5);
  });

  it('bare-handed hunters strike only from close by, blow after blow, until the animal falls', () => {
    const { sim, prey } = huntWorld(1);
    const { blows } = huntDown(sim, prey);
    expect(blows.length).toBeGreaterThan(1);
    for (const b of blows.filter((x) => x.target === 'animal')) expect(b.reach).toBeLessThanOrEqual(WEAPONS.hands.reach + 0.3);
    expect(blows.filter((x) => x.target === 'animal').reduce((n, b) => n + b.amount, 0)).toBeGreaterThanOrEqual(SPECIES.deer.hp);
    expect(sim.stats.foodGathered).toBeGreaterThan(0);
    assertReservationsConsistent(sim);
  });

  it('knives bring the same deer down in fewer blows than bare hands', () => {
    const a = huntWorld(1);
    const b = huntWorld(2);
    const bare = huntDown(a.sim, a.prey).blows.filter((x) => x.target === 'animal').length;
    const knife = huntDown(b.sim, b.prey).blows.filter((x) => x.target === 'animal').length;
    expect(knife).toBeLessThan(bare);
  });

  it('archers shoot from a distance', () => {
    const { sim, prey } = huntWorld(3);
    const { blows } = huntDown(sim, prey);
    expect(blows.some((x) => x.target === 'animal' && x.reach > 2.5)).toBe(true);
  });

  it('a bear fights back; a hurt hunter breaks off and heals, and nobody dies', () => {
    const { sim, hunter } = huntWorld(1, 'bear', 9302);
    const people = sim.settlers.length;
    let hurt = false;
    let brokeOff = false;
    for (let i = 0; i < DAY_TICKS && !brokeOff; i++) {
      sim.step();
      if ((hunter.hp ?? 100) < 100) hurt = true;
      if (hurt && hunter.task?.kind !== 'hunt' && (hunter.hp ?? 100) < 50) brokeOff = true;
      sim.drainEvents();
    }
    expect(hurt).toBe(true);
    expect(brokeOff).toBe(true);
    expect(hunter.hp!).toBeGreaterThan(0);
    const low = hunter.hp!;
    run(sim, 1200);
    expect(hunter.hp!).toBeGreaterThan(low);
    expect(sim.settlers).toHaveLength(people);
  });

  it('health survives a save', () => {
    const { sim, prey, hunter } = huntWorld(1);
    runUntil(sim, () => (prey.hp ?? SPECIES.deer.hp) < SPECIES.deer.hp, DAY_TICKS);
    hunter.hp = 63;
    const back = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'HP', createdAt: 1 })))));
    expect(back.animals.find((a) => a.id === prey.id)!.hp).toBe(prey.hp);
    expect(back.settler(hunter.id)!.hp).toBe(63);
  });
});
