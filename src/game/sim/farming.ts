import { DAY_TICKS } from '../core/constants';
import { CROPS, type CropId } from '../data/crops';
import { BUILDINGS } from '../data/buildings';
import { wellRadiusOf } from './levels';
import { seasonOf } from './seasons';
import { TERRAIN } from '../world/tiles';
import type { Simulation } from './Simulation';
import type { Building, FieldAction, FieldState } from './types';

/** Moisture lost per tick. A watered field stays moist for most of a day. */
export const DRYING_RATE = 0.00055;
/** Below this, farmers water the field. */
export const WATER_THRESHOLD = 0.3;
/** Below this, crops grow at DRY_GROWTH speed rather than stopping. */
export const DRY_LEVEL = 0.12;
export const DRY_GROWTH = 0.4;

export const FIELD_WORK: Record<FieldAction, number> = { till: 30, plant: 20, water: 14, harvest: 22 };

export function fieldAction(sim: Simulation, f: FieldState): FieldAction | null {
  switch (f.state) {
    case 'wild':
      return 'till';
    case 'tilled':
      // Nothing is sown in winter; tilled fields wait for spring.
      return f.crop && seasonOf(sim).def.planting ? 'plant' : null;
    case 'growing':
      return !sim.weather.raining && seasonOf(sim).def.growth > 0 && f.moisture < WATER_THRESHOLD ? 'water' : null;
    case 'ripe':
      return 'harvest';
  }
}

/** Visual stage: 0..stages-1, where the last stage is ripe. */
export function fieldStage(f: FieldState): number {
  if (!f.crop) return 0;
  const def = CROPS[f.crop];
  if (f.state === 'ripe') return def.stages - 1;
  if (f.state !== 'growing') return -1;
  return Math.min(def.stages - 2, Math.floor((f.growth / def.growTicks) * (def.stages - 1)));
}

export function fieldFertility(sim: Simulation, b: Building): number {
  return TERRAIN[sim.world.terrain(b.x, b.y)].fertility;
}

/** Growth multiplier for a crop right now: the season times the crop's own preference. */
export function seasonalGrowth(sim: Simulation, crop: CropId): number {
  const s = seasonOf(sim);
  return s.def.growth * (CROPS[crop].seasons?.[s.id] ?? 1);
}

export function updateFields(sim: Simulation, dt: number): void {
  const season = seasonOf(sim).def;
  // Snow in winter does not water anything (nothing grows); rain does.
  const raining = sim.weather.raining && season.growth > 0;
  const wells: { x: number; y: number; r: number }[] = [];
  for (const b of sim.buildings.values()) if (b.built && BUILDINGS[b.type].well) wells.push({ x: b.x + 0.5, y: b.y + 0.5, r: wellRadiusOf(b) });
  for (const b of sim.buildings.values()) {
    const f = b.field;
    if (!f) continue;
    if (raining) f.moisture = 1;
    else f.moisture = Math.max(0, f.moisture - DRYING_RATE * season.drying * dt);
    // Fields a well reaches never dry below the point where they need watering.
    if (wells.length && f.moisture < WATER_THRESHOLD && wells.some((w) => Math.hypot(w.x - b.x - 0.5, w.y - b.y - 0.5) <= w.r)) f.moisture = WATER_THRESHOLD;
    if (f.state !== 'growing' || !f.crop) continue;
    const rate = (f.moisture > DRY_LEVEL ? 1 : DRY_GROWTH) * fieldFertility(sim, b) * seasonalGrowth(sim, f.crop);
    f.growth += dt * rate;
    if (f.growth >= CROPS[f.crop].growTicks) {
      f.state = 'ripe';
      f.growth = CROPS[f.crop].growTicks;
    }
  }
}

export function applyFieldAction(sim: Simulation, b: Building, action: FieldAction): void {
  const f = b.field!;
  const x = b.x + 0.5;
  const y = b.y + 0.5;
  switch (action) {
    case 'till':
      f.state = 'tilled';
      sim.emit({ type: 'sfx', name: 'dig', x, y });
      sim.emit({ type: 'fx', kind: 'soil', x, y });
      break;
    case 'plant':
      f.state = 'growing';
      f.growth = 0;
      f.moisture = Math.max(f.moisture, 0.6);
      sim.emit({ type: 'sfx', name: 'plant', x, y });
      break;
    case 'water':
      f.moisture = 1;
      sim.emit({ type: 'sfx', name: 'water', x, y });
      sim.emit({ type: 'fx', kind: 'splash', x, y });
      break;
    case 'harvest':
      f.state = 'tilled';
      f.growth = 0;
      sim.emit({ type: 'sfx', name: 'harvest', x, y });
      sim.emit({ type: 'fx', kind: 'sparkle', x, y });
      break;
  }
}

export function updateWeather(sim: Simulation): void {
  const w = sim.weather;
  if (sim.tick < w.nextChange) return;
  if (w.raining) {
    w.raining = false;
    w.nextChange = sim.tick + Math.round(DAY_TICKS * sim.rng.range(0.7, 1.6));
  } else if (sim.rng.chance(seasonOf(sim).def.rainChance)) {
    w.raining = true;
    w.nextChange = sim.tick + Math.round(sim.rng.range(300, 700));
    sim.toast(seasonOf(sim).id === 'winter' ? 'Snow begins to fall softly over the valley.' : 'A gentle rain begins. The fields drink it up.', 'info');
  } else {
    w.nextChange = sim.tick + Math.round(DAY_TICKS * sim.rng.range(0.4, 0.9));
  }
}
