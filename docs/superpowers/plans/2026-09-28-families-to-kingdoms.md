# Little Valley: Families, Industry and Kingdoms — Implementation Plan

> **Status (2026-09-28):** M0 and M1 are implemented on branch `families-to-kingdoms` (see §10 for results, the decisions taken during implementation and the plan changes they caused). M2–M8 remain plans; each still needs its own authorization.
> For execution: use superpowers:executing-plans, or subagent-driven-development when suitable tools are available. Implement only the milestone the user authorizes.

**Goal:** Extend the existing persistent farming game into a slowly growing kingdom with families, mining, travelers, a player monarch, equipped armies, territorial diplomacy and believable news.

**Architecture:** Preserve the authoritative fixed-tick TypeScript simulation, validated commands, Canvas renderer and approximately 4 Hz React snapshots. Add focused domain modules and typed content tables. Use a regional graph for distant travel and kingdoms rather than generating or pathfinding the entire world.

**Tech stack:** Existing React, TypeScript, Canvas 2D, Vite, Vitest and IndexedDB. No new framework or online service is required.

**Spec:** Sections 1–4 contain the consolidated design reference. The remaining sections turn it into independently testable, releasable tasks.

## 1. Agreed direction

- Population grows deliberately: a household of two adults can have a child, or a traveler joins for a 50-apple settlement package. Children take time to become workers.
- Hills, mountains and water shape expansion. Quarries yield stone; mines yield finite deposits of coal, copper, iron, silver, gold and diamond according to rarity.
- More buildings support actual systems: orchards, inns, industry, regional transport, government and military preparation.
- The player becomes the monarch, with a name, appearance, banner, royal residence and policies. Strength comes from the economy, public trust, equipment, soldiers and alliances.
- Default rules combine a protected homeland with a contested frontier. An optional full-conquest setting makes the homeland conquerable.
- Late-game armies require adult recruits, barracks/training, equipment, an armory and supply. Knights require horses and substantial preparation.
- Borders distinguish exploration, ownership and occupation. Initial intrusions normally offer negotiation; deliberate aggression can lead to war.
- Relationships include neutral, trading partner, ally and enemy. Refusing an alliance does not automatically mean war.
- Before attacking a strong kingdom, the player can prepare a campaign and negotiate allied participation. Allies may request payment, supplies, a limited service period, reciprocal aid or eligible territorial rewards. An alliance does not automatically provide an unlimited offensive army.
- Kingdoms notice the development of any other kingdom, not just the player. Concern produces explained warnings and possible diplomatic actions.
- Allies, envoys, scouts and travelers spread information. Reports identify source, age and certainty; rumors do not become hidden omniscient truth.
- Cozy construction remains worthwhile alongside military play. Captured frontier towns retain their buildings and identity.

### Excluded from this sequence

Multiplayer, offline attacks/progression, dynastic succession, royal death, a controllable combat-hero king, fully editable underground maps, naval warfare, siege-engine rosters and unlimited detailed simulation of distant kingdoms. Mines initially have visible entrances and abstract shafts. The ruler is a persistent identity and decision-maker first.

## 2. Actual repository baseline

Inspected on 2026-09-28, before M0 (see §10 for the state after M1):

- Save version 4; existing migration, validation, backup and emergency recovery infrastructure.
- Population currently arrives automatically with 20 stored food, spending 10 food, on a 900-tick cooldown. At 10 Hz this is 90 seconds. New recruitment must replace that behavior in deliberate-growth worlds, not run alongside it.
- A day is 2,880 ticks / 4.8 minutes at 1x. Four days per season, sixteen per year. No progression while closed.
- Five starting settlers; housing, reservations, work areas, priorities, seasons, local settlement preferences, stock targets, bread production, bridges and waystations exist.
- Hamlet requires six people. Village requires ten people, eight permanent beds and two projects. Town requires sixteen people, sixteen permanent beds and two projects. Region and Civilization are future placeholders.
- Existing house capacities differ; use the building content definition rather than assuming every house has three beds.
- World generators 1 and 2 must retain their behavior for unexplored chunks as well as saved chunks.
- A configured population simulation limit exists. Do not silently remove it or promise unlimited performance.
- Seasonal/Towns continuation changes are uncommitted. Preserve and review them before implementation.
- Earlier work reported 95 passing tests and a passing build. These are historical results, not fresh verification for this plan.
- The development server was stopped for low memory. Do not restart it without the user's request. Browser validation remains an explicit release gate.

### Architectural constraints

1. Simulation owns state; every UI action sends a validated command.
2. React keeps the existing snapshot cadence; no per-frame React updates.
3. Fixed simulation ticks remain 10 Hz with interpolated rendering.
4. Art remains 16×16 source pixels, 32×32-tile chunks, original palette/outline/lighting conventions.
5. Preserve one active task per settler, exclusive task reservations and carrying capacity.
6. Every cost, bed claim, cargo transfer and treaty obligation has an owner and cancellation/recovery behavior.
7. Never edit shipped migrations or existing generator behavior.
8. Never overwrite actual player saves during testing.
9. No early progression dependency on rare ore, warfare, lucky visitors or late-unlocked buildings.
10. Explain blocked growth, production, travel and performance limits.
11. Apples are separate from generic food; turnip/pumpkin and bread loops remain useful.
12. No offline births, aging, attacks or diplomatic-deadline punishment.

## 3. Proposed defaults requiring design review

These are concrete initial balancing proposals, not previously approved numerical requirements.

