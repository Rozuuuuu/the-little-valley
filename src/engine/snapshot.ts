import { seasonOf, winterForecast } from '../game/sim/seasons';
import { roadLinked } from '../game/sim/settlements';
import { TILE, tileKey } from '../game/core/constants';
import { BUILDINGS, BUILDING_IDS, type BuildingId } from '../game/data/buildings';
import { CROPS, CROP_IDS, type CropId } from '../game/data/crops';
import type { JobId, WorkKind } from '../game/data/jobs';
import { MILESTONES, type MilestoneId } from '../game/data/progression';
import { RECIPES, type RecipeId } from '../game/data/recipes';
import { RESOURCE_IDS, RESOURCES, type Inventory, type ResourceId } from '../game/data/resources';
import {
  bedsOf, costOf, cropUnlocked, housingCapacity, isPermanentHome, isUnlocked, maxWorkers, unlockName, workOf,
} from '../game/sim/buildings';
import { AREA_LABELS, AREA_MAX_WORKERS } from '../game/sim/commands';
import { fieldStage, seasonalGrowth } from '../game/sim/farming';
import { invEntries } from '../game/sim/inventory';
import { effectivePriorities } from '../game/sim/priorities';
import { currentMilestone, nextMilestone, requirementProgress, type RequirementProgress } from '../game/sim/progression';
import { describeTask } from '../game/sim/settlers';
import type { Simulation } from '../game/sim/Simulation';
import type { Appearance, AreaKind, BedClaim, Building, Settler } from '../game/sim/types';
import { daysToAdult, householdOf } from '../game/sim/households';
import { orchardStatus } from '../game/sim/orchards';
import { describeCell, extractionStatus, MINE_UPGRADES, MINE_YIELD, mineDeposit, quarryStage, surveyedCell } from '../game/sim/mining';
import { MINERALS } from '../game/data/minerals';
import { formatInv } from '../game/sim/inventory';
import { OBJECTS, TERRAIN } from '../game/world/tiles';
import type { Overview } from './overview';
import type { GrowthInfo } from './growthInfo';
import { gameTime } from './growthInfo';
import { SPECIES } from '../game/data/animals';
import { huntRadiusOf, penAnimals, penCapacity, penStatus, preyNear } from '../game/sim/animals';
import { levelName, levelOf, nextLevel, upgradeProblem } from '../game/sim/levels';
import { innInfo, type InnInfo, type LogisticsInfo } from './tradeInfo';
import type { DiplomacyInfo, KingdomInfo, NewsItem, WarCouncilInfo, WarInfo } from './kingdomSnapshot';
import { trainingInfo, type ArmyInfo } from './militaryInfo';
import { claimPreview, ownerOf, sectorOf } from '../game/sim/territory';
import { kingdomById } from '../game/sim/kingdoms';

export type Mode =
  | { kind: 'select' }
  | { kind: 'place'; building: BuildingId; crop: CropId | null }
  | { kind: 'mark' }
  | { kind: 'unmark' }
  | { kind: 'area'; areaKind: AreaKind; editId: number | null }
  | { kind: 'survey' }
  | { kind: 'claim' }
  | { kind: 'march'; companyId: number; supplyDays: number };

export interface SettlerInfo {
  id: number;
  name: string;
  /** For portraits. */
  appearance: Appearance;
  /** The ruler: the player on the map. */
  ruler: boolean;
  job: JobId;
  task: string;
  idleReason: string;
  idle: boolean;
  carrying: { res: ResourceId; amount: number } | null;
  hunger: number;
  energy: number;
  home: string;
  homeId: number | null;
  /** Why they sleep where they do, e.g. no free bed. */
  bedNote: string;
  areaId: number | null;
  areaName: string;
  priorities: WorkKind[];
  customOrder: boolean;
  workplace: string;
  /** 'Adult', or 'Child · grows up in N days'. */
  age: string;
  child: boolean;
  /** The other adult in their household, if any. */
  partner: string;
}

