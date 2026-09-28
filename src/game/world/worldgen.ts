import { CHUNK } from '../core/constants';
import { fbm, hash01 } from '../core/rng';
import { Chunk } from './Chunk';
import { O, OBJECTS, T, type ObjectId, type TerrainId } from './tiles';
import { HABITATS, type HabitatDef, type HabitatId } from '../data/habitats';

/**
 * Deterministic world generation. Every function here is pure in (seed, x, y), so
 * any chunk can be regenerated on demand and only player changes need saving.
 *
 * The spawn at (0,0) is shaped by hand: a guaranteed clearing, a pond, a fertile
 * meadow patch and a ring of trees, rocks and berries within easy reach.
 */

const SPAWN_CLEAR = 6.5;
const SPAWN_SAFE = 11;
const POND = { x: 9, y: 6, r: 2.7 };
const MEADOW = { x: -7, y: 5, r: 5.5 };

function elevation(seed: number, x: number, y: number): number {
  return fbm(x / 72, y / 72, seed, 4);
}
function moisture(seed: number, x: number, y: number): number {
  return fbm(x / 46 + 300, y / 46 - 200, seed ^ 0x9e37, 3);
}

/**
 * Generator versions. Saves record the version their world was created with,
 * and unexplored chunks of old worlds keep using that version forever.
 * 1: Milestone 1 generator.
 * 2: adds the great river east of the spawn and its fertile, stony far bank.
 * 3: adds hills and mountains: a northern ridge with regular passes, lone
 *    massifs far from the camp, and two small starter outcrops whose hill faces
 *    hold the guaranteed copper and iron (see geology.ts). Everything from 2 stays.
 * 4: habitats. The player picks a habitat (meadow valley, highlands, deep forest,
 *    grassland plains, lakes and marsh); each has its own land and a mountain range
 *    close enough to see from the start. Starter outcrops and their ore stay put.
 */
export const CURRENT_GEN = 4;
export const SUPPORTED_GENS = [1, 2, 3, 4];

/** Small rocky outcrops near the camp (generator 3+): a mountain core ringed by hill slopes. */
export const STARTER_OUTCROPS = [
  { x: -20, y: -24, mineral: 'copper' },
  { x: -36, y: 16, mineral: 'iron' },
] as const;
const OUTCROP_CORE = 2.2;
const OUTCROP_SLOPE = 4.8;
/** A pass through the ridge every this many tiles, so the north is never sealed off. */
const PASS_EVERY = 48;
const PASS_WIDTH = 7;

function ridgeY(seed: number, x: number): number {
  return -56 + 9 * Math.sin(x / 41 + (Math.abs(seed) % 314) / 50) + (fbm(x / 53, 7.3, seed ^ 0x41d6, 2) - 0.5) * 14;
}
function ridgeCore(seed: number, x: number): number {
  return 3 + fbm(x / 19, 2.1, seed ^ 0x2c1, 2) * 4;
}
function inPass(seed: number, x: number): boolean {
  const phase = Math.abs(seed) % PASS_EVERY;
  return (((x - phase) % PASS_EVERY) + PASS_EVERY) % PASS_EVERY < PASS_WIDTH;
}

/** Within the northern ridge's band of cliffs and foothills (generator 3+). */
export function onRidge(seed: number, x: number, y: number): boolean {
  return Math.abs(y - ridgeY(seed, x)) < ridgeCore(seed, x) + 5;
}

function outcropDistance(x: number, y: number): number {
  let d = Infinity;
  for (const o of STARTER_OUTCROPS) d = Math.min(d, Math.hypot(x - o.x, y - o.y));
  return d;
}

/** Mountain, hill or nothing for generator 3's high ground. */
function highGround(seed: number, x: number, y: number): TerrainId | null {
  const od = outcropDistance(x, y);
  if (od < OUTCROP_CORE) return T.Mountain;
  if (od < OUTCROP_SLOPE) return T.Hill;
  const dy = Math.abs(y - ridgeY(seed, x));
  const core = ridgeCore(seed, x);
  if (dy < core) return inPass(seed, x) ? T.Hill : T.Mountain;
  if (dy < core + 5) return T.Hill;
  const d = Math.hypot(x, y);
  const e = elevation(seed, x, y);
  if (d > 40 && e > 0.74) return T.Mountain;
  if (d > 34 && e > 0.66) return T.Hill;
  return null;
}

