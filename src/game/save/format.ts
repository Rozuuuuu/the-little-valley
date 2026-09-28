import type { BuildingId } from '../data/buildings';
import type { HabitatId } from '../data/habitats';
import type { SpeciesId } from '../data/animals';
import type { CropId } from '../data/crops';
import type { JobId, WorkKind } from '../data/jobs';
import type { MilestoneId } from '../data/progression';
import type { RecipeId } from '../data/recipes';
import type { Inventory, ResourceId } from '../data/resources';
import type {
  CoalitionCommitment, ConcernState, Incident, MilitaryService, WarState, NewsReport, Stance, TreatyOffer, WarPlan, Warning, WorldEvent,
  Appearance, BedClaim, ChronicleEntry, Facing, GrowthMode, Household, Kingdom, LifeStage, Manifest, OrchardState, Party, Recruitment, Route, SessionMark, Settlement, Stats, TravelerOffer, WorkArea,
} from '../sim/types';

/**
 * Save file format. Bump SAVE_VERSION whenever this shape changes and add a
 * migration in migrations.ts so older worlds keep loading.
 */
export const SAVE_VERSION = 12;

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
  lifeStage: LifeStage;
  ageTicks: number;
  householdId: number | null;
  awayOn: number | null;
  kingdomId: number;
  military: MilitaryService | null;
  captive: { by: number } | null;
  /** v12+: the ruler, and a Rally boost in effect. */
  ruler?: boolean;
  boostUntil?: number;
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
  orchard?: OrchardState;
  mine?: { depositId: number; level: number };
  quarry?: { extracted: number };
  /** Upgrade level above 1 (v12+). */
  level?: number;
  /** An upgrade already paid for, finishing on a timer (v12+). */
  upgrade?: { to: number; progress: number; paid: Inventory };
  /** Pens (v12+). */
  pen?: { breed: number; ready: number };
  placedTick: number;
  /** Only for span buildings, whose size varies. */
  w?: number;
  h?: number;
  workers: number[];
  /** Storage stock targets. */
  wants: Inventory;
}

export interface SavedAnimal {
  id: number;
  species: SpeciesId;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  penId: number | null;
  facing: 2 | 3;
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
    /** Generator 4+: the habitat the player chose (v12+; absent means the default valley). */
    habitat?: HabitatId;
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

export interface SaveFileV5 extends Omit<SaveFileV4, 'version' | 'sim'> {
  version: 5;
  sim: SaveFileV4['sim'] & {
    growthMode: GrowthMode;
    households: Household[];
    bedClaims: BedClaim[];
    offer: TravelerOffer | null;
    nextVisitor: number;
    recruits: Recruitment[];
    /** Tick the last traveller settled, or null if none has. */
    lastRecruit: number | null;
  };
}

export interface SaveFileV6 extends Omit<SaveFileV5, 'version' | 'sim'> {
  version: 6;
  sim: SaveFileV5['sim'] & {
    /** Surveyed geology cells: [cellId, ore left or null when the cell holds no deposit]. */
    geology: { version: number; cells: [number, number | null][] };
  };
}

export interface SaveFileV7 extends Omit<SaveFileV6, 'version' | 'sim'> {
  version: 7;
  sim: SaveFileV6['sim'] & {
    routes: Omit<Route, 'status'>[];
    manifests: Manifest[];
    /** Merchants; walking paths are rebuilt after loading. */
    parties: Omit<Party, 'path'>[];
    knownRegions: number[];
    nextMerchant: number;
  };
}

export interface SaveFileV8 extends Omit<SaveFileV7, 'version' | 'sim'> {
  version: 8;
  sim: SaveFileV7['sim'] & {
    /** The player's kingdom first, then rival kingdoms that are known. */
    kingdoms: Kingdom[];
    /** Frontier claims: [sectorX, sectorY, legalOwner, occupyingKingdom | null]. */
    claims: [number, number, number, number | null][];
  };
}

export interface SaveFileV9 extends Omit<SaveFileV8, 'version' | 'sim'> {
  version: 9;
  sim: SaveFileV8['sim'] & {
    diplomacy: {
      worldEvents: WorldEvent[];
      reports: NewsReport[];
      newsSummaries: [number, number][];
      stances: [string, Stance][];
      trust: [string, number][];
      wars: string[];
      offers: TreatyOffer[];
      incidents: Incident[];
      warnings: Warning[];
      concernStates: [string, ConcernState][];
      warPlans: WarPlan[];
      commitments: CoalitionCommitment[];
      diplomacyDay: number;
      lastProsperity: number;
    };
  };
}

export interface SaveFileV10 extends Omit<SaveFileV9, 'version' | 'sim'> {
  version: 10;
  sim: SaveFileV9['sim'] & {
    /** Day the horses were last fed. */
    horseDay: number;
    /** v12+: when the ruler can Rally again. */
    rallyReadyAt?: number;
    /** v12+: animals and their random stream. */
    animals?: SavedAnimal[];
    animalRng?: number;
  };
}

export interface SaveFileV11 extends Omit<SaveFileV10, 'version' | 'sim'> {
  version: 11;
  sim: SaveFileV10['sim'] & {
    war: {
      states: [string, WarState][];
      sieges: [number, { besieger: number; progress: number }][];
      occupationTimers: [string, { kingdom: number; since: number }][];
    };
  };
}

/**
 * v12 (town halls, levels, habitats, the ruler, animals). Every addition is optional
 * or has a default, so v11 worlds load unchanged.
 */
export interface SaveFileV12 extends Omit<SaveFileV11, 'version'> {
  version: 12;
}

export type SaveFile = SaveFileV12;

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}
