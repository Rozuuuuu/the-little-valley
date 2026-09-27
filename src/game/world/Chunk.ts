import { CHUNK } from '../core/constants';

export const CHUNK_AREA = CHUNK * CHUNK;

/**
 * A square of tiles stored as flat typed arrays. `version` bumps whenever tiles
 * change so the renderer knows to rebuild its cached image; `fogVersion` does the
 * same for exploration.
 */
export class Chunk {
  readonly terrain = new Uint8Array(CHUNK_AREA);
  readonly obj = new Uint8Array(CHUNK_AREA);
  readonly amt = new Uint8Array(CHUNK_AREA);
  readonly explored = new Uint8Array(CHUNK_AREA);
  /** Tiles differ from what the seed would generate, so the chunk must be saved in full. */
  modified = false;
  exploredCount = 0;
  version = 0;
  /** Bumps only when terrain changes (ground image must be repainted). */
  terrainVersion = 0;
  fogVersion = 0;

  constructor(
    readonly cx: number,
    readonly cy: number,
  ) {}
}