| System | Initial default |
| --- | --- |
| Growth mode | New worlds use deliberate growth. Existing worlds retain legacy arrivals until an explained adoption command. |
| Orchard | Available at Camp; 2×2 footprint, 10 wood/2 stone; establishes over two growing-season days; yields 25 apples per growing-season day with worker care. Winter pauses establishment/production. |
| Apple consumption | Recruitment reservations protect apples. An explicit recipe converts surplus apples into ordinary food. |
| Recruitment | 50 apples in the destination settlement's own stores, one free reachable bed (real homes first; a camp bedroll is acceptable — see §10), at least 20 unreserved local food; one completed recruit per kingdom per two game days. |
| Early visitor | Guaranteed eligible camp recruitment visit; the sixth settler does not require an inn, currency or Hamlet. |
| Family home | Available at Camp; three permanent beds, 20 wood/10 stone. Existing houses are not silently resized. |
| Household | Two distinct adults, one household per adult; player requests a child; two stable days before birth with a reserved permanent bed. |
| Childhood | Twelve game days to adulthood, about 57.6 minutes at 1x. No adult jobs or military assignments. |
| Family cooldown | Four days after birth before another request; one pending child per household. |
| Shortages | Pause pending family growth and explain why. Never delete residents because housing or food becomes scarce. |
| Royal stage | Coronation at Region. Military campaigning at Civilization, still requiring explicit frontier/war activation. |
| Default warfare | Protected homeland plus contested frontier. Progression alone never activates attacks. |
| Full conquest | Select before the first frontier commitment; lock the choice after that commitment in the initial release. |
| Homeland | Fixed starting 3×3 chunk area. At legacy adoption, additionally protect chunks containing existing player buildings. Preview and persist the exact boundary. |
| Casualties | Default: soldiers wounded/captured, civilians evacuate or remain under occupation. Full conquest additionally permits permanent military casualties. |
| News | One warning per source/subject/band transition; repeated material-cause warnings have a one-day cooldown. |
| Active combat budget | Start profiling with 64 simultaneously deployed soldiers total across sides; extra companies remain regional reserves with visible status. |

Do not change day length to accelerate children: it would alter all crops, sleep and seasons. Label ages as game days. Children consume beds and food; economic milestone population requirements should explicitly count adults so children cannot bypass workforce progression. Preserve already-achieved milestones.

**Royal strength:** customization, royal hall, treasury, council assignments, prosperity, trust and alliances. A playable battle avatar, succession and death are separate future decisions.

**Government:** begin with three tax policies—none, modest, high—with explicit trade-derived income and trust effects. Do not create coins from nowhere or silently convert gold ore into currency. Council posts are assignments of existing adults with visible workforce opportunity cost.

## 4. Data boundaries and shared contracts

### Existing integration points

- Rules: `src/game/sim/{Simulation,types,commands,population,settlers,buildings,inventory,progression,settlements}.ts`.
- Content: `src/game/data/{resources,buildings,recipes,jobs,progression}.ts`.
- World: `src/game/world/{World,Chunk,worldgen,tiles}.ts`.
- Saves: `src/game/save/{format,migrations,serialize,SaveManager,storage}.ts`.
- UI publication: `src/engine/{snapshot,overview,GameController,tutorial}.ts`.
- Rendering/UI: `src/render/{Renderer,terrainPainter,terrainWorker}.ts`, sprite generators, `src/ui/{Hud,Village,Modals}.tsx`.

### Proposed modules, created only when their milestone starts

| New path | Responsibility |
| --- | --- |
| `src/game/data/kingdomBalance.ts` | Timings, thresholds, budgets |
| `src/game/sim/households.ts` | Household eligibility, births, aging, bed claims |
| `src/game/sim/orchards.ts` | Seasonal fruit-tree lifecycle and harvest |
| `src/game/sim/travelers.ts` | Visits, offers, recruitment transactions |
| `src/game/world/geology.ts` | Versioned sparse deposits independent of legacy terrain |
| `src/game/sim/mining.ts` | Survey/extraction/quarry work |
| `src/game/world/regions.ts` | Discovered regional graph and travel connections |
| `src/game/sim/logistics.ts` | Durable manifests and caravan transfers |
| `src/game/sim/kingdoms.ts` | Identity, rulers, policies and regional summaries |
| `src/game/sim/territory.ts` | Claims, safe bounds, permissions and occupation |
| `src/game/sim/diplomacy.ts` | Offers, treaties, obligations, incidents and peace |
| `src/game/sim/news.ts` | Observations, report delivery and per-recipient knowledge |
| `src/game/sim/concern.ts` | Known-evidence concern and diplomatic responses |
| `src/game/sim/campaigns.ts` | War plans, coalition offers, commitments, staging and agreed settlement terms |
| `src/game/sim/military.ts` | Training, loadouts, companies, demobilization |
| `src/game/sim/combat.ts` | Bounded engagement, morale, retreat and outcomes |
| `src/engine/kingdomSnapshot.ts` | Read-only, knowledge-filtered UI summaries |
| `src/ui/{Households,Travelers,Kingdom,Diplomacy,KingdomNews,Military,WarCouncil}.tsx` | Focused command-driven panels |
| `src/game/data/{minerals,kingdoms,treaties,units}.ts` | Typed domain content |

Keep `commands.ts` as the public dispatcher, delegating to focused domain handlers. Do not put these systems into one giant settler or HUD function.

### Durable state vocabulary

```ts
type KingdomId = number;
type HouseholdId = number;
type ConflictMode = 'protected-frontier' | 'full-conquest';
type LifeStage = 'child' | 'adult';
type Certainty = 'rumor' | 'observed' | 'confirmed';

interface BedClaim {
  id: number;
  homeId: number;
  owner: { kind: 'birth'; id: HouseholdId } | { kind: 'recruit'; id: number };
}
interface ClaimSector { x: number; y: number } // 16×16 tiles
interface TerritoryClaim {
  sector: ClaimSector;
  legalOwner: KingdomId;
  occupyingKingdom: KingdomId | null;
  protectedHomeland: boolean;
}
interface NewsReport {
  id: number;
  eventId: number;
  sourceKingdomId: KingdomId | null;
  subjectKingdomId: KingdomId;
  recipientKingdomId: KingdomId;
  certainty: Certainty;
  observedTick: number;
  arrivalTick: number;
  supersedes: number | null;
}
```

Bed claims for pending births/recruits are durable, unlike current transient worker tasks. Restore these claims before assigning ordinary homes and rebuilding work after load. Demolition invalidates or relocates a claim and pauses its owning transaction.

Cargo follows one physical ledger: source stock -> manifest in transit -> destination stock. Reserve source quantity and destination capacity; cancellation returns goods or creates a recoverable cache, never credits both ends.

