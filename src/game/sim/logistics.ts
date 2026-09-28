import { CHUNK_SHIFT, tileKey } from '../core/constants';
import { BUILDINGS } from '../data/buildings';
import { isResourceId, RESOURCES, RESOURCE_IDS, type Inventory, type ResourceId } from '../data/resources';
import { CHUNK } from '../core/constants';
import { TERRAIN, type TerrainId } from '../world/tiles';
import { entranceOf, placeBuilding } from './buildings';
import { isChild } from './households';
import { addInv, invEntries } from './inventory';
import { findPath, type PathGrid } from './pathfinding';
import { localAvailable, settlementName, settlementOfBuilding } from './settlements';
import { abortTask } from './settlers';
import type { Simulation } from './Simulation';
import type { Building, CommandResult, Manifest, Route, Settler } from './types';

/**
 * Supply routes between settlements. A route keeps a store in another
 * settlement stocked to a target. Carts from a caravan depot carry the goods
 * on an abstract leg: they leave the source at once (into the manifest), the
 * teamster is away with them, and they are unloaded on arrival. Travel time
 * comes from a path over explored land, roads and bridges only, found without
 * generating any map chunks, so freight can never cross an unbridged river.
 */
export const LOGISTICS_STEP = 25;
export const CART_CAPACITY = 20;
/** Tiles per tick for a loaded cart. */
export const CARAVAN_SPEED = 0.2;
/** Food a teamster takes for the trip, from the source settlement's stores. */
export const PROVISIONS = 1;

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

const bname = (b: Building) => BUILDINGS[b.type].name.toLowerCase();

/** Walkable, explored ground in chunks that are already loaded: path searches never create chunks. */
function knownGround(sim: Simulation): PathGrid {
  return {
    walkable(x: number, y: number): boolean {
      const c = sim.world.peekChunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
      if (!c) return false;
      const i = (y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1));
      if (!c.explored[i]) return false;
      return sim.walkable(x, y);
    },
    cost(x: number, y: number): number {
      const c = sim.world.peekChunk(x >> CHUNK_SHIFT, y >> CHUNK_SHIFT);
      if (!c) return 1;
      return TERRAIN[c.terrain[(y & (CHUNK - 1)) * CHUNK + (x & (CHUNK - 1))] as TerrainId].moveCost;
    },
  };
}

/** The cart's leg from one building to another, or null if no known road or bridge joins them. */
export function leg(sim: Simulation, from: Building, to: Building): { ticks: number; path: { x: number; y: number }[] } | null {
  const k = `${from.id}:${to.id}`;
  if (sim.legCache.has(k)) return sim.legCache.get(k)!;
  const grid = knownGround(sim);
  const e = entranceOf(from);
  let start = e;
  if (!grid.walkable(e.x, e.y)) {
    let found: { x: number; y: number } | null = null;
    for (let y = from.y - 1; y <= from.y + from.h && !found; y++) for (let x = from.x - 1; x <= from.x + from.w && !found; x++) if (grid.walkable(x, y)) found = { x, y };
    if (!found) {
      sim.legCache.set(k, null);
      return null;
    }
    start = found;
  }
  const path = findPath(grid, start.x, start.y, { x: to.x, y: to.y, w: to.w, h: to.h, adjacent: true }, 80000);
  let result: { ticks: number; path: { x: number; y: number }[] } | null = null;
  if (path) {
    let cost = 0;
    for (const p of path) cost += grid.cost(p.x, p.y);
    result = { ticks: Math.max(30, Math.ceil(cost / CARAVAN_SPEED)), path: [start, ...path] };
  }
  sim.legCache.set(k, result);
  return result;
}

/** Goods on carts heading to a store (all resources), which must still fit when they arrive. */
function claimedSpace(sim: Simulation, dstId: number): number {
  let n = 0;
  for (const m of sim.manifests) if (m.state === 'outbound' && m.destId === dstId) for (const [, v] of invEntries(m.cargo)) n += v;
  return n;
}

function inFlight(sim: Simulation, dstId: number, res: ResourceId): number {
  let n = 0;
  for (const m of sim.manifests) if (m.state === 'outbound' && m.destId === dstId) n += m.cargo[res] ?? 0;
  return n;
}

/**
 * What a store may send away: its unreserved stock minus its own stock target
 * and minus the target of any route that supplies it with the same goods.
 * That floor is what stops two opposing routes from shuttling goods forever.
 */
export function routeSpare(sim: Simulation, b: Building, res: ResourceId): number {
  let keep = b.wants[res] ?? 0;
  for (const r of sim.routes) if (r.destId === b.id && r.res === res) keep = Math.max(keep, r.target);
  return sim.available(b, res) - keep;
}

function teamster(sim: Simulation, src: Building): { depot: Building | null; crew: Settler | null } {
  const home = settlementOfBuilding(sim, src)?.id ?? null;
  let depot: Building | null = null;
  for (const b of sim.buildings.values()) {
    if (!b.built || !BUILDINGS[b.type].depot) continue;
    if (sim.settlements.length > 1 && settlementOfBuilding(sim, b)?.id !== home) continue;
    depot ??= b;
    for (const id of b.workers) {
      const s = sim.settler(id);
      if (s && s.awayOn === null && !isChild(s)) return { depot: b, crew: s };
    }
  }
  return { depot, crew: null };
}

