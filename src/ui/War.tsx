import { Select } from './Select';
import { useState } from 'react';
import { useGame, useSnapshot } from './context';

/** Declaring war (after a clear preview), wars in progress, peace terms and evacuation. */
export function War() {
  const { game } = useGame();
  const s = useSnapshot();
  const w = s.war;
  const [target, setTarget] = useState<number | null>(null);
  const [objective, setObjective] = useState('raid');
  const [confirm, setConfirm] = useState(false);
  const [reparations, setReparations] = useState(0);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const pick = w.previews.find((p) => p.id === target) ?? w.previews[0];
  return (
    <>
      {w.wars.map((x) => (
        <section key={x.with} className="family-card warn-card">
          <h3>
            At war with {x.name} ({x.objective}, day {x.days})
          </h3>
          {x.siege !== null && (
            <div className="row">
              Surrender meter <span className="bar"><i style={{ width: `${x.siege}%` }} /></span> {x.siege}%
            </div>
          )}
          <p className="muted">
            You hold {x.occupiedByYou.length ? x.occupiedByYou.map((q) => `${q.x},${q.y}`).join(' ') : 'none of their land'} · they hold {x.occupiedByThem.length ? x.occupiedByThem.map((q) => `${q.x},${q.y}`).join(' ') : 'none of yours'}
            {x.captives.length ? ` · they hold captive: ${x.captives.join(', ')}` : ''}
          </p>
          <p className="muted">Holding land is not owning it: only a peace treaty changes title. Captives come home at peace.</p>
          <div className="row wrap">
            <label>
              Reparations <input type="number" min={0} value={reparations} onChange={(e) => setReparations(Number(e.target.value))} style={{ width: 56 }} /> coins
            </label>
            <button
              className="btn small primary"
              onClick={() => game.dispatch({ type: 'proposeTreaty', kind: 'peace', to: x.with, terms: { durationDays: 32, payment: reparations, transfers: x.occupiedByYou } })}
              title="Asks for the land your soldiers hold; they decide when your envoy arrives"
            >
              Offer peace{x.occupiedByYou.length ? ' (keeping the land you hold)' : ''}
            </button>
            <button className="btn small" onClick={() => game.dispatch({ type: 'proposeTreaty', kind: 'peace', to: x.with, terms: { durationDays: 32, payment: reparations, transfers: x.occupiedByYou, waiveUnmet: true } })} title="Makes peace even if land promised to allies is not delivered — it costs their trust">
              Offer peace, waiving allies' land
            </button>
            <button className="btn small" onClick={() => game.dispatch({ type: 'proposeTreaty', kind: 'truce', to: x.with, terms: { durationDays: 2 } })}>
              Ask for a truce
            </button>
          </div>
        </section>
      ))}
      {pick && (
        <section className="family-card">
          <h3>Declare war</h3>
          <div className="route-form">
            <label>
              On{' '}
              <Select value={pick.id} onChange={(e) => setTarget(Number(e.target.value))}>
                {w.previews.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              Objective{' '}
              <Select value={objective} onChange={(e) => setObjective(e.target.value)}>
                <option value="raid">Raid their frontier</option>
                <option value="capture">Capture frontier land</option>
                <option value="defend">Defend (they struck first)</option>
              </Select>
            </label>
          </div>
          {pick.preview.blockers.map((b) => (
            <div key={b} className="reason">
              ⚠ {b}
            </div>
          ))}
          {pick.preview.breaches.length > 0 && <p className="reason">This breaks: {pick.preview.breaches.join(', ')}. Others will hear of it.</p>}
          {pick.preview.theirAllies.length > 0 && <p className="reason">Their allies may join them: {pick.preview.theirAllies.join(', ')}.</p>}
          <p className="muted">
            Allies arrived {pick.preview.allies.arrived}, promised {pick.preview.allies.promised} · food for about {pick.preview.supplyDays} days · your exposed frontier sectors: {pick.preview.exposed.length}
          </p>
          <label className="row">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I understand what this war costs
          </label>
          <button className="btn small danger" disabled={!confirm || pick.preview.blockers.length > 0} onClick={() => game.dispatch({ type: 'declareWar', target: pick.id, objective, confirmBreach: confirm })}>
            Declare war on {pick.name}
          </button>
        </section>
      )}
      {w.settlements.length > 1 && (
        <section className="family-card">
          <h3>Evacuate</h3>
          <div className="route-form">
            <label>
              From{' '}
              <Select value={from ?? w.settlements[1].id} onChange={(e) => setFrom(Number(e.target.value))}>
                {w.settlements.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              To{' '}
              <Select value={to ?? w.settlements[0].id} onChange={(e) => setTo(Number(e.target.value))}>
                {w.settlements.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </Select>
            </label>
            <button className="btn small" onClick={() => game.dispatch({ type: 'evacuate', from: from ?? w.settlements[1].id, to: to ?? w.settlements[0].id })}>
              Move civilians out
            </button>
          </div>
        </section>
      )}
    </>
  );
}
