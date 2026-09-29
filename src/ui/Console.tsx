import { useEffect, useRef, useState } from 'react';
import { BUILDINGS, CATEGORY_INFO, CATEGORY_ORDER, type BuildingCategory, type BuildingId } from '../game/data/buildings';
import { CROPS } from '../game/data/crops';
import { HALL_LEVEL_NAMES, JOBS, JOB_IDS, type JobId } from '../game/data/jobs';
import { RESOURCES, type Inventory } from '../game/data/resources';
import { invEntries } from '../game/sim/inventory';
import { keyLabel } from '../input/bindings';
import { Minimap } from '../render/Minimap';
import type { BuildingInfo, SettlerInfo } from '../engine/snapshot';
import { useGame, useSnapshot } from './context';
import { ResIcon } from './Icon';
import { BuildingCard, GroupCard, SettlerCard } from './Hud';

/** What the command card shows: its own commands, the build categories, or one category. */
export type CardMenu = null | 'build' | 'train' | BuildingCategory;

/** A glyph for each role on the Train menu. */
const ROLE_GLYPH: Record<JobId, string> = {
  laborer: '⚒', farmer: '🌾', gatherer: '🧺', builder: '🔨', hauler: '📦', crafter: '⚙',
  hunter: '🏹', herder: '🐑', traveler: '🧭', messenger: '✉', chief: '🎖',
};

/** Whether people can be sent to learn a role: adults who aren't soldiers or the ruler. */
function trainable(p: SettlerInfo): boolean {
  return !p.child && !p.ruler;
}
export type WindowTab = 'people' | 'areas' | 'towns' | 'families' | 'realm' | 'goals';

/** The command card's 4×3 grid answers to these keys while a build menu is open (Warcraft-style). */
const GRID_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
const BACK_SLOT = 11;

interface Cmd {
  id: string;
  label: string;
  icon?: string;
  glyph?: string;
  /** Key shown on the button (KeyboardEvent.code). */
  hotkey?: string;
  on?: boolean;
  disabled?: boolean;
  badge?: string | number;
  tip: { title: string; body?: string; cost?: Inventory; note?: string };
  run: () => void;
}

function Bar({ value, kind }: { value: number; kind?: string }) {
  return (
    <div className={`bar ${kind ?? ''}`} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

// ---- minimap -------------------------------------------------------------------

function ConsoleMinimap() {
  const { game } = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState({ settlers: true, areas: true, buildings: true });
  const [zoom, setZoom] = useState(2);
  useEffect(() => {
    if (!ref.current) return;
    const m = new Minimap(ref.current);
    m.layers = layers;
    m.scale = zoom;
    game.minimap = m;
    return () => {
      if (game.minimap === m) game.minimap = null;
    };
  }, [game, layers, zoom]);
  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] });
  return (
    <div className="con-map">
      <canvas
        ref={ref}
        width={212}
        height={120}
        className="minimap-canvas"
        aria-label="Minimap: click to move the camera"
        onMouseDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          game.minimapClick(((e.clientX - r.left) * e.currentTarget.width) / r.width, ((e.clientY - r.top) * e.currentTarget.height) / r.height);
        }}
      />
      <div className="mm-row">
        <button className={`chip${layers.settlers ? ' on' : ''}`} onClick={() => toggle('settlers')} aria-pressed={layers.settlers} title="Show people on the minimap">
          Ppl
        </button>
        <button className={`chip${layers.buildings ? ' on' : ''}`} onClick={() => toggle('buildings')} aria-pressed={layers.buildings} title="Show buildings on the minimap">
          Bld
        </button>
        <button className={`chip${layers.areas ? ' on' : ''}`} onClick={() => toggle('areas')} aria-pressed={layers.areas} title="Show work areas on the minimap">
          Area
        </button>
        <button className="chip" onClick={() => setZoom(zoom === 2 ? 1 : zoom === 1 ? 3 : 2)} title="Minimap zoom">
          {zoom === 1 ? 'Far' : zoom === 2 ? 'Mid' : 'Near'}
        </button>
        <button className="chip" onClick={() => game.findNext('home')} title="Jump to the settlement centre">
          ⌂
        </button>
      </div>
    </div>
  );
}

