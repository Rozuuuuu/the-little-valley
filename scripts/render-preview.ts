/**
 * Renders art to PNG files without a browser, for reviewing generated sprites
 * and terrain. A minimal Canvas stand-in supports what the pixel painter uses
 * (fillRect, image data, drawImage copies); it is not a full Canvas.
 *
 *   npx tsx scripts/render-preview.ts sprites out.png
 *   npx tsx scripts/render-preview.ts terrain out.png [seed] [gen] [cx] [cy] [chunks]
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---- a tiny canvas stand-in ----------------------------------------------------------

function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 255];
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s));
    return [r, g, b, a === undefined ? 255 : Math.round(a * 255)];
  }
  return [0, 0, 0, 255];
}

class FakeCtx {
  fillStyle = '#000';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  imageSmoothingEnabled = false;
  private tx = 0;
  private sx = 1;
  constructor(readonly canvas: FakeCanvas) {}
  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = parseColor(this.fillStyle);
    const atop = this.globalCompositeOperation === 'source-atop';
    for (let yy = Math.max(0, y); yy < Math.min(this.canvas.height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.canvas.width, x + w); xx++) {
        const i = (yy * this.canvas.width + xx) * 4;
        const d = this.canvas.data;
        if (atop && d[i + 3] === 0) continue;
        const al = (a / 255) * this.globalAlpha;
        d[i] = Math.round(d[i] * (1 - al) + r * al);
        d[i + 1] = Math.round(d[i + 1] * (1 - al) + g * al);
        d[i + 2] = Math.round(d[i + 2] * (1 - al) + b * al);
        if (!atop) d[i + 3] = Math.max(d[i + 3], Math.round(255 * al));
      }
    }
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    for (let yy = Math.max(0, y); yy < Math.min(this.canvas.height, y + h); yy++) this.canvas.data.fill(0, (yy * this.canvas.width + Math.max(0, x)) * 4, (yy * this.canvas.width + Math.min(this.canvas.width, x + w)) * 4);
  }
  getImageData(x: number, y: number, w: number, h: number) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      const sy = y + yy;
      if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
      const i = (sy * this.canvas.width + sx) * 4;
      out.set(this.canvas.data.subarray(i, i + 4), (yy * w + xx) * 4);
    }
    return { data: out, width: w, height: h };
  }
  createImageData(w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  putImageData(img: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void {
    for (let yy = 0; yy < img.height; yy++) for (let xx = 0; xx < img.width; xx++) {
      const dx = x + xx;
      const dy = y + yy;
      if (dx < 0 || dy < 0 || dx >= this.canvas.width || dy >= this.canvas.height) continue;
      const s = (yy * img.width + xx) * 4;
      this.canvas.data.set(img.data.subarray(s, s + 4), (dy * this.canvas.width + dx) * 4);
    }
  }
  translate(x: number): void {
    this.tx = x;
  }
  scale(x: number): void {
    this.sx = x;
  }
  drawImage(src: FakeCanvas, ...a: number[]): void {
    // Supports drawImage(src, dx, dy) and drawImage(src, dx, dy, dw, dh) with integer scaling.
    const dx = a[0] ?? 0;
    const dy = a[1] ?? 0;
    const dw = a.length >= 4 ? a[2] : src.width;
    const dh = a.length >= 4 ? a[3] : src.height;
    for (let yy = 0; yy < dh; yy++) for (let xx = 0; xx < dw; xx++) {
      const sxp = Math.floor((xx * src.width) / dw);
      const syp = Math.floor((yy * src.height) / dh);
      const s = (syp * src.width + sxp) * 4;
      if (src.data[s + 3] === 0) continue;
      let tx = dx + xx;
      if (this.sx === -1) tx = this.tx - 1 - tx;
      const ty = dy + yy;
      if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) continue;
      this.canvas.data.set(src.data.subarray(s, s + 4), (ty * this.canvas.width + tx) * 4);
    }
  }
}

class FakeCanvas {
  width = 1;
  height = 1;
  private buf: Uint8ClampedArray | null = null;
  private ctx: FakeCtx | null = null;
  get data(): Uint8ClampedArray {
    if (!this.buf || this.buf.length !== this.width * this.height * 4) this.buf = new Uint8ClampedArray(this.width * this.height * 4);
    return this.buf;
  }
  getContext(): FakeCtx {
    return (this.ctx ??= new FakeCtx(this));
  }
  toDataURL(): string {
    return '';
  }
}

(globalThis as unknown as { document: unknown }).document = { createElement: () => new FakeCanvas() };

// ---- PNG ---------------------------------------------------------------------------

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file: string, w: number, h: number, rgba: Uint8ClampedArray, scale = 1): void {
  const W = w * scale;
  const H = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
      const d = y * (W * 4 + 1) + 1 + x * 4;
      raw[d] = rgba[s];
      raw[d + 1] = rgba[s + 1];
      raw[d + 2] = rgba[s + 2];
      raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
}

// ---- main --------------------------------------------------------------------------

async function main(): Promise<void> {
  const [what = 'sprites', out = 'preview.png'] = process.argv.slice(2);
  if (what === 'terrain') {
    const { computePixels } = await import('../src/render/terrainPainter');
    const { terrainAt } = await import('../src/game/world/worldgen');
    const seed = Number(process.argv[4] ?? 424242);
    const gen = Number(process.argv[5] ?? 3);
    const cx0 = Number(process.argv[6] ?? -2);
    const cy0 = Number(process.argv[7] ?? -3);
    const n = Number(process.argv[8] ?? 3);
    const season = (process.argv[9] ?? 'spring') as 'spring';
    const S = 512;
    const img = new Uint8ClampedArray(S * n * S * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = cx0 + i;
      const cy = cy0 + j;
      const terr = new Uint8Array(34 * 34);
      for (let gy = 0; gy < 34; gy++) for (let gx = 0; gx < 34; gx++) terr[gy * 34 + gx] = terrainAt(seed, cx * 32 + gx - 1, cy * 32 + gy - 1, gen);
      const px = computePixels(seed, cx, cy, terr, season);
      const bytes = new Uint8Array(px.buffer);
      for (let y = 0; y < S; y++) img.set(bytes.subarray(y * S * 4, (y + 1) * S * 4), (((j * S + y) * S * n) + i * S) * 4);
    }
    // Downscale 4x so the whole area fits in one image.
    const D = 4;
    const W = (S * n) / D;
    const small = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) small.set(img.subarray(((y * D) * S * n + x * D) * 4, ((y * D) * S * n + x * D) * 4 + 4), (y * W + x) * 4);
    writePng(out, W, W, small);
    console.log('wrote', out, W, 'x', W);
    return;
  }
  const { SpriteBank } = await import('../src/render/sprites/index');
  const bank = new SpriteBank();
  const list: { canvas: FakeCanvas }[] = [];
  const add = (s: { canvas: unknown } | undefined) => s && list.push(s as { canvas: FakeCanvas });
  const extra = (process.argv[4] ?? '').split(',').filter(Boolean);
  for (const id of ['familyHome', 'charcoalKiln', 'smelter', 'forge', ...extra]) {
    const set = bank.buildings[id as 'forge'];
    add(set?.day);
    add(set?.night);
  }
  for (const s of Object.values(bank.orchard)) add(s);
  for (const s of bank.quarry) add(s);
  for (const m of bank.mine) {
    add(m.day);
    add(m.night);
  }
  for (const s of Object.values(bank.resources)) add(s);
  // Wrap into rows so the sheet stays viewable.
  const pad = 4;
  const W = 360;
  const rows: { canvas: FakeCanvas; x: number; y: number }[] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const s of list) {
    if (x + s.canvas.width + pad > W) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    rows.push({ canvas: s.canvas, x, y });
    x += s.canvas.width + pad;
    rowH = Math.max(rowH, s.canvas.height);
  }
  const H = y + rowH + pad;
  const sheet = new FakeCanvas();
  sheet.width = W;
  sheet.height = H;
  const ctx = sheet.getContext();
  ctx.fillStyle = '#6a9446';
  ctx.fillRect(0, 0, W, H);
  for (const r of rows) ctx.drawImage(r.canvas, r.x, r.y);
  writePng(out, W, H, sheet.data, 3);
  console.log('wrote', out, W * 3, 'x', H * 3, list.length, 'sprites');
}

void main();
