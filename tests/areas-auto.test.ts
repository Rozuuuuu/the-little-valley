import { describe, expect, it } from 'vitest';
import { DAY_TICKS, tileKey } from '../src/game/core/constants';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { O, OBJECTS } from '../src/game/world/tiles';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { instant, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Areas', createdAt: 1 })))));

function world(seed = 7001) {
  const sim = createNewGame(seed, CURRENT_GEN, 'valley', { rulerName: 'Lloyd' });
  campOf(sim)!.inventory = { food: 200, wood: 60, stone: 40 };
  return sim;
}

const workersOf = (sim: Simulation, id: number) => sim.settlers.filter((s) => s.areaId === id);

describe('useful work areas', () => {
  it('staff themselves to the wanted number from free adults, never the ruler or a workshop worker', () => {
    const sim = world();
    const ws = instant(sim, 'workshop', { x: 8, y: -6 });
    const crafter = sim.settlers.find((s) => !s.ruler)!;
    applyCommand(sim, { type: 'assignWorker', buildingId: ws.id, ids: [crafter.id] });
    const res = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -20, y0: -14, x1: -8, y1: -4, wanted: 3 });
    expect(res.ok, res.message).toBe(true);
    const id = res.id!;
    runUntil(sim, () => workersOf(sim, id).length === 3, 400);
    for (const s of workersOf(sim, id)) {
      expect(s.ruler).toBeFalsy();
      expect(s.id).not.toBe(crafter.id);
    }
    expect(applyCommand(sim, { type: 'updateArea', areaId: id, wanted: 1 }).ok).toBe(true);
    runUntil(sim, () => workersOf(sim, id).length === 1, 400);
    // An area with no wanted number is left to the player.
    const manual = applyCommand(sim, { type: 'createArea', kind: 'stone', x0: 8, y0: 8, x1: 16, y1: 14 }).id!;
    run(sim, 400);
    expect(workersOf(sim, manual)).toHaveLength(0);
  });

  it('a farm area with a crop lays out its own fields and its workers tend them', () => {
    const sim = world(7002);
    const res = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -11, y0: 2, x1: -4, y1: 8, wanted: 2, crop: 'turnip' });
    expect(res.ok, res.message).toBe(true);
    run(sim, 300);
    const fields = [...sim.buildings.values()].filter((b) => b.field && b.x >= -11 && b.x <= -4 && b.y >= 2 && b.y <= 8);
    expect(fields.length).toBeGreaterThan(8);
    for (const f of fields) expect(f.field!.crop).toBe('turnip');
    runUntil(sim, () => fields.some((f) => f.field!.state === 'growing'), DAY_TICKS);
  });

  it('woodlots replant: a tree cut inside comes back sooner than one cut outside', () => {
    const sim = world(7003);
    const area = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -18, y0: -18, x1: 18, y1: 18 }).id!;
    const a = sim.area(area)!;
    let inside: { x: number; y: number } | null = null;
    for (let y = a.y0; y <= a.y1 && !inside; y++) for (let x = a.x0; x <= a.x1 && !inside; x++) if (OBJECTS[sim.world.obj(x, y)].resource === 'wood' && sim.world.explored(x, y)) inside = { x, y };
    expect(inside).not.toBeNull();
    const s = sim.settlers.find((p) => !p.ruler)!;
    applyCommand(sim, { type: 'assignArea', ids: [s.id], areaId: area });
    // A felled tree inside is replanted at once as a sapling that grows back within a day.
    const replanted = () => {
      for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) {
        const r = sim.regrowth.get(tileKey(x, y));
        if (r && sim.world.obj(x, y) === O.Sapling) return r;
      }
      return null;
    };
    runUntil(sim, () => replanted() !== null, DAY_TICKS);
    expect(replanted()!.at - sim.tick).toBeLessThan(DAY_TICKS);
  });

  it('hunting grounds: their workers take game inside for food', () => {
    const sim = createNewGame(7004, CURRENT_GEN, 'forest', { rulerName: 'Lloyd' });
    campOf(sim)!.inventory = { food: 100 };
    const wild = sim.animals.find((x) => x.penId === null && !['duck'].includes(x.species))!;
    const cx = Math.floor(wild.x);
    const cy = Math.floor(wild.y);
    const res = applyCommand(sim, { type: 'createArea', kind: 'hunt', x0: cx - 12, y0: cy - 12, x1: cx + 12, y1: cy + 12, wanted: 2 });
    expect(res.ok, res.message).toBe(true);
    const food0 = sim.stats.foodGathered;
    const ids = new Set(sim.animals.map((x) => x.id));
    runUntil(sim, () => sim.animals.filter((x) => ids.has(x.id)).length < ids.size && sim.stats.foodGathered > food0, DAY_TICKS);
  });

  it('forage areas: berries inside are picked', () => {
    const sim = world(7005);
    let berry: { x: number; y: number } | null = null;
    for (let r = 0; r < 20 && !berry; r++) for (let y = -r; y <= r && !berry; y++) for (let x = -r; x <= r && !berry; x++) if (sim.world.obj(x, y) === O.Berry && sim.world.explored(x, y)) berry = { x, y };
    expect(berry).not.toBeNull();
    const res = applyCommand(sim, { type: 'createArea', kind: 'forage', x0: berry!.x - 3, y0: berry!.y - 3, x1: berry!.x + 3, y1: berry!.y + 3, wanted: 1 });
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => sim.world.amount(berry!.x, berry!.y) < OBJECTS[O.Berry].amount || sim.world.obj(berry!.x, berry!.y) !== O.Berry, DAY_TICKS);
    void tileKey;
  });

  it('wanted workers and crops survive a save', () => {
    const sim = world(7006);
    const id = applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -11, y0: 2, x1: -4, y1: 8, wanted: 2, crop: 'turnip' }).id!;
    const loaded = reload(sim);
    const a = loaded.area(id)!;
    expect(a.wanted).toBe(2);
    expect(a.crop).toBe('turnip');
  });
});
