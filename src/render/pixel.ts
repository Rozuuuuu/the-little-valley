import { hash01 } from '../game/core/rng';
import { P } from './palette';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Pixel inside the sprite that sits on the world anchor point. */
  ax: number;
  ay: number;
  w: number;
  h: number;
}

const bitmaps = new WeakMap<HTMLCanvasElement, ImageBitmap | null>();

/**
 * What to draw for a finished sprite canvas. Chrome sends the pixels of a plain canvas to the GPU
 * process again every time it is drawn onto the game canvas, which with hundreds of sprites a
 * frame swamps the GPU (panning then stutters). An ImageBitmap is uploaded once and reused, so
 * the first draw starts making one and later draws use it. Only for canvases that never change
 * after they are made: a canvas that is redrawn needs a new canvas (or no bitmap).
 */
export function gpuImage(c: HTMLCanvasElement): CanvasImageSource {
  const b = bitmaps.get(c);
  if (b) return b;
  if (b === undefined && typeof createImageBitmap === 'function') {
    bitmaps.set(c, null);
    createImageBitmap(c).then((bmp) => bitmaps.set(c, bmp), () => undefined);
  }
  return c;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/**
 * Tiny immediate-mode pixel painter. Coordinates are offset by (ox, oy) so art
 * can be authored relative to a building footprint or a character's feet.
 */
export class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
    public ox = 0,
    public oy = 0,
  ) {
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d')!;
  }

  px(x: number, y: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x + this.ox), Math.round(y + this.oy), 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x + this.ox), Math.round(y + this.oy), Math.round(w), Math.round(h));
  }

  hline(x0: number, x1: number, y: number, c: string): void {
    this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c);
  }

  vline(x: number, y0: number, y1: number, c: string): void {
    this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c);
  }

  /** Filled disc shaded by a light from the upper left, with leafy dither. */
  blob(cx: number, cy: number, r: number, tones: readonly string[], seed = 0, texture = 0.18): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = (x + 0.5 - cx) / r;
        const dy = (y + 0.5 - cy) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const light = -(dx * 0.62 + dy * 0.78) + (hash01(x, y, seed) - 0.5) * texture * 2 - d2 * 0.25;
        const n = tones.length;
        // tones: darkest first
        let idx: number;
        if (light > 0.5) idx = n - 1;
        else if (light > 0.05) idx = n - 2;
        else if (light > -0.45) idx = Math.max(0, n - 3);
        else idx = 0;
        this.px(x, y, tones[idx]);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
    }
  }

  /** Adds a 1px outline around all opaque pixels. Leave a 1px margin when authoring. */
  outline(color: string = P.outline): this {
    const { w, h } = this;
    const img = this.ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 40 ? 1 : 0;
    const [r, g, b] = hexToRgb(color);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        const n =
          (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
        if (n) {
          d[i * 4] = r;
          d[i * 4 + 1] = g;
          d[i * 4 + 2] = b;
          d[i * 4 + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(img, 0, 0);
    return this;
  }

  sprite(ax: number, ay: number): Sprite {
    return { canvas: this.canvas, ax, ay, w: this.w, h: this.h };
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mirrors a canvas horizontally. */
export function mirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Recolours every opaque pixel, used for placement ghosts. */
export function tinted(src: HTMLCanvasElement, color: string, alpha: number): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Copies a canvas, swapping exact colours (used for seasonal variants of sprites). */
export function recolor(src: HTMLCanvasElement, map: Record<string, string>): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const lookup = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(map)) {
    const [r, g, b] = hexToRgb(from);
    lookup.set((r << 16) | (g << 8) | b, hexToRgb(to));
  }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const hit = lookup.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (hit) {
      d[i] = hit[0];
      d[i + 1] = hit[1];
      d[i + 2] = hit[2];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
