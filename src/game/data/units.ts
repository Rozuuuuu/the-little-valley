import { DAY_TICKS } from '../core/constants';
import type { BuildingId } from './buildings';
import type { Inventory } from './resources';

export type UnitType = 'infantry' | 'archer' | 'knight';

export interface UnitDef {
  id: UnitType;
  name: string;
  /** Gear each recruit takes from the stores when enlisting (returned on leaving). */
  gear: Inventory;
  /** Drill ticks at the training building to become ready. */
  trainTicks: number;
  trainedAt: BuildingId;
  /** Fighting strength of one ready soldier. */
  strength: number;
  /** Reach in tiles (archers shoot from further away). */
  range: number;
  description: string;
}

export const UNITS: Record<UnitType, UnitDef> = {
  infantry: {
    id: 'infantry', name: 'Infantry', gear: { swords: 1 }, trainTicks: DAY_TICKS / 2, trainedAt: 'barracks', strength: 10, range: 1,
    description: 'Sword and shield. Holds ground.',
  },
  archer: {
    id: 'archer', name: 'Archers', gear: { bows: 1 }, trainTicks: DAY_TICKS / 2, trainedAt: 'archeryRange', strength: 8, range: 4,
    description: 'Bows. Strike from a distance, weak up close.',
  },
  knight: {
    id: 'knight', name: 'Knights', gear: { swords: 1, armor: 1, horses: 1 }, trainTicks: DAY_TICKS, trainedAt: 'barracks', strength: 22, range: 1,
    description: 'Armoured riders: need a horse and armour, and long training.',
  },
};
export const UNIT_TYPES = Object.keys(UNITS) as UnitType[];
export function isUnitType(v: unknown): v is UnitType {
  return typeof v === 'string' && v in UNITS;
}

/** Soldiers per company. */
export const COMPANY_SIZE = 4;
/** Food each deployed soldier eats per day from the company's supplies. */
export const RATION = 1;
/** Readiness lost each day without supplies; at 0 the company comes home. */
export const HUNGRY_READINESS_LOSS = 25;
/** Food a horse eats each day from the stores. */
export const HORSE_FEED = 1;
/** Marching speed on the map (tiles per tick). */
export const MARCH_SPEED = 0.12;
