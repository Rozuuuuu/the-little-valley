import type { BuildingId } from '../data/buildings';
import type { CropId } from '../data/crops';
import type { JobId, WorkKind } from '../data/jobs';
import type { MilestoneId, StatId } from '../data/progression';
import type { RecipeId } from '../data/recipes';
import type { Inventory, ResourceId } from '../data/resources';
import type { ObjectId } from '../world/tiles';

export interface Carry {
  res: ResourceId;
  amount: number;
}

export interface Appearance {
  skin: number;
  hair: number;
  hairStyle: number;
  shirt: number;
  pants: number;
}

/** 0 = down, 1 = up, 2 = left, 3 = right. */
export type Facing = 0 | 1 | 2 | 3;
export type Anim = 'idle' | 'walk' | 'work' | 'sleep';
export type ToolKind = 'axe' | 'pick' | 'hand' | 'hoe' | 'can' | 'hammer' | 'saw' | 'sickle';

/** A settler is told to keep working the same kind of thing near a spot after a manual order. */
export interface Focus {
  kind: 'gather';
  res: ResourceId;
  x: number;
  y: number;
  until: number;
}

export type Task =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'wander'; x: number; y: number }
  | { kind: 'gather'; x: number; y: number; stage: 'walk' | 'work'; timer: number }
  | { kind: 'deliver'; target: number | null }
  | { kind: 'haul'; src: number; dst: number; res: ResourceId; amount: number; stage: 'toSrc' | 'toDst' }
  | { kind: 'build'; site: number; slot: number; stage: 'walk' | 'work' }
  | { kind: 'farm'; field: number; action: FieldAction; stage: 'walk' | 'work'; timer: number }
  | { kind: 'craft'; ws: number; stage: 'walk' | 'work' }
  | { kind: 'eat'; src: number }
  | { kind: 'sleep'; home: number | null; stage: 'walk' | 'sleep' };

export type FieldAction = 'till' | 'plant' | 'water' | 'harvest';

export interface Settler {
  id: number;
  name: string;
  /** Tile-space position of the settler's feet (tile centre = x + 0.5). */
  x: number;
  y: number;
  /** Position at the previous tick, for render interpolation. Not saved. */
  px: number;
  py: number;
  facing: Facing;
  anim: Anim;
  tool: ToolKind | null;
  job: JobId;
  carrying: Carry | null;
  capacity: number;
  /** 0..100; low values slow the settler but never harm them. */
  hunger: number;
  energy: number;
  homeId: number | null;
  appearance: Appearance;
  /** Not saved: tasks are rebuilt after loading so reservations never leak. */
  task: Task | null;
  focus: Focus | null;
  /** Why the settler is not working, shown in the UI. Empty when busy. */
  idleReason: string;
  hidden: boolean;
  path: { x: number; y: number }[] | null;
  pathIndex: number;
  goalKey: string | null;
  repaths: number;
  /** Tick of the last "I could not do my order" notice, so feedback is not spammy. */
  lastNotice: number;
  arrivedTick: number;
  /** Work area this settler is assigned to. Area work comes before job priorities. */
  areaId: number | null;
  /** Personal work order; null means the job's default order. */
  priorities: WorkKind[] | null;
  /** Home the settler is currently asleep inside (transient, for lit windows and occupancy). */
  insideId: number | null;
  /** Why the settler is resting where they are (shown while asleep). */
  restNote: string;
}

export type AreaKind = 'farm' | 'wood' | 'stone' | 'build';

/** A player-drawn rectangle whose assigned settlers do one kind of work inside it first. */
export interface WorkArea {
  id: number;
  name: string;
  kind: AreaKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Notable things that happened, kept for the Valley today summary. */
export interface ChronicleEntry {
  tick: number;
  kind: 'built' | 'arrival' | 'milestone' | 'bridge' | 'shortage';
  text: string;
  x?: number;
  y?: number;
}

/** Where a play session started, so the next session can summarise it. */
export interface SessionMark {
  startTick: number;
  startStats: Stats;
  startPopulation: number;
}

export interface FieldState {
  crop: CropId | null;
  state: 'wild' | 'tilled' | 'growing' | 'ripe';
  growth: number;
  moisture: number;
}

export interface WorkshopState {
  recipe: RecipeId | null;
  progress: number;
  paused: boolean;
  status: string;
}

export interface Building {
  id: number;
  type: BuildingId;
  x: number;
  y: number;
  w: number;
  h: number;
  built: boolean;
  /** Builder work applied so far. */
  progress: number;
  /** Materials on site: construction materials, or workshop inputs. */
  delivered: Inventory;
  /** Materials on their way in. Transient: cleared on load. */
  incoming: Inventory;
  /** Stored goods, for storage buildings. */
  inventory: Inventory;
  /** Stored goods promised to a hauler, crafter or eater. Transient. */
  reservedOut: Inventory;
  field?: FieldState;
  workshop?: WorkshopState;
  placedTick: number;
  /** Settlers assigned to work here (production buildings), up to maxWorkers. */
  workers: number[];
}

export interface Regrowth {
  to: ObjectId;
  at: number;
}

export type Stats = Record<StatId, number>;

export interface ProgressionState {
  reached: MilestoneId[];
}

export interface WeatherState {
  raining: boolean;
  /** Tick at which the weather next changes. */
  nextChange: number;
}

export type SimEvent =
  | { type: 'toast'; text: string; level: 'info' | 'good' | 'warn' }
  | { type: 'sfx'; name: SfxName; x?: number; y?: number }
  | { type: 'fx'; kind: FxKind; x: number; y: number }
  | { type: 'milestone'; id: MilestoneId }
  | { type: 'arrival'; settlerId: number }
  | { type: 'important' }
  | { type: 'focus'; x: number; y: number; w: number; h: number };

export type SfxName =
  | 'chop' | 'mine' | 'pick' | 'dig' | 'plant' | 'water' | 'harvest' | 'hammer' | 'saw'
  | 'drop' | 'complete' | 'place' | 'arrival' | 'milestone' | 'error' | 'eat' | 'mill' | 'bake';

export type FxKind = 'woodchips' | 'stonechips' | 'leaves' | 'sparkle' | 'dust' | 'splash' | 'hearts' | 'soil';

export interface CommandResult {
  ok: boolean;
  message?: string;
  /** Id of whatever the command created (e.g. a work area). */
  id?: number;
}
