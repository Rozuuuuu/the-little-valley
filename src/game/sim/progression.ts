import { BUILDINGS } from '../data/buildings';
import { MILESTONES, MILESTONE_ORDER, type MilestoneId, type Requirement } from '../data/progression';
import { builtCount, permanentBeds } from './buildings';
import type { Simulation } from './Simulation';

export interface RequirementProgress {
  label: string;
  current: number;
  target: number;
  done: boolean;
  /** For "any N of" requirements: each option's own progress. */
  options?: RequirementProgress[];
}

export function staffedAreaCount(sim: Simulation): number {
  const staffed = new Set<number>();
  for (const s of sim.settlers) if (s.areaId !== null && sim.area(s.areaId)) staffed.add(s.areaId);
  return staffed.size;
}

export function requirementProgress(sim: Simulation, req: Requirement): RequirementProgress {
  let current = 0;
  let label = '';
  switch (req.kind) {
    case 'population':
      current = sim.settlers.length;
      label = `Reach ${req.count} settlers`;
      break;
    case 'built':
      current = builtCount(sim, req.building);
      label = req.label ?? `Build ${req.count > 1 ? `${req.count} ` : 'a '}${BUILDINGS[req.building].name}${req.count > 1 ? 's' : ''}`;
      break;
    case 'stat':
      current = sim.stats[req.stat];
      label = req.label;
      break;
    case 'beds':
      current = permanentBeds(sim);
      label = `Have ${req.count} beds in houses or cottages`;
      break;
    case 'staffedAreas':
      current = staffedAreaCount(sim);
      label = `Run ${req.count} work areas with settlers assigned`;
      break;
    case 'anyOf': {
      const options = req.options.map((o) => requirementProgress(sim, o));
      current = options.filter((o) => o.done).length;
      return { label: req.label, current: Math.min(current, req.count), target: req.count, done: current >= req.count, options };
    }
  }
  return { label, current: Math.min(current, req.count), target: req.count, done: current >= req.count };
}

export function currentMilestone(sim: Simulation): MilestoneId {
  return sim.progression.reached[sim.progression.reached.length - 1] ?? 'camp';
}

export function nextMilestone(sim: Simulation): MilestoneId | null {
  for (const id of MILESTONE_ORDER) if (!sim.progression.reached.includes(id)) return id;
  return null;
}

export function checkMilestones(sim: Simulation): void {
  const next = nextMilestone(sim);
  if (!next) return;
  const def = MILESTONES[next];
  if (def.future) return;
  if (!def.requirements.every((r) => requirementProgress(sim, r).done)) return;
  sim.progression.reached.push(next);
  sim.toast(`Your settlement is now a ${def.name}! Unlocked: ${def.unlocks.join(', ')}.`, 'good');
  sim.record('milestone', `Became a ${def.name}`);
  sim.emit({ type: 'milestone', id: next });
  sim.emit({ type: 'sfx', name: 'milestone' });
  sim.emit({ type: 'important' });
}
