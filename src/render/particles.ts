import type { FxKind } from '../game/sim/types';
import { P } from './palette';
import type { Sprite } from './pixel';

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
  kind: 'px' | 'smoke' | 'icon' | 'leaf';
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

  /** Bursts triggered by simulation events. (x, y) is in tiles. */
  fx(kind: FxKind | 'smoke' | 'spark', tx: number, ty: number, icons: { heart: Sprite }): void {
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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += dt * 2.2;
      out.push(p);
    }
    this.list = out;
  }

  draw(ctx: CanvasRenderingContext2D, scale: number, tx: number, ty: number): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      const sx = Math.round(p.x * scale + tx);
      const sy = Math.round(p.y * scale + ty);
      if (p.kind === 'icon' && p.icon) {
        ctx.globalAlpha = 1 - t * t;
        ctx.drawImage(p.icon.canvas, sx - p.icon.ax * scale, sy - p.icon.ay * scale, p.icon.w * scale, p.icon.h * scale);
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
