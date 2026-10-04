/**
 * Animal art: every species side-on, facing right (the game mirrors it to face left), in two
 * frames (standing, mid-stride). Built from one parametric body (legs, body, neck and head, ears,
 * horns or antlers, tail) so all animals share a style and scale: small animals are about a third
 * of a tile long, large ones about a tile.
 */
import { M, outlineOf, P, SHADOW } from './palette';
import { blob, groundShadow, mix, rrect, shaded } from './svg-kit';

type Kind = 'quad' | 'hopper' | 'bird' | 'duck';

interface AnimalSpec {
  kind: Kind;
  /** Body half-length and half-height (art px). */
  len: number;
  h: number;
  leg: number;
  head: number;
  /** How high the head sits above the body's centre line. */
  neck: number;
  coat: string[];
  belly?: string;
  ears?: 'long' | 'point' | 'round' | 'droop';
  horns?: 'curl' | 'back' | 'short' | 'antler' | 'palmate';
  tail?: 'fluff' | 'bushy' | 'thin' | 'horse' | 'stub' | 'curly';
  mane?: string;
  tusks?: boolean;
  wool?: boolean;
  patches?: string;
  snout?: 'pig' | 'long' | 'blunt' | 'beak';
  /** A hump over the shoulders (bison). */
  hump?: boolean;
}

const tones = (dark: string, base: string, light: string) => [dark, base, light];
const BROWN = tones('#5a3d2b', '#8a5f3f', '#b5865c');
const DEER = tones('#6b4630', '#a8714a', '#d0a070');
const GREY = tones('#4f5354', '#7b8180', '#a9aea9');
const FOX = tones('#8a3f1e', '#cf6a2f', '#ee9b56');
const BOAR = tones('#3d2f28', '#5f4a3d', '#86705d');
const BEAR = tones('#3b281d', '#5b3d2a', '#7f5a3f');
const IBEX = tones('#7a6a55', '#a8957a', '#cbbb9d');
const BISON = tones('#3a2a20', '#5a4232', '#7c5d47');
const HORSE = tones('#5a3624', '#8c5a3a', '#b7845b');
const WILD_HORSE = tones('#6e5038', '#a17a55', '#c9a57c');
const BEAVER = tones('#4a3020', '#6e4a30', '#94694a');
const MOOSE = tones('#3a2a1f', '#5e4532', '#806349');
const RABBIT = tones('#7b6650', '#a8927a', '#cdb9a0');
const HARE = tones('#6f5a40', '#a08560', '#c6aa82');
const WHITE = tones('#b9b4a6', '#e6e1d3', '#fbf8ee');
const PINK = tones('#b77a77', '#e3a6a0', '#f6cbc4');
const GOAT = tones('#8b8173', '#c5bba8', '#e6decd');
const COW = tones('#a69d8d', '#e9e3d6', '#fbf8ef');
const DUCK = tones('#5a4a35', '#8a7454', '#b49a72');
const HORN = tones('#6b5a42', '#b8a27c', '#e2d3ae');
const ANTLER = tones('#6e5a40', '#b49a74', '#ddc9a0');

