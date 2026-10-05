/**
 * Trees, bushes and rocks in the storybook style (docs/godot/ART_STYLE.md): full canopies built
 * from overlapping leaf clusters, each lit from the upper left with a cool shadow crescent on its
 * lower right, leafy edges, and soft highlights. Seeded, so the art is identical on every run.
 */
import { blob, groundShadow, mix, poly, rng, smoothPath, TILE } from './svg-kit';
import { M, SHADOW } from './palette';

let gradId = 0;

/** How lit a point is in a mass centred at (cx, cy): 1 at the upper-left edge, 0 lower right. */
function litAt(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  return Math.max(0, Math.min(1, 0.55 - ((x - cx) / rx) * 0.32 - ((y - cy) / ry) * 0.42));
}

/** A small pointed leaf at (x, y), rotated, in colour c. */
function leaf(x: number, y: number, len: number, wid: number, rot: number, c: string): string {
  return `<path transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(0)})" d="M${(-len / 2).toFixed(1)},0 Q0,${(-wid).toFixed(1)} ${(len / 2).toFixed(1)},0 Q0,${wid.toFixed(1)} ${(-len / 2).toFixed(1)},0Z" fill="${c}"/>`;
}

interface Lobe { x: number; y: number; r: number }

/**
 * A canopy: clusters arranged in a dome. Drawn back to front: a dark mass, each cluster's mid
 * tone shifted up-left (leaving a shadow crescent), light caps on the lit clusters, leaves
 * fringing the silhouette and scattered over the lit side, and a soft sunlit glow.
 */
