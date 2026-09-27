import { keyX, keyY, tileKey } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { CHUNK_AREA } from '../world/Chunk';
import { chunkKey } from '../world/World';
import { generateChunk } from '../world/worldgen';
import type { ObjectId } from '../world/tiles';
import { assignHomes } from '../sim/buildings';
import { currentMilestone } from '../sim/progression';
import { Simulation } from '../sim/Simulation';
import type { Building, Settler } from '../sim/types';
import { SAVE_VERSION, type SaveFile, type SaveView, type SavedBuilding, type SavedChunk, type SavedSettler } from './format';

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function packBits(flags: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(flags.length / 8));
  for (let i = 0; i < flags.length; i++) if (flags[i]) out[i >> 3] |= 1 << (i & 7);
  return out;
}

function unpackBits(bits: Uint8Array, into: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < into.length; i++) {
    const v = (bits[i >> 3] >> (i & 7)) & 1;
    into[i] = v;
    n += v;
  }
  return n;
}

export interface SerializeExtras {
  name: string;
  createdAt: number;
  view?: SaveView;
  tutorial?: { step: number; done: boolean };
}

export function serializeSim(sim: Simulation, extras: SerializeExtras): SaveFile {
  const chunks: SavedChunk[] = [];
  for (const c of sim.world.chunks.values()) {
    if (!c.modified && c.exploredCount === 0) continue;
    const sc: SavedChunk = { cx: c.cx, cy: c.cy, explored: bytesToB64(packBits(c.explored)) };
    if (c.modified) {
      sc.terrain = bytesToB64(c.terrain);
      sc.obj = bytesToB64(c.obj);
      sc.amt = bytesToB64(c.amt);
    }
    chunks.push(sc);
  }
  const settlers: SavedSettler[] = sim.settlers.map((s) => ({
    id: s.id, name: s.name, x: s.x, y: s.y, facing: s.facing, job: s.job,
    carrying: s.carrying ? { ...s.carrying } : null,
    hunger: s.hunger, energy: s.energy, homeId: s.homeId, appearance: { ...s.appearance },
    focus: s.focus ? { res: s.focus.res, x: s.focus.x, y: s.focus.y, until: s.focus.until } : null,
    areaId: s.areaId, priorities: s.priorities ? [...s.priorities] : null, settlementId: s.settlementId,
  }));
  const buildings: SavedBuilding[] = [...sim.buildings.values()].map((b) => {
    const sb: SavedBuilding = {
      id: b.id, type: b.type, x: b.x, y: b.y, built: b.built, progress: b.progress,
      delivered: { ...b.delivered }, inventory: { ...b.inventory }, placedTick: b.placedTick, workers: [...b.workers], wants: { ...b.wants },
    };
    if (BUILDINGS[b.type].span) {
      sb.w = b.w;
      sb.h = b.h;
    }
    if (b.field) sb.field = { ...b.field };
    if (b.workshop) sb.workshop = { recipe: b.workshop.recipe, progress: b.workshop.progress, paused: b.workshop.paused };
    return sb;
  });
  return {
    version: SAVE_VERSION,
    meta: {
      name: extras.name, seed: sim.seed, createdAt: extras.createdAt, savedAt: Date.now(),
      day: sim.day, population: sim.settlers.length, milestone: currentMilestone(sim),
    },
    sim: {
      tick: sim.tick, nextId: sim.nextId, rngState: sim.rng.state, lastArrival: sim.lastArrival,
      settlers, buildings,
      designations: [...sim.designations].map((k) => [keyX(k), keyY(k)]),
      regrowth: [...sim.regrowth].map(([k, r]) => [keyX(k), keyY(k), r.to, r.at]),
      stats: { ...sim.stats },
      reached: [...sim.progression.reached],
      weather: { ...sim.weather },
      workAreas: sim.workAreas.map((a) => ({ ...a })),
      settlements: sim.settlements.map((s) => ({ ...s })),
      chronicle: sim.chronicle.map((c) => ({ ...c })),
      session: sim.session ? { ...sim.session, startStats: { ...sim.session.startStats } } : null,
    },
    world: { genVersion: sim.world.genVersion, chunks },
    view: extras.view,
    tutorial: extras.tutorial,
  };
}

/**
 * Rebuilds a simulation from a (migrated, validated) save. Tasks and
 * reservations are not saved: settlers simply pick up work again, which
 * guarantees no goods are double-counted after a load.
 */
