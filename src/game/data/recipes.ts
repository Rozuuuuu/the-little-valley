import type { Inventory } from './resources';

export interface RecipeDef {
  id: string;
  name: string;
  inputs: Inventory;
  outputs: Inventory;
  /** Crafter work ticks per batch. */
  work: number;
}

export type RecipeId = 'planks' | 'tools' | 'flour' | 'bread';

export const RECIPES: Record<RecipeId, RecipeDef> = {
  planks: { id: 'planks', name: 'Saw planks', inputs: { wood: 2 }, outputs: { planks: 1 }, work: 60 },
  tools: { id: 'tools', name: 'Craft tools', inputs: { planks: 1, stone: 2 }, outputs: { tools: 1 }, work: 110 },
  flour: { id: 'flour', name: 'Grind flour', inputs: { wheat: 3 }, outputs: { flour: 2 }, work: 70 },
  bread: { id: 'bread', name: 'Bake bread', inputs: { flour: 2, wood: 1 }, outputs: { food: 5 }, work: 90 },
};
export function recipeDef(id: RecipeId): RecipeDef {
  return RECIPES[id];
}
export function isRecipeId(v: unknown): v is RecipeId {
  return typeof v === 'string' && v in RECIPES;
}
