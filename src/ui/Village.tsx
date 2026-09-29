import { useEffect, useRef, useState } from 'react';
import type { OverviewItem } from '../engine/overview';
import { Minimap } from '../render/Minimap';
import { useGame, useSnapshot } from './context';

/**
 * "Valley today": shown when a saved valley is resumed. It recaps what was
 * recorded last session, lists up to three things that need attention and a
 * few sensible next goals. Every line jumps to what it talks about.
 */
export function ValleyToday() {
  const { game } = useGame();
  const s = useSnapshot();
  const o = s.overview;
  if (!o) return null;
  const go = (item: OverviewItem) => {
    game.closeOverview();
    if (item.target) game.focusTarget(item.target);
  };
  return (
    <div className="panel valley-today" role="dialog" aria-label="Valley today">
      <div className="vt-head">
        <h2>{s.worldName || 'Your valley'} today</h2>
        <button className="btn small" onClick={() => game.closeOverview()} aria-label="Close Valley today">
          Close
        </button>
      </div>
      <p className="muted">{o.sinceNote}</p>
      {o.since && (
        <ul className="vt-since">
          {o.since.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {o.issues.length > 0 && (
        <>
          <h3>Needs attention</h3>
          <ul className="vt-list">
            {o.issues.map((i) => (
              <li key={i.text}>
                <button onClick={() => go(i)}>
                  <span className="vt-mark" aria-hidden>
                    !
                  </span>
                  <span>
                    <strong>{i.text}</strong>
                    {i.detail && <span className="muted"> — {i.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {o.goals.length > 0 && (
        <>
          <h3>Ideas for today</h3>
          <ul className="vt-list">
            {o.goals.map((g) => (
              <li key={g.text}>
                <button onClick={() => go(g)}>
                  <span className="vt-mark goal" aria-hidden>
                    →
                  </span>
                  <span>
                    <strong>{g.text}</strong>
                    {g.detail && <span className="muted"> — {g.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {o.milestone.next && (
        <div className="vt-progress">
          <h3>
            {o.milestone.current} → {o.milestone.next}
          </h3>
          {o.milestone.reqs.map((r) => (
            <div key={r.label} className={`req small${r.done ? ' done' : ''}`}>
              <span className="box" aria-hidden />
              <span>
                {r.label} {!r.done && <span className="muted">({r.current}/{r.target})</span>}
                {r.done && <span className="sr-only"> done</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <button className="btn primary" onClick={() => game.closeOverview()}>
        Start playing
      </button>
    </div>
  );
}

/** Minimap with layer toggles and quick-find buttons, drawn by the game loop. */
export function MinimapPanel() {
  const { game } = useGame();
  const s = useSnapshot();
  const ref = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState({ settlers: true, areas: true, buildings: true });
  const [open, setOpen] = useState(true);
  const [zoom, setZoom] = useState(2);
  useEffect(() => {
    if (!open || !ref.current) return;
    const m = new Minimap(ref.current);
    m.layers = layers;
    m.scale = zoom;
    game.minimap = m;
    return () => {
      if (game.minimap === m) game.minimap = null;
    };
  }, [game, open, layers, zoom]);
  if (!open) {
    return (
      <div className="minimap-toggle">
        <button className="btn small" onClick={() => setOpen(true)}>
          Map
        </button>
      </div>
    );
  }
  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] });
  return (
    <div className="panel minimap">
      <canvas
        ref={ref}
        width={200}
        height={150}
        className="minimap-canvas"
        aria-label="Minimap: click to move the camera"
        onMouseDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          game.minimapClick(e.clientX - r.left, e.clientY - r.top);
        }}
      />
      <div className="mm-row">
        <button className={`chip${layers.settlers ? ' on' : ''}`} onClick={() => toggle('settlers')} aria-pressed={layers.settlers}>
          People
        </button>
        <button className={`chip${layers.buildings ? ' on' : ''}`} onClick={() => toggle('buildings')} aria-pressed={layers.buildings}>
          Buildings
        </button>
        <button className={`chip${layers.areas ? ' on' : ''}`} onClick={() => toggle('areas')} aria-pressed={layers.areas}>
          Areas
        </button>
        <button className="chip" onClick={() => setZoom(zoom === 2 ? 1 : zoom === 1 ? 3 : 2)} title="Minimap zoom">
          {zoom === 1 ? 'Far' : zoom === 2 ? 'Mid' : 'Near'}
        </button>
        <button className="chip" onClick={() => setOpen(false)} aria-label="Hide minimap">
          ✕
        </button>
      </div>
      <div className="mm-row find">
        <button className="btn small" onClick={() => game.findNext('idle')} title="Next idle settler (.)">
          Idle {s.finds.idle}
        </button>
        <button className="btn small" onClick={() => game.findNext('waiting')} title="Buildings waiting for resources or workers">
          Waiting {s.finds.waiting}
        </button>
        <button className="btn small" onClick={() => game.findNext('sites')} title="Construction sites">
          Sites {s.finds.sites}
        </button>
        <button className="btn small" onClick={() => game.findNext('bridge')} title="The stone bridge project or a good crossing">
          Bridge
        </button>
        <button className="btn small" onClick={() => game.findNext('home')} title="Settlement centre">
          Home
        </button>
      </div>
    </div>
  );
}

/** A brief, quiet card when the settlement reaches a new tier. */
/** The Assistant Chief's advice, opened by clicking the "?" over them. The game waits while it is read. */
export function ChiefAdvice() {
  const { game, sprites } = useGame();
  const s = useSnapshot();
  const a = s.advice;
  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      game.closeAdvice();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [a, game]);
  if (!a) return null;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && game.closeAdvice()}>
      <div className="panel modal advice" role="dialog" aria-label={`Advice from ${a.name}`}>
        <div className="advice-head">
          <img className="px portrait" src={sprites.portrait(a.appearance)} alt="" />
          <div>
            <h2>{a.name}</h2>
            <div className="muted">Your Assistant Chief</div>
          </div>
        </div>
        <p className="advice-text">“{a.text}”</p>
        <div className="buttons">
          <button className="btn primary" onClick={() => game.closeAdvice()} autoFocus>
            Thank you
          </button>
        </div>
      </div>
    </div>
  );
}

export function Celebration() {
  const { game } = useGame();
  const s = useSnapshot();
  const c = s.celebration;
  if (!c) return null;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && game.closeCelebration()}>
      <div className="panel modal celebration" role="dialog" aria-label={`Your settlement is now a ${c.name}`}>
        <div className="bunting" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <h2>Your settlement is now a {c.name}</h2>
        <p>New building options and upgrades are open:</p>
        <ul>
          {c.unlocks.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
        <h3>Where to next</h3>
        <ul>
          {c.next.map((n) => (
            <li key={n.name}>
              <strong>{n.name}</strong>: {n.description}
              {n.future && <span className="muted"> (arrives in a future update)</span>}
            </li>
          ))}
        </ul>
        <div className="buttons">
          <button className="btn primary" onClick={() => game.closeCelebration()} autoFocus>
            Back to the valley
          </button>
        </div>
      </div>
    </div>
  );
}
