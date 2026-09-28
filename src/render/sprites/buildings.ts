import { hash01 } from '../../game/core/rng';
import type { BuildingId } from '../../game/data/buildings';
import { P } from '../palette';
import { Painter, type Sprite } from '../pixel';

/**
 * Building sprites are authored in footprint coordinates: (0,0) is the
 * top-left corner of the footprint, so walls sit inside the footprint and roofs
 * rise above it. `ax, ay` is where the footprint's top-left lands.
 */
export interface BuildingSprites {
  day: Sprite;
  /** Variant with lit windows, drawn at night. */
  night: Sprite;
}

type Draw = (p: Painter, lit: boolean) => void;

function make(w: number, h: number, ox: number, oy: number, draw: Draw): BuildingSprites {
  const build = (lit: boolean) => {
    const p = new Painter(w, h, ox, oy);
    draw(p, lit);
    p.outline();
    return p.sprite(ox, oy);
  };
  return { day: build(false), night: build(true) };
}

function shingles(p: Painter, x0: number, x1: number, y0: number, y1: number, tones: readonly string[], ridge = 3): void {
  // tones: darkest first (4 tones)
  for (let y = y0; y <= y1; y++) {
    const inset = y < y0 + ridge ? y0 + ridge - y : 0;
    for (let x = x0 + inset; x <= x1 - inset; x++) {
      const row = y - y0;
      let t = row < ridge + 1 ? 3 : 2;
      if ((row + 1) % 4 === 0) t = 1;
      else if ((row + 1) % 4 === 3 && (x + Math.floor(row / 4) * 2) % 5 === 0) t = 1;
      if (x - x0 < 3 && t === 2) t = 3;
      if (x1 - x < 3 && t >= 2) t = 1;
      if (y === y1) t = 0;
      p.px(x, y, tones[t]);
    }
  }
}

function windowAt(p: Painter, x: number, y: number, w: number, h: number, lit: boolean): void {
  p.rect(x, y, w, h, P.wood0);
  p.rect(x + 1, y + 1, w - 2, h - 2, lit ? P.glassLit : P.glass);
  if (lit) p.rect(x + 1, y + 1, Math.ceil((w - 2) / 2), Math.ceil((h - 2) / 2), P.glassLit2);
  else p.px(x + 1, y + 1, '#b8cbd4');
  p.vline(x + Math.floor(w / 2), y + 1, y + h - 2, P.wood1);
  p.hline(x + 1, x + w - 2, y + Math.floor(h / 2), P.wood1);
}

const ROOF = [P.roof0, P.roof1, P.roof2, P.roof3] as const;
const SLATE = [P.slate0, P.slate1, P.slate2, P.slate3] as const;
const BROWN = [P.wood0, P.wood1, P.wood2, P.wood3] as const;

const house: Draw = (p, lit) => {
  // Walls
  p.rect(2, 12, 28, 20, P.wall1);
  p.rect(2, 12, 3, 17, P.wall2);
  p.rect(2, 28, 28, 4, P.stone1);
  p.hline(2, 29, 28, P.stone2);
  for (let x = 4; x < 30; x += 5) p.px(x, 30, P.stone0);
  p.vline(2, 12, 28, P.wood1);
  p.vline(29, 12, 28, P.wood0);
  p.hline(2, 29, 14, P.wood1);
  // Roof and chimney
  p.rect(21, -14, 5, 12, P.stone2);
  p.vline(25, -14, -3, P.stone1);
  p.hline(21, 25, -14, P.stone0);
  p.hline(21, 25, -13, P.stone3);
  shingles(p, 0, 31, -8, 13, ROOF);
  p.hline(1, 30, 14, P.wall0);
  // Door
  p.rect(13, 19, 6, 13, P.wood0);
  p.rect(14, 20, 4, 11, P.wood2);
  p.vline(15, 20, 30, P.wood1);
  p.px(17, 26, P.fire2);
  p.hline(12, 19, 31, P.stone2);
  // Windows and flower boxes
  windowAt(p, 5, 17, 6, 6, lit);
  windowAt(p, 21, 17, 6, 6, lit);
  for (const x of [4, 20]) {
    p.rect(x, 23, 8, 2, P.wood1);
    for (let i = 0; i < 8; i += 2) p.px(x + i, 22, i % 4 ? P.flowerP : P.flowerY);
    p.px(x + 1, 22, P.leaf3);
    p.px(x + 5, 22, P.leaf3);
  }
};

const storehouse: Draw = (p) => {
  p.rect(1, 10, 46, 22, P.wood2);
  for (let x = 1; x < 47; x += 4) p.vline(x, 10, 29, P.wood1);
  p.rect(1, 10, 2, 20, P.wood3);
  p.rect(1, 28, 46, 4, P.stone1);
  p.hline(1, 46, 28, P.stone2);
  for (let x = 3; x < 47; x += 6) p.px(x, 30, P.stone0);
  shingles(p, -1, 48, -10, 11, SLATE, 4);
  p.hline(0, 47, 12, P.wood0);
  // Barn door with cross brace
  p.rect(17, 15, 14, 17, P.wood0);
  p.rect(18, 16, 12, 15, P.wood1);
  for (let i = 0; i < 12; i++) {
    p.px(18 + i, 16 + Math.round((i * 14) / 11), P.wood3);
    p.px(29 - i, 16 + Math.round((i * 14) / 11), P.wood3);
  }
  p.vline(24, 16, 30, P.wood0);
  // Crates and a sack out front
  p.rect(3, 23, 8, 7, P.wood3);
  p.rect(3, 23, 8, 1, P.wood4);
  p.vline(7, 24, 29, P.wood1);
  p.hline(3, 10, 26, P.wood1);
  p.rect(37, 24, 7, 6, P.canvas1);
  p.hline(37, 43, 24, P.canvas2);
  p.px(40, 23, P.canvas0);
  p.vline(43, 25, 29, P.canvas0);
  // Sign
  p.rect(20, 11, 8, 3, P.wood3);
  p.px(22, 12, P.wood0);
  p.px(25, 12, P.wood0);
};

const workshop: Draw = (p, lit) => {
  p.rect(1, 10, 46, 9, P.wall1);
  p.rect(1, 10, 3, 9, P.wall2);
  for (let x = 1; x < 47; x += 8) p.vline(x, 10, 18, P.wood1);
  p.rect(1, 18, 46, 14, P.stone2);
  for (let y = 18; y < 32; y += 3) {
    p.hline(1, 46, y, P.stone1);
    for (let x = 1 + ((y / 3) % 2) * 3; x < 47; x += 6) p.px(x, y + 1, P.stone1);
  }
  p.rect(1, 18, 2, 14, P.stone3);
  p.rect(33, -16, 5, 14, P.stone2);
  p.vline(37, -16, -3, P.stone1);
  p.hline(33, 37, -16, P.stone0);
  shingles(p, -1, 48, -9, 11, BROWN, 3);
  p.hline(0, 47, 12, P.wood0);
  // Open doorway with a warm glow inside
  p.rect(5, 19, 11, 13, P.wood0);
  p.rect(6, 20, 9, 12, lit ? '#5a3b25' : '#3b2a22');
  if (lit) p.rect(7, 26, 7, 6, P.fire1);
  p.rect(7, 27, 6, 3, P.stone1); // anvil
  p.rect(9, 30, 2, 2, P.stone0);
  windowAt(p, 20, 21, 6, 5, lit);
  // Sawhorse with a log
  p.vline(31, 25, 31, P.wood0);
  p.vline(35, 25, 31, P.wood0);
  p.vline(40, 25, 31, P.wood0);
  p.vline(44, 25, 31, P.wood0);
  p.rect(29, 23, 17, 3, P.wood2);
  p.hline(29, 45, 23, P.wood3);
  p.rect(45, 23, 2, 3, P.wood4);
  // Sign
  p.rect(18, 13, 10, 4, P.wood3);
  p.hline(20, 25, 15, P.stone1);
  p.px(21, 14, P.stone1);
};

