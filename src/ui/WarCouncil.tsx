import { useState } from 'react';
import { useGame, useSnapshot } from './context';

/** Private war planning and negotiated allied support. */
export function WarCouncil() {
  const { game } = useGame();
  const s = useSnapshot();
  const w = s.warCouncil;
  const d = s.diplomacy;
  const [target, setTarget] = useState<number | null>(null);
  const [objective, setObjective] = useState('raid');
  const [ally, setAlly] = useState<number | null>(null);
  const [companies, setCompanies] = useState(1);
  const [fee, setFee] = useState(30);
  const [daysN, setDays] = useState(6);
  const [supply, setSupply] = useState<'requester' | 'contributor' | 'shared'>('shared');
  const tgt = target ?? d.kingdoms[0]?.id;
  const al = ally ?? w.allies[0]?.id;
  return (
    <>
      <section className="family-card">
        <h3>New war plan</h3>
        <p className="muted">Planning is private: nobody hears of it until you ask an ally for help. Launching needs an army.</p>
        <div className="route-form">
          <label>
            Target{' '}
            <select value={tgt} onChange={(e) => setTarget(Number(e.target.value))}>
              {d.kingdoms.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objective{' '}
            <select value={objective} onChange={(e) => setObjective(e.target.value)}>
              <option value="raid">Raid their frontier</option>
              <option value="capture">Capture frontier land</option>
              <option value="defend">Defend against them</option>
            </select>
          </label>
          <button className="btn small" disabled={tgt === undefined} onClick={() => tgt !== undefined && game.dispatch({ type: 'createWarPlan', target: tgt, objective })}>
            Draft the plan
          </button>
        </div>
      </section>
      {w.plans.map((p) => (
        <section key={p.id} className="family-card">
          <h3>
            {p.objective} against {p.target}
          </h3>
          <p className="muted">
            Their strength: {p.assessment.enemy.range ? `${p.assessment.enemy.range[0]}–${p.assessment.enemy.range[1]} companies (${p.assessment.enemy.certainty}, ${p.assessment.enemy.reportAge})` : 'unknown — no reports'}
          </p>
          <p className="muted">
            Your companies: {p.assessment.own.companies} · allies promised {p.assessment.allies.pledged}, on the road {p.assessment.allies.enRoute}, arrived {p.assessment.allies.arrived} · food for about {p.assessment.supplyDays} days
          </p>
          {p.assessment.blockers.map((b) => (
            <div key={b} className="reason">
              ⚠ {b}
            </div>
          ))}
          {p.commitments.map((c) => (
            <div key={c.id} className="route">
              <div>
                {c.ally}: {c.state} — {c.companies} {c.companies === 1 ? 'company' : 'companies'}, {c.fee} coins, {c.days} days, supplies by {c.supply}, {c.command} command
              </div>
              {c.reasons.length > 0 && <div className="muted">{c.reasons.join('. ')}.</div>}
              {c.state === 'countered' && (
                <button className="btn small primary" onClick={() => game.dispatch({ type: 'acceptCampaignOffer', commitmentId: c.id })}>
                  Accept their terms
                </button>
              )}
            </div>
          ))}
          {w.allies.length > 0 ? (
            <div className="route-form">
              <label>
                Ask{' '}
                <select value={al} onChange={(e) => setAlly(Number(e.target.value))}>
                  {w.allies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (can spare {a.spare})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Companies <input type="number" min={1} value={companies} onChange={(e) => setCompanies(Number(e.target.value))} style={{ width: 44 }} />
              </label>
              <label>
                Fee <input type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} style={{ width: 54 }} /> coins
              </label>
              <label>
                Service <input type="number" min={1} value={daysN} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 44 }} /> days
              </label>
              <label>
                Supplies paid by{' '}
                <select value={supply} onChange={(e) => setSupply(e.target.value as typeof supply)}>
                  <option value="requester">you</option>
                  <option value="shared">both (half each)</option>
                  <option value="contributor">them</option>
                </select>
              </label>
              <p className="muted">The fee is held when they agree and paid when their soldiers reach your staging ground; it isn't refunded for service already given.</p>
              <button
                className="btn small"
                disabled={al === undefined}
                onClick={() =>
                  al !== undefined &&
                  game.dispatch({
                    type: 'requestCampaignSupport', planId: p.id, ally: al,
                    terms: { companies, coinFee: fee, supplyPayer: supply, serviceDays: daysN, commandRights: 'coordinated', rewardSectors: [], reciprocalDefenseDays: 0 },
                  })
                }
              >
                Ask for support
              </button>
            </div>
          ) : (
            <p className="muted">You have no allies to ask. A defensive alliance comes first.</p>
          )}
          {p.state === 'mobilizing' && (
            <button className="btn small danger" onClick={() => game.dispatch({ type: 'launchCampaign', planId: p.id, confirmBreach: true })} title="Declares war if you are not at war yet, and sends arrived allies into the field. Missing contingents stay missing.">
              Launch (arrived: {p.assessment.allies.arrived}, still coming: {p.assessment.allies.enRoute + p.assessment.allies.mustered})
            </button>
          )}
          {p.state === 'drafting' && (
            <button className="btn small" onClick={() => game.dispatch({ type: 'mobilizeCampaign', planId: p.id })} title="Allies who agreed start marching to your staging ground. Nothing attacks until you launch.">
              Muster
            </button>
          )}
          <button className="btn small" onClick={() => game.dispatch({ type: 'cancelWarPlan', planId: p.id })}>
            Shelve the plan
          </button>
        </section>
      ))}
    </>
  );
}
