import { CHUNK, TILE } from '../game/core/constants';
import { BUILDINGS } from '../game/data/buildings';
import type { Simulation } from '../game/sim/Simulation';
import type { Chunk } from '../game/world/Chunk';
import { O, T } from '../game/world/tiles';
import { chunkKey } from '../game/world/World';
import type { Camera } from './Camera';
import { AREA_COLORS } from './Renderer';
import { P } from './palette';
import { gpuImage, hexToRgb, makeCanvas } from './pixel';

export interface MinimapLayers {
  settlers: boolean;
  areas: boolean;
  buildings: boolean;
}

const TERRAIN_COLOR: Record<number, string> = {
  [T.DeepWater]: P.deep0, [T.Water]: P.water1, [T.Sand]: P.sand1, [T.Grass]: P.grass1, [T.Meadow]: P.meadow2,
  [T.Forest]: P.forest1, [T.Rocky]: P.rock1, [T.Road]: P.dirt2, [T.Bridge]: P.wood3, [T.StoneBridge]: P.stone3,
  [T.Hill]: P.hill1, [T.Mountain]: P.cliff2,
};

function rgbaWord(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (255 << 24) | (b << 16) | (g << 8) | r;
}
const TERRAIN_WORD: Record<number, number> = Object.fromEntries(Object.entries(TERRAIN_COLOR).map(([k, v]) => [k, rgbaWord(v)]));
const TREE_WORD = rgbaWord(P.leaf0);
const ROCK_WORD = rgbaWord(P.stone1);

/**
 * A small overview map, redrawn a few times a second by the controller (never
 * by React). Explored ground is cached per chunk at one pixel per tile.
 */
export class Minimap {
  readonly ctx: CanvasRenderingContext2D;
  /** Pixels per tile on the minimap. */
  scale = 2;
  layers: MinimapLayers = { settlers: true, areas: true, buildings: true };
  private cache = new Map<number, { canvas: HTMLCanvasElement; key: string }>();
  private cx = 0;
  private cy = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  private chunkImage(c: Chunk): HTMLCanvasElement {
    const key = `${c.version}:${c.terrainVersion}:${c.fogVersion}`;
    const k = chunkKey(c.cx, c.cy);
    const hit = this.cache.get(k);
    if (hit && hit.key === key) return hit.canvas;
    // A fresh canvas per change, so each one goes to the GPU only once (see gpuImage).
    const canvas = makeCanvas(CHUNK, CHUNK);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(CHUNK, CHUNK);
    const out = new Uint32Array(img.data.buffer);
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      if (!c.explored[i]) continue;
      const o = c.obj[i];
      out[i] = o === O.Oak || o === O.Pine ? TREE_WORD : o === O.Rock || o === O.Boulder ? ROCK_WORD : TERRAIN_WORD[c.terrain[i]] ?? TERRAIN_WORD[T.Grass];
    }
    ctx.putImageData(img, 0, 0);
    this.cache.set(k, { canvas, key });
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value!);
    return canvas;
  }

  /** Tile under a point on the minimap (CSS pixels relative to the canvas). */
  tileAt(mx: number, my: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const px = (mx / r.width) * this.canvas.width;
    const py = (my / r.height) * this.canvas.height;
    return {
      x: Math.floor(this.cx + (px - this.canvas.width / 2) / this.scale),
      y: Math.floor(this.cy + (py - this.canvas.height / 2) / this.scale),
    };
  }

  draw(sim: Simulation, camera: Camera, time: number, highlight: { x: number; y: number; w: number; h: number } | null): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this.scale;
    this.cx = camera.x / TILE;
    this.cy = camera.y / TILE;
    const toX = (tx: number) => Math.round(W / 2 + (tx - this.cx) * s);
    const toY = (ty: number) => Math.round(H / 2 + (ty - this.cy) * s);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#141c18';
    ctx.fillRect(0, 0, W, H);
    const halfW = W / 2 / s;
    const halfH = H / 2 / s;
    const c0x = Math.floor((this.cx - halfW) / CHUNK);
    const c1x = Math.floor((this.cx + halfW) / CHUNK);
    const c0y = Math.floor((this.cy - halfH) / CHUNK);
    const c1y = Math.floor((this.cy + halfH) / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const c = sim.world.peekChunk(cx, cy);
        if (!c || c.exploredCount === 0) continue;
        ctx.drawImage(gpuImage(this.chunkImage(c)), toX(cx * CHUNK), toY(cy * CHUNK), CHUNK * s, CHUNK * s);
      }
    }
    if (this.layers.areas) {
      for (const a of sim.workAreas) {
        ctx.strokeStyle = AREA_COLORS[a.kind];
        ctx.lineWidth = 1;
        ctx.strokeRect(toX(a.x0) + 0.5, toY(a.y0) + 0.5, (a.x1 - a.x0 + 1) * s - 1, (a.y1 - a.y0 + 1) * s - 1);
      }
    }
    if (this.layers.buildings) {
      for (const b of sim.buildings.values()) {
        const def = BUILDINGS[b.type];
        let color: string;
        if (b.field) color = P.soil2;
        else if (b.type === 'stoneBridge') color = b.built ? P.stone3 : (Math.floor(time * 2) % 2 ? P.uiWarn : P.stone2);
        else if (!b.built) color = Math.floor(time * 2) % 2 ? P.uiWarn : P.wood3;
        else if (def.housing) color = b.type === 'camp' || b.type === 'townHall' ? P.fire2 : P.roof3;
        else if (def.storage) color = P.slate3;
        else if (def.recipes) color = P.fire1;
        else color = P.wall1;
        ctx.fillStyle = color;
        ctx.fillRect(toX(b.x), toY(b.y), Math.max(2, b.w * s), Math.max(2, b.h * s));
      }
    }
    if (this.layers.settlers) {
      // Group settlers per 2x2 tiles so busy villages stay readable.
      const seen = new Set<string>();
      for (const st of sim.settlers) {
        if (st.hidden) continue;
        const gx = Math.floor(st.x / 2);
        const gy = Math.floor(st.y / 2);
        const k = `${gx},${gy}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const idle = (!st.task || st.task.kind === 'wander') && !!st.idleReason;
        ctx.fillStyle = '#1b1422';
        ctx.fillRect(toX(st.x) - 1, toY(st.y) - 1, 3, 3);
        ctx.fillStyle = idle ? P.uiWarn : '#fff8e8';
        ctx.fillRect(toX(st.x), toY(st.y), 1, 1);
      }
    }
    if (highlight) {
      ctx.strokeStyle = P.select;
      ctx.lineWidth = 1;
      const pad = 2 + Math.round(Math.sin(time * 8) + 1);
      ctx.strokeRect(toX(highlight.x) - pad + 0.5, toY(highlight.y) - pad + 0.5, highlight.w * s + pad * 2, highlight.h * s + pad * 2);
    }
    // Camera viewport
    const tl = camera.screenToWorld(0, 0);
    const br = camera.screenToWorld(camera.width, camera.height);
    ctx.strokeStyle = 'rgba(255, 248, 232, 0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(toX(tl.x / TILE) + 0.5, toY(tl.y / TILE) + 0.5, ((br.x - tl.x) / TILE) * s, ((br.y - tl.y) / TILE) * s);
  }
}
