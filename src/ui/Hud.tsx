import { useEffect, useState } from 'react';
import { BUILDINGS, type BuildingCategory, type BuildingId } from '../game/data/buildings';
import { CROPS, type CropId } from '../game/data/crops';
import { JOBS, JOB_IDS, type JobId } from '../game/data/jobs';
import { RECIPES } from '../game/data/recipes';
import { RESOURCES, type ResourceId } from '../game/data/resources';
import { invEntries } from '../game/sim/inventory';
import { SPEEDS, TUTORIAL_OUTRO } from '../engine/GameController';
import type { BuildingInfo, SettlerInfo } from '../engine/snapshot';
import type { RequirementProgress } from '../game/sim/progression';
import { WORK_KINDS, WORK_LABELS } from '../game/sim/priorities';
import { AREA_LABELS } from '../game/sim/commands';
import type { AreaKind } from '../game/sim/types';
import { AREA_COLORS, AREA_SYMBOL } from '../render/Renderer';
import type { WorkKind } from '../game/data/jobs';
import { keyLabel } from '../input/bindings';
import { useGame, useSnapshot } from './context';
import { ResIcon, UiIcon } from './Icon';
import { Households } from './Households';
import { Travelers } from './Travelers';

const MAIN_RES: ResourceId[] = ['food', 'wood', 'stone'];
const CRAFTED: ResourceId[] = ['apples', 'wheat', 'flour', 'planks', 'tools'];

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
            {s.region.calendar} · {s.clock}
          </div>
          <div className="sub">
            {s.period}
            {s.raining ? (s.region.calendar.startsWith('Winter') ? ', snowing' : ', raining') : ''} · {s.milestone.current}
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
          <button className="btn" onClick={() => game.openOverview()} title="Valley today: issues and ideas">
            Today
          </button>
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