const camp: Draw = (p) => {
  const tent = (cx: number, top: number, bottom: number, hw: number, tones: readonly string[]) => {
    for (let y = top; y <= bottom; y++) {
      const half = ((y - top) / (bottom - top)) * hw;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const rel = x - cx;
        let t = rel < 0 ? 2 : 1;
        if (rel === 0 || rel === -1) t = 0;
        if (y === bottom) t = 0;
        if ((y - top) % 5 === 4 && t > 0) t -= 1;
        p.px(x, y, tones[t]);
      }
    }
    // doorway
    for (let y = bottom - 7; y <= bottom; y++) {
      const half = ((y - (bottom - 7)) / 7) * 3;
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) p.px(x, y, '#3b2a22');
    }
    p.vline(cx, top - 3, top, P.wood1);
  };
  tent(11, -4, 22, 11, [P.canvas0, P.canvas1, P.canvas2]);
  tent(37, -1, 22, 10, [P.leaf1, P.leaf2, P.leaf3]);
  // Crates
  p.rect(20, 10, 8, 7, P.wood3);
  p.hline(20, 27, 10, P.wood4);
  p.vline(24, 11, 16, P.wood1);
  p.rect(22, 5, 6, 5, P.wood2);
  p.hline(22, 27, 5, P.wood3);
  // Log pile
  for (let i = 0; i < 3; i++) {
    p.rect(39 + i * 3, 26, 3, 3, P.wood2);
    p.px(40 + i * 3, 27, P.wood4);
  }
  p.rect(40, 23, 3, 3, P.wood2);
  p.px(41, 24, P.wood4);
  // Log seat
  p.rect(4, 27, 10, 3, P.wood1);
  p.hline(4, 13, 27, P.wood3);
  p.rect(13, 27, 2, 3, P.wood4);
  // Fire ring (flames are animated by the renderer)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.px(Math.round(24 + Math.cos(a) * 4), Math.round(28 + Math.sin(a) * 2), i % 2 ? P.stone1 : P.stone2);
  }
  p.hline(22, 26, 28, P.wood1);
  p.hline(23, 25, 29, P.wood0);
};

const market: Draw = (p, lit) => {
  // Cobbled plaza
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 80; x++) {
      const h = hash01(x >> 2, y >> 1, 9 + ((y >> 1) & 1) * 3);
      const edge = (x % 4 === 0 && (y >> 1) % 2 === 0) || (x % 4 === 2 && (y >> 1) % 2 === 1) || y % 2 === 1;
      p.px(x, y, edge ? P.stone1 : h > 0.6 ? P.stone3 : P.stone2);
    }
  }
  const awnings = [
    [P.roof2, P.wall2],
    [P.flowerY, P.wall2],
    [P.slate2, P.wall2],
  ];
  const goods = [P.fire1, P.berry, P.flowerY];
  for (let i = 0; i < 3; i++) {
    const x0 = 3 + i * 26;
    p.rect(x0 + 1, 14, 2, 16, P.wood1);
    p.rect(x0 + 20, 14, 2, 16, P.wood1);
    p.rect(x0, 22, 23, 8, P.wood2);
    p.hline(x0, x0 + 22, 22, P.wood3);
    p.hline(x0, x0 + 22, 29, P.wood0);
    for (let g = 0; g < 5; g++) {
      p.rect(x0 + 2 + g * 4, 20, 3, 2, goods[(i + g) % 3]);
      p.px(x0 + 2 + g * 4, 20, '#fff3d0');
    }
    for (let y = -8; y < 12; y++) {
      for (let x = x0 - 1; x <= x0 + 23; x++) {
        const stripe = Math.floor((x - x0 + 1) / 3) % 2;
        let c: string = awnings[i][stripe];
        if (y < -5) c = stripe ? P.wall1 : awnings[i][0];
        if (y === 11 && (x - x0) % 3 === 1) continue;
        p.px(x, y, c);
      }
    }
    p.hline(x0 - 1, x0 + 23, -8, P.wood0);
  }
  // Bunting
  const flags = [P.roof2, P.flowerY, P.slate2, P.leaf3];
  for (let x = 2; x < 78; x += 5) {
    const c = flags[(x / 5) % 4 | 0];
    p.hline(x, x + 2, -14, c);
    p.px(x + 1, -13, c);
  }
  p.hline(0, 79, -15, P.wood1);
  // Fountain
  p.ellipse(40, 50, 13, 7, P.stone1);
  p.ellipse(40, 49, 12, 6, P.stone3);
  p.ellipse(40, 50, 10, 4.6, P.water1);
  p.ellipse(40, 49.5, 8, 3.4, P.water2);
  p.rect(38, 36, 4, 13, P.stone2);
  p.vline(41, 36, 48, P.stone1);
  p.ellipse(40, 36, 5, 2, P.stone3);
  p.ellipse(40, 36, 3.5, 1.2, P.water3);
  // Corner lanterns
  for (const x of [1, 77]) {
    p.rect(x, 38, 2, 20, P.wood0);
    p.rect(x - 1, 34, 4, 4, lit ? P.glassLit : P.glass);
    p.hline(x - 1, x + 2, 33, P.wood0);
  }
};

const flowerbed: Draw = (p) => {
  p.rect(1, 9, 14, 6, P.wood2);
  p.hline(1, 14, 9, P.wood3);
  p.hline(1, 14, 14, P.wood0);
  p.vline(8, 10, 13, P.wood1);
  p.hline(2, 13, 8, P.soil1);
  const cols = [P.flowerP, P.flowerY, P.flowerW, P.flowerV, P.flowerR];
  for (let i = 0; i < 6; i++) {
    const x = 2 + i * 2;
    const h = 2 + (i % 3);
    p.vline(x, 8 - h, 7, P.leaf2);
    p.px(x, 7 - h, cols[i % cols.length]);
    p.px(x + 1, 7 - h, cols[(i + 2) % cols.length]);
    p.px(x, 6 - h, cols[i % cols.length]);
  }
};