/** High ground is never flooded by the small rivers and lakes (the great river still cuts through). */
function dryHighGround(seed: number, x: number, y: number): boolean {
  return outcropDistance(x, y) < OUTCROP_SLOPE + 1.5 || onRidge(seed, x, y);
}

/** Centre line of the great river (generator 2+), meandering north to south. */
export function riverCenter(seed: number, y: number): number {
  return 28 + 5 * Math.sin(y / 21 + (Math.abs(seed) % 628) / 100) + (fbm(y / 37, 0.5, seed ^ 0xb1e5, 2) - 0.5) * 12;
}
function riverHalfWidth(seed: number, y: number): number {
  return 3 + fbm(y / 13, 1.5, seed ^ 0x77aa, 2) * 1.6;
}

/** 0 = land, 1 = shallow water, 2 = deep water. */
export function waterAt(seed: number, x: number, y: number, gen = 1, habitat: HabitatId = 'valley'): 0 | 1 | 2 {
  if (gen >= 4) return waterAt4(seed, x, y, HABITATS[habitat]);
  if (gen >= 2) {
    const d = Math.abs(x - riverCenter(seed, y));
    const hw = riverHalfWidth(seed, y);
    // No fords: the deep channel can only be crossed by a stone bridge.
    if (d < hw) return d < hw - 1.6 ? 2 : 1;
  }
  if (gen >= 3 && dryHighGround(seed, x, y)) return 0;
  return waterAtV1(seed, x, y);
}

function waterAtV1(seed: number, x: number, y: number): 0 | 1 | 2 {
  const pond = Math.hypot(x - POND.x, y - POND.y) - (hash01(x, y, seed ^ 0x77) * 0.6);
  if (pond < POND.r) return 1;
  const d = Math.hypot(x, y);
  if (d < SPAWN_SAFE) return 0;
  const fade = Math.min(1, (d - SPAWN_SAFE) / 12);
  const river = Math.abs(fbm(x / 120, y / 120, seed ^ 0x51f1, 3) - 0.5);
  const width = (0.004 + 0.006 * fbm(x / 40, y / 40, seed ^ 0x3a, 2)) * fade;
  // Fords break every river loop so the spawn is never sealed in by water.
  const ford = fbm(x / 26, y / 26, seed ^ 0x0f0d, 2) > 0.6;
  if (river < width && !ford) return river < width * 0.3 && d > 40 ? 2 : 1;
  const e = elevation(seed, x, y);
  const lake = 0.33 - (1 - fade) * 0.3;
  if (e < lake) return e < lake - 0.045 ? 2 : 1;
  return 0;
}

/** True east of the great river, where the riverlands lie (generator 2+). */
export function onFarBank(seed: number, x: number, y: number, gen: number, habitat: HabitatId = 'valley'): boolean {
  if (gen < 2 || (gen >= 4 && !HABITATS[habitat].river)) return false;
  const edge = riverCenter(seed, y) + riverHalfWidth(seed, y);
  return x > edge + 1 && x < edge + 34;
}

export function terrainAt(
  seed: number, x: number, y: number, gen = 1,
  water: (x: number, y: number) => number = (wx, wy) => waterAt(seed, wx, wy, gen, habitat),
  habitat: HabitatId = 'valley',
): TerrainId {
  const w = water(x, y);
  if (w === 2) return T.DeepWater;
  if (w === 1) return T.Water;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && water(x + dx, y + dy) !== 0) return T.Sand;
    }
  }
  if (gen >= 4) return terrainAt4(seed, x, y, HABITATS[habitat]);
  if (gen >= 3) {
    const hg = highGround(seed, x, y);
    if (hg !== null) return hg;
  }
  const d = Math.hypot(x, y);
  if (Math.hypot(x - MEADOW.x, y - MEADOW.y) < MEADOW.r + hash01(x, y, seed ^ 0x19) * 1.2) return T.Meadow;
  const e = elevation(seed, x, y);
  const m = moisture(seed, x, y);
  if (onFarBank(seed, x, y, gen)) {
    // The riverlands: open fertile meadow with rocky knolls.
    if (e > 0.62) return T.Rocky;
    return m > 0.6 ? T.Forest : T.Meadow;
  }
  if (e > 0.6 && d > 14) return T.Rocky;
  if (m > 0.555 && d > 9) return T.Forest;
  if (m > 0.47 && m <= 0.555) return T.Meadow;
  return T.Grass;
}

