import { isBuildingId } from '../data/buildings';
import { isCropId } from '../data/crops';
import { isJobId } from '../data/jobs';
import { isMilestoneId } from '../data/progression';
import { isResourceId } from '../data/resources';
import { emptyStats } from '../sim/Simulation';
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
  }
  check(Array.isArray(sim.buildings), 'building list');
  for (const b of sim.buildings as AnyRecord[]) {
    check(isInt(b.id) && !ids.has(b.id), 'building id');
    ids.add(b.id as number);
    check(isBuildingId(b.type), `building ${b.id} type`);
    check(isInt(b.x) && isInt(b.y) && typeof b.built === 'boolean' && isNum(b.progress), `building ${b.id} fields`);
    checkInventory(b.delivered, `building ${b.id} delivered`);
    checkInventory(b.inventory, `building ${b.id}`);
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
  const world = save.world as AnyRecord;
  check(world && Array.isArray(world.chunks), 'world');
  for (const c of world.chunks as AnyRecord[]) {
    check(isInt(c.cx) && isInt(c.cy) && typeof c.explored === 'string', 'chunk header');
  }
}
