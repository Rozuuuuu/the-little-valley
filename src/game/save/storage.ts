import type { MilestoneId } from '../data/progression';

export interface SlotMeta {
  slot: string;
  name: string;
  seed: number;
  savedAt: number;
  day: number;
  population: number;
  milestone: MilestoneId;
}

export interface SlotData {
  current?: string;
  /** The previous good save, kept so a damaged write can be recovered. */
  backup?: string;
}

/** Where save files live. The browser uses IndexedDB; tests use memory. */
export interface SaveStore {
  list(): Promise<SlotMeta[]>;
  read(slot: string): Promise<SlotData>;
  /** Writes a new current save and moves the old current save to backup. */
  write(slot: string, data: string, meta: SlotMeta): Promise<void>;
  remove(slot: string): Promise<void>;
}

export class MemoryStore implements SaveStore {
  readonly meta = new Map<string, SlotMeta>();
  readonly data = new Map<string, SlotData>();

  async list(): Promise<SlotMeta[]> {
    return [...this.meta.values()].sort((a, b) => b.savedAt - a.savedAt);
  }
  async read(slot: string): Promise<SlotData> {
    return { ...(this.data.get(slot) ?? {}) };
  }
  async write(slot: string, data: string, meta: SlotMeta): Promise<void> {
    const old = this.data.get(slot);
    this.data.set(slot, { current: data, backup: old?.current ?? old?.backup });
    this.meta.set(slot, meta);
  }
  async remove(slot: string): Promise<void> {
    this.meta.delete(slot);
    this.data.delete(slot);
  }
}

const DB_NAME = 'little-valley';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'slot' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('The save database is busy in another tab. Close other Little Valley tabs and try again.'));
  });
}

/** The connection was closed under us (browser storage pressure, another tab upgrading, a sleeping tab). */
function isClosedError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  const msg = e instanceof Error ? e.message : String(e);
  return name === 'InvalidStateError' || /closing|closed/i.test(msg);
}

export class IndexedDbStore implements SaveStore {
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = this.connect();
  }

  private connect(): Promise<IDBDatabase> {
    const p = openDb().then((db) => {
      // Another tab wants to upgrade, or the browser closed the connection: drop it and reopen on next use.
      db.onversionchange = () => {
        db.close();
        if (this.db === p) this.db = this.connect();
      };
      db.onclose = () => {
        if (this.db === p) this.db = this.connect();
      };
      return db;
    });
    // A failed open is retried on the next call instead of failing forever.
    p.catch(() => {
      if (this.db === p) this.db = this.connect();
    });
    return p;
  }

  /** Runs one database operation, reopening the connection once if the browser closed it. */
  private async use<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const current = this.db;
    try {
      return await fn(await current);
    } catch (e) {
      if (!isClosedError(e)) throw e;
      if (this.db === current) this.db = this.connect();
      return fn(await this.db);
    }
  }

  async list(): Promise<SlotMeta[]> {
    const all = await this.use((db) => req(db.transaction('meta').objectStore('meta').getAll() as IDBRequest<SlotMeta[]>));
    return all.sort((a, b) => b.savedAt - a.savedAt);
  }

  async read(slot: string): Promise<SlotData> {
    return ((await this.use((db) => req(db.transaction('data').objectStore('data').get(slot)))) as SlotData | undefined) ?? {};
  }

  write(slot: string, data: string, meta: SlotMeta): Promise<void> {
    return this.use(async (db) => {
      const tx = db.transaction(['data', 'meta'], 'readwrite');
      const store = tx.objectStore('data');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Save transaction aborted'));
      });
      const old = (await req(store.get(slot))) as SlotData | undefined;
      store.put({ current: data, backup: old?.current ?? old?.backup }, slot);
      tx.objectStore('meta').put(meta);
      await done;
    });
  }

  remove(slot: string): Promise<void> {
    return this.use(async (db) => {
      const tx = db.transaction(['data', 'meta'], 'readwrite');
      tx.objectStore('data').delete(slot);
      tx.objectStore('meta').delete(slot);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Delete aborted'));
      });
    });
  }
}

const EMERGENCY_PREFIX = 'little-valley:emergency:';

/** localStorage-backed emergency copies, used only on page unload. */
export const localEmergencyStore = {
  get(slot: string): string | null {
    try {
      return localStorage.getItem(EMERGENCY_PREFIX + slot);
    } catch {
      return null;
    }
  },
  set(slot: string, text: string): void {
    localStorage.setItem(EMERGENCY_PREFIX + slot, text);
  },
  clear(slot: string): void {
    try {
      localStorage.removeItem(EMERGENCY_PREFIX + slot);
    } catch {
      // ignore
    }
  },
};
