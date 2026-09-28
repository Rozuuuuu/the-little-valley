import { BUILDINGS } from '../game/data/buildings';
import { UNITS, UNIT_TYPES } from '../game/data/units';
import { playerCompanies } from '../game/sim/military';
import { companyWhere } from '../game/sim/military';
import type { Simulation } from '../game/sim/Simulation';
import type { Building } from '../game/sim/types';

export interface ArmyInfo {
  companies: {
    id: number;
    kind: string;
    members: { id: number; name: string; state: string; progress: number }[];
    state: string;
    readiness: number;
    supplies: number;
    strength: number;
    where: string;
  }[];
  equipment: { swords: number; bows: number; armor: number; horses: number };
  units: { id: string; name: string; gear: string; description: string }[];
  training: number;
}

export function armyInfo(sim: Simulation): ArmyInfo {
  const t = sim.totals();
  return {
    companies: playerCompanies(sim).map((c) => ({
      id: c.id,
      kind: UNITS[c.kind].name,
      members: (c.members ?? []).map((id) => {
        const s = sim.settler(id);
        const m = s?.military;
        return { id, name: s?.name ?? '?', state: m?.state ?? 'gone', progress: m ? Math.min(1, m.trained / UNITS[m.unit].trainTicks) : 0 };
      }),
      state: c.state ?? 'home',
      readiness: c.readiness ?? 100,
      supplies: c.supplies ?? 0,
      strength: c.strength,
      where: c.state === 'home' ? 'at home' : companyWhere(sim, c),
    })),
    equipment: { swords: t.swords, bows: t.bows, armor: t.armor, horses: t.horses },
    units: UNIT_TYPES.map((u) => ({
      id: u, name: UNITS[u].name, description: UNITS[u].description,
      gear: Object.entries(UNITS[u].gear).map(([r, n]) => `${n} ${r}`).join(', '),
    })),
    training: sim.settlers.filter((s) => s.military?.state === 'training').length,
  };
}

/** For a barracks or range inspector. */
export function trainingInfo(sim: Simulation, b: Building): { units: { id: string; name: string; gear: string }[]; slots: number; used: number } | undefined {
  const def = BUILDINGS[b.type];
  if (!def.training || !b.built) return undefined;
  return {
    units: def.training.units.map((u) => ({ id: u, name: UNITS[u].name, gear: Object.entries(UNITS[u].gear).map(([r, n]) => `${n} ${r}`).join(', ') })),
    slots: def.training.slots,
    used: sim.settlers.filter((s) => s.military?.state === 'training' && s.military.buildingId === b.id).length,
  };
}