export const SPECIES_ART: Record<string, AnimalSpec> = {
  rabbit: { kind: 'hopper', len: 16, h: 12, leg: 6, head: 9, neck: 9, coat: RABBIT, belly: '#efe6d6', ears: 'long', tail: 'fluff' },
  hare: { kind: 'hopper', len: 19, h: 13, leg: 8, head: 9, neck: 11, coat: HARE, belly: '#e8dcc4', ears: 'long', tail: 'fluff' },
  deer: { kind: 'quad', len: 30, h: 15, leg: 30, head: 10, neck: 30, coat: DEER, belly: '#ecd9bd', ears: 'point', horns: 'antler', tail: 'stub', snout: 'long' },
  boar: { kind: 'quad', len: 30, h: 18, leg: 13, head: 13, neck: 2, coat: BOAR, ears: 'point', tusks: true, tail: 'thin', snout: 'pig', mane: '#2e231d' },
  fox: { kind: 'quad', len: 22, h: 10, leg: 14, head: 9, neck: 10, coat: FOX, belly: '#f4e6d0', ears: 'point', tail: 'bushy', snout: 'long' },
  wolf: { kind: 'quad', len: 30, h: 14, leg: 22, head: 11, neck: 14, coat: GREY, belly: '#d9d6cc', ears: 'point', tail: 'bushy', snout: 'long' },
  bear: { kind: 'quad', len: 44, h: 26, leg: 20, head: 17, neck: 8, coat: BEAR, ears: 'round', tail: 'stub', snout: 'blunt', hump: true },
  ibex: { kind: 'quad', len: 28, h: 15, leg: 24, head: 10, neck: 20, coat: IBEX, belly: '#e9dfca', ears: 'point', horns: 'back', tail: 'stub', snout: 'long' },
  bison: { kind: 'quad', len: 48, h: 26, leg: 22, head: 17, neck: 4, coat: BISON, ears: 'round', horns: 'short', tail: 'thin', snout: 'blunt', hump: true, mane: '#2d2018' },
  wildHorse: { kind: 'quad', len: 44, h: 19, leg: 36, head: 13, neck: 34, coat: WILD_HORSE, belly: '#e2cfae', ears: 'point', tail: 'horse', snout: 'long', mane: '#3a2a1e' },
  duck: { kind: 'duck', len: 14, h: 9, leg: 0, head: 7, neck: 12, coat: DUCK, snout: 'beak' },
  beaver: { kind: 'quad', len: 20, h: 12, leg: 6, head: 9, neck: 4, coat: BEAVER, ears: 'round', tail: 'stub', snout: 'blunt' },
  moose: { kind: 'quad', len: 46, h: 22, leg: 40, head: 15, neck: 26, coat: MOOSE, ears: 'droop', horns: 'palmate', tail: 'stub', snout: 'long', hump: true },
  chicken: { kind: 'bird', len: 11, h: 11, leg: 8, head: 7, neck: 14, coat: WHITE, snout: 'beak', tail: 'fluff' },
  pig: { kind: 'quad', len: 28, h: 17, leg: 10, head: 13, neck: 2, coat: PINK, ears: 'droop', tail: 'curly', snout: 'pig' },
  sheep: { kind: 'quad', len: 26, h: 18, leg: 14, head: 9, neck: 10, coat: WHITE, ears: 'droop', tail: 'stub', snout: 'blunt', wool: true },
  goat: { kind: 'quad', len: 24, h: 14, leg: 20, head: 9, neck: 16, coat: GOAT, ears: 'droop', horns: 'back', tail: 'stub', snout: 'long' },
  cow: { kind: 'quad', len: 44, h: 22, leg: 24, head: 15, neck: 10, coat: COW, ears: 'point', horns: 'short', tail: 'thin', snout: 'blunt', patches: '#3e3530' },
  horse: { kind: 'quad', len: 44, h: 19, leg: 36, head: 13, neck: 34, coat: HORSE, belly: '#d8bd96', ears: 'point', tail: 'horse', snout: 'long', mane: '#2e1d14' },
};

const ink = (c: string[]) => outlineOf(c);
const f = (n: number) => Math.round(n * 10) / 10;

function ellipse(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  return blob(cx, cy, rx, ry, seed, 0.02, 14);
}

