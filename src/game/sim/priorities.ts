import { JOBS, type WorkKind } from '../data/jobs';
import type { Settler } from './types';

export const WORK_KINDS: WorkKind[] = ['build', 'haul', 'farm', 'gather', 'craft'];

export const WORK_LABELS: Record<WorkKind, string> = {
  build: 'Build',
  haul: 'Haul',
  farm: 'Farm',
  gather: 'Gather',
  craft: 'Craft',
};

/** The work order a settler follows: their personal order, or their job's default. */
export function effectivePriorities(s: Settler): readonly WorkKind[] {
  return s.priorities ?? JOBS[s.job].priorities;
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
