import { hash01 } from '../core/rng';

/**
 * The wider land beyond the valley, as a coarse graph rather than tiles.
 * Each 96×96-tile region may hold a distant town. Nodes are pure functions of
 * the seed, so distant places cost nothing until someone hears of them, and
 * nothing here ever generates map chunks. Travellers cross the graph in
 * abstract legs; only near the valley do they walk tile by tile.
 */
export const REGION = 96;
/** Regions searched around the valley for towns that trade with it. */
const REACH = 3;
/** Regional travel speed for parties on the road (tiles per tick). */
export const ROAD_SPEED = 0.5;

const TOWN_NAMES = [
  'Ashford', 'Wrenmoor', 'Kettlebrook', 'Harrowgate', 'Dunmere', 'Oakhollow', 'Saltmarsh', 'Brightwater',
  'Stonebridge', 'Fallowfield', 'Hollins', 'Redcliff', 'Elderwick', 'Marrowdale', 'Thornbury', 'Greywell',
];

export interface RegionNode {
  id: number;
  rx: number;
  ry: number;
  kind: 'town' | 'wild';
  name: string;
  /** Rough tile position of the town. */
  x: number;
  y: number;
}

export function regionId(rx: number, ry: number): number {
  return (rx + 1000) * 2000 + (ry + 1000);
}

export function regionNode(seed: number, rx: number, ry: number): RegionNode {
  const home = rx === 0 && ry === 0;
  const kind = !home && hash01(rx, ry, seed ^ 0x7e61) < 0.45 ? 'town' : 'wild';
  const name = TOWN_NAMES[Math.floor(hash01(rx, ry, seed ^ 0x2b3) * TOWN_NAMES.length)];
  const x = rx * REGION + 20 + Math.floor(hash01(rx, ry, seed ^ 0x1a) * 56);
  const y = ry * REGION + 20 + Math.floor(hash01(rx, ry, seed ^ 0x2b) * 56);
  return { id: regionId(rx, ry), rx, ry, kind, name, x, y };
}

export function regionById(seed: number, id: number): RegionNode {
  return regionNode(seed, Math.floor(id / 2000) - 1000, (id % 2000) - 1000);
}

const townCache = new Map<number, RegionNode[]>();

/** Towns within reach of the valley, nearest first. There is always at least one. */
export function nearbyTowns(seed: number): RegionNode[] {
  const hit = townCache.get(seed);
  if (hit) return hit;
  const out: RegionNode[] = [];
  for (let ry = -REACH; ry <= REACH; ry++) {
    for (let rx = -REACH; rx <= REACH; rx++) {
      const n = regionNode(seed, rx, ry);
      if (n.kind === 'town' && Math.hypot(n.x, n.y) > 90) out.push(n);
    }
  }
  if (out.length === 0) out.push({ ...regionNode(seed, 2, 0), kind: 'town' });
  out.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  townCache.set(seed, out);
  return out;
}

/** Compass words for the direction from the valley to a place. */
export function direction(x: number, y: number): string {
  const a = Math.atan2(y, x);
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}
