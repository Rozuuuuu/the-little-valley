import { BUILDINGS, type BuildingId } from '../data/buildings';
import { PEN_PRODUCT_CAP, PEN_STEP, SPECIES, WILD_CAP, WILD_SPAWN_EVERY, WILD_SPAWN_MAX, WILD_SPAWN_MIN, WILDLIFE, type PenDef, type SpeciesId } from '../data/animals';
import type { HabitatId } from '../data/habitats';
import { T } from '../world/tiles';
import { levelsOf, levelOf } from './levels';
import type { Simulation } from './Simulation';
import type { Animal, Building, Settler } from './types';

/**
 * Animals are light entities, not settlers: wild herds wander near a home spot
 * and run from people; livestock stays inside its pen. They have their own random
 * stream so adding animals never changes what settlers do.
 */

/** The fauna of a world: its habitat, or the meadow valley for worlds from before habitats. */
export function habitatOf(sim: Simulation): HabitatId {
  return sim.world.genVersion >= 4 ? sim.world.habitat : 'valley';
}

function canStand(sim: Simulation, species: SpeciesId, x: number, y: number): boolean {
  const def = SPECIES[species];
  const t = sim.world.terrain(x, y);
  if (def.swims) return t === T.Water || t === T.DeepWater;
  return sim.walkable(x, y) && !sim.buildingAt(x, y);
}

function likes(sim: Simulation, species: SpeciesId, x: number, y: number): boolean {
  return SPECIES[species].terrain.includes(sim.world.terrain(x, y) as never) && canStand(sim, species, x, y);
}

export function addAnimal(sim: Simulation, species: SpeciesId, x: number, y: number, penId: number | null = null): Animal {
  const a: Animal = {
    id: sim.allocId(), species, x: x + 0.5, y: y + 0.5, px: x + 0.5, py: y + 0.5, homeX: x, homeY: y,
    tx: x + 0.5, ty: y + 0.5, moving: false, flee: false, timer: sim.animalRng.int(60), facing: sim.animalRng.chance(0.5) ? 2 : 3,
    penId, huntedBy: null,
  };
  sim.animals.push(a);
  return a;
}

export function removeAnimal(sim: Simulation, a: Animal): void {
  const i = sim.animals.indexOf(a);
  if (i >= 0) sim.animals.splice(i, 1);
  if (a.huntedBy !== null) sim.release(`hunt:${a.id}`, a.huntedBy);
}

function pickSpecies(sim: Simulation): SpeciesId {
  const list = WILDLIFE[habitatOf(sim)];
  const total = list.reduce((n, e) => n + e.weight, 0);
  let r = sim.animalRng.next() * total;
  for (const e of list) {
    r -= e.weight;
    if (r < 0) return e.species;
  }
  return list[0].species;
}

/** Places one wild herd at a spot the species likes, away from the settlements. Returns how many appeared. */
function spawnHerd(sim: Simulation, minD: number, maxD: number): number {
  const species = pickSpecies(sim);
  const def = SPECIES[species];
  const centres = sim.settlements.map((s) => sim.buildings.get(s.id)).filter((b): b is Building => !!b);
  const origin = centres.length ? centres[sim.animalRng.int(centres.length)] : null;
  const ox = origin ? origin.x + origin.w / 2 : 0;
  const oy = origin ? origin.y + origin.h / 2 : 0;
  for (let attempt = 0; attempt < 24; attempt++) {
    const ang = sim.animalRng.next() * Math.PI * 2;
    const d = minD + sim.animalRng.next() * (maxD - minD);
    const x = Math.floor(ox + Math.cos(ang) * d);
    const y = Math.floor(oy + Math.sin(ang) * d);
    if (!sim.world.explored(x, y) || !likes(sim, species, x, y)) continue;
    if (centres.some((c) => Math.hypot(c.x - x, c.y - y) < minD)) continue;
    const n = def.herd[0] + sim.animalRng.int(def.herd[1] - def.herd[0] + 1);
    let placed = 0;
    for (let i = 0; i < n * 4 && placed < n; i++) {
      const hx = x + sim.animalRng.int(5) - 2;
      const hy = y + sim.animalRng.int(5) - 2;
      if (!likes(sim, species, hx, hy)) continue;
      const a = addAnimal(sim, species, hx, hy);
      a.homeX = x;
      a.homeY = y;
      placed++;
    }
    if (placed) return placed;
  }
  return 0;
}

