import type { SpeciesId } from '../../game/data/animals';
import { Painter, type Sprite } from '../pixel';

/**
 * Animals, drawn in code like everything else: side views facing left, two
 * walking frames each (the renderer mirrors them to face right). The anchor sits
 * between the feet on the ground, so they sort and shadow like settlers.
 */

interface Quad {
  /** Body length and height (pixels). */
  len: number;
  body: number;
  leg: number;
  fur: string;
  dark: string;
  belly: string;
  /** Head drawn at the front (left) end. */
  head: (p: Painter, x: number, y: number) => void;
  /** Tail at the back (right) end. */
  tail?: (p: Painter, x: number, y: number) => void;
  /** Anything drawn over the body (spots, wool, a hump). */
  extra?: (p: Painter, x0: number, y0: number) => void;
}

function quad(q: Quad, frame: number): Sprite {
  const W = q.len + 14;
  const H = q.body + q.leg + 16;
  const p = new Painter(W, H, Math.floor(W / 2), H - 2);
  const x0 = -Math.floor(q.len / 2);
  const x1 = x0 + q.len - 1;
  const top = -q.leg - q.body;
  // Legs: front and back pairs step in turn.
  const legs = [x0 + 1, x0 + 3, x1 - 3, x1 - 1];
  legs.forEach((lx, i) => {
    const lift = (i % 2 === frame % 2) ? 1 : 0;
    p.rect(lx, -q.leg, 1, q.leg - lift, i % 2 ? q.dark : q.fur);
    p.px(lx, -1 - lift, q.dark);
  });
  // Body
  p.rect(x0, top, q.len, q.body, q.fur);
  p.hline(x0 + 1, x1 - 1, top + q.body - 1, q.belly);
  p.hline(x0 + 1, x1 - 1, top, q.dark === q.fur ? q.fur : lighten(q.fur));
  q.extra?.(p, x0, top);
  q.tail?.(p, x1 + 1, top + 1);
  q.head(p, x0, top);
  p.outline();
  return p.sprite(Math.floor(W / 2), H - 2);
}