/** The See more key, as the player bound it. */
function MoreKey() {
  const { game } = useGame();
  return <kbd>{keyLabel(game.settings.bindings.seeMore[0])}</kbd>;
}

// ---- info panel ------------------------------------------------------------------

function Portrait({ src, big }: { src: string; big?: boolean }) {
  return (
    <div className={`portrait${big ? ' big' : ''}`}>
      <img className="px" src={src} alt="" />
    </div>
  );
}

function SettlerInfoPanel({ p, onMore }: { p: SettlerInfo; onMore: () => void }) {
  const { sprites } = useGame();
  const s = useSnapshot();
  if (p.ruler && s.ruler) {
    return (
      <div className="con-info-row">
        <Portrait src={sprites.portrait(p.appearance, true)} big />
        <div className="con-text">
          <div className="con-title">
            <strong>{p.name}</strong>
            <span className="level-pip">You</span>
            <span className="muted">{s.ruler.title}</span>
          </div>
          <div className="con-task">{p.task}</div>
          <div className="con-bars">
            <span>Fed</span> <Bar value={p.hunger / 100} kind="food" />
            <span>Rested</span> <Bar value={p.energy / 100} kind="energy" />
          </div>
          <div className="muted con-line">Royal presence: everyone within 8 tiles works 20% faster.</div>
          <div className="muted con-line">{s.ruler.rallyIn ? `Rally ready in ${s.ruler.rallyIn}` : 'Rally is ready (R): nearby people work 30% faster for an hour.'}</div>
        </div>
        <button className="btn small see-more" onClick={onMore}>
          See more <MoreKey />
        </button>
      </div>
    );
  }
  return (
    <div className="con-info-row">
      <Portrait src={sprites.portrait(p.appearance)} big />
      <div className="con-text">
        <div className="con-title">
          <strong>{p.name}</strong>
          <span className="muted">{p.child ? 'Child' : JOBS[p.job].name}{p.areaName ? ` · ${p.areaName}` : ''}</span>
        </div>
        {p.training && (
          <div className="con-task">
            Training as {JOBS[p.training.role].name} — {p.training.pct}%
          </div>
        )}
        <div className={p.idle ? 'reason' : 'con-task'}>{p.idle ? `⚠ ${p.idleReason}` : p.task}</div>
        <div className="con-bars">
          <span>Health</span> <Bar value={p.hp / 100} kind="hp" />
          <span>Fed</span> <Bar value={p.hunger / 100} kind="food" />
          <span>Rested</span> <Bar value={p.energy / 100} kind="energy" />
        </div>
        <div className="muted con-line">
          {p.carrying && (
            <span className="mat">
              <ResIcon res={p.carrying.res} size={16} /> {p.carrying.amount} ·{' '}
            </span>
          )}
          Bed: {p.home}
          {p.partner ? ` · household with ${p.partner}` : ''}
        </div>
      </div>
      <button className="btn small see-more" onClick={onMore}>
        See more <MoreKey />
      </button>
    </div>
  );
}

function GroupInfoPanel({ list, onMore }: { list: SettlerInfo[]; onMore: () => void }) {
  const { game, sprites } = useGame();
  const idle = list.filter((p) => p.idle).length;
  return (
    <div className="con-info-row">
      <div className="con-text">
        <div className="con-title">
          <strong>{list.length} selected</strong>
          <span className="muted">{idle ? `${idle} idle` : 'all busy'}</span>
        </div>
        <div className="group-grid">
          {list.slice(0, 24).map((p) => (
            <button key={p.id} className={`group-cell${p.idle ? ' idle' : ''}`} onClick={() => game.selectSettlers([p.id], true)} title={`${p.name}: ${p.idle ? p.idleReason : p.task}`}>
              <img className="px" src={sprites.portrait(p.appearance, p.ruler)} alt={p.name} />
              <i style={{ width: `${p.hunger}%` }} />
            </button>
          ))}
          {list.length > 24 && <span className="muted">+{list.length - 24}</span>}
        </div>
      </div>
      <button className="btn small see-more" onClick={onMore}>
        See more <MoreKey />
      </button>
    </div>
  );
}

