import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { seedFromString } from '../game/core/rng';
import { SaveManager } from '../game/save/SaveManager';
import { IndexedDbStore, localEmergencyStore, MemoryStore } from '../game/save/storage';
import { applyCommand } from '../game/sim/commands';
import { createNewGame } from '../game/sim/newGame';
import { GameController } from '../engine/GameController';
import { loadSettings } from '../engine/settings';
import { useStore } from '../engine/store';
import { InputController } from '../input/InputController';
import { Camera } from '../render/Camera';
import { Renderer } from '../render/Renderer';
import { SpriteBank } from '../render/sprites';
import { GameContext, useGame, type GameContextValue } from './context';
import { HoverInfo, PausedBanner, SidePanel, Toasts, TopBar, Tutorial } from './Hud';
import { Celebration, ValleyToday } from './Village';
import { BottomConsole, type CardMenu, type WindowTab } from './Console';
import { HelpModal, LoadModal, NewWorldModal, PauseMenu, SettingsModal, type NewWorldChoice } from './Modals';
import { CURRENT_GEN } from '../game/world/worldgen';

const ATTRACT_SEED = 20260927;

type Overlay = null | 'pause' | 'settings' | 'help' | 'new' | 'load';

/** The title screen shows a valley that tends itself. */
function startAttract(game: GameController): void {
  const sim = createNewGame(ATTRACT_SEED);
  applyCommand(sim, { type: 'designate', x0: -14, y0: -14, x1: 14, y1: 14, on: true });
  applyCommand(sim, { type: 'placeArea', building: 'field', x0: -9, y0: 3, x1: -6, y1: 6, crop: 'wheat' });
  sim.drainEvents();
  game.attract = true;
  game.start(sim, { slot: '', name: '', createdAt: 0 }, { tutorial: false });
  game.speed = 2;
}

