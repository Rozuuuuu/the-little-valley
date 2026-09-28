import type { Inventory } from './resources';
import type { RecipeId } from './recipes';
import type { MilestoneId } from './progression';
import type { ResourceId } from './resources';
import type { UnitType } from './units';

/** Build-menu groups; the command card shows one group at a time. */
export type BuildingCategory = 'town' | 'food' | 'animals' | 'industry' | 'storage' | 'military' | 'roads' | 'realm';

export const CATEGORY_INFO: Record<BuildingCategory, { name: string; description: string }> = {
  town: { name: 'Town', description: 'Homes, the town hall, the inn and places for travellers.' },
  food: { name: 'Food', description: 'Fields, orchards, fishing, hunting, mills and bakeries.' },
  animals: { name: 'Animals', description: 'Pens and pastures for livestock.' },
  industry: { name: 'Industry', description: 'Workshops, quarries, mines, kilns, smelters and forges.' },
  storage: { name: 'Storage & Trade', description: 'Storehouses, granaries and caravan depots.' },
  military: { name: 'Military', description: 'Barracks, ranges, armories, stables and defences.' },
  roads: { name: 'Roads & Decor', description: 'Paths, bridges, fences, lanterns and flowers.' },
  realm: { name: 'Realm', description: 'Great projects: halls, markets, waystations and stone bridges.' },
};
export const CATEGORY_ORDER: BuildingCategory[] = ['town', 'food', 'animals', 'industry', 'storage', 'military', 'roads', 'realm'];
/** Which terrain a footprint must sit on. */
export type PlacementRule = 'land' | 'farmland' | 'water' | 'span';
/** Extra site rules on top of the placement rule. */
export type SiteRule = 'rock' | 'deposit';

/**
 * One level of a building. Level 1 describes the building as first built (its cost is
 * the build cost); later levels are upgrades paid up front that finish on a timer while
 * the building keeps working. Stats a level leaves out carry over from the level below.
 */
export interface LevelDef {
  name: string;
  /** Upgrade price (ignored for level 1). */
  cost: Inventory;
  /** Ticks the upgrade takes (ignored for level 1). */
  time: number;
  requires?: MilestoneId;
  housing?: number;
  storage?: number;
  maxWorkers?: number;
  lodging?: number;
  trainingSlots?: number;
  /** Work speed multiplier for crafting and digging here. */
  speed?: number;
  light?: number;
  reveal?: number;
  /** What this level adds, in words, for the command card. */
  perks: string[];
  /** The upgrade rebuilds it in place as another building (the old founding camp becomes a Town Hall). */
  becomes?: BuildingId;
}

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
  /** Storage takes only these resources. */
  accepts?: readonly ResourceId[];
  /** Soldiers of these kinds drill here; at most `slots` at a time. */
  training?: { units: readonly UnitType[]; slots: number };
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
  /** Upgrade path; see LevelDef. */
  levels?: LevelDef[];
}

