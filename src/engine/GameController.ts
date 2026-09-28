import { regionalInfo } from './snapshot';
import { gameTime, growthInfo } from './growthInfo';
import { logisticsInfo } from './tradeInfo';
import { diplomacyInfo, kingdomInfo, newsInfo, warCouncilInfo, warInfo } from './kingdomSnapshot';
import { armyInfo } from './militaryInfo';
import { sectorOf } from '../game/sim/territory';
import { AudioEngine, type SoundName } from '../audio/AudioEngine';
import { TICK_MS, TILE } from '../game/core/constants';
import { BUILDINGS, type BuildingId } from '../game/data/buildings';
import type { CropId } from '../game/data/crops';
import type { JobId } from '../game/data/jobs';
import type { RecipeId } from '../game/data/recipes';
import type { SaveManager } from '../game/save/SaveManager';
import { MILESTONES, type MilestoneId } from '../game/data/progression';
import { campOf, checkPlacement, checkSpan, materialsComplete } from '../game/sim/buildings';
import type { AreaKind, SessionMark } from '../game/sim/types';
import type { WorkKind } from '../game/data/jobs';
import type { Minimap } from '../render/Minimap';
import { buildOverview, suggestCrossing, type Overview, type Target } from './overview';
import { applyCommand, type Command } from '../game/sim/commands';
import type { Simulation } from '../game/sim/Simulation';
import type { CommandResult, SimEvent } from '../game/sim/types';
import { OBJECTS } from '../game/world/tiles';
import { actionFor, type Action } from '../input/bindings';
import type { Camera } from '../render/Camera';
import type { Marker, PlacementPreview, Renderer, RenderState } from '../render/Renderer';
import { saveSettings, type Settings } from './settings';
import {
  areaInfo, buildingInfo, celebrationInfo, clockOf, emptySnapshot, hoverText, housingOf, milestoneInfo, settlerInfo, unlockedSets,
  type Mode, type Toast, type UiSnapshot,
} from './snapshot';
import { Store } from './store';
import { bedSummary } from '../game/sim/population';
import { TUTORIAL, TUTORIAL_OUTRO } from './tutorial';

export interface SessionInfo {
  slot: string;
  name: string;
  createdAt: number;
}

export const SPEEDS = [1, 2, 4];
const UI_INTERVAL = 250;
const IMPORTANT_SAVE_DELAY = 6000;
const MIN_SAVE_GAP = 20000;

/**
 * Owns the running game: the fixed-step loop, input intents, commands, audio
 * cues, autosave and the UI snapshot. React talks to the game only through
 * this class.
 */
export class GameController {
  readonly ui = new Store<UiSnapshot>(emptySnapshot());
  sim!: Simulation;
  session!: SessionInfo;
  mode: Mode = { kind: 'select' };
  paused = false;
  speed = 1;
  selected = new Set<number>();
  selectedBuildings = new Set<number>();
  markers: Marker[] = [];
  placement: PlacementPreview | null = null;
  dragBox: RenderState['dragBox'] = null;
  areaBox: RenderState['areaBox'] = null;
  hoverWorld: { x: number; y: number } | null = null;
  hoverSettler: number | null = null;
  tutorial: { step: number; done: boolean } = { step: 0, done: true };
  private tutorialSaved = false;
  private tutorialOutroUntil = 0;
  private toasts: Toast[] = [];
  private toastId = 1;
  private acc = 0;
  private lastFrame = 0;
  private lastUi = 0;
  private raf = 0;
  private running = false;
  private pressed = new Set<Action>();
  private lastSaveAt = 0;
  private lastSaveTick = -1;
  private pendingImportant = 0;
  private saving = false;
  private saveStatus = '';
  private idleCursor = 0;
  /** Set by the app to show menus; pausing while a menu is open. */
  menuOpen = false;
  /** Title-screen mode: the valley plays itself behind the menu. */
  attract = false;
  onFatal?: (e: unknown) => void;
  selectedArea: number | null = null;
  /** Set while the Areas tab is showing, so every area is drawn clearly. */
  areasTabOpen = false;
  highlight: RenderState['highlight'] = null;
  overview: Overview | null = null;
  overviewOpen = false;
  celebration: MilestoneId | null = null;
  private pendingOverview: { previous: SessionMark | null; at: number } | null = null;
  minimap: Minimap | null = null;
  private lastMinimap = 0;
  private findCursor: Record<string, number> = {};

  constructor(
    readonly renderer: Renderer,
    readonly camera: Camera,
    readonly audio: AudioEngine,
    readonly saves: SaveManager,
    public settings: Settings,
  ) {}

  // ---- lifecycle ------------------------------------------------------------

