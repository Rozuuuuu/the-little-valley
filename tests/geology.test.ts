import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { MINERALS, MINERAL_IDS } from '../src/game/data/minerals';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import { findPath } from '../src/game/sim/pathfinding';
import { Simulation } from '../src/game/sim/Simulation';
import { cellOf, depositInCell, starterDeposits } from '../src/game/world/geology';
import { generateChunk, onRidge, STARTER_OUTCROPS, terrainAt } from '../src/game/world/worldgen';
import { T, TERRAIN } from '../src/game/world/tiles';
import { World } from '../src/game/world/World';
import { runUntil } from './helpers';

const fnv = (b: Uint8Array) => {
  let h = 2166136261;
  for (const x of b) h = Math.imul(h ^ x, 16777619);
  return h >>> 0;
};

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Geo', createdAt: 0 })))));
}

describe('generators', () => {
  it('generators 1, 2 and 3 still produce exactly their fingerprinted chunks', () => {
    for (const gen of [1, 2, 3]) {
      const file = `tests/fixtures/gen-v${gen}-fingerprint.json`;
      expect(existsSync(file)).toBe(true);
      const fp = JSON.parse(readFileSync(file, 'utf8')) as Record<string, [number, number]>;
      for (const [k, [t, o]] of Object.entries(fp)) {
        const [seed, cx, cy] = k.split(':').map(Number);
        const c = generateChunk(seed, cx, cy, gen);
        expect([fnv(c.terrain), fnv(c.obj)], `gen ${gen} chunk ${k}`).toEqual([t, o]);
      }
    }
  });

  it('generator 3 raises hills and impassable mountain faces, but only for new worlds', () => {
    const seed = 424242;
    let hills = 0;
    let mountains = 0;
    for (let y = -90; y <= -20; y++) {
      for (let x = -80; x <= 80; x += 2) {
        const t = terrainAt(seed, x, y, 3);
        if (t === T.Hill) hills++;
        if (t === T.Mountain) mountains++;
        expect([T.Hill, T.Mountain]).not.toContain(terrainAt(seed, x, y, 2));
      }
    }
    expect(hills).toBeGreaterThan(200);
    expect(mountains).toBeGreaterThan(200);
    expect(TERRAIN[T.Mountain].walkable).toBe(false);
    expect(TERRAIN[T.Mountain].buildable).toBe(false);
    expect(TERRAIN[T.Hill].walkable).toBe(true);
    expect(TERRAIN[T.Hill].moveCost).toBeGreaterThan(TERRAIN[T.Grass].moveCost);
  });

  it('keeps the spawn open and generates the same chunk regardless of order, including negative coordinates', () => {
    for (const seed of [1, 424242, -77]) {
      for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) expect(terrainAt(seed, x, y, 3)).not.toBe(T.Mountain);
      const a = new World(seed, 3);
      const b = new World(seed, 3);
      const order = [[-3, -2], [0, 0], [2, -3], [-1, 1]];
      for (const [cx, cy] of order) a.chunk(cx, cy);
      for (const [cx, cy] of [...order].reverse()) b.chunk(cx, cy);
      for (const [cx, cy] of order) {
        expect(fnv(a.chunk(cx, cy).terrain)).toBe(fnv(b.chunk(cx, cy).terrain));
        expect(fnv(a.chunk(cx, cy).obj)).toBe(fnv(b.chunk(cx, cy).obj));
      }
    }
  });

  it('the northern ridge can be crossed through a pass, and paths route around cliff faces', () => {
    const sim = createNewGame(424242, 3);
    expect(sim.world.genVersion).toBe(3);
    // Find a column where the ridge has a cliff, and walk from south of it to north of it.
    let col: number | null = null;
    for (let x = -60; x <= 0 && col === null; x++) {
      for (let y = -90; y <= -20; y++) if (onRidge(sim.seed, x, y) && sim.world.terrain(x, y) === T.Mountain) col = x;
    }
    expect(col).not.toBeNull();
    let south = -20;
    while (!sim.walkable(col!, south)) south++;
    let north = -110;
    while (!sim.walkable(col!, north)) north--;
    const path = findPath(sim, col!, south, { x: col!, y: north, w: 1, h: 1, adjacent: false }, 60000);
    expect(path).not.toBeNull();
    for (const p of path!) expect(sim.world.terrain(p.x, p.y)).not.toBe(T.Mountain);
  });
});

