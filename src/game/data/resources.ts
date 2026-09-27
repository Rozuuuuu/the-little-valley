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
  apples: { id: 'apples', name: 'Apples', description: 'Picked in orchards. Travellers settle for a welcome package of apples; a workshop can dry spare ones into food.' },
} as const satisfies Record<string, ResourceDef>;

export type ResourceId = keyof typeof RESOURCES;
export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];
export type Inventory = Partial<Record<ResourceId, number>>;

export function isResourceId(v: unknown): v is ResourceId {
  return typeof v === 'string' && v in RESOURCES;
}
