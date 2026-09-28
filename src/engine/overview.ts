import { DAY_TICKS } from '../game/core/constants';
import { BUILDINGS } from '../game/data/buildings';
import { MILESTONES } from '../game/data/progression';
import { RESOURCES } from '../game/data/resources';
import { builtCount, campOf, costOf, permanentBeds } from '../game/sim/buildings';
import { invEntries } from '../game/sim/inventory';
import { adults } from '../game/sim/households';
import { recruitProblem } from '../game/sim/travelers';
import { GROWTH_MIN_FOOD, RECRUIT_FOOD } from '../game/data/kingdomBalance';
import { currentMilestone, nextMilestone, requirementProgress, type RequirementProgress } from '../game/sim/progression';
import type { Simulation } from '../game/sim/Simulation';
import type { Building, SessionMark } from '../game/sim/types';
import { T } from '../game/world/tiles';
import { riverCenter } from '../game/world/worldgen';

export interface Target {
  x: number;
  y: number;
  w: number;
  h: number;
  settlerId?: number;
  buildingId?: number;
}

export interface OverviewItem {
  text: string;
  detail?: string;
  target: Target | null;
}

export interface Overview {
  /** What happened last session, from recorded events only. Null when no record exists. */
  since: string[] | null;
  sinceNote: string;
  issues: OverviewItem[];
  goals: OverviewItem[];
  milestone: { current: string; next: string | null; reqs: RequirementProgress[] };
}

