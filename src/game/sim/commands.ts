import { DAY_TICKS, tileKey } from '../core/constants';
import { BUILDINGS, isBuildingId, type BuildingId } from '../data/buildings';
import { isCropId, type CropId } from '../data/crops';
import { isJobId, JOBS, type JobId } from '../data/jobs';
import { isRecipeId, type RecipeId } from '../data/recipes';
import { OBJECTS } from '../world/tiles';
import {
  checkPlacement, cropUnlocked, materialsComplete, placeBuilding, removeBuilding, setFieldCrop, shortfall,
} from './buildings';
import { fieldAction } from './farming';
import { abortTask, findHaulFor } from './settlers';
import type { Simulation } from './Simulation';
import type { CommandResult, Settler } from './types';

export type Command =
  | { type: 'move'; ids: number[]; x: number; y: number }
  | { type: 'gather'; ids: number[]; x: number; y: number }
  | { type: 'work'; ids: number[]; buildingId: number }
  | { type: 'place'; building: BuildingId; x: number; y: number; crop?: CropId | null }
  | { type: 'placeArea'; building: BuildingId; x0: number; y0: number; x1: number; y1: number; crop?: CropId | null }
  | { type: 'remove'; buildingId: number }
  | { type: 'setJob'; ids: number[]; job: JobId }
  | { type: 'setCrop'; buildingIds: number[]; crop: CropId | null }
  | { type: 'designate'; x0: number; y0: number; x1: number; y1: number; on: boolean }
  | { type: 'setRecipe'; buildingId: number; recipe: RecipeId | null }
  | { type: 'toggleWorkshop'; buildingId: number };

const MAX_AREA = 40 * 40;

function ok(message?: string): CommandResult {
  return { ok: true, message };
}
function err(message: string): CommandResult {
  return { ok: false, message };
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && Math.abs(n) < 1_000_000;
}

function pickSettlers(sim: Simulation, ids: unknown): Settler[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => sim.settler(id as number)).filter((s): s is Settler => !!s);
}

/** Interrupts whatever a settler was doing for a direct order. */
function takeOrder(sim: Simulation, s: Settler): void {
  abortTask(sim, s);
  s.focus = null;
  s.idleReason = '';
}

/** Nearby walkable tiles in a spiral, so a group spreads out instead of stacking. */
function spreadTargets(sim: Simulation, x: number, y: number, count: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r <= 4 && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy++) {
      for (let dx = -r; dx <= r && out.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (sim.walkable(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
      }
    }
  }
  return out;
}

function normRect(c: { x0: number; y0: number; x1: number; y1: number }) {
  return {
    x0: Math.min(c.x0, c.x1), y0: Math.min(c.y0, c.y1),
    x1: Math.max(c.x0, c.x1), y1: Math.max(c.y0, c.y1),
  };
}

