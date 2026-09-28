import { describe, expect, it } from 'vitest';
import { HABITAT_IDS, HABITATS, type HabitatId } from '../src/game/data/habitats';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf, entranceOf } from '../src/game/sim/buildings';
import { createNewGame } from '../src/game/sim/newGame';
import { findPath } from '../src/game/sim/pathfinding';
import { starterDeposits } from '../src/game/world/geology';
import { O, T } from '../src/game/world/tiles';
import { CURRENT_GEN, generateChunk } from '../src/game/world/worldgen';

const SEEDS = [11, 424242, 90210];

/** Share of each kind of land in a square around the spawn, read from the generator. */
function census(seed: number, habitat: HabitatId, r = 64) {
  const n = { mountain: 0, hill: 0, forest: 0, water: 0, trees: 0, tiles: 0 };
  for (let cy = -2; cy < 2; cy++) {
    for (let cx = -2; cx < 2; cx++) {
      const c = generateChunk(seed, cx, cy, CURRENT_GEN, habitat);
      for (let i = 0; i < c.terrain.length; i++) {
        const t = c.terrain[i];
        n.tiles++;
        if (t === T.Mountain) n.mountain++;
        if (t === T.Hill) n.hill++;
        if (t === T.Forest) n.forest++;
        if (t === T.Water || t === T.DeepWater) n.water++;
        if (c.obj[i] === O.Oak || c.obj[i] === O.Pine) n.trees++;
      }
    }
  }
  void r;
  return n;
}

describe('habitats (generator 4)', () => {
  it('new worlds use generator 4 and remember their habitat through a save', () => {
    expect(CURRENT_GEN).toBe(4);
    const sim = createNewGame(5, CURRENT_GEN, 'forest');
    expect(sim.world.genVersion).toBe(4);
    expect(sim.world.habitat).toBe('forest');
    const back = deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'H', createdAt: 1 })))));
    expect(back.world.habitat).toBe('forest');
    for (let y = -30; y < 30; y += 7) for (let x = -30; x < 30; x += 7) expect(back.world.terrain(x, y)).toBe(sim.world.terrain(x, y));
  });

  for (const habitat of HABITAT_IDS) {
    it(`${habitat}: mountains are in view from the start, the hall stands on dry land, and the starter ore can be reached`, () => {
      for (const seed of SEEDS) {
        const sim = createNewGame(seed, CURRENT_GEN, habitat);
        let seenMountains = 0;
        for (let y = -26; y <= 26; y++) for (let x = -26; x <= 26; x++) if (sim.world.explored(x, y) && sim.world.terrain(x, y) === T.Mountain) seenMountains++;
        expect(seenMountains, `${habitat} seed ${seed}`).toBeGreaterThan(20);
        const hall = campOf(sim)!;
        const door = entranceOf(hall);
        expect(sim.walkable(door.x, door.y)).toBe(true);
        // The meadow west of the hall is farmland in every habitat.
        expect([T.Meadow, T.Grass]).toContain(sim.world.terrain(-7, 5));
        const dep = starterDeposits(sim.seed, 4, habitat);
        for (const d of [dep.copper!, dep.iron!]) {
          expect(sim.world.terrain(d.x, d.y), `${habitat} seed ${seed} deposit`).toBe(T.Hill);
          expect(findPath(sim, door.x, door.y, { x: d.x, y: d.y, w: 1, h: 1, adjacent: false }, 60000), `${habitat} seed ${seed}: path to ${d.mineral}`).not.toBeNull();
        }
        // The near range has passes: land beyond it (past any lake) can be reached on foot.
        const beyondY = -(HABITATS[habitat].rangeDistance + 10);
        let beyond: { x: number; y: number } | null = null;
        for (let y = beyondY; y > beyondY - 30 && !beyond; y--) for (let x = -40; x <= 40 && !beyond; x++) if (sim.walkable(x, y)) beyond = { x, y };
        expect(beyond, `${habitat} seed ${seed}: open land beyond the range`).not.toBeNull();
        expect(findPath(sim, door.x, door.y, { ...beyond!, w: 1, h: 1, adjacent: false }, 120000), `${habitat} seed ${seed}: a pass through the range`).not.toBeNull();
      }
    });
  }

  it('each habitat has its own character', () => {
    const avg = (h: HabitatId) => {
      const t = { mountain: 0, hill: 0, forest: 0, water: 0, trees: 0, tiles: 0 };
      for (const s of SEEDS) {
        const c = census(s, h);
        for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += c[k];
      }
      return t;
    };
    const valley = avg('valley');
    const highlands = avg('highlands');
    const forest = avg('forest');
    const plains = avg('plains');
    const marsh = avg('marsh');
    expect(highlands.mountain + highlands.hill).toBeGreaterThan((valley.mountain + valley.hill) * 1.4);
    expect(forest.forest).toBeGreaterThan(valley.forest * 1.5);
    expect(plains.trees).toBeLessThan(valley.trees * 0.7);
    expect(marsh.water).toBeGreaterThan(valley.water * 1.5);
  });
});
