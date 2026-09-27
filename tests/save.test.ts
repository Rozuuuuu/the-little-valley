import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { SAVE_VERSION, SaveError } from '../src/game/save/format';
import { migrate } from '../src/game/save/migrations';
import { SaveManager } from '../src/game/save/SaveManager';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { MemoryStore } from '../src/game/save/storage';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { O } from '../src/game/world/tiles';
import { accountedFor, assertNoNegativeReservations, nearestResource, run } from './helpers';

const extras = { name: 'Test Valley', createdAt: 1000 };

function playedSim(): Simulation {
  const sim = createNewGame(31337);
  const camp = [...sim.buildings.values()].find((b) => b.type === 'camp')!;
  camp.inventory = { food: 50, wood: 50, stone: 30 };
  applyCommand(sim, { type: 'placeArea', building: 'field', x0: -8, y0: 4, x1: -7, y1: 5, crop: 'wheat' });
  applyCommand(sim, { type: 'place', building: 'house', x: 3, y: -4 });
  const tree = nearestResource(sim, 'wood')!;
  applyCommand(sim, { type: 'gather', ids: [sim.settlers[1].id], x: tree.x, y: tree.y });
  run(sim, 900);
  return sim;
}

/** Everything except the save timestamp. */
function stable(sim: Simulation) {
  const f = serializeSim(sim, extras);
  return { ...f, meta: { ...f.meta, savedAt: 0 } };
}

describe('serialisation', () => {
  it('round-trips a played world exactly', () => {
    const sim = playedSim();
    const text = JSON.stringify(serializeSim(sim, extras));
    const loaded = deserializeSim(migrate(JSON.parse(text)));
    expect(stable(loaded)).toEqual(stable(sim));
  });

  it('persists changed chunks, exploration and marks', () => {
    const sim = createNewGame(99);
    const tree = nearestResource(sim, 'wood')!;
    sim.world.setObj(tree.x, tree.y, O.Stump);
    sim.world.reveal(40.5, 40.5, 5);
    applyCommand(sim, { type: 'designate', x0: -16, y0: -16, x1: 16, y1: 16, on: true });
    const marks = sim.designations.size;
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    expect(loaded.world.obj(tree.x, tree.y)).toBe(O.Stump);
    expect(loaded.world.explored(40, 40)).toBe(true);
    expect(loaded.world.explored(60, 60)).toBe(false);
    expect(loaded.designations.size).toBe(marks);
  });

  it('only stores unexplored, unchanged chunks as nothing at all', () => {
    const sim = createNewGame(5);
    sim.world.chunk(10, 10); // generated but never seen
    const file = serializeSim(sim, extras);
    expect(file.world.chunks.find((c) => c.cx === 10 && c.cy === 10)).toBeUndefined();
    expect(file.world.chunks.every((c) => c.terrain === undefined)).toBe(true);
  });

  it('resumes play after loading without losing goods', () => {
    const sim = playedSim();
    const wood = accountedFor(sim, 'wood');
    const loaded = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, extras)))));
    // Goods in transit are carried, not lost, when tasks are dropped on load.
    expect(accountedFor(loaded, 'wood')).toBe(wood);
    run(loaded, DAY_TICKS);
    assertNoNegativeReservations(loaded);
    expect(loaded.tick).toBe(sim.tick + DAY_TICKS);
  });
});

describe('migrations', () => {
  it('upgrades a v1 prototype save', () => {
    const v1 = {
      version: 1,
      name: 'Prototype',
      seed: 77,
      savedAt: 5,
      tick: 1200,
      nextId: 10,
      settlers: [
        { id: 1, name: 'Old Wren', x: 0.5, y: 2.5, facing: 0, job: 'worker', carrying: null, hunger: 80, homeId: null, appearance: { skin: 0, hair: 0, hairStyle: 0, shirt: 0, pants: 0 } },
      ],
      buildings: [{ id: 2, type: 'camp', x: -1, y: -1, built: true, progress: 0, inventory: { food: 12 } }],
      stats: { woodGathered: 4 },
      chunks: [],
    };
    const save = migrate(v1);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.sim.settlers[0].job).toBe('laborer');
    expect(save.sim.stats.planksCrafted).toBe(0);
    expect(save.sim.stats.woodGathered).toBe(4);
    const sim = deserializeSim(save);
    expect(sim.settlers[0].name).toBe('Old Wren');
    expect(sim.totals().food).toBe(12);
    run(sim, 50);
  });

  it('rejects saves from the future and damaged saves', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(SaveError);
    expect(() => migrate(null)).toThrow(SaveError);
    const good = JSON.parse(JSON.stringify(serializeSim(createNewGame(3), extras)));
    good.sim.settlers[0].job = 'wizard';
    expect(() => migrate(good)).toThrow(/job/);
    const good2 = JSON.parse(JSON.stringify(serializeSim(createNewGame(3), extras)));
    good2.sim.buildings[0].inventory.wood = -5;
    expect(() => migrate(good2)).toThrow(SaveError);
  });
});

describe('save manager', () => {
  it('saves, lists and loads slots', async () => {
    const mgr = new SaveManager(new MemoryStore());
    const sim = playedSim();
    await mgr.save('a', sim, extras);
    await mgr.save('b', createNewGame(1), { name: 'Other', createdAt: 0 });
    const list = await mgr.list();
    expect(list.map((m) => m.slot).sort()).toEqual(['a', 'b']);
    const res = await mgr.load('a');
    expect(res.usedBackup).toBe(false);
    expect(res.sim.tick).toBe(sim.tick);
    expect(res.save.meta.name).toBe('Test Valley');
  });

  it('falls back to the backup when the latest save is damaged', async () => {
    const store = new MemoryStore();
    const mgr = new SaveManager(store);
    const sim = playedSim();
    await mgr.save('slot', sim, extras);
    const firstTick = sim.tick;
    run(sim, 100);
    await mgr.save('slot', sim, extras);
    // Simulate a write that was cut off.
    const data = store.data.get('slot')!;
    store.data.set('slot', { ...data, current: data.current!.slice(0, 200) });
    const res = await mgr.load('slot');
    expect(res.usedBackup).toBe(true);
    expect(res.sim.tick).toBe(firstTick);
    expect(res.problem).toMatch(/not readable/);
  });

  it('reports an empty slot', async () => {
    const mgr = new SaveManager(new MemoryStore());
    await expect(mgr.load('nope')).rejects.toThrow(/empty/);
  });
});
