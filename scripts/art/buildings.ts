/**
 * Building art: one spec per building type (footprint, roof shape and colour, walls, door,
 * chimney, and a feature that makes its silhouette distinct), drawn by one function. Each is
 * drawn twice: by day, and the night overlay (lit windows, furnace glow) added above the night tint.
 */
import { M, OUTLINE, outlineOf, P, RIM, SHADOW } from './palette';
import { blob, groundShadow, poly, rrect, shaded, smoothPath, TILE } from './svg-kit';

type Roof = 'gable' | 'hip' | 'barn' | 'dome' | 'none';

interface Frame {
  x0: number;
  fw: number;
  yBase: number;
  wallTop: number;
  eave: number;
  ridge: number;
}

interface BuildingSpec {
  size: [number, number];
  /** Height of the roof above the walls (art px). */
  rise: number;
  wall: string[];
  roof: string[];
  shape: Roof;
  chimney?: boolean;
  door?: 'plain' | 'barn' | 'arch' | 'none';
  windows?: number;
  /** Extra drawing in front of the roof: the building's distinguishing feature. */
  extra?: (f: Frame) => string;
  /** Extra light at night (furnace glow, oven, lamps). */
  glow?: (f: Frame) => string;
}

const CLOTH = [P.people.shirt[4], P.people.shirt[1], '#9fc3dd'];

