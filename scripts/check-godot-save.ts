// Loads a save written by the Godot version into the browser game's migrations and deserializer,
// steps it, and reports problems. Usage: npx tsx scripts/check-godot-save.ts <save.json>
import { readFileSync } from 'node:fs';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim } from '../src/game/save/serialize';

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sim = deserializeSim(migrate(raw));
for (let i = 0; i < 600; i++) sim.step();
console.log(JSON.stringify({ ok: true, settlers: sim.settlers.length, buildings: sim.buildings.size, workAreas: sim.workAreas.length, tick: sim.tick, ruler: sim.ruler()?.name ?? null }));
