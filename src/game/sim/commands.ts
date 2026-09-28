import { DAY_TICKS, tileKey } from '../core/constants';
import { BUILDINGS, isBuildingId, type BuildingId } from '../data/buildings';
import { isCropId, type CropId } from '../data/crops';
import { isJobId, JOBS, type JobId, type WorkKind } from '../data/jobs';
import { isResourceId, type Inventory, type ResourceId } from '../data/resources';
import { isRecipeId, type RecipeId } from '../data/recipes';
import { OBJECTS } from '../world/tiles';
import {
  assignHomes, bedsOf, checkPlacement, checkSpan, cropUnlocked, materialsComplete, maxWorkers, placeBuilding, removeBuilding, setFieldCrop, shortfall,
} from './buildings';
import { cleanPriorities } from './priorities';
import { acceptRecruit, barter, cancelRecruit } from './travelers';
import { cancelRoute, createRoute, setRouteTarget } from './logistics';
import { appointCouncil, coronate, setPolicy } from './kingdoms';
import { activateFrontier, claimFrontier, setConflictMode } from './territory';
import { cancelTreaty, proposeTreaty, respondToIncident, respondToOffer } from './diplomacy';
import { respondToWarning } from './concern';
import { acceptCampaignOffer, cancelWarPlan, counterCampaignOffer, createWarPlan, mobilizeCampaign, requestCampaignSupport, type SupportRequest } from './campaigns';
import { surveyDeposit, upgradeMine } from './mining';
import { adoptDeliberateGrowth, cancelChildRequest, formHousehold, isChild, requestChild } from './households';
import { fieldAction } from './farming';
import { abortTask, findHaulFor } from './settlers';
import type { Simulation } from './Simulation';
import type { AreaKind, CommandResult, Settler } from './types';

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
  | { type: 'toggleWorkshop'; buildingId: number }
  | { type: 'placeSpan'; building: BuildingId; x0: number; y0: number; x1: number; y1: number }
  | { type: 'createArea'; kind: AreaKind; x0: number; y0: number; x1: number; y1: number; name?: string }
  | { type: 'updateArea'; areaId: number; name?: string; kind?: AreaKind; rect?: { x0: number; y0: number; x1: number; y1: number } }
  | { type: 'deleteArea'; areaId: number }
  | { type: 'assignArea'; ids: number[]; areaId: number | null }
  | { type: 'setPriorities'; ids: number[]; priorities: WorkKind[] | null }
  | { type: 'assignWorker'; buildingId: number; ids: number[] }
  | { type: 'unassignWorker'; buildingId: number; settlerId: number }
  | { type: 'assignSettlement'; ids: number[]; settlementId: number }
  | { type: 'renameSettlement'; settlementId: number; name: string }
  | { type: 'setWants'; buildingId: number; res: ResourceId; amount: number }
  | { type: 'formHousehold'; ids: number[] }
  | { type: 'requestChild'; householdId: number }
  | { type: 'cancelChildRequest'; householdId: number }
  | { type: 'adoptDeliberateGrowth' }
  | { type: 'acceptRecruit'; offerId: number; settlementId: number }
  | { type: 'cancelRecruit'; recruitId: number }
  | { type: 'surveyDeposit'; settlerId: number; x: number; y: number }
  | { type: 'upgradeMine'; buildingId: number }
  | { type: 'createRoute'; sourceId: number; destinationId: number; resource: ResourceId; target: number }
  | { type: 'setRouteTarget'; routeId: number; target: number }
  | { type: 'cancelRoute'; routeId: number }
  | { type: 'barter'; partyId: number; give: Inventory; take: Inventory; coins?: number }
  | { type: 'coronate'; rulerName: string; kingdomName: string; banner: { color: string; emblem: string } }
  | { type: 'setPolicy'; policy: string }
  | { type: 'appointCouncil'; post: string; settlerId: number | null }
  | { type: 'claimFrontier'; sector: { x: number; y: number } }
  | { type: 'setConflictMode'; mode: string }
  | { type: 'activateFrontier' }
  | { type: 'proposeTreaty'; kind: string; to: number; terms: { durationDays: number; payment?: number } }
  | { type: 'respondToOffer'; offerId: number; accept: boolean }
  | { type: 'cancelTreaty'; offerId: number }
  | { type: 'respondToIncident'; incidentId: number; response: string }
  | { type: 'respondToWarning'; warningId: number; action: string }
  | { type: 'createWarPlan'; target: number; objective: string }
  | { type: 'requestCampaignSupport'; planId: number; ally: number; terms: SupportRequest }
  | { type: 'counterCampaignOffer'; commitmentId: number; terms: SupportRequest }
  | { type: 'acceptCampaignOffer'; commitmentId: number }
  | { type: 'cancelWarPlan'; planId: number }
  | { type: 'mobilizeCampaign'; planId: number };

