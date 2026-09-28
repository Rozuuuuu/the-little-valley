import type { BuildingId } from '../data/buildings';
import type { CropId } from '../data/crops';
import type { JobId, WorkKind } from '../data/jobs';
import type { MilestoneId, StatId } from '../data/progression';
import type { RecipeId } from '../data/recipes';
import type { Inventory, ResourceId } from '../data/resources';
import type { ObjectId } from '../world/tiles';
import type { SeasonId } from '../data/seasons';

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
  | { kind: 'orchard'; orchard: number; action: OrchardAction; stage: 'walk' | 'work'; timer: number }
  | { kind: 'survey'; x: number; y: number; stage: 'walk' | 'work'; timer: number }
  | { kind: 'train'; site: number; stage: 'walk' | 'drill' }
  | { kind: 'extract'; site: number; slot: number; amount: number; stage: 'walk' | 'work'; timer: number }
  | { kind: 'craft'; ws: number; stage: 'walk' | 'work' }
  | { kind: 'eat'; src: number }
  | { kind: 'sleep'; home: number | null; stage: 'walk' | 'sleep' };

export type FieldAction = 'till' | 'plant' | 'water' | 'harvest';
export type OrchardAction = 'tend' | 'pick';

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
  /** Earliest tick an idle settler looks for work again (transient back-off). */
  nextThink: number;
  /** Home settlement (its centre building id). Settlers prefer work, beds and stores there. */
  settlementId: number | null;
  /** Children eat, sleep and play but take no adult work or orders. */
  lifeStage: LifeStage;
  /** Game ticks lived as a child (0 for adults). */
  ageTicks: number;
  householdId: number | null;
  /** Away on a caravan (the manifest's id): not in the valley and not simulated until it returns. */
  awayOn: number | null;
  /** The kingdom this settler is loyal to. Moving between settlements never changes it. */
  kingdomId: number;
  /** Serving as a soldier (null for civilians). */
  military: MilitaryService | null;
  /** Held by another kingdom after a lost battle; home at peace. */
  captive?: { by: number } | null;
  /** The ruler: the player on the map. Never works, enlists or fights. */
  ruler?: boolean;
  /** Works faster until this tick (the ruler's Rally). */
  boostUntil?: number;
}

/** A war between two kingdoms and what it has cost each side. */
export interface WarState {
  attacker: number;
  defender: number;
  objective: 'raid' | 'capture' | 'defend';
  startedTick: number;
  planId: number | null;
  truceUntilTick: number;
  /** Companies routed, per kingdom. */
  routs: Record<number, number>;
  lastDeploy: Record<number, number>;
  lastSkirmishDay: number;
}

/** A settler's time in the army: what they carry and what they return to. */
export interface MilitaryService {
  unit: 'infantry' | 'archer' | 'knight';
  state: 'training' | 'ready' | 'deployed';
  /** Drill ticks so far. */
  trained: number;
  buildingId: number;
  companyId: number;
  /** Gear taken from the stores; it goes back when they leave. */
  gear: Inventory;
  priorJob: JobId;
  priorPriorities: WorkKind[] | null;
  priorArea: number | null;
}

/** A 16×16-tile block of land. */
export interface ClaimSector {
  x: number;
  y: number;
}

/** Who holds a sector: legal title, who (if anyone) occupies it, and whether it is a protected homeland. */
export interface TerritoryClaim {
  sector: ClaimSector;
  legalOwner: number;
  occupyingKingdom: number | null;
  protectedHomeland: boolean;
}

export type ConflictMode = 'protected-frontier' | 'full-conquest';

