import { CHUNK, DUSK, MORNING, NIGHT_START, TILE, tileKey, keyX, keyY } from '../game/core/constants';
import { hash01 } from '../game/core/rng';
import { BUILDINGS, type BuildingId } from '../game/data/buildings';
import { CROPS } from '../game/data/crops';
import { fieldStage, WATER_THRESHOLD } from '../game/sim/farming';
import { costOf, isPermanentHome, materialsComplete, workOf } from '../game/sim/buildings';
import { invEntries } from '../game/sim/inventory';
import type { AreaKind } from '../game/sim/types';
import type { Simulation } from '../game/sim/Simulation';
import type { Building, Settler } from '../game/sim/types';
import type { Chunk } from '../game/world/Chunk';
import { O, OBJECTS, T } from '../game/world/tiles';
import { chunkKey } from '../game/world/World';
import type { Camera } from './Camera';
import { P } from './palette';
import { Particles } from './particles';
import { makeCanvas, tinted, type Sprite } from './pixel';
import { FRAME } from './sprites/characters';
import type { SpriteBank } from './sprites';
import { paintChunk, pixelsToCanvas, terrainGrid } from './terrainPainter';

export interface PlacementPreview {
  type: BuildingId;
  /** Anchor for single buildings. */
  x: number;
  y: number;
  tiles: { x: number; y: number; ok: boolean }[];
  ok: boolean;
}

export interface Marker {
  x: number;
  y: number;
  kind: 'move' | 'work' | 'bad';
  t0: number;
}

export interface RenderState {
  sim: Simulation;
  alpha: number;
  time: number;
  selected: ReadonlySet<number>;
  selectedBuildings: ReadonlySet<number>;
  hoverSettler: number | null;
  hoverTile: { x: number; y: number } | null;
  placement: PlacementPreview | null;
  dragBox: { x0: number; y0: number; x1: number; y1: number } | null;
  areaBox: { x0: number; y0: number; x1: number; y1: number; kind: 'mark' | 'unmark' | 'area' } | null;
  markers: Marker[];
  showBuildHover: boolean;
  /** Harvest marks and other work overlays (off on the title screen). */
  showMarks: boolean;
  selectedArea: number | null;
  /** Work-area tools are open: show every area clearly. */
  areaMode: boolean;
  /** Something the player just jumped to (tile rect), pulsing briefly. */
  highlight: { x: number; y: number; w: number; h: number; t0: number } | null;
}

export const AREA_COLORS: Record<AreaKind, string> = { farm: '#e9c65a', wood: '#8ee07a', stone: '#d6dadc', build: '#8fc9e0' };
/** A letter per area kind so areas never rely on colour alone. */
export const AREA_SYMBOL: Record<AreaKind, string> = { farm: 'F', wood: 'W', stone: 'Q', build: 'B' };

interface Drawable {
  y: number;
  draw: () => void;
}

