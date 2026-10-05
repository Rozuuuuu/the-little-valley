/**
 * Art for building types that are not walled houses: the starting camp, realm landmarks (market),
 * and the decorations and line pieces (fence, stone wall, lamp, bench, garden...). Same canvas
 * convention as buildings.ts: the anchor is the bottom-left corner of the footprint, at
 * (12, H - 10), and the footprint fills the bottom of the canvas.
 */
import { M, outlineOf, P, SHADOW } from './palette';
import { blob, groundShadow, mix, poly, rng, rrect, shaded, smoothPath, TILE } from './svg-kit';
import { stones } from './buildings';

export interface PropArt { w: number; h: number; body: string; ax: number; ay: number; points: Record<string, [number, number]> }

const X0 = 12;

function frame(tw: number, th: number, rise: number): { W: number; H: number; fw: number; fh: number; yBase: number } {
  const fw = tw * TILE, fh = th * TILE;
  const W = fw + 24, H = fh + rise + 12;
  return { W, H, fw, fh, yBase: H - 10 };
}

/** A tent: canvas over a ridge pole, lit on the left, with an open flap. */
function tent(cx: number, base: number, w: number, h: number, tones: string[]): string {
  let s = shaded(poly([[cx - w / 2, base], [cx - w * 0.08, base - h], [cx + w * 0.08, base - h], [cx + w / 2, base]]), { tones, outline: outlineOf(tones), shadow: 6, light: 4 });
  s += `<path d="${poly([[cx - 9, base], [cx, base - h * 0.62], [cx + 9, base]])}" fill="${mix(tones[0], '#1a1410', 0.5)}"/>`;
  s += `<path d="M${cx},${base - h} V${base - h - 10}" stroke="${M.wood[1]}" stroke-width="3"/>`;
  return s;
}

/** A campfire ring with logs and a flame. */
function campfire(cx: number, cy: number): string {
  let s = '';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    s += `<ellipse cx="${cx + Math.cos(a) * 14}" cy="${cy + Math.sin(a) * 7}" rx="5" ry="3.5" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="1.2"/>`;
  }
  s += `<path d="M${cx - 10},${cy + 2} L${cx + 10},${cy - 4} M${cx - 10},${cy - 4} L${cx + 10},${cy + 2}" stroke="${M.wood[0]}" stroke-width="5" stroke-linecap="round"/>`;
  s += `<path d="M${cx - 7},${cy} Q${cx - 6},${cy - 14} ${cx},${cy - 22} Q${cx + 7},${cy - 12} ${cx + 7},${cy} Z" fill="#f08a2e"/><path d="M${cx - 3},${cy} Q${cx - 2},${cy - 9} ${cx + 1},${cy - 14} Q${cx + 4},${cy - 7} ${cx + 3},${cy} Z" fill="#ffd56a"/>`;
  return s;
}

function camp(lit: boolean): PropArt {
  const f = frame(3, 2, 40);
  const canvas = ['#8a7652', '#b49c70', '#d8c49a'];
  if (lit) return { w: f.W, h: f.H, body: `<circle cx="${X0 + f.fw / 2}" cy="${f.yBase - 40}" r="34" fill="${P.core.gold}" opacity="0.45"/>`, ax: X0, ay: f.yBase, points: {} };
  let s = groundShadow(X0 + f.fw / 2 + 8, f.yBase - 6, f.fw / 2, 16, SHADOW, 0.25);
  s += `<path d="${blob(X0 + f.fw / 2, f.yBase - f.fh * 0.4, f.fw / 2 - 4, f.fh * 0.36, 77, 0.08, 12)}" fill="${M.soil[3]}" opacity="0.55"/>`;
  s += tent(X0 + 56, f.yBase - 60, 84, 70, canvas) + tent(X0 + f.fw - 56, f.yBase - 64, 80, 66, canvas);
  // A stockpile: logs and sacks.
  for (let i = 0; i < 3; i++) s += shaded(rrect(X0 + 22 + i * 4, f.yBase - 26 - i * 9, 52, 10, 5), { tones: M.wood, outline: outlineOf(M.wood), shadow: 2, light: 1 });
  s += shaded(smoothPath([[X0 + f.fw - 70, f.yBase - 8], [X0 + f.fw - 72, f.yBase - 26], [X0 + f.fw - 60, f.yBase - 36], [X0 + f.fw - 48, f.yBase - 26], [X0 + f.fw - 50, f.yBase - 8]]), { tones: M.wall, outline: outlineOf(M.wall), shadow: 3, light: 2 });
  s += campfire(X0 + f.fw / 2, f.yBase - 30);
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: { top: [f.fw / 2, -60] } };
}

