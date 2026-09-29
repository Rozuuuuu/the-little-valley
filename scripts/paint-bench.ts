// Times painting one chunk of ground (the terrain worker's job for each chunk that comes into view).
// Usage: npx tsx scripts/paint-bench.ts
import { computePixels, terrainGrid } from '../src/render/terrainPainter';
import { createNewGame } from '../src/game/sim/newGame';

const sim = createNewGame(4242);
const chunks = [];
for (let cy = -2; cy <= 1; cy++) for (let cx = -2; cx <= 1; cx++) chunks.push(sim.world.chunk(cx, cy));
for (const c of chunks) computePixels(sim.seed, c.cx, c.cy, terrainGrid(sim.world, c), 'spring');
const t0 = performance.now();
for (let i = 0; i < 3; i++) for (const c of chunks) computePixels(sim.seed, c.cx, c.cy, terrainGrid(sim.world, c), 'spring');
console.log(`per chunk: ${((performance.now() - t0) / (3 * chunks.length)).toFixed(1)} ms`);