function buildingHeadline(b: BuildingInfo): string {
  if (!b.built) return b.status;
  if (b.workshop) return b.workshop.status;
  if (b.extraction) return b.extraction.status;
  if (b.field) return b.field.state;
  if (b.orchard) return b.orchard;
  if (b.hall?.training.length) return `Training: ${b.hall.training.map((t) => `${t.name} → ${JOBS[t.role].name} ${t.pct}%`).join(', ')}`;
  if (b.hall) return `${b.residents ? `${b.residents.people.length}/${b.residents.capacity} bunks · ` : ''}Teaches ${b.hall.teaches.length} roles · select people and press Train`;
  if (b.residents) return `${b.residents.people.length}/${b.residents.capacity} ${b.residents.temporary ? 'bunks' : 'beds'} taken`;
  return b.status || b.description;
}

function BuildingInfoPanel({ b, onMore }: { b: BuildingInfo; onMore: () => void }) {
  const { sprites } = useGame();
  return (
    <div className="con-info-row">
      <Portrait src={sprites.buildingPreview(b.type)} big />
      <div className="con-text">
        <div className="con-title">
          <strong>
            {b.name}
            {b.ids.length > 1 ? ` ×${b.ids.length}` : ''}
          </strong>
          {b.level && (
            <span className="level-pip" title={b.level.next ? `Next: ${b.level.next.name}` : 'Highest level'}>
              Level {b.level.level}/{b.level.max}
            </span>
          )}
        </div>
        <div className="con-task">{buildingHeadline(b)}</div>
        {!b.built && (
          <div className="con-bars">
            <span>Built</span> <Bar value={b.progress} />
          </div>
        )}
        {b.built && b.storage && (
          <div className="con-bars">
            <span>Stored</span> <Bar value={b.storage.used / Math.max(1, b.storage.capacity)} />
            <span className="muted">
              {b.storage.used}/{b.storage.capacity}
            </span>
          </div>
        )}
        {b.built && b.workshop && (
          <div className="con-bars">
            <span>Work</span> <Bar value={b.workshop.progress} />
          </div>
        )}
        {b.level?.upgrading && (
          <div className="con-bars">
            <span>Upgrading</span> <Bar value={b.level.upgrading.progress} />
          </div>
        )}
        {b.workers && (
          <div className="muted con-line">
            Workers {b.workers.people.length}/{b.workers.max}
            {b.workers.people.length ? `: ${b.workers.people.map((p) => p.name).join(', ')}` : ''}
          </div>
        )}
      </div>
      <button className="btn small see-more" onClick={onMore}>
        See more <MoreKey />
      </button>
    </div>
  );
}

