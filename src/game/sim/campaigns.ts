import { DAY_TICKS } from '../core/constants';
import { COUNCIL_POSTS } from '../data/kingdoms';
import { DEFENCE_RESERVE } from '../data/treaties';
import { evaluateConcern } from './concern';
import { letterTicks, pairKey, stanceOf, trustOf } from './diplomacy';
import { kingdomById, playerKingdom, PLAYER_KINGDOM } from './kingdoms';
import { latestAbout } from './news';
import { ownerOf, sectorKey } from './territory';
import type { Simulation } from './Simulation';
import type { CampaignSupportTerms, ClaimSector, CoalitionCommitment, CommandResult, Company, WarPlan } from './types';

/**
 * The war council. A war plan is private drafting: nobody hears of it until
 * an ally is asked. Allies answer requests for support with their reasons —
 * accept, counter-offer or refuse — and an identical request gets the same
 * answer rather than a new roll. Accepting escrows the fee and reserves the
 * ally's real companies (never the same ones twice, never their last company).
 * Mustering and launching need an army and come with the military milestones.
 */

const ok = (message?: string, id?: number): CommandResult => ({ ok: true, message, id });
const err = (message: string): CommandResult => ({ ok: false, message });

export interface SupportRequest {
  companies: number;
  coinFee: number;
  supplyPayer: CampaignSupportTerms['supplyPayer'];
  serviceDays: number;
  commandRights: CampaignSupportTerms['commandRights'];
  rewardSectors: ClaimSector[];
  reciprocalDefenseDays: number;
  unit?: Company['kind'];
}

function available(k: { companies: Company[] }): Company[] {
  return k.companies.filter((c) => c.pledgedTo === null);
}

/** Companies an ally could spare: all at home but its defence reserve. */
export function spareCompanies(sim: Simulation, allyId: number): number {
  const k = kingdomById(sim, allyId);
  return k ? Math.max(0, available(k).length - DEFENCE_RESERVE) : 0;
}

export function createWarPlan(sim: Simulation, target: unknown, objective: unknown): CommandResult {
  const me = playerKingdom(sim);
  if (!me.crowned) return err('Only a crowned ruler can plan a war');
  const t = kingdomById(sim, target as number);
  if (!t || t.player) return err('Choose a kingdom you know of');
  if (objective !== 'raid' && objective !== 'capture' && objective !== 'defend') return err('Choose a limited objective: raid, capture frontier land, or defend');
  const plan: WarPlan = { id: sim.allocId(), target: t.id, objective, createdTick: sim.tick, state: 'drafting', staging: null };
  sim.warPlans.push(plan);
  return ok(`A private plan against ${t.name}. Nobody else knows until you ask an ally.`, plan.id);
}

function validRewards(sim: Simulation, plan: WarPlan, rewards: ClaimSector[], forAlly: number): string | null {
  const target = kingdomById(sim, plan.target)!;
  for (const s of rewards) {
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) return 'Invalid land';
    const o = ownerOf(sim, s);
    if (!o || o.legalOwner !== plan.target) return `That land does not belong to ${target.name}, the target`;
    if (o.protectedHomeland) return `That is ${target.name}'s protected homeland — it can't be promised`;
    for (const c of sim.commitments) {
      if (c.contributor === forAlly || ['refused', 'expired', 'cancelled'].includes(c.state)) continue;
      if (c.terms.rewardSectors.some((q) => q.x === s.x && q.y === s.y)) return `That land is already promised to ${kingdomById(sim, c.contributor)?.name}`;
    }
  }
  return null;
}

function sameRequest(a: SupportRequest, b: SupportRequest): boolean {
  return JSON.stringify({ ...a, rewardSectors: a.rewardSectors.map(sectorKey) }) === JSON.stringify({ ...b, rewardSectors: b.rewardSectors.map(sectorKey) });
}

