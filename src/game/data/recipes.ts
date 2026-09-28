import type { Inventory } from './resources';

export interface RecipeDef {
  id: string;
  name: string;
  inputs: Inventory;
  outputs: Inventory;
  /** Crafter work ticks per batch. */
  work: number;
  /** Units of fuel per batch: coal or charcoal, whichever is on hand (coal first). */
  fuel?: number;
}

/** Resources that count as fuel, burned in this order. */
export const FUELS = ['coal', 'charcoal'] as const;

export type RecipeId =
  | 'planks' | 'tools' | 'flour' | 'bread' | 'driedApples'
  | 'charcoal' | 'smeltCopper' | 'smeltIron' | 'forgeCopperTools' | 'forgeIronTools'
  | 'forgeSwords' | 'forgeArmor' | 'makeBows';

export const RECIPES: Record<RecipeId, RecipeDef> = {
  planks: { id: 'planks', name: 'Saw planks', inputs: { wood: 2 }, outputs: { planks: 1 }, work: 60 },
  tools: { id: 'tools', name: 'Craft tools', inputs: { planks: 1, stone: 2 }, outputs: { tools: 1 }, work: 110 },
  flour: { id: 'flour', name: 'Grind flour', inputs: { wheat: 3 }, outputs: { flour: 2 }, work: 55 },
  bread: { id: 'bread', name: 'Bake bread', inputs: { flour: 2, wood: 1 }, outputs: { food: 5 }, work: 90 },
  driedApples: { id: 'driedApples', name: 'Dry apples', inputs: { apples: 4 }, outputs: { food: 3 }, work: 60 },
  charcoal: { id: 'charcoal', name: 'Burn charcoal', inputs: { wood: 3 }, outputs: { charcoal: 2 }, work: 80 },
  smeltCopper: { id: 'smeltCopper', name: 'Smelt copper', inputs: { copperOre: 2 }, outputs: { copperIngot: 1 }, work: 90, fuel: 1 },
  smeltIron: { id: 'smeltIron', name: 'Smelt iron', inputs: { ironOre: 2 }, outputs: { ironIngot: 1 }, work: 110, fuel: 1 },
  forgeCopperTools: { id: 'forgeCopperTools', name: 'Forge copper tools', inputs: { copperIngot: 1, planks: 1 }, outputs: { tools: 1 }, work: 80 },
  forgeSwords: { id: 'forgeSwords', name: 'Forge swords', inputs: { ironIngot: 1, planks: 1 }, outputs: { swords: 1 }, work: 110 },
  forgeArmor: { id: 'forgeArmor', name: 'Forge armour', inputs: { ironIngot: 2 }, outputs: { armor: 1 }, work: 160 },
  makeBows: { id: 'makeBows', name: 'Make bows', inputs: { planks: 2 }, outputs: { bows: 1 }, work: 90 },
  forgeIronTools: { id: 'forgeIronTools', name: 'Forge iron tools', inputs: { ironIngot: 1, planks: 1 }, outputs: { tools: 2 }, work: 100 },
};
export function recipeDef(id: RecipeId): RecipeDef {
  return RECIPES[id];
}
export function isRecipeId(v: unknown): v is RecipeId {
  return typeof v === 'string' && v in RECIPES;
}
