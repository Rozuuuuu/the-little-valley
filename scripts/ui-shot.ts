// Screenshots the running game (npm run build && npx vite preview) in headless Chrome, for layout checks.
// Usage: npx tsx scripts/ui-shot.ts <outPrefix> [width] [height] [stepsFile]
// A steps file is a JS module exporting `default async (page, shot) => {}`; without one,
// the script starts a new valley and screenshots it.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const [out = 'shot', w = '1366', h = '768', steps] = process.argv.slice(2);
const url = process.env.URL ?? 'http://localhost:4789/';

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
  await page.setViewport({ width: Number(w), height: Number(h) });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') console.log(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e}`));
  await page.goto(url, { waitUntil: 'networkidle0' });
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
