import { useState } from 'react';
import { useGame, useSnapshot } from './context';

/** Treaties, offers, warnings and border incidents. */
export function Diplomacy() {
  const { game } = useGame();
  const s = useSnapshot();
  const d = s.diplomacy;
  const [to, setTo] = useState<number | null>(null);
  const [kind, setKind] = useState('trade');
  const [days, setDays] = useState(8);
  const [pay, setPay] = useState(0);
  const target = to ?? d.kingdoms[0]?.id;
  const def = d.treatyKinds.find((k) => k.id === kind);
  if (d.kingdoms.length === 0) return <p className="muted">You know of no other kingdoms yet. Merchants bring word of distant towns; build an inn.</p>;
  return (
    <>
      {d.warnings.map((w) => (
        <section key={w.id} className="family-card warn-card">
          <h3>
            {w.from} is {w.band} about you
          </h3>
          <ul className="needs">
            {w.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="row wrap">
            {w.actions.map((a) => (
              <button key={a} className="btn small" onClick={() => game.dispatch({ type: 'respondToWarning', warningId: w.id, action: a })}>
                {a.replace('-', ' ')}
              </button>
            ))}
          </div>
        </section>
      ))}
      {d.incidents.map((i) => (
        <section key={i.id} className="family-card warn-card">
          <h3>
            {i.kind} from {i.from}
          </h3>
          <p className="muted">At {i.where}. A first crossing can be talked through.</p>
          <div className="row wrap">
            <button className="btn small" onClick={() => game.dispatch({ type: 'respondToIncident', incidentId: i.id, response: 'askWithdraw' })}>
              Ask them to withdraw
            </button>
            <button className="btn small" onClick={() => game.dispatch({ type: 'respondToIncident', incidentId: i.id, response: 'allow' })}>
              Let them pass
            </button>
            <button className="btn small" onClick={() => game.dispatch({ type: 'respondToIncident', incidentId: i.id, response: 'protest' })}>
              Protest
            </button>
          </div>
        </section>
      ))}
      {d.offersToYou.map((o) => (
        <section key={o.id} className="family-card">
          <h3>
            {o.from} offers a {o.name.toLowerCase()}
          </h3>
          <p className="muted">
            {o.days} days{o.payment ? `, with ${o.payment} coins for you` : ''}. Benefits: {o.benefits} Obligations: {o.obligations} Breaking it: {o.breach} Expires in {o.expiresIn}.
          </p>
          <div className="row">
            <button className="btn small primary" onClick={() => game.dispatch({ type: 'respondToOffer', offerId: o.id, accept: true })}>
              Sign
            </button>
            <button className="btn small" onClick={() => game.dispatch({ type: 'respondToOffer', offerId: o.id, accept: false })}>
              Decline
            </button>
          </div>
        </section>
      ))}
      <section className="family-card">
        <h3>Kingdoms</h3>
        {d.kingdoms.map((k) => (
          <div key={k.id} className="route">
            <span className="banner-chip" style={{ background: k.color }} aria-hidden /> <strong>{k.name}</strong> · {k.stance} · seems {k.mood}
            {k.treaties.map((t) => (
              <div key={t.id} className="row">
                <span className="muted">
                  {t.name}, {t.endsIn} left
                </span>
                <button className="btn small" title="Ending a treaty early is a broken promise others hear about" onClick={() => game.dispatch({ type: 'cancelTreaty', offerId: t.id })}>
                  End early
                </button>
              </div>
            ))}
          </div>
        ))}
      </section>
      <section className="family-card">
        <h3>Propose a treaty</h3>
        {!d.hasEnvoy && <p className="reason">Appoint an Envoy (Council) to carry your letters.</p>}
        <div className="route-form">
          <label>
            To{' '}
            <select value={target} onChange={(e) => setTo(Number(e.target.value))}>
              {d.kingdoms.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Treaty{' '}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {d.treatyKinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          {def && <p className="muted">Benefits: {def.benefits} Obligations: {def.obligations} Breaking it: {def.breach}</p>}
          <label>
            Days <input type="number" min={1} max={64} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 50 }} />
          </label>
          <label>
            Coins offered <input type="number" min={0} value={pay} onChange={(e) => setPay(Number(e.target.value))} style={{ width: 60 }} />
          </label>
          <button className="btn small" disabled={!d.hasEnvoy || target === undefined} onClick={() => target !== undefined && game.dispatch({ type: 'proposeTreaty', kind, to: target, terms: { durationDays: days, payment: pay } })}>
            Send the envoy
          </button>
        </div>
        {d.yourOffers.map((o) => (
          <div key={o.id} className="route">
            {o.name} to {o.to}: {o.state}
            {o.reasons.length > 0 && <div className="muted">{o.reasons.join('. ')}.</div>}
          </div>
        ))}
      </section>
    </>
  );
}