export type BuildingId =
  | 'townHall' | 'travelCamp' | 'camp' | 'house' | 'familyHome' | 'cottage' | 'field' | 'orchard' | 'storehouse' | 'workshop' | 'mill' | 'bakery'
  | 'quarry' | 'mine' | 'charcoalKiln' | 'smelter' | 'forge'
  | 'inn' | 'depot' | 'crate' | 'royalHall'
  | 'barracks' | 'archeryRange' | 'armory' | 'stable' | 'councilHall'
  | 'path' | 'bridge' | 'stoneBridge' | 'fence' | 'flowerbed' | 'lamp' | 'bench' | 'market' | 'waystation';

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  townHall: {
    id: 'townHall', name: 'Town Hall', category: 'town',
    description: 'The heart of the settlement: a timber hall with bunks for 10, a great store and a bell. Upgrade it to a Keep, then a Castle.',
    size: { w: 4, h: 3 }, cost: {}, work: 0, placement: 'land', blocks: true, buildable: false, permanent: true,
    housing: 10, temporaryBeds: true, storage: 600, light: 6, reveal: 16, settlementCenter: { minSpacing: 24 },
  },
  travelCamp: {
    id: 'travelCamp', name: "Travellers' Camp", category: 'town',
    description: 'Tents and a campfire by the road. Visitors stop more often, and your companies rest and restock here on the march.',
    size: { w: 3, h: 2 }, cost: { wood: 20, stone: 5 }, work: 160, placement: 'land', blocks: true, buildable: true,
    light: 5, reveal: 8, maxBuilders: 2,
  },
  camp: {
    id: 'camp', name: 'Camp', category: 'town',
    description: 'Tents, a campfire and a modest stockpile, where older valleys began. Upgrade it to raise a Town Hall in its place.',
    size: { w: 3, h: 2 }, cost: {}, work: 0, placement: 'land', blocks: true, buildable: false,
    housing: 5, temporaryBeds: true, storage: 250, light: 6, reveal: 14, settlementCenter: { minSpacing: 24 },
  },
  house: {
    id: 'house', name: 'House', category: 'town',
    description: 'A cosy home with 2 beds. Free beds and spare food attract new settlers.',
    size: { w: 2, h: 2 }, cost: { wood: 20, stone: 6 }, work: 260, placement: 'land', blocks: true, buildable: true,
    housing: 2, light: 3, reveal: 6,
  },
  familyHome: {
    id: 'familyHome', name: 'Family Home', category: 'town',
    description: 'A home with 3 beds: room for a couple and a child. Households ask for children here.',
    size: { w: 3, h: 2 }, cost: { wood: 20, stone: 10 }, work: 300, placement: 'land', blocks: true, buildable: true,
    housing: 3, light: 3, reveal: 6,
  },
  field: {
    id: 'field', name: 'Field', category: 'food',
    description: 'A plot of farmland. Farmers till, plant, water and harvest it. Drag to lay out several.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'farmland', blocks: false, paint: true, buildable: true,
  },
  orchard: {
    id: 'orchard', name: 'Orchard', category: 'food',
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
    id: 'workshop', name: 'Workshop', category: 'industry',
    description: 'A crafter turns wood into planks and planks into tools.',
    size: { w: 3, h: 2 }, cost: { wood: 30, stone: 16 }, work: 360, placement: 'land', blocks: true, buildable: true,
    recipes: ['planks', 'tools', 'driedApples', 'makeBows'], light: 2, reveal: 6, maxWorkers: 1,
  },
  mill: {
    id: 'mill', name: 'Mill', category: 'food',
    description: 'A windmill. Its miller grinds 3 wheat into 2 flour.',
    size: { w: 2, h: 2 }, cost: { wood: 30, stone: 20 }, work: 320, placement: 'land', blocks: true, buildable: true,
    recipes: ['flour'], light: 2, reveal: 6, maxWorkers: 1, unlock: 'hamlet',
  },
  bakery: {
    id: 'bakery', name: 'Bakery', category: 'food',
    description: 'Its baker turns 2 flour and 1 wood (for the oven) into 5 food.',
    size: { w: 3, h: 2 }, cost: { wood: 20, stone: 25, planks: 6 }, work: 340, placement: 'land', blocks: true, buildable: true,
    recipes: ['bread'], light: 3, reveal: 6, maxWorkers: 1, unlock: 'hamlet',
  },
  cottage: {
    id: 'cottage', name: 'Cottage', category: 'town',
    description: 'A roomy family home with 4 beds.',
    size: { w: 3, h: 2 }, cost: { wood: 30, stone: 20, planks: 10 }, work: 420, placement: 'land', blocks: true, buildable: true,
    housing: 4, light: 3, reveal: 6, unlock: 'village',
  },
  waystation: {
    id: 'waystation', name: 'Waystation', category: 'realm',
    description: 'A hall that founds a new settlement: bedrolls for 4, a small store and a lantern. Must stand at least 24 tiles from any other settlement.',
    size: { w: 3, h: 2 }, cost: { wood: 40, stone: 30, planks: 10 }, work: 480, placement: 'land', blocks: true, buildable: true,
    housing: 4, temporaryBeds: true, storage: 150, light: 5, reveal: 14, maxBuilders: 3, permanent: true, unlock: 'village',
    settlementCenter: { minSpacing: 24 },
  },
  quarry: {
    id: 'quarry', name: 'Quarry', category: 'industry',
    description: 'Cut stone from rocky ground or a hill slope, without end. Assign up to 2 quarry workers; the pit deepens as they work.',
    size: { w: 2, h: 2 }, cost: { wood: 15 }, work: 160, placement: 'land', site: 'rock', blocks: true, buildable: true,
    extraction: 'quarry', maxWorkers: 2, reveal: 6,
  },
  mine: {
    id: 'mine', name: 'Mine', category: 'industry',
    description: 'A timbered entrance over a surveyed deposit. Up to 2 miners dig its ore until the seam runs out; deepen the shaft for bigger loads.',
    size: { w: 2, h: 2 }, cost: { wood: 30, stone: 10 }, work: 300, placement: 'land', site: 'deposit', blocks: true, buildable: true,
    extraction: 'mine', maxWorkers: 2, light: 2, reveal: 6, unlock: 'hamlet',
  },
  charcoalKiln: {
    id: 'charcoalKiln', name: 'Charcoal Kiln', category: 'industry',
    description: 'Slow-burns 3 wood into 2 charcoal: smelter fuel when there is no coal.',
    size: { w: 2, h: 2 }, cost: { wood: 10, stone: 20 }, work: 220, placement: 'land', blocks: true, buildable: true,
    recipes: ['charcoal'], maxWorkers: 1, light: 2, reveal: 5, unlock: 'hamlet',
  },
  smelter: {
    id: 'smelter', name: 'Smelter', category: 'industry',
    description: 'Melts 2 ore and 1 fuel (coal or charcoal) into an ingot.',
    size: { w: 2, h: 2 }, cost: { wood: 10, stone: 30, planks: 5 }, work: 320, placement: 'land', blocks: true, buildable: true,
    recipes: ['smeltCopper', 'smeltIron'], maxWorkers: 1, light: 3, reveal: 5, unlock: 'hamlet',
  },
  forge: {
    id: 'forge', name: 'Forge', category: 'industry',
    description: 'Hammers an ingot and a plank into tools: 1 from copper, 2 from iron.',
    size: { w: 3, h: 2 }, cost: { stone: 30, planks: 15 }, work: 360, placement: 'land', blocks: true, buildable: true,
    recipes: ['forgeCopperTools', 'forgeIronTools', 'forgeSwords', 'forgeArmor'], maxWorkers: 1, light: 3, reveal: 5, unlock: 'hamlet',
  },
  inn: {
    id: 'inn', name: 'Inn', category: 'town',
    description: 'Rooms for travellers. Merchants from distant towns stop here to barter, and would-be settlers come by twice as often.',
    size: { w: 3, h: 2 }, cost: { wood: 40, stone: 20, planks: 20 }, work: 420, placement: 'land', blocks: true, buildable: true,
    lodging: 2, light: 4, reveal: 6, unlock: 'village',
  },
  depot: {
    id: 'depot', name: 'Caravan Depot', category: 'storage',
    description: 'Carts and a stable yard. Its workers drive caravans along supply routes to your other settlements. Needs a road or bridge between them.',
    size: { w: 3, h: 2 }, cost: { wood: 30, stone: 10, planks: 10 }, work: 360, placement: 'land', blocks: true, buildable: true,
    storage: 100, maxWorkers: 2, depot: true, reveal: 6, unlock: 'village',
  },
  royalHall: {
    id: 'royalHall', name: 'Royal Hall', category: 'realm',
    description: 'A great stone hall with a throne room and a banner tower: the seat of your crown. Once built it stands for good.',
    size: { w: 4, h: 3 }, cost: { stone: 80, planks: 40, wood: 40, tools: 10 }, work: 1200, placement: 'land', blocks: true, buildable: true,
    light: 5, reveal: 10, maxBuilders: 4, permanent: true, unlock: 'town',
  },
  barracks: {
    id: 'barracks', name: 'Barracks', category: 'military',
    description: 'Drill yard and bunks for training infantry and knights, 4 at a time. Recruits bring their gear from the stores.',
    size: { w: 3, h: 2 }, cost: { stone: 40, planks: 30, wood: 20 }, work: 520, placement: 'land', blocks: true, buildable: true,
    training: { units: ['infantry', 'knight'], slots: 4 }, light: 3, reveal: 6, unlock: 'region',
  },
  archeryRange: {
    id: 'archeryRange', name: 'Archery Range', category: 'military',
    description: 'Butts and a shooting line for training archers, 4 at a time.',
    size: { w: 3, h: 2 }, cost: { wood: 30, planks: 20 }, work: 360, placement: 'land', blocks: true, buildable: true,
    training: { units: ['archer'], slots: 4 }, reveal: 6, unlock: 'region',
  },
  armory: {
    id: 'armory', name: 'Armory', category: 'military',
    description: 'Racks for swords, bows and armour (holds 120).',
    size: { w: 2, h: 2 }, cost: { stone: 30, planks: 15 }, work: 300, placement: 'land', blocks: true, buildable: true,
    storage: 120, accepts: ['swords', 'bows', 'armor'], reveal: 5, unlock: 'region',
  },
  stable: {
    id: 'stable', name: 'Stable', category: 'military',
    description: 'Four stalls. Horses live only here, and each eats 1 food a day from your stores.',
    size: { w: 3, h: 2 }, cost: { wood: 40, planks: 15 }, work: 320, placement: 'land', blocks: true, buildable: true,
    storage: 4, accepts: ['horses'], reveal: 5, unlock: 'region',
  },
  councilHall: {
    id: 'councilHall', name: 'Council Hall', category: 'realm',
    description: 'Where the council meets and envoys are received. A mark of a settled realm.',
    size: { w: 3, h: 2 }, cost: { stone: 50, planks: 30, tools: 6 }, work: 700, placement: 'land', blocks: true, buildable: true,
    light: 4, reveal: 8, permanent: true, unlock: 'region',
  },
  crate: {
    id: 'crate', name: 'Crate', category: 'storage',
    description: 'Goods a caravan could not unload anywhere. Settlers fetch from it like a store; it disappears once empty.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'land', blocks: false, buildable: false, storage: 500,
  },
  stoneBridge: {
    id: 'stoneBridge', name: 'Stone Bridge', category: 'roads',
    description: 'A permanent stone crossing over any river, even deep water. Drag across the water from bank to bank.',
    size: { w: 1, h: 1 }, cost: {}, work: 0, placement: 'span', blocks: false, buildable: true,
    span: { min: 2, max: 12, costPerTile: { stone: 6, planks: 2 }, workPerTile: 100 },
    maxBuilders: 3, permanent: true, reveal: 8, unlock: 'hamlet',
  },
  path: {
    id: 'path', name: 'Path', category: 'roads',
    description: 'A packed dirt path. Settlers walk faster on it. Drag to lay a route.',
    size: { w: 1, h: 1 }, cost: {}, work: 12, placement: 'land', blocks: false, paint: true, buildable: true,
    convertsTo: 'road', maxBuilders: 1,
  },
  bridge: {
    id: 'bridge', name: 'Bridge', category: 'roads',
    description: 'Wooden planks across shallow water. Opens the far bank to explore.',
    size: { w: 1, h: 1 }, cost: { planks: 2 }, work: 50, placement: 'water', blocks: false, paint: true, buildable: true,
    convertsTo: 'bridge', maxBuilders: 1, unlock: 'hamlet',
  },
  fence: {
    id: 'fence', name: 'Fence', category: 'roads',
    description: 'Wooden fencing that joins up with its neighbours. Drag to draw a line.',
    size: { w: 1, h: 1 }, cost: { wood: 1 }, work: 10, placement: 'land', blocks: true, paint: true, buildable: true, maxBuilders: 1,
  },
  flowerbed: {
    id: 'flowerbed', name: 'Flower Bed', category: 'roads',
    description: 'A planter of cheerful blooms.',
    size: { w: 1, h: 1 }, cost: { wood: 1, stone: 1 }, work: 20, placement: 'land', blocks: true, paint: true, buildable: true, maxBuilders: 1,
  },
  lamp: {
    id: 'lamp', name: 'Lantern Post', category: 'roads',
    description: 'A warm light for evening walks.',
    size: { w: 1, h: 1 }, cost: { planks: 1, stone: 2 }, work: 30, placement: 'land', blocks: true, buildable: true,
    light: 4, maxBuilders: 1, unlock: 'hamlet',
  },
  bench: {
    id: 'bench', name: 'Bench', category: 'roads',
    description: 'A place to sit and watch the valley.',
    size: { w: 2, h: 1 }, cost: { planks: 2 }, work: 30, placement: 'land', blocks: true, buildable: true,
    maxBuilders: 1, unlock: 'village',
  },
  market: {
    id: 'market', name: 'Grand Market', category: 'realm',
    description: 'A great project: colourful stalls around a fountain. Once built it stands in the valley for good.',
    size: { w: 5, h: 4 }, cost: { planks: 40, stone: 60, tools: 8 }, work: 1500, placement: 'land', blocks: true, buildable: true,
    light: 5, reveal: 10, maxBuilders: 4, unlock: 'village',
  },
};
/** Upgrade paths (Warcraft-style: pay, wait, keep working). */
const LEVELS: Partial<Record<BuildingId, LevelDef[]>> = {
  townHall: [
    { name: 'Town Hall', cost: {}, time: 0, perks: [] },
    {
      name: 'Keep', cost: { wood: 60, stone: 80, planks: 30 }, time: 1800, requires: 'hamlet',
      perks: ['Bunks for 14', 'Holds 1000 goods', 'Sees further'], housing: 14, storage: 1000, reveal: 20,
    },
    {
      name: 'Castle', cost: { stone: 160, planks: 60, tools: 15, ironIngot: 10 }, time: 3600, requires: 'village',
      perks: ['Bunks for 20', 'Holds 1600 goods', 'Royal presence: everyone in this town works 10% faster'], housing: 20, storage: 1600, light: 8, reveal: 24,
    },
  ],
  camp: [
    { name: 'Camp', cost: {}, time: 0, perks: [] },
    { name: 'Town Hall', cost: { wood: 40, stone: 30, planks: 10 }, time: 1200, perks: ['Rebuilt in place as a Town Hall: bunks for 10, holds 600', 'Can then become a Keep and a Castle'], becomes: 'townHall' },
  ],
  house: [
    { name: 'House', cost: {}, time: 0, perks: [] },
    { name: 'Stone House', cost: { stone: 15, planks: 6 }, time: 600, perks: ['+1 bed (3)', 'Stone walls'], housing: 3 },
  ],
  familyHome: [
    { name: 'Family Home', cost: {}, time: 0, perks: [] },
    { name: 'Large Family Home', cost: { stone: 20, planks: 10 }, time: 720, perks: ['+1 bed (4)'], housing: 4 },
  ],
  cottage: [
    { name: 'Cottage', cost: {}, time: 0, perks: [] },
    { name: 'Manor', cost: { stone: 40, planks: 20, tools: 2 }, time: 1200, requires: 'town', perks: ['+2 beds (6)', 'A lantern by the door'], housing: 6, light: 4 },
  ],
  storehouse: [
    { name: 'Storehouse', cost: {}, time: 0, perks: [] },
    { name: 'Large Storehouse', cost: { wood: 20, stone: 20, planks: 10 }, time: 720, perks: ['Holds 450 goods'], storage: 450 },
    { name: 'Warehouse', cost: { stone: 40, planks: 20, tools: 2 }, time: 1200, requires: 'village', perks: ['Holds 650 goods', 'Reveals more of the land'], storage: 650, reveal: 12 },
  ],
  workshop: [
    { name: 'Workshop', cost: {}, time: 0, perks: [] },
    { name: 'Carpentry', cost: { wood: 20, planks: 15, tools: 2 }, time: 900, perks: ['A second crafter', '50% faster crafting'], maxWorkers: 2, speed: 1.5 },
  ],
  mill: [
    { name: 'Mill', cost: {}, time: 0, perks: [] },
    { name: 'Stone Mill', cost: { stone: 30, planks: 10 }, time: 900, perks: ['A second miller', '50% faster grinding'], maxWorkers: 2, speed: 1.5 },
  ],
  bakery: [
    { name: 'Bakery', cost: {}, time: 0, perks: [] },
    { name: 'Bakehouse', cost: { stone: 25, planks: 10 }, time: 900, perks: ['A second baker', '50% faster baking'], maxWorkers: 2, speed: 1.5 },
  ],
  charcoalKiln: [
    { name: 'Charcoal Kiln', cost: {}, time: 0, perks: [] },
    { name: 'Double Kiln', cost: { stone: 25, planks: 5 }, time: 720, perks: ['A second burner', '30% faster'], maxWorkers: 2, speed: 1.3 },
  ],
  smelter: [
    { name: 'Smelter', cost: {}, time: 0, perks: [] },
    { name: 'Blast Furnace', cost: { stone: 40, planks: 10, tools: 3 }, time: 1200, requires: 'village', perks: ['A second smelter', '50% faster smelting'], maxWorkers: 2, speed: 1.5, light: 4 },
  ],
  forge: [
    { name: 'Forge', cost: {}, time: 0, perks: [] },
    { name: 'Smithy', cost: { stone: 30, planks: 15, ironIngot: 4 }, time: 1200, requires: 'village', perks: ['A second smith', '40% faster forging'], maxWorkers: 2, speed: 1.4 },
  ],
  quarry: [
    { name: 'Quarry', cost: {}, time: 0, perks: [] },
    { name: 'Deep Quarry', cost: { wood: 20, planks: 10, tools: 2 }, time: 900, perks: ['A third quarry worker', '25% faster cutting'], maxWorkers: 3, speed: 1.25 },
  ],
  inn: [
    { name: 'Inn', cost: {}, time: 0, perks: [] },
    { name: 'Coaching Inn', cost: { planks: 20, stone: 20, tools: 2 }, time: 1200, perks: ['Rooms for 4 guests', 'A bright lantern yard'], lodging: 4, light: 6 },
  ],
  depot: [
    { name: 'Caravan Depot', cost: {}, time: 0, perks: [] },
    { name: 'Caravanserai', cost: { planks: 20, stone: 20 }, time: 1200, perks: ['4 teamsters', 'Holds 200 goods'], maxWorkers: 4, storage: 200 },
  ],
  barracks: [
    { name: 'Barracks', cost: {}, time: 0, perks: [] },
    { name: 'Garrison', cost: { stone: 40, planks: 20, tools: 4 }, time: 1500, perks: ['Trains 8 at a time'], trainingSlots: 8 },
  ],
  archeryRange: [
    { name: 'Archery Range', cost: {}, time: 0, perks: [] },
    { name: "Marksmen's Range", cost: { wood: 30, planks: 20 }, time: 1200, perks: ['Trains 8 at a time'], trainingSlots: 8 },
  ],
  stable: [
    { name: 'Stable', cost: {}, time: 0, perks: [] },
    { name: 'Great Stable', cost: { wood: 40, planks: 20 }, time: 1200, perks: ['8 stalls'], storage: 8 },
  ],
};
for (const [id, levels] of Object.entries(LEVELS)) BUILDINGS[id as BuildingId].levels = levels;

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export function buildingDef(id: BuildingId): BuildingDef {
  return BUILDINGS[id];
}
export function isBuildingId(v: unknown): v is BuildingId {
  return typeof v === 'string' && v in BUILDINGS;
}
