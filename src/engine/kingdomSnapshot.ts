import { BANNER_COLORS, CLAIM_COST, COUNCIL_POSTS, COUNCIL_POST_IDS, EMBLEMS, POLICIES, POLICY_IDS } from '../game/data/kingdoms';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from '../game/sim/kingdoms';
import type { Simulation } from '../game/sim/Simulation';
import { homelandPreview } from '../game/sim/territory';
import { direction } from '../game/world/regions';
import { TREATIES, TREATY_KINDS } from '../game/data/treaties';
import { stanceOf, trustOf } from '../game/sim/diplomacy';
import { knowledgeOf } from '../game/sim/news';
import { assessCampaign, spareCompanies, type CampaignAssessment } from '../game/sim/campaigns';
import { declarePreview, type DeclarePreview } from '../game/sim/combat';
import { pairKey } from '../game/sim/diplomacy';
import { DAY_TICKS } from '../game/core/constants';
import { gameTime } from './growthInfo';

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

// ---- diplomacy, news and the war council (from the player's knowledge only) --------

const KIND_WORDS: Record<string, string> = {
  'military-buildup': 'raised soldiers', 'border-forces': 'had troops at a border', claim: 'claimed land', conquest: 'conquered land',
  'treaty-broken': 'broke a treaty', prosperity: 'is prospering', 'war-declared': 'declared war', alliance: 'made an alliance',
};

export interface DiplomacyInfo {
  kingdoms: { id: number; name: string; color: string; stance: string; mood: string; treaties: { id: number; name: string; endsIn: string }[] }[];
  offersToYou: { id: number; from: string; name: string; benefits: string; obligations: string; breach: string; days: number; payment: number; expiresIn: string }[];
  yourOffers: { id: number; to: string; name: string; state: string; reasons: string[] }[];
  incidents: { id: number; from: string; kind: string; where: string }[];
  warnings: { id: number; from: string; band: string; reasons: string[]; actions: string[] }[];
  treatyKinds: { id: string; name: string; benefits: string; obligations: string; breach: string }[];
  hasEnvoy: boolean;
}

export function diplomacyInfo(sim: Simulation): DiplomacyInfo {
  const me = playerKingdom(sim);
  const name = (id: number) => kingdomById(sim, id)?.name ?? 'Unknown';
  return {
    kingdoms: sim.kingdoms.filter((k) => !k.player).map((k) => {
      const t = trustOf(sim, k.id, me.id);
      const band = sim.concernStates.get(`${k.id}>${me.id}`)?.band ?? 'calm';
      return {
        id: k.id, name: k.name, color: k.banner.color, stance: stanceOf(sim, me.id, k.id),
        // Their private feelings are shown only as a rough impression.
        mood: `${t >= 65 ? 'friendly' : t >= 40 ? 'polite' : 'cold'}${band === 'concerned' || band === 'alarmed' ? `, ${band} about you` : ''}`,
        treaties: sim.offers.filter((o) => o.state === 'active' && ((o.proposer === k.id && o.recipient === me.id) || (o.recipient === k.id && o.proposer === me.id)))
          .map((o) => ({ id: o.id, name: TREATIES[o.kind].name, endsIn: gameTime((o.endsTick ?? sim.tick) - sim.tick) })),
      };
    }),
    offersToYou: sim.offers.filter((o) => o.recipient === me.id && o.state === 'proposed').map((o) => ({
      id: o.id, from: name(o.proposer), name: TREATIES[o.kind].name, benefits: TREATIES[o.kind].benefits, obligations: TREATIES[o.kind].obligations,
      breach: TREATIES[o.kind].breach, days: o.terms.durationDays, payment: o.terms.payment, expiresIn: gameTime(o.expiresTick - sim.tick),
    })),
    yourOffers: sim.offers.filter((o) => o.proposer === me.id).slice(-6).reverse().map((o) => ({
      id: o.id, to: name(o.recipient), name: TREATIES[o.kind].name, state: o.state === 'proposed' ? 'on its way' : o.state, reasons: o.reasons,
    })),
    incidents: sim.incidents.filter((i) => i.to === me.id && i.state === 'open').map((i) => ({
      id: i.id, from: name(i.from), kind: i.kind === 'civilianPassage' ? 'Travellers crossing' : i.kind === 'armedPassage' ? 'Armed men crossing' : 'An attack', where: `sector ${i.sector.x},${i.sector.y}`,
    })),
    warnings: sim.warnings.filter((w) => w.to === me.id && w.state === 'open').map((w) => ({ id: w.id, from: name(w.from), band: w.band, reasons: w.reasons, actions: w.actions })),
    treatyKinds: TREATY_KINDS.map((k) => ({ id: k, name: TREATIES[k].name, benefits: TREATIES[k].benefits, obligations: TREATIES[k].obligations, breach: TREATIES[k].breach })),
    hasEnvoy: me.council.envoy !== null,
  };
}