Internal event records contain truth. Diplomatic AI and player-facing UI read only delivered reports. Rumors can cause limited concern or investigation but cannot prove aggression, treaty breach or reveal hidden geography.

## 5. Execution method and dependencies

Sequence: **M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8**.

Each task follows a test-first cycle: add the named failing cases, confirm failure, implement the domain behavior, rerun targeted tests, run the full suite/build, inspect changes and update documentation. Commit coherent verified tasks without including unrelated unfinished work.

Shared save/resource/command changes remain sequential. Independent art can be prepared after its content contracts are reviewed.

### M0 — Stabilize the seasonal village

**Files:** current renderer/snapshot/HUD changes, `tests/{seasons,village,save}.test.ts`, `scripts/profile-village.ts`; create `tests/regional-journey.test.ts` and a genuine v4 save fixture.

- [ ] Record branch/status and preserve unfinished work.
- [ ] Capture a fresh v4 fixture before schema changes; never use a player's actual slot.
- [ ] Run baseline tests/build and legacy generator fingerprints.
- [ ] Add a player-command two-town journey: cross bridge, assign home/work area, deliver stock targets, pass through winter, save/resume and check goods.
- [ ] Test whether unreachable-task caching incorrectly shares failures between settlers on different banks; fix only after reproducing.
- [ ] With an explicitly authorized preview, visibly check current controls, seasonal art, night states, input application and panel layout at 1366×768.
- [ ] Record baseline frame/tick/memory evidence and resolve serious defects.

**Gate:** Existing journeys work before introducing new growth rules.

### M1 — Households, apples and slower growth

#### 1A. Growth mode and durable bed claims

**Create:** `sim/households.ts`, `data/kingdomBalance.ts`, `tests/households.test.ts`.
**Modify:** population/buildings/types/Simulation/commands, save format/migrations/serialize.

**Commands:** `formHousehold`, `requestChild`, `cancelChildRequest`, `adoptDeliberateGrowth`.
**Domain interfaces:** `requestChild(sim, adultIds: [number, number]): CommandResult`; `updateHouseholds(sim): void`.

- [ ] Test two adults plus one pending child exhaust a three-bed home; a simultaneous recruit cannot claim that bed.
- [ ] Test duplicate/child/already-paired parents, unfinished or blocked homes, demolition, shortage, separation and the population limit.
- [ ] Add life stage, age ticks, household membership, pending birth, claim and cooldown persistence.
- [ ] Migrate existing settlers to adults without inventing families. Keep legacy growth until adoption.
- [ ] Implement child food/rest routines; reject adult work and enlistment commands with explanations.
- [ ] Test save one tick before birth, reload, and produce exactly one child; losing housing preserves residents and releases/reassigns claims safely.

#### 1B. Orchard and recruit journey

**Create:** `sim/{orchards,travelers}.ts`, `ui/{Households,Travelers}.tsx`, `tests/recruitment.test.ts`.
**Modify:** typed resources/buildings/recipes, tasks, sprites, progression, overview and tutorial.

**Command:** `acceptRecruit` with stable offer ID and destination settlement.
**Interfaces:** `acceptRecruit(sim, offerId: number, settlementId: number): CommandResult`; `updateTravelers(sim): void`; `updateOrchards(sim): void`.

- [ ] Test 49 apples refuses, 50 unreserved apples succeeds once, generic food is not substituted and repeated clicks/reload cannot duplicate a person or charge.
- [ ] Atomically reserve bed and apples; haul the welcome package to the camp/visitor meeting point before committing arrival.
- [ ] On expired/blocked/cancelled recruitment, release unspent claims and account for already delivered goods.
- [ ] Implement orchard establishment, care, harvest, winter dormancy and explicit surplus apple-food conversion.
- [ ] Guarantee early recruitment access before Hamlet. An inn improves later visitor schedules; it is not a sixth-person prerequisite.
- [ ] Show occupied/reserved/free beds, children/adults, home, family progress and blocked reasons.
- [ ] Update milestone wording and migration adoption preview; preserve achieved milestones.
- [ ] Run `npx vitest run tests/households.test.ts tests/recruitment.test.ts tests/journey.test.ts --maxWorkers=1`. (Done: `journey.test.ts` now covers the legacy journey; the deliberate journey lives in `recruitment.test.ts`.)

**Playable journey:** Five adults -> orchard and home -> recruit sixth adult -> Hamlet -> household -> child grows while settlement work continues.

### M2 — Mountains, quarries and metal industry

#### 2A. Terrain and versioned geology

**Create:** `world/geology.ts`, `data/minerals.ts`, `tests/geology.test.ts`.
**Modify:** worldgen/World/Chunk/tiles, pathfinding, terrain painter/worker, minimap and saves.

**Command/interface:** `surveyDeposit(sim, settlerId: number, x: number, y: number): CommandResult`.

- [ ] Add generator 3 for new worlds: hills, mountain faces, traversable slopes, rivers and accessible mine sites. Existing tile IDs and generators 1/2 stay unchanged.
- [ ] Add independently versioned sparse geology records: stable ID, mineral, surveyed state, initial and remaining units.
- [ ] Legacy worlds gain surveyable deposits on suitable existing rocky sites without terrain replacement; legacy mountain silhouettes are not retroactively imposed.
- [ ] Guarantee reachable stone and starter copper/iron in new-world starter regions. Legacy worlds need a suitable survey site or dependable merchant supply path, never lucky rare spawns.
- [ ] Initial optional deposit weights: coal 30, copper 25, iron 25, silver 12, gold 6, diamond 2. These are game balance weights, not geological claims.
- [ ] Test chunk-order determinism, negative coordinates, survey retries, old fingerprints, cliff/slope routing, blocked mine entrances and no accidental generation from map queries.

#### 2B. Extraction, fuel and tools

**Create:** `sim/mining.ts`, `tests/{mining,industry}.test.ts`.
**Modify:** resources/buildings/recipes/jobs, hauling, sprites and inspectors.