function rectOf(b: Building): Target {
  return { x: b.x, y: b.y, w: b.w, h: b.h, buildingId: b.id };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Summary of the previous session, built only from what the game recorded. */
function sinceLast(sim: Simulation, prev: SessionMark | null): { lines: string[] | null; note: string } {
  if (!prev) return { lines: null, note: 'There is no record of your last visit for this valley yet, so here is how things stand today.' };
  const lines: string[] = [];
  const d = (k: keyof typeof prev.startStats) => sim.stats[k] - (prev.startStats[k] ?? 0);
  const days = Math.max(0, Math.round(((sim.tick - prev.startTick) / DAY_TICKS) * 10) / 10);
  const events = sim.chronicle.filter((c) => c.tick >= prev.startTick);
  const built = events.filter((e) => e.kind === 'built' || e.kind === 'bridge').map((e) => e.text.replace(/^Built an? /, '').replace(/^Finished the /, ''));
  if (built.length) lines.push(`Built: ${[...new Set(built)].map((b) => `${built.filter((x) => x === b).length > 1 ? `${built.filter((x) => x === b).length}× ` : ''}${b}`).join(', ')}.`);
  const arrivals = events.filter((e) => e.kind === 'arrival').map((e) => e.text.replace(/ arrived$/, ''));
  if (arrivals.length) lines.push(`Welcomed ${arrivals.join(', ')}.`);
  for (const e of events.filter((e) => e.kind === 'birth')) lines.push(`${e.text}.`);
  for (const e of events.filter((e) => e.kind === 'milestone')) lines.push(`${e.text}!`);
  const food = d('harvested') + d('foodGathered') + d('bakedFood');
  const goods: string[] = [];
  if (food > 0) goods.push(`${food} food`);
  if (d('wheatHarvested') > 0) goods.push(`${d('wheatHarvested')} wheat`);
  if (d('woodGathered') > 0) goods.push(`${d('woodGathered')} wood`);
  if (d('stoneGathered') > 0) goods.push(`${d('stoneGathered')} stone`);
  if (d('planksCrafted') > 0) goods.push(`${d('planksCrafted')} planks`);
  if (goods.length) lines.push(`Brought in ${goods.join(', ')}.`);
  for (const e of events.filter((e) => e.kind === 'shortage')) lines.push(`${e.text}.`);
  if (lines.length === 0) return { lines: null, note: `Last time you played for about ${days} in-game days, but nothing notable was recorded.` };
  return { lines: lines.slice(0, 5), note: `Last session, over about ${days} in-game day${days === 1 ? '' : 's'}:` };
}

function issues(sim: Simulation): OverviewItem[] {
  const out: OverviewItem[] = [];
  const cap = sim.totalCapacity();
  if (cap.capacity > 0 && cap.used >= cap.capacity * 0.95) {
    const store = sim.storages()[0];
    out.push({ text: 'Storage is full', detail: 'Settlers holding goods can’t harvest. Build a storehouse.', target: store ? rectOf(store) : null });
  }
  const homeless = sim.settlers.filter((s) => s.homeId === null);
  if (homeless.length) {
    const camp = campOf(sim);
    out.push({ text: `${plural(homeless.length, 'settler')} ${homeless.length === 1 ? 'has' : 'have'} no bed`, detail: 'They rest by the campfire. Build a house or cottage.', target: camp ? rectOf(camp) : null });
  }
  for (const b of sim.buildings.values()) {
    const ws = b.workshop;
    if (!b.built || !ws) continue;
    const s = ws.status;
    if (!s || /^(Grind|Saw|Craft|Bake|Worker on|Ready)/.test(s)) continue;
    const name = BUILDINGS[b.type].name;
    const needs = /Needs (.+?) —/.exec(s);
    out.push({ text: needs ? `The ${name.toLowerCase()} needs ${needs[1]}` : `${name}: ${s}`, detail: s, target: rectOf(b) });
  }
  for (const b of sim.buildings.values()) {
    if (b.built || b.field) continue;
    const missing = invEntries(costOf(b))
      .map(([r, n]) => ({ r, left: n - (b.delivered[r] ?? 0) - (b.incoming[r] ?? 0) }))
      .filter((m) => m.left > 0 && sim.storedTotal(m.r) < m.left);
    if (!missing.length) continue;
    const m = missing[0];
    const name = BUILDINGS[b.type].name.toLowerCase();
    out.push({ text: `Deliver ${m.left} more ${RESOURCES[m.r].name.toLowerCase()} to the ${name}`, detail: `Only ${sim.storedTotal(m.r)} in storage.`, target: rectOf(b) });
  }
  for (const h of sim.households) {
    if (!h.pending?.blocked) continue;
    const names = h.adults.map((id) => sim.settler(id)?.name ?? '?').join(' and ');
    const parent = sim.settler(h.adults[0]);
    out.push({
      text: `${names}'s child is paused`,
      detail: h.pending.blocked,
      target: parent ? { x: Math.floor(parent.x), y: Math.floor(parent.y), w: 1, h: 1, settlerId: parent.id } : null,
    });
  }
  const idle = sim.settlers.filter((s) => (!s.task || s.task.kind === 'wander') && s.idleReason && s.idleReason !== 'Stores are well stocked');
  if (idle.length >= 2 || (idle.length === 1 && sim.settlers.length <= 6)) {
    const reason = idle[0].idleReason;
    out.push({
      text: `${plural(idle.length, 'settler')} ${idle.length === 1 ? 'is' : 'are'} idle`,
      detail: `${idle[0].name}: ${reason}`,
      target: { x: Math.floor(idle[0].x), y: Math.floor(idle[0].y), w: 1, h: 1, settlerId: idle[0].id },
    });
  }
  return out.slice(0, 3);
}

/** A good place to cross the great river: the shortest explored straight crossing near the camp. */
export function suggestCrossing(sim: Simulation): Target | null {
  const camp = campOf(sim);
  const cy = camp ? camp.y : 0;
  let best: Target | null = null;
  const isWater = (x: number, y: number) => {
    const t = sim.world.terrain(x, y);
    return t === T.Water || t === T.DeepWater;
  };
  for (let dy = 0; dy <= 30; dy++) {
    for (const y of dy === 0 ? [cy] : [cy + dy, cy - dy]) {
      let x0: number;
      if (sim.world.genVersion >= 2) x0 = Math.round(riverCenter(sim.seed, y));
      else continue;
      if (!isWater(x0, y) || !sim.world.explored(x0, y)) continue;
      let x1 = x0;
      while (isWater(x0 - 1, y) && x0 - x1 < 14) x0--;
      while (isWater(x1 + 1, y) && x1 - x0 < 14) x1++;
      const len = x1 - x0 + 1;
      if (len > 12 || !sim.walkable(x0 - 1, y) || !sim.walkable(x1 + 1, y)) continue;
      if (!sim.world.explored(x0 - 1, y) || !sim.world.explored(x1 + 1, y)) continue;
      if (!best || len < best.w) best = { x: x0, y, w: len, h: 1 };
    }
    if (best && dy > 6) break;
  }
  return best;
}

function goals(sim: Simulation): OverviewItem[] {
  const out: OverviewItem[] = [];
  const reached = (id: string) => sim.progression.reached.includes(id as never);
  const camp = campOf(sim);
  const campT = camp ? rectOf(camp) : null;
  const all = [...sim.buildings.values()];
  const byType = (t: string) => all.filter((b) => b.type === t);
  // Deliberate growth: a visitor who can be welcomed now, then the orchard that pays for them.
  const home = sim.settlements[0]?.id;
  if (sim.growthMode === 'deliberate' && sim.offer && home !== undefined && !recruitProblem(sim, home)) {
    out.push({ text: `Welcome ${sim.offer.name}, who is visiting`, detail: `Families tab: they settle for ${RECRUIT_FOOD} food and a free bed.`, target: campT });
  }
  if (sim.growthMode === 'deliberate' && sim.storedTotal('food') < RECRUIT_FOOD + GROWTH_MIN_FOOD) {
    out.push({ text: 'Grow food for travellers', detail: `Travellers settle for ${RECRUIT_FOOD} food (keeping ${GROWTH_MIN_FOOD} in store). Fields, orchards, hunting and berries all help.`, target: campT });
  }
  if (!reached('hamlet')) {
    const next = MILESTONES.hamlet.requirements.map((r) => requirementProgress(sim, r)).filter((r) => !r.done);
    for (const r of next.slice(0, 2)) out.push({ text: r.label, detail: `${r.current}/${r.target}`, target: campT });
    return out.slice(0, 3);
  }
  const bridge = byType('stoneBridge')[0];
  if (bridge && !bridge.built) {
    const m = invEntries(costOf(bridge)).map(([r, n]) => ({ r, left: n - (bridge.delivered[r] ?? 0) })).find((x) => x.left > 0);
    out.push({
      text: m ? `Deliver ${m.left} more ${m.r} to the stone bridge` : 'Builders are raising the stone bridge',
      detail: 'Once finished, the far bank opens up for new homes and fields.',
      target: rectOf(bridge),
    });
  }
  if (byType('mill').length === 0) out.push({ text: 'Build a mill to grind wheat into flour', detail: 'Bread feeds a larger village from fewer fields.', target: campT });
  else if (byType('bakery').length === 0) out.push({ text: 'Build a bakery to expand food production', detail: 'It bakes 2 flour and 1 wood into 5 food.', target: rectOf(byType('mill')[0]) });
  else if (!all.some((b) => b.field?.crop === 'wheat')) {
    const f = all.find((b) => b.field);
    out.push({ text: 'Plant wheat fields for the mill', detail: 'Select fields and choose Wheat in the inspector.', target: f ? rectOf(f) : campT });
  }
  if (sim.workAreas.length === 0) {
    const fields = all.filter((b) => b.field);
    const t = fields.length
      ? { x: Math.min(...fields.map((f) => f.x)), y: Math.min(...fields.map((f) => f.y)), w: Math.max(...fields.map((f) => f.x)) - Math.min(...fields.map((f) => f.x)) + 1, h: Math.max(...fields.map((f) => f.y)) - Math.min(...fields.map((f) => f.y)) + 1 }
      : campT;
    out.push({ text: 'Assign farmers to a farm area', detail: 'Areas tab → Farm, then drag over your fields.', target: t });
  }
  if (!bridge && reached('hamlet') && sim.world.genVersion >= 2) {
    const c = suggestCrossing(sim);
    out.push(c
      ? { text: 'Cross the great river with a stone bridge', detail: `A ${c.w}-tile crossing here would open the fertile far bank.`, target: c }
      : { text: 'Explore east to find the great river', detail: 'Send a settler east of the camp. A stone bridge can open the far bank.', target: campT ? { x: campT.x + 18, y: campT.y, w: 3, h: 2 } : null });
  }
  if (!reached('village') && permanentBeds(sim) < 8) out.push({ text: `Build homes: ${permanentBeds(sim)}/8 beds for Village`, detail: 'Houses have 2 beds.', target: campT });
  if (reached('village')) {
    if (builtCount(sim, 'market') === 0) out.push({ text: 'Plan the Grand Market', detail: 'A long project that anchors a future town.', target: campT });
    out.push({ text: `Grow toward Town: ${adults(sim).length}/16 adults`, detail: 'Cottages hold 4 each.', target: campT });
  }
  return out.slice(0, 3);
}

export function buildOverview(sim: Simulation, previous: SessionMark | null): Overview {
  const since = sinceLast(sim, previous);
  const next = nextMilestone(sim);
  const nextDef = next ? MILESTONES[next] : null;
  return {
    since: since.lines,
    sinceNote: since.note,
    issues: issues(sim),
    goals: goals(sim),
    milestone: {
      current: MILESTONES[currentMilestone(sim)].name,
      next: nextDef && !nextDef.future ? nextDef.name : null,
      reqs: nextDef && !nextDef.future ? nextDef.requirements.map((r) => requirementProgress(sim, r)) : [],
    },
  };
}
