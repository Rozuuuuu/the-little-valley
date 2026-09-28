import { DAY_TICKS } from '../core/constants';
import { T, type TerrainId } from '../world/tiles';
import type { HabitatId } from './habitats';
import type { ResourceId } from './resources';

/**
 * Animals. Wild species live in the habitats that suit them (researched from
 * European temperate wildlife: meadows, woods, mountains, grassland and wetland);
 * livestock lives in pens and pastures. Predators never attack people: this stays
 * a cozy game. Hunters take game for food and hides.
 */
export type SpeciesId =
  | 'rabbit' | 'hare' | 'deer' | 'boar' | 'fox' | 'wolf' | 'bear' | 'ibex' | 'bison' | 'wildHorse' | 'duck' | 'beaver' | 'moose'
  | 'chicken' | 'pig' | 'sheep' | 'goat' | 'cow' | 'horse';

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  plural: string;
  wild: boolean;
  /** Sprite size class: 1 small, 2 medium, 3 large. */
  size: 1 | 2 | 3;
  /** Walking speed in tiles per tick. */
  speed: number;
  /** Wild prey run from people within this many tiles (0: never flees). */
  fleeFrom: number;
  /** Herd size when a group appears. */
  herd: [number, number];
  /** Ground it lives on. Ducks swim. */
  terrain: readonly TerrainId[];
  swims?: boolean;
  /** What a hunt yields; the aim takes `work` ticks. Absent: not hunted. */
  hunt?: { food: number; hides: number; work: number };
  /** Short note for the inspector and hover text. */
  note: string;
}

const LAND = [T.Grass, T.Meadow, T.Forest, T.Rocky, T.Hill, T.Sand] as const;

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  rabbit: { id: 'rabbit', name: 'Rabbit', plural: 'rabbits', wild: true, size: 1, speed: 0.09, fleeFrom: 4, herd: [2, 4], terrain: [T.Grass, T.Meadow], hunt: { food: 3, hides: 0, work: 25 }, note: 'Quick and shy; lives at meadow edges.' },
  hare: { id: 'hare', name: 'Hare', plural: 'hares', wild: true, size: 1, speed: 0.1, fleeFrom: 5, herd: [1, 3], terrain: [T.Grass, T.Meadow, T.Hill], hunt: { food: 4, hides: 0, work: 30 }, note: 'Runs across open grass and hill pastures.' },
  deer: { id: 'deer', name: 'Deer', plural: 'deer', wild: true, size: 2, speed: 0.08, fleeFrom: 6, herd: [2, 4], terrain: [T.Forest, T.Grass, T.Meadow], hunt: { food: 10, hides: 2, work: 45 }, note: 'Grazes at woodland edges; bolts when people come close.' },
  boar: { id: 'boar', name: 'Wild boar', plural: 'wild boar', wild: true, size: 2, speed: 0.06, fleeFrom: 4, herd: [2, 3], terrain: [T.Forest], hunt: { food: 12, hides: 2, work: 55 }, note: 'Roots for acorns in oak woods.' },
  fox: { id: 'fox', name: 'Fox', plural: 'foxes', wild: true, size: 1, speed: 0.08, fleeFrom: 5, herd: [1, 1], terrain: [T.Grass, T.Meadow, T.Forest], hunt: { food: 2, hides: 1, work: 35 }, note: 'A clever loner. Keeps away from the henhouse, mostly.' },
  wolf: { id: 'wolf', name: 'Wolf', plural: 'wolves', wild: true, size: 2, speed: 0.07, fleeFrom: 7, herd: [2, 4], terrain: [T.Forest, T.Hill, T.Rocky], hunt: { food: 6, hides: 2, work: 70 }, note: 'Wary of people; hunts deer far from towns. Never harms settlers.' },
  bear: { id: 'bear', name: 'Brown bear', plural: 'brown bears', wild: true, size: 3, speed: 0.05, fleeFrom: 6, herd: [1, 1], terrain: [T.Forest, T.Hill, T.Rocky], hunt: { food: 20, hides: 3, work: 90 }, note: 'A great solitary bear of the high woods. Leaves people alone.' },
  ibex: { id: 'ibex', name: 'Mountain goat', plural: 'mountain goats', wild: true, size: 2, speed: 0.07, fleeFrom: 5, herd: [2, 4], terrain: [T.Hill, T.Rocky], hunt: { food: 8, hides: 2, work: 50 }, note: 'Surefooted on hill slopes and rocky ground.' },
  bison: { id: 'bison', name: 'Bison', plural: 'bison', wild: true, size: 3, speed: 0.045, fleeFrom: 5, herd: [3, 5], terrain: [T.Grass, T.Meadow], hunt: { food: 24, hides: 3, work: 80 }, note: 'Wisent roam the grasslands in herds.' },
  wildHorse: { id: 'wildHorse', name: 'Wild horse', plural: 'wild horses', wild: true, size: 3, speed: 0.1, fleeFrom: 7, herd: [3, 5], terrain: [T.Grass, T.Meadow], note: 'Free-running herds of the plains. Too fast to hunt; a horse paddock raises tame ones.' },
  duck: { id: 'duck', name: 'Duck', plural: 'ducks', wild: true, size: 1, speed: 0.04, fleeFrom: 3, herd: [2, 5], terrain: [T.Water], swims: true, hunt: { food: 2, hides: 0, work: 30 }, note: 'Paddles on ponds and lakes.' },
  beaver: { id: 'beaver', name: 'Beaver', plural: 'beavers', wild: true, size: 1, speed: 0.05, fleeFrom: 4, herd: [1, 2], terrain: [T.Sand, T.Grass, T.Meadow], hunt: { food: 3, hides: 1, work: 35 }, note: 'Busy by the water’s edge.' },
  moose: { id: 'moose', name: 'Moose', plural: 'moose', wild: true, size: 3, speed: 0.05, fleeFrom: 5, herd: [1, 2], terrain: [T.Forest, T.Meadow, T.Sand], hunt: { food: 22, hides: 3, work: 80 }, note: 'Wades through marshes and wet woods.' },
  chicken: { id: 'chicken', name: 'Chicken', plural: 'chickens', wild: false, size: 1, speed: 0.04, fleeFrom: 0, herd: [2, 2], terrain: LAND, note: 'Lays eggs.' },
  pig: { id: 'pig', name: 'Pig', plural: 'pigs', wild: false, size: 2, speed: 0.03, fleeFrom: 0, herd: [2, 2], terrain: LAND, note: 'Fattens quickly for meat.' },
  sheep: { id: 'sheep', name: 'Sheep', plural: 'sheep', wild: false, size: 2, speed: 0.03, fleeFrom: 0, herd: [2, 2], terrain: LAND, note: 'Gives wool.' },
  goat: { id: 'goat', name: 'Goat', plural: 'goats', wild: false, size: 2, speed: 0.035, fleeFrom: 0, herd: [2, 2], terrain: LAND, note: 'Gives milk; happy on hills.' },
  cow: { id: 'cow', name: 'Cow', plural: 'cows', wild: false, size: 3, speed: 0.025, fleeFrom: 0, herd: [2, 2], terrain: LAND, note: 'Gives milk; culled for meat and hides.' },
  horse: { id: 'horse', name: 'Horse', plural: 'horses', wild: false, size: 3, speed: 0.05, fleeFrom: 0, herd: [2, 2], terrain: LAND, note: 'Raised for the stables: knights and caravans need them.' },
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

