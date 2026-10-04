/**
 * Generates the provisional illustrated art for the Godot version as SVG files, plus a manifest
 * of each sprite's size, anchor (the point that sits on the ground, at the bottom of the
 * footprint) and footprint. Run: npx tsx scripts/art/make-svgs.ts
 *
 * Output: godot/art/generated/*.svg and godot/art/generated/manifest.json.
 * All of it is PROVISIONAL art: drawn in code to fix the style, scale and anchors, and meant to
 * be replaced file by file (same name, same size and anchor) by finished art. The rules it
 * follows are in docs/godot/ART_STYLE.md.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { blob, groundShadow, mix, poly, rng, rrect, shaded, smoothPath, svg, TILE } from './svg-kit';
import { M, OUTLINE, outlineOf, P, RIM, SHADOW } from './palette';
import { building, SPECS } from './buildings';
import { orchard, ORCHARD_LOOKS } from './orchard';

const OUT = 'godot/art/generated';

interface Entry {
  /** Canvas size in art pixels (96 per tile). */
  w: number;
  h: number;
  /** Anchor in art pixels: drawn at the object's ground point. */
  ax: number;
  ay: number;
  kind: string;
  provisional: true;
}
const manifest: Record<string, Entry> = {};

function emit(name: string, w: number, h: number, ax: number, ay: number, kind: string, body: string): void {
  writeFileSync(`${OUT}/${name}.svg`, svg(w, h, body));
  manifest[name] = { w, h, ax, ay, kind, provisional: true };
}


// ---- trees, bushes, rocks --------------------------------------------------------------------

function oak(variant: number, season: 'summer' | 'autumn' | 'winter'): string {
  const r = rng(100 + variant * 17);
  const W = 2 * TILE;
  const H = 3 * TILE;
  const cx = W / 2;
  const ground = H - 18;
  let body = groundShadow(cx + 6, ground, 62, 18, SHADOW);
  const bark = M.bark;
  const trunkW = 26 + variant * 3;
  const trunk = poly([
    [cx - trunkW / 2 - 6, ground], [cx - trunkW / 2, ground - 70], [cx - trunkW / 2 + 4, ground - 120],
    [cx + trunkW / 2 - 4, ground - 120], [cx + trunkW / 2, ground - 70], [cx + trunkW / 2 + 6, ground],
  ]);
  body += shaded(trunk, { tones: bark, outline: outlineOf(bark), shadow: 7, light: 3 });
  if (season === 'winter') {
    // Bare branches with a little snow.
    const branches: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42 + (r() - 0.5) * 0.2;
      const len = 60 + r() * 40;
      const x0 = cx + (r() - 0.5) * 10;
      const y0 = ground - 105 - r() * 20;
      const x1 = x0 + Math.cos(a) * len;
      const y1 = y0 + Math.sin(a) * len;
      branches.push(`<path d="M${x0},${y0} Q${(x0 + x1) / 2 + (r() - 0.5) * 20},${(y0 + y1) / 2} ${x1},${y1}" stroke="${bark[1]}" stroke-width="${7 - i * 0.6}" stroke-linecap="round" fill="none"/>`);
      branches.push(`<ellipse cx="${x1}" cy="${y1 - 2}" rx="8" ry="4" fill="${M.snow[2]}" opacity="0.9"/>`);
    }
    return body + `<g stroke-linejoin="round">${branches.join('')}</g>`;
  }
  const leaf = season === 'autumn' ? M.leafAutumn : M.leaf;
  // Canopy: overlapping lobes shaded as one form (one dark base, lobes in base and light tones).
  const lobes: string[] = [];
  const n = 5 + variant;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const rr = 34 + r() * 10;
    lobes.push(blob(cx + Math.cos(a) * 40, ground - 175 + Math.sin(a) * 34, rr, rr * 0.9, 300 + variant * 31 + i, 0.12));
  }
  const crown = blob(cx, ground - 175, 82, 70, 200 + variant, 0.1, 11);
  body += shaded(crown, { tones: [leaf[0], leaf[1], leaf[2]], outline: outlineOf(leaf), shadow: 16, light: 12, rim: RIM });
  for (const [i, d] of lobes.entries()) {
    if (i % 2 === 0) body += `<path d="${d}" fill="${leaf[2]}" opacity="0.55" transform="translate(-6,-8)"/>`;
  }
  body += `<path d="${blob(cx - 22, ground - 205, 26, 18, 50 + variant)}" fill="${leaf[4]}" opacity="0.5"/>`;
  return body;
}