export function objectAt(seed: number, x: number, y: number, terrain: TerrainId, gen = 1, habitat: HabitatId = 'valley'): ObjectId {
  const d = Math.hypot(x, y);
  if (d < SPAWN_CLEAR) return O.None;
  if (terrain === T.Water || terrain === T.DeepWater || terrain === T.Road || terrain === T.Bridge || terrain === T.Mountain) return O.None;
  if (gen >= 4) return objectAt4(seed, x, y, terrain, HABITATS[habitat]);
  const r = hash01(x, y, seed ^ 0xabc1);
  const kind = hash01(x, y, seed ^ 0x5eed);
  const ring = d < 16 ? hash01(x, y, seed ^ 0x2222) : 1;
  if (onFarBank(seed, x, y, gen) && terrain === T.Meadow) {
    if (r < 0.018) return O.Boulder;
    if (r < 0.04) return O.Berry;
    if (r < 0.055) return O.Oak;
    return O.None;
  }

  // A friendly ring of resources around the camp, so the first minutes are about choices rather than searching.
  if (d < 16 && terrain !== T.Sand) {
    if (ring < 0.09) return kind < 0.7 ? O.Oak : O.Pine;
    if (ring < 0.115) return O.Rock;
    if (ring < 0.14) return O.Berry;
  }
  switch (terrain) {
    case T.Forest:
      if (r < 0.34) return elevation(seed, x, y) > 0.55 || kind < 0.35 ? O.Pine : O.Oak;
      if (r < 0.37) return O.Berry;
      return O.None;
    case T.Grass:
      if (r < 0.045) return kind < 0.75 ? O.Oak : O.Pine;
      if (r < 0.058) return O.Berry;
      if (r < 0.066) return O.Rock;
      return O.None;
    case T.Meadow:
      if (d < 14) return O.None;
      if (r < 0.02) return O.Oak;
      if (r < 0.045) return O.Berry;
      return O.None;
    case T.Rocky:
      if (r < 0.08) return O.Rock;
      if (r < 0.125) return O.Boulder;
      if (r < 0.16) return O.Pine;
      return O.None;
    case T.Sand:
      if (r < 0.012) return O.Rock;
      return O.None;
    case T.Hill:
      // Starter outcrop slopes stay clear so their mine faces are easy to reach.
      if (outcropDistance(x, y) < OUTCROP_SLOPE + 1) return O.None;
      if (r < 0.05) return O.Pine;
      if (r < 0.085) return O.Rock;
      if (r < 0.1) return O.Boulder;
      return O.None;
  }
  return O.None;
}

export function generateChunk(seed: number, cx: number, cy: number, gen = 1, habitat: HabitatId = 'valley'): Chunk {
  const c = new Chunk(cx, cy);
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  // Water for the chunk plus a one-tile border, computed once (shores need neighbours).
  const G = CHUNK + 2;
  const water = new Uint8Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) water[gy * G + gx] = waterAt(seed, ox + gx - 1, oy + gy - 1, gen, habitat);
  const waterFn = (wx: number, wy: number) => water[(wy - oy + 1) * G + (wx - ox + 1)];
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const i = ly * CHUNK + lx;
      const x = ox + lx;
      const y = oy + ly;
      const t = terrainAt(seed, x, y, gen, waterFn, habitat);
      const o = objectAt(seed, x, y, t, gen, habitat);
      c.terrain[i] = t;
      c.obj[i] = o;
      c.amt[i] = OBJECTS[o].amount;
    }
  }
  return c;
}