export interface BuildingInfo {
  ids: number[];
  type: BuildingId;
  name: string;
  description: string;
  built: boolean;
  progress: number;
  materials: { res: ResourceId; have: number; need: number; incoming: number }[];
  status: string;
  /** Orchard state in plain words. */
  orchard?: string;
  inn?: InnInfo;
  training?: ReturnType<typeof trainingInfo>;
  /** Quarries and mines. */
  extraction?: { status: string; level: number | null; maxLevel: number; upgrade: string | null; deposit: string | null };
  storage?: { entries: [ResourceId, number][]; used: number; capacity: number };
  residents?: { people: { id: number; name: string; asleep: boolean }[]; capacity: number; temporary: boolean; held: string[] };
  field?: { crop: CropId | null; state: string; stage: number; stages: number; growth: number; moisture: number; ripeIn: string };
  workshop?: { recipe: RecipeId | null; recipes: RecipeId[]; status: string; paused: boolean; buffer: [ResourceId, number][]; progress: number };
  workers?: { people: { id: number; name: string }[]; max: number };
  span?: { length: number };
  canRemove: boolean;
  permanent: boolean;
  /** Pens and pastures. */
  pen?: { species: string; count: number; capacity: number; status: string; ready: number; product: string | null };
  /** Hunter's lodges. */
  hunting?: { prey: number; radius: number; kinds: string };
  /** Upgrade levels, for buildings that have them. */
  level?: {
    level: number;
    max: number;
    name: string;
    next: { name: string; perks: string[]; cost: Inventory; time: string; blocked: string | null } | null;
    upgrading: { progress: number; to: string } | null;
  };
}

export interface AreaInfo {
  id: number;
  name: string;
  kind: AreaKind;
  kindName: string;
  does: string;
  workers: { id: number; name: string }[];
  max: number;
  size: string;
  /** Work available inside right now, in plain words. */
  status: string;
  /** Workers it staffs itself with (null: assigned by hand). */
  wanted: number | null;
  crop: CropId | null;
}

export interface Toast {
  id: number;
  text: string;
  level: 'info' | 'good' | 'warn' | 'bad';
  at: number;
}

export function regionalInfo(sim: Simulation) {
  const season = seasonOf(sim);
  return { calendar: `${season.def.name} ${season.day}/4 · Year ${season.year}`, forecast: winterForecast(sim).text, seasonNote: season.def.arrival, towns: sim.settlements.map(t => {
    const b = sim.buildings.get(t.id)!;
    return { id: t.id, name: t.name, people: sim.settlers.filter(p => p.settlementId === t.id).map(p => p.name), food: b.inventory.food ?? 0, target: b.wants.food ?? 0, linked: sim.settlements.some(other => other.id !== t.id && roadLinked(sim, t.id, other.id)) };
  }) };
}

export interface UiSnapshot {
  region: ReturnType<typeof regionalInfo>;
  growth: GrowthInfo;
  logistics: LogisticsInfo;
  kingdom: KingdomInfo;
  diplomacy: DiplomacyInfo;
  news: { items: NewsItem[]; summarised: number };
  warCouncil: WarCouncilInfo;
  army: ArmyInfo;
  war: WarInfo;
  running: boolean;
  paused: boolean;
  speed: number;
  day: number;
  clock: string;
  period: string;
  isNight: boolean;
  raining: boolean;
  resources: Record<ResourceId, number>;
  storage: { used: number; capacity: number };
  population: number;
  housing: number;
  beds: string;
  populationStatus: string;
  wellEquipped: boolean;
  milestone: { current: string; tier: number; next: { name: string; description: string; unlocks: string[]; reqs: RequirementProgress[]; future: boolean } | null };
  mode: Mode;
  selection: SettlerInfo[];
  building: BuildingInfo | null;
  settlers: SettlerInfo[];
  idleCount: number;
  toasts: Toast[];
  tutorial: { index: number; total: number; title: string; text: string } | null;
  tutorialOutro: boolean;
  hover: string | null;
  saveStatus: string;
  unlocked: { buildings: BuildingId[]; locked: { id: BuildingId; at: string }[]; crops: CropId[] };
  worldName: string;
  explored: number;
  areas: AreaInfo[];
  selectedArea: number | null;
  overview: Overview | null;
  celebration: { id: MilestoneId; name: string; unlocks: string[]; next: { name: string; description: string; future: boolean }[] } | null;
  finds: { idle: number; waiting: number; sites: number; bridge: boolean };
  /** The player's ruler on the map, if this world has one. */
  ruler: { id: number; name: string; title: string; rallyIn: string } | null;
}

