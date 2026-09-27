import { BUILDINGS, type BuildingId } from '../data/buildings';
import { T } from '../world/tiles';
import type { Simulation } from './Simulation';
import type { Building, Settlement, Settler } from './types';

/** Tiles around a settlement centre that count as part of it. */
export const SETTLEMENT_RADIUS = 26;
/** Extra "distance" a settler adds to work outside their settlement, so they prefer local jobs. */
export const AWAY_PENALTY = 60;

export const SETTLEMENT_NAMES = [
  'Riverside', 'Brookhollow', 'Fernbank', 'Willowmere', 'Thistledown', 'Amberfield', 'Mossgate', 'Larkspur',
  'Heatherby', 'Cloverdell', 'Pinecrest', 'Marigold Rise',
];

export function centerOf(sim: Simulation, id: number): Building | undefined {
  return sim.buildings.get(id);
}

export function centerPoint(b: Building): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** The settlement whose centre is nearest to a tile, within its radius, or null for the wilds. */
export function settlementAt(sim: Simulation, x: number, y: number): Settlement | null {
  let best: Settlement | null = null;
  let bestD = SETTLEMENT_RADIUS;
  for (const st of sim.settlements) {
    const c = centerOf(sim, st.id);
    if (!c) continue;
    const p = centerPoint(c);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestD) {
      bestD = d;
      best = st;
    }
  }
  return best;
}

export function settlementOfBuilding(sim: Simulation, b: Building): Settlement | null {
  return settlementAt(sim, b.x + b.w / 2, b.y + b.h / 2);
}

export function settlementName(sim: Simulation, id: number | null): string {
  if (id === null) return 'No settlement';
  return sim.settlements.find((s) => s.id === id)?.name ?? 'Unknown';
}

export function residentsOfSettlement(sim: Simulation, id: number): Settler[] {
  return sim.settlers.filter((s) => s.settlementId === id);
}

/** A new settlement centre must leave room around the others. */
export function spacingProblem(sim: Simulation, type: BuildingId, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  if (!def.settlementCenter) return null;
  const cx = x + def.size.w / 2;
  const cy = y + def.size.h / 2;
  for (const b of sim.buildings.values()) {
    const other = BUILDINGS[b.type].settlementCenter;
    if (!other) continue;
    const p = centerPoint(b);
    const d = Math.hypot(p.x - cx, p.y - cy);
    const need = Math.max(def.settlementCenter.minSpacing, other.minSpacing);
    if (d < need) {
      const name = sim.settlements.find((s) => s.id === b.id)?.name ?? (b.built ? 'another settlement' : 'a planned waystation');
      return `Too close to ${name} — a new settlement needs ${need} tiles of room (${Math.floor(d)} here)`;
    }
  }
  return null;
}

/** Called when a waystation is finished: a new settlement appears on the map. */
export function foundSettlement(sim: Simulation, b: Building): Settlement {
  const used = new Set(sim.settlements.map((s) => s.name));
  const name = SETTLEMENT_NAMES.find((n) => !used.has(n)) ?? `Settlement ${sim.settlements.length + 1}`;
  const st: Settlement = { id: b.id, name };
  sim.settlements.push(st);
  const c = centerPoint(b);
  sim.toast(`${name} is founded! Assign settlers to it from the Towns tab and give its store some stock targets.`, 'good');
  sim.record('settlement', `Founded ${name}`, c.x, c.y);
  sim.emit({ type: 'important' });
  return st;
}

/**
 * Extra cost for work outside a settler's own settlement. Settlers still help
 * elsewhere when there is nothing to do at home — it just isn't their first choice.
 */
export function awayPenalty(sim: Simulation, s: Settler, x: number, y: number): number {
  if (s.settlementId === null || sim.settlements.length < 2) return 0;
  const c = centerOf(sim, s.settlementId);
  if (!c) return 0;
  const p = centerPoint(c);
  return Math.hypot(p.x - x, p.y - y) > SETTLEMENT_RADIUS ? AWAY_PENALTY : 0;
}

const ROAD = new Set<number>([T.Road, T.Bridge, T.StoneBridge]);

function roadTilesNear(sim: Simulation, b: Building, reach: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = b.y - reach; y < b.y + b.h + reach; y++) {
    for (let x = b.x - reach; x < b.x + b.w + reach; x++) if (ROAD.has(sim.world.terrain(x, y))) out.push({ x, y });
  }
  return out;
}

/**
 * Whether two settlements are joined by an unbroken road: paths, wooden and
 * stone bridges, starting and ending within a few tiles of each centre.
 * Cached until the map changes.
 */
export function roadLinked(sim: Simulation, a: number, b: number): boolean {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  const hit = sim.roadCache.get(key);
  if (hit !== undefined) return hit;
  const ca = centerOf(sim, a);
  const cb = centerOf(sim, b);
  let result = false;
  if (ca && cb) {
    const goal = new Set(roadTilesNear(sim, cb, 4).map((t) => `${t.x},${t.y}`));
    const start = roadTilesNear(sim, ca, 4);
    const seen = new Set(start.map((t) => `${t.x},${t.y}`));
    const queue = [...start];
    let head = 0;
    while (head < queue.length && head < 60000 && goal.size) {
      const t = queue[head++];
      if (goal.has(`${t.x},${t.y}`)) {
        result = true;
        break;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        const k = `${nx},${ny}`;
        if (seen.has(k) || !ROAD.has(sim.world.terrain(nx, ny))) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  sim.roadCache.set(key, result);
  return result;
}

/** Pairs of settlements and whether a road joins them. */
export function roadLinks(sim: Simulation): { a: Settlement; b: Settlement; linked: boolean }[] {
  const out: { a: Settlement; b: Settlement; linked: boolean }[] = [];
  for (let i = 0; i < sim.settlements.length; i++) {
    for (let j = i + 1; j < sim.settlements.length; j++) {
      const a = sim.settlements[i];
      const b = sim.settlements[j];
      out.push({ a, b, linked: roadLinked(sim, a.id, b.id) });
    }
  }
  return out;
}

export function anyRoadLink(sim: Simulation): boolean {
  return roadLinks(sim).some((l) => l.linked);
}
