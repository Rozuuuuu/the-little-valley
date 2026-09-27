import { describe, expect, it } from 'vitest';
import { Rng, fbm, hash2 } from '../src/game/core/rng';
import { keyX, keyY, tileKey } from '../src/game/core/constants';
import { generateChunk } from '../src/game/world/worldgen';
import { World } from '../src/game/world/World';
import { O, OBJECTS, T, TERRAIN } from '../src/game/world/tiles';
import { findPath, type PathGrid } from '../src/game/sim/pathfinding';

describe('rng and noise', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('can resume from a saved state', () => {
    const a = new Rng(7);
    a.next();
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });

  it('hashes and noise are stable', () => {
    expect(hash2(3, -9, 1)).toBe(hash2(3, -9, 1));
    expect(hash2(3, -9, 1)).not.toBe(hash2(3, -9, 2));
    const v = fbm(12.3, -4.5, 99);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('tile keys round-trip negative coordinates', () => {
    for (const [x, y] of [[0, 0], [-1, -1], [-5000, 123], [77, -99999]]) {
      const k = tileKey(x, y);
      expect([keyX(k), keyY(k)]).toEqual([x, y]);
    }
  });
});

describe('world generation', () => {
  it('reproduces the same chunk from the same seed', () => {
    const a = generateChunk(1234, 2, -3);
    const b = generateChunk(1234, 2, -3);
    expect(Array.from(a.terrain)).toEqual(Array.from(b.terrain));
    expect(Array.from(a.obj)).toEqual(Array.from(b.obj));
  });

  it('differs between seeds', () => {
    const a = generateChunk(1, 3, 3);
    const b = generateChunk(2, 3, 3);
    expect(Array.from(a.terrain)).not.toEqual(Array.from(b.terrain));
  });

  it.each([1, 42, 777, 12345, 999999])('gives seed %i a friendly spawn', (seed) => {
    const w = new World(seed);
    let trees = 0;
    let rocks = 0;
    let berries = 0;
    for (let y = -16; y <= 16; y++) {
      for (let x = -16; x <= 16; x++) {
        const d = Math.hypot(x, y);
        const o = w.obj(x, y);
        if (d < 6) {
          expect(OBJECTS[o].blocks).toBe(false);
          expect(TERRAIN[w.terrain(x, y)].walkable).toBe(true);
        }
        if (d > 16) continue;
        if (o === O.Oak || o === O.Pine) trees++;
        if (o === O.Rock || o === O.Boulder) rocks++;
        if (o === O.Berry) berries++;
      }
    }
    expect(trees).toBeGreaterThanOrEqual(15);
    expect(rocks).toBeGreaterThanOrEqual(4);
    expect(berries).toBeGreaterThanOrEqual(3);
    // The meadow patch west of camp is fertile.
    expect(w.terrain(-7, 5)).toBe(T.Meadow);
  });

  it('tracks exploration and changes', () => {
    const w = new World(5);
    expect(w.explored(0, 0)).toBe(false);
    const n = w.reveal(0.5, 0.5, 3);
    expect(n).toBeGreaterThan(20);
    expect(w.explored(0, 0)).toBe(true);
    expect(w.reveal(0.5, 0.5, 3)).toBe(0);
    const c = w.chunkAt(0, 0);
    expect(c.modified).toBe(false);
    w.setObj(1, 1, O.Rock);
    expect(c.modified).toBe(true);
    expect(w.amount(1, 1)).toBe(OBJECTS[O.Rock].amount);
  });
});

describe('pathfinding', () => {
  function grid(blocked: Set<string>): PathGrid {
    return { walkable: (x, y) => !blocked.has(`${x},${y}`) && Math.abs(x) < 50 && Math.abs(y) < 50, cost: () => 1 };
  }

  it('walks around a wall', () => {
    const wall = new Set<string>();
    for (let y = -5; y <= 5; y++) wall.add(`3,${y}`);
    const p = findPath(grid(wall), 0, 0, { x: 6, y: 0, w: 1, h: 1, adjacent: false });
    expect(p).not.toBeNull();
    expect(p!.at(-1)).toEqual({ x: 6, y: 0 });
    for (const step of p!) expect(wall.has(`${step.x},${step.y}`)).toBe(false);
  });

  it('does not cut corners between blocked tiles', () => {
    const blocked = new Set(['1,0', '0,1']);
    const p = findPath(grid(blocked), 0, 0, { x: 1, y: 1, w: 1, h: 1, adjacent: false });
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThan(1);
  });

  it('stops within its budget when the goal is sealed off', () => {
    const ring = new Set<string>();
    for (let i = -2; i <= 2; i++) {
      ring.add(`${i},-2`);
      ring.add(`${i},2`);
      ring.add(`-2,${i}`);
      ring.add(`2,${i}`);
    }
    const p = findPath(grid(ring), 10, 10, { x: 0, y: 0, w: 1, h: 1, adjacent: false }, 500);
    expect(p).toBeNull();
  });

  it('can return a partial path towards an unreachable goal', () => {
    const ring = new Set<string>();
    for (let i = -2; i <= 2; i++) {
      ring.add(`${i},-2`);
      ring.add(`${i},2`);
      ring.add(`-2,${i}`);
      ring.add(`2,${i}`);
    }
    expect(findPath(grid(ring), 10, 0, { x: 0, y: 0, w: 1, h: 1, adjacent: false }, 2000)).toBeNull();
    const p = findPath(grid(ring), 10, 0, { x: 0, y: 0, w: 1, h: 1, adjacent: false }, 2000, true);
    expect(p).not.toBeNull();
    const end = p!.at(-1)!;
    expect(Math.hypot(end.x, end.y)).toBeLessThan(4);
  });

  it('reaches the side of a building footprint', () => {
    const house = new Set(['5,5', '6,5', '5,6', '6,6']);
    const p = findPath(grid(house), 0, 0, { x: 5, y: 5, w: 2, h: 2, adjacent: true });
    const end = p!.at(-1)!;
    expect(house.has(`${end.x},${end.y}`)).toBe(false);
    expect(Math.max(Math.abs(end.x - 5.5), Math.abs(end.y - 5.5))).toBeLessThanOrEqual(1.5);
  });
});