function pine(variant: number, season: 'summer' | 'winter'): string {
  const W = 2 * TILE;
  const H = 3 * TILE;
  const cx = W / 2;
  const ground = H - 18;
  let body = groundShadow(cx + 5, ground, 46, 15, SHADOW);
  body += shaded(rrect(cx - 10, ground - 50, 20, 52, 6), { tones: M.bark, outline: outlineOf(M.bark), shadow: 5, light: 2 });
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const w = 78 - i * 15 + variant * 4;
    const y = ground - 40 - i * 44;
    const tier = smoothPath([[cx - w, y], [cx - w * 0.5, y - 18], [cx - 6, y - 70], [cx + 6, y - 70], [cx + w * 0.5, y - 18], [cx + w, y], [cx, y + 10]]);
    body += shaded(tier, { tones: M.pine, outline: outlineOf(M.pine), shadow: 12, light: 8, rim: RIM });
    if (season === 'winter') body += `<path d="${smoothPath([[cx - w * 0.6, y - 14], [cx - 6, y - 64], [cx + 6, y - 64], [cx + w * 0.3, y - 26], [cx, y - 20]])}" fill="${M.snow[2]}" opacity="0.92"/>`;
  }
  return body;
}

function berryBush(full: boolean, season: 'summer' | 'winter'): string {
  const W = TILE;
  const H = TILE + 24;
  const cx = W / 2;
  const ground = H - 14;
  let body = groundShadow(cx + 4, ground, 36, 11, SHADOW);
  const leaf = season === 'winter' ? [mix(M.leaf[0], '#6b5a4a', 0.6), mix(M.leaf[1], '#7d6a56', 0.6), mix(M.leaf[2], '#9c8a74', 0.6)] : M.leaf.slice(1);
  body += shaded(blob(cx, ground - 30, 38, 30, 77, 0.14), { tones: leaf, outline: outlineOf(leaf), shadow: 9, light: 7, rim: RIM });
  if (season === 'winter') body += `<path d="${blob(cx - 4, ground - 52, 26, 9, 12)}" fill="${M.snow[2]}" opacity="0.9"/>`;
  if (full && season !== 'winter') {
    const r = rng(9);
    for (let i = 0; i < 7; i++) {
      const x = cx - 24 + r() * 48;
      const y = ground - 50 + r() * 34;
      body += `<circle cx="${x}" cy="${y}" r="6" fill="${M.berry[1]}" stroke="${M.berry[0]}" stroke-width="2"/><circle cx="${x - 2}" cy="${y - 2}" r="2" fill="${P.core.mint}" opacity="0.8"/>`;
    }
  }
  return body;
}

function rock(variant: number, big: boolean): string {
  const W = big ? TILE * 1.5 : TILE;
  const H = big ? TILE * 1.3 : TILE;
  const cx = W / 2;
  const ground = H - 12;
  const rx = big ? 58 : 34;
  const ry = big ? 46 : 26;
  let body = groundShadow(cx + 5, ground, rx + 4, 10, SHADOW);
  body += shaded(blob(cx, ground - ry + 4, rx, ry, 500 + variant * 13 + (big ? 7 : 0), 0.16, 7), {
    tones: M.stone, outline: outlineOf(M.stone), shadow: big ? 14 : 9, light: big ? 10 : 6, rim: RIM,
  });
  // A facet line or two.
  body += `<path d="M${cx - rx * 0.4},${ground - ry * 1.2} q${rx * 0.3},${ry * 0.4} ${rx * 0.2},${ry * 0.9}" stroke="${M.stone[0]}" stroke-width="3" fill="none" opacity="0.5"/>`;
  if (big) body += `<path d="${blob(cx - 14, ground - ry * 1.6, 26, 10, 3)}" fill="${M.leaf[2]}" opacity="0.85"/>`;
  return body;
}

function stump(): string {
  const W = TILE;
  const H = TILE;
  const cx = W / 2;
  const ground = H - 18;
  let body = groundShadow(cx + 3, ground + 2, 26, 8, SHADOW);
  body += shaded(rrect(cx - 18, ground - 22, 36, 24, 8), { tones: M.bark, outline: outlineOf(M.bark), shadow: 5, light: 3 });
  body += `<ellipse cx="${cx}" cy="${ground - 22}" rx="18" ry="7" fill="${M.wood[3]}" stroke="${outlineOf(M.wood)}" stroke-width="2.5"/><ellipse cx="${cx}" cy="${ground - 22}" rx="9" ry="3.5" fill="none" stroke="${M.wood[2]}" stroke-width="2"/>`;
  return body;
}