function makeStore() {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbStore();
  } catch {
    // fall through
  }
  return new MemoryStore();
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctx, setCtx] = useState<GameContextValue | null>(null);
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [cardMenu, setCardMenu] = useState<CardMenu>(null);
  const [win, setWin] = useState<WindowTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSlot, setLastSlot] = useState<string | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // One-time engine setup.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const sprites = new SpriteBank();
    const camera = new Camera();
    const renderer = new Renderer(canvas, sprites, camera);
    const audio = new AudioEngine();
    const settings = loadSettings();
    audio.setVolumes(settings);
    const game = new GameController(renderer, camera, audio, new SaveManager(makeStore(), localEmergencyStore), settings);
    game.onFatal = (e) => setError(`Something went wrong: ${e instanceof Error ? e.message : String(e)}. Your last save is safe; reload the page to continue.`);
    const input = new InputController(canvas, game);
    if (import.meta.env.DEV) (window as unknown as { __game: GameController }).__game = game;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      renderer.resize(Math.round(canvas.clientWidth * dpr), Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    startAttract(game);

    const onVisibility = () => {
      if (document.hidden) {
        if (screenRef.current === 'game') {
          game.emergencySave();
          void game.save(false);
        }
        audio.suspend();
      } else audio.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const onUnload = () => {
      if (screenRef.current === 'game') game.emergencySave();
    };
    window.addEventListener('pagehide', onUnload);
    setCtx({ game, sprites });
    void game.saves.list().then((l) => setLastSlot(l[0]?.slot ?? null), () => {});

    return () => {
      ro.disconnect();
      input.dispose();
      game.stop();
      audio.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);

  const game = ctx?.game;

  // Menus pause the world while they are open.
  useEffect(() => {
    if (!game) return;
    game.menuOpen = screen === 'game' && (overlay === 'pause' || overlay === 'settings' || overlay === 'help');
  }, [game, overlay, screen]);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const startNew = async (choice: NewWorldChoice) => {
    if (!game) return;
    game.audio.unlock();
    const seed = seedFromString(choice.seed);
    const slot = `valley-${Date.now().toString(36)}`;
    game.attract = false;
    const sim = createNewGame(seed, CURRENT_GEN, choice.habitat, { rulerName: choice.rulerName });
    sim.settlements[0].name = choice.worldName;
    sim.kingdoms[0].name = choice.worldName;
    game.start(sim, { slot, name: choice.worldName, createdAt: Date.now() }, { tutorial: choice.tutorial });
    const ruler = sim.ruler();
    if (ruler) game.selectSettlers([ruler.id], true);
    setOverlay(null);
    setScreen('game');
    setLastSlot(slot);
    await game.save(false);
  };

  const load = async (slot: string) => {
    if (!game) return;
    game.audio.unlock();
    try {
      const res = await game.saves.load(slot);
      game.attract = false;
      game.start(res.sim, { slot, name: res.save.meta.name, createdAt: res.save.meta.createdAt }, {
        tutorial: false,
        tutorialState: res.save.tutorial,
        overview: true,
        view: res.save.view,
      });
      setOverlay(null);
      setScreen('game');
      setLastSlot(slot);
      if (res.usedBackup) game.toast(`The latest save was damaged (${res.problem}). Loaded the backup from just before it.`, 'warn');
      else game.toast(`Welcome back to ${res.save.meta.name}.`, 'good');
    } catch (e) {
      // Never start a fresh world in its place: say exactly what went wrong and keep the save untouched.
      setLoadError(`${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const quitToTitle = async () => {
    if (!game) return;
    await game.save(false);
    setOverlay(null);
    setCardMenu(null);
    setWin(null);
    setScreen('title');
    startAttract(game);
    void game.saves.list().then((l) => setLastSlot(l[0]?.slot ?? null));
  };

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" tabIndex={0} aria-label="The valley" />
      {ctx && (
        <GameContext.Provider value={ctx}>
          <InputBridge
            screen={screen}
            overlay={overlay}
            setOverlay={setOverlay}
            buildOpen={cardMenu !== null}
            setBuildOpen={(o) => setCardMenu(o ? 'build' : null)}
            win={win}
            setWin={setWin}
          />
          {screen === 'title' && !overlay && <Title hasSave={!!lastSlot} onContinue={() => lastSlot && load(lastSlot)} onNew={() => setOverlay('new')} onLoad={() => setOverlay('load')} onSettings={() => setOverlay('settings')} />}
          {screen === 'game' && (
            <>
              <TopBar onMenu={() => setOverlay('pause')} win={win} setWin={setWin} />
              <Toasts />
              <PausedBanner />
              <Tutorial />
              <SidePanel tab={win} setTab={setWin} />
              <HoverInfo />
              <BottomConsole menu={cardMenu} setMenu={setCardMenu} openWindow={setWin} />
              <ValleyToday />
              <Celebration />
            </>
          )}
          {overlay === 'pause' && <PauseMenu onClose={closeOverlay} onSettings={() => setOverlay('settings')} onHelp={() => setOverlay('help')} onQuit={quitToTitle} />}
          {overlay === 'settings' && <SettingsModal onClose={() => setOverlay(screen === 'game' ? 'pause' : null)} />}
          {overlay === 'help' && <HelpModal onClose={() => setOverlay(screen === 'game' ? 'pause' : null)} />}
          {overlay === 'new' && <NewWorldModal onClose={closeOverlay} onCreate={startNew} />}
          {overlay === 'load' && <LoadModal onClose={closeOverlay} onLoad={load} />}
          {screen === 'title' && <Toasts />}
        </GameContext.Provider>
      )}
      {loadError && (
        <div className="scrim">
          <div className="panel modal" role="alertdialog" aria-label="This valley could not be opened">
            <h2>This valley could not be opened</h2>
            <div className="error-box">{loadError}</div>
            <p className="muted">Neither the latest save nor its backup could be read. Nothing has been overwritten or deleted, so a later version of the game may still be able to open it.</p>
            <div className="buttons">
              <button className="btn primary" onClick={() => setLoadError(null)} autoFocus>
                Back to the title screen
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="scrim">
          <div className="panel modal">
            <h2>The valley hit a snag</h2>
            <div className="error-box">{error}</div>
            <div className="buttons">
              <button className="btn primary" onClick={() => location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Wires keys that open React UI (build menu, help, Esc menu) into the input layer. */
function InputBridge({ screen, overlay, setOverlay, buildOpen, setBuildOpen, win, setWin }: { screen: string; overlay: Overlay; setOverlay: (o: Overlay) => void; buildOpen: boolean; setBuildOpen: (b: boolean) => void; win: WindowTab | null; setWin: (w: WindowTab | null) => void }) {
  const ctx = useGame();
  const snap = useStore(ctx.game.ui);
  useEffect(() => {
    const game = ctx.game;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (screen !== 'game' || overlay) return;
      const b = game.settings.bindings;
      if (b.build.includes(e.code)) {
        e.preventDefault();
        setBuildOpen(!buildOpen);
        game.audio.play(buildOpen ? 'uiClose' : 'uiOpen');
      } else if (b.help.includes(e.code)) {
        e.preventDefault();
        setOverlay('help');
      } else if (b.cancel.includes(e.code)) {
        if (game.mode.kind !== 'select' || game.selected.size || game.selectedBuildings.size) return;
        // Esc closes the innermost thing first: the build menu, then an open window, then opens the menu.
        if (buildOpen) setBuildOpen(false);
        else if (win) setWin(null);
        else setOverlay('pause');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, screen, overlay, buildOpen, setBuildOpen, setOverlay, win, setWin]);
  const canvas = document.querySelector('.game-canvas');
  if (canvas) canvas.className = `game-canvas mode-${snap.mode.kind}`;
  return null;
}


function Title({ hasSave, onContinue, onNew, onLoad, onSettings }: { hasSave: boolean; onContinue: () => void; onNew: () => void; onLoad: () => void; onSettings: () => void }) {
  return (
    <div className="title-screen">
      <h1 className="logo">
        Little
        <span className="second">Valley</span>
      </h1>
      <p className="tagline">Clear a meadow, plant the first rows, and grow a camp into a village one season at a time.</p>
      <div className="menu">
        {hasSave && (
          <button className="btn primary" onClick={onContinue} autoFocus>
            Continue
          </button>
        )}
        <button className={`btn${hasSave ? '' : ' primary'}`} onClick={onNew} autoFocus={!hasSave}>
          New valley
        </button>
        <button className="btn" onClick={onLoad}>
          Load a valley
        </button>
        <button className="btn" onClick={onSettings}>
          Settings
        </button>
      </div>
      <div className="credit">All art and sound are generated in code. Saved in this browser.</div>
    </div>
  );
}
