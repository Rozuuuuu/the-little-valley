import type { Inventory } from './resources';
import type { RecipeId } from './recipes';
import type { MilestoneId } from './progression';

export type BuildingCategory = 'housing' | 'farming' | 'storage' | 'production' | 'infrastructure' | 'decor' | 'project';
/** Which terrain a footprint must sit on. */
export type PlacementRule = 'land' | 'farmland' | 'water' | 'span';
/** Extra site rules on top of the placement rule. */
export type SiteRule = 'rock' | 'deposit';

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
  /** Beds. Every resident needs one; a home never holds more residents than beds. */
  housing?: number;
  /** Temporary sleeping places (the founding camp's bedrolls) rather than a real home. */
  temporaryBeds?: boolean;
  storage?: number;
  /** Most settlers that can be assigned to work here (production buildings). */
  maxWorkers?: number;
  /** Built by dragging a straight line across water; cost and work scale with length. */
  span?: { min: number; max: number; costPerTile: Inventory; workPerTile: number };
  /** Finished buildings of this type can't be demolished. */
  permanent?: boolean;
  /** Guest rooms for travelling merchants. */
  lodging?: number;
  /** Caravans set off from here; its workers are teamsters. */
  depot?: boolean;
  /** Workers dig here instead of crafting: a quarry cuts stone, a mine digs its deposit's ore. */
  extraction?: 'quarry' | 'mine';
  /** 'rock': half the footprint on rocky ground or hills; 'deposit': over a surveyed deposit with no mine yet. */
  site?: SiteRule;
  /** Founds a settlement when finished; must be this many tiles from any other settlement centre. */
  settlementCenter?: { minSpacing: number };
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

