// Plays the built React game (dist/) in headless Chrome and screenshots its main view, each
// window tab and the build menu, as references for the Godot version's parity.
// Usage: npm run build && npx tsx scripts/tour-react.ts [outDir=build/tour-react]
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';

const out = process.argv[2] ?? 'build/tour-react';
mkdirSync(out, { recursive: true });
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clickText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const buttons = [...document.querySelectorAll('button')];
    const el = buttons.find((b) => (b.textContent ?? '').trim().startsWith(t)) ?? buttons.find((b) => (b.textContent ?? '').includes(t));
    if (!el) return false;
    (el as HTMLButtonElement).click();
    return true;
  }, text);
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await wait(2500);
  await clickText(page, 'Play in the browser');
  await wait(2000);
  await page.screenshot({ path: `${out}/0-title.png` });
  await clickText(page, 'New valley');
  await wait(1500);
  await page.screenshot({ path: `${out}/1-new-valley.png` });
  // The ruler's name is required; then found the realm.
  await page.type('input[placeholder="Type your name"]', 'Lloyd');
  for (const t of ['Found the realm', 'Start', 'Begin', 'Create']) if (await clickText(page, t)) break;
  await wait(4000);
  for (const t of ['Skip', 'Start playing', 'Close', 'Got it']) await clickText(page, t);
  await wait(20000);
  await page.screenshot({ path: `${out}/2-play.png` });
  for (const tab of ['People', 'Areas', 'Towns', 'Families', 'Realm', 'Goals']) {
    if (await clickText(page, tab)) {
      await wait(800);
      await page.screenshot({ path: `${out}/3-${tab.toLowerCase()}.png` });
      await clickText(page, tab);
      await wait(300);
    }
  }
  // A building selected (the hall), then the build menu.
  await page.mouse.click(800, 260);
  await wait(800);
  await page.screenshot({ path: `${out}/5-building.png` });
  if (await clickText(page, 'Build')) {
    await wait(600);
    await page.screenshot({ path: `${out}/4-build.png` });
  }
  console.log('tour done');
} finally {
  await browser.close();
  server.close();
}
