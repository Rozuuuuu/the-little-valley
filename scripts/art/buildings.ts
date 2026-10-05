/**
 * Building art: one spec per building type (footprint, roof shape and colour, walls, door,
 * chimney, and a feature that makes its silhouette distinct), drawn by one function. Each is
 * drawn twice: by day, and the night overlay (lit windows, furnace glow) added above the night tint.
 */
import { M, OUTLINE, outlineOf, P, RIM, SHADOW } from './palette';
import { blob, groundShadow, poly, rng, rrect, shaded, smoothPath, TILE } from './svg-kit';

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
  royalHall: {
    size: [4, 3], rise: 170, wall: M.stone.slice(1), roof: M.roofSlate, shape: 'hip', door: 'arch', windows: 4, chimney: true,
    extra: (f) => {
      // A banner tower rising from the roof, crowned with the realm's gold standard.
      const cx = f.x0 + f.fw / 2;
      let out = shaded(rrect(cx - 30, f.ridge - 30, 60, 90, 4), { tones: M.stone, outline: outlineOf(M.stone), shadow: 8, light: 4 });
      for (let x = cx - 30; x < cx + 30; x += 15) out += `<rect x="${x}" y="${f.ridge - 42}" width="10" height="14" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="2"/>`;
      out += `<path d="M${cx - 9},${f.ridge + 20} v-14 a9,9 0 0 1 18,0 v14z" fill="${P.core.tealMid}"/>`;
      out += `<path d="M${cx},${f.ridge - 42} V${f.ridge - 96}" stroke="${M.wood[0]}" stroke-width="4"/><path d="M${cx},${f.ridge - 96} l42,10 l-42,12Z" fill="${P.core.gold}" stroke="${P.core.goldDeep}" stroke-width="2"/>`;
      // Banners hung on the front wall.
      for (const bx of [f.x0 + 20, f.x0 + f.fw - 42]) out += `<path d="M${bx},${f.wallTop + 14} h22 v46 l-11,-8 l-11,8z" fill="${M.berry[1]}" stroke="${M.berry[0]}" stroke-width="2"/><circle cx="${bx + 11}" cy="${f.wallTop + 32}" r="5" fill="${P.core.gold}"/>`;
      return out;
    },
  },
  councilHall: {
    size: [3, 2], rise: 110, wall: M.wall, roof: M.roofRed, shape: 'hip', door: 'arch', windows: 2,
    extra: (f) => {
      // A columned porch and a round window in the pediment.
      const cx = f.x0 + f.fw / 2;
      let out = '';
      for (const px of [cx - 52, cx - 26, cx + 18, cx + 44]) out += shaded(rrect(px, f.wallTop + 12, 10, f.yBase - f.wallTop - 26, 3), { tones: M.wall, outline: outlineOf(M.wall), shadow: 3, light: 2 });
      out += shaded(poly([[cx - 64, f.wallTop + 14], [cx, f.wallTop - 18], [cx + 64, f.wallTop + 14]]), { tones: M.wall, outline: outlineOf(M.wall), shadow: 4, light: 3 });
      return out + `<circle cx="${cx}" cy="${f.wallTop + 2}" r="8" fill="${P.core.tealMid}" stroke="${outlineOf(M.wall)}" stroke-width="2"/>`;
    },
  },
  armory: {
    size: [2, 2], rise: 84, wall: M.stone.slice(1), roof: M.roofSlate, shape: 'gable', door: 'plain', windows: 1,
    extra: (f) => {
      // Crossed swords over a round shield above the door.
      const cx = f.x0 + f.fw / 2;
      return `<path d="M${cx - 22},${f.wallTop + 2} L${cx + 22},${f.wallTop + 38} M${cx + 22},${f.wallTop + 2} L${cx - 22},${f.wallTop + 38}" stroke="#c4ccd0" stroke-width="4" stroke-linecap="round"/>`
        + `<circle cx="${cx}" cy="${f.wallTop + 20}" r="13" fill="${M.berry[1]}" stroke="${P.core.goldDeep}" stroke-width="3"/><circle cx="${cx}" cy="${f.wallTop + 20}" r="4" fill="${P.core.gold}"/>`;
    },
  },
  house: { size: [2, 2], rise: 96, wall: M.wall, roof: M.roofThatch, shape: 'gable', chimney: true, windows: 1 },
  familyHome: {
    size: [3, 2], rise: 100, wall: M.wall, roof: M.roofThatch, shape: 'gable', chimney: true, windows: 2,
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
    size: [2, 2], rise: 90, wall: M.wall, roof: M.roofThatch, shape: 'gable', windows: 1,
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

/** Unique gradient and clip ids within one sprite; `.last` is the most recent. */
function gradIds(): ((p: string) => string) & { last: string } {
  let n = 0;
  const f = ((p: string) => (f.last = `${p}${n++}`)) as ((p: string) => string) & { last: string };
  f.last = '';
  return f;
}

/** Rounded fieldstones in a band, each lit on its upper left. */
export function stones(x: number, y: number, w: number, h: number, tones: string[], seed: number): string {
  const r = rng(seed);
  let s = '';
  let cx = x;
  while (cx < x + w - 4) {
    const sw = Math.min(14 + r() * 14, x + w - cx);
    const sy = y + r() * 3;
    s += `<path d="${rrect(cx, sy, sw - 2, h - 2, 5)}" fill="${tones[1 + Math.floor(r() * 2)]}" stroke="${outlineOf(tones)}" stroke-width="1.5"/>`;
    s += `<path d="M${cx + 3},${sy + 3} h${Math.max(2, sw - 10)}" stroke="${tones[tones.length - 1]}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`;
    cx += sw;
  }
  return s;
}

const FRAMED = ['townHall', 'house', 'familyHome', 'cottage', 'inn', 'weaver', 'waystation'];

/** The wall's material: timber-framed plaster, planks, logs, stone or brick. */
function wallTexture(kind: string, wall: string[], x: number, y: number, w: number, h: number): string {
  const r = rng(kind.length * 31 + w);
  let s = '';
  const isStone = wall[0] === M.stone[0] || wall[0] === M.stone[1];
  const isPlank = wall[0] === M.wood[1] || wall[0] === M.wood[0];
  if (wall === M.wall) {
    // Plaster: soft mottling, then the timber frame with diagonal braces.
    for (let i = 0; i < 10; i++) s += `<path d="${blob(x + r() * w, y + r() * h, 10 + r() * 16, 6 + r() * 8, 50 + i, 0.3, 7)}" fill="${r() < 0.5 ? wall[2] : wall[0]}" opacity="0.35"/>`;
    if (FRAMED.includes(kind)) {
      const beam = M.wood[1];
      const posts = [x + 4, x + w * 0.33, x + w * 0.67 - 8, x + w - 12];
      for (const px of posts) s += `<rect x="${px}" y="${y}" width="8" height="${h}" fill="${beam}"/><rect x="${px}" y="${y}" width="2.5" height="${h}" fill="${M.wood[2]}" opacity="0.8"/>`;
      const mid = y + h * 0.5;
      s += `<rect x="${x}" y="${mid - 4}" width="${w}" height="8" fill="${beam}"/><rect x="${x}" y="${mid - 4}" width="${w}" height="2.5" fill="${M.wood[2]}" opacity="0.8"/>`;
      s += `<path d="M${posts[0] + 8},${mid + 4} L${posts[1]},${y + h} M${posts[3]},${mid + 4} L${posts[2] + 8},${y + h} M${posts[0] + 8},${mid - 4} L${posts[1]},${y + 6} M${posts[3]},${mid - 4} L${posts[2] + 8},${y + 6}" stroke="${beam}" stroke-width="6"/>`;
    }
  } else if (isStone) {
    // Coursed masonry: staggered blocks.
    let row = 0;
    for (let yy = y + 2; yy < y + h; yy += 16) {
      for (let xx = x - (row % 2) * 14; xx < x + w; xx += 28) {
        const c = wall[Math.min(wall.length - 1, 1 + Math.floor(r() * 2))];
        s += `<path d="${rrect(xx + 1, yy + 1, 26, 14, 4)}" fill="${c}" stroke="${outlineOf(M.stone)}" stroke-width="1.2" stroke-opacity="0.7"/><path d="M${xx + 4},${yy + 4} h18" stroke="${M.stone[3]}" stroke-width="1.6" opacity="0.6" stroke-linecap="round"/>`;
      }
      row++;
    }
  } else if (kind === 'hunterLodge') {
    // Logs: horizontal rounded timbers.
    let i = 0;
    for (let yy = y + 4; yy < y + h; yy += 14) {
      s += `<path d="${rrect(x - 4, yy, w + 8, 12, 6)}" fill="${wall[1 + (i++ % 2)]}" stroke="${outlineOf(wall)}" stroke-width="1.5"/><path d="M${x},${yy + 3} H${x + w}" stroke="${wall[2]}" stroke-width="2" opacity="0.7"/>`;
    }
  } else if (isPlank) {
    // Vertical boards with uneven tone and nail heads.
    for (let xx = x; xx < x + w; xx += 14) {
      s += `<rect x="${xx}" y="${y}" width="13" height="${h}" fill="${wall[Math.floor(r() * 3)]}" opacity="0.55"/>`;
      s += `<path d="M${xx + 13.5},${y} V${y + h}" stroke="${outlineOf(wall)}" stroke-width="1.6" opacity="0.6"/>`;
      s += `<circle cx="${xx + 6}" cy="${y + 14}" r="1.4" fill="${M.wood[0]}"/><circle cx="${xx + 6}" cy="${y + h - 22}" r="1.4" fill="${M.wood[0]}"/>`;
    }
  } else {
    // Brick: small staggered courses.
    let row = 0;
    for (let yy = y; yy < y + h; yy += 9) {
      for (let xx = x - (row % 2) * 9; xx < x + w; xx += 18) s += `<rect x="${xx + 0.8}" y="${yy + 0.8}" width="16.4" height="7.4" rx="1.5" fill="${wall[Math.floor(r() * 3)]}" opacity="0.7"/>`;
      row++;
    }
  }
  return s;
}

/** A framed window with sill and shutters by day; glowing warm glass at night. */
function windowArt(x: number, y: number, w: number, h: number, wall: string[], lit: boolean): string {
  if (lit) return `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="16" fill="${M.glassLit[0]}" opacity="0.32"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${M.glassLit[1]}"/><path d="M${x + w / 2},${y} V${y + h} M${x},${y + h / 2} H${x + w}" stroke="${M.wood[1]}" stroke-width="2.5"/>`;
  const frame = M.wood[1];
  const id = `gl${Math.round(x)}_${Math.round(y)}`;
  let s = '';
  // Shutters, painted green-blue.
  s += `<rect x="${x - 11}" y="${y - 1}" width="10" height="${h + 2}" rx="2" fill="#4c7a6a" stroke="${outlineOf(wall)}" stroke-width="1.5"/><rect x="${x + w + 1}" y="${y - 1}" width="10" height="${h + 2}" rx="2" fill="#3f6a5c" stroke="${outlineOf(wall)}" stroke-width="1.5"/>`;
  s += `<path d="M${x - 9},${y + h / 2} h6 M${x + w + 3},${y + h / 2} h6" stroke="#2c4c42" stroke-width="1.5"/>`;
  s += `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="3" fill="${frame}"/>`;
  s += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fd0d8"/><stop offset="0.5" stop-color="#3d6a78"/><stop offset="1" stop-color="#22404a"/></linearGradient></defs>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#${id})"/>`;
  s += `<path d="M${x + 3},${y + h * 0.55} L${x + w * 0.5},${y + 3}" stroke="#e6f6f4" stroke-width="2.5" opacity="0.55" stroke-linecap="round"/>`;
  s += `<path d="M${x + w / 2},${y} V${y + h} M${x},${y + h / 2} H${x + w}" stroke="${frame}" stroke-width="2.5"/>`;
  s += `<rect x="${x - 5}" y="${y + h + 1}" width="${w + 10}" height="5" rx="2" fill="${M.wood[2]}" stroke="${outlineOf(M.wood)}" stroke-width="1.2"/>`;
  return s;
}

/** A plank door (or barn doors, or an arch) with a stone step. */
function doorArt(x: number, base: number, w: number, h: number, style: string): string {
  const top = base - h;
  const id = `dc${Math.round(x)}`;
  const d = style === 'arch' ? `M${x},${base} V${top + w / 2} A${w / 2},${w / 2} 0 0 1 ${x + w},${top + w / 2} V${base}Z` : rrect(x, top, w, h, style === 'barn' ? 4 : 13);
  let s = `<rect x="${x - 6}" y="${top - 5}" width="${w + 12}" height="${h + 5}" rx="${style === 'barn' ? 4 : 15}" fill="${M.wood[0]}" opacity="0.85"/>`;
  s += `<path d="${d}" fill="${M.wood[2]}"/>`;
  s += `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${id})">`;
  for (let xx = x + 8; xx < x + w; xx += 8) s += `<path d="M${xx},${top} V${base}" stroke="${M.wood[1]}" stroke-width="1.6"/>`;
  s += `<rect x="${x}" y="${top}" width="${w * 0.35}" height="${h}" fill="${M.wood[3]}" opacity="0.3"/>`;
  if (style === 'barn') s += `<path d="M${x},${top} L${x + w},${base} M${x + w},${top} L${x},${base}" stroke="${M.wood[0]}" stroke-width="4"/><path d="M${x + w / 2},${top} V${base}" stroke="${M.wood[0]}" stroke-width="2.5"/>`;
  else s += `<path d="M${x},${top + h * 0.3} h${w} M${x},${top + h * 0.75} h${w}" stroke="${M.wood[0]}" stroke-width="3"/><circle cx="${x + w - 7}" cy="${top + h * 0.55}" r="2.4" fill="${P.core.goldDeep}"/>`;
  s += '</g>';
  s += `<path d="${d}" fill="none" stroke="${outlineOf(M.wood)}" stroke-width="2.5"/>`;
  s += `<path d="${rrect(x - 8, base - 3, w + 16, 8, 3)}" fill="${M.stone[2]}" stroke="${outlineOf(M.stone)}" stroke-width="1.5"/>`;
  return s;
}

/** A stone chimney with a cap. */
function chimneyArt(x: number, y: number): string {
  let s = shaded(rrect(x, y, 22, 44, 3), { tones: M.stone, outline: outlineOf(M.stone), shadow: 5, light: 2 });
  for (let yy = y + 8; yy < y + 40; yy += 9) s += `<path d="M${x + 2},${yy} h18" stroke="${M.stone[0]}" stroke-width="1.2" opacity="0.6"/>`;
  s += `<rect x="${x - 3}" y="${y - 3}" width="28" height="8" rx="2" fill="${M.stone[1]}" stroke="${outlineOf(M.stone)}" stroke-width="2"/>`;
  return s;
}

type RoofStyle = 'tile' | 'slate' | 'thatch' | 'shingle' | 'stone';

function roofStyle(rt: string[]): RoofStyle {
  if (rt === M.roofRed) return 'tile';
  if (rt === M.roofSlate) return 'slate';
  if (rt === M.roofThatch) return 'thatch';
  if (rt === M.stone) return 'stone';
  return 'shingle';
}

/** A textured roof plane: base, material courses, ridge cap, sunlight from the left, outline. */
function roofArt(roof: string, rt: string[], x0: number, fw: number, eave: number, ridge: number, shape: string, g: ReturnType<typeof gradIds>): string {
  const style = roofStyle(rt);
  const r = rng(fw + eave);
  const top = shape === 'gable' ? ridge + 18 : shape === 'hip' ? ridge + 10 : ridge + 6;
  let s = `<path d="${roof}" fill="${rt[1]}"/>`;
  s += `<defs><clipPath id="${g('rc')}"><path d="${roof}"/></clipPath></defs><g clip-path="url(#${g.last})">`;
  const L = x0 - 14, R = x0 + fw + 14;
  if (style === 'thatch') {
    // Straw: dense short strokes in layered courses, darker under each course's edge.
    for (let y = eave; y > top - 10; y -= 14) {
      s += `<path d="M${L},${y} H${R}" stroke="${rt[0]}" stroke-width="5" opacity="0.45"/>`;
      for (let x = L; x < R; x += 3.2) {
        const len = 10 + r() * 8;
        const c = rt[1 + Math.floor(r() * 3)];
        s += `<path d="M${x.toFixed(1)},${(y - 2).toFixed(1)} l${(r() * 2 - 1).toFixed(1)},${(-len).toFixed(1)}" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
      }
    }
  } else if (style === 'tile') {
    // Clay pantiles: scalloped courses, each lit on top and shadowed beneath.
    let row = 0;
    for (let y = eave + 4; y > top - 14; y -= 15) {
      const off = (row % 2) * 9;
      let d = `M${L - off},${y}`;
      for (let x = L - off; x < R; x += 18) d += ' q9,9 18,0';
      s += `<path d="${d} V${y - 15} H${L - off}Z" fill="${row % 3 === 1 ? rt[2] : rt[1]}"/>`;
      s += `<path d="${d}" stroke="${rt[0]}" stroke-width="2.4" fill="none"/>`;
      for (let x = L - off; x < R; x += 18) s += `<path d="M${x + 4},${y - 8} q5,4 10,0" stroke="${rt[3]}" stroke-width="2" fill="none" opacity="0.65" stroke-linecap="round"/>`;
      row++;
    }
  } else {
    // Slate, shingles or stone slabs: offset rectangular courses with uneven lengths.
    let row = 0;
    const ch = style === 'stone' ? 18 : 13;
    for (let y = eave; y > top - ch; y -= ch) {
      s += `<path d="M${L},${y} H${R}" stroke="${rt[0]}" stroke-width="2.2"/>`;
      let x = L - (row % 2) * 10;
      while (x < R) {
        const w = (style === 'shingle' ? 12 : 18) + r() * 10;
        s += `<rect x="${(x + 1).toFixed(1)}" y="${y - ch + 1}" width="${(w - 2).toFixed(1)}" height="${ch - 2}" rx="1.5" fill="${rt[1 + Math.floor(r() * 2)]}" opacity="0.8"/>`;
        s += `<path d="M${x.toFixed(1)},${y} V${y - ch + 2}" stroke="${rt[0]}" stroke-width="1.4" opacity="0.8"/>`;
        s += `<path d="M${(x + 3).toFixed(1)},${y - ch + 3} h${(w - 8).toFixed(1)}" stroke="${rt[rt.length - 1]}" stroke-width="1.6" opacity="0.5"/>`;
        x += w;
      }
      row++;
    }
  }
  // Sunlight from the upper left, falling off to the right.
  s += `<defs><linearGradient id="${g('rl')}" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#fff2c0" stop-opacity="0.3"/><stop offset="0.5" stop-color="#fff2c0" stop-opacity="0"/><stop offset="1" stop-color="#1a1c2a" stop-opacity="0.3"/></linearGradient></defs>`;
  s += `<rect x="${L}" y="${ridge - 10}" width="${R - L}" height="${eave - ridge + 20}" fill="url(#${g.last})"/>`;
  s += '</g>';
  // Hip lines and the ridge cap.
  if (shape === 'hip') s += `<path d="M${x0 - 10},${eave} L${x0 + fw * 0.2},${top} M${x0 + fw + 10},${eave} L${x0 + fw * 0.8},${top}" stroke="${rt[0]}" stroke-width="4" opacity="0.7"/>`;
  const cl = shape === 'hip' ? x0 + fw * 0.2 : shape === 'gable' ? x0 + 2 : x0 + 26;
  const cr = shape === 'hip' ? x0 + fw * 0.8 : shape === 'gable' ? x0 + fw - 2 : x0 + fw - 26;
  s += `<path d="${rrect(cl - 4, top - 6, cr - cl + 8, 12, 5)}" fill="${style === 'thatch' ? rt[1] : rt[2]}" stroke="${outlineOf(rt)}" stroke-width="2"/>`;
  s += `<path d="M${cl},${top - 2} H${cr}" stroke="${rt[3] ?? rt[2]}" stroke-width="2" opacity="0.8"/>`;
  if (style === 'thatch') for (let x = cl + 8; x < cr - 4; x += 16) s += `<path d="M${x - 5},${top - 6} l10,12 M${x + 5},${top - 6} l-10,12" stroke="${rt[0]}" stroke-width="2"/>`;
  // A rolled, overhanging eave edge.
  s += `<path d="M${x0 - 10},${eave} H${x0 + fw + 10}" stroke="${style === 'thatch' ? rt[2] : rt[0]}" stroke-width="${style === 'thatch' ? 7 : 4}" stroke-linecap="round"/>`;
  s += `<path d="${roof}" fill="none" stroke="${outlineOf(rt)}" stroke-width="3" stroke-linejoin="round"/>`;
  return s;
}

/** A building in footprint coordinates: walls in front, roof rising `rise` px above. */
export function building(kind: string, lit: boolean): { w: number; h: number; body: string; ax: number; ay: number; points: Record<string, [number, number]> } {
  const sp = SPECS[kind];
  const fw = sp.size[0] * TILE;
  const fh = sp.size[1] * TILE;
  const W = fw + 24;
  // Pitched roofs stand about as tall as the walls, as in the pixel original.
  const rise = sp.shape === 'gable' || sp.shape === 'barn' ? Math.round(sp.rise * 1.3) : sp.rise;
  const H = fh + rise + 12;
  const x0 = 12;
  const yBase = H - 10;
  const wallTop = kind === 'well' ? yBase - 44 : yBase - fh * 0.62;
  const eave = wallTop + 8;
  const ridge = eave - rise;
  const fr: Frame = { x0, fw, yBase, wallTop, eave, ridge };
  // Where smoke rises, relative to the anchor: the chimney top, else the middle of the roof ridge.
  const points: Record<string, [number, number]> = { top: [fw / 2, ridge + 6 - yBase] };
  if (sp.chimney) points.chimney = [fw * 0.72 + 10, ridge + (sp.shape === 'gable' ? 26 : 30) - yBase];
  const wall = sp.wall;
  const g = gradIds();
  let body = lit ? '' : groundShadow(x0 + fw / 2 + 10, yBase - 4, fw / 2 + 14, 18, SHADOW, 0.32);
  if (!lit) {
    if (kind === 'well') {
      body += shaded(blob(x0 + fw / 2, yBase - 22, fw / 2 - 6, 22, 7, 0.05, 12), { tones: wall, outline: outlineOf(wall), shadow: 6, light: 4 });
      body += stones(x0 + 10, yBase - 40, fw - 20, 34, wall, 3);
      body += `<ellipse cx="${x0 + fw / 2}" cy="${yBase - 34}" rx="${fw / 2 - 16}" ry="9" fill="${(P.ground.deep as string[])[1]}"/>`;
    } else {
      const wx = x0 + 6, ww = fw - 12, wh = yBase - wallTop - 4;
      body += `<path d="${rrect(wx, wallTop, ww, wh, 4)}" fill="${wall[1]}"/>`;
      body += `<defs><clipPath id="${g('wc')}"><path d="${rrect(wx, wallTop, ww, wh, 4)}"/></clipPath></defs><g clip-path="url(#${g.last})">`;
      body += wallTexture(kind, wall, wx, wallTop, ww, wh);
      // Light from the upper left across the wall, and the deep shadow under the eaves.
      body += `<defs><linearGradient id="${g('wl')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff4d0" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff4d0" stop-opacity="0"/><stop offset="1" stop-color="#1c2a30" stop-opacity="0.22"/></linearGradient></defs>`;
      body += `<rect x="${wx}" y="${wallTop}" width="${ww}" height="${wh}" fill="url(#${g.last})"/>`;
      body += `<defs><linearGradient id="${g('ws')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2420" stop-opacity="0.55"/><stop offset="1" stop-color="#1c2420" stop-opacity="0"/></linearGradient></defs>`;
      body += `<rect x="${wx}" y="${wallTop}" width="${ww}" height="30" fill="url(#${g.last})"/>`;
      body += '</g>';
      // A fieldstone plinth along the foot of the wall.
      body += stones(wx - 2, yBase - 18, ww + 4, 15, M.stone, 11);
      body += `<path d="${rrect(wx, wallTop, ww, wh, 4)}" fill="none" stroke="${outlineOf(wall)}" stroke-width="3"/>`;
    }
  }
  // Windows: framed, with sills and shutters by day; warm light at night.
  const winY = wallTop + 30;
  const nWin = sp.windows ?? 1;
  const doorStyle = sp.door ?? 'plain';
  const doorW = doorStyle === 'barn' ? 56 : 32;
  const doorX = x0 + fw / 2 - doorW / 2;
  const doorH = doorStyle === 'barn' ? 62 : 50;
  const winXs: number[] = [];
  for (let i = 0; i < nWin; i++) {
    const wx = nWin === 1 ? x0 + 26 : x0 + 24 + i * ((fw - 72) / Math.max(1, nWin - 1));
    if (Math.abs(wx + 12 - (doorX + doorW / 2)) < doorW) continue;
    winXs.push(wx);
  }
  for (const wx of winXs) body += windowArt(wx, winY, 24, 24, wall, lit);
  if (kind === 'townHall') for (const wx of [x0 + 36, x0 + fw - 72]) body += windowArt(wx, wallTop + 96, 36, 40, wall, lit);
  if (lit) {
    if (sp.glow) body += sp.glow(fr);
    return { w: W, h: H, body, ax: x0, ay: yBase, points };
  }
  if (doorStyle !== 'none') body += doorArt(doorX, yBase - 4, doorW, doorH, doorStyle);
  // Roof: each shape has its own silhouette, textured by its material.
  const rt = sp.roof;
  let roof = '';
  if (sp.shape === 'barn') roof = poly([[x0 - 8, eave], [x0 + 6, ridge + rise * 0.45], [x0 + 26, ridge + 6], [x0 + fw - 26, ridge + 6], [x0 + fw - 6, ridge + rise * 0.45], [x0 + fw + 8, eave]]);
  else if (sp.shape === 'hip') roof = poly([[x0 - 10, eave], [x0 + fw * 0.2, ridge + 10], [x0 + fw * 0.8, ridge + 10], [x0 + fw + 10, eave]]);
  else if (sp.shape === 'gable') roof = poly([[x0 - 10, eave], [x0 + 2, ridge + 18], [x0 + fw - 2, ridge + 18], [x0 + fw + 10, eave]]);
  else if (sp.shape === 'dome') roof = smoothPath([[x0 + 4, eave], [x0 + 10, ridge + rise * 0.45], [x0 + fw / 2, ridge + rise * 0.25], [x0 + fw - 10, ridge + rise * 0.45], [x0 + fw - 4, eave], [x0 + fw / 2, eave + 6]]);
  if (roof) {
    if (sp.shape === 'dome') body += shaded(roof, { tones: rt, outline: outlineOf(rt), shadow: 14, light: 10 });
    else body += roofArt(roof, rt, x0, fw, eave, ridge, sp.shape, g);
  }
  if (sp.chimney) body += chimneyArt(x0 + fw * 0.72, ridge + (sp.shape === 'gable' ? 26 : 30));
  if (sp.extra) body += sp.extra(fr);
  return { w: W, h: H, body, ax: x0, ay: yBase, points };
}