export function emptySnapshot(): UiSnapshot {
  const resources = {} as Record<ResourceId, number>;
  for (const r of RESOURCE_IDS) resources[r] = 0;
  return {
    region: { calendar: '', forecast: '', seasonNote: '', towns: [] },
    logistics: { stores: [], routes: [], carts: 0, towns: [], resources: [] },
    diplomacy: { kingdoms: [], offersToYou: [], yourOffers: [], incidents: [], warnings: [], treatyKinds: [], hasEnvoy: false },
    news: { items: [], summarised: 0 },
    warCouncil: { plans: [], allies: [] },
    army: { companies: [], equipment: { swords: 0, bows: 0, armor: 0, horses: 0 }, units: [], training: 0 },
    war: { wars: [], previews: [], settlements: [] },
    kingdom: {
      name: '', crowned: false, ruler: null, banner: { color: '#3a6ea5', emblem: 'oak' }, treasury: 0, taxCollected: 0, policy: 'none', policies: [], trust: 0,
      council: [], homeland: 0, homelandPreview: 0, claims: 0, claimCost: 0, conflictMode: 'protected-frontier', modeLocked: false, frontierActive: false,
      canCoronate: false, bannerColors: [], emblems: [], rivals: [],
    },
    growth: {
      mode: 'deliberate', adoption: '', adults: 0, children: 0, beds: { homeUsed: 0, held: 0, homeTotal: 0, bedrollsUsed: 0, bedrolls: 0 },
      households: [], unpaired: [], visitor: null, nextVisitorIn: '', recruits: [], settlements: [], foodPrice: 0,
    },
    running: false, paused: false, speed: 1, day: 1, clock: '', period: '', isNight: false, raining: false,
    resources, storage: { used: 0, capacity: 0 }, population: 0, housing: 0, beds: '', populationStatus: '', wellEquipped: false,
    milestone: { current: 'Camp', tier: 0, next: null }, mode: { kind: 'select' }, selection: [], building: null,
    settlers: [], idleCount: 0, toasts: [], tutorial: null, tutorialOutro: false, hover: null, saveStatus: '',
    unlocked: { buildings: [], locked: [], crops: [] }, worldName: '', explored: 0,
    areas: [], selectedArea: null, overview: null, celebration: null, finds: { idle: 0, waiting: 0, sites: 0, bridge: false }, ruler: null,
  };
}

export function clockOf(t: number): { clock: string; period: string } {
  const mins = Math.floor(t * 24 * 60);
  const h = Math.floor(mins / 60);
  const m = Math.floor((mins % 60) / 10) * 10;
  const period = t < 0.21 || t >= 0.87 ? 'Night' : t < 0.3 ? 'Dawn' : t < 0.5 ? 'Morning' : t < 0.7 ? 'Afternoon' : t < 0.8 ? 'Evening' : 'Dusk';
  return { clock: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, period };
}