function WorkOrder({ s }: { s: SettlerInfo }) {
  const { game } = useGame();
  const order = s.priorities;
  const off = WORK_KINDS.filter((k) => !order.includes(k));
  const set = (next: WorkKind[]) => game.setPriorities([s.id], next);
  return (
    <div className="work-order">
      <div className="row">
        <span>Work order{s.customOrder ? '' : ` (${JOBS[s.job].name} default)`}</span>
        {s.customOrder && (
          <button className="btn small" onClick={() => game.setPriorities([s.id], null)}>
            Reset
          </button>
        )}
      </div>
      <ol className="order-list">
        {order.map((k, i) => (
          <li key={k}>
            <span className="rank">{i + 1}</span>
            <span className="kind">{WORK_LABELS[k]}</span>
            <button className="btn small" disabled={i === 0} onClick={() => set(order.map((x, j) => (j === i - 1 ? k : j === i ? order[i - 1] : x)))} aria-label={`Move ${WORK_LABELS[k]} earlier`}>
              ↑
            </button>
            <button className="btn small" disabled={i === order.length - 1} onClick={() => set(order.map((x, j) => (j === i + 1 ? k : j === i ? order[i + 1] : x)))} aria-label={`Move ${WORK_LABELS[k]} later`}>
              ↓
            </button>
            <button className="btn small" onClick={() => set(order.filter((x) => x !== k))} aria-label={`Turn off ${WORK_LABELS[k]}`}>
              Off
            </button>
          </li>
        ))}
      </ol>
      {off.length > 0 && (
        <div className="row muted">
          Off:
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {off.map((k) => (
              <button key={k} className="chip" onClick={() => set([...order, k])}>
                + {WORK_LABELS[k]}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function AreaSelect({ ids, value }: { ids: number[]; value: number | null | '' }) {
  const { game } = useGame();
  const s = useSnapshot();
  return (
    <select
      value={value === null ? 'none' : String(value)}
      onChange={(e) => game.dispatch({ type: 'assignArea', ids, areaId: e.target.value === 'none' ? null : Number(e.target.value) })}
      aria-label="Work area"
    >
      {value === '' && <option value="">Mixed</option>}
      <option value="none">No work area</option>
      {s.areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} ({a.kindName}, {a.workers.length}/{a.max})
        </option>
      ))}
    </select>
  );
}

function SettlerCard({ s }: { s: SettlerInfo }) {
  const { game } = useGame();
  return (
    <>
      <h2>{s.name}</h2>
      <div className="row">
        Job <JobSelect ids={[s.id]} value={s.job} />
      </div>
      <div className="row">
        Work area <AreaSelect ids={[s.id]} value={s.areaId} />
      </div>
      {s.workplace && <div className="row muted">Works at the {s.workplace.toLowerCase()}</div>}
      <div className="row">
        <span>{s.task}</span>
        {s.carrying && (
          <span className="mat">
            <ResIcon res={s.carrying.res} size={18} /> {s.carrying.amount}
          </span>
        )}
      </div>
      {s.idle && <div className="reason">⚠ {s.idleReason}</div>}
      <div className="row">
        Fed <Bar value={s.hunger / 100} kind="food" /> <span className="muted">{s.hunger < 15 ? 'Hungry: slower' : ''}</span>
      </div>
      <div className="row">
        Rested <Bar value={s.energy / 100} kind="energy" /> <span className="muted">{s.energy < 15 ? 'Tired: slower' : ''}</span>
      </div>
      <div className="row">
        <span>Bed: {s.home}</span>
        {s.homeId !== null && (
          <button className="btn small" onClick={() => game.focusBuildingById(s.homeId!)}>
            Show home
          </button>
        )}
      </div>
      {s.bedNote && <div className="muted">{s.bedNote}</div>}
      <div className="muted">
        {s.age}
        {s.partner ? ` · household with ${s.partner}` : ''}
      </div>
      <WorkOrder s={s} />
      <div className="muted">Right-click a tree, rock, field, site or spot to give a direct order. They go back to this routine afterwards.</div>
    </>
  );
}

function GroupCard({ list }: { list: SettlerInfo[] }) {
  const { game } = useGame();
  const job = list.every((s) => s.job === list[0].job) ? list[0].job : '';
  const area = list.every((s) => s.areaId === list[0].areaId) ? list[0].areaId : '';
  return (
    <>
      <h2>{list.length} settlers</h2>
      <div className="row">
        Set job for all <JobSelect ids={list.map((s) => s.id)} value={job} />
      </div>
      <div className="row">
        Work area <AreaSelect ids={list.map((s) => s.id)} value={area} />
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
      {info.span && <div className="row muted">Spans {info.span.length} tiles of water.{info.permanent ? ' Permanent once built.' : ''}</div>}
      {!info.built && (
        <>
          <div className="row">
            Construction <Bar value={info.progress} />
            <span className="muted">{Math.round(info.progress * 100)}%</span>
          </div>
          {info.materials.length > 0 && (
            <div className="mats">
              {info.materials.map((m) => (
                <div key={m.res} className={`mat${m.have >= m.need ? ' done' : ''}`}>
                  <ResIcon res={m.res} size={18} /> {m.have}/{m.need}
                  {m.incoming > 0 && <span className="muted"> (+{m.incoming} coming)</span>}
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
                  {CROPS[c].name} ({invEntries(CROPS[c].yield).map(([r, n]) => `${n} ${r}`).join(', ')})
                </option>
              ))}
            </select>
          </div>
          {info.ids.length === 1 && <div className="muted">Drag a box over fields to select many.</div>}
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
        <div className="residents">
          <div className="row">
            <span>{info.residents.temporary ? 'Camp bedrolls' : 'Beds'}</span>
            <span className="beds" aria-label={`${info.residents.people.length} of ${info.residents.capacity} beds taken`}>
              {Array.from({ length: info.residents.capacity }, (_, i) => (
                <i key={i} className={i < info.residents!.people.length ? 'on' : i < info.residents!.people.length + info.residents!.held.length ? 'held' : ''} />
              ))}
              <span className="muted">
                {' '}
                {info.residents.people.length}/{info.residents.capacity}
              </span>
            </span>
          </div>
          <div className="muted">
            {info.residents.people.length
              ? info.residents.people.map((p) => `${p.name}${p.asleep ? ' (asleep)' : ''}`).join(', ')
              : 'Nobody lives here yet.'}
          </div>
          {info.residents.held.map((h) => (
            <div key={h} className="muted">
              1 bed · {h}
            </div>
          ))}
          {info.residents.temporary && <div className="muted">Bedrolls are temporary: settlers move into house beds as soon as they free up.</div>}
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
          <div className="row muted">
            Inputs on hand: {info.workshop.buffer.length ? info.workshop.buffer.map(([r, n]) => `${n} ${r}`).join(', ') : 'none'}
          </div>
          {info.workers && (
            <div className="row">
              <span>
                Workers {info.workers.people.length}/{info.workers.max}
              </span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {info.workers.people.map((p) => (
                  <button key={p.id} className="chip" onClick={() => game.dispatch({ type: 'unassignWorker', buildingId: info.ids[0], settlerId: p.id })} title="Unassign">
                    {p.name} ✕
                  </button>
                ))}
                {info.workers.people.length === 0 && <span className="muted">Anyone with Craft in their work order</span>}
              </span>
            </div>
          )}
          <div className="reason">{/^(Grind|Saw|Craft|Bake|Worker on|Ready)/.test(info.workshop.status) ? '' : '⚠ '}{info.workshop.status}</div>
          {info.workers && info.workers.people.length < info.workers.max && s.selection.length > 0 && (
            <button className="btn small" onClick={() => game.dispatch({ type: 'assignWorker', buildingId: info.ids[0], ids: s.selection.map((x) => x.id) })}>
              Assign selected settler
            </button>
          )}
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
  let body: React.ReactNode = null;
  if (s.selection.length === 1) body = <SettlerCard s={s.selection[0]} />;
  else if (s.selection.length > 1) body = <GroupCard list={s.selection} />;
  else if (s.building) body = <BuildingCard info={s.building} />;
  if (!body) return null;
  // Keep the map clear while placing buildings or drawing areas.
  if (s.mode.kind === 'place' || s.mode.kind === 'area') return null;
  return <div className="panel inspector">{body}</div>;
}

// ---- side drawer -------------------------------------------------------------

function RequirementRow({ r }: { r: RequirementProgress }) {
  return (
    <>
      <div className={`req${r.done ? ' done' : ''}`}>
        <span className="box" aria-hidden />
        <span>
          {r.label} {!r.done && <span className="muted">({r.current}/{r.target})</span>}
          <span className="sr-only">{r.done ? ' done' : ' not done'}</span>
        </span>
      </div>
      {r.options && (
        <div className="req-options">
          {r.options.map((o) => (
            <div key={o.label} className={`req small${o.done ? ' done' : ''}`}>
              <span className="box" aria-hidden />
              <span>
                {o.label} {!o.done && <span className="muted">({o.current}/{o.target})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AreasTab() {
  const { game } = useGame();
  const s = useSnapshot();
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const selected = s.selection.map((x) => x.id);
  const kinds: AreaKind[] = ['farm', 'wood', 'stone', 'build'];
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Draw an area, then assign settlers. They do the area's work first and fall back to their work order.
      </p>
      <div className="area-new">
        {kinds.map((k) => (
          <button key={k} className={`btn small${s.mode.kind === 'area' && s.mode.areaKind === k && s.mode.editId === null ? ' on' : ''}`} onClick={() => game.startArea(k)} title={AREA_LABELS[k].does}>
            + {AREA_LABELS[k].name}
          </button>
        ))}
      </div>
      {s.mode.kind === 'area' && <p className="reason">Drag on the map to {s.mode.editId === null ? 'draw the area' : 'redraw it'}. Right-click or Esc cancels.</p>}
      {s.areas.length === 0 && <p className="muted">No work areas yet.</p>}
      {s.areas.map((a) => (
        <div key={a.id} className={`area-card${s.selectedArea === a.id ? ' sel' : ''}`}>
          <button className="area-head" onClick={() => game.selectArea(a.id, true)}>
            <span className="swatch" style={{ borderColor: AREA_COLORS[a.kind] }}>
              {AREA_SYMBOL[a.kind]}
            </span>
            <span className="nm">{a.name}</span>
            <span className="muted">
              {a.workers.length}/{a.max}
            </span>
          </button>
          {s.selectedArea === a.id && (
            <div className="area-body">
              <div className="muted">
                {a.kindName} · {a.size} tiles · {a.does}.
              </div>
              <div className={a.status.includes('No') || a.status.includes('nobody') ? 'reason' : 'muted'}>{a.status}</div>
              <div className="muted">Workers: {a.workers.map((w) => w.name).join(', ') || 'none'}</div>
              {editing === a.id ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    game.dispatch({ type: 'updateArea', areaId: a.id, name });
                    setEditing(null);
                  }}
                >
                  <input type="text" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Area name" />
                  <button className="btn small primary" type="submit">
                    Save
                  </button>
                </form>
              ) : null}
              <div className="actions">
                <button className="btn small primary" disabled={selected.length === 0} onClick={() => game.dispatch({ type: 'assignArea', ids: selected, areaId: a.id })}>
                  Assign selected{selected.length ? ` (${selected.length})` : ''}
                </button>
                <button className="btn small" onClick={() => { setEditing(a.id); setName(a.name); }}>
                  Rename
                </button>
                <button className="btn small" onClick={() => game.startArea(a.kind, a.id)}>
                  Redraw
                </button>
                <select value={a.kind} onChange={(e) => game.dispatch({ type: 'updateArea', areaId: a.id, kind: e.target.value as AreaKind })} aria-label="Area kind">
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {AREA_LABELS[k].name}
                    </option>
                  ))}
                </select>
                <button className="btn small danger" onClick={() => game.dispatch({ type: 'deleteArea', areaId: a.id })}>
                  Remove
                </button>
              </div>
              {a.workers.length > 0 && (
                <div className="actions">
                  {a.workers.map((w) => (
                    <button key={w.id} className="chip" onClick={() => game.dispatch({ type: 'assignArea', ids: [w.id], areaId: null })} title="Unassign">
                      {w.name} ✕
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export function SidePanel() {
  const { game } = useGame();
  const s = useSnapshot();
  const [tab, setTab] = useState<'people' | 'areas' | 'towns' | 'families' | 'goals' | null>('goals');
  useEffect(() => {
    game.areasTabOpen = tab === 'areas';
  }, [tab, game]);
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
          Settlers{s.idleCount > 0 && <span className="badge" title={`${s.idleCount} idle`}>{s.idleCount}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'areas'} className={tab === 'areas' ? 'on' : ''} onClick={() => setTab('areas')}>
          Areas
        </button>
        <button role="tab" aria-selected={tab === 'towns'} className={tab === 'towns' ? 'on' : ''} onClick={() => setTab('towns')}>Towns</button>
        <button role="tab" aria-selected={tab === 'families'} className={tab === 'families' ? 'on' : ''} onClick={() => setTab('families')}>
          Families{s.growth.visitor && <span className="badge" title={`${s.growth.visitor.name} is visiting`}>!</span>}
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
                <span className="jb">{p.child ? 'Child' : p.areaName || JOBS[p.job].name}</span>
                <span className={`tk${p.idle ? ' idle' : ''}`}>{p.idle ? `⚠ ${p.idleReason}` : p.task}</span>
              </button>
            ))}
            <p className="muted">{s.beds}</p>
            <p className="muted">{s.populationStatus}</p>
          </>
        )}
        {tab === 'areas' && <AreasTab />}
        {tab === 'families' && (
          <>
            <Travelers />
            <Households />
          </>
        )}
        {tab === 'towns' && <>
          <h3>{s.region.calendar}</h3><p>{s.region.seasonNote}</p><p>{s.region.forecast}</p>
          <p className="muted">After Village, build a waystation at least 24 tiles from another centre. Assign selected settlers here, then add homes and local work areas. Connect centres with paths and bridges.</p>
          {s.region.towns.map(t => <section key={t.id}>
            <button className="btn" onClick={() => game.focusBuilding(t.id)}>{t.name} · {t.people.length} settlers</button>
            <label>Settlement name <input aria-label={`Rename ${t.name}`} key={t.name} defaultValue={t.name} maxLength={40} onBlur={e => { if(e.target.value.trim() !== t.name) game.dispatch({type:'renameSettlement', settlementId:t.id, name:e.target.value}); }} /></label>
            <p className="muted">{t.people.join(', ') || 'No residents yet'} · {t.linked ? 'Road connected' : 'No road connection'}</p>
            <button className="btn small" disabled={!s.selection.length} onClick={() => game.dispatch({type:'assignSettlement', ids:s.selection.map(p => p.id), settlementId:t.id})}>Assign {s.selection.length} selected settlers</button>
            <p>Centre food: {t.food} · target {t.target}</p>
            <label>Food to keep <input type="number" min="0" max="150" key={`${t.id}-${t.target}`} defaultValue={t.target} onBlur={e => game.dispatch({type:'setWants', buildingId:t.id, res:'food', amount:Number(e.target.value)})} /></label>
            <p className="muted">Haulers bring surplus from other stores. Targets reserve local supplies; keep room for incoming goods.</p>
          </section>)}
        </>}
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
                  next.reqs.map((r) => <RequirementRow key={r.label} r={r} />)
                )}
                <p className="muted">Unlocks: {next.unlocks.join(', ')}</p>
              </>
            ) : (
              <p className="muted">Every milestone reached.</p>
            )}
            <p className="muted">{s.beds}</p>
            <p className="muted">{s.populationStatus}</p>
            {s.wellEquipped && <p className="muted">Well equipped: tools for everyone speed up work by 25%.</p>}
            <button className="btn small" onClick={() => game.openOverview()}>
              Open “Valley today”
            </button>
          </>
        )}
      </div>
    </div>
  );
}
