import { DAY_TICKS, MORNING, NIGHT_START, START_TIME, tileKey } from '../core/constants';
import { Rng } from '../core/rng';
import { BUILDINGS } from '../data/buildings';
import type { JobId } from '../data/jobs';
import { SETTLER_NAMES } from '../data/names';
import { RESOURCE_IDS, type ResourceId } from '../data/resources';
import { TERRAIN } from '../world/tiles';
import { World } from '../world/World';
import type { PathGrid } from './pathfinding';
import type {
  Appearance, BedClaim, Building, ChronicleEntry, GrowthMode, Household, Recruitment, TravelerOffer, ProgressionState, Regrowth, SessionMark, Settlement, Settler, SimEvent, Stats, WeatherState, WorkArea,
} from './types';
import { updateSettler } from './settlers';
import { updateFields, updateWeather } from './farming';
import { updateSeason } from './seasons';
import type { SeasonId } from '../data/seasons';
import { updatePopulation } from './population';
import { updateHouseholds } from './households';
import { updateOrchards } from './orchards';
import { surveyedCell, type SurveyedCell } from './mining';
import { updateTravelers } from './travelers';
import { GROWTH_STEP } from '../data/kingdomBalance';
import { checkMilestones } from './progression';
import { updateRegrowth, updateWorkshops } from './buildings';

export const SETTLER_CAPACITY = 10;
export const STARTING_SETTLERS = 5;
/**
 * Simulation ceiling for one valley. Growth stops openly at this size (the UI
 * says so) rather than letting a very large town slow every tick.
 */
export const MAX_POPULATION = 300;
/**
 * Path search nodes allowed per tick across all settlers. A settler whose search
 * does not fit waits a tick, so a village-wide rush (bedtime, morning) can't
 * stall a frame.
 */
export const PATH_BUDGET = 6000;
const CHRONICLE_LIMIT = 80;
/** A shared "can't reach" note only holds back settlers within this many tiles (Manhattan) of the failed search. */
export const SHARED_UNREACHABLE_RANGE = 12;

export function emptyStats(): Stats {
  return {
    woodGathered: 0, stoneGathered: 0, foodGathered: 0, harvested: 0, planksCrafted: 0, toolsCrafted: 0, arrivals: 0,
    wheatHarvested: 0, flourMilled: 0, bakedFood: 0, pathsBuilt: 0, births: 0, applesPicked: 0, driedApples: 0,
    surveys: 0, oreMined: 0, stoneQuarried: 0, charcoalMade: 0, coalBurned: 0, charcoalBurned: 0, copperSmelted: 0, ironSmelted: 0, copperToolsForged: 0, ironToolsForged: 0,
  };
}

/**
 * Authoritative game state and the fixed-step update. Nothing in here touches
 * the DOM, so the whole simulation runs headless in tests.
 */
export class Simulation implements PathGrid {
  readonly world: World;
  tick = 0;
  settlers: Settler[] = [];
  readonly buildings = new Map<number, Building>();
  /** Tile key to building id for every footprint tile. Derived; rebuilt on load. */
  readonly occupancy = new Map<number, number>();
  /** Tiles whose resource object is marked for harvest. */
  readonly designations = new Set<number>();
  /** Work reservations, key to settler id. Transient. */
  readonly reservations = new Map<string, number>();
  readonly regrowth = new Map<number, Regrowth>();
  /** `${settlerId}:${target}` to tick until which the target is skipped. Transient. */
  readonly unreachable = new Map<string, number>();
  /**
   * Shared notes: target to where the failed search started and until when.
   * Only settlers standing near that spot skip the target, so a settler on the
   * far bank of a river is not held back by failures on the near bank. Transient.
   */
  readonly sharedUnreachable = new Map<string, { until: number; x: number; y: number }>();
  private readonly unreachableCount = new Map<string, number>();
  stats: Stats = emptyStats();
  progression: ProgressionState = { reached: ['camp'] };
  weather: WeatherState = { raining: false, nextChange: Math.round(DAY_TICKS * 0.9) };
  rng: Rng;
  nextId = 1;
  lastArrival = 0;
  populationStatus = '';
  events: SimEvent[] = [];
  workAreas: WorkArea[] = [];
  /** Settlements, oldest first (the camp is always the first). */
  settlements: Settlement[] = [];
  /** Road-link results between settlements, cleared whenever the map changes (transient). */
  readonly roadCache = new Map<string, boolean>();
  /** Notable events, newest last (saved; capped). */
  chronicle: ChronicleEntry[] = [];
  /** Where the current play session began (saved, so the next session can summarise it). */
  session: SessionMark | null = null;
  /** Path search nodes left this tick (transient). */
  pathBudget = PATH_BUDGET;
  /** See GrowthMode. New valleys are 'deliberate' (set by createNewGame). */
  growthMode: GrowthMode = 'legacy';
  households: Household[] = [];
  /** Beds held for expected children and accepted travellers (saved). */
  bedClaims: BedClaim[] = [];
  /** The visitor currently waiting for an answer, if any. */
  offer: TravelerOffer | null = null;
  /** When the next visitor arrives (when none is waiting). */
  nextVisitor = 0;
  recruits: Recruitment[] = [];
  /** Tick the last recruited traveller settled (for the once-per-two-days limit). */
  lastRecruit = -Infinity;
  /** Surveyed geology cells (saved): cell id to ore left (null when the cell holds no deposit). */
  geology = new Map<number, { remaining: number | null }>();
  /** Ore units promised to miners on their way (transient, rebuilt from tasks). */
  readonly oreReserved = new Map<number, number>();
  /** Last season announced (transient; seasons follow the calendar). */
  lastSeason: SeasonId | null = null;

