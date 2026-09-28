export interface ResourceDef {
  id: string;
  name: string;
  description: string;
}

export const RESOURCES = {
  food: { id: 'food', name: 'Food', description: 'Berries and harvested crops. Settlers eat it, and a surplus attracts newcomers.' },
  wood: { id: 'wood', name: 'Wood', description: 'Chopped from trees. The backbone of early construction.' },
  stone: { id: 'stone', name: 'Stone', description: 'Mined from rocks and boulders.' },
  planks: { id: 'planks', name: 'Planks', description: 'Sawn at a workshop from wood. Used for bridges and finer buildings.' },
  tools: { id: 'tools', name: 'Tools', description: 'Crafted at a workshop. A well-equipped settlement works faster.' },
  wheat: { id: 'wheat', name: 'Wheat', description: 'Harvested from wheat fields. A mill grinds it into flour.' },
  flour: { id: 'flour', name: 'Flour', description: 'Ground at a mill. A bakery turns it into bread (food).' },
  coal: { id: 'coal', name: 'Coal', description: 'Mined from coal seams. Fuel for the smelter, burning like charcoal.' },
  charcoal: { id: 'charcoal', name: 'Charcoal', description: 'Wood slow-burned in a charcoal kiln. Fuel for the smelter when there is no coal.' },
  copperOre: { id: 'copperOre', name: 'Copper ore', description: 'Mined from a copper deposit. A smelter turns it into copper ingots.' },
  ironOre: { id: 'ironOre', name: 'Iron ore', description: 'Mined from an iron deposit. A smelter turns it into iron ingots.' },
  copperIngot: { id: 'copperIngot', name: 'Copper ingot', description: 'Smelted copper. A forge makes tools from it.' },
  ironIngot: { id: 'ironIngot', name: 'Iron ingot', description: 'Smelted iron. A forge makes twice the tools from it.' },
  silverOre: { id: 'silverOre', name: 'Silver ore', description: 'Valued by traders. Not needed for any building or tool.' },
  goldOre: { id: 'goldOre', name: 'Gold ore', description: 'Rare and prized by traders. Not needed for any building or tool.' },
  diamonds: { id: 'diamonds', name: 'Diamonds', description: 'Very rare gems for prestige and trade. Not needed for any building or tool.' },
  apples: { id: 'apples', name: 'Apples', description: 'Picked in orchards. Travellers settle for a welcome package of apples; a workshop can dry spare ones into food.' },
} as const satisfies Record<string, ResourceDef>;

export type ResourceId = keyof typeof RESOURCES;
export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];
export type Inventory = Partial<Record<ResourceId, number>>;

export function isResourceId(v: unknown): v is ResourceId {
  return typeof v === 'string' && v in RESOURCES;
}
