import type { BuildingId } from '../data/buildings';
import type { CropId } from '../data/crops';
import type { JobId } from '../data/jobs';
import type { MilestoneId } from '../data/progression';
import type { RecipeId } from '../data/recipes';
import type { Inventory, ResourceId } from '../data/resources';
import type { Appearance, Facing, Stats } from '../sim/types';

/**
 * Save file format. Bump SAVE_VERSION whenever this shape changes and add a
 * migration in migrations.ts so older worlds keep loading.
 */
export const SAVE_VERSION = 2;

export interface SaveMeta {
  name: string;
  seed: number;
  createdAt: number;
  savedAt: number;
  day: number;
  population: number;
  milestone: MilestoneId;
}

export interface SavedChunk {
  cx: number;
  cy: number;
  /** Bit-packed explored flags, base64. */
  explored: string;
  /** Present only when the chunk was changed by play; base64 bytes. */
  terrain?: string;
  obj?: string;
  amt?: string;
}

export interface SavedSettler {
  id: number;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  job: JobId;
  carrying: { res: ResourceId; amount: number } | null;
  hunger: number;
  energy: number;
  homeId: number | null;
  appearance: Appearance;
  focus: { res: ResourceId; x: number; y: number; until: number } | null;
}

export interface SavedBuilding {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
  built: boolean;
  progress: number;
  delivered: Inventory;
  inventory: Inventory;
  field?: { crop: CropId | null; state: 'wild' | 'tilled' | 'growing' | 'ripe'; growth: number; moisture: number };
  workshop?: { recipe: RecipeId | null; progress: number; paused: boolean };
  placedTick: number;
}

export interface SaveView {
  camX: number;
  camY: number;
  zoom: number;
}

export interface SaveFileV2 {
  version: 2;
  meta: SaveMeta;
  sim: {
    tick: number;
    nextId: number;
    rngState: number;
    lastArrival: number;
    settlers: SavedSettler[];
    buildings: SavedBuilding[];
    designations: [number, number][];
    regrowth: [number, number, number, number][];
    stats: Stats;
    reached: MilestoneId[];
    weather: { raining: boolean; nextChange: number };
  };
  world: { chunks: SavedChunk[] };
  view?: SaveView;
  tutorial?: { step: number; done: boolean };
}

export type SaveFile = SaveFileV2;

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}
