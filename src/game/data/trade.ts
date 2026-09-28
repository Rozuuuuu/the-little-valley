import type { ResourceId } from './resources';

/**
 * What goods are worth to travelling merchants, in abstract value points (no
 * coins yet). Merchants sell above value and buy below it, so trading is useful
 * but not a free lunch. Barter only: nothing is created, every unit moves.
 */
export const PRICES: Record<ResourceId, number> = {
  food: 1, wood: 1, stone: 1, planks: 2, tools: 6, wheat: 1, flour: 2, apples: 1,
  coal: 2, charcoal: 2, copperOre: 3, ironOre: 3, copperIngot: 7, ironIngot: 8,
  silverOre: 10, goldOre: 20, diamonds: 60,
};

/** What a merchant asks for one unit. */
export function sellPrice(res: ResourceId): number {
  return Math.ceil(PRICES[res] * 1.25);
}

/** What a merchant pays for one unit. */
export function buyPrice(res: ResourceId): number {
  return Math.max(1, Math.floor(PRICES[res] * 0.8));
}

/** Goods merchants may carry, with a typical load. Every merchant brings copper or iron ore. */
export const MERCHANT_GOODS: { res: ResourceId; min: number; max: number }[] = [
  { res: 'food', min: 15, max: 30 },
  { res: 'planks', min: 8, max: 16 },
  { res: 'tools', min: 2, max: 6 },
  { res: 'coal', min: 8, max: 16 },
  { res: 'wheat', min: 10, max: 20 },
  { res: 'apples', min: 10, max: 25 },
];
export const MERCHANT_ORES: ResourceId[] = ['copperOre', 'ironOre'];
