import {
  BANNER_COLORS, COUNCIL_POSTS, EMBLEMS, isPolicyId, POLICIES, START_TRUST, type CouncilPost,
} from '../data/kingdoms';
import { regionById } from '../world/regions';
import { isChild } from './households';
import { homelandPreview } from './territory';
import type { Simulation } from './Simulation';
import type { CommandResult, Kingdom, Settler } from './types';

/** The player's kingdom always has id 0; a rival kingdom's id is its home region's id. */
export const PLAYER_KINGDOM = 0;

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

export function newPlayerKingdom(name: string): Kingdom {
  return {
    id: PLAYER_KINGDOM, name, player: true, crowned: false, ruler: null, banner: { color: BANNER_COLORS[0], emblem: 'oak' },
    treasury: 0, taxCollected: 0, policy: 'none', trust: START_TRUST, trustDay: 0,
    council: { steward: null, envoy: null, marshal: null },
    homeland: null, conflictMode: 'protected-frontier', modeLocked: false, frontierActive: false,
    capitalRegion: null, capital: { x: 0, y: 0 },
  };
}

export function playerKingdom(sim: Simulation): Kingdom {
  let k = sim.kingdoms.find((x) => x.player);
  if (!k) {
    k = newPlayerKingdom(sim.settlements[0]?.name ?? 'The Valley');
    sim.kingdoms.unshift(k);
  }
  return k;
}

export function kingdomById(sim: Simulation, id: number): Kingdom | undefined {
  return sim.kingdoms.find((k) => k.id === id);
}

/**
 * The kingdom seated at a distant town. It becomes part of the game the first
 * time anyone hears of it; before that it costs nothing.
 */
export function knowKingdomOf(sim: Simulation, regionId: number): Kingdom {
  sim.knownRegions.add(regionId);
  const found = kingdomById(sim, regionId);
  if (found) return found;
  const town = regionById(sim.seed, regionId);
  const k: Kingdom = {
    id: regionId, name: town.name, player: false, crowned: true,
    ruler: { name: `the lord of ${town.name}`, appearance: sim.randomAppearance() },
    banner: { color: BANNER_COLORS[(regionId % (BANNER_COLORS.length - 1)) + 1], emblem: EMBLEMS[regionId % EMBLEMS.length] },
    treasury: 200, taxCollected: 0, policy: 'modest', trust: START_TRUST, trustDay: sim.day,
    council: { steward: null, envoy: null, marshal: null },
    homeland: null, conflictMode: 'protected-frontier', modeLocked: true, frontierActive: false,
    capitalRegion: regionId, capital: { x: town.x, y: town.y },
  };
  sim.kingdoms.push(k);
  return k;
}

const NAME_OK = /^[\p{L}\p{N} '’.-]{1,40}$/u;

export function coronate(sim: Simulation, rulerName: unknown, kingdomName: unknown, banner: unknown): CommandResult {
  const k = playerKingdom(sim);
  if (k.crowned) return err(`${k.ruler?.name ?? 'Your ruler'} is already crowned`);
  if (!sim.progression.reached.includes('region')) return err('Coronation needs the Region milestone');
  const rn = typeof rulerName === 'string' ? rulerName.trim() : '';
  const kn = typeof kingdomName === 'string' ? kingdomName.trim() : '';
  if (!NAME_OK.test(rn)) return err('Give your ruler a name (letters, up to 40)');
  if (!NAME_OK.test(kn)) return err('Give your kingdom a name (letters, up to 40)');
  const b = banner as { color?: unknown; emblem?: unknown } | null;
  if (!b || !BANNER_COLORS.includes(b.color as never) || !EMBLEMS.includes(b.emblem as never)) return err('Choose a banner colour and emblem from the list');
  k.crowned = true;
  k.name = kn;
  k.ruler = { name: rn, appearance: sim.randomAppearance() };
  k.banner = { color: b.color as string, emblem: b.emblem as (typeof EMBLEMS)[number] };
  // The protected homeland is fixed now, exactly as previewed; later building never grows it.
  k.homeland = homelandPreview(sim);
  k.trustDay = sim.day;
  sim.toast(`${rn} is crowned ruler of ${kn}!`, 'good');
  sim.record('milestone', `${rn} was crowned ruler of ${kn}`);
  sim.emit({ type: 'sfx', name: 'milestone' });
  sim.emit({ type: 'important' });
  return ok(`Long live ${rn}! ${kn}'s homeland is set: ${k.homeland.length} sectors that later building never changes.`);
}

export function setPolicy(sim: Simulation, policy: unknown): CommandResult {
  if (!isPolicyId(policy)) return err('Unknown policy');
  const k = playerKingdom(sim);
  k.policy = policy;
  return ok(`${POLICIES[policy].name}: ${POLICIES[policy].description}`);
}

export function councilPostOf(sim: Simulation, s: Settler): CouncilPost | null {
  const k = sim.kingdoms[0]?.player ? sim.kingdoms[0] : sim.kingdoms.find((x) => x.player);
  if (!k) return null;
  for (const post of Object.keys(k.council) as CouncilPost[]) if (k.council[post] === s.id) return post;
  return null;
}

export function appointCouncil(sim: Simulation, post: unknown, settlerId: unknown): CommandResult {
  if (typeof post !== 'string' || !(post in COUNCIL_POSTS)) return err('Unknown council post');
  const p = post as CouncilPost;
  const k = playerKingdom(sim);
  if (settlerId === null) {
    k.council[p] = null;
    return ok(`The ${COUNCIL_POSTS[p].name} post is empty.`);
  }
  const s = sim.settler(settlerId as number);
  if (!s) return err('Choose a settler');
  if (isChild(s)) return err(`${s.name} is a child — only adults can serve on the council`);
  if (s.awayOn !== null) return err(`${s.name} is away`);
  for (const other of Object.keys(k.council) as CouncilPost[]) if (k.council[other] === s.id) k.council[other] = null;
  k.council[p] = s.id;
  s.areaId = null;
  for (const b of sim.buildings.values()) b.workers = b.workers.filter((id) => id !== s.id);
  s.task = null;
  s.nextThink = 0;
  return ok(`${s.name} now serves as ${COUNCIL_POSTS[p].name} and leaves ordinary work: ${COUNCIL_POSTS[p].duty}`);
}

/** Daily trust and council effects; drop council members who are gone. */
export function updateKingdoms(sim: Simulation): void {
  const k = playerKingdom(sim);
  for (const post of Object.keys(k.council) as CouncilPost[]) {
    const id = k.council[post];
    if (id !== null && !sim.settler(id)) k.council[post] = null;
  }
  // Days start at 1: a kingdom that has never ticked starts counting today, without a change.
  if (k.trustDay === 0) {
    k.trustDay = sim.day;
    return;
  }
  if (sim.day === k.trustDay) return;
  const days = Math.max(1, sim.day - k.trustDay);
  k.trustDay = sim.day;
  let change = POLICIES[k.policy].trustPerDay * days;
  if (k.council.steward !== null) change += days;
  k.trust = Math.max(0, Math.min(100, k.trust + change));
}
