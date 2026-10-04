// Times the golden path corpus (godot/tests/golden/paths.json) in Node, for comparison with
// the Godot benchmark (godot/tools/bench_path.gd). Run: npx tsx scripts/bench-paths.ts
import { readFileSync } from 'node:fs';
import { findPath, lastPathStats, type Goal } from '../src/game/sim/pathfinding';
import { TERRAIN } from '../src/game/world/tiles';
import { World } from '../src/game/world/World';

const data = JSON.parse(readFileSync('godot/tests/golden/paths.json', 'utf8')) as {
  seed: number; gen: number; habitat: 'valley'; lo: number; hi: number;
  paths: { sx: number; sy: number; goal: Goal; maxNodes: number; partial: boolean }[];
};
const w = new World(data.seed, data.gen, data.habitat);
for (let cy = -3; cy <= 3; cy++) for (let cx = -3; cx <= 3; cx++) w.chunk(cx, cy);
const grid = {
  walkable: (x: number, y: number) => x >= data.lo && x <= data.hi && y >= data.lo && y <= data.hi && w.naturallyWalkable(x, y),
  cost: (x: number, y: number) => TERRAIN[w.terrain(x, y)].moveCost,
};
for (let round = 0; round < 5; round++) {
  let nodes = 0;
  const t0 = performance.now();
  for (const p of data.paths) {
    findPath(grid, p.sx, p.sy, p.goal, p.maxNodes, p.partial);
    nodes += lastPathStats.expanded;
  }
  const ms = performance.now() - t0;
  console.log(`round ${round}: ${nodes} nodes in ${ms.toFixed(1)} ms (${((ms * 1000) / nodes).toFixed(3)} µs per node)`);
}
