import { CHUNK, TILE } from '../game/core/constants';
import { hash01, hash2, valueNoise } from '../game/core/rng';
import type { Chunk } from '../game/world/Chunk';
import { T, TERRAIN, type TerrainId } from '../game/world/tiles';
import type { World } from '../game/world/World';
import { terrainAt } from '../game/world/worldgen';
import { P } from './palette';
import { hexToRgb, makeCanvas } from './pixel';

const S = CHUNK * TILE;
const M = 3;
const BW = S + M * 2;
const G = CHUNK + 2;

function rgba(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

const C = Object.fromEntries(
  Object.entries(P)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('#'))
    .map(([k, v]) => [k, rgba(v as string)]),
) as Record<string, number>;

/** How far (in pixels) a terrain may creep into a lower-priority neighbour. */
const REACH: Record<number, number> = {
  [T.DeepWater]: 0, [T.Water]: 0.9, [T.Sand]: 1, [T.Grass]: 1, [T.Meadow]: 0.85,
  [T.Forest]: 1, [T.Rocky]: 0.9, [T.Road]: 0.45, [T.Bridge]: 0,
};

const isWater = (t: number) => t === T.Water || t === T.DeepWater;
const PRIORITY = new Uint8Array(16);
const REACH_T = new Float32Array(16);
for (const [k, v] of Object.entries(TERRAIN)) {
  PRIORITY[Number(k)] = v.priority;
  REACH_T[Number(k)] = REACH[Number(k)];
}

/**
 * Paints one chunk's ground into a 512x512 canvas. Borders between terrains
 * are resolved per pixel with chunky dithered noise so edges look hand-placed
 * rather than tiled, and water gets foam and a shaded bank.
 */
export function paintChunk(world: World, chunk: Chunk): HTMLCanvasElement {
  return pixelsToCanvas(computePixels(world.seed, chunk.cx, chunk.cy, terrainGrid(world, chunk)));
}

export function pixelsToCanvas(pixels: Uint32Array): HTMLCanvasElement {
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  new Uint32Array(img.data.buffer).set(pixels);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * The chunk's terrain plus a one-tile border. Neighbours that were never
 * generated are read straight from the generator, so painting never forces
 * extra chunks into memory.
 */
export function terrainGrid(world: World, chunk: Chunk): Uint8Array {
  const ox = chunk.cx * CHUNK;
  const oy = chunk.cy * CHUNK;
  const terr = new Uint8Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const x = ox + gx - 1;
      const y = oy + gy - 1;
      const inside = gx > 0 && gy > 0 && gx <= CHUNK && gy <= CHUNK;
      if (inside) terr[gy * G + gx] = chunk.terrain[(gy - 1) * CHUNK + gx - 1];
      else {
        const n = world.peekChunk(x >> 5, y >> 5);
        terr[gy * G + gx] = n ? n.terrain[(y & 31) * CHUNK + (x & 31)] : terrainAt(world.seed, x, y);
      }
    }
  }
  return terr;
}