export type BuildingId =
  | 'camp' | 'house' | 'familyHome' | 'cottage' | 'field' | 'orchard' | 'storehouse' | 'workshop' | 'mill' | 'bakery'
  | 'quarry' | 'mine' | 'charcoalKiln' | 'smelter' | 'forge'
  | 'inn' | 'depot' | 'crate' | 'royalHall'
  | 'path' | 'bridge' | 'stoneBridge' | 'fence' | 'flowerbed' | 'lamp' | 'bench' | 'market' | 'waystation';

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  camp: {
    id: 'camp', name: 'Camp', category: 'housing',
    description: 'Tents, a campfire and a modest stockpile. Where every valley story begins.',
    size: { w: 3, h: 2 }, cost: {}, work: 0, placement: 'land', blocks: true, buildable: false,
    housing: 5, temporaryBeds: true, storage: 250, light: 6, reveal: 14, settlementCenter: { minSpacing: 24 },
  },
  house: {
    id: 'house', name: 'House', category: 'housing',
    description: 'A cosy home with 2 beds. Free beds and spare food attract new settlers.',
    size: { w: 2, h: 2 }, cost: { wood: 20, stone: 6 }, work: 260, placement: 'land', blocks: true, buildable: true,
    housing: 2, light: 3, reveal: 6,
  },
  familyHome: {
    id: 'familyHome', name: 'Family Home', category: 'housing',
    description: 'A home with 3 beds: room for a couple and a child. Households ask for children here.',
    size: { w: 3, h: 2 }, cost: { wood: 20, stone: 10 }, work: 300, placement: 'land', blocks: true, buildable: true,
    housing: 3, light: 3, reveal: 6,
  },
  field: {
    id: 'field', name: 'Field', category: 'farming',
    description: 'A plot of farmland. Farmers till, plant, water and harvest it. Drag to lay out several.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'farmland', blocks: false, paint: true, buildable: true,
  },
  orchard: {
    id: 'orchard', name: 'Orchard', category: 'farming',
    description: 'Four young apple trees. They take two growing days to establish, then bear apples while farmers tend them. They rest in winter.',
    size: { w: 2, h: 2 }, cost: { wood: 10, stone: 2 }, work: 120, placement: 'farmland', blocks: true, buildable: true,
    maxBuilders: 2,
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
    recipes: ['planks', 'tools', 'driedApples'], light: 2, reveal: 6, maxWorkers: 1,
  },
  mill: {
    id: 'mill', name: 'Mill', category: 'production',
    description: 'A windmill. Its miller grinds 3 wheat into 2 flour.',
    size: { w: 2, h: 2 }, cost: { wood: 30, stone: 20 }, work: 320, placement: 'land', blocks: true, buildable: true,
    recipes: ['flour'], light: 2, reveal: 6, maxWorkers: 1, unlock: 'hamlet',
  },
  bakery: {
    id: 'bakery', name: 'Bakery', category: 'production',
    description: 'Its baker turns 2 flour and 1 wood (for the oven) into 5 food.',
    size: { w: 3, h: 2 }, cost: { wood: 20, stone: 25, planks: 6 }, work: 340, placement: 'land', blocks: true, buildable: true,
    recipes: ['bread'], light: 3, reveal: 6, maxWorkers: 1, unlock: 'hamlet',
  },
  cottage: {
    id: 'cottage', name: 'Cottage', category: 'housing',
    description: 'A roomy family home with 4 beds.',
    size: { w: 3, h: 2 }, cost: { wood: 30, stone: 20, planks: 10 }, work: 420, placement: 'land', blocks: true, buildable: true,
    housing: 4, light: 3, reveal: 6, unlock: 'village',
  },
  waystation: {
    id: 'waystation', name: 'Waystation', category: 'project',
    description: 'A hall that founds a new settlement: bedrolls for 4, a small store and a lantern. Must stand at least 24 tiles from any other settlement.',
    size: { w: 3, h: 2 }, cost: { wood: 40, stone: 30, planks: 10 }, work: 480, placement: 'land', blocks: true, buildable: true,
    housing: 4, temporaryBeds: true, storage: 150, light: 5, reveal: 14, maxBuilders: 3, permanent: true, unlock: 'village',
    settlementCenter: { minSpacing: 24 },
  },
  quarry: {
    id: 'quarry', name: 'Quarry', category: 'production',
    description: 'Cut stone from rocky ground or a hill slope, without end. Assign up to 2 quarry workers; the pit deepens as they work.',
    size: { w: 2, h: 2 }, cost: { wood: 15 }, work: 160, placement: 'land', site: 'rock', blocks: true, buildable: true,
    extraction: 'quarry', maxWorkers: 2, reveal: 6,
  },
  mine: {
    id: 'mine', name: 'Mine', category: 'production',
    description: 'A timbered entrance over a surveyed deposit. Up to 2 miners dig its ore until the seam runs out; deepen the shaft for bigger loads.',
    size: { w: 2, h: 2 }, cost: { wood: 30, stone: 10 }, work: 300, placement: 'land', site: 'deposit', blocks: true, buildable: true,
    extraction: 'mine', maxWorkers: 2, light: 2, reveal: 6, unlock: 'hamlet',
  },
  charcoalKiln: {
    id: 'charcoalKiln', name: 'Charcoal Kiln', category: 'production',
    description: 'Slow-burns 3 wood into 2 charcoal: smelter fuel when there is no coal.',
    size: { w: 2, h: 2 }, cost: { wood: 10, stone: 20 }, work: 220, placement: 'land', blocks: true, buildable: true,
    recipes: ['charcoal'], maxWorkers: 1, light: 2, reveal: 5, unlock: 'hamlet',
  },
  smelter: {
    id: 'smelter', name: 'Smelter', category: 'production',
    description: 'Melts 2 ore and 1 fuel (coal or charcoal) into an ingot.',
    size: { w: 2, h: 2 }, cost: { wood: 10, stone: 30, planks: 5 }, work: 320, placement: 'land', blocks: true, buildable: true,
    recipes: ['smeltCopper', 'smeltIron'], maxWorkers: 1, light: 3, reveal: 5, unlock: 'hamlet',
  },
  forge: {
    id: 'forge', name: 'Forge', category: 'production',
    description: 'Hammers an ingot and a plank into tools: 1 from copper, 2 from iron.',
    size: { w: 3, h: 2 }, cost: { stone: 30, planks: 15 }, work: 360, placement: 'land', blocks: true, buildable: true,
    recipes: ['forgeCopperTools', 'forgeIronTools'], maxWorkers: 1, light: 3, reveal: 5, unlock: 'hamlet',
  },
  inn: {
    id: 'inn', name: 'Inn', category: 'project',
    description: 'Rooms for travellers. Merchants from distant towns stop here to barter, and would-be settlers come by twice as often.',
    size: { w: 3, h: 2 }, cost: { wood: 40, stone: 20, planks: 20 }, work: 420, placement: 'land', blocks: true, buildable: true,
    lodging: 2, light: 4, reveal: 6, unlock: 'village',
  },
  depot: {
    id: 'depot', name: 'Caravan Depot', category: 'infrastructure',
    description: 'Carts and a stable yard. Its workers drive caravans along supply routes to your other settlements. Needs a road or bridge between them.',
    size: { w: 3, h: 2 }, cost: { wood: 30, stone: 10, planks: 10 }, work: 360, placement: 'land', blocks: true, buildable: true,
    storage: 100, maxWorkers: 2, depot: true, reveal: 6, unlock: 'village',
  },
  royalHall: {
    id: 'royalHall', name: 'Royal Hall', category: 'project',
    description: 'A great stone hall with a throne room and a banner tower: the seat of your crown. Once built it stands for good.',
    size: { w: 4, h: 3 }, cost: { stone: 80, planks: 40, wood: 40, tools: 10 }, work: 1200, placement: 'land', blocks: true, buildable: true,
    light: 5, reveal: 10, maxBuilders: 4, permanent: true, unlock: 'town',
  },
  crate: {
    id: 'crate', name: 'Crate', category: 'storage',
    description: 'Goods a caravan could not unload anywhere. Settlers fetch from it like a store; it disappears once empty.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'land', blocks: false, buildable: false, storage: 500,
  },
  stoneBridge: {
    id: 'stoneBridge', name: 'Stone Bridge', category: 'project',
    description: 'A permanent stone crossing over any river, even deep water. Drag across the water from bank to bank.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'span', blocks: false, buildable: true,
    span: { min: 2, max: 12, costPerTile: { stone: 6, planks: 2 }, workPerTile: 100 },
    maxBuilders: 3, permanent: true, reveal: 8, unlock: 'hamlet',
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