const lamp: Draw = (p, lit) => {
  p.rect(5, 13, 6, 3, P.stone1);
  p.hline(5, 10, 13, P.stone2);
  p.rect(7, -8, 2, 21, P.wood0);
  p.vline(7, -8, 12, P.wood1);
  p.rect(5, -14, 6, 7, P.wood0);
  p.rect(6, -13, 4, 5, lit ? P.glassLit : P.glass);
  if (lit) p.rect(6, -13, 2, 2, P.glassLit2);
  p.hline(4, 11, -15, P.wood1);
  p.px(7, -16, P.wood0);
};

const bench: Draw = (p) => {
  p.rect(2, 1, 28, 3, P.wood2);
  p.hline(2, 29, 1, P.wood3);
  p.rect(2, 6, 28, 3, P.wood3);
  p.hline(2, 29, 6, P.wood4);
  p.hline(2, 29, 8, P.wood1);
  for (const x of [3, 27]) {
    p.rect(x, 4, 2, 2, P.wood1);
    p.rect(x, 9, 2, 5, P.wood0);
  }
};

/** Stone windmill tower (2x2). Sails are separate, animated sprites. */
const mill: Draw = (p, lit) => {
  // Tapered stone tower, lit from the left.
  for (let y = -8; y <= 31; y++) {
    const f = (y + 8) / 39;
    const half = 8 + f * 5;
    for (let x = Math.round(16 - half); x <= Math.round(15 + half); x++) {
      const rel = (x - 16 + 0.5) / half;
      const brick = (y % 4 === 0) || ((x + (Math.floor(y / 4) % 2) * 3) % 6 === 0);
      let c: string = rel < -0.45 ? P.stone3 : rel < 0.4 ? P.stone2 : P.stone1;
      if (brick) c = rel < 0.4 ? P.stone1 : P.stone0;
      p.px(x, y, c);
    }
  }
  p.hline(3, 28, 31, P.stone0);
  // Wooden cap
  for (let y = -18; y <= -7; y++) {
    const half = 3 + ((y + 18) / 11) * 8;
    for (let x = Math.round(16 - half); x <= Math.round(15 + half); x++) {
      const rel = (x - 16 + 0.5) / half;
      p.px(x, y, (y + 18) % 3 === 2 ? P.wood1 : rel < -0.3 ? P.wood3 : rel < 0.45 ? P.wood2 : P.wood1);
    }
  }
  p.hline(5, 26, -7, P.wood0);
  // Door, window, flour sacks
  p.rect(13, 22, 6, 10, P.wood0);
  p.rect(14, 23, 4, 9, P.wood2);
  p.vline(16, 23, 31, P.wood1);
  windowAt(p, 13, 6, 6, 6, lit);
  p.rect(22, 26, 5, 5, P.wall2);
  p.hline(22, 26, 26, P.wall1);
  p.rect(5, 27, 4, 4, P.wall2);
  p.px(6, 27, P.wall1);
};

const bakery: Draw = (p, lit) => {
  // Warm brick walls
  for (let y = 10; y < 32; y++) {
    for (let x = 1; x < 47; x++) {
      const mortar = y % 3 === 0 || (x + ((y / 3) | 0) % 2 * 2) % 5 === 0;
      p.px(x, y, mortar ? P.wall1 : x < 5 ? P.roof3 : y > 27 ? P.roof0 : P.roof1);
    }
  }
  p.rect(1, 29, 46, 3, P.stone1);
  p.hline(1, 46, 29, P.stone2);
  // Oven chimney
  p.rect(35, -16, 6, 16, P.stone2);
  p.vline(40, -16, -1, P.stone1);
  p.hline(35, 40, -16, P.stone0);
  if (lit) p.hline(36, 39, -15, P.fire2);
  shingles(p, -1, 48, -9, 11, SLATE, 3);
  p.hline(0, 47, 12, P.wood0);
  // Striped awning over the shop window
  for (let x = 4; x < 25; x++) {
    const c = Math.floor((x - 4) / 3) % 2 ? P.wall2 : P.flowerY;
    p.vline(x, 14, 17, c);
    if ((x - 4) % 3 !== 1) p.px(x, 18, c);
  }
  p.hline(4, 24, 14, P.wood1);
  // Shop window with loaves
  p.rect(5, 19, 19, 8, P.wood0);
  p.rect(6, 20, 17, 6, lit ? P.glassLit : P.glass);
  for (let i = 0; i < 4; i++) {
    p.rect(7 + i * 4, 23, 3, 2, P.wood3);
    p.px(8 + i * 4, 23, P.wood4);
  }
  // Door and bread sign
  p.rect(29, 18, 7, 14, P.wood0);
  p.rect(30, 19, 5, 13, P.wood2);
  p.px(34, 25, P.fire2);
  p.rect(38, 15, 7, 5, P.wood3);
  p.ellipse(41.5, 17.5, 2.6, 1.4, P.wood4);
  p.hline(40, 43, 17, P.wood2);
  // Oven glow by the side at night
  if (lit) p.rect(39, 24, 5, 4, P.fire1);
  else p.rect(39, 24, 5, 4, P.stone0);
  p.hline(38, 44, 23, P.stone2);
};

const cottage: Draw = (p, lit) => {
  p.rect(1, 12, 46, 20, P.wall2);
  p.rect(1, 12, 3, 17, '#fbf1d6');
  for (const x of [1, 16, 31, 46]) p.vline(x, 12, 28, P.wood1);
  p.hline(1, 46, 20, P.wood1);
  for (let i = 0; i < 4; i++) {
    p.px(2 + i * 3, 21 + i, P.wood1);
    p.px(44 - i * 3, 21 + i, P.wood1);
  }
  p.rect(1, 28, 46, 4, P.stone1);
  p.hline(1, 46, 28, P.stone2);
  p.rect(36, -14, 5, 12, P.stone2);
  p.hline(36, 40, -14, P.stone0);
  shingles(p, -1, 48, -9, 13, SLATE, 3);
  p.hline(0, 47, 14, P.wall0);
  // Blue door, two windows with flower boxes
  p.rect(21, 18, 7, 14, P.wood0);
  p.rect(22, 19, 5, 13, P.slate2);
  p.vline(24, 19, 31, P.slate1);
  p.px(26, 25, P.fire2);
  p.hline(20, 28, 31, P.stone2);
  for (const x of [6, 34]) {
    windowAt(p, x, 17, 7, 6, lit);
    p.rect(x - 1, 23, 9, 2, P.wood1);
    for (let i = 0; i < 9; i += 2) p.px(x - 1 + i, 22, i % 4 ? P.flowerV : P.flowerR);
  }
};