/** A company of soldiers (rivals' are abstract; the player's have members once trained). */
export interface Company {
  id: number;
  kind: 'infantry' | 'archer' | 'knight';
  strength: number;
  /** The coalition commitment it is pledged to, if any. */
  pledgedTo: number | null;
  owner: number;
  /** Player companies: their soldiers (settler ids) and field state. */
  members?: number[];
  state?: 'home' | 'deployed' | 'returning';
  /** Food carried. */
  supplies?: number;
  suppliesDay?: number;
  /** 0–100: falls without food; at 0 they come home. */
  readiness?: number;
  x?: number;
  y?: number;
  home?: { x: number; y: number };
  target?: { x: number; y: number } | null;
  /** Walking path (transient). */
  path?: { x: number; y: number }[] | null;
  orders?: string;
  /** Hit points of the company in battle, 0–100. */
  health?: number;
  /** 0–100: below 25 the company breaks off. */
  morale?: number;
  /** Can't attack again until this tick after breaking off. */
  regroupUntil?: number;
}

export type Stance = 'neutral' | 'trading' | 'ally' | 'enemy';
export type Certainty = 'rumor' | 'observed' | 'confirmed';
export type WorldEventKind = 'military-buildup' | 'border-forces' | 'claim' | 'conquest' | 'treaty-broken' | 'prosperity' | 'war-declared' | 'alliance';

/** Something that really happened (the internal truth). Kingdoms act only on reports of it. */
export interface WorldEvent {
  id: number;
  kind: WorldEventKind;
  subject: number;
  magnitude: number;
  location: ClaimSector | null;
  tick: number;
}

export interface NewsReport {
  id: number;
  eventId: number;
  kind: WorldEventKind;
  /** The kingdom that passed it on (null when seen first-hand). */
  sourceKingdomId: number | null;
  /** How it was learned: scout, border, envoy, merchant, ally… */
  sourceKind: string;
  subjectKingdomId: number;
  recipientKingdomId: number;
  certainty: Certainty;
  observedTick: number;
  /** When it arrives (null: waiting for a merchant to carry it). */
  arrivalTick: number | null;
  /** The earlier report on the same thing that this one corrects. */
  supersedes: number | null;
  superseded: boolean;
  delivered: boolean;
  magnitude: number;
  /** Only when the source knew where. */
  location: ClaimSector | null;
  /** Kingdoms that passed it along, in order. */
  relayedBy: number[];
  /** When the thing itself happened. */
  eventTick: number;
}

export interface TreatyOffer {
  id: number;
  kind: 'trade' | 'passage' | 'nonAggression' | 'defensiveAlliance' | 'truce' | 'peace';
  proposer: number;
  recipient: number;
  terms: { durationDays: number; payment: number; transfers?: ClaimSector[]; waiveUnmet?: boolean };
  /** Coins held until the answer. */
  escrow: number;
  state: 'proposed' | 'accepted' | 'active' | 'fulfilled' | 'expired' | 'rejected' | 'breached';
  /** The other side's reasons (for AI answers). */
  reasons: string[];
  createdTick: number;
  expiresTick: number;
  /** When an AI recipient decides (the letter's arrival); null for offers to the player. */
  decideTick: number | null;
  activatedTick: number | null;
  endsTick: number | null;
}

export interface Incident {
  id: number;
  kind: 'civilianPassage' | 'armedPassage' | 'hostileAttack';
  from: number;
  to: number;
  sector: ClaimSector;
  tick: number;
  state: 'open' | 'allowed' | 'withdrawn' | 'standoff' | 'refused';
}

export type ConcernBand = 'calm' | 'watchful' | 'concerned' | 'alarmed';

export interface ConcernState {
  band: ConcernBand;
  score: number;
  lastWarnTick: number;
  lastWarnBand: ConcernBand;
  reassuredTick: number | null;
  reassuredEvidence: number;
  lastEvidence: number;
}

export interface Warning {
  id: number;
  from: number;
  to: number;
  band: ConcernBand;
  reasons: string[];
  actions: string[];
  tick: number;
  state: 'open' | 'answered';
  response: string | null;
}

