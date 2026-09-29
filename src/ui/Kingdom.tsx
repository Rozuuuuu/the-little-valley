import { Select } from './Select';
import { useState } from 'react';
import { useGame, useSnapshot } from './context';

/** Crown, treasury, policies, council and land. Every change is a command. */
export function KingdomPanel() {
  const { game } = useGame();
  const s = useSnapshot();
  const k = s.kingdom;
  const [ruler, setRuler] = useState(s.ruler?.name ?? '');
  const [realm, setRealm] = useState(k.name);
  const [color, setColor] = useState(k.bannerColors[0]);
  const [emblem, setEmblem] = useState(k.emblems[0]);
  const selected = s.selection.find((p) => !p.child);
  return (
    <>
      <section className="family-card">
        <h3>
          <span className="banner-chip" style={{ background: k.banner.color }} aria-hidden /> {k.name}
        </h3>
        {k.crowned ? <p>Ruled by {k.ruler}.</p> : <p className="muted">Not yet crowned. Coronation opens at the Region milestone.</p>}
        {k.canCoronate && (
          <div className="route-form">
            <label>
              Ruler <input value={ruler} maxLength={40} onChange={(e) => setRuler(e.target.value)} placeholder="Queen Alder" />
            </label>
            <label>
              Kingdom <input value={realm} maxLength={40} onChange={(e) => setRealm(e.target.value)} />
            </label>
            <label>
              Banner{' '}
              <Select value={color} onChange={(e) => setColor(e.target.value)}>
                {k.bannerColors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>{' '}
              <Select value={emblem} onChange={(e) => setEmblem(e.target.value)}>
                {k.emblems.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </label>
            <p className="muted">Crowning fixes your protected homeland: {k.homelandPreview} sectors (the lands around the camp plus every sector holding a building now). Building later never grows it.</p>
            <button className="btn small primary" onClick={() => game.dispatch({ type: 'coronate', rulerName: ruler, kingdomName: realm, banner: { color, emblem } })}>
              Crown the ruler
            </button>
          </div>
        )}
      </section>
      <section className="family-card">
        <h3>Treasury and trust</h3>
        <p>
          {k.treasury} coins · {k.taxCollected} collected in tax · trust {k.trust}/100
        </p>
        <p className="muted">Coins come only from trade: sell goods to merchants for coins, and taxes take a share of each deal.</p>
        {k.policies.map((p) => (
          <label key={p.id} className="row">
            <input type="radio" name="policy" checked={k.policy === p.id} onChange={() => game.dispatch({ type: 'setPolicy', policy: p.id })} /> {p.name}: <span className="muted">{p.description}</span>
          </label>
        ))}
      </section>
      <section className="family-card">
        <h3>Council</h3>
        {k.council.map((c) => (
          <div key={c.post} className="route">
            <div>
              <strong>{c.name}</strong>: {c.holder ?? 'empty'}
            </div>
            <div className="muted">{c.duty} The holder stops ordinary work.</div>
            <div className="row">
              <button className="btn small" disabled={!selected} onClick={() => selected && game.dispatch({ type: 'appointCouncil', post: c.post, settlerId: selected.id })}>
                Appoint {selected?.name ?? 'selected adult'}
              </button>
              {c.holder && (
                <button className="btn small" onClick={() => game.dispatch({ type: 'appointCouncil', post: c.post, settlerId: null })}>
                  Release
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      <section className="family-card">
        <h3>Land</h3>
        <p className="muted">
          Homeland: {k.homeland ? `${k.homeland} sectors (protected${k.conflictMode === 'full-conquest' ? ' — except under full conquest' : ''})` : 'set at coronation'} · frontier claims: {k.claims}
        </p>
        <label className="row">
          <input
            type="checkbox"
            checked={k.conflictMode === 'full-conquest'}
            disabled={k.modeLocked}
            onChange={(e) => game.dispatch({ type: 'setConflictMode', mode: e.target.checked ? 'full-conquest' : 'protected-frontier' })}
          />
          Full conquest (homelands can be taken){k.modeLocked ? ' — locked' : ' — choose before your first claim'}
        </label>
        <button className={`btn small${s.mode.kind === 'claim' ? ' on' : ''}`} disabled={!k.crowned} onClick={() => game.setMode(s.mode.kind === 'claim' ? { kind: 'select' } : { kind: 'claim' })}>
          Claim land ({k.claimCost} coins a sector)
        </button>
        {s.mode.kind === 'claim' && <p className="reason">Hover the map to see a sector's owner, supply and cost; click to claim it.</p>}
        {!k.frontierActive && (
          <button className="btn small" onClick={() => game.dispatch({ type: 'activateFrontier' })} title="Needs Civilization. Enables border incidents and war.">
            Open the frontier to conflict
          </button>
        )}
      </section>
      {k.rivals.length > 0 && (
        <section className="family-card">
          <h3>Known kingdoms</h3>
          {k.rivals.map((r) => (
            <div key={r.id}>
              <span className="banner-chip" style={{ background: r.color }} aria-hidden /> {r.name} ({r.emblem}), to the {r.where}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
