import { BUILDINGS } from '../game/data/buildings';
import { PRICES, buyPrice, sellPrice } from '../game/data/trade';
import { RESOURCES, RESOURCE_IDS, type ResourceId } from '../game/data/resources';
import { invEntries } from '../game/sim/inventory';
import { routeInfo } from '../game/sim/logistics';
import { settlementOfBuilding } from '../game/sim/settlements';
import type { Simulation } from '../game/sim/Simulation';
import type { Building } from '../game/sim/types';
import { direction, regionById } from '../game/world/regions';
import { gameTime } from './growthInfo';

export interface StoreChoice {
  id: number;
  name: string;
}

export interface LogisticsInfo {
  stores: StoreChoice[];
  routes: { id: number; from: string; to: string; res: ResourceId; resName: string; target: number; status: string }[];
  carts: number;
  towns: { name: string; where: string }[];
  resources: { id: ResourceId; name: string }[];
}

function storeName(sim: Simulation, b: Building): string {
  const st = settlementOfBuilding(sim, b);
  return `${st?.name ?? 'Valley'}: ${BUILDINGS[b.type].name}`;
}

/** Supply routes, stores to pick from, carts on the road and distant towns heard of. */
export function logisticsInfo(sim: Simulation): LogisticsInfo {
  const stores = sim.storages().filter((b) => b.type !== 'crate').map((b) => ({ id: b.id, name: storeName(sim, b) }));
  const byId = new Map(stores.map((s) => [s.id, s.name]));
  return {
    stores,
    routes: sim.routes.map((r) => ({
      id: r.id, from: byId.get(r.sourceId) ?? 'gone', to: byId.get(r.destId) ?? 'gone', res: r.res,
      resName: RESOURCES[r.res].name, target: r.target, status: routeInfo(sim, r.id).status,
    })),
    carts: sim.manifests.length,
    towns: [...sim.knownRegions].map((id) => {
      const n = regionById(sim.seed, id);
      return { name: n.name, where: `${direction(n.x, n.y)}, about ${gameTime(Math.hypot(n.x, n.y) / 0.5)} away` };
    }),
    resources: RESOURCE_IDS.map((id) => ({ id, name: RESOURCES[id].name })),
  };
}

export interface InnInfo {
  guest: {
    id: number;
    name: string;
    from: string;
    state: string;
    stock: { res: ResourceId; name: string; n: number; price: number }[];
    /** What they pay per unit for your goods. */
    buys: { res: ResourceId; name: string; price: number }[];
    leavesIn: string;
  } | null;
  next: string;
}

/** The inn's guest (if any) and their prices. */
export function innInfo(sim: Simulation, inn: Building): InnInfo {
  const p = sim.parties.find((x) => x.innId === inn.id);
  if (!p) {
    const wait = sim.nextMerchant ? Math.max(0, sim.nextMerchant - sim.tick) : 0;
    return { guest: null, next: sim.nextMerchant ? `A merchant should set off within ${gameTime(wait)}.` : 'Merchants will start coming now that the inn stands.' };
  }
  const home = regionById(sim.seed, p.homeRegion);
  const state = p.state === 'travelling' ? `On the road from ${home.name}` : p.state === 'arriving' ? 'Walking in' : p.state === 'lodging' ? 'Staying at the inn — ready to trade' : 'Leaving';
  return {
    guest: {
      id: p.id, name: p.name, from: home.name, state,
      stock: invEntries(p.stock).map(([res, n]) => ({ res, name: RESOURCES[res].name, n, price: sellPrice(res) })),
      buys: RESOURCE_IDS.filter((r) => PRICES[r] > 0).map((res) => ({ res, name: RESOURCES[res].name, price: buyPrice(res) })),
      leavesIn: p.state === 'lodging' ? gameTime(p.leaveTick - sim.tick) : '',
    },
    next: '',
  };
}
