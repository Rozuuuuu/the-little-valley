import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/game/data/buildings';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { bedsOf, campOf, maxWorkers } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { levelOf, levelName, speedOf } from '../src/game/sim/levels';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { clearSpot, instant, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Levels', createdAt: 1 })))));

function world() {
  const sim = createNewGame(4242);
  sim.progression.reached.push('hamlet', 'village', 'town');
  const hall = campOf(sim)!;
  hall.inventory = { food: 200, wood: 150, stone: 150, planks: 80, tools: 20 };
  return { sim, hall };
}

describe('building levels (Warcraft-style upgrades)', () => {
  it('a storehouse upgrade is paid up front, keeps working meanwhile, and finishes on a timer with more room', () => {
    const { sim } = world();
    const st = instant(sim, 'storehouse', { x: 8, y: 6 });
    const next = BUILDINGS.storehouse.levels![1];
    const wood = sim.storedTotal('wood');
    expect(levelOf(st)).toBe(1);
    expect(sim.storageCapacity(st)).toBe(300);
    const res = applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id });
    expect(res.ok, res.message).toBe(true);
    expect(sim.storedTotal('wood')).toBe(wood - (next.cost.wood ?? 0));
    // Still a working store during the upgrade.
    expect(sim.storages()).toContain(st);
    expect(sim.storageCapacity(st)).toBe(300);
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id }).ok).toBe(false);
    run(sim, next.time - 1);
    expect(levelOf(st)).toBe(1);
    run(sim, 2);
    expect(levelOf(st)).toBe(2);
    expect(levelName(st)).toBe(next.name);
    expect(sim.storageCapacity(st)).toBe(next.storage);
    expect(st.upgrade).toBeUndefined();
  });

  it('refuses without the goods (saying what is short), unbuilt, at the top level, or before its milestone', () => {
    const { sim, hall } = world();
    const st = instant(sim, 'storehouse', { x: 8, y: 6 });
    hall.inventory = { food: 200 };
    const poor = applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id });
    expect(poor.ok).toBe(false);
    expect(poor.message).toMatch(/wood|stone|planks/);
    hall.inventory = { food: 200, wood: 300, stone: 300, planks: 200, tools: 50 };
    // The top storehouse level needs Village.
    sim.progression.reached = ['camp', 'hamlet'];
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id }).ok).toBe(true);
    run(sim, BUILDINGS.storehouse.levels![1].time + 1);
    const locked = applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id });
    expect(locked.ok).toBe(false);
    expect(locked.message).toMatch(/Village/);
    sim.progression.reached.push('village');
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id }).ok).toBe(true);
    run(sim, BUILDINGS.storehouse.levels![2].time + 1);
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id }).message).toMatch(/highest|top/i);
    const p = clearSpot(sim, 3, 2, { x: 14, y: 10 });
    expect(applyCommand(sim, { type: 'place', building: 'storehouse', x: p.x, y: p.y }).ok).toBe(true);
    const site = sim.buildingAt(p.x, p.y)!;
    expect(applyCommand(sim, { type: 'upgradeBuilding', buildingId: site.id }).message).toMatch(/finish/i);
  });

  it('cancelling returns every good paid; a reload mid-upgrade keeps its progress', () => {
    const { sim } = world();
    const st = instant(sim, 'storehouse', { x: 8, y: 6 });
    applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id });
    const paid = { ...st.upgrade!.paid };
    expect(paid).toEqual(BUILDINGS.storehouse.levels![1].cost);
    run(sim, 50);
    const loaded = reload(sim);
    const st2 = loaded.buildings.get(st.id)!;
    expect(st2.upgrade!.progress).toBe(st.upgrade!.progress);
    run(loaded, 10);
    const before = { wood: loaded.storedTotal('wood'), stone: loaded.storedTotal('stone'), planks: loaded.storedTotal('planks') };
    expect(applyCommand(loaded, { type: 'cancelUpgrade', buildingId: st2.id }).ok).toBe(true);
    expect(st2.upgrade).toBeUndefined();
    expect(levelOf(st2)).toBe(1);
    for (const r of ['wood', 'stone', 'planks'] as const) expect(loaded.storedTotal(r)).toBe(before[r] + (paid[r] ?? 0));
  });

  it('a cancel with every store full leaves the refund in a crate — nothing is lost or doubled', () => {
    const { sim } = world();
    const st = instant(sim, 'storehouse', { x: 8, y: 6 });
    applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id });
    const paid = st.upgrade!.paid;
    for (const b of sim.storages()) b.inventory.stone = (b.inventory.stone ?? 0) + Math.max(0, sim.storageCapacity(b) - sim.storageUsed(b));
    const before = sim.storedTotal('wood');
    expect(applyCommand(sim, { type: 'cancelUpgrade', buildingId: st.id }).ok).toBe(true);
    const crate = [...sim.buildings.values()].find((b) => b.type === 'crate');
    expect(crate).toBeDefined();
    expect(crate!.inventory.wood).toBe(paid.wood);
    expect(sim.storedTotal('wood')).toBe(before + (paid.wood ?? 0));
  });

  it('homes gain beds, workshops gain a worker and work faster', () => {
    const { sim } = world();
    const house = instant(sim, 'house', { x: 5, y: -5 });
    expect(bedsOf(house)).toBe(2);
    applyCommand(sim, { type: 'upgradeBuilding', buildingId: house.id });
    runUntil(sim, () => levelOf(house) === 2, 5000);
    expect(bedsOf(house)).toBe(3);
    const ws = instant(sim, 'workshop', { x: -8, y: -6 });
    expect(maxWorkers(ws)).toBe(1);
    expect(speedOf(ws)).toBe(1);
    applyCommand(sim, { type: 'upgradeBuilding', buildingId: ws.id });
    runUntil(sim, () => levelOf(ws) === 2, 5000);
    expect(maxWorkers(ws)).toBe(2);
    expect(speedOf(ws)).toBeGreaterThan(1);
  });

  it('describes levels for the command card', async () => {
    const { buildingInfo } = await import('../src/engine/snapshot');
    const { sim } = world();
    const st = instant(sim, 'storehouse', { x: 8, y: 6 });
    let info = buildingInfo(sim, [st])!;
    expect(info.level!.name).toBe(BUILDINGS.storehouse.levels![0].name);
    expect(info.level!.next!.name).toBe(BUILDINGS.storehouse.levels![1].name);
    expect(info.level!.next!.perks.join(' ')).toMatch(/450/);
    applyCommand(sim, { type: 'upgradeBuilding', buildingId: st.id });
    run(sim, 30);
    info = buildingInfo(sim, [st])!;
    expect(info.level!.upgrading!.progress).toBeGreaterThan(0);
  });
});
