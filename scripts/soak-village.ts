/**
 * Long-session soak of a developed village: plays many in-game days and prints, per day,
 * the tick timings and the size of every collection that could grow without bound, plus
 * the save size and save/load times. Scouts walk outward every day so explored land grows
 * as it does in a long playthrough.
 *
 * Run: NODE_OPTIONS=--expose-gc npx tsx scripts/soak-village.ts [settlers=100] [days=20] [seed=777001]
 * (NODE_OPTIONS=--expose-gc lets the script force a collection before reading the heap, so heap numbers
 * show live data rather than garbage waiting to be collected.)
 *
 * Distinguish: steady growth that follows the world (explored chunks, chronicle up to its cap)
 * from growth with no gameplay reason (reservations, paths, notes, events piling up).
 */
import { DAY_TICKS } from '../src/game/core/constants';
import { BUILDINGS } from '../src/game/data/buildings';
import { migrate, validateSave } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { assignHomes, campOf, completeBuilding, costOf, placeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import { pathTotals } from '../src/game/sim/pathfinding';
import type { Simulation } from '../src/game/sim/Simulation';
import { OBJECTS, T } from '../src/game/world/tiles';

const N = Number(process.argv[2] ?? 100);
const DAYS = Number(process.argv[3] ?? 20);
const SEED = Number(process.argv[4] ?? 777001);
const gc = (globalThis as { gc?: () => void }).gc;

// The same developed village as scripts/profile-village.ts (generator 3 land), so numbers compare.
const sim = createNewGame(SEED, 3);
sim.progression.reached.push('hamlet', 'village');
sim.world.reveal(0, 0, 40);

function spot(s: Simulation, w: number, h: number, near: { x: number; y: number }) {
  for (let r = 0; r < 40; r++) for (let y = near.y - r; y <= near.y + r; y++) for (let x = near.x - r; x <= near.x + r; x++) {
    let ok = true;
    for (let dy = -1; dy <= h && ok; dy++) for (let dx = -1; dx <= w && ok; dx++) {
      const t = s.world.terrain(x + dx, y + dy);
      ok = s.world.explored(x + dx, y + dy) && !s.buildingAt(x + dx, y + dy) && (t === T.Grass || t === T.Meadow || t === T.Forest) && !OBJECTS[s.world.obj(x + dx, y + dy)].blocks;
    }
    if (ok) return { x, y };
  }
  return null;
}
function instant(type: keyof typeof BUILDINGS, near: { x: number; y: number }) {
  const def = BUILDINGS[type];
  const p = spot(sim, def.size.w, def.size.h, near);
  if (!p) return null;
  const b = placeBuilding(sim, type, p.x, p.y);
  b.delivered = { ...costOf(b) };
  completeBuilding(sim, b, true);
  return b;
}

const camp = campOf(sim)!;
camp.inventory = { food: 200, wood: 30, stone: 20 };
for (let i = 0; i < 16; i++) instant('cottage', { x: -20 + (i % 8) * 5, y: i < 8 ? -14 : 16 });
for (let i = 0; i < 3; i++) instant('storehouse', { x: -12 + i * 12, y: -6 });
const mill = instant('mill', { x: 16, y: 6 })!;
const bakery = instant('bakery', { x: 16, y: 11 })!;
const workshop = instant('workshop', { x: -16, y: 6 })!;
applyCommand(sim, { type: 'placeArea', building: 'field', x0: -12, y0: 3, x1: -4, y1: 10, crop: 'turnip' });
applyCommand(sim, { type: 'placeArea', building: 'field', x0: 4, y0: 3, x1: 10, y1: 10, crop: 'wheat' });
const jobs = ['laborer', 'farmer', 'gatherer', 'builder', 'hauler'] as const;
while (sim.settlers.length < N) {
  const i = sim.settlers.length;
  sim.addSettler(-4 + (i % 9), 12 + Math.floor((i % 27) / 9), jobs[i % 5]);
}
assignHomes(sim);
const ids = sim.settlers.map((s) => s.id);
const areas = [
  applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -35, y0: -35, x1: -10, y1: -18 }).id!,
  applyCommand(sim, { type: 'createArea', kind: 'stone', x0: 10, y0: -35, x1: 35, y1: -18 }).id!,
  applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -12, y0: 3, x1: 10, y1: 10 }).id!,
  applyCommand(sim, { type: 'createArea', kind: 'build', x0: -30, y0: -30, x1: 30, y1: 30 }).id!,
];
areas.forEach((a, i) => applyCommand(sim, { type: 'assignArea', ids: ids.slice(8 + i * 12, 20 + i * 12), areaId: a }));
applyCommand(sim, { type: 'assignWorker', buildingId: mill.id, ids: [ids[2]] });
applyCommand(sim, { type: 'assignWorker', buildingId: bakery.id, ids: [ids[3]] });
applyCommand(sim, { type: 'assignWorker', buildingId: workshop.id, ids: [ids[4]] });
for (let i = 0; i < 4; i++) {
  const p = spot(sim, 3, 2, { x: 24, y: -4 + i * 5 });
  if (p) applyCommand(sim, { type: 'place', building: 'cottage', x: p.x, y: p.y });
}
applyCommand(sim, { type: 'designate', x0: -30, y0: -30, x1: 30, y1: 30, on: true });