  start(
    sim: Simulation,
    session: SessionInfo,
    opts: { tutorial: boolean; tutorialState?: { step: number; done: boolean }; view?: { camX: number; camY: number; zoom: number }; overview?: boolean },
  ): void {
    this.sim = sim;
    this.session = session;
    this.selected.clear();
    this.selectedBuildings.clear();
    this.selectedArea = null;
    this.highlight = null;
    this.celebration = null;
    // Summarise the previous session before this one starts overwriting the mark.
    // Settlers pick their work during the first second, so issues are gathered a moment later.
    const previous = sim.session;
    this.overview = null;
    this.overviewOpen = false;
    this.pendingOverview = opts.overview ? { previous, at: sim.tick + 12 } : null;
    if (!this.attract) sim.startSession();
    this.mode = { kind: 'select' };
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.toasts = [];
    this.tutorial = opts.tutorialState ?? { step: 0, done: !opts.tutorial };
    this.tutorialSaved = false;
    this.lastSaveTick = sim.tick;
    this.lastSaveAt = performance.now();
    this.renderer.clearCaches();
    const dpr = window.devicePixelRatio || 1;
    if (opts.view) {
      this.camera.centerOn(opts.view.camX, opts.view.camY);
      this.camera.setZoom(opts.view.zoom);
    } else {
      this.camera.centerOn(8, 16);
      this.camera.setZoom(this.camera.defaultScale(dpr));
    }
    this.renderer.prewarm(sim);
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.publish(true);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ui.set({ ...emptySnapshot() });
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    try {
      this.tickFrame(now);
    } catch (e) {
      this.running = false;
      this.onFatal?.(e);
    }
  };

  private tickFrame(now: number): void {
    const dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const halted = this.paused || this.menuOpen || this.celebration !== null;
    if (!halted) {
      this.acc += dt * 1000 * this.speed;
      let steps = 0;
      const maxSteps = 8 * this.speed;
      while (this.acc >= TICK_MS && steps < maxSteps) {
        this.sim.step();
        this.acc -= TICK_MS;
        steps++;
      }
      if (steps >= maxSteps) this.acc = 0;
      this.handleEvents(this.sim.drainEvents());
    }
    if (this.pendingOverview && this.sim.tick >= this.pendingOverview.at) {
      this.overview = buildOverview(this.sim, this.pendingOverview.previous);
      this.overviewOpen = true;
      this.pendingOverview = null;
      this.publish(true);
    }
    this.updateCamera(dt);
    this.audio.setMood(this.sim.isNight(), this.sim.weather.raining);
    this.markers = this.markers.filter((m) => now / 1000 - m.t0 < 0.7);
    this.renderer.render({
      sim: this.sim,
      alpha: halted ? 1 : Math.min(1, this.acc / TICK_MS),
      time: now / 1000,
      selected: this.selected,
      selectedBuildings: this.selectedBuildings,
      hoverSettler: this.hoverSettler,
      hoverTile: this.hoverWorld ? { x: Math.floor(this.hoverWorld.x / TILE), y: Math.floor(this.hoverWorld.y / TILE) } : null,
      placement: this.placement,
      dragBox: this.dragBox,
      areaBox: this.areaBox,
      markers: this.markers,
      showBuildHover: this.mode.kind !== 'select',
      showMarks: !this.attract,
      claimMode: this.mode.kind === 'claim',
      selectedArea: this.selectedArea,
      areaMode: this.mode.kind === 'area' || this.areasTabOpen,
      highlight: this.highlight,
      showGrid: this.settings.showGrid,
    });
    this.renderer.healthBars = this.settings.healthBars;
    if (this.minimap && !this.attract && now - this.lastMinimap > 200) {
      this.lastMinimap = now;
      this.minimap.draw(this.sim, this.camera, now / 1000, this.highlight && now / 1000 - this.highlight.t0 < 2.6 ? this.highlight : null);
    }
    this.autosaveCheck(now);
    if (now - this.lastUi > UI_INTERVAL) this.publish();
  }

  private updateCamera(dt: number): void {
    const cam = this.camera;
    const speed = (520 * dt * (window.devicePixelRatio || 1)) / cam.scale;
    let dx = 0;
    let dy = 0;
    if (this.pressed.has('panLeft')) dx -= 1;
    if (this.pressed.has('panRight')) dx += 1;
    if (this.pressed.has('panUp')) dy -= 1;
    if (this.pressed.has('panDown')) dy += 1;
    if (this.edge.x || this.edge.y) {
      dx += this.edge.x * this.settings.edgeSpeed;
      dy += this.edge.y * this.settings.edgeSpeed;
    }
    if (this.attract) {
      dx = 0.05;
      dy = 0.02;
    }
    if (dx || dy) cam.pan(dx * speed, dy * speed);
    cam.update(dt);
  }

  edge = { x: 0, y: 0 };