export function isSpeciesId(v: unknown): v is SpeciesId {
  return typeof v === 'string' && v in SPECIES;
}

/** Which wild species live in each habitat, with how common they are. */
export const WILDLIFE: Record<HabitatId, { species: SpeciesId; weight: number }[]> = {
  valley: [{ species: 'rabbit', weight: 4 }, { species: 'deer', weight: 3 }, { species: 'duck', weight: 2 }, { species: 'fox', weight: 1 }, { species: 'boar', weight: 1 }],
  highlands: [{ species: 'ibex', weight: 4 }, { species: 'hare', weight: 3 }, { species: 'deer', weight: 1 }, { species: 'wolf', weight: 1 }, { species: 'bear', weight: 1 }],
  forest: [{ species: 'deer', weight: 4 }, { species: 'boar', weight: 3 }, { species: 'rabbit', weight: 2 }, { species: 'fox', weight: 1 }, { species: 'wolf', weight: 1 }, { species: 'bear', weight: 1 }],
  plains: [{ species: 'hare', weight: 3 }, { species: 'wildHorse', weight: 3 }, { species: 'bison', weight: 3 }, { species: 'rabbit', weight: 2 }, { species: 'fox', weight: 1 }],
  marsh: [{ species: 'duck', weight: 4 }, { species: 'beaver', weight: 2 }, { species: 'moose', weight: 2 }, { species: 'deer', weight: 1 }, { species: 'rabbit', weight: 1 }],
};

/** Most wild animals alive at once, and how often the wild is topped up. */
export const WILD_CAP = 36;
export const WILD_SPAWN_EVERY = 300;
/** Wild herds appear this far from any settlement centre. */
export const WILD_SPAWN_MIN = 12;
export const WILD_SPAWN_MAX = 34;

/** A pen or pasture and the livestock it keeps. */
export interface PenDef {
  species: SpeciesId;
  /** Most animals it holds. */
  capacity: number;
  /** A new animal is born this often while there are at least two and room. */
  breedTicks: number;
  /** What each animal gives, collected by a herder: `amount` every `everyTicks`. */
  product?: { res: ResourceId; amount: number; everyTicks: number };
  /** A full pen culls one animal: what that yields. */
  cull?: { food: number; hides: number };
}

export const HUNT_RADIUS = 24;
/** Most product waiting in a pen before it stops accumulating. */
export const PEN_PRODUCT_CAP = 24;
export const PEN_STEP = 50;
export const BREED_DAY = DAY_TICKS;