**Interfaces:** `reserveExtraction(sim, workerId: number, depositId: number): CommandResult`; `updateMining(sim): void`.

- [ ] Test two workers competing for the final ore unit; only one completes.
- [ ] Quarry work advances saved visible excavation stages. Mines require travel/work time and use abstract shaft upgrades.
- [ ] Add charcoal kiln, smelter and forge. Coal and charcoal are explicit fuel alternatives. Produce copper/iron tools through normal inventory/production.
- [ ] Silver, gold and diamonds support trade/prestige; none gates essential technology.
- [ ] Test depletion, full storage, blocked/cancelled work, reload in extraction, fuel reservations and ore/ingot/tool conservation.
- [ ] Run `npx vitest run tests/geology.test.ts tests/mining.test.ts tests/industry.test.ts --maxWorkers=1`.

**Playable journey:** Survey -> quarry -> mine -> transport ore/fuel -> smelt -> equip tools; excavation persists.

### M3 — Travelers and connected settlements

**Create:** `world/regions.ts`, `sim/logistics.ts`, `tests/{logistics,travelers}.test.ts`.
**Modify:** settlements/settlers/inventory/commands, stock targets, traveler UI, snapshots and saves.

**Interfaces:** `createRoute(sim, sourceId: number, destinationId: number, resource: ResourceId, target: number): CommandResult`; `cancelRoute(sim, routeId: number): CommandResult`; `updateLogistics(sim): void`.

- [ ] Add inn and caravan depot with actual lodging and transport. Merchant offers have finite stock and explicit barter.
- [ ] Require reachable land/bridge connections; freight cannot teleport over unbridged rivers.
- [ ] Persist manifests and destination capacity claims. Destination loss triggers return or a visible recoverable cache.
- [ ] Use graph-leg travel for distant parties and detailed paths nearby. Transition ownership exactly once to prevent double simulation.
- [ ] Discover regional nodes lazily; do not generate all intervening tile chunks.
- [ ] Test competing/opposing stock targets, source depletion, destination-full cases, bridge blockage, cancellation, in-transit reload and detail/abstract transitions.
- [ ] Run `npx vitest run tests/logistics.test.ts tests/travelers.test.ts tests/regional-journey.test.ts --maxWorkers=1`.

**Playable journey:** Supply two towns through winter, deliver ore and food, receive travelers and diagnose a stopped route.

### M4 — Crown, government and land

#### 4A. Kingdom identity and royal progression

**Create:** `sim/kingdoms.ts`, `data/kingdoms.ts`, `engine/kingdomSnapshot.ts`, `ui/Kingdom.tsx`, `tests/kingdoms.test.ts`.
**Modify:** progression/buildings/resources, commands and saves.

**Interfaces:** `coronate(sim, name: string): CommandResult`; `setKingdomPolicy(sim, policyId: string): CommandResult`, narrowing policy IDs to the typed table.

- [ ] Kingdom allegiance is separate from home/settlement membership; moving towns cannot change allegiance.
- [ ] Add ruler customization, banner, royal-hall construction/night art, treasury and explicit policy effects.
- [ ] Introduce coins via recorded trade; taxes apply to realized taxable trade, not imaginary income or ore conversion.
- [ ] Council posts assign existing adults and show the lost worker.
- [ ] Proposed Region requirements: two staffed settlements, one operating supply route, and two choices from 10 metal tools, three trade deliveries or a completed royal hall.
- [ ] Coronation is an explicit eligible-player command, not an automatic title change.
- [ ] Test policy accounting, duplicate coronation, invalid identity input and preserved historical milestones.

#### 4B. Claims and protected homeland

**Create:** `sim/territory.ts`, `tests/territory.test.ts`.
**Modify:** placement/movement permissions, minimap, settings, snapshots and migration.

**Interfaces:** `claimFrontier(sim, sector: ClaimSector): CommandResult`; `canEnterTerritory(sim, kingdomId: KingdomId, sector: ClaimSector, armed: boolean): { allowed: boolean; reason: string }`.

- [ ] Persist the previewed safe boundary; later construction never expands immunity.
- [ ] Store legal ownership separately from occupation and dispute. Exploration is not ownership.
- [ ] Outpost claims require supply and contiguous sectors, or an explicit supplied regional route for disconnected claims.
- [ ] Show claim cost, disputed owner, protection and supply status before confirmation.
- [ ] Land planning is available earlier, but hostile frontier incidents need Civilization plus explicit activation.
- [ ] Test legacy buildings outside spawn, border corners, contested sectors, full-conquest rules, unauthorized passage and mode-lock behavior.
- [ ] Run `npx vitest run tests/kingdoms.test.ts tests/territory.test.ts --maxWorkers=1`.

**Playable journey:** Crown the ruler, manage policies, understand safe versus disputed land and deliberately choose future frontier exposure.

### M5 — Diplomacy, concern and traveling news

#### 5A. Treaties and border incidents

**Create:** `sim/diplomacy.ts`, `data/treaties.ts`, `ui/Diplomacy.tsx`, `tests/diplomacy.test.ts`.
**Modify:** commands, territory, inventory, snapshots and saves.

**Commands:** `proposeTreaty`, `respondToOffer`, `respondToIncident`.
**Contract:** Offers carry typed terms, proposer/recipient, expiry, escrow and state; accepted agreements carry obligations and activation/expiry conditions. States: proposed, accepted, active, fulfilled, expired, rejected, breached.

- [ ] Implement trade, passage, non-aggression, defensive alliance, truce and peace.
- [ ] Show both parties' benefits/costs, expiry and breach consequences; AI provides reasons for acceptance/refusal.
- [ ] Civilian passage, armed passage and hostile attack are separate incident kinds. Initial border intrusions allow withdrawal/talks; declared war or hostile actions enable combat.
- [ ] Escrow payments atomically; reject duplicate/expired offers and stale land transfers without losing goods.
- [ ] Alliance rejection is not automatic hostility. Calls for aid show obligations and require a player response before dispatching their army.
- [ ] Test simultaneous offers, incompatible promises, passage conditions, breach, refusals, expired escrow and peace refunds.

#### 5B. Source-aware information

