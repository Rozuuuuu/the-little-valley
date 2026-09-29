// Screenshots the built game (npm run build) in headless Chrome, for layout checks. The files in
// dist/ are answered straight from disk by request interception, so no server has to run.
// Usage: npx tsx scripts/ui-shot.ts <outPrefix> [width] [height] [stepsFile]
// A steps file is a JS module exporting `default async (page, shot) => {}`; without one,
// the script starts a new valley and screenshots it.
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const [out = 'shot', w = '1366', h = '768', steps] = process.argv.slice(2);
const url = process.env.URL ?? 'http://little-valley.test/';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export async function clickText(page: Page, text: string): Promise<void> {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, [role=button], label')].find((b) => (b.textContent ?? '').trim().includes(t)) as HTMLElement | undefined;
    el?.click();
    return !!el;
  }, text);
  if (!ok) throw new Error(`No button with text "${text}"`);
}

const browser = await puppeteer.launch({
  executablePath: CHROMES.find((p) => existsSync(p)),
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  if (!process.env.URL) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.host !== 'little-valley.test') return void req.abort();
      const file = join(process.env.DIST ?? 'dist', u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
      if (!existsSync(file)) return void req.respond({ status: 404, body: '' });
      void req.respond({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
    });
  }
  await page.setViewport({ width: Number(w), height: Number(h) });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') console.log(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e}`));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('.title-screen .menu, .console', { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  let n = 0;
  const shot = async (name = String(++n)) => {
    const file = `${out}-${name}.png`;
    await page.screenshot({ path: file });
    console.log('saved', file);
  };
  if (steps) {
    const mod = await import(pathToFileURL(steps).href);
    await mod.default(page, shot, clickText);
  } else {
    await shot('title');
    await clickText(page, 'New');
    await new Promise((r) => setTimeout(r, 400));
    await shot('new');
    await page.evaluate(() => {
      const f = document.querySelector('.modal form, .modal') as HTMLElement | null;
      const btn = [...(f?.querySelectorAll('button') ?? [])].find((b) => /create|start|begin/i.test(b.textContent ?? '')) as HTMLElement | undefined;
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    await shot('game');
  }
} finally {
  await browser.close();
}