/** A family home: plastered walls, a red roof, a porch swing and a row of washing. */
const familyHome: Draw = (p, lit) => {
  p.rect(1, 12, 46, 20, P.wall1);
  p.rect(1, 12, 3, 17, P.wall2);
  for (const x of [1, 24, 46]) p.vline(x, 12, 28, P.wood1);
  p.rect(1, 28, 46, 4, P.stone1);
  p.hline(1, 46, 28, P.stone2);
  for (let x = 3; x < 47; x += 6) p.px(x, 30, P.stone0);
  // Chimney, then the roof over it
  p.rect(8, -13, 5, 11, P.stone2);
  p.hline(8, 12, -13, P.stone0);
  p.vline(12, -13, -3, P.stone1);
  shingles(p, -1, 48, -8, 13, ROOF, 3);
  p.hline(0, 47, 14, P.wall0);
  // Door under a little porch roof
  p.rect(29, 18, 7, 14, P.wood0);
  p.rect(30, 19, 5, 13, P.wood2);
  p.vline(32, 19, 31, P.wood1);
  p.px(34, 25, P.fire2);
  p.rect(27, 15, 11, 2, P.roof2);
  p.hline(27, 37, 17, P.roof0);
  p.hline(28, 36, 31, P.stone2);
  // Windows with flower boxes
  for (const x of [6, 15]) {
    windowAt(p, x, 17, 6, 6, lit);
    p.rect(x - 1, 23, 8, 2, P.wood1);
    for (let i = 0; i < 8; i += 2) p.px(x - 1 + i, 22, i % 4 ? P.flowerY : P.flowerR);
  }
  // Porch swing and a line of washing to the right
  p.vline(40, 18, 23, P.wood0);
  p.vline(44, 18, 23, P.wood0);
  p.rect(39, 23, 7, 2, P.wood2);
  p.hline(39, 45, 25, P.wood0);
  p.hline(40, 46, 16, P.wood0);
};

/** A domed stone kiln with a glowing stoke hole and stacked logs. */
const charcoalKiln: Draw = (p, lit) => {
  p.ellipse(15, 18, 14, 12, P.stone1);
  p.ellipse(13, 15, 11, 9, P.stone2);
  p.ellipse(11, 12, 5, 4, P.stone3);
  for (let y = 8; y < 30; y += 4) p.hline(3, 27, y, P.stone0);
  p.rect(12, -2, 6, 6, P.stone1);
  p.hline(12, 17, -2, P.stone0);
  // Stoke hole
  p.rect(11, 20, 8, 9, P.cliff0);
  p.rect(12, 22, 6, 7, lit ? P.fire2 : P.fire0);
  p.rect(13, 24, 4, 5, lit ? '#fff3a8' : P.fire1);
  // Logs waiting to burn
  for (let i = 0; i < 3; i++) {
    p.rect(22, 24 - i * 3, 9, 3, P.wood2);
    p.px(30, 25 - i * 3, P.wood4);
  }
};

/** A stone furnace tower with a chimney, bellows and a glowing mouth. */
const smelter: Draw = (p, lit) => {
  p.rect(4, 2, 22, 30, P.stone1);
  p.rect(4, 2, 4, 28, P.stone2);
  for (let y = 6; y < 30; y += 5) p.hline(4, 25, y, P.stone0);
  for (let y = 6; y < 30; y += 10) for (let x = 9; x < 26; x += 8) p.vline(x, y, y + 4, P.stone0);
  p.rect(9, -18, 10, 20, P.stone2);
  p.rect(9, -18, 2, 20, P.stone3);
  p.hline(8, 19, -19, P.stone0);
  // Mouth
  p.rect(10, 20, 10, 12, P.cliff0);
  p.rect(11, 22, 8, 10, lit ? P.fire2 : P.fire0);
  p.rect(12, 25, 6, 7, P.fire1);
  p.px(14, 26, '#fff3a8');
  // Bellows and an ingot mould
  p.rect(27, 20, 5, 7, P.wood1);
  p.rect(27, 18, 5, 2, P.wood3);
  p.rect(0, 27, 4, 4, P.stone0);
  p.hline(0, 3, 27, '#b8622e');
};

/** An open timber smithy: hearth, anvil, a rack of tools. */
const forge: Draw = (p, lit) => {
  shingles(p, -1, 48, -6, 9, SLATE, 3);
  for (const x of [1, 46]) p.rect(x, 9, 2, 22, P.wood1);
  p.rect(3, 10, 42, 20, '#3f3444');
  // Hearth with glowing coals
  p.rect(4, 18, 14, 13, P.stone1);
  p.rect(6, 20, 10, 5, lit ? P.fire2 : P.fire0);
  p.hline(6, 15, 20, P.fire1);
  p.rect(8, -2, 5, 16, P.stone2);
  // Anvil on a stump
  p.rect(24, 26, 6, 5, P.wood2);
  p.rect(21, 22, 12, 4, P.stone0);
  p.rect(19, 22, 3, 2, P.stone0);
  p.hline(22, 32, 22, P.stone2);
  // Tool rack
  p.hline(34, 44, 13, P.wood2);
  for (const x of [36, 39, 42]) {
    p.vline(x, 13, 20, P.wood1);
    p.rect(x - 1, 20, 3, 2, P.stone2);
  }
  p.rect(34, 26, 10, 5, P.wood2);
  p.hline(34, 43, 26, P.wood3);
};

/** A two-storey inn with a hanging sign, lanterns and a bench. */
const inn: Draw = (p, lit) => {
  p.rect(1, 6, 46, 26, P.wall1);
  p.rect(1, 6, 3, 23, P.wall2);
  for (const x of [1, 16, 31, 46]) p.vline(x, 6, 28, P.wood1);
  p.hline(1, 46, 17, P.wood1);
  p.rect(1, 28, 46, 4, P.stone1);
  p.hline(1, 46, 28, P.stone2);
  p.rect(38, -18, 5, 12, P.stone2);
  p.hline(38, 42, -18, P.stone0);
  shingles(p, -1, 48, -12, 8, ROOF, 3);
  p.hline(0, 47, 8, P.wall0);
  for (const x of [5, 21, 36]) windowAt(p, x, 10, 6, 5, lit);
  windowAt(p, 5, 20, 6, 6, lit);
  windowAt(p, 36, 20, 6, 6, lit);
  // Double door and a hanging sign with a mug
  p.rect(19, 19, 10, 13, P.wood0);
  p.rect(20, 20, 8, 12, P.wood2);
  p.vline(24, 20, 31, P.wood0);
  p.hline(29, 36, 19, P.wood0);
  p.vline(35, 19, 21, P.wood0);
  p.rect(32, 21, 7, 6, P.wood3);
  p.rect(34, 22, 3, 4, P.fire2);
  p.px(37, 23, P.fire2);
  p.px(12, 20, lit ? P.fire2 : P.wood0);
};

/** A caravan depot: open cart shed, a waiting cart, crates and a hitching post. */
const depot: Draw = (p) => {
  shingles(p, -1, 48, -8, 9, SLATE, 3);
  for (const x of [1, 24, 46]) p.rect(x, 9, 2, 22, P.wood1);
  p.rect(3, 10, 43, 20, '#4a3b36');
  // Cart inside
  p.rect(6, 18, 16, 7, P.wood2);
  p.hline(6, 21, 18, P.wood3);
  p.ellipse(9, 27, 3, 3, P.wood0);
  p.ellipse(19, 27, 3, 3, P.wood0);
  p.px(9, 27, P.wood3);
  p.px(19, 27, P.wood3);
  p.hline(22, 27, 21, P.wood1);
  // Crates and sacks
  for (const [x, y] of [[28, 22], [34, 22], [31, 16]]) {
    p.rect(x, y, 6, 6, P.wood3);
    p.hline(x, x + 5, y, P.wood4);
    p.vline(x + 2, y, y + 5, P.wood1);
  }
  p.ellipse(42, 26, 3, 3, '#d8c28e');
};

