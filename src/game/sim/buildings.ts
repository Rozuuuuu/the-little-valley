import { DAY_TICKS, keyX, keyY, tileKey } from '../core/constants';
import { hash01 } from '../core/rng';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { CROPS, type CropId } from '../data/crops';
import { MILESTONES } from '../data/progression';
import { RECIPES } from '../data/recipes';
import { RESOURCES, type Inventory } from '../data/resources';
import { O, OBJECTS, T, TERRAIN } from '../world/tiles';
import { addInv, formatInv, hasAll, invEntries } from './inventory';
import { findPath } from './pathfinding';
import { canDo } from './priorities';
import { seasonOf } from './seasons';
import { foundSettlement, settlementAt, spacingProblem } from './settlements';
import { relocateClaims } from './households';
import type { Simulation } from './Simulation';
import type { Building } from './types';

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
  /** Per-tile validity for the placement preview. */
  tiles: { x: number; y: number; ok: boolean }[];
}

export function isUnlocked(sim: Simulation, unlock: string | undefined): boolean {
  return !unlock || sim.progression.reached.includes(unlock as never);
}

export function unlockName(unlock: string | undefined): string {
  return unlock ? MILESTONES[unlock as keyof typeof MILESTONES]?.name ?? unlock : '';
}

// ---- cost & work (span buildings scale with their length) ---------------------

export function costOf(b: { type: BuildingId; w: number; h: number }): Inventory {
  const def = BUILDINGS[b.type];
  if (!def.span) return def.cost;
  const tiles = b.w * b.h;
  const out: Inventory = {};
  for (const [r, n] of invEntries(def.span.costPerTile)) out[r] = n * tiles;
  return out;
}

export function workOf(b: { type: BuildingId; w: number; h: number }): number {
  const def = BUILDINGS[b.type];
  return def.span ? def.span.workPerTile * b.w * b.h : def.work;
}

// ---- placement ------------------------------------------------------------------

function tileProblem(sim: Simulation, type: BuildingId, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  const w = sim.world;
  if (!w.explored(x, y)) return 'Explore this area first';
  if (sim.occupancy.has(tileKey(x, y))) return 'Something is already built here';
  const t = w.terrain(x, y);
  const tdef = TERRAIN[t];
  const o = w.obj(x, y);
  if (def.placement === 'span') {
    if (t !== T.Water && t !== T.DeepWater) return 'A stone bridge spans water only — start and end at the banks';
    return null;
  }
  if (def.placement === 'water') {
    if (t !== T.Water) return t === T.DeepWater ? 'Too deep for a wooden bridge — a stone bridge can cross here' : 'Bridges go on shallow water';
    return null;
  }
  if (def.placement === 'farmland') {
    if (tdef.fertility <= 0) return `Nothing grows on ${tdef.name.toLowerCase()}`;
  } else if (!tdef.buildable) {
    return t === T.Road ? 'There is already a path here' : `Can't build on ${tdef.name.toLowerCase()}`;
  }
  if (OBJECTS[o].blocks) return `Blocked by a ${OBJECTS[o].name.toLowerCase()} — harvest it first`;
  return null;
}

function gateProblem(sim: Simulation, type: BuildingId): string | undefined {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'This cannot be built';
  if (!isUnlocked(sim, def.unlock)) return `Unlocks at ${unlockName(def.unlock)}`;
  return undefined;
}

export function checkPlacement(sim: Simulation, type: BuildingId, x: number, y: number): PlacementCheck {
  const def = BUILDINGS[type];
  const tiles: PlacementCheck['tiles'] = [];
  let reason = gateProblem(sim, type);
  for (let dy = 0; dy < def.size.h; dy++) {
    for (let dx = 0; dx < def.size.w; dx++) {
      const p = tileProblem(sim, type, x + dx, y + dy);
      if (p && !reason) reason = p;
      tiles.push({ x: x + dx, y: y + dy, ok: !p });
    }
  }
  const spacing = spacingProblem(sim, type, x, y);
  if (spacing) {
    reason ??= spacing;
    for (const t of tiles) t.ok = false;
  }
  return { ok: !reason, reason, tiles };
}