export function settlerInfo(sim: Simulation, s: Settler): SettlerInfo {
  const home = s.homeId !== null ? sim.buildings.get(s.homeId) : undefined;
  const idle = (!s.task || s.task.kind === 'wander') && !!s.idleReason;
  const area = sim.area(s.areaId);
  const workplace = [...sim.buildings.values()].find((b) => b.workers.includes(s.id));
  let bedNote = '';
  if (!home) bedNote = 'No free bed anywhere — rests by the campfire. Build a house.';
  else if (!isPermanentHome(home)) bedNote = home.type === 'townHall' ? 'Sleeps in a Town Hall bunk until a house bed is free.' : 'Sleeps in a camp bedroll until a house bed is free.';
  return {
    id: s.id, name: s.name, appearance: s.appearance, ruler: !!s.ruler, job: s.job, task: describeTask(sim, s), idleReason: s.idleReason, idle,
    carrying: s.carrying ? { ...s.carrying } : null, hunger: Math.round(s.hunger), energy: Math.round(s.energy),
    home: home ? (isPermanentHome(home) ? `${BUILDINGS[home.type].name}` : home.type === 'townHall' ? 'Town Hall bunk' : 'Camp bedroll') : 'No bed',
    homeId: home?.id ?? null, bedNote,
    areaId: area?.id ?? null, areaName: area?.name ?? '',
    priorities: [...effectivePriorities(s)], customOrder: s.priorities !== null,
    workplace: workplace ? BUILDINGS[workplace.type].name : '',
    age: s.lifeStage === 'child' ? `Child · grows up in ${daysToAdult(s)} day${daysToAdult(s) === 1 ? '' : 's'}` : 'Adult',
    child: s.lifeStage === 'child',
    partner: partnerOf(sim, s),
  };
}

function partnerOf(sim: Simulation, s: Settler): string {
  const h = householdOf(sim, s);
  if (!h || s.lifeStage === 'child') return '';
  const other = h.adults.find((id) => id !== s.id);
  return other !== undefined ? sim.settler(other)?.name ?? '' : '';
}

function ticksLabel(ticks: number): string {
  const secs = Math.ceil(ticks / 10);
  if (secs < 60) return `${secs}s`;
  return `${Math.ceil(secs / 60)} min`;
}

/** Who a held bed is waiting for, in words. */
function heldFor(sim: Simulation, c: BedClaim): string {
  const id = c.owner.id;
  if (c.owner.kind === 'recruit') return `Held for ${sim.recruits.find((r) => r.id === id)?.name ?? 'a traveller'}, on the way`;
  const h = sim.households.find((x) => x.id === id);
  const names = h ? h.adults.map((a) => sim.settler(a)?.name ?? '?').join(' and ') : 'a household';
  return `Held for ${names}'s expected child`;
}