function canopy(cx: number, cy: number, rx: number, ry: number, seed: number, tones: string[], opts: { lobes?: number; leafSize?: number; airy?: boolean } = {}): string {
  const r = rng(seed);
  const n = opts.lobes ?? 11;
  const ls = opts.leafSize ?? 1;
  const lobes: Lobe[] = [];
  // Outer ring of clusters, then a few inner ones; bigger toward the top so the dome reads.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    const k = 0.62 + r() * 0.12;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k * 0.92;
    const rad = Math.min(rx, ry) * (0.36 + r() * 0.12) * (Math.sin(a) < 0 ? 1.05 : 0.95);
    lobes.push({ x, y, r: rad });
  }
  for (let i = 0; i < (opts.airy ? 2 : 4); i++) lobes.push({ x: cx + (r() - 0.5) * rx * 0.6, y: cy + (r() - 0.6) * ry * 0.5, r: Math.min(rx, ry) * (0.4 + r() * 0.1) });
  // Draw lower clusters first so upper ones overlap them, as in a real crown.
  lobes.sort((a, b) => b.y - a.y);
  const dark = tones[0], d1 = tones[1], mid = tones[2], light = tones[3], hi = tones[4] ?? tones[3];
  let s = '';
  // The shadow mass, slightly larger than the clusters.
  for (const [i, l] of lobes.entries()) s += `<path d="${blob(l.x + 3, l.y + 4, l.r * 1.08, l.r * 1.0, seed * 7 + i, 0.14, 10)}" fill="${dark}"/>`;
  // Each cluster: deep tone, then mid tone shifted toward the light, then a lit cap.
  for (const [i, l] of lobes.entries()) {
    const lit = litAt(l.x, l.y, cx, cy, rx, ry);
    s += `<path d="${blob(l.x, l.y, l.r, l.r * 0.94, seed * 13 + i, 0.16, 11)}" fill="${d1}"/>`;
    s += `<path d="${blob(l.x - l.r * 0.12, l.y - l.r * 0.14, l.r * 0.86, l.r * 0.8, seed * 17 + i, 0.18, 11)}" fill="${lit > 0.35 ? mid : mix(d1, mid, 0.55)}"/>`;
    if (lit > 0.3) s += `<path d="${blob(l.x - l.r * 0.26, l.y - l.r * 0.3, l.r * 0.56, l.r * 0.46, seed * 19 + i, 0.2, 9)}" fill="${lit > 0.6 ? light : mix(mid, light, 0.6)}"/>`;
    if (lit > 0.58) s += `<path d="${blob(l.x - l.r * 0.36, l.y - l.r * 0.42, l.r * 0.26, l.r * 0.2, seed * 23 + i, 0.25, 7)}" fill="${hi}" opacity="0.9"/>`;
  }
  // Leaves: fringing every cluster's edge (in the cluster's tone) and dabbed over the lit side.
  for (const [i, l] of lobes.entries()) {
    const lit = litAt(l.x, l.y, cx, cy, rx, ry);
    const count = Math.round(l.r * 0.5 * ls);
    for (let k = 0; k < count; k++) {
      const a = r() * Math.PI * 2;
      const edge = l.r * (0.82 + r() * 0.22);
      const x = l.x + Math.cos(a) * edge;
      const y = l.y + Math.sin(a) * edge * 0.94;
      const side = 0.5 - Math.cos(a) * 0.3 - Math.sin(a) * 0.4;
      const t = Math.max(0, Math.min(1, lit * 0.7 + side * 0.5 + (r() - 0.5) * 0.25));
      const c = t > 0.75 ? light : t > 0.5 ? mid : t > 0.25 ? d1 : dark;
      s += leaf(x, y, (8 + r() * 6) * ls, (3 + r() * 2) * ls, (a * 180) / Math.PI + 90 + (r() - 0.5) * 50, c);
    }
    if (lit > 0.4) for (let k = 0; k < Math.round(l.r * 0.3 * ls); k++) {
      const x = l.x - l.r * 0.2 + (r() - 0.5) * l.r * 1.1;
      const y = l.y - l.r * 0.25 + (r() - 0.5) * l.r * 0.9;
      s += leaf(x, y, (7 + r() * 5) * ls, (2.5 + r() * 2) * ls, -30 + r() * 120, r() < 0.5 ? hi : light);
    }
    void i;
  }
  // A soft sunlit glow over the upper left of the whole crown.
  const g = `cg${gradId++}`;
  s += `<defs><radialGradient id="${g}" cx="0.3" cy="0.25" r="0.75"><stop offset="0" stop-color="#fff6c8" stop-opacity="0.28"/><stop offset="0.55" stop-color="#fff6c8" stop-opacity="0"/><stop offset="1" stop-color="#14302a" stop-opacity="0.22"/></radialGradient></defs>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 1.05}" ry="${ry * 1.02}" fill="url(#${g})"/>`;
  return s;
}

/** A tapering trunk with a root flare, bark streaks and two branches into the crown. */
function trunk(cx: number, ground: number, top: number, width: number, bark: string[], seed: number, birch = false): string {
  const r = rng(seed);
  const w = width;
  const lean = (r() - 0.5) * 8;
  let s = `<path d="${smoothPath([[cx - w * 1.1, ground + 2], [cx - w * 0.55, ground - 14], [cx - w * 0.42 + lean, top], [cx + w * 0.42 + lean, top], [cx + w * 0.55, ground - 14], [cx + w * 1.15, ground + 2], [cx, ground + 5]])}" fill="${bark[1]}"/>`;
  // Lit left side and shaded right side.
  s += `<path d="${poly([[cx - w * 0.75, ground], [cx - w * 0.45 + lean, top + 4], [cx - w * 0.05 + lean, top + 4], [cx - w * 0.1, ground]])}" fill="${bark[2]}" opacity="0.85"/>`;
  s += `<path d="${poly([[cx + w * 0.3, ground], [cx + w * 0.3 + lean, top + 4], [cx + w * 0.45 + lean, top + 4], [cx + w * 0.9, ground]])}" fill="${bark[0]}" opacity="0.6"/>`;
  if (birch) {
    for (let i = 0; i < 7; i++) {
      const y = ground - 10 - r() * (ground - top - 16);
      const x0 = cx - w * 0.45 + lean * (1 - (y - top) / (ground - top));
      s += `<path d="M${x0 + r() * w * 0.3},${y} q${w * 0.3},${-2 + r() * 3} ${w * (0.4 + r() * 0.4)},0" stroke="${bark[0]}" stroke-width="${2 + r() * 2}" stroke-linecap="round" fill="none" opacity="0.8"/>`;
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const x = cx - w * 0.3 + r() * w * 0.6;
      s += `<path d="M${x},${ground - 4} q${(r() - 0.5) * 4},${-(ground - top) * 0.4} ${(r() - 0.5) * 3},${-(ground - top) * (0.5 + r() * 0.3)}" stroke="${bark[0]}" stroke-width="1.5" fill="none" opacity="0.45"/>`;
    }
  }
  return s;
}

