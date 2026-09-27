import { useGame, useSnapshot } from './context';

/**
 * Families: households, expected children and bed use. Every button sends a
 * validated command; the simulation explains any refusal in a toast.
 */
export function Households() {
  const { game } = useGame();
  const s = useSnapshot();
  const g = s.growth;
  if (g.mode === 'legacy') {
    return (
      <section className="family-card">
        <h3>Growth</h3>
        <p className="muted">{g.adoption}</p>
        <button className="btn small" onClick={() => game.dispatch({ type: 'adoptDeliberateGrowth' })}>
          Adopt deliberate growth
        </button>
      </section>
    );
  }
  const pair = s.selection.filter((p) => !p.child && !p.partner);
  const canPair = s.selection.length === 2 && pair.length === 2;
  return (
    <>
      <p className="muted">
        {g.adults} adult{g.adults === 1 ? '' : 's'}
        {g.children ? ` · ${g.children} child${g.children === 1 ? '' : 'ren'}` : ''} · home beds {g.beds.homeUsed}/{g.beds.homeTotal}
        {g.beds.held ? ` (${g.beds.held} held for newcomers)` : ''} · bedrolls {g.beds.bedrollsUsed}/{g.beds.bedrolls}
      </p>
      <section className="family-card">
        <h3>New household</h3>
        {canPair ? (
          <button className="btn small" onClick={() => game.dispatch({ type: 'formHousehold', ids: pair.map((p) => p.id) })}>
            {pair[0].name} and {pair[1].name} start a household
          </button>
        ) : (
          <p className="muted">
            Select two adults who aren’t in a household yet (shift-click, or click two names in the Settlers tab), then come back here.
            {g.unpaired.length < 2 ? ' Everyone is already in a household.' : ''}
          </p>
        )}
      </section>
      {g.households.length === 0 && <p className="muted">No households yet. A household of two adults can ask for a child once there is a free bed in a real home and food in store.</p>}
      {g.households.map((h) => (
        <section key={h.id} className="family-card">
          <h3>
            {h.names[0]} &amp; {h.names[1]}
          </h3>
          {h.children.map((c) => (
            <div key={c.id} className="muted">
              {c.name} · {c.age}
            </div>
          ))}
          {h.pending ? (
            <>
              <div className="row">
                Expecting <span className="bar"><i style={{ width: `${Math.round(h.pending.progress * 100)}%` }} /></span>
              </div>
              <div className={h.pending.blocked ? 'reason' : 'muted'}>{h.pending.blocked ? `⚠ Paused: ${h.pending.blocked}` : h.pending.bed}</div>
              <button className="btn small" onClick={() => game.dispatch({ type: 'cancelChildRequest', householdId: h.id })}>
                Wait for now
              </button>
            </>
          ) : (
            <>
              {h.cooldown && <div className="muted">{h.cooldown}</div>}
              <button className="btn small" disabled={!!h.cooldown} onClick={() => game.dispatch({ type: 'requestChild', householdId: h.id })}>
                Ask for a child
              </button>
            </>
          )}
        </section>
      ))}
      <p className="muted">Children eat and sleep but don’t work. They grow up after 12 game days and then join the workforce.</p>
    </>
  );
}