export interface WarPlan {
  id: number;
  target: number;
  objective: 'raid' | 'capture' | 'defend';
  createdTick: number;
  state: 'drafting' | 'mobilizing' | 'launched' | 'cancelled' | 'concluded';
  staging: ClaimSector | null;
}

export type SupportState =
  | 'proposed' | 'countered' | 'accepted' | 'assembling'
  | 'enRoute' | 'arrived' | 'active' | 'returning'
  | 'fulfilled' | 'refused' | 'expired' | 'breached' | 'cancelled';

export interface CampaignSupportTerms {
  /** Allied-owned companies; never copied into the player's population. */
  companies: number[];
  coinFee: number;
  supplyPayer: 'requester' | 'contributor' | 'shared';
  /** 0..1; 0.5 for shared. */
  requesterSupplyShare: number;
  serviceDays: number;
  commandRights: 'coordinated' | 'delegated';
  rewardSectors: ClaimSector[];
  reciprocalDefenseDays: number;
}

export interface CoalitionCommitment {
  id: number;
  campaignId: number;
  contributor: number;
  beneficiary: number;
  state: SupportState;
  /** What the player asked for (count-based), used to spot identical requests. */
  requested: { companies: number; coinFee: number; supplyPayer: CampaignSupportTerms['supplyPayer']; serviceDays: number; commandRights: CampaignSupportTerms['commandRights']; rewardSectors: ClaimSector[]; reciprocalDefenseDays: number; unit?: Company['kind'] };
  terms: CampaignSupportTerms;
  /** Offer/muster deadline; service timing is tracked separately. */
  expiresTick: number;
  activatedTick: number | null;
  escrow: number;
  reasons: string[];
  decideTick: number;
  unit: Company['kind'] | null;
  arriveTick?: number;
  serviceEnds?: number;
  supplyDay?: number;
  supplyMissed?: number;
  returnTick?: number;
}

export interface Kingdom {
  /** 0 for the player; a rival's id is its home region's id. */
  id: number;
  name: string;
  player: boolean;
  crowned: boolean;
  ruler: { name: string; appearance: Appearance } | null;
  banner: { color: string; emblem: string };
  treasury: number;
  taxCollected: number;
  policy: 'none' | 'modest' | 'high';
  /** Public trust, 0–100. */
  trust: number;
  /** Day trust was last updated. */
  trustDay: number;
  council: Record<'steward' | 'envoy' | 'marshal', number | null>;
  /** Protected homeland sectors, fixed at coronation (null before). */
  homeland: ClaimSector[] | null;
  conflictMode: ConflictMode;
  /** The conflict setting can't change after the first frontier claim. */
  modeLocked: boolean;
  /** Border incidents and war are enabled (Civilization plus an explicit choice). */
  frontierActive: boolean;
  capitalRegion: number | null;
  capital: { x: number; y: number } | null;
  personality: 'cautious' | 'mercantile' | 'proud';
  companies: Company[];
}

/** A standing order to keep a store in another settlement stocked, served by caravans. */
export interface Route {
  id: number;
  sourceId: number;
  destId: number;
  res: ResourceId;
  /** Keep the destination at this amount. */
  target: number;
  /** Why no cart is on the road right now ('' when one is). Transient. */
  status: string;
}

/**
 * Goods on the road. They left the source when the cart set off and belong to
 * the manifest alone until they are unloaded, so nothing is ever counted at
 * both ends. The teamster is away with it.
 */
