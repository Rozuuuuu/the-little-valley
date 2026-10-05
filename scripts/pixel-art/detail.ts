/**
 * The Godot version's building detail pass (export only; the browser game is unchanged).
 *
 * Each building sprite is redrawn at twice the resolution from its own pixels, so its design
 * stays exactly as authored while the surfaces gain the texture of richer pixel art (the owner's
 * style reference, docs/reference/2d pixel.png, used only as a style guide):
 * - stone becomes coursed brickwork with mortar lines and a lit edge on each block;
 * - roofs get rows of raised tiles: a highlight on each tile's upper edge, a gap between tiles;
 * - timber gets grain, plaster a faint texture, unlit glass a reflection;
 * - light from the upper left: a lit rim on left edges, shade on right edges, and a shadow
 *   under the eaves.
 * Materials are recognised by the browser palette (src/render/palette.ts), so new buildings
 * drawn from it get the same treatment.
 */
import { makeCanvas } from '../../src/render/pixel';
import { P } from '../../src/render/palette';

type RGBA = [number, number, number, number];
type Material = 'stone' | 'roof' | 'wood' | 'wall' | 'glass' | 'other';

const hex = (h: string): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const key = (c: RGBA): string => `${c[0]},${c[1]},${c[2]}`;

/** Ramps, darkest first. */
const RAMPS: Record<Exclude<Material, 'other' | 'glass'>, string[][]> = {
  stone: [[P.stone0, P.stone1, P.stone2, P.stone3], [P.rock3, P.rock0, P.rock1, P.rock2]],
  roof: [[P.roof0, P.roof1, P.roof2, P.roof3], [P.slate0, P.slate1, P.slate2, P.slate3]],
  wood: [[P.wood0, P.wood1, P.wood2, P.wood3, P.wood4]],
  wall: [[P.wall0, P.wall1, P.wall2], [P.canvas0, P.canvas1, P.canvas2]],
};

const lookup = new Map<string, { mat: Material; ramp: RGBA[]; i: number }>();
for (const [mat, ramps] of Object.entries(RAMPS) as [Material, string[][]][]) {
  for (const ramp of ramps) {
    const rgb = ramp.map(hex);
    rgb.forEach((c, i) => lookup.set(key(c), { mat, ramp: rgb, i }));
  }
}
const GLASS = key(hex(P.glass));
const OUTLINE = key(hex(P.outline));
const REFLECT = hex('#b8cbd4');

function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), a[3]];
}