**Create:** `sim/news.ts`, `ui/KingdomNews.tsx`, `tests/news.test.ts`.
**Modify:** travelers/logistics, overview, snapshots and saves.

**Interfaces:** `recordObservation(sim, observer: KingdomId, subject: KingdomId, kind: string, location: ClaimSector | null): number`; `deliverReports(sim): void`. Narrow observation kinds to typed event IDs and validate actual observation access.

- [ ] Internal truth and delivered knowledge are separate. Scouts/envoys observe; allies share what they know; travelers carry delayed information.
- [ ] Keep event IDs and provenance so circular relaying cannot manufacture independent corroboration.
- [ ] Display source, observation/arrival time, certainty, known location and corrections. Unknown positions remain unknown and do not reveal fog.
- [ ] Route interruption delays delivery; no offline catch-up.
- [ ] Cover AI-to-AI news as well as player news. Bound inboxes/queues and summarize old events without deleting treaty obligations.
- [ ] Test reordered/late delivery, stale counts, duplicate reports, rumors, corrections, unavailable routes and reload before arrival.

#### 5C. Concern and proportionate political reactions

**Create:** `sim/concern.ts`, `tests/concern.test.ts`.
**Modify:** kingdom balance/preferences, diplomacy and news.

**Interfaces:** `evaluateConcern(sim, observer: KingdomId, subject: KingdomId): { score: number; band: 'calm' | 'watchful' | 'concerned' | 'alarmed'; reasons: string[] }`; `updateConcern(sim): void`.

- [ ] Evaluate known border forces, claims, conquest, broken promises and economic rivalry, tempered by distance, trust, trade and alignment.
- [ ] Proposed bands enter at 25/50/75 on a 0–100 scale; de-escalation requires falling ten points below entry. Stagger daily/major-event updates.
- [ ] Prosperity-only concern is capped at watchful and cannot authorize war. An ally's strength may improve security.
- [ ] Persist deduplication/cooldowns. A material warning includes reason and actions: reassure, investigate, negotiate, propose pact, prepare or dismiss.
- [ ] Contradicting a reassurance with later observable conduct reduces trust. AI uses the same knowledge/treaty constraints as the player.
- [ ] Test unseen forces do not affect known military concern; an ally reports a third kingdom; rumor cannot prove aggression; confirmed changes yield one meaningful warning.
- [ ] Run `npx vitest run tests/diplomacy.test.ts tests/news.test.ts tests/concern.test.ts --maxWorkers=1`.

**Playable journey:** Receive a rival's warning and an ally's third-party report, inspect sources, investigate or negotiate, and see concern change for understandable reasons. Useful before combat ships.

#### 5D. War council and negotiated allied support

**Create:** `sim/campaigns.ts`, `ui/WarCouncil.tsx`, `tests/coalition.test.ts`.
**Modify:** diplomacy/news/kingdom snapshots, commands, treasury/inventory and saves.
**Dependency:** In M5, implement planning and agreements with explicit military-readiness conditions. Actual mobilization depends on M6, and campaign launch depends on M7. Do not pretend a planning-only agreement has spawned troops.

**Commands:** `createWarPlan`, `requestCampaignSupport`, `counterCampaignOffer`, `acceptCampaignOffer`, `cancelWarPlan`, `mobilizeCampaign`, `launchCampaign`.
**Interfaces:** `assessCampaign(sim, campaignId: number): CampaignAssessment`; `updateCampaigns(sim): void`. The assessment contains known enemy strength range, report age/certainty, own readiness, allied pledged/mustered/arrived strength, supply duration and blocked conditions; no exact hidden enemy totals.

**Durable contracts:**

```ts
type SupportState =
  | 'proposed' | 'countered' | 'accepted' | 'assembling'
  | 'enRoute' | 'arrived' | 'active' | 'returning'
  | 'fulfilled' | 'refused' | 'expired' | 'breached' | 'cancelled';

interface CampaignSupportTerms {
  companies: number[]; // Allied-owned companies; never cloned into player population.
  coinFee: number;
  supplyPayer: 'requester' | 'contributor' | 'shared';
  requesterSupplyShare: number; // 0..1; 0.5 for the proposed shared default.
  serviceDays: number;
  commandRights: 'coordinated' | 'delegated';
  rewardSectors: ClaimSector[];
  reciprocalDefenseDays: number; // 0 means no future defense obligation.
}
interface CoalitionCommitment {
  id: number;
  campaignId: number;
  contributor: KingdomId;
  beneficiary: KingdomId;
  state: SupportState;
  terms: CampaignSupportTerms;
  expiresTick: number; // Offer/muster deadline; service timing is tracked separately.
  activatedTick: number | null;
}
```

