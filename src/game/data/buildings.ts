import type { Inventory } from './resources';
import type { RecipeId } from './recipes';
import type { MilestoneId } from './progression';

export type BuildingCategory = 'housing' | 'farming' | 'storage' | 'production' | 'infrastructure' | 'decor' | 'project';
/** Which terrain a footprint must sit on. */
export type PlacementRule = 'land' | 'farmland' | 'water';

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  size: { w: number; h: number };
  cost: Inventory;
  /** Builder work ticks. 0 with no cost means it is placed instantly. */
  work: number;
  placement: PlacementRule;
  /** Whether the footprint blocks movement once placed. */
  blocks: boolean;
  /** Placed by dragging a rectangle of 1x1 tiles. */
  paint?: boolean;
  /** Player can place it from the build menu. */
  buildable: boolean;
  housing?: number;
  storage?: number;
  recipes?: readonly RecipeId[];
  /** Night light radius in tiles. */
  light?: number;
  /** Radius revealed around it when completed. */
  reveal?: number;
  /** Completing it turns its tiles into this terrain and removes the building. */
  convertsTo?: 'road' | 'bridge';
  maxBuilders?: number;
  unlock?: MilestoneId;
}

export type BuildingId = 'camp' | 'house' | 'field' | 'storehouse' | 'workshop' | 'path' | 'bridge' | 'fence' | 'flowerbed' | 'lamp' | 'bench' | 'market';

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  camp: {
    id: 'camp', name: 'Camp', category: 'housing',
    description: 'Tents, a campfire and a modest stockpile. Where every valley story begins.',
    size: { w: 3, h: 2 }, cost: {}, work: 0, placement: 'land', blocks: true, buildable: false,
    housing: 5, storage: 150, light: 6, reveal: 14,
  },
  house: {
    id: 'house', name: 'House', category: 'housing',
    description: 'A cosy cottage for two. Free beds and spare food attract new settlers.',
    size: { w: 2, h: 2 }, cost: { wood: 20, stone: 6 }, work: 260, placement: 'land', blocks: true, buildable: true,
    housing: 2, light: 3, reveal: 6,
  },
  field: {
    id: 'field', name: 'Field', category: 'farming',
    description: 'A plot of farmland. Farmers till, plant, water and harvest it. Drag to lay out several.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'farmland', blocks: false, paint: true, buildable: true,
  },
  storehouse: {
    id: 'storehouse', name: 'Storehouse', category: 'storage',
    description: 'Holds 300 goods. Place it near work so haulers walk less.',
    size: { w: 3, h: 2 }, cost: { wood: 24, stone: 12 }, work: 300, placement: 'land', blocks: true, buildable: true,
    storage: 300, reveal: 8,
  },
  workshop: {
    id: 'workshop', name: 'Workshop', category: 'production',
    description: 'A crafter turns wood into planks and planks into tools.',
    size: { w: 3, h: 2 }, cost: { wood: 30, stone: 16 }, work: 360, placement: 'land', blocks: true, buildable: true,
    recipes: ['planks', 'tools'], light: 2, reveal: 6,
  },
  path: {
    id: 'path', name: 'Path', category: 'infrastructure',
    description: 'A packed dirt path. Settlers walk faster on it. Drag to lay a route.',
    size: { w: 1, h: 1 }, cost: {}, work: 12, placement: 'land', blocks: false, paint: true, buildable: true,
    convertsTo: 'road', maxBuilders: 1,
  },
  bridge: {
    id: 'bridge', name: 'Bridge', category: 'infrastructure',
    description: 'Wooden planks across shallow water. Opens the far bank to explore.',
    size: { w: 1, h: 1 }, cost: { planks: 2 }, work: 50, placement: 'water', blocks: false, paint: true, buildable: true,
    convertsTo: 'bridge', maxBuilders: 1, unlock: 'hamlet',
  },
  fence: {
    id: 'fence', name: 'Fence', category: 'decor',
    description: 'Wooden fencing that joins up with its neighbours. Drag to draw a line.',
    size: { w: 1, h: 1 }, cost: { wood: 1 }, work: 10, placement: 'land', blocks: true, paint: true, buildable: true, maxBuilders: 1,
  },
  flowerbed: {
    id: 'flowerbed', name: 'Flower Bed', category: 'decor',
    description: 'A planter of cheerful blooms.',
    size: { w: 1, h: 1 }, cost: { wood: 1, stone: 1 }, work: 20, placement: 'land', blocks: true, paint: true, buildable: true, maxBuilders: 1,
  },
  lamp: {
    id: 'lamp', name: 'Lantern Post', category: 'decor',
    description: 'A warm light for evening walks.',
    size: { w: 1, h: 1 }, cost: { planks: 1, stone: 2 }, work: 30, placement: 'land', blocks: true, buildable: true,
    light: 4, maxBuilders: 1, unlock: 'hamlet',
  },
  bench: {
    id: 'bench', name: 'Bench', category: 'decor',
    description: 'A place to sit and watch the valley.',
    size: { w: 2, h: 1 }, cost: { planks: 2 }, work: 30, placement: 'land', blocks: true, buildable: true,
    maxBuilders: 1, unlock: 'village',
  },
  market: {
    id: 'market', name: 'Grand Market', category: 'project',
    description: 'A great project: colourful stalls around a fountain. Once built it stands in the valley for good.',
    size: { w: 5, h: 4 }, cost: { planks: 40, stone: 60, tools: 8 }, work: 1500, placement: 'land', blocks: true, buildable: true,
    light: 5, reveal: 10, maxBuilders: 4, unlock: 'village',
  },
};
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export function buildingDef(id: BuildingId): BuildingDef {
  return BUILDINGS[id];
}
export function isBuildingId(v: unknown): v is BuildingId {
  return typeof v === 'string' && v in BUILDINGS;
}
