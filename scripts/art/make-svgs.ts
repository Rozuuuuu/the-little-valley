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
import { building, SPECS, stones } from './buildings';
import { PROPS } from './props';
import { oak, pine, berryBush, rock } from './environment';
import { orchard, ORCHARD_LOOKS } from './orchard';
import { animal, mineEntrance, penYard, quarryPit, SPECIES_ART } from './animals';

/** SVG sources for review and replacement (ignored by Godot's importer via .gdignore). */
const OUT = 'godot/art_src/generated';
/** What the game loads: every sprite's SVG plus its size and anchor, in one file. */
/** Retired: the game now ships the pixel art (scripts/pixel-art/export.ts); this bundle is kept for reference. */
const BUNDLE = 'godot/art_src/storybook-sprites.json';

interface Entry {
  /** Canvas size in art pixels (96 per tile). */
  w: number;
  h: number;
  /** Anchor in art pixels: drawn at the object's ground point. */
  ax: number;
  ay: number;
  kind: string;
  provisional: true;
  /** Named points in art pixels from the anchor (buildings: where smoke rises). */
  points?: Record<string, [number, number]>;
}
const manifest: Record<string, Entry> = {};

const sources: Record<string, string> = {};
function emit(name: string, w: number, h: number, ax: number, ay: number, kind: string, body: string, points?: Record<string, [number, number]>): void {
  const text = svg(w, h, body);
  writeFileSync(`${OUT}/${name}.svg`, text);
  sources[name] = text;
  manifest[name] = { w, h, ax, ay, kind, provisional: true, ...(points ? { points } : {}) };
}


// ---- trees, bushes, rocks --------------------------------------------------------------------

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

/** A wooden crate with rope: goods that fit in no store wait in one. */
function crate(): string {
  const W = TILE;
  const H = TILE;
  const cx = W / 2;
  const ground = H - 10;
  let body = groundShadow(cx + 4, ground + 2, 34, 9, SHADOW);
  body += shaded(rrect(cx - 30, ground - 44, 60, 44, 5), { tones: M.wood, outline: outlineOf(M.wood), shadow: 6, light: 4 });
  // Planks and a cross brace.
  body += `<path d="M${cx - 30},${ground - 22} H${cx + 30} M${cx - 26},${ground - 40} L${cx + 26},${ground - 4}" stroke="${outlineOf(M.wood)}" stroke-width="3" opacity="0.55" fill="none"/>`;
  body += `<path d="M${cx - 6},${ground - 44} V${ground}" stroke="${P.core.gold}" stroke-width="4" opacity="0.9"/>`;
  return body;
}

// ---- buildings -----------------------------------------------------------------------------

/** A construction site: a cleared dirt plot, a fieldstone foundation, a timber frame going up
 * and a stack of planks, for any footprint. */