export function createRoute(sim: Simulation, sourceId: unknown, destinationId: unknown, resource: unknown, target: unknown): CommandResult {
  const src = sim.buildings.get(sourceId as number);
  const dst = sim.buildings.get(destinationId as number);
  if (!src || !dst || !src.built || !dst.built || !BUILDINGS[src.type].storage || !BUILDINGS[dst.type].storage) return err('A route runs between two finished stores or settlement halls');
  if (src.id === dst.id) return err('Choose two different stores');
  if (!isResourceId(resource)) return err('Choose what to carry');
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1) return err('Choose how much to keep there');
  const a = settlementOfBuilding(sim, src);
  const b = settlementOfBuilding(sim, dst);
  if (a && b && a.id === b.id) return err(`Both stores are in ${a.name} — haulers already move goods within a settlement`);
  if (sim.routes.some((r) => r.sourceId === src.id && r.destId === dst.id && r.res === resource)) return err('That route already exists — change its target instead');
  const route: Route = { id: sim.allocId(), sourceId: src.id, destId: dst.id, res: resource, target: Math.min(target, sim.storageCapacity(dst)), status: '' };
  sim.routes.push(route);
  sim.emit({ type: 'important' });
  return ok(`Caravans will keep ${route.target} ${RESOURCES[resource].name.toLowerCase()} at ${settlementName(sim, b?.id ?? null)}'s ${bname(dst)}, from ${settlementName(sim, a?.id ?? null)}.`, route.id);
}

export function setRouteTarget(sim: Simulation, routeId: unknown, target: unknown): CommandResult {
  const r = sim.routes.find((x) => x.id === routeId);
  if (!r) return err('That route is gone');
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1) return err('Invalid target');
  const dst = sim.buildings.get(r.destId);
  r.target = Math.min(target, dst ? sim.storageCapacity(dst) : target);
  return ok();
}

/** Ends a route. A cart already on the road turns round and brings its goods home. */
export function cancelRoute(sim: Simulation, routeId: unknown): CommandResult {
  const r = sim.routes.find((x) => x.id === routeId);
  if (!r) return err('That route is gone');
  sim.routes = sim.routes.filter((x) => x !== r);
  let turned = 0;
  for (const m of sim.manifests) {
    if (m.routeId !== r.id || m.state !== 'outbound') continue;
    m.state = 'returning';
    m.arriveTick = sim.tick + Math.max(1, sim.tick - m.departTick);
    turned++;
  }
  return ok(turned ? 'Route ended. The cart on the road is turning back with its load.' : 'Route ended.');
}

/** Plain-language state of a route. */
export function routeInfo(sim: Simulation, routeId: number): { status: string; carrying: number } {
  const r = sim.routes.find((x) => x.id === routeId);
  if (!r) return { status: 'Gone', carrying: 0 };
  const m = sim.manifests.find((x) => x.routeId === r.id);
  if (m) return { status: m.state === 'outbound' ? `A cart is on the way with ${m.cargo[r.res] ?? 0}` : 'The cart is on its way back', carrying: m.cargo[r.res] ?? 0 };
  return { status: r.status || 'Waiting', carrying: 0 };
}

function dispatch(sim: Simulation, r: Route): void {
  const src = sim.buildings.get(r.sourceId);
  const dst = sim.buildings.get(r.destId);
  if (!src || !dst) {
    r.status = 'One of its stores is gone';
    return;
  }
  if (sim.manifests.some((m) => m.routeId === r.id)) {
    r.status = '';
    return;
  }
  const name = RESOURCES[r.res].name.toLowerCase();
  const need = r.target - (dst.inventory[r.res] ?? 0) - inFlight(sim, dst.id, r.res);
  if (need <= 0) {
    r.status = `Target reached (${dst.inventory[r.res] ?? 0}/${r.target})`;
    return;
  }
  const spare = routeSpare(sim, src, r.res);
  if (spare <= 0) {
    r.status = `Waiting: nothing to spare at the ${bname(src)} (it keeps what its own targets ask for)`;
    return;
  }
  const room = sim.storageCapacity(dst) - sim.storageUsed(dst) - claimedSpace(sim, dst.id);
  if (room <= 0) {
    r.status = `Waiting: the ${bname(dst)} is full`;
    return;
  }
  const from = settlementOfBuilding(sim, src);
  const { depot, crew } = teamster(sim, src);
  if (!depot) {
    r.status = `Needs a caravan depot in ${from?.name ?? 'the source settlement'}`;
    return;
  }
  if (!crew) {
    r.status = `Needs a teamster: assign a settler to the depot in ${from?.name ?? 'the source settlement'}`;
    return;
  }
  const way = leg(sim, depot, dst);
  if (!way) {
    r.status = `No road or bridge connects ${from?.name ?? 'the depot'} and ${settlementOfBuilding(sim, dst)?.name ?? 'the destination'} over explored land`;
    return;
  }
  if (localAvailable(sim, from?.id ?? null, 'food') < PROVISIONS) {
    r.status = 'Waiting: the teamster needs food for the road';
    return;
  }
  const amount = Math.min(need, spare, room, CART_CAPACITY);
  // Provisions and cargo leave the stores in the same step as the cart.
  sim.withdrawUnreserved('food', PROVISIONS);
  sim.stats.provisions += PROVISIONS;
  addInv(src.inventory, r.res, -amount);
  abortTask(sim, crew);
  const m: Manifest = {
    id: sim.allocId(), routeId: r.id, crewId: crew.id, sourceId: src.id, destId: dst.id, cargo: { [r.res]: amount },
    state: 'outbound', departTick: sim.tick, arriveTick: sim.tick + way.ticks, legTicks: way.ticks,
    from: { x: depot.x + depot.w / 2, y: depot.y + depot.h }, to: { x: dst.x + dst.w / 2, y: dst.y + dst.h },
  };
  sim.manifests.push(m);
  crew.awayOn = m.id;
  crew.hidden = true;
  crew.task = null;
  crew.idleReason = '';
  sim.stats.caravanTrips++;
  r.status = '';
  sim.emit({ type: 'sfx', name: 'drop', x: depot.x + 1, y: depot.y + 1 });
  sim.toast(`A caravan left for ${settlementOfBuilding(sim, dst)?.name ?? 'the other settlement'} with ${amount} ${name}.`, 'info');
}