// ---- generator 4: habitats -------------------------------------------------------

/** Centre line of the near mountain range, north of the spawn. */
function rangeY4(seed: number, x: number, h: HabitatDef): number {
  return -h.rangeDistance + 6 * Math.sin(x / 29 + (Math.abs(seed) % 314) / 50) + (fbm(x / 23, 3.1, seed ^ 0x6a11, 3) - 0.5) * 12;
}
function rangeCore4(seed: number, x: number, h: HabitatDef): number {
  return h.rangeCore + fbm(x / 11, 5.3, seed ^ 0x2c1, 3) * 5;
}
/** Passes through the near range every PASS_EVERY tiles, one always close above the spawn. */
function inPass4(seed: number, x: number): boolean {
  const phase = Math.abs(seed) % 13;
  return (((x + 3 - phase) % PASS_EVERY) + PASS_EVERY) % PASS_EVERY < PASS_WIDTH;
}
function nearRange4(seed: number, x: number, y: number, h: HabitatDef): boolean {
  return Math.abs(y - rangeY4(seed, x, h)) < rangeCore4(seed, x, h) + 10;
}

/** A small craggy peak in plain sight of the hall in every generator-4 world. */
export const SENTINEL_PEAK = { x: 14, y: -6 } as const;
const SENTINEL_CORE = 2.3;
const SENTINEL_SLOPE = 4.4;

function highGround4(seed: number, x: number, y: number, h: HabitatDef): TerrainId | null {
  const sd = Math.hypot(x - SENTINEL_PEAK.x, y - SENTINEL_PEAK.y) - hash01(x, y, seed ^ 0x5e71) * 0.5;
  if (sd < SENTINEL_CORE) return T.Mountain;
  if (sd < SENTINEL_SLOPE) return T.Hill;
  const od = outcropDistance(x, y);
  if (od < OUTCROP_CORE) return T.Mountain;
  if (od < OUTCROP_SLOPE) return T.Hill;
  const dy = Math.abs(y - rangeY4(seed, x, h));
  const core = rangeCore4(seed, x, h);
  // The range softens into walkable foothills around the starter outcrops, so their ore is always in reach.
  if (od < OUTCROP_SLOPE + 8) return dy < core + 4 ? T.Hill : null;
  if (dy < core) return inPass4(seed, x) ? T.Hill : T.Mountain;
  // Spurs and foothills: craggy lumps off both flanks, never inside a pass.
  if (dy < core + 9 && !inPass4(seed, x)) {
    const crag = fbm(x / 7, y / 7, seed ^ 0x7c3a, 2) - (dy - core) * 0.035;
    if (crag > 0.6) return T.Mountain;
    if (crag > 0.46) return T.Hill;
  }
  if (dy < core + 4) return T.Hill;
  const d = Math.hypot(x, y);
  const e = elevation(seed, x, y);
  if (d > h.peakMinDistance && e > h.peakAbove) return T.Mountain;
  if (d > h.peakMinDistance - 6 && e > h.hillAbove) return T.Hill;
  return null;
}

function waterAt4(seed: number, x: number, y: number, h: HabitatDef): 0 | 1 | 2 {
  if (h.river) {
    const d = Math.abs(x - riverCenter(seed, y));
    const hw = riverHalfWidth(seed, y);
    if (d < hw) return d < hw - 1.6 ? 2 : 1;
  }
  if (outcropDistance(x, y) < OUTCROP_SLOPE + 1.5 || nearRange4(seed, x, y, h) || Math.hypot(x - SENTINEL_PEAK.x, y - SENTINEL_PEAK.y) < SENTINEL_SLOPE + 1.5) return 0;
  const pond = Math.hypot(x - POND.x, y - POND.y) - hash01(x, y, seed ^ 0x77) * 0.6;
  if (pond < POND.r) return 1;
  const d = Math.hypot(x, y);
  if (d < SPAWN_SAFE) return 0;
  const fade = Math.min(1, (d - SPAWN_SAFE) / 12);
  const river = Math.abs(fbm(x / 120, y / 120, seed ^ 0x51f1, 3) - 0.5);
  const width = (0.004 + 0.006 * fbm(x / 40, y / 40, seed ^ 0x3a, 2)) * fade;
  const ford = fbm(x / 26, y / 26, seed ^ 0x0f0d, 2) > 0.6;
  if (river < width && !ford) return river < width * 0.3 && d > 40 ? 2 : 1;
  const e = elevation(seed, x, y);
  const lake = h.lakeBelow - (1 - fade) * 0.3;
  if (e < lake) return e < lake - 0.045 ? 2 : 1;
  // Marshland: scattered shallow ponds between the lakes.
  if (h.ponds > 0 && d > 14 && fbm(x / 9, y / 9, seed ^ 0x9d0d, 2) > h.ponds) return 1;
  return 0;
}