/** The Royal Hall: dressed stone, a great door, tall windows and a banner tower. */
const royalHall: Draw = (p, lit) => {
  // Main hall
  p.rect(2, 6, 60, 42, P.stone2);
  p.rect(2, 6, 4, 40, P.stone3);
  for (let y = 10; y < 46; y += 6) p.hline(2, 61, y, P.stone1);
  for (let y = 10; y < 46; y += 12) for (let x = 8; x < 62; x += 10) p.vline(x, y, y + 5, P.stone1);
  p.rect(2, 44, 60, 4, P.stone0);
  shingles(p, 0, 63, -10, 8, SLATE, 4);
  p.hline(0, 63, 8, P.stone0);
  // Banner tower
  p.rect(46, -30, 12, 38, P.stone2);
  p.rect(46, -30, 3, 36, P.stone3);
  for (let x = 46; x < 58; x += 3) p.rect(x, -33, 2, 3, P.stone2);
  p.vline(52, -46, -33, P.wood1);
  p.rect(53, -46, 8, 5, P.flowerR);
  p.hline(53, 60, -42, P.roof0);
  windowAt(p, 49, -22, 6, 8, lit);
  // Tall windows and a great arched door
  for (const x of [8, 18, 38]) windowAt(p, x, 14, 6, 14, lit);
  p.rect(26, 26, 12, 22, P.stone0);
  p.rect(27, 24, 10, 2, P.stone0);
  p.rect(28, 27, 8, 21, P.wood1);
  p.vline(32, 27, 47, P.wood0);
  p.px(30, 38, P.fire2);
  p.px(34, 38, P.fire2);
  // Steps and two lanterns
  p.hline(24, 40, 47, P.stone3);
  for (const x of [21, 42]) {
    p.rect(x, 34, 2, 12, P.wood0);
    p.rect(x - 1, 31, 4, 4, lit ? P.fire2 : P.stone0);
  }
};

/** Barracks: a long stone bunkhouse with a drill yard fence and a pennant. */
const barracks: Draw = (p, lit) => {
  p.rect(1, 8, 46, 24, P.stone2);
  p.rect(1, 8, 3, 22, P.stone3);
  for (let y = 12; y < 30; y += 5) p.hline(1, 46, y, P.stone1);
  p.rect(1, 28, 46, 4, P.stone0);
  shingles(p, -1, 48, -6, 10, SLATE, 3);
  p.hline(0, 47, 10, P.stone0);
  for (const x of [6, 16, 32, 40]) windowAt(p, x, 15, 4, 6, lit);
  p.rect(22, 18, 6, 14, P.wood0);
  p.rect(23, 19, 4, 13, P.wood2);
  // Weapon rack and a pennant
  p.vline(44, -18, 8, P.wood1);
  p.rect(45, -18, 7, 4, P.flowerR);
  for (const x of [8, 12]) {
    for (let i = 0; i < 6; i++) p.px(x + i * 0.3, 24 - i, P.stone3);
  }
};

/** Archery range: straw butts with targets and a shooting line. */
const archeryRange: Draw = (p) => {
  p.rect(0, 20, 48, 12, '#b89f6a');
  p.hline(0, 47, 30, P.wood1);
  for (const x of [8, 24, 40]) {
    p.ellipse(x, 12, 6, 7, '#d8c28e');
    p.ellipse(x, 11, 4, 4, '#ffffff');
    p.ellipse(x, 11, 2.5, 2.5, P.flowerR);
    p.px(x, 11, P.fire2);
    p.vline(x - 3, 17, 22, P.wood0);
    p.vline(x + 3, 17, 22, P.wood0);
  }
  // Arrows stuck in the butts
  p.hline(9, 12, 10, P.wood2);
  p.hline(25, 28, 12, P.wood2);
};

/** Armory: squat stone store with shields on the wall. */
const armory: Draw = (p, lit) => {
  p.rect(1, 6, 30, 26, P.stone1);
  p.rect(1, 6, 3, 24, P.stone2);
  for (let y = 10; y < 30; y += 5) p.hline(1, 30, y, P.stone0);
  shingles(p, -1, 32, -8, 8, SLATE, 3);
  p.rect(12, 18, 8, 14, P.wood0);
  p.rect(13, 19, 6, 13, P.stone0);
  p.hline(13, 18, 24, P.stone3);
  for (const [x, c] of [[4, P.flowerR], [24, '#3a6ea5']] as const) {
    p.ellipse(x + 2, 15, 3, 4, c);
    p.px(x + 2, 14, P.fire2);
  }
  p.px(16, 26, lit ? P.fire2 : P.stone2);
};

/** Stable: timber stalls with half doors and a horse looking out. */
const stable: Draw = (p) => {
  shingles(p, -1, 48, -6, 9, ROOF, 3);
  p.rect(1, 9, 46, 23, P.wood2);
  for (let x = 1; x < 47; x += 4) p.vline(x, 9, 31, P.wood1);
  for (const x of [4, 16, 28, 40]) {
    p.rect(x, 16, 8, 16, '#3a2e28');
    p.rect(x, 24, 8, 8, P.wood3);
    p.hline(x, x + 7, 24, P.wood4);
  }
  // A horse's head over a door
  p.rect(18, 15, 4, 6, '#8a5a3a');
  p.rect(17, 14, 3, 3, '#8a5a3a');
  p.px(18, 15, P.outline);
  p.ellipse(44, 30, 3, 2, '#d8c28e');
};

/** Council Hall: columns, steps and a round window. */
const councilHall: Draw = (p, lit) => {
  p.rect(2, 10, 44, 22, P.wall2);
  for (let i = 0; i < 6; i++) p.hline(-1 + i, 48 - i, 4 + i, P.stone2);
  p.hline(4, 43, 3, P.stone3);
  for (const x of [5, 13, 33, 41]) {
    p.rect(x, 10, 3, 20, P.stone3);
    p.vline(x + 2, 10, 29, P.stone1);
  }
  p.ellipse(24, 17, 4, 4, P.stone1);
  p.ellipse(24, 17, 3, 3, lit ? P.fire2 : P.slate1);
  p.rect(20, 22, 8, 10, P.wood0);
  p.rect(21, 23, 6, 9, P.wood2);
  for (let i = 0; i < 3; i++) p.hline(1 + i * 2, 46 - i * 2, 30 + i, P.stone2);
};

/** Goods left by a caravan with nowhere to go. */
const crate: Draw = (p) => {
  p.rect(2, 4, 12, 10, P.wood3);
  p.hline(2, 13, 4, P.wood4);
  p.rect(2, 8, 12, 1, P.wood1);
  p.vline(4, 4, 13, P.wood1);
  p.vline(11, 4, 13, P.wood1);
};

