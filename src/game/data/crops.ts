import type { Inventory } from './resources';
import type { MilestoneId } from './progression';

export type CropStyle = 'root' | 'grain' | 'vine';

export interface CropDef {
  id: string;
  name: string;
  description: string;
  /** Number of visual growth stages, including the ripe stage. */
  stages: number;
  /** Ticks of watered growth on neutral soil to ripen. */
  growTicks: number;
  yield: Inventory;
  unlock?: MilestoneId;
  /** Rendering hints; the sprite generator reads these. */
  art: { style: CropStyle; leaf: string; leafDark: string; fruit: string; fruitDark: string };
}

export type CropId = 'turnip' | 'wheat' | 'pumpkin';

export const CROPS: Record<CropId, CropDef> = {
  turnip: {
    id: 'turnip',
    name: 'Turnip',
    description: 'Quick and forgiving. A dependable first crop.',
    stages: 4,
    growTicks: 1100,
    yield: { food: 3 },
    art: { style: 'root', leaf: '#6fb04e', leafDark: '#3f7a3a', fruit: '#efe2f0', fruitDark: '#9a5aa8' },
  },
  wheat: {
    id: 'wheat',
    name: 'Wheat',
    description: 'Grain for the mill. Milled and baked, a wheat field feeds far more settlers than any other crop.',
    stages: 4,
    growTicks: 1700,
    yield: { wheat: 4 },
    art: { style: 'grain', leaf: '#7bb45a', leafDark: '#4f8a3c', fruit: '#e9c65a', fruitDark: '#b8913a' },
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    description: 'Takes its time and rewards patience with a hearty harvest.',
    stages: 4,
    growTicks: 2600,
    yield: { food: 9 },
    unlock: 'hamlet',
    art: { style: 'vine', leaf: '#58964a', leafDark: '#2f5e2f', fruit: '#e8873a', fruitDark: '#b35a26' },
  },
};
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export function cropDef(id: CropId): CropDef {
  return CROPS[id];
}
export function isCropId(v: unknown): v is CropId {
  return typeof v === 'string' && v in CROPS;
}
