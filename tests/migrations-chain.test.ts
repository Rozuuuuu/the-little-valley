import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { SAVE_VERSION } from '../src/game/save/format';
import { MIGRATIONS, migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { assertNoNegativeReservations, assertReservationsConsistent, run } from './helpers';

describe('every old save reaches the current version', () => {
  it('has one migration per version, in order', () => {
    for (let v = 1; v < SAVE_VERSION; v++) expect(typeof MIGRATIONS[v]).toBe('function');
    expect(MIGRATIONS[SAVE_VERSION]).toBeUndefined();
  });

  for (const file of ['v2-save.json', 'v3-save.json', 'v4-save.json']) {
    it(`${file} migrates through every step, loads, plays a day and saves again`, () => {
      const raw = JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8'));
      const save = migrate(raw);
      expect(save.version).toBe(SAVE_VERSION);
      const sim = deserializeSim(save);
      // Old worlds keep their rules: legacy growth, their generator, no wars, nobody enlisted.
      expect(sim.growthMode).toBe('legacy');
      expect(sim.world.genVersion).toBeLessThan(3);
      expect(sim.wars.size).toBe(0);
      expect(sim.settlers.every((s) => s.military === null && s.lifeStage === 'adult' && s.kingdomId === 0)).toBe(true);
      expect(sim.kingdoms.filter((k) => k.player)).toHaveLength(1);
      const people = sim.settlers.length;
      run(sim, DAY_TICKS);
      expect(sim.settlers.length).toBeGreaterThanOrEqual(people);
      assertReservationsConsistent(sim);
      assertNoNegativeReservations(sim);
      const again = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Chain', createdAt: 0 })))));
      expect(again.settlers.length).toBe(sim.settlers.length);
    });
  }

  it('the genuine v11 fixture (every system in use) loads and plays on', () => {
    const save = migrate(JSON.parse(readFileSync('tests/fixtures/v11-save.json', 'utf8')));
    const sim = deserializeSim(save);
    expect(sim.kingdoms.find((k) => k.player)!.crowned).toBe(true);
    expect(sim.routes.length).toBe(1);
    run(sim, DAY_TICKS / 2);
    assertReservationsConsistent(sim);
  });

  it('refuses a save from a newer game, and damaged saves, without touching them', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(/newer/);
    const good = JSON.parse(readFileSync('tests/fixtures/v4-save.json', 'utf8'));
    const bad = { ...good, sim: { ...good.sim, settlers: [{ ...good.sim.settlers[0], hunger: 'lots' }] } };
    expect(() => migrate(bad)).toThrow(/damaged/);
    expect(good.sim.settlers[0].hunger).not.toBe('lots');
  });
});