- [ ] Add a War Council screen with target, limited objective, known intelligence, estimated opposition, allies, staging site, access routes, supplies, expected cost and launch blockers.
- [ ] A war plan is private drafting, not a declaration or a map reveal. Negotiation informs contacted allies; it reaches third parties only through an explicit recorded disclosure/report.
- [ ] Request contributions from selected allies: infantry/archer/knight companies, supplies or financial support. Let allies counteroffer or refuse without automatically becoming enemies.
- [ ] Base demands on trust, shared enemies, distance, known target strength, current commitments, likely losses and the ally's own defense needs. Show these reasons in plain language.
- [ ] Use a bounded negotiation loop: each side can revise named terms; repeating an identical request does not reroll the answer. New responses require changed terms or changed circumstances and respect a visible cooldown.
- [ ] Initial demand menu: fixed coin fee, campaign supply provision, fixed service duration, coordinated/delegated command, eligible postwar territory, or a reciprocal defensive pledge. Use explicit amounts/dates; no vague percentage of undefined loot.
- [ ] Offer screen states when each cost is due. Default fee is escrowed on acceptance and released only when the agreed contingent reaches staging; refusal/expiry returns unearned escrow. Paid arrival service is not refunded merely because the player later abandons the war; show that condition before acceptance.
- [ ] Reserve actual available allied companies on acceptance. An ally cannot pledge the same soldiers to two campaigns or pledge its entire protected defense reserve. Refusal explains unavailable troops.
- [ ] Validate territory promises against the objective, mode protections, current ownership and other agreements. Do not promise the same exclusive reward to two allies. A reward is conditional on lawful peace transfer, not guaranteed conquest.
- [ ] Record who feeds each contingent and how shared supply works. Initial shared terms split ongoing food by the signed contributor/requester ratio stored in the agreement; propose 50/50 by default and show exact quantities per supply period.
- [ ] Track pledged, assembling, en-route and arrived troops separately. The army assessment never counts an unaccepted request or contingent on the road as present.
- [ ] Default allied command is coordinated: player gives a campaign objective, the ally controls its own force. Delegated terms permit tactical orders within the signed theater/objective; they do not permit changing allegiance, spending equipment twice, attacking unrelated kingdoms or bypassing homeland protection.
- [ ] Agreed service begins at arrival at staging. Show remaining service time; extensions require negotiation. At expiry, forces stop accepting new attacks and seek a safe retreat rather than disappearing mid-battle.
- [ ] Withdrawing support follows explicit causes: expired service, broken supply/payment obligation after a one-day repair grace period, or a negotiated release. A new home-defense emergency produces a report and withdrawal request; do not secretly remove units.
- [ ] Final launch is a separate confirmation listing actual arrivals, missing contingents, existing pacts that would be breached, ally consent and supply readiness. The player may knowingly launch before all arrivals; missing troops stay missing.
- [ ] Offensive campaign participation requires a signed campaign agreement even if a defensive alliance exists. It binds the ally to this named target/objective, not all of the player's wars.
- [ ] Peace proposals account for signed coalition rewards. If proposed peace cannot meet them, show unmet promises and obtain a waiver/counteroffer; unilateral peace remains possible with explicit trust/debt consequences, never hidden penalties.
- [ ] Test ally refusal, counteroffer, unaffordable fee, escrow conservation, duplicate acceptance, exclusive troop pledge, contradictory land rewards, inaccessible staging, late arrival, service expiry, supply failure, cancelled war and save/reload at each commitment state.
- [ ] Test a strong target with two allies: one accepts supplies for archers; another requests payment and limited service. Only the accepted and arrived contingent counts toward the deployed force.
- [ ] Run `npx vitest run tests/coalition.test.ts tests/diplomacy.test.ts tests/news.test.ts --maxWorkers=1`.

**Playable planning journey:** Inspect a strong rival -> create a limited war objective -> ask allies -> compare demands -> counteroffer -> sign affordable terms -> inspect separate pledged and arrived strength. M6/M7 complete mustering, launch and postwar obligations.

### M6 — Barracks, armory and supplied armies

**Create:** `sim/military.ts`, `data/units.ts`, `ui/Military.tsx`, `tests/military.test.ts`; equipment/unit sprites.
**Modify:** buildings/resources/recipes, civilian-task cleanup, pathing and saves.

**Interfaces:** `enlist(sim, settlerIds: number[], unitType: string, barracksId: number): CommandResult`; `demobilize(sim, companyId: number): CommandResult`; `updateMilitary(sim): void`. Unit types narrow to infantry, archer and knight.

- [ ] Proposed Civilization unlock: crowned kingdom, functioning regional supply and two choices from 20 equipment items produced, one active trade treaty or one council hall. War and rare ore are not prerequisites.
- [ ] Add barracks/archery range training capacity, weapon/armor recipes, armory inventory and stables.
- [ ] Horses originate from finite merchant offers and occupy maintained stalls; horse breeding is excluded initially.
- [ ] Enlist actual adults only; release civilian reservations, preserve identity/household and record prior job for return. Pause new family requests for away parents.
- [ ] Training takes time and gear. Knights require a horse and armor. Upgrades consume actual equipment rather than globally adding instant strength.
- [ ] Company supplies use manifests; shortages visibly reduce readiness/morale before retreat, never silently erase soldiers.
- [ ] Mobilize accepted coalition commitments using the ally's real company IDs, routes and supply obligations. Keep ownership and equipment with the ally; do not add temporary allied soldiers to player housing/population. Preserve company exclusivity across regional and tactical simulation.
- [ ] Test child rejection, contested final weapon, full training capacity, cancellation, training reload, horse accounting, interrupted supply and valid demobilization.
- [ ] Run `npx vitest run tests/military.test.ts tests/logistics.test.ts --maxWorkers=1`.

**Playable journey:** Choose adults -> forge equipment -> train -> supply -> patrol -> demobilize. Soldier recruitment never creates free people.

### M7 — Frontier war, occupation and peace

**Create:** `sim/combat.ts`, `tests/{combat,war-journey}.test.ts`; battlefield overlays/sprites.
**Modify:** diplomacy, territory, military, needs/pathing and saves.

**Commands:** `declareWar` with typed objective, `orderCompany` with move/hold/defend/retreat orders.
**Interface:** `updateCombat(sim): void`.

- [ ] Implement bounded squads, ranges, line-of-sight, morale and retreat before complex siege machinery.
- [ ] Declaration preview explains objectives, allies/obligations, supplies and exposed land. Launch a prepared coalition campaign only through explicit confirmation; show arrived versus promised forces and paid support terms.
- [ ] Apply coordinated/delegated command rights during battle; allied AI may retreat under its agreed readiness rules. Casualties, captives and equipment losses belong to the correct contributor, and all sides share the visible active deployment budget.
- [ ] Check protection at targeting, path entry and damage application. Protected land cannot be used as a firing platform into contested land.
- [ ] Returning to protection disengages attacks and applies regroup cooldown. Frontier supplies remain contestable.
- [ ] Provide civilian evacuation and military retreat. Captured cargo has one owner and one location.
- [ ] Full-conquest casualties clean up homes, households, tasks, gear and company membership.
- [ ] Occupation differs from legal ownership; peace may transfer title. Preserve town buildings/residents/inventories and prevent double tax/loot income.
- [ ] Settle coalition rewards, conditional land transfers, outstanding supplies and company return on peace. A waived/unmet reward remains an explicit diplomatic outcome; it cannot silently disappear when the campaign is archived.
- [ ] Minimal siege: supplied force controlling defended approaches advances a visible surrender meter; relief, retreat or lost supplies interrupts it. Touching a hall never captures a town instantly.
- [ ] Persist battle participants, random state, timers, orders, readiness/health, occupation and peace transactions; rebuild transient paths on load.
- [ ] Test warning -> negotiation -> hostile act/war -> defense/retreat -> peace in both rulesets; test AI-to-AI conflict and reload at each transition.
- [ ] Run `npx vitest run tests/combat.test.ts tests/war-journey.test.ts tests/diplomacy.test.ts --maxWorkers=1`.

