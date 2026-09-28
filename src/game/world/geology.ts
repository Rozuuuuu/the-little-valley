import { hash01 } from '../core/rng';
import { MINERALS, MINERAL_IDS, type MineralId } from '../data/minerals';
import { O, T } from './tiles';
import { objectAt, STARTER_OUTCROPS, terrainAt } from './worldgen';
import type { HabitatId } from '../data/habitats';

/**
 * Where ore lies. Geology is a sparse layer beside the terrain, versioned on its
 * own: changing it never changes anyone's land. The world is divided into
 * 16×16-tile cells; each cell holds at most one deposit, at a qualifying site:
 *   - rocky ground (any generator),
 *   - a rock or boulder the generator placed (any generator), or
 *   - a hill tile at the foot of a mountain face (generator 3+).
 * Deposits are pure functions of (seed, generator, cell): only cells a settler
 * has surveyed or mined are saved. Every function here reads the generator
 * directly and never creates map chunks.
 */
export const GEOLOGY_VERSION = 1;
export const CELL = 16;
/** Chance that a cell with a qualifying site holds a deposit. */
const DEPOSIT_CHANCE = 0.5;

export interface Deposit {
  /** Stable id derived from the cell. */
  id: number;
  mineral: MineralId;
  x: number;
  y: number;
  initial: number;
}

export function cellOf(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) };
}

export function cellId(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

export function cellFromId(id: number): { cx: number; cy: number } {
  return { cx: Math.floor(id / 65536) - 32768, cy: (id % 65536) - 32768 };
}

/** A tile where ore can be worked, read straight from the generator. */
export function qualifyingSite(seed: number, gen: number, x: number, y: number, habitat: HabitatId = 'valley'): boolean {
  const t = terrainAt(seed, x, y, gen, undefined, habitat);
  if (t === T.Rocky) return true;
  if (gen >= 3 && t === T.Hill) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) if (terrainAt(seed, x + dx, y + dy, gen, undefined, habitat) === T.Mountain) return true;
  }
  if (t === T.Water || t === T.DeepWater || t === T.Mountain) return false;
  const o = objectAt(seed, x, y, t, gen, habitat);
  return o === O.Rock || o === O.Boulder;
}

const siteCache = new Map<string, { x: number; y: number } | null>();

/** The cell's deposit site: the first qualifying tile in a seeded scan order, or null. */
export function cellSite(seed: number, gen: number, cx: number, cy: number, habitat: HabitatId = 'valley'): { x: number; y: number } | null {
  const k = `${seed}:${gen}:${habitat}:${cx}:${cy}`;
  const hit = siteCache.get(k);
  if (hit !== undefined) return hit;
  const start = Math.floor(hash01(cx, cy, seed ^ 0x51e7) * 256);
  let site: { x: number; y: number } | null = null;
  for (let i = 0; i < 256 && !site; i++) {
    // 97 is coprime with 256, so this visits every tile once in a scattered order.
    const j = (start + i * 97) % 256;
    const x = cx * CELL + (j % CELL);
    const y = cy * CELL + Math.floor(j / CELL);
    if (qualifyingSite(seed, gen, x, y, habitat)) site = { x, y };
  }
  if (siteCache.size > 20000) siteCache.clear();
  siteCache.set(k, site);
  return site;
}

function pickMineral(seed: number, cx: number, cy: number): MineralId {
  const total = MINERAL_IDS.reduce((n, m) => n + MINERALS[m].weight, 0);
  let r = hash01(cx, cy, seed ^ 0x31ce) * total;
  for (const m of MINERAL_IDS) {
    r -= MINERALS[m].weight;
    if (r < 0) return m;
  }
  return 'coal';
}

function amountFor(seed: number, cx: number, cy: number, m: MineralId): number {
  return Math.max(1, Math.round(MINERALS[m].amount * (0.75 + 0.5 * hash01(cx, cy, seed ^ 0x2a7))));
}

const starterCache = new Map<string, { copper: Deposit | null; iron: Deposit | null }>();

/**
 * Guaranteed copper and iron near the camp, so tools never depend on luck.
 * New worlds (generator 3+) put them on the starter outcrops' hill faces, just
 * below each mountain core. Older worlds use the two nearest cells that have
 * any qualifying site (the rocks around the camp always qualify).
 */
export function starterDeposits(seed: number, gen: number, habitat: HabitatId = 'valley'): { copper: Deposit | null; iron: Deposit | null } {
  const k = `${seed}:${gen}:${habitat}`;
  const hit = starterCache.get(k);
  if (hit) return hit;
  const out: { copper: Deposit | null; iron: Deposit | null } = { copper: null, iron: null };
  const make = (m: 'copper' | 'iron', x: number, y: number): Deposit => {
    const { cx, cy } = cellOf(x, y);
    return { id: cellId(cx, cy), mineral: m, x, y, initial: MINERALS[m].amount };
  };
  if (gen >= 3) {
    for (const o of STARTER_OUTCROPS) out[o.mineral] = make(o.mineral, o.x, o.y + 3);
  } else {
    const cells: { cx: number; cy: number; d: number }[] = [];
    for (let cy = -5; cy <= 4; cy++) for (let cx = -5; cx <= 4; cx++) cells.push({ cx, cy, d: Math.hypot(cx * CELL + CELL / 2, cy * CELL + CELL / 2) });
    cells.sort((a, b) => a.d - b.d);
    for (const c of cells) {
      if (out.copper && out.iron) break;
      const site = cellSite(seed, gen, c.cx, c.cy, habitat);
      if (!site) continue;
      if (!out.copper) out.copper = make('copper', site.x, site.y);
      else out.iron = make('iron', site.x, site.y);
    }
  }
  starterCache.set(k, out);
  return out;
}

/** The deposit in a cell as the world was generated (before any mining), or null. */
export function depositInCell(seed: number, gen: number, cx: number, cy: number, habitat: HabitatId = 'valley'): Deposit | null {
  const id = cellId(cx, cy);
  const st = starterDeposits(seed, gen, habitat);
  if (st.copper?.id === id) return st.copper;
  if (st.iron?.id === id) return st.iron;
  const site = cellSite(seed, gen, cx, cy, habitat);
  if (!site || hash01(cx, cy, seed ^ 0x6e0) >= DEPOSIT_CHANCE) return null;
  const mineral = pickMineral(seed, cx, cy);
  return { id, mineral, x: site.x, y: site.y, initial: amountFor(seed, cx, cy, mineral) };
}
