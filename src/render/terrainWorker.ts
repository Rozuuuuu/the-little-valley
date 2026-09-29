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
 * goes back as four ImageBitmaps, one per quarter: ready for the GPU, and a quarter of the
 * size each, so sending one to the graphics card never takes long enough to hitch a frame.
 * Browsers without bitmaps in workers get the raw pixels.
 */
self.onmessage = async (e: MessageEvent<PaintRequest>) => {
  const { id, seed, cx, cy, terr, season, size } = e.data;
  const pixels = computePixels(seed, cx, cy, terr, season);
  const worker = self as unknown as Worker;
  if (typeof createImageBitmap === 'function' && typeof ImageData === 'function') {
    try {
      const img = new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer), size, size);
      const h = size / 2;
      const bitmaps = await Promise.all([[0, 0], [h, 0], [0, h], [h, h]].map(([x, y]) => createImageBitmap(img, x, y, h, h)));
      worker.postMessage({ id, bitmaps }, bitmaps);
      return;
    } catch {
      // Fall through to raw pixels.
    }
  }
  worker.postMessage({ id, pixels }, [pixels.buffer]);
};