/** Leaves goods in a crate near a spot (a store settlers can draw from). Returns what could not be placed. */
export function dropCrate(sim: Simulation, at: { x: number; y: number }, cargo: Inventory): void {
  if (invEntries(cargo).length === 0) return;
  const cx = Math.round(at.x);
  const cy = Math.round(at.y);
  for (let r = 0; r < 8; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (sim.buildingAt(x, y) || !sim.walkable(x, y) || !sim.world.explored(x, y) || !TERRAIN[sim.world.terrain(x, y)].buildable) continue;
        const crate = placeBuilding(sim, 'crate', x, y);
        for (const [res, n] of invEntries(cargo)) {
          crate.inventory[res] = (crate.inventory[res] ?? 0) + n;
          delete cargo[res];
        }
        sim.toast('A caravan left its load in a crate: settlers will use it like a store.', 'warn');
        return;
      }
    }
  }
}

function unload(sim: Simulation, b: Building | undefined, cargo: Inventory): number {
  if (!b || !b.built || !BUILDINGS[b.type].storage) return 0;
  let n = 0;
  for (const [res, v] of invEntries(cargo)) {
    const put = sim.deposit(b, res, v);
    addInv(cargo, res, -put);
    n += put;
  }
  return n;
}

function arrive(sim: Simulation, m: Manifest): void {
  if (m.state === 'outbound') {
    const dst = sim.buildings.get(m.destId);
    const put = unload(sim, dst, m.cargo);
    if (put > 0) {
      sim.stats.caravanDeliveries++;
      if (dst) sim.emit({ type: 'sfx', name: 'drop', x: dst.x + 1, y: dst.y + 1 });
    }
    m.state = 'returning';
    m.arriveTick = sim.tick + m.legTicks;
    return;
  }
  // Home again: unload anything left, first into the source, then any store, then a crate.
  const src = sim.buildings.get(m.sourceId);
  unload(sim, src, m.cargo);
  for (const [res, v] of invEntries(m.cargo)) {
    const left = sim.depositAnywhere(res, v, m.from.x, m.from.y);
    addInv(m.cargo, res, -(v - left));
  }
  dropCrate(sim, m.from, m.cargo);
  sim.manifests = sim.manifests.filter((x) => x !== m);
  const crew = sim.settler(m.crewId);
  if (crew) {
    crew.awayOn = null;
    crew.hidden = false;
    crew.x = m.from.x;
    crew.y = m.from.y + 0.5;
    crew.px = crew.x;
    crew.py = crew.y;
    crew.nextThink = 0;
  }
}

/** Removes empty crates. */
function tidyCrates(sim: Simulation): void {
  for (const b of [...sim.buildings.values()]) {
    if (b.type !== 'crate') continue;
    const empty = RESOURCE_IDS.every((r) => !(b.inventory[r] ?? 0) && !(b.reservedOut[r] ?? 0) && !(b.incoming[r] ?? 0));
    if (empty) {
      sim.buildings.delete(b.id);
      sim.occupancy.delete(tileKey(b.x, b.y));
      sim.mapChanged();
    }
  }
}

export function updateLogistics(sim: Simulation): void {
  for (const m of [...sim.manifests]) if (sim.tick >= m.arriveTick) arrive(sim, m);
  for (const r of sim.routes) dispatch(sim, r);
  tidyCrates(sim);
}

/** Where a cart is now, for drawing (tile coordinates). */
export function cartPosition(sim: Simulation, m: Manifest, alpha = 0): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, (sim.tick + alpha - (m.arriveTick - m.legTicks)) / m.legTicks));
  const [a, b] = m.state === 'outbound' ? [m.from, m.to] : [m.to, m.from];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
