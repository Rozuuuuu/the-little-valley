import { terrainAt } from '../src/game/world/worldgen';
const seed = Number(process.argv[2] ?? 12345);
const counts: Record<number, number> = {};
for (let y = -200; y < 200; y += 3) for (let x = -200; x < 200; x += 3) { const t = terrainAt(seed, x, y); counts[t] = (counts[t] ?? 0) + 1; }
console.log('deep,water,sand,grass,meadow,forest,rocky', counts);
