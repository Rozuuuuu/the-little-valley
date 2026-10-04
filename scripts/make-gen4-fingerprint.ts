// One-off: records what generator 4 produces in every habitat, so its worlds (and the Godot port) can be checked against it forever.
// Run: npx tsx scripts/make-gen4-fingerprint.ts   (never re-run once written; the script refuses to overwrite)
// Generator 4 depends on the habitat, which scripts/make-gen-fingerprint.ts does not pass, hence this separate script.
import { existsSync, writeFileSync } from 'node:fs';
import { HABITATS, type HabitatId } from '../src/game/data/habitats';
import { generateChunk } from '../src/game/world/worldgen';

const file = 'tests/fixtures/gen-v4-fingerprint.json';
if (existsSync(file)) throw new Error(`${file} exists: a shipped generator's fingerprint must never be regenerated`);
function fnv(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return h >>> 0;
}
const out: Record<string, [number, number]> = {};
// Spawn, the river to the east, the near range to the north, far land and negative coordinates.
for (const habitat of Object.keys(HABITATS) as HabitatId[]) {
  for (const seed of [424242, 12345, 777]) {
    for (const [cx, cy] of [[0, 0], [1, 0], [-1, 1], [3, -2], [-4, -4], [6, 5], [0, -2], [-2, -3], [1, 2]]) {
      const c = generateChunk(seed, cx, cy, 4, habitat);
      out[`${habitat}:${seed}:${cx}:${cy}`] = [fnv(c.terrain), fnv(c.obj)];
    }
  }
}
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'generator-4 chunks fingerprinted');
