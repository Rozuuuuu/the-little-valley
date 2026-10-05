// Loads a built web game in headless Chrome and reports every failed request (HTTP 4xx/5xx,
// network failures) and every console error or page error, so problems such as 401s show up.
// Usage: npx tsx scripts/check-web-errors.ts <folder> [seconds=20] [query]
//   npx tsx scripts/check-web-errors.ts dist             (the React browser game, after npm run build)
//   npx tsx scripts/check-web-errors.ts dist-godot/web   (the Godot web export)
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = process.argv[2] ?? 'dist';
const seconds = Number(process.argv[3] ?? 20);
const query = process.argv[4] ?? '';
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const CHROMES = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(root, url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  // Godot's threaded builds need cross-origin isolation; harmless for the others.
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const browser = await puppeteer.launch({ executablePath: CHROMES.find((p) => existsSync(p)), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems: string[] = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => problems.push(`FAILED ${r.failure()?.errorText} ${r.url()}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 300)}`));
  await page.goto(`http://localhost:${port}/${query}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  await page.screenshot({ path: `build/web-errors-${root.replace(/[\\/]/g, '_')}.png` });
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify({ root, problems: [...new Set(problems)] }, null, 1));