export interface SpanCheck extends PlacementCheck {
  rect: { x: number; y: number; w: number; h: number };
}

/**
 * A span building (the stone bridge) runs in a straight line over water tiles
 * only, with dry, walkable land just beyond both ends. The drag is snapped to
 * its longer axis.
 */
export function checkSpan(sim: Simulation, type: BuildingId, x0: number, y0: number, x1: number, y1: number): SpanCheck {
  const def = BUILDINGS[type];
  const span = def.span!;
  const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  if (horizontal) y1 = y0;
  else x1 = x0;
  const rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
  const len = Math.max(rect.w, rect.h);
  const tiles: PlacementCheck['tiles'] = [];
  let reason = gateProblem(sim, type);
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const p = tileProblem(sim, type, rect.x + dx, rect.y + dy);
      if (p && !reason) reason = p;
      tiles.push({ x: rect.x + dx, y: rect.y + dy, ok: !p });
    }
  }
  if (!reason && len < span.min) reason = `Too short: a bridge needs at least ${span.min} water tiles`;
  if (!reason && len > span.max) reason = `Too long: ${span.max} tiles at most — look for a narrower crossing`;
  if (!reason) {
    const ends = horizontal
      ? [{ x: rect.x - 1, y: rect.y }, { x: rect.x + rect.w, y: rect.y }]
      : [{ x: rect.x, y: rect.y - 1 }, { x: rect.x, y: rect.y + rect.h }];
    for (const e of ends) {
      const t = sim.world.terrain(e.x, e.y);
      if (t === T.Water || t === T.DeepWater) {
        reason = 'Both ends must reach dry land — extend the bridge to the bank';
        break;
      }
      if (!sim.world.explored(e.x, e.y) || !sim.walkable(e.x, e.y)) {
        reason = 'Each end needs open, explored ground to walk onto';
        break;
      }
    }
  }
  return { ok: !reason, reason, tiles, rect };
}

/** Human-readable shortfall against current stock, or null if affordable. */
export function shortfall(sim: Simulation, type: BuildingId, count = 1, size?: { w: number; h: number }): string | null {
  const totals = sim.totals();
  const missing: string[] = [];
  const def = BUILDINGS[type];
  const cost = costOf({ type, w: size?.w ?? def.size.w, h: size?.h ?? def.size.h });
  for (const [r, n] of invEntries(cost)) {
    const need = n * count;
    if (totals[r] < need) missing.push(`${need - totals[r]} more ${RESOURCES[r].name.toLowerCase()}`);
  }
  return missing.length ? missing.join(', ') : null;
}

/** Creates a building without validation. Callers use checkPlacement / checkSpan first. */
export function placeBuilding(sim: Simulation, type: BuildingId, x: number, y: number, crop?: CropId | null, size?: { w: number; h: number }): Building {
  const def = BUILDINGS[type];
  const b: Building = {
    id: sim.allocId(), type, x, y, w: size?.w ?? def.size.w, h: size?.h ?? def.size.h,
    built: false, progress: 0, delivered: {}, incoming: {}, inventory: {}, reservedOut: {},
    placedTick: sim.tick, workers: [], wants: {},
  };
  sim.buildings.set(b.id, b);
  for (let dy = 0; dy < b.h; dy++) {
    for (let dx = 0; dx < b.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      sim.occupancy.set(tileKey(tx, ty), b.id);
      const o = sim.world.obj(tx, ty);
      if (o !== O.None && !OBJECTS[o].blocks) {
        sim.world.setObj(tx, ty, O.None);
        sim.regrowth.delete(tileKey(tx, ty));
      }
      sim.designations.delete(tileKey(tx, ty));
    }
  }
  if (type === 'field') {
    b.field = { crop: crop === undefined ? 'turnip' : crop, state: 'wild', growth: 0, moisture: 0.5 };
  }
  if (workOf(b) === 0 && invEntries(costOf(b)).length === 0) completeBuilding(sim, b, true);
  else sim.mapChanged();
  return b;
}