  constructor(seed: number, rngState = seed ^ 0x5bd1e995, genVersion = 1) {
    this.world = new World(seed, genVersion);
    this.rng = new Rng(rngState);
  }

  get seed(): number {
    return this.world.seed;
  }

  // ---- time ---------------------------------------------------------------

  /** 0..1, where 0 is midnight. */
  get timeOfDay(): number {
    return ((this.tick + START_TIME * DAY_TICKS) % DAY_TICKS) / DAY_TICKS;
  }
  get day(): number {
    return Math.floor((this.tick + START_TIME * DAY_TICKS) / DAY_TICKS) + 1;
  }
  isNight(): boolean {
    const t = this.timeOfDay;
    return t >= NIGHT_START || t < MORNING;
  }

  /** Settlers turn in, and get up, over a few minutes rather than all at once. */
  isBedtime(settlerId: number): boolean {
    const t = this.timeOfDay;
    const off = (settlerId % 12) * 0.0025;
    return t >= NIGHT_START + off || t < MORNING + off;
  }

  // ---- grid ---------------------------------------------------------------

  buildingAt(x: number, y: number): Building | undefined {
    const id = this.occupancy.get(tileKey(x, y));
    return id === undefined ? undefined : this.buildings.get(id);
  }

  walkable(x: number, y: number): boolean {
    if (!this.world.naturallyWalkable(x, y)) return false;
    const b = this.buildingAt(x, y);
    return !b || !BUILDINGS[b.type].blocks;
  }

  cost(x: number, y: number): number {
    return TERRAIN[this.world.terrain(x, y)].moveCost;
  }

  // ---- events -------------------------------------------------------------

  emit(e: SimEvent): void {
    this.events.push(e);
  }
  toast(text: string, level: 'info' | 'good' | 'warn' = 'info'): void {
    this.emit({ type: 'toast', text, level });
  }
  /** Records a notable event for the next Valley today summary. */
  record(kind: ChronicleEntry['kind'], text: string, x?: number, y?: number): void {
    this.chronicle.push({ tick: this.tick, kind, text, x, y });
    if (this.chronicle.length > CHRONICLE_LIMIT) this.chronicle.splice(0, this.chronicle.length - CHRONICLE_LIMIT);
  }

  startSession(): void {
    this.session = { startTick: this.tick, startStats: { ...this.stats }, startPopulation: this.settlers.length };
  }

  /** New work appeared: idle settlers look again right away instead of after their back-off. */
  wakeIdle(): void {
    for (const s of this.settlers) s.nextThink = 0;
  }

