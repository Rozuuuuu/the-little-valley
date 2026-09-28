import { BANNER_COLORS, CLAIM_COST, COUNCIL_POSTS, COUNCIL_POST_IDS, EMBLEMS, POLICIES, POLICY_IDS } from '../game/data/kingdoms';
import { playerKingdom } from '../game/sim/kingdoms';
import type { Simulation } from '../game/sim/Simulation';
import { homelandPreview } from '../game/sim/territory';
import { direction } from '../game/world/regions';

/**
 * Read-only kingdom summaries for the UI. Rival kingdoms are described only
 * from what the player has learned (their name, banner and where their town
 * lies), never from hidden simulation state.
 */
export interface KingdomInfo {
  name: string;
  crowned: boolean;
  ruler: string | null;
  banner: { color: string; emblem: string };
  treasury: number;
  taxCollected: number;
  policy: string;
  policies: { id: string; name: string; description: string }[];
  trust: number;
  council: { post: string; name: string; duty: string; holder: string | null; holderId: number | null }[];
  homeland: number;
  homelandPreview: number;
  claims: number;
  claimCost: number;
  conflictMode: string;
  modeLocked: boolean;
  frontierActive: boolean;
  canCoronate: boolean;
  bannerColors: readonly string[];
  emblems: readonly string[];
  rivals: { id: number; name: string; color: string; emblem: string; where: string }[];
}

export function kingdomInfo(sim: Simulation): KingdomInfo {
  const k = playerKingdom(sim);
  return {
    name: k.name,
    crowned: k.crowned,
    ruler: k.ruler?.name ?? null,
    banner: { ...k.banner },
    treasury: k.treasury,
    taxCollected: k.taxCollected,
    policy: k.policy,
    policies: POLICY_IDS.map((id) => ({ id, name: POLICIES[id].name, description: POLICIES[id].description })),
    trust: k.trust,
    council: COUNCIL_POST_IDS.map((post) => {
      const id = k.council[post];
      return { post, name: COUNCIL_POSTS[post].name, duty: COUNCIL_POSTS[post].duty, holder: id !== null ? sim.settler(id)?.name ?? null : null, holderId: id };
    }),
    homeland: k.homeland?.length ?? 0,
    homelandPreview: k.homeland ? k.homeland.length : homelandPreview(sim).length,
    claims: [...sim.claims.values()].filter((c) => c.legalOwner === k.id).length,
    claimCost: CLAIM_COST,
    conflictMode: k.conflictMode,
    modeLocked: k.modeLocked,
    frontierActive: k.frontierActive,
    canCoronate: !k.crowned && sim.progression.reached.includes('region'),
    bannerColors: BANNER_COLORS,
    emblems: EMBLEMS,
    rivals: sim.kingdoms
      .filter((r) => !r.player)
      .map((r) => ({ id: r.id, name: r.name, color: r.banner.color, emblem: r.banner.emblem, where: r.capital ? direction(r.capital.x, r.capital.y) : 'unknown' })),
  };
}
