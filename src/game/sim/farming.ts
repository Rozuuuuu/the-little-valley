import { DAY_TICKS } from '../core/constants';
import { CROPS } from '../data/crops';
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
      return f.crop ? 'plant' : null;
    case 'growing':
      return !sim.weather.raining && f.moisture < WATER_THRESHOLD ? 'water' : null;
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

export function updateFields(sim: Simulation, dt: number): void {
  const raining = sim.weather.raining;
  for (const b of sim.buildings.values()) {
    const f = b.field;
    if (!f) continue;
    if (raining) f.moisture = 1;
    else f.moisture = Math.max(0, f.moisture - DRYING_RATE * dt);
    if (f.state !== 'growing' || !f.crop) continue;
    const rate = (f.moisture > DRY_LEVEL ? 1 : DRY_GROWTH) * fieldFertility(sim, b);
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
  } else if (sim.rng.chance(0.6)) {
    w.raining = true;
    w.nextChange = sim.tick + Math.round(sim.rng.range(300, 700));
    sim.toast('A gentle rain begins. The fields drink it up.', 'info');
  } else {
    w.nextChange = sim.tick + Math.round(DAY_TICKS * sim.rng.range(0.4, 0.9));
  }
}
