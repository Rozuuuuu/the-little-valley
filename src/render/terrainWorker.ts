/// <reference lib="webworker" />
import { computePixels, type GroundSeason } from './terrainPainter';

export interface PaintRequest {
  id: number;
  seed: number;
  cx: number;
  cy: number;
  terr: Uint8Array;
  season: GroundSeason;
  /** Width and height of the painted chunk in pixels. */
  size: number;
}

/**
 * Paints chunk ground off the main thread so exploring and panning never stutter. The result
 * goes back as an ImageBitmap (ready for the GPU, uploaded once) rather than raw pixels that the
 * main thread would have to copy onto a canvas; browsers without bitmaps in workers get pixels.
 */
self.onmessage = async (e: MessageEvent<PaintRequest>) => {
  const { id, seed, cx, cy, terr, season, size } = e.data;
  const pixels = computePixels(seed, cx, cy, terr, season);
  const worker = self as unknown as Worker;
  if (typeof createImageBitmap === 'function' && typeof ImageData === 'function') {
    try {
      const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer), size, size));
      worker.postMessage({ id, bitmap }, [bitmap]);
      return;
    } catch {
      // Fall through to raw pixels.
    }
  }
  worker.postMessage({ id, pixels }, [pixels.buffer]);
};
