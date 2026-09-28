// One-off per generator: records what generator N produces, so its worlds can be checked against it forever.
// Run: npx tsx scripts/make-gen-fingerprint.ts <gen>   (never re-run for a generator that has shipped)
import { existsSync, writeFileSync } from 'node:fs';
import { generateChunk } from '../src/game/world/worldgen';

const gen = Number(process.argv[2] ?? 1);
const file = `tests/fixtures/gen-v${gen}-fingerprint.json`;
if (existsSync(file)) throw new Error(`${file} exists: a shipped generator's fingerprint must never be regenerated`);
function fnv(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
}
const out: Record<string, [number, number]> = {};
// Spawn, the river to the east, far north and south, and negative coordinates.
for (const seed of [424242, 12345, 777]) {
  for (const [cx, cy] of [[0, 0], [1, 0], [-1, 1], [3, -2], [-4, -4], [6, 5], [0, -2], [-2, -3], [1, 2]]) {
    const c = generateChunk(seed, cx, cy, gen);
    out[`${seed}:${cx}:${cy}`] = [fnv(c.terrain), fnv(c.obj)];
  }
}
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, `generator-${gen} chunks fingerprinted`);
