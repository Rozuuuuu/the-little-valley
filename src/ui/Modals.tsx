import { useEffect, useState } from 'react';
import { MILESTONES } from '../game/data/progression';
import { randomSeed } from '../game/core/rng';
import type { SlotMeta } from '../game/save/storage';
import { saveSettings, type Settings } from '../engine/settings';
import { DEFAULT_BINDINGS, defaultBindings, keyLabel, type Action } from '../input/bindings';
import { useGame } from './context';

function Modal({ title, children, onClose, label }: { title: string; children: React.ReactNode; onClose: () => void; label?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel modal" role="dialog" aria-modal="true" aria-label={label ?? title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PauseMenu({ onClose, onSettings, onHelp, onQuit }: { onClose: () => void; onSettings: () => void; onHelp: () => void; onQuit: () => void }) {
  const { game } = useGame();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={game.session?.name ?? 'Menu'} onClose={onClose} label="Game menu">
      <div className="stack">
        <button className="btn primary" onClick={onClose} autoFocus>
          Resume
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await game.save(true);
            setBusy(false);
          }}
        >
          Save now
        </button>
        <button className="btn" onClick={onSettings}>
          Settings
        </button>
        <button className="btn" onClick={onHelp}>
          Controls
        </button>
        <button className="btn" onClick={() => { game.restartTutorial(); onClose(); }}>
          Replay introduction
        </button>
        <button className="btn danger" onClick={onQuit}>
          Save and return to title
        </button>
      </div>
      <p className="muted">The valley autosaves every {game.settings.autosaveMinutes} minutes and after big moments.</p>
    </Modal>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { game } = useGame();
  const [s, setS] = useState<Settings>(game.settings);
  const [listening, setListening] = useState<Action | null>(null);

  const update = (next: Settings) => {
    setS(next);
    game.settings = next;
    game.audio.setVolumes(next);
    saveSettings(next);
  };

  useEffect(() => {
    if (!listening) return;
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') {
        const bindings = { ...s.bindings };
        // A key can only do one thing: take it away from other actions.
        for (const a of Object.keys(bindings) as Action[]) bindings[a] = bindings[a].filter((c) => c !== e.code);
        bindings[listening] = [e.code, ...bindings[listening].slice(1).filter((c) => c !== e.code)];
        update({ ...s, bindings });
      }
      setListening(null);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  const slider = (key: 'masterVolume' | 'musicVolume' | 'sfxVolume', label: string) => (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[key]} onChange={(e) => update({ ...s, [key]: Number(e.target.value) })} />
      <span>{Math.round(s[key] * 100)}</span>
    </label>
  );

  const groups = ['Camera', 'Time', 'Tools', 'Other'] as const;
  return (
    <Modal title="Settings" onClose={() => !listening && onClose()}>
      <h3>Sound</h3>
      {slider('masterVolume', 'Master')}
      {slider('musicVolume', 'Music')}
      {slider('sfxVolume', 'Effects')}
      <div className="row">
        <span>Mute everything</span>
        <input type="checkbox" checked={s.muted} onChange={(e) => update({ ...s, muted: e.target.checked })} />
      </div>
      <h3 style={{ marginTop: 12 }}>Play</h3>
      <div className="row">
        <span>Pan when the mouse touches the screen edge</span>
        <input type="checkbox" checked={s.edgePan} onChange={(e) => update({ ...s, edgePan: e.target.checked })} />
      </div>
      <div className="row">
        <span>Autosave every</span>
        <select value={s.autosaveMinutes} onChange={(e) => update({ ...s, autosaveMinutes: Number(e.target.value) })}>
          {[1, 2, 5, 10].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <h3 style={{ marginTop: 12 }}>Keys</h3>
      <p className="muted">Click a key, then press the new one. Esc cancels.</p>
      <div className="keys">
        {groups.map((g) => (
          <KeyGroup key={g} group={g} s={s} listening={listening} setListening={setListening} />
        ))}
      </div>
      <div className="buttons">
        <button className="btn" onClick={() => update({ ...s, bindings: defaultBindings() })}>
          Reset keys
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function KeyGroup({ group, s, listening, setListening }: { group: string; s: Settings; listening: Action | null; setListening: (a: Action) => void }) {
  const actions = (Object.keys(DEFAULT_BINDINGS) as Action[]).filter((a) => DEFAULT_BINDINGS[a].group === group);
  return (
    <>
      <h4>{group}</h4>
      {actions.map((a) => (
        <div key={a} style={{ display: 'contents' }}>
          <span>{DEFAULT_BINDINGS[a].label}</span>
          <button className={`btn small keybtn${listening === a ? ' listening' : ''}`} onClick={() => setListening(a)}>
            {listening === a ? 'Press a key…' : s.bindings[a].map(keyLabel).join(' / ') || 'Unbound'}
          </button>
        </div>
      ))}
    </>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const { game } = useGame();
  const b = game.settings.bindings;
  const k = (a: Action) => b[a].map(keyLabel).join(' / ');
  return (
    <Modal title="Controls" onClose={onClose}>
      <div className="keys">
        <h4>Mouse</h4>
        <span>Select a settler or building</span><span>Left-click</span>
        <span>Select a group (or fields)</span><span>Left-drag</span>
        <span>Add to selection</span><span>Shift + click</span>
        <span>Order: move, chop, mine, farm, build</span><span>Right-click</span>
        <span>Pan the camera</span><span>Middle-drag</span>
        <span>Zoom</span><span>Wheel</span>
        <h4>Keyboard</h4>
        <span>Pan</span><span>{k('panUp')}, {k('panLeft')}, {k('panDown')}, {k('panRight')}</span>
        <span>Pause</span><span>{k('pause')}</span>
        <span>Speed</span><span>{k('speed1')} / {k('speed2')} / {k('speed3')}</span>
        <span>Build menu</span><span>{k('build')}</span>
        <span>Mark / unmark for harvest</span><span>{k('harvest')} / {k('unmark')}</span>
        <span>Demolish selected building</span><span>{k('demolish')}</span>
        <span>Next idle settler</span><span>{k('nextIdle')}</span>
        <span>Select everyone</span><span>{k('selectAll')}</span>
        <span>Save</span><span>{k('save')} or Ctrl+S</span>
        <span>Cancel / menu</span><span>{k('cancel')}</span>
      </div>
      <div className="buttons">
        <button className="btn primary" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </Modal>
  );
}

export function NewWorldModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, seed: string, tutorial: boolean) => void }) {
  const [name, setName] = useState('Little Valley');
  const [seed, setSeed] = useState(String(randomSeed()));
  const [tutorial, setTutorial] = useState(true);
  return (
    <Modal title="A new valley" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name.trim() || 'Little Valley', seed, tutorial);
        }}
      >
        <label className="field">
          Name
          <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          World seed (the same seed always makes the same land)
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" value={seed} maxLength={40} onChange={(e) => setSeed(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn small" onClick={() => setSeed(String(randomSeed()))}>
              Reroll
            </button>
          </div>
        </label>
        <label className="row">
          <span>Show the introduction</span>
          <input type="checkbox" checked={tutorial} onChange={(e) => setTutorial(e.target.checked)} />
        </label>
        <div className="buttons">
          <button type="button" className="btn" onClick={onClose}>
            Back
          </button>
          <button type="submit" className="btn primary">
            Settle the valley
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function LoadModal({ onClose, onLoad }: { onClose: () => void; onLoad: (slot: string) => void }) {
  const { game } = useGame();
  const [slots, setSlots] = useState<SlotMeta[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const refresh = () => game.saves.list().then(setSlots, () => setSlots([]));
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal title="Your valleys" onClose={onClose}>
      {!slots && <p className="muted">Looking for saved valleys…</p>}
      {slots && slots.length === 0 && <p className="muted">No saved valleys yet. Start a new one from the title screen.</p>}
      <div className="slots">
        {slots?.map((m) => (
          <div key={m.slot} className="slot">
            <span className="nm">{m.name}</span>
            <span className="meta">
              {MILESTONES[m.milestone]?.name ?? 'Camp'}, day {m.day}, {m.population} settlers. Saved {new Date(m.savedAt).toLocaleString()}
            </span>
            <span className="acts">
              {confirm === m.slot ? (
                <>
                  <button className="btn small danger" onClick={async () => { await game.saves.remove(m.slot); setConfirm(null); void refresh(); }}>
                    Delete for good
                  </button>
                  <button className="btn small" onClick={() => setConfirm(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button className="btn small primary" onClick={() => onLoad(m.slot)}>
                    Play
                  </button>
                  <button className="btn small" onClick={() => setConfirm(m.slot)} aria-label={`Delete ${m.name}`}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="buttons">
        <button className="btn" onClick={onClose}>
          Back
        </button>
      </div>
    </Modal>
  );
}
