import type { BuildingId } from './buildings';

export type StatId =
  | 'woodGathered' | 'stoneGathered' | 'foodGathered' | 'harvested' | 'planksCrafted' | 'toolsCrafted' | 'arrivals' | 'births' | 'applesPicked' | 'driedApples'
  | 'surveys' | 'oreMined' | 'stoneQuarried' | 'charcoalMade' | 'coalBurned' | 'charcoalBurned' | 'copperSmelted' | 'ironSmelted' | 'copperToolsForged' | 'ironToolsForged'
  | 'caravanTrips' | 'caravanDeliveries' | 'provisions' | 'merchantVisits' | 'trades'
  | 'swordsMade' | 'bowsMade' | 'armorMade' | 'horseFeed' | 'soldiersTrained'
  | 'battles' | 'soldiersLost' | 'cargoLost' | 'gearLost' | 'enemyLosses'
  | 'wheatHarvested' | 'flourMilled' | 'bakedFood' | 'pathsBuilt';

export type Requirement =
  | { kind: 'population'; count: number }
  | { kind: 'built'; building: BuildingId; count: number; label?: string }
  | { kind: 'stat'; stat: StatId; count: number; label: string }
  /** The sum of several stats. */
  | { kind: 'statSum'; stats: readonly StatId[]; count: number; label: string }
  /** Permanent beds in finished homes (camp bedrolls don't count). */
  | { kind: 'beds'; count: number }
  /** Work areas with at least one assigned settler. */
  | { kind: 'staffedAreas'; count: number }
  /** Settlements with at least `minResidents` settlers belonging to them. */
  | { kind: 'settlements'; count: number; minResidents: number }
  /** The ruler has been crowned. */
  | { kind: 'crowned' }
  /** An active treaty of this kind with any kingdom. */
  | { kind: 'treaty'; treaty: 'trade' | 'passage' | 'nonAggression' | 'defensiveAlliance'; label: string }
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
    unlocks: ['Royal Hall', 'Council posts', 'The road to Region: caravans, trade and a crown'],
  },
  region: {
    id: 'region', name: 'Region', tier: 4,
    description: 'Two thriving settlements joined by caravans, then any 2 of: metal tools, trade, or a royal hall. Then crown your ruler.',
    requirements: [
      { kind: 'settlements', count: 2, minResidents: 4 },
      { kind: 'stat', stat: 'caravanDeliveries', count: 1, label: 'Deliver goods along a supply route' },
      {
        kind: 'anyOf', count: 2, label: 'Finish 2 of these regional projects',
        options: [
          { kind: 'statSum', stats: ['copperToolsForged', 'ironToolsForged'], count: 10, label: 'Forge 10 metal tools' },
          { kind: 'stat', stat: 'trades', count: 3, label: 'Trade 3 times with merchants' },
          { kind: 'built', building: 'royalHall', count: 1, label: 'Build the Royal Hall' },
        ],
      },
    ],
    unlocks: ['Coronation (Kingdom panel)', 'Frontier land claims', 'Taxes on trade and public trust'],
  },
  civilization: {
    id: 'civilization', name: 'Civilization', tier: 5,
    description: 'A crowned realm with working supply lines, then any 2 of: 20 pieces of equipment, a trade treaty, or a council hall. War is never required.',
    requirements: [
      { kind: 'crowned' },
      { kind: 'stat', stat: 'caravanDeliveries', count: 5, label: 'Make 5 caravan deliveries' },
      {
        kind: 'anyOf', count: 2, label: 'Finish 2 of these',
        options: [
          { kind: 'statSum', stats: ['swordsMade', 'bowsMade', 'armorMade'], count: 20, label: 'Make 20 pieces of equipment' },
          { kind: 'treaty', treaty: 'trade', label: 'Keep a trade treaty with another kingdom' },
          { kind: 'built', building: 'councilHall', count: 1, label: 'Build the Council Hall' },
        ],
      },
    ],
    unlocks: ['Open the frontier to conflict (Realm tab): border campaigns, war and peace', 'Launch prepared campaigns with your allies'],
  },
};
export const MILESTONE_ORDER: MilestoneId[] = ['camp', 'hamlet', 'village', 'town', 'region', 'civilization'];
export function isMilestoneId(v: unknown): v is MilestoneId {
  return typeof v === 'string' && v in MILESTONES;
}
