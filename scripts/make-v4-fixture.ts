// One-off: captures a genuine version-4 save produced by the Seasons and settlements code.
import { writeFileSync } from 'node:fs';
import { serializeSim } from '../src/game/save/serialize';
import { completeBuilding, costOf } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';

const sim = createNewGame(646464);
sim.progression.reached.push('hamlet', 'village');
const camp = [...sim.buildings.values()].find((b) => b.type === 'camp')!;
camp.inventory = { food: 90, wood: 90, stone: 50, planks: 20, wheat: 6 };
applyCommand(sim, { type: 'placeArea', building: 'field', x0: -10, y0: 3, x1: -6, y1: 6, crop: 'turnip' });
applyCommand(sim, { type: 'place', building: 'house', x: 3, y: -5 });
for (let x = 0; x >= -60; x -= 4) sim.world.reveal(x, 0, 10);
let hallId = 0;
for (let x = -34; x >= -56 && !hallId; x -= 2) {
  for (let y = -6; y <= 6 && !hallId; y++) {
    if (applyCommand(sim, { type: 'place', building: 'waystation', x, y }).ok) {
      const b = [...sim.buildings.values()].find((q) => q.type === 'waystation')!;
      b.delivered = { ...costOf(b) };
      completeBuilding(sim, b);
      hallId = b.id;
    }
  }
}
if (!hallId) throw new Error('no waystation spot');
applyCommand(sim, { type: 'assignSettlement', ids: [sim.settlers[4].id], settlementId: hallId });
applyCommand(sim, { type: 'setWants', buildingId: hallId, res: 'food', amount: 20 });
applyCommand(sim, { type: 'renameSettlement', settlementId: hallId, name: 'Westfold' });
for (let i = 0; i < 6000; i++) sim.step();
const file = serializeSim(sim, { name: 'Fixture Seasons', createdAt: 1700000000000, view: { camX: 8, camY: 16, zoom: 3 }, tutorial: { step: 9, done: true } });
writeFileSync('tests/fixtures/v4-save.json', JSON.stringify(file));
console.log('version', file.version, 'gen', file.world.genVersion, 'tick', sim.tick, 'settlers', sim.settlers.length, 'settlements', sim.settlements.map((s) => s.name).join(','));
