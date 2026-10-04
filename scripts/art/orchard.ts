/**
 * Orchard art: a 2×2 plot of four small fruit trees, in seven looks chosen by the game
 * (Orchards.look): saplings, leafy, fruit1–3 (more apples), autumn, winter.
 */
import { M, outlineOf, P, RIM, SHADOW } from './palette';
import { blob, groundShadow, rrect, shaded, TILE } from './svg-kit';

export const ORCHARD_LOOKS = ['saplings', 'leafy', 'fruit1', 'fruit2', 'fruit3', 'autumn', 'winter'] as const;

export function orchard(look: (typeof ORCHARD_LOOKS)[number]): { w: number; h: number; body: string; ax: number; ay: number } {
  const fw = 2 * TILE;
  const W = fw + 24;
  const H = 2 * TILE + 70;
  const x0 = 12;
  const yBase = H - 10;
  // A soft-edged patch of tended ground under the trees.
  let body = `<path d="${rrect(x0 + 4, yBase - 2 * TILE + 10, fw - 8, 2 * TILE - 14, 22)}" fill="${M.soil[3]}" opacity="0.35"/>`;
  const spots: [number, number][] = [[x0 + 50, yBase - 120], [x0 + 142, yBase - 120], [x0 + 50, yBase - 30], [x0 + 142, yBase - 30]];
  for (const [i, [tx, ty]] of spots.entries()) {
    if (look === 'saplings') {
      body += groundShadow(tx + 2, ty + 2, 14, 5, SHADOW);
      body += `<path d="M${tx},${ty} V${ty - 26}" stroke="${M.bark[1]}" stroke-width="4" stroke-linecap="round"/>`;
      body += shaded(blob(tx, ty - 32, 13, 10, 80 + i, 0.15), { tones: M.leaf.slice(2), outline: outlineOf(M.leaf), shadow: 4, light: 3 });
      continue;
    }
    body += groundShadow(tx + 4, ty + 2, 26, 8, SHADOW);
    body += shaded(rrect(tx - 5, ty - 34, 10, 36, 4), { tones: M.bark, outline: outlineOf(M.bark), shadow: 3, light: 2 });
    if (look === 'winter') {
      for (const dx of [-14, 0, 14]) body += `<path d="M${tx},${ty - 30} L${tx + dx},${ty - 56}" stroke="${M.bark[1]}" stroke-width="4" stroke-linecap="round"/><ellipse cx="${tx + dx}" cy="${ty - 58}" rx="6" ry="3" fill="${M.snow[2]}"/>`;
      continue;
    }
    const leaf = look === 'autumn' ? M.leafAutumn : M.leaf;
    body += shaded(blob(tx, ty - 58, 32, 27, 120 + i * 7, 0.12, 10), { tones: [leaf[1], leaf[2], leaf[3]], outline: outlineOf(leaf), shadow: 9, light: 7, rim: RIM });
    const apples = look === 'fruit1' ? 2 : look === 'fruit2' ? 4 : look === 'fruit3' ? 7 : 0;
    for (let a = 0; a < apples; a++) {
      const ax = tx - 18 + ((a * 13) % 36);
      const ay = ty - 72 + ((a * 7) % 24);
      body += `<circle cx="${ax}" cy="${ay}" r="5" fill="${M.berry[2]}" stroke="${M.berry[0]}" stroke-width="2"/><circle cx="${ax - 1.5}" cy="${ay - 1.5}" r="1.5" fill="${P.core.mint}" opacity="0.8"/>`;
    }
  }
  return { w: W, h: H, body, ax: x0, ay: yBase };
}