export interface NewsItem {
  id: number;
  text: string;
  source: string;
  certainty: string;
  age: string;
  where: string;
  corrected: boolean;
}

/** The player's delivered news, newest first. */
export function newsInfo(sim: Simulation): { items: NewsItem[]; summarised: number } {
  const items = knowledgeOf(sim, PLAYER_KINGDOM).slice(0, 30).map((r) => ({
    id: r.id,
    text: `${kingdomById(sim, r.subjectKingdomId)?.name ?? 'Someone'} ${KIND_WORDS[r.kind] ?? r.kind}${r.kind === 'military-buildup' ? ` (about ${r.magnitude} companies)` : ''}`,
    source: r.sourceKingdomId !== null ? `via ${kingdomById(sim, r.sourceKingdomId)?.name ?? 'an ally'}` : r.sourceKind,
    certainty: r.certainty,
    age: `${gameTime(sim.tick - r.eventTick)} ago`,
    where: r.location ? `sector ${r.location.x},${r.location.y}` : 'place unknown',
    corrected: r.supersedes !== null,
  }));
  return { items, summarised: sim.newsSummaries.get(PLAYER_KINGDOM) ?? 0 };
}

export interface WarCouncilInfo {
  plans: {
    id: number;
    target: string;
    objective: string;
    state: string;
    assessment: CampaignAssessment;
    commitments: { id: number; ally: string; state: string; reasons: string[]; fee: number; days: number; supply: string; command: string; companies: number }[];
  }[];
  allies: { id: number; name: string; spare: number }[];
}

export function warCouncilInfo(sim: Simulation): WarCouncilInfo {
  return {
    plans: sim.warPlans.filter((p) => p.state === 'drafting' || p.state === 'mobilizing' || p.state === 'launched').map((p) => ({
      id: p.id, target: kingdomById(sim, p.target)?.name ?? '?', objective: p.objective, state: p.state, assessment: assessCampaign(sim, p.id),
      commitments: sim.commitments.filter((c) => c.campaignId === p.id).map((c) => ({
        id: c.id, ally: kingdomById(sim, c.contributor)?.name ?? '?', state: c.state, reasons: c.reasons, fee: c.terms.coinFee, days: c.terms.serviceDays,
        supply: c.terms.supplyPayer, command: c.terms.commandRights, companies: c.terms.companies.length || c.requested.companies,
      })),
    })),
    // Only allies tell you how many companies they could spare.
    allies: sim.kingdoms.filter((k) => !k.player && stanceOf(sim, PLAYER_KINGDOM, k.id) === 'ally').map((k) => ({ id: k.id, name: k.name, spare: spareCompanies(sim, k.id) })),
  };
}

// ---- war (from the player's knowledge; the field is visible on the map) ------------

export interface WarInfo {
  wars: {
    with: number;
    name: string;
    objective: string;
    days: number;
    occupiedByYou: { x: number; y: number }[];
    occupiedByThem: { x: number; y: number }[];
    siege: number | null;
    captives: string[];
  }[];
  previews: { id: number; name: string; preview: DeclarePreview }[];
  settlements: { id: number; name: string }[];
}

export function warInfo(sim: Simulation): WarInfo {
  const wars: WarInfo['wars'] = [];
  for (const k of sim.kingdoms) {
    if (k.player || !sim.wars.has(pairKey(PLAYER_KINGDOM, k.id))) continue;
    const ws = sim.warStates.get(pairKey(PLAYER_KINGDOM, k.id));
    const mine: { x: number; y: number }[] = [];
    const theirs: { x: number; y: number }[] = [];
    for (const [key, c] of sim.claims) {
      const [x, y] = key.split(',').map(Number);
      if (c.legalOwner === k.id && c.occupyingKingdom === PLAYER_KINGDOM) mine.push({ x, y });
      if (c.legalOwner === PLAYER_KINGDOM && c.occupyingKingdom === k.id) theirs.push({ x, y });
    }
    wars.push({
      with: k.id, name: k.name, objective: ws?.objective ?? 'raid',
      days: ws ? Math.floor((sim.tick - ws.startedTick) / DAY_TICKS) : 0,
      occupiedByYou: mine, occupiedByThem: theirs,
      siege: sim.sieges.get(k.id)?.besieger === PLAYER_KINGDOM ? Math.round(sim.sieges.get(k.id)!.progress) : null,
      captives: sim.settlers.filter((s) => s.captive?.by === k.id).map((s) => s.name),
    });
  }
  return {
    wars,
    previews: sim.kingdoms.filter((k) => !k.player && !sim.wars.has(pairKey(PLAYER_KINGDOM, k.id))).map((k) => ({ id: k.id, name: k.name, preview: declarePreview(sim, k.id) })),
    settlements: sim.settlements.map((s) => ({ id: s.id, name: s.name })),
  };
}