export function requestCampaignSupport(sim: Simulation, planId: unknown, allyId: unknown, termsRaw: unknown): CommandResult {
  const plan = sim.warPlans.find((p) => p.id === planId);
  if (!plan || plan.state !== 'drafting') return err('That war plan is not open');
  const ally = kingdomById(sim, allyId as number);
  if (!ally || ally.player || ally.id === plan.target) return err('Choose another kingdom to ask');
  const me = playerKingdom(sim);
  if (me.council.envoy === null) return err(`Appoint an ${COUNCIL_POSTS.envoy.name} to carry the request`);
  if (sim.wars.has(pairKey(ally.id, PLAYER_KINGDOM))) return err(`You are at war with ${ally.name}`);
  const t = termsRaw as SupportRequest;
  if (!t || !Number.isInteger(t.companies) || t.companies < 1 || !Number.isInteger(t.coinFee) || t.coinFee < 0 || !Number.isInteger(t.serviceDays) || t.serviceDays < 1) return err('Invalid terms');
  if (!['requester', 'contributor', 'shared'].includes(t.supplyPayer) || !['coordinated', 'delegated'].includes(t.commandRights)) return err('Invalid terms');
  const rewards = Array.isArray(t.rewardSectors) ? t.rewardSectors : [];
  const bad = validRewards(sim, plan, rewards, ally.id);
  if (bad) return err(bad);
  if (t.coinFee > me.treasury) return err(`The treasury holds only ${me.treasury} coins`);
  const spare = spareCompanies(sim, ally.id);
  if (t.companies > spare) return err(`${ally.name} can spare only ${spare} ${spare === 1 ? 'company' : 'companies'} — the rest are already pledged or its defence reserve`);
  const earlier = sim.commitments.filter((c) => c.campaignId === plan.id && c.contributor === ally.id);
  if (earlier.some((c) => sameRequest(c.requested, t))) return err(`You already asked ${ally.name} with these same terms — change the terms to ask again`);
  const open = earlier.find((c) => c.state === 'proposed');
  if (open) return err(`${ally.name} has not answered your last request yet`);
  const c: CoalitionCommitment = {
    id: sim.allocId(), campaignId: plan.id, contributor: ally.id, beneficiary: PLAYER_KINGDOM, state: 'proposed',
    requested: { ...t, rewardSectors: rewards.map((s) => ({ x: s.x, y: s.y })) },
    terms: {
      companies: [], coinFee: t.coinFee, supplyPayer: t.supplyPayer, requesterSupplyShare: t.supplyPayer === 'shared' ? 0.5 : t.supplyPayer === 'requester' ? 1 : 0,
      serviceDays: t.serviceDays, commandRights: t.commandRights, rewardSectors: rewards.map((s) => ({ x: s.x, y: s.y })), reciprocalDefenseDays: t.reciprocalDefenseDays ?? 0,
    },
    expiresTick: sim.tick + 3 * DAY_TICKS, activatedTick: null, escrow: 0, reasons: [],
    decideTick: sim.tick + letterTicks(sim, PLAYER_KINGDOM, ally.id) * 2, unit: t.unit ?? null,
  };
  sim.commitments.push(c);
  return ok(`Your envoy carries the request to ${ally.name}. Only they learn of the plan.`, c.id);
}