/** A striped market stall with goods on the counter. */
function stall(x: number, base: number, w: number, stripe: string, goods: string[]): string {
  let s = groundShadow(x + w / 2 + 4, base, w / 2 + 4, 8, SHADOW, 0.3);
  s += shaded(rrect(x, base - 30, w, 30, 3), { tones: M.wood, outline: outlineOf(M.wood), shadow: 3, light: 2 });
  for (let i = 0; i < goods.length; i++) s += `<circle cx="${x + 10 + i * ((w - 20) / Math.max(1, goods.length - 1))}" cy="${base - 34}" r="6" fill="${goods[i]}" stroke="${mix(goods[i], '#2a1a10', 0.5)}" stroke-width="1.5"/>`;
  for (const px of [x + 3, x + w - 6]) s += `<rect x="${px}" y="${base - 70}" width="4" height="40" fill="${M.wood[1]}"/>`;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const sx = x - 6 + (i * (w + 12)) / n;
    s += `<path d="${poly([[sx, base - 66], [sx + (w + 12) / n, base - 66], [sx + (w + 12) / n, base - 54], [sx, base - 54]])}" fill="${i % 2 ? M.wall[2] : stripe}"/>`;
    s += `<path d="M${sx},${base - 54} q${(w + 12) / n / 2},8 ${(w + 12) / n},0" fill="${i % 2 ? M.wall[2] : stripe}"/>`;
  }
  s += `<path d="${poly([[x - 6, base - 66], [x + w / 2, base - 84], [x + w + 6, base - 66]])}" fill="${stripe}" stroke="${mix(stripe, '#2a1a10', 0.5)}" stroke-width="2"/>`;
  return s;
}

