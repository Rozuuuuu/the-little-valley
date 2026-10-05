/**
 * Runs in Chrome (bundled by export.ts). Builds the browser game's SpriteBank, the original pixel
 * art, and hands every sprite to the Godot version: scaled 6× with nearest-neighbour (16 art px
 * per tile become the Godot pipeline's 96), with anchors converted to Godot's conventions:
 * - objects (trees, bushes, rocks): the foot of the tile, (tx + 0.5, ty + 1) tiles;
 * - buildings, pens, fields, sites: the bottom-left corner of the footprint;
 * - animals: their position, facing right (Godot mirrors for left);
 * - tools: the hand, as the browser draws them; icons: their centre.
 * Night overlays (`_lit`) keep only the pixels that differ from the day sprite (lit windows).
 */
import { makeCanvas, Painter, type Sprite } from '../../src/render/pixel';
import { P } from '../../src/render/palette';
import { SpriteBank } from '../../src/render/sprites';
import { BUILDINGS } from '../../src/game/data/buildings';

const UP = 6;
const TILE = 16;

interface Out { name: string; png: string; w: number; h: number; ax: number; ay: number; kind: string; points?: Record<string, [number, number]> }
const out: Out[] = [];

function scaled(c: HTMLCanvasElement): HTMLCanvasElement {
  const s = makeCanvas(c.width * UP, c.height * UP);
  const g = s.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(c, 0, 0, c.width * UP, c.height * UP);
  return s;
}

/** Adds a sprite whose Godot anchor is (ax, ay) in browser pixels of its own canvas. */
function add(name: string, c: HTMLCanvasElement, ax: number, ay: number, kind: string, points?: Record<string, [number, number]>): void {
  out.push({ name, png: scaled(c).toDataURL('image/png'), w: c.width * UP, h: c.height * UP, ax: ax * UP, ay: ay * UP, kind, points });
}

function mirrored(s: Sprite): Sprite {
  const c = makeCanvas(s.w, s.h);
  const g = c.getContext('2d')!;
  g.translate(s.w, 0);
  g.scale(-1, 1);
  g.drawImage(s.canvas, 0, 0);
  return { canvas: c, ax: s.w - s.ax, ay: s.ay, w: s.w, h: s.h };
}

