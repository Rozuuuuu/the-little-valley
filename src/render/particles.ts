import type { FxKind } from '../game/sim/types';
import { P } from './palette';
import { gpuImage, type Sprite } from './pixel';

/** World-space particles in art pixels. Purely cosmetic; never saved. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
  kind: 'px' | 'smoke' | 'icon' | 'leaf' | 'text' | 'arrow' | 'butterfly';
  text?: string;
  /** Arrows: where they fly to (art pixels). */
  tx?: number;
  ty?: number;
  icon?: Sprite;
  phase: number;
}

const MAX_PARTICLES = 900;

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push({
      vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 1, gravity: 0, kind: 'px', phase: Math.random() * 6.28,
      ...p,
    });
  }

  /** A damage number that floats up and fades. (x, y) in tiles. */
  floatText(tx: number, ty: number, text: string, color: string): void {
    this.add({ x: tx * 16, y: ty * 16 - 20, vy: -14, max: 0.9, color, kind: 'text', text });
  }

  /** An arrow flying from a hunter to its quarry. (in tiles) */
  arrow(fx: number, fy: number, tx: number, ty: number): void {
    this.add({ x: fx * 16, y: fy * 16 - 10, tx: tx * 16, ty: ty * 16 - 6, max: 0.22, color: '#e8dcc0', kind: 'arrow' });
  }

  /** Bursts triggered by simulation events. (x, y) is in tiles. */
  fx(kind: FxKind | 'smoke' | 'spark' | 'butterfly' | 'glint' | 'bird', tx: number, ty: number, icons: { heart: Sprite }): void {
    const x = tx * 16;
    const y = ty * 16;
    const r = Math.random;
    const burst = (n: number, colors: readonly string[], speed: number, gravity: number, max: number, lift = 30) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        this.add({
          x: x + (r() - 0.5) * 6, y: y - 4 + (r() - 0.5) * 4,
          vx: Math.cos(a) * speed * (0.4 + r()), vy: -lift * (0.5 + r()),
          gravity, max: max * (0.7 + r() * 0.6), color: colors[i % colors.length], size: r() < 0.3 ? 2 : 1,
        });
      }
    };
    switch (kind) {
      case 'woodchips':
        return burst(5, [P.wood3, P.wood4, P.wood2], 30, 160, 0.6);
      case 'stonechips':
        return burst(5, [P.stone2, P.stone3, P.stone1], 32, 170, 0.55);
      case 'soil':
        return burst(6, [P.soil0, P.soil2, P.dirt1], 26, 150, 0.5);
      case 'leaves':
        for (let i = 0; i < 10; i++) {
          this.add({
            x: x + (r() - 0.5) * 18, y: y - 18 - r() * 10, vx: (r() - 0.5) * 8, vy: 6 + r() * 8,
            max: 1.6 + r(), color: [P.leaf2, P.leaf3, P.leaf4][i % 3], kind: 'leaf', size: 1,
          });
        }
        return;
      case 'sparkle':
        for (let i = 0; i < 9; i++) {
          this.add({
            x: x + (r() - 0.5) * 16, y: y - r() * 14, vx: (r() - 0.5) * 6, vy: -12 - r() * 14,
            max: 0.9 + r() * 0.5, color: i % 2 ? '#fff6c2' : P.flowerY, size: r() < 0.3 ? 2 : 1,
          });
        }
        return;
      case 'dust':
        for (let i = 0; i < 4; i++) {
          this.add({
            x: x + (r() - 0.5) * 14, y: y - r() * 3, vx: (r() - 0.5) * 16, vy: -4 - r() * 5,
            max: 0.7 + r() * 0.4, color: 'rgba(214, 196, 160, 0.8)', size: 3, kind: 'smoke',
          });
        }
        return;
      case 'splash':
        return burst(7, [P.water3, P.foam, P.water2], 22, 140, 0.5, 34);
      case 'hearts':
        this.add({ x, y: y - 16, vy: -10, max: 1.3, kind: 'icon', icon: icons.heart });
        return;
      case 'smoke':
        this.add({ x: x + (r() - 0.5) * 2, y, vx: 3 + r() * 3, vy: -9 - r() * 4, max: 2.6 + r(), color: 'rgba(220, 220, 225, 0.55)', size: 2, kind: 'smoke' });
        return;
      case 'butterfly': {
        const colors = ['#f4dc5c', '#f0f0f8', '#f09ab8', '#8fc9e0'];
        this.add({ x: x + (r() - 0.5) * 10, y: y - 4, vx: (r() - 0.5) * 10, vy: -3 - r() * 3, max: 3 + r() * 2, color: colors[Math.floor(r() * colors.length)], kind: 'butterfly', size: 1 });
        return;
      }
      case 'glint':
        this.add({ x: x + (r() - 0.5) * 20, y: y - r() * 20, max: 0.5, color: '#fffbe8', size: 1 });
        return;
      case 'bird':
        // A sparrow hopping about for a moment.
        this.add({ x: x + (r() - 0.5) * 16, y, vx: (r() - 0.5) * 14, vy: -12, gravity: 60, max: 0.8, color: '#6a4a32', size: 2 });
        return;
      case 'spark':
        this.add({ x: x + (r() - 0.5) * 5, y, vx: (r() - 0.5) * 8, vy: -18 - r() * 16, max: 0.7 + r() * 0.5, color: r() < 0.5 ? P.fire2 : P.fire1, size: 1 });
        return;
    }
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.gravity * dt;
      if (p.kind === 'leaf') p.vx = Math.sin(p.life * 4 + p.phase) * 10;
      if (p.kind === 'butterfly') {
        p.vx = Math.sin(p.life * 3 + p.phase) * 9;
        p.vy = Math.cos(p.life * 5 + p.phase) * 6 - 1;
      }
      if (p.kind === 'arrow') {
        out.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += dt * 2.2;
      out.push(p);
    }
    this.list = out;
  }

  /** Draws the particles: 'world' ones (drawn with the map), 'text' (floating numbers, drawn at screen resolution), or all. */
  draw(ctx: CanvasRenderingContext2D, scale: number, tx: number, ty: number, which: 'world' | 'text' | 'all' = 'all'): void {
    for (const p of this.list) {
      if (which !== 'all' && (p.kind === 'text') !== (which === 'text')) continue;
      const t = p.life / p.max;
      const sx = Math.round(p.x * scale + tx);
      const sy = Math.round(p.y * scale + ty);
      if (p.kind === 'text' && p.text) {
        ctx.globalAlpha = t > 0.6 ? (1 - t) / 0.4 : 1;
        ctx.font = `700 ${Math.max(10, Math.round(scale * 5))}px "Pixelify Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1a1420';
        ctx.fillText(p.text, sx + 1, sy + 1);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, sx, sy);
        ctx.textAlign = 'start';
        continue;
      }
      if (p.kind === 'arrow' && p.tx !== undefined && p.ty !== undefined) {
        // A short shaft flying along the line, head first.
        const ax = p.x + (p.tx - p.x) * t;
        const ay = p.y + (p.ty - p.y) * t - Math.sin(t * Math.PI) * 6;
        const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#6a4a2a';
        ctx.lineWidth = Math.max(1, scale);
        ctx.beginPath();
        ctx.moveTo(ax * scale + tx - Math.cos(ang) * 6 * scale, ay * scale + ty - Math.sin(ang) * 6 * scale);
        ctx.lineTo(ax * scale + tx, ay * scale + ty);
        ctx.stroke();
        ctx.fillStyle = '#c8ccd0';
        ctx.fillRect(Math.round(ax * scale + tx) - scale, Math.round(ay * scale + ty) - scale, scale * 2, scale * 2);
        continue;
      }
      if (p.kind === 'icon' && p.icon) {
        ctx.globalAlpha = 1 - t * t;
        ctx.drawImage(gpuImage(p.icon.canvas), sx - p.icon.ax * scale, sy - p.icon.ay * scale, p.icon.w * scale, p.icon.h * scale);
        continue;
      }
      if (p.kind === 'butterfly') {
        // Two wings that flap.
        ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
        ctx.fillStyle = p.color;
        const open = Math.floor(p.life * 12 + p.phase) % 2 === 0;
        ctx.fillRect(sx - scale * (open ? 2 : 1), sy, scale, scale);
        ctx.fillRect(sx + scale * (open ? 1 : 0), sy, scale, scale);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(sx, sy, Math.max(1, scale >> 1), scale);
        continue;
      }
      ctx.globalAlpha = p.kind === 'smoke' ? (1 - t) * 0.9 : t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.fillStyle = p.color;
      const s = Math.max(1, Math.round(p.size)) * scale;
      ctx.fillRect(sx - (s >> 1), sy - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }
}
