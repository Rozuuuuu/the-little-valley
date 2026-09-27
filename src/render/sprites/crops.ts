import { hash01 } from '../../game/core/rng';
import { CROPS, CROP_IDS, type CropDef, type CropId } from '../../game/data/crops';
import { P } from '../palette';
import { Painter, type Sprite } from '../pixel';

export type SoilState = 'wild' | 'tilled' | 'wet';

/** 16x16 field soil drawn on the ground layer under crops. */
export function makeSoil(state: SoilState): Sprite {
  const p = new Painter(16, 16);
  if (state === 'wild') {
    for (let i = 0; i < 10; i++) p.px(Math.floor(hash01(i, 1, 4) * 14) + 1, Math.floor(hash01(i, 2, 4) * 14) + 1, P.dirt1);
    for (let x = 1; x < 15; x += 2) {
      p.px(x, 1, P.canvas2);
      p.px(x, 14, P.canvas2);
    }
    for (let y = 1; y < 15; y += 2) {
      p.px(1, y, P.canvas2);
      p.px(14, y, P.canvas2);
    }
    for (const [x, y] of [[0, 0], [14, 0], [0, 13], [14, 13]]) {
      p.rect(x, y, 2, 3, P.wood2);
      p.px(x, y, P.wood3);
    }
    return p.sprite(0, 0);
  }
  const wet = state === 'wet';
  const base = wet ? P.soilWet2 : P.soil1;
  const dark = wet ? P.soilWet : P.soil0;
  const light = wet ? P.soil0 : P.soil2;
  p.rect(0, 0, 16, 16, base);
  for (let y = 0; y < 16; y++) {
    const r = y % 4;
    if (r === 3) p.hline(1, 14, y, dark);
    if (r === 0) p.hline(1, 14, y, light);
  }
  for (let i = 0; i < 6; i++) p.px(Math.floor(hash01(i, 3, wet ? 9 : 8) * 14) + 1, Math.floor(hash01(i, 4, 8) * 14) + 1, dark);
  p.hline(0, 15, 15, dark);
  p.vline(15, 0, 15, dark);
  p.hline(0, 15, 0, light);
  return p.sprite(0, 0);
}

type Plant = (p: Painter, x: number, y: number, a: CropDef['art'], seed: number) => void;

function seeds(p: Painter, x: number, y: number): void {
  p.px(x, y, P.soil0);
  p.px(x - 1, y - 1, P.wood4);
  p.px(x + 1, y, P.wood4);
}

function sprout(p: Painter, x: number, y: number, a: CropDef['art']): void {
  p.px(x, y, a.leafDark);
  p.px(x, y - 1, a.leaf);
  p.px(x - 1, y - 2, a.leaf);
  p.px(x + 1, y - 2, a.leaf);
}

const root: Plant[] = [
  (p, x, y) => seeds(p, x, y),
  (p, x, y, a) => sprout(p, x, y, a),
  (p, x, y, a) => {
    for (let dx = -2; dx <= 2; dx++) p.vline(x + dx, y - 3 + Math.abs(dx), y, Math.abs(dx) === 2 ? a.leafDark : a.leaf);
    p.px(x, y - 4, a.leaf);
    p.px(x - 1, y - 3, P.leaf4);
  },
  (p, x, y, a) => {
    p.rect(x - 1, y - 1, 3, 3, a.fruit);
    p.hline(x - 1, x + 1, y + 1, a.fruitDark);
    p.px(x - 1, y - 1, '#ffffff');
    for (let dx = -2; dx <= 2; dx++) p.vline(x + dx, y - 5 + Math.abs(dx), y - 2, Math.abs(dx) === 2 ? a.leafDark : a.leaf);
    p.px(x, y - 6, a.leaf);
  },
];

const grain: Plant[] = [
  (p, x, y) => seeds(p, x, y),
  (p, x, y, a) => {
    p.vline(x - 1, y - 2, y, a.leaf);
    p.vline(x + 1, y - 3, y, a.leaf);
    p.px(x, y, a.leafDark);
  },
  (p, x, y, a) => {
    for (const dx of [-2, 0, 2]) p.vline(x + dx, y - 6 + (dx === 0 ? 0 : 1), y, a.leaf);
    p.px(x - 1, y - 2, a.leafDark);
    p.px(x + 1, y - 3, a.leafDark);
  },
  (p, x, y, a, seed) => {
    for (const dx of [-2, 0, 2]) {
      const lean = hash01(x + dx, y, seed) > 0.5 ? 1 : 0;
      p.vline(x + dx, y - 5, y, '#c9a54a');
      p.rect(x + dx + lean - 0, y - 9, 1, 4, a.fruit);
      p.px(x + dx + lean, y - 9, '#fff0a8');
      p.px(x + dx + lean, y - 5, a.fruitDark);
    }
  },
];

const vine: Plant[] = [
  (p, x, y) => seeds(p, x, y),
  (p, x, y, a) => {
    sprout(p, x, y, a);
    p.px(x - 2, y - 2, a.leafDark);
    p.px(x + 2, y - 2, a.leafDark);
  },
  (p, x, y, a) => {
    p.hline(x - 5, x + 5, y, a.leafDark);
    for (const [dx, dy] of [[-4, -1], [0, -3], [4, -1]]) {
      p.rect(x + dx - 1, y + dy - 1, 3, 2, a.leaf);
      p.px(x + dx - 1, y + dy - 1, P.leaf4);
    }
    p.rect(x + 1, y - 1, 2, 2, P.leaf3);
  },
  (p, x, y, a) => {
    p.hline(x - 6, x + 6, y + 1, a.leafDark);
    p.rect(x - 5, y - 2, 3, 2, a.leaf);
    p.rect(x + 3, y - 2, 3, 2, a.leaf);
    p.rect(x - 3, y - 4, 7, 5, a.fruit);
    p.hline(x - 2, x + 2, y - 5, a.fruit);
    p.hline(x - 2, x + 2, y + 1, a.fruitDark);
    p.vline(x - 1, y - 4, y, a.fruitDark);
    p.vline(x + 1, y - 4, y, a.fruitDark);
    p.px(x - 2, y - 4, '#ffc08a');
    p.rect(x, y - 7, 1, 2, P.wood1);
  },
];

const STYLE: Record<CropDef['art']['style'], Plant[]> = { root, grain, vine };

/** crops[crop][stage] is a 16x16 overlay for one field tile. */
export function makeCropSprites(): Record<CropId, Sprite[]> {
  const out = {} as Record<CropId, Sprite[]>;
  for (const id of CROP_IDS) {
    const def = CROPS[id];
    const plants = STYLE[def.art.style];
    const spots = def.art.style === 'vine' ? [[8, 11]] : [[4, 7], [11, 7], [4, 14], [11, 14]];
    out[id] = plants.map((draw, stage) => {
      const p = new Painter(16, 16);
      spots.forEach(([x, y], i) => draw(p, x, y, def.art, i + stage * 7));
      if (stage >= 2) p.outline('#2e3a24');
      return p.sprite(0, 0);
    });
  }
  return out;
}
