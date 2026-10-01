import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';

/** Files the service worker always caches besides the bundle. */
const STATIC = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

/** Which commit a build was made from, shown in the game and published as version.json. */
export interface BuildInfo {
  commit: string;
  short: string;
  date: string;
  message: string;
}

/** Reads the build's commit from git (run is `git <args>`); "dev" when there is no git. */
export function buildInfo(run: (args: string) => string = (a) => execFileSync('git', a.split(' '), { encoding: 'utf8' })): BuildInfo {
  try {
    const commit = run('rev-parse HEAD').trim();
    if (!commit) throw new Error('no commit');
    return { commit, short: commit.slice(0, 7), date: run('log -1 --format=%cI').trim(), message: run('log -1 --format=%s').trim() };
  } catch {
    return { commit: 'dev', short: 'dev', date: new Date(0).toISOString(), message: '' };
  }
}

/**
 * The service worker. On install it caches the whole game, then serves every same-origin
 * request from the cache first, so the game starts with no network. version.json is always
 * fetched fresh, so the installed app can tell when a newer build is published. A new version
 * installs in the background and waits: the page tells it when to take over ('skip-waiting'),
 * so a running game never mixes old and new files.
 */
export function serviceWorkerSource(files: string[], version: string): string {
  const list = [...STATIC, ...files.map((f) => `./${f}`)];
  return `// Generated at build time: caches Little Valley for offline play.
const CACHE = ${JSON.stringify(`little-valley-${version}`)};
const FILES = [
${list.map((f) => `  ${JSON.stringify(f)},`).join('\n')}
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('little-valley-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Which build is published: always from the network, never from the cache.
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => new Response('null', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
`;
}

/** Vite plugin: writes sw.js listing every emitted file of the production build, and version.json. */
export function offlinePrecache(info: BuildInfo): Plugin {
  return {
    name: 'little-valley-offline',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map')).sort();
      let h = 2166136261;
      for (const ch of [...files, info.commit].join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(files, h.toString(36)) });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info, null, 2) });
    },
  };
}
