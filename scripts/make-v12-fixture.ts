// One-off: captures a genuine version-12 save with every new system in use (a habitat,
// the ruler, a Keep upgrade under way, pens with animals, a hunter's lodge, self-staffing
// areas), for future migrations. Never re-run once the fixture has shipped.
import { existsSync, writeFileSync } from 'node:fs';
import { serializeSim } from '../src/game/save/serialize';
import { campOf, completeBuilding, costOf, placeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { createNewGame } from '../src/game/sim/newGame';
import { CURRENT_GEN } from '../src/game/world/worldgen';
import type { BuildingId } from '../src/game/data/buildings';

const file = 'tests/fixtures/v12-save.json';
if (existsSync(file)) throw new Error(`${file} exists: a shipped fixture must never be regenerated`);
const sim = createNewGame(121212, CURRENT_GEN, 'highlands', { rulerName: 'Fixture' });
sim.progression.reached.push('hamlet', 'village');
const hall = campOf(sim)!;
hall.inventory = { food: 200, wood: 120, stone: 150, planks: 60, tools: 10, hides: 4 };
const build = (type: BuildingId, x: number, y: number) => {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const res = applyCommand(sim, { type: 'place', building: type, x: x + dx, y: y + dy });
    if (res.ok) {
      const b = sim.buildingAt(x + dx, y + dy)!;
      b.delivered = { ...costOf(b) };
      completeBuilding(sim, b);
      return b;
    }
  }
  throw new Error(`no room for ${type}`);
};
const coop = build('chickenCoop', -8, -6);
const lodge = build('hunterLodge', 7, 6);
build('storehouse', 8, -6);
applyCommand(sim, { type: 'assignWorker', buildingId: coop.id, ids: [sim.settlers[0].id] });
applyCommand(sim, { type: 'assignWorker', buildingId: lodge.id, ids: [sim.settlers[1].id] });
applyCommand(sim, { type: 'createArea', kind: 'farm', x0: -11, y0: 2, x1: -5, y1: 8, wanted: 2, crop: 'turnip' });
applyCommand(sim, { type: 'createArea', kind: 'wood', x0: 4, y0: -16, x1: 16, y1: -8, wanted: 1 });
applyCommand(sim, { type: 'upgradeBuilding', buildingId: hall.id });
applyCommand(sim, { type: 'rally' });
for (let i = 0; i < 1500; i++) sim.step();
if (!hall.upgrade) throw new Error('the Keep upgrade should still be under way');
void placeBuilding;
const out = serializeSim(sim, { name: 'Fixture Realm', createdAt: 1700000000000, view: { camX: 0, camY: 0, zoom: 3 }, tutorial: { step: 9, done: true } });
writeFileSync(file, JSON.stringify(out));
console.log('version', out.version, 'settlers', sim.settlers.length, 'animals', sim.animals.length, 'bytes', JSON.stringify(out).length);