/** The pixels of `night` that differ from `day`: lit windows, glowing furnaces. */
function litOnly(day: Sprite, night: Sprite): HTMLCanvasElement | null {
  const c = makeCanvas(night.w, night.h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(night.canvas, 0, 0);
  const n = g.getImageData(0, 0, c.width, c.height);
  const dg = makeCanvas(day.w, day.h).getContext('2d', { willReadFrequently: true })!;
  dg.drawImage(day.canvas, 0, 0);
  const d = dg.getImageData(0, 0, c.width, c.height).data;
  let any = false;
  for (let i = 0; i < n.data.length; i += 4) {
    const same = n.data[i] === d[i] && n.data[i + 1] === d[i + 1] && n.data[i + 2] === d[i + 2] && n.data[i + 3] === d[i + 3];
    if (same) n.data[i + 3] = 0;
    else any = true;
  }
  if (!any) return null;
  g.putImageData(n, 0, 0);
  return c;
}

/** A tree's shadow, trunk and canopy in one picture, as the browser bakes it (no sway). */
function bakedTree(trunk: Sprite, canopy: Sprite): Sprite {
  const x0 = Math.min(-7, -trunk.ax, -canopy.ax);
  const y0 = Math.min(-3, -trunk.ay, -canopy.ay);
  const x1 = Math.max(7, trunk.w - trunk.ax, canopy.w - canopy.ax);
  const y1 = Math.max(0, trunk.h - trunk.ay, canopy.h - canopy.ay);
  const c = makeCanvas(x1 - x0, y1 - y0);
  const g = c.getContext('2d')!;
  g.globalAlpha = 0.25;
  g.fillStyle = '#10241a';
  g.fillRect(-7 - x0, -3 - y0, 14, 3);
  g.globalAlpha = 1;
  g.drawImage(trunk.canvas, -trunk.ax - x0, -trunk.ay - y0);
  g.drawImage(canopy.canvas, -canopy.ax - x0, -canopy.ay - y0);
  return { canvas: c, ax: -x0, ay: -y0, w: c.width, h: c.height };
}

function footprint(type: string): { w: number; h: number } {
  const d = (BUILDINGS as Record<string, { size: { w: number; h: number } }>)[type];
  return d ? d.size : { w: 1, h: 1 };
}

/** A building drawn at its footprint's top-left in the browser; Godot anchors the bottom-left. */
function addBuilding(name: string, set: { day: Sprite; night: Sprite }, type: string, extra?: Record<string, [number, number]>): void {
  const fh = footprint(type).h * TILE;
  add(name, set.day.canvas, set.day.ax, set.day.ay + fh, 'building', extra);
  const lit = litOnly(set.day, set.night);
  if (lit) add(`${name}_lit`, lit, set.night.ax, set.night.ay + fh, 'night');
}

/** A construction site as the browser draws one: trodden earth, two scaffold poles and a beam. */
function site(tw: number, th: number): HTMLCanvasElement {
  const w = tw * TILE, h = th * TILE;
  const top = Math.min(24, h);
  const p = new Painter(w + 2, h + top + 2, 1, top + 1);
  const g = p.ctx;
  g.globalAlpha = 0.5;
  p.rect(0, 0, w, h, P.dirt1);
  g.globalAlpha = 1;
  for (let i = 0; i < tw * th * 3; i++) p.px(2 + ((i * 7) % (w - 4)), 2 + ((i * 5) % (h - 4)), P.dirt2);
  for (let x = 1; x < w - 1; x += 3) p.rect(x, h - 3, 2, 2, P.stone1);
  // Poles rise up to 24px above the footprint's top edge, as the browser draws them.
  for (const px of [1, w - 3]) {
    p.rect(px, -top, 2, top + h, P.wood1);
    p.vline(px, -top, h - 1, P.wood2);
  }
  p.rect(0, -top, w, 2, P.wood2);
  p.hline(0, w - 1, -top, P.wood3);
  return p.canvas;
}

function sword(): Sprite {
  const p = new Painter(8, 12, 1, 1);
  p.vline(3, 0, 6, P.stone3);
  p.vline(4, 0, 6, P.stone1);
  p.hline(1, 6, 7, '#d9a441');
  p.vline(3, 8, 9, P.wood1);
  p.outline();
  return p.sprite(3, 9);
}

export function exportAll(): Out[] {
  const bank = new SpriteBank();
  // Objects: anchored at the foot of their tile (the browser blits stumps and saplings 2px up).
  for (let v = 0; v < 3; v++) {
    for (const [season, set] of [['summer', bank.oaks], ['autumn', bank.autumnOaks]] as const) {
      const t = bakedTree(set[v].trunk, set[v].canopy);
      add(`oak_${v}_${season}`, t.canvas, t.ax, t.ay, 'object');
    }
    const w = bank.winterOaks[v];
    add(`oak_${v}_winter`, w.canvas, w.ax, w.ay, 'object');
  }
  for (let v = 0; v < 2; v++) {
    for (const [season, set] of [['summer', bank.pines], ['winter', bank.winterPines]] as const) {
      const t = bakedTree(set[v].trunk, set[v].canopy);
      add(`pine_${v}_${season}`, t.canvas, t.ax, t.ay, 'object');
    }
  }
  const obj = (name: string, s: Sprite, lift = 0) => add(name, s.canvas, s.ax, s.ay + lift, 'object');
  obj('berry_full_summer', bank.berry[0]);
  obj('berry_full_winter', bank.winterBushes[0]);
  obj('berry_empty_summer', bank.berryEmpty[0]);
  obj('berry_empty_winter', bank.winterBushes[1]);
  obj('rock_0', bank.rocks[0]);
  obj('rock_1', bank.rocks[1]);
  obj('boulder', bank.boulders[0]);
  obj('stump', bank.stump, 2);
  obj('sapling', bank.sapling, 2);
  // Buildings.
  for (const [type, set] of Object.entries(bank.buildings)) addBuilding(type, set!, type);
  bank.townHall.forEach((set, i) => addBuilding(i === 0 ? 'townHall' : `townHall_${i + 1}`, set, 'townHall'));
  addBuilding('villageHall', bank.villageHall, 'camp');
  bank.mine.forEach((set, i) => addBuilding(i === 0 ? 'mine' : `mine_${i + 1}`, set, 'mine'));
  bank.millSails.forEach((s, i) => add(`mill_sails_${i}`, s.canvas, s.ax, s.ay, 'object'));
  const looks: Record<string, string> = { saplings: 'young', bare: 'bare', leafy: 'leafy', fruit1: 'fruit1', fruit2: 'fruit2', fruit3: 'fruit3', autumn: 'autumn', winter: 'winter' };
  for (const [godot, browser] of Object.entries(looks)) {
    const s = bank.orchard[browser as keyof typeof bank.orchard];
    add(`orchard_${godot}`, s.canvas, s.ax, s.ay + 2 * TILE, 'building');
  }
  // Fence and stone wall pieces by neighbour mask (N 1, E 2, S 4, W 8).
  bank.fence.forEach((s, m) => add(m === 0 ? 'fence' : `fence_${m}`, s.canvas, s.ax, s.ay + TILE, 'building'));
  bank.stoneWall.forEach((s, m) => add(m === 0 ? 'stoneWall' : `stoneWall_${m}`, s.canvas, s.ax, s.ay + TILE, 'building'));
  // Pens: the yard with its front rails, as one ground sprite.
  for (const [type, pen] of Object.entries(bank.pens)) {
    const fh = footprint(type).h * TILE;
    const back = pen.back;
    const front = pen.front;
    // Front rails sit at the footprint's bottom edge, 1px up.
    const fy = back.ay + fh - 1 - front.ay;
    const fx = back.ax - front.ax;
    const x0 = Math.min(0, fx), y0 = Math.min(0, fy);
    const c = makeCanvas(Math.max(back.w, fx + front.w) - x0, Math.max(back.h, fy + front.h) - y0);
    const g = c.getContext('2d')!;
    g.drawImage(back.canvas, -x0, -y0);
    g.drawImage(front.canvas, fx - x0, fy - y0);
    add(type, c, back.ax - x0, back.ay + fh - y0, 'pen');
  }
  bank.quarry.forEach((s, i) => add(`quarry_${i}`, s.canvas, s.ax, s.ay + 2 * TILE, 'pen'));
  for (const [tw, th] of [[1, 1], [2, 2], [3, 2], [4, 3], [2, 1], [5, 4]]) add(`site_${tw}x${th}`, site(tw, th), 1, Math.min(24, th * TILE) + 1 + th * TILE, 'site');
  // Fields.
  for (const st of ['wild', 'tilled', 'wet'] as const) add(`soil_${st}`, bank.soil[st].canvas, bank.soil[st].ax, bank.soil[st].ay + TILE, 'field');
  for (const [id, stages] of Object.entries(bank.crops)) {
    const n = stages.length;
    for (let st = 0; st < 4; st++) {
      const s = stages[Math.min(n - 1, Math.round((st * (n - 1)) / 3))];
      add(`crop_${id}_${st}`, s.canvas, s.ax, s.ay + TILE, 'crop');
    }
  }
  // Animals face left in the browser; Godot's face right. Walk frames 0 and 2.
  for (const [id, frames] of Object.entries(bank.animals)) {
    [0, 2].forEach((f, i) => {
      const m = mirrored(frames[Math.min(f, frames.length - 1)]);
      add(`animal_${id}_${i}`, m.canvas, m.ax, m.ay, 'animal');
    });
  }
  // Tools in hand, icons and the small overhead marks.
  for (const [k, s] of Object.entries(bank.tools)) add(`tool_${k}`, s.canvas, s.ax, s.ay, 'tool');
  const sw = sword();
  add('tool_sword', sw.canvas, sw.ax, sw.ay, 'tool');
  for (const [k, s] of Object.entries(bank.resources)) add(`icon_${k}`, s.canvas, s.w / 2, s.h / 2, 'icon');
  for (const [k, s] of Object.entries(bank.ui)) add(`ui_${k}`, s.canvas, s.ax, s.ay, 'ui');
  return out;
}

/** The browser palette (src/render/palette.ts): every colour the pixel art is made of. */
export function palette(): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(P).filter(([, v]) => Array.isArray(v) || (typeof v === 'string' && v.startsWith('#')))) as Record<string, string | string[]>;
}

(window as unknown as { exportAll: typeof exportAll; palette: typeof palette }).exportAll = exportAll;
(window as unknown as { palette: typeof palette }).palette = palette;