function terrainAt4(seed: number, x: number, y: number, h: HabitatDef): TerrainId {
  const hg = highGround4(seed, x, y, h);
  if (hg !== null) return hg;
  const d = Math.hypot(x, y);
  if (Math.hypot(x - MEADOW.x, y - MEADOW.y) < MEADOW.r + hash01(x, y, seed ^ 0x19) * 1.2) return T.Meadow;
  const e = elevation(seed, x, y);
  const m = moisture(seed, x, y);
  if (h.river && onFarBank(seed, x, y, 4, h.id)) {
    if (e > 0.62) return T.Rocky;
    return m > 0.6 ? T.Forest : T.Meadow;
  }
  if (e > h.rockyAbove && d > 14) return T.Rocky;
  if (m > h.forestAbove && d > 9) return T.Forest;
  if (m > 0.47 && m <= h.meadowBelow) return T.Meadow;
  return T.Grass;
}

function objectAt4(seed: number, x: number, y: number, terrain: TerrainId, h: HabitatDef): ObjectId {
  const d = Math.hypot(x, y);
  const r = hash01(x, y, seed ^ 0xabc1);
  const kind = hash01(x, y, seed ^ 0x5eed);
  const ring = d < 16 ? hash01(x, y, seed ^ 0x2222) : 1;
  if (h.river && onFarBank(seed, x, y, 4, h.id) && terrain === T.Meadow) {
    if (r < 0.018) return O.Boulder;
    if (r < 0.04) return O.Berry;
    if (r < 0.055) return O.Oak;
    return O.None;
  }
  // The same friendly ring of wood, stone and berries around the hall in every habitat.
  if (d < 16 && terrain !== T.Sand) {
    if (ring < 0.09) return kind < 0.7 ? O.Oak : O.Pine;
    if (ring < 0.115) return O.Rock;
    if (ring < 0.14) return O.Berry;
  }
  switch (terrain) {
    case T.Forest:
      if (r < 0.34) return elevation(seed, x, y) > 0.55 || kind < 0.35 ? O.Pine : O.Oak;
      if (r < 0.37) return O.Berry;
      return O.None;
    case T.Grass:
      if (r < h.grassTrees) return kind < 0.75 ? O.Oak : O.Pine;
      if (r < h.grassTrees + 0.013) return O.Berry;
      if (r < h.grassTrees + 0.021) return O.Rock;
      return O.None;
    case T.Meadow:
      if (d < 14) return O.None;
      if (r < h.grassTrees * 0.45) return O.Oak;
      if (r < h.grassTrees * 0.45 + 0.025) return O.Berry;
      return O.None;
    case T.Rocky:
      if (r < 0.08) return O.Rock;
      if (r < 0.125) return O.Boulder;
      if (r < 0.16) return O.Pine;
      return O.None;
    case T.Sand:
      if (r < 0.012) return O.Rock;
      return O.None;
    case T.Hill:
      if (outcropDistance(x, y) < OUTCROP_SLOPE + 1) return O.None;
      if (r < 0.06) return O.Pine;
      if (r < 0.095) return O.Rock;
      if (r < 0.11) return O.Boulder;
      return O.None;
  }
  return O.None;
}