export const SPECS: Record<string, BuildingSpec> = {
  townHall: {
    size: [4, 3], rise: 150, wall: M.wall, roof: M.roofRed, shape: 'hip', windows: 4,
    extra: (f) => {
      // Bell cupola and a gold pennant: the hall's landmark silhouette.
      const cx = f.x0 + f.fw / 2;
      return shaded(rrect(cx - 22, f.ridge + 4, 44, 44, 6), { tones: M.wall, outline: outlineOf(M.wall), shadow: 6, light: 4 })
        + shaded(poly([[cx - 32, f.ridge + 8], [cx, f.ridge - 30], [cx + 32, f.ridge + 8]]), { tones: M.roofRed, outline: outlineOf(M.roofRed), shadow: 7, light: 5 })
        + `<circle cx="${cx}" cy="${f.ridge + 26}" r="8" fill="${P.core.gold}" stroke="${P.core.goldDeep}" stroke-width="3"/>`
        + `<path d="M${cx},${f.ridge - 30} V${f.ridge - 72}" stroke="${M.wood[0]}" stroke-width="4"/>`
        + `<path d="M${cx},${f.ridge - 72} L${cx + 34},${f.ridge - 62} L${cx},${f.ridge - 52}Z" fill="${P.core.gold}" stroke="${P.core.goldDeep}" stroke-width="2"/>`;
    },
  },
  house: { size: [2, 2], rise: 96, wall: M.wall, roof: M.roofRed, shape: 'gable', chimney: true, windows: 1 },
  familyHome: {
    size: [3, 2], rise: 100, wall: M.wall, roof: M.roofRed, shape: 'gable', chimney: true, windows: 2,
    extra: (f) => {
      // A porch roof over the door and a washing line.
      const cx = f.x0 + f.fw / 2;
      return shaded(poly([[cx - 40, f.wallTop + 24], [cx, f.wallTop + 4], [cx + 40, f.wallTop + 24]]), { tones: M.wood, outline: outlineOf(M.wood), shadow: 4, light: 3 })
        + `<path d="M${f.x0 + 4},${f.wallTop + 10} Q${f.x0 + 30},${f.wallTop + 22} ${f.x0 + 56},${f.wallTop + 10}" stroke="${M.wood[1]}" stroke-width="2" fill="none"/>`
        + `<rect x="${f.x0 + 18}" y="${f.wallTop + 14}" width="10" height="14" fill="${P.people.shirt[1]}"/><rect x="${f.x0 + 34}" y="${f.wallTop + 15}" width="10" height="12" fill="${P.people.shirt[2]}"/>`;
    },
  },
  cottage: {
    size: [3, 2], rise: 96, wall: M.wall, roof: M.roofSlate, shape: 'gable', chimney: true, windows: 2,
    extra: (f) => {
      let out = '';
      for (const bx of [f.x0 + 18, f.x0 + f.fw - 54]) {
        out += `<rect x="${bx}" y="${f.wallTop + 50}" width="36" height="9" rx="3" fill="${M.wood[2]}"/>`
          + `<circle cx="${bx + 8}" cy="${f.wallTop + 48}" r="5" fill="${M.berry[2]}"/><circle cx="${bx + 20}" cy="${f.wallTop + 47}" r="5" fill="${P.core.gold}"/><circle cx="${bx + 30}" cy="${f.wallTop + 48}" r="5" fill="${M.berry[1]}"/>`;
      }
      return out;
    },
  },
  storehouse: { size: [3, 2], rise: 80, wall: M.wood.slice(1), roof: M.roofSlate, shape: 'barn', door: 'barn', windows: 2 },
  granary: {
    size: [3, 2], rise: 90, wall: M.wood.slice(1), roof: M.roofRed, shape: 'barn', door: 'barn', windows: 0,
    extra: (f) => [0, 1, 2].map((i) => shaded(blob(f.x0 + 18 + i * 16, f.yBase - 18, 10, 12, 30 + i, 0.08), { tones: M.wheat, outline: M.wheat[0], shadow: 3, light: 2 })).join(''),
  },
  workshop: {
    size: [3, 2], rise: 84, wall: M.wood.slice(1), roof: M.roofSlate, shape: 'gable', chimney: true, windows: 1,
    extra: (f) => {
      // A sawhorse with a plank out front.
      const x = f.x0 + f.fw;
      return `<path d="M${x - 70},${f.yBase - 6} l10,-22 l10,22 M${x - 34},${f.yBase - 6} l10,-22 l10,22" stroke="${M.wood[1]}" stroke-width="4" fill="none"/>`
        + shaded(rrect(x - 78, f.yBase - 34, 70, 9, 3), { tones: M.wood.slice(1), outline: outlineOf(M.wood), shadow: 2, light: 2 });
    },
  },
  mill: {
    size: [2, 2], rise: 150, wall: M.stone.slice(1), roof: M.wood, shape: 'dome', door: 'arch', windows: 1,
    extra: (f) => {
      // Four canvas sails on a hub: the mill's unmistakable silhouette.
      const cx = f.x0 + f.fw / 2;
      const cy = f.ridge + 30;
      let out = '';
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const ex = cx + Math.cos(a) * 88;
        const ey = cy + Math.sin(a) * 88;
        const px = -Math.sin(a) * 13;
        const py = Math.cos(a) * 13;
        const sx = cx + Math.cos(a) * 24;
        const sy = cy + Math.sin(a) * 24;
        out += `<path d="M${cx},${cy} L${ex},${ey}" stroke="${M.wood[0]}" stroke-width="5"/>`;
        out += `<path d="${poly([[sx, sy], [ex, ey], [ex + px, ey + py], [sx + px, sy + py]])}" fill="${M.wall[2]}" stroke="${outlineOf(M.wall)}" stroke-width="2.5" opacity="0.95"/>`;
      }
      return out + `<circle cx="${cx}" cy="${cy}" r="9" fill="${M.wood[1]}" stroke="${outlineOf(M.wood)}" stroke-width="3"/>`;
    },
  },
  bakery: {
    size: [3, 2], rise: 90, wall: ['#9a5a40', '#b8704f', '#cf8a64'], roof: M.roofSlate, shape: 'gable', chimney: true, windows: 1,
    extra: (f) => {
      // A striped awning over the shop window.
      let out = '';
      for (let i = 0; i < 6; i++) {
        out += `<path d="${poly([[f.x0 + 20 + i * 14, f.wallTop + 22], [f.x0 + 34 + i * 14, f.wallTop + 22], [f.x0 + 32 + i * 14, f.wallTop + 38], [f.x0 + 18 + i * 14, f.wallTop + 38]])}" fill="${i % 2 ? M.wall[2] : M.berry[2]}"/>`;
      }
      return out + `<path d="M${f.x0 + 18},${f.wallTop + 38} H${f.x0 + 104}" stroke="${M.berry[0]}" stroke-width="3"/>`;
    },
    glow: (f) => `<rect x="${f.x0 + 4}" y="${f.wallTop + 20}" width="40" height="30" rx="10" fill="${P.core.gold}" opacity="0.35"/>`,
  },
  charcoalKiln: {
    size: [2, 2], rise: 60, wall: M.stone, roof: M.stone, shape: 'dome', door: 'arch', windows: 0,
    glow: (f) => `<ellipse cx="${f.x0 + f.fw / 2}" cy="${f.yBase - 24}" rx="16" ry="12" fill="${P.core.gold}" opacity="0.85"/>`,
  },
  smelter: {
    size: [2, 2], rise: 110, wall: M.stone, roof: M.stone, shape: 'none', door: 'arch', windows: 0,
    extra: (f) => shaded(rrect(f.x0 + f.fw / 2 - 26, f.ridge, 52, f.wallTop - f.ridge + 10, 10), { tones: M.stone, outline: outlineOf(M.stone), shadow: 8, light: 5, rim: RIM }),
    glow: (f) => `<ellipse cx="${f.x0 + f.fw / 2}" cy="${f.yBase - 26}" rx="14" ry="12" fill="#f0a24a" opacity="0.9"/>`,
  },
  forge: {
    size: [3, 2], rise: 84, wall: M.stone.slice(1), roof: M.roofSlate, shape: 'gable', chimney: true, windows: 0,
    extra: (f) => {
      // The anvil out front.
      const x = f.x0 + f.fw;
      return shaded(poly([[x - 70, f.yBase - 26], [x - 26, f.yBase - 26], [x - 34, f.yBase - 16], [x - 40, f.yBase - 6], [x - 56, f.yBase - 6], [x - 62, f.yBase - 16]]), { tones: M.stone, outline: outlineOf(M.stone), shadow: 3, light: 2 });
    },
    glow: (f) => `<rect x="${f.x0 + 24}" y="${f.yBase - 52}" width="34" height="26" rx="8" fill="#f0a24a" opacity="0.9"/>`,
  },
  tannery: {
    size: [3, 2], rise: 76, wall: M.wood.slice(1), roof: M.wood, shape: 'gable', windows: 1,
    extra: (f) => {
      // Drying racks with hides.
      const x = f.x0 + f.fw;
      return `<path d="M${x - 70},${f.yBase} V${f.yBase - 50} M${x - 14},${f.yBase} V${f.yBase - 50} M${x - 74},${f.yBase - 46} H${x - 10}" stroke="${M.wood[0]}" stroke-width="4"/>`
        + `<path d="${blob(x - 54, f.yBase - 30, 12, 15, 4)}" fill="#b0855a" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`
        + `<path d="${blob(x - 30, f.yBase - 30, 12, 15, 9)}" fill="#9a7048" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
    },
  },
  weaver: {
    size: [2, 2], rise: 90, wall: M.wall, roof: M.roofRed, shape: 'gable', windows: 1,
    // Bolts of cloth by the door.
    extra: (f) => [0, 1].map((i) => shaded(rrect(f.x0 + 8 + i * 22, f.yBase - 30, 18, 26, 6), { tones: CLOTH, outline: OUTLINE, shadow: 3, light: 2 })).join(''),
  },
  hunterLodge: {
    size: [2, 2], rise: 96, wall: ['#5b3d2a', '#7a5238', '#9c6d4b'], roof: M.wood, shape: 'gable', windows: 1,
    extra: (f) => {
      // Log ends at the corners, antlers over the door and a hide on a frame.
      const cx = f.x0 + f.fw / 2;
      let out = '';
      for (let i = 0; i < 4; i++) out += `<circle cx="${f.x0 + 4}" cy="${f.wallTop + 12 + i * 16}" r="6" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/><circle cx="${f.x0 + f.fw - 4}" cy="${f.wallTop + 12 + i * 16}" r="6" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
      out += `<path d="M${cx - 4},${f.wallTop + 6} l-10,-14 m5,7 l-9,-3 M${cx + 4},${f.wallTop + 6} l10,-14 m-5,7 l9,-3" stroke="#d9c49c" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
      return out + `<path d="M${f.x0 + f.fw + 6},${f.yBase} V${f.yBase - 46} M${f.x0 + f.fw + 34},${f.yBase} V${f.yBase - 46} M${f.x0 + f.fw + 2},${f.yBase - 44} H${f.x0 + f.fw + 38}" stroke="${M.wood[0]}" stroke-width="4"/>`
        + `<path d="${blob(f.x0 + f.fw + 20, f.yBase - 26, 13, 16, 12)}" fill="#a87c52" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
    },
  },
  fisherHut: {
    size: [2, 2], rise: 84, wall: M.wood.slice(1), roof: M.roofSlate, shape: 'gable', windows: 1,
    extra: (f) => {
      // Nets hung to dry and a fish basket.
      const x = f.x0 + f.fw;
      return `<path d="M${x - 6},${f.yBase} V${f.yBase - 52} M${x + 30},${f.yBase} V${f.yBase - 52}" stroke="${M.wood[0]}" stroke-width="4"/>`
        + `<path d="M${x - 6},${f.yBase - 48} Q${x + 12},${f.yBase - 20} ${x + 30},${f.yBase - 48}" stroke="${P.core.sage}" stroke-width="2" fill="${P.core.sage}" fill-opacity="0.25"/>`
        + `<path d="M${x - 4},${f.yBase - 40} l30,0 M${x},${f.yBase - 32} l22,0" stroke="${P.core.sage}" stroke-width="1.5"/>`
        + shaded(rrect(f.x0 + 6, f.yBase - 22, 26, 20, 7), { tones: M.wheat, outline: M.wheat[0], shadow: 3, light: 2 });
    },
  },
  waystation: {
    size: [3, 2], rise: 110, wall: M.wall, roof: M.roofSlate, shape: 'hip', windows: 2, chimney: true,
    extra: (f) => {
      // A banner pole: the new settlement's flag.
      const x = f.x0 + f.fw - 10;
      return `<path d="M${x},${f.yBase} V${f.ridge - 30}" stroke="${M.wood[0]}" stroke-width="4"/>`
        + `<path d="M${x},${f.ridge - 30} l30,8 l-30,10Z" fill="${P.core.mint}" stroke="${P.core.forest}" stroke-width="2"/>`;
    },
  },
  depot: {
    size: [3, 2], rise: 84, wall: M.wood.slice(1), roof: M.roofRed, shape: 'barn', door: 'barn', windows: 1,
    extra: (f) => {
      // A loaded cart by the door.
      const x = f.x0 + f.fw - 70;
      return shaded(rrect(x, f.yBase - 30, 56, 20, 4), { tones: M.wood, outline: outlineOf(M.wood), shadow: 3, light: 2 })
        + shaded(rrect(x + 6, f.yBase - 42, 44, 14, 4), { tones: M.wheat, outline: M.wheat[0], shadow: 2, light: 2 })
        + `<circle cx="${x + 12}" cy="${f.yBase - 6}" r="8" fill="${M.wood[0]}"/><circle cx="${x + 44}" cy="${f.yBase - 6}" r="8" fill="${M.wood[0]}"/>`;
    },
  },
  inn: {
    size: [3, 2], rise: 110, wall: M.wall, roof: M.roofRed, shape: 'gable', chimney: true, windows: 3,
    extra: (f) => {
      // A hanging sign with a tankard.
      const x = f.x0 + f.fw - 6;
      return `<path d="M${x},${f.wallTop + 6} h22 M${x + 18},${f.wallTop + 6} v8" stroke="${M.wood[0]}" stroke-width="3"/>`
        + shaded(rrect(x + 6, f.wallTop + 14, 26, 20, 4), { tones: M.wood, outline: outlineOf(M.wood), shadow: 2, light: 2 })
        + `<path d="${rrect(x + 13, f.wallTop + 18, 10, 12, 2)}" fill="${P.core.gold}"/>`;
    },
    glow: (f) => `<rect x="${f.x0 + 10}" y="${f.wallTop + 24}" width="${f.fw - 20}" height="22" rx="8" fill="${P.core.gold}" opacity="0.3"/>`,
  },
  barracks: {
    size: [3, 2], rise: 80, wall: M.stone.slice(1), roof: M.roofSlate, shape: 'gable', door: 'arch', windows: 2,
    extra: (f) => {
      // A weapon rack and a red pennant.
      const x = f.x0 + f.fw;
      return `<path d="M${x - 60},${f.yBase} V${f.yBase - 40} M${x - 20},${f.yBase} V${f.yBase - 40} M${x - 64},${f.yBase - 36} H${x - 16}" stroke="${M.wood[0]}" stroke-width="4"/>`
        + [0, 1, 2].map((i) => `<path d="M${x - 52 + i * 14},${f.yBase - 6} V${f.yBase - 48}" stroke="#b9c6c4" stroke-width="3"/>`).join('')
        + `<path d="M${f.x0 + 10},${f.ridge + 20} V${f.ridge - 26}" stroke="${M.wood[0]}" stroke-width="3"/><path d="M${f.x0 + 10},${f.ridge - 26} l26,8 l-26,8Z" fill="#a53a3a"/>`;
    },
  },
  archeryRange: {
    size: [3, 2], rise: 60, wall: M.wood.slice(1), roof: M.roofSlate, shape: 'gable', windows: 0,
    extra: (f) => {
      // Two straw targets.
      const x = f.x0 + f.fw;
      return [0, 1].map((i) => `<circle cx="${x - 60 + i * 34}" cy="${f.yBase - 26}" r="14" fill="${M.wheat[2]}" stroke="${M.wheat[0]}" stroke-width="2"/><circle cx="${x - 60 + i * 34}" cy="${f.yBase - 26}" r="8" fill="#c8483e"/><circle cx="${x - 60 + i * 34}" cy="${f.yBase - 26}" r="3" fill="${M.wheat[2]}"/>`).join('');
    },
  },
  travelCamp: {
    size: [3, 2], rise: 40, wall: ['#7d6a4c', '#a8916a', '#cdb88e'], roof: ['#7d6a4c', '#a8916a', '#cdb88e'], shape: 'none', door: 'none', windows: 0,
    extra: (f) => {
      // Two tents and a campfire.
      const t = (cx: number) => shaded(poly([[cx - 30, f.yBase - 4], [cx, f.yBase - 52], [cx + 30, f.yBase - 4]]), { tones: ['#7d6a4c', '#a8916a', '#cdb88e'], outline: '#5a4a32', shadow: 4, light: 3 });
      return t(f.x0 + 50) + t(f.x0 + 150) + `<circle cx="${f.x0 + 100}" cy="${f.yBase - 10}" r="9" fill="#5a4030"/><path d="M${f.x0 + 94},${f.yBase - 12} q6,-20 12,0Z" fill="${P.core.gold}"/>`;
    },
    glow: (f) => `<circle cx="${f.x0 + 100}" cy="${f.yBase - 16}" r="16" fill="${P.core.gold}" opacity="0.6"/>`,
  },
  watchtower: {
    size: [1, 1], rise: 150, wall: M.wood.slice(1), roof: M.roofRed, shape: 'none', door: 'none', windows: 0,
    extra: (f) => {
      const cx = f.x0 + f.fw / 2;
      return `<path d="M${f.x0 + 12},${f.yBase} L${cx - 10},${f.ridge + 30} M${f.x0 + f.fw - 12},${f.yBase} L${cx + 10},${f.ridge + 30} M${f.x0 + 18},${f.yBase - 30} L${f.x0 + f.fw - 18},${f.yBase - 60} M${f.x0 + f.fw - 18},${f.yBase - 30} L${f.x0 + 18},${f.yBase - 60}" stroke="${M.wood[0]}" stroke-width="5"/>`
        + shaded(rrect(cx - 26, f.ridge + 10, 52, 24, 4), { tones: M.wood, outline: outlineOf(M.wood), shadow: 3, light: 2 })
        + shaded(poly([[cx - 32, f.ridge + 12], [cx, f.ridge - 20], [cx + 32, f.ridge + 12]]), { tones: M.roofRed, outline: outlineOf(M.roofRed), shadow: 4, light: 3 });
    },
  },
  stable: {
    size: [3, 2], rise: 92, wall: ['#7a3f30', '#9c5240', '#bd6d56'], roof: M.roofSlate, shape: 'barn', door: 'barn', windows: 2,
    extra: (f) => {
      // Hay bales by the wall and a horseshoe over the door.
      const cx = f.x0 + f.fw / 2;
      return [0, 1].map((i) => shaded(rrect(f.x0 + 6 + i * 30, f.yBase - 24, 28, 22, 5), { tones: M.wheat, outline: M.wheat[0], shadow: 3, light: 2 })).join('')
        + `<path d="M${cx - 9},${f.wallTop + 8} a9,9 0 1,1 18,0" stroke="${P.core.gold}" stroke-width="4" fill="none"/>`;
    },
  },
  well: {
    size: [1, 1], rise: 70, wall: M.stone, roof: M.roofRed, shape: 'none', door: 'none', windows: 0,
    extra: (f) => {
      const cx = f.x0 + f.fw / 2;
      return `<path d="M${f.x0 + 14},${f.yBase - 20} V${f.ridge + 10} M${f.x0 + f.fw - 14},${f.yBase - 20} V${f.ridge + 10}" stroke="${M.wood[1]}" stroke-width="5"/>`
        + shaded(poly([[f.x0 + 4, f.ridge + 14], [cx, f.ridge - 10], [f.x0 + f.fw - 4, f.ridge + 14]]), { tones: M.roofRed, outline: outlineOf(M.roofRed), shadow: 5, light: 4 })
        + `<path d="M${cx},${f.ridge + 14} V${f.ridge + 34}" stroke="${M.wood[0]}" stroke-width="2"/>`
        + `<rect x="${cx - 7}" y="${f.ridge + 34}" width="14" height="12" rx="3" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="2"/>`;
    },
  },
};

