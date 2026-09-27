// One-off: captures a genuine version-3 save produced by the Milestone 2 code.
import { writeFileSync } from 'node:fs';
import { serializeSim } from '../src/game/save/serialize';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';

const sim = createNewGame(535353);
sim.progression.reached.push('hamlet');
const camp = [...sim.buildings.values()].find((b) => b.type === 'camp')!;
camp.inventory = { food: 80, wood: 90, stone: 50, planks: 20 };
applyCommand(sim, { type: 'placeArea', building: 'field', x0: -10, y0: 3, x1: -6, y1: 6, crop: 'wheat' });
applyCommand(sim, { type: 'place', building: 'house', x: 3, y: -5 });
applyCommand(sim, { type: 'place', building: 'storehouse', x: 6, y: 3 });
const wood = applyCommand(sim, { type: 'createArea', kind: 'wood', x0: -16, y0: -16, x1: -8, y1: -8, name: 'North wood' }).id!;
applyCommand(sim, { type: 'assignArea', ids: [sim.settlers[1].id], areaId: wood });
applyCommand(sim, { type: 'setPriorities', ids: [sim.settlers[2].id], priorities: ['haul', 'build'] });
for (let i = 0; i < 5000; i++) sim.step();
const file = serializeSim(sim, { name: 'Fixture Village', createdAt: 1700000000000, view: { camX: 8, camY: 16, zoom: 3 }, tutorial: { step: 9, done: true } });
writeFileSync('tests/fixtures/v3-save.json', JSON.stringify(file));
console.log('version', file.version, 'gen', file.world.genVersion, 'tick', sim.tick, 'settlers', sim.settlers.length, 'areas', sim.workAreas.length, 'chronicle', sim.chronicle.length);
