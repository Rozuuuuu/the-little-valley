/** In-game days per season. A year is four seasons. */
export const SEASON_DAYS = 4;

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonDef {
  id: SeasonId;
  name: string;
  /** Short line shown when the season begins. */
  arrival: string;
  /** Multiplies every crop's growth. Winter pauses growing entirely (never kills). */
  growth: number;
  /** Multiplies how fast fields dry out. */
  drying: number;
  /** Chance that a weather check brings rain (or snow in winter). */
  rainChance: number;
  /** Seeds can be planted this season. */
  planting: boolean;
  /** Berry bushes refill this season. */
  berriesRegrow: boolean;
}

export const SEASONS: Record<SeasonId, SeasonDef> = {
  spring: {
    id: 'spring', name: 'Spring', arrival: 'Spring has come. The soil is soft and ready for seeds.',
    growth: 1.1, drying: 0.9, rainChance: 0.7, planting: true, berriesRegrow: true,
  },
  summer: {
    id: 'summer', name: 'Summer', arrival: 'Summer is here. Crops grow fast, but fields dry quickly.',
    growth: 1.2, drying: 1.5, rainChance: 0.45, planting: true, berriesRegrow: true,
  },
  autumn: {
    id: 'autumn', name: 'Autumn', arrival: 'Autumn colours the valley. Bring in the harvest before winter.',
    growth: 0.9, drying: 0.8, rainChance: 0.6, planting: true, berriesRegrow: true,
  },
  winter: {
    id: 'winter', name: 'Winter', arrival: 'Winter settles in. Fields rest until spring — the stores will feed everyone.',
    growth: 0, drying: 0.3, rainChance: 0.5, planting: false, berriesRegrow: false,
  },
};

export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];
