import type { BuildingId } from '../data/buildings';
import type { CropId } from '../data/crops';
import type { JobId, WorkKind } from '../data/jobs';
import type { MilestoneId } from '../data/progression';
import type { RecipeId } from '../data/recipes';
import type { Inventory, ResourceId } from '../data/resources';
import type { Appearance, ChronicleEntry, Facing, SessionMark, Settlement, Stats, WorkArea } from '../sim/types';

/**
 * Save file format. Bump SAVE_VERSION whenever this shape changes and add a
 * migration in migrations.ts so older worlds keep loading.
 */
export const SAVE_VERSION = 4;

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
  areaId: number | null;
  priorities: WorkKind[] | null;
  settlementId: number | null;
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
  /** Only for span buildings, whose size varies. */
  w?: number;
  h?: number;
  workers: number[];
  /** Storage stock targets. */
  wants: Inventory;
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

export interface SaveFileV3 {
  version: 3;
  meta: SaveMeta;
  sim: SaveFileV2['sim'] & {
    workAreas: WorkArea[];
    chronicle: ChronicleEntry[];
    /** Where the last play session started (null for saves from before v3). */
    session: SessionMark | null;
  };
  world: {
    /** World generator version (see worldgen.ts). Old worlds keep generating with their version. */
    genVersion: number;
    chunks: SavedChunk[];
  };
  view?: SaveView;
  tutorial?: { step: number; done: boolean };
}

export interface SaveFileV4 extends Omit<SaveFileV3, 'version' | 'sim'> {
  version: 4;
  sim: SaveFileV3['sim'] & {
    settlements: Settlement[];
  };
}

export type SaveFile = SaveFileV4;

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}
