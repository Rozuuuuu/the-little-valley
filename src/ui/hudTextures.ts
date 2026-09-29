import { P } from '../render/palette';

/**
 * Pixel textures for the HUD, painted once at startup and set as CSS variables on :root:
 *  - --dirt-tile: the inside of every box. Flat Pokémon-style brown with small scuff marks,
 *    lighter and smoother than the map's soil so the HUD never blends into it.
 *  - --grass-frame: the edge of every box, grass on all four sides with no dark outline:
 *    short-to-medium blades along the top, tufts poking out left and right, and a turf hem
 *    with little blades hanging from the bottom. Used as a CSS border image.
 *  - --grass-edge: a strip of blades for the top of the bottom console.
 */

/** Frame slices, in texture pixels: top, sides, bottom. */
export const FRAME_SLICE = { top: 14, side: 6, bottom: 6 } as const;
const FRAME_SIZE = 48;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * HUD dirt in the style of a Pokémon route: a flat, warm brown with a few small scuff marks
 * (a short dark dash with a light pixel below it), evenly spread. No blocks or clods.
 */
const DIRT = { base: '#7c5230', dark: '#684427', light: '#8f6039' };
/** Where the dashes start on the 16×16 tile. */
const DASHES: [number, number][] = [[2, 2], [10, 1], [6, 7], [13, 9], [1, 11], [9, 13]];
const DIRT_MARKS = new Map<number, string>();
for (const [x, y] of DASHES) {
  DIRT_MARKS.set(y * 16 + x, DIRT.dark);
  DIRT_MARKS.set(y * 16 + ((x + 1) & 15), DIRT.dark);
  DIRT_MARKS.set(((y + 1) & 15) * 16 + ((x + 1) & 15), DIRT.light);
}

function loam(x: number, y: number): string {
  return DIRT_MARKS.get((y & 15) * 16 + (x & 15)) ?? DIRT.base;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function dirtTile(): HTMLCanvasElement {
  const S = 16;
  const [c, ctx] = canvas(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      ctx.fillStyle = loam(x, y);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** Colours of a grass blade from its root (0) to its tip (h - 1). */
function bladeColor(i: number, h: number): string {
  if (i === h - 1) return P.grassTip;
  if (i === 0) return P.grass0;
  return i > h / 2 ? P.grass3 : i % 2 ? P.grass2 : P.grass1;
}

export function grassFrame(): HTMLCanvasElement {
  const S = FRAME_SIZE;
  const { top } = FRAME_SLICE;
  const [c, ctx] = canvas(S, S);
  const px = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  const turf = (x: number, y: number) => {
    const r = hash(x, y, 41);
    px(x, y, r > 0.72 ? P.grass2 : r < 0.22 ? P.grass0 : P.grass1);
  };
  // A turf band all the way round: 3 px at the top, the sides and the bottom.
  const t0 = top - 5;
  // The loam inside the turf, so the frame blends with the box's own dirt.
  for (let y = t0 + 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) px(x, y, loam(x, y));
  for (let y = t0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const inTop = y < t0 + 3;
      const inSide = x < 3 || x >= S - 3;
      const inBottom = y >= S - 3;
      if (inTop || inSide || inBottom) turf(x, y);
    }
  }
  // Turf hanging into the dirt along the top, and creeping in from the sides.
  for (let x = 0; x < S; x++) {
    const drip = Math.floor(hash(x, 0, 43) * 3);
    for (let d = 0; d < drip; d++) px(x, t0 + 3 + d, d === drip - 1 ? P.grass0 : P.grass1);
  }
  for (let y = t0 + 3; y < S - 3; y++) {
    if (hash(1, y, 45) > 0.55) px(3, y, P.grass0);
    if (hash(2, y, 47) > 0.55) px(S - 4, y, P.grass0);
  }
  // Blades along the top: short to medium, darker at the root, bright at the tip.
  for (let x = 0; x < S; x++) {
    const r = hash(x, 1, 47);
    if (r < 0.1) continue;
    const h = Math.min(t0, 2 + Math.floor(hash(x, 2, 53) * 5) + (hash(x, 8, 73) > 0.85 ? 2 : 0));
    const lean = hash(x, 3, 59) > 0.8 ? (hash(x, 4, 61) > 0.5 ? 1 : -1) : 0;
    for (let i = 0; i < h; i++) {
      const y = t0 - 1 - i;
      const bx = i >= h - 1 && lean ? x + lean : x;
      px(bx, y, bladeColor(i, h));
      if (r > 0.75 && i < h - 1) px(x + 1, y, i === 0 ? P.grass0 : P.grass1);
    }
    if (h >= t0 - 2 && hash(x, 5, 67) > 0.93) px(x, t0 - 1 - h, hash(x, 6, 71) > 0.5 ? '#f4dc5c' : '#f0f0f8');
  }
  // Tufts poking out of the sides (1–2 px), and short blades hanging from the bottom hem.
  for (let y = t0 + 1; y < S - 1; y++) {
    if (hash(0, y, 81) > 0.62) px(0, y, hash(0, y, 82) > 0.5 ? P.grass3 : P.grass2);
    if (hash(S, y, 83) > 0.62) px(S - 1, y, hash(S, y, 84) > 0.5 ? P.grass3 : P.grass2);
  }
  for (let x = 1; x < S - 1; x++) if (hash(x, S, 85) > 0.7) px(x, S - 1, P.grass3);
  return c;
}

/** A 48×8 strip of blades on a turf line, repeated along the top of the bottom console. */
export function grassEdge(): HTMLCanvasElement {
  const W = 48;
  const H = 8;
  const [c, ctx] = canvas(W, H);
  const px = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  for (let x = 0; x < W; x++) {
    px(x, H - 1, P.grass1);
    const r = hash(x, 9, 101);
    if (r < 0.08) continue;
    const h = 2 + Math.floor(hash(x, 10, 103) * 5);
    for (let i = 0; i < h; i++) px(x, H - 2 - i, bladeColor(i, h));
  }
  return c;
}

/** The game's pointer: a classic arrow, white with a dark outline and a gold edge, drawn at 2×. */
const ARROW = [
  'X',
  'XX',
  'XGX',
  'XG.X',
  'XG..X',
  'XG...X',
  'XG....X',
  'XG.....X',
  'XG......X',
  'XG.......X',
  'XG....XXXXX',
  'XG.X..X',
  'XGXX..X',
  'XX  X..X',
  'X   X..X',
  '     XX',
];

export function cursorArrow(): HTMLCanvasElement {
  const [c, ctx] = canvas(32, 32);
  const colors: Record<string, string> = { X: '#1a1208', '.': '#fffaf0', G: '#f4cf5a' };
  ARROW.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = colors[ch];
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x * 2, y * 2, 2, 2);
  }));
  return c;
}

/** Paints the textures and publishes them as CSS variables. */
export function installHudTextures(): void {
  try {
    const root = document.documentElement.style;
    root.setProperty('--dirt-tile', `url(${dirtTile().toDataURL()})`);
    root.setProperty('--grass-frame', `url(${grassFrame().toDataURL()})`);
    root.setProperty('--grass-edge', `url(${grassEdge().toDataURL()})`);
    const arrow = cursorArrow().toDataURL();
    root.setProperty('--cursor-img', `url(${arrow})`);
    root.setProperty('--cursor', `url(${arrow}) 1 1, default`);
  } catch {
    // No canvas (tests or a very old browser): the plain colours in pixel.css still apply.
  }
}
