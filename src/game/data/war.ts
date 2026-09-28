import { DAY_TICKS } from '../core/constants';

/** Soldiers that may be in the field at once, across every side. Extra companies wait as reserves. */
export const ACTIVE_BUDGET = 64;
/** Soldiers a rival company counts as. */
export const RIVAL_COMPANY_SOLDIERS = 4;
/** Morale below this and a company breaks off and goes home. */
export const MORALE_BREAK = 25;
/** A company that broke off can't attack again for this long. */
export const REGROUP_TICKS = DAY_TICKS / 2;
/** Holding enemy frontier land unopposed for this long occupies it. */
export const OCCUPY_TICKS = DAY_TICKS / 2;
/** An undefended town's surrender meter fills in this long under a supplied siege. */
export const SIEGE_TICKS = 2 * DAY_TICKS;
/** Enemy soldiers this close to a cart seize its cargo. */
export const CAPTURE_RANGE = 3;
/** Rival companies take this many days of supplies into the field. */
export const RIVAL_SUPPLY_DAYS = 3;
/** Damage per combat step, per point of strength. */
export const DAMAGE_RATE = 0.06;
export const COMBAT_STEP = 5;
/** AI kingdoms at war with each other make peace after this many days. */
export const AI_WAR_DAYS = 4;