  area(id: number | null): WorkArea | undefined {
    return id === null ? undefined : this.workAreas.find((a) => a.id === id);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** What surveying found at (x, y), or null if nobody has surveyed there. */
  surveyedCell(x: number, y: number): SurveyedCell | null {
    return surveyedCell(this, x, y);
  }

  // ---- ids & settlers -----------------------------------------------------

  allocId(): number {
    return this.nextId++;
  }

  settler(id: number): Settler | undefined {
    return this.settlers.find((s) => s.id === id);
  }

  randomAppearance(): Appearance {
    return {
      skin: this.rng.int(4),
      hair: this.rng.int(6),
      hairStyle: this.rng.int(3),
      shirt: this.rng.int(6),
      pants: this.rng.int(3),
    };
  }

  pickName(): string {
    const used = new Set(this.settlers.map((s) => s.name));
    const free = SETTLER_NAMES.filter((n) => !used.has(n));
    if (free.length > 0) return this.rng.pick(free);
    return `${this.rng.pick(SETTLER_NAMES)} ${this.settlers.length + 1}`;
  }

  addSettler(x: number, y: number, job: JobId, name = this.pickName(), settlementId: number | null = this.settlements[0]?.id ?? null): Settler {
    const s: Settler = {
      id: this.allocId(), name, x: x + 0.5, y: y + 0.5, px: x + 0.5, py: y + 0.5,
      facing: 0, anim: 'idle', tool: null, job, carrying: null, capacity: SETTLER_CAPACITY,
      hunger: 85 + this.rng.int(15), energy: 90, homeId: null, appearance: this.randomAppearance(),
      task: null, focus: null, idleReason: '', hidden: false, path: null, pathIndex: 0,
      goalKey: null, repaths: 0, lastNotice: -9999, arrivedTick: this.tick,
      areaId: null, priorities: null, insideId: null, restNote: '', nextThink: 0, settlementId,
      lifeStage: 'adult', ageTicks: 0, householdId: null,
    };
    this.settlers.push(s);
    return s;
  }

  // ---- reservations -------------------------------------------------------

  reserve(key: string, settlerId: number): boolean {
    const owner = this.reservations.get(key);
    if (owner !== undefined && owner !== settlerId) return false;
    this.reservations.set(key, settlerId);
    return true;
  }
  release(key: string, settlerId: number): void {
    if (this.reservations.get(key) === settlerId) this.reservations.delete(key);
  }
  isReserved(key: string, settlerId?: number): boolean {
    const owner = this.reservations.get(key);
    return owner !== undefined && owner !== settlerId;
  }
  /**
   * Remembers that a target could not be reached. The note is shared by all
   * settlers for a shorter while (they usually stand on the same land), so a
   * cut-off site does not cost a failed search from every villager in turn.
   */
  markUnreachable(settlerId: number, target: string, ticks = 300, x = NaN, y = NaN): void {
    this.unreachable.set(`${settlerId}:${target}`, this.tick + ticks);
    // Repeated failures back off (up to a day) until the map changes.
    const n = (this.unreachableCount.get(target) ?? 0) + 1;
    this.unreachableCount.set(target, n);
    const until = this.tick + Math.min(DAY_TICKS, Math.round(ticks * 0.6) * 2 ** Math.min(n - 1, 4));
    this.sharedUnreachable.set(target, { until, x, y });
  }
  /** The map changed (something built, removed, a bridge finished): let everyone try again. */
  mapChanged(): void {
    this.sharedUnreachable.clear();
    this.unreachableCount.clear();
    this.roadCache.clear();
    this.wakeIdle();
  }
  /** Whether a settler (standing at x, y) should skip a target for now. */
  isUnreachable(settlerId: number, target: string, x = NaN, y = NaN): boolean {
    const until = this.unreachable.get(`${settlerId}:${target}`);
    if (until !== undefined && until > this.tick) return true;
    const shared = this.sharedUnreachable.get(target);
    if (!shared || shared.until <= this.tick) return false;
    // Without positions (older callers) the note applies to everyone.
    if (Number.isNaN(x) || Number.isNaN(shared.x)) return true;
    return Math.abs(x - shared.x) + Math.abs(y - shared.y) <= SHARED_UNREACHABLE_RANGE;
  }
  /** Nobody could reach this target recently (for UI explanations). */
  unreachableForAll(target: string): boolean {
    const shared = this.sharedUnreachable.get(target);
    return shared !== undefined && shared.until > this.tick;
  }

  // ---- storage ------------------------------------------------------------

  storages(): Building[] {
    const out: Building[] = [];
    for (const b of this.buildings.values()) if (b.built && BUILDINGS[b.type].storage) out.push(b);
    return out;
  }

  storageUsed(b: Building): number {
    let n = 0;
    for (const r of RESOURCE_IDS) n += b.inventory[r] ?? 0;
    return n;
  }

  storageCapacity(b: Building): number {
    return BUILDINGS[b.type].storage ?? 0;
  }

  available(b: Building, res: ResourceId): number {
    return (b.inventory[res] ?? 0) - (b.reservedOut[res] ?? 0);
  }

  storedTotal(res: ResourceId): number {
    let n = 0;
    for (const b of this.storages()) n += b.inventory[res] ?? 0;
    return n;
  }

  totals(): Record<ResourceId, number> {
    const out = {} as Record<ResourceId, number>;
    for (const r of RESOURCE_IDS) out[r] = 0;
    for (const b of this.storages()) for (const r of RESOURCE_IDS) out[r] += b.inventory[r] ?? 0;
    return out;
  }

  totalCapacity(): { used: number; capacity: number } {
    let used = 0;
    let capacity = 0;
    for (const b of this.storages()) {
      used += this.storageUsed(b);
      capacity += this.storageCapacity(b);
    }
    return { used, capacity };
  }

  nearestStorageWith(res: ResourceId, x: number, y: number, min = 1): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.storages()) {
      if (this.available(b, res) < min) continue;
      const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  nearestStorageWithSpace(x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.storages()) {
      if (this.storageUsed(b) >= this.storageCapacity(b)) continue;
      const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Adds up to `amount` goods, limited by free space. Returns how many went in. */
  deposit(b: Building, res: ResourceId, amount: number): number {
    const space = this.storageCapacity(b) - this.storageUsed(b);
    const n = Math.max(0, Math.min(space, amount));
    if (n > 0) b.inventory[res] = (b.inventory[res] ?? 0) + n;
    return n;
  }

  /** Deposits into any storage, nearest first. Returns how many could not be stored. */
  depositAnywhere(res: ResourceId, amount: number, x: number, y: number): number {
    let left = amount;
    const list = this.storages().sort(
      (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
    );
    for (const b of list) {
      if (left <= 0) break;
      left -= this.deposit(b, res, left);
    }
    return left;
  }

  /** Removes unreserved goods from storage, spreading across buildings. Returns how many were taken. */
  withdrawUnreserved(res: ResourceId, amount: number): number {
    let left = amount;
    for (const b of this.storages()) {
      if (left <= 0) break;
      const n = Math.min(left, Math.max(0, this.available(b, res)));
      if (n > 0) {
        b.inventory[res] = (b.inventory[res] ?? 0) - n;
        left -= n;
      }
    }
    return amount - left;
  }

  /** Enough tools for everyone gives a work-speed bonus. */
  wellEquipped(): boolean {
    return this.settlers.length > 0 && this.storedTotal('tools') >= this.settlers.length;
  }

  // ---- update -------------------------------------------------------------

  step(): void {
    this.tick++;
    this.pathBudget = PATH_BUDGET;
    for (const s of this.settlers) {
      s.px = s.x;
      s.py = s.y;
    }
    updateSeason(this);
    updateWeather(this);
    if (this.tick % 5 === 0) {
      updateFields(this, 5);
      updateOrchards(this, 5);
    }
    if (this.tick % 20 === 0) updateRegrowth(this);
    for (const s of this.settlers) updateSettler(this, s);
    if (this.tick % 10 === 0) updateWorkshops(this);
    if (this.tick % GROWTH_STEP === 0) {
      updateHouseholds(this);
      updateTravelers(this);
      updatePopulation(this);
      this.checkStorage();
      checkMilestones(this);
      this.pruneUnreachable();
    }
  }

  private storageWarned = false;
  /** Warns once when storage fills up, and again only after it has had room. */
  private checkStorage(): void {
    const { used, capacity } = this.totalCapacity();
    const full = capacity > 0 && used >= capacity;
    if (full && !this.storageWarned) this.toast('Storage is full. Build a storehouse so settlers can drop off their goods.', 'warn');
    this.storageWarned = full || (this.storageWarned && used > capacity * 0.9);
  }

  private pruneUnreachable(): void {
    for (const [k, until] of this.unreachable) if (until <= this.tick) this.unreachable.delete(k);
    for (const [k, n] of this.sharedUnreachable) if (n.until <= this.tick) this.sharedUnreachable.delete(k);
  }
}
