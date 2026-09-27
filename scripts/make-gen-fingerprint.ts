// One-off: records what generator v1 produces, so old worlds can be checked against it forever.
import { writeFileSync } from 'node:fs';
import { generateChunk } from '../src/game/world/worldgen';

function fnv(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
}
const out: Record<string, [number, number]> = {};
for (const seed of [424242, 12345, 777]) {
  for (const [cx, cy] of [[0, 0], [1, 0], [-1, 1], [3, -2], [-4, -4], [6, 5]]) {
    const c = generateChunk(seed, cx, cy);
    out[`${seed}:${cx}:${cy}`] = [fnv(c.terrain), fnv(c.obj)];
  }
}
writeFileSync('tests/fixtures/gen-v1-fingerprint.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'chunks fingerprinted');