/** A branch fork from the trunk top into the crown. */
function branches(cx: number, top: number, bark: string[], spread: number): string {
  let s = '';
  for (const [dx, dy] of [[-spread, -36], [spread * 0.9, -40], [spread * 0.2, -52]]) {
    s += `<path d="M${cx},${top + 12} Q${cx + dx * 0.4},${top - 6} ${cx + dx},${top + dy}" stroke="${bark[1]}" stroke-width="7" stroke-linecap="round" fill="none"/>`;
    s += `<path d="M${cx - 1},${top + 10} Q${cx + dx * 0.4 - 2},${top - 8} ${cx + dx - 2},${top + dy}" stroke="${bark[2]}" stroke-width="2" fill="none" opacity="0.8"/>`;
  }
  return s;
}

/** Grass tufts at the tree's foot, so it sits in the meadow rather than on it. */
function footGrass(cx: number, ground: number, spread: number, seed: number): string {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < 9; i++) {
    const x = cx + (r() - 0.5) * spread * 2;
    const y = ground + 2 + r() * 6;
    const h = 7 + r() * 8;
    const c = r() < 0.5 ? M.leaf[2] : M.leaf[3];
    s += `<path d="M${x - 4},${y} q2,${-h * 0.6} ${-2},${-h} M${x},${y} q1,${-h * 0.7} ${2},${-h * 1.1} M${x + 4},${y} q0,${-h * 0.5} ${4},${-h * 0.8}" stroke="${c}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
  }
  return s;
}

/** Oaks: variants 0 and 1 are round broadleaf oaks; variant 2 is a birch with a white trunk. */
export function oak(variant: number, season: 'summer' | 'autumn' | 'winter'): string {
  const cx = TILE;
  const ground = TILE * 3 - 18;
  const birch = variant === 2;
  const bark = birch ? M.birchBark : M.bark;
  const shadowW = birch ? 48 : 72;
  let s = groundShadow(cx + 18, ground + 2, shadowW, 18, SHADOW, 0.38);
  const top = birch ? 130 : 178;
  s += trunk(cx, ground, top, birch ? 10 : 18, bark, 400 + variant, birch);
  if (season === 'winter') {
    // Bare branches with snow along their tops.
    s += branches(cx, top, M.bark, birch ? 26 : 40);
    const r = rng(77 + variant);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.15 + r() * 0.7);
      const len = 40 + r() * 40;
      const x0 = cx + (r() - 0.5) * 30;
      const y0 = top - 20 - r() * 30;
      const x1 = x0 + Math.cos(a) * len;
      const y1 = y0 + Math.sin(a) * len;
      s += `<path d="M${x0},${y0} Q${(x0 + x1) / 2 + 6},${(y0 + y1) / 2} ${x1},${y1}" stroke="${M.bark[1]}" stroke-width="${3 + r() * 2}" stroke-linecap="round" fill="none"/>`;
      s += `<path d="M${x0},${y0 - 2} Q${(x0 + x1) / 2 + 6},${(y0 + y1) / 2 - 2} ${x1},${y1 - 2}" stroke="${M.snow[2]}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.9"/>`;
    }
    return s + footGrass(cx, ground, 30, 9 + variant);
  }
  s += branches(cx, top, M.bark, birch ? 22 : 34);
  const tones = season === 'autumn' ? M.leafAutumn : birch ? M.birch : M.leaf;
  if (birch) {
    // Airy birch crown: a few separate clusters with sky between them, as in the reference.
    s += canopy(cx - 26, 120, 38, 36, 900 + variant, tones, { lobes: 6, airy: true, leafSize: 0.9 });
    s += canopy(cx + 28, 106, 36, 34, 910 + variant, tones, { lobes: 6, airy: true, leafSize: 0.9 });
    s += canopy(cx, 68, 42, 40, 920 + variant, tones, { lobes: 7, airy: true, leafSize: 0.9 });
  } else {
    const wide = variant === 0 ? 84 : 76;
    s += canopy(cx + (variant === 0 ? 0 : 4), 128 - variant * 6, wide, 86, 811 + variant * 67, tones, { lobes: variant === 0 ? 12 : 10 });
  }
  if (season === 'autumn') {
    // A few fallen leaves at the foot.
    const r = rng(5 + variant);
    for (let i = 0; i < 10; i++) s += leaf(cx + (r() - 0.5) * 110, ground - 4 + r() * 14, 7, 3, r() * 180, M.leafAutumn[2 + Math.floor(r() * 3)]);
  }
  return s + footGrass(cx, ground, 28, 9 + variant);
}

/** Pines: layered tiers of drooping, needle-fringed boughs, lit from the left. */
export function pine(variant: number, season: 'summer' | 'winter'): string {
  const cx = TILE;
  const ground = TILE * 3 - 18;
  const r = rng(903 + variant);
  const p = M.pine;
  let s = groundShadow(cx + 14, ground + 2, 54, 15, SHADOW, 0.38);
  s += trunk(cx, ground, ground - 50, 9, M.bark, 600 + variant);
  const tiers = 6;
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const width = (70 - tier * 10) * (1 + variant * 0.06);
    const y = ground - 36 - tier * 30;
    const tip = y - 58;
    // A bough: a drooping skirt with a jagged, needled hem.
    const hem: [number, number][] = [];
    const teeth = 9;
    for (let k = 0; k <= teeth; k++) {
      const x = cx + width - (k * 2 * width) / teeth;
      const sag = Math.cos(((x - cx) / width) * Math.PI * 0.5) * 8;
      hem.push([x, y + sag + (k % 2 ? -8 : 3)]);
    }
    const skirt: [number, number][] = [[cx, tip], [cx + width * 0.5, y - 26], ...hem, [cx - width * 0.5, y - 26]];
    s += `<path d="${poly(skirt)}" fill="${p[0]}"/>`;
    s += `<path d="${poly([[cx - 2, tip + 3], [cx + width * 0.3, y - 22], [cx + width * 0.55, y - 6], ...hem.slice(Math.floor(teeth / 2)).map(([x, yy]) => [x - 4, yy - 6] as [number, number]), [cx - width * 0.6, y - 14]])}" fill="${p[1]}"/>`;
    // The sunlit left half of the bough.
    s += `<path d="${poly([[cx - 2, tip + 4], [cx + 6, y - 30], [cx - width * 0.15, y - 6], [cx - width * 0.92, y - 2], [cx - width * 0.55, y - 22]])}" fill="${p[2]}"/>`;
    s += `<path d="${poly([[cx - 4, tip + 10], [cx - width * 0.2, y - 24], [cx - width * 0.62, y - 12], [cx - width * 0.35, y - 30]])}" fill="${p[3]}" opacity="0.9"/>`;
    // Needle strokes along the hem and over the lit side.
    for (let k = 0; k < 16; k++) {
      const u = r();
      const x = cx + (u * 2 - 1) * width * 0.9;
      const yy = y - 4 - r() * 34 * (1 - Math.abs(u * 2 - 1));
      const c = x < cx ? (r() < 0.5 ? p[3] : '#7ea85a') : p[1];
      s += `<path d="M${x.toFixed(1)},${yy.toFixed(1)} l${x < cx ? -6 : 6},9" stroke="${c}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>`;
    }
    if (season === 'winter') s += `<path d="${poly([[cx, tip + 2], [cx - width * 0.75, y - 8], [cx - width * 0.3, y - 16], [cx + width * 0.1, y - 12], [cx + width * 0.55, y - 14]])}" fill="${M.snow[2]}" opacity="0.95"/>`;
    void t;
  }
  return s + footGrass(cx, ground, 22, 31 + variant);
}

