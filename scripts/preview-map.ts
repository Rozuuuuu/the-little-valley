import { World } from '../src/game/world/World';
import { O, T } from '../src/game/world/tiles';

const seed = Number(process.argv[2] ?? 12345);
const R = Number(process.argv[3] ?? 40);
const w = new World(seed);
const tch: Record<number, string> = { [T.DeepWater]: '#', [T.Water]: '~', [T.Sand]: ':', [T.Grass]: '.', [T.Meadow]: ',', [T.Forest]: '"', [T.Rocky]: '^' };
const och: Record<number, string> = { [O.Oak]: 'T', [O.Pine]: 'A', [O.Berry]: 'b', [O.Rock]: 'o', [O.Boulder]: 'O' };
const counts: Record<string, number> = {};
for (let y = -R / 2; y < R / 2; y++) {
  let line = '';
  for (let x = -R; x < R; x++) {
    const o = w.obj(x, y);
    const c = x === 0 && y === 0 ? '@' : och[o] ?? tch[w.terrain(x, y)];
    counts[c] = (counts[c] ?? 0) + 1;
    line += c;
  }
  console.log(line);
}
console.log(counts);
