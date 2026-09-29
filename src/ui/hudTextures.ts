
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
  return [c, c.getContext('2d', { willReadFrequently: true })!];
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

/** HUD grass: deep, darker greens (the frame used to be bright enough to look like a cracker's edge). */
const GR = { root: '#143614', dark: '#1d4a1b', mid: '#2a6323', lit: '#387a2b', tip: '#4f9636' };

/** Colour of a pixel of a blade from its root (0) to its tip (h - 1); lit blades are the sunny side of a tuft. */
function bladeColor(i: number, h: number, lit = false): string {
  if (i === 0) return GR.root;
  if (i === h - 1 && h >= 5) return lit ? GR.tip : GR.lit;
  if (i >= h / 2) return lit ? GR.lit : GR.mid;
  return GR.dark;
}

/**
 * Pixel grass tufts along a baseline: a tall middle blade with shorter blades either side, the
 * left one lit, spaced unevenly with short stubble between, so the edge reads as grass rather
 * than a regular scalloped edge.
 */
function paintTufts(px: (x: number, y: number, col: string) => void, width: number, base: number, maxH: number, seed: number): void {
  // Stubble first, then tufts over it.
  for (let x = 0; x < width; x++) {
    const h = hash(x, 1, seed) > 0.5 ? 2 : 1;
    for (let i = 0; i < h; i++) px(x, base - 1 - i, i === 0 ? GR.root : GR.dark);
  }
  let x = Math.floor(hash(0, 2, seed) * 3);
  while (x < width + 2) {
    const tall = Math.min(maxH, 4 + Math.floor(hash(x, 3, seed) * (maxH - 3)));
    const side = Math.max(2, tall - 2 - Math.floor(hash(x, 4, seed) * 2));
    const blade = (bx: number, h: number, lean: number, lit: boolean) => {
      for (let i = 0; i < h; i++) px((((bx + (i >= h - 2 ? lean : 0)) % width) + width) % width, base - 1 - i, bladeColor(i, h, lit));
    };
    blade(x - 1, side, -1, true);
    blade(x + 1, side, 1, false);
    blade(x, tall, 0, true);
    x += 4 + Math.floor(hash(x, 5, seed) * 4);
  }
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
    px(x, y, r > 0.8 ? GR.lit : r < 0.25 ? GR.dark : GR.mid);
  };
  // A turf band all the way round: 3 px at the top, the sides and the bottom.
  const t0 = top - 5;
  // The dirt inside the turf, so the frame blends with the box's own dirt.
  for (let y = t0 + 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) px(x, y, loam(x, y));
  for (let y = t0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (y < t0 + 3 || x < 3 || x >= S - 3 || y >= S - 3) turf(x, y);
    }
  }
  // The turf's lower edge is a shade darker (it shadows the dirt), with roots hanging in.
  for (let x = 0; x < S; x++) {
    px(x, t0 + 2, GR.dark);
    const drip = hash(x, 0, 43) > 0.6 ? 1 + Math.floor(hash(x, 7, 44) * 2) : 0;
    for (let d = 0; d < drip; d++) px(x, t0 + 3 + d, d === drip - 1 ? GR.root : GR.dark);
  }
  for (let y = t0 + 3; y < S - 3; y++) {
    px(2, y, GR.dark);
    px(S - 3, y, GR.dark);
  }
  // Tufts along the top.
  paintTufts(px, S, t0, t0, 47);
  // Small tufts poking out of the sides, and short blades hanging below the bottom hem.
  for (let y = t0 + 2; y < S - 2; y += 3 + Math.floor(hash(0, y, 81) * 3)) {
    px(0, y, GR.lit);
    px(0, y + 1, GR.mid);
    px(S - 1, y + 1, GR.mid);
    px(S - 1, y + 2, GR.dark);
  }
  for (let x = 1; x < S - 1; x++) if (hash(x, S, 85) > 0.72) px(x, S - 1, GR.dark);
  return c;
}

/** A 48×8 strip of tufts on a turf line, repeated along the top of the bottom console. */
export function grassEdge(): HTMLCanvasElement {
  const W = 48;
  const H = 8;
  const [c, ctx] = canvas(W, H);
  const px = (x: number, y: number, col: string) => {
    if (y < 0 || y >= H) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  for (let x = 0; x < W; x++) px(x, H - 1, GR.mid);
  paintTufts(px, W, H - 1, H - 1, 101);
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
