import { P } from '../render/palette';

/**
 * Pixel textures for the HUD boxes, painted once at startup with the game's own ground
 * colours: a Minecraft-style dirt tile for the inside of every box, and a grass frame
 * (short-to-medium blades along the top, turf hanging into the dirt, grassy sides and a
 * soil edge below) used as a CSS border image. Both are set as CSS variables on :root.
 */

/** Frame slices, in texture pixels: top, right, bottom, left. */
export const FRAME_SLICE = { top: 14, side: 5, bottom: 5 } as const;
const FRAME_SIZE = 48;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The soil colour at a texture pixel: dark earth with crumbs, lighter clods and pebbles. */
function soil(x: number, y: number): string {
  const r = hash(x, y, 11);
  const clump = hash(Math.floor(x / 2), Math.floor(y / 2), 23);
  if (hash(Math.floor(x / 3), Math.floor(y / 3), 31) > 0.955) return r > 0.5 ? P.rock1 : P.rock3; // pebbles
  if (clump > 0.8) return r > 0.4 ? P.soil1 : P.soil2; // lighter clods
  if (clump < 0.18) return P.soilWet; // damp dark patches
  if (r < 0.2) return P.soilWet2;
  if (r > 0.9) return P.soil1;
  return P.soil0;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function dirtTile(): HTMLCanvasElement {
  const [c, ctx] = canvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = soil(x, y);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function grassFrame(): HTMLCanvasElement {
  const S = FRAME_SIZE;
  const { top, bottom } = FRAME_SLICE;
  const [c, ctx] = canvas(S, S);
  const px = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  // Soil everywhere inside the outline (so the frame's dirt blends into the box's own dirt).
  for (let y = top - 4; y < S; y++) for (let x = 0; x < S; x++) px(x, y, soil(x, y));
  // A dark earth outline on the sides and bottom.
  for (let y = top - 4; y < S; y++) {
    px(0, y, '#2a1a0e');
    px(S - 1, y, '#2a1a0e');
  }
  for (let x = 0; x < S; x++) {
    px(x, S - 1, '#2a1a0e');
    px(x, S - 2, P.soilWet);
  }
  // Grassy sides: a turf strip with little tufts, thinning out towards the bottom.
  for (let y = top - 4; y < S - bottom; y++) {
    for (const [x0, dir] of [[1, 1], [S - 2, -1]] as const) {
      const fade = (y - top) / (S - top - bottom);
      if (hash(x0, y, 5) > 0.35 + fade * 0.5) {
        px(x0, y, hash(x0, y, 7) > 0.5 ? P.grass1 : P.grass0);
        if (hash(x0, y, 9) > 0.6) px(x0 + dir, y, P.grass2);
      }
    }
  }
  // The turf band across the top.
  const turf0 = top - 6; // blades above, 3 rows of turf, then drips into the dirt
  for (let x = 0; x < S; x++) {
    for (let y = turf0; y < turf0 + 3; y++) {
      const r = hash(x, y, 41);
      px(x, y, y === turf0 ? (r > 0.5 ? P.grass3 : P.grass2) : r > 0.7 ? P.grass2 : r < 0.25 ? P.grass0 : P.grass1);
    }
    // Grass hanging down into the dirt, Minecraft-style.
    const drip = Math.floor(hash(x, 0, 43) * 4);
    for (let d = 0; d < drip; d++) px(x, turf0 + 3 + d, d === drip - 1 ? P.grass0 : P.grass1);
  }
  // Short-to-medium blades along the top, darker at the root and bright at the tip.
  for (let x = 0; x < S; x++) {
    const r = hash(x, 1, 47);
    if (r < 0.1) continue; // a gap between clumps
    // Short-to-medium blades: mostly 3–6 pixels, now and then a tall one.
    const h = Math.min(turf0, 2 + Math.floor(hash(x, 2, 53) * 5) + (hash(x, 8, 73) > 0.85 ? 2 : 0));
    const lean = hash(x, 3, 59) > 0.8 ? (hash(x, 4, 61) > 0.5 ? 1 : -1) : 0;
    for (let i = 0; i < h; i++) {
      const y = turf0 - 1 - i;
      const bx = i >= h - 1 && lean ? x + lean : x;
      if (bx < 0 || bx >= S) continue;
      px(bx, y, i === h - 1 ? P.grassTip : i === 0 ? P.grass0 : i > h / 2 ? P.grass3 : i % 2 ? P.grass2 : P.grass1);
      // Some clumps are two blades wide, the second a shade darker and a pixel shorter.
      if (r > 0.75 && i < h - 1 && x + 1 < S) px(x + 1, y, i === 0 ? P.grass0 : P.grass1);
    }
    // Now and then a tiny flower on a tall stem.
    if (h >= turf0 - 2 && hash(x, 5, 67) > 0.93) px(x, turf0 - 1 - h, hash(x, 6, 71) > 0.5 ? '#f4dc5c' : '#f0f0f8');
  }
  return c;
}

/** Paints both textures and publishes them as --dirt-tile and --grass-frame. */
export function installHudTextures(): void {
  try {
    const root = document.documentElement.style;
    root.setProperty('--dirt-tile', `url(${dirtTile().toDataURL()})`);
    root.setProperty('--grass-frame', `url(${grassFrame().toDataURL()})`);
  } catch {
    // No canvas (tests or a very old browser): the plain colours in pixel.css still apply.
  }
}