**Playable journey:** Negotiate an invasion warning or defend, carry out a supplied frontier raid, then settle peace or recover an occupied town while the default homeland remains protected.

### M8 — Integration, performance and human playtesting

**Create:** `tests/kingdom-journey.test.ts`, `scripts/profile-kingdom.ts`, `docs/KINGDOM_PLAYTEST.md`.
**Update:** README, ARCHITECTURE, ART_GUIDE, ASSET_MANIFEST, ADDING_CONTENT, SAVE_FORMAT, MILESTONES and PLAYTEST.

- [ ] Full command-driven journey: deliberate growth -> ore/tools -> supplied towns -> coronation -> diplomatic contact -> concern/news -> equipped troops -> negotiate allied support against a stronger kingdom -> stage/launch -> frontier outcome -> coalition peace settlement -> save/resume.
- [ ] Test helpers may accelerate time, but must not fabricate the resource/ownership transitions under test. Log failing seed and tick.
- [ ] Benchmark the same machine before/after: 100 civilians, two towns, four regional kingdoms and 64 active soldiers across sides. Separate ordinary work, season changes, news bursts, combat, saves and zoomed-out rendering.
- [ ] Measure median/p95/p99/max tick and frame time, snapshot cost, path expansions, heap, save size and duration. Node timings are not browser frame timings.
- [ ] Provisional targets: p95 frame <=33.3 ms, p95 tick <=10 ms, no unexplained sustained >20% baseline regression. Report misses; optimize or lower visible deployment budgets. These are not achieved claims.
- [ ] Bound distant AI and queues; political queries must not generate tile chunks. Expose population/army limits rather than silently refusing.
- [ ] Verify 1366×768/1920×1080, keyboard access, text contrast, non-color-only warnings, selection/placement visibility, close buttons, pause and audio.
- [ ] Observe 5–8 unfamiliar players without coaching: recruit, explain child work limits, diagnose mine/route, identify protected land, distinguish rumor, reassure a rival, negotiate allied troops, explain promised versus arrived strength and retreat/negotiate peace.
- [ ] Record failed clicks, confusion, accidental commitments, waiting, desired buildings and reasons to resume. Ask 1–5 ratings for clarity, controls, art, pacing, diplomacy and desire to continue.
- [ ] Report human/browser checks only if actually performed.

**Gate:** No “complete kingdom release” claim from tests/build alone. Record browser playthrough and measured performance.

## 6. Save rollout and compatibility

Start from v4; append one migration at each independently shipped schema change and capture a genuine fixture. Do not preassign all future version numbers or edit shipped migrations.

Persist, by owning milestone:

1. Growth mode, ages/life stages, households, pending births, bed claims, recruitment transactions, orchards and cooldowns.
2. Geology version, surveys, reserves, extraction stages and shaft upgrades.
3. Regions, routes, visitors, manifests and detailed/abstract transition state.
4. Ruler/kingdom membership, treasury/policies, conflict settings, frozen homeland and claims.
5. Offers/treaties/incidents, reports/knowledge, concern, warning deduplication, war plans, coalition commitments, escrow, reward promises and service deadlines.
6. Training, gear, horses, companies and supplies.
7. Engagements, casualties/captives, occupation and peace transactions.

Legacy defaults: adult settlers, no fabricated families, no hostile activation or fictional historical wars, one player kingdom owning existing towns. Preserve arrival mode until adoption. Never spawn rival capitals on inhabited land. Maintain original world generator behavior; geology is a separate layer.

Test v1/v2/v3/v4 fixtures through every new migration; round-trip new state; test current/backup/emergency recovery. Reject future versions and unrecoverable corruption clearly without overwriting or replacing the world. Test duplicate IDs, invalid references, negative goods, missing homes/kingdoms and partially paid transactions.

## 7. Test contracts and review priorities

Example proposed contract tests (fixtures must use actual simulation/commands):

```ts
// Recruitment fixture has 49 unreserved apples and a free reachable bed.
const before = sim.storedTotal('apples');
const result = applyCommand(sim, { type: 'acceptRecruit', offerId, settlementId });
expect(result.ok).toBe(false);
expect(sim.storedTotal('apples')).toBe(before);

// Residents plus durable growth reservations never exceed content capacity.
expect(residents.length + bedClaims.length).toBeLessThanOrEqual(homeCapacity);

// A queued report is not knowledge until delivery.
const beforeScore = evaluateConcern(sim, observer, subject).score;
// Queue a border observation addressed to observer, arriving next day.
expect(evaluateConcern(sim, observer, subject).score).toBe(beforeScore);
```

Do not compare transient refusal-message queues as though they were inventory mutation. Strengthen report tests by creating the actual pending observation before asserting unchanged concern, then advance to delivery and assert the expected changed reason.

Priority failure modes and owners:

| Risk | Required coverage |
| --- | --- |
| Two actions claim one final bed/item | M1/M6 retry, simultaneous-command and reload tests |
| Existing land becomes hostile or regenerates | M2 fingerprints; M4 legacy/protection tests |
| Regional transitions duplicate people/cargo | M3 unique IDs, goods conservation and save tests |
| Rumors leak hidden facts or repeat alerts | M5 per-recipient knowledge, correction, cooldown and reload tests |
| Capture/peace/retreat corrupt identities or accounting | M7 occupation, resident, equipment, payment and casualty tests; M5D coalition escrow/reward/return tests |

## 8. Verification and milestone delivery

Run from the repository root:

