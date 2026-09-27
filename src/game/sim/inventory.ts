import { RESOURCE_IDS, type Inventory, type ResourceId } from '../data/resources';

export function addInv(inv: Inventory, res: ResourceId, n: number): void {
  const v = (inv[res] ?? 0) + n;
  if (v <= 0) delete inv[res];
  else inv[res] = v;
}

export function invGet(inv: Inventory, res: ResourceId): number {
  return inv[res] ?? 0;
}

export function invEntries(inv: Inventory): [ResourceId, number][] {
  const out: [ResourceId, number][] = [];
  for (const r of RESOURCE_IDS) {
    const n = inv[r];
    if (n) out.push([r, n]);
  }
  return out;
}

export function hasAll(have: Inventory, need: Inventory, times = 1): boolean {
  for (const [r, n] of invEntries(need)) if ((have[r] ?? 0) < n * times) return false;
  return true;
}

export function formatInv(inv: Inventory): string {
  return invEntries(inv).map(([r, n]) => `${n} ${r}`).join(', ');
}
