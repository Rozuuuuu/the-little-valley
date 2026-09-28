/**
 * Government content: tax policies, council posts, banners and territory
 * numbers. Every effect listed here is applied explicitly by sim/kingdoms.ts
 * or sim/territory.ts; nothing is hidden.
 */

export type PolicyId = 'none' | 'modest' | 'high';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  /** Share of each realized trade's value the merchant pays the treasury. */
  tradeTax: number;
  /** Change in public trust at the start of each day. */
  trustPerDay: number;
  /** Merchants come this much less often (1 = no change). */
  merchantDelay: number;
  description: string;
}

export const POLICIES: Record<PolicyId, PolicyDef> = {
  none: { id: 'none', name: 'No taxes', tradeTax: 0, trustPerDay: 1, merchantDelay: 1, description: 'No levy on trade. Trust grows by 1 a day.' },
  modest: { id: 'modest', name: 'Modest tax', tradeTax: 0.1, trustPerDay: 0, merchantDelay: 1, description: 'Merchants pay 10% of each trade to the treasury. Trust holds steady.' },
  high: { id: 'high', name: 'High tax', tradeTax: 0.25, trustPerDay: -2, merchantDelay: 1.5, description: 'Merchants pay 25% of each trade and come less often. Trust falls by 2 a day.' },
};
export const POLICY_IDS = Object.keys(POLICIES) as PolicyId[];
export function isPolicyId(v: unknown): v is PolicyId {
  return typeof v === 'string' && v in POLICIES;
}

export type CouncilPost = 'steward' | 'envoy' | 'marshal';
export const COUNCIL_POSTS: Record<CouncilPost, { name: string; duty: string }> = {
  steward: { name: 'Steward', duty: 'Keeps the accounts: public trust grows by 1 more each day.' },
  envoy: { name: 'Envoy', duty: 'Carries letters to other kingdoms: needed to propose treaties and to investigate reports.' },
  marshal: { name: 'Marshal', duty: 'Organises the realm’s defence: needed to train soldiers.' },
};
export const COUNCIL_POST_IDS = Object.keys(COUNCIL_POSTS) as CouncilPost[];

export const BANNER_COLORS = ['#3a6ea5', '#a53a3a', '#3a8a4a', '#d9a93a', '#6a4a9a', '#2e2e3a', '#e8e0cc', '#c96a2e'] as const;
export const EMBLEMS = ['oak', 'wheat', 'tower', 'star', 'fish', 'hammer', 'crown', 'sun'] as const;
export type Emblem = (typeof EMBLEMS)[number];

/** Trust below this and travellers won't settle. */
export const TRUST_MIN_RECRUIT = 25;
export const START_TRUST = 60;
/** Coins to claim one frontier sector. */
export const CLAIM_COST = 20;
/** Sectors are square blocks of tiles (the same size as geology cells). */
export const SECTOR = 16;
/** A rival town's own land reaches this many sectors from its centre. */
export const RIVAL_LAND = 2;
/** The protected homeland covers these chunks around the camp (a 3×3 block). */
export const HOMELAND_CHUNKS = { from: -1, to: 1 };
/** A merchant's purse. */
export const MERCHANT_PURSE = { min: 40, max: 100 };