/** Pure pixel computation (ABGR words), safe to run in a worker. */
export function computePixels(seed: number, cx: number, cy: number, terr: Uint8Array): Uint32Array {
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const tAt = (tx: number, ty: number) => terr[(ty + 1) * G + tx + 1] as TerrainId;

  // Pass 1: which terrain each pixel shows. Hot loop: no allocations, table lookups only.
  const cls = new Uint8Array(BW * BW);
  const baseX = ox * TILE;
  const baseY = oy * TILE;
  for (let py = -M; py < S + M; py++) {
    const ty = Math.floor(py / TILE);
    const ly = py - ty * TILE;
    const ey = ly < 8 ? -1 : 1;
    const dy = ly < 8 ? ly : 15 - ly;
    const rowT = (ty + 1) * G + 1;
    const rowN = (ty + ey + 1) * G + 1;
    const wy = baseY + py;
    for (let px = -M; px < S + M; px++) {
      const tx = Math.floor(px / TILE);
      const lx = px - tx * TILE;
      const t = terr[rowT + tx];
      let best = t;
      if (t !== T.Bridge) {
        const ex = lx < 8 ? -1 : 1;
        const dx = lx < 8 ? lx : 15 - lx;
        const wx = baseX + px;
        const n = hash01(wx >> 1, wy >> 1, seed ^ 0x1234) * 0.6 + hash01(wx >> 3, wy >> 3, seed ^ 0x77) * 0.4;
        const spread = 1.2 + n * 4.2;
        let bestP = PRIORITY[t];
        let nt = terr[rowT + tx + ex];
        if (PRIORITY[nt] > bestP && nt !== T.Bridge && dx < spread * REACH_T[nt]) {
          best = nt;
          bestP = PRIORITY[nt];
        }
        nt = terr[rowN + tx];
        if (PRIORITY[nt] > bestP && nt !== T.Bridge && dy < spread * REACH_T[nt]) {
          best = nt;
          bestP = PRIORITY[nt];
        }
        nt = terr[rowN + tx + ex];
        if (PRIORITY[nt] > bestP && nt !== T.Bridge && Math.hypot(dx + 0.5, dy + 0.5) * 1.1 < spread * REACH_T[nt]) best = nt;
      }
      cls[(py + M) * BW + px + M] = best;
    }
  }
  const clsAt = (px: number, py: number) => cls[(py + M) * BW + px + M];

  // Slowly varying colour patches, sampled every 4px (they vary over ~28px).
  const PS = S / 4 + 1;
  const patches = new Float32Array(PS * PS);
  for (let j = 0; j < PS; j++) for (let i = 0; i < PS; i++) patches[j * PS + i] = valueNoise((baseX + i * 4) / 28, (baseY + j * 4) / 28, seed ^ 0x55);

  // Pass 2: colour.
  const out = new Uint32Array(S * S);
  for (let py = 0; py < S; py++) {
    const wy = oy * TILE + py;
    for (let px = 0; px < S; px++) {
      const wx = ox * TILE + px;
      const c = clsAt(px, py);
      const h = hash01(wx, wy, seed ^ 0x99);
      const patch = patches[(py >> 2) * PS + (px >> 2)];
      let col: number;
      switch (c) {
        case T.Water:
        case T.DeepWater: {
          const deep = c === T.DeepWater;
          let shore = 9;
          for (let r = 1; r <= 3 && shore === 9; r++) {
            if (!isWater(clsAt(px - r, py)) || !isWater(clsAt(px + r, py)) || !isWater(clsAt(px, py - r)) || !isWater(clsAt(px, py + r))) shore = r;
          }
          // Land directly above casts a 2px shadow onto the water; other edges get foam.
          const shadow = !isWater(clsAt(px, py - 1)) || (!isWater(clsAt(px, py - 2)) && (wx & 1) === 0);
          if (shadow) col = deep ? C.deep0 : C.water0;
          else if (shore === 1) col = C.foam;
          else if (shore === 2) col = (wx + wy) % 2 === 0 ? C.water3 : C.water2;
          else if (shore === 3) col = C.water2;
          else if (deep) col = patch > 0.6 ? C.deep1 : C.deep0;
          else col = patch > 0.62 ? C.water2 : patch < 0.3 ? C.water0 : C.water1;
          break;
        }
        case T.Sand:
          col = h < 0.05 ? C.sand2 : h > 0.95 ? C.sand0 : patch > 0.6 ? C.sand2 : C.sand1;
          break;
        case T.Grass:
          col = h < 0.035 ? C.grass3 : h > 0.975 ? C.grass0 : patch > 0.56 ? C.grass2 : C.grass1;
          break;
        case T.Meadow:
          col = h < 0.05 ? C.meadow3 : h > 0.975 ? C.meadow0 : patch > 0.5 ? C.meadow2 : C.meadow1;
          break;
        case T.Forest:
          col = h < 0.015 ? C.forestLeaf : h < 0.06 ? C.forest0 : patch > 0.5 ? C.forest1 : C.forest2;
          break;
        case T.Rocky:
          col = h < 0.04 ? C.rock2 : h > 0.95 ? C.rock3 : patch > 0.55 ? C.rock2 : C.rock1;
          break;
        case T.Road: {
          const edge = clsAt(px - 1, py) !== T.Road || clsAt(px + 1, py) !== T.Road || clsAt(px, py - 1) !== T.Road || clsAt(px, py + 1) !== T.Road;
          col = edge ? C.dirt0 : h < 0.06 ? C.dirt2 : h > 0.96 ? C.dirt3 : C.dirt1;
          break;
        }
        case T.Bridge: {
          const tx = Math.floor(px / TILE);
          const ty = Math.floor(py / TILE);
          const lx = px - tx * TILE;
          const ly = py - ty * TILE;
          const horiz = !isWater(tAt(tx - 1, ty)) || !isWater(tAt(tx + 1, ty));
          const along = horiz ? lx : ly;
          const across = horiz ? ly : lx;
          if (across <= 1 || across >= 14) col = across === 0 || across === 15 ? C.wood0 : C.wood1;
          else if (along % 4 === 3) col = C.wood1;
          else col = (Math.floor(along / 4) + (horiz ? tx : ty)) % 2 ? C.wood3 : C.wood2;
          if (across === 2) col = C.wood1;
          break;
        }
        default:
          col = C.grass1;
      }
      // Land lip above water: a darker edge so banks read as raised.
      if (!isWater(c) && c !== T.Bridge && isWater(clsAt(px, py + 1))) col = c === T.Sand ? C.sand3 : C.grass0;
      out[py * S + px] = col;
    }
  }

  // Pass 3: small details, placed per tile.
  const put = (px: number, py: number, color: number, only: number) => {
    if (px < 0 || py < 0 || px >= S || py >= S) return;
    if (clsAt(px, py) !== only) return;
    out[py * S + px] = color;
  };
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const t = terr[(ty + 1) * G + tx + 1];
      const wtx = ox + tx;
      const wty = oy + ty;
      const hv = hash2(wtx, wty, seed ^ 0xdeca);
      const r = (n: number) => ((hv >>> (n * 4)) & 15) / 16;
      const bx = tx * TILE;
      const by = ty * TILE;
      if (t === T.Grass || t === T.Meadow || t === T.Forest) {
        const tufts = r(0) < 0.45 ? 1 : r(0) < 0.7 ? 2 : 0;
        const light = t === T.Forest ? C.forest2 : t === T.Meadow ? C.meadow3 : C.grass3;
        const dark = t === T.Forest ? C.forest0 : t === T.Meadow ? C.meadow0 : C.grass0;
        for (let i = 0; i < tufts; i++) {
          const x = bx + 2 + Math.floor(r(1 + i * 2) * 12);
          const y = by + 2 + Math.floor(r(2 + i * 2) * 11);
          put(x, y, light, t);
          put(x - 1, y + 1, light, t);
          put(x + 1, y + 1, light, t);
          put(x, y + 1, dark, t);
          put(x - 1, y + 2, dark, t);
          put(x + 1, y + 2, dark, t);
        }
      }
      if ((t === T.Meadow && r(5) < 0.55) || (t === T.Grass && r(5) < 0.07)) {
        const petals = [C.flowerY, C.flowerW, C.flowerP, C.flowerV, C.flowerR];
        const n = t === T.Meadow && r(6) > 0.6 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const x = bx + 3 + Math.floor(r(6 + i) * 10);
          const y = by + 3 + Math.floor(r(4 - i) * 9);
          const pc = petals[Math.floor(r(7 - i) * petals.length)];
          put(x - 1, y, pc, t);
          put(x + 1, y, pc, t);
          put(x, y - 1, pc, t);
          put(x, y + 1, C.leaf1, t);
          put(x, y, pc === C.flowerY ? C.fire1 : C.flowerY, t);
        }
      }
      if (t === T.Rocky && r(3) < 0.6) {
        const x = bx + 2 + Math.floor(r(4) * 11);
        const y = by + 2 + Math.floor(r(5) * 11);
        put(x, y, C.rock2, t);
        put(x + 1, y, C.rock2, t);
        put(x, y + 1, C.rock3, t);
        put(x + 1, y + 1, C.rock3, t);
      }
      if (t === T.Forest && r(7) < 0.05) {
        const x = bx + 4 + Math.floor(r(3) * 8);
        const y = by + 4 + Math.floor(r(1) * 8);
        put(x, y, C.berry, t);
        put(x + 1, y, C.berry, t);
        put(x, y + 1, C.flowerW, t);
      }
      if (t === T.Sand && r(2) < 0.12) {
        const x = bx + 3 + Math.floor(r(3) * 10);
        const y = by + 3 + Math.floor(r(4) * 10);
        put(x, y, C.flowerW, t);
        put(x + 1, y, C.sand0, t);
      }
    }
  }
  return out;
}
