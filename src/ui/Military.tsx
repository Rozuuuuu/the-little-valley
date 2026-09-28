import { useState } from 'react';
import { useGame, useSnapshot } from './context';

/** Companies, their readiness and supplies, and orders. */
export function Military() {
  const { game } = useGame();
  const s = useSnapshot();
  const a = s.army;
  const [days, setDays] = useState(2);
  return (
    <>
      <section className="family-card">
        <h3>Armoury</h3>
        <p className="muted">
          Swords {a.equipment.swords} · bows {a.equipment.bows} · armour {a.equipment.armor} · horses {a.equipment.horses}
        </p>
        {a.units.map((u) => (
          <div key={u.id} className="muted">
            {u.name}: {u.gear}. {u.description}
          </div>
        ))}
        <p className="muted">To enlist, select adults and open a Barracks or Archery Range. Their gear leaves the stores, and they return to their old work when stood down.</p>
      </section>
      {a.companies.length === 0 && <p className="muted">No companies yet.</p>}
      {a.companies.map((c) => (
        <section key={c.id} className="family-card">
          <h3>
            {c.kind} · {c.state === 'home' ? 'at home' : c.state === 'deployed' ? 'in the field' : 'marching home'}
          </h3>
          <div className="row">
            Readiness <span className="bar"><i style={{ width: `${c.readiness}%` }} /></span>
          </div>
          <p className="muted">
            Strength {c.strength} · food carried {c.supplies} · {c.where}
          </p>
          <div className="muted">
            {c.members.map((m) => `${m.name}${m.state === 'training' ? ` (training ${Math.round(m.progress * 100)}%)` : ''}`).join(', ')}
          </div>
          <div className="row wrap">
            {c.state === 'home' && (
              <label>
                Food for <input type="number" min={1} max={10} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 40 }} /> days
              </label>
            )}
            <button className={`btn small${s.mode.kind === 'march' && s.mode.companyId === c.id ? ' on' : ''}`} onClick={() => game.setMode({ kind: 'march', companyId: c.id, supplyDays: days })}>
              March to…
            </button>
            {c.state !== 'home' && (
              <>
                <button className="btn small" onClick={() => game.dispatch({ type: 'orderCompany', companyId: c.id, order: 'hold' })}>
                  Hold
                </button>
                <button className="btn small" onClick={() => game.dispatch({ type: 'orderCompany', companyId: c.id, order: 'retreat' })}>
                  Come home
                </button>
              </>
            )}
            {c.state === 'home' && (
              <button className="btn small" onClick={() => game.dispatch({ type: 'demobilize', companyId: c.id })}>
                Stand down
              </button>
            )}
          </div>
        </section>
      ))}
      {s.mode.kind === 'march' && <p className="reason">Click a spot on the map to march there. Foreign land needs a passage treaty or war; protected homelands are closed.</p>}
    </>
  );
}

/** Enlisting at a barracks or archery range, from its inspector. */
export function TrainingPanel({ buildingId }: { buildingId: number }) {
  const { game } = useGame();
  const s = useSnapshot();
  const t = s.building?.training;
  if (!t) return null;
  const adults = s.selection.filter((p) => !p.child);
  return (
    <div className="residents">
      <div>
        Training {t.used}/{t.slots}
      </div>
      {t.units.map((u) => (
        <button
          key={u.id}
          className="btn small"
          disabled={!adults.length || t.used >= t.slots}
          title={`Each takes ${u.gear} from the stores`}
          onClick={() => game.dispatch({ type: 'enlist', ids: adults.map((p) => p.id), unit: u.id, buildingId })}
        >
          Enlist {adults.length || ''} as {u.name.toLowerCase()} ({u.gear})
        </button>
      ))}
      {!adults.length && <div className="muted">Select adults first.</div>}
    </div>
  );
}
