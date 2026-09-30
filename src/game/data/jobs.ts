/** Work categories a settler can perform, in the order the job finder tries them. */
export type WorkKind = 'build' | 'haul' | 'farm' | 'gather' | 'craft';

export interface JobDef {
  id: string;
  name: string;
  description: string;
  priorities: readonly WorkKind[];
  /** Town Hall level needed to train this role there: 1 Town Hall, 2 Keep, 3 Castle. */
  hallLevel: 1 | 2 | 3;
  /** At most this many people may hold the role (the Assistant Chief is one person). */
  limit?: number;
}

export type JobId =
  | 'laborer' | 'farmer' | 'gatherer' | 'builder' | 'hauler' | 'crafter' | 'hunter' | 'herder'
  | 'traveler' | 'messenger' | 'chief';

export const JOBS: Record<JobId, JobDef> = {
  laborer: { id: 'laborer', name: 'Laborer', description: 'Builds, hauls, farms and harvests marked resources, and lends a hand at an idle workshop.', priorities: ['build', 'haul', 'farm', 'gather', 'craft'], hallLevel: 1 },
  farmer: { id: 'farmer', name: 'Farmer', description: 'Tends fields first, then helps elsewhere.', priorities: ['farm', 'haul', 'build', 'gather'], hallLevel: 1 },
  gatherer: { id: 'gatherer', name: 'Gatherer', description: 'Harvests marked resources, or whatever the stores are shortest of.', priorities: ['gather', 'haul', 'build'], hallLevel: 1 },
  builder: { id: 'builder', name: 'Builder', description: 'Constructs and supplies building sites.', priorities: ['build', 'haul', 'gather'], hallLevel: 1 },
  hauler: { id: 'hauler', name: 'Hauler', description: 'Moves materials to sites and workshops.', priorities: ['haul', 'build', 'gather'], hallLevel: 1 },
  crafter: { id: 'crafter', name: 'Crafter', description: 'Works at a workshop, mill or bakery.', priorities: ['craft', 'haul', 'build', 'gather'], hallLevel: 1 },
  hunter: { id: 'hunter', name: 'Hunter', description: "Hunts game from a hunter's lodge, then gathers.", priorities: ['gather', 'haul', 'build'], hallLevel: 1 },
  herder: { id: 'herder', name: 'Herder', description: 'Tends pens and pastures first, then fields.', priorities: ['farm', 'haul', 'build', 'gather'], hallLevel: 1 },
  traveler: { id: 'traveler', name: 'Traveller', description: 'Roams beyond the known land and lifts the fog, coming home to eat and sleep.', priorities: [], hallLevel: 2 },
  messenger: { id: 'messenger', name: 'Messenger', description: 'Letters and news reach you twice as fast while you have one. Runs errands (hauling) in between.', priorities: ['haul', 'build', 'gather'], hallLevel: 2 },
  chief: {
    id: 'chief', name: 'Assistant Chief', hallLevel: 3, limit: 1, priorities: [],
    description: 'Walks among your people, puts idle hands to work where workers are missing, and comes to you with advice.',
  },
};
export const JOB_IDS = Object.keys(JOBS) as JobId[];
export function isJobId(v: unknown): v is JobId {
  return typeof v === 'string' && v in JOBS;
}

/** Ticks of study at the Town Hall to learn a new role (about 30 seconds). */
export const ROLE_TRAIN_TICKS = 300;
/** People who can train at once, by Town Hall level. */
export const HALL_TRAINING_PLACES = [0, 2, 3, 4] as const;
/** Town Hall level names, for messages. */
export const HALL_LEVEL_NAMES = ['', 'Town Hall', 'Keep', 'Castle'] as const;
