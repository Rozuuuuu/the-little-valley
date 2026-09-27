/**
 * Camera in device pixels. `scale` is device pixels per art pixel; it rests on
 * whole numbers so pixel art stays crisp, and eases between them while zooming.
 * Position is a float in world pixels, so panning is smooth.
 */
export const ZOOM_LEVELS = [2, 3, 4, 5, 6, 8];

export class Camera {
  x = 8;
  y = 8;
  scale = 3;
  target = 3;
  width = 1;
  height = 1;
  private anchor: { sx: number; sy: number; wx: number; wy: number } | null = null;

  setViewport(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  /** Picks the default zoom for the display density. */
  defaultScale(dpr: number): number {
    const want = 3 * dpr;
    return ZOOM_LEVELS.reduce((best, z) => (Math.abs(z - want) < Math.abs(best - want) ? z : best), ZOOM_LEVELS[0]);
  }

  get tx(): number {
    return Math.round(this.width / 2 - this.x * this.scale);
  }
  get ty(): number {
    return Math.round(this.height / 2 - this.y * this.scale);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.tx) / this.scale, y: (sy - this.ty) / this.scale };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.scale + this.tx, y: wy * this.scale + this.ty };
  }

  zoomBy(steps: number, sx = this.width / 2, sy = this.height / 2): void {
    let i = ZOOM_LEVELS.indexOf(this.target);
    if (i < 0) i = 1;
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + steps))];
    if (next === this.target) return;
    const w = this.screenToWorld(sx, sy);
    this.anchor = { sx, sy, wx: w.x, wy: w.y };
    this.target = next;
  }

  setZoom(level: number): void {
    const z = ZOOM_LEVELS.includes(level) ? level : this.target;
    this.target = z;
    this.scale = z;
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.anchor = null;
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.anchor = null;
  }

  update(dt: number): void {
    if (this.scale !== this.target) {
      const k = Math.min(1, dt * 14);
      this.scale += (this.target - this.scale) * k;
      if (Math.abs(this.scale - this.target) < 0.02) this.scale = this.target;
      if (this.anchor) {
        this.x = this.anchor.wx - (this.anchor.sx - this.width / 2) / this.scale;
        this.y = this.anchor.wy - (this.anchor.sy - this.height / 2) / this.scale;
      }
    } else {
      this.anchor = null;
    }
  }
}
