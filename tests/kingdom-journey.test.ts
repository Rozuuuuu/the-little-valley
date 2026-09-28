import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { RECRUIT_APPLES } from '../src/game/data/kingdomBalance';
import { UNITS } from '../src/game/data/units';
import { migrate } from '../src/game/save/migrations';
import { deserializeSim, serializeSim } from '../src/game/save/serialize';
import { campOf, checkPlacement } from '../src/game/sim/buildings';
import { applyCommand, type Command } from '../src/game/sim/commands';
import { deployRival } from '../src/game/sim/combat';
import { knowKingdomOf, playerKingdom } from '../src/game/sim/kingdoms';
import { knowledgeOf } from '../src/game/sim/news';
import { createNewGame } from '../src/game/sim/newGame';
import type { Simulation } from '../src/game/sim/Simulation';
import { ownerOf, sectorOf } from '../src/game/sim/territory';
import { nearbyTowns } from '../src/game/world/regions';
import { starterDeposits } from '../src/game/world/geology';
import { assertNoNegativeReservations, assertReservationsConsistent, clearSpot, instant, run, runUntil } from './helpers';

const SEED = 7171;

function reload(sim: Simulation): Simulation {
  return deserializeSim(migrate(JSON.parse(JSON.stringify(serializeSim(sim, { name: 'Kingdom', createdAt: 0 })))));
}

