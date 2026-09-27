import { DAY_TICKS } from '../game/core/constants';
import { BUILDINGS } from '../game/data/buildings';
import { CHILD_STABLE_TICKS, RECRUIT_APPLES } from '../game/data/kingdomBalance';
import { bedsOf, isPermanentHome } from '../game/sim/buildings';
import { daysToAdult } from '../game/sim/households';
import { recruitNeeds, recruitProblem } from '../game/sim/travelers';
import { settlementName } from '../game/sim/settlements';
import type { Simulation } from '../game/sim/Simulation';
import type { GrowthMode } from '../game/sim/types';

/** Game time as words: "3 h" of game time within a day, days beyond that. */
export function gameTime(ticks: number): string {
  if (ticks <= 0) return 'now';
  if (ticks >= DAY_TICKS) {
    const d = Math.ceil(ticks / DAY_TICKS);
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  const h = Math.max(1, Math.round((ticks / DAY_TICKS) * 24));
  return `${h} h`;
}

export interface HouseholdInfo {
  id: number;
  adultIds: [number, number];
  names: [string, string];
  children: { id: number; name: string; age: string }[];
  pending: { progress: number; blocked: string; bed: string } | null;
  /** Why a child can't be requested right now ('' when it can). */
  cooldown: string;
}

export interface GrowthInfo {
  mode: GrowthMode;
  /** Shown to older worlds: what adopting deliberate growth changes. */
  adoption: string;
  adults: number;
  children: number;
  beds: { homeUsed: number; held: number; homeTotal: number; bedrollsUsed: number; bedrolls: number };
  households: HouseholdInfo[];
  /** Adults not in a household, for pairing. */
  unpaired: { id: number; name: string; settlement: string }[];
  visitor: { id: number; name: string; leavesIn: string; needs: string[]; blocked: string } | null;
  nextVisitorIn: string;
  recruits: { id: number; name: string; state: string; blocked: string; apples: number }[];
  settlements: { id: number; name: string }[];
  applesPrice: number;
}

export function growthInfo(sim: Simulation): GrowthInfo {
  const beds = { homeUsed: 0, held: sim.bedClaims.length, homeTotal: 0, bedrollsUsed: 0, bedrolls: 0 };
  const residents = new Map<number, number>();
  for (const s of sim.settlers) if (s.homeId !== null) residents.set(s.homeId, (residents.get(s.homeId) ?? 0) + 1);
  for (const b of sim.buildings.values()) {
    const n = bedsOf(b);
    if (!n) continue;
    if (isPermanentHome(b)) {
      beds.homeTotal += n;
      beds.homeUsed += residents.get(b.id) ?? 0;
    } else {
      beds.bedrolls += n;
      beds.bedrollsUsed += residents.get(b.id) ?? 0;
    }
  }
  const name = (id: number) => sim.settler(id)?.name ?? '?';
  const households: HouseholdInfo[] = sim.households.map((h) => {
    let bed = '';
    if (h.pending?.claimId != null) {
      const claim = sim.bedClaims.find((c) => c.id === h.pending!.claimId);
      const home = claim ? sim.buildings.get(claim.homeId) : undefined;
      bed = home ? `Bed held in the ${BUILDINGS[home.type].name}` : '';
    }
    const cooldown = h.pending ? 'Already expecting' : sim.tick < h.cooldownUntil ? `Resting for ${gameTime(h.cooldownUntil - sim.tick)}` : '';
    return {
      id: h.id,
      adultIds: [h.adults[0], h.adults[1]],
      names: [name(h.adults[0]), name(h.adults[1])],
      children: h.children.map((id) => {
        const c = sim.settler(id);
        return { id, name: c?.name ?? '?', age: c && c.lifeStage === 'child' ? `grows up in ${daysToAdult(c)} days` : 'grown up' };
      }),
      pending: h.pending ? { progress: Math.min(1, h.pending.stableTicks / CHILD_STABLE_TICKS), blocked: h.pending.blocked, bed: bed || 'Waiting for a free bed' } : null,
      cooldown,
    };
  });
  const home = sim.settlements[0]?.id;
  const offer = sim.offer;
  const visitor = offer && home !== undefined
    ? { id: offer.id, name: offer.name, leavesIn: gameTime(offer.expiresTick - sim.tick), needs: recruitNeeds(sim, home), blocked: recruitProblem(sim, home) ?? '' }
    : null;
  return {
    mode: sim.growthMode,
    adoption: sim.growthMode === 'legacy'
      ? 'This valley still draws newcomers automatically whenever a bed and spare food are free. Adopting deliberate growth means new people come only from households that ask for children and from visiting travellers you welcome with apples. Everyone already here stays; this can’t be undone.'
      : '',
    adults: sim.settlers.filter((s) => s.lifeStage === 'adult').length,
    children: sim.settlers.filter((s) => s.lifeStage === 'child').length,
    beds,
    households,
    unpaired: sim.settlers.filter((s) => s.lifeStage === 'adult' && s.householdId === null).map((s) => ({ id: s.id, name: s.name, settlement: settlementName(sim, s.settlementId) })),
    visitor,
    nextVisitorIn: offer || sim.growthMode !== 'deliberate' ? '' : gameTime(sim.nextVisitor - sim.tick),
    recruits: sim.recruits.map((r) => ({
      id: r.id, name: r.name,
      state: r.state === 'refunding' ? 'Returning the apples (stores are full)' : r.blocked || `On the way to ${settlementName(sim, r.settlementId)}`,
      blocked: r.blocked, apples: r.escrow.apples ?? 0,
    })),
    settlements: sim.settlements.map((s) => ({ id: s.id, name: s.name })),
    applesPrice: RECRUIT_APPLES,
  };
}
