/** Work categories a settler can perform, in the order the job finder tries them. */
export type WorkKind = 'build' | 'haul' | 'farm' | 'gather' | 'craft';

export interface JobDef {
  id: string;
  name: string;
  description: string;
  priorities: readonly WorkKind[];
}

export type JobId = 'laborer' | 'farmer' | 'gatherer' | 'builder' | 'hauler' | 'crafter' | 'hunter' | 'herder';

export const JOBS: Record<JobId, JobDef> = {
  laborer: { id: 'laborer', name: 'Laborer', description: 'Builds, hauls, farms and harvests marked resources.', priorities: ['build', 'haul', 'farm', 'gather'] },
  farmer: { id: 'farmer', name: 'Farmer', description: 'Tends fields first, then helps elsewhere.', priorities: ['farm', 'haul', 'build', 'gather'] },
  gatherer: { id: 'gatherer', name: 'Gatherer', description: 'Harvests marked resources, or whatever the stores are shortest of.', priorities: ['gather', 'haul', 'build'] },
  builder: { id: 'builder', name: 'Builder', description: 'Constructs and supplies building sites.', priorities: ['build', 'haul', 'gather'] },
  hauler: { id: 'hauler', name: 'Hauler', description: 'Moves materials to sites and workshops.', priorities: ['haul', 'build', 'gather'] },
  crafter: { id: 'crafter', name: 'Crafter', description: 'Works at a workshop, mill or bakery.', priorities: ['craft', 'haul', 'build', 'gather'] },
  hunter: { id: 'hunter', name: 'Hunter', description: "Hunts game from a hunter's lodge, then gathers.", priorities: ['gather', 'haul', 'build'] },
  herder: { id: 'herder', name: 'Herder', description: 'Tends pens and pastures first, then fields.', priorities: ['farm', 'haul', 'build', 'gather'] },
};
export const JOB_IDS = Object.keys(JOBS) as JobId[];
export function isJobId(v: unknown): v is JobId {
  return typeof v === 'string' && v in JOBS;
}
