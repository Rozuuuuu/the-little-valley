import type { BuildingId } from './buildings';

export type StatId = 'woodGathered' | 'stoneGathered' | 'foodGathered' | 'harvested' | 'planksCrafted' | 'toolsCrafted' | 'arrivals';

export type Requirement =
  | { kind: 'population'; count: number }
  | { kind: 'built'; building: BuildingId; count: number }
  | { kind: 'stat'; stat: StatId; count: number; label: string };

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
    description: 'Direct your settlers by hand and secure a food supply.',
    requirements: [], unlocks: ['House, Field, Storehouse, Workshop, Path, Fence, Flower Bed'],
  },
  hamlet: {
    id: 'hamlet', name: 'Hamlet', tier: 1,
    description: 'Organise housing, storage and work areas.',
    requirements: [
      { kind: 'population', count: 6 },
      { kind: 'built', building: 'house', count: 1 },
      { kind: 'stat', stat: 'harvested', count: 10, label: 'Harvest 10 food from fields' },
    ],
    unlocks: ['Pumpkins', 'Bridges', 'Lantern Posts'],
  },
  village: {
    id: 'village', name: 'Village', tier: 2,
    description: 'Plan roads, workshops and production.',
    requirements: [
      { kind: 'population', count: 9 },
      { kind: 'built', building: 'workshop', count: 1 },
      { kind: 'built', building: 'storehouse', count: 1 },
      { kind: 'stat', stat: 'planksCrafted', count: 20, label: 'Craft 20 planks' },
    ],
    unlocks: ['Grand Market project', 'Benches'],
  },
  town: {
    id: 'town', name: 'Town', tier: 3,
    description: 'Develop districts, services and specialised industries.',
    requirements: [
      { kind: 'population', count: 16 },
      { kind: 'built', building: 'house', count: 7 },
      { kind: 'built', building: 'market', count: 1 },
      { kind: 'stat', stat: 'toolsCrafted', count: 10, label: 'Craft 10 tools' },
    ],
    unlocks: ['More to come: districts and services'],
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