describe('geology', () => {
  it('deposits are stable per seed and cell, use the documented minerals, and exist at qualifying sites', () => {
    const counts: Record<string, number> = {};
    for (let cy = -8; cy <= 8; cy++) {
      for (let cx = -8; cx <= 8; cx++) {
        const d1 = depositInCell(424242, 3, cx, cy);
        const d2 = depositInCell(424242, 3, cx, cy);
        expect(d1).toEqual(d2);
        if (!d1) continue;
        expect(MINERAL_IDS).toContain(d1.mineral);
        expect(cellOf(d1.x, d1.y)).toEqual({ cx, cy });
        expect(d1.initial).toBeGreaterThan(0);
        counts[d1.mineral] = (counts[d1.mineral] ?? 0) + 1;
      }
    }
    // Common minerals are common, precious ones rarer.
    expect((counts.coal ?? 0) + (counts.copper ?? 0) + (counts.iron ?? 0)).toBeGreaterThan((counts.gold ?? 0) + (counts.diamond ?? 0));
    expect(MINERALS.diamond.weight).toBeLessThan(MINERALS.coal.weight);
  });

  it('every new and legacy world has starter copper and iron within reach of the camp', () => {
    for (const gen of [1, 2, 3]) {
      for (const seed of [1, 424242, 5150, -9]) {
        const st = starterDeposits(seed, gen);
        expect(st.copper, `gen ${gen} seed ${seed}`).not.toBeNull();
        expect(st.iron, `gen ${gen} seed ${seed}`).not.toBeNull();
        for (const d of [st.copper!, st.iron!]) {
          expect(Math.hypot(d.x, d.y)).toBeLessThan(70);
          expect(depositInCell(seed, gen, cellOf(d.x, d.y).cx, cellOf(d.x, d.y).cy)).toEqual(d);
        }
      }
    }
    // New worlds put them on the starter outcrops' hill faces.
    const st = starterDeposits(424242, 3);
    for (const d of [st.copper!, st.iron!]) {
      expect(terrainAt(424242, d.x, d.y, 3)).toBe(T.Hill);
      expect(STARTER_OUTCROPS.some((o) => Math.hypot(d.x - o.x, d.y - o.y) < 8)).toBe(true);
    }
  });

  it('asking about geology never generates map chunks', () => {
    const sim = createNewGame(8);
    const before = sim.world.chunks.size;
    for (let cy = -20; cy <= 20; cy += 5) for (let cx = -20; cx <= 20; cx += 5) depositInCell(sim.seed, 3, cx, cy);
    starterDeposits(sim.seed, 3);
    expect(sim.world.chunks.size).toBe(before);
  });

  it('a settler surveys a spot; the result is saved and a second survey never re-rolls it', () => {
    const sim = createNewGame(424242);
    const st = starterDeposits(sim.seed, 3).copper!;
    sim.world.reveal(st.x, st.y, 10);
    for (let i = 0; i <= 10; i++) sim.world.reveal((st.x * i) / 10, (st.y * i) / 10, 5);
    const s = sim.settlers[0];
    const res = applyCommand(sim, { type: 'surveyDeposit', settlerId: s.id, x: st.x, y: st.y });
    expect(res.ok, res.message).toBe(true);
    runUntil(sim, () => sim.surveyedCell(st.x, st.y) !== null, DAY_TICKS);
    const info = sim.surveyedCell(st.x, st.y)!;
    expect(info.deposit?.mineral).toBe('copper');
    expect(info.deposit?.remaining).toBe(st.initial);
    expect(sim.chronicle.some((c) => /copper/i.test(c.text))).toBe(true);
    // Again: refused with the known result.
    const again = applyCommand(sim, { type: 'surveyDeposit', settlerId: s.id, x: st.x, y: st.y });
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/already surveyed.*copper/i);
    // Children can't survey.
    const kid = sim.addSettler(0, 2, 'laborer');
    kid.lifeStage = 'child';
    expect(applyCommand(sim, { type: 'surveyDeposit', settlerId: kid.id, x: 5, y: 5 }).message).toMatch(/child/i);
    // Survives a reload.
    const loaded = reload(sim);
    expect(loaded.surveyedCell(st.x, st.y)).toEqual(info);
  });

  it('surveying an empty cell records that nothing is there', () => {
    const sim = createNewGame(424242);
    let empty: { x: number; y: number } | null = null;
    for (let cy = -2; cy <= 2 && !empty; cy++) for (let cx = -2; cx <= 2 && !empty; cx++) if (!depositInCell(sim.seed, 3, cx, cy)) empty = { x: cx * 16 + 8, y: cy * 16 + 8 };
    expect(empty).not.toBeNull();
    sim.world.reveal(empty!.x, empty!.y, 12);
    for (let i = 0; i <= 10; i++) sim.world.reveal((empty!.x * i) / 10, (empty!.y * i) / 10, 5);
    let spot = { ...empty! };
    while (!sim.walkable(spot.x, spot.y)) spot = { x: spot.x + 1, y: spot.y };
    expect(applyCommand(sim, { type: 'surveyDeposit', settlerId: sim.settlers[1].id, x: spot.x, y: spot.y }).ok).toBe(true);
    runUntil(sim, () => sim.surveyedCell(spot.x, spot.y) !== null, DAY_TICKS);
    expect(sim.surveyedCell(spot.x, spot.y)!.deposit).toBeNull();
  });
});
