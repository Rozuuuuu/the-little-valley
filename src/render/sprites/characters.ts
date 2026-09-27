import type { Appearance } from '../../game/sim/types';
import { P } from '../palette';
import { mirror, Painter, type Sprite } from '../pixel';

/**
 * Settlers are 8px-wide chibi figures on an 18x22 frame. Each appearance gets
 * its own generated sheet: 4 directions x 13 poses. Right-facing frames are
 * mirrored left-facing ones.
 */

export const FRAME = {
  idle: 0,
  walk: 2,
  carry: 6,
  work: 10,
  sleep: 12,
} as const;
export const FRAME_COUNT = 13;

type Arms = 'swing' | 'up' | 'forward';

interface Look {
  skin: string;
  skinShade: string;
  hair: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  style: number;
}

const SKIN_SHADE = ['#dcae84', '#c48c62', '#9a6242', '#613b28'];

function lookOf(a: Appearance): Look {
  return {
    skin: P.skin[a.skin % P.skin.length],
    skinShade: SKIN_SHADE[a.skin % SKIN_SHADE.length],
    hair: P.hair[a.hair % P.hair.length],
    shirt: P.shirt[a.shirt % P.shirt.length],
    shirtDark: P.shirtDark[a.shirt % P.shirtDark.length],
    pants: P.pants[a.pants % P.pants.length],
    style: a.hairStyle % 3,
  };
}

interface Pose {
  leg: number;
  bob: number;
  arms: Arms;
  closed?: boolean;
}

function drawFront(p: Painter, l: Look, pose: Pose, back: boolean): void {
  const b = pose.bob;
  // Legs
  const lUp = pose.leg === 1 ? 1 : 0;
  const rUp = pose.leg === 3 ? 1 : 0;
  p.rect(6, 13, 2, 3 - lUp, l.pants);
  p.rect(8, 13, 2, 3 - rUp, l.pants);
  p.hline(6, 7, 16 - lUp, P.shoe);
  p.hline(8, 9, 16 - rUp, P.shoe);
  // Torso
  p.rect(5, 8 + b, 6, 5, l.shirt);
  p.vline(10, 8 + b, 12 + b, l.shirtDark);
  p.hline(5, 10, 12 + b, l.shirtDark);
  // Arms
  if (pose.arms === 'up') {
    p.rect(4, 5 + b, 1, 4, l.shirt);
    p.rect(11, 5 + b, 1, 4, l.shirtDark);
    p.px(4, 4 + b, l.skin);
    p.px(11, 4 + b, l.skin);
  } else if (pose.arms === 'forward') {
    p.rect(4, 8 + b, 1, 2, l.shirt);
    p.rect(11, 8 + b, 1, 2, l.shirtDark);
    if (!back) {
      p.hline(5, 6, 10 + b, l.shirt);
      p.hline(9, 10, 10 + b, l.shirtDark);
      p.hline(6, 9, 11 + b, l.skin);
    }
  } else {
    const swing = pose.leg === 1 ? 1 : pose.leg === 3 ? -1 : 0;
    p.rect(4, 8 + b + swing, 1, 3, l.shirt);
    p.px(4, 11 + b + swing, l.skin);
    p.rect(11, 8 + b - swing, 1, 3, l.shirtDark);
    p.px(11, 11 + b - swing, l.skin);
  }
  // Head
  const hy = 1 + b;
  p.rect(5, hy + 2, 6, 5, l.skin);
  p.vline(10, hy + 3, hy + 6, l.skinShade);
  p.hline(5, 10, hy, l.hair);
  p.hline(5, 10, hy + 1, l.hair);
  if (back) {
    p.rect(5, hy + 2, 6, 4, l.hair);
    p.vline(4, hy + 1, hy + 4, l.hair);
    p.vline(11, hy + 1, hy + 4, l.hair);
    if (l.style === 1) p.rect(5, hy + 6, 6, 2, l.hair);
  } else {
    p.px(4, hy + 2, l.hair);
    p.px(5, hy + 2, l.hair);
    p.px(10, hy + 2, l.hair);
    p.px(11, hy + 2, l.hair);
    p.vline(4, hy + 1, hy + (l.style === 1 ? 7 : 4), l.hair);
    p.vline(11, hy + 1, hy + (l.style === 1 ? 7 : 4), l.hair);
    if (pose.closed) {
      p.px(6, hy + 4, l.skinShade);
      p.px(9, hy + 4, l.skinShade);
    } else {
      p.px(6, hy + 4, P.outline);
      p.px(9, hy + 4, P.outline);
    }
    p.px(5, hy + 5, P.blush);
    p.px(10, hy + 5, P.blush);
  }
  if (l.style === 2) {
    p.hline(7, 8, hy - 1, l.hair);
  }
}