function lighten(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.25));
  return `#${[f((v >> 16) & 255), f((v >> 8) & 255), f(v & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** A small bird (duck, chicken): round body, neck and bill, tiny feet. */
function bird(frame: number, o: { body: string; wing: string; head: string; bill: string; swims?: boolean; comb?: boolean }): Sprite {
  const p = new Painter(14, 14, 7, 12);
  if (!o.swims) {
    p.vline(-1 + (frame ? 1 : 0), -2, -1, '#d8902a');
    p.vline(2 - (frame ? 1 : 0), -2, -1, '#d8902a');
  } else {
    // Ripples around a swimming bird.
    p.hline(-5, 5, 0, frame ? '#8fc9e0' : '#6fb0d6');
  }
  p.ellipse(1, -4, 4, 2.8, o.body);
  p.hline(-1, 3, -4, o.wing);
  p.hline(0, 3, -3, o.wing);
  p.rect(-3, -8, 3, 4, o.head);
  p.rect(-5, -7, 2, 1, o.bill);
  p.px(-2, -7, '#1a1420');
  if (o.comb) p.rect(-2, -9, 2, 1, '#d8384a');
  p.px(5, -5, o.wing);
  p.outline();
  return p.sprite(7, 12);
}

function rabbitLike(frame: number, fur: string, dark: string, earLen: number): Sprite {
  const p = new Painter(14, 14, 7, 12);
  const hop = frame ? 1 : 0;
  p.ellipse(1, -3 - hop, 3.4, 2.4, fur);
  p.px(4, -4 - hop, '#f4f0e6');
  p.rect(-3, -5 - hop, 3, 3, fur);
  p.vline(-2, -5 - hop - earLen, -6 - hop, dark);
  p.vline(-1, -5 - hop - earLen + 1, -6 - hop, fur);
  p.px(-3, -4 - hop, '#1a1420');
  p.rect(-2, -1 - hop, 2, 1, dark);
  p.rect(2, -1, 2, 1, dark);
  p.outline();
  return p.sprite(7, 12);
}

const DRAW: Record<SpeciesId, (frame: number) => Sprite> = {
  rabbit: (f) => rabbitLike(f, '#a88a6a', '#7a6048', 3),
  hare: (f) => rabbitLike(f, '#9a7a52', '#6a5238', 4),
  duck: (f) => bird(f, { body: '#8a6a4a', wing: '#6a4e36', head: '#2f7a4a', bill: '#e0b030', swims: true }),
  chicken: (f) => bird(f, { body: '#f2ede2', wing: '#d8d0c0', head: '#f2ede2', bill: '#e0a030', comb: true }),
  fox: (f) => quad({
    len: 8, body: 3, leg: 3, fur: '#d0702a', dark: '#9a4a1a', belly: '#f2e4d0',
    head: (p, x, y) => {
      p.rect(x - 3, y - 1, 3, 3, '#d0702a');
      p.rect(x - 4, y + 1, 1, 1, '#f2e4d0');
      p.px(x - 2, y - 2, '#9a4a1a');
      p.px(x - 3, y, '#1a1420');
    },
    tail: (p, x, y) => {
      p.rect(x, y, 3, 2, '#d0702a');
      p.px(x + 3, y, '#f2e4d0');
    },
  }, f),
  beaver: (f) => quad({
    len: 7, body: 3, leg: 1, fur: '#7a5030', dark: '#5a381e', belly: '#8a6040',
    head: (p, x, y) => {
      p.rect(x - 2, y, 3, 3, '#7a5030');
      p.px(x - 2, y + 1, '#1a1420');
      p.px(x - 2, y + 2, '#f2ede2');
    },
    tail: (p, x, y) => p.rect(x, y + 1, 3, 2, '#3a2a20'),
  }, f),
  deer: (f) => quad({
    len: 10, body: 4, leg: 5, fur: '#a8703a', dark: '#7a4e28', belly: '#e8d4b0',
    extra: (p, x0, y0) => {
      p.px(x0 + 4, y0 + 1, '#e8d4b0');
      p.px(x0 + 7, y0 + 2, '#e8d4b0');
    },
    head: (p, x, y) => {
      p.rect(x - 1, y - 4, 2, 5, '#a8703a');
      p.rect(x - 4, y - 5, 4, 3, '#a8703a');
      p.px(x - 4, y - 4, '#1a1420');
      p.px(x - 2, y - 4, '#1a1420');
      // Small antlers.
      p.vline(x - 1, y - 8, y - 6, '#d8c090');
      p.px(x, y - 8, '#d8c090');
      p.px(x - 2, y - 7, '#d8c090');
    },
    tail: (p, x, y) => p.px(x, y, '#f4f0e6'),
  }, f),
  boar: (f) => quad({
    len: 10, body: 5, leg: 2, fur: '#4a3a2e', dark: '#2e241c', belly: '#5a4838',
    extra: (p, x0, y0) => {
      for (let x = x0 + 2; x < x0 + 8; x += 2) p.px(x, y0 - 1, '#2e241c');
    },
    head: (p, x, y) => {
      p.rect(x - 3, y + 1, 3, 3, '#4a3a2e');
      p.rect(x - 4, y + 2, 1, 2, '#6a5040');
      p.px(x - 3, y + 4, '#f2ede2');
      p.px(x - 2, y + 1, '#d0302a');
    },
    tail: (p, x, y) => p.px(x, y + 1, '#2e241c'),
  }, f),
  pig: (f) => quad({
    len: 10, body: 5, leg: 2, fur: '#f0b0b0', dark: '#d88a8a', belly: '#f8c8c8',
    head: (p, x, y) => {
      p.rect(x - 3, y + 1, 3, 3, '#f0b0b0');
      p.rect(x - 4, y + 2, 1, 2, '#e08a90');
      p.px(x - 2, y + 1, '#1a1420');
      p.px(x - 1, y, '#d88a8a');
    },
    tail: (p, x, y) => {
      p.px(x, y, '#d88a8a');
      p.px(x + 1, y - 1, '#d88a8a');
    },
  }, f),
  wolf: (f) => quad({
    len: 10, body: 4, leg: 4, fur: '#8a8a8e', dark: '#5a5a60', belly: '#c8c8cc',
    head: (p, x, y) => {
      p.rect(x - 3, y - 1, 3, 3, '#8a8a8e');
      p.rect(x - 5, y + 1, 2, 1, '#6a6a70');
      p.px(x - 2, y - 2, '#5a5a60');
      p.px(x - 1, y - 2, '#5a5a60');
      p.px(x - 3, y, '#e0c040');
    },
    tail: (p, x, y) => {
      p.rect(x, y + 1, 3, 1, '#8a8a8e');
      p.px(x + 3, y + 2, '#5a5a60');
    },
  }, f),
  ibex: (f) => quad({
    len: 9, body: 4, leg: 4, fur: '#b09878', dark: '#7a6650', belly: '#e0d4c0',
    head: (p, x, y) => {
      p.rect(x - 1, y - 3, 2, 4, '#b09878');
      p.rect(x - 3, y - 4, 3, 3, '#b09878');
      p.px(x - 3, y - 3, '#1a1420');
      // Great curved horns.
      for (let i = 0; i < 5; i++) p.px(x - 1 + Math.round(i * 0.7), y - 5 - i + Math.floor(i * i / 5), '#6a5a48');
      p.px(x - 3, y - 1, '#e0d4c0');
    },
    tail: (p, x, y) => p.px(x, y, '#7a6650'),
  }, f),
  sheep: (f) => quad({
    len: 10, body: 5, leg: 3, fur: '#efeae0', dark: '#3a3434', belly: '#e0dace',
    extra: (p, x0, y0) => {
      for (let x = x0; x < x0 + 10; x += 2) {
        p.px(x, y0 - 1, '#efeae0');
        p.px(x + 1, y0 + 2, '#d8d2c4');
      }
    },
    head: (p, x, y) => {
      p.rect(x - 3, y, 3, 3, '#3a3434');
      p.px(x - 1, y - 1, '#efeae0');
      p.px(x - 3, y + 1, '#f2ede2');
    },
  }, f),
  goat: (f) => quad({
    len: 9, body: 4, leg: 4, fur: '#d8ccb8', dark: '#8a7a64', belly: '#f0e8d8',
    head: (p, x, y) => {
      p.rect(x - 1, y - 3, 2, 4, '#d8ccb8');
      p.rect(x - 3, y - 3, 3, 3, '#d8ccb8');
      p.px(x - 3, y - 2, '#1a1420');
      p.vline(x - 1, y - 5, y - 4, '#6a5a48');
      p.vline(x - 3, y, y + 1, '#f2ede2');
    },
    tail: (p, x, y) => p.px(x, y - 1, '#d8ccb8'),
  }, f),
  cow: (f) => quad({
    len: 14, body: 6, leg: 4, fur: '#f2ede2', dark: '#3a3030', belly: '#e8e0d0',
    extra: (p, x0, y0) => {
      p.rect(x0 + 3, y0 + 1, 3, 3, '#3a3030');
      p.rect(x0 + 9, y0 + 2, 3, 2, '#3a3030');
      p.rect(x0 + 6, y0 + 5, 2, 1, '#f0b0b0');
    },
    head: (p, x, y) => {
      p.rect(x - 4, y, 4, 4, '#f2ede2');
      p.rect(x - 5, y + 2, 2, 2, '#f0b0b0');
      p.px(x - 3, y + 1, '#1a1420');
      p.px(x - 1, y - 1, '#d8c090');
      p.px(x - 4, y - 1, '#d8c090');
    },
    tail: (p, x, y) => p.vline(x, y, y + 4, '#3a3030'),
  }, f),
  horse: (f) => quad({
    len: 13, body: 5, leg: 6, fur: '#8a5a3a', dark: '#5a3822', belly: '#9a6a48',
    head: (p, x, y) => {
      p.rect(x - 1, y - 4, 3, 6, '#8a5a3a');
      p.rect(x - 4, y - 5, 4, 3, '#8a5a3a');
      p.px(x - 4, y - 4, '#5a3822');
      p.px(x - 2, y - 4, '#1a1420');
      p.vline(x + 1, y - 5, y + 1, '#3a2a20');
    },
    tail: (p, x, y) => p.vline(x, y, y + 5, '#3a2a20'),
  }, f),
  wildHorse: (f) => quad({
    len: 13, body: 5, leg: 6, fur: '#c09058', dark: '#7a5a38', belly: '#e0c8a0',
    head: (p, x, y) => {
      p.rect(x - 1, y - 4, 3, 6, '#c09058');
      p.rect(x - 4, y - 5, 4, 3, '#c09058');
      p.px(x - 4, y - 4, '#3a2a20');
      p.px(x - 2, y - 4, '#1a1420');
      p.vline(x + 1, y - 5, y + 1, '#3a2a20');
    },
    tail: (p, x, y) => p.vline(x, y, y + 5, '#3a2a20'),
  }, f),
  bison: (f) => quad({
    len: 14, body: 7, leg: 3, fur: '#5a4230', dark: '#3a2a1e', belly: '#4a3626',
    extra: (p, x0, y0) => {
      p.ellipse(x0 + 4, y0 - 1, 4, 2.5, '#4a3424');
      p.ellipse(x0 + 3, y0 + 3, 3, 3, '#6a4e36');
    },
    head: (p, x, y) => {
      p.rect(x - 4, y + 2, 4, 4, '#3a2a1e');
      p.px(x - 3, y + 3, '#1a1420');
      p.px(x - 1, y + 1, '#d8c090');
      p.px(x - 4, y + 1, '#d8c090');
    },
    tail: (p, x, y) => p.vline(x, y + 1, y + 3, '#3a2a1e'),
  }, f),
  moose: (f) => quad({
    len: 13, body: 6, leg: 6, fur: '#4a3628', dark: '#2e2218', belly: '#5a4434',
    head: (p, x, y) => {
      p.rect(x - 1, y - 2, 3, 4, '#4a3628');
      p.rect(x - 5, y - 2, 5, 3, '#4a3628');
      p.rect(x - 6, y - 1, 1, 2, '#3a2a20');
      p.px(x - 3, y - 2, '#1a1420');
      // Broad palmate antlers.
      p.rect(x - 2, y - 5, 5, 2, '#c8b084');
      p.px(x - 2, y - 6, '#c8b084');
      p.px(x, y - 6, '#c8b084');
      p.px(x + 2, y - 6, '#c8b084');
    },
    tail: (p, x, y) => p.px(x, y, '#2e2218'),
  }, f),
  bear: (f) => quad({
    len: 14, body: 7, leg: 4, fur: '#6a4a30', dark: '#4a3220', belly: '#5a3e28',
    extra: (p, x0, y0) => p.ellipse(x0 + 5, y0, 4, 2, '#7a5838'),
    head: (p, x, y) => {
      p.rect(x - 4, y + 1, 5, 4, '#6a4a30');
      p.rect(x - 5, y + 3, 2, 2, '#9a7a58');
      p.px(x - 5, y + 3, '#1a1420');
      p.px(x - 3, y + 2, '#1a1420');
      p.px(x - 1, y, '#6a4a30');
      p.px(x - 3, y, '#6a4a30');
    },
  }, f),
};

/** Two walking frames per species, facing left. */
export function makeAnimalSprites(): Record<SpeciesId, Sprite[]> {
  const out = {} as Record<SpeciesId, Sprite[]>;
  for (const [id, draw] of Object.entries(DRAW)) out[id as SpeciesId] = [draw(0), draw(1)];
  return out;
}