/** What the ally makes of a request, deterministically: same situation, same answer. */
function allyAnswer(sim: Simulation, c: CoalitionCommitment): { verdict: 'accept' | 'counter' | 'refuse'; terms: CampaignSupportTerms; reasons: string[] } {
  const plan = sim.warPlans.find((p) => p.id === c.campaignId)!;
  const ally = kingdomById(sim, c.contributor)!;
  const target = kingdomById(sim, plan.target)!;
  const reasons: string[] = [];
  let will = trustOf(sim, ally.id, PLAYER_KINGDOM);
  reasons.push(`Trust in you: ${will}/100`);
  if (stanceOf(sim, ally.id, PLAYER_KINGDOM) === 'ally') {
    will += 10;
    reasons.push('You are allies');
  }
  const worry = evaluateConcern(sim, ally.id, target.id);
  if (worry.score >= 25) {
    will += 20;
    reasons.push(`They are ${worry.band} about ${target.name} themselves`);
  }
  if (sim.wars.has(pairKey(ally.id, target.id))) {
    will += 25;
    reasons.push(`They are already at war with ${target.name}`);
  }
  const dist = Math.hypot((ally.capital?.x ?? 0) - (target.capital?.x ?? 0), (ally.capital?.y ?? 0) - (target.capital?.y ?? 0));
  if (dist > 250) {
    will -= 10;
    reasons.push(`${target.name} is far from them`);
  }
  const req = c.requested;
  if (req.commandRights === 'delegated') {
    will -= 10;
    reasons.push('They want to command their own soldiers');
  }
  if (req.serviceDays > 8) {
    will -= 10;
    reasons.push(`${req.serviceDays} days is a long time away from home`);
  }
  const committed = sim.commitments.filter((x) => x.contributor === ally.id && x.state === 'accepted').length;
  if (committed) {
    will -= 10 * committed;
    reasons.push('They have already promised soldiers elsewhere');
  }
  const offered = req.coinFee / 3 + (req.supplyPayer === 'requester' ? 8 : req.supplyPayer === 'shared' ? 4 : 0) + req.rewardSectors.length * 8;
  will += offered;
  if (offered) reasons.push('Your offer of payment, supplies or land counts in your favour');
  const terms: CampaignSupportTerms = { ...c.terms, rewardSectors: c.terms.rewardSectors.map((s) => ({ ...s })) };
  if (will >= 75) {
    reasons.push('They agree to your terms');
    return { verdict: 'accept', terms, reasons };
  }
  if (will >= 45) {
    terms.coinFee = Math.max(req.coinFee, 30 * req.companies);
    terms.serviceDays = Math.min(req.serviceDays, 8);
    terms.supplyPayer = 'requester';
    terms.requesterSupplyShare = 1;
    terms.commandRights = 'coordinated';
    reasons.push(`They would come for ${terms.coinFee} coins, ${terms.serviceDays} days' service, you feeding their soldiers, under their own command`);
    return { verdict: 'counter', terms, reasons };
  }
  reasons.push('They decline — this does not make them your enemy');
  return { verdict: 'refuse', terms, reasons };
}

/** Reserves the ally's companies and escrows the fee. */
function commit(sim: Simulation, c: CoalitionCommitment): string | null {
  const me = playerKingdom(sim);
  const ally = kingdomById(sim, c.contributor)!;
  if (c.terms.coinFee > me.treasury) return `The treasury can't cover the ${c.terms.coinFee} coin fee`;
  const want = c.requested.companies;
  if (want > spareCompanies(sim, ally.id)) return `${ally.name} no longer has ${want} companies to spare`;
  const pool = available(ally).sort((a, b) => (a.kind === c.unit ? -1 : 0) - (b.kind === c.unit ? -1 : 0));
  const chosen = pool.slice(0, want);
  for (const q of chosen) q.pledgedTo = c.id;
  c.terms.companies = chosen.map((q) => q.id);
  me.treasury -= c.terms.coinFee;
  c.escrow = c.terms.coinFee;
  c.state = 'accepted';
  c.activatedTick = sim.tick;
  return null;
}

export function acceptCampaignOffer(sim: Simulation, commitmentId: unknown): CommandResult {
  const c = sim.commitments.find((x) => x.id === commitmentId);
  if (!c || c.state !== 'countered') return err('There is no counter-offer to accept');
  if (sim.tick >= c.expiresTick) {
    c.state = 'expired';
    return err('That counter-offer has expired');
  }
  const problem = commit(sim, c);
  if (problem) return err(problem);
  return ok(`Agreed. ${c.terms.coinFee} coins are held until their soldiers reach your staging ground; they are not refunded for service already given.`);
}

export function counterCampaignOffer(sim: Simulation, commitmentId: unknown, termsRaw: unknown): CommandResult {
  const c = sim.commitments.find((x) => x.id === commitmentId);
  if (!c || (c.state !== 'countered' && c.state !== 'refused')) return err('Nothing to counter');
  c.state = 'expired';
  return requestCampaignSupport(sim, c.campaignId, c.contributor, termsRaw);
}

