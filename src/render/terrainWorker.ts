/// <reference lib="webworker" />
import { computePixels, type GroundSeason } from './terrainPainter';

export interface PaintRequest {
  id: number;
  seed: number;
  cx: number;
  cy: number;
  terr: Uint8Array;
  season: GroundSeason;
}

/** Paints chunk ground off the main thread so exploring never stutters. */
self.onmessage = (e: MessageEvent<PaintRequest>) => {
  const { id, seed, cx, cy, terr, season } = e.data;
  const pixels = computePixels(seed, cx, cy, terr, season);
  (self as unknown as Worker).postMessage({ id, pixels }, [pixels.buffer]);
};