export interface Manifest {
  id: number;
  routeId: number | null;
  crewId: number;
  sourceId: number;
  destId: number;
  cargo: Inventory;
  state: 'outbound' | 'returning';
  departTick: number;
  arriveTick: number;
  legTicks: number;
  /** Where the cart set off and where it is heading (for drawing and for dropping a crate). */
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * A travelling merchant. Exactly one stage owns them at a time: on the road
 * between regions ('travelling', abstract), walking in ('arriving', on the
 * map), at the inn ('lodging'), walking out ('leaving'). Gone means removed.
 */
export interface Party {
  id: number;
  name: string;
  appearance: Appearance;
  homeRegion: number;
  stock: Inventory;
  state: 'travelling' | 'arriving' | 'lodging' | 'leaving';
  innId: number;
  arriveTick: number;
  leaveTick: number;
  x: number;
  y: number;
  /** Walking path (transient; rebuilt after loading). */
  path: { x: number; y: number }[] | null;
  /** Where they entered the map, and leave it again. */
  edge: { x: number; y: number };
  /** Coins in their purse (finite). */
  coins: number;
}

export type LifeStage = 'child' | 'adult';

/**
 * How a valley grows. 'legacy' is the original rule (a free bed and spare food
 * draw newcomers on their own); 'deliberate' grows only through families and
 * travellers the player welcomes. Old worlds keep 'legacy' until the player
 * adopts the new rules.
 */
export type GrowthMode = 'legacy' | 'deliberate';

/** A child the household asked for, waiting for steady conditions. */
export interface PendingChild {
  requestedTick: number;
  /** Ticks of steady conditions so far; the child is born at CHILD_STABLE_TICKS. */
  stableTicks: number;
  /** The bed held for the child, or null while none is free. */
  claimId: number | null;
  /** Why the wait is paused ('' while it advances). */
  blocked: string;
}

/** Two adults who share a home and may ask for children. */
export interface Household {
  id: number;
  adults: [number, number];
  children: number[];
  pending: PendingChild | null;
  /** No new request before this tick. */
  cooldownUntil: number;
}

/**
 * A bed held for someone who does not live here yet (an expected child or an
 * accepted traveller). Claims are saved and count as occupied beds, so two
 * newcomers can never be promised the same bed.
 */
export interface BedClaim {
  id: number;
  homeId: number;
  owner: { kind: 'birth'; id: number } | { kind: 'recruit'; id: number };
}

/** A traveller offering to settle in exchange for a welcome package of apples. */
export interface TravelerOffer {
  id: number;
  name: string;
  appearance: Appearance;
  arrivedTick: number;
  expiresTick: number;
}

/**
 * An accepted traveller on their way in. The apples are taken out of storage
 * into escrow when the player accepts, and handed over on arrival; a cancelled
 * recruitment returns them (keeping any that don't fit until there is room).
 */
export interface Recruitment {
  id: number;
  name: string;
  appearance: Appearance;
  settlementId: number;
  claimId: number | null;
  state: 'travelling' | 'refunding';
  escrow: Inventory;
  arrivesTick: number;
  blocked: string;
}

export interface OrchardState {
  /** Growing-season ticks spent establishing (bears fruit once established). */
  growth: number;
  /** Ripe apples on the trees (fractional while ripening). */
  fruit: number;
  /** Trees keep bearing until this tick; a tending visit extends it. */
  careUntil: number;
}

/** A settlement: a camp or waystation hall and the land around it. */
export interface Settlement {
  /** Id of the centre building (camp or waystation). */
  id: number;
  name: string;
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
  kind: 'built' | 'arrival' | 'milestone' | 'bridge' | 'shortage' | 'season' | 'settlement' | 'birth' | 'family';
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
  orchard?: OrchardState;
  /** Upgrade level (absent means 1). */
  level?: number;
  /** An upgrade in progress: already paid for, finishing on a timer. */
  upgrade?: { to: number; progress: number; paid: Inventory };
  /** Mines: the deposit worked (its cell id) and the shaft level (1–3). */
  mine?: { depositId: number; level: number };
  /** Quarries: stone cut so far (drives the visible excavation stage). */
  quarry?: { extracted: number };
  workshop?: WorkshopState;
  placedTick: number;
  /** Settlers assigned to work here (production buildings), up to maxWorkers. */
  workers: number[];
  /** Storage only: amounts haulers keep stocked here, fetched from other stores. */
  wants: Inventory;
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
  | { type: 'season'; id: SeasonId };

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
