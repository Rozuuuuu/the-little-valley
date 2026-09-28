import { BUILDINGS } from '../game/data/buildings';
import type { GameController } from '../engine/GameController';

const DRAG_THRESHOLD = 5;

/**
 * Turns raw pointer and keyboard events into controller intents. Coordinates
 * are converted to device pixels to match the renderer.
 */
export class InputController {
  private down: { button: number; sx: number; sy: number; tile: { x: number; y: number }; dragging: boolean } | null = null;
  private panFrom: { sx: number; sy: number; cx: number; cy: number } | null = null;
  private dpr = window.devicePixelRatio || 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: GameController,
  ) {
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('wheel', this.wheel);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
  }

  private pos(e: PointerEvent | WheelEvent): { sx: number; sy: number } {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = this.canvas.width / Math.max(1, r.width);
    return { sx: (e.clientX - r.left) * this.dpr, sy: (e.clientY - r.top) * this.dpr };
  }

  private pointerDown = (e: PointerEvent): void => {
    this.game.audio.unlock();
    const { sx, sy } = this.pos(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      e.preventDefault();
      this.panFrom = { sx, sy, cx: this.game.camera.x, cy: this.game.camera.y };
      return;
    }
    this.down = { button: e.button, sx, sy, tile: this.game.worldTile(sx, sy), dragging: false };
  };

  private pointerMove = (e: PointerEvent): void => {
    const { sx, sy } = this.pos(e);
    const g = this.game;
    g.hoverWorld = g.camera.screenToWorld(sx, sy);
    g.hoverSettler = g.settlerAtScreen(sx, sy);
    if (g.settings.edgePan) {
      const m = 12 * this.dpr;
      g.edge.x = sx < m ? -1 : sx > this.canvas.width - m ? 1 : 0;
      g.edge.y = sy < m ? -1 : sy > this.canvas.height - m ? 1 : 0;
    }
    if (this.panFrom) {
      const s = g.camera.scale;
      g.camera.centerOn(this.panFrom.cx - (sx - this.panFrom.sx) / s, this.panFrom.cy - (sy - this.panFrom.sy) / s);
      return;
    }
    const d = this.down;
    if (d && !d.dragging && Math.hypot(sx - d.sx, sy - d.sy) > DRAG_THRESHOLD * this.dpr) d.dragging = true;
    const mode = g.mode;
    if (mode.kind === 'place') {
      const def = BUILDINGS[mode.building];
      const paintDrag = d && d.button === 0 && (def.paint || def.span) ? d.tile : null;
      g.updatePlacement(sx, sy, paintDrag);
    } else if ((mode.kind === 'mark' || mode.kind === 'unmark' || mode.kind === 'area') && d && d.button === 0) {
      const t = g.worldTile(sx, sy);
      g.areaBox = { x0: d.tile.x, y0: d.tile.y, x1: t.x, y1: t.y, kind: mode.kind === 'area' ? 'area' : mode.kind };
    } else if (mode.kind === 'select' && d && d.button === 0 && d.dragging) {
      g.dragBox = { x0: d.sx, y0: d.sy, x1: sx, y1: sy };
    }
  };

  private pointerUp = (e: PointerEvent): void => {
    const { sx, sy } = this.pos(e);
    const g = this.game;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (this.panFrom && e.button === 1) {
      this.panFrom = null;
      return;
    }
    const d = this.down;
    this.down = null;
    g.dragBox = null;
    if (!d) return;
    const mode = g.mode;
    if (d.button === 2) {
      if (mode.kind !== 'select') g.setMode({ kind: 'select' });
      else if (!d.dragging) g.commandAt(sx, sy);
      return;
    }
    if (d.button !== 0) return;
    if (mode.kind === 'place') {
      g.commitPlacement(d.tile, sx, sy, e.shiftKey);
      return;
    }
    if (mode.kind === 'survey') {
      g.surveyAt(sx, sy);
      return;
    }
    if (mode.kind === 'mark' || mode.kind === 'unmark') {
      g.markArea(d.tile, sx, sy);
      g.areaBox = null;
      return;
    }
    if (mode.kind === 'area') {
      g.commitArea(d.tile, sx, sy);
      g.areaBox = null;
      return;
    }
    if (d.dragging) g.boxSelect(d.sx, d.sy, sx, sy, e.shiftKey);
    else g.clickSelect(sx, sy, e.shiftKey || e.ctrlKey);
  };

  private pointerLeave = (): void => {
    this.game.hoverWorld = null;
    this.game.hoverSettler = null;
    this.game.edge.x = 0;
    this.game.edge.y = 0;
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { sx, sy } = this.pos(e);
    this.game.camera.zoomBy(e.deltaY < 0 ? 1 : -1, sx, sy);
  };

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private keyDown = (e: KeyboardEvent): void => {
    if (this.isTyping(e) || this.game.menuOpen && e.code !== 'Escape') return;
    this.game.audio.unlock();
    const action = this.game.settings.bindings;
    if (action.cancel.includes(e.code)) {
      if (this.game.cancel()) {
        e.preventDefault();
        // Handled here, so the UI does not also open the pause menu.
        e.stopImmediatePropagation();
      }
      return;
    }
    // Build and help keys open React UI; App listens for those.
    if (action.build.includes(e.code) || action.help.includes(e.code)) return;
    if (this.game.keyDown(e.code, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })) e.preventDefault();
  };

  private keyUp = (e: KeyboardEvent): void => {
    this.game.keyUp(e.code);
  };

  private blur = (): void => {
    this.game.clearKeys();
  };
}
