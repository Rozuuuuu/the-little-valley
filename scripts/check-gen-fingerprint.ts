// Verifies generator 1 still produces exactly the fingerprinted chunks.
import { readFileSync } from 'node:fs';
import { generateChunk } from '../src/game/world/worldgen';

const fp = JSON.parse(readFileSync('tests/fixtures/gen-v1-fingerprint.json', 'utf8')) as Record<string, [number, number]>;
const fnv = (b: Uint8Array) => { let h = 2166136261; for (const x of b) h = Math.imul(h ^ x, 16777619); return h >>> 0; };
let bad = 0;
for (const [k, [t, o]] of Object.entries(fp)) {
  const [seed, cx, cy] = k.split(':').map(Number);
  const c = generateChunk(seed, cx, cy, 1);
  if (fnv(c.terrain) !== t || fnv(c.obj) !== o) { bad++; console.log('MISMATCH', k); }
}
console.log(`${Object.keys(fp).length - bad}/${Object.keys(fp).length} generator-1 chunks identical`);
process.exit(bad ? 1 : 0);
