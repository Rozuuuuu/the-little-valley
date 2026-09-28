import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/game/sim/commands';
import { checkPlacement, placeBuilding } from '../src/game/sim/buildings';
import { knowKingdomOf, playerKingdom } from '../src/game/sim/kingdoms';
import { createNewGame } from '../src/game/sim/newGame';
import { canEnterTerritory, claimPreview, homelandPreview, ownerOf, sectorOf } from '../src/game/sim/territory';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import type { Simulation } from '../src/game/sim/Simulation';
import { nearbyTowns } from '../src/game/world/regions';

const identity = { rulerName: 'King Ash', kingdomName: 'Ashvale', banner: { color: '#a53a3a', emblem: 'wheat' } };

function crowned(seed = 5050, before?: (sim: Simulation) => void) {
  const sim = createNewGame(seed);
  sim.progression.reached.push('hamlet', 'village', 'town', 'region');
  before?.(sim);
  const res = applyCommand(sim, { type: 'coronate', ...identity });
  expect(res.ok, res.message).toBe(true);
  playerKingdom(sim).treasury = 500;
  return sim;
}

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Land', createdAt: 0 })))));
}

describe('sectors and the homeland', () => {
  it('sectors are 16×16 and handle negative corners', () => {
    expect(sectorOf(0, 0)).toEqual({ x: 0, y: 0 });
    expect(sectorOf(-1, -1)).toEqual({ x: -1, y: -1 });
    expect(sectorOf(15, 16)).toEqual({ x: 0, y: 1 });
    expect(sectorOf(-16, -17)).toEqual({ x: -1, y: -2 });
  });

  it('the homeland is previewed, then frozen at coronation; later building never grows it', () => {
    let farBuilding = { x: 0, y: 0 };
    const sim = crowned(5050, (s) => {
      // An older world: a field far outside the starting area is included when the boundary is set.
      s.world.reveal(90, 90, 3);
      placeBuilding(s, 'field', 90, 90);
      farBuilding = { x: 90, y: 90 };
      const preview = homelandPreview(s);
      expect(preview.some((q) => q.x === sectorOf(90, 90).x && q.y === sectorOf(90, 90).y)).toBe(true);
    });
    const k = playerKingdom(sim);
    const home = new Set(k.homeland!.map((q) => `${q.x},${q.y}`));
    expect(home.has('0,0')).toBe(true);
    expect(home.has('-2,-2')).toBe(true); // chunk (-1,-1) starts at tile -32
    expect(home.has(`${sectorOf(farBuilding.x, farBuilding.y).x},${sectorOf(farBuilding.x, farBuilding.y).y}`)).toBe(true);
    const before = k.homeland!.length;
    sim.world.reveal(-150, 10, 3);
    placeBuilding(sim, 'field', -150, 10);
    expect(playerKingdom(sim).homeland!.length).toBe(before);
    expect(ownerOf(sim, sectorOf(-150, 10))?.legalOwner ?? null).toBeNull();
    expect(reload(sim).kingdoms.find((x) => x.player)!.homeland).toEqual(k.homeland);
  });
});

describe('frontier claims', () => {
  it('shows cost, supply and protection before claiming; claims must touch your land', () => {
    const sim = crowned();
    const edge = { x: 4, y: 0 }; // next to the 3×3-chunk homeland (sectors -2..3)
    const p = claimPreview(sim, edge);
    expect(p.problem).toBeNull();
    expect(p.cost).toBeGreaterThan(0);
    expect(p.supplied).toBe(true);
    expect(p.protectedHomeland).toBe(false);
    const coins = playerKingdom(sim).treasury;
    expect(applyCommand(sim, { type: 'claimFrontier', sector: edge }).ok).toBe(true);
    expect(playerKingdom(sim).treasury).toBe(coins - p.cost);
    expect(ownerOf(sim, edge)!.legalOwner).toBe(playerKingdom(sim).id);
    expect(applyCommand(sim, { type: 'claimFrontier', sector: { x: 20, y: 20 } }).message).toMatch(/touch|supplied|connect/i);
    expect(applyCommand(sim, { type: 'claimFrontier', sector: edge }).message).toMatch(/already/i);
    expect(applyCommand(sim, { type: 'claimFrontier', sector: { x: 0, y: 0 } }).message).toMatch(/homeland|already/i);
  });

  it('the conflict setting can be chosen before the first claim and is locked after it', () => {
    const sim = crowned();
    expect(applyCommand(sim, { type: 'setConflictMode', mode: 'full-conquest' }).ok).toBe(true);
    expect(applyCommand(sim, { type: 'setConflictMode', mode: 'protected-frontier' }).ok).toBe(true);
    applyCommand(sim, { type: 'claimFrontier', sector: { x: 4, y: 0 } });
    expect(applyCommand(sim, { type: 'setConflictMode', mode: 'full-conquest' }).message).toMatch(/locked/i);
    expect(playerKingdom(sim).conflictMode).toBe('protected-frontier');
  });

  it('frontier hostility needs Civilization and an explicit choice', () => {
    const sim = crowned();
    expect(applyCommand(sim, { type: 'activateFrontier' }).message).toMatch(/Civilization/);
    sim.progression.reached.push('civilization');
    expect(applyCommand(sim, { type: 'activateFrontier' }).ok).toBe(true);
    expect(playerKingdom(sim).frontierActive).toBe(true);
  });
});

describe('other kingdoms', () => {
  it('a known town is a kingdom with its own land: you cannot build or claim there, and exploring it is not owning it', () => {
    const sim = crowned();
    const town = nearbyTowns(sim.seed)[0];
    const rival = knowKingdomOf(sim, town.id);
    expect(rival.player).toBe(false);
    const sec = sectorOf(town.x, town.y);
    expect(ownerOf(sim, sec)!.legalOwner).toBe(rival.id);
    expect(ownerOf(sim, sec)!.protectedHomeland).toBe(true);
    sim.world.reveal(town.x, town.y, 4);
    const pc = checkPlacement(sim, 'field', town.x, town.y);
    expect(pc.ok).toBe(false);
    expect(pc.reason).toMatch(new RegExp(rival.name));
    expect(claimPreview(sim, sec).problem).toMatch(/belongs|protected|homeland/i);
  });

  it('civilians may pass through foreign land; armed entry needs permission, and protected homelands stay closed', () => {
    const sim = crowned();
    const town = nearbyTowns(sim.seed)[0];
    const rival = knowKingdomOf(sim, town.id);
    const me = playerKingdom(sim).id;
    const sec = sectorOf(town.x, town.y);
    expect(canEnterTerritory(sim, me, sec, false).allowed).toBe(true);
    const armed = canEnterTerritory(sim, me, sec, true);
    expect(armed.allowed).toBe(false);
    expect(armed.reason).toMatch(/permission|passage|protected/i);
    // Rivals can't march into your homeland either.
    expect(canEnterTerritory(sim, rival.id, { x: 0, y: 0 }, true).allowed).toBe(false);
    // Unowned wild land is open.
    expect(canEnterTerritory(sim, me, { x: 30, y: -30 }, true).allowed).toBe(true);
  });

  it('under full conquest, homelands are no longer immune', () => {
    const sim = crowned(5050, (s) => {
      s.progression.reached.push('region');
    });
    applyCommand(sim, { type: 'setConflictMode', mode: 'full-conquest' });
    const town = nearbyTowns(sim.seed)[0];
    knowKingdomOf(sim, town.id);
    const sec = sectorOf(town.x, town.y);
    expect(ownerOf(sim, sec)!.protectedHomeland).toBe(false);
  });
});
