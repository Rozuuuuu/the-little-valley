import { ShellButtons } from './ShellButtons';
import { Select } from './Select';
import { useEffect, useState } from 'react';
import { MILESTONES } from '../game/data/progression';
import { randomSeed } from '../game/core/rng';
import { HABITAT_IDS, HABITATS, type HabitatId } from '../game/data/habitats';
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
      <ShellButtons />
      <p className="muted">The valley autosaves every {game.settings.autosaveMinutes} minutes and after big moments. While paused the mouse is free; resume to keep it in the game again.</p>
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

  const groups = ['Orders', 'Camera', 'Time', 'Tools', 'Windows', 'Other'] as const;
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
        <span>Scroll when the mouse touches the screen edge (Warcraft-style)</span>
        <input type="checkbox" checked={s.edgePan} onChange={(e) => update({ ...s, edgePan: e.target.checked })} />
      </div>
      <div className="row">
        <span>Keep the mouse inside the game while playing, like Warcraft III (uses a drawn cursor, which can stutter on slow PCs; let go while paused)</span>
        <input type="checkbox" checked={s.lockMouse} onChange={(e) => update({ ...s, lockMouse: e.target.checked, lockMouseChosen: true })} />
      </div>
      <label className="slider">
        <span>Edge scroll speed</span>
        <input type="range" min={0.5} max={2} step={0.25} value={s.edgeSpeed} disabled={!s.edgePan} onChange={(e) => update({ ...s, edgeSpeed: Number(e.target.value) })} />
        <span>{s.edgeSpeed}×</span>
      </label>
      <div className="row">
        <span>Health bars</span>
        <Select value={s.healthBars} onChange={(e) => update({ ...s, healthBars: e.target.value as 'always' | 'hurt' })}>
          <option value="always">Over everyone</option>
          <option value="hurt">Only when hurt</option>
        </Select>
      </div>
      <div className="row">
        <span>"See more" details</span>
        <Select value={s.detailsInHud ? 'hud' : 'float'} onChange={(e) => update({ ...s, detailsInHud: e.target.value === 'hud' })}>
          <option value="hud">Inside the bottom panel, beside the selection</option>
          <option value="float">In a floating window</option>
        </Select>
      </div>
      <div className="row">
        <span>Sharp graphics on high-resolution screens (slower)</span>
        <input
          type="checkbox"
          checked={s.sharpGraphics}
          onChange={(e) => {
            update({ ...s, sharpGraphics: e.target.checked });
            window.dispatchEvent(new Event('resize'));
          }}
        />
      </div>
      <div className="row">
        <span>Show the tile grid (`)</span>
        <input type="checkbox" checked={s.showGrid} onChange={(e) => update({ ...s, showGrid: e.target.checked })} />
      </div>
      <div className="row">
        <span>Autosave every</span>
        <Select value={s.autosaveMinutes} onChange={(e) => update({ ...s, autosaveMinutes: Number(e.target.value) })}>
          {[1, 2, 5, 10].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </Select>
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
        <span>Smart order: move, chop, mine, farm, build, hunt an animal</span><span>Right-click</span>
        <span>Pan the camera</span><span>Middle-drag</span>
        <span>Zoom</span><span>Wheel</span>
        <h4>Orders (people selected, like Warcraft III)</h4>
        <span>Move, then click a spot</span><span>{k('move')}</span>
        <span>Stop</span><span>{k('stop')}</span>
        <span>Hold position</span><span>{k('hold')}</span>
        <span>Attack (hunt), then click an animal</span><span>{k('attack')}</span>
        <span>Gather, then click a tree, rock or bush</span><span>{k('harvest')}</span>
        <span>Build / Return goods / Train a main job</span><span>{k('build')} / {k('returnGoods')} / {k('trainRole')}</span>
        <span>Keep the order for another click</span><span>Shift + click</span>
        <span>With a building selected: Upgrade / Pause / Demolish</span><span>U / P / {k('demolish')}</span>
        <h4>Keyboard</h4>
        <span>Pan</span><span>{k('panUp')}, {k('panLeft')}, {k('panDown')}, {k('panRight')}</span>
        <span>Pause</span><span>{k('pause')}</span>
        <span>Speed</span><span>{k('speed1')} / {k('speed2')} / {k('speed3')}</span>
        <span>Build menu (categories on the command card)</span><span>{k('build')}</span>
        <span>Pick a category or building in the build menu</span><span>Q W E R / A S D F / Z X C V</span>
        <span>Find yourself, the ruler</span><span>{k('findRuler')}</span>
        <span>Rally the people (ruler selected)</span><span>{k('rally')}</span>
        <span>Survey for ore</span><span>{k('survey')}</span>
        <span>Jump to the Town Hall</span><span>{k('homeView')}</span>
        <span>People / Areas / Towns / Families / Realm / Goals</span><span>{k('winPeople')} {k('winAreas')} {k('winTowns')} {k('winFamilies')} {k('winRealm')} {k('winGoals')}</span>
        <span>All goods / Valley today / See more</span><span>{k('goods')} / {k('today')} / {k('seeMore')}</span>
        <span>Tile grid / health bars</span><span>{k('toggleGrid')} / {k('healthBars')}</span>
        <span>Scroll the map</span><span>Touch any screen edge with the mouse</span>
        <span>Mark / unmark for harvest (nobody selected)</span><span>{k('harvest')} / {k('unmark')}</span>
        <span>Full screen</span><span>{k('fullscreen')}</span>
        <span>Demolish selected building</span><span>{k('demolish')}</span>
        <span>Next idle settler</span><span>{k('nextIdle')}</span>
        <span>Select everyone</span><span>{k('selectAll')}</span>
        <span>Save</span><span>{k('save')} or Ctrl+S</span>
        <span>Cancel / menu</span><span>{k('cancel')}</span>
        <h4>The screen</h4>
        <span>Top: stores (Goods for the rest), windows, clock</span><span />
        <span>Bottom left: the minimap</span><span />
        <span>Bottom middle: what you selected — See more opens every detail</span><span />
        <span>Bottom right: the command card; hover a button to read it</span><span />
      </div>
      <div className="buttons">
        <button className="btn primary" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** What the player chose for a new world. */
export interface NewWorldChoice {
  rulerName: string;
  worldName: string;
  seed: string;
  habitat: HabitatId;
  tutorial: boolean;
}

const LAST_RULER = 'little-valley:last-ruler';

function lastRulerName(): string {
  try {
    return localStorage.getItem(LAST_RULER) ?? '';
  } catch {
    return '';
  }
}

/** A tiny painted swatch of a habitat for its card. */
function HabitatSwatch({ id }: { id: HabitatId }) {
  const [a, b, c] = HABITATS[id].colors;
  const mountains = id === 'highlands' ? 3 : 1;
  return (
    <svg className="habitat-swatch" viewBox="0 0 48 28" aria-hidden shapeRendering="crispEdges">
      <rect width="48" height="28" fill={a} />
      <rect y="18" width="48" height="10" fill={b} />
      {Array.from({ length: mountains }, (_, i) => (
        <polygon key={i} points={`${4 + i * 14},12 ${12 + i * 14},2 ${20 + i * 14},12`} fill="#8a8f96" stroke="#4a4f56" />
      ))}
      <polygon points="30,12 38,4 46,12" fill="#9aa0a6" stroke="#4a4f56" />
      <rect x="6" y="20" width="10" height="4" fill={c} />
      {id === 'forest' && [8, 18, 28, 38].map((x) => <rect key={x} x={x} y="14" width="5" height="7" fill="#1f4a2c" />)}
      {id === 'marsh' && <rect x="24" y="16" width="18" height="6" fill={c} />}
      {id === 'valley' && <rect x="36" y="12" width="4" height="16" fill={c} />}
    </svg>
  );
}

export function NewWorldModal({ onClose, onCreate }: { onClose: () => void; onCreate: (choice: NewWorldChoice) => void }) {
  const [rulerName, setRulerName] = useState(lastRulerName);
  const [worldName, setWorldName] = useState('Little Valley');
  const [seed, setSeed] = useState(String(randomSeed()));
  const [habitat, setHabitat] = useState<HabitatId>('valley');
  const [tutorial, setTutorial] = useState(true);
  const [tried, setTried] = useState(false);
  const missingName = !rulerName.trim();
  return (
    <Modal title="A new world" onClose={onClose}>
      <form
        className="stack new-world"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (missingName) return;
          try {
            localStorage.setItem(LAST_RULER, rulerName.trim());
          } catch {
            // Remembering the name is only a convenience.
          }
          onCreate({ rulerName: rulerName.trim(), worldName: worldName.trim() || 'Little Valley', seed, habitat, tutorial });
        }}
      >
        <label className="field">
          Your name — you will walk the map as its ruler
          <input
            type="text" value={rulerName} maxLength={24} onChange={(e) => setRulerName(e.target.value)} autoFocus
            placeholder="Type your name" aria-invalid={tried && missingName} required
          />
          {tried && missingName && <span className="reason">Every new world needs its ruler's name.</span>}
        </label>
        <label className="field">
          Name of your valley
          <input type="text" value={worldName} maxLength={40} onChange={(e) => setWorldName(e.target.value)} />
        </label>
        <fieldset className="habitats">
          <legend>Choose your land</legend>
          {HABITAT_IDS.map((id) => (
            <label key={id} className={`habitat-card${habitat === id ? ' on' : ''}`}>
              <input type="radio" name="habitat" value={id} checked={habitat === id} onChange={() => setHabitat(id)} />
              <HabitatSwatch id={id} />
              <span className="hc-name">{HABITATS[id].name}</span>
              <span className="hc-desc">{HABITATS[id].description}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          Seed (optional — the same seed and land always make the same world)
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
            Found the realm
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
