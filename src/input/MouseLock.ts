/**
 * Keeps the mouse inside the game while it runs, the way Warcraft III does: the real
 * pointer is locked (Pointer Lock API) and a pixel cursor drawn by us moves instead,
 * stopping at the window's edges — so edge scrolling works on all four sides even in a
 * browser window, where the real mouse would slip off the top or bottom.
 *
 * While locked, every real mouse event is swallowed and replayed as a synthetic one at the
 * cursor's position on whatever is under it, so the map, the HUD, tooltips and buttons all
 * behave as usual. When the game is paused or a menu opens the lock is let go and the real
 * mouse is free; pressing Esc (the browser releases the lock) pauses the game.
 */

const SYNTHETIC = '__lvSynthetic';
type Marked = Event & { [SYNTHETIC]?: boolean };

export interface MouseLockHost {
  /** Whether the mouse should be held right now (in play, not paused, no menu open, setting on). */
  wanted(): boolean;
  /** The browser let go of the lock while it was wanted (Esc, or the window lost focus). */
  releasedByUser(): void;
}

export class MouseLock {
  x = 0;
  y = 0;
  private locked = false;
  private leaving = false;
  private hover: Element | null = null;
  private hoverButton: Element | null = null;
  private pressed: Element | null = null;
  private buttons = 0;
  private clicking = false;
  private moved = false;
  private frames = 0;
  private readonly cursor: HTMLDivElement;
  private raf = 0;

  constructor(private readonly host: MouseLockHost) {
    this.cursor = document.createElement('div');
    this.cursor.className = 'soft-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.cursor);
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    // Registered first and in the capture phase, so real events can be swallowed before anyone sees them.
    for (const type of ['mousemove', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'pointermove', 'pointerdown', 'pointerup', 'pointerover', 'pointerout', 'mouseover', 'mouseout', 'auxclick']) {
      window.addEventListener(type, this.onReal, { capture: true, passive: false });
    }
    window.addEventListener('keydown', this.onKey, true);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    this.raf = requestAnimationFrame(this.frame);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.release();
    this.cursor.remove();
  }

  /** Asks for the lock (must be called while handling a click or key press). */
  request(): void {
    if (this.locked || !this.host.wanted() || document.pointerLockElement) return;
    try {
      const p = document.documentElement.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      // Not allowed right now (no user gesture, or just released): the next click tries again.
    }
  }