export function buildingInfo(sim: Simulation, list: Building[]): BuildingInfo | null {
  if (list.length === 0) return null;
  const b = list[0];
  const def = BUILDINGS[b.type];
  const work = workOf(b);
  const info: BuildingInfo = {
    ids: list.map((x) => x.id), type: b.type, name: list.length > 1 ? `${list.length} ${def.name}s` : def.name,
    description: def.description, built: b.built,
    progress: work > 0 ? Math.min(1, b.progress / work) : 1,
    materials: invEntries(costOf(b)).map(([res, need]) => ({ res, need, have: Math.min(need, b.delivered[res] ?? 0), incoming: b.incoming[res] ?? 0 })),
    status: '', canRemove: b.type !== 'camp' && !(b.built && def.permanent), permanent: !!def.permanent,
  };
  if (def.span) info.span = { length: Math.max(b.w, b.h) };
  if (def.levels && list.length === 1) {
    const next = nextLevel(b);
    const up = b.upgrade ? def.levels[b.upgrade.to - 1] : null;
    info.name = levelName(b);
    info.level = {
      level: levelOf(b), max: def.levels.length, name: levelName(b),
      next: next ? { name: next.name, perks: next.perks, cost: next.cost, time: gameTime(next.time), blocked: b.upgrade ? null : upgradeProblem(sim, b) } : null,
      upgrading: b.upgrade && up ? { progress: Math.min(1, b.upgrade.progress / Math.max(1, up.time)), to: up.name } : null,
    };
  }
  if (!b.built && sim.unreachableForAll(`b${b.id}`)) {
    info.status = 'Settlers can’t reach this site — clear a way to it or build a bridge';
  } else if (!b.built) {
    const missing = info.materials.find((m) => m.have < m.need);
    if (missing) {
      const stock = sim.storedTotal(missing.res);
      const left = missing.need - missing.have - missing.incoming;
      info.status = stock > 0 || missing.incoming > 0
        ? `Haulers are bringing ${missing.res}${left > stock ? ` — ${left - stock} more needed than is in storage` : ''}`
        : `Waiting for ${missing.need - missing.have} ${missing.res} — none in storage`;
    } else info.status = 'Materials ready — builders at work';
  }
  if (def.storage && b.built) {
    info.storage = { entries: invEntries(b.inventory), used: sim.storageUsed(b), capacity: sim.storageCapacity(b) };
  }
  if (def.housing && b.built) {
    info.residents = {
      people: sim.settlers.filter((s) => s.homeId === b.id).map((s) => ({ id: s.id, name: s.name, asleep: s.insideId === b.id || (s.task?.kind === 'sleep' && s.task.stage === 'sleep') })),
      capacity: bedsOf(b),
      temporary: !!def.temporaryBeds,
      held: sim.bedClaims.filter((c) => c.homeId === b.id).map((c) => heldFor(sim, c)),
    };
  }
  if (def.lodging && b.built) info.inn = innInfo(sim, b);
  if (def.pen && b.built) {
    const sp = SPECIES[def.pen.species];
    info.pen = {
      species: sp.plural, count: penAnimals(sim, b).length, capacity: penCapacity(b), status: penStatus(sim, b),
      ready: Math.floor(b.pen?.ready ?? 0), product: def.pen.product ? RESOURCES[def.pen.product.res].name : null,
    };
    info.status = info.pen.status;
  }
  if (def.hunting && b.built) {
    const prey = preyNear(sim, b);
    const kinds = [...new Set(prey.map((a) => SPECIES[a.species].plural))];
    info.hunting = { prey: prey.length, radius: huntRadiusOf(b), kinds: kinds.join(', ') || 'none' };
    info.status = prey.length ? `${prey.length} game animals within ${huntRadiusOf(b)} tiles: ${kinds.join(', ')}` : 'No game nearby — wild animals roam back in time';
  }
  if (def.training && b.built) info.training = trainingInfo(sim, b);
  if (def.extraction && b.built) {
    const d = mineDeposit(sim, b);
    const next = b.mine && b.mine.level < 3 ? MINE_UPGRADES[(b.mine.level + 1) as 2 | 3] : null;
    info.extraction = {
      status: extractionStatus(sim, b),
      level: b.mine?.level ?? null,
      maxLevel: 3,
      upgrade: next ? formatInv(next) : null,
      deposit: d ? `${MINERALS[d.mineral].name}: ${d.remaining}/${d.initial} left · ${MINE_YIELD[b.mine!.level]} per trip` : b.quarry ? `Pit stage ${quarryStage(b) + 1}/4 · ${b.quarry.extracted} stone cut` : null,
    };
    info.status = info.extraction.status;
    info.workers = { people: b.workers.map((id) => ({ id, name: sim.settler(id)?.name ?? '?' })), max: maxWorkers(b) };
  }
  if (b.type === 'orchard') {
    info.orchard = orchardStatus(sim, b);
    if (b.built) info.status = info.orchard;
  }
  if (b.field) {
    const f = b.field;
    const crop = f.crop ? CROPS[f.crop] : null;
    const stage = fieldStage(f);
    const fert = TERRAIN[sim.world.terrain(b.x, b.y)].fertility;
    const left = crop && f.state === 'growing' ? (crop.growTicks - f.growth) / Math.max(0.01, fert * seasonalGrowth(sim, f.crop!)) : 0;
    info.field = {
      crop: f.crop,
      state: f.state === 'wild' ? 'Waiting to be tilled' : f.state === 'tilled' ? (f.crop ? 'Tilled, ready for seeds' : 'Tilled — choose a crop') : f.state === 'growing' ? 'Growing' : 'Ripe — ready to harvest',
      stage: Math.max(0, stage) + (f.state === 'growing' || f.state === 'ripe' ? 1 : 0),
      stages: crop?.stages ?? 4,
      growth: crop ? Math.min(1, f.growth / crop.growTicks) : 0,
      moisture: f.moisture,
      ripeIn: f.state === 'growing' && seasonOf(sim).id === 'winter' ? 'Resting until spring; crops survive' : f.state === 'growing' ? `about ${ticksLabel(left)}${f.moisture < 0.12 ? ' (dry: slower)' : ''}` : '',
    };
    info.status = `${Math.round(fert * 100)}% fertile soil`;
  }
  if (b.workshop) {
    const ws = b.workshop;
    info.workshop = {
      recipe: ws.recipe, recipes: [...(def.recipes ?? [])], status: ws.status, paused: ws.paused,
      buffer: invEntries(b.delivered), progress: ws.recipe ? Math.min(1, ws.progress / RECIPES[ws.recipe].work) : 0,
    };
    info.workers = { people: b.workers.map((id) => ({ id, name: sim.settler(id)?.name ?? '?' })), max: maxWorkers(b) };
    info.status = ws.status;
  }
  if ((def.pen || def.hunting) && b.built) info.workers = { people: b.workers.map((id) => ({ id, name: sim.settler(id)?.name ?? '?' })), max: maxWorkers(b) };
  return info;
}