export function materialsComplete(b: Building): boolean {
  return hasAll(b.delivered, costOf(b));
}

export function completeBuilding(sim: Simulation, b: Building, silent = false): void {
  const def = BUILDINGS[b.type];
  b.built = true;
  b.progress = workOf(b);
  // Construction materials are consumed; anything else on site stays (none today).
  for (const [r, n] of invEntries(costOf(b))) addInv(b.delivered, r, -n);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (def.convertsTo) {
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        sim.world.setTerrain(b.x + dx, b.y + dy, def.convertsTo === 'road' ? T.Road : T.Bridge);
        sim.occupancy.delete(tileKey(b.x + dx, b.y + dy));
      }
    }
    sim.buildings.delete(b.id);
    sim.mapChanged();
    if (def.convertsTo === 'road') sim.stats.pathsBuilt += b.w * b.h;
    sim.emit({ type: 'fx', kind: 'dust', x: cx, y: cy });
    if (def.convertsTo === 'bridge') sim.emit({ type: 'sfx', name: 'complete', x: cx, y: cy });
    return;
  }
  if (b.type === 'stoneBridge') {
    // The building stays as a permanent landmark; its tiles become stone deck anyone can walk.
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) sim.world.setTerrain(b.x + dx, b.y + dy, T.StoneBridge);
  }
  if (def.recipes) {
    b.workshop = { recipe: def.recipes[0], progress: 0, paused: false, status: '' };
  }
  if (def.settlementCenter && b.type !== 'camp' && !sim.settlements.some((s) => s.id === b.id) && !silent) foundSettlement(sim, b);
  if (def.reveal) sim.world.reveal(cx, cy, def.reveal);
  if (def.housing) assignHomes(sim);
  sim.mapChanged();
  if (!silent) {
    sim.emit({ type: 'fx', kind: 'sparkle', x: cx, y: cy });
    sim.emit({ type: 'sfx', name: 'complete', x: cx, y: cy });
    if (!def.paint) {
      if (b.type === 'stoneBridge') {
        sim.toast('The stone bridge is finished! The far bank is open to settle.', 'good');
        sim.record('bridge', 'Finished the stone bridge', cx, cy);
      } else {
        sim.toast(`${def.name} completed!`, 'good');
        sim.record('built', `Built a ${def.name.toLowerCase()}`, cx, cy);
      }
      sim.emit({ type: 'important' });
    }
  }
}

/**
 * Cancels a site or demolishes a building. Delivered materials go back to
 * storage; demolishing a finished building returns half its cost. Residents
 * and workers are released and rehoused where possible.
 */
export function removeBuilding(sim: Simulation, b: Building): string {
  const def = BUILDINGS[b.type];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  sim.buildings.delete(b.id);
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) sim.occupancy.delete(tileKey(b.x + dx, b.y + dy));

  let lost = 0;
  const refund = { ...b.delivered };
  if (b.built) for (const [r, n] of invEntries(costOf(b))) addInv(refund, r, Math.floor(n / 2));
  for (const [r, n] of invEntries(refund)) lost += sim.depositAnywhere(r, n, cx, cy);
  for (const [r, n] of invEntries(b.inventory)) lost += sim.depositAnywhere(r, n, cx, cy);
  let displaced = 0;
  for (const s of sim.settlers) {
    if (s.homeId === b.id) {
      s.homeId = null;
      displaced++;
    }
    if (s.insideId === b.id) {
      s.insideId = null;
      s.hidden = false;
    }
  }
  sim.mapChanged();
  // Beds promised to an expected child or a traveller move elsewhere, or wait.
  if (sim.bedClaims.some((c) => c.homeId === b.id)) relocateClaims(sim, b.id);
  const homeless = displaced > 0 ? assignHomes(sim) : 0;
  sim.emit({ type: 'fx', kind: 'dust', x: cx, y: cy });
  sim.emit({ type: 'important' });
  const verb = b.built ? 'Demolished' : 'Cancelled';
  const parts = [`${verb} ${def.name}.`];
  if (lost > 0) parts.push(`${lost} goods didn't fit in storage and were lost.`);
  if (displaced > 0) {
    parts.push(homeless > 0
      ? `${homeless} settler${homeless > 1 ? 's have' : ' has'} no bed now and will rest by the campfire until you build another home.`
      : `Its ${displaced} resident${displaced > 1 ? 's' : ''} moved to other beds.`);
    if (homeless > 0) sim.record('shortage', `${homeless} settler${homeless > 1 ? 's' : ''} lost their bed`, cx, cy);
  }
  return parts.join(' ');
}

