import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbStore, type SlotMeta } from '../src/game/save/storage';

const meta = (slot: string): SlotMeta => ({ slot, name: 'Test', seed: 1, savedAt: Date.now(), day: 1, population: 5, milestone: 'camp' });

/** The browser may close a connection at any time (storage pressure, another tab upgrading, the tab sleeping). */
async function closeUnderneath(store: IndexedDbStore): Promise<void> {
  const db = await (store as unknown as { db: Promise<IDBDatabase> }).db;
  db.close();
}

describe('IndexedDbStore survives a closed connection', () => {
  it('saves again after the browser closes the database connection', async () => {
    const store = new IndexedDbStore();
    await store.write('a', 'first', meta('a'));
    await closeUnderneath(store);
    // Before the fix: "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing."
    await store.write('a', 'second', meta('a'));
    const back = await store.read('a');
    expect(back.current).toBe('second');
    expect(back.backup).toBe('first');
  });

  it('lists, reads and removes after a close too', async () => {
    const store = new IndexedDbStore();
    await store.write('b', 'x', meta('b'));
    await closeUnderneath(store);
    expect((await store.list()).some((m) => m.slot === 'b')).toBe(true);
    await closeUnderneath(store);
    expect((await store.read('b')).current).toBe('x');
    await closeUnderneath(store);
    await store.remove('b');
    expect((await store.list()).some((m) => m.slot === 'b')).toBe(false);
  });
});
