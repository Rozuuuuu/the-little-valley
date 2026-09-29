/**
 * Installing Little Valley as an app, and full screen. Installed, it opens in its own
 * full-screen window, where the screen's edges are the game's edges, so edge scrolling
 * works on all four sides. The browser's install offer is kept until the player asks.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
  document.addEventListener('fullscreenchange', changed);
}

export function onShellChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Running as the installed app (its own window). */
export function isInstalled(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

/** The browser offers installing right now. */
export function canInstall(): boolean {
  return deferred !== null && !isInstalled();
}

export async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const p = deferred;
  deferred = null;
  await p.prompt();
  const choice = await p.userChoice;
  changed();
  return choice.outcome;
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Not allowed here (e.g. inside a frame): the button simply does nothing.
  }
}
