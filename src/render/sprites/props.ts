import { hash01 } from '../../game/core/rng';
import { P } from '../palette';
import { Painter, type Sprite } from '../pixel';

/**
 * Natural props. Anchors are the bottom-centre of the tile: (ax, ay) sits on
 * world (tx * 16 + 8, ty * 16 + 16). Trees come in two parts so the canopy can
 * sway while the trunk stays planted.
 */

export interface TreeSprite {
  trunk: Sprite;
  canopy: Sprite;
}

const LEAF = [P.leaf0, P.leaf1, P.leaf2, P.leaf3] as const;
const PINE = [P.pine0, P.pine1, P.pine2, P.pine3] as const;

export function makeOak(variant: number): TreeSprite {
  const W = 32;
  const H = 38;
  const cx = 16;
  const trunk = new Painter(W, H);
  trunk.rect(cx - 3, 25, 6, 10, P.wood1);
  trunk.vline(cx - 3, 25, 34, P.wood2);
  trunk.vline(cx - 2, 26, 33, P.wood2);
  trunk.vline(cx + 2, 25, 34, P.wood0);
  trunk.rect(cx - 5, 33, 10, 2, P.wood1);
  trunk.px(cx - 5, 33, P.wood0);
  trunk.px(cx + 4, 33, P.wood0);
  trunk.hline(cx - 5, cx + 4, 35, P.wood0);
  trunk.rect(cx - 3, 25, 6, 2, P.wood0); // canopy shade
  trunk.px(cx, 29, P.wood0);
  trunk.px(cx - 1, 30, P.wood0);
  trunk.outline();

  const canopy = new Painter(W, H);
  const s = variant * 97 + 11;
  const j = (n: number) => (hash01(variant, n, 51) - 0.5) * 3;
  canopy.blob(cx - 7 + j(1), 19 + j(2), 7, LEAF, s);
  canopy.blob(cx + 7 + j(3), 19 + j(4), 7, LEAF, s + 1);
  canopy.blob(cx + j(5), 15, 11, LEAF, s + 2);
  canopy.blob(cx - 3 + j(6), 8 + j(7) * 0.5, 7, LEAF, s + 3);
  canopy.blob(cx + 4 + j(8), 9 + j(9) * 0.5, 6, LEAF, s + 4);
  // A few bright leaf highlights on the lit side.
  for (let i = 0; i < 9; i++) {
    const x = Math.round(cx - 8 + hash01(i, variant, 3) * 12);
    const y = Math.round(5 + hash01(variant, i, 4) * 10);
    const d = canopy.ctx.getImageData(x, y, 1, 1).data;
    if (d[3] > 0) canopy.px(x, y, P.leaf4);
  }
  canopy.outline();
  return { trunk: trunk.sprite(cx, 36), canopy: canopy.sprite(cx, 36) };
}

export function makePine(variant: number): TreeSprite {
  const W = 26;
  const H = 40;
  const cx = 13;
  const trunk = new Painter(W, H);
  trunk.rect(cx - 2, 32, 4, 5, P.wood1);
  trunk.vline(cx - 2, 32, 36, P.wood2);
  trunk.vline(cx + 1, 32, 36, P.wood0);
  trunk.hline(cx - 3, cx + 2, 37, P.wood0);
  trunk.outline();

  const canopy = new Painter(W, H);
  const tiers = [
    { top: 2, bottom: 13, hw: 5 },
    { top: 7, bottom: 20, hw: 7.5 },
    { top: 13, bottom: 27, hw: 9.5 },
    { top: 19, bottom: 33, hw: 11 },
  ];
  for (const t of tiers) {
    for (let y = t.top; y <= t.bottom; y++) {
      const f = (y - t.top) / (t.bottom - t.top);
      const hw = Math.max(0.6, f * t.hw);
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw - 1); x++) {
        const rel = (x + 0.5 - cx) / (hw + 0.01);
        const n = (hash01(x, y, variant * 13 + 5) - 0.5) * 0.5;
        let tone: string;
        if (y >= t.bottom - 1) tone = rel < -0.2 ? PINE[1] : PINE[0];
        else if (rel + n < -0.35) tone = PINE[3];
        else if (rel + n < 0.15) tone = PINE[2];
        else if (rel + n < 0.6) tone = PINE[1];
        else tone = PINE[0];
        canopy.px(x, y, tone);
      }
    }
  }
  canopy.outline();
  return { trunk: trunk.sprite(cx, 38), canopy: canopy.sprite(cx, 38) };
}

