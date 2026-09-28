import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { RALLY_COOLDOWN, RALLY_TICKS, ROYAL_AURA } from '../src/game/data/kingdomBalance';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { adults } from '../src/game/sim/households';
import { playerKingdom } from '../src/game/sim/kingdoms';
import { createNewGame } from '../src/game/sim/newGame';
import { workSpeed } from '../src/game/sim/settlers';
import type { Simulation } from '../src/game/sim/Simulation';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import { legacyCampWorld, nearestResource, run, runUntil } from './helpers';

const reload = (sim: Simulation) => deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Ruler', createdAt: 1 })))));
const newWorld = (seed = 3131) => createNewGame(seed, CURRENT_GEN, 'valley', { rulerName: 'Lloyd' });
const rulerOf = (sim: Simulation) => sim.settlers.find((s) => s.ruler)!;

describe('the ruler (the player on the map)', () => {
  it('starts beside the Town Hall with the name the player chose, on top of five settlers', () => {
    const sim = newWorld();
    const me = rulerOf(sim);
    expect(me.name).toBe('Lloyd');
    expect(sim.settlers).toHaveLength(6);
    expect(adults(sim)).toHaveLength(5);
    expect(playerKingdom(sim).ruler?.name).toBe('Lloyd');
    expect(me.homeId).toBe(campOf(sim)!.id);
    expect(sim.settlers.filter((s) => s.ruler)).toHaveLength(1);
  });

  it('walks where ordered but never takes chores, and still eats and sleeps', () => {
    const sim = newWorld();
    const me = rulerOf(sim);
    const tree = nearestResource(sim, 'wood')!;
    const res = applyCommand(sim, { type: 'gather', ids: [me.id], x: tree.x, y: tree.y });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/ruler/i);
    expect(applyCommand(sim, { type: 'move', ids: [me.id], x: 4, y: 6 }).ok).toBe(true);
    runUntil(sim, () => Math.hypot(me.x - 4, me.y - 6) < 1.5, 600);
    const kinds = new Set<string>();
    for (let i = 0; i < DAY_TICKS * 2; i++) {
      sim.step();
      if (me.task) kinds.add(me.task.kind);
    }
    for (const k of ['gather', 'build', 'haul', 'farm', 'craft']) expect(kinds.has(k)).toBe(false);
    expect(kinds.has('eat') || kinds.has('sleep')).toBe(true);
    expect(me.idleReason).toBe('');
  });

  it('royal presence: people near the ruler work faster', () => {
    const sim = newWorld();
    const me = rulerOf(sim);
    const [near, far] = sim.settlers.filter((s) => !s.ruler);
    for (const s of [near, far]) {
      s.hunger = 100;
      s.energy = 100;
    }
    near.x = me.x + 2;
    near.y = me.y;
    far.x = me.x + 30;
    far.y = me.y;
    expect(workSpeed(sim, near)).toBeCloseTo(workSpeed(sim, far) * ROYAL_AURA, 5);
  });

  it('Rally inspires everyone close by for a while, then needs a day to recharge', () => {
    const sim = newWorld();
    const me = rulerOf(sim);
    const helper = sim.settlers.find((s) => !s.ruler)!;
    helper.x = me.x + 20;
    helper.y = me.y;
    helper.hunger = 100;
    helper.energy = 100;
    const before = workSpeed(sim, helper);
    const res = applyCommand(sim, { type: 'rally' });
    expect(res.ok, res.message).toBe(true);
    const near = sim.settlers.filter((s) => !s.ruler && Math.hypot(s.x - me.x, s.y - me.y) <= 12);
    expect(near.length).toBeGreaterThan(0);
    for (const s of near) expect(s.boostUntil).toBe(sim.tick + RALLY_TICKS);
    expect(helper.boostUntil ?? 0).toBeLessThanOrEqual(sim.tick);
    expect(workSpeed(sim, helper)).toBe(before);
    expect(applyCommand(sim, { type: 'rally' }).message).toMatch(/again/i);
    const loaded = reload(sim);
    expect(applyCommand(loaded, { type: 'rally' }).ok).toBe(false);
    run(loaded, RALLY_COOLDOWN);
    expect(applyCommand(loaded, { type: 'rally' }).ok).toBe(true);
  });

  it('cannot enlist, sit on the council or be paired into a household', () => {
    const sim = newWorld();
    sim.progression.reached.push('hamlet', 'village', 'town', 'region');
    const me = rulerOf(sim);
    const other = sim.settlers.find((s) => !s.ruler)!;
    expect(applyCommand(sim, { type: 'formHousehold', ids: [me.id, other.id] }).ok).toBe(false);
    expect(applyCommand(sim, { type: 'appointCouncil', post: 'envoy', settlerId: me.id }).ok).toBe(false);
  });

  it('survives a save and reload', () => {
    const sim = newWorld();
    const loaded = reload(sim);
    const me = rulerOf(loaded);
    expect(me.name).toBe('Lloyd');
    expect(loaded.settlers.filter((s) => s.ruler)).toHaveLength(1);
  });

  it('an older world without a ruler can take the throne once', () => {
    const sim = legacyCampWorld(3232);
    expect(sim.settlers.some((s) => s.ruler)).toBe(false);
    expect(applyCommand(sim, { type: 'takeThrone', name: '' }).ok).toBe(false);
    const res = applyCommand(sim, { type: 'takeThrone', name: 'Lloyd' });
    expect(res.ok, res.message).toBe(true);
    expect(rulerOf(sim).name).toBe('Lloyd');
    expect(applyCommand(sim, { type: 'takeThrone', name: 'Other' }).ok).toBe(false);
  });
});