const FOG = '#17131f';
const CHUNK_PX = CHUNK * TILE;
const MAX_CHUNK_CACHE = 48;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly particles = new Particles();
  private ground = new Map<number, { canvas: HTMLCanvasElement; version: number; used: number }>();
  private fog = new Map<number, { canvas: HTMLCanvasElement; version: number }>();
  private light: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private ghostCache = new Map<string, HTMLCanvasElement>();
  private rain: { x: number; y: number; v: number }[] = [];
  private rainAmount = 0;
  private fireflies: { x: number; y: number; phase: number; life: number }[] = [];
  private smokeTimer = 0;
  private frame = 0;
  private lastTime = 0;
  /** Chunks painted this frame; painting is expensive, so it is spread out. */
  private paintBudget = 0;
  stats = { drawables: 0, chunks: 0, paintMs: 0 };
  private worker: Worker | null = null;
  private pending = new Map<number, { key: number; version: number; gen: number }>();
  private pendingKeys = new Set<number>();
  private reqId = 0;
  private cacheGen = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly sprites: SpriteBank,
    readonly camera: Camera,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.light = makeCanvas(1, 1);
    this.lightCtx = this.light.getContext('2d')!;
    try {
      this.worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; pixels: Uint32Array }>) => this.onPainted(e.data.id, e.data.pixels);
      this.worker.onerror = () => {
        // Fall back to painting on the main thread.
        this.worker = null;
        this.pending.clear();
        this.pendingKeys.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  private onPainted(id: number, pixels: Uint32Array): void {
    const info = this.pending.get(id);
    this.pending.delete(id);
    if (!info) return;
    this.pendingKeys.delete(info.key);
    if (info.gen !== this.cacheGen) return;
    this.ground.set(info.key, { canvas: pixelsToCanvas(pixels), version: info.version, used: this.frame });
    this.evictGround();
  }

  private evictGround(): void {
    if (this.ground.size <= MAX_CHUNK_CACHE) return;
    let oldest: number | null = null;
    let oldestUsed = Infinity;
    for (const [key, v] of this.ground) if (v.used < oldestUsed) {
      oldest = key;
      oldestUsed = v.used;
    }
    if (oldest !== null) this.ground.delete(oldest);
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.setViewport(w, h);
    this.light.width = Math.ceil(w / 4);
    this.light.height = Math.ceil(h / 4);
  }

  /** Paints the ground for every chunk in view up front, e.g. while a load screen shows. */
  prewarm(sim: Simulation): void {
    const { cx0, cy0, cx1, cy1 } = this.chunkRange();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = sim.world.peekChunk(cx, cy);
      if (c && c.exploredCount > 0) this.groundFor(sim, c, true);
    }
  }

  clearCaches(): void {
    this.cacheGen++;
    this.pending.clear();
    this.pendingKeys.clear();
    this.ground.clear();
    this.fog.clear();
    this.particles.list = [];
  }

  private chunkRange() {
    const cam = this.camera;
    const a = cam.screenToWorld(0, 0);
    const b = cam.screenToWorld(cam.width, cam.height);
    return {
      cx0: Math.floor(a.x / CHUNK_PX), cy0: Math.floor(a.y / CHUNK_PX),
      cx1: Math.floor(b.x / CHUNK_PX), cy1: Math.floor(b.y / CHUNK_PX),
    };
  }

  private groundFor(sim: Simulation, c: Chunk, force = false): HTMLCanvasElement | null {
    const k = chunkKey(c.cx, c.cy);
    const e = this.ground.get(k);
    if (e && e.version === c.terrainVersion) {
      e.used = this.frame;
      return e.canvas;
    }
    if (e) e.used = this.frame;
    if (!force && this.worker) {
      // Paint off-thread; keep showing the old image (if any) meanwhile.
      if (!this.pendingKeys.has(k) && this.pending.size < 4) {
        const id = ++this.reqId;
        this.pending.set(id, { key: k, version: c.terrainVersion, gen: this.cacheGen });
        this.pendingKeys.add(k);
        this.worker.postMessage({ id, seed: sim.seed, cx: c.cx, cy: c.cy, terr: terrainGrid(sim.world, c) });
      }
      return e?.canvas ?? null;
    }
    if (!force && this.paintBudget <= 0) return e?.canvas ?? null;
    this.paintBudget--;
    const t0 = performance.now();
    const canvas = paintChunk(sim.world, c);
    this.stats.paintMs = performance.now() - t0;
    this.ground.set(k, { canvas, version: c.terrainVersion, used: this.frame });
    this.evictGround();
    return canvas;
  }

  private fogFor(sim: Simulation, c: Chunk): HTMLCanvasElement {
    const k = chunkKey(c.cx, c.cy);
    const e = this.fog.get(k);
    if (e && e.version === c.fogVersion) return e.canvas;
    const canvas = e?.canvas ?? makeCanvas(CHUNK + 2, CHUNK + 2);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(CHUNK + 2, CHUNK + 2);
    const [r, g, b] = [0x17, 0x13, 0x1f];
    for (let y = -1; y <= CHUNK; y++) {
      for (let x = -1; x <= CHUNK; x++) {
        const inside = x >= 0 && y >= 0 && x < CHUNK && y < CHUNK;
        const explored = inside ? c.explored[y * CHUNK + x] === 1 : sim.world.explored(c.cx * CHUNK + x, c.cy * CHUNK + y);
        const i = ((y + 1) * (CHUNK + 2) + x + 1) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = explored ? 0 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.fog.set(k, { canvas, version: c.fogVersion });
    return canvas;
  }

  // ---- helpers ------------------------------------------------------------

  private blit(s: Sprite, wx: number, wy: number, alpha = 1): void {
    const cam = this.camera;
    const sc = cam.scale;
    const x = Math.round((wx - s.ax) * sc + cam.tx);
    const y = Math.round((wy - s.ay) * sc + cam.ty);
    if (x > cam.width || y > cam.height || x + s.w * sc < 0 || y + s.h * sc < 0) return;
    if (alpha !== 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(s.canvas, x, y, Math.round(s.w * sc), Math.round(s.h * sc));
    if (alpha !== 1) this.ctx.globalAlpha = 1;
  }

  private rectW(wx: number, wy: number, w: number, h: number, color: string): void {
    const cam = this.camera;
    const sc = cam.scale;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(wx * sc + cam.tx), Math.round(wy * sc + cam.ty), Math.round(w * sc), Math.round(h * sc));
  }

  private darkness(t: number): { dark: number; tint: string } {
    // Dawn 0.21-0.3, dusk 0.8-0.87, night otherwise.
    if (t >= 0.3 && t < DUSK) return { dark: 0, tint: '' };
    if (t >= DUSK && t < NIGHT_START) {
      const k = (t - DUSK) / (NIGHT_START - DUSK);
      return { dark: k * 0.62, tint: `rgba(${Math.round(70 - 50 * k)}, ${Math.round(38 - 14 * k)}, ${Math.round(70 - 10 * k)}, 1)` };
    }
    if (t >= MORNING && t < 0.3) {
      const k = 1 - (t - MORNING) / (0.3 - MORNING);
      return { dark: k * 0.62, tint: `rgba(${Math.round(20 + 40 * (1 - k))}, ${Math.round(24 + 20 * (1 - k))}, 60, 1)` };
    }
    return { dark: 0.62, tint: 'rgba(16, 22, 58, 1)' };
  }

  // ---- main ---------------------------------------------------------------

  render(st: RenderState): void {
    const { sim } = st;
    const ctx = this.ctx;
    const cam = this.camera;
    const dt = Math.min(0.1, Math.max(0, st.time - this.lastTime));
    this.lastTime = st.time;
    this.frame++;
    this.paintBudget = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = FOG;
    ctx.fillRect(0, 0, cam.width, cam.height);
    const sc = cam.scale;
    const { cx0, cy0, cx1, cy1 } = this.chunkRange();
    const tl = cam.screenToWorld(0, 0);
    const br = cam.screenToWorld(cam.width, cam.height);
    const tx0 = Math.floor(tl.x / TILE) - 1;
    const ty0 = Math.floor(tl.y / TILE) - 1;
    const tx1 = Math.floor(br.x / TILE) + 1;
    const ty1 = Math.floor(br.y / TILE) + 3;
    const light = this.darkness(sim.timeOfDay);
    const night = light.dark > 0.3;

    // Ground
    let chunks = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = sim.world.peekChunk(cx, cy);
        if (!c || c.exploredCount === 0) continue;
        const g = this.groundFor(sim, c);
        if (!g) continue;
        chunks++;
        ctx.drawImage(g, Math.round(cx * CHUNK_PX * sc + cam.tx), Math.round(cy * CHUNK_PX * sc + cam.ty), Math.round(CHUNK_PX * sc), Math.round(CHUNK_PX * sc));
      }
    }
    this.stats.chunks = chunks;
    this.drawWater(sim, st.time, tx0, ty0, tx1, ty1);

    // Flat things: fields, path/bridge sites, selection rings
    const drawables: Drawable[] = [];
    const occupied = new Set<number>();
    for (const s of sim.settlers) if (s.insideId !== null) occupied.add(s.insideId);
    for (const b of sim.buildings.values()) {
      if (b.x > tx1 || b.y > ty1 || b.x + b.w < tx0 || b.y + b.h < ty0 - 4) continue;
      if (b.field) this.drawField(b, st.time);
      else if (!b.built && (b.type === 'path' || b.type === 'bridge')) this.drawFlatSite(b, st.time);
      else if (b.type === 'stoneBridge') {
        if (!b.built) this.drawStoneBridgeSite(b, st.time);
      } else drawables.push({ y: (b.y + b.h) * TILE, draw: () => this.drawBuilding(sim, b, st, night, occupied) });
    }
    for (const s of sim.settlers) {
      if (s.hidden) continue;
      const x = (s.px + (s.x - s.px) * st.alpha) * TILE;
      const y = (s.py + (s.y - s.py) * st.alpha) * TILE;
      if (x < tl.x - 32 || x > br.x + 32 || y < tl.y - 32 || y > br.y + 48) continue;
      if (st.selected.has(s.id) || st.hoverSettler === s.id) this.drawRing(x, y, st.selected.has(s.id));
      drawables.push({ y, draw: () => this.drawSettler(s, x, y, st.time) });
    }

    // World objects
    const world = sim.world;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = world.peekChunk(tx >> 5, ty >> 5);
        if (!c) continue;
        const i = (ty & 31) * CHUNK + (tx & 31);
        const o = c.obj[i];
        if (o === O.None || c.explored[i] === 0) continue;
        drawables.push({ y: ty * TILE + 15.5, draw: () => this.drawObject(o, tx, ty, st.time) });
      }
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    this.stats.drawables = drawables.length;

    // Ambient emitters
    this.smokeTimer += dt;
    if (this.smokeTimer > 0.45) {
      this.smokeTimer = 0;
      for (const b of sim.buildings.values()) {
        if (!b.built || b.x > tx1 || b.x + b.w < tx0 || b.y > ty1 || b.y < ty0 - 3) continue;
        if (b.type === 'house') this.particles.fx('smoke', b.x + 23.5 / 16, b.y - 14 / 16, this.sprites.ui);
        if (b.type === 'workshop') this.particles.fx('smoke', b.x + 35.5 / 16, b.y - 16 / 16, this.sprites.ui);
        if (b.type === 'bakery') this.particles.fx('smoke', b.x + 38 / 16, b.y - 16 / 16, this.sprites.ui);
        if (b.type === 'cottage') this.particles.fx('smoke', b.x + 38.5 / 16, b.y - 14 / 16, this.sprites.ui);
        if (b.type === 'camp') this.particles.fx('spark', b.x + 1.5, b.y + 1.6, this.sprites.ui);
      }
    }
    this.particles.update(dt);
    this.particles.draw(ctx, sc, cam.tx, cam.ty);

    this.drawOverlays(st, tx0, ty0, tx1, ty1);
    this.drawHighlight(st);

    // Fog of war
    ctx.imageSmoothingEnabled = true;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = world.peekChunk(cx, cy);
        if (!c || c.exploredCount === 0) continue;
        if (c.exploredCount === CHUNK * CHUNK && this.neighboursExplored(sim, c)) continue;
        const f = this.fogFor(sim, c);
        ctx.drawImage(f, 1, 1, CHUNK, CHUNK, Math.round(cx * CHUNK_PX * sc + cam.tx), Math.round(cy * CHUNK_PX * sc + cam.ty), Math.round(CHUNK_PX * sc), Math.round(CHUNK_PX * sc));
      }
    }
    ctx.imageSmoothingEnabled = false;

    this.drawLighting(sim, st, light);
    this.drawWeather(sim, st.time, dt, light.dark);
    // Areas are a planning layer: above fog and night so they stay readable.
    this.drawAreas(st);
    this.drawUiLayer(st);
  }

  private neighboursExplored(sim: Simulation, c: Chunk): boolean {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = sim.world.peekChunk(c.cx + dx, c.cy + dy);
      if (!n || n.exploredCount < CHUNK * CHUNK) return false;
    }
    return true;
  }

  private drawWater(sim: Simulation, time: number, tx0: number, ty0: number, tx1: number, ty1: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const sc = cam.scale;
    ctx.fillStyle = 'rgba(214, 240, 246, 0.55)';
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = sim.world.peekChunk(tx >> 5, ty >> 5);
        if (!c) continue;
        const t = c.terrain[(ty & 31) * CHUNK + (tx & 31)];
        if ((t !== T.Water && t !== T.DeepWater) || !c.explored[(ty & 31) * CHUNK + (tx & 31)]) continue;
        const h = hash01(tx, ty, 404);
        // Two drifting ripple highlights per tile, only where it's open water.
        for (let k = 0; k < 2; k++) {
          const phase = (time * (0.35 + h * 0.2) + h * 7 + k * 0.5) % 1;
          const lx = Math.floor(((h * 13 + k * 7) % 12) + phase * 3);
          const ly = 3 + Math.floor((h * 29 + k * 6) % 10);
          const a = Math.sin(phase * Math.PI);
          if (a < 0.35) continue;
          const len = a > 0.8 ? 3 : 2;
          ctx.globalAlpha = a * 0.8;
          ctx.fillRect(Math.round((tx * TILE + lx) * sc + cam.tx), Math.round((ty * TILE + ly) * sc + cam.ty), len * sc, sc);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawField(b: Building, time: number): void {
    const f = b.field!;
    const soil = f.state === 'wild' ? this.sprites.soil.wild : f.moisture > WATER_THRESHOLD ? this.sprites.soil.wet : this.sprites.soil.tilled;
    this.blit(soil, b.x * TILE, b.y * TILE);
    if (f.crop && (f.state === 'growing' || f.state === 'ripe')) {
      const stage = Math.max(0, fieldStage(f));
      const sprites = this.sprites.crops[f.crop];
      const sway = f.state === 'ripe' && CROPS[f.crop].art.style === 'grain' ? Math.round(Math.sin(time * 1.6 + b.x * 0.7) * 0.6) : 0;
      this.blit(sprites[Math.min(stage, sprites.length - 1)], b.x * TILE + sway, b.y * TILE);
      if (f.state === 'ripe' && hash01(b.x, Math.floor(time * 1.5), b.y) < 0.12) {
        this.rectW(b.x * TILE + 3 + hash01(b.y, Math.floor(time * 1.5), 1) * 10, b.y * TILE + 2 + hash01(b.x, Math.floor(time), 2) * 8, 1, 1, '#fff6c2');
      }
    }
  }

  private drawFlatSite(b: Building, time: number): void {
    const a = 0.45 + Math.sin(time * 3) * 0.1;
    const color = b.type === 'path' ? P.dirt1 : P.wood2;
    this.ctx.globalAlpha = a;
    this.rectW(b.x * TILE + 1, b.y * TILE + 1, 14, 14, color);
    this.ctx.globalAlpha = 1;
    this.rectW(b.x * TILE, b.y * TILE, 3, 1, P.wood3);
    this.rectW(b.x * TILE + 13, b.y * TILE + 15, 3, 1, P.wood3);
    if (b.progress > 0) this.drawBar(b.x * TILE + 2, b.y * TILE - 3, 12, b.progress / BUILDINGS[b.type].work, P.uiGood);
  }

  private fenceMask(sim: Simulation, x: number, y: number): number {
    const is = (tx: number, ty: number) => sim.buildingAt(tx, ty)?.type === 'fence';
    return (is(x, y - 1) ? 1 : 0) | (is(x + 1, y) ? 2 : 0) | (is(x, y + 1) ? 4 : 0) | (is(x - 1, y) ? 8 : 0);
  }

  private spriteFor(sim: Simulation, b: Building, night: boolean): Sprite | null {
    if (b.type === 'fence') return this.sprites.fence[this.fenceMask(sim, b.x, b.y)];
    const set = b.type === 'camp' && sim.progression.reached.includes('village') ? this.sprites.villageHall : this.sprites.buildings[b.type];
    if (!set) return null;
    return night ? set.night : set.day;
  }

  private drawBuilding(sim: Simulation, b: Building, st: RenderState, night: boolean, occupied: ReadonlySet<number>): void {
    // Homes only light their windows when someone is asleep inside.
    const lit = night && (!isPermanentHome(b) || occupied.has(b.id));
    const sprite = this.spriteFor(sim, b, lit);
    const wx = b.x * TILE;
    const wy = b.y * TILE;
    const w = b.w * TILE;
    const h = b.h * TILE;
    // Soft contact shadow
    this.ctx.globalAlpha = 0.22;
    this.rectW(wx + 1, wy + h - 2, w - 2, 3, '#1b1422');
    this.ctx.globalAlpha = 1;
    if (b.built) {
      if (sprite) this.blit(sprite, wx, wy);
      else this.drawPlaceholder(wx, wy, w, h);
      if (b.type === 'camp') this.drawCampfire(wx + 24, wy + 28, st.time);
      if (b.type === 'market') this.drawFountain(wx + 40, wy + 36, st.time);
      if (b.type === 'mill') {
        // Sails turn faster while the miller is grinding.
        const busy = !!b.workshop && b.workshop.progress > 0;
        const f = Math.floor(st.time * (busy ? 5 : 1.5) + b.id) % this.sprites.millSails.length;
        this.blit(this.sprites.millSails[f], wx + 16, wy - 7);
      }
      return;
    }
    // Construction site
    const f = Math.min(1, b.progress / Math.max(1, workOf(b)));
    this.ctx.globalAlpha = 0.5;
    this.rectW(wx, wy, w, h, P.dirt1);
    this.ctx.globalAlpha = 1;
    if (sprite) {
      const cam = this.camera;
      const sc = cam.scale;
      const x = Math.round((wx - sprite.ax) * sc + cam.tx);
      const y = Math.round((wy - sprite.ay) * sc + cam.ty);
      const ghost = this.ghost(sprite, `${b.type}:${lit}`);
      this.ctx.globalAlpha = 0.35;
      this.ctx.drawImage(ghost, x, y, sprite.w * sc, sprite.h * sc);
      this.ctx.globalAlpha = 1;
      if (f > 0) {
        const cut = Math.floor(sprite.h * (1 - f));
        this.ctx.drawImage(sprite.canvas, 0, cut, sprite.w, sprite.h - cut, x, y + cut * sc, sprite.w * sc, (sprite.h - cut) * sc);
      }
    }
    // Scaffold poles
    const top = wy - Math.min(24, h);
    for (const px of [wx + 1, wx + w - 3]) this.rectW(px, top, 2, wy + h - top, P.wood1);
    if (b.w > 1) this.rectW(wx + 1, top + 4, w - 2, 1, P.wood2);
    // Progress and material status
    const bw = Math.min(24, w);
    this.drawBar(wx + (w - bw) / 2, top - 5, bw, f, P.uiGood);
    this.drawMissing(b, wx + w / 2, top - 12, st.time);
  }

  /** Fallback look for a finished building that has no sprite yet. */
  private drawPlaceholder(wx: number, wy: number, w: number, h: number): void {
    this.rectW(wx + 1, wy + 2, w - 2, h - 2, P.wall1);
    this.rectW(wx, wy, w, 3, P.roof1);
    this.rectW(wx + w / 2 - 2, wy + h - 6, 4, 6, P.wood1);
  }

  /** A blinking icon of the first material a site still lacks. */
  private drawMissing(b: Building, x: number, y: number, time: number): void {
    if (materialsComplete(b)) return;
    const missing = invEntries(costOf(b)).find(([r, n]) => (b.delivered[r] ?? 0) < n);
    if (!missing) return;
    const blink = Math.floor(time * 2) % 2 === 0;
    this.blit(this.sprites.resources[missing[0]], x, y + (blink ? 0 : -1));
  }

  /**
   * A stone bridge rises in visible stages: a marked line with stakes, stone
   * piers out of the water, arches closing in from both banks, then deck and
   * parapets. The finished bridge is painted into the ground by the terrain painter.
   */
  private drawStoneBridgeSite(b: Building, time: number): void {
    const f = Math.min(1, b.progress / Math.max(1, workOf(b)));
    const horiz = b.w >= b.h;
    const n = Math.max(b.w, b.h);
    const tileAt = (i: number) => ({ x: (b.x + (horiz ? i : 0)) * TILE, y: (b.y + (horiz ? 0 : i)) * TILE });
    this.ctx.globalAlpha = 0.35 + Math.sin(time * 3) * 0.08;
    for (let i = 0; i < n; i++) {
      const t = tileAt(i);
      if (horiz) this.rectW(t.x, t.y + 3, TILE, 10, P.stone3);
      else this.rectW(t.x + 3, t.y, 10, TILE, P.stone3);
    }
    this.ctx.globalAlpha = 1;
    const piers = Math.min(1, f / 0.35);
    const arches = Math.max(0, Math.min(1, (f - 0.35) / 0.35));
    const deck = Math.max(0, (f - 0.7) / 0.3);
    for (let i = 0; i < n; i++) {
      const t = tileAt(i);
      if (i % 2 === 1 || n <= 2) {
        const ph = Math.round(10 * piers);
        if (ph > 0) {
          if (horiz) {
            this.rectW(t.x + 5, t.y + 16 - ph, 6, ph, P.stone1);
            this.rectW(t.x + 5, t.y + 16 - ph, 2, ph, P.stone2);
          } else {
            this.rectW(t.x + 2, t.y + 5, 3, 6, P.stone1);
            this.rectW(t.x + 11, t.y + 5, 3, 6, P.stone1);
          }
        }
      }
      const fromEdge = Math.min(i, n - 1 - i);
      if (arches > 0 && fromEdge < Math.ceil((arches * n) / 2)) {
        if (horiz) {
          this.rectW(t.x, t.y + 4, TILE, 8, P.stone2);
          this.rectW(t.x, t.y + 11, TILE, 1, P.stone0);
        } else {
          this.rectW(t.x + 3, t.y, 10, TILE, P.stone2);
          this.rectW(t.x + 12, t.y, 1, TILE, P.stone0);
        }
      }
      if (deck > 0 && fromEdge < Math.ceil((deck * n) / 2)) {
        if (horiz) {
          this.rectW(t.x, t.y + 2, TILE, 2, P.stone0);
          this.rectW(t.x, t.y + 12, TILE, 2, P.stone0);
        } else {
          this.rectW(t.x + 1, t.y, 2, TILE, P.stone0);
          this.rectW(t.x + 13, t.y, 2, TILE, P.stone0);
        }
      }
    }
    for (const p of [tileAt(0), tileAt(n - 1)]) this.rectW(p.x + 7, p.y - 2, 2, 5, P.wood2);
    const mid = tileAt(Math.floor(n / 2));
    this.drawBar(mid.x - 4, mid.y - 6, 24, f, P.uiGood);
    this.drawMissing(b, mid.x + 8, mid.y - 13, time);
  }

  /** Work areas: a tinted rectangle, a dashed edge and a name tag (never colour alone). */
  private drawAreas(st: RenderState): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const sc = cam.scale;
    for (const a of st.sim.workAreas) {
      const selected = st.selectedArea === a.id;
      const strong = selected || st.areaMode;
      const color = AREA_COLORS[a.kind];
      const p0 = cam.worldToScreen(a.x0 * TILE, a.y0 * TILE);
      const p1 = cam.worldToScreen((a.x1 + 1) * TILE, (a.y1 + 1) * TILE);
      if (p1.x < 0 || p1.y < 0 || p0.x > cam.width || p0.y > cam.height) continue;
      ctx.globalAlpha = strong ? 0.2 : 0.07;
      ctx.fillStyle = color;
      ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      ctx.globalAlpha = strong ? 0.95 : 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, Math.round(sc / (selected ? 1 : 2)));
      ctx.setLineDash([sc * 4, sc * 2]);
      ctx.strokeRect(p0.x + 0.5, p0.y + 0.5, p1.x - p0.x - 1, p1.y - p0.y - 1);
      ctx.setLineDash([]);
      if (strong || sc >= 3) {
        const label = `${AREA_SYMBOL[a.kind]} ${a.name}`;
        ctx.font = `700 ${Math.max(11, Math.round(sc * 3.6))}px "Atkinson Hyperlegible", sans-serif`;
        const w = ctx.measureText(label).width;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#1f2b25';
        // Keep the tag on screen even when the area's corner is not.
        const lx = Math.max(4, Math.min(p0.x, p1.x - w - sc * 4));
        const ly = Math.max(4, Math.min(p0.y, p1.y - sc * 5.5));
        ctx.fillRect(lx, ly, w + sc * 4, sc * 5.5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.fillText(label, lx + sc * 2, ly + sc * 4.2);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** A pulsing frame around whatever the player just jumped to. */
  private drawHighlight(st: RenderState): void {
    const h = st.highlight;
    if (!h) return;
    const age = st.time - h.t0;
    if (age > 2.6) return;
    const pulse = 2 + Math.round((Math.sin(age * 8) + 1) * 1.5);
    this.ctx.globalAlpha = Math.min(1, (2.6 - age) * 1.5);
    this.drawBrackets(h.x * TILE - pulse, h.y * TILE - pulse, h.w * TILE + pulse * 2, h.h * TILE + pulse * 2, P.select);
    this.drawBrackets(h.x * TILE - pulse - 1, h.y * TILE - pulse - 1, h.w * TILE + pulse * 2 + 2, h.h * TILE + pulse * 2 + 2, P.uiWarn);
    this.ctx.globalAlpha = 1;
  }

  private ghost(sprite: Sprite, key: string): HTMLCanvasElement {
    let g = this.ghostCache.get(key);
    if (!g) {
      g = tinted(sprite.canvas, '#e8dcc0', 0.55);
      this.ghostCache.set(key, g);
    }
    return g;
  }

  private redGhost(sprite: Sprite, key: string): HTMLCanvasElement {
    let g = this.ghostCache.get(`bad:${key}`);
    if (!g) {
      g = tinted(sprite.canvas, '#ff5a4a', 0.45);
      this.ghostCache.set(`bad:${key}`, g);
    }
    return g;
  }

  private drawCampfire(x: number, y: number, time: number): void {
    const f = Math.floor(time * 10);
    const flick = (n: number) => hash01(f, n, 3);
    this.rectW(x - 2, y - 3, 5, 3, P.fire0);
    this.rectW(x - 1 + Math.round(flick(1) - 0.5), y - 5 - Math.round(flick(2) * 2), 3, 3, P.fire1);
    this.rectW(x + Math.round(flick(3) - 0.5), y - 6 - Math.round(flick(4) * 2), 1, 3, P.fire2);
    this.rectW(x - 1, y - 2, 3, 1, P.fire3);
  }

  private drawFountain(x: number, y: number, time: number): void {
    for (let i = 0; i < 5; i++) {
      const t = (time * 1.4 + i / 5) % 1;
      const a = (i / 5) * Math.PI * 2;
      const dx = Math.cos(a) * t * 7;
      const dy = -Math.sin(t * Math.PI) * 6 + t * 8;
      this.rectW(x + dx, y + dy, 1, 1, P.foam);
    }
  }

  private drawObject(o: number, tx: number, ty: number, time: number): void {
    const x = tx * TILE + 8;
    const y = ty * TILE + 16;
    const v = Math.floor(hash01(tx, ty, 17) * 3);
    switch (o) {
      case O.Oak:
      case O.Pine: {
        const tree = o === O.Oak ? this.sprites.oaks[v % 3] : this.sprites.pines[v % 2];
        const sway = Math.round(Math.sin(time * 1.3 + tx * 0.9 + ty * 0.4) * 0.7);
        this.ctx.globalAlpha = 0.25;
        this.rectW(x - 7, y - 3, 14, 3, '#10241a');
        this.ctx.globalAlpha = 1;
        this.blit(tree.trunk, x, y);
        this.blit(tree.canopy, x + sway, y);
        return;
      }
      case O.Berry:
        this.blit(this.sprites.berry[v % 2], x, y);
        return;
      case O.BerryEmpty:
        this.blit(this.sprites.berryEmpty[v % 2], x, y);
        return;
      case O.Rock:
        this.blit(this.sprites.rocks[v], x, y);
        return;
      case O.Boulder:
        this.blit(this.sprites.boulders[v % 2], x, y);
        return;
      case O.Stump:
        this.blit(this.sprites.stump, x, y - 2);
        return;
      case O.Sapling:
        this.blit(this.sprites.sapling, x, y - 2);
        return;
    }
  }

  private drawRing(x: number, y: number, selected: boolean): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const sc = cam.scale;
    ctx.fillStyle = selected ? P.select : 'rgba(255,255,255,0.55)';
    const pts = [[-4, -2], [-3, -2], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -2], [-5, -1], [4, -1], [-6, 0], [5, 0], [-5, 1], [4, 1], [-4, 2], [-3, 2], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [3, 2]];
    for (const [dx, dy] of pts) ctx.fillRect(Math.round((x + dx) * sc + cam.tx), Math.round((y + dy - 1) * sc + cam.ty), sc, sc);
  }

  private drawSettler(s: Settler, x: number, y: number, time: number): void {
    const sheet = this.sprites.settler(s.appearance);
    const phase = Math.floor(time * 8 + s.id * 0.37) % 4;
    let frame: number;
    switch (s.anim) {
      case 'walk':
        frame = (s.carrying ? FRAME.carry : FRAME.walk) + phase;
        break;
      case 'work':
        frame = FRAME.work + (Math.floor(time * 3.2 + s.id * 0.5) % 2);
        break;
      case 'sleep':
        frame = FRAME.sleep;
        break;
      default:
        frame = s.carrying ? FRAME.carry : FRAME.idle + (Math.floor(time * 1.4 + s.id) % 2);
    }
    const sprite = sheet[s.facing][frame];
    this.ctx.globalAlpha = 0.3;
    this.rectW(x - 4, y - 1, 8, 2, '#140e1c');
    this.ctx.globalAlpha = 1;

    const tool = s.anim === 'work' && s.tool && s.tool !== 'hand' ? this.sprites.tools[s.tool] : null;
    const raised = frame === FRAME.work;
    const side = s.facing === 2 ? -1 : 1;
    const toolAt = () => {
      if (!tool) return;
      const tx = x + side * (raised ? 3 : 6);
      const ty = y - (raised ? 16 : 7);
      if (s.facing === 2) this.blitMirror(tool, tx, ty);
      else this.blit(tool, tx, ty);
    };
    if (s.facing === 1) toolAt();
    this.blit(sprite, x, y);
    if (s.facing !== 1) toolAt();

    if (s.carrying) this.blit(this.sprites.resources[s.carrying.res], x, y - 20 + (phase % 2));
    if (s.anim === 'sleep') {
      const t = (time * 0.6 + s.id * 0.3) % 1;
      this.ctx.globalAlpha = 1 - t;
      this.blit(this.sprites.ui.zzz, x + 4 + t * 3, y - 20 - t * 8);
      this.ctx.globalAlpha = 1;
    } else if (s.hunger < 15) {
      this.blit(this.sprites.ui.hungry, x, y - 24 + Math.round(Math.sin(time * 4)));
    } else if ((!s.task || s.task.kind === 'wander') && s.idleReason && s.idleReason !== 'Stores are well stocked') {
      this.blit(this.sprites.ui.idle, x, y - 24 + Math.round(Math.sin(time * 3 + s.id)));
    }
  }

  private mirrorCache = new Map<Sprite, Sprite>();
  private blitMirror(s: Sprite, wx: number, wy: number): void {
    let m = this.mirrorCache.get(s);
    if (!m) {
      const c = makeCanvas(s.w, s.h);
      const cx = c.getContext('2d')!;
      cx.translate(s.w, 0);
      cx.scale(-1, 1);
      cx.drawImage(s.canvas, 0, 0);
      m = { canvas: c, ax: s.w - s.ax, ay: s.ay, w: s.w, h: s.h };
      this.mirrorCache.set(s, m);
    }
    this.blit(m, wx, wy);
  }

  private drawBar(wx: number, wy: number, w: number, f: number, color: string): void {
    this.rectW(wx - 1, wy - 1, w + 2, 4, P.outline);
    this.rectW(wx, wy, w, 2, '#4a3d52');
    this.rectW(wx, wy, Math.max(0, Math.round(w * Math.min(1, f))), 2, color);
  }

  private drawOverlays(st: RenderState, tx0: number, ty0: number, tx1: number, ty1: number): void {
    const { sim } = st;
    // Harvest marks
    for (const k of st.showMarks ? sim.designations : []) {
      const x = keyX(k);
      const y = keyY(k);
      if (x < tx0 || x > tx1 || y < ty0 || y > ty1) continue;
      const res = OBJECTS[sim.world.obj(x, y)].resource;
      const icon = res === 'wood' ? this.sprites.ui.axe : res === 'stone' ? this.sprites.ui.pick : this.sprites.ui.basket;
      const reserved = sim.reservations.has(`obj:${tileKey(x, y)}`);
      this.blit(icon, x * TILE + 8, y * TILE - 2 + (reserved ? Math.round(Math.sin(st.time * 5)) : 0), 0.9);
    }
    // Field and workshop hints
    for (const b of sim.buildings.values()) {
      if (b.x > tx1 || b.x + b.w < tx0 || b.y > ty1 || b.y + b.h < ty0) continue;
      if (b.field && b.field.state === 'growing' && b.field.moisture < 0.12 && !sim.weather.raining) {
        this.blit(this.sprites.ui.drop, b.x * TILE + 8, b.y * TILE + 4 + Math.round(Math.sin(st.time * 3)), 0.8);
      }
      if (b.workshop && b.built) {
        const s = b.workshop.status;
        if (s && !s.startsWith('Crafting') && !s.startsWith('Crafter on') && !s.startsWith('Ready')) {
          this.blit(this.sprites.ui.warn, (b.x + b.w / 2) * TILE, b.y * TILE - 20 + Math.round(Math.sin(st.time * 3)));
        }
      }
      if (st.selectedBuildings.has(b.id)) this.drawBrackets(b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE, P.select);
    }
    // Command markers
    const ctx = this.ctx;
    const cam = this.camera;
    const sc = cam.scale;
    for (const m of st.markers) {
      const t = (st.time - m.t0) / 0.6;
      // Guard against clock skew (e.g. a marker stamped after this frame's time).
      if (t > 1 || t < 0) continue;
      const color = m.kind === 'move' ? P.uiGood : m.kind === 'work' ? P.uiWarn : P.uiBad;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = color;
      ctx.lineWidth = sc;
      const p = cam.worldToScreen(m.x * TILE + 8, m.y * TILE + 8);
      const r = (3 + t * 6) * sc;
      if (m.kind === 'bad') {
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.6, p.y - r * 0.6);
        ctx.lineTo(p.x + r * 0.6, p.y + r * 0.6);
        ctx.moveTo(p.x + r * 0.6, p.y - r * 0.6);
        ctx.lineTo(p.x - r * 0.6, p.y + r * 0.6);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBrackets(wx: number, wy: number, w: number, h: number, color: string): void {
    const L = 4;
    for (const [x, y, dx, dy] of [[wx, wy, 1, 1], [wx + w, wy, -1, 1], [wx, wy + h, 1, -1], [wx + w, wy + h, -1, -1]]) {
      this.rectW(dx > 0 ? x - 1 : x - L, dy > 0 ? y - 1 : y, L + 1, 1, color);
      this.rectW(dx > 0 ? x - 1 : x, dy > 0 ? y - 1 : y - L, 1, L + 1, color);
    }
  }

  private drawLighting(sim: Simulation, st: RenderState, light: { dark: number; tint: string }): void {
    if (light.dark <= 0.01) return;
    const lc = this.lightCtx;
    const cam = this.camera;
    const W = this.light.width;
    const H = this.light.height;
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, W, H);
    lc.globalAlpha = light.dark;
    lc.fillStyle = light.tint;
    lc.fillRect(0, 0, W, H);
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'destination-out';
    const flick = 0.92 + Math.sin(st.time * 11) * 0.04 + Math.sin(st.time * 7.3) * 0.04;
    const glows: { x: number; y: number; r: number; warm: number }[] = [];
    for (const b of sim.buildings.values()) {
      if (!b.built) continue;
      const def = BUILDINGS[b.type];
      if (!def.light) continue;
      let lx = (b.x + b.w / 2) * TILE;
      let ly = (b.y + b.h * 0.7) * TILE;
      let r = def.light * TILE;
      if (b.type === 'camp') {
        lx = b.x * TILE + 24;
        ly = b.y * TILE + 26;
        r *= flick;
      }
      if (b.type === 'lamp') ly = b.y * TILE - 10;
      glows.push({ x: lx, y: ly, r, warm: b.type === 'camp' ? 0.22 : 0.12 });
    }
    for (const g of glows) {
      const p = cam.worldToScreen(g.x, g.y);
      const r = (g.r * cam.scale) / 4;
      const grad = lc.createRadialGradient(p.x / 4, p.y / 4, 0, p.x / 4, p.y / 4, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.7)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = grad;
      lc.fillRect(p.x / 4 - r, p.y / 4 - r, r * 2, r * 2);
    }
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, W * 4, H * 4);
    ctx.imageSmoothingEnabled = false;
    // Warm additive glow around fires and windows
    ctx.globalCompositeOperation = 'lighter';
    for (const g of glows) {
      const p = cam.worldToScreen(g.x, g.y);
      const r = g.r * cam.scale * 0.6;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, `rgba(255, 170, 70, ${g.warm * light.dark * 1.4})`);
      grad.addColorStop(1, 'rgba(255, 170, 70, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawWeather(sim: Simulation, time: number, dt: number, dark: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const W = cam.width;
    const H = cam.height;
    const target = sim.weather.raining ? 1 : 0;
    this.rainAmount += (target - this.rainAmount) * Math.min(1, dt * 0.8);
    if (this.rainAmount > 0.02) {
      ctx.fillStyle = `rgba(40, 55, 85, ${0.18 * this.rainAmount})`;
      ctx.fillRect(0, 0, W, H);
      const want = Math.floor(((W * H) / 7000) * this.rainAmount);
      while (this.rain.length < want) this.rain.push({ x: Math.random() * W, y: Math.random() * H, v: 0.8 + Math.random() * 0.5 });
      if (this.rain.length > want) this.rain.length = want;
      const sc = cam.scale;
      ctx.fillStyle = 'rgba(190, 210, 235, 0.55)';
      for (const d of this.rain) {
        d.y += dt * 260 * sc * d.v;
        d.x -= dt * 50 * sc * d.v;
        if (d.y > H) {
          d.y -= H + 20;
          d.x = Math.random() * W * 1.2;
        }
        if (d.x < 0) d.x += W;
        ctx.fillRect(Math.round(d.x), Math.round(d.y), Math.max(1, sc >> 1), sc * 4);
      }
    }
    // Fireflies at night, drifting pollen by day.
    const cnt = dark > 0.3 ? 28 : 10;
    const tl = cam.screenToWorld(0, 0);
    const br = cam.screenToWorld(W, H);
    while (this.fireflies.length < cnt) {
      this.fireflies.push({ x: tl.x + Math.random() * (br.x - tl.x), y: tl.y + Math.random() * (br.y - tl.y), phase: Math.random() * 6.28, life: 0 });
    }
    if (this.fireflies.length > cnt) this.fireflies.length = cnt;
    for (const f of this.fireflies) {
      f.life += dt;
      f.x += Math.sin(time * 0.7 + f.phase) * dt * 6;
      f.y += Math.cos(time * 0.5 + f.phase * 1.3) * dt * 4 - (dark > 0.3 ? 0 : dt * 2);
      if (f.x < tl.x || f.x > br.x || f.y < tl.y || f.y > br.y || f.life > 20) {
        f.x = tl.x + Math.random() * (br.x - tl.x);
        f.y = tl.y + Math.random() * (br.y - tl.y);
        f.life = 0;
      }
      if (!sim.world.explored(Math.floor(f.x / TILE), Math.floor(f.y / TILE))) continue;
      const p = cam.worldToScreen(f.x, f.y);
      if (dark > 0.3) {
        const glow = (Math.sin(time * 2.2 + f.phase * 3) + 1) / 2;
        if (glow < 0.25) continue;
        ctx.globalAlpha = glow;
        ctx.fillStyle = 'rgba(220, 255, 140, 0.35)';
        ctx.fillRect(Math.round(p.x) - cam.scale, Math.round(p.y) - cam.scale, cam.scale * 3, cam.scale * 3);
        ctx.fillStyle = '#eaff9a';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), cam.scale, cam.scale);
      } else if (this.rainAmount < 0.2) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#fff8d8';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), cam.scale, cam.scale);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawUiLayer(st: RenderState): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const sc = cam.scale;
    if (st.placement) {
      const pl = st.placement;
      const def = BUILDINGS[pl.type];
      for (const t of pl.tiles) {
        ctx.fillStyle = t.ok ? 'rgba(140, 230, 120, 0.28)' : 'rgba(255, 100, 90, 0.35)';
        const p = cam.worldToScreen(t.x * TILE, t.y * TILE);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), TILE * sc, TILE * sc);
        ctx.strokeStyle = t.ok ? 'rgba(170, 255, 150, 0.8)' : 'rgba(255, 120, 110, 0.9)';
        ctx.lineWidth = Math.max(1, sc >> 1);
        ctx.strokeRect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, TILE * sc - 1, TILE * sc - 1);
      }
      if (!def.paint) {
        const set = this.sprites.buildings[pl.type];
        if (set) {
          ctx.globalAlpha = 0.7;
          const g = pl.ok ? set.day.canvas : this.redGhost(set.day, pl.type);
          const p = cam.worldToScreen(pl.x * TILE - set.day.ax, pl.y * TILE - set.day.ay);
          ctx.drawImage(g, Math.round(p.x), Math.round(p.y), set.day.w * sc, set.day.h * sc);
          ctx.globalAlpha = 1;
        }
      }
    } else if (st.showBuildHover && st.hoverTile) {
      const p = cam.worldToScreen(st.hoverTile.x * TILE, st.hoverTile.y * TILE);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(1, sc >> 1);
      ctx.strokeRect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, TILE * sc - 1, TILE * sc - 1);
    }
    if (st.areaBox) {
      const a = st.areaBox;
      const p0 = cam.worldToScreen(Math.min(a.x0, a.x1) * TILE, Math.min(a.y0, a.y1) * TILE);
      const p1 = cam.worldToScreen((Math.max(a.x0, a.x1) + 1) * TILE, (Math.max(a.y0, a.y1) + 1) * TILE);
      ctx.fillStyle = a.kind === 'unmark' ? 'rgba(255, 110, 90, 0.18)' : a.kind === 'area' ? 'rgba(143, 201, 224, 0.2)' : 'rgba(255, 214, 90, 0.18)';
      ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      ctx.strokeStyle = a.kind === 'unmark' ? P.uiBad : a.kind === 'area' ? '#8fc9e0' : P.uiWarn;
      ctx.lineWidth = Math.max(1, sc >> 1);
      ctx.setLineDash([sc * 3, sc * 2]);
      ctx.strokeRect(p0.x + 0.5, p0.y + 0.5, p1.x - p0.x - 1, p1.y - p0.y - 1);
      ctx.setLineDash([]);
    }
    if (st.dragBox) {
      const d = st.dragBox;
      ctx.fillStyle = 'rgba(255, 246, 194, 0.12)';
      ctx.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      ctx.strokeStyle = P.select;
      ctx.lineWidth = Math.max(1, Math.round(sc / 2));
      ctx.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
  }
}