function legs(s: AnimalSpec, bx: number, by: number, frame: number, far: boolean): string {
  const col = far ? mix(s.coat[0], '#000000', 0.15) : s.coat[0];
  const w = Math.max(4, s.len * 0.16);
  const top = by + s.h * 0.35;
  const xs = [bx + s.len * 0.55, bx - s.len * 0.6];
  let out = '';
  for (const [i, x] of xs.entries()) {
    const swing = frame === 1 ? (i === 0 ? 1 : -1) * (far ? -1 : 1) * s.leg * 0.22 : 0;
    const lx = x + (far ? -w * 0.6 : 0);
    out += `<path d="M${f(lx)},${f(top)} L${f(lx + swing)},${f(top + s.leg)}" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
    // Hooves and paws.
    out += `<circle cx="${f(lx + swing)}" cy="${f(top + s.leg)}" r="${f(w * 0.55)}" fill="${mix(col, '#1c1712', 0.5)}"/>`;
  }
  return out;
}

function quad(s: AnimalSpec, W: number, ground: number, frame: number, seed: number): string {
  const bx = W / 2 - s.head * 0.5;
  const by = ground - s.leg - s.h * 0.75;
  const c = s.coat;
  let o = groundShadow(bx + 4, ground + 1, s.len * 1.05, Math.max(5, s.h * 0.35), SHADOW);
  o += legs(s, bx, by, frame, true);
  // Tail at the back.
  const tx = bx - s.len * 0.95;
  const ty = by - s.h * 0.35;
  if (s.tail === 'bushy') o += shaded(blob(tx - s.len * 0.35, ty + s.h * 0.4, s.len * 0.42, s.h * 0.38, seed + 3, 0.08), { tones: c, outline: ink(c), shadow: 2, light: 2 }) + `<ellipse cx="${f(tx - s.len * 0.7)}" cy="${f(ty + s.h * 0.45)}" rx="${f(s.len * 0.12)}" ry="${f(s.h * 0.22)}" fill="${s.belly ?? c[2]}"/>`;
  else if (s.tail === 'horse') o += `<path d="M${f(tx + 4)},${f(ty)} q${f(-s.len * 0.3)},${f(s.h * 0.4)} ${f(-s.len * 0.2)},${f(s.h * 1.9)}" stroke="${s.mane ?? c[0]}" stroke-width="${f(s.len * 0.16)}" stroke-linecap="round" fill="none"/>`;
  else if (s.tail === 'thin') o += `<path d="M${f(tx + 2)},${f(ty)} q${f(-s.len * 0.15)},${f(s.h * 0.5)} ${f(-s.len * 0.08)},${f(s.h * 1.3)}" stroke="${c[0]}" stroke-width="3" fill="none"/><circle cx="${f(tx - s.len * 0.06)}" cy="${f(ty + s.h * 1.3)}" r="4" fill="${s.mane ?? c[0]}"/>`;
  else if (s.tail === 'curly') o += `<path d="M${f(tx + 2)},${f(ty + 2)} c-8,-6 -10,6 -4,6 c5,0 4,-7 -1,-5" stroke="${c[0]}" stroke-width="2.5" fill="none"/>`;
  else if (s.tail === 'stub') o += `<ellipse cx="${f(tx + 2)}" cy="${f(ty + 2)}" rx="${f(s.len * 0.1)}" ry="${f(s.h * 0.2)}" fill="${c[0]}"/>`;
  // Body.
  if (s.wool) {
    o += shaded(blob(bx, by, s.len * 1.02, s.h * 1.02, seed, 0.12, 16), { tones: c, outline: ink(c), shadow: 3, light: 4 });
    for (let i = 0; i < 6; i++) o += `<circle cx="${f(bx - s.len * 0.6 + i * s.len * 0.24)}" cy="${f(by - s.h * 0.5 + (i % 2) * 5)}" r="${f(s.h * 0.28)}" fill="${c[2]}" opacity="0.7"/>`;
  } else {
    o += shaded(ellipse(bx, by, s.len, s.h, seed), { tones: c, outline: ink(c), shadow: 3, light: 3 });
    if (s.belly) o += `<path d="M${f(bx - s.len * 0.6)},${f(by + s.h * 0.55)} Q${f(bx)},${f(by + s.h * 1.05)} ${f(bx + s.len * 0.6)},${f(by + s.h * 0.55)}" stroke="${s.belly}" stroke-width="${f(s.h * 0.35)}" stroke-linecap="round" fill="none" opacity="0.85"/>`;
  }
  if (s.patches) for (let i = 0; i < 3; i++) o += `<path d="${blob(bx - s.len * 0.4 + i * s.len * 0.4, by - s.h * 0.2 + (i % 2) * s.h * 0.4, s.len * 0.2, s.h * 0.3, seed + 10 + i, 0.25)}" fill="${s.patches}" opacity="0.85"/>`;
  if (s.hump) o += shaded(blob(bx + s.len * 0.35, by - s.h * 0.7, s.len * 0.45, s.h * 0.55, seed + 5, 0.08), { tones: c, outline: ink(c), shadow: 2, light: 2 });
  if (s.mane && (s.tail === 'horse' || s.hump || s.tusks)) {
    const mx = bx + s.len * 0.7;
    o += `<path d="M${f(mx - s.len * 0.25)},${f(by - s.h * 0.9)} Q${f(mx + s.len * 0.1)},${f(by - s.h - s.neck * 0.6)} ${f(mx + s.len * 0.3)},${f(by - s.h * 0.6 - s.neck)}" stroke="${s.mane}" stroke-width="${f(Math.max(5, s.len * 0.14))}" stroke-linecap="round" fill="none"/>`;
  }
  o += legs(s, bx, by, frame, false);
  // Neck and head.
  const hx = bx + s.len * 0.95 + s.head * 0.3;
  const hy = by - s.h * 0.3 - s.neck;
  if (s.neck > 6) o += `<path d="M${f(bx + s.len * 0.55)},${f(by - s.h * 0.2)} L${f(hx - s.head * 0.2)},${f(hy + s.head * 0.2)}" stroke="${c[1]}" stroke-width="${f(Math.max(7, s.head * 1.2))}" stroke-linecap="round"/>`;
  // Ears and horns behind the head.
  if (s.horns === 'antler' || s.horns === 'palmate') {
    const ax = hx - s.head * 0.2;
    const ay = hy - s.head * 0.7;
    if (s.horns === 'antler') o += `<path d="M${f(ax)},${f(ay)} l-6,-16 m3,8 l-8,-4 m11,-4 l2,-12 m-4,-2 l8,-6 M${f(ax + 4)},${f(ay)} l6,-15 m-3,7 l8,-4" stroke="${ANTLER[0]}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    else o += shaded(blob(ax - 6, ay - 12, 16, 8, seed + 7, 0.25), { tones: ANTLER, outline: ink(ANTLER), shadow: 2, light: 2 }) + shaded(blob(ax + 12, ay - 10, 14, 7, seed + 8, 0.25), { tones: ANTLER, outline: ink(ANTLER), shadow: 2, light: 2 });
  }
  if (s.horns === 'back' || s.horns === 'curl') o += `<path d="M${f(hx - 2)},${f(hy - s.head * 0.7)} q${f(-s.head * 1.6)},${f(-s.head * 1.2)} ${f(-s.head * 1.8)},${f(s.head * 0.4)}" stroke="${HORN[1]}" stroke-width="${f(Math.max(3, s.head * 0.35))}" stroke-linecap="round" fill="none"/>`;
  if (s.horns === 'short') o += `<path d="M${f(hx - s.head * 0.5)},${f(hy - s.head * 0.6)} q${f(-s.head * 0.5)},${f(-s.head * 0.7)} ${f(s.head * 0.2)},${f(-s.head * 0.9)} M${f(hx + s.head * 0.3)},${f(hy - s.head * 0.7)} q${f(s.head * 0.4)},${f(-s.head * 0.6)} ${f(s.head * 0.9)},${f(-s.head * 0.6)}" stroke="${HORN[2]}" stroke-width="${f(Math.max(3, s.head * 0.3))}" stroke-linecap="round" fill="none"/>`;
  if (s.ears === 'point' || s.ears === 'long') {
    const el = s.ears === 'long' ? s.head * 2.2 : s.head * 0.9;
    o += `<path d="M${f(hx - s.head * 0.5)},${f(hy - s.head * 0.5)} l${f(-s.head * 0.25)},${f(-el)} l${f(s.head * 0.65)},${f(el * 0.75)}Z" fill="${c[1]}" stroke="${ink(c)}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if (s.ears === 'round') o += `<circle cx="${f(hx - s.head * 0.45)}" cy="${f(hy - s.head * 0.8)}" r="${f(s.head * 0.32)}" fill="${c[1]}" stroke="${ink(c)}" stroke-width="2"/>`;
  // Head with its snout.
  o += shaded(ellipse(hx, hy, s.head * 1.05, s.head * 0.85, seed + 2), { tones: c, outline: ink(c), shadow: 2, light: 2 });
  const sx = hx + s.head * 0.9;
  const sy = hy + s.head * 0.25;
  if (s.snout === 'long') o += shaded(ellipse(sx, sy, s.head * 0.7, s.head * 0.45, seed + 4), { tones: c, outline: ink(c), shadow: 1, light: 1 }) + `<circle cx="${f(sx + s.head * 0.55)}" cy="${f(sy - 1)}" r="${f(Math.max(1.6, s.head * 0.13))}" fill="#1f1a16"/>`;
  else if (s.snout === 'pig') o += `<ellipse cx="${f(sx + 1)}" cy="${f(sy)}" rx="${f(s.head * 0.32)}" ry="${f(s.head * 0.42)}" fill="${mix(c[1], '#c06a6a', 0.35)}" stroke="${ink(c)}" stroke-width="2"/>`;
  else if (s.snout === 'blunt') o += `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(s.head * 0.45)}" ry="${f(s.head * 0.4)}" fill="${mix(c[0], '#2a201a', 0.3)}"/>`;
  if (s.tusks) o += `<path d="M${f(sx - 2)},${f(sy + s.head * 0.25)} q4,-2 3,-9" stroke="#efe6cf" stroke-width="3" stroke-linecap="round" fill="none"/>`;
  if (s.ears === 'droop') o += `<path d="M${f(hx - s.head * 0.2)},${f(hy - s.head * 0.6)} q${f(-s.head * 0.9)},${f(s.head * 0.1)} ${f(-s.head * 0.8)},${f(s.head * 0.9)}" stroke="${c[0]}" stroke-width="${f(Math.max(4, s.head * 0.45))}" stroke-linecap="round" fill="none"/>`;
  // Eye with a light catch.
  o += `<circle cx="${f(hx + s.head * 0.25)}" cy="${f(hy - s.head * 0.15)}" r="${f(Math.max(1.8, s.head * 0.16))}" fill="#1b1612"/><circle cx="${f(hx + s.head * 0.3)}" cy="${f(hy - s.head * 0.22)}" r="0.9" fill="${P.core.mint}"/>`;
  return o;
}

