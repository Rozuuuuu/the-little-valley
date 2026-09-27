import { CHUNK, CHUNK_MASK, CHUNK_SHIFT } from '../core/constants';
import { Chunk } from './Chunk';
import { generateChunk } from './worldgen';
import { OBJECTS, TERRAIN, type ObjectId, type TerrainId } from './tiles';

export function chunkKey(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

/**
 * Infinite tile world made of lazily generated chunks. Chunks are created the
 * first time anything reads them; unmodified chunks can always be rebuilt from
 * the seed, which keeps saves small.
 */
export class World {
  readonly chunks = new Map<number, Chunk>();

  /** Generator version this world was created with (see worldgen.ts). */
  constructor(
    readonly seed: number,
    readonly genVersion = 1,
  ) {}

  chunk(cx: number, cy: number): Chunk {
    const k = chunkKey(cx, cy);
    let c = this.chunks.get(k);
    if (!c) {
      c = generateChunk(this.seed, cx, cy, this.genVersion);
      this.chunks.set(k, c);
    }
    return c;
  }

  peekChunk(cx: number, cy: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy));
  }

  chunkAt(x: number, y: number): Chunk {
    return this.chunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
  }

  private idx(x: number, y: number): number {
    return (y & CHUNK_MASK) * CHUNK + (x & CHUNK_MASK);
  }

  terrain(x: number, y: number): TerrainId {
    return this.chunkAt(x, y).terrain[this.idx(x, y)] as TerrainId;
  }

  obj(x: number, y: number): ObjectId {
    return this.chunkAt(x, y).obj[this.idx(x, y)] as ObjectId;
  }

  amount(x: number, y: number): number {
    return this.chunkAt(x, y).amt[this.idx(x, y)];
  }

  explored(x: number, y: number): boolean {
    const c = this.peekChunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
    return !!c && c.explored[this.idx(x, y)] === 1;
  }

  /** Terrain and object both allow walking. Buildings are checked by the simulation. */
  naturallyWalkable(x: number, y: number): boolean {
    const c = this.chunkAt(x, y);
    const i = this.idx(x, y);
    return TERRAIN[c.terrain[i] as TerrainId].walkable && !OBJECTS[c.obj[i] as ObjectId].blocks;
  }

  setTerrain(x: number, y: number, t: TerrainId): void {
    const c = this.chunkAt(x, y);
    c.terrain[this.idx(x, y)] = t;
    c.modified = true;
    c.version++;
    // Ground images blend across one tile, so neighbours near the edge repaint too.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = this.peekChunk((x + dx) >> CHUNK_SHIFT, (y + dy) >> CHUNK_SHIFT);
        if (n) n.terrainVersion++;
      }
    }
  }

  setObj(x: number, y: number, o: ObjectId, amount = OBJECTS[o].amount): void {
    const c = this.chunkAt(x, y);
    const i = this.idx(x, y);
    c.obj[i] = o;
    c.amt[i] = amount;
    c.modified = true;
    c.version++;
  }

  setAmount(x: number, y: number, amount: number): void {
    const c = this.chunkAt(x, y);
    c.amt[this.idx(x, y)] = amount;
    c.modified = true;
  }

  /** Reveals a disc of tiles. Returns how many were newly explored. */
  reveal(cx: number, cy: number, r: number): number {
    let count = 0;
    const r2 = r * r;
    const touched = new Set<Chunk>();
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        const c = this.chunkAt(x, y);
        const i = this.idx(x, y);
        if (c.explored[i] === 0) {
          c.explored[i] = 1;
          c.exploredCount++;
          touched.add(c);
          count++;
        }
      }
    }
    for (const c of touched) {
      c.fogVersion++;
      // Neighbours sample our edge when drawing soft fog, so let them refresh too.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = this.peekChunk(c.cx + dx, c.cy + dy);
          if (n && n !== c) n.fogVersion++;
        }
      }
    }
    return count;
  }

  exploredTileCount(): number {
    let n = 0;
    for (const c of this.chunks.values()) n += c.exploredCount;
    return n;
  }
}
