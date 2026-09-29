import { BUILDINGS, isBuildingId } from '../data/buildings';
import { isHabitatId } from '../data/habitats';
import { isSpeciesId } from '../data/animals';
import { isCropId } from '../data/crops';
import { isJobId } from '../data/jobs';
import { WORK_KINDS } from '../sim/priorities';
import { SUPPORTED_GENS } from '../world/worldgen';
import { isMilestoneId } from '../data/progression';
import { isResourceId } from '../data/resources';
import { emptyStats } from '../sim/Simulation';
import { newPlayerKingdom } from '../sim/kingdoms';
import { rivalCompanies } from '../sim/diplomacy';
import { SAVE_VERSION, SaveError, type SaveFile } from './format';

type AnyRecord = Record<string, unknown>;

/**
 * Migrations upgrade a save one version at a time. `MIGRATIONS[n]` turns a
 * version-n save into version n+1. Never edit an existing migration once it has
 * shipped; add a new one instead.
 */
export const MIGRATIONS: Record<number, (save: AnyRecord) => AnyRecord> = {
  /**
   * v1 was the prototype format: everything at the top level, the generic job
   * was called "worker", and there was no crafting or weather.
   */
  1: (v1) => {
    const settlers = (v1.settlers as AnyRecord[] | undefined) ?? [];
    return {
      version: 2,
      meta: {
        name: v1.name ?? 'Old valley',
        seed: v1.seed,
        createdAt: v1.createdAt ?? v1.savedAt ?? 0,
        savedAt: v1.savedAt ?? 0,
        day: v1.day ?? 1,
        population: settlers.length,
        milestone: 'camp',
      },
      sim: {
        tick: v1.tick ?? 0,
        nextId: v1.nextId,
        rngState: v1.rngState ?? v1.seed,
        lastArrival: 0,
        settlers: settlers.map((s) => ({
          ...s,
          job: s.job === 'worker' ? 'laborer' : s.job,
          energy: s.energy ?? 100,
          focus: null,
        })),
        buildings: ((v1.buildings as AnyRecord[] | undefined) ?? []).map((b) => ({ placedTick: 0, delivered: {}, inventory: {}, ...b })),
        designations: v1.designations ?? [],
        regrowth: v1.regrowth ?? [],
        stats: { ...emptyStats(), ...(v1.stats as AnyRecord | undefined) },
        reached: v1.reached ?? ['camp'],
        weather: { raining: false, nextChange: ((v1.tick as number) ?? 0) + 2000 },
      },
      world: { chunks: v1.chunks ?? [] },
    };
  },

  /**
   * v2 was Milestone 1. v3 adds the world generator version (every v2 world
   * was made by generator 1), work areas, personal work orders, production
   * workers, span building sizes, the chronicle and session marks.
   */
  2: (v2) => {
    const sim = v2.sim as AnyRecord;
    const world = v2.world as AnyRecord;
    return {
      ...v2,
      version: 3,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, areaId: null, priorities: null })),
        buildings: ((sim.buildings as AnyRecord[] | undefined) ?? []).map((b) => ({ ...b, workers: [] })),
        stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) },
        workAreas: [],
        chronicle: [],
        session: null,
      },
      world: { ...world, genVersion: 1 },
    };
  },

  /**
   * v3 was Milestone 2. v4 adds settlements: the camp becomes the first
   * settlement (named after the valley), every settler belongs to it, and
   * stores start without stock targets. Seasons need no saved state: they
   * follow the calendar day.
   */
  3: (v3) => {
    const sim = v3.sim as AnyRecord;
    const buildings = (sim.buildings as AnyRecord[] | undefined) ?? [];
    const camp = buildings.find((b) => b.type === 'camp');
    const campId = camp ? (camp.id as number) : null;
    const meta = v3.meta as AnyRecord | undefined;
    return {
      ...v3,
      version: 4,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, settlementId: campId })),
        buildings: buildings.map((b) => ({ ...b, wants: {} })),
        settlements: campId !== null ? [{ id: campId, name: typeof meta?.name === 'string' && meta.name ? meta.name : 'Home' }] : [],
        stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) },
      },
    };
  },

  /**
   * v4 was Seasons and settlements. v5 adds deliberate growth: every existing
   * settler is an adult with no household (no families are invented), and the
   * world keeps its old newcomer arrivals ('legacy') until the player adopts
   * the new rules. No bed claims, visitors or recruitments exist yet.
   */
  4: (v4) => {
    const sim = v4.sim as AnyRecord;
    return {
      ...v4,
      version: 5,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, lifeStage: 'adult', ageTicks: 0, householdId: null })),
        stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) },
        growthMode: 'legacy',
        households: [],
        bedClaims: [],
        offer: null,
        nextVisitor: 0,
        recruits: [],
        lastRecruit: null,
      },
    };
  },

  /**
   * v5 was Families and orchards. v6 adds geology: nothing has been surveyed
   * yet, so the cell list starts empty. Old worlds keep their generator; ore
   * deposits appear on their rocky ground when surveyed, and their land is
   * never regenerated.
   */
  5: (v5) => {
    const sim = v5.sim as AnyRecord;
    return {
      ...v5,
      version: 6,
      sim: { ...sim, stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) }, geology: { version: 1, cells: [] } },
    };
  },

  /**
   * v6 was Mountains and mining. v7 adds supply routes, caravans on the road,
   * travelling merchants and known distant towns: none exist yet in an older
   * save, and nobody is away.
   */
  6: (v6) => {
    const sim = v6.sim as AnyRecord;
    return {
      ...v6,
      version: 7,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, awayOn: null })),
        stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) },
        routes: [], manifests: [], parties: [], knownRegions: [], nextMerchant: 0,
      },
    };
  },

  /**
   * v7 was Travellers. v8 adds the crown: the player's kingdom (uncrowned,
   * named after the first settlement, no treasury), every settler loyal to it,
   * no frontier claims, and purses for merchants already on the road. Towns
   * already heard of become rival kingdoms the next time they are needed.
   */
  7: (v7) => {
    const sim = v7.sim as AnyRecord;
    const settlements = (sim.settlements as AnyRecord[] | undefined) ?? [];
    const name = typeof settlements[0]?.name === 'string' ? (settlements[0].name as string) : 'The Valley';
    return {
      ...v7,
      version: 8,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, kingdomId: 0 })),
        parties: ((sim.parties as AnyRecord[] | undefined) ?? []).map((p) => ({ ...p, coins: 50 })),
        kingdoms: [newPlayerKingdom(name)],
        claims: [],
      },
    };
  },

  /**
   * v8 was the crown. v9 adds diplomacy and news: kingdoms gain a temperament
   * and (for rivals) their companies at home; nothing has been reported,
   * proposed or planned yet, and no kingdom is at war or allied.
   */
  8: (v8) => {
    const sim = v8.sim as AnyRecord;
    const kingdoms = ((sim.kingdoms as AnyRecord[] | undefined) ?? []).map((k) => ({
      ...k,
      personality: k.player ? 'cautious' : (['cautious', 'mercantile', 'proud'] as const)[(k.id as number) % 3],
      companies: k.player ? [] : rivalCompanies(k.id as number),
    }));
    return {
      ...v8,
      version: 9,
      sim: {
        ...sim,
        kingdoms,
        diplomacy: {
          worldEvents: [], reports: [], newsSummaries: [], stances: [], trust: [], wars: [], offers: [], incidents: [], warnings: [],
          concernStates: [], warPlans: [], commitments: [], diplomacyDay: 0, lastProsperity: 0,
        },
      },
    };
  },

  /**
   * v9 was diplomacy. v10 adds the army: nobody has enlisted yet, the player has
   * no companies, and horses have never been fed.
   */
  9: (v9) => {
    const sim = v9.sim as AnyRecord;
    return {
      ...v9,
      version: 10,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, military: null })),
        stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) },
        horseDay: 0,
      },
    };
  },

  /**
   * v10 was the army. v11 adds war: no wars are in progress in an older save
   * (a v10 save can't have declared one), nobody is captive, nothing is besieged.
   */
  10: (v10) => {
    const sim = v10.sim as AnyRecord;
    return {
      ...v10,
      version: 11,
      sim: {
        ...sim,
        settlers: ((sim.settlers as AnyRecord[] | undefined) ?? []).map((s) => ({ ...s, captive: null })),
        stats: { ...emptyStats(), ...(sim.stats as AnyRecord | undefined) },
        war: { states: [], sieges: [], occupationTimers: [] },
      },
    };
  },

  /**
   * v11 was war. v12 adds building levels, town halls, habitats, the ruler and
   * animals; every building of an older world is at level 1 and nothing is upgrading.
   */
  11: (v11) => ({ ...v11, version: 12 }),

  /** v12 → v13: health for settlers and animals; everyone starts at full health. */
  12: (v12) => ({ ...v12, version: 13 }),
  /** v13 → v14: roles trained at the Town Hall and the Assistant Chief; nobody is training yet. */
  13: (v13) => ({ ...v13, version: 14 }),
  /** v14 → v15: side jobs and Hold; nobody has either yet. */
  14: (v14) => ({ ...v14, version: 15 }),
};

