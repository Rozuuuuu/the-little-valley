import type { Plugin } from 'vite';

/** Files the service worker always caches besides the bundle. */
const STATIC = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

/**
 * The service worker: on install it caches the whole game, then serves every
 * same-origin request from the cache first, so the game starts with no network.
 */
export function serviceWorkerSource(files: string[], version: string): string {
  const list = [...STATIC, ...files.map((f) => `./${f}`)];
  return `// Generated at build time: caches Little Valley for offline play.
const CACHE = ${JSON.stringify(`little-valley-${version}`)};
const FILES = [
${list.map((f) => `  ${JSON.stringify(f)},`).join('\n')}
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
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

/** Vite plugin: writes sw.js listing every emitted file of the production build. */
export function offlinePrecache(): Plugin {
  return {
    name: 'little-valley-offline',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map')).sort();
      let h = 2166136261;
      for (const ch of files.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(files, h.toString(36)) });
    },
  };
}
