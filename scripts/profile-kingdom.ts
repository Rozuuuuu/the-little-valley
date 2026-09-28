/**
 * Kingdom-scale simulation profile (Node): 100 civilians in two towns, four
 * known rival kingdoms, and a war with 64 soldiers in the field across sides.
 * Reports tick timings by phase, snapshot (UI data) cost, path expansions,
 * heap, and save size and duration.
 *
 *   npx tsx scripts/profile-kingdom.ts
 *
 * These are simulation timings in Node, not browser frame times: rendering
 * (including zoomed-out views) is not measured here.
 */
import { DAY_TICKS } from '../src/game/core/constants';
import { BUILDINGS } from '../src/game/data/buildings';
import { SEASON_DAYS } from '../src/game/data/seasons';
import { growthInfo } from '../src/engine/growthInfo';
import { armyInfo } from '../src/engine/militaryInfo';
import { diplomacyInfo, kingdomInfo, newsInfo, warCouncilInfo, warInfo } from '../src/engine/kingdomSnapshot';
import { logisticsInfo } from '../src/engine/tradeInfo';
import { settlerInfo } from '../src/engine/snapshot';
import { serializeSim, deserializeSim } from '../src/game/save/serialize';
import { migrate } from '../src/game/save/migrations';
import { assignHomes, campOf, completeBuilding, costOf, placeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { updateConcern } from '../src/game/sim/concern';
import { deployRival } from '../src/game/sim/combat';
import { knowKingdomOf, playerKingdom } from '../src/game/sim/kingdoms';
import { deliverReports, recordEvent, recordObservation } from '../src/game/sim/news';
import { createNewGame } from '../src/game/sim/newGame';
import { pathTotals } from '../src/game/sim/pathfinding';
import type { Simulation } from '../src/game/sim/Simulation';
import { nearbyTowns } from '../src/game/world/regions';
import { OBJECTS, T } from '../src/game/world/tiles';

const sim = createNewGame(424242, 3);
sim.progression.reached.push('hamlet', 'village', 'town', 'region', 'civilization');
sim.world.reveal(0, 0, 44);
for (let x = 0; x >= -70; x -= 4) sim.world.reveal(x, 0, 12);

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
  // A waystation must found its settlement, which silent setup builds skip.
  completeBuilding(sim, b, type !== 'waystation');
  return b;
}

// Two towns: the camp and a waystation, with homes, stores, production and a route.
const camp = campOf(sim)!;
camp.inventory = { food: 240, wood: 60, stone: 40, swords: 40 };
const hall = instant('waystation', { x: -44, y: 0 })!;
for (let i = 0; i < 12; i++) instant('cottage', { x: -20 + (i % 6) * 6, y: i < 6 ? -14 : 16 });
for (let i = 0; i < 5; i++) instant('cottage', { x: -52 + i * 5, y: 10 });
instant('storehouse', { x: -10, y: -6 });
instant('storehouse', { x: -44, y: -8 });
instant('workshop', { x: 12, y: 8 });
const depot = instant('depot', { x: 8, y: -6 })!;
const barracks = instant('barracks', { x: 14, y: -10 })!;
instant('inn', { x: -6, y: 10 });
applyCommand(sim, { type: 'placeArea', building: 'field', x0: -12, y0: 3, x1: -4, y1: 8, crop: 'turnip' });
const jobs = ['laborer', 'farmer', 'gatherer', 'builder', 'hauler'] as const;
while (sim.settlers.length < 100) {
  const i = sim.settlers.length;
  const far = i % 3 === 0;
  sim.addSettler((far ? -44 : 0) + (i % 7) - 3, 4 + Math.floor((i % 21) / 7), jobs[i % 5], undefined, far ? hall.id : camp.id);
}
assignHomes(sim);
applyCommand(sim, { type: 'assignWorker', buildingId: depot.id, ids: [sim.settlers[5].id] });
applyCommand(sim, { type: 'createRoute', sourceId: camp.id, destinationId: hall.id, resource: 'food', target: 40 });

// The crown and four known kingdoms.
applyCommand(sim, { type: 'coronate', rulerName: 'Queen Ada', kingdomName: 'Adamere', banner: { color: '#3a6ea5', emblem: 'oak' } });
applyCommand(sim, { type: 'appointCouncil', post: 'envoy', settlerId: sim.settlers[0].id });
const rivals = nearbyTowns(sim.seed).slice(0, 4).map((t) => knowKingdomOf(sim, t.id));
for (const r of rivals) while (r.companies.length < 8) r.companies.push({ id: r.id * 100 + r.companies.length, kind: 'infantry', strength: 10, pledgedTo: null, owner: r.id });
playerKingdom(sim).treasury = 500;

for (let i = 0; i < 200; i++) sim.step();
sim.drainEvents();

