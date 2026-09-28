import type { ResourceId } from '../data/resources';

/** Terrain ids are stored in Uint8Arrays, so they are plain numbers. */
export const T = {
  DeepWater: 0,
  Water: 1,
  Sand: 2,
  Grass: 3,
  Meadow: 4,
  Forest: 5,
  Rocky: 6,
  Road: 7,
  Bridge: 8,
  StoneBridge: 9,
  /** Generator 3+: walkable, buildable slopes. */
  Hill: 10,
  /** Generator 3+: impassable cliff faces of mountains and outcrops. */
  Mountain: 11,
} as const;
export type TerrainId = (typeof T)[keyof typeof T];

export interface TerrainDef {
  name: string;
  walkable: boolean;
  /** Buildings with the `land` rule may go here. */
  buildable: boolean;
  /** Fields may go here. Fertility multiplies crop growth. */
  fertility: number;
  /** Path cost multiplier; lower is faster. */
  moveCost: number;
  /** Higher-priority terrain spreads its pixels over lower terrain at borders. */
  priority: number;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  [T.DeepWater]: { name: 'Deep water', walkable: false, buildable: false, fertility: 0, moveCost: 1, priority: 0 },
  [T.Water]: { name: 'Shallow water', walkable: false, buildable: false, fertility: 0, moveCost: 1, priority: 1 },
  [T.Sand]: { name: 'Sandy bank', walkable: true, buildable: true, fertility: 0, moveCost: 1.1, priority: 2 },
  [T.Grass]: { name: 'Grassland', walkable: true, buildable: true, fertility: 1, moveCost: 1, priority: 4 },
  [T.Meadow]: { name: 'Fertile meadow', walkable: true, buildable: true, fertility: 1.35, moveCost: 1, priority: 5 },
  [T.Forest]: { name: 'Forest floor', walkable: true, buildable: true, fertility: 0.9, moveCost: 1.1, priority: 6 },
  [T.Rocky]: { name: 'Rocky hillside', walkable: true, buildable: true, fertility: 0, moveCost: 1.25, priority: 3 },
  [T.Road]: { name: 'Path', walkable: true, buildable: false, fertility: 0, moveCost: 0.6, priority: 8 },
  [T.Bridge]: { name: 'Bridge', walkable: true, buildable: false, fertility: 0, moveCost: 0.6, priority: 9 },
  [T.StoneBridge]: { name: 'Stone bridge', walkable: true, buildable: false, fertility: 0, moveCost: 0.6, priority: 10 },
  [T.Hill]: { name: 'Hill slope', walkable: true, buildable: true, fertility: 0.6, moveCost: 1.45, priority: 7 },
  [T.Mountain]: { name: 'Mountain face', walkable: false, buildable: false, fertility: 0, moveCost: 1, priority: 11 },
};

export const O = {
  None: 0,
  Oak: 1,
  Pine: 2,
  Berry: 3,
  BerryEmpty: 4,
  Rock: 5,
  Boulder: 6,
  Stump: 7,
  Sapling: 8,
} as const;
export type ObjectId = (typeof O)[keyof typeof O];

export interface ObjectDef {
  name: string;
  blocks: boolean;
  resource?: ResourceId;
  /** Starting resource amount. */
  amount: number;
  /** Work ticks to extract one unit. */
  workTicks: number;
  /** What the tile becomes when emptied. */
  depletesTo: ObjectId;
  /** Growth into another object after this many ticks. */
  regrow?: { to: ObjectId; ticks: number };
  /** Tool shown while working it. */
  tool?: 'axe' | 'pick' | 'hand';
}

export const OBJECTS: Record<ObjectId, ObjectDef> = {
  [O.None]: { name: 'Nothing', blocks: false, amount: 0, workTicks: 0, depletesTo: O.None },
  [O.Oak]: { name: 'Oak tree', blocks: true, resource: 'wood', amount: 10, workTicks: 11, depletesTo: O.Stump, tool: 'axe' },
  [O.Pine]: { name: 'Pine tree', blocks: true, resource: 'wood', amount: 8, workTicks: 10, depletesTo: O.Stump, tool: 'axe' },
  [O.Berry]: { name: 'Berry bush', blocks: true, resource: 'food', amount: 5, workTicks: 9, depletesTo: O.BerryEmpty, tool: 'hand' },
  [O.BerryEmpty]: { name: 'Picked berry bush', blocks: true, amount: 0, workTicks: 0, depletesTo: O.BerryEmpty, regrow: { to: O.Berry, ticks: 3600 } },
  [O.Rock]: { name: 'Rock', blocks: true, resource: 'stone', amount: 6, workTicks: 15, depletesTo: O.None, tool: 'pick' },
  [O.Boulder]: { name: 'Boulder', blocks: true, resource: 'stone', amount: 16, workTicks: 17, depletesTo: O.None, tool: 'pick' },
  [O.Stump]: { name: 'Tree stump', blocks: false, amount: 0, workTicks: 0, depletesTo: O.Stump, regrow: { to: O.Sapling, ticks: 5200 } },
  [O.Sapling]: { name: 'Sapling', blocks: false, amount: 0, workTicks: 0, depletesTo: O.Sapling, regrow: { to: O.Oak, ticks: 5200 } },
};

/** Objects that can be marked for harvest share a group so chained orders stick to one kind. */
export function objectGroup(o: ObjectId): ResourceId | null {
  return OBJECTS[o].resource ?? null;
}
