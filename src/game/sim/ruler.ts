import { RALLY_COOLDOWN, RALLY_RADIUS, RALLY_TICKS } from '../data/kingdomBalance';
import { assignHomes, campOf, entranceOf } from './buildings';
import { playerKingdom } from './kingdoms';
import type { Simulation } from './Simulation';
import type { Appearance, CommandResult, Settler } from './types';

/**
 * The ruler: the player on the map. They walk where they are sent, eat and sleep
 * like anyone, never do chores, never enlist and never fight. Their presence
 * speeds up the people around them (see workSpeed), and Rally, once a day,
 * inspires everyone close by for a while.
 */

/** Regal colours: a deep purple tunic. */
const ROYAL_SHIRT = 5;

export function addRuler(sim: Simulation, name: string, x: number, y: number): Settler {
  const s = sim.addSettler(x, y, 'laborer', name);
  s.ruler = true;
  s.priorities = [];
  const look: Appearance = { ...s.appearance, shirt: ROYAL_SHIRT };
  s.appearance = look;
  const k = playerKingdom(sim);
  k.ruler = { name, appearance: { ...look } };
  sim.forgetRuler();
  return s;
}

export function rally(sim: Simulation): CommandResult {
  const r = sim.ruler();
  if (!r) return { ok: false, message: 'There is no ruler in this world yet — take the throne first' };
  if (r.hidden) return { ok: false, message: `${r.name} is away` };
  const wait = sim.rallyReadyAt - sim.tick;
  if (wait > 0) return { ok: false, message: `${r.name} can rally the people again in ${Math.ceil(wait / 10 / 60)} min` };
  let n = 0;
  for (const s of sim.settlers) {
    if (s === r || s.hidden || s.lifeStage !== 'adult' || s.military) continue;
    if (Math.hypot(s.x - r.x, s.y - r.y) > RALLY_RADIUS) continue;
    s.boostUntil = sim.tick + RALLY_TICKS;
    n++;
  }
  sim.rallyReadyAt = sim.tick + RALLY_COOLDOWN;
  sim.emit({ type: 'fx', kind: 'hearts', x: r.x + 0.5, y: r.y });
  sim.emit({ type: 'sfx', name: 'milestone', x: r.x, y: r.y });
  return {
    ok: true,
    message: n ? `${r.name} rallies ${n} ${n === 1 ? 'person' : 'people'}: they work 30% faster for the next hour.` : `${r.name} gives a fine speech, but nobody is close enough to hear it.`,
  };
}

/** For worlds from before the ruler walked the map: the player takes the throne at the hall. */
export function takeThrone(sim: Simulation, name: unknown): CommandResult {
  if (sim.ruler()) return { ok: false, message: `${sim.ruler()!.name} already rules here` };
  const clean = typeof name === 'string' ? name.trim().slice(0, 24) : '';
  if (!clean) return { ok: false, message: 'Choose a name for your ruler' };
  const hall = campOf(sim);
  const at = hall ? entranceOf(hall) : { x: 0, y: 2 };
  const s = addRuler(sim, clean, at.x, at.y);
  if (hall) s.settlementId = sim.settlements.find((st) => st.id === hall.id)?.id ?? s.settlementId;
  assignHomes(sim);
  sim.emit({ type: 'important' });
  return { ok: true, message: `${clean} takes the throne. Select them to walk the realm and Rally your people.`, id: s.id };
}
