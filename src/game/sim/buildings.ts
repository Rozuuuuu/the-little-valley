import { DAY_TICKS, keyX, keyY, tileKey } from '../core/constants';
import { hash01 } from '../core/rng';
import { BUILDINGS, type BuildingId } from '../data/buildings';
import { CROPS, type CropId } from '../data/crops';
import { MILESTONES } from '../data/progression';
import { RECIPES } from '../data/recipes';
import { RESOURCES, type Inventory } from '../data/resources';
import { O, OBJECTS, T, TERRAIN } from '../world/tiles';
import { addInv, formatInv, hasAll, invEntries } from './inventory';
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

function tileProblem(sim: Simulation, type: BuildingId, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  const w = sim.world;
  if (!w.explored(x, y)) return 'Explore this area first';
  if (sim.occupancy.has(tileKey(x, y))) return 'Something is already built here';
  const t = w.terrain(x, y);
  const tdef = TERRAIN[t];
  const o = w.obj(x, y);
  if (def.placement === 'water') {
    if (t !== T.Water) return t === T.DeepWater ? 'Too deep for a bridge' : 'Bridges go on shallow water';
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

export function checkPlacement(sim: Simulation, type: BuildingId, x: number, y: number): PlacementCheck {
  const def = BUILDINGS[type];
  const tiles: PlacementCheck['tiles'] = [];
  let reason: string | undefined;
  if (!def.buildable) reason = 'This cannot be built';
  else if (!isUnlocked(sim, def.unlock)) reason = `Unlocks at ${unlockName(def.unlock)}`;
  for (let dy = 0; dy < def.size.h; dy++) {
    for (let dx = 0; dx < def.size.w; dx++) {
      const p = tileProblem(sim, type, x + dx, y + dy);
      if (p && !reason) reason = p;
      tiles.push({ x: x + dx, y: y + dy, ok: !p });
    }
  }
  return { ok: !reason, reason, tiles };
}

/** Human-readable shortfall against current stock, or null if affordable. */
export function shortfall(sim: Simulation, type: BuildingId, count = 1): string | null {
  const totals = sim.totals();
  const missing: string[] = [];
  for (const [r, n] of invEntries(BUILDINGS[type].cost)) {
    const need = n * count;
    if (totals[r] < need) missing.push(`${need - totals[r]} more ${RESOURCES[r].name.toLowerCase()}`);
  }
  return missing.length ? missing.join(', ') : null;
}

/** Creates a building without validation. Callers use checkPlacement first. */
export function placeBuilding(sim: Simulation, type: BuildingId, x: number, y: number, crop?: CropId | null): Building {
  const def = BUILDINGS[type];
  const b: Building = {
    id: sim.allocId(), type, x, y, w: def.size.w, h: def.size.h,
    built: false, progress: 0, delivered: {}, incoming: {}, inventory: {}, reservedOut: {},
    placedTick: sim.tick,
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
  if (def.work === 0 && invEntries(def.cost).length === 0) completeBuilding(sim, b, true);
  return b;
}

export function materialsComplete(b: Building): boolean {
  return hasAll(b.delivered, BUILDINGS[b.type].cost);
}

export function completeBuilding(sim: Simulation, b: Building, silent = false): void {
  const def = BUILDINGS[b.type];
  b.built = true;
  b.progress = def.work;
  // Construction materials are consumed; anything else on site stays (none today).
  for (const [r, n] of invEntries(def.cost)) addInv(b.delivered, r, -n);
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
    sim.emit({ type: 'fx', kind: 'dust', x: cx, y: cy });
    if (def.convertsTo === 'bridge') sim.emit({ type: 'sfx', name: 'complete', x: cx, y: cy });
    return;
  }
  if (def.recipes) {
    b.workshop = { recipe: def.recipes[0], progress: 0, paused: false, status: '' };
  }
  if (def.reveal) sim.world.reveal(cx, cy, def.reveal);
  assignHomes(sim);
  if (!silent) {
    sim.emit({ type: 'fx', kind: 'sparkle', x: cx, y: cy });
    sim.emit({ type: 'sfx', name: 'complete', x: cx, y: cy });
    if (!def.paint) {
      sim.toast(`${def.name} completed!`, 'good');
      sim.emit({ type: 'important' });
    }
  }
}

/**
 * Cancels a site or demolishes a building. Delivered materials go back to
 * storage; demolishing a finished building returns half its cost.
 */
export function removeBuilding(sim: Simulation, b: Building): string {
  const def = BUILDINGS[b.type];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  sim.buildings.delete(b.id);
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) sim.occupancy.delete(tileKey(b.x + dx, b.y + dy));

  let lost = 0;
  const refund = { ...b.delivered };
  if (b.built) for (const [r, n] of invEntries(def.cost)) addInv(refund, r, Math.floor(n / 2));
  for (const [r, n] of invEntries(refund)) lost += sim.depositAnywhere(r, n, cx, cy);
  for (const [r, n] of invEntries(b.inventory)) lost += sim.depositAnywhere(r, n, cx, cy);
  for (const s of sim.settlers) if (s.homeId === b.id) s.homeId = null;
  assignHomes(sim);
  sim.emit({ type: 'fx', kind: 'dust', x: cx, y: cy });
  sim.emit({ type: 'important' });
  const verb = b.built ? 'Demolished' : 'Cancelled';
  return lost > 0 ? `${verb} ${def.name}. ${lost} goods didn't fit in storage and were lost.` : `${verb} ${def.name}.`;
}

export function housingCapacity(sim: Simulation): number {
  let n = 0;
  for (const b of sim.buildings.values()) if (b.built) n += BUILDINGS[b.type].housing ?? 0;
  return n;
}

export function builtCount(sim: Simulation, type: BuildingId): number {
  let n = 0;
  for (const b of sim.buildings.values()) if (b.built && b.type === type) n++;
  return n;
}

/** Gives homeless settlers a bed in a house with room. The camp's tents are the fallback. */
export function assignHomes(sim: Simulation): void {
  const residents = new Map<number, number>();
  for (const s of sim.settlers) {
    const home = s.homeId !== null ? sim.buildings.get(s.homeId) : undefined;
    if (!home || !home.built) s.homeId = null;
    else residents.set(home.id, (residents.get(home.id) ?? 0) + 1);
  }
  for (const s of sim.settlers) {
    if (s.homeId !== null) continue;
    for (const b of sim.buildings.values()) {
      if (!b.built || b.type !== 'house') continue;
      const used = residents.get(b.id) ?? 0;
      if (used < (BUILDINGS[b.type].housing ?? 0)) {
        s.homeId = b.id;
        residents.set(b.id, used + 1);
        break;
      }
    }
  }
}

export function residentsOf(sim: Simulation, b: Building): string[] {
  return sim.settlers.filter((s) => s.homeId === b.id).map((s) => s.name);
}

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

/** Workshop inputs are buffered for two batches so the crafter rarely waits. */
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

export function updateWorkshops(sim: Simulation): void {
  const hasCrafter = sim.settlers.some((s) => s.job === 'crafter');
  for (const b of sim.buildings.values()) {
    const ws = b.workshop;
    if (!ws || !b.built) continue;
    if (ws.paused) ws.status = 'Paused';
    else if (!ws.recipe) ws.status = 'Idle — choose a recipe';
    else if (!hasCrafter) ws.status = 'No crafter — give a settler the Crafter job';
    else {
      const r = RECIPES[ws.recipe];
      const crafting = sim.reservations.has(`craft:${b.id}`);
      if (crafting && ws.progress > 0) ws.status = `Crafting ${r.name.toLowerCase().replace(/^\w+ /, '')} (${Math.floor((ws.progress / r.work) * 100)}%)`;
      else if (!hasAll(b.delivered, r.inputs)) {
        const missing: Inventory = {};
        for (const [res, n] of invEntries(r.inputs)) {
          const have = b.delivered[res] ?? 0;
          if (have < n) addInv(missing, res, n - have);
        }
        const inStock = invEntries(r.inputs).every(([res, n]) => sim.storedTotal(res) + (b.delivered[res] ?? 0) + (b.incoming[res] ?? 0) >= n);
        ws.status = inStock ? `Waiting for delivery: ${formatInv(missing)}` : `Missing inputs: ${formatInv(missing)} (not in storage)`;
      } else if (!sim.nearestStorageWithSpace(b.x, b.y)) ws.status = 'Storage is full';
      else ws.status = crafting ? 'Crafter on the way' : 'Ready — waiting for a crafter';
    }
  }
}

export function updateRegrowth(sim: Simulation): void {
  for (const [k, r] of sim.regrowth) {
    if (sim.tick < r.at) continue;
    const x = keyX(k);
    const y = keyY(k);
    sim.regrowth.delete(k);
    if (sim.occupancy.has(k)) continue;
    let to = r.to;
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