/** A new world starts with a few herds in sight of the hall. */
export function seedWildlife(sim: Simulation): void {
  for (let i = 0; i < 4; i++) spawnHerd(sim, 9, 22);
}

function wildCount(sim: Simulation): number {
  let n = 0;
  for (const a of sim.animals) if (a.penId === null) n++;
  return n;
}

// ---- pens ------------------------------------------------------------------------

export function penOf(b: Building): PenDef | undefined {
  return BUILDINGS[b.type].pen;
}

export function penCapacity(b: Building): number {
  const def = penOf(b);
  if (!def) return 0;
  const levels = levelsOf(b);
  if (levels) for (let i = Math.min(levelOf(b), levels.length) - 1; i >= 0; i--) if (levels[i].penCapacity !== undefined) return levels[i].penCapacity!;
  return def.capacity;
}

export function penAnimals(sim: Simulation, b: Building): Animal[] {
  return sim.animals.filter((a) => a.penId === b.id);
}

function randomTileIn(sim: Simulation, b: Building): { x: number; y: number } {
  return { x: b.x + sim.animalRng.int(b.w), y: b.y + sim.animalRng.int(b.h) };
}

/** A finished pen gets its breeding pair (bought with the build cost). */
export function stockPen(sim: Simulation, b: Building): void {
  const def = penOf(b);
  if (!def) return;
  b.pen = { breed: 0, ready: 0 };
  for (let i = 0; i < 2; i++) {
    const t = randomTileIn(sim, b);
    addAnimal(sim, def.species, t.x, t.y, b.id);
  }
}

/** Pens breed and produce in steps; products wait for a herder to collect them. */
export function updatePens(sim: Simulation): void {
  for (const b of sim.buildings.values()) {
    const def = penOf(b);
    if (!def || !b.built || !b.pen) continue;
    const herd = penAnimals(sim, b);
    const cap = penCapacity(b);
    if (herd.length >= 2 && herd.length < cap) {
      b.pen.breed += PEN_STEP;
      if (b.pen.breed >= def.breedTicks) {
        b.pen.breed = 0;
        const t = randomTileIn(sim, b);
        addAnimal(sim, def.species, t.x, t.y, b.id);
      }
    } else b.pen.breed = 0;
    if (def.product && herd.length > 0) {
      b.pen.ready = Math.min(PEN_PRODUCT_CAP, b.pen.ready + (herd.length * def.product.amount * PEN_STEP) / def.product.everyTicks);
    }
  }
}

/** Why a pen is or isn't producing, in words. */
export function penStatus(sim: Simulation, b: Building): string {
  const def = penOf(b)!;
  const n = penAnimals(sim, b).length;
  const cap = penCapacity(b);
  const sp = SPECIES[def.species];
  if (n === 0) return `No ${sp.plural} left — the pen is empty`;
  const ready = Math.floor(b.pen?.ready ?? 0);
  const herding = sim.settlers.some((s) => s.task?.kind === 'herd' && s.task.pen === b.id);
  if (herding) return 'A herder is tending the animals';
  if (ready > 0) return `${ready} ${def.product!.res === 'food' ? 'food (eggs and milk)' : def.product!.res} waiting for a herder`;
  if (n >= cap && def.cull) return `Full: a herder will take one ${sp.name.toLowerCase()} to the butcher`;
  if (n < 2) return `Only one ${sp.name.toLowerCase()} — it can't breed alone`;
  return `${n}/${cap} ${sp.plural} · breeding`;
}

// ---- movement --------------------------------------------------------------------

const FLEE_CHECK = 6;