export function applyCommand(sim: Simulation, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'move': {
      if (!isInt(cmd.x) || !isInt(cmd.y)) return err('Invalid location');
      const list = pickSettlers(sim, cmd.ids);
      if (list.length === 0) return err('Select a settler first');
      const targets = spreadTargets(sim, cmd.x, cmd.y, list.length);
      if (targets.length === 0) return err("Can't walk there");
      list.forEach((s, i) => {
        const t = targets[i % targets.length];
        takeOrder(sim, s);
        s.task = { kind: 'move', x: t.x, y: t.y };
      });
      return ok();
    }

    case 'gather': {
      if (!isInt(cmd.x) || !isInt(cmd.y)) return err('Invalid location');
      const list = pickSettlers(sim, cmd.ids);
      if (list.length === 0) return err('Select a settler first');
      const def = OBJECTS[sim.world.obj(cmd.x, cmd.y)];
      if (!def.resource || sim.world.amount(cmd.x, cmd.y) <= 0) return err('Nothing to gather there');
      const k = tileKey(cmd.x, cmd.y);
      let first = true;
      for (const s of list) {
        takeOrder(sim, s);
        s.focus = { kind: 'gather', res: def.resource, x: cmd.x, y: cmd.y, until: sim.tick + DAY_TICKS * 2 };
        // The first free settler takes the clicked object; the rest fan out to its neighbours.
        if (first && !s.carrying && sim.reserve(`obj:${k}`, s.id)) {
          s.task = { kind: 'gather', x: cmd.x, y: cmd.y, stage: 'walk', timer: 0 };
          first = false;
        }
      }
      return ok();
    }

    case 'work': {
      const list = pickSettlers(sim, cmd.ids);
      const b = sim.buildings.get(cmd.buildingId);
      if (list.length === 0) return err('Select a settler first');
      if (!b) return err('That building is gone');
      const def = BUILDINGS[b.type];
      if (!b.built) {
        let assigned = 0;
        let reason: string | null = null;
        for (const s of list) {
          if (materialsComplete(b)) {
            const max = def.maxBuilders ?? 2;
            for (let i = 0; i < max; i++) {
              if (!sim.isReserved(`build:${b.id}:${i}`, s.id)) {
                takeOrder(sim, s);
                sim.reserve(`build:${b.id}:${i}`, s.id);
                s.task = { kind: 'build', site: b.id, slot: i, stage: 'walk' };
                assigned++;
                break;
              }
            }
          } else {
            takeOrder(sim, s);
            if (s.carrying) continue;
            const t = findHaulFor(sim, s, b);
            if (t && typeof t === 'object') {
              s.task = t;
              assigned++;
            } else if (typeof t === 'string') reason ??= t;
          }
        }
        if (assigned === 0) return err(reason ?? 'Enough hands are already on this site');
        return ok();
      }
      if (b.field) {
        const action = fieldAction(sim, b.field);
        if (!action) return err(b.field.crop ? 'This field needs nothing right now' : 'Choose a crop for this field first');
        const s = list.find((x) => !x.carrying) ?? list[0];
        if (sim.isReserved(`field:${b.id}`, s.id)) return err('Someone is already tending this field');
        takeOrder(sim, s);
        sim.reserve(`field:${b.id}`, s.id);
        s.task = { kind: 'farm', field: b.id, action, stage: 'walk', timer: 0 };
        return ok();
      }
      if (b.workshop) {
        for (const s of list) {
          takeOrder(sim, s);
          s.job = 'crafter';
        }
        return ok(`${list.map((s) => s.name).join(', ')} will now work as ${list.length > 1 ? 'crafters' : 'a crafter'}.`);
      }
      if (def.storage) {
        for (const s of list) {
          takeOrder(sim, s);
          s.task = s.carrying ? { kind: 'deliver', target: b.id } : { kind: 'move', x: b.x + Math.floor(b.w / 2), y: b.y + b.h };
        }
        return ok();
      }
      if (b.type === 'house') {
        const cap = def.housing ?? 0;
        const residents = sim.settlers.filter((s) => s.homeId === b.id);
        let moved = 0;
        for (const s of list) {
          if (s.homeId === b.id) continue;
          if (residents.length + moved >= cap) break;
          s.homeId = b.id;
          moved++;
        }
        return moved > 0 ? ok(`${moved} settler${moved > 1 ? 's' : ''} moved in.`) : err('This house is full');
      }
      for (const s of list) {
        takeOrder(sim, s);
        s.task = { kind: 'move', x: b.x, y: b.y + b.h };
      }
      return ok();
    }

    case 'place': {
      if (!isBuildingId(cmd.building) || !isInt(cmd.x) || !isInt(cmd.y)) return err('Invalid building');
      const check = checkPlacement(sim, cmd.building, cmd.x, cmd.y);
      if (!check.ok) return err(check.reason ?? "Can't build here");
      const crop = cmd.crop === undefined ? undefined : isCropId(cmd.crop) ? cmd.crop : null;
      placeBuilding(sim, cmd.building, cmd.x, cmd.y, crop);
      sim.emit({ type: 'sfx', name: 'place', x: cmd.x, y: cmd.y });
      sim.emit({ type: 'important' });
      const short = shortfall(sim, cmd.building);
      return ok(short ? `Builders will wait for ${short}.` : undefined);
    }

    case 'placeArea': {
      if (!isBuildingId(cmd.building) || ![cmd.x0, cmd.y0, cmd.x1, cmd.y1].every(isInt)) return err('Invalid area');
      const def = BUILDINGS[cmd.building];
      if (!def.paint) return err('This building is placed one at a time');
      const r = normRect(cmd);
      if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_AREA) return err('That area is too large');
      const crop = cmd.crop === undefined ? undefined : isCropId(cmd.crop) ? cmd.crop : null;
      let placed = 0;
      let reason: string | undefined;
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const check = checkPlacement(sim, cmd.building, x, y);
          if (check.ok) {
            placeBuilding(sim, cmd.building, x, y, crop);
            placed++;
          } else reason ??= check.reason;
        }
      }
      if (placed === 0) return err(reason ?? "Can't build here");
      sim.emit({ type: 'sfx', name: 'place', x: r.x0, y: r.y0 });
      sim.emit({ type: 'important' });
      const short = shortfall(sim, cmd.building, placed);
      const parts = [`Placed ${placed} ${def.name.toLowerCase()}${placed > 1 ? 's' : ''}.`];
      if (short) parts.push(`Builders will wait for ${short}.`);
      return ok(parts.join(' '));
    }

    case 'remove': {
      const b = sim.buildings.get(cmd.buildingId);
      if (!b) return err('Nothing to remove');
      if (b.type === 'camp') return err('The camp is the heart of the valley and stays put');
      return ok(removeBuilding(sim, b));
    }

    case 'setJob': {
      if (!isJobId(cmd.job)) return err('Unknown job');
      const list = pickSettlers(sim, cmd.ids);
      for (const s of list) {
        if (s.job === cmd.job) continue;
        s.job = cmd.job;
        if (s.task && s.task.kind !== 'sleep' && s.task.kind !== 'eat' && s.task.kind !== 'move') abortTask(sim, s);
      }
      return ok(list.length === 1 ? `${list[0].name} is now a ${JOBS[cmd.job].name}.` : undefined);
    }

    case 'setCrop': {
      if (cmd.crop !== null && !isCropId(cmd.crop)) return err('Unknown crop');
      if (cmd.crop && !cropUnlocked(sim, cmd.crop)) return err('That crop is not unlocked yet');
      for (const id of cmd.buildingIds) {
        const b = sim.buildings.get(id);
        if (b?.field) setFieldCrop(b, cmd.crop);
      }
      return ok();
    }

    case 'designate': {
      if (![cmd.x0, cmd.y0, cmd.x1, cmd.y1].every(isInt)) return err('Invalid area');
      const r = normRect(cmd);
      if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_AREA * 2) return err('That area is too large');
      let n = 0;
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const k = tileKey(x, y);
          if (!cmd.on) {
            if (sim.designations.delete(k)) n++;
            continue;
          }
          if (!sim.world.explored(x, y)) continue;
          if (OBJECTS[sim.world.obj(x, y)].resource && sim.world.amount(x, y) > 0 && !sim.designations.has(k)) {
            sim.designations.add(k);
            n++;
          }
        }
      }
      if (n === 0) return err(cmd.on ? 'No trees, rocks or bushes in that area' : 'Nothing was marked there');
      return ok(cmd.on ? `Marked ${n} for harvest.` : `Unmarked ${n}.`);
    }

    case 'setRecipe': {
      const b = sim.buildings.get(cmd.buildingId);
      if (!b?.workshop) return err('Not a workshop');
      if (cmd.recipe !== null && (!isRecipeId(cmd.recipe) || !BUILDINGS[b.type].recipes?.includes(cmd.recipe))) return err('Unknown recipe');
      b.workshop.recipe = cmd.recipe;
      b.workshop.progress = 0;
      return ok();
    }

    case 'toggleWorkshop': {
      const b = sim.buildings.get(cmd.buildingId);
      if (!b?.workshop) return err('Not a workshop');
      b.workshop.paused = !b.workshop.paused;
      return ok(b.workshop.paused ? 'Workshop paused.' : 'Workshop resumed.');
    }
  }
  return err('Unknown command');
}