function site(tw: number, th: number): { w: number; h: number; body: string; ax: number; ay: number } {
  const fw = tw * TILE;
  const fh = th * TILE;
  const W = fw + 24;
  const H = fh + 60;
  const x0 = 12;
  const yBase = H - 10;
  const top = yBase - fh + 10;
  const r = rng(tw * 7 + th);
  const so = M.soil;
  // Cleared, trodden earth with a ragged edge.
  let body = `<path d="${blob(x0 + fw / 2, (top + yBase) / 2, fw / 2 + 2, (yBase - top) / 2 + 2, tw * 13 + th, 0.06, 14)}" fill="${so[2]}"/>`;
  for (let i = 0; i < tw * th * 5; i++) body += `<path d="${blob(x0 + 10 + r() * (fw - 20), top + 8 + r() * (yBase - top - 16), 6 + r() * 10, 3 + r() * 4, 200 + i, 0.3, 7)}" fill="${r() < 0.5 ? so[3] : so[1]}" opacity="0.55"/>`;
  // Foundation: stones along the back and front edges, posts at the corners with beams.
  body += stones(x0 + 8, top + 2, fw - 16, 13, M.stone, 5 + tw);
  const postH = Math.min(70, 40 + fh * 0.2);
  for (const px of [x0 + 10, x0 + fw - 20]) {
    body += `<rect x="${px}" y="${top - postH + 10}" width="9" height="${postH}" rx="2" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/><rect x="${px}" y="${top - postH + 10}" width="3" height="${postH}" fill="${M.wood[3]}" opacity="0.7"/>`;
    body += `<rect x="${px}" y="${yBase - postH - 4}" width="9" height="${postH}" rx="2" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/><rect x="${px}" y="${yBase - postH - 4}" width="3" height="${postH}" fill="${M.wood[3]}" opacity="0.7"/>`;
  }
  body += `<rect x="${x0 + 6}" y="${top - postH + 8}" width="${fw - 12}" height="8" rx="2" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
  body += `<path d="M${x0 + 18},${top - postH + 16} L${x0 + fw * 0.4},${top + 6}" stroke="${M.wood[1]}" stroke-width="5" stroke-linecap="round"/>`;
  body += stones(x0 + 8, yBase - 16, fw - 16, 13, M.stone, 9 + tw);
  // A stack of planks and a ladder leaning on the frame.
  const sx = x0 + fw * 0.55;
  for (let i = 0; i < 3; i++) body += shaded(rrect(sx - i * 2, yBase - 34 - i * 7, Math.min(70, fw * 0.35), 8, 2), { tones: M.wood, outline: outlineOf(M.wood), shadow: 2, light: 1 });
  body += `<path d="M${x0 + fw - 30},${yBase - 6} L${x0 + fw - 48},${top - 30} M${x0 + fw - 18},${yBase - 6} L${x0 + fw - 36},${top - 30}" stroke="${M.wood[1]}" stroke-width="4" stroke-linecap="round"/>`;
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    const ly = yBase - 6 - t * (yBase - top + 24);
    const lx = x0 + fw - 30 - t * 18;
    body += `<path d="M${lx},${ly} h12" stroke="${M.wood[2]}" stroke-width="3"/>`;
  }
  return { w: W, h: H, body, ax: x0, ay: yBase };
}

// ---- fields and crops -------------------------------------------------------------------------

/** A field tile: wild (staked-out meadow), tilled (furrowed earth) or wet (dark, glistening). */
function soil(state: 'wild' | 'tilled' | 'wet'): string {
  const s = M.soil;
  const r = rng(state.length * 17);
  if (state === 'wild') {
    // Marked ground: rough grass with a few bare patches and corner stakes.
    let body = `<path d="${rrect(6, 6, TILE - 12, TILE - 12, 16)}" fill="${mix(s[3], P.ground.meadow[1] as string, 0.55)}" opacity="0.85"/>`;
    for (let i = 0; i < 18; i++) {
      const x = 12 + r() * (TILE - 24), y = 16 + r() * (TILE - 26);
      body += `<path d="M${x},${y} q-2,-7 -5,-9 M${x},${y} q1,-8 2,-11 M${x},${y} q3,-6 6,-8" stroke="${r() < 0.5 ? M.leaf[3] : M.leaf[2]}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    }
    for (const [x, y] of [[10, 12], [TILE - 14, 12], [10, TILE - 14], [TILE - 14, TILE - 14]]) body += `<path d="M${x},${y + 6} v-12" stroke="${M.wood[2]}" stroke-width="3.5" stroke-linecap="round"/><circle cx="${x}" cy="${y - 6}" r="2.5" fill="${P.core.gold}"/>`;
    return body;
  }
  const base = state === 'wet' ? s[1] : s[2];
  const ridgeC = state === 'wet' ? s[2] : s[3];
  const furrowC = state === 'wet' ? s[0] : s[1];
  let body = `<path d="${rrect(3, 3, TILE - 6, TILE - 6, 10)}" fill="${base}" stroke="${s[0]}" stroke-width="2.5"/>`;
  // Furrows: dark troughs with lit ridges, lumpy clods along them.
  for (let y = 15; y < TILE - 8; y += 14) {
    body += `<path d="M10,${y + 4} Q${TILE / 2},${y + 7} ${TILE - 10},${y + 4}" stroke="${furrowC}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    body += `<path d="M10,${y - 2} Q${TILE / 2},${y + 1} ${TILE - 10},${y - 2}" stroke="${ridgeC}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"/>`;
    for (let i = 0; i < 4; i++) body += `<circle cx="${12 + r() * (TILE - 24)}" cy="${y - 1 + r() * 3}" r="${1.5 + r() * 1.5}" fill="${ridgeC}"/>`;
  }
  if (state === 'wet') for (let i = 0; i < 6; i++) body += `<ellipse cx="${14 + r() * (TILE - 28)}" cy="${14 + r() * (TILE - 28)}" rx="4" ry="1.6" fill="#bfe2ea" opacity="0.55"/>`;
  return body;
}

/** A leaf blade from (x, y) toward angle `a` (radians), lit along its upper edge. */
function cropLeaf(x: number, y: number, len: number, wid: number, a: number, c: string, dark: string): string {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const nx = -Math.sin(a) * wid, ny = Math.cos(a) * wid;
  const mx = (x + ex) / 2, my = (y + ey) / 2;
  return `<path d="M${x.toFixed(1)},${y.toFixed(1)} Q${(mx + nx).toFixed(1)},${(my + ny).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} Q${(mx - nx).toFixed(1)},${(my - ny).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}Z" fill="${c}" stroke="${dark}" stroke-width="1.4"/>`
    + `<path d="M${x.toFixed(1)},${y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" stroke="${dark}" stroke-width="1" opacity="0.6" fill="none"/>`;
}

function crop(id: string, art: { leaf: string; leafDark: string; fruit: string; fruitDark: string; style: string }, stage: number): string {
  const W = TILE;
  const H = TILE + 30;
  const ground = H - 18;
  const r = rng(id.length * 101 + stage);
  const lightLeaf = mix(art.leaf, '#f4f0a0', 0.3);
  let body = '';
  const plants = [[22, -2], [50, 4], [76, -2], [36, -22], [64, -22]];
  // Back row first so the front row overlaps it.
  const order = [3, 4, 0, 1, 2];
  for (const i of order) {
    const [px, dy] = plants[i];
    const y = ground + dy;
    body += `<ellipse cx="${px + 2}" cy="${y + 1}" rx="${6 + stage * 3}" ry="${2 + stage}" fill="${M.soil[0]}" opacity="0.35"/>`;
    if (stage === 0) {
      body += cropLeaf(px, y, 9, 3.5, -2.3, art.leaf, art.leafDark) + cropLeaf(px, y, 9, 3.5, -0.85, lightLeaf, art.leafDark);
      continue;
    }
    if (art.style === 'grain') {
      // A clump of stalks, green then gold, with plump drooping heads.
      const h = [0, 26, 44, 54][stage];
      const stalk = stage === 3 ? art.fruitDark : art.leafDark;
      for (let k = 0; k < 5; k++) {
        const lean = (k - 2) * 3.5 + (r() - 0.5) * 3;
        const hh = h * (0.85 + r() * 0.2);
        body += `<path d="M${px + (k - 2) * 2},${y} Q${px + lean * 0.4},${y - hh * 0.5} ${px + lean},${y - hh}" stroke="${stalk}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
        if (stage === 1) body += cropLeaf(px + (k - 2) * 2, y - 4, 14, 2.5, -1.57 + (k - 2) * 0.35, art.leaf, art.leafDark);
        if (stage >= 2) {
          const hc = stage === 3 ? art.fruit : lightLeaf;
          const hd = stage === 3 ? art.fruitDark : art.leafDark;
          body += `<ellipse cx="${px + lean}" cy="${y - hh - 5}" rx="3.6" ry="8" fill="${hc}" stroke="${hd}" stroke-width="1.4" transform="rotate(${lean * 2} ${px + lean} ${y - hh - 5})"/>`;
          body += `<path d="M${px + lean - 1.5},${y - hh - 10} v8" stroke="${stage === 3 ? '#fff2b8' : '#e8f6c0'}" stroke-width="1.2" opacity="0.8"/>`;
        }
      }
      continue;
    }
    // Leafy crops: a rosette of broad leaves, lit from the upper left.
    const len = [0, 13, 19, 22][stage];
    const n = art.style === 'vine' ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI + (k / (n - 1)) * Math.PI + (r() - 0.5) * 0.3;
      const c = a < -1.6 ? lightLeaf : art.leaf;
      body += cropLeaf(px, y - 3, len * (0.8 + r() * 0.3), len * (art.style === 'vine' ? 0.5 : 0.32), a, c, art.leafDark);
    }
    if (stage === 3) {
      if (art.style === 'vine') {
        // A ribbed pumpkin with a stalk and a highlight.
        const fr = 13;
        body += `<path d="${blob(px, y - 2, fr * 1.15, fr * 0.85, i + 40, 0.05)}" fill="${art.fruit}" stroke="${art.fruitDark}" stroke-width="2.4"/>`;
        body += `<path d="M${px - 6},${y - 12} Q${px - 9},${y - 2} ${px - 6},${y + 8} M${px + 6},${y - 12} Q${px + 9},${y - 2} ${px + 6},${y + 8}" stroke="${art.fruitDark}" stroke-width="1.6" fill="none" opacity="0.8"/>`;
        body += `<path d="M${px},${y - 12} q1,-5 5,-7" stroke="${M.wood[1]}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
        body += `<ellipse cx="${px - 7}" cy="${y - 7}" rx="3.5" ry="2" fill="#fff4d8" opacity="0.6"/>`;
      } else {
        // A root's shoulder showing above the soil: white below, purple at the crown.
        body += `<path d="${blob(px, y - 2, 9, 7, i + 40, 0.05)}" fill="${art.fruit}" stroke="${art.fruitDark}" stroke-width="2"/>`;
        body += `<path d="M${px - 8},${y - 4} Q${px},${y - 13} ${px + 8},${y - 4} Q${px},${y - 7} ${px - 8},${y - 4}Z" fill="${art.fruitDark}" opacity="0.85"/>`;
        body += `<ellipse cx="${px - 3}" cy="${y - 1}" rx="2.5" ry="1.5" fill="#ffffff" opacity="0.7"/>`;
      }
    }
  }
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
    // Soldiers: an iron kettle helm (infantry), a green hood (archers), a plumed helm (knights).
    case 'helmet':
      return `<ellipse cx="${PAX}" cy="${cy + 8}" rx="${side ? 22 : 27}" ry="6" fill="${M.stone[1]}" stroke="${outlineOf(M.stone)}" stroke-width="3"/>` +
        shaded(smoothPath([[PAX - 18, cy + 8], [PAX - 17, cy - 8], [PAX, cy - 16], [PAX + 17, cy - 8], [PAX + 18, cy + 8]]), { tones: M.stone, outline: outlineOf(M.stone), shadow: 4, light: 3 });
    case 'hood':
      return shaded(smoothPath([[PAX - 21, cy + 22], [PAX - 21, cy - 4], [PAX - 4, cy - 18], [PAX + 6, cy - 22], [PAX + 21, cy - 4], [PAX + 21, cy + 22], [PAX + 12, cy + 4], [PAX - 12, cy + 4]]), { tones: M.leaf, outline: outlineOf(M.leaf), shadow: 5, light: 3 });
    case 'plume': {
      const helm = shaded(smoothPath([[PAX - 19, cy + 12], [PAX - 18, cy - 8], [PAX, cy - 15], [PAX + 18, cy - 8], [PAX + 19, cy + 12]]), { tones: M.stone, outline: outlineOf(M.stone), shadow: 4, light: 3 });
      const visor = side ? '' : `<path d="M${PAX - 12},${cy + 4} H${PAX + 12}" stroke="${outlineOf(M.stone)}" stroke-width="3"/>`;
      const plume = shaded(smoothPath([[PAX - 2, cy - 14], [PAX - 8, cy - 30], [PAX + 6, cy - 36], [PAX + 14, cy - 26], [PAX + 4, cy - 14]]), { tones: ['#8a2a24', '#c0443a', '#e0584a'], outline: '#5a1a16', shadow: 3, light: 2 });
      return plume + helm + visor;
    }
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
    // Soldiers' weapons, carried upright.
    case 'sword':
      return `<path d="M${hx + 2},${hy - 4} L${hx + 14},${hy - 52}" stroke="${M.stone[2]}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M${hx + 2},${hy - 4} L${hx + 14},${hy - 52}" stroke="${outlineOf(M.stone)}" stroke-width="1.5" opacity="0.6"/>` +
        `<path d="M${hx - 6},${hy - 10} L${hx + 12},${hy - 6}" stroke="${P.core.goldDeep}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M${hx},${hy} L${hx + 2},${hy - 6}" stroke="${M.wood[1]}" stroke-width="5" stroke-linecap="round"/>`;
    case 'bow':
      return `<path d="M${hx - 2},${hy + 14} Q${hx + 26},${hy - 22} ${hx + 2},${hy - 58}" stroke="${M.wood[2]}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<path d="M${hx - 2},${hy + 14} L${hx + 2},${hy - 58}" stroke="#e8dcc0" stroke-width="1.5"/>`;
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
writeFileSync('godot/art_src/.gdignore', '');
const tree = (W: number, H: number) => [W / 2, H - 18] as const;
for (let v = 0; v < 3; v++) for (const s of ['summer', 'autumn', 'winter'] as const) emit(`oak_${v}_${s}`, 2 * TILE, 3 * TILE, ...tree(2 * TILE, 3 * TILE), 'object', oak(v, s));
for (let v = 0; v < 2; v++) for (const s of ['summer', 'winter'] as const) emit(`pine_${v}_${s}`, 2 * TILE, 3 * TILE, ...tree(2 * TILE, 3 * TILE), 'object', pine(v, s));
for (const full of [true, false]) for (const s of ['summer', 'winter'] as const) emit(`berry_${full ? 'full' : 'empty'}_${s}`, TILE, TILE + 24, TILE / 2, TILE + 10, 'object', berryBush(full, s));
for (let v = 0; v < 2; v++) emit(`rock_${v}`, TILE, TILE, TILE / 2, TILE - 12, 'object', rock(v, false));
emit('boulder', TILE * 1.5, TILE * 1.3, TILE * 0.75, TILE * 1.3 - 12, 'object', rock(0, true));
emit('stump', TILE, TILE, TILE / 2, TILE - 18, 'object', stump());
emit('sapling', TILE, TILE + 20, TILE / 2, TILE + 4, 'object', sapling());
emit('crate', TILE, TILE, 0, TILE, 'building', crate());
for (const k of Object.keys(SPECS)) {
  for (const lit of [false, true]) {
    const b = building(k, lit);
    emit(`${k}${lit ? '_lit' : ''}`, b.w, b.h, b.ax, b.ay, lit ? 'night' : 'building', b.body, b.points);
  }
}
for (const [k, draw] of Object.entries(PROPS)) {
  for (const lit of [false, true]) {
    const b = draw(lit);
    if (b) emit(`${k}${lit ? '_lit' : ''}`, b.w, b.h, b.ax, b.ay, lit ? 'night' : 'building', b.body, b.points);
  }
}
for (const look of ORCHARD_LOOKS) {
  const o = orchard(look);
  emit(`orchard_${look}`, o.w, o.h, o.ax, o.ay, 'building', o.body);
}
for (const id of Object.keys(SPECIES_ART)) {
  for (const frame of [0, 1]) {
    const a = animal(id, frame);
    emit(`animal_${id}_${frame}`, a.w, a.h, a.ax, a.ay, 'animal', a.body);
  }
}
const buildingDefs = JSON.parse(readFileSync('godot/content/buildings.json', 'utf8')).BUILDINGS as Record<string, { size: { w: number; h: number }; pen?: unknown }>;
for (const [k, d] of Object.entries(buildingDefs)) {
  if (!d.pen) continue;
  const y = penYard(d.size.w, d.size.h, k);
  emit(k, y.w, y.h, y.ax, y.ay, 'pen', y.body);
}
for (let st = 0; st < 4; st++) {
  const q = quarryPit(st);
  emit(`quarry_${st}`, q.w, q.h, q.ax, q.ay, 'pen', q.body);
}
{
  const m = mineEntrance();
  emit('mine', m.w, m.h, m.ax, m.ay, 'building', m.body);
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
  for (const role of ['farmer', 'builder', 'gatherer', 'hauler', 'crafter', 'helmet', 'hood', 'plume']) emit(`person_hat_${role}_${d}`, PW, PH, PAX, PAY, 'person', hat(role, d));
}
for (const t of ['axe', 'pick', 'hoe', 'sickle', 'hammer', 'can', 'sword', 'bow']) emit(`tool_${t}`, PW, PH, PAX, PAY, 'tool', tool(t));
const resources = Object.keys(JSON.parse(readFileSync('godot/content/resources.json', 'utf8')).RESOURCES);
for (const r of resources) emit(`icon_${r}`, 64, 64, 32, 32, 'icon', icon(r));
const note = 'Provisional art generated by scripts/art/make-svgs.ts; replace files keeping name, size and anchor.';
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ tilePx: TILE, note, sprites: manifest }, null, 1) + '\n');
const bundle: Record<string, Entry & { svg: string }> = {};
for (const [name, e] of Object.entries(manifest)) bundle[name] = { ...e, svg: sources[name] };
writeFileSync(BUNDLE, JSON.stringify({ tilePx: TILE, note, sprites: bundle }) + '\n');
console.log(`${Object.keys(manifest).length} provisional sprites written to ${OUT} and bundled in ${BUNDLE}`);
