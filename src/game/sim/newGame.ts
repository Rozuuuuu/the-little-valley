import type { JobId } from '../data/jobs';
import { assignHomes, completeBuilding, placeBuilding } from './buildings';
import { CURRENT_GEN } from '../world/worldgen';
import type { HabitatId } from '../data/habitats';
import { newPlayerKingdom } from './kingdoms';
import { FIRST_VISITOR_TICK } from '../data/kingdomBalance';
import { Simulation, STARTING_SETTLERS } from './Simulation';

export const STARTING_GOODS = { food: 30, wood: 15, stone: 5 };
const STARTING_JOBS: JobId[] = ['farmer', 'gatherer', 'builder', 'laborer', 'laborer'];

/** A fresh valley: a Town Hall in the clearing, five settlers and a little food. */
export function createNewGame(seed: number, genVersion = CURRENT_GEN, habitat: HabitatId = 'valley'): Simulation {
  const sim = new Simulation(seed, undefined, genVersion, habitat);
  // New valleys grow through families and welcomed travellers.
  sim.growthMode = 'deliberate';
  sim.nextVisitor = FIRST_VISITOR_TICK;
  // Newer worlds reveal enough to see their near mountain range from the start.
  sim.world.reveal(0.5, 0.5, genVersion >= 4 ? 24 : 15);
  const hall = placeBuilding(sim, 'townHall', -2, -2);
  completeBuilding(sim, hall, true);
  hall.inventory = { ...STARTING_GOODS };
  sim.settlements = [{ id: hall.id, name: 'Home' }];
  sim.kingdoms = [newPlayerKingdom('Home')];
  const spots = [[-1, 2], [0, 2], [1, 2], [-2, 1], [2, 1]];
  for (let i = 0; i < STARTING_SETTLERS; i++) {
    const [x, y] = spots[i];
    sim.addSettler(x, y, STARTING_JOBS[i]);
  }
  assignHomes(sim);
  sim.startSession();
  sim.drainEvents();
  return sim;
}
