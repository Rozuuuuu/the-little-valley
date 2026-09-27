// One-off: captures a genuine version-2 save produced by the Milestone 1 code.
import { writeFileSync } from 'node:fs';
import { serializeSim } from '../src/game/save/serialize';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';

const sim = createNewGame(424242);
const camp = [...sim.buildings.values()].find((b) => b.type === 'camp')!;
camp.inventory = { food: 60, wood: 70, stone: 30 };
applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -6, y1: 5, crop: 'wheat' });
applyCommand(sim, { type: 'place', building: 'house', x: 3, y: -4 });
applyCommand(sim, { type: 'designate', x0: -14, y0: -14, x1: -8, y1: -8, on: true });
for (let i = 0; i < 4000; i++) sim.step();
const file = serializeSim(sim, { name: 'Fixture Valley', createdAt: 1700000000000, view: { camX: 8, camY: 16, zoom: 3 }, tutorial: { step: 9, done: true } });
writeFileSync('tests/fixtures/v2-save.json', JSON.stringify(file));
console.log('version', file.version, 'tick', sim.tick, 'settlers', sim.settlers.length, 'buildings', sim.buildings.size, 'houses built', [...sim.buildings.values()].filter(b => b.type === 'house' && b.built).length, 'wheat fields', [...sim.buildings.values()].filter(b => b.field?.crop === 'wheat').length, 'chunks', file.world.chunks.length);