```powershell
npx vitest run --maxWorkers=1
npm run build
npx tsx scripts/check-gen-fingerprint.ts
npx tsx scripts/profile-village.ts
git diff --check
```

After its creation, also run `npx tsx scripts/profile-kingdom.ts`. Use one worker on this memory-constrained machine. Do not restart Vite unless requested.

At every milestone report: what is playable, a short demonstration journey, tests/build, migration changes, actual browser/performance evidence, limitations and the next milestone. Update obsolete documentation text rather than appending contradictory claims.

Commit only coherent reviewed task changes and fixtures generated for tests. Do not include unrelated work or player saves. Deployment, merging and releasing are not authorized by this plan.

## 9. Historical inspiration

These are selected inspirations, not a universal model of medieval politics:

- Negotiated royal obligations and limits: [The National Archives — Magna Carta](https://www.nationalarchives.gov.uk/explore-the-collection/explore-by-time-period/medieval/magna-carta/).
- Treaties and diplomatic correspondence: [The National Archives — Foreign affairs before 1509](https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/foreign-affairs-before-1509/).
- Merchant safe conduct and disputes: [The National Archives — Medieval agreements and arguments](https://www.nationalarchives.gov.uk/education/resources/medieval-agreements-and-arguments/).
- Knight equipment and supporting crafts: [The Metropolitan Museum of Art — Arms and Armor in Medieval Europe](https://www.metmuseum.org/ja/essays/arms-and-armor-in-medieval-europe).

Protected homelands, numeric concern scores, abstract shafts and simplified training are deliberate game design choices, not historical claims.

## 10. Progress, decisions and lessons (updated after M0 + M1)

### Results

| Milestone | State | Evidence |
| --- | --- | --- |
| M0 | Done except the browser check | v4 fixture; two-town journey test; unreachable-note bug reproduced and fixed; baseline profile recorded |
| M1A | Done | Save v5; `households.test.ts` 14 tests |
| M1B | Done except browser/art check | `recruitment.test.ts` 14 tests incl. deliberate journey; Families tab; sprites |
| M2–M8 | Not started | — |

Full suite 125/125, build passes, generator-1 fingerprint 18/18. Node profile p95
about +10–15% (inside the 20% bound). No browser check or human playtest has been
run; the M0 visual check and the M1 art remain release gates.

### Decisions taken during implementation (and why)

1. **Recruits may take a camp bedroll** (real homes first). Camp sleepers move into
   every new permanent bed automatically, so a permanent-bed-only rule meant a sixth
   adult needed three buildings — contradicting constraint 9 (no early progression
   dependency). Births still require a real home.
2. **"Locally delivered" = in the destination settlement's stores.** Apples move from
   those stores into a saved escrow on acceptance, atomically with the bed claim.
   Stock targets already haul goods between settlements, so no dedicated
   package-haul task was added. Revisit if playtests want to *see* the delivery.
3. **One v5 migration for all of M1.** M1 ships as one release; the plan's "one
   migration per independently shipped schema change" still holds.
4. **`requestChild` takes a household id**, not two adult ids; `formHousehold` is
   the explicit pairing step and households need deliberate mode.
5. **Hamlet requires 2 beds in real homes** instead of "a house", so the family home
   counts. Achieved milestones are untouched.
6. **Shared unreachable notes are position-scoped** (12 tiles, Manhattan): the M0
   reproduction showed a far-bank farmer blocked for a full day.
7. **Older tests pin `growthMode: 'legacy'`** — they cover rules legacy worlds keep.

### Lessons that change later milestones

- **Claims + escrow is the pattern.** Bed claims (saved, counted as occupied,
  relocated or released on demolition, validated on load) and apple escrow (goods leave
  stores into a saved holder; refunds that don't fit stay held) worked first time
  against reload/duplicate tests. Reuse them for M3 cargo manifests and destination
  capacity, M5 treaty escrow, and M5D/M6 troop pledges instead of inventing new
  reservation schemes. Add a shared helper once the second user appears.
- **Auto-rehousing competes with every reservation.** Anything that frees or adds a
  bed immediately re-seats camp sleepers. Future features that need a free bed (inns,
  barracks, guest houses) must claim it in the same step that checks it.
- **Status lines must list every unmet condition**, not the first one. Players and
  tests both needed "still needed: apples, food, a free bed" to act.
- **Test fixtures fight the simulation.** Building a home re-seats sleepers; storage
  fills if a gather order runs for days. Journey tests should build storage and homes
  in the order a player would.
- **Profiles must hold the workload constant.** A mode change silently changed the
  100-settler scenario (95 homeless). Keep the profile scenario explicit about homes,
  jobs and areas, and run it several times: single runs on this machine vary by 2×.
- **CRLF and LF files coexist** in the repo; exact-text tooling must respect each
  file's line endings.

### Plan adjustments for M2 onward

- **M2:** mines need their own placement rule (orchards took `farmland`); geology
  deposits should be surveyed by an adult task kind so children are excluded
  automatically by the empty child work order.
- **M3:** the inn should shorten `VISITOR_INTERVAL` / lengthen `OFFER_LIFETIME` via
  data, not code. Replace the position-scoped unreachable note with connectivity
  components once the regional graph exists — it is the same question.
- **M3/M5:** give manifests and escrow a conservation helper like `accountedFor` that
  includes held goods; the recruitment tests had to add escrow by hand.
- **M4:** Region's population checks should count adults (already true for
  `population` requirements); council posts must not accept children.
- **All:** each milestone's player journey test is the acceptance test; write it
  first with only commands, and let it drive the missing UI status lines.

## 11. Review and next authorization

Review the proposed population timings, legacy adoption, safe-boundary size, Civilization military gate and casualty rules before implementation. Start with **M0 and M1 only**; verify slower growth is enjoyable before building industry and political complexity.

Approve a specific milestone scope rather than treating this roadmap as authorization to implement everything at once. Recommended execution is native, sequential implementation with tests and review per task because shared saves, reservations and resource accounting make parallel integration risky.

No product implementation, development-server restart, human playtest or fresh benchmark occurred while writing this plan.
