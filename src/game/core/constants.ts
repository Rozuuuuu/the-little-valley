/** Size of one world tile in source pixels. All art is authored on this grid. */
export const TILE = 16;
/** Tiles per chunk edge. Chunks are the unit of generation, caching and saving. */
export const CHUNK = 32;
export const CHUNK_SHIFT = 5;
export const CHUNK_MASK = CHUNK - 1;

/** Fixed simulation rate. Rendering interpolates between ticks. */
export const TICKS_PER_SECOND = 10;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** One in-game day is 4.8 real minutes at 1x speed. */
export const DAY_TICKS = 2880;
/** Time-of-day fractions (0 = midnight). The game starts at START_TIME on day 1. */
export const START_TIME = 0.26;
export const DUSK = 0.8;
export const NIGHT_START = 0.87;
export const MORNING = 0.21;

/** Tile keys pack signed coordinates into one safe integer. */
const OFFSET = 1 << 20;
const SPAN = 1 << 21;
export function tileKey(x: number, y: number): number {
  return (x + OFFSET) * SPAN + (y + OFFSET);
}
export function keyX(k: number): number {
  return Math.floor(k / SPAN) - OFFSET;
}
export function keyY(k: number): number {
  return (k % SPAN) - OFFSET;
}