// ---- housing ----------------------------------------------------------------------

/** Beds a building provides; unfinished buildings provide none. */
export function bedsOf(b: Building): number {
  return b.built ? BUILDINGS[b.type].housing ?? 0 : 0;
}

export function isPermanentHome(b: Building): boolean {
  const def = BUILDINGS[b.type];
  return !!def.housing && !def.temporaryBeds;
}

/** All beds, including the camp's temporary bedrolls. Newcomers need one of these free. */
export function housingCapacity(sim: Simulation): number {
  let n = 0;
  for (const b of sim.buildings.values()) n += bedsOf(b);
  return n;
}

/** Beds in real homes (houses, cottages). */
export function permanentBeds(sim: Simulation): number {
  let n = 0;
  for (const b of sim.buildings.values()) if (isPermanentHome(b)) n += bedsOf(b);
  return n;
}

export function residentCounts(sim: Simulation): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of sim.settlers) if (s.homeId !== null) m.set(s.homeId, (m.get(s.homeId) ?? 0) + 1);
  return m;
}

/** Beds held for expected children and accepted travellers, per home. */
export function claimCounts(sim: Simulation): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of sim.bedClaims) m.set(c.homeId, (m.get(c.homeId) ?? 0) + 1);
  return m;
}

/** Beds in use per home: residents plus claims. A home never has more than its bed count. */
export function bedUseCounts(sim: Simulation): Map<number, number> {
  const m = residentCounts(sim);
  for (const c of sim.bedClaims) m.set(c.homeId, (m.get(c.homeId) ?? 0) + 1);
  return m;
}

export function builtCount(sim: Simulation, type: BuildingId): number {
  let n = 0;
  for (const b of sim.buildings.values()) if (b.built && b.type === type) n++;
  return n;
}

export function campOf(sim: Simulation): Building | undefined {
  for (const b of sim.buildings.values()) if (b.type === 'camp') return b;
  return undefined;
}

/** The tile in front of the door, where residents enter. */
export function entranceOf(b: Building): { x: number; y: number } {
  return { x: b.x + Math.floor(b.w / 2), y: b.y + b.h };
}

const reachCache = new WeakMap<Simulation, Map<number, { ok: boolean; tick: number }>>();

/** Whether settlers can walk from the camp to this home (cached for a minute of game time). */
export function bedReachable(sim: Simulation, b: Building): boolean {
  const camp = campOf(sim);
  if (!camp || camp.id === b.id) return true;
  let cache = reachCache.get(sim);
  if (!cache) reachCache.set(sim, (cache = new Map()));
  const hit = cache.get(b.id);
  if (hit && sim.tick - hit.tick < 600) return hit.ok;
  const start = entranceOf(camp);
  const from = sim.walkable(start.x, start.y) ? start : { x: camp.x - 1, y: camp.y };
  const ok = findPath(sim, from.x, from.y, { x: b.x, y: b.y, w: b.w, h: b.h, adjacent: true }, 6000) !== null;
  cache.set(b.id, { ok, tick: sim.tick });
  return ok;
}

