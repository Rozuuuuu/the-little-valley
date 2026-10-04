// Writes a genuine v15 save from the browser game for the Godot import tests:
// a new valley (with a ruler and wildlife) played for half a day, with a house built, fields,
// marks and goods in hand. Run: npx tsx scripts/make-v15-fixture.ts
// Writes tests/fixtures/v15-save.json and copies it to godot/tests/golden/v15-save.json.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { DAY_TICKS } from '../src/game/core/constants';
import { serializeSim } from '../src/game/save/serialize';
import { campOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';

const file = 'tests/fixtures/v15-save.json';
if (existsSync(file)) throw new Error(`${file} exists: fixtures are captured once and never regenerated`);
const sim = createNewGame(15015, 4, 'valley', { rulerName: 'Fixture' });
campOf(sim)!.inventory = { food: 60, wood: 50, stone: 20 };
for (let r = 3; r < 12; r++) {
  if (applyCommand(sim, { type: 'place', building: 'house', x: r, y: -r }).ok) break;
}
applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -7, y1: 5, crop: 'turnip' });
applyCommand(sim, { type: 'designate', x0: -14, y0: -14, x1: -6, y1: -6, on: true });
for (let i = 0; i < DAY_TICKS / 2; i++) sim.step();
const save = serializeSim(sim, { name: 'Fixture valley', createdAt: 1790000000000, view: { camX: 0, camY: 0, zoom: 3 } });
writeFileSync(file, JSON.stringify(save, null, 1));
copyFileSync(file, 'godot/tests/golden/v15-save.json');
console.log(`v15 fixture: ${save.sim.settlers.length} settlers, ${save.sim.buildings.length} buildings, ${save.world.chunks.length} chunks, ${save.sim.animals?.length ?? 0} animals`);
