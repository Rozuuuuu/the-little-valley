import type { BuildingId } from './buildings';

export type StatId =
  | 'woodGathered' | 'stoneGathered' | 'foodGathered' | 'harvested' | 'planksCrafted' | 'toolsCrafted' | 'arrivals' | 'births' | 'applesPicked' | 'driedApples'
  | 'wheatHarvested' | 'flourMilled' | 'bakedFood' | 'pathsBuilt';

export type Requirement =
  | { kind: 'population'; count: number }
  | { kind: 'built'; building: BuildingId; count: number; label?: string }
  | { kind: 'stat'; stat: StatId; count: number; label: string }
  /** Permanent beds in finished homes (camp bedrolls don't count). */
  | { kind: 'beds'; count: number }
  /** Work areas with at least one assigned settler. */
  | { kind: 'staffedAreas'; count: number }
  /** Settlements with at least `minResidents` settlers belonging to them. */
  | { kind: 'settlements'; count: number; minResidents: number }
  /** Two settlements joined by an unbroken road (paths and bridges). */
  | { kind: 'roadLink' }
  /** Any `count` of the options: lets players choose their own path. */
  | { kind: 'anyOf'; count: number; label: string; options: readonly Requirement[] };

export interface MilestoneDef {
  id: string;
  name: string;
  tier: number;
  description: string;
  requirements: readonly Requirement[];
  /** Human-readable summary of what reaching it unlocks. */
  unlocks: readonly string[];
  /** Not yet reachable in this release; shown as a future goal. */
  future?: boolean;
}

export type MilestoneId = 'camp' | 'hamlet' | 'village' | 'town' | 'region' | 'civilization';

export const MILESTONES: Record<MilestoneId, MilestoneDef> = {
  camp: {
    id: 'camp', name: 'Camp', tier: 0,
    description: 'Direct your settlers by hand, secure food, and plant an orchard: its apples welcome travellers.',
    requirements: [], unlocks: ['House, Family Home, Field, Orchard, Storehouse, Workshop, Path, Fence, Flower Bed'],
  },
  hamlet: {
    id: 'hamlet', name: 'Hamlet', tier: 1,
    description: 'Six adults and a real home: welcome a traveller with apples, then organise housing, storage and work areas.',
    requirements: [
      { kind: 'population', count: 6 },
      { kind: 'beds', count: 2 },
      { kind: 'stat', stat: 'harvested', count: 10, label: 'Harvest 10 food from fields' },
    ],
    unlocks: ['Mill and Bakery', 'Stone Bridge project', 'Pumpkins', 'Wooden bridges', 'Lantern Posts'],
  },
  village: {
    id: 'village', name: 'Village', tier: 2,
    description: 'Grow to 10 settlers with 8 real beds, then finish any 2 village projects, in whatever order suits your valley.',
    requirements: [
      { kind: 'population', count: 10 },
      { kind: 'beds', count: 8 },
      {
        kind: 'anyOf', count: 2, label: 'Finish 2 of these village projects',
        options: [
          { kind: 'stat', stat: 'bakedFood', count: 30, label: 'Bake 30 food at a bakery' },
          { kind: 'staffedAreas', count: 2 },
          { kind: 'built', building: 'stoneBridge', count: 1, label: 'Complete a stone bridge' },
          { kind: 'stat', stat: 'pathsBuilt', count: 25, label: 'Lay 25 path tiles' },
        ],
      },
    ],
    unlocks: ['Cottages (4 beds)', 'Waystations: found a second settlement', 'Grand Market project', 'Benches', 'The camp becomes a village hall'],
  },
  town: {
    id: 'town', name: 'Town', tier: 3,
    description: 'Grow past a single village: 16 settlers with 16 home beds, then any 2 town projects.',
    requirements: [
      { kind: 'population', count: 16 },
      { kind: 'beds', count: 16 },
      {
        kind: 'anyOf', count: 2, label: 'Finish 2 of these town projects',
        options: [
          { kind: 'settlements', count: 2, minResidents: 4 },
          { kind: 'roadLink' },
          { kind: 'built', building: 'market', count: 1, label: 'Build the Grand Market' },
          { kind: 'stat', stat: 'toolsCrafted', count: 10, label: 'Craft 10 tools' },
        ],
      },
    ],
    unlocks: ['More to come: districts, services and trade'],
  },
  region: {
    id: 'region', name: 'Region', tier: 4, future: true,
    description: 'Found more settlements and connect them through transport and trade.',
    requirements: [], unlocks: ['Planned for a future update'],
  },
  civilization: {
    id: 'civilization', name: 'Civilization', tier: 5, future: true,
    description: 'Great works, settlement identities, policies and your own goals.',
    requirements: [], unlocks: ['Planned for a future update'],
  },
};
export const MILESTONE_ORDER: MilestoneId[] = ['camp', 'hamlet', 'village', 'town', 'region', 'civilization'];
export function isMilestoneId(v: unknown): v is MilestoneId {
  return typeof v === 'string' && v in MILESTONES;
}
