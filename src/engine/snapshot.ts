import { TILE, tileKey } from '../game/core/constants';
import { BUILDINGS, BUILDING_IDS, type BuildingId } from '../game/data/buildings';
import { CROPS, CROP_IDS, type CropId } from '../game/data/crops';
import type { JobId } from '../game/data/jobs';
import { MILESTONES } from '../game/data/progression';
import { RECIPES, type RecipeId } from '../game/data/recipes';
import { RESOURCE_IDS, type ResourceId } from '../game/data/resources';
import { cropUnlocked, housingCapacity, isUnlocked, residentsOf, unlockName } from '../game/sim/buildings';
import { fieldStage } from '../game/sim/farming';
import { invEntries } from '../game/sim/inventory';
import { currentMilestone, nextMilestone, requirementProgress, type RequirementProgress } from '../game/sim/progression';
import { describeTask } from '../game/sim/settlers';
import type { Simulation } from '../game/sim/Simulation';
import type { Building, Settler } from '../game/sim/types';
import { OBJECTS, TERRAIN } from '../game/world/tiles';

export type Mode =
  | { kind: 'select' }
  | { kind: 'place'; building: BuildingId; crop: CropId | null }
  | { kind: 'mark' }
  | { kind: 'unmark' };

export interface SettlerInfo {
  id: number;
  name: string;
  job: JobId;
  task: string;
  idleReason: string;
  idle: boolean;
  carrying: { res: ResourceId; amount: number } | null;
  hunger: number;
  energy: number;
  home: string;
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
  storage?: { entries: [ResourceId, number][]; used: number; capacity: number };
  residents?: { names: string[]; capacity: number };
  field?: { crop: CropId | null; state: string; stage: number; stages: number; growth: number; moisture: number; ripeIn: string };
  workshop?: { recipe: RecipeId | null; recipes: RecipeId[]; status: string; paused: boolean; buffer: [ResourceId, number][]; progress: number };
  canRemove: boolean;
}

export interface Toast {
  id: number;
  text: string;
  level: 'info' | 'good' | 'warn' | 'bad';
  at: number;
}

export interface UiSnapshot {
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
}

export function emptySnapshot(): UiSnapshot {
  const resources = {} as Record<ResourceId, number>;
  for (const r of RESOURCE_IDS) resources[r] = 0;
  return {
    running: false, paused: false, speed: 1, day: 1, clock: '', period: '', isNight: false, raining: false,
    resources, storage: { used: 0, capacity: 0 }, population: 0, housing: 0, populationStatus: '', wellEquipped: false,
    milestone: { current: 'Camp', tier: 0, next: null }, mode: { kind: 'select' }, selection: [], building: null,
    settlers: [], idleCount: 0, toasts: [], tutorial: null, tutorialOutro: false, hover: null, saveStatus: '',
    unlocked: { buildings: [], locked: [], crops: [] }, worldName: '', explored: 0,
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
  return {
    id: s.id, name: s.name, job: s.job, task: describeTask(sim, s), idleReason: s.idleReason, idle,
    carrying: s.carrying ? { ...s.carrying } : null, hunger: Math.round(s.hunger), energy: Math.round(s.energy),
    home: home ? `${BUILDINGS[home.type].name}` : 'Camp tents',
  };
}

function ticksLabel(ticks: number): string {
  const secs = Math.ceil(ticks / 10);
  if (secs < 60) return `${secs}s`;
  return `${Math.ceil(secs / 60)} min`;
}

export function buildingInfo(sim: Simulation, list: Building[]): BuildingInfo | null {
  if (list.length === 0) return null;
  const b = list[0];
  const def = BUILDINGS[b.type];
  const info: BuildingInfo = {
    ids: list.map((x) => x.id), type: b.type, name: list.length > 1 ? `${list.length} ${def.name}s` : def.name,
    description: def.description, built: b.built,
    progress: def.work > 0 ? Math.min(1, b.progress / def.work) : 1,
    materials: invEntries(def.cost).map(([res, need]) => ({ res, need, have: Math.min(need, b.delivered[res] ?? 0), incoming: b.incoming[res] ?? 0 })),
    status: '', canRemove: b.type !== 'camp',
  };
  if (!b.built) {
    const missing = info.materials.find((m) => m.have < m.need);
    if (missing) {
      const stock = sim.storedTotal(missing.res);
      info.status = stock > 0 || missing.incoming > 0 ? `Haulers are bringing ${missing.res}` : `Waiting for ${missing.res} — none in storage`;
    } else info.status = 'Materials ready — builders at work';
  }
  if (def.storage && b.built) {
    info.storage = { entries: invEntries(b.inventory), used: sim.storageUsed(b), capacity: sim.storageCapacity(b) };
  }
  if (def.housing && b.built) {
    info.residents = { names: b.type === 'camp' ? sim.settlers.filter((s) => s.homeId === null).map((s) => s.name) : residentsOf(sim, b), capacity: def.housing };
  }
  if (b.field) {
    const f = b.field;
    const crop = f.crop ? CROPS[f.crop] : null;
    const stage = fieldStage(f);
    const fert = TERRAIN[sim.world.terrain(b.x, b.y)].fertility;
    const left = crop && f.state === 'growing' ? (crop.growTicks - f.growth) / Math.max(0.1, fert) : 0;
    info.field = {
      crop: f.crop,
      state: f.state === 'wild' ? 'Waiting to be tilled' : f.state === 'tilled' ? (f.crop ? 'Tilled, ready for seeds' : 'Tilled — choose a crop') : f.state === 'growing' ? 'Growing' : 'Ripe — ready to harvest',
      stage: Math.max(0, stage) + (f.state === 'growing' || f.state === 'ripe' ? 1 : 0),
      stages: crop?.stages ?? 4,
      growth: crop ? Math.min(1, f.growth / crop.growTicks) : 0,
      moisture: f.moisture,
      ripeIn: f.state === 'growing' ? `about ${ticksLabel(left)}${f.moisture < 0.12 ? ' (dry: slower)' : ''}` : '',
    };
    info.status = `${Math.round(fert * 100)}% fertile soil`;
  }
  if (b.workshop) {
    const ws = b.workshop;
    info.workshop = {
      recipe: ws.recipe, recipes: [...(def.recipes ?? [])], status: ws.status, paused: ws.paused,
      buffer: invEntries(b.delivered), progress: ws.recipe ? Math.min(1, ws.progress / RECIPES[ws.recipe].work) : 0,
    };
    info.status = ws.status;
  }
  return info;
}

export function hoverText(sim: Simulation, wx: number, wy: number): string | null {
  const x = Math.floor(wx / TILE);
  const y = Math.floor(wy / TILE);
  if (!sim.world.explored(x, y)) return 'Unexplored — send a settler to look';
  const b = sim.buildingAt(x, y);
  if (b) {
    const def = BUILDINGS[b.type];
    if (b.field) {
      const f = b.field;
      return `Field${f.crop ? ` · ${CROPS[f.crop].name}` : ''} · ${f.state}`;
    }
    return b.built ? def.name : `${def.name} (under construction)`;
  }
  const o = sim.world.obj(x, y);
  const od = OBJECTS[o];
  const terrain = TERRAIN[sim.world.terrain(x, y)].name;
  if (od.resource) return `${od.name} · ${sim.world.amount(x, y)} ${od.resource} · ${terrain}${sim.designations.has(tileKey(x, y)) ? ' · marked' : ''}`;
  if (o !== 0) return `${od.name} · ${terrain}`;
  return terrain;
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
