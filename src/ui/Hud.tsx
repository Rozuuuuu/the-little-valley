import { useState } from 'react';
import { BUILDINGS, type BuildingCategory, type BuildingId } from '../game/data/buildings';
import { CROPS, type CropId } from '../game/data/crops';
import { JOBS, JOB_IDS, type JobId } from '../game/data/jobs';
import { RECIPES } from '../game/data/recipes';
import { RESOURCES, type ResourceId } from '../game/data/resources';
import { invEntries } from '../game/sim/inventory';
import { SPEEDS, TUTORIAL_OUTRO } from '../engine/GameController';
import type { BuildingInfo, SettlerInfo } from '../engine/snapshot';
import { keyLabel } from '../input/bindings';
import { useGame, useSnapshot } from './context';
import { ResIcon, UiIcon } from './Icon';

const MAIN_RES: ResourceId[] = ['food', 'wood', 'stone'];
const CRAFTED: ResourceId[] = ['planks', 'tools'];

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { game } = useGame();
  const s = useSnapshot();
  const full = s.storage.capacity > 0 && s.storage.used >= s.storage.capacity;
  return (
    <div className="hud-top">
      <div className="panel resources" role="status" aria-label="Stores">
        {MAIN_RES.map((r) => (
          <div key={r} className={`res${r === 'food' && s.resources.food < 5 ? ' warn' : ''}`} title={RESOURCES[r].description}>
            <ResIcon res={r} />
            {s.resources[r]}
          </div>
        ))}
        {CRAFTED.map((r, i) => (
          <div key={r} className={`res${i === 0 ? ' sep' : ''}`} title={RESOURCES[r].description}>
            <ResIcon res={r} />
            {s.resources[r]}
          </div>
        ))}
        <div className="res sep" title={s.populationStatus || 'Settlers / beds'}>
          <UiIcon id="people" />
          {s.population}
          <small>/ {s.housing}</small>
        </div>
        <div className={`res sep${full ? ' warn' : ''}`} title={full ? 'Storage is full. Build a storehouse.' : 'Goods stored / capacity'}>
          <UiIcon id="storage" />
          <small>
            {s.storage.used}/{s.storage.capacity}
          </small>
        </div>
      </div>
      <div className="spacer" />
      <div className="panel clock">
        <UiIcon id={s.raining ? 'rain' : s.isNight ? 'moon' : 'sun'} />
        <div>
          <div className="time">
            Day {s.day} · {s.clock}
          </div>
          <div className="sub">
            {s.period}
            {s.raining ? ', raining' : ''} · {s.milestone.current}
          </div>
        </div>
        <div className="speed" role="group" aria-label="Game speed">
          <button className={`btn${s.paused ? ' on' : ''}`} onClick={() => game.togglePause()} title="Pause (Space)" aria-pressed={s.paused}>
            {s.paused ? '▶' : '❚❚'}
          </button>
          {SPEEDS.map((sp, i) => (
            <button key={sp} className={`btn${!s.paused && s.speed === sp ? ' on' : ''}`} onClick={() => game.setSpeed(i)} title={`${sp}× speed (${i + 1})`}>
              {sp}×
            </button>
          ))}
          <button className="btn" onClick={onMenu} title="Menu (Esc)">
            ☰
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const s = useSnapshot();
  return (
    <div className="toasts" aria-live="polite">
      {s.toasts.map((t) => (
        <div key={t.id} className={`panel toast ${t.level}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function PausedBanner() {
  const s = useSnapshot();
  if (!s.paused) return null;
  return <div className="panel paused-banner">Paused</div>;
}

export function HoverInfo() {
  const s = useSnapshot();
  if (!s.hover) return null;
  return <div className="panel hover-info">{s.hover}</div>;
}

export function Tutorial() {
  const { game } = useGame();
  const s = useSnapshot();
  if (s.tutorialOutro) {
    return (
      <div className="panel tutorial">
        <h3>Your valley awaits</h3>
        <p>{TUTORIAL_OUTRO}</p>
      </div>
    );
  }
  const t = s.tutorial;
  if (!t) return null;
  return (
    <div className="panel tutorial" aria-live="polite">
      <h3>{t.title}</h3>
      <p>{t.text}</p>
      <div className="foot">
        <div className="pips" aria-label={`Step ${t.index + 1} of ${t.total}`}>
          {Array.from({ length: t.total }, (_, i) => (
            <i key={i} className={i <= t.index ? 'on' : ''} />
          ))}
        </div>
        <button className="btn small" onClick={() => game.skipTutorial()}>
          Skip introduction
        </button>
      </div>
    </div>
  );
}

// ---- build dock --------------------------------------------------------------

const CATEGORIES: { id: BuildingCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'housing', label: 'Homes' },
  { id: 'farming', label: 'Farming' },
  { id: 'storage', label: 'Storage' },
  { id: 'production', label: 'Production' },
  { id: 'infrastructure', label: 'Paths' },
  { id: 'decor', label: 'Decor' },
  { id: 'project', label: 'Projects' },
];

function Cost({ id }: { id: BuildingId }) {
  const s = useSnapshot();
  const entries = invEntries(BUILDINGS[id].cost);
  if (entries.length === 0) return <div className="cost muted">Free</div>;
  return (
    <div className="cost">
      {entries.map(([r, n]) => (
        <span key={r} className={s.resources[r] < n ? 'short' : ''} title={`${n} ${RESOURCES[r].name}`}>
          <ResIcon res={r} size={14} />
          {n}
        </span>
      ))}
    </div>
  );
}

export function BuildDock({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { game, sprites } = useGame();
  const s = useSnapshot();
  const [cat, setCat] = useState<BuildingCategory | 'all'>('all');
  const [hover, setHover] = useState<BuildingId | null>(null);
  const mode = s.mode;
  const placing = mode.kind === 'place' ? mode.building : null;
  const b = game.settings.bindings;
  const items = [...s.unlocked.buildings.map((id) => ({ id, locked: null as string | null })), ...s.unlocked.locked.map((l) => ({ id: l.id, locked: l.at }))].filter(
    (i) => cat === 'all' || BUILDINGS[i.id].category === cat,
  );
  const shown = hover ?? placing;
  return (
    <div className="build-dock">
      {open && (
        <div className="panel build-menu" role="dialog" aria-label="Build menu">
          <div className="build-tabs">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={`chip${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="build-grid">
            {items.map(({ id, locked }) => (
              <button
                key={id}
                className={`build-item${placing === id ? ' on' : ''}${locked ? ' locked' : ''}`}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
                onClick={() => {
                  if (locked) {
                    game.toast(`${BUILDINGS[id].name} unlocks at ${locked}.`, 'info');
                    return;
                  }
                  game.startPlacing(id, mode.kind === 'place' ? mode.crop : 'turnip');
                  setOpen(false);
                }}
                aria-disabled={!!locked}
              >
                <img className="px" src={sprites.buildingPreview(id)} alt="" />
                <span className="name">{BUILDINGS[id].name}</span>
                {locked ? <span className="muted">At {locked}</span> : <Cost id={id} />}
              </button>
            ))}
          </div>
          <div className="build-desc">
            {shown
              ? `${BUILDINGS[shown].description}${BUILDINGS[shown].paint ? ' Drag to place many.' : ' Shift-click to place several.'}`
              : 'Choose something to build. Construction waits until haulers bring the materials.'}
          </div>
        </div>
      )}
      {!open && mode.kind === 'place' && (
        <div className="panel toolbar placing">
          <img className="px" src={sprites.buildingPreview(mode.building)} width={28} height={28} alt="" />
          <span>
            <strong>{BUILDINGS[mode.building].name}</strong>{' '}
            <span className="muted">{BUILDINGS[mode.building].paint ? 'Drag to place. Right-click or Esc when done.' : 'Click to place. Shift-click for more. Right-click cancels.'}</span>
          </span>
          {mode.building === 'field' && (
            <span className="crop-pick" style={{ marginTop: 0 }}>
              {s.unlocked.crops.map((c) => (
                <button key={c} className={`chip${mode.crop === c ? ' on' : ''}`} onClick={() => game.startPlacing('field', c)}>
                  {CROPS[c].name}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      <div className="panel toolbar">
        <button className={`btn tool${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          Build <kbd>{keyLabel(b.build[0])}</kbd>
        </button>
        <button className={`btn tool${mode.kind === 'mark' ? ' on' : ''}`} onClick={() => game.setMode(mode.kind === 'mark' ? { kind: 'select' } : { kind: 'mark' })} title="Drag over trees, rocks and bushes to mark them for harvest">
          Harvest <kbd>{keyLabel(b.harvest[0])}</kbd>
        </button>
        <button className={`btn tool${mode.kind === 'unmark' ? ' on' : ''}`} onClick={() => game.setMode(mode.kind === 'unmark' ? { kind: 'select' } : { kind: 'unmark' })} title="Drag to remove harvest marks">
          Unmark <kbd>{keyLabel(b.unmark[0])}</kbd>
        </button>
        {mode.kind !== 'select' && (
          <button className="btn tool" onClick={() => game.setMode({ kind: 'select' })}>
            Done <kbd>Esc</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

// ---- inspector ---------------------------------------------------------------

function Bar({ value, kind }: { value: number; kind?: string }) {
  return (
    <div className={`bar ${kind ?? ''}`} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

function JobSelect({ ids, value }: { ids: number[]; value: JobId | '' }) {
  const { game } = useGame();
  return (
    <select value={value} onChange={(e) => game.setJob(ids, e.target.value as JobId)} aria-label="Job">
      {value === '' && <option value="">Mixed jobs</option>}
      {JOB_IDS.map((j) => (
        <option key={j} value={j}>
          {JOBS[j].name}
        </option>
      ))}
    </select>
  );
}

function SettlerCard({ s }: { s: SettlerInfo }) {
  return (
    <>
      <h2>{s.name}</h2>
      <div className="row">
        <span className="muted">{JOBS[s.job].description}</span>
      </div>
      <div className="row">
        Job <JobSelect ids={[s.id]} value={s.job} />
      </div>
      <div className="row">
        <span>{s.task}</span>
        {s.carrying && (
          <span className="mat">
            <ResIcon res={s.carrying.res} size={18} /> {s.carrying.amount}
          </span>
        )}
      </div>
      {s.idle && <div className="reason">{s.idleReason}</div>}
      <div className="row">
        Fed <Bar value={s.hunger / 100} kind="food" />
      </div>
      <div className="row">
        Rested <Bar value={s.energy / 100} kind="energy" />
      </div>
      <div className="row muted">Sleeps in: {s.home}</div>
      <div className="muted">Right-click a tree, rock, field, site or spot to give an order.</div>
    </>
  );
}

function GroupCard({ list }: { list: SettlerInfo[] }) {
  const { game } = useGame();
  const job = list.every((s) => s.job === list[0].job) ? list[0].job : '';
  return (
    <>
      <h2>{list.length} settlers</h2>
      <div className="row">
        Set job for all <JobSelect ids={list.map((s) => s.id)} value={job} />
      </div>
      <div className="sel-list">
        {list.map((s) => (
          <button key={s.id} onClick={() => game.selectSettlers([s.id], true)}>
            <span>{s.name}</span>
            <span className={s.idle ? 'reason' : 'muted'}>{s.idle ? 'Idle' : s.task}</span>
          </button>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Right-click to order the whole group.
      </div>
    </>
  );
}

function BuildingCard({ info }: { info: BuildingInfo }) {
  const { game } = useGame();
  const s = useSnapshot();
  return (
    <>
      <h2>{info.name}</h2>
      <div className="muted">{info.description}</div>
      {!info.built && (
        <>
          <div className="row">
            Construction <Bar value={info.progress} />
          </div>
          {info.materials.length > 0 && (
            <div className="mats">
              {info.materials.map((m) => (
                <div key={m.res} className={`mat${m.have >= m.need ? ' done' : ''}`}>
                  <ResIcon res={m.res} size={18} /> {m.have}/{m.need}
                  {m.incoming > 0 && <span className="muted"> (+{m.incoming})</span>}
                </div>
              ))}
            </div>
          )}
          <div className="reason">{info.status}</div>
        </>
      )}
      {info.field && (
        <>
          <div className="row">
            <span>{info.field.state}</span>
            <div className="stage-dots" aria-label={`Stage ${info.field.stage} of ${info.field.stages}`}>
              {Array.from({ length: info.field.stages }, (_, i) => (
                <i key={i} className={i < info.field!.stage ? 'on' : ''} />
              ))}
            </div>
          </div>
          {info.field.ripeIn && <div className="row muted">Ripe in {info.field.ripeIn}</div>}
          <div className="row">
            Moisture <Bar value={info.field.moisture} kind="water" />
          </div>
          <div className="row muted">{info.status}</div>
          <div className="row">
            Crop
            <select value={info.field.crop ?? ''} onChange={(e) => game.setCrop(info.ids, (e.target.value || null) as CropId | null)} aria-label="Crop">
              <option value="">Leave fallow</option>
              {s.unlocked.crops.map((c) => (
                <option key={c} value={c}>
                  {CROPS[c].name} ({CROPS[c].yield.food} food)
                </option>
              ))}
            </select>
          </div>
          {info.ids.length === 1 && <div className="muted">Drag a box over empty fields to select many.</div>}
        </>
      )}
      {info.storage && (
        <>
          <div className="row">
            Stored <Bar value={info.storage.used / info.storage.capacity} />
            <span className="muted">
              {info.storage.used}/{info.storage.capacity}
            </span>
          </div>
          <div className="mats">
            {info.storage.entries.map(([r, n]) => (
              <div key={r} className="mat">
                <ResIcon res={r} size={18} /> {n} {RESOURCES[r].name.toLowerCase()}
              </div>
            ))}
          </div>
        </>
      )}
      {info.residents && (
        <div className="row muted">
          {info.type === 'camp' ? 'Sleeping in tents' : `Residents (${info.residents.names.length}/${info.residents.capacity})`}: {info.residents.names.join(', ') || 'nobody yet'}
        </div>
      )}
      {info.workshop && (
        <>
          <div className="row">
            Recipe
            <select value={info.workshop.recipe ?? ''} onChange={(e) => game.setRecipe(info.ids[0], (e.target.value || null) as never)} aria-label="Recipe">
              <option value="">None</option>
              {info.workshop.recipes.map((r) => (
                <option key={r} value={r}>
                  {RECIPES[r].name}: {invEntries(RECIPES[r].inputs).map(([res, n]) => `${n} ${res}`).join(' + ')} → {invEntries(RECIPES[r].outputs).map(([res, n]) => `${n} ${res}`).join(', ')}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            Progress <Bar value={info.workshop.progress} />
          </div>
          {info.workshop.buffer.length > 0 && (
            <div className="row muted">
              Inputs on hand: {info.workshop.buffer.map(([r, n]) => `${n} ${r}`).join(', ')}
            </div>
          )}
          <div className="reason">{info.workshop.status}</div>
        </>
      )}
      <div className="actions">
        {info.workshop && (
          <button className="btn small" onClick={() => game.toggleWorkshop(info.ids[0])}>
            {info.workshop.paused ? 'Resume' : 'Pause'} work
          </button>
        )}
        {info.canRemove && (
          <button className="btn small danger" onClick={() => game.removeBuildings(info.ids)}>
            {info.built ? 'Demolish' : 'Cancel'} {info.ids.length > 1 ? `(${info.ids.length})` : ''}
          </button>
        )}
      </div>
    </>
  );
}

export function Inspector() {
  const s = useSnapshot();
  if (s.selection.length === 1) {
    return (
      <div className="panel inspector">
        <SettlerCard s={s.selection[0]} />
      </div>
    );
  }
  if (s.selection.length > 1) {
    return (
      <div className="panel inspector">
        <GroupCard list={s.selection} />
      </div>
    );
  }
  if (s.building) {
    return (
      <div className="panel inspector">
        <BuildingCard info={s.building} />
      </div>
    );
  }
  return null;
}

// ---- side drawer -------------------------------------------------------------

export function SidePanel() {
  const { game } = useGame();
  const s = useSnapshot();
  const [tab, setTab] = useState<'people' | 'goals' | null>('goals');
  if (!tab) {
    return (
      <div className="side-toggle">
        <button className="btn" onClick={() => setTab('people')}>
          Settlers {s.idleCount > 0 && `(${s.idleCount} idle)`}
        </button>
      </div>
    );
  }
  const selected = new Set(s.selection.map((x) => x.id));
  const next = s.milestone.next;
  return (
    <div className="panel side">
      <div className="side-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>
          Settlers {s.idleCount > 0 ? `· ${s.idleCount} idle` : ''}
        </button>
        <button role="tab" aria-selected={tab === 'goals'} className={tab === 'goals' ? 'on' : ''} onClick={() => setTab('goals')}>
          Goals
        </button>
        <button onClick={() => setTab(null)} aria-label="Hide panel" style={{ flex: '0 0 34px' }}>
          ✕
        </button>
      </div>
      <div className="side-body">
        {tab === 'people' && (
          <>
            {s.settlers.map((p) => (
              <button key={p.id} className={`settler-row${selected.has(p.id) ? ' sel' : ''}`} onClick={() => game.selectSettlers([p.id], true)}>
                <span className="nm">{p.name}</span>
                <span className="jb">{JOBS[p.job].name}</span>
                <span className={`tk${p.idle ? ' idle' : ''}`}>{p.idle ? p.idleReason : p.task}</span>
              </button>
            ))}
            <p className="muted">{s.populationStatus}</p>
          </>
        )}
        {tab === 'goals' && (
          <>
            <h3>{s.milestone.current}</h3>
            {next ? (
              <>
                <p className="muted" style={{ marginTop: 4 }}>
                  Next: <strong style={{ color: 'var(--straw)' }}>{next.name}</strong>. {next.description}
                </p>
                {next.future ? (
                  <p className="muted">This stage arrives in a future update. Keep building. There is no cap on how big your valley can grow.</p>
                ) : (
                  next.reqs.map((r) => (
                    <div key={r.label} className={`req${r.done ? ' done' : ''}`}>
                      <span className="box" />
                      <span>
                        {r.label} {!r.done && <span className="muted">({r.current}/{r.target})</span>}
                      </span>
                    </div>
                  ))
                )}
                <p className="muted">Unlocks: {next.unlocks.join(', ')}</p>
              </>
            ) : (
              <p className="muted">Every milestone reached.</p>
            )}
            <p className="muted">{s.populationStatus}</p>
            {s.wellEquipped && <p className="muted">Well equipped: tools for everyone speed up work by 25%.</p>}
          </>
        )}
      </div>
    </div>
  );
}