/** Calls off a war plan: unearned fees come back, every pledged company goes home. */
export function cancelWarPlan(sim: Simulation, planId: unknown): CommandResult {
  const plan = sim.warPlans.find((p) => p.id === planId);
  if (!plan || plan.state !== 'drafting') return err('That plan is not open');
  plan.state = 'cancelled';
  const me = playerKingdom(sim);
  for (const c of sim.commitments) {
    if (c.campaignId !== plan.id || ['refused', 'expired', 'cancelled', 'fulfilled'].includes(c.state)) continue;
    // Nothing has arrived yet, so the whole fee is unearned.
    me.treasury += c.escrow;
    c.escrow = 0;
    const ally = kingdomById(sim, c.contributor);
    for (const q of ally?.companies ?? []) if (q.pledgedTo === c.id) q.pledgedTo = null;
    c.state = 'cancelled';
  }
  return ok('The plan is shelved. Fees held in escrow are back in the treasury and allied companies stand down.');
}

export interface CampaignAssessment {
  target: string;
  enemy: { known: boolean; range: [number, number] | null; reportAge: string; certainty: string | null };
  own: { companies: number; ready: boolean };
  allies: { proposed: number; pledged: number; mustered: number; enRoute: number; arrived: number };
  supplyDays: number;
  blockers: string[];
}

/** What the council can say about a plan — only from reports the player has received. */
export function assessCampaign(sim: Simulation, planId: number): CampaignAssessment {
  const plan = sim.warPlans.find((p) => p.id === planId)!;
  const target = kingdomById(sim, plan.target)!;
  const report = latestAbout(sim, PLAYER_KINGDOM, target.id, 'military-buildup') ?? latestAbout(sim, PLAYER_KINGDOM, target.id, 'border-forces');
  // Estimates come only from what was reported, however stale.
  const strength = report ? report.magnitude : null;
  const spread = report ? (report.certainty === 'confirmed' ? 0 : report.certainty === 'observed' ? 0.25 : 0.5) : 0;
  const range: [number, number] | null = report && strength !== null ? [Math.max(0, Math.floor(strength * (1 - spread))), Math.ceil(strength * (1 + spread))] : null;
  const count = (states: string[]) =>
    sim.commitments.filter((c) => c.campaignId === plan.id && states.includes(c.state)).reduce((n, c) => n + (c.terms.companies.length || c.requested.companies), 0);
  const own = playerKingdom(sim).companies.length;
  const blockers: string[] = [];
  if (own === 0) blockers.push('No army yet: build barracks and train soldiers');
  if (!report) blockers.push(`No report on ${target.name}'s strength — send your envoy or wait for news`);
  const food = sim.storedTotal('food');
  const eaters = Math.max(1, own * 4);
  return {
    target: target.name,
    enemy: { known: !!report, range, reportAge: report ? `${Math.round((sim.tick - report.eventTick) / DAY_TICKS)} days old` : 'no reports', certainty: report?.certainty ?? null },
    own: { companies: own, ready: own > 0 },
    allies: { proposed: count(['proposed', 'countered']), pledged: count(['accepted']), mustered: count(['assembling']), enRoute: count(['enRoute']), arrived: count(['arrived', 'active']) },
    supplyDays: Math.floor(food / eaters),
    blockers,
  };
}

/** Allies' letters arrive; offers lapse. */
export function updateCampaigns(sim: Simulation): void {
  for (const c of sim.commitments) {
    if (c.state === 'proposed' && sim.tick >= c.decideTick) {
      const a = allyAnswer(sim, c);
      c.reasons = a.reasons;
      c.terms = a.terms;
      if (a.verdict === 'accept') {
        const problem = commit(sim, c);
        if (problem) {
          c.state = 'refused';
          c.reasons.push(problem);
        }
      } else c.state = a.verdict === 'counter' ? 'countered' : 'refused';
      const name = kingdomById(sim, c.contributor)?.name;
      sim.toast(`${name} answered your request for support: ${c.state}. See the war council.`, (c.state as string) === 'accepted' ? 'good' : 'info');
      sim.emit({ type: 'important' });
    } else if (c.state === 'countered' && sim.tick >= c.expiresTick) c.state = 'expired';
  }
}

export function mobilizeCampaign(sim: Simulation, planId: unknown): CommandResult {
  void sim;
  void planId;
  return err('Mustering needs an army: build barracks and train soldiers first');
}
