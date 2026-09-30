import { BUILDINGS } from '../game/data/buildings';
import type { GameController } from '../engine/GameController';

/** CSS pixels from a window edge that scroll the map (the mouse free, and held in the game). */
const EDGE_MARGIN = 8;
const EDGE_LOCKED = 3;
const DRAG_THRESHOLD = 5;
/** Touch: CSS pixels a finger may drift and still count as a tap; ms to hold for a box selection. */
const TAP_SLOP = 10;
const LONG_PRESS = 450;
/** Touch: how far apart two fingers must spread (or pinch) to zoom a step. */
const PINCH_STEP = 1.45;

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
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    window.addEventListener('blur', this.windowBlur);
    window.addEventListener('mousemove', this.edgeMove);
    document.addEventListener('mouseout', this.edgeOut);
  }

  /**
   * Edge scrolling as in Warcraft III: the map scrolls while the cursor touches the edge of the
   * screen (over the HUD too), at one fixed speed set in Settings (WC3's "Mouse Scroll"),
   * diagonally in the corners. WC3 relies on the cursor being kept inside the window (players
   * use a ClipCursor tool in windowed mode); here MouseLock does that, so the cursor can rest
   * right on the edge. Without the lock the zone is a little wider, since a browser window's
   * edge is easy to overshoot.
   */
  private edgeMove = (e: MouseEvent): void => {
    const g = this.game;
    // A tap sends the browser's compatibility mouse events too; they must not start edge scrolling.
    if (performance.now() - this.lastTouch < 1000) return this.setEdge(0, 0, 1);
    // The edge is tracked even while paused, so a pointer resting at the edge scrolls again as
    // soon as play resumes; the camera itself holds still while paused (see updateCamera).
    if (!g.settings.edgePan || g.attract) return this.setEdge(0, 0, 1);
    const m = document.body.classList.contains('mouse-locked') ? EDGE_LOCKED : EDGE_MARGIN;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ex = e.clientX < m ? -1 : e.clientX > w - 1 - m ? 1 : 0;
    const ey = e.clientY < m ? -1 : e.clientY > h - 1 - m ? 1 : 0;
    this.setEdge(ex, ey, 1);
  };

  private edgeOut = (e: MouseEvent): void => {
    if (e.relatedTarget) return;
    // The pointer left the window. If it went out through an edge (e.g. into the browser's tab
    // bar or the taskbar), act as if it were pinned there, as a clipped cursor would be: keep
    // scrolling that way until it comes back in or the window loses focus.
    const g = this.game;
    if (!g.settings.edgePan || g.attract || !document.hasFocus()) return this.setEdge(0, 0, 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ex = e.clientX <= EDGE_MARGIN ? -1 : e.clientX >= w - 1 - EDGE_MARGIN ? 1 : 0;
    const ey = e.clientY <= EDGE_MARGIN ? -1 : e.clientY >= h - 1 - EDGE_MARGIN ? 1 : 0;
    this.setEdge(ex, ey, 1);
  };

  private windowBlur = (): void => {
    this.setEdge(0, 0, 1);
  };

  private setEdge(x: number, y: number, strength: number): void {
    const g = this.game;
    g.edge.x = x * strength;
    g.edge.y = y * strength;
    const dir = (y < 0 ? 'n' : y > 0 ? 's' : '') + (x < 0 ? 'w' : x > 0 ? 'e' : '');
    if (document.body.dataset.edge !== dir) document.body.dataset.edge = dir;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointerleave', this.pointerLeave);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('wheel', this.wheel);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('blur', this.windowBlur);
    window.removeEventListener('mousemove', this.edgeMove);
    document.removeEventListener('mouseout', this.edgeOut);
  }

  private pos(e: PointerEvent | WheelEvent): { sx: number; sy: number } {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = this.canvas.width / Math.max(1, r.width);
    return { sx: (e.clientX - r.left) * this.dpr, sy: (e.clientY - r.top) * this.dpr };
  }

  // ---- touch -------------------------------------------------------------------------
  //  One finger drags the map; a tap selects (or, with people selected, gives the smart order a
  //  right-click would); a long press then drag draws a selection box; two fingers pinch to zoom
  //  and pan. In the placing, marking and targeting modes a finger acts as the left button.

  private lastTouch = -Infinity;
  private touches = new Map<number, { sx: number; sy: number }>();
  private gesture:
    | { kind: 'pending' | 'pan' | 'box'; sx: number; sy: number; camX: number; camY: number; timer: number }
    | { kind: 'pinch'; dist: number; mx: number; my: number }
    | null = null;

  private pinchInfo(): { dist: number; mx: number; my: number } {
    const [a, b] = [...this.touches.values()];
    return { dist: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
  }

  private endGesture(): void {
    if (this.gesture && 'timer' in this.gesture) clearTimeout(this.gesture.timer);
    this.gesture = null;
  }

  /** Handles a touch pointer event; false lets it through to the mouse handling (as the left button). */
  private touch(e: PointerEvent, phase: 'down' | 'move' | 'up'): boolean {
    this.lastTouch = performance.now();
    const g = this.game;
    const { sx, sy } = this.pos(e);
    if (phase === 'down') {
      g.audio.unlock();
      this.touches.set(e.pointerId, { sx, sy });
      if (this.touches.size >= 2) {
        // A second finger: pinch and pan, and forget any single-finger gesture.
        this.endGesture();
        this.down = null;
        g.dragBox = null;
        this.gesture = { kind: 'pinch', ...this.pinchInfo() };
        return true;
      }
      if (g.mode.kind !== 'select') return false;
      g.hoverWorld = g.camera.screenToWorld(sx, sy);
      const timer = window.setTimeout(() => {
        const t = this.gesture;
        if (!t || t.kind !== 'pending') return;
        // Held still: draw a selection box from here with the mouse code.
        this.gesture = { ...t, kind: 'box' };
        this.down = { button: 0, sx: t.sx, sy: t.sy, tile: g.worldTile(t.sx, t.sy), dragging: false };
        g.audio.play('select');
      }, LONG_PRESS);
      this.gesture = { kind: 'pending', sx, sy, camX: g.camera.x, camY: g.camera.y, timer };
      return true;
    }
    const t = this.gesture;
    if (phase === 'move') {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { sx, sy });
      if (t?.kind === 'pinch') {
        if (this.touches.size < 2) return true;
        const now = this.pinchInfo();
        g.camera.pan(-(now.mx - t.mx) / g.camera.scale, -(now.my - t.my) / g.camera.scale);
        t.mx = now.mx;
        t.my = now.my;
        if (now.dist > t.dist * PINCH_STEP || now.dist < t.dist / PINCH_STEP) {
          g.camera.zoomBy(now.dist > t.dist ? 1 : -1, now.mx, now.my);
          t.dist = now.dist;
        }
        return true;
      }
      if (!t) return false;
      if (t.kind === 'box') return false;
      if (t.kind === 'pending' && Math.hypot(sx - t.sx, sy - t.sy) > TAP_SLOP * this.dpr) {
        clearTimeout(t.timer);
        t.kind = 'pan';
      }
      if (t.kind === 'pan') g.camera.centerOn(t.camX - (sx - t.sx) / g.camera.scale, t.camY - (sy - t.sy) / g.camera.scale);
      return true;
    }
    // up
    this.touches.delete(e.pointerId);
    if (t?.kind === 'pinch') {
      if (this.touches.size === 0) this.gesture = null;
      return true;
    }
    if (!t) return false;
    this.endGesture();
    if (t.kind === 'box') return false;
    if (t.kind === 'pending') this.tap(sx, sy);
    return true;
  }

  /** The browser took a pointer away (a system gesture, say): drop whatever it was doing. */
  private pointerCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    if (this.touches.size === 0) this.endGesture();
    this.down = null;
    this.panFrom = null;
    this.game.dragBox = null;
    this.game.areaBox = null;
  };

  /** A tap in select mode: select what is there, or order the selected people to it. */
  private tap(sx: number, sy: number): void {
    const g = this.game;
    g.hoverWorld = g.camera.screenToWorld(sx, sy);
    if (g.selected.size && g.settlerAtScreen(sx, sy) === null && !g.adviceAt(sx, sy)) g.commandAt(sx, sy);
    else g.clickSelect(sx, sy, false);
  }

  private pointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touch(e, 'down')) return;
    this.game.audio.unlock();
    const { sx, sy } = this.pos(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // While the mouse is locked to the game, presses are replayed (see MouseLock), which
      // keeps them on the canvas itself.
    }
    if (e.button === 1) {
      e.preventDefault();
      this.panFrom = { sx, sy, cx: this.game.camera.x, cy: this.game.camera.y };
      return;
    }
    this.down = { button: e.button, sx, sy, tile: this.game.worldTile(sx, sy), dragging: false };
  };

  private pointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touch(e, 'move')) return;
    const { sx, sy } = this.pos(e);
    const g = this.game;
    g.hoverWorld = g.camera.screenToWorld(sx, sy);
    g.hoverSettler = g.settlerAtScreen(sx, sy);
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
    if (e.pointerType === 'touch' && this.touch(e, 'up')) return;
    const { sx, sy } = this.pos(e);
    const g = this.game;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // See pointerDown.
    }
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
    if (mode.kind === 'order') {
      g.orderAt(sx, sy, e.shiftKey);
      return;
    }
    if (mode.kind === 'survey') {
      g.surveyAt(sx, sy);
      return;
    }
    if (mode.kind === 'claim') {
      g.claimAt(sx, sy);
      return;
    }
    if (mode.kind === 'march') {
      g.marchAt(sx, sy);
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
    // Edge scrolling is decided by the whole window (edgeMove/edgeOut), not by the map canvas:
    // moving onto the HUD at the screen edge must keep scrolling.
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