function hopper(s: AnimalSpec, W: number, ground: number, frame: number, seed: number): string {
  const c = s.coat;
  const bx = W / 2 - 4;
  const by = ground - s.h - (frame === 1 ? 5 : 0);
  let o = groundShadow(bx + 2, ground + 1, s.len, 5, SHADOW);
  // Back legs folded under, front paws.
  o += shaded(ellipse(bx - s.len * 0.45, by + s.h * 0.55, s.len * 0.55, s.h * 0.45, seed + 1), { tones: c, outline: ink(c), shadow: 1, light: 1 });
  o += `<path d="M${f(bx + s.len * 0.55)},${f(by + s.h * 0.4)} l${frame === 1 ? 5 : 1},${f(s.leg)}" stroke="${c[0]}" stroke-width="4" stroke-linecap="round"/>`;
  o += shaded(ellipse(bx, by, s.len, s.h, seed), { tones: c, outline: ink(c), shadow: 2, light: 2 });
  if (s.belly) o += `<ellipse cx="${f(bx + s.len * 0.2)}" cy="${f(by + s.h * 0.55)}" rx="${f(s.len * 0.5)}" ry="${f(s.h * 0.28)}" fill="${s.belly}" opacity="0.85"/>`;
  o += `<circle cx="${f(bx - s.len * 0.95)}" cy="${f(by - s.h * 0.1)}" r="${f(s.h * 0.38)}" fill="#f6f1e6" stroke="${ink(c)}" stroke-width="1.5"/>`;
  const hx = bx + s.len * 0.85;
  const hy = by - s.neck;
  for (const dx of [-3, 3]) o += `<path d="${rrect(hx - 4 + dx, hy - s.head * 2.6, 6, s.head * 2.2, 3)}" fill="${c[1]}" stroke="${ink(c)}" stroke-width="1.5" transform="rotate(${-12 + dx * 2},${f(hx)},${f(hy)})"/>`;
  o += shaded(ellipse(hx, hy, s.head, s.head * 0.85, seed + 2), { tones: c, outline: ink(c), shadow: 1, light: 1 });
  o += `<circle cx="${f(hx + s.head * 0.35)}" cy="${f(hy - 1)}" r="1.8" fill="#1b1612"/><circle cx="${f(hx + s.head * 0.95)}" cy="${f(hy + 2)}" r="1.4" fill="#7a4a4a"/>`;
  return o;
}