/** A small covered cart with a pony, drawn along supply routes. */
export function makeCartSprite(): Sprite {
  const p = new Painter(30, 22, 0, 0);
  // Pony
  p.rect(21, 8, 7, 5, '#8a5a3a');
  p.rect(26, 5, 3, 5, '#8a5a3a');
  p.px(28, 6, P.outline);
  p.vline(22, 13, 16, '#6b4428');
  p.vline(26, 13, 16, '#6b4428');
  p.hline(20, 21, 10, P.wood1);
  // Cart with a canvas cover
  p.rect(3, 9, 17, 6, P.wood2);
  p.hline(3, 19, 9, P.wood3);
  p.ellipse(11, 7, 8, 5, '#e8dcc0');
  p.hline(4, 18, 9, '#c9b89a');
  p.ellipse(7, 16, 3, 3, P.wood0);
  p.ellipse(16, 16, 3, 3, P.wood0);
  p.px(7, 16, P.wood3);
  p.px(16, 16, P.wood3);
  p.outline();
  return p.sprite(15, 19);
}

/** Quarry pits: each stage cuts one more step into the rock. */
export function makeQuarrySprites(): Sprite[] {
  const out: Sprite[] = [];
  for (let stage = 0; stage < 4; stage++) {
    const p = new Painter(36, 40, 2, 6);
    p.rect(0, 0, 32, 32, P.rock1);
    for (let x = 0; x < 32; x += 3) p.px(x, (x * 7) % 32, P.rock2);
    // Terraced steps down into the pit
    for (let s = 0; s <= stage; s++) {
      const inset = 3 + s * 3;
      p.rect(inset, inset, 32 - inset * 2, 32 - inset * 2, [P.rock0, P.rock3, P.cliff1, P.cliff0][s]);
      p.hline(inset, 31 - inset, inset, P.rock2);
    }
    // Cut blocks and a lifting pole
    for (const [x, y] of [[24, 25], [27, 22], [22, 28]]) {
      p.rect(x, y, 4, 3, P.stone2);
      p.hline(x, x + 3, y, P.stone3);
    }
    p.vline(3, -4, 26, P.wood1);
    p.hline(3, 12, -4, P.wood1);
    p.vline(12, -4, 4 + stage * 3, '#c9b48a');
    p.outline();
    out.push(p.sprite(2, 6));
  }
  return out;
}

/** Mine entrances: a timber portal, then a winch (level 2), then a headframe with a lantern (level 3). */
export function makeMineSprites(): BuildingSprites[] {
  return [1, 2, 3].map((level) =>
    make(38, 56, 3, 24, (p, lit) => {
      // Spoil heap and rock around the portal
      p.ellipse(16, 24, 16, 9, P.rock1);
      p.ellipse(26, 27, 7, 4, P.rock3);
      for (let x = 2; x < 30; x += 4) p.px(x, 22 + (x % 5), P.rock2);
      // Dark opening framed in timber
      p.rect(8, 8, 16, 22, P.cliff0);
      p.rect(10, 11, 12, 19, '#171219');
      p.rect(8, 8, 3, 22, P.wood1);
      p.rect(21, 8, 3, 22, P.wood1);
      p.rect(6, 5, 20, 4, P.wood2);
      p.hline(6, 25, 5, P.wood3);
      // Rails and a cart
      p.vline(13, 22, 31, P.stone0);
      p.vline(18, 22, 31, P.stone0);
      p.rect(11, 25, 10, 5, P.wood2);
      p.hline(11, 20, 25, P.wood3);
      p.px(14, 24, '#b8622e');
      p.px(17, 24, P.stone2);
      if (level >= 2) {
        // Winch drum on a frame
        p.rect(26, 2, 2, 20, P.wood1);
        p.rect(24, 8, 8, 5, P.wood2);
        p.hline(24, 31, 10, '#c9b48a');
      }
      if (level >= 3) {
        // Headframe with a sheave wheel and lantern
        p.vline(4, -20, 6, P.wood1);
        p.vline(28, -20, 2, P.wood1);
        p.hline(4, 28, -20, P.wood2);
        p.ellipse(16, -20, 4, 4, P.stone0);
        p.ellipse(16, -20, 2, 2, P.wood2);
        p.rect(5, 12, 3, 4, lit ? P.fire2 : P.wood0);
      }
    }),
  );
}

/** The camp after reaching Village: a timber hall with a bell cupola and bunting. */
const villageHall: Draw = (p, lit) => {
  p.rect(3, 4, 42, 18, P.wall2);
  for (const x of [3, 14, 24, 34, 44]) p.vline(x, 4, 21, P.wood1);
  p.hline(3, 44, 12, P.wood1);
  p.rect(3, 20, 42, 3, P.stone1);
  shingles(p, 0, 47, -12, 5, ROOF, 3);
  // Bell cupola
  p.rect(20, -22, 8, 10, P.wood2);
  p.rect(21, -20, 6, 6, P.wood0);
  p.rect(22, -19, 4, 4, P.fire2);
  p.px(23, -18, '#fff3a8');
  for (let y = 0; y < 5; y++) p.hline(19 + y, 28 - y, -27 + y, P.roof2);
  // Double doors, windows
  p.rect(19, 10, 10, 12, P.wood0);
  p.rect(20, 11, 8, 11, P.wood2);
  p.vline(24, 11, 21, P.wood0);
  windowAt(p, 7, 8, 6, 6, lit);
  windowAt(p, 35, 8, 6, 6, lit);
  // Bunting across the front
  const flags = [P.roof2, P.flowerY, P.slate2, P.leaf3];
  for (let x = 2; x < 46; x += 4) {
    const c = flags[(x / 4) % 4 | 0];
    p.hline(x, x + 2, 5, c);
    p.px(x + 1, 6, c);
  }
  // Fire ring stays in front (flames drawn by the renderer)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.px(Math.round(24 + Math.cos(a) * 4), Math.round(28 + Math.sin(a) * 2), i % 2 ? P.stone1 : P.stone2);
  }
  p.hline(22, 26, 28, P.wood1);
  // Benches either side of the fire
  p.rect(8, 27, 9, 2, P.wood3);
  p.rect(31, 27, 9, 2, P.wood3);
  p.hline(8, 16, 29, P.wood0);
  p.hline(31, 39, 29, P.wood0);
};

/** Windmill sails in 8 rotation frames, anchored at the hub. */
export function makeMillSails(): Sprite[] {
  const frames: Sprite[] = [];
  const R = 17;
  for (let f = 0; f < 8; f++) {
    const p = new Painter(R * 2 + 5, R * 2 + 5, R + 2, R + 2);
    for (let blade = 0; blade < 4; blade++) {
      const a = (blade / 4) * Math.PI * 2 + (f / 8) * (Math.PI / 2);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const nx = -dy;
      const ny = dx;
      for (let t = 2; t <= R; t++) {
        const bx = dx * t;
        const by = dy * t;
        p.px(Math.round(bx), Math.round(by), P.wood1);
        if (t > 5) {
          for (let w = 1; w <= 3; w++) {
            const c = (t + w) % 4 === 0 ? P.wood2 : w === 3 ? P.canvas1 : P.canvas2;
            p.px(Math.round(bx + nx * w), Math.round(by + ny * w), c);
          }
        }
      }
    }
    p.rect(-1, -1, 3, 3, P.wood0);
    p.px(0, 0, P.wood3);
    p.outline();
    frames.push(p.sprite(R + 2, R + 2));
  }
  return frames;
}