export function deserializeSim(save: SaveFile): Simulation {
  const d = save.sim;
  const sim = new Simulation(save.meta.seed, d.rngState, save.world.genVersion);
  sim.tick = d.tick;
  sim.nextId = d.nextId;
  sim.lastArrival = d.lastArrival;
  sim.stats = { ...sim.stats, ...d.stats };
  sim.progression = { reached: [...d.reached] };
  sim.weather = { ...d.weather };
  sim.workAreas = d.workAreas.map((a) => ({ ...a }));
  sim.settlements = d.settlements.map((s) => ({ ...s }));
  sim.chronicle = d.chronicle.map((c) => ({ ...c }));
  sim.session = d.session ? { ...d.session, startStats: { ...sim.stats, ...d.session.startStats } } : null;

  for (const sc of save.world.chunks) {
    const c = generateChunk(sim.seed, sc.cx, sc.cy, save.world.genVersion);
    c.exploredCount = unpackBits(b64ToBytes(sc.explored), c.explored);
    if (sc.terrain && sc.obj && sc.amt) {
      const t = b64ToBytes(sc.terrain);
      const o = b64ToBytes(sc.obj);
      const a = b64ToBytes(sc.amt);
      if (t.length !== CHUNK_AREA || o.length !== CHUNK_AREA || a.length !== CHUNK_AREA) {
        throw new Error(`Chunk ${sc.cx},${sc.cy} is damaged`);
      }
      c.terrain.set(t);
      c.obj.set(o);
      c.amt.set(a);
      c.modified = true;
    }
    sim.world.chunks.set(chunkKey(sc.cx, sc.cy), c);
  }

  for (const sb of d.buildings) {
    const def = BUILDINGS[sb.type];
    const b: Building = {
      id: sb.id, type: sb.type, x: sb.x, y: sb.y, w: def.span ? sb.w ?? 1 : def.size.w, h: def.span ? sb.h ?? 1 : def.size.h,
      built: sb.built, progress: sb.progress, delivered: { ...sb.delivered }, incoming: {},
      inventory: { ...sb.inventory }, reservedOut: {}, placedTick: sb.placedTick, workers: [...sb.workers], wants: { ...sb.wants },
    };
    if (sb.field) b.field = { ...sb.field };
    if (sb.workshop) b.workshop = { ...sb.workshop, status: '' };
    sim.buildings.set(b.id, b);
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) sim.occupancy.set(tileKey(b.x + dx, b.y + dy), b.id);
  }

  for (const ss of d.settlers) {
    const s: Settler = {
      id: ss.id, name: ss.name, x: ss.x, y: ss.y, px: ss.x, py: ss.y, facing: ss.facing,
      anim: 'idle', tool: null, job: ss.job, carrying: ss.carrying ? { ...ss.carrying } : null,
      capacity: 10, hunger: ss.hunger, energy: ss.energy, homeId: ss.homeId, appearance: { ...ss.appearance },
      task: null, focus: ss.focus ? { kind: 'gather', ...ss.focus } : null, idleReason: '', hidden: false,
      path: null, pathIndex: 0, goalKey: null, repaths: 0, lastNotice: -9999, arrivedTick: 0,
      areaId: ss.areaId, priorities: ss.priorities ? [...ss.priorities] : null, insideId: null, restNote: '', nextThink: 0, settlementId: ss.settlementId,
    };
    sim.settlers.push(s);
  }
  for (const [x, y] of d.designations) sim.designations.add(tileKey(x, y));
  for (const [x, y, to, at] of d.regrowth) sim.regrowth.set(tileKey(x, y), { to: to as ObjectId, at });
  // Drop references to anything that no longer exists.
  const ids = new Set(sim.settlers.map((s) => s.id));
  for (const b of sim.buildings.values()) b.workers = b.workers.filter((id) => ids.has(id)).slice(0, BUILDINGS[b.type].maxWorkers ?? 0);
  for (const s of sim.settlers) if (s.areaId !== null && !sim.area(s.areaId)) s.areaId = null;
  sim.settlements = sim.settlements.filter((st) => sim.buildings.has(st.id));
  for (const s of sim.settlers) if (s.settlementId !== null && !sim.settlements.some((st) => st.id === s.settlementId)) s.settlementId = sim.settlements[0]?.id ?? null;
  assignHomes(sim);
  return sim;
}

