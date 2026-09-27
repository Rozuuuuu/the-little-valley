import type { Simulation } from '../sim/Simulation';
import { SaveError, type SaveFile } from './format';
import { migrate } from './migrations';
import { deserializeSim, serializeSim, type SerializeExtras } from './serialize';
import type { SaveStore, SlotMeta } from './storage';

export interface LoadResult {
  sim: Simulation;
  save: SaveFile;
  /** True when the current save was damaged and the backup was used. */
  usedBackup: boolean;
  problem?: string;
}

function parse(text: string): { sim: Simulation; save: SaveFile } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError('Save file is not readable (it may have been cut off while writing)');
  }
  const save = migrate(raw);
  return { save, sim: deserializeSim(save) };
}

/**
 * A small synchronous store (localStorage in the browser). Closing a tab can
 * cut an asynchronous IndexedDB write short, so on page hide the game also
 * writes an emergency copy here; loading picks whichever copy is newer.
 */
export interface EmergencyStore {
  get(slot: string): string | null;
  set(slot: string, text: string): void;
  clear(slot: string): void;
}

export class SaveManager {
  constructor(
    readonly store: SaveStore,
    readonly emergency: EmergencyStore | null = null,
  ) {}

  /** Synchronous last-chance save for page unload. Returns false if it could not be written. */
  saveEmergency(slot: string, sim: Simulation, extras: SerializeExtras): boolean {
    if (!this.emergency) return false;
    try {
      this.emergency.set(slot, JSON.stringify(serializeSim(sim, extras)));
      return true;
    } catch {
      return false;
    }
  }

  list(): Promise<SlotMeta[]> {
    return this.store.list();
  }

  /** Serialises, verifies the result reads back, then writes it (rotating the backup). */
  async save(slot: string, sim: Simulation, extras: SerializeExtras): Promise<SaveFile> {
    const file = serializeSim(sim, extras);
    const text = JSON.stringify(file);
    // Never overwrite a good save with something we can't read back.
    parse(text);
    await this.store.write(slot, text, {
      slot, name: file.meta.name, seed: file.meta.seed, savedAt: file.meta.savedAt,
      day: file.meta.day, population: file.meta.population, milestone: file.meta.milestone,
    });
    this.emergency?.clear(slot);
    return file;
  }

  async load(slot: string): Promise<LoadResult> {
    const data = await this.store.read(slot);
    const em = this.emergency?.get(slot);
    if (em) {
      try {
        const e = parse(em);
        const currentSavedAt = data.current ? (JSON.parse(data.current) as SaveFile).meta.savedAt : 0;
        if (e.save.meta.savedAt > currentSavedAt) return { ...e, usedBackup: false };
      } catch {
        // A damaged emergency copy is ignored; the regular save still loads.
      }
    }
    if (!data.current && !data.backup) throw new SaveError('That save slot is empty');
    let problem: string | undefined;
    if (data.current) {
      try {
        return { ...parse(data.current), usedBackup: false };
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
      }
    }
    if (data.backup) {
      try {
        return { ...parse(data.backup), usedBackup: true, problem };
      } catch (e) {
        problem = `${problem ?? ''} Backup also failed: ${e instanceof Error ? e.message : String(e)}`.trim();
      }
    }
    throw new SaveError(problem ?? 'Save could not be loaded');
  }

  remove(slot: string): Promise<void> {
    this.emergency?.clear(slot);
    return this.store.remove(slot);
  }
}
