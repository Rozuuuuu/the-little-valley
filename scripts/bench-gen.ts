import { generateChunk } from '../src/game/world/worldgen';
for (let k = 0; k < 2; k++) {
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) generateChunk(12345, i + k * 10, 3);
  console.log('generateChunk ms avg', ((performance.now() - t0) / 10).toFixed(1));
}