function sapling(): string {
  const W = TILE;
  const H = TILE + 20;
  const cx = W / 2;
  const ground = H - 16;
  let body = groundShadow(cx + 2, ground + 2, 18, 6, SHADOW);
  body += `<path d="M${cx},${ground} L${cx},${ground - 34}" stroke="${M.bark[1]}" stroke-width="5" stroke-linecap="round"/>`;
  body += shaded(blob(cx, ground - 46, 20, 16, 61, 0.15), { tones: M.leaf.slice(2), outline: outlineOf(M.leaf), shadow: 6, light: 4 });
  return body;
}

// ---- buildings -----------------------------------------------------------------------------

/** A construction site: a staked foundation and scaffold poles, for any footprint. */
function site(tw: number, th: number): { w: number; h: number; body: string; ax: number; ay: number } {
  const fw = tw * TILE;
  const fh = th * TILE;
  const W = fw + 24;
  const H = fh + 60;
  const x0 = 12;
  const yBase = H - 10;
  let body = `<path d="${rrect(x0 + 4, yBase - fh + 8, fw - 8, fh - 12, 10)}" fill="${M.soil[3]}" opacity="0.9" stroke="${M.soil[1]}" stroke-width="3"/>`;
  body += `<path d="${rrect(x0 + 10, yBase - fh * 0.45, fw - 20, fh * 0.45 - 8, 6)}" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="3"/>`;
  for (const px of [x0 + 12, x0 + fw - 16]) body += `<rect x="${px}" y="${yBase - fh - 36}" width="7" height="${fh + 28}" rx="2" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
  body += `<rect x="${x0 + 10}" y="${yBase - fh - 30}" width="${fw - 20}" height="7" rx="2" fill="${M.wood[3]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
  return { w: W, h: H, body, ax: x0, ay: yBase };
}

// ---- fields and crops -------------------------------------------------------------------------

function soil(state: 'wild' | 'tilled' | 'wet'): string {
  const s = M.soil;
  const base = state === 'wet' ? s[1] : state === 'tilled' ? s[2] : mix(s[3], P.ground.meadow[1] as string, 0.45);
  let body = `<path d="${rrect(4, 4, TILE - 8, TILE - 8, 14)}" fill="${base}" stroke="${s[0]}" stroke-width="3" opacity="0.95"/>`;
  if (state !== 'wild') for (let y = 20; y < TILE - 10; y += 16) body += `<path d="M14,${y} Q${TILE / 2},${y + 4} ${TILE - 14},${y}" stroke="${s[0]}" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>`;
  else for (let i = 0; i < 6; i++) body += `<path d="M${18 + i * 12},${TILE - 18} l3,-12" stroke="${P.ground.meadow[2]}" stroke-width="3" stroke-linecap="round"/>`;
  return body;
}