function stats(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { ticks: s.length, avg: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), p99: +q(0.99).toFixed(3), max: +s[s.length - 1].toFixed(2) };
}
function measure(ticks: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now();
    sim.step();
    out.push(performance.now() - t0);
    sim.drainEvents();
  }
  return out;
}

// 1. Ordinary work (a full day, towns and caravans running).
const p0 = { ...pathTotals };
const ordinary = measure(DAY_TICKS);
const paths = { calls: pathTotals.calls - p0.calls, expanded: pathTotals.expanded - p0.expanded };

// 2. A season change: the ticks either side of the next boundary.
const nextSeason = (Math.floor((sim.day - 1) / SEASON_DAYS) + 1) * SEASON_DAYS + 1;
sim.tick = Math.round((nextSeason - 1) * DAY_TICKS - DAY_TICKS * 0.26 - 100);
const season = measure(200);

// 3. A burst of news: 300 events reported to every kingdom, then delivery and concern.
for (let i = 0; i < 300; i++) {
  const subject = i % 2 ? 0 : rivals[i % 4].id;
  const ev = recordEvent(sim, i % 3 ? 'military-buildup' : 'claim', subject, 1 + (i % 5), null);
  for (const k of sim.kingdoms) if (k.id !== subject) recordObservation(sim, k.id, subject, ev.kind, null, { eventId: ev.id, certainty: 'observed', source: 'scout', delay: 0 });
}
let t0 = performance.now();
deliverReports(sim);
updateConcern(sim, true);
const newsBurstMs = performance.now() - t0;

// 4. Combat: war with two kingdoms; 64 soldiers in the field across sides.
sim.progression.reached.includes('civilization');
applyCommand(sim, { type: 'activateFrontier' });
applyCommand(sim, { type: 'claimFrontier', sector: { x: -3, y: 1 } });
applyCommand(sim, { type: 'declareWar', target: rivals[0].id, objective: 'raid', confirmBreach: true });
sim.setWar(rivals[1].id, rivals[2].id, true);
const recruits = sim.settlers.filter((s) => !s.military && s.id !== sim.settlers[0].id).slice(0, 32).map((s) => s.id);
camp.inventory.swords = 40;
sim.world.reveal(-40, 22, 14);
for (let i = 0; i < recruits.length; i += 4) {
  const r = applyCommand(sim, { type: 'enlist', ids: recruits.slice(i, i + 4), unit: 'infantry', buildingId: barracks.id });
  if (!r.ok) console.error('enlist:', r.message);
  for (const id of recruits.slice(i, i + 4)) {
    const m = sim.settler(id)?.military;
    if (m) m.trained = 1e9;
  }
  sim.step();
}
for (const id of recruits) {
  const m = sim.settler(id)?.military;
  if (m) m.trained = 1e9;
}
for (let i = 0; i < 60; i++) sim.step();
for (const c of playerKingdom(sim).companies) {
  const r = applyCommand(sim, { type: 'orderCompany', companyId: c.id, order: 'defend', x: -40, y: 20, supplyDays: 4 });
  if (!r.ok) console.error('order:', r.message);
}
while (deployRival(sim, rivals[0].id, { x: -40 - (sim.tick % 5), y: 22 }, true));
const soldiersInField = sim.kingdoms.reduce((n, k) => n + k.companies.filter((c) => c.state === 'deployed').reduce((m, c) => m + (k.player ? (c.members?.length ?? 0) : 4), 0), 0);
const combat = measure(600);

// 5. UI snapshot cost (all panel data, as the 4 Hz snapshot builds it).
const snaps: number[] = [];
for (let i = 0; i < 40; i++) {
  t0 = performance.now();
  sim.settlers.map((s) => settlerInfo(sim, s));
  growthInfo(sim);
  logisticsInfo(sim);
  kingdomInfo(sim);
  diplomacyInfo(sim);
  newsInfo(sim);
  warCouncilInfo(sim);
  armyInfo(sim);
  warInfo(sim);
  snaps.push(performance.now() - t0);
}

// 6. Saving and loading.
t0 = performance.now();
const text = JSON.stringify(serializeSim(sim, { name: 'Profile', createdAt: 0 }));
const saveMs = performance.now() - t0;
t0 = performance.now();
deserializeSim(migrate(JSON.parse(text)));
const loadMs = performance.now() - t0;

console.log(JSON.stringify({
  scenario: { settlers: sim.settlers.length, settlements: sim.settlements.length, knownKingdoms: sim.kingdoms.length - 1, soldiersInField, buildings: sim.buildings.size },
  ordinaryDay: stats(ordinary),
  seasonChange: stats(season),
  newsBurst: { events: 300, deliverAndConcernMs: +newsBurstMs.toFixed(2) },
  combat: stats(combat),
  snapshotMs: stats(snaps),
  paths,
  heapMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
  save: { bytes: text.length, serializeMs: +saveMs.toFixed(1), loadMs: +loadMs.toFixed(1) },
  rendering: 'not measured (Node has no browser renderer)',
  node: process.version,
}, null, 1));
