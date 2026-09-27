/**
 * Bounded A* over the tile grid. 8-way movement without corner cutting.
 * The search gives up after `maxNodes` expansions so a single unreachable
 * target can never stall a tick.
 */

export interface PathGrid {
  walkable(x: number, y: number): boolean;
  /** Movement cost multiplier for entering the tile (roads are cheaper). */
  cost(x: number, y: number): number;
}

/** A rectangle to reach: either standing on it or standing next to it. */
export interface Goal {
  x: number;
  y: number;
  w: number;
  h: number;
  adjacent: boolean;
}

export interface PathStep {
  x: number;
  y: number;
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

export function goalSatisfied(goal: Goal, x: number, y: number): boolean {
  const inside = x >= goal.x && x < goal.x + goal.w && y >= goal.y && y < goal.y + goal.h;
  if (!goal.adjacent) return inside;
  if (inside) return false;
  return x >= goal.x - 1 && x <= goal.x + goal.w && y >= goal.y - 1 && y <= goal.y + goal.h;
}

function heuristic(goal: Goal, x: number, y: number): number {
  const dx = x < goal.x ? goal.x - x : x >= goal.x + goal.w ? x - (goal.x + goal.w - 1) : 0;
  const dy = y < goal.y ? goal.y - y : y >= goal.y + goal.h ? y - (goal.y + goal.h - 1) : 0;
  const lo = Math.min(dx, dy);
  const hi = Math.max(dx, dy);
  // Scaled below 1 because roads make some steps cheaper than 1.
  return (hi - lo + lo * SQRT2) * 0.85;
}

function key(x: number, y: number): number {
  return (x + 1048576) * 2097152 + (y + 1048576);
}

class MinHeap {
  private items: number[] = [];
  constructor(private readonly score: number[]) {}
  get size(): number {
    return this.items.length;
  }
  push(n: number): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      const tmp = a[p];
      a[p] = a[i];
      a[i] = tmp;
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        const tmp = a[m];
        a[m] = a[i];
        a[i] = tmp;
        i = m;
      }
    }
    return top;
  }
}

export interface PathStats {
  expanded: number;
}

export const lastPathStats: PathStats = { expanded: 0 };
/** Running totals for profiling (never reset by the game). */
export const pathTotals = { calls: 0, expanded: 0 };

/**
 * Returns the steps to take (excluding the start tile), `[]` if the start
 * already satisfies the goal, or null if no path was found within budget.
 */
/**
 * With `partial`, an unreachable goal yields a path to the closest tile found
 * instead of null (used for plain move orders).
 */
export function findPath(grid: PathGrid, sx: number, sy: number, goal: Goal, maxNodes = 4000, partial = false): PathStep[] | null {
  if (goalSatisfied(goal, sx, sy)) return [];
  pathTotals.calls++;
  const xs: number[] = [];
  const ys: number[] = [];
  const g: number[] = [];
  const f: number[] = [];
  const parent: number[] = [];
  const closed: boolean[] = [];
  const index = new Map<number, number>();
  const open = new MinHeap(f);

  const add = (x: number, y: number, gv: number, p: number): number => {
    const n = xs.length;
    xs.push(x);
    ys.push(y);
    g.push(gv);
    f.push(gv + heuristic(goal, x, y));
    parent.push(p);
    closed.push(false);
    index.set(key(x, y), n);
    return n;
  };

  open.push(add(sx, sy, 0, -1));
  let expanded = 0;
  let closest = 0;
  let closestH = heuristic(goal, sx, sy);
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = true;
    const cx = xs[cur];
    const cy = ys[cur];
    if (goalSatisfied(goal, cx, cy)) {
      lastPathStats.expanded = expanded;
      pathTotals.expanded += expanded;
      const out: PathStep[] = [];
      for (let n = cur; parent[n] !== -1; n = parent[n]) out.push({ x: xs[n], y: ys[n] });
      return out.reverse();
    }
    const h = heuristic(goal, cx, cy);
    if (h < closestH) {
      closestH = h;
      closest = cur;
    }
    if (++expanded > maxNodes) break;
    for (const [dx, dy, base] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!grid.walkable(cx + dx, cy) || !grid.walkable(cx, cy + dy))) continue;
      const ng = g[cur] + base * grid.cost(nx, ny);
      const k = key(nx, ny);
      const existing = index.get(k);
      if (existing === undefined) {
        open.push(add(nx, ny, ng, cur));
      } else if (!closed[existing] && ng < g[existing]) {
        g[existing] = ng;
        f[existing] = ng + heuristic(goal, nx, ny);
        parent[existing] = cur;
        open.push(existing);
      }
    }
  }
  lastPathStats.expanded = expanded;
  pathTotals.expanded += expanded;
  if (partial && closest !== 0) {
    const out: PathStep[] = [];
    for (let n = closest; parent[n] !== -1; n = parent[n]) out.push({ x: xs[n], y: ys[n] });
    return out.reverse();
  }
  return null;
}