function crop(id: string, art: { leaf: string; leafDark: string; fruit: string; fruitDark: string; style: string }, stage: number): string {
  const W = TILE;
  const H = TILE + 30;
  const ground = H - 18;
  let body = '';
  const plants = [[24, 0], [48, 6], [72, 0], [36, -18], [60, -18]];
  for (const [i, [px, dy]] of plants.entries()) {
    const y = ground + dy;
    if (stage === 0) {
      body += `<path d="M${px},${y} q-4,-10 -9,-12 M${px},${y} q4,-10 9,-12" stroke="${art.leaf}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
      continue;
    }
    if (art.style === 'grain') {
      const h = [0, 30, 46, 54][stage];
      body += `<path d="M${px},${y} Q${px - 3},${y - h / 2} ${px - 2},${y - h}" stroke="${stage === 3 ? art.fruitDark : art.leafDark}" stroke-width="4" fill="none"/>`;
      if (stage >= 2) body += `<ellipse cx="${px - 2}" cy="${y - h}" rx="6" ry="13" fill="${stage === 3 ? art.fruit : art.leaf}" stroke="${stage === 3 ? art.fruitDark : art.leafDark}" stroke-width="2.5"/>`;
      continue;
    }
    const lr = [0, 10, 14, 16][stage];
    body += `<path d="${blob(px - lr * 0.6, y - lr, lr, lr * 0.6, i * 7 + stage)}" fill="${art.leaf}" stroke="${art.leafDark}" stroke-width="2.5"/>`;
    body += `<path d="${blob(px + lr * 0.6, y - lr * 1.1, lr, lr * 0.6, i * 11 + stage)}" fill="${art.leaf}" stroke="${art.leafDark}" stroke-width="2.5"/>`;
    if (stage === 3) {
      const fr = art.style === 'vine' ? 15 : 9;
      body += `<path d="${blob(px, y - 4, fr, fr * 0.8, i + 40, 0.08)}" fill="${art.fruit}" stroke="${art.fruitDark}" stroke-width="3"/>`;
      body += `<circle cx="${px - fr * 0.35}" cy="${y - 4 - fr * 0.35}" r="${fr * 0.25}" fill="#ffffff" opacity="0.5"/>`;
    }
  }
  void id;
  return body;
}

// ---- people ------------------------------------------------------------------------------------
// Parts are drawn in light greys so the game can tint them (shirt, pants, skin, hair colours are
// data). Every part shares one canvas and anchor (the feet), so parts stack without offsets.

const PW = 80;
const PH = 128;
const PAX = 40;
const PAY = 118;
type Dir = 'down' | 'up' | 'side';
const GREY = ['#8d9291', '#c3c7c5', '#ffffff'];
const PART_OUT = '#3a4a48';

function body(dir: Dir): string {
  const torso = dir === 'side' ? rrect(PAX - 13, PAY - 64, 26, 36, 11) : rrect(PAX - 16, PAY - 64, 32, 36, 12);
  let s = shaded(torso, { tones: GREY, outline: PART_OUT, shadow: 5, light: 3 });
  // Arms.
  if (dir === 'side') s += `<path d="M${PAX},${PAY - 58} q6,14 4,26" stroke="${GREY[0]}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  else for (const sx of [-1, 1]) s += `<path d="M${PAX + sx * 15},${PAY - 58} q${sx * 6},14 ${sx * 4},26" stroke="${GREY[1]}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  return s;
}

function legs(dir: Dir, frame: number): string {
  // Frames 0..3: a walk cycle (0 and 2 are passing poses).
  const swing = [0, 7, 0, -7][frame];
  if (dir === 'side') {
    return `<path d="M${PAX - 3},${PAY - 30} L${PAX - 3 + swing},${PAY - 2}" stroke="${GREY[0]}" stroke-width="11" stroke-linecap="round"/>
<path d="M${PAX + 3},${PAY - 30} L${PAX + 3 - swing},${PAY - 2}" stroke="${GREY[1]}" stroke-width="11" stroke-linecap="round"/>
<ellipse cx="${PAX - 1 + swing}" cy="${PAY}" rx="8" ry="4" fill="${PART_OUT}"/><ellipse cx="${PAX + 5 - swing}" cy="${PAY}" rx="8" ry="4" fill="${PART_OUT}"/>`;
  }
  const lift = [0, 4, 0, 4][frame];
  const l = frame === 1 ? lift : 0;
  const r = frame === 3 ? lift : 0;
  return `<path d="M${PAX - 7},${PAY - 30} L${PAX - 8},${PAY - 2 - l}" stroke="${GREY[1]}" stroke-width="11" stroke-linecap="round"/>
<path d="M${PAX + 7},${PAY - 30} L${PAX + 8},${PAY - 2 - r}" stroke="${GREY[1]}" stroke-width="11" stroke-linecap="round"/>
<ellipse cx="${PAX - 8}" cy="${PAY - l}" rx="7" ry="4" fill="${PART_OUT}"/><ellipse cx="${PAX + 8}" cy="${PAY - r}" rx="7" ry="4" fill="${PART_OUT}"/>`;
}

function head(dir: Dir): string {
  const cy = PAY - 82;
  let s = shaded(blob(PAX, cy, 20, 19, 5, 0.03, 10), { tones: GREY, outline: PART_OUT, shadow: 5, light: 4 });
  if (dir === 'down') s += `<ellipse cx="${PAX - 7}" cy="${cy + 2}" rx="3" ry="4" fill="#2b2b2b"/><ellipse cx="${PAX + 7}" cy="${cy + 2}" rx="3" ry="4" fill="#2b2b2b"/><ellipse cx="${PAX - 11}" cy="${cy + 9}" rx="4" ry="2.5" fill="#d47a6a" opacity="0.5"/><ellipse cx="${PAX + 11}" cy="${cy + 9}" rx="4" ry="2.5" fill="#d47a6a" opacity="0.5"/>`;
  if (dir === 'side') s += `<ellipse cx="${PAX + 10}" cy="${cy + 1}" rx="3" ry="4" fill="#2b2b2b"/>`;
  return s;
}

function hair(style: number, dir: Dir): string {
  const cy = PAY - 82;
  const back = dir === 'up';
  const shapes = [
    blob(PAX, cy - 10, 21, 12, 70 + style, 0.08),
    smoothPath([[PAX - 22, cy + 4], [PAX - 20, cy - 16], [PAX, cy - 22], [PAX + 20, cy - 16], [PAX + 22, cy + 4], [PAX + 12, cy - 6], [PAX - 12, cy - 6]]),
    blob(PAX, cy - 12, 23, 13, 90 + style, 0.15, 12),
  ];
  let s = shaded(shapes[style % 3], { tones: GREY, outline: PART_OUT, shadow: 4, light: 3 });
  if (back) s += `<path d="${blob(PAX, cy - 2, 20, 17, 3)}" fill="${GREY[1]}" stroke="${PART_OUT}" stroke-width="2.5"/>`;
  if (style === 2 && dir !== 'up') s += `<path d="M${PAX + 16},${cy - 4} q10,14 2,30" stroke="${GREY[1]}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  return s;
}

/** Role hats, in their own colours: the quickest way to read a role in a crowd. */
function hat(role: string, dir: Dir): string {
  const cy = PAY - 96;
  const side = dir === 'side';
  switch (role) {
    case 'farmer':
      return `<ellipse cx="${PAX}" cy="${cy + 6}" rx="${side ? 24 : 30}" ry="7" fill="${M.wheat[2]}" stroke="${M.wheat[0]}" stroke-width="3"/>` + shaded(blob(PAX, cy - 2, 16, 11, 2, 0.05), { tones: M.wheat.slice(1), outline: M.wheat[0], shadow: 4, light: 3 });
    case 'builder':
      return shaded(smoothPath([[PAX - 20, cy + 8], [PAX - 18, cy - 8], [PAX, cy - 14], [PAX + 18, cy - 8], [PAX + 20, cy + 8]]), { tones: [P.core.goldDeep, P.core.gold, '#f6dc9a'], outline: '#7a5a20', shadow: 4, light: 3 }) + `<rect x="${PAX - 23}" y="${cy + 5}" width="46" height="6" rx="3" fill="${P.core.goldDeep}"/>`;
    case 'gatherer':
      return shaded(smoothPath([[PAX - 22, cy + 14], [PAX - 20, cy - 8], [PAX, cy - 16], [PAX + 20, cy - 8], [PAX + 22, cy + 14], [PAX, cy + 2]]), { tones: M.leaf.slice(1), outline: outlineOf(M.leaf), shadow: 4, light: 3 });
    case 'hauler':
      return `<path d="${rrect(PAX - 21, cy + 2, 42, 9, 4)}" fill="${M.roofSlate[2]}" stroke="${outlineOf(M.roofSlate)}" stroke-width="2.5"/>` + (side ? '' : `<path d="M${PAX + 18},${cy + 6} l10,8 l-4,4z" fill="${M.roofSlate[2]}"/>`);
    case 'crafter':
      return shaded(rrect(PAX - 17, cy - 6, 34, 14, 6), { tones: M.wood.slice(1), outline: outlineOf(M.wood), shadow: 3, light: 2 });
    default:
      return '';
  }
}

function tool(name: string): string {
  // Drawn at the right hand, pointing up-right; the game mirrors for the left side.
  const hx = PAX + 18;
  const hy = PAY - 40;
  const handle = (len: number) => `<path d="M${hx},${hy} L${hx + len * 0.5},${hy - len}" stroke="${M.wood[2]}" stroke-width="5" stroke-linecap="round"/>`;
  const head = (d: string, tones: string[]) => `<path d="${d}" fill="${tones[1]}" stroke="${outlineOf(tones)}" stroke-width="2.5"/>`;
  switch (name) {
    case 'axe': return handle(34) + head(poly([[hx + 14, hy - 36], [hx + 28, hy - 40], [hx + 26, hy - 24], [hx + 16, hy - 28]]), M.stone);
    case 'pick': return handle(34) + head(smoothPath([[hx + 2, hy - 30], [hx + 17, hy - 38], [hx + 32, hy - 30], [hx + 17, hy - 33]]), M.stone);
    case 'hoe': return handle(36) + head(poly([[hx + 16, hy - 36], [hx + 28, hy - 34], [hx + 26, hy - 28]]), M.stone);
    case 'sickle': return handle(14) + `<path d="M${hx + 7},${hy - 14} q18,-14 4,-26" stroke="${M.stone[2]}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    case 'hammer': return handle(26) + head(rrect(hx + 6, hy - 32, 20, 10, 3), M.stone);
    case 'can': return head(rrect(hx - 2, hy - 18, 20, 16, 5), M.roofSlate) + `<path d="M${hx + 18},${hy - 12} l10,-6" stroke="${M.roofSlate[1]}" stroke-width="4"/>`;
    default: return '';
  }
}

// ---- icons --------------------------------------------------------------------------------------

function icon(res: string): string {
  const S = 64;
  const c = S / 2;
  switch (res) {
    case 'wood':
      return [0, 1, 2].map((i) => {
        const y = 22 + i * 12 - (i === 2 ? 14 : 0);
        const x = i === 2 ? c - 12 : 8 + i * 14;
        return shaded(rrect(x, y, 34, 13, 6), { tones: M.wood, outline: outlineOf(M.wood), shadow: 3, light: 2 }) + `<ellipse cx="${x + 30}" cy="${y + 6.5}" rx="4" ry="6" fill="${M.wood[3]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
      }).join('');
    case 'stone':
      return shaded(blob(c - 6, c + 6, 18, 14, 4, 0.15, 7), { tones: M.stone, outline: outlineOf(M.stone), shadow: 4, light: 3 }) + shaded(blob(c + 10, c - 4, 13, 11, 8, 0.15, 7), { tones: M.stone, outline: outlineOf(M.stone), shadow: 3, light: 2 });
    case 'food':
      return shaded(blob(c, c + 6, 22, 15, 6, 0.06), { tones: M.wood.slice(1), outline: outlineOf(M.wood), shadow: 4, light: 3 })
        + `<circle cx="${c - 8}" cy="${c - 4}" r="8" fill="${M.berry[1]}" stroke="${M.berry[0]}" stroke-width="2"/><circle cx="${c + 7}" cy="${c - 6}" r="9" fill="${P.core.gold}" stroke="${P.core.goldDeep}" stroke-width="2"/>`;
    case 'planks':
      return [0, 1, 2].map((i) => shaded(rrect(10, 16 + i * 12, 44, 10, 3), { tones: M.wood.slice(1), outline: outlineOf(M.wood), shadow: 2, light: 2 })).join('');
    case 'tools':
      return `<g transform="translate(-30,8)">${tool('hammer')}</g><g transform="translate(-20,10)">${tool('pick')}</g>`;
    case 'wheat':
    case 'flour':
      return `<g>${[-10, 0, 10].map((dx) => `<path d="M${c + dx},${S - 8} Q${c + dx * 0.6},${c} ${c + dx * 0.8},${16}" stroke="${M.wheat[1]}" stroke-width="3" fill="none"/><ellipse cx="${c + dx * 0.8}" cy="18" rx="5" ry="10" fill="${M.wheat[2]}" stroke="${M.wheat[0]}" stroke-width="2"/>`).join('')}</g>`
        + (res === 'flour' ? shaded(blob(c, c + 10, 18, 14, 2, 0.05), { tones: M.wall, outline: outlineOf(M.wall), shadow: 3, light: 2 }) : '');
    case 'apples':
      return `<circle cx="${c}" cy="${c + 4}" r="16" fill="${M.berry[2]}" stroke="${M.berry[0]}" stroke-width="3"/><path d="M${c},${c - 12} q2,-8 8,-10" stroke="${M.wood[1]}" stroke-width="3" fill="none"/><path d="${blob(c + 9, c - 15, 7, 4, 1)}" fill="${M.leaf[3]}"/>`;
    default:
      // A tied sack: the generic good, until each has its own icon.
      return shaded(smoothPath([[c - 18, S - 10], [c - 20, c], [c - 8, 18], [c + 8, 18], [c + 20, c], [c + 18, S - 10]]), { tones: M.wall, outline: outlineOf(M.wall), shadow: 4, light: 3 }) + `<path d="M${c - 9},20 q9,6 18,0" stroke="${M.wood[1]}" stroke-width="3" fill="none"/>`;
  }
}

// ---- write everything ------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tree = (W: number, H: number) => [W / 2, H - 18] as const;
for (let v = 0; v < 3; v++) for (const s of ['summer', 'autumn', 'winter'] as const) emit(`oak_${v}_${s}`, 2 * TILE, 3 * TILE, ...tree(2 * TILE, 3 * TILE), 'object', oak(v, s));
for (let v = 0; v < 2; v++) for (const s of ['summer', 'winter'] as const) emit(`pine_${v}_${s}`, 2 * TILE, 3 * TILE, ...tree(2 * TILE, 3 * TILE), 'object', pine(v, s));
for (const full of [true, false]) for (const s of ['summer', 'winter'] as const) emit(`berry_${full ? 'full' : 'empty'}_${s}`, TILE, TILE + 24, TILE / 2, TILE + 10, 'object', berryBush(full, s));
for (let v = 0; v < 2; v++) emit(`rock_${v}`, TILE, TILE, TILE / 2, TILE - 12, 'object', rock(v, false));
emit('boulder', TILE * 1.5, TILE * 1.3, TILE * 0.75, TILE * 1.3 - 12, 'object', rock(0, true));
emit('stump', TILE, TILE, TILE / 2, TILE - 18, 'object', stump());
emit('sapling', TILE, TILE + 20, TILE / 2, TILE + 4, 'object', sapling());
for (const k of Object.keys(SPECS)) {
  for (const lit of [false, true]) {
    const b = building(k, lit);
    emit(`${k}${lit ? '_lit' : ''}`, b.w, b.h, b.ax, b.ay, lit ? 'night' : 'building', b.body);
  }
}
for (const look of ORCHARD_LOOKS) {
  const o = orchard(look);
  emit(`orchard_${look}`, o.w, o.h, o.ax, o.ay, 'building', o.body);
}
for (const [tw, th] of [[1, 1], [2, 2], [3, 2], [4, 3]]) {
  const b = site(tw, th);
  emit(`site_${tw}x${th}`, b.w, b.h, b.ax, b.ay, 'site', b.body);
}
for (const st of ['wild', 'tilled', 'wet'] as const) emit(`soil_${st}`, TILE, TILE, 0, TILE, 'field', soil(st));
const crops = JSON.parse(readFileSync('godot/content/crops.json', 'utf8')).CROPS as Record<string, { art: Parameters<typeof crop>[1] }>;
for (const [id, c] of Object.entries(crops)) for (let st = 0; st < 4; st++) emit(`crop_${id}_${st}`, TILE, TILE + 30, 0, TILE + 30, 'crop', crop(id, c.art, st));
for (const d of ['down', 'up', 'side'] as const) {
  emit(`person_body_${d}`, PW, PH, PAX, PAY, 'person', body(d));
  emit(`person_head_${d}`, PW, PH, PAX, PAY, 'person', head(d));
  for (let f = 0; f < 4; f++) emit(`person_legs_${d}_${f}`, PW, PH, PAX, PAY, 'person', legs(d, f));
  for (let h = 0; h < 3; h++) emit(`person_hair_${h}_${d}`, PW, PH, PAX, PAY, 'person', hair(h, d));
  for (const role of ['farmer', 'builder', 'gatherer', 'hauler', 'crafter']) emit(`person_hat_${role}_${d}`, PW, PH, PAX, PAY, 'person', hat(role, d));
}
for (const t of ['axe', 'pick', 'hoe', 'sickle', 'hammer', 'can']) emit(`tool_${t}`, PW, PH, PAX, PAY, 'tool', tool(t));
const resources = Object.keys(JSON.parse(readFileSync('godot/content/resources.json', 'utf8')).RESOURCES);
for (const r of resources) emit(`icon_${r}`, 64, 64, 32, 32, 'icon', icon(r));
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ tilePx: TILE, note: 'Provisional art generated by scripts/art/make-svgs.ts; replace files keeping name, size and anchor.', sprites: manifest }, null, 1) + '\n');
console.log(`${Object.keys(manifest).length} provisional sprites written to ${OUT}`);