function ValleyInfoPanel({ onGoals }: { onGoals: () => void }) {
  const s = useSnapshot();
  const next = s.milestone.next;
  return (
    <div className="con-info-row">
      <div className="con-text">
        <div className="con-title">
          <strong>{s.worldName || 'Your valley'}</strong>
          <span className="muted">
            {s.milestone.current} · {s.population} people · {s.idleCount} idle
          </span>
        </div>
        {next && !next.future ? (
          <>
            <div className="con-task">
              Next: <strong>{next.name}</strong>
            </div>
            <div className="con-reqs">
              {next.reqs.slice(0, 3).map((r) => (
                <div key={r.label} className={`req small${r.done ? ' done' : ''}`}>
                  <span className="box" aria-hidden />
                  <span>
                    {r.label} {!r.done && <span className="muted">({r.current}/{r.target})</span>}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="con-task muted">Every milestone reached. Keep building.</div>
        )}
        {s.ruler ? (
          <div className="muted con-line">Select a settler or building to see it here. Right-click gives orders. Press K to find {s.ruler.name}.</div>
        ) : (
          <TakeThrone />
        )}
      </div>
      <button className="btn small see-more" onClick={onGoals}>
        See more <MoreKey />
      </button>
    </div>
  );
}

/** Older worlds: the player names their ruler, who then walks the map. */
function TakeThrone() {
  const { game } = useGame();
  const [name, setName] = useState('');
  return (
    <form
      className="con-line throne-form"
      onSubmit={(e) => {
        e.preventDefault();
        const res = game.dispatch({ type: 'takeThrone', name });
        if (res.ok && res.id !== undefined) game.selectSettlers([res.id], true);
      }}
    >
      <span>Where are you? Take the throne:</span>
      <input type="text" value={name} maxLength={24} placeholder="Your name" onChange={(e) => setName(e.target.value)} aria-label="Your ruler's name" />
      <button className="btn small primary" type="submit" disabled={!name.trim()}>
        Crown me
      </button>
    </form>
  );
}

function PlacingPanel() {
  const { game, sprites } = useGame();
  const s = useSnapshot();
  const mode = s.mode;
  if (mode.kind !== 'place') return null;
  const def = BUILDINGS[mode.building];
  return (
    <div className="con-info-row">
      <Portrait src={sprites.buildingPreview(mode.building)} big />
      <div className="con-text">
        <div className="con-title">
          <strong>Placing: {def.name}</strong>
        </div>
        <div className="con-task muted">{def.paint ? 'Drag to place. Right-click or Esc when done.' : 'Click to place. Shift-click for more. Right-click or Esc cancels.'}</div>
        <CostLine cost={def.cost} />
        {mode.building === 'field' && (
          <span className="crop-pick">
            {s.unlocked.crops.map((c) => (
              <button key={c} className={`chip${mode.crop === c ? ' on' : ''}`} onClick={() => game.startPlacing('field', c)}>
                {CROPS[c].name}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function CostLine({ cost }: { cost: Inventory }) {
  const s = useSnapshot();
  const entries = invEntries(cost);
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

// ---- command card ----------------------------------------------------------------

function useCommands(menu: CardMenu, setMenu: (m: CardMenu) => void, openWindow: (w: WindowTab) => void, openDetails: () => void): (Cmd | null)[] {
  const { game, sprites } = useGame();
  const s = useSnapshot();
  const b = game.settings.bindings;
  const mode = s.mode;
  const slots: (Cmd | null)[] = Array(12).fill(null);
  const back: Cmd = {
    id: 'back', label: 'Back', glyph: '↩', hotkey: 'Escape', tip: { title: 'Back', body: menu === 'build' ? 'Close the build menu.' : 'Back to the categories.' },
    run: () => setMenu(menu === 'build' ? null : 'build'),
  };

  if (mode.kind === 'place') {
    slots[BACK_SLOT] = { id: 'done', label: 'Done', glyph: '✓', hotkey: 'Escape', tip: { title: 'Stop placing' }, run: () => game.setMode({ kind: 'select' }) };
    return slots;
  }

  if (menu === 'train') {
    const people = s.selection.filter(trainable);
    const hall = s.roles;
    JOB_IDS.forEach((j, i) => {
      const def = JOBS[j];
      const taught = !!hall && hall.teaches.includes(j);
      const all = people.length > 0 && people.every((p) => p.job === j);
      const full = !!hall && hall.training.length >= hall.places;
      slots[i] = {
        id: `role-${j}`, label: def.name, glyph: ROLE_GLYPH[j], hotkey: GRID_KEYS[i], disabled: !taught || all || people.length === 0, on: all,
        tip: {
          title: `Train as ${def.name}`, body: def.description,
          note: !hall ? 'Needs a Town Hall'
            : !taught ? `Needs a ${HALL_LEVEL_NAMES[def.hallLevel]} — upgrade the Town Hall`
            : all ? 'Already their role'
            : full ? `The ${hall.levelName} is full (${hall.places} training places) — wait for someone to finish`
            : `They walk to the ${hall.levelName} and train for about half a minute · ${hall.training.length}/${hall.places} places taken`,
        },
        run: () => {
          game.dispatch({ type: 'trainRole', ids: people.map((p) => p.id), role: j });
          setMenu(null);
        },
      };
    });
    slots[BACK_SLOT] = { ...back, tip: { title: 'Back', body: 'Close the Train menu.' }, run: () => setMenu(null) };
    return slots;
  }

  if (menu === 'build') {
    CATEGORY_ORDER.forEach((cat, i) => {
      const ids = [...s.unlocked.buildings, ...s.unlocked.locked.map((l) => l.id)].filter((id) => BUILDINGS[id].category === cat);
      const open = s.unlocked.buildings.filter((id) => BUILDINGS[id].category === cat).length;
      slots[i] = {
        id: `cat-${cat}`, label: CATEGORY_INFO[cat].name, icon: ids[0] ? sprites.buildingPreview(ids[0]) : undefined, glyph: ids[0] ? undefined : '·',
        hotkey: GRID_KEYS[i], disabled: ids.length === 0, badge: open || undefined,
        tip: { title: CATEGORY_INFO[cat].name, body: CATEGORY_INFO[cat].description, note: ids.length ? `${open} of ${ids.length} available` : 'Nothing here yet' },
        run: () => setMenu(cat),
      };
    });
    slots[BACK_SLOT] = back;
    return slots;
  }

  if (menu) {
    const items = [...s.unlocked.buildings.map((id) => ({ id, locked: null as string | null })), ...s.unlocked.locked.map((l) => ({ id: l.id, locked: l.at }))].filter(
      (i) => BUILDINGS[i.id].category === menu,
    );
    items.slice(0, 11).forEach(({ id, locked }, i) => {
      const def = BUILDINGS[id];
      slots[i] = {
        id: `b-${id}`, label: def.name, icon: sprites.buildingPreview(id), hotkey: GRID_KEYS[i], disabled: !!locked,
        tip: { title: def.name, body: `${def.description}${def.paint && !/drag/i.test(def.description) ? ' Drag to place many.' : ''}`, cost: def.cost, note: locked ? `Unlocks at ${locked}` : undefined },
        run: () => {
          game.startPlacing(id as BuildingId, 'turnip');
          setMenu(null);
        },
      };
    });
    slots[BACK_SLOT] = back;
    return slots;
  }

  // Root card: the valley's tools, plus whatever the selection can do.
  slots[0] = { id: 'build', label: 'Build', glyph: '⚒', hotkey: b.build[0], tip: { title: 'Build', body: 'Choose a category, then a building. Construction waits until haulers bring the materials.' }, run: () => setMenu('build') };
  slots[1] = {
    id: 'harvest', label: 'Harvest', glyph: '🪓', hotkey: b.harvest[0], on: mode.kind === 'mark',
    tip: { title: 'Mark for harvest', body: 'Drag over trees, rocks and bushes to mark them. Gatherers and labourers collect them.' },
    run: () => game.setMode(mode.kind === 'mark' ? { kind: 'select' } : { kind: 'mark' }),
  };
  slots[2] = {
    id: 'unmark', label: 'Unmark', glyph: '⊘', hotkey: b.unmark[0], on: mode.kind === 'unmark',
    tip: { title: 'Remove harvest marks', body: 'Drag to take marks off.' },
    run: () => game.setMode(mode.kind === 'unmark' ? { kind: 'select' } : { kind: 'unmark' }),
  };
  slots[3] = {
    id: 'survey', label: 'Survey', glyph: '⛏', hotkey: b.survey[0], on: mode.kind === 'survey', disabled: s.selection.length === 0,
    tip: { title: 'Survey for ore', body: 'With an adult selected, click rocky ground or a hill face: they survey the 16×16 area around it for ore.', note: s.selection.length ? undefined : 'Select an adult first' },
    run: () => game.setMode(mode.kind === 'survey' ? { kind: 'select' } : { kind: 'survey' }),
  };
  slots[4] = { id: 'areas', label: 'Areas', glyph: '▦', hotkey: b.winAreas[0], tip: { title: 'Work areas', body: 'Draw woodlots, farm areas, quarries and building areas, then assign workers.' }, run: () => openWindow('areas') };
  slots[5] = { id: 'idle', label: 'Next idle', glyph: '💤', hotkey: b.nextIdle[0], badge: s.finds.idle || undefined, tip: { title: 'Next idle settler', body: 'Jump to someone with nothing to do.' }, run: () => game.findNext('idle') };
  slots[6] = { id: 'all', label: 'Select all', glyph: '☺', hotkey: b.selectAll[0], tip: { title: 'Select every settler' }, run: () => game.selectAll() };
  slots[7] = { id: 'sites', label: 'Sites', glyph: '▲', badge: s.finds.sites || undefined, tip: { title: 'Construction sites', body: 'Jump to the next building under construction.' }, run: () => game.findNext('sites') };
  slots[8] = { id: 'waiting', label: 'Waiting', glyph: '…', badge: s.finds.waiting || undefined, tip: { title: 'Waiting buildings', body: 'Buildings short of materials or workers.' }, run: () => game.findNext('waiting') };
  const ruler = s.ruler;
  slots[10] = {
    id: 'ruler', label: ruler ? 'You' : 'Throne', glyph: '♛', hotkey: b.findRuler[0],
    tip: ruler ? { title: `${ruler.name}, ${ruler.title}`, body: 'Select yourself and jump to where you stand.' } : { title: 'Take the throne', body: 'Name your ruler (you) to walk the realm, speed up work nearby and Rally your people.' },
    run: () => {
      if (ruler) game.selectSettlers([ruler.id], true);
      else document.querySelector<HTMLInputElement>('.throne-form input')?.focus();
    },
  };

  const bi = s.building;
  if (bi && s.selection.length === 0) {
    const id = bi.ids[0];
    if (bi.level?.next && bi.ids.length === 1) {
      const nx = bi.level.next;
      slots[4] = {
        id: 'upgrade', label: bi.level.upgrading ? 'Upgrading' : `Upgrade`, glyph: '⬆', disabled: !!bi.level.upgrading || !!nx.blocked, on: !!bi.level.upgrading,
        tip: { title: `Upgrade to ${nx.name}`, body: nx.perks.join(' · '), cost: nx.cost, note: bi.level.upgrading ? `${Math.round(bi.level.upgrading.progress * 100)}% done` : nx.blocked ?? `Takes about ${nx.time}` },
        run: () => game.dispatch({ type: 'upgradeBuilding', buildingId: id }),
      };
    }
    if (bi.level?.upgrading) {
      slots[5] = { id: 'cancel-up', label: 'Cancel', glyph: '✕', tip: { title: 'Cancel the upgrade', body: 'Everything paid is returned to the stores.' }, run: () => game.dispatch({ type: 'cancelUpgrade', buildingId: id }) };
    }
    if (bi.workshop) {
      slots[6] = { id: 'pause', label: bi.workshop.paused ? 'Resume' : 'Pause', glyph: bi.workshop.paused ? '▶' : '❚❚', tip: { title: bi.workshop.paused ? 'Resume work' : 'Pause work' }, run: () => game.toggleWorkshop(id) };
    }
    slots[8] = { id: 'details', label: 'Details', glyph: 'ⓘ', tip: { title: 'See more', body: 'Everything about this building.' }, run: openDetails };
    if (bi.canRemove) {
      slots[BACK_SLOT] = {
        id: 'demolish', label: bi.built ? 'Demolish' : 'Cancel', glyph: '✖', hotkey: b.demolish[0],
        tip: { title: bi.built ? 'Demolish' : 'Cancel construction', body: bi.built ? 'Pull it down. Stored goods are moved out first.' : 'Delivered materials go back to storage.' },
        run: () => game.removeBuildings(bi.ids),
      };
    }
  } else if (s.selection.length > 0) {
    const one = s.selection.length === 1 ? s.selection[0] : null;
    if (one?.ruler && s.ruler) {
      slots[9] = {
        id: 'rally', label: 'Rally', glyph: '⚜', hotkey: b.rally[0], disabled: !!s.ruler.rallyIn, badge: s.ruler.rallyIn ? '…' : undefined,
        tip: { title: 'Rally the people', body: 'Everyone within 12 tiles works 30% faster for an hour. Once a day.', note: s.ruler.rallyIn ? `Ready again in ${s.ruler.rallyIn}` : undefined },
        run: () => game.dispatch({ type: 'rally' }),
      };
    }
    const people = s.selection.filter(trainable);
    if (people.length) {
      slots[4] = {
        id: 'train', label: 'Train', glyph: '🎓', hotkey: b.trainRole[0],
        tip: { title: 'Train a new role', body: 'Choose a role: they walk to the Town Hall and learn it. The Keep teaches crafters, hunters, herders, travellers and messengers; the Castle an Assistant Chief.' },
        run: () => setMenu('train'),
      };
      const learning = people.filter((p) => p.training);
      if (learning.length) {
        slots[5] = {
          id: 'stop-train', label: 'Stop', glyph: '✕', tip: { title: 'Stop training', body: 'They keep their current role.' },
          run: () => learning.forEach((p) => game.dispatch({ type: 'cancelRoleTraining', settlerId: p.id })),
        };
      }
    }
    if (one?.homeId != null) slots[7] = { id: 'home', label: 'Home', glyph: '⌂', tip: { title: 'Show home' }, run: () => game.focusBuildingById(one.homeId!) };
    slots[8] = { id: 'details', label: 'Details', glyph: 'ⓘ', tip: { title: 'See more', body: 'Job, work order, work area, bed and family.' }, run: openDetails };
    if (bi?.workers && bi.workers.people.length < bi.workers.max) {
      slots[9] = {
        id: 'assign', label: 'Assign', glyph: '⚑', tip: { title: `Assign to the ${bi.name}`, body: 'Make the selected settlers work here.' },
        run: () => game.dispatch({ type: 'assignWorker', buildingId: bi.ids[0], ids: s.selection.map((x) => x.id) }),
      };
    }
  }
  if (mode.kind !== 'select') slots[BACK_SLOT] = { id: 'done', label: 'Done', glyph: '✓', hotkey: 'Escape', tip: { title: 'Back to selecting' }, run: () => game.setMode({ kind: 'select' }) };
  return slots;
}

function CommandCard({ menu, setMenu, openWindow, openDetails }: { menu: CardMenu; setMenu: (m: CardMenu) => void; openWindow: (w: WindowTab) => void; openDetails: () => void }) {
  const slots = useCommands(menu, setMenu, openWindow, openDetails);
  const [hover, setHover] = useState<Cmd | null>(null);
  const latest = useRef(slots);
  latest.current = slots;

  // Grid hotkeys while a build menu is open (they win over camera keys like WASD).
  // At the root, keys go through the remappable bindings instead.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = e.code === 'Escape' ? BACK_SLOT : GRID_KEYS.indexOf(e.code);
      if (i < 0) return;
      const c = latest.current[i];
      e.preventDefault();
      e.stopImmediatePropagation();
      if (c && !c.disabled) c.run();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [menu]);

  useEffect(() => setHover(null), [menu]);
  const tip = hover && slots.find((c) => c?.id === hover.id) ? hover : null;
  return (
    <div className="con-card" role="toolbar" aria-label={menu ? (menu === 'build' ? 'Build categories' : menu === 'train' ? 'Roles to train' : `${CATEGORY_INFO[menu].name} buildings`) : 'Commands'}>
      {tip && <CommandTip c={tip} />}
      <div className="card-head">{menu === 'build' ? 'Build' : menu === 'train' ? 'Train a role' : menu ? CATEGORY_INFO[menu].name : 'Commands'}</div>
      <div className="card-grid">
        {slots.map((c, i) =>
          c ? (
            <button
              key={c.id}
              className={`card-btn${c.on ? ' on' : ''}${c.disabled ? ' off' : ''}`}
              aria-disabled={c.disabled}
              aria-label={c.label}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c)}
              onBlur={() => setHover(null)}
              onClick={() => !c.disabled && c.run()}
            >
              {c.icon ? <img className="px" src={c.icon} alt="" /> : <span className="glyph">{c.glyph}</span>}
              <span className="card-label">{c.label}</span>
              {c.hotkey && <kbd>{keyLabel(c.hotkey)}</kbd>}
              {c.badge !== undefined && <span className="badge">{c.badge}</span>}
            </button>
          ) : (
            <span key={`empty-${i}`} className="card-btn empty" />
          ),
        )}
      </div>
    </div>
  );
}

function CommandTip({ c }: { c: Cmd }) {
  return (
    <div className="panel cmd-tip" role="tooltip">
      <div className="tip-title">
        {c.tip.title}
        {c.hotkey && <kbd>{keyLabel(c.hotkey)}</kbd>}
      </div>
      {c.tip.cost && <CostLine cost={c.tip.cost} />}
      {c.tip.body && <p>{c.tip.body}</p>}
      {c.tip.note && <p className="reason">{c.tip.note}</p>}
    </div>
  );
}

// ---- details window ("See more") ---------------------------------------------------

function DetailsWindow({ onClose }: { onClose: () => void }) {
  const s = useSnapshot();
  // Esc closes the details before it deselects anything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);
  let body: React.ReactNode = null;
  if (s.selection.length === 1) body = <SettlerCard s={s.selection[0]} />;
  else if (s.selection.length > 1) body = <GroupCard list={s.selection} />;
  else if (s.building) body = <BuildingCard info={s.building} />;
  if (!body) return null;
  return (
    <div className="panel details-window inspector" role="dialog" aria-label="Details">
      <button className="btn small close-x" onClick={onClose} aria-label="Close details">
        ✕
      </button>
      {body}
    </div>
  );
}

/** "See more" docked on top of the console, over the selection: the full card, scrolling. The console keeps its size. */
function HudDetails({ onClose }: { onClose: () => void }) {
  const s = useSnapshot();
  const { game } = useGame();
  let body: React.ReactNode = null;
  if (s.selection.length === 1) body = <SettlerCard s={s.selection[0]} />;
  else if (s.selection.length > 1) body = <GroupCard list={s.selection} />;
  else if (s.building) body = <BuildingCard info={s.building} />;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);
  const title = s.selection.length === 1 ? s.selection[0].name : s.selection.length > 1 ? `${s.selection.length} selected` : s.building?.name ?? '';
  return (
    <div className="panel hud-details-dock inspector" role="dialog" aria-label="Details">
      <div className="hud-details-bar">
        <h3>{title}</h3>
        <button className="btn small" onClick={onClose}>
          Close <kbd>{keyLabel(game.settings.bindings.seeMore[0])}</kbd>
        </button>
      </div>
      <div className="hud-details-body">{body}</div>
    </div>
  );
}

// ---- the console -------------------------------------------------------------------

export function BottomConsole({ menu, setMenu, openWindow }: { menu: CardMenu; setMenu: (m: CardMenu) => void; openWindow: (w: WindowTab) => void }) {
  const { game } = useGame();
  const s = useSnapshot();
  const [details, setDetails] = useState(false);
  const hasSelection = s.selection.length > 0 || !!s.building;
  // The See more key (V) toggles the details.
  useEffect(() => {
    const toggle = () => setDetails((d) => !d);
    window.addEventListener('lv:see-more', toggle);
    return () => window.removeEventListener('lv:see-more', toggle);
  }, []);
  // The Train key (J) and the Train buttons open the role menu for the selected people.
  useEffect(() => {
    const open = () => {
      const people = game.ui.get().selection.filter(trainable);
      if (people.length) {
        setMenu('train');
        game.audio.play('uiOpen');
      } else game.toast('Select the people you want to train first.', 'info');
    };
    window.addEventListener('lv:train', open);
    return () => window.removeEventListener('lv:train', open);
  }, [game, setMenu]);
  // Nobody left to train: close the role menu.
  useEffect(() => {
    if (menu === 'train' && !s.selection.some(trainable)) setMenu(null);
  }, [menu, s.selection, setMenu]);
  const inHud = game.settings.detailsInHud;
  const showDetails = details && hasSelection && s.mode.kind !== 'place';
  let info: React.ReactNode;
  if (s.mode.kind === 'place') info = <PlacingPanel />;
  else if (s.selection.length === 1) info = <SettlerInfoPanel p={s.selection[0]} onMore={() => setDetails(!details)} />;
  else if (s.selection.length > 1) info = <GroupInfoPanel list={s.selection} onMore={() => setDetails(!details)} />;
  else if (s.building) info = <BuildingInfoPanel b={s.building} onMore={() => setDetails(!details)} />;
  else info = <ValleyInfoPanel onGoals={() => openWindow('goals')} />;
  return (
    <>
      {showDetails && !inHud && <DetailsWindow onClose={() => setDetails(false)} />}
      {showDetails && inHud && <HudDetails onClose={() => setDetails(false)} />}
      <div className="console" aria-label="Command console">
        <ConsoleMinimap />
        <div className="con-info">{info}</div>
        <CommandCard menu={menu} setMenu={setMenu} openWindow={openWindow} openDetails={() => setDetails(true)} />
      </div>
    </>
  );
}