  release(): void {
    if (!document.pointerLockElement) return;
    this.leaving = true;
    document.exitPointerLock();
  }

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.locked) return;
    this.flushMove();
    // Checked ten times a second, soon enough to free the mouse as play pauses.
    if (++this.frames % 6 === 0 && !this.host.wanted()) this.release();
  };

  private flushMove(): void {
    if (!this.moved) return;
    this.moved = false;
    this.place();
    this.emitMove();
  }

  private onLockChange = (): void => {
    const now = document.pointerLockElement === document.documentElement;
    if (now === this.locked) return;
    this.locked = now;
    document.body.classList.toggle('mouse-locked', now);
    if (now) {
      this.place();
      this.emitMove();
    } else {
      this.setHover(null);
      if (!this.leaving && this.host.wanted()) this.host.releasedByUser();
    }
    this.leaving = false;
  };

  private onLockError = (): void => {
    this.locked = false;
    document.body.classList.remove('mouse-locked');
  };

  private onKey = (e: KeyboardEvent): void => {
    // A key press is a user gesture: take the lock when play resumes by keyboard (not on Esc).
    if (!this.locked && e.code !== 'Escape') queueMicrotask(() => this.request());
  };

  private onReal = (e: Event): void => {
    if ((e as Marked)[SYNTHETIC] || this.clicking) return;
    if (!this.locked) {
      if (e.type === 'mousemove') {
        const m = e as MouseEvent;
        this.x = m.clientX;
        this.y = m.clientY;
      }
      // Clicking into the game takes the lock; the click itself still happens normally.
      if (e.type === 'mousedown') queueMicrotask(() => this.request());
      return;
    }
    e.stopImmediatePropagation();
    if (e.cancelable && e.type !== 'wheel') e.preventDefault();
    const m = e as MouseEvent;
    switch (e.type) {
      case 'mousemove':
        // Gaming mice report up to 1000 moves a second: add them up and pass one move on per
        // frame (see frame), instead of hit-testing the page on every one.
        this.x = Math.max(0, Math.min(window.innerWidth - 1, this.x + m.movementX));
        this.y = Math.max(0, Math.min(window.innerHeight - 1, this.y + m.movementY));
        this.moved = true;
        break;
      case 'mousedown':
        this.flushMove();
        this.buttons = m.buttons;
        this.emitButton('down', m);
        break;
      case 'mouseup':
        this.flushMove();
        this.buttons = m.buttons;
        this.emitButton('up', m);
        break;
      case 'wheel':
        e.preventDefault();
        this.emitWheel(e as WheelEvent);
        break;
      default:
        break;
    }
  };

  private place(): void {
    this.cursor.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(this.y)}px)`;
  }

  private target(): Element {
    return document.elementFromPoint(this.x, this.y) ?? document.body;
  }

  private init(m?: MouseEvent, extra: MouseEventInit = {}): PointerEventInit {
    return {
      bubbles: true, cancelable: true, composed: true, view: window, clientX: this.x, clientY: this.y, screenX: this.x, screenY: this.y,
      button: m?.button ?? 0, buttons: this.buttons, shiftKey: m?.shiftKey ?? false, ctrlKey: m?.ctrlKey ?? false, altKey: m?.altKey ?? false, metaKey: m?.metaKey ?? false,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra,
    };
  }

  private fire(el: Element, type: string, init: PointerEventInit, Ctor: typeof MouseEvent | typeof PointerEvent = MouseEvent): boolean {
    const ev = new Ctor(type, init) as Marked;
    ev[SYNTHETIC] = true;
    return el.dispatchEvent(ev);
  }

  private setHover(el: Element | null): void {
    if (el === this.hover) return;
    const old = this.hover;
    if (old) {
      this.fire(old, 'pointerout', this.init(undefined, { relatedTarget: el }), PointerEvent);
      this.fire(old, 'mouseout', this.init(undefined, { relatedTarget: el }));
      // Leaving the map canvas (which listens for pointerleave) for the HUD, or vice versa.
      if (!el || !old.contains(el)) this.fire(old, 'pointerleave', this.init(undefined, { relatedTarget: el, bubbles: false }), PointerEvent);
    }
    this.hover = el;
    if (el) {
      this.fire(el, 'pointerover', this.init(undefined, { relatedTarget: old }), PointerEvent);
      this.fire(el, 'mouseover', this.init(undefined, { relatedTarget: old }));
    }
    // Stand-in for :hover on buttons.
    const btn = el?.closest('button, .btn, .card-btn, .win-btn, a, label, [role="option"]') ?? null;
    if (btn !== this.hoverButton) {
      this.hoverButton?.classList.remove('lv-hover');
      btn?.classList.add('lv-hover');
      this.hoverButton = btn;
    }
  }

  private emitMove(): void {
    const el = this.target();
    this.setHover(el);
    // While a button is held, moves go to where the press began (like pointer capture), so
    // dragging a box on the map keeps working over the HUD.
    const to = this.pressed && this.buttons ? this.pressed : el;
    this.fire(to, 'pointermove', this.init(), PointerEvent);
    this.fire(to, 'mousemove', this.init());
  }

  private emitButton(kind: 'down' | 'up', m: MouseEvent): void {
    const el = this.target();
    if (kind === 'down') {
      this.pressed = el;
      this.fire(el, 'pointerdown', this.init(m), PointerEvent);
      this.fire(el, 'mousedown', this.init(m));
      // Focus follows the click, as with a real mouse.
      const focusable = el.closest('input, textarea, select, button, [tabindex]') as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;
      if (focusable) focusable.focus({ preventScroll: true });
      else if (active && active !== document.body) active.blur();
      return;
    }
    const from = this.pressed ?? el;
    this.pressed = null;
    this.fire(from, 'pointerup', this.init(m), PointerEvent);
    this.fire(from, 'mouseup', this.init(m));
    if (m.button === 0 && (from === el || from.contains(el) || el.contains(from))) {
      // A real click (so buttons, check boxes and links do what they do). It isn't marked, so
      // let it through our own filter while it runs.
      this.clicking = true;
      try {
        (el as HTMLElement).click?.();
      } finally {
        this.clicking = false;
      }
    } else if (m.button === 2) this.fire(el, 'contextmenu', this.init(m));
  }

  private emitWheel(w: WheelEvent): void {
    const el = this.target();
    const ev = new WheelEvent('wheel', { ...this.init(), deltaX: w.deltaX, deltaY: w.deltaY, deltaMode: w.deltaMode }) as Marked;
    ev[SYNTHETIC] = true;
    const unhandled = el.dispatchEvent(ev);
    if (!unhandled) return;
    // Scroll the nearest scrolling box by hand (a synthetic wheel doesn't scroll anything).
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) {
        n.scrollTop += w.deltaMode === 1 ? w.deltaY * 16 : w.deltaY;
        return;
      }
    }
  }

  /** For automated checks: move the soft cursor and press as if the mouse had. */
  feed(dx: number, dy: number, press?: { button: number; up?: boolean }): void {
    if (!this.locked) return;
    this.x = Math.max(0, Math.min(window.innerWidth - 1, this.x + dx));
    this.y = Math.max(0, Math.min(window.innerHeight - 1, this.y + dy));
    this.place();
    this.emitMove();
    if (press) {
      const m = new MouseEvent(press.up ? 'mouseup' : 'mousedown', { button: press.button });
      this.buttons = press.up ? 0 : 1 << press.button;
      this.emitButton(press.up ? 'up' : 'down', m);
    }
  }
}