function drawSide(p: Painter, l: Look, pose: Pose): void {
  const b = pose.bob;
  // Legs (facing left)
  if (pose.leg === 1) {
    p.rect(5, 13, 2, 3, l.pants);
    p.rect(9, 13, 2, 2, l.pants);
    p.hline(4, 6, 16, P.shoe);
    p.hline(9, 10, 15, P.shoe);
  } else if (pose.leg === 3) {
    p.rect(9, 13, 2, 3, l.pants);
    p.rect(5, 13, 2, 2, l.pants);
    p.hline(8, 10, 16, P.shoe);
    p.hline(4, 6, 15, P.shoe);
  } else {
    p.rect(7, 13, 2, 3, l.pants);
    p.hline(6, 8, 16, P.shoe);
  }
  p.rect(6, 8 + b, 4, 5, l.shirt);
  p.vline(9, 8 + b, 12 + b, l.shirtDark);
  p.hline(6, 9, 12 + b, l.shirtDark);
  // One visible arm
  if (pose.arms === 'up') {
    p.rect(6, 5 + b, 1, 4, l.shirt);
    p.px(6, 4 + b, l.skin);
  } else if (pose.arms === 'forward') {
    p.hline(4, 7, 9 + b, l.shirt);
    p.px(3, 9 + b, l.skin);
  } else {
    const swing = pose.leg === 1 ? -1 : pose.leg === 3 ? 1 : 0;
    p.rect(7 + swing, 8 + b, 2, 3, l.shirtDark);
    p.px(7 + swing, 11 + b, l.skin);
  }
  const hy = 1 + b;
  p.rect(5, hy + 2, 6, 5, l.skin);
  p.px(4, hy + 4, l.skin);
  p.hline(5, 10, hy, l.hair);
  p.hline(5, 11, hy + 1, l.hair);
  p.rect(8, hy + 2, 3, 3, l.hair);
  p.vline(11, hy + 1, hy + (l.style === 1 ? 7 : 4), l.hair);
  p.vline(10, hy + 5, hy + (l.style === 1 ? 7 : 5), l.hair);
  p.px(5, hy + 2, l.hair);
  p.px(6, hy + 4, pose.closed ? l.skinShade : P.outline);
  p.px(6, hy + 5, P.blush);
  if (l.style === 2) p.hline(9, 10, hy - 1, l.hair);
}

const POSES: Pose[] = [
  { leg: 0, bob: 0, arms: 'swing' },
  { leg: 0, bob: 1, arms: 'swing' },
  { leg: 0, bob: 0, arms: 'swing' },
  { leg: 1, bob: 1, arms: 'swing' },
  { leg: 2, bob: 0, arms: 'swing' },
  { leg: 3, bob: 1, arms: 'swing' },
  { leg: 0, bob: 0, arms: 'up' },
  { leg: 1, bob: 1, arms: 'up' },
  { leg: 2, bob: 0, arms: 'up' },
  { leg: 3, bob: 1, arms: 'up' },
  { leg: 0, bob: 0, arms: 'up' },
  { leg: 0, bob: 1, arms: 'forward' },
  { leg: 0, bob: 0, arms: 'swing', closed: true },
];

export const FW = 18;
export const FH = 22;
const AX = 9;
const AY = 20;

/** frames[facing][frame]; facing 0 down, 1 up, 2 left, 3 right. */
export type SettlerSheet = Sprite[][];

export function makeSettlerSheet(a: Appearance): SettlerSheet {
  const look = lookOf(a);
  const sheet: SettlerSheet = [[], [], [], []];
  for (const pose of POSES) {
    for (const dir of [0, 1, 2] as const) {
      const p = new Painter(FW, FH, 1, 3);
      if (dir === 2) drawSide(p, look, pose);
      else drawFront(p, look, pose, dir === 1);
      p.outline();
      sheet[dir].push(p.sprite(AX, AY));
      if (dir === 2) sheet[3].push({ canvas: mirror(p.canvas), ax: FW - AX, ay: AY, w: FW, h: FH });
    }
  }
  return sheet;
}

export function appearanceKey(a: Appearance): string {
  return `${a.skin}${a.hair}${a.hairStyle}${a.shirt}${a.pants}`;
}