function market(): PropArt {
  const f = frame(5, 4, 30);
  const cx = X0 + f.fw / 2, cy = f.yBase - f.fh / 2;
  // Cobbled square.
  let s = `<path d="${rrect(X0 + 6, f.yBase - f.fh + 10, f.fw - 12, f.fh - 14, 30)}" fill="${M.stone[2]}"/>`;
  const r = rng(5);
  for (let y = f.yBase - f.fh + 18; y < f.yBase - 10; y += 14)
    for (let x = X0 + 14 + (y % 28 ? 0 : 8); x < X0 + f.fw - 20; x += 18)
      s += `<path d="${rrect(x, y, 15, 11, 4)}" fill="${M.stone[1 + Math.floor(r() * 3)]}" opacity="0.7"/>`;
  s += `<path d="${rrect(X0 + 6, f.yBase - f.fh + 10, f.fw - 12, f.fh - 14, 30)}" fill="none" stroke="${outlineOf(M.stone)}" stroke-width="3"/>`;
  // Stalls along the back, then the fountain, then stalls in front.
  const stripes = [M.berry[1], P.people.shirt[1], P.core.gold, P.people.shirt[2]];
  s += stall(X0 + 24, f.yBase - f.fh + 96, 110, stripes[0], [M.berry[2], '#e8873a', M.wheat[2]]);
  s += stall(X0 + f.fw - 134, f.yBase - f.fh + 96, 110, stripes[1], [M.leaf[3], '#efe2f0', M.berry[1]]);
  s += `<ellipse cx="${cx}" cy="${cy + 8}" rx="74" ry="38" fill="${M.stone[1]}" stroke="${outlineOf(M.stone)}" stroke-width="3"/>`;
  s += `<ellipse cx="${cx}" cy="${cy + 2}" rx="66" ry="32" fill="${M.stone[3]}"/>`;
  s += `<ellipse cx="${cx}" cy="${cy + 6}" rx="56" ry="25" fill="${(P.ground.water as string[])[1]}"/>`;
  s += `<ellipse cx="${cx - 16}" cy="${cy}" rx="22" ry="6" fill="#d8f2f6" opacity="0.5"/>`;
  s += shaded(rrect(cx - 10, cy - 46, 20, 50, 6), { tones: M.stone, outline: outlineOf(M.stone), shadow: 4, light: 2 });
  s += `<ellipse cx="${cx}" cy="${cy - 46}" rx="22" ry="8" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="2"/>`;
  for (const dx of [-1, 1]) s += `<path d="M${cx},${cy - 54} q${dx * 22},-14 ${dx * 38},18" stroke="#bfe8f2" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.85"/>`;
  s += stall(X0 + 30, f.yBase - 20, 110, stripes[2], [M.wheat[2], '#b0855a', M.berry[2]]);
  s += stall(X0 + f.fw - 140, f.yBase - 20, 110, stripes[3], [P.people.shirt[4], P.people.shirt[0], M.wall[2]]);
  // Bunting across the square.
  s += `<path d="M${X0 + 20},${f.yBase - f.fh + 20} Q${cx},${f.yBase - f.fh + 60} ${X0 + f.fw - 20},${f.yBase - f.fh + 20}" stroke="${M.wood[1]}" stroke-width="2" fill="none"/>`;
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const x = X0 + 20 + t * (f.fw - 40);
    const y = f.yBase - f.fh + 20 + Math.sin(t * Math.PI) * 30;
    s += `<path d="${poly([[x - 6, y], [x + 6, y], [x, y + 12]])}" fill="${stripes[i % 4]}"/>`;
  }
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: { top: [f.fw / 2, -f.fh / 2 - 60] } };
}

function fence(): PropArt {
  const f = frame(1, 1, 30);
  const y = f.yBase - 30;
  let s = groundShadow(X0 + f.fw / 2 + 4, f.yBase - 18, f.fw / 2 + 6, 6, SHADOW, 0.25);
  // Rails run the full tile width so neighbouring pieces join into one fence.
  for (const ry of [y - 6, y + 12]) s += `<rect x="${X0 - 2}" y="${ry}" width="${f.fw + 4}" height="7" rx="2" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="1.6"/><rect x="${X0 - 2}" y="${ry}" width="${f.fw + 4}" height="2" fill="${M.wood[3]}" opacity="0.8"/>`;
  for (const px of [X0 + 10, X0 + f.fw - 20]) s += `<path d="${poly([[px, f.yBase - 16], [px, y - 18], [px + 5, y - 24], [px + 10, y - 18], [px + 10, f.yBase - 16]])}" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/><rect x="${px + 1}" y="${y - 17}" width="3" height="${f.yBase - y}" fill="${M.wood[3]}" opacity="0.7"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function stoneWall(): PropArt {
  const f = frame(1, 1, 40);
  let s = groundShadow(X0 + f.fw / 2 + 4, f.yBase - 10, f.fw / 2 + 8, 8, SHADOW, 0.3);
  // A dry-stone wall section, full tile width so sections join.
  s += `<path d="${rrect(X0 - 2, f.yBase - 70, f.fw + 4, 58, 8)}" fill="${M.stone[1]}"/>`;
  s += stones(X0 - 2, f.yBase - 30, f.fw + 4, 18, M.stone, 3);
  s += stones(X0 + 2, f.yBase - 48, f.fw - 4, 18, M.stone, 4);
  s += stones(X0 - 2, f.yBase - 66, f.fw + 4, 18, M.stone, 5);
  s += `<path d="${rrect(X0 - 4, f.yBase - 76, f.fw + 8, 12, 5)}" fill="${M.stone[3]}" stroke="${outlineOf(M.stone)}" stroke-width="2"/>`;
  s += `<path d="${blob(X0 + 30, f.yBase - 74, 14, 4, 9, 0.3, 7)}" fill="${M.leaf[3]}" opacity="0.8"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function flower(x: number, y: number, c: string): string {
  let s = `<path d="M${x},${y + 10} V${y}" stroke="${M.leaf[2]}" stroke-width="2"/>`;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    s += `<circle cx="${x + Math.cos(a) * 3.5}" cy="${y + Math.sin(a) * 3}" r="3" fill="${c}"/>`;
  }
  return s + `<circle cx="${x}" cy="${y}" r="2" fill="${P.core.gold}"/>`;
}

