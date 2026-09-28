import { DAY_TICKS } from '../core/constants';

/**
 * Timings and thresholds for deliberate growth (families and recruited
 * travellers). Ages and waits are measured in game days, never real time, and
 * nothing advances while the game is closed.
 */

/** Unreserved food a settlement must keep for a family to grow or a traveller to settle. */
export const GROWTH_MIN_FOOD = 20;
/** Days of steady conditions (bed, food, parents together) before a requested child is born. */
export const CHILD_STABLE_TICKS = 2 * DAY_TICKS;
/** A child grows up after this long (12 game days, about 58 minutes at 1x). */
export const CHILD_ADULT_TICKS = 12 * DAY_TICKS;
/** A household rests this long after a birth before it can ask for another child. */
export const FAMILY_COOLDOWN = 4 * DAY_TICKS;
/** Updates run this often (ticks); pending growth advances in these steps. */
export const GROWTH_STEP = 50;

/** Food a traveller asks for as their welcome package (on top of the reserve the settlement keeps). */
export const RECRUIT_FOOD = 40;
/** At most one traveller settles per this many ticks. */
export const RECRUIT_COOLDOWN = 2 * DAY_TICKS;
/** A visitor waits this long for an answer before moving on. */
export const OFFER_LIFETIME = 2 * DAY_TICKS;
/** Gap between one visitor leaving (or settling) and the next arriving. */
export const VISITOR_INTERVAL = DAY_TICKS / 2;
/** When the first visitor of a new valley arrives. */
export const FIRST_VISITOR_TICK = DAY_TICKS / 4;
/** How long an accepted traveller takes to walk in and settle. */
export const RECRUIT_TRAVEL_TICKS = 240;

/** Growing-season ticks for a new orchard to establish before it bears fruit. */
export const ORCHARD_ESTABLISH_TICKS = 2 * DAY_TICKS;
/** Apples a tended orchard ripens per growing-season day. */
export const ORCHARD_APPLES_PER_DAY = 25;
/** Most apples waiting on the trees at once. */
export const ORCHARD_MAX_FRUIT = 40;
/** A tending visit keeps the trees bearing for this long. */
export const ORCHARD_CARE_TICKS = DAY_TICKS;
/** Pick once at least this many apples are ripe. */
export const ORCHARD_PICK_MIN = 8;