function bird(s: AnimalSpec, W: number, ground: number, frame: number, seed: number): string {
  const c = s.coat;
  const bx = W / 2 - 2;
  const by = ground - s.leg - s.h;
  let o = groundShadow(bx + 2, ground + 1, s.len + 3, 4, SHADOW);
  for (const [i, dx] of [-3, 3].entries()) o += `<path d="M${f(bx + dx)},${f(by + s.h * 0.8)} l${frame === 1 ? (i ? 3 : -3) : 0},${f(s.leg)}" stroke="${P.core.goldDeep}" stroke-width="2.5" stroke-linecap="round"/>`;
  // Tail feathers, body, wing.
  o += `<path d="M${f(bx - s.len * 0.7)},${f(by - 2)} q-10,-14 -4,-18 q4,8 10,10Z" fill="${c[1]}" stroke="${ink(c)}" stroke-width="1.5"/>`;
  o += shaded(ellipse(bx, by, s.len * 1.05, s.h, seed), { tones: c, outline: ink(c), shadow: 2, light: 2 });
  o += `<path d="${blob(bx - 2, by + 1, s.len * 0.6, s.h * 0.5, seed + 3, 0.1)}" fill="${c[0]}" opacity="0.5"/>`;
  const hx = bx + s.len * 0.7;
  const hy = by - s.neck;
  o += shaded(ellipse(hx, hy, s.head, s.head, seed + 2), { tones: c, outline: ink(c), shadow: 1, light: 1 });
  o += `<path d="M${f(hx - 4)},${f(hy - s.head)} q2,-7 5,-2 q3,-6 5,1Z" fill="#c8483e"/>`;
  o += `<path d="M${f(hx + s.head * 0.8)},${f(hy - 1)} l6,2 l-6,2Z" fill="${P.core.gold}"/><path d="M${f(hx + 2)},${f(hy + s.head * 0.6)} q2,5 -1,6" stroke="#c8483e" stroke-width="2.5" fill="none"/>`;
  o += `<circle cx="${f(hx + 2)}" cy="${f(hy - 2)}" r="1.5" fill="#1b1612"/>`;
  return o;
}