/** Runs one stage; a failure names the seed, stage and tick so it can be replayed. */
function stage<T>(name: string, sim: Simulation, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new Error(`[seed ${SEED}, tick ${sim.tick}] ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function cmd(sim: Simulation, c: Command) {
  const r = applyCommand(sim, c);
  if (!r.ok) throw new Error(`${c.type} refused: ${r.message}`);
  return r;
}

function uniqueIds(sim: Simulation): void {
  const ids = [...sim.settlers.map((s) => s.id), ...sim.buildings.keys()];
  expect(new Set(ids).size).toBe(ids.length);
}

describe('kingdom journey', () => {
  it('growth → ore and tools → supplied towns → crown → contact and news → soldiers → allies against a stronger kingdom → launch → frontier → peace → save and resume', () => {
    let sim = createNewGame(SEED);
    const camp = campOf(sim)!;
    camp.inventory = { food: 120, wood: 90, stone: 45, planks: 30 };

    // 1. Deliberate growth: an orchard pays for a traveller.
    stage('growth', sim, () => {
      const op = clearSpot(sim, 2, 2, { x: -4, y: 9 });
      cmd(sim, { type: 'place', building: 'orchard', x: op.x, y: op.y });
      const hp = clearSpot(sim, 3, 2, { x: 5, y: -5 });
      cmd(sim, { type: 'place', building: 'familyHome', x: hp.x, y: hp.y });
      const sp = clearSpot(sim, 3, 2, { x: 7, y: 4 });
      cmd(sim, { type: 'place', building: 'storehouse', x: sp.x, y: sp.y });
      runUntil(sim, () => sim.storedTotal('apples') >= RECRUIT_APPLES && sim.offer !== null, DAY_TICKS * 10);
      cmd(sim, { type: 'acceptRecruit', offerId: sim.offer!.id, settlementId: sim.settlements[0].id });
      runUntil(sim, () => sim.settlers.length === 6, DAY_TICKS);
    });

    // 2. Ore and tools from a surveyed deposit. (Shortcut: Hamlet granted; its gate is tested elsewhere.)
    stage('ore and tools', sim, () => {
      sim.progression.reached.push('hamlet');
      const dep = starterDeposits(sim.seed, 3).copper!;
      for (let i = 0; i <= 12; i++) sim.world.reveal((dep.x * i) / 12, (dep.y * i) / 12, 7);
      cmd(sim, { type: 'surveyDeposit', settlerId: sim.settlers[0].id, x: dep.x, y: dep.y });
      runUntil(sim, () => sim.surveyedCell(dep.x, dep.y) !== null, DAY_TICKS);
      let mine: { x: number; y: number } | null = null;
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (!mine && checkPlacement(sim, 'mine', dep.x + dx, dep.y + dy).ok) mine = { x: dep.x + dx, y: dep.y + dy };
      camp.inventory = { ...camp.inventory, wood: (camp.inventory.wood ?? 0) + 60, stone: (camp.inventory.stone ?? 0) + 40, planks: (camp.inventory.planks ?? 0) + 30 };
      cmd(sim, { type: 'place', building: 'mine', x: mine!.x, y: mine!.y });
      const m = sim.buildingAt(mine!.x, mine!.y)!;
      // Shortcut: the smelter, kiln and forge are raised instantly (construction is tested elsewhere).
      const smelter = instant(sim, 'smelter', { x: -8, y: -6 });
      const kiln = instant(sim, 'charcoalKiln', { x: 6, y: 8 });
      const forge = instant(sim, 'forge', { x: 10, y: -8 });
      runUntil(sim, () => m.built, DAY_TICKS * 3);
      const ids = sim.settlers.map((s) => s.id);
      cmd(sim, { type: 'assignWorker', buildingId: m.id, ids: [ids[1]] });
      cmd(sim, { type: 'assignWorker', buildingId: kiln.id, ids: [ids[2]] });
      cmd(sim, { type: 'assignWorker', buildingId: smelter.id, ids: [ids[3]] });
      cmd(sim, { type: 'assignWorker', buildingId: forge.id, ids: [ids[4]] });
      runUntil(sim, () => sim.stats.copperToolsForged > 0, DAY_TICKS * 8);
    });
    sim = reload(sim);

    // 3. A second town supplied by caravan, and trade at an inn. (Shortcut: Village and Town granted.)
    const far = stage('supplied towns', sim, () => {
      sim.progression.reached.push('village', 'town');
      for (let x = 0; x >= -60; x -= 3) sim.world.reveal(x, 0, 11);
      const hall = instant(sim, 'waystation', { x: -40, y: 0 });
      const depot = instant(sim, 'depot', { x: 5, y: 6 });
      instant(sim, 'inn', { x: -6, y: -10 });
      const home = campOf(sim)!;
      home.inventory.food = (home.inventory.food ?? 0) + 60;
      cmd(sim, { type: 'assignWorker', buildingId: depot.id, ids: [sim.settlers[5].id] });
      cmd(sim, { type: 'createRoute', sourceId: home.id, destinationId: hall.id, resource: 'food', target: 20 });
      runUntil(sim, () => (hall.inventory.food ?? 0) >= 20, DAY_TICKS * 3);
      runUntil(sim, () => sim.parties.some((p) => p.state === 'lodging'), DAY_TICKS * 5);
      const p = sim.parties.find((x) => x.state === 'lodging')!;
      home.inventory.tools = (home.inventory.tools ?? 0) + 10;
      cmd(sim, { type: 'barter', partyId: p.id, give: { tools: 5 }, take: {}, coins: -20 });
      expect(playerKingdom(sim).treasury).toBeGreaterThanOrEqual(20);
      return hall;
    });
    void far;

    // 4. The crown, contact with other kingdoms and news. (Shortcut: Region granted.)
    const towns = nearbyTowns(sim.seed);
    const [strong, friend] = stage('crown and contact', sim, () => {
      sim.progression.reached.push('region');
      cmd(sim, { type: 'coronate', rulerName: 'Queen Maren', kingdomName: 'Marenholt', banner: { color: '#3a8a4a', emblem: 'wheat' } });
      cmd(sim, { type: 'appointCouncil', post: 'envoy', settlerId: sim.settlers[0].id });
      playerKingdom(sim).treasury += 300;
      const ks = towns.slice(0, 3).map((t) => knowKingdomOf(sim, t.id));
      // A friendly neighbour offers an alliance; we sign it.
      const offer = sim.makeOffer(ks[1].id, 0, 'defensiveAlliance', { durationDays: 32 }, DAY_TICKS);
      cmd(sim, { type: 'respondToOffer', offerId: offer.id, accept: true });
      expect(sim.stanceOf(0, ks[1].id)).toBe('ally');
      // Claiming land next to the homeland is seen by neighbours as news.
      cmd(sim, { type: 'claimFrontier', sector: { x: -3, y: 0 } });
      run(sim, DAY_TICKS);
      return [ks[0], ks[1]];
    });

    // 5. Soldiers. (Shortcut: Civilization granted; the frontier is opened by command.)
    const company = stage('soldiers', sim, () => {
      sim.progression.reached.push('civilization');
      cmd(sim, { type: 'activateFrontier' });
      const home = campOf(sim)!;
      home.inventory.swords = 4;
      home.inventory.food = (home.inventory.food ?? 0) + 60;
      let barracks: ReturnType<typeof instant> | null = null;
      for (const at of [{ x: 12, y: -12 }, { x: -14, y: 14 }, { x: 16, y: 12 }, { x: -16, y: -14 }]) {
        if (barracks) break;
        sim.world.reveal(at.x, at.y, 16);
        try {
          barracks = instant(sim, 'barracks', at);
        } catch {
          // try the next spot
        }
      }
      if (!barracks) throw new Error('no room for barracks');
      const recruits = sim.settlers.filter((s) => !s.military && s.lifeStage === 'adult' && s.id !== playerKingdom(sim).council.envoy).slice(0, 3).map((s) => s.id);
      cmd(sim, { type: 'enlist', ids: recruits, unit: 'infantry', buildingId: barracks.id });
      runUntil(sim, () => recruits.every((id) => sim.settler(id)!.military?.state === 'ready'), UNITS.infantry.trainTicks * 4);
      return playerKingdom(sim).companies[0];
    });
    sim = reload(sim);

    // 6. Against a stronger kingdom, with an ally's help: plan, ask, muster, launch.
    stage('coalition', sim, () => {
      sim.setTrust(friend.id, 0, 90);
      const plan = cmd(sim, { type: 'createWarPlan', target: strong.id, objective: 'raid' });
      const req = cmd(sim, { type: 'requestCampaignSupport', planId: plan.id!, ally: friend.id, terms: { companies: 1, coinFee: 30, supplyPayer: 'shared', serviceDays: 4, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 } });
      runUntil(sim, () => sim.commitments.find((c) => c.id === req.id)!.state !== 'proposed', DAY_TICKS * 3);
      const cm = sim.commitments.find((c) => c.id === req.id)!;
      if (cm.state === 'countered') cmd(sim, { type: 'acceptCampaignOffer', commitmentId: cm.id });
      expect(cm.state).toBe('accepted');
      cmd(sim, { type: 'mobilizeCampaign', planId: plan.id! });
      runUntil(sim, () => cm.state === 'arrived', DAY_TICKS * 6);
      cmd(sim, { type: 'launchCampaign', planId: plan.id!, confirmBreach: true });
      expect(sim.atWar(0, strong.id)).toBe(true);
      expect(knowledgeOf(sim, strong.id).length + sim.worldEvents.length).toBeGreaterThan(0);
    });

    // 7. The frontier: they come for our claim; we defend it.
    stage('frontier', sim, () => {
      const c = playerKingdom(sim).companies.find((q) => q.id === company.id)!;
      const enemy = deployRival(sim, strong.id, { x: -3 * 16 - 4, y: 8 }, true);
      cmd(sim, { type: 'orderCompany', companyId: c.id, order: 'defend', x: -3 * 16 + 4, y: 8, supplyDays: 4 });
      if (enemy) runUntil(sim, () => enemy.state !== 'deployed' || c.state !== 'deployed', DAY_TICKS * 3);
      // The homeland was never touched.
      expect(ownerOf(sim, sectorOf(0, 0))!.occupyingKingdom).toBeNull();
    });

    // 8. Peace, with the coalition settled; then save and resume.
    stage('peace', sim, () => {
      sim.setTrust(strong.id, 0, 90);
      cmd(sim, { type: 'proposeTreaty', kind: 'peace', to: strong.id, terms: { durationDays: 32, payment: 20 } });
      runUntil(sim, () => !sim.atWar(0, strong.id), DAY_TICKS * 3);
      run(sim, DAY_TICKS);
      expect(sim.commitments.every((c) => ['fulfilled', 'returning', 'cancelled', 'refused', 'expired'].includes(c.state))).toBe(true);
    });
    const before = { people: sim.settlers.length, coins: playerKingdom(sim).treasury, claims: sim.claims.size };
    sim = reload(sim);
    expect({ people: sim.settlers.length, coins: playerKingdom(sim).treasury, claims: sim.claims.size }).toEqual(before);
    run(sim, DAY_TICKS / 2);
    assertReservationsConsistent(sim);
    assertNoNegativeReservations(sim);
    uniqueIds(sim);
    for (const s of sim.settlers) expect(s.captive ?? null).toBeNull();
  }, 240_000);
});