const BLOOMS = [M.berry[2], '#f4f0e0', P.core.gold, '#e88ab0', '#8aa8ee', '#f0a050'];

function flowerbed(): PropArt {
  const f = frame(1, 1, 24);
  const r = rng(31);
  let s = `<path d="${rrect(X0 + 6, f.yBase - 50, f.fw - 12, 44, 10)}" fill="${M.wood[1]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
  s += `<path d="${rrect(X0 + 11, f.yBase - 46, f.fw - 22, 30, 8)}" fill="${M.soil[1]}"/>`;
  for (let i = 0; i < 12; i++) s += `<path d="${blob(X0 + 18 + r() * (f.fw - 36), f.yBase - 34 + r() * 14, 8, 5, 40 + i, 0.3, 7)}" fill="${M.leaf[2 + (i % 2)]}"/>`;
  for (let i = 0; i < 10; i++) s += flower(X0 + 18 + r() * (f.fw - 36), f.yBase - 46 + r() * 22, BLOOMS[i % BLOOMS.length]);
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function lamp(lit: boolean): PropArt {
  const f = frame(1, 1, 80);
  const cx = X0 + f.fw / 2;
  const top = f.yBase - 130;
  if (lit) return { w: f.W, h: f.H, body: `<circle cx="${cx}" cy="${top + 14}" r="34" fill="${M.glassLit[0]}" opacity="0.45"/><rect x="${cx - 9}" y="${top + 4}" width="18" height="20" rx="3" fill="${M.glassLit[1]}"/>`, ax: X0, ay: f.yBase, points: {} };
  let s = groundShadow(cx + 6, f.yBase - 20, 18, 6, SHADOW, 0.3);
  s += `<path d="${rrect(cx - 12, f.yBase - 30, 24, 12, 3)}" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="1.5"/>`;
  s += `<rect x="${cx - 3}" y="${top + 24}" width="6" height="${f.yBase - 30 - top - 24}" fill="#3a3a3e"/><rect x="${cx - 3}" y="${top + 24}" width="2" height="${f.yBase - 30 - top - 24}" fill="#6a6a70"/>`;
  s += `<path d="${poly([[cx - 14, top + 4], [cx, top - 8], [cx + 14, top + 4]])}" fill="#2e2e34"/>`;
  s += `<rect x="${cx - 10}" y="${top + 4}" width="20" height="22" rx="2" fill="#f0d890" stroke="#2e2e34" stroke-width="3"/><path d="M${cx},${top + 4} V${top + 26}" stroke="#2e2e34" stroke-width="2"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function haystack(): PropArt {
  const f = frame(1, 1, 40);
  const cx = X0 + f.fw / 2;
  const r = rng(8);
  let s = groundShadow(cx + 8, f.yBase - 14, 44, 10, SHADOW, 0.3);
  const d = smoothPath([[cx - 42, f.yBase - 14], [cx - 38, f.yBase - 56], [cx - 12, f.yBase - 92], [cx + 14, f.yBase - 92], [cx + 38, f.yBase - 56], [cx + 42, f.yBase - 14]]);
  s += shaded(d, { tones: M.wheat, outline: M.wheat[0], shadow: 10, light: 8 });
  for (let i = 0; i < 40; i++) {
    const x = cx - 34 + r() * 68, y = f.yBase - 20 - r() * 64;
    s += `<path d="M${x},${y} l${(r() - 0.5) * 6},${-6 - r() * 8}" stroke="${M.wheat[r() < 0.5 ? 0 : 3]}" stroke-width="1.6" opacity="0.8" stroke-linecap="round"/>`;
  }
  s += `<path d="M${cx},${f.yBase - 92} V${f.yBase - 104}" stroke="${M.wood[1]}" stroke-width="3"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function barrel(x: number, base: number, w: number, h: number): string {
  let s = shaded(rrect(x, base - h, w, h, 8), { tones: M.wood, outline: outlineOf(M.wood), shadow: 4, light: 3 });
  for (const t of [0.22, 0.78]) s += `<path d="M${x},${base - h * t} H${x + w}" stroke="#4a4a50" stroke-width="3"/>`;
  return s + `<ellipse cx="${x + w / 2}" cy="${base - h}" rx="${w / 2 - 1}" ry="5" fill="${M.wood[3]}" stroke="${outlineOf(M.wood)}" stroke-width="1.6"/>`;
}

function barrels(): PropArt {
  const f = frame(1, 1, 30);
  let s = groundShadow(X0 + f.fw / 2 + 6, f.yBase - 14, 44, 9, SHADOW, 0.3);
  s += shaded(rrect(X0 + 50, f.yBase - 62, 36, 32, 3), { tones: M.wood, outline: outlineOf(M.wood), shadow: 3, light: 2 });
  s += `<path d="M${X0 + 50},${f.yBase - 46} H${X0 + 86} M${X0 + 52},${f.yBase - 60} L${X0 + 84},${f.yBase - 32}" stroke="${outlineOf(M.wood)}" stroke-width="2" opacity="0.6"/>`;
  s += barrel(X0 + 10, f.yBase - 12, 34, 46) + barrel(X0 + 46, f.yBase - 14, 32, 40);
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function signpost(): PropArt {
  const f = frame(1, 1, 70);
  const cx = X0 + f.fw / 2;
  let s = groundShadow(cx + 6, f.yBase - 18, 16, 5, SHADOW, 0.3);
  s += `<rect x="${cx - 4}" y="${f.yBase - 130}" width="8" height="${112}" fill="${M.wood[1]}" stroke="${outlineOf(M.wood)}" stroke-width="1.6"/>`;
  s += shaded(poly([[cx - 6, f.yBase - 110], [cx + 40, f.yBase - 110], [cx + 50, f.yBase - 100], [cx + 40, f.yBase - 90], [cx - 6, f.yBase - 90]]), { tones: M.wood.slice(1), outline: outlineOf(M.wood), shadow: 2, light: 2 });
  s += shaded(poly([[cx + 6, f.yBase - 84], [cx - 40, f.yBase - 84], [cx - 50, f.yBase - 74], [cx - 40, f.yBase - 64], [cx + 6, f.yBase - 64]]), { tones: M.wood.slice(1), outline: outlineOf(M.wood), shadow: 2, light: 2 });
  s += `<path d="M${cx},${f.yBase - 130} l22,6 l-22,7Z" fill="${M.berry[1]}"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function garden(): PropArt {
  const f = frame(2, 2, 30);
  const r = rng(77);
  let s = `<path d="${rrect(X0 + 6, f.yBase - f.fh + 14, f.fw - 12, f.fh - 18, 18)}" fill="${M.leaf[2]}" stroke="${M.wood[1]}" stroke-width="6"/>`;
  s += `<path d="M${X0 + f.fw / 2},${f.yBase - 6} V${f.yBase - f.fh + 18} M${X0 + 12},${f.yBase - f.fh / 2} H${X0 + f.fw - 12}" stroke="${M.soil[3]}" stroke-width="14"/>`;
  for (let i = 0; i < 26; i++) s += `<path d="${blob(X0 + 20 + r() * (f.fw - 40), f.yBase - f.fh + 26 + r() * (f.fh - 40), 10, 7, 90 + i, 0.3, 7)}" fill="${M.leaf[2 + (i % 3)]}"/>`;
  for (let i = 0; i < 30; i++) s += flower(X0 + 20 + r() * (f.fw - 40), f.yBase - f.fh + 24 + r() * (f.fh - 44), BLOOMS[i % BLOOMS.length]);
  const cx = X0 + f.fw / 2, cy = f.yBase - f.fh / 2;
  s += shaded(rrect(cx - 8, cy - 26, 16, 30, 4), { tones: M.stone, outline: outlineOf(M.stone), shadow: 3, light: 2 });
  s += `<ellipse cx="${cx}" cy="${cy - 28}" rx="24" ry="9" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="2"/><ellipse cx="${cx}" cy="${cy - 29}" rx="17" ry="5" fill="${(P.ground.water as string[])[2]}"/>`;
  s += `<path d="M${cx + 6},${cy - 34} q3,-5 7,-2 l5,-3 l-3,5 q2,4 -4,4z" fill="#7a5a3a"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function statue(): PropArt {
  const f = frame(2, 2, 120);
  const cx = X0 + f.fw / 2;
  let s = groundShadow(cx + 10, f.yBase - 30, 80, 20, SHADOW, 0.3);
  for (const [w, h, y] of [[150, 22, f.yBase - 30], [116, 20, f.yBase - 50], [80, 50, f.yBase - 100]]) s += shaded(rrect(cx - w / 2, y, w, h, 4), { tones: M.stone, outline: outlineOf(M.stone), shadow: 5, light: 3 });
  // The founder: a cloaked figure with a raised hand, in weathered bronze-green stone.
  const fig = ['#4a6a5a', '#6a8a72', '#9ab49a'];
  s += shaded(smoothPath([[cx - 26, f.yBase - 100], [cx - 20, f.yBase - 150], [cx - 10, f.yBase - 172], [cx + 10, f.yBase - 172], [cx + 20, f.yBase - 150], [cx + 26, f.yBase - 100]]), { tones: fig, outline: outlineOf(fig), shadow: 6, light: 4 });
  s += shaded(blob(cx, f.yBase - 184, 13, 14, 3, 0.05), { tones: fig, outline: outlineOf(fig), shadow: 3, light: 2 });
  s += `<path d="M${cx + 14},${f.yBase - 160} q14,-14 12,-36" stroke="${fig[1]}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

function bench(): PropArt {
  const f = frame(2, 1, 20);
  let s = groundShadow(X0 + f.fw / 2 + 6, f.yBase - 24, f.fw / 2 - 20, 8, SHADOW, 0.3);
  for (const lx of [X0 + 30, X0 + f.fw - 40]) s += `<rect x="${lx}" y="${f.yBase - 56}" width="10" height="34" fill="#3a3a40"/>`;
  s += shaded(rrect(X0 + 20, f.yBase - 92, f.fw - 40, 12, 3), { tones: M.wood, outline: outlineOf(M.wood), shadow: 2, light: 2 });
  s += shaded(rrect(X0 + 20, f.yBase - 76, f.fw - 40, 12, 3), { tones: M.wood, outline: outlineOf(M.wood), shadow: 2, light: 2 });
  s += shaded(rrect(X0 + 16, f.yBase - 58, f.fw - 32, 14, 3), { tones: M.wood, outline: outlineOf(M.wood), shadow: 3, light: 2 });
  return { w: f.W, h: f.H, body: s, ax: X0, ay: f.yBase, points: {} };
}

/** Every prop by building type; `lit` gives the night overlay, or null when it has none. */
export const PROPS: Record<string, (lit: boolean) => PropArt | null> = {
  camp: (lit) => camp(lit),
  market: (lit) => (lit ? null : market()),
  fence: (lit) => (lit ? null : fence()),
  stoneWall: (lit) => (lit ? null : stoneWall()),
  flowerbed: (lit) => (lit ? null : flowerbed()),
  lamp: (lit) => lamp(lit),
  haystack: (lit) => (lit ? null : haystack()),
  barrels: (lit) => (lit ? null : barrels()),
  signpost: (lit) => (lit ? null : signpost()),
  garden: (lit) => (lit ? null : garden()),
  statue: (lit) => (lit ? null : statue()),
  bench: (lit) => (lit ? null : bench()),
};