function duck(s: AnimalSpec, W: number, ground: number, frame: number, seed: number): string {
  const c = s.coat;
  const bx = W / 2 - 2;
  const by = ground - s.h * 0.5;
  // Ripples instead of a shadow: ducks float.
  let o = `<ellipse cx="${f(bx)}" cy="${f(ground)}" rx="${f(s.len * 1.5 + frame * 2)}" ry="4" fill="none" stroke="${P.core.mint}" stroke-width="2" opacity="0.6"/>`;
  o += shaded(ellipse(bx, by, s.len * 1.1, s.h, seed), { tones: c, outline: ink(c), shadow: 2, light: 2 });
  o += `<path d="${blob(bx - 3, by - 1, s.len * 0.6, s.h * 0.5, seed + 3, 0.12)}" fill="${mix(c[0], '#3d6d8a', 0.4)}" opacity="0.7"/>`;
  const hx = bx + s.len * 0.75;
  const hy = by - s.neck;
  o += `<path d="M${f(bx + s.len * 0.5)},${f(by - 2)} L${f(hx)},${f(hy + 2)}" stroke="#2f6a4f" stroke-width="6" stroke-linecap="round"/>`;
  o += shaded(ellipse(hx, hy, s.head, s.head * 0.9, seed + 2), { tones: tones('#1f4d3a', '#2f6a4f', '#4f8f6c'), outline: '#173b3d', shadow: 1, light: 1 });
  o += `<path d="M${f(hx + s.head * 0.7)},${f(hy)} q6,0 8,2 q-4,2 -8,1Z" fill="${P.core.gold}" stroke="${P.core.goldDeep}" stroke-width="1"/>`;
  o += `<circle cx="${f(hx + 2)}" cy="${f(hy - 2)}" r="1.4" fill="#1b1612"/><path d="M${f(hx - 5)},${f(hy + s.head * 0.8)} h8" stroke="#f3efe2" stroke-width="2"/>`;
  return o;
}

/** One animal sprite: its canvas, anchor (feet centre on the ground) and SVG body. */
export function animal(id: string, frame: number): { w: number; h: number; ax: number; ay: number; body: string } {
  const s = SPECIES_ART[id];
  const span = s.len * 2 + s.head * 3 + 40;
  const tall = s.h * 2 + s.leg + s.neck + s.head * 3 + 36;
  const W = Math.ceil(span);
  const H = Math.ceil(tall);
  const ground = H - 8;
  const seed = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const body = s.kind === 'quad' ? quad(s, W, ground, frame, seed) : s.kind === 'hopper' ? hopper(s, W, ground, frame, seed) : s.kind === 'bird' ? bird(s, W, ground, frame, seed) : duck(s, W, ground, frame, seed);
  return { w: W, h: H, ax: W / 2, ay: ground, body };
}

