/**
 * Simulation-tick profile of a developed village with ~100 settlers.
 * Run: npx tsx scripts/profile-village.ts [settlers]
 * Measures every tick over two in-game days (including bedtime and morning rushes).
 */
import { DAY_TICKS } from '../src/game/core/constants';
import { BUILDINGS } from '../src/game/data/buildings';
import { assignHomes, campOf, costOf, completeBuilding, placeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { OBJECTS, T } from '../src/game/world/tiles';
import { pathTotals } from '../src/game/sim/pathfinding';

const N = Number(process.argv[2] ?? 100);
// Generator 3 land, as in the M0 baseline, so timings stay comparable.
const sim = createNewGame(777001, 3);
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

// A developed village: homes for most, storage, production, fields.
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
// Settlers added directly need homes handed out (arrivals and births do this themselves).
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
// Some construction to haul for.
for (let i = 0; i < 4; i++) {
  const p = spot(sim, 3, 2, { x: 24, y: -4 + i * 5 });
  if (p) applyCommand(sim, { type: 'place', building: 'cottage', x: p.x, y: p.y });
}
applyCommand(sim, { type: 'designate', x0: -30, y0: -30, x1: 30, y1: 30, on: true });

for (let i = 0; i < 300; i++) sim.step();
const day: number[] = [];
const night: number[] = [];
let busySamples = 0;
let busyTotal = 0;
for (let i = 0; i < DAY_TICKS * 2; i++) {
  const isNight = sim.isNight();
  const c0 = pathTotals.calls;
  const e0 = pathTotals.expanded;
  const t0 = performance.now();
  sim.step();
  const dt = performance.now() - t0;
  if (dt > 10 && process.env.SPIKES) console.log('spike', dt.toFixed(1), 'ms tick', sim.tick, 'paths', pathTotals.calls - c0, 'nodes', pathTotals.expanded - e0, 'night', isNight);
  (isNight ? night : day).push(dt);
  sim.drainEvents();
  if (i % 100 === 0 && !isNight) {
    busySamples++;
    busyTotal += sim.settlers.filter((s) => s.task && s.task.kind !== 'wander' && s.task.kind !== 'sleep').length;
  }
}
function stats(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const avg = s.reduce((x, y) => x + y, 0) / s.length;
  return { ticks: s.length, avg: +avg.toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), p99: +q(0.99).toFixed(3), max: +s[s.length - 1].toFixed(2) };
}
console.log(JSON.stringify({
  settlers: sim.settlers.length,
  buildings: sim.buildings.size,
  homeless: sim.settlers.filter((s) => s.homeId === null).length,
  avgBusyDaytime: Math.round(busyTotal / Math.max(1, busySamples)),
  day: stats(day),
  night: stats(night),
  node: process.version,
}, null, 1));
