import { JOBS, type JobId, type WorkKind } from '../data/jobs';
import type { Settler } from './types';

export const WORK_KINDS: WorkKind[] = ['build', 'haul', 'farm', 'gather', 'craft'];

export const WORK_LABELS: Record<WorkKind, string> = {
  build: 'Build',
  haul: 'Haul',
  farm: 'Farm',
  gather: 'Gather',
  craft: 'Craft',
};

const combined = new Map<string, readonly WorkKind[]>();

/**
 * A main job's order with a side job worked in: the main job's own work first, then the side
 * job's, then the rest of both. A job with no work of its own (traveller, chief) falls back on
 * the side job's order.
 */
export function jobOrder(main: JobId, side: JobId | null | undefined): readonly WorkKind[] {
  const m = JOBS[main].priorities;
  if (!side || side === main) return m;
  const key = `${main}+${side}`;
  let out = combined.get(key);
  if (!out) {
    const o = JOBS[side].priorities;
    const list: WorkKind[] = [];
    for (const k of [...m.slice(0, 1), ...o.slice(0, 1), ...m.slice(1), ...o.slice(1)]) if (!list.includes(k)) list.push(k);
    out = list;
    combined.set(key, out);
  }
  return out;
}

/** The work order a settler follows: their personal order, or their jobs' default. */
export function effectivePriorities(s: Settler): readonly WorkKind[] {
  // Children take no adult work.
  if (s.lifeStage === 'child') return [];
  return s.priorities ?? jobOrder(s.job, s.sideJob);
}

export function canDo(s: Settler, kind: WorkKind): boolean {
  return effectivePriorities(s).includes(kind);
}

/** Validates and de-duplicates a player-supplied order. */
export function cleanPriorities(list: unknown): WorkKind[] | null {
  if (!Array.isArray(list)) return null;
  const out: WorkKind[] = [];
  for (const k of list) if (WORK_KINDS.includes(k as WorkKind) && !out.includes(k as WorkKind)) out.push(k as WorkKind);
  return out;
}
