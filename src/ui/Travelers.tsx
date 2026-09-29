import { Select } from './Select';
import { useState } from 'react';
import { useGame, useSnapshot } from './context';

/** The visitor waiting at the gate, travellers on their way, and when the next one comes. */
export function Travelers() {
  const { game } = useGame();
  const s = useSnapshot();
  const g = s.growth;
  const [dest, setDest] = useState<number | null>(null);
  if (g.mode !== 'deliberate') return null;
  const v = g.visitor;
  const target = dest !== null && g.settlements.some((t) => t.id === dest) ? dest : g.settlements[0]?.id;
  return (
    <section className="family-card">
      <h3>Visitors</h3>
      {v ? (
        <>
          <p>
            <strong>{v.name}</strong> would settle for {g.foodPrice} food. They leave in {v.leavesIn}.
          </p>
          {v.needs.length > 0 && (
            <ul className="needs">
              {v.needs.map((n) => (
                <li key={n}>Still needed: {n}</li>
              ))}
            </ul>
          )}
          {g.settlements.length > 1 && (
            <label>
              Settle in{' '}
              <Select value={target} onChange={(e) => setDest(Number(e.target.value))}>
                {g.settlements.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {v.blocked && <div className="reason">⚠ {v.blocked}</div>}
          <button
            className="btn small primary"
            disabled={!!v.blocked || target === undefined}
            title={v.blocked || `Hand over ${g.foodPrice} food and a bed`}
            onClick={() => target !== undefined && game.dispatch({ type: 'acceptRecruit', offerId: v.id, settlementId: target })}
          >
            Welcome {v.name} ({g.foodPrice} food)
          </button>
        </>
      ) : (
        <p className="muted">{g.nextVisitorIn ? `Another visitor should come by in about ${g.nextVisitorIn}.` : 'No visitor right now.'}</p>
      )}
      {g.recruits.map((r) => (
        <div key={r.id} className="row">
          <span>
            {r.name}: {r.state}
            {r.food ? ` · ${r.food} food held` : ''}
          </span>
          {!r.state.startsWith('Returning') && (
            <button className="btn small" onClick={() => game.dispatch({ type: 'cancelRecruit', recruitId: r.id })}>
              Call off
            </button>
          )}
        </div>
      ))}
      <p className="muted">Travellers settle for a welcome package of food (fields, orchards, hunting and fishing all help). One traveller settles every two days.</p>
    </section>
  );
}
