import { DAY_TICKS } from '../core/constants';
import { SEASON_DAYS, SEASON_ORDER, SEASONS, type SeasonDef, type SeasonId } from '../data/seasons';
import { HUNGER_DECAY, MEAL_VALUE } from './settlers';
import type { Simulation } from './Simulation';

export interface SeasonInfo {
  id: SeasonId;
  def: SeasonDef;
  /** 1-based day within the season. */
  day: number;
  year: number;
  /** 0..1 through the season. */
  progress: number;
}

/** Seasons follow the calendar day, so they need no saved state. Day 1 is the first day of spring. */
export function seasonOf(sim: Simulation): SeasonInfo {
  const dayIndex = sim.day - 1;
  const seasonIndex = Math.floor(dayIndex / SEASON_DAYS) % 4;
  const id = SEASON_ORDER[seasonIndex];
  const dayInSeason = (dayIndex % SEASON_DAYS) + 1;
  const progress = ((dayIndex % SEASON_DAYS) + sim.timeOfDay) / SEASON_DAYS;
  return { id, def: SEASONS[id], day: dayInSeason, year: Math.floor(dayIndex / (SEASON_DAYS * 4)) + 1, progress };
}

/** Food one settler eats per in-game day, on average. */
export function foodPerSettlerPerDay(): number {
  return (HUNGER_DECAY * DAY_TICKS) / MEAL_VALUE;
}

export interface WinterForecast {
  /** Days until winter starts (0 while it is winter). */
  daysUntil: number;
  /** Winter days still ahead, including the current one if in winter. */
  winterDaysLeft: number;
  /** Food needed to feed everyone through the rest of winter. */
  needed: number;
  stored: number;
  ok: boolean;
  text: string;
}

/**
 * How ready the stores are for winter: food needed for the coming winter at
 * today's population, against what is stored. Purely advisory — nobody
 * starves, they just work more slowly while hungry.
 */
export function winterForecast(sim: Simulation): WinterForecast {
  const s = seasonOf(sim);
  const dayIndex = sim.day - 1;
  const yearDay = dayIndex % (SEASON_DAYS * 4);
  const winterStart = SEASON_DAYS * 3;
  const inWinter = s.id === 'winter';
  const daysUntil = inWinter ? 0 : winterStart - yearDay - sim.timeOfDay;
  const winterDaysLeft = inWinter ? SEASON_DAYS - (yearDay - winterStart) - sim.timeOfDay : SEASON_DAYS;
  const needed = Math.ceil(sim.settlers.length * foodPerSettlerPerDay() * winterDaysLeft);
  const stored = sim.storedTotal('food');
  const ok = stored >= needed;
  const until = Math.max(0, Math.ceil(daysUntil));
  const text = inWinter
    ? ok
      ? `Winter: ${stored} food stored, about ${needed} needed until spring. Everyone will eat well.`
      : `Winter: ${stored} food stored, about ${needed} needed until spring. Settlers may go hungry and work slower — bread from stored wheat helps.`
    : `Winter in ${until} day${until === 1 ? '' : 's'}: ${stored} food stored, about ${needed} needed to eat well through it.`;
  return { daysUntil: Math.max(0, daysUntil), winterDaysLeft, needed, stored, ok, text };
}

/** Called each tick: announces a new season once, when it begins. */
export function updateSeason(sim: Simulation): void {
  const s = seasonOf(sim);
  if (sim.lastSeason === s.id) return;
  const first = sim.lastSeason === null;
  sim.lastSeason = s.id;
  if (first) return;
  sim.toast(s.def.arrival, s.id === 'winter' ? 'warn' : 'info');
  sim.record('season', `${s.def.name} began (year ${s.year})`);
  sim.emit({ type: 'season', id: s.id });
  sim.emit({ type: 'important' });
}