/** Crenellations along a wall top: merlons 2px wide every 4px. */
function merlons(p: Painter, x0: number, x1: number, y: number, c: string): void {
  for (let x = x0; x <= x1 - 1; x += 4) p.rect(x, y - 3, 2, 3, c);
}

/** Town Hall, level 1: a long timber hall with a bell tower, double doors and banners. */
const townHall1: Draw = (p, lit) => {
  p.rect(2, 10, 60, 34, P.wall2);
  for (const x of [2, 12, 22, 42, 52, 61]) p.vline(x, 10, 43, P.wood1);
  p.hline(2, 61, 24, P.wood1);
  for (let i = 0; i < 8; i++) {
    p.px(3 + i, 11 + i, P.wood1);
    p.px(60 - i, 11 + i, P.wood1);
  }
  p.rect(2, 42, 60, 4, P.stone1);
  p.hline(2, 61, 45, P.stone0);
  shingles(p, -1, 64, -10, 11, ROOF, 4);
  // Bell tower
  p.rect(26, -30, 12, 22, P.wood2);
  p.rect(26, -30, 2, 20, P.wood3);
  p.rect(28, -27, 8, 8, P.wood0);
  p.ellipse(32, -22, 2.5, 3, P.fire2);
  p.px(32, -25, '#fff3a8');
  for (let y = 0; y < 8; y++) p.hline(31 - y, 32 + y, -38 + y, y > 5 ? P.roof1 : P.roof2);
  p.vline(32, -46, -39, P.wood1);
  p.rect(33, -46, 5, 3, P.flowerR);
  // Double doors under a porch
  p.rect(25, 26, 14, 20, P.wood0);
  p.rect(26, 27, 12, 19, P.wood2);
  p.vline(32, 27, 45, P.wood0);
  p.px(30, 36, P.stone3);
  p.px(34, 36, P.stone3);
  p.hline(23, 41, 25, P.roof1);
  for (const x of [6, 15, 45, 54]) windowAt(p, x, 28, 5, 7, lit);
  windowAt(p, 6, 13, 5, 6, lit);
  windowAt(p, 53, 13, 5, 6, lit);
  // Banners either side of the door
  for (const x of [19, 43]) {
    p.rect(x, 12, 3, 10, P.flowerR);
    p.px(x + 1, 22, P.flowerR);
    p.px(x + 1, 14, P.flowerY);
  }
  // Notice board and a water trough
  p.rect(46, 38, 8, 5, P.wood3);
  p.rect(47, 39, 6, 3, P.canvas2);
  p.rect(8, 40, 10, 4, P.wood1);
  p.hline(9, 16, 41, P.water2);
};

/** Keep, level 2: stone lower walls, a crenellated central tower and slate-roofed wings. */
const townHall2: Draw = (p, lit) => {
  // Wings
  p.rect(0, 12, 64, 34, P.stone2);
  p.rect(0, 12, 3, 32, P.stone3);
  for (let y = 16; y < 44; y += 5) p.hline(0, 63, y, P.stone1);
  for (let y = 16; y < 44; y += 10) for (let x = 6; x < 64; x += 9) p.vline(x, y, y + 4, P.stone1);
  p.rect(0, 43, 64, 4, P.stone0);
  shingles(p, -2, 22, -2, 13, SLATE, 3);
  shingles(p, 42, 66, -2, 13, SLATE, 3);
  // Central keep tower
  p.rect(20, -34, 24, 48, P.stone2);
  p.rect(20, -34, 3, 46, P.stone3);
  for (let y = -30; y < 12; y += 5) p.hline(20, 43, y, P.stone1);
  merlons(p, 20, 44, -34, P.stone2);
  p.hline(20, 43, -34, P.stone3);
  windowAt(p, 29, -26, 6, 9, lit);
  windowAt(p, 29, -8, 6, 8, lit);
  // Flag
  p.vline(32, -52, -38, P.wood1);
  p.rect(33, -52, 9, 6, P.flowerR);
  p.hline(33, 41, -49, P.flowerY);
  // Gate
  p.rect(25, 24, 14, 22, P.stone0);
  p.rect(26, 22, 12, 2, P.stone0);
  p.rect(27, 25, 10, 21, P.wood1);
  for (let x = 28; x < 37; x += 3) p.vline(x, 25, 45, P.wood0);
  for (const x of [5, 13, 48, 56]) windowAt(p, x, 22, 4, 7, lit);
  // Torches by the gate
  for (const x of [22, 41]) {
    p.rect(x, 30, 1, 6, P.wood0);
    p.rect(x - 1, 28, 3, 2, lit ? P.fire2 : P.stone0);
  }
};

/** Castle, level 3: a curtain wall with a gate, two towers with red cones and a tall keep. */
const townHall3: Draw = (p, lit) => {
  // The keep behind the wall
  p.rect(18, -46, 28, 60, P.stone2);
  p.rect(18, -46, 3, 58, P.stone3);
  for (let y = -42; y < 14; y += 5) p.hline(18, 45, y, P.stone1);
  merlons(p, 18, 46, -46, P.stone2);
  p.hline(18, 45, -46, P.stone3);
  windowAt(p, 29, -38, 6, 9, lit);
  windowAt(p, 22, -20, 4, 7, lit);
  windowAt(p, 38, -20, 4, 7, lit);
  p.vline(32, -66, -50, P.wood1);
  p.rect(33, -66, 11, 7, P.flowerR);
  p.rect(36, -64, 4, 3, P.flowerY);
  // Curtain wall
  p.rect(0, 16, 64, 31, P.stone2);
  for (let y = 20; y < 44; y += 5) p.hline(0, 63, y, P.stone1);
  for (let y = 20; y < 44; y += 10) for (let x = 4; x < 64; x += 8) p.vline(x, y, y + 4, P.stone1);
  merlons(p, 0, 64, 16, P.stone2);
  p.hline(0, 63, 16, P.stone3);
  p.rect(0, 44, 64, 3, P.stone0);
  // Corner towers with conical roofs
  for (const x0 of [0, 50]) {
    p.rect(x0, -8, 14, 55, P.stone2);
    p.rect(x0, -8, 3, 53, P.stone3);
    for (let y = -4; y < 44; y += 5) p.hline(x0, x0 + 13, y, P.stone1);
    for (let y = 0; y < 13; y++) {
      const inset = 6 - Math.floor(y / 2);
      p.hline(x0 + inset, x0 + 13 - inset, -21 + y, y > 10 ? P.roof1 : P.roof2);
    }
    p.vline(x0 + 6, -25, -22, P.wood1);
    windowAt(p, x0 + 5, 4, 4, 6, lit);
    windowAt(p, x0 + 5, 24, 4, 6, lit);
  }
  // Gatehouse with portcullis
  p.rect(24, 22, 16, 25, P.stone0);
  p.rect(25, 20, 14, 2, P.stone0);
  p.rect(26, 24, 12, 23, lit ? '#5a3a1a' : P.wood0);
  for (let x = 27; x < 38; x += 2) p.vline(x, 24, 46, P.stone1);
  for (let y = 27; y < 46; y += 3) p.hline(26, 37, y, P.stone1);
  merlons(p, 22, 42, 20, P.stone3);
  // Pennants on the wall
  for (const x of [16, 46]) {
    p.vline(x, 4, 16, P.wood1);
    p.rect(x + 1, 4, 4, 3, P.flowerR);
  }
};

