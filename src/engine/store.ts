import { useSyncExternalStore } from 'react';

/**
 * Minimal external store. The game publishes a UI snapshot a few times per
 * second, so React never re-renders on every simulation tick.
 */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private state: T) {}

  get = (): T => this.state;

  set(next: T): void {
    this.state = next;
    for (const l of this.listeners) l();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
