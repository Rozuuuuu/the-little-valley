import { BUILD, isUpdate, type BuildInfo } from './version';

/**
 * Keeps the installed app up to date. Every push to master is built and published (see
 * .github/workflows/deploy.yml) with a version.json naming its commit. The app checks it on
 * start, every ten minutes, when it comes back to the front and when the network returns; the
 * service worker downloads the new version in the background, and the app switches to it at a
 * safe moment (straight away on the title screen, or when the player says so mid-game, after
 * saving).
 */

export type UpdateStatus = 'none' | 'downloading' | 'ready' | 'updating';

interface UpdateState {
  status: UpdateStatus;
  latest: BuildInfo | null;
}

const CHECK_EVERY = 10 * 60 * 1000;
let state: UpdateState = { status: 'none', latest: null };
let reg: ServiceWorkerRegistration | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<UpdateState>): void {
  state = { ...state, ...next };
  listeners.forEach((f) => f());
}

export function updateState(): UpdateState {
  return state;
}

export function onUpdateChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Asks whether a newer build is published, and has the service worker fetch it. */
export async function checkForUpdate(): Promise<void> {
  if (state.status === 'updating') return;
  try {
    await reg?.update();
  } catch {
    // Offline or the host is unreachable: try again later.
  }
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    const latest = res.ok ? ((await res.json()) as BuildInfo | null) : null;
    if (isUpdate(BUILD, latest)) set({ latest, status: reg?.waiting ? 'ready' : state.status === 'ready' ? 'ready' : 'downloading' });
  } catch {
    // Offline: the game keeps running the version it has.
  }
}

function watch(r: ServiceWorkerRegistration): void {
  reg = r;
  const ready = () => {
    if (r.waiting && navigator.serviceWorker.controller) set({ status: 'ready' });
  };
  ready();
  r.addEventListener('updatefound', () => {
    const w = r.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed') ready();
    });
  });
}

/** Registers the service worker and starts checking for updates (published builds only). */
export function startUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((r) => {
        watch(r);
        if (BUILD.commit === 'dev') return;
        void checkForUpdate();
        window.setInterval(() => void checkForUpdate(), CHECK_EVERY);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void checkForUpdate();
        });
        window.addEventListener('online', () => void checkForUpdate());
      })
      .catch(() => {
        // Offline caching and updates are a bonus; the game still runs without them.
      });
  });
}

/**
 * Switches to the downloaded version: runs `before` (saving the game), tells the waiting
 * service worker to take over, and reloads once it has.
 */
export async function applyUpdate(before?: () => Promise<unknown>): Promise<void> {
  if (state.status === 'updating') return;
  set({ status: 'updating' });
  try {
    await before?.();
  } catch {
    // Saving failed: the emergency save on page hide still runs.
  }
  const waiting = reg?.waiting;
  if (waiting && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage('skip-waiting');
    // If the switch doesn't happen promptly, reload anyway.
    window.setTimeout(() => window.location.reload(), 4000);
  } else window.location.reload();
}