export function makeBerryBush(berries: boolean, variant: number): Sprite {
  const p = new Painter(20, 18);
  const cx = 10;
  p.blob(cx - 4, 10, 4.5, LEAF, variant + 1);
  p.blob(cx + 4, 10, 4.5, LEAF, variant + 2);
  p.blob(cx, 8, 6.5, LEAF, variant + 3);
  if (berries) {
    for (let i = 0; i < 8; i++) {
      const x = Math.round(cx - 6 + hash01(i, variant, 77) * 12);
      const y = Math.round(4 + hash01(variant, i, 78) * 9);
      const d = p.ctx.getImageData(x, y, 1, 1).data;
      if (d[3] === 0) continue;
      p.px(x, y, P.berry);
      p.px(x, y + 1, P.berryDark);
      if (i % 3 === 0) p.px(x, y, '#ff9aa6');
    }
  }
  p.outline();
  return p.sprite(cx, 16);
}

export function makeRock(variant: number): Sprite {
  const p = new Painter(18, 14);
  const cx = 9;
  const tones = [P.stone0, P.stone1, P.stone2, P.stone3];
  for (let y = 2; y <= 12; y++) {
    for (let x = 2; x <= 15; x++) {
      const dx = (x + 0.5 - cx) / 7;
      const dy = (y + 0.5 - 8) / 5.2;
      const bump = hash01(x, 0, variant) * 0.12;
      if (dx * dx + dy * dy > 1 - bump) continue;
      const light = -(dx * 0.6 + dy * 0.9) + (hash01(x, y, variant + 3) - 0.5) * 0.3;
      p.px(x, y, light > 0.55 ? tones[3] : light > 0.05 ? tones[2] : light > -0.5 ? tones[1] : tones[0]);
    }
  }
  p.px(cx + 1, 6, P.stone0);
  p.px(cx + 2, 7, P.stone0);
  p.px(cx + 2, 8, P.stone0);
  p.outline();
  return p.sprite(cx, 13);
}

export function makeBoulder(variant: number): Sprite {
  const p = new Painter(24, 21);
  const cx = 12;
  const tones = [P.stone0, P.stone1, P.stone2, P.stone3];
  for (let y = 1; y <= 19; y++) {
    for (let x = 1; x <= 22; x++) {
      const dx = (x + 0.5 - cx) / 10.5;
      const dy = (y + 0.5 - 11) / 8.5;
      const bump = hash01(x >> 1, y >> 2, variant) * 0.14;
      if (dx * dx + dy * dy > 1 - bump) continue;
      const light = -(dx * 0.6 + dy * 0.9) + (hash01(x, y, variant + 7) - 0.5) * 0.3;
      p.px(x, y, light > 0.6 ? tones[3] : light > 0.05 ? tones[2] : light > -0.5 ? tones[1] : tones[0]);
    }
  }
  // Moss on the shaded top.
  for (let i = 0; i < 14; i++) {
    const x = Math.round(6 + hash01(i, variant, 5) * 9);
    const y = Math.round(4 + hash01(variant, i, 6) * 4);
    const d = p.ctx.getImageData(x, y, 1, 1).data;
    if (d[3] > 0) p.px(x, y, i % 3 ? P.leaf2 : P.leaf3);
  }
  p.vline(cx + 3, 9, 13, P.stone0);
  p.px(cx + 4, 14, P.stone0);
  p.outline();
  return p.sprite(cx, 20);
}

export function makeStump(): Sprite {
  const p = new Painter(16, 12);
  const cx = 8;
  // Root flare, a short rounded trunk, then the cut face with rings on top.
  p.ellipse(cx, 8.5, 6, 1.8, P.wood0);
  p.px(cx - 6, 9, P.wood1);
  p.px(cx + 5, 9, P.wood0);
  p.rect(cx - 4, 4, 8, 5, P.wood1);
  p.vline(cx - 4, 4, 8, P.wood2);
  p.vline(cx - 3, 5, 8, P.wood2);
  p.vline(cx + 3, 4, 8, P.wood0);
  p.ellipse(cx, 4, 4.4, 2, P.wood4);
  p.ellipse(cx, 4, 2.6, 1.1, P.wood3);
  p.px(cx, 4, P.wood2);
  p.px(cx + 2, 3, P.wood3);
  p.px(cx - 1, 7, P.wood0);
  p.outline();
  return p.sprite(cx, 11);
}

export function makeSapling(): Sprite {
  const p = new Painter(12, 15);
  const cx = 6;
  p.vline(cx, 6, 13, P.wood1);
  p.blob(cx - 2, 6, 2.6, LEAF, 4);
  p.blob(cx + 2, 4, 2.6, LEAF, 5);
  p.blob(cx + 1, 8, 2.2, LEAF, 6);
  p.outline();
  return p.sprite(cx, 14);
}
