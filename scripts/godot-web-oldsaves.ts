// Checks, in Chrome, that the Godot web build brings valleys over from the old browser game.
// Seeds the old game's IndexedDB ('little-valley') on the same address with real fixtures: a v4
// save, a v11 save whose current copy is damaged (its backup must be used), and a v12 save with a
// newer emergency copy in localStorage; then opens index.html?oldsaves=1 and reads its report.
// Run after scripts/godot-export.sh web:  npx tsx scripts/godot-web-oldsaves.ts
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = 'dist-godot/web';
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream',
  '.png': 'image/png', '.json': 'application/json',
};
const CHROMES = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(ROOT, url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>seed</title>');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(8736, r));
const browser = await puppeteer.launch({ executablePath: CHROMES.find((p) => existsSync(p)), headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const fixture = (v: number) => readFileSync(`tests/fixtures/v${v}-save.json`, 'utf8');
const v12 = JSON.parse(fixture(12));
const v12newer = JSON.stringify({ ...v12, meta: { ...v12.meta, savedAt: v12.meta.savedAt + 1000, name: 'Emergency copy' } });

// Seed the old game's database exactly as src/game/save/storage.ts writes it.
await page.goto('http://localhost:8736/seed');
// (Page-side code is plain JavaScript text: tsx would add a helper that the page lacks.)
const SEED = `(async (v4, v11, v12s, v12e) => {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('little-valley', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('meta', { keyPath: 'slot' });
      open.result.createObjectStore('data');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const meta = (slot, text) => {
    const m = JSON.parse(text).meta;
    return { slot, name: m.name, seed: m.seed, savedAt: m.savedAt, day: m.day, population: m.population, milestone: m.milestone };
  };
  const tx = db.transaction(['meta', 'data'], 'readwrite');
  tx.objectStore('data').put({ current: v4 }, 'slot-a');
  tx.objectStore('meta').put(meta('slot-a', v4));
  tx.objectStore('data').put({ current: '{ damaged', backup: v11 }, 'slot-b');
  tx.objectStore('meta').put(meta('slot-b', v11));
  tx.objectStore('data').put({ current: v12s }, 'slot-c');
  tx.objectStore('meta').put(meta('slot-c', v12s));
  await new Promise((r) => (tx.oncomplete = () => r()));
  db.close();
  localStorage.setItem('little-valley:emergency:slot-c', v12e);
})(${JSON.stringify(fixture(4))}, ${JSON.stringify(fixture(11))}, ${JSON.stringify(fixture(12))}, ${JSON.stringify(v12newer)})`;
await page.evaluate(SEED);

let report = '';
const errors: string[] = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('OLDSAVES ')) report = t.slice(9);
  else if (m.type() === 'error') errors.push(t);
});
await page.goto('http://localhost:8736/index.html?oldsaves=1');
const until = Date.now() + 120_000;
while (!report && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
// The old database must be untouched.
const left = (await page.evaluate(`new Promise((resolve) => {
  const open = indexedDB.open('little-valley');
  open.onsuccess = () => {
    const r = open.result.transaction('meta').objectStore('meta').count();
    r.onsuccess = () => resolve(r.result);
  };
})`)) as number;
await browser.close();
server.close();
if (!report) {
  console.error('No OLDSAVES report.', errors.slice(0, 10).join('\n'));
  process.exit(1);
}
const r = JSON.parse(report);
console.log(JSON.stringify(r, null, 2));
const names = r.worlds.map((w: { name: string }) => w.name);
const ok = r.found === 3 && r.problems.length === 0 && r.worlds.length === 3 && r.pendingAfter === 0 && left === 3
  && r.worlds.every((w: { version: number; people: number }) => w.version === 15 && w.people > 0) && names.includes('Emergency copy');
console.log(ok ? 'PASS: three old valleys brought over (backup and emergency copies used); old database untouched' : `FAIL (old database has ${left} slots)`);
process.exit(ok ? 0 : 1);