export function migrate(raw: unknown): SaveFile {
  if (!raw || typeof raw !== 'object') throw new SaveError('Save data is empty or not an object');
  let save = raw as AnyRecord;
  let version = typeof save.version === 'number' ? save.version : NaN;
  if (!Number.isInteger(version) || version < 1) throw new SaveError('Save has no valid version');
  if (version > SAVE_VERSION) throw new SaveError(`This save is from a newer version of the game (v${version})`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new SaveError(`No migration from save version ${version}`);
    save = step(save);
    version = save.version as number;
  }
  validateSave(save);
  return save as unknown as SaveFile;
}

function check(cond: unknown, what: string): asserts cond {
  if (!cond) throw new SaveError(`Save is damaged: ${what}`);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);

function checkInventory(v: unknown, what: string): void {
  check(v && typeof v === 'object', `${what} inventory`);
  for (const [k, n] of Object.entries(v as AnyRecord)) {
    check(isResourceId(k), `${what} has unknown resource "${k}"`);
    check(isNum(n) && n >= 0, `${what} has a bad amount of ${k}`);
  }
}

/** Structural validation of a current-version save. Throws SaveError on problems. */
export function validateSave(save: AnyRecord): void {
  check(save.version === SAVE_VERSION, 'version');
  const meta = save.meta as AnyRecord;
  check(meta && typeof meta.name === 'string' && isInt(meta.seed), 'meta');
  const sim = save.sim as AnyRecord;
  check(sim && isInt(sim.tick) && sim.tick >= 0 && isInt(sim.nextId), 'simulation header');
  check(isInt(sim.rngState), 'random state');
  check(Array.isArray(sim.settlers), 'settler list');
  const ids = new Set<number>();
  for (const s of sim.settlers as AnyRecord[]) {
    check(isInt(s.id) && !ids.has(s.id), 'settler id');
    ids.add(s.id as number);
    check(typeof s.name === 'string' && isNum(s.x) && isNum(s.y), `settler ${s.id} position`);
    check(isJobId(s.job), `settler ${s.id} job`);
    check(isNum(s.hunger) && isNum(s.energy), `settler ${s.id} needs`);
    check(s.appearance && typeof s.appearance === 'object', `settler ${s.id} appearance`);
    if (s.carrying) {
      const c = s.carrying as AnyRecord;
      check(isResourceId(c.res) && isNum(c.amount), `settler ${s.id} carrying`);
    }
    check(s.areaId === null || isInt(s.areaId), `settler ${s.id} work area`);
    check(s.priorities === null || (Array.isArray(s.priorities) && (s.priorities as unknown[]).every((k) => WORK_KINDS.includes(k as never))), `settler ${s.id} work order`);
    check(s.settlementId === null || isInt(s.settlementId), `settler ${s.id} settlement`);
    check((s.lifeStage === 'adult' || s.lifeStage === 'child') && isInt(s.ageTicks) && (s.ageTicks as number) >= 0, `settler ${s.id} age`);
    check(s.householdId === null || isInt(s.householdId), `settler ${s.id} household`);
    check(s.awayOn === null || isInt(s.awayOn), `settler ${s.id} caravan`);
    check(isInt(s.kingdomId), `settler ${s.id} allegiance`);
    if (s.military !== null) {
      const m = s.military as AnyRecord;
      check(m && ['infantry', 'archer', 'knight'].includes(m.unit as string) && ['training', 'ready', 'deployed'].includes(m.state as string) && isNum(m.trained) && isInt(m.companyId), `settler ${s.id} service`);
      checkInventory(m.gear, `settler ${s.id} gear`);
    }
  }
  check(Array.isArray(sim.buildings), 'building list');
  for (const b of sim.buildings as AnyRecord[]) {
    check(isInt(b.id) && !ids.has(b.id), 'building id');
    ids.add(b.id as number);
    check(isBuildingId(b.type), `building ${b.id} type`);
    check(isInt(b.x) && isInt(b.y) && typeof b.built === 'boolean' && isNum(b.progress), `building ${b.id} fields`);
    checkInventory(b.delivered, `building ${b.id} delivered`);
    checkInventory(b.inventory, `building ${b.id}`);
    check(Array.isArray(b.workers) && (b.workers as unknown[]).every(isInt), `building ${b.id} workers`);
    checkInventory(b.wants, `building ${b.id} stock targets`);
    if (b.mine !== undefined) check(isInt((b.mine as AnyRecord).depositId) && [1, 2, 3].includes((b.mine as AnyRecord).level as number), `building ${b.id} mine`);
    if (b.level !== undefined) check(isInt(b.level) && (b.level as number) >= 1 && (b.level as number) <= (BUILDINGS[b.type as keyof typeof BUILDINGS].levels?.length ?? 1), `building ${b.id} level`);
    if (b.upgrade !== undefined) {
      const u = b.upgrade as AnyRecord;
      check(u && isInt(u.to) && isInt(u.progress) && (u.progress as number) >= 0 && (u.to as number) <= (BUILDINGS[b.type as keyof typeof BUILDINGS].levels?.length ?? 1), `building ${b.id} upgrade`);
      checkInventory(u.paid, `building ${b.id} upgrade payment`);
    }
    if (b.quarry !== undefined) check(isInt((b.quarry as AnyRecord).extracted) && ((b.quarry as AnyRecord).extracted as number) >= 0, `building ${b.id} quarry`);
    if (BUILDINGS[b.type as keyof typeof BUILDINGS].span) check(isInt(b.w) && isInt(b.h) && (b.w as number) >= 1 && (b.h as number) >= 1, `building ${b.id} size`);
    if (b.field) {
      const f = b.field as AnyRecord;
      check(f.crop === null || isCropId(f.crop), `field ${b.id} crop`);
      check(['wild', 'tilled', 'growing', 'ripe'].includes(f.state as string), `field ${b.id} state`);
    }
  }
  for (const id of ids) check(id < (sim.nextId as number), 'id counter');
  check(Array.isArray(sim.designations) && Array.isArray(sim.regrowth), 'designations');
  check(sim.stats && typeof sim.stats === 'object', 'stats');
  check(Array.isArray(sim.reached) && (sim.reached as unknown[]).every(isMilestoneId), 'progression');
  check(Array.isArray(sim.workAreas), 'work areas');
  for (const a of sim.workAreas as AnyRecord[]) {
    check(isInt(a.id) && typeof a.name === 'string' && ['farm', 'wood', 'stone', 'build', 'hunt', 'forage'].includes(a.kind as string), 'work area');
    check(a.wanted === undefined || (isInt(a.wanted) && (a.wanted as number) >= 0), 'work area staffing');
    check(a.crop === undefined || a.crop === null || isCropId(a.crop), 'work area crop');
    check([a.x0, a.y0, a.x1, a.y1].every(isInt), 'work area bounds');
  }
  check(Array.isArray(sim.chronicle), 'chronicle');
  check(Array.isArray(sim.settlements) && (sim.settlements as AnyRecord[]).every((s) => isInt(s.id) && typeof s.name === 'string'), 'settlements');
  check(sim.growthMode === 'legacy' || sim.growthMode === 'deliberate', 'growth mode');
  check(Array.isArray(sim.households), 'households');
  for (const h of sim.households as AnyRecord[]) {
    check(isInt(h.id) && Array.isArray(h.adults) && (h.adults as unknown[]).length === 2 && (h.adults as unknown[]).every(isInt), 'household');
    check(Array.isArray(h.children) && (h.children as unknown[]).every(isInt) && isNum(h.cooldownUntil), `household ${h.id}`);
    if (h.pending !== null) {
      const p = h.pending as AnyRecord;
      check(p && isInt(p.stableTicks) && (p.stableTicks as number) >= 0 && (p.claimId === null || isInt(p.claimId)) && typeof p.blocked === 'string', `household ${h.id} pending child`);
    }
  }
  check(Array.isArray(sim.bedClaims), 'bed claims');
  for (const c of sim.bedClaims as AnyRecord[]) {
    const o = c.owner as AnyRecord | undefined;
    check(isInt(c.id) && isInt(c.homeId) && o && (o.kind === 'birth' || o.kind === 'recruit') && isInt(o.id), 'bed claim');
  }
  check(sim.offer === null || (typeof sim.offer === 'object' && isInt((sim.offer as AnyRecord).id) && isNum((sim.offer as AnyRecord).expiresTick)), 'visitor');
  check(isNum(sim.nextVisitor), 'next visitor');
  check(sim.lastRecruit === null || isNum(sim.lastRecruit), 'last recruit');
  const geo = sim.geology as AnyRecord | undefined;
  check(geo && isInt(geo.version) && Array.isArray(geo.cells), 'geology');
  for (const c of geo.cells as unknown[]) {
    check(Array.isArray(c) && c.length === 2 && isInt(c[0]) && (c[1] === null || (isInt(c[1]) && (c[1] as number) >= 0)), 'geology cell');
  }
  check(Array.isArray(sim.routes) && (sim.routes as AnyRecord[]).every((r) => isInt(r.id) && isInt(r.sourceId) && isInt(r.destId) && isResourceId(r.res) && isInt(r.target)), 'routes');
  check(Array.isArray(sim.manifests), 'caravans');
  for (const m of sim.manifests as AnyRecord[]) {
    check(isInt(m.id) && isInt(m.crewId) && isInt(m.sourceId) && isInt(m.destId) && ['outbound', 'returning'].includes(m.state as string) && isNum(m.arriveTick) && isNum(m.legTicks), 'caravan');
    checkInventory(m.cargo, `caravan ${m.id} cargo`);
  }
  check(Array.isArray(sim.parties), 'merchants');
  for (const p of sim.parties as AnyRecord[]) {
    check(isInt(p.id) && ['travelling', 'arriving', 'lodging', 'leaving'].includes(p.state as string) && isNum(p.x) && isNum(p.y), 'merchant');
    checkInventory(p.stock, `merchant ${p.id} stock`);
  }
  check(Array.isArray(sim.knownRegions) && (sim.knownRegions as unknown[]).every(isInt) && isNum(sim.nextMerchant), 'regions');
  check(Array.isArray(sim.kingdoms) && (sim.kingdoms as AnyRecord[]).filter((k) => k.player === true).length === 1, 'kingdoms');
  for (const k of sim.kingdoms as AnyRecord[]) {
    check(isInt(k.id) && typeof k.name === 'string' && isNum(k.treasury) && (k.treasury as number) >= 0 && isNum(k.trust), `kingdom ${String(k.id)}`);
    check(['none', 'modest', 'high'].includes(k.policy as string) && ['protected-frontier', 'full-conquest'].includes(k.conflictMode as string), `kingdom ${String(k.id)} settings`);
    check(k.homeland === null || (Array.isArray(k.homeland) && (k.homeland as AnyRecord[]).every((q) => isInt(q.x) && isInt(q.y))), `kingdom ${String(k.id)} homeland`);
  }
  const dip = sim.diplomacy as AnyRecord | undefined;
  check(dip && typeof dip === 'object', 'diplomacy');
  for (const k of ['worldEvents', 'reports', 'newsSummaries', 'stances', 'trust', 'wars', 'offers', 'incidents', 'warnings', 'concernStates', 'warPlans', 'commitments']) check(Array.isArray(dip[k]), `diplomacy ${k}`);
  for (const o of dip.offers as AnyRecord[]) check(isInt(o.id) && isNum(o.escrow) && (o.escrow as number) >= 0 && typeof o.state === 'string', 'treaty offer');
  for (const c of dip.commitments as AnyRecord[]) check(isInt(c.id) && isNum(c.escrow) && (c.escrow as number) >= 0 && Array.isArray((c.terms as AnyRecord)?.companies), 'coalition commitment');
  for (const k of sim.kingdoms as AnyRecord[]) check(Array.isArray(k.companies), `kingdom ${String(k.id)} companies`);
  check(isNum(sim.horseDay), 'stables');
  const war = sim.war as AnyRecord | undefined;
  check(war && Array.isArray(war.states) && Array.isArray(war.sieges) && Array.isArray(war.occupationTimers), 'war');
  for (const s of sim.settlers as AnyRecord[]) check(s.captive === null || (typeof s.captive === 'object' && isInt((s.captive as AnyRecord).by)), `settler ${s.id} captivity`);
  check(Array.isArray(sim.claims) && (sim.claims as unknown[][]).every((c) => Array.isArray(c) && isInt(c[0]) && isInt(c[1]) && isInt(c[2])), 'claims');
  check(Array.isArray(sim.recruits), 'recruits');
  for (const r of sim.recruits as AnyRecord[]) {
    check(isInt(r.id) && isInt(r.settlementId) && (r.state === 'travelling' || r.state === 'refunding') && isNum(r.arrivesTick), 'recruit');
    check(r.claimId === null || isInt(r.claimId), `recruit ${r.id} bed`);
    checkInventory(r.escrow, `recruit ${r.id} escrow`);
  }
  check(sim.session === null || (typeof sim.session === 'object' && isInt((sim.session as AnyRecord).startTick)), 'session');
  // v12 additions: the ruler, Rally, animals and pens.
  for (const s of sim.settlers as AnyRecord[]) {
    check(s.ruler === undefined || typeof s.ruler === 'boolean', `settler ${s.id} ruler`);
    check(s.boostUntil === undefined || isNum(s.boostUntil), `settler ${s.id} rally`);
    check(s.hp === undefined || (isNum(s.hp) && (s.hp as number) > 0 && (s.hp as number) <= 100), `settler ${s.id} health`);
  }
  check((sim.settlers as AnyRecord[]).filter((s) => s.ruler === true).length <= 1, 'more than one ruler');
  check(sim.rallyReadyAt === undefined || isNum(sim.rallyReadyAt), 'rally');
  // v14 additions: role training and the Assistant Chief.
  for (const s of sim.settlers as AnyRecord[]) {
    const t = s.training as AnyRecord | undefined;
    check(t === undefined || (t && isJobId(t.role) && isInt(t.hall) && isNum(t.progress) && (t.progress as number) >= 0), `settler ${s.id} training`);
    check(s.sideJob === undefined || isJobId(s.sideJob), `settler ${s.id} side job`);
    check(s.hold === undefined || typeof s.hold === 'boolean', `settler ${s.id} hold`);
  }
  const chief = sim.chief as AnyRecord | undefined;
  check(chief === undefined || (chief && isNum(chief.nextAt) && typeof chief.adviceReady === 'boolean' && typeof chief.advice === 'string'), 'assistant chief');
  if (sim.animals !== undefined) {
    check(Array.isArray(sim.animals), 'animals');
    const buildingIds = new Set((sim.buildings as AnyRecord[]).map((b) => b.id));
    for (const a of sim.animals as AnyRecord[]) {
      check(isInt(a.id) && isSpeciesId(a.species) && isNum(a.x) && isNum(a.y) && isInt(a.homeX) && isInt(a.homeY), 'animal');
      check(a.penId === null || (isInt(a.penId) && buildingIds.has(a.penId)), `animal ${a.id} pen`);
      check(a.hp === undefined || (isNum(a.hp) && (a.hp as number) > 0), `animal ${a.id} health`);
    }
  }
  check(sim.animalRng === undefined || isInt(sim.animalRng), 'animal random state');
  for (const b of sim.buildings as AnyRecord[]) {
    if (b.pen !== undefined) check(isNum((b.pen as AnyRecord).breed) && isNum((b.pen as AnyRecord).ready) && ((b.pen as AnyRecord).ready as number) >= 0, `building ${b.id} pen`);
  }
  const world = save.world as AnyRecord;
  check(world && Array.isArray(world.chunks), 'world');
  check(SUPPORTED_GENS.includes(world.genVersion as number), `world generator version ${String(world.genVersion)} is not supported by this game version`);
  check(world.habitat === undefined || isHabitatId(world.habitat), `world habitat ${String(world.habitat)}`);
  for (const c of world.chunks as AnyRecord[]) {
    check(isInt(c.cx) && isInt(c.cy) && typeof c.explored === 'string', 'chunk header');
  }
}