/** A fenced yard with a small shelter for a pen or pasture (drawn on the ground layer, so the
 * animals inside are always seen). */
export function penYard(w: number, h: number, kind: string): { w: number; h: number; ax: number; ay: number; body: string } {
  const T = 96;
  const fw = w * T;
  const fh = h * T;
  const W = fw + 16;
  const H = fh + 60;
  const x0 = 8;
  const yBase = H - 6;
  const top = yBase - fh;
  const straw = kind === 'chickenCoop' || kind === 'pigsty' ? M.soil : M.wheat;
  let o = `<path d="${rrect(x0 + 6, top + 10, fw - 12, fh - 14, 18)}" fill="${straw[2]}" opacity="${kind === 'pigsty' ? 0.75 : 0.4}"/>`;
  if (kind === 'pigsty') o += `<path d="${blob(x0 + fw * 0.6, top + fh * 0.6, fw * 0.18, fh * 0.14, 77, 0.2)}" fill="${M.soil[0]}" opacity="0.55"/>`;
  // A small shelter in the back left corner.
  const sw = Math.min(fw * 0.45, 120);
  const sx = x0 + 10;
  const sy = top + 6;
  o += shaded(rrect(sx, sy + 26, sw, 46, 4), { tones: M.wood, outline: outlineOf(M.wood), shadow: 4, light: 3 });
  o += shaded(`M${sx - 8},${sy + 30} L${sx + sw / 2},${sy - 6} L${sx + sw + 8},${sy + 30}Z`, { tones: kind === 'horsePaddock' || kind === 'cattlePasture' ? M.roofRed : M.roofSlate, outline: outlineOf(M.roofSlate), shadow: 4, light: 3 });
  o += `<path d="${rrect(sx + sw / 2 - 12, sy + 44, 24, 28, 6)}" fill="${M.wood[0]}"/>`;
  // Fence: posts and two rails all round, low enough to see over.
  const rail = M.wood[2];
  const postC = M.wood[1];
  const edge = (xa: number, ya: number, xb: number, yb: number) => `<path d="M${xa},${ya - 18} L${xb},${yb - 18} M${xa},${ya - 8} L${xb},${yb - 8}" stroke="${rail}" stroke-width="4" stroke-linecap="round"/>`;
  const l = x0 + 4;
  const r = x0 + fw - 4;
  const tY = top + 14;
  const bY = yBase - 4;
  o += edge(l, tY, r, tY) + edge(l, tY, l, bY) + edge(r, tY, r, bY);
  const posts: [number, number][] = [];
  for (let x = l; x <= r + 1; x += (r - l) / Math.max(2, w * 2)) posts.push([x, tY], [x, bY]);
  for (let y = tY; y <= bY + 1; y += (bY - tY) / Math.max(2, h * 2)) posts.push([l, y], [r, y]);
  for (const [px, py] of posts) o += `<path d="${rrect(px - 3, py - 24, 6, 26, 2)}" fill="${postC}" stroke="${outlineOf(M.wood)}" stroke-width="1.5"/>`;
  // The front rail, with a gate in the middle.
  const gx = x0 + fw / 2;
  o += edge(l, bY, gx - 22, bY) + edge(gx + 22, bY, r, bY);
  o += `<path d="M${gx - 22},${bY - 20} L${gx + 22},${bY - 6} M${gx - 22},${bY - 6} L${gx + 22},${bY - 20}" stroke="${M.wood[1]}" stroke-width="3"/>`;
  if (kind === 'chickenCoop') o += `<path d="M${sx + sw + 10},${sy + 66} h30" stroke="${M.wood[1]}" stroke-width="4"/><ellipse cx="${sx + sw + 25}" cy="${sy + 62}" rx="10" ry="4" fill="${M.wheat[2]}"/>`;
  if (kind === 'horsePaddock' || kind === 'cattlePasture') o += `<path d="${rrect(x0 + fw - 70, top + 30, 50, 16, 5)}" fill="${M.wood[1]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/><path d="${rrect(x0 + fw - 66, top + 32, 42, 8, 3)}" fill="${M.wheat[1]}"/>`;
  void SHADOW;
  return { w: W, h: H, ax: x0, ay: yBase, body: o };
}