function nearestPerson(sim: Simulation, a: Animal, radius: number): Settler | null {
  let best: Settler | null = null;
  let bestD = radius;
  for (const s of sim.settlers) {
    if (s.hidden || s.id === a.huntedBy) continue;
    const dx = s.x - a.x;
    const dy = s.y - a.y;
    if (Math.abs(dx) > bestD || Math.abs(dy) > bestD) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function setTarget(a: Animal, x: number, y: number): void {
  a.tx = x + 0.5;
  a.ty = y + 0.5;
  a.moving = true;
  if (a.tx < a.x - 0.05) a.facing = 2;
  else if (a.tx > a.x + 0.05) a.facing = 3;
}

function chooseWander(sim: Simulation, a: Animal): void {
  if (a.penId !== null) {
    const pen = sim.buildings.get(a.penId);
    if (!pen) return;
    const t = randomTileIn(sim, pen);
    setTarget(a, t.x, t.y);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const x = a.homeX + sim.animalRng.int(13) - 6;
    const y = a.homeY + sim.animalRng.int(13) - 6;
    if (likes(sim, a.species, x, y)) {
      setTarget(a, x, y);
      return;
    }
  }
}

function step(sim: Simulation, a: Animal): void {
  const def = SPECIES[a.species];
  const speed = def.speed * (a.flee ? 1.8 : 1);
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed) {
    a.x = a.tx;
    a.y = a.ty;
    a.moving = false;
    a.flee = false;
    a.timer = 30 + sim.animalRng.int(90);
    return;
  }
  const nx = a.x + (dx / d) * speed;
  const ny = a.y + (dy / d) * speed;
  // Pen animals walk over their own pen; everyone else keeps to ground they can stand on.
  const inPen = a.penId !== null && sim.buildingAt(Math.floor(nx), Math.floor(ny))?.id === a.penId;
  if (!inPen && !canStand(sim, a.species, Math.floor(nx), Math.floor(ny))) {
    a.moving = false;
    a.flee = false;
    a.timer = 10 + sim.animalRng.int(30);
    return;
  }
  a.x = nx;
  a.y = ny;
}

export function updateAnimals(sim: Simulation): void {
  if (sim.tick % WILD_SPAWN_EVERY === 0 && sim.settlements.length > 0 && wildCount(sim) < WILD_CAP) spawnHerd(sim, WILD_SPAWN_MIN, WILD_SPAWN_MAX);
  if (sim.tick % PEN_STEP === 0) updatePens(sim);
  const checkFlee = sim.tick % FLEE_CHECK === 0;
  for (let i = sim.animals.length - 1; i >= 0; i--) {
    const a = sim.animals[i];
    a.px = a.x;
    a.py = a.y;
    if (a.penId !== null && !sim.buildings.has(a.penId)) {
      // The pen was pulled down: the animals wander off into the wild.
      a.penId = null;
      a.homeX = Math.floor(a.x);
      a.homeY = Math.floor(a.y);
    }
    const def = SPECIES[a.species];
    if (checkFlee && a.penId === null && def.fleeFrom > 0 && !a.flee) {
      const p = nearestPerson(sim, a, def.fleeFrom);
      if (p) {
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const x = Math.floor(a.x + (dx / d) * 6);
        const y = Math.floor(a.y + (dy / d) * 6);
        if (canStand(sim, a.species, x, y)) {
          setTarget(a, x, y);
          a.flee = true;
        }
      }
    }
    if (a.moving) step(sim, a);
    else if (--a.timer <= 0) chooseWander(sim, a);
  }
}

// ---- hunting and herding ---------------------------------------------------------

export function huntRadiusOf(b: Building): number {
  const levels = levelsOf(b);
  if (levels) for (let i = Math.min(levelOf(b), levels.length) - 1; i >= 0; i--) if (levels[i].huntRadius !== undefined) return levels[i].huntRadius!;
  return BUILDINGS[b.type].hunting?.radius ?? 0;
}

/** Wild game a lodge's hunters could go after (not already stalked, within its range). */
export function preyNear(sim: Simulation, b: Building): Animal[] {
  const r = huntRadiusOf(b);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return sim.animals.filter((a) => a.penId === null && SPECIES[a.species].hunt && Math.hypot(a.x - cx, a.y - cy) <= r);
}

export function isPenType(type: BuildingId): boolean {
  return !!BUILDINGS[type].pen;
}