export function berryBush(full: boolean, season: 'summer' | 'winter'): string {
  let s = groundShadow(54, 106, 40, 11, SHADOW, 0.38);
  s += canopy(48, 76, 38, 28, 61, season === 'winter' ? [M.stone[0], M.stone[1], M.stone[2], M.stone[3], M.snow[1]] : M.leaf, { lobes: 7, leafSize: 0.8 });
  if (season === 'winter') s += `<path d="${blob(44, 58, 30, 10, 29)}" fill="${M.snow[2]}"/>`;
  else if (full) {
    const r = rng(12);
    for (const [x, y] of [[28, 72], [56, 84], [64, 62], [38, 90], [46, 64], [70, 78]]) {
      for (let j = 0; j < 3; j++) {
        const bx = x + (r() - 0.5) * 8, by = y + (r() - 0.5) * 6;
        s += `<circle cx="${bx}" cy="${by}" r="4" fill="${M.berry[1]}"/><circle cx="${bx + 1}" cy="${by + 1}" r="2.6" fill="${M.berry[0]}" opacity="0.5"/><circle cx="${bx - 1.3}" cy="${by - 1.3}" r="1.3" fill="#ffe6e0"/>`;
      }
    }
  }
  return s;
}

export function rock(variant: number, big: boolean): string {
  const w = big ? TILE * 1.5 : TILE;
  const h = big ? TILE * 1.3 : TILE;
  const cx = w / 2, ground = h - 12, rx = big ? 58 : 34, ry = big ? 46 : 26;
  const r = rng(55 + variant * 19);
  const st = M.stone;
  let s = groundShadow(cx + 8, ground, rx * 1.05, 10, SHADOW, 0.4);
  const left = cx - rx, right = cx + rx, top = ground - ry * 1.8;
  // Body, then facets: a sunlit top plane, a lit left face, a shaded right face.
  const body = smoothPath([[left, ground - 8], [left + 6, top + 16], [cx - 10, top], [right - 10, top + 8], [right, ground - 12], [cx + 16, ground + 2], [left + 14, ground + 1]]);
  s += `<path d="${body}" fill="${st[1]}"/>`;
  s += `<path d="${poly([[cx + 4, top + 14], [right - 10, top + 8], [right, ground - 12], [cx + 16, ground + 1], [cx + 8, ground - 18]])}" fill="${st[0]}" opacity="0.75"/>`;
  s += `<path d="${smoothPath([[left + 6, top + 16], [cx - 10, top + 1], [right - 14, top + 9], [cx + 6, top + 18], [left + 10, top + 24]])}" fill="${st[3]}"/>`;
  s += `<path d="${poly([[left + 4, top + 22], [cx + 4, top + 18], [cx + 6, ground - 18], [left + 6, ground - 10]])}" fill="${st[2]}" opacity="0.9"/>`;
  s += `<path d="M${cx + 5},${top + 18} L${cx + 7},${ground - 16} M${cx - 12},${top + 30} l-8,12" stroke="${st[0]}" stroke-width="2" opacity="0.55" fill="none" stroke-linecap="round"/>`;
  // Moss on the top and a couple of grass blades at the base.
  for (let i = 0; i < 5; i++) s += `<path d="${blob(cx - rx * 0.5 + r() * rx * 0.9, top + 8 + r() * 10, 5 + r() * 6, 3 + r() * 2, 300 + i + variant * 9, 0.3, 7)}" fill="${r() < 0.5 ? M.leaf[3] : M.leaf[2]}" opacity="0.85"/>`;
  s += footGrass(cx, ground - 2, rx * 0.9, 70 + variant);
  return s;
}
