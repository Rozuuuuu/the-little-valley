// Verifies every shipped generator still produces exactly its fingerprinted chunks.
import { existsSync, readFileSync } from 'node:fs';
import { generateChunk } from '../src/game/world/worldgen';

const fnv = (b: Uint8Array) => { let h = 2166136261; for (const x of b) h = Math.imul(h ^ x, 16777619); return h >>> 0; };
let failed = 0;
for (let gen = 1; existsSync(`tests/fixtures/gen-v${gen}-fingerprint.json`); gen++) {
  const fp = JSON.parse(readFileSync(`tests/fixtures/gen-v${gen}-fingerprint.json`, 'utf8')) as Record<string, [number, number]>;
  let bad = 0;
  for (const [k, [t, o]] of Object.entries(fp)) {
    const [seed, cx, cy] = k.split(':').map(Number);
    const c = generateChunk(seed, cx, cy, gen);
    if (fnv(c.terrain) !== t || fnv(c.obj) !== o) { bad++; console.log('MISMATCH', gen, k); }
  }
  console.log(`${Object.keys(fp).length - bad}/${Object.keys(fp).length} generator-${gen} chunks identical`);
  failed += bad;
}
process.exit(failed ? 1 : 0);