/** A building in footprint coordinates: walls in front, roof rising `rise` px above. */
export function building(kind: string, lit: boolean): { w: number; h: number; body: string; ax: number; ay: number; points: Record<string, [number, number]> } {
  const sp = SPECS[kind];
  const fw = sp.size[0] * TILE;
  const fh = sp.size[1] * TILE;
  const W = fw + 24;
  const H = fh + sp.rise + 12;
  const x0 = 12;
  const yBase = H - 10;
  const wallTop = kind === 'well' ? yBase - 44 : yBase - fh * 0.62;
  const eave = wallTop + 8;
  const ridge = eave - sp.rise;
  const fr: Frame = { x0, fw, yBase, wallTop, eave, ridge };
  // Where smoke rises, relative to the anchor: the chimney top, else the middle of the roof ridge.
  const points: Record<string, [number, number]> = { top: [fw / 2, ridge + 6 - yBase] };
  if (sp.chimney) points.chimney = [fw * 0.72 + 10, ridge + (sp.shape === 'gable' ? 26 : 30) - yBase];
  const wall = sp.wall;
  let body = lit ? '' : groundShadow(x0 + fw / 2 + 10, yBase - 4, fw / 2 + 10, 16, SHADOW, 0.28);
  if (!lit) {
    if (kind === 'well') {
      body += shaded(blob(x0 + fw / 2, yBase - 22, fw / 2 - 6, 22, 7, 0.05, 12), { tones: wall, outline: outlineOf(wall), shadow: 6, light: 4 });
      body += `<ellipse cx="${x0 + fw / 2}" cy="${yBase - 34}" rx="${fw / 2 - 16}" ry="9" fill="${(P.ground.deep as string[])[1]}"/>`;
    } else {
      body += shaded(rrect(x0 + 6, wallTop, fw - 12, yBase - wallTop - 4, 6), { tones: wall, outline: outlineOf(wall), shadow: 10, light: 6 });
    }
  }
  // Windows: dark teal glass by day, warm light at night.
  const winY = wallTop + 26;
  const glass = lit ? M.glassLit[1] : P.core.tealMid;
  const nWin = sp.windows ?? 1;
  const doorStyle = sp.door ?? 'plain';
  const doorW = doorStyle === 'barn' ? 56 : 30;
  const doorX = x0 + fw / 2 - doorW / 2;
  const doorH = doorStyle === 'barn' ? 62 : 46;
  for (let i = 0; i < nWin; i++) {
    const wx = nWin === 1 ? x0 + 22 : x0 + 20 + i * ((fw - 64) / Math.max(1, nWin - 1));
    if (Math.abs(wx + 12 - (doorX + doorW / 2)) < doorW) continue;
    body += `<rect x="${wx}" y="${winY}" width="24" height="22" rx="4" fill="${glass}" stroke="${outlineOf(wall)}" stroke-width="3"/>`;
    if (lit) body += `<rect x="${wx - 8}" y="${winY - 8}" width="40" height="38" rx="14" fill="${M.glassLit[0]}" opacity="0.35"/>`;
    else body += `<path d="M${wx + 12},${winY} V${winY + 22} M${wx},${winY + 11} H${wx + 24}" stroke="${outlineOf(wall)}" stroke-width="2"/>`;
  }
  if (lit) {
    if (sp.glow) body += sp.glow(fr);
    return { w: W, h: H, body, ax: x0, ay: yBase, points };
  }
  if (doorStyle !== 'none') {
    const top = yBase - 4 - doorH;
    const doorD = doorStyle === 'arch'
      ? `M${doorX},${yBase - 4} V${top + 15} A15,15 0 0 1 ${doorX + doorW},${top + 15} V${yBase - 4}Z`
      : rrect(doorX, top, doorW, doorH, 12);
    body += `<path d="${doorD}" fill="${doorStyle === 'barn' ? M.wood[1] : M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="3"/>`;
    if (doorStyle === 'barn') body += `<path d="M${doorX},${top} L${doorX + doorW},${yBase - 4} M${doorX + doorW},${top} L${doorX},${yBase - 4}" stroke="${M.wood[0]}" stroke-width="3"/>`;
  }
  // Roof: each shape has its own silhouette.
  const rt = sp.roof;
  let roof = '';
  if (sp.shape === 'barn') roof = poly([[x0 - 4, eave], [x0 + 18, ridge + 18], [x0 + fw - 18, ridge + 18], [x0 + fw + 4, eave]]);
  else if (sp.shape === 'hip') roof = poly([[x0 - 6, eave], [x0 + 40, ridge + 40], [x0 + fw - 40, ridge + 40], [x0 + fw + 6, eave]]);
  else if (sp.shape === 'gable') roof = poly([[x0 - 6, eave], [x0 + fw / 2, ridge], [x0 + fw + 6, eave]]);
  else if (sp.shape === 'dome') roof = smoothPath([[x0 + 4, eave], [x0 + 10, ridge + sp.rise * 0.45], [x0 + fw / 2, ridge + sp.rise * 0.25], [x0 + fw - 10, ridge + sp.rise * 0.45], [x0 + fw - 4, eave], [x0 + fw / 2, eave + 6]]);
  if (roof) {
    body += shaded(roof, { tones: rt, outline: outlineOf(rt), shadow: 14, light: 10, rim: RIM });
    if (sp.shape !== 'dome') for (let y = eave - 22; y > ridge + 30; y -= 22) body += `<path d="M${x0 + 14},${y} H${x0 + fw - 14}" stroke="${rt[0]}" stroke-width="2" opacity="0.35"/>`;
  }
  if (sp.chimney) body += shaded(rrect(x0 + fw * 0.72, ridge + (sp.shape === 'gable' ? 26 : 30), 20, 42, 3), { tones: M.stone, outline: outlineOf(M.stone), shadow: 4, light: 2 });
  if (sp.extra) body += sp.extra(fr);
  return { w: W, h: H, body, ax: x0, ay: yBase, points };
}
