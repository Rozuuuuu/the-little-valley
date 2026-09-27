import type { ResourceId } from '../../game/data/resources';
import type { ToolKind } from '../../game/sim/types';
import { P } from '../palette';
import { Painter, type Sprite } from '../pixel';

/** 12x12 outlined icons shared by the HUD and in-world overlays. */
function icon(draw: (p: Painter) => void): Sprite {
  const p = new Painter(12, 12, 1, 1);
  draw(p);
  p.outline();
  return p.sprite(6, 6);
}

export const RESOURCE_ICON_DRAW: Record<ResourceId, (p: Painter) => void> = {
  food: (p) => {
    p.ellipse(5, 6, 4, 3.6, P.berry);
    p.rect(2, 4, 2, 2, '#ff8a92');
    p.px(6, 9, P.berryDark);
    p.px(7, 8, P.berryDark);
    p.vline(5, 0, 2, P.wood1);
    p.rect(6, 1, 3, 1, P.leaf3);
    p.px(7, 0, P.leaf3);
  },
  wood: (p) => {
    p.rect(0, 3, 9, 5, P.wood2);
    p.hline(0, 8, 3, P.wood3);
    p.hline(0, 8, 7, P.wood1);
    p.ellipse(8.5, 5.5, 1.8, 2.6, P.wood4);
    p.px(8, 5, P.wood2);
    p.px(3, 5, P.wood1);
    p.px(5, 6, P.wood1);
  },
  stone: (p) => {
    p.ellipse(5, 6, 4.8, 3.6, P.stone2);
    p.rect(2, 3, 3, 2, P.stone3);
    p.hline(3, 8, 9, P.stone0);
    p.px(6, 5, P.stone0);
    p.px(7, 6, P.stone0);
  },
  planks: (p) => {
    p.rect(0, 1, 10, 3, P.wood3);
    p.hline(0, 9, 1, P.wood4);
    p.rect(0, 5, 10, 3, P.wood3);
    p.hline(0, 9, 5, P.wood4);
    p.hline(0, 9, 3, P.wood1);
    p.hline(0, 9, 7, P.wood1);
    p.px(2, 2, P.wood1);
    p.px(7, 6, P.wood1);
  },
  tools: (p) => {
    for (let i = 0; i < 7; i++) p.px(2 + i, 9 - i, P.wood2);
    for (let i = 0; i < 6; i++) p.px(3 + i, 9 - i, P.wood1);
    p.rect(5, 0, 5, 3, P.stone2);
    p.hline(5, 9, 0, P.stone3);
    p.px(9, 3, P.stone1);
  },
};

export function makeResourceIcons(): Record<ResourceId, Sprite> {
  const out = {} as Record<ResourceId, Sprite>;
  for (const [k, draw] of Object.entries(RESOURCE_ICON_DRAW)) out[k as ResourceId] = icon(draw);
  return out;
}

export type UiIconId = 'people' | 'house' | 'sun' | 'moon' | 'rain' | 'star' | 'storage' | 'idle' | 'hungry' | 'warn' | 'drop' | 'axe' | 'pick' | 'basket' | 'zzz' | 'heart';

