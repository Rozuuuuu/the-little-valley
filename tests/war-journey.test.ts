import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../src/game/core/constants';
import { applyCommand } from '../src/game/sim/commands';
import { deployRival } from '../src/game/sim/combat';
import { recordEvent, recordObservation, deliverReports } from '../src/game/sim/news';
import { updateConcern } from '../src/game/sim/concern';
import { playerKingdom } from '../src/game/sim/kingdoms';
import { ownerOf, sectorOf } from '../src/game/sim/territory';
import type { Simulation } from '../src/game/sim/Simulation';
import { run, runUntil } from './helpers';
import { reload, warWorld } from './realm-helpers';

function stateOf(sim: Simulation) {
  return JSON.stringify({ wars: [...sim.wars], companies: sim.kingdoms.map((k) => k.companies.map((c) => [c.id, c.state, Math.round(c.health ?? 100)])), settlers: sim.settlers.length });
}

describe('war journey', () => {
  for (const mode of ['protected-frontier', 'full-conquest'] as const) {
    it(`warning → talks → war → defence and retreat → peace (${mode}), surviving a reload at each step`, () => {
      let { sim, foe: a, company } = warWorld(mode, 3);
      // A warning from a worried neighbour.
      for (let i = 0; i < 3; i++) {
        const ev = recordEvent(sim, 'border-forces', 0, 8, { x: -4, y: 0 });
        recordObservation(sim, a.id, 0, 'border-forces', { x: -4, y: 0 }, { eventId: ev.id, certainty: 'confirmed', source: 'border', delay: 0 });
      }
      deliverReports(sim);
      updateConcern(sim, true);
      const w = sim.warnings.find((x) => x.from === a.id)!;
      expect(w).toBeTruthy();
      expect(applyCommand(sim, { type: 'respondToWarning', warningId: w.id, action: 'negotiate' }).ok).toBe(true);
      // Talks fail; war.
      expect(applyCommand(sim, { type: 'declareWar', target: a.id, objective: 'raid', confirmBreach: true }).ok).toBe(true);
      sim = reload(sim);
      a = sim.kingdoms.find((k) => k.id === a.id)!;
      company = playerKingdom(sim).companies[0];
      expect(sim.atWar(0, a.id)).toBe(true);
      // They come for our frontier; we defend it.
      const enemy = deployRival(sim, a.id, { x: -4 * 16 + 10, y: 8 }, true)!;
      applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'defend', x: -3 * 16 + 4, y: 8, supplyDays: 5 });
      runUntil(sim, () => enemy.state === 'returning' || company.state === 'returning' || company.state === 'home', DAY_TICKS * 3);
      const mid = stateOf(sim);
      sim = reload(sim);
      expect(stateOf(sim)).toBe(mid);
      company = playerKingdom(sim).companies[0] ?? company;
      // Pull back behind the protected homeland if needed; attacks stop there.
      if (company.state === 'deployed') applyCommand(sim, { type: 'orderCompany', companyId: company.id, order: 'retreat' });
      run(sim, DAY_TICKS / 2);
      // Peace.
      sim.setTrust(a.id, 0, 90);
      const peace = applyCommand(sim, { type: 'proposeTreaty', kind: 'peace', to: a.id, terms: { durationDays: 32, payment: 20 } });
      expect(peace.ok, peace.message).toBe(true);
      runUntil(sim, () => !sim.atWar(0, a.id), DAY_TICKS * 3);
      sim = reload(sim);
      expect(sim.atWar(0, a.id)).toBe(false);
      // Homeland untouched in both rulesets (nobody could reach the camp).
      expect(ownerOf(sim, sectorOf(0, 0))!.legalOwner).toBe(0);
      for (const s of sim.settlers) expect(s.captive ?? null).toBeNull();
    });
  }

  it('kingdoms fight each other too: skirmishes, land changing hands, news of it, and in time a peace', () => {
    const { sim, a, b } = warWorld();
    sim.setWar(a.id, b.id, true);
    runUntil(sim, () => !sim.atWar(a.id, b.id), DAY_TICKS * 12);
    expect(sim.worldEvents.some((e) => e.kind === 'conquest' && (e.subject === a.id || e.subject === b.id))).toBe(true);
  });
});