  // ---- events -----------------------------------------------------------------

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'toast':
          if (!this.attract) this.toast(e.text, e.level);
          break;
        case 'sfx':
          if (!this.attract) this.sfxAt(e.name, e.x, e.y);
          break;
        case 'fx':
          this.renderer.particles.fx(e.kind, e.x, e.y, this.renderer.sprites.ui);
          break;
        case 'hit':
          if (e.reach > 2.5 && e.fromX !== undefined && e.fromY !== undefined) this.renderer.particles.arrow(e.fromX, e.fromY, e.x, e.y);
          this.renderer.particles.floatText(e.x, e.y, `-${e.amount}`, e.target === 'settler' ? '#ff7b6b' : '#ffe08a');
          this.renderer.particles.fx('dust', e.x, e.y, this.renderer.sprites.ui);
          break;
        case 'important':
          this.pendingImportant ||= performance.now();
          break;
        case 'milestone':
          if (!this.attract && MILESTONES[e.id].tier >= 2) {
            // A short, quiet celebration: bunting sparkles around the camp and a card with what's next.
            this.celebration = e.id;
            const camp = campOf(this.sim);
            if (camp) for (let i = 0; i < 6; i++) this.renderer.particles.fx('sparkle', camp.x + Math.random() * 3, camp.y + Math.random() * 2, this.renderer.sprites.ui);
          }
          break;
        default:
          break;
      }
    }
  }

  private sfxAt(name: SoundName, x?: number, y?: number): void {
    if (x === undefined || y === undefined) return this.audio.play(name);
    const dx = x * TILE - this.camera.x;
    const dy = y * TILE - this.camera.y;
    const view = Math.max(this.camera.width, this.camera.height) / this.camera.scale;
    const d = Math.hypot(dx, dy) / view;
    this.audio.play(name, Math.max(0, 1 - d * 1.1), Math.max(-0.8, Math.min(0.8, dx / (view / 2))));
  }

  toast(text: string, level: Toast['level'] = 'info'): void {
    this.toasts.push({ id: this.toastId++, text, level, at: performance.now() });
    if (this.toasts.length > 5) this.toasts.shift();
    this.publish(true);
  }

  play(name: SoundName): void {
    this.audio.play(name);
  }

  // ---- commands ---------------------------------------------------------------

  dispatch(cmd: Command, quiet = false): CommandResult {
    const res = applyCommand(this.sim, cmd);
    if (!res.ok) {
      this.audio.play('error');
      if (res.message) this.toast(res.message, 'bad');
    } else if (res.message && !quiet) this.toast(res.message, 'info');
    this.handleEvents(this.sim.drainEvents());
    this.publish(true);
    return res;
  }

  private marker(x: number, y: number, kind: Marker['kind']): void {
    this.markers.push({ x, y, kind, t0: performance.now() / 1000 });
  }

  setSpeed(i: number): void {
    this.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i))];
    this.paused = false;
    this.audio.play('ui');
    this.publish(true);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.audio.play(this.paused ? 'uiClose' : 'uiOpen');
    this.publish(true);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.placement = null;
    this.areaBox = null;
    if (mode.kind !== 'select') this.selectedBuildings.clear();
    this.audio.play(mode.kind === 'select' ? 'uiClose' : 'uiOpen');
    this.publish(true);
  }

  // ---- selection & orders -------------------------------------------------

  settlerAtScreen(sx: number, sy: number): number | null {
    const w = this.camera.screenToWorld(sx, sy);
    let best: number | null = null;
    let bestD = 11;
    for (const s of this.sim.settlers) {
      if (s.hidden) continue;
      const x = s.x * TILE;
      const y = s.y * TILE - 7;
      const d = Math.hypot(x - w.x, (y - w.y) * 0.8);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  worldTile(sx: number, sy: number): { x: number; y: number } {
    const w = this.camera.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  clickSelect(sx: number, sy: number, additive: boolean): void {
    const id = this.settlerAtScreen(sx, sy);
    if (!additive) {
      this.selected.clear();
      this.selectedBuildings.clear();
    }
    if (id !== null) {
      if (additive && this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      this.selectedBuildings.clear();
      this.audio.play('select');
    } else {
      const t = this.worldTile(sx, sy);
      const b = this.sim.buildingAt(t.x, t.y);
      if (b) {
        this.selected.clear();
        if (additive && this.selectedBuildings.has(b.id)) this.selectedBuildings.delete(b.id);
        else {
          // Fields can be multi-selected to set crops together.
          const first = [...this.selectedBuildings].map((i) => this.sim.buildings.get(i)).find(Boolean);
          if (!additive || (first && first.type !== b.type)) this.selectedBuildings.clear();
          this.selectedBuildings.add(b.id);
        }
        this.audio.play('select');
      }
    }
    this.publish(true);
  }

  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const a = this.camera.screenToWorld(Math.min(x0, x1), Math.min(y0, y1));
    const b = this.camera.screenToWorld(Math.max(x0, x1), Math.max(y0, y1));
    if (!additive) {
      this.selected.clear();
      this.selectedBuildings.clear();
    }
    for (const s of this.sim.settlers) {
      if (s.hidden) continue;
      const x = s.x * TILE;
      const y = s.y * TILE - 6;
      if (x >= a.x && x <= b.x && y >= a.y && y <= b.y) this.selected.add(s.id);
    }
    if (this.selected.size === 0) {
      // No settlers in the box: select the fields inside it instead.
      for (const bd of this.sim.buildings.values()) {
        if (!bd.field) continue;
        const cx = (bd.x + 0.5) * TILE;
        const cy = (bd.y + 0.5) * TILE;
        if (cx >= a.x && cx <= b.x && cy >= a.y && cy <= b.y) this.selectedBuildings.add(bd.id);
      }
    }
    if (this.selected.size || this.selectedBuildings.size) this.audio.play('select');
    this.publish(true);
  }

  selectSettlers(ids: number[], focus = false): void {
    this.selected = new Set(ids);
    this.selectedBuildings.clear();
    if (focus && ids.length) {
      const s = this.sim.settler(ids[0]);
      if (s) this.camera.centerOn(s.x * TILE, s.y * TILE);
    }
    this.audio.play('select');
    this.publish(true);
  }

  selectAll(): void {
    this.selectSettlers(this.sim.settlers.map((s) => s.id));
  }

  nextIdle(): void {
    const idle = this.sim.settlers.filter((s) => (!s.task || s.task.kind === 'wander') && s.idleReason);
    const list = idle.length ? idle : this.sim.settlers;
    if (!list.length) return;
    this.idleCursor = (this.idleCursor + 1) % list.length;
    this.selectSettlers([list[this.idleCursor].id], true);
  }

  /** Right-click: the contextual order for whatever is under the cursor. */
  commandAt(sx: number, sy: number): void {
    const t = this.worldTile(sx, sy);
    const ids = [...this.selected];
    if (ids.length === 0) {
      this.clickSelect(sx, sy, false);
      return;
    }
    const b = this.sim.buildingAt(t.x, t.y);
    let res: CommandResult;
    if (b) {
      res = this.dispatch({ type: 'work', ids, buildingId: b.id });
      if (res.ok) this.marker(t.x, t.y, 'work');
    } else if (OBJECTS[this.sim.world.obj(t.x, t.y)].resource && this.sim.world.amount(t.x, t.y) > 0) {
      res = this.dispatch({ type: 'gather', ids, x: t.x, y: t.y });
      if (res.ok) this.marker(t.x, t.y, 'work');
    } else {
      res = this.dispatch({ type: 'move', ids, x: t.x, y: t.y });
      if (res.ok) this.marker(t.x, t.y, 'move');
    }
    if (!res.ok) this.marker(t.x, t.y, 'bad');
    else this.audio.play('command');
  }

  // ---- building placement --------------------------------------------------

  updatePlacement(sx: number, sy: number, dragFrom: { x: number; y: number } | null): void {
    if (this.mode.kind !== 'place') {
      this.placement = null;
      return;
    }
    const type = this.mode.building;
    const def = BUILDINGS[type];
    const t = this.worldTile(sx, sy);
    if (def.span) {
      // Stone bridge: drag from bank to bank; the preview explains any problem before release.
      const from = dragFrom ?? t;
      const c = checkSpan(this.sim, type, from.x, from.y, t.x, t.y);
      this.placement = { type, x: c.rect.x, y: c.rect.y, tiles: c.tiles, ok: c.ok };
      this.placementReason = dragFrom ? c.reason ?? null : 'Press on the first water tile by the bank and drag across to the far side';
      return;
    }
    if (def.paint && dragFrom) {
      const x0 = Math.min(dragFrom.x, t.x);
      const x1 = Math.max(dragFrom.x, t.x);
      const y0 = Math.min(dragFrom.y, t.y);
      const y1 = Math.max(dragFrom.y, t.y);
      const tiles: PlacementPreview['tiles'] = [];
      let ok = false;
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 1600) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const c = checkPlacement(this.sim, type, x, y);
          tiles.push({ x, y, ok: c.ok });
          ok ||= c.ok;
        }
      }
      this.placement = { type, x: x0, y: y0, tiles, ok };
      return;
    }
    // Centre multi-tile buildings on the cursor.
    const ax = t.x - Math.floor((def.size.w - 1) / 2);
    const ay = t.y - Math.floor((def.size.h - 1) / 2);
    const c = checkPlacement(this.sim, type, ax, ay);
    this.placement = { type, x: ax, y: ay, tiles: c.tiles, ok: c.ok };
    this.placementReason = c.reason ?? null;
  }

  placementReason: string | null = null;

  commitPlacement(from: { x: number; y: number } | null, sx: number, sy: number, keepMode: boolean): void {
    if (this.mode.kind !== 'place') return;
    const type = this.mode.building;
    const crop = this.mode.crop;
    const def = BUILDINGS[type];
    let res: CommandResult;
    if (def.span) {
      const t = this.worldTile(sx, sy);
      const f = from ?? t;
      res = this.dispatch({ type: 'placeSpan', building: type, x0: f.x, y0: f.y, x1: t.x, y1: t.y });
      if (res.ok) {
        this.setMode({ kind: 'select' });
        if (res.id) this.selectedBuildings = new Set([res.id]);
      }
      this.updatePlacement(sx, sy, null);
      return;
    }
    if (def.paint) {
      const t = this.worldTile(sx, sy);
      const f = from ?? t;
      res = this.dispatch({ type: 'placeArea', building: type, x0: f.x, y0: f.y, x1: t.x, y1: t.y, crop: type === 'field' ? crop : undefined });
    } else {
      this.updatePlacement(sx, sy, null);
      const p = this.placement;
      if (!p) return;
      res = this.dispatch({ type: 'place', building: type, x: p.x, y: p.y });
    }
    if (res.ok && !keepMode && !def.paint) this.setMode({ kind: 'select' });
    this.updatePlacement(sx, sy, null);
  }

  /** March mode: send a company to the clicked spot. */
  marchAt(sx: number, sy: number): void {
    if (this.mode.kind !== 'march') return;
    const t = this.worldTile(sx, sy);
    const res = this.dispatch({ type: 'orderCompany', companyId: this.mode.companyId, order: 'move', x: t.x, y: t.y, supplyDays: this.mode.supplyDays });
    this.marker(t.x, t.y, res.ok ? 'move' : 'bad');
    if (res.ok) this.setMode({ kind: 'select' });
  }

  /** Claim mode: claim the sector under the cursor. */
  claimAt(sx: number, sy: number): void {
    const t = this.worldTile(sx, sy);
    const res = this.dispatch({ type: 'claimFrontier', sector: sectorOf(t.x, t.y) });
    this.marker(t.x, t.y, res.ok ? 'work' : 'bad');
    if (res.ok) this.audio.play('complete');
  }

  /** Survey mode: the first selected adult goes to survey the clicked spot. */
  surveyAt(sx: number, sy: number): void {
    const t = this.worldTile(sx, sy);
    const who = [...this.selected].map((id) => this.sim.settler(id)).find((s) => s && s.lifeStage === 'adult');
    if (!who) {
      this.dispatch({ type: 'surveyDeposit', settlerId: -1, x: t.x, y: t.y });
      this.marker(t.x, t.y, 'bad');
      return;
    }
    const res = this.dispatch({ type: 'surveyDeposit', settlerId: who.id, x: t.x, y: t.y });
    this.marker(t.x, t.y, res.ok ? 'work' : 'bad');
    if (res.ok) {
      this.audio.play('command');
      this.setMode({ kind: 'select' });
    }
  }

  markArea(from: { x: number; y: number }, sx: number, sy: number): void {
    const t = this.worldTile(sx, sy);
    const on = this.mode.kind === 'mark';
    const res = this.dispatch({ type: 'designate', x0: from.x, y0: from.y, x1: t.x, y1: t.y, on });
    if (res.ok) this.audio.play('command');
  }

  // ---- work areas --------------------------------------------------------------

  /** New areas staff themselves with this many workers; farm areas lay out this crop. */
  areaDefaults: { wanted: number; crop: CropId } = { wanted: 2, crop: 'turnip' };

  startArea(areaKind: AreaKind, editId: number | null = null): void {
    this.setMode({ kind: 'area', areaKind, editId });
  }

  /** Finishes drawing (or redrawing) a work area and selects it. */
  commitArea(from: { x: number; y: number }, sx: number, sy: number): void {
    if (this.mode.kind !== 'area') return;
    const t = this.worldTile(sx, sy);
    const rect = { x0: from.x, y0: from.y, x1: t.x, y1: t.y };
    const res = this.mode.editId !== null
      ? this.dispatch({ type: 'updateArea', areaId: this.mode.editId, rect })
      : this.dispatch({ type: 'createArea', kind: this.mode.areaKind, ...rect, wanted: this.selected.size ? undefined : this.areaDefaults.wanted, crop: this.areaDefaults.crop });
    if (!res.ok) return;
    this.audio.play('complete');
    this.selectedArea = this.mode.kind === 'area' && this.mode.editId !== null ? this.mode.editId : res.id ?? null;
    // Newly drawn areas take the selected settlers straight away.
    if (this.selectedArea !== null && this.selected.size && this.mode.editId === null) {
      this.dispatch({ type: 'assignArea', ids: [...this.selected], areaId: this.selectedArea });
    }
    this.setMode({ kind: 'select' });
  }

  selectArea(id: number | null, focus = false): void {
    this.selectedArea = id;
    const a = id !== null ? this.sim.area(id) : undefined;
    if (a && focus) this.focusTarget({ x: a.x0, y: a.y0, w: a.x1 - a.x0 + 1, h: a.y1 - a.y0 + 1 }, false);
    this.publish(true);
  }

  // ---- navigation ----------------------------------------------------------------

  /** Moves the camera to a target, selects it if it is a settler or building, and pulses a highlight. */
  focusTarget(t: Target, select = true): void {
    this.camera.centerOn((t.x + t.w / 2) * TILE, (t.y + t.h / 2) * TILE);
    this.highlight = { x: t.x, y: t.y, w: t.w, h: t.h, t0: performance.now() / 1000 };
    if (select && t.settlerId !== undefined) {
      this.selected = new Set([t.settlerId]);
      this.selectedBuildings.clear();
    } else if (select && t.buildingId !== undefined) {
      this.selected.clear();
      this.selectedBuildings = new Set([t.buildingId]);
    }
    this.audio.play('select');
    this.publish(true);
  }

  focusBuildingById(id: number): void {
    const b = this.sim.buildings.get(id);
    if (b) this.focusTarget({ x: b.x, y: b.y, w: b.w, h: b.h, buildingId: b.id });
  }

  focusSettler(id: number): void {
    const s = this.sim.settler(id);
    if (s) this.focusTarget({ x: Math.floor(s.x), y: Math.floor(s.y), w: 1, h: 1, settlerId: s.id });
  }

  /** Targets for the quick-find buttons. */
  findList(kind: 'idle' | 'waiting' | 'sites' | 'bridge' | 'home'): Target[] {
    const sim = this.sim;
    const rect = (b: { id: number; x: number; y: number; w: number; h: number }) => ({ x: b.x, y: b.y, w: b.w, h: b.h, buildingId: b.id });
    switch (kind) {
      case 'idle':
        return sim.settlers
          .filter((s) => (!s.task || s.task.kind === 'wander') && s.idleReason && s.idleReason !== 'Stores are well stocked')
          .map((s) => ({ x: Math.floor(s.x), y: Math.floor(s.y), w: 1, h: 1, settlerId: s.id }));
      case 'waiting':
        return [...sim.buildings.values()]
          .filter((b) => (b.built && b.workshop && /Needs|Waiting|No worker|full|turned off/.test(b.workshop.status)) || (!b.built && !b.field && !materialsComplete(b)))
          .map(rect);
      case 'sites':
        return [...sim.buildings.values()].filter((b) => !b.built && !b.field).map(rect);
      case 'bridge': {
        const b = [...sim.buildings.values()].find((x) => x.type === 'stoneBridge');
        if (b) return [rect(b)];
        const c = suggestCrossing(sim);
        return c ? [c] : [];
      }
      case 'home': {
        const camp = campOf(sim);
        return camp ? [rect(camp)] : [];
      }
    }
  }

  findNext(kind: 'idle' | 'waiting' | 'sites' | 'bridge' | 'home'): void {
    const list = this.findList(kind);
    if (!list.length) {
      const empty = { idle: 'Nobody is idle.', waiting: 'Nothing is waiting for resources.', sites: 'No construction under way.', bridge: 'No stone bridge yet, and no explored river crossing to suggest. Explore east.', home: 'No camp found.' };
      this.toast(empty[kind], 'info');
      return;
    }
    const i = ((this.findCursor[kind] ?? -1) + 1) % list.length;
    this.findCursor[kind] = i;
    this.focusTarget(list[i]);
  }

  minimapClick(mx: number, my: number): void {
    if (!this.minimap) return;
    const t = this.minimap.tileAt(mx, my);
    this.camera.centerOn((t.x + 0.5) * TILE, (t.y + 0.5) * TILE);
    this.lastMinimap = 0;
  }

  closeOverview(): void {
    this.overviewOpen = false;
    this.publish(true);
  }

  openOverview(): void {
    this.overview = buildOverview(this.sim, null);
    this.overview.since = null;
    this.overview.sinceNote = 'How the valley stands right now:';
    this.overviewOpen = true;
    this.publish(true);
  }

  closeCelebration(): void {
    this.celebration = null;
    this.publish(true);
  }

  setPriorities(ids: number[], priorities: WorkKind[] | null): void {
    this.dispatch({ type: 'setPriorities', ids, priorities }, true);
  }

  // ---- inspector actions -----------------------------------------------------

  setJob(ids: number[], job: JobId): void {
    this.dispatch({ type: 'setJob', ids, job });
  }
  setCrop(ids: number[], crop: CropId | null): void {
    this.dispatch({ type: 'setCrop', buildingIds: ids, crop });
  }
  setRecipe(id: number, recipe: RecipeId | null): void {
    this.dispatch({ type: 'setRecipe', buildingId: id, recipe });
  }
  toggleWorkshop(id: number): void {
    this.dispatch({ type: 'toggleWorkshop', buildingId: id });
  }
  removeBuildings(ids: number[]): void {
    for (const id of ids) this.dispatch({ type: 'remove', buildingId: id });
    this.selectedBuildings.clear();
    this.publish(true);
  }
  startPlacing(building: BuildingId, crop: CropId | null = 'turnip'): void {
    this.selectedBuildings.clear();
    this.setMode({ kind: 'place', building, crop });
  }
  focusBuilding(id: number): void {
    const b = this.sim.buildings.get(id);
    if (b) this.camera.centerOn((b.x + b.w / 2) * TILE, (b.y + b.h / 2) * TILE);
  }

  // ---- keyboard ----------------------------------------------------------------

  keyDown(code: string, e: { ctrl: boolean; shift: boolean }): boolean {
    if (e.ctrl && code === 'KeyS') {
      void this.save(true);
      return true;
    }
    const action = actionFor(this.settings.bindings, code);
    if (!action) return false;
    this.pressed.add(action);
    switch (action) {
      case 'zoomIn':
        this.camera.zoomBy(1);
        break;
      case 'zoomOut':
        this.camera.zoomBy(-1);
        break;
      case 'pause':
        this.togglePause();
        break;
      case 'speed1':
        this.setSpeed(0);
        break;
      case 'speed2':
        this.setSpeed(1);
        break;
      case 'speed3':
        this.setSpeed(2);
        break;
      case 'harvest':
        this.setMode(this.mode.kind === 'mark' ? { kind: 'select' } : { kind: 'mark' });
        break;
      case 'unmark':
        this.setMode(this.mode.kind === 'unmark' ? { kind: 'select' } : { kind: 'unmark' });
        break;
      case 'demolish':
        if (this.selectedBuildings.size) this.removeBuildings([...this.selectedBuildings]);
        break;
      case 'nextIdle':
        this.nextIdle();
        break;
      case 'selectAll':
        this.selectAll();
        break;
      case 'save':
        void this.save(true);
        break;
      case 'survey':
        this.setMode(this.mode.kind === 'survey' ? { kind: 'select' } : { kind: 'survey' });
        break;
      case 'homeView':
        this.findNext('home');
        break;
      case 'toggleGrid':
        this.settings = { ...this.settings, showGrid: !this.settings.showGrid };
        saveSettings(this.settings);
        this.toast(this.settings.showGrid ? 'Tile grid on (G to hide).' : 'Tile grid off.', 'info');
        break;
      case 'healthBars':
        this.settings = { ...this.settings, healthBars: this.settings.healthBars === 'always' ? 'hurt' : 'always' };
        saveSettings(this.settings);
        this.toast(this.settings.healthBars === 'always' ? 'Health bars over everyone.' : 'Health bars only over the hurt.', 'info');
        break;
      default:
        // Keys the React UI answers (windows, goods, see more, the ruler).
        return false;
    }
    return true;
  }

  keyUp(code: string): void {
    const action = actionFor(this.settings.bindings, code);
    if (action) this.pressed.delete(action);
  }

  clearKeys(): void {
    this.pressed.clear();
  }

  cancel(): boolean {
    if (this.mode.kind !== 'select') {
      this.setMode({ kind: 'select' });
      return true;
    }
    if (this.selected.size || this.selectedBuildings.size) {
      this.selected.clear();
      this.selectedBuildings.clear();
      this.publish(true);
      return true;
    }
    return false;
  }

  // ---- saving ------------------------------------------------------------------

  async save(manual: boolean): Promise<boolean> {
    if (this.saving || !this.sim) return false;
    this.saving = true;
    this.saveStatus = 'Saving…';
    this.publish(true);
    try {
      await this.saves.save(this.session.slot, this.sim, {
        name: this.session.name,
        createdAt: this.session.createdAt,
        view: { camX: this.camera.x, camY: this.camera.y, zoom: this.camera.target },
        tutorial: this.tutorial,
      });
      this.lastSaveAt = performance.now();
      this.lastSaveTick = this.sim.tick;
      this.pendingImportant = 0;
      this.saveStatus = `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      if (manual) {
        this.toast('Game saved.', 'good');
        this.tutorialSaved = true;
      }
      return true;
    } catch (e) {
      this.saveStatus = 'Save failed';
      this.toast(`Saving failed: ${e instanceof Error ? e.message : String(e)}. Your previous save is untouched.`, 'bad');
      return false;
    } finally {
      this.saving = false;
      this.publish(true);
    }
  }

  /** Synchronous save for when the page is being hidden or closed. */
  emergencySave(): void {
    if (this.attract || !this.sim || !this.session.slot || this.sim.tick === this.lastSaveTick) return;
    this.saves.saveEmergency(this.session.slot, this.sim, {
      name: this.session.name,
      createdAt: this.session.createdAt,
      view: { camX: this.camera.x, camY: this.camera.y, zoom: this.camera.target },
      tutorial: this.tutorial,
    });
  }

  private autosaveCheck(now: number): void {
    if (this.attract || this.saving || this.sim.tick === this.lastSaveTick) return;
    const interval = this.settings.autosaveMinutes * 60_000;
    const importantDue = this.pendingImportant && now - this.pendingImportant > IMPORTANT_SAVE_DELAY && now - this.lastSaveAt > MIN_SAVE_GAP;
    if (now - this.lastSaveAt > interval || importantDue) void this.save(false);
  }

  // ---- UI snapshot -------------------------------------------------------------

  private advanceTutorial(): void {
    const t = this.tutorial;
    if (t.done) return;
    const step = TUTORIAL[t.step];
    if (!step) return;
    if (step.done({ sim: this.sim, selectedCount: this.selected.size, saved: this.tutorialSaved })) {
      t.step++;
      this.audio.play('complete');
      if (t.step >= TUTORIAL.length) {
        t.done = true;
        this.tutorialOutroUntil = performance.now() + 12000;
      }
    }
  }

  skipTutorial(): void {
    this.tutorial.done = true;
    this.publish(true);
  }

  restartTutorial(): void {
    this.tutorial = { step: 0, done: false };
    this.publish(true);
  }

  publish(force = false): void {
    if (!this.sim) return;
    const now = performance.now();
    if (!force && now - this.lastUi < UI_INTERVAL) return;
    this.lastUi = now;
    this.advanceTutorial();
    const sim = this.sim;
    for (const id of this.selected) if (!sim.settler(id)) this.selected.delete(id);
    for (const id of this.selectedBuildings) if (!sim.buildings.has(id)) this.selectedBuildings.delete(id);
    this.toasts = this.toasts.filter((t) => now - t.at < (t.level === 'bad' ? 5000 : 6500));
    const { clock, period } = clockOf(sim.timeOfDay);
    const settlers = sim.settlers.map((s) => settlerInfo(sim, s));
    const t = this.tutorial;
    const step = !t.done ? TUTORIAL[t.step] : null;
    const hover = this.hoverWorld ? hoverText(sim, this.hoverWorld.x, this.hoverWorld.y, this.mode.kind === 'claim') : null;
    this.ui.set({
      region: regionalInfo(sim),
      growth: growthInfo(sim),
      logistics: logisticsInfo(sim),
      kingdom: kingdomInfo(sim),
      diplomacy: diplomacyInfo(sim),
      news: newsInfo(sim),
      warCouncil: warCouncilInfo(sim),
      army: armyInfo(sim),
      war: warInfo(sim),
      running: true,
      paused: this.paused,
      speed: this.speed,
      day: sim.day,
      clock,
      period,
      isNight: sim.isNight(),
      raining: sim.weather.raining,
      resources: sim.totals(),
      storage: sim.totalCapacity(),
      population: sim.settlers.length,
      housing: housingOf(sim),
      populationStatus: sim.populationStatus,
      wellEquipped: sim.wellEquipped(),
      milestone: milestoneInfo(sim),
      mode: this.mode,
      selection: settlers.filter((s) => this.selected.has(s.id)),
      building: buildingInfo(sim, [...this.selectedBuildings].map((id) => sim.buildings.get(id)!).filter(Boolean)),
      settlers,
      idleCount: settlers.filter((s) => s.idle).length,
      toasts: [...this.toasts],
      tutorial: step ? { index: t.step, total: TUTORIAL.length, title: step.title, text: step.text } : null,
      tutorialOutro: t.done && now < this.tutorialOutroUntil,
      hover: this.mode.kind === 'place' && this.placementReason && this.placement && !this.placement.ok ? this.placementReason : hover,
      saveStatus: this.saveStatus,
      unlocked: unlockedSets(sim),
      worldName: this.session.name,
      explored: sim.world.exploredTileCount(),
      beds: bedSummary(sim),
      areas: areaInfo(sim),
      selectedArea: this.selectedArea !== null && sim.area(this.selectedArea) ? this.selectedArea : null,
      overview: this.overviewOpen ? this.overview : null,
      celebration: this.celebration ? celebrationInfo(this.celebration) : null,
      finds: {
        idle: this.findList('idle').length,
        waiting: this.findList('waiting').length,
        sites: this.findList('sites').length,
        bridge: this.findList('bridge').length > 0,
      },
      ruler: rulerInfo(sim),
    });
  }
}

/** The ruler's name, title and when Rally is ready, for the console. */
function rulerInfo(sim: Simulation): UiSnapshot['ruler'] {
  const r = sim.ruler();
  if (!r) return null;
  const k = sim.kingdoms.find((x) => x.player);
  const wait = sim.rallyReadyAt - sim.tick;
  return {
    id: r.id, name: r.name,
    title: k?.crowned ? `Sovereign of ${k.name}` : `Ruler of ${sim.settlements[0]?.name ?? 'the valley'}`,
    rallyIn: wait > 0 ? gameTime(wait) : '',
  };
}

export { TUTORIAL_OUTRO };
