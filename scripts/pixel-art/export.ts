/**
 * Exports the browser game's original pixel art for the Godot version. Run from the repository
 * root: npx tsx scripts/pixel-art/export.ts
 *
 * Bundles entry.ts, runs it in headless Chrome (the sprites are painted on canvases), and writes
 * godot/art/sprites.json: every sprite as an embedded PNG (6× nearest-neighbour, so 16 art px per
 * tile become 96) with its size, anchor and kind. PNG copies for review go to
 * godot/art_src/pixel/ (ignored by Godot's importer).
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROMES = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'];
const OUT = 'godot/art_src/pixel';
const BUNDLE = 'godot/art/sprites.json';

interface Sprite { name: string; png: string; w: number; h: number; ax: number; ay: number; kind: string; points?: Record<string, [number, number]> }

/** The browser renderer's per-building life (smoke and spark points), read from its source text:
 * the table holds only literals, and importing the renderer would pull in the whole game view. */
function buildingLife(): Record<string, { smoke?: [number, number][]; sparks?: [number, number] }> {
  const src = readFileSync('src/render/Renderer.ts', 'utf8');
  const start = src.indexOf('= {', src.indexOf('const BUILDING_LIFE')) + 2;
  let depth = 0;
  let end = start;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  return new Function(`return (${src.slice(start, end + 1)});`)() as Record<string, { smoke?: [number, number][]; sparks?: [number, number] }>;
}

const bundled = await build({ entryPoints: ['scripts/pixel-art/entry.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' });
const code = bundled.outputFiles[0].text;
const { existsSync } = await import('node:fs');
const executablePath = CHROMES.find((p) => existsSync(p));
if (!executablePath) throw new Error('Chrome not found');
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: code });
  const sprites = (await page.evaluate('window.exportAll()')) as Sprite[];
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync('godot/art_src/.gdignore', '');
  const life = buildingLife();
  const sizes = JSON.parse(readFileSync('godot/content/buildings.json', 'utf8')).BUILDINGS as Record<string, { size: { w: number; h: number } }>;
  for (const s of sprites) {
    if (s.kind !== 'building') continue;
    const type = s.name.replace(/_\d+$/, '');
    const size = sizes[type]?.size;
    if (!size) continue;
    // Points from the anchor (the footprint's bottom-left) in Godot art px: where smoke rises
    // and sparks fly (the browser's BUILDING_LIFE, from the footprint's top-left), and the top.
    const fromTopLeft = ([dx, dy]: [number, number]): [number, number] => [dx * 6, (dy - size.h * 16) * 6];
    const points: Record<string, [number, number]> = { top: [size.w * 8 * 6, -s.ay] };
    const l = life[type];
    if (l?.smoke?.length) points.chimney = fromTopLeft(l.smoke[0]);
    if (l?.sparks) points.sparks = fromTopLeft(l.sparks);
    s.points = points;
  }
  const entries: Record<string, Omit<Sprite, 'name' | 'png'> & { png: string; provisional: false; pixel: true }> = {};
  for (const s of sprites) {
    const b64 = s.png.slice(s.png.indexOf(',') + 1);
    writeFileSync(`${OUT}/${s.name}.png`, Buffer.from(b64, 'base64'));
    entries[s.name] = { w: s.w, h: s.h, ax: s.ax, ay: s.ay, kind: s.kind, provisional: false, pixel: true, png: b64, ...(s.points ? { points: s.points } : {}) };
  }
  const note = "The browser game's original pixel art (src/render/sprites), exported by scripts/pixel-art/export.ts at 6x nearest-neighbour.";
  writeFileSync(BUNDLE, JSON.stringify({ tilePx: 96, artPxPerTile: 16, note, sprites: entries }) + '\n');
  const manifest = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { ...v, png: undefined }]));
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ tilePx: 96, artPxPerTile: 16, note, sprites: manifest }, null, 1) + '\n');
  // The palette the game and the Asset Studio use: the browser's colours, people's colours by
  // index, and the pixel interface (dirt panels in a grass frame, as src/ui/pixel.css).
  const pixel = (await page.evaluate('window.palette()')) as Record<string, string | string[]>;
  const pal = {
    _comment: 'The pixel palette (src/render/palette.ts, exported by scripts/pixel-art/export.ts) and the pixel interface colours (src/ui/pixel.css). Read by the game and the Asset Studio.',
    pixel,
    people: { skin: pixel.skin, hair: pixel.hair, shirt: pixel.shirt, pants: pixel.pants, outline: pixel.outline },
    ui: {
      panel: '#7c5230', panelHi: '#634024', panelEdge: '#4c311b', line: '#2f6a27', lineHi: '#4f9636', lineDark: '#1d4a1b',
      text: '#f6ead0', textDim: '#ecdab4', accent: '#f4cf5a', good: '#8ee07a', problem: '#ff6f5e', warn: '#ffcf5a',
      primary: '#4f8a3c', primaryEdge: '#a8e070', on: '#8a6a1c',
    },
  };
  writeFileSync('godot/art/palette.json', `${JSON.stringify(pal, null, 2)}\n`);
  console.log(`${sprites.length} pixel sprites written to ${BUNDLE}`);
} finally {
  await browser.close();
}