/** The Town Hall at each level: hall, keep, castle. */
export function makeTownHallSprites(): BuildingSprites[] {
  return [make(68, 94, 2, 46, townHall1), make(68, 104, 2, 56, townHall2), make(68, 118, 2, 70, townHall3)];
}

export function makeVillageHall(): BuildingSprites {
  return make(52, 58, 2, 28, villageHall);
}

export function makeBuildingSprites(): Partial<Record<BuildingId, BuildingSprites>> {
  return {
    waystation: make(52, 58, 2, 28, villageHall),
    mill: make(40, 58, 4, 22, mill),
    bakery: make(54, 52, 3, 20, bakery),
    cottage: make(54, 50, 3, 17, cottage),
    familyHome: make(54, 50, 3, 17, familyHome),
    charcoalKiln: make(36, 50, 2, 16, charcoalKiln),
    inn: make(54, 58, 3, 22, inn),
    depot: make(54, 48, 3, 14, depot),
    crate: make(18, 20, 1, 4, crate),
    royalHall: make(70, 100, 3, 50, royalHall),
    barracks: make(54, 60, 3, 26, barracks),
    archeryRange: make(54, 40, 3, 6, archeryRange),
    armory: make(38, 46, 3, 14, armory),
    stable: make(54, 46, 3, 12, stable),
    councilHall: make(54, 42, 3, 8, councilHall),
    smelter: make(36, 58, 2, 24, smelter),
    forge: make(54, 46, 3, 12, forge),
    camp: make(52, 46, 2, 12, camp),
    travelCamp: make(52, 46, 2, 12, camp),
    house: make(36, 50, 2, 17, house),
    storehouse: make(54, 46, 3, 13, storehouse),
    workshop: make(54, 52, 3, 19, workshop),
    market: make(84, 84, 2, 18, market),
    flowerbed: make(18, 20, 1, 4, flowerbed),
    lamp: make(18, 34, 1, 17, lamp),
    bench: make(34, 18, 1, 3, bench),
  };
}

export type OrchardLook = 'young' | 'bare' | 'leafy' | 'fruit1' | 'fruit2' | 'fruit3' | 'winter' | 'autumn';

/**
 * An orchard of four small apple trees on a 2×2 plot, in each of its looks:
 * saplings while establishing, leafy, with a few to many apples, autumn-gold
 * and snowy bare branches in winter.
 */
export function makeOrchardSprites(): Record<OrchardLook, Sprite> {
  const spots = [[8, 13], [24, 11], [8, 28], [24, 27]];
  const build = (look: OrchardLook): Sprite => {
    const p = new Painter(38, 46, 3, 14);
    // Mown grass circles at each tree's foot
    for (const [x, y] of spots) p.ellipse(x, y + 1, 5, 2, P.grass1);
    for (const [x, y] of spots) {
      if (look === 'young') {
        p.vline(x, y - 9, y, P.wood2);
        p.vline(x + 2, y - 7, y, P.wood0);
        p.ellipse(x, y - 9, 3, 2, P.leaf3);
        p.px(x - 1, y - 10, P.leaf4);
        continue;
      }
      p.rect(x - 1, y - 6, 2, 7, P.wood1);
      p.vline(x, y - 6, y, P.wood0);
      if (look === 'winter' || look === 'bare') {
        for (let i = 0; i < 5; i++) {
          p.px(x - 1 - i, y - 7 - i, P.wood1);
          p.px(x + 1 + i, y - 7 - i, P.wood1);
        }
        p.vline(x, y - 13, y - 7, P.wood1);
        if (look === 'winter') {
          for (const [dx, dy] of [[-4, -12], [4, -12], [0, -14], [-2, -10], [3, -10]]) p.px(x + dx, y + dy, '#f4f8fb');
        }
        continue;
      }
      const autumn = look === 'autumn';
      p.ellipse(x, y - 10, 7, 6, autumn ? '#b0552a' : P.leaf1);
      p.ellipse(x - 1, y - 11, 6, 5, autumn ? '#d07a32' : P.leaf2);
      p.ellipse(x - 2, y - 12, 3, 3, autumn ? '#e3a340' : P.leaf3);
      p.px(x - 3, y - 14, autumn ? '#f2c65a' : P.leaf4);
      const n = look === 'fruit1' ? 2 : look === 'fruit2' ? 4 : look === 'fruit3' ? 6 : 0;
      const apples = [[-4, -9], [3, -12], [1, -7], [-2, -13], [5, -8], [-5, -12]];
      for (let i = 0; i < n; i++) {
        const [dx, dy] = apples[i];
        p.px(x + dx, y + dy, '#d23c34');
        p.px(x + dx + 1, y + dy, '#b02a28');
        p.px(x + dx, y + dy - 1, '#f07a62');
      }
    }
    p.outline();
    return p.sprite(3, 14);
  };
  const looks: OrchardLook[] = ['young', 'bare', 'leafy', 'fruit1', 'fruit2', 'fruit3', 'winter', 'autumn'];
  return Object.fromEntries(looks.map((l) => [l, build(l)])) as Record<OrchardLook, Sprite>;
}

/** Fence pieces by neighbour mask (1 = north, 2 = east, 4 = south, 8 = west). */
export function makeFenceSprites(): Sprite[] {
  const out: Sprite[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const p = new Painter(18, 22, 1, 5);
    if (mask & 2) {
      p.hline(8, 16, 4, P.wood3);
      p.hline(8, 16, 8, P.wood3);
      p.hline(8, 16, 5, P.wood1);
      p.hline(8, 16, 9, P.wood1);
    }
    if (mask & 8) {
      p.hline(-1, 7, 4, P.wood3);
      p.hline(-1, 7, 8, P.wood3);
      p.hline(-1, 7, 5, P.wood1);
      p.hline(-1, 7, 9, P.wood1);
    }
    if (mask & 1) p.rect(7, -5, 2, 6, P.wood2);
    if (mask & 4) p.rect(7, 10, 2, 7, P.wood2);
    p.rect(6, 0, 4, 13, P.wood2);
    p.vline(6, 0, 12, P.wood3);
    p.vline(9, 0, 12, P.wood1);
    p.hline(6, 9, 0, P.wood4);
    p.outline();
    out.push(p.sprite(1, 5));
  }
  return out;
}
