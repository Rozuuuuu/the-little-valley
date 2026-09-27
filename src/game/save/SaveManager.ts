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

export class SaveManager {
  constructor(readonly store: SaveStore) {}

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
    return file;
  }

  async load(slot: string): Promise<LoadResult> {
    const data = await this.store.read(slot);
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
    return this.store.remove(slot);
  }
}
