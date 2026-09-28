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
