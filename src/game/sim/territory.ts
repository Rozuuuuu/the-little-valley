import { CHUNK } from '../core/constants';
import { CLAIM_COST, HOMELAND_CHUNKS, RIVAL_LAND, SECTOR } from '../data/kingdoms';
import { BUILDINGS } from '../data/buildings';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from './kingdoms';
import { settlementOfBuilding } from './settlements';
import { reportClaim } from './diplomacy';
import type { Simulation } from './Simulation';
import type { ClaimSector, CommandResult, TerritoryClaim } from './types';

/**
 * Land and who holds it. The world is split into 16×16-tile sectors. Owning a
 * sector (legal title) is separate from occupying it, and exploring land never
 * makes it yours. The player's protected homeland is fixed at coronation;
 * frontier claims must touch your land or hold a supplied settlement.
 */

export function sectorOf(x: number, y: number): ClaimSector {
  return { x: Math.floor(x / SECTOR), y: Math.floor(y / SECTOR) };
}

export const sectorKey = (s: ClaimSector): string => `${s.x},${s.y}`;

/** The homeland the player would get if crowned now: the starting 3×3 chunks plus every sector holding one of your buildings. */
export function homelandPreview(sim: Simulation): ClaimSector[] {
  const set = new Map<string, ClaimSector>();
  const per = CHUNK / SECTOR;
  for (let cy = HOMELAND_CHUNKS.from; cy <= HOMELAND_CHUNKS.to; cy++) {
    for (let cx = HOMELAND_CHUNKS.from; cx <= HOMELAND_CHUNKS.to; cx++) {
      for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
        const s = { x: cx * per + i, y: cy * per + j };
        set.set(sectorKey(s), s);
      }
    }
  }
  for (const b of sim.buildings.values()) {
    if (b.type === 'crate') continue;
    for (const [x, y] of [[b.x, b.y], [b.x + b.w - 1, b.y + b.h - 1]]) {
      const s = sectorOf(x, y);
      set.set(sectorKey(s), s);
    }
  }
  return [...set.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Who holds a sector, or null for unowned land. */
export function ownerOf(sim: Simulation, sector: ClaimSector): TerritoryClaim | null {
  const k = sectorKey(sector);
  const me = playerKingdom(sim);
  const conquest = me.conflictMode === 'full-conquest';
  if (me.homeland?.some((s) => s.x === sector.x && s.y === sector.y)) {
    return { sector, legalOwner: me.id, occupyingKingdom: null, protectedHomeland: !conquest };
  }
  const claim = sim.claims.get(k);
  if (claim) return { ...claim, sector };
  for (const r of sim.kingdoms) {
    if (r.player || !r.capital) continue;
    const c = sectorOf(r.capital.x, r.capital.y);
    const d = Math.max(Math.abs(c.x - sector.x), Math.abs(c.y - sector.y));
    // The town and the ring around it are its protected core; beyond that is its frontier.
    if (d <= RIVAL_LAND) return { sector, legalOwner: r.id, occupyingKingdom: null, protectedHomeland: d <= 1 && !conquest };
  }
  return null;
}

/** Why the player can't build at a tile (someone else's land), or null. */
export function landProblem(sim: Simulation, x: number, y: number, w: number, h: number): string | null {
  if (sim.kingdoms.length <= 1) return null;
  for (const [tx, ty] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
    const o = ownerOf(sim, sectorOf(tx, ty));
    if (o && o.legalOwner !== PLAYER_KINGDOM) return `That land belongs to ${kingdomById(sim, o.legalOwner)?.name ?? 'another kingdom'}`;
  }
  return null;
}

function mine(sim: Simulation, s: ClaimSector): boolean {
  const o = ownerOf(sim, s);
  return !!o && o.legalOwner === PLAYER_KINGDOM;
}

/** A player settlement centre in this sector that a supply route serves. */
function suppliedSettlement(sim: Simulation, s: ClaimSector): boolean {
  for (const st of sim.settlements) {
    const hall = sim.buildings.get(st.id);
    if (!hall) continue;
    const hs = sectorOf(hall.x, hall.y);
    if (hs.x !== s.x || hs.y !== s.y) continue;
    for (const r of sim.routes) {
      const src = sim.buildings.get(r.sourceId);
      const dst = sim.buildings.get(r.destId);
      if ((src && settlementOfBuilding(sim, src)?.id === st.id) || (dst && settlementOfBuilding(sim, dst)?.id === st.id)) return true;
    }
  }
  return false;
}

export interface ClaimPreview {
  cost: number;
  owner: string | null;
  protectedHomeland: boolean;
  supplied: boolean;
  problem: string | null;
}

/** Everything the player should know before claiming a sector. */
export function claimPreview(sim: Simulation, sector: ClaimSector): ClaimPreview {
  const me = playerKingdom(sim);
  const o = ownerOf(sim, sector);
  const owner = o ? kingdomById(sim, o.legalOwner)?.name ?? 'another kingdom' : null;
  const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mine(sim, { x: sector.x + dx, y: sector.y + dy }));
  const supplied = touching || suppliedSettlement(sim, sector);
  let problem: string | null = null;
  if (!me.crowned) problem = 'Crown your ruler first (Region milestone)';
  else if (o && o.legalOwner === me.id) problem = me.homeland?.some((s) => s.x === sector.x && s.y === sector.y) ? 'This is already your homeland' : 'This land is already yours';
  else if (o) problem = o.protectedHomeland ? `This land belongs to ${owner} — its homeland is protected` : `This land belongs to ${owner} — taking it needs a war and a peace treaty`;
  else if (!supplied) problem = 'Claims must touch your land, or hold one of your settlements supplied by a route';
  else if (me.treasury < CLAIM_COST) problem = `Claiming costs ${CLAIM_COST} coins (the treasury has ${me.treasury})`;
  return { cost: CLAIM_COST, owner, protectedHomeland: !!o?.protectedHomeland, supplied, problem };
}