/**
 * A free bed for a newcomer: a real home first, the camp's bedrolls last.
 * Returns null when every reachable bed is taken.
 */
export function findFreeBed(sim: Simulation, counts = bedUseCounts(sim), permanentOnly = false, preferSettlement: number | null = null): Building | null {
  let best: Building | null = null;
  let bestScore = -1;
  for (const b of sim.buildings.values()) {
    const beds = bedsOf(b);
    if (beds === 0 || (counts.get(b.id) ?? 0) >= beds) continue;
    if (permanentOnly && !isPermanentHome(b)) continue;
    if (!bedReachable(sim, b)) continue;
    // Real beds first, then beds in the settler's own settlement.
    const home = preferSettlement !== null && settlementAt(sim, b.x + b.w / 2, b.y + b.h / 2)?.id === preferSettlement;
    const score = (isPermanentHome(b) ? 2 : 0) + (home ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

/**
 * Keeps every home within its bed count, moves camp sleepers into real homes
 * when beds free up, and gives anyone left over a camp bedroll if one is free.
 * Returns how many settlers are left without any bed.
 */
export function assignHomes(sim: Simulation): number {
  // Claimed beds (an expected child, a traveller on the way) are not free.
  const counts = claimCounts(sim);
  for (const s of sim.settlers) {
    if (s.homeId === null) continue;
    const home = sim.buildings.get(s.homeId);
    const n = counts.get(s.homeId) ?? 0;
    if (!home || n >= bedsOf(home)) {
      s.homeId = null;
      continue;
    }
    counts.set(s.homeId, n + 1);
  }
  // Upgrade anyone without a real home in their own settlement into a free house bed there.
  const multi = sim.settlements.length > 1;
  const inOwn = (s: { settlementId: number | null }, b: Building) =>
    !multi || s.settlementId === null || settlementAt(sim, b.x + b.w / 2, b.y + b.h / 2)?.id === s.settlementId;
  for (const s of sim.settlers) {
    const home = s.homeId !== null ? sim.buildings.get(s.homeId) : undefined;
    if (home && isPermanentHome(home) && inOwn(s, home)) continue;
    const bed = findFreeBed(sim, counts, true, s.settlementId);
    if (!bed || !inOwn(s, bed)) continue;
    if (home) counts.set(home.id, (counts.get(home.id) ?? 1) - 1);
    s.homeId = bed.id;
    counts.set(bed.id, (counts.get(bed.id) ?? 0) + 1);
  }
  let homeless = 0;
  for (const s of sim.settlers) {
    if (s.homeId !== null) continue;
    const bed = findFreeBed(sim, counts, false, s.settlementId);
    if (!bed) {
      homeless++;
      continue;
    }
    s.homeId = bed.id;
    counts.set(bed.id, (counts.get(bed.id) ?? 0) + 1);
  }
  return homeless;
}

export function residentsOf(sim: Simulation, b: Building): string[] {
  return sim.settlers.filter((s) => s.homeId === b.id).map((s) => s.name);
}

// ---- fields -------------------------------------------------------------------------

export function setFieldCrop(b: Building, crop: CropId | null): void {
  if (!b.field) return;
  if (b.field.crop === crop) return;
  b.field.crop = crop;
  if (b.field.state === 'growing' || b.field.state === 'ripe') {
    b.field.state = 'tilled';
    b.field.growth = 0;
  }
}

export function cropUnlocked(sim: Simulation, crop: CropId): boolean {
  return isUnlocked(sim, CROPS[crop].unlock);
}

// ---- production -----------------------------------------------------------------------

export function maxWorkers(b: Building): number {
  return BUILDINGS[b.type].maxWorkers ?? 0;
}

/** Production inputs are buffered for two batches so the worker rarely waits. */
export function workshopNeeds(b: Building): { res: keyof typeof RESOURCES; need: number }[] {
  const ws = b.workshop;
  if (!b.built || !ws || !ws.recipe || ws.paused) return [];
  const out: { res: keyof typeof RESOURCES; need: number }[] = [];
  for (const [r, n] of invEntries(RECIPES[ws.recipe].inputs)) {
    const need = n * 2 - (b.delivered[r] ?? 0) - (b.incoming[r] ?? 0);
    if (need > 0) out.push({ res: r, need });
  }
  return out;
}

/** Whether a settler may work at this production building. */
export function mayWorkAt(b: Building, settlerId: number): boolean {
  return b.workers.length === 0 || b.workers.includes(settlerId);
}

export function updateWorkshops(sim: Simulation): void {
  for (const b of sim.buildings.values()) {
    const ws = b.workshop;
    if (!ws || !b.built) continue;
    const name = BUILDINGS[b.type].name.toLowerCase();
    const staffed = b.workers.some((id) => {
      const s = sim.settler(id);
      return !!s && canDo(s, 'craft');
    });
    const anyone = staffed || (b.workers.length === 0 && sim.settlers.some((s) => canDo(s, 'craft')));
    if (ws.paused) ws.status = 'Paused';
    else if (!ws.recipe) ws.status = 'Idle — choose a recipe';
    else if (!anyone) {
      ws.status = b.workers.length
        ? `Its worker has Craft turned off — edit their work order`
        : `No worker — select a settler and right-click the ${name}`;
    } else {
      const r = RECIPES[ws.recipe];
      const crafting = sim.reservations.has(`craft:${b.id}`);
      if (crafting && ws.progress > 0) ws.status = `${r.name} (${Math.floor((ws.progress / r.work) * 100)}%)`;
      else if (!hasAll(b.delivered, r.inputs)) {
        const missing: Inventory = {};
        for (const [res, n] of invEntries(r.inputs)) {
          const have = b.delivered[res] ?? 0;
          if (have < n) addInv(missing, res, n - have);
        }
        const inStock = invEntries(missing).every(([res, n]) => sim.storedTotal(res) + (b.incoming[res] ?? 0) >= n);
        ws.status = inStock ? `Waiting for delivery: ${formatInv(missing)}` : `Needs ${formatInv(missing)} — none in storage`;
      } else if (!sim.nearestStorageWithSpace(b.x, b.y)) ws.status = 'Storage is full — nowhere to put the output';
      else ws.status = crafting ? 'Worker on the way' : 'Ready — waiting for a worker';
    }
  }
}

// ---- regrowth -----------------------------------------------------------------------------

export function updateRegrowth(sim: Simulation): void {
  for (const [k, r] of sim.regrowth) {
    if (sim.tick < r.at) continue;
    const x = keyX(k);
    const y = keyY(k);
    sim.regrowth.delete(k);
    if (sim.occupancy.has(k)) continue;
    let to = r.to;
    // Berry bushes wait for the thaw.
    if (to === O.Berry && !seasonOf(sim).def.berriesRegrow) {
      sim.regrowth.set(k, { to: r.to, at: sim.tick + 400 });
      continue;
    }
    if (to === O.Oak && hash01(x, y, sim.seed ^ 0x7ee) < 0.35) to = O.Pine;
    // Never grow a blocking object on top of a settler.
    if (OBJECTS[to].blocks && sim.settlers.some((s) => Math.floor(s.x) === x && Math.floor(s.y) === y)) {
      sim.regrowth.set(k, { to: r.to, at: sim.tick + 200 });
      continue;
    }
    sim.world.setObj(x, y, to);
    const next = OBJECTS[to].regrow;
    if (next) sim.regrowth.set(k, { to: next.to, at: sim.tick + next.ticks });
  }
}

export function scheduleRegrowth(sim: Simulation, x: number, y: number): void {
  const o = sim.world.obj(x, y);
  const r = OBJECTS[o].regrow;
  if (r) sim.regrowth.set(tileKey(x, y), { to: r.to, at: sim.tick + r.ticks + Math.floor(sim.rng.next() * DAY_TICKS * 0.3) });
}
