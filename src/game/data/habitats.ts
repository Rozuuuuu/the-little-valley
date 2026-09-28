/**
 * Habitats a new world can be created in (generator 4+). The seed still decides the
 * details; the habitat decides the character of the land and which wild animals live
 * there. Every habitat puts a mountain range inside the first view.
 */
export type HabitatId = 'valley' | 'highlands' | 'forest' | 'plains' | 'marsh';

export interface HabitatDef {
  id: HabitatId;
  name: string;
  description: string;
  /** Distance north of the spawn to the middle of the near mountain range. */
  rangeDistance: number;
  /** Half-thickness of the range's cliff core (tiles). */
  rangeCore: number;
  /** Lone peaks and hills away from the range: elevation thresholds and their minimum distance. */
  peakAbove: number;
  hillAbove: number;
  peakMinDistance: number;
  /** Moisture above which ground is forest. */
  forestAbove: number;
  /** Moisture band that is meadow. */
  meadowBelow: number;
  /** Chance of a tree on open grass. */
  grassTrees: number;
  /** Elevation below which lakes form (higher = wetter). */
  lakeBelow: number;
  /** Extra scattered ponds (0 = none). */
  ponds: number;
  /** Elevation above which ground is rocky. */
  rockyAbove: number;
  /** Whether the great river runs east of the spawn. */
  river: boolean;
  /** Minimap swatch for the new-world picker. */
  colors: [string, string, string];
}

export const HABITATS: Record<HabitatId, HabitatDef> = {
  valley: {
    id: 'valley', name: 'Meadow Valley',
    description: 'Gentle meadows, a great river to the east and a mountain range on the northern skyline. Balanced and forgiving.',
    rangeDistance: 26, rangeCore: 3, peakAbove: 0.74, hillAbove: 0.66, peakMinDistance: 36,
    forestAbove: 0.555, meadowBelow: 0.555, grassTrees: 0.045, lakeBelow: 0.33, ponds: 0, rockyAbove: 0.6, river: true,
    colors: ['#5d9a45', '#8fc05a', '#3b82b4'],
  },
  highlands: {
    id: 'highlands', name: 'Highlands',
    description: 'Mountains all around: rich in stone and ore, with hill pastures and narrow passes. Less flat land to farm.',
    rangeDistance: 20, rangeCore: 5, peakAbove: 0.6, hillAbove: 0.5, peakMinDistance: 18,
    forestAbove: 0.6, meadowBelow: 0.6, grassTrees: 0.035, lakeBelow: 0.28, ponds: 0, rockyAbove: 0.52, river: false,
    colors: ['#8a8f96', '#6f9a52', '#d8dde2'],
  },
  forest: {
    id: 'forest', name: 'Deep Forest',
    description: 'Old woods of oak and pine full of deer and boar. Endless timber, but fields must be cleared from the trees.',
    rangeDistance: 28, rangeCore: 3, peakAbove: 0.76, hillAbove: 0.68, peakMinDistance: 36,
    forestAbove: 0.44, meadowBelow: 0.44, grassTrees: 0.11, lakeBelow: 0.3, ponds: 0, rockyAbove: 0.64, river: true,
    colors: ['#2f6a3a', '#4f8a44', '#1f4a2c'],
  },
  plains: {
    id: 'plains', name: 'Grassland Plains',
    description: 'Wide open grass where wild horses and bison roam. Easy farming and building, but wood is scarce.',
    rangeDistance: 23, rangeCore: 2, peakAbove: 0.8, hillAbove: 0.72, peakMinDistance: 40,
    forestAbove: 0.66, meadowBelow: 0.62, grassTrees: 0.012, lakeBelow: 0.3, ponds: 0, rockyAbove: 0.7, river: true,
    colors: ['#9bc25a', '#c9d98a', '#6f9a45'],
  },
  marsh: {
    id: 'marsh', name: 'Lakes & Marsh',
    description: 'A land of lakes, ponds and reeds with ducks, beavers and moose. Fertile shores, winding paths and many bridges.',
    rangeDistance: 26, rangeCore: 3, peakAbove: 0.78, hillAbove: 0.7, peakMinDistance: 36,
    forestAbove: 0.6, meadowBelow: 0.6, grassTrees: 0.04, lakeBelow: 0.42, ponds: 0.62, rockyAbove: 0.66, river: false,
    colors: ['#3b82b4', '#6fae68', '#8fc9e0'],
  },
};

export const HABITAT_IDS = Object.keys(HABITATS) as HabitatId[];

export function isHabitatId(v: unknown): v is HabitatId {
  return typeof v === 'string' && v in HABITATS;
}