const MAX_AREA = 40 * 40;
/** Most settlers one work area can take. */
export const AREA_MAX_WORKERS = 12;
const AREA_KINDS: AreaKind[] = ['farm', 'wood', 'stone', 'build'];
export const AREA_LABELS: Record<AreaKind, { name: string; noun: string; does: string }> = {
  farm: { name: 'Farm area', noun: 'Farm', does: 'Till, plant, water and harvest the fields inside' },
  wood: { name: 'Woodlot', noun: 'Woodlot', does: 'Chop every tree inside (no harvest marks needed)' },
  stone: { name: 'Quarry', noun: 'Quarry', does: 'Mine every rock and boulder inside' },
  build: { name: 'Building area', noun: 'Works', does: 'Build and supply construction sites inside' },
};

/**
 * Stops work that came from an area or job the player just changed, so the
 * settler re-plans at once. Reservations are released by abortTask; goods in
 * hand are kept and delivered. Direct orders and needs are left alone.
 */
function replan(sim: Simulation, s: Settler): void {
  s.nextThink = 0;
  const k = s.task?.kind;
  if (k === 'gather' || k === 'farm' || k === 'build' || k === 'craft' || (k === 'haul' && s.task?.kind === 'haul' && s.task.stage === 'toSrc')) abortTask(sim, s);
}

function areaRectOk(sim: Simulation, r: { x0: number; y0: number; x1: number; y1: number }): string | null {
  if (![r.x0, r.y0, r.x1, r.y1].every(isInt)) return 'Invalid area';
  const w = Math.abs(r.x1 - r.x0) + 1;
  const h = Math.abs(r.y1 - r.y0) + 1;
  if (w * h > MAX_AREA) return 'That area is too large (40×40 tiles at most)';
  for (let y = Math.min(r.y0, r.y1); y <= Math.max(r.y0, r.y1); y++) for (let x = Math.min(r.x0, r.x1); x <= Math.max(r.x0, r.x1); x++) if (sim.world.explored(x, y)) return null;
  return 'Explore this area first';
}

function ok(message?: string): CommandResult {
  return { ok: true, message };
}
function err(message: string): CommandResult {
  return { ok: false, message };
}

export function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && Math.abs(n) < 1_000_000;
}

function pickSettlers(sim: Simulation, ids: unknown): Settler[] {
  if (!Array.isArray(ids)) return [];
  // Settlers away with a caravan can't take orders until they are back.
  return ids.map((id) => sim.settler(id as number)).filter((s): s is Settler => !!s && s.awayOn === null);
}

/**
 * Settlers who can take a work order: children are left out. Returns an error
 * message when the selection held only children.
 */
function pickWorkers(sim: Simulation, ids: unknown, what: string): Settler[] | string {
  const all = pickSettlers(sim, ids);
  if (all.length === 0) return 'Select a settler first';
  const list = all.filter((s) => !isChild(s));
  if (list.length > 0) return list;
  const who = all.length === 1 ? `${all[0].name} is a child` : 'These are children';
  return `${who} — children play near home and can't ${what} until they grow up`;
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
  const res = applyCommandInner(sim, cmd);
  if (res.ok && cmd.type !== 'move' && cmd.type !== 'gather') sim.wakeIdle();
  return res;
}

