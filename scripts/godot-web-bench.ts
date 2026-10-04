// Runs the exported Godot web build (dist-godot/web) in Chrome and records its frame benchmark.
// Usage: npx tsx scripts/godot-web-bench.ts [settlers=100] [frames=600] [mode=desktop|phone] [width] [height] [throttle=4]
//
// "phone" is an EMULATION, not a phone: a 915×412 landscape viewport, touch, a 4× CPU slowdown
// (Chrome DevTools throttling) and the GPU of this machine. It indicates how much headroom a
// mid-range phone might have; a real device is still the only real measurement.
// Prints the game's FRAMES line (frame-time percentiles, draw calls, memory) and load timing.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const settlers = Number(process.argv[2] ?? 100);
const frames = Number(process.argv[3] ?? 600);
const mode = process.argv[4] ?? 'desktop';
/** CPU slowdown for the phone emulation (Chrome DevTools throttling). */
const throttle = Number(process.argv[7] ?? 4);
const width = Number(process.argv[5] ?? (mode === 'phone' ? 915 : 1600));
const height = Number(process.argv[6] ?? (mode === 'phone' ? 412 : 900));
const ROOT = 'dist-godot/web';
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream',
  '.png': 'image/png', '.json': 'application/json',
};
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
];

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(ROOT, url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(8735, r));

const browser = await puppeteer.launch({
  executablePath: CHROMES.find((p) => existsSync(p)),
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${width},${height}`],
});
const page = await browser.newPage();
await page.setViewport({ width, height, isMobile: mode === 'phone', hasTouch: mode === 'phone', deviceScaleFactor: 1 });
if (mode === 'phone') {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}
let result = '';
let startup = '';
let done = false;
const errors: string[] = [];
page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('FRAMES ')) result = t.slice(7);
  if (t.startsWith('STARTUP ')) startup = t.slice(8);
  if (t.includes('CAPTURE DONE')) done = true;
  if (m.type() === 'error') errors.push(t);
});
const t0 = Date.now();
await page.goto(`http://localhost:8735/index.html?bench=${frames}&settlers=${Math.max(0, settlers - 5)}&ticks=100&zoom=0.55`);
while (!done && Date.now() - t0 < 600_000) await new Promise((r) => setTimeout(r, 500));
const seconds = (Date.now() - t0) / 1000;
await page.screenshot({ path: `dist-godot/web-bench-${mode}-${settlers}.png` });
await browser.close();
server.close();
console.log(JSON.stringify({ mode, settlers, viewport: `${width}x${height}`, totalSeconds: seconds, startupMs: startup ? JSON.parse(startup) : null, frames: result ? JSON.parse(result) : null, errors: errors.slice(0, 5) }));
