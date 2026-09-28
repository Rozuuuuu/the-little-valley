/**
 * Treaty kinds and diplomacy numbers. The AI weighs offers against these
 * thresholds and always explains its answer.
 */
export type TreatyKind = 'trade' | 'passage' | 'nonAggression' | 'defensiveAlliance' | 'truce' | 'peace';

export interface TreatyDef {
  kind: TreatyKind;
  name: string;
  /** What each side gets and owes, shown before signing. */
  benefits: string;
  obligations: string;
  breach: string;
  /** How much the other side must trust you (0–100, after adjustments) to agree. */
  threshold: number;
}

export const TREATIES: Record<TreatyKind, TreatyDef> = {
  trade: {
    kind: 'trade', name: 'Trade agreement', threshold: 45,
    benefits: 'Letters travel both ways: each side hears the other’s news, and trust grows by 1 a day.',
    obligations: 'None beyond keeping the agreement.',
    breach: 'Ending it early is a broken promise others hear about.',
  },
  passage: {
    kind: 'passage', name: 'Right of passage', threshold: 60,
    benefits: 'Your armed parties may cross their frontier land (never their protected core).',
    obligations: 'Your soldiers must not stop or fight there.',
    breach: 'A broken promise, and armed entry becomes an incident again.',
  },
  nonAggression: {
    kind: 'nonAggression', name: 'Non-aggression pact', threshold: 50,
    benefits: 'Both sides worry less about each other’s troops.',
    obligations: 'No war between you while it lasts.',
    breach: 'Declaring war or ending it early is a serious broken promise.',
  },
  defensiveAlliance: {
    kind: 'defensiveAlliance', name: 'Defensive alliance', threshold: 70,
    benefits: 'Allies share what they learn, and may answer calls for aid.',
    obligations: 'Answer your ally’s call for aid if they are attacked (you decide how). It does not bind them to your offensive wars.',
    breach: 'Refusing a call for aid costs trust; ending it early is a broken promise.',
  },
  truce: {
    kind: 'truce', name: 'Truce', threshold: 40,
    benefits: 'Fighting stops while terms are discussed.',
    obligations: 'No attacks during the truce.',
    breach: 'Attacking during a truce is a grave broken promise.',
  },
  peace: {
    kind: 'peace', name: 'Peace treaty', threshold: 40,
    benefits: 'Ends a war; any land transfers written into it take effect.',
    obligations: 'No attacks; honour its transfers.',
    breach: 'A grave broken promise.',
  },
};
export const TREATY_KINDS = Object.keys(TREATIES) as TreatyKind[];
export function isTreatyKind(v: unknown): v is TreatyKind {
  return typeof v === 'string' && v in TREATIES;
}

/** Delivered reports a kingdom keeps before summarising the oldest. */
export const INBOX_LIMIT = 60;
/** Events (the internal truth) kept for reporting. */
export const EVENT_LIMIT = 400;
/** Starting trust between kingdoms that have just met. */
export const DEFAULT_TRUST = 50;
/** How far back concern looks (ticks of game time). */
export const CONCERN_MEMORY_DAYS = 8;
/** Concern bands enter at these scores; leaving needs a fall this far below the entry. */
export const BANDS = { watchful: 25, concerned: 50, alarmed: 75 } as const;
export const BAND_HYSTERESIS = 10;
/** A reassurance is broken by troops or claims seen within this many days. */
export const REASSURANCE_DAYS = 4;
/** Rival kingdoms keep at least this many companies at home. */
export const DEFENCE_RESERVE = 1;
export const MAX_RIVAL_COMPANIES = 8;
