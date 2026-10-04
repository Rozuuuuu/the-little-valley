// Writes reference values from the TypeScript game for the Godot port to reproduce exactly.
// Run: npx tsx scripts/export-golden.ts   (safe to re-run: generators never change, so the output is stable)
// Floats are written as the 16 hex digits of their IEEE-754 bits, so no decimal parsing can round them.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fbm, hash2, Rng, valueNoise } from '../src/game/core/rng';
import { HABITATS, type HabitatId } from '../src/game/data/habitats';
import { generateChunk, riverCenter } from '../src/game/world/worldgen';

const OUT = 'godot/tests/golden';
mkdirSync(OUT, { recursive: true });

function bits(x: number): string {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x);
  let s = '';
  for (let i = 0; i < 8; i++) s += v.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
const hex = (a: Uint8Array) => Buffer.from(a).toString('hex');

// RNG: sequences, states and derived helpers.
const rng: unknown[] = [];
for (const seed of [0, 1, -1, 424242, 2147483647, -2147483648, 0x5bd1e995, 424242 ^ 0x5bd1e995]) {
  const r = new Rng(seed);
  const values: string[] = [];
  const states: number[] = [];
  for (let i = 0; i < 24; i++) {
    values.push(bits(r.next()));
    states.push(r.state);
  }
  const r2 = new Rng(seed);
  const ints = Array.from({ length: 24 }, (_, i) => r2.int(i + 1));
  rng.push({ seed, values, states, ints });
}

// Hashes and noise at integer, fractional and negative coordinates.
const coords: [number, number][] = [];
for (const x of [-1048575, -70000, -33, -1, 0, 1, 2, 31, 32, 1000, 65537, 1048575]) for (const y of [-513, -1, 0, 7, 99999]) coords.push([x, y]);
const seeds = [0, 1, -1, 424242, 12345 ^ 0x9e37, 777 ^ 0x51f1, -2147483648, 2147483647];
const hashes = coords.flatMap(([x, y]) => seeds.map((s) => [x, y, s, hash2(x, y, s)]));
const fx: [number, number][] = [];
for (let i = 0; i < 200; i++) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.cos(i * 78.233) * 12345.6789;
  fx.push([(a - Math.floor(a)) * 400 - 200 + i, (b - Math.floor(b)) * 400 - 200 - i * 3]);
}
const noise = fx.flatMap(([x, y]) =>
  [424242, -99, 0x9e37].map((s) => ({ x: bits(x), y: bits(y), s, v: bits(valueNoise(x, y, s)), f2: bits(fbm(x, y, s, 2)), f3: bits(fbm(x, y, s, 3)), f4: bits(fbm(x, y, s, 4)) })),
);

// Math functions the generators use, at the arguments they actually see.
const sinArgs: number[] = [];
const hypotArgs: [number, number][] = [];
for (let x = -3000; x <= 3000; x += 7) {
  sinArgs.push(x / 41 + (424242 % 314) / 50, x / 29 + (12345 % 314) / 50, x / 21 + (777 % 628) / 100);
  hypotArgs.push([x, x * 0.37 - 11], [x - 14, (x % 97) + 6], [x / 3 - 9, 5]);
}
const math = {
  sin: sinArgs.map((a) => [bits(a), bits(Math.sin(a))]),
  hypot: hypotArgs.map(([a, b]) => [bits(a), bits(b), bits(Math.hypot(a, b))]),
  riverCenter: [424242, 12345, 777].flatMap((s) => [-500, -33, 0, 17, 250, 4000].map((y) => [s, y, bits(riverCenter(s, y))])),
};

// Full chunk dumps for debugging any fingerprint mismatch.
const chunks: unknown[] = [];
for (const gen of [1, 2, 3]) for (const [cx, cy] of [[0, 0], [1, 0], [0, -2]]) {
  const c = generateChunk(424242, cx, cy, gen);
  chunks.push({ gen, habitat: 'valley', seed: 424242, cx, cy, terrain: hex(c.terrain), obj: hex(c.obj), amt: hex(c.amt) });
}
for (const habitat of Object.keys(HABITATS) as HabitatId[]) for (const [cx, cy] of [[0, 0], [1, -1], [-3, 2]]) {
  const c = generateChunk(12345, cx, cy, 4, habitat);
  chunks.push({ gen: 4, habitat, seed: 12345, cx, cy, terrain: hex(c.terrain), obj: hex(c.obj), amt: hex(c.amt) });
}

writeFileSync(`${OUT}/rng.json`, JSON.stringify({ rng, hashes }));
writeFileSync(`${OUT}/noise.json`, JSON.stringify(noise));
writeFileSync(`${OUT}/math.json`, JSON.stringify(math));
writeFileSync(`${OUT}/chunks.json`, JSON.stringify(chunks));
for (const gen of [1, 2, 3, 4]) copyFileSync(`tests/fixtures/gen-v${gen}-fingerprint.json`, `${OUT}/gen-v${gen}-fingerprint.json`);
console.log(`golden data written to ${OUT}`);