/** Plain-language state of a work area, including why its workers might be idle. */
export function areaInfo(sim: Simulation): AreaInfo[] {
  return sim.workAreas.map((a) => {
    const workers = sim.settlers.filter((s) => s.areaId === a.id).map((s) => ({ id: s.id, name: s.name }));
    let count = 0;
    let explored = 0;
    for (let y = a.y0; y <= a.y1; y++) {
      for (let x = a.x0; x <= a.x1; x++) {
        if (!sim.world.explored(x, y)) continue;
        explored++;
        if (a.kind === 'wood' || a.kind === 'stone' || a.kind === 'forage') {
          const d = OBJECTS[sim.world.obj(x, y)];
          if (d.resource === (a.kind === 'forage' ? 'food' : a.kind) && sim.world.amount(x, y) > 0) count++;
        }
      }
    }
    let status = '';
    if (explored === 0) status = 'Unexplored — send someone to look';
    else if (a.kind === 'wood') status = count ? `${count} tree${count === 1 ? '' : 's'} to chop · replanted as they fall` : 'No trees left — the saplings grow back within a day';
    else if (a.kind === 'forage') status = count ? `${count} berry bush${count === 1 ? '' : 'es'} to pick` : 'No berries now — the bushes fruit again';
    else if (a.kind === 'hunt') {
      const game = sim.animals.filter((an) => an.penId === null && SPECIES[an.species].hunt && an.x >= a.x0 && an.x <= a.x1 + 1 && an.y >= a.y0 && an.y <= a.y1 + 1).length;
      status = game ? `${game} game animal${game === 1 ? '' : 's'} inside` : 'No game inside right now — animals roam back';
    }
    else if (a.kind === 'stone') status = count ? `${count} rock${count === 1 ? '' : 's'} to mine` : 'No rocks left — redraw it somewhere stony';
    else if (a.kind === 'farm') {
      const fields = [...sim.buildings.values()].filter((b) => b.field && b.x >= a.x0 && b.x <= a.x1 && b.y >= a.y0 && b.y <= a.y1);
      status = fields.length ? `${fields.length} field${fields.length === 1 ? '' : 's'} (${fields.filter((f) => f.field!.state === 'ripe').length} ripe)` : a.crop ? 'Laying out fields…' : 'No fields inside — choose a crop and it lays them out';
    } else {
      const sites = [...sim.buildings.values()].filter((b) => !b.built && !b.field && b.x <= a.x1 && b.x + b.w - 1 >= a.x0 && b.y <= a.y1 && b.y + b.h - 1 >= a.y0);
      status = sites.length ? `${sites.length} site${sites.length === 1 ? '' : 's'} to build` : 'No construction inside';
    }
    if (workers.length === 0) status += a.wanted ? ' · looking for free settlers' : ' · nobody assigned';
    return {
      id: a.id, name: a.name, kind: a.kind, kindName: AREA_LABELS[a.kind].name, does: AREA_LABELS[a.kind].does,
      workers, max: AREA_MAX_WORKERS, size: `${a.x1 - a.x0 + 1}×${a.y1 - a.y0 + 1}`, status,
      wanted: a.wanted ?? null, crop: a.crop ?? null,
    };
  });
}

