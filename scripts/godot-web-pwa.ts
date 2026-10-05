// Local release smoke check: service-worker cache, install-event capture, offline engine boot.
// Does not install an app or publish anything. Run after the Godot Web release export.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const root = resolve('dist-godot/web');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome']
  .find(existsSync);
assert(chrome, 'Chrome is required for this local check');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript',
  '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png',
  '.json': 'application/json' };
let networkAvailable = true;
const server = createServer((req, res) => {
  if (!networkAvailable) { res.writeHead(503).end(); return; }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address !== 'string');
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  let boots = 0;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('CAPTURE DONE')) boots++;
    if (message.text().includes('SCRIPT ERROR:')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  const url = `http://127.0.0.1:${address.port}/index.html?bench=1&settlers=0&ticks=0`;
  await page.goto(url);
  const waitForBoot = async (count: number) => {
    const deadline = Date.now() + 120_000;
    while (boots < count && Date.now() < deadline) await new Promise((done) => setTimeout(done, 250));
    assert(boots >= count, `engine boot ${count} timed out; ${errors.join('\n')}`);
  };
  await waitForBoot(1);
  console.log('Online engine started; waiting for the service worker.');
  await page.evaluate(`Promise.race([navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('worker registration timed out')), 30000))])`);
  // The first visit registers the worker after starting the engine. Opening the installed
  // app online then loads its large engine/game files through that worker into the cache.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForBoot(2);
  console.log('Second online launch completed.');
  // Synthetic event checks our bridge only; it is not evidence of a real install prompt.
  const captured = await page.evaluate(`(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(event);
    const captured = window.__lvInstall === event && event.defaultPrevented;
    window.dispatchEvent(new Event('appinstalled'));
    return captured && window.__lvInstall === null;
  })()`);
  assert(captured, 'install-event bridge did not capture and clear the event');
  const cached = await page.evaluate(`(async () => {
    const keys = await caches.keys();
    const requests = await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()));
    return requests.flat().map((request) => new URL(request.url).pathname);
  })()`);
  assert(cached.some((path: string) => path.endsWith('.wasm')), 'engine is not cached');
  assert(cached.some((path: string) => path.endsWith('.pck')), 'game is not cached');
  networkAvailable = false;
  await page.setOfflineMode(true);
  // The installed app uses the manifest's normal entry URL. The engine worker does not
  // cache arbitrary benchmark query URLs, so those are not an offline entry point.
  await page.goto(`http://127.0.0.1:${address.port}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('document.getElementById("status") === null', { timeout: 120_000 });
  await page.screenshot({ path: 'dist-godot/web-pwa-offline.png' });
  console.log('Offline engine started.');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ onlineBoot: true, offlineBoot: true, installEventBridge: true,
    cachedFiles: cached.length, onlineWarmupBoots: 2,
    actualInstallPrompt: 'not tested', updateReplacement: 'not tested' }));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
}
