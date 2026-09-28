// One-off: captures a genuine version-11 save with every system in use, for future migrations.
import { existsSync, writeFileSync } from 'node:fs';
import { serializeSim } from '../src/game/save/serialize';
import { completeBuilding, costOf, placeBuilding } from '../src/game/sim/buildings';
import { applyCommand } from '../src/game/sim/commands';
import { knowKingdomOf, playerKingdom } from '../src/game/sim/kingdoms';
import { createNewGame } from '../src/game/sim/newGame';
import { nearbyTowns } from '../src/game/world/regions';
import { starterDeposits } from '../src/game/world/geology';
import { completeSurvey } from '../src/game/sim/mining';
import type { BuildingId } from '../src/game/data/buildings';

const file = 'tests/fixtures/v11-save.json';
if (existsSync(file)) throw new Error(`${file} exists: a shipped fixture must never be regenerated`);
const sim = createNewGame(111111);
sim.progression.reached.push('hamlet', 'village', 'town', 'region', 'civilization');
sim.world.reveal(0, 0, 30);
for (let x = 0; x >= -60; x -= 4) sim.world.reveal(x, 0, 10);
const camp = [...sim.buildings.values()].find((b) => b.type === 'camp')!;
camp.inventory = { food: 150, wood: 60, stone: 40, planks: 30, apples: 60, swords: 4 };
const build = (type: BuildingId, x: number, y: number) => {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const res = applyCommand(sim, { type: 'place', building: type, x: x + dx, y: y + dy });
    if (res.ok) {
      const b = sim.buildingAt(x + dx, y + dy)!;
      b.delivered = { ...costOf(b) };
      completeBuilding(sim, b, type !== 'waystation');
      return b;
    }
  }
  throw new Error(`no room for ${type}`);
};
build('familyHome', 5, -5);
build('orchard', -6, 9);
build('storehouse', -10, -6);
const hall = build('waystation', -40, 0);
const depot = build('depot', 8, 6);
build('inn', -4, -12);
const barracks = build('barracks', 14, -10);
const dep = starterDeposits(sim.seed, 3).copper!;
sim.world.reveal(dep.x, dep.y, 8);
completeSurvey(sim, sim.settlers[0], dep.x, dep.y);
applyCommand(sim, { type: 'formHousehold', ids: [sim.settlers[1].id, sim.settlers[2].id] });
applyCommand(sim, { type: 'assignWorker', buildingId: depot.id, ids: [sim.settlers[3].id] });
applyCommand(sim, { type: 'createRoute', sourceId: camp.id, destinationId: hall.id, resource: 'food', target: 20 });
applyCommand(sim, { type: 'coronate', rulerName: 'King Fixture', kingdomName: 'Fixturia', banner: { color: '#a53a3a', emblem: 'tower' } });
applyCommand(sim, { type: 'appointCouncil', post: 'envoy', settlerId: sim.settlers[0].id });
for (const t of nearbyTowns(sim.seed).slice(0, 2)) knowKingdomOf(sim, t.id);
playerKingdom(sim).treasury = 120;
applyCommand(sim, { type: 'enlist', ids: [sim.settlers[4].id], unit: 'infantry', buildingId: barracks.id });
applyCommand(sim, { type: 'claimFrontier', sector: { x: -3, y: 0 } });
for (let i = 0; i < 3000; i++) sim.step();
const out = serializeSim(sim, { name: 'Fixture Kingdom', createdAt: 1700000000000, view: { camX: 0, camY: 0, zoom: 3 }, tutorial: { step: 9, done: true } });
writeFileSync(file, JSON.stringify(out));
console.log('version', out.version, 'settlers', sim.settlers.length, 'kingdoms', sim.kingdoms.length, 'routes', sim.routes.length, 'bytes', JSON.stringify(out).length);
