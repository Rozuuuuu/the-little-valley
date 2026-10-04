/**
 * A tiny kit for the provisional illustrated art: smooth blobs, a soft shadow band, a mint rim
 * light from the upper left, and coloured outlines (never black). See docs/godot/ART_STYLE.md.
 * Units are art pixels: 96 per tile.
 */

export const TILE = 96;

export interface Palette {
  core: Record<string, string>;
  ground: Record<string, string | string[]>;
  materials: Record<string, string[]>;
  people: { skin: string[]; hair: string[]; shirt: string[]; pants: string[]; outline: string };
  ui: Record<string, string>;
}

/** Deterministic random numbers (mulberry32), so the art is identical on every run. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** A smooth closed path through points (Catmull-Rom converted to cubic Béziers). */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

/** A wobbly ellipse: the basic organic shape. */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, wobble = 0.1, points = 9): string {
  const r = rng(seed);
  const pts: [number, number][] = [];
  const phase = r() * Math.PI * 2;
  for (let i = 0; i < points; i++) {
    const a = phase + (i / points) * Math.PI * 2;
    const k = 1 + (r() * 2 - 1) * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothPath(pts);
}

/** A rounded rectangle path. */
export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return `M${f(x + r)},${f(y)}H${f(x + w - r)}Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + r)}V${f(y + h - r)}Q${f(x + w)},${f(y + h)} ${f(x + w - r)},${f(y + h)}H${f(x + r)}Q${f(x)},${f(y + h)} ${f(x)},${f(y + h - r)}V${f(y + r)}Q${f(x)},${f(y)} ${f(x + r)},${f(y)}Z`;
}

export function poly(pts: [number, number][]): string {
  return 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join('L') + 'Z';
}

let clipCounter = 0;

export interface ShadeOpts {
  /** Darkest to lightest tones: [shadow, base, light] at least. */
  tones: string[];
  outline?: string;
  outlineWidth?: number;
  /** Shadow band offset toward the lower right (art px). */
  shadow?: number;
  /** Highlight offset toward the upper left and its scale. */
  light?: number;
  lightScale?: number;
  /** A thin mint rim on the upper-left edge. */
  rim?: string;
  extra?: string;
}

/**
 * One shaded shape, lit from the upper left: the whole shape in its dark tone; the base tone on
 * top, shifted up-left and clipped to the shape, which leaves a dark crescent on the lower-right
 * side; a smaller light shape further up-left; an optional mint rim on the lit edge; and an
 * outline in a dark tone of the object's own colour.
 */
export function shaded(d: string, o: ShadeOpts): string {
  const id = `c${clipCounter++}`;
  const t = o.tones;
  const dark = t[0];
  const base = t[Math.min(1, t.length - 1)];
  const light = t[Math.min(2, t.length - 1)];
  const sh = o.shadow ?? 10;
  const li = o.light ?? 8;
  const ls = o.lightScale ?? 0.72;
  const out = o.outline ? `<path d="${d}" fill="none" stroke="${o.outline}" stroke-width="${o.outlineWidth ?? 3}" stroke-linejoin="round"/>` : '';
  const rim = o.rim
    ? `<path d="${d}" fill="none" stroke="${o.rim}" stroke-width="5" stroke-opacity="0.6" clip-path="url(#${id}r)"/>`
    : '';
  return `<g>
<clipPath id="${id}"><path d="${d}"/></clipPath>
<clipPath id="${id}r"><path d="${d}" transform="translate(-5,-5)"/></clipPath>
<path d="${d}" fill="${dark}"/>
<g clip-path="url(#${id})">
<path d="${d}" fill="${base}" transform="translate(${-sh},${-sh})"/>
<path d="${d}" fill="${light}" opacity="0.9" transform="${scaleAbout(d, ls, -li - sh, -li - sh)}"/>
${o.extra ?? ''}
</g>
${rim}${out}
</g>`;
}

/** A transform that scales a path about its own approximate centre, then offsets it. */
function scaleAbout(d: string, s: number, dx: number, dy: number): string {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return `translate(${f(cx + dx)},${f(cy + dy)}) scale(${s}) translate(${f(-cx)},${f(-cy)})`;
}

/** The soft contact shadow every standing object casts on the ground. */
export function groundShadow(cx: number, cy: number, rx: number, ry: number, color: string, opacity = 0.32): string {
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${color}" opacity="${opacity}"/>`;
}

export function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
}

/** Mixes two #rrggbb colours (t = 0 gives a, 1 gives b). */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