export function makeUiIcons(): Record<UiIconId, Sprite> {
  const shirt = P.shirt[1];
  return {
    people: icon((p) => {
      p.ellipse(3, 2.5, 2, 2, P.skin[0]);
      p.rect(1, 5, 5, 5, P.shirt[0]);
      p.ellipse(7.5, 3.5, 1.8, 1.8, P.skin[1]);
      p.rect(6, 6, 4, 4, shirt);
    }),
    house: icon((p) => {
      p.rect(1, 5, 8, 5, P.wall2);
      for (let y = 0; y < 5; y++) p.hline(4 - y, 5 + y, y + 1, P.roof2);
      p.rect(4, 7, 2, 3, P.wood1);
    }),
    sun: icon((p) => {
      p.ellipse(5, 5, 3, 3, P.flowerY);
      p.rect(3, 3, 2, 2, '#fff3a8');
      for (const [x, y] of [[5, 0], [5, 10], [0, 5], [10, 5], [1, 1], [9, 1], [1, 9], [9, 9]]) p.px(x, y, P.fire2);
    }),
    moon: icon((p) => {
      p.ellipse(5, 5, 4, 4, '#f4ecc8');
      p.ellipse(7, 4, 3, 3, 'rgba(0,0,0,0)');
      p.ctx.clearRect(7, 1, 4, 6);
      p.px(3, 4, '#d8cfa8');
    }),
    rain: icon((p) => {
      p.ellipse(5, 3, 4.5, 2.6, '#cfdbe6');
      p.hline(2, 8, 5, '#a9b9c9');
      for (const x of [2, 5, 8]) p.vline(x, 7, 9, P.water3);
    }),
    star: icon((p) => {
      p.rect(4, 0, 2, 10, P.flowerY);
      p.rect(0, 4, 10, 2, P.flowerY);
      p.rect(2, 2, 6, 6, P.flowerY);
      p.px(4, 3, '#fff3a8');
    }),
    storage: icon((p) => {
      p.rect(0, 2, 10, 8, P.wood3);
      p.hline(0, 9, 2, P.wood4);
      p.hline(0, 9, 6, P.wood1);
      p.vline(5, 3, 9, P.wood1);
    }),
    idle: icon((p) => {
      p.ellipse(5, 5, 5, 5, '#fff8e8');
      p.hline(4, 6, 2, P.outline);
      p.px(7, 3, P.outline);
      p.px(6, 4, P.outline);
      p.px(5, 5, P.outline);
      p.px(5, 7, P.outline);
    }),
    hungry: icon((p) => {
      p.ellipse(5, 5, 5, 5, '#fff8e8');
      p.ellipse(5, 5.5, 3, 2.5, P.berry);
      p.vline(5, 2, 3, P.wood1);
    }),
    warn: icon((p) => {
      for (let y = 0; y < 10; y++) p.hline(5 - y / 2, 5 + y / 2, y, P.uiWarn);
      p.vline(5, 3, 6, P.outline);
      p.px(5, 8, P.outline);
    }),
    drop: icon((p) => {
      for (let y = 0; y < 4; y++) p.hline(5 - y / 2, 5 + y / 2, y + 1, P.water3);
      p.ellipse(5, 6.5, 3, 3, P.water3);
      p.px(4, 6, '#ffffff');
    }),
    axe: icon((p) => {
      for (let i = 0; i < 8; i++) p.px(1 + i, 9 - i, P.wood2);
      p.rect(5, 0, 4, 4, P.stone2);
      p.px(8, 0, P.stone3);
    }),
    pick: icon((p) => {
      for (let i = 0; i < 8; i++) p.px(1 + i, 9 - i, P.wood2);
      p.hline(3, 9, 1, P.stone2);
      p.px(2, 2, P.stone2);
      p.px(9, 2, P.stone2);
    }),
    basket: icon((p) => {
      p.rect(1, 4, 8, 5, P.wood3);
      p.hline(1, 8, 6, P.wood1);
      p.hline(2, 7, 1, P.wood2);
      p.px(1, 2, P.wood2);
      p.px(8, 2, P.wood2);
      p.px(3, 3, P.berry);
      p.px(6, 3, P.berry);
    }),
    zzz: icon((p) => {
      p.hline(4, 8, 1, '#ffffff');
      p.px(7, 2, '#ffffff');
      p.px(6, 3, '#ffffff');
      p.px(5, 4, '#ffffff');
      p.hline(4, 8, 5, '#ffffff');
      p.hline(0, 2, 6, '#dfe8ff');
      p.px(1, 7, '#dfe8ff');
      p.hline(0, 2, 8, '#dfe8ff');
    }),
    heart: icon((p) => {
      p.rect(1, 2, 3, 3, P.berry);
      p.rect(6, 2, 3, 3, P.berry);
      for (let y = 0; y < 4; y++) p.hline(1 + y, 8 - y, 4 + y, P.berry);
      p.px(2, 2, '#ff9aa6');
    }),
  };
}

/** Tools held while working, drawn raised; the renderer rotates for the swing. */
export function makeToolSprites(): Record<ToolKind, Sprite> {
  const t = (draw: (p: Painter) => void) => {
    const p = new Painter(12, 12, 1, 1);
    draw(p);
    p.outline();
    // Anchor at the grip (lower-left).
    return p.sprite(2, 10);
  };
  const handle = (p: Painter) => {
    for (let i = 0; i < 8; i++) p.px(1 + i, 9 - i, P.wood2);
  };
  return {
    axe: t((p) => {
      handle(p);
      p.rect(6, 0, 3, 4, P.stone2);
      p.px(8, 0, P.stone3);
      p.px(9, 1, P.stone3);
    }),
    pick: t((p) => {
      handle(p);
      p.hline(4, 9, 1, P.stone2);
      p.px(3, 2, P.stone2);
      p.px(10, 2, P.stone2);
    }),
    hoe: t((p) => {
      handle(p);
      p.rect(7, 0, 3, 2, P.stone1);
      p.px(9, 2, P.stone1);
    }),
    hammer: t((p) => {
      handle(p);
      p.rect(6, 0, 4, 3, P.stone1);
      p.hline(6, 9, 0, P.stone2);
    }),
    can: t((p) => {
      p.rect(1, 4, 6, 5, P.slate2);
      p.hline(1, 6, 4, P.slate3);
      for (let i = 0; i < 3; i++) p.px(7 + i, 5 - i, P.slate1);
      p.hline(2, 5, 2, P.slate1);
    }),
    sickle: t((p) => {
      p.vline(2, 5, 9, P.wood2);
      p.hline(3, 7, 3, P.stone3);
      p.px(8, 4, P.stone3);
      p.px(8, 5, P.stone2);
      p.px(2, 4, P.stone2);
    }),
    saw: t((p) => {
      p.rect(1, 6, 3, 3, P.wood2);
      p.rect(3, 4, 7, 3, P.stone2);
      for (let x = 3; x < 10; x += 2) p.px(x, 7, P.stone1);
    }),
    hand: t(() => {}),
  };
}