/** A pixel-art hash in 0..1. */
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function detailed(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number): RGBA | null => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const i = (y * w + x) * 4;
    return sd[i + 3] === 0 ? null : [sd[i], sd[i + 1], sd[i + 2], sd[i + 3]];
  };
  const matOf = (c: RGBA | null): Material | 'outline' | 'empty' => {
    if (!c) return 'empty';
    const k = key(c);
    if (k === OUTLINE) return 'outline';
    if (k === GLASS) return 'glass';
    return lookup.get(k)?.mat ?? 'other';
  };
  // Each column's runs of roof: where a roof run starts and ends, for shading from ridge to eaves.
  const roofTop = new Int32Array(w * h).fill(-1);
  const roofBottom = new Int32Array(w * h).fill(-1);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (matOf(at(x, y)) !== 'roof') {
        y++;
        continue;
      }
      const top = y;
      while (y < h && matOf(at(x, y)) === 'roof') y++;
      for (let k = top; k < y; k++) {
        roofTop[k * w + x] = top;
        roofBottom[k * w + x] = y - 1;
      }
    }
  }
  const out = makeCanvas(w * 2, h * 2);
  const og = out.getContext('2d')!;
  const img = og.createImageData(w * 2, h * 2);
  const od = img.data;
  const put = (X: number, Y: number, c: RGBA) => {
    const i = (Y * w * 2 + X) * 4;
    od[i] = c[0];
    od[i + 1] = c[1];
    od[i + 2] = c[2];
    od[i + 3] = c[3];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (!c) continue;
      const m = matOf(c);
      const info = lookup.get(key(c));
      const step = (d: number): RGBA => {
        if (!info) return d < 0 ? mix(c, hex(P.outline), 0.3) : mix(c, [255, 255, 255, 255], 0.2);
        const j = info.i + d;
        if (j >= 0 && j < info.ramp.length) return [...info.ramp[j].slice(0, 3), c[3]] as RGBA;
        return d < 0 ? mix(c, hex(P.outline), 0.35) : mix(c, [255, 255, 255, 255], 0.25);
      };
      const same = (dx: number, dy: number) => matOf(at(x + dx, y + dy)) === m;
      const interior = same(-1, 0) && same(1, 0) && same(0, -1) && same(0, 1);
      // Strips one or two pixels tall (foundations, trims) still get their texture.
      const along = same(-1, 0) && same(1, 0);
      const belowGlass = matOf(at(x, y - 1)) === 'glass' && m !== 'glass';
      const aboveGlass = matOf(at(x, y + 1)) === 'glass' && m !== 'glass';
      const leftOpen = ['empty', 'outline'].includes(matOf(at(x - 1, y)));
      const rightOpen = ['empty', 'outline'].includes(matOf(at(x + 1, y)));
      const underRoof = m !== 'roof' && m !== 'outline' && matOf(at(x, y - 1)) === 'roof';
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const X = x * 2 + i;
          const Y = y * 2 + j;
          let o: RGBA = c;
          if (m === 'stone' && along) {
            // Coursed blocks 6 wide and 3 tall, every other course offset by half a block.
            const course = Math.floor(Y / 3);
            const bx = (X + (course % 2) * 3) % 6;
            if (Y % 3 === 2 || bx === 5) o = step(-1);
            else if (Y % 3 === 0 && bx === 0) o = step(1);
          } else if (m === 'roof' && along) {
            // Shaded from the ridge (lit) to the eaves (dark), then raised tiles 4 wide: a lit
            // upper edge, a dark gap between tiles and a shadow under each row.
            const top = roofTop[y * w + x];
            const bottom = roofBottom[y * w + x];
            const t = bottom > top ? (Y / 2 - top) / (bottom - top + 0.5) : 0.5;
            let base = t < 0.22 ? step(1) : t > 0.78 ? step(-1) : c;
            const row = Math.floor(Y / 4);
            const tx = (X + (row % 2) * 2) % 4;
            if (Y % 4 === 0) base = mix(base, [255, 255, 255, 255], 0.18);
            else if (Y % 4 === 3) base = mix(base, hex(P.outline), 0.3);
            else if (tx === 3) base = mix(base, hex(P.outline), 0.35);
            o = base;
          } else if (m === 'wood' && interior) {
            if ((Y % 3 === 0 && hash(X >> 2, Y, 3) > 0.35) || hash(X, Y, 5) > 0.94) o = mix(c, step(-1), 0.6);
          } else if (m === 'wall' && interior) {
            if (hash(X, Y, 7) > 0.9) o = mix(c, step(-1), 0.45);
          } else if (m === 'glass') {
            if (i === 0 && j === 0) o = REFLECT;
            else if (i === 1 && j === 1) o = mix(c, hex(P.outline), 0.25);
          }
          // A light sill under each window, a shadowed lintel over it.
          if (belowGlass && j === 0) o = mix(o, [255, 255, 255, 255], 0.35);
          if (aboveGlass && j === 1) o = mix(o, hex(P.outline), 0.35);
          if (m !== 'outline' && m !== 'glass') {
            if (leftOpen && i === 0) o = mix(o, [255, 255, 255, 255], 0.22);
            if (rightOpen && i === 1) o = mix(o, hex(P.outline), 0.22);
            if (underRoof && j === 0) o = mix(o, hex(P.outline), 0.4);
          }
          put(X, Y, o);
        }
      }
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}