export function claimFrontier(sim: Simulation, sector: unknown): CommandResult {
  const s = sector as ClaimSector | null;
  if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y)) return { ok: false, message: 'Invalid sector' };
  const p = claimPreview(sim, { x: s.x, y: s.y });
  if (p.problem) return { ok: false, message: p.problem };
  const me = playerKingdom(sim);
  me.treasury -= p.cost;
  me.modeLocked = true;
  sim.claims.set(sectorKey(s), { legalOwner: me.id, occupyingKingdom: null, protectedHomeland: false });
  reportClaim(sim, { x: s.x, y: s.y });
  sim.record('settlement', `${me.name} claimed new frontier land`);
  sim.emit({ type: 'important' });
  return { ok: true, message: `Claimed for ${p.cost} coins. Frontier land is not protected like the homeland.` };
}

export function setConflictMode(sim: Simulation, mode: unknown): CommandResult {
  if (mode !== 'protected-frontier' && mode !== 'full-conquest') return { ok: false, message: 'Unknown setting' };
  const me = playerKingdom(sim);
  if (me.modeLocked) return { ok: false, message: 'The conflict setting is locked once you claim frontier land' };
  me.conflictMode = mode;
  return { ok: true, message: mode === 'full-conquest' ? 'Full conquest: homelands, yours included, can be taken in war.' : 'Protected frontier: homelands are safe; only frontier land can change hands.' };
}

export function activateFrontier(sim: Simulation): CommandResult {
  if (!sim.progression.reached.includes('civilization')) return { ok: false, message: 'Frontier conflict can only be enabled at the Civilization milestone' };
  const me = playerKingdom(sim);
  if (!me.crowned) return { ok: false, message: 'Crown your ruler first' };
  me.frontierActive = true;
  me.modeLocked = true;
  return { ok: true, message: 'The frontier is open: border incidents and war become possible. Your homeland rules still apply.' };
}

/**
 * Whether a kingdom's people may enter a sector. Civilians may travel anywhere;
 * armed parties need to own the land, a passage agreement or a war, and never
 * enter a protected homeland.
 */
export function canEnterTerritory(sim: Simulation, kingdomId: number, sector: ClaimSector, armed: boolean): { allowed: boolean; reason: string } {
  const o = ownerOf(sim, sector);
  if (!o || o.legalOwner === kingdomId) return { allowed: true, reason: o ? 'Your own land' : 'Unclaimed land' };
  const owner = kingdomById(sim, o.legalOwner)?.name ?? 'another kingdom';
  if (!armed) return { allowed: true, reason: `Civilians may travel through ${owner}'s land` };
  if (o.protectedHomeland) return { allowed: false, reason: `${owner}'s homeland is protected` };
  if (sim.hasPassage(kingdomId, o.legalOwner)) return { allowed: true, reason: `A passage agreement with ${owner}` };
  if (sim.atWar(kingdomId, o.legalOwner)) return { allowed: true, reason: `At war with ${owner}` };
  return { allowed: false, reason: `Armed entry into ${owner}'s land needs permission (a passage treaty) or war` };
}

/** Building rules for sectors, used by placement. */
export function sectorBuildable(sim: Simulation, type: keyof typeof BUILDINGS, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  return landProblem(sim, x, y, def.size.w, def.size.h);
}
