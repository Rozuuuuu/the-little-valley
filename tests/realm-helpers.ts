import { expect } from 'vitest';
import { UNITS } from '../src/game/data/units';
import { campOf } from '../src/game/sim/buildings';
import { instant, runUntil } from './helpers';
import { applyCommand } from '../src/game/sim/commands';
import { knowKingdomOf, playerKingdom } from '../src/game/sim/kingdoms';
import { createNewGame } from '../src/game/sim/newGame';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import type { Simulation } from '../src/game/sim/Simulation';
import type { Kingdom } from '../src/game/sim/types';
import { nearbyTowns } from '../src/game/world/regions';

/** A crowned kingdom with an envoy, coins, and three known neighbouring kingdoms. */
export function realm(seed = 6161): { sim: Simulation; me: Kingdom; a: Kingdom; b: Kingdom; c: Kingdom } {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet', 'village', 'town', 'region');
  const res = applyCommand(sim, { type: 'coronate', rulerName: 'Queen Rowan', kingdomName: 'Rowanmere', banner: { color: '#3a6ea5', emblem: 'oak' } });
  if (!res.ok) throw new Error(res.message);
  const me = playerKingdom(sim);
  me.treasury = 400;
  applyCommand(sim, { type: 'appointCouncil', post: 'envoy', settlerId: sim.settlers[0].id });
  const towns = nearbyTowns(sim.seed);
  if (towns.length < 3) throw new Error('seed needs three towns');
  const [a, b, c] = towns.slice(0, 3).map((t) => knowKingdomOf(sim, t.id));
  return { sim, me, a, b, c };
}

export function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Realm', createdAt: 0 })))));
}

/** A civilised, crowned realm with an open frontier, a claimed frontier sector, and a trained company. */
export function warWorld(mode: 'protected-frontier' | 'full-conquest' = 'protected-frontier', soldiers = 2) {
  const r = realm(6161);
  const { sim, me } = r;
  sim.progression.reached.push('civilization');
  applyCommand(sim, { type: 'setConflictMode', mode });
  applyCommand(sim, { type: 'activateFrontier' });
  sim.world.reveal(0, 0, 40);
  for (let x = 0; x >= -130; x -= 8) sim.world.reveal(x, 8, 12);
  campOf(sim)!.inventory = { food: 200, swords: 8, wood: 20 };
  instant(sim, 'storehouse', { x: -8, y: -8 });
  const barracks = instant(sim, 'barracks', { x: 8, y: -8 });
  // Frontier land west of the homeland (sectors -3 and -4 on row 0), on the camp's side of the river.
  me.treasury = 400;
  expect(applyCommand(sim, { type: 'claimFrontier', sector: { x: -3, y: 0 } }).ok).toBe(true);
  expect(applyCommand(sim, { type: 'claimFrontier', sector: { x: -4, y: 0 } }).ok).toBe(true);
  const ids = sim.settlers.slice(1, 1 + soldiers).map((s) => s.id);
  expect(applyCommand(sim, { type: 'enlist', ids, unit: 'infantry', buildingId: barracks.id }).ok).toBe(true);
  runUntil(sim, () => ids.every((id) => sim.settler(id)!.military?.state === 'ready'), UNITS.infantry.trainTicks * 4);
  const company = playerKingdom(sim).companies[0];
  // The foe: a kingdom on this side of the great river (Greywell for this seed), so soldiers can walk there.
  const foe = [r.a, r.b, r.c].find((k) => (k.capital?.x ?? 0) < 0)!;
  return { ...r, company, ids, barracks, foe };
}

