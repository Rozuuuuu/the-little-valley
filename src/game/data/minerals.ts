import type { ResourceId } from './resources';

export type MineralId = 'coal' | 'copper' | 'iron' | 'silver' | 'gold' | 'diamond';

export interface MineralDef {
  id: MineralId;
  name: string;
  /** What a mine here produces. */
  resource: ResourceId;
  /**
   * Relative chance that a deposit is this mineral. These are game balance
   * weights, not geological claims.
   */
  weight: number;
  /** Typical units in a deposit (each deposit varies ±25%). */
  amount: number;
  description: string;
}

export const MINERALS: Record<MineralId, MineralDef> = {
  coal: { id: 'coal', name: 'Coal', resource: 'coal', weight: 30, amount: 180, description: 'Burns hotter than charcoal. Fuel for the smelter.' },
  copper: { id: 'copper', name: 'Copper', resource: 'copperOre', weight: 25, amount: 140, description: 'Soft red ore. Smelted into copper ingots for simple tools.' },
  iron: { id: 'iron', name: 'Iron', resource: 'ironOre', weight: 25, amount: 140, description: 'Smelted into iron ingots: the best tools come from these.' },
  silver: { id: 'silver', name: 'Silver', resource: 'silverOre', weight: 12, amount: 70, description: 'Valued by traders. Not needed for any building or tool.' },
  gold: { id: 'gold', name: 'Gold', resource: 'goldOre', weight: 6, amount: 40, description: 'Rare and prized by traders. Not needed for any building or tool.' },
  diamond: { id: 'diamond', name: 'Diamond', resource: 'diamonds', weight: 2, amount: 12, description: 'Very rare gems, for prestige and trade. Not needed for any building or tool.' },
};
export const MINERAL_IDS = Object.keys(MINERALS) as MineralId[];
export function isMineralId(v: unknown): v is MineralId {
  return typeof v === 'string' && v in MINERALS;
}