// Scouts: the last five settlers walk a widening spiral, a new leg every SCOUT_LEG ticks
// (about 8 tiles farther each time, so explored land keeps growing as in a long game).
const scouts = ids.slice(-5);
const SCOUT_LEG = 400;
let leg = 0;
function sendScouts(): void {
  leg++;
  const r = 36 + leg * 8;
  scouts.forEach((id, k) => {
    const a = leg * 0.35 + (k * Math.PI * 2) / scouts.length;
    applyCommand(sim, { type: 'move', ids: [id], x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) });
  });
}

function q(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
function heapMb(): number {
  gc?.();
  return +(process.memoryUsage().heapUsed / 1048576).toFixed(1);
}

const rows: Record<string, number | string>[] = [];
for (let day = 1; day <= DAYS; day++) {
  const times: number[] = [];
  const calls0 = pathTotals.calls;
  const nodes0 = pathTotals.expanded;
  let events = 0;
  for (let i = 0; i < DAY_TICKS; i++) {
    if (i % SCOUT_LEG === 0) sendScouts();
    const t0 = performance.now();
    sim.step();
    times.push(performance.now() - t0);
    events += sim.drainEvents().length;
  }
  times.sort((a, b) => a - b);
  let modified = 0;
  let explored = 0;
  for (const c of sim.world.chunks.values()) {
    if (c.modified) modified++;
    if (c.exploredCount > 0) explored++;
  }
  const s0 = performance.now();
  const json = JSON.stringify(serializeSim(sim, { name: 'Soak', createdAt: 0 }));
  const saveMs = performance.now() - s0;
  const l0 = performance.now();
  const raw = migrate(JSON.parse(json));
  validateSave(raw as unknown as Record<string, unknown>);
  deserializeSim(raw);
  const loadMs = performance.now() - l0;
  rows.push({
    day,
    p50: +q(times, 0.5).toFixed(2), p95: +q(times, 0.95).toFixed(2), p99: +q(times, 0.99).toFixed(2), max: +times[times.length - 1].toFixed(1),
    chunks: sim.world.chunks.size, explored, modified,
    paths: pathTotals.calls - calls0, nodesK: Math.round((pathTotals.expanded - nodes0) / 1000),
    reservations: sim.reservations.size, unreach: sim.unreachable.size, shared: sim.sharedUnreachable.size,
    withPath: sim.settlers.filter((s) => s.path).length, regrowth: sim.regrowth.size, designations: sim.designations.size,
    chronicle: sim.chronicle.length, events,
    heapMB: heapMb(), saveKB: Math.round(json.length / 1024), saveMs: +saveMs.toFixed(1), loadMs: +loadMs.toFixed(1),
  });
  console.error(`day ${day}/${DAYS} done`);
}
console.log(JSON.stringify({ settlers: sim.settlers.length, buildings: sim.buildings.size, seed: SEED, node: process.version, gcForced: !!gc }));
console.table(rows);