export function celebrationInfo(id: MilestoneId): UiSnapshot['celebration'] {
  const def = MILESTONES[id];
  const next = Object.values(MILESTONES).filter((m) => m.tier > def.tier).slice(0, 2);
  return {
    id, name: def.name, unlocks: [...def.unlocks],
    next: next.map((m) => ({ name: m.name, description: m.description, future: !!m.future })),
  };
}

export function hoverText(sim: Simulation, wx: number, wy: number, claimMode = false): string | null {
  const x = Math.floor(wx / TILE);
  const y = Math.floor(wy / TILE);
  if (claimMode) {
    const sec = sectorOf(x, y);
    const p = claimPreview(sim, sec);
    const o = ownerOf(sim, sec);
    const owner = o ? kingdomById(sim, o.legalOwner)?.name ?? 'another kingdom' : 'nobody';
    return `Sector ${sec.x},${sec.y} · held by ${owner}${o?.protectedHomeland ? ' (protected homeland)' : ''} · ${p.supplied ? 'supplied' : 'not supplied'} · ${p.problem ?? `claim for ${p.cost} coins`}`;
  }
  if (!sim.world.explored(x, y)) return 'Unexplored — send a settler to look';
  // Animals under the pointer (they are small: within half a tile or so).
  const fx = wx / TILE;
  const fy = wy / TILE;
  const a = sim.animals.find((an) => Math.abs(an.x - fx) < 0.7 && an.y - fy > -0.9 && an.y - fy < 0.4);
  if (a) {
    const sp = SPECIES[a.species];
    return `${sp.name} · ${a.penId !== null ? 'livestock' : sp.hunt ? 'wild game' : 'wild'} · ${sp.note}`;
  }
  const known = surveyedCell(sim, x, y);
  const geo = known ? ` · surveyed: ${describeCell(known)}` : '';
  const b = sim.buildingAt(x, y);
  if (b) {
    const def = BUILDINGS[b.type];
    if (b.field) {
      const f = b.field;
      return `Field${f.crop ? ` · ${CROPS[f.crop].name}` : ''} · ${f.state}`;
    }
    return (b.built ? def.name : `${def.name} (under construction)`) + geo;
  }
  const o = sim.world.obj(x, y);
  const od = OBJECTS[o];
  const terrain = TERRAIN[sim.world.terrain(x, y)].name;
  if (od.resource) return `${od.name} · ${sim.world.amount(x, y)} ${od.resource} · ${terrain}${sim.designations.has(tileKey(x, y)) ? ' · marked' : ''}${geo}`;
  if (o !== 0) return `${od.name} · ${terrain}${geo}`;
  return terrain + geo;
}

export function unlockedSets(sim: Simulation) {
  const buildings: BuildingId[] = [];
  const locked: { id: BuildingId; at: string }[] = [];
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    if (!def.buildable) continue;
    if (isUnlocked(sim, def.unlock)) buildings.push(id);
    else locked.push({ id, at: unlockName(def.unlock) });
  }
  return { buildings, locked, crops: CROP_IDS.filter((c) => cropUnlocked(sim, c)) };
}

export function milestoneInfo(sim: Simulation): UiSnapshot['milestone'] {
  const cur = MILESTONES[currentMilestone(sim)];
  const nextId = nextMilestone(sim);
  const next = nextId ? MILESTONES[nextId] : null;
  return {
    current: cur.name,
    tier: cur.tier,
    next: next
      ? { name: next.name, description: next.description, unlocks: [...next.unlocks], reqs: next.requirements.map((r) => requirementProgress(sim, r)), future: !!next.future }
      : null,
  };
}

export function housingOf(sim: Simulation): number {
  return housingCapacity(sim);
}