function applyCommandInner(sim: Simulation, cmd: Command): CommandResult {
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
      const list = pickWorkers(sim, cmd.ids, 'gather');
      if (typeof list === 'string') return err(list);
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
      const b = sim.buildings.get(cmd.buildingId);
      if (!b) return err('That building is gone');
      const def = BUILDINGS[b.type];
      // Anyone can move into a home; everything else is adult work.
      const picked = def.housing && b.built && !def.temporaryBeds ? pickSettlers(sim, cmd.ids) : pickWorkers(sim, cmd.ids, 'work');
      if (typeof picked === 'string') return err(picked);
      const list = picked;
      if (list.length === 0) return err('Select a settler first');
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
      if (b.workshop || def.extraction || def.depot) return applyCommand(sim, { type: 'assignWorker', buildingId: b.id, ids: list.map((s) => s.id) });
      if (def.storage) {
        for (const s of list) {
          takeOrder(sim, s);
          s.task = s.carrying ? { kind: 'deliver', target: b.id } : { kind: 'move', x: b.x + Math.floor(b.w / 2), y: b.y + b.h };
        }
        return ok();
      }
      if (def.housing && b.built && !def.temporaryBeds) {
        const cap = bedsOf(b);
        // Beds held for an expected child or a traveller are taken too.
        let residents = sim.settlers.filter((s) => s.homeId === b.id).length + sim.bedClaims.filter((c) => c.homeId === b.id).length;
        let moved = 0;
        for (const s of list) {
          if (s.homeId === b.id) continue;
          if (residents >= cap) break;
          s.homeId = b.id;
          residents++;
          moved++;
        }
        if (moved > 0) return ok(`${moved} settler${moved > 1 ? 's' : ''} moved in (${residents}/${cap} beds).`);
        return err(`This ${def.name.toLowerCase()} is full (${cap}/${cap} beds)`);
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
      if (b.built && BUILDINGS[b.type].permanent) return err(`The ${BUILDINGS[b.type].name.toLowerCase()} is permanent and can't be demolished`);
      return ok(removeBuilding(sim, b));
    }

    case 'setJob': {
      if (!isJobId(cmd.job)) return err('Unknown job');
      const list = pickWorkers(sim, cmd.ids, 'take a job');
      if (typeof list === 'string') return err(list);
      for (const s of list) {
        if (s.job === cmd.job && s.priorities === null) continue;
        s.job = cmd.job;
        // Choosing a job resets any custom work order to that job's default.
        s.priorities = null;
        replan(sim, s);
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

    case 'placeSpan': {
      if (!isBuildingId(cmd.building) || !BUILDINGS[cmd.building].span) return err('Invalid building');
      if (![cmd.x0, cmd.y0, cmd.x1, cmd.y1].every(isInt)) return err('Invalid location');
      const check = checkSpan(sim, cmd.building, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
      if (!check.ok) return err(check.reason ?? "Can't build here");
      const r = check.rect;
      const b = placeBuilding(sim, cmd.building, r.x, r.y, undefined, { w: r.w, h: r.h });
      sim.emit({ type: 'sfx', name: 'place', x: r.x, y: r.y });
      sim.emit({ type: 'important' });
      const short = shortfall(sim, cmd.building, 1, r);
      return { ok: true, id: b.id, message: `Stone bridge planned: ${Math.max(r.w, r.h)} tiles.${short ? ` Builders will wait for ${short}.` : ''}` };
    }

    case 'createArea': {
      if (!AREA_KINDS.includes(cmd.kind)) return err('Unknown kind of area');
      const bad = areaRectOk(sim, cmd);
      if (bad) return err(bad);
      const n = sim.workAreas.filter((a) => a.kind === cmd.kind).length + 1;
      const name = (typeof cmd.name === 'string' && cmd.name.trim().slice(0, 30)) || `${AREA_LABELS[cmd.kind].noun} ${n}`;
      const id = sim.allocId();
      sim.workAreas.push({
        id, name, kind: cmd.kind,
        x0: Math.min(cmd.x0, cmd.x1), y0: Math.min(cmd.y0, cmd.y1), x1: Math.max(cmd.x0, cmd.x1), y1: Math.max(cmd.y0, cmd.y1),
      });
      sim.emit({ type: 'important' });
      return { ok: true, id, message: `Created ${name}. Assign settlers to it from the Areas tab.` };
    }

    case 'updateArea': {
      const a = sim.area(cmd.areaId);
      if (!a) return err('That work area is gone');
      if (cmd.rect) {
        const bad = areaRectOk(sim, cmd.rect);
        if (bad) return err(bad);
        a.x0 = Math.min(cmd.rect.x0, cmd.rect.x1);
        a.y0 = Math.min(cmd.rect.y0, cmd.rect.y1);
        a.x1 = Math.max(cmd.rect.x0, cmd.rect.x1);
        a.y1 = Math.max(cmd.rect.y0, cmd.rect.y1);
      }
      if (cmd.kind && AREA_KINDS.includes(cmd.kind)) a.kind = cmd.kind;
      if (typeof cmd.name === 'string' && cmd.name.trim()) a.name = cmd.name.trim().slice(0, 30);
      for (const s of sim.settlers) if (s.areaId === a.id) replan(sim, s);
      return ok();
    }

    case 'deleteArea': {
      const a = sim.area(cmd.areaId);
      if (!a) return err('That work area is gone');
      sim.workAreas = sim.workAreas.filter((x) => x.id !== a.id);
      for (const s of sim.settlers) {
        if (s.areaId !== a.id) continue;
        s.areaId = null;
        replan(sim, s);
      }
      return ok(`Removed ${a.name}. Its settlers went back to their usual work.`);
    }

    case 'assignArea': {
      const list = pickWorkers(sim, cmd.ids, 'work in an area');
      if (typeof list === 'string') return err(list);
      if (cmd.areaId === null) {
        for (const s of list) {
          s.areaId = null;
          replan(sim, s);
        }
        return ok();
      }
      const a = sim.area(cmd.areaId);
      if (!a) return err('That work area is gone');
      let count = sim.settlers.filter((s) => s.areaId === a.id).length;
      let added = 0;
      for (const s of list) {
        if (s.areaId === a.id) continue;
        if (count >= AREA_MAX_WORKERS) break;
        s.areaId = a.id;
        replan(sim, s);
        count++;
        added++;
      }
      const skipped = list.filter((s) => s.areaId !== a.id).length;
      if (added === 0 && skipped > 0) return err(`${a.name} already has ${AREA_MAX_WORKERS}/${AREA_MAX_WORKERS} workers`);
      return ok(`${added} settler${added === 1 ? '' : 's'} now work in ${a.name} (${count}/${AREA_MAX_WORKERS}).${skipped ? ` ${skipped} didn't fit.` : ''}`);
    }

    case 'setPriorities': {
      const list = pickWorkers(sim, cmd.ids, 'follow a work order');
      if (typeof list === 'string') return err(list);
      const pr = cmd.priorities === null ? null : cleanPriorities(cmd.priorities);
      if (cmd.priorities !== null && pr === null) return err('Invalid work order');
      for (const s of list) {
        s.priorities = pr;
        replan(sim, s);
      }
      return ok();
    }

    case 'assignWorker': {
      const b = sim.buildings.get(cmd.buildingId);
      if (!b || !(b.workshop || BUILDINGS[b.type].extraction || BUILDINGS[b.type].depot) || !b.built) return err('Workers can only be assigned to finished workshops, mills, bakeries, quarries, mines, kilns, smelters, forges and caravan depots');
      const list = pickWorkers(sim, cmd.ids, 'work at a workshop');
      if (typeof list === 'string') return err(list);
      const max = maxWorkers(b);
      const name = BUILDINGS[b.type].name.toLowerCase();
      const added: string[] = [];
      for (const s of list) {
        if (b.workers.includes(s.id)) continue;
        if (b.workers.length >= max) break;
        for (const other of sim.buildings.values()) if (other !== b) other.workers = other.workers.filter((id) => id !== s.id);
        b.workers.push(s.id);
        takeOrder(sim, s);
        // Make sure crafting is in their work order, and first (teamsters keep their usual work between trips).
        if (BUILDINGS[b.type].depot) {
          // nothing to change
        } else if (s.priorities === null && s.job !== 'crafter') s.job = 'crafter';
        else if (s.priorities) s.priorities = ['craft', ...s.priorities.filter((k) => k !== 'craft')];
        added.push(s.name);
      }
      if (added.length === 0) {
        if (list.every((s) => b.workers.includes(s.id))) return ok(`Already working at the ${name}.`);
        return err(`The ${name} already has ${max}/${max} worker${max > 1 ? 's' : ''} — unassign someone in its panel first`);
      }
      return ok(`${added.join(', ')} now work${added.length === 1 ? 's' : ''} at the ${name} (${b.workers.length}/${max}).`);
    }

    case 'assignSettlement': {
      const st = sim.settlements.find((x) => x.id === cmd.settlementId);
      if (!st) return err('That settlement is gone');
      const hall = sim.buildings.get(st.id);
      const list = pickSettlers(sim, cmd.ids).filter((s) => s.settlementId !== st.id);
      if (list.length === 0) return err('Select settlers who live somewhere else first');
      for (const s of list) {
        takeOrder(sim, s);
        s.settlementId = st.id;
        // A new home means a new bed, and walking over there.
        s.homeId = null;
        s.areaId = null;
        for (const b of sim.buildings.values()) b.workers = b.workers.filter((id) => id !== s.id);
        if (hall) s.task = { kind: 'move', x: hall.x + Math.floor(hall.w / 2), y: hall.y + hall.h };
      }
      const homeless = assignHomes(sim);
      const beds = homeless ? ` ${homeless} settler${homeless === 1 ? ' has' : 's have'} no bed yet.` : '';
      return ok(`${list.map((s) => s.name).join(', ')} ${list.length === 1 ? 'is' : 'are'} moving to ${st.name}.${beds}`);
    }

    case 'renameSettlement': {
      const st = sim.settlements.find((x) => x.id === cmd.settlementId);
      if (!st) return err('That settlement is gone');
      const name = typeof cmd.name === 'string' ? cmd.name.trim().slice(0, 30) : '';
      if (!name) return err('Give it a name');
      st.name = name;
      return ok();
    }

    case 'setWants': {
      const b = sim.buildings.get(cmd.buildingId);
      if (!b || !BUILDINGS[b.type].storage) return err('Stock targets are for storehouses and settlement halls');
      if (!isResourceId(cmd.res) || !isInt(cmd.amount) || cmd.amount < 0) return err('Invalid stock target');
      const amount = Math.min(cmd.amount, sim.storageCapacity(b));
      if (amount === 0) delete b.wants[cmd.res];
      else b.wants[cmd.res] = amount;
      return ok();
    }

    case 'formHousehold':
      return formHousehold(sim, cmd.ids);
    case 'requestChild':
      return requestChild(sim, cmd.householdId);
    case 'cancelChildRequest':
      return cancelChildRequest(sim, cmd.householdId);
    case 'adoptDeliberateGrowth':
      return adoptDeliberateGrowth(sim);
    case 'acceptRecruit':
      return acceptRecruit(sim, cmd.offerId, cmd.settlementId);
    case 'cancelRecruit':
      return cancelRecruit(sim, cmd.recruitId);
    case 'surveyDeposit':
      return surveyDeposit(sim, cmd.settlerId, cmd.x, cmd.y);
    case 'upgradeMine':
      return upgradeMine(sim, cmd.buildingId);
    case 'createRoute':
      return createRoute(sim, cmd.sourceId, cmd.destinationId, cmd.resource, cmd.target);
    case 'setRouteTarget':
      return setRouteTarget(sim, cmd.routeId, cmd.target);
    case 'cancelRoute':
      return cancelRoute(sim, cmd.routeId);
    case 'barter':
      return barter(sim, cmd.partyId, cmd.give, cmd.take, cmd.coins ?? 0);
    case 'coronate':
      return coronate(sim, cmd.rulerName, cmd.kingdomName, cmd.banner);
    case 'setPolicy':
      return setPolicy(sim, cmd.policy);
    case 'appointCouncil':
      return appointCouncil(sim, cmd.post, cmd.settlerId);
    case 'claimFrontier':
      return claimFrontier(sim, cmd.sector);
    case 'setConflictMode':
      return setConflictMode(sim, cmd.mode);
    case 'activateFrontier':
      return activateFrontier(sim);
    case 'proposeTreaty':
      return proposeTreaty(sim, cmd.kind, cmd.to, cmd.terms);
    case 'respondToOffer':
      return respondToOffer(sim, cmd.offerId, cmd.accept);
    case 'cancelTreaty':
      return cancelTreaty(sim, cmd.offerId);
    case 'respondToIncident':
      return respondToIncident(sim, cmd.incidentId, cmd.response);
    case 'respondToWarning':
      return respondToWarning(sim, cmd.warningId, cmd.action);
    case 'createWarPlan':
      return createWarPlan(sim, cmd.target, cmd.objective);
    case 'requestCampaignSupport':
      return requestCampaignSupport(sim, cmd.planId, cmd.ally, cmd.terms);
    case 'counterCampaignOffer':
      return counterCampaignOffer(sim, cmd.commitmentId, cmd.terms);
    case 'acceptCampaignOffer':
      return acceptCampaignOffer(sim, cmd.commitmentId);
    case 'cancelWarPlan':
      return cancelWarPlan(sim, cmd.planId);
    case 'mobilizeCampaign':
      return mobilizeCampaign(sim, cmd.planId);

    case 'unassignWorker': {
      const b = sim.buildings.get(cmd.buildingId);
      if (!b) return err('That building is gone');
      b.workers = b.workers.filter((id) => id !== cmd.settlerId);
      const s = sim.settler(cmd.settlerId);
      if (s) replan(sim, s);
      return ok();
    }
  }
  return err('Unknown command');
}

