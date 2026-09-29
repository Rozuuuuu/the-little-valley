import { Select } from './Select';
import { useState } from 'react';
import type { ResourceId } from '../game/data/resources';
import { useGame, useSnapshot } from './context';

/** Supply routes between settlements, served by caravans from a depot. */
export function Routes() {
  const { game } = useGame();
  const s = useSnapshot();
  const l = s.logistics;
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [res, setRes] = useState<ResourceId>('food');
  const [target, setTarget] = useState(30);
  const src = from ?? l.stores[0]?.id;
  const dst = to ?? l.stores.find((x) => x.id !== src)?.id;
  return (
    <section className="family-card">
      <h3>Supply routes</h3>
      {l.routes.length === 0 && <p className="muted">Caravans keep a store in another settlement stocked. Build a Caravan Depot where the goods come from and assign a teamster to it.</p>}
      {l.routes.map((r) => (
        <div key={r.id} className="route">
          <div>
            {r.resName}: {r.from} → {r.to}
          </div>
          <div className="row">
            <span>Keep</span>
            <button className="btn small" onClick={() => game.dispatch({ type: 'setRouteTarget', routeId: r.id, target: Math.max(1, r.target - 10) })}>
              −
            </button>
            <span>{r.target}</span>
            <button className="btn small" onClick={() => game.dispatch({ type: 'setRouteTarget', routeId: r.id, target: r.target + 10 })}>
              +
            </button>
            <button className="btn small" onClick={() => game.dispatch({ type: 'cancelRoute', routeId: r.id })}>
              End
            </button>
          </div>
          <div className="muted">{r.status}</div>
        </div>
      ))}
      {l.stores.length >= 2 && (
        <div className="route-form">
          <label>
            From{' '}
            <Select value={src} onChange={(e) => setFrom(Number(e.target.value))}>
              {l.stores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            To{' '}
            <Select value={dst} onChange={(e) => setTo(Number(e.target.value))}>
              {l.stores.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Goods{' '}
            <Select value={res} onChange={(e) => setRes(e.target.value as ResourceId)}>
              {l.resources.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Keep <input type="number" min={1} max={500} value={target} onChange={(e) => setTarget(Number(e.target.value))} style={{ width: 56 }} />
          </label>
          <button
            className="btn small"
            disabled={src === undefined || dst === undefined}
            onClick={() => src !== undefined && dst !== undefined && game.dispatch({ type: 'createRoute', sourceId: src, destinationId: dst, resource: res, target })}
          >
            Start route
          </button>
        </div>
      )}
      {l.carts > 0 && <p className="muted">{l.carts} cart{l.carts === 1 ? '' : 's'} on the road.</p>}
      {l.towns.length > 0 && (
        <p className="muted">
          Towns you have heard of: {l.towns.map((t) => `${t.name} (${t.where})`).join('; ')}.
        </p>
      )}
    </section>
  );
}

/** Barter with the merchant lodging at an inn. */
export function InnPanel() {
  const { game } = useGame();
  const s = useSnapshot();
  const inn = s.building?.inn;
  const [take, setTake] = useState<ResourceId | ''>('');
  const [takeN, setTakeN] = useState(1);
  const [give, setGive] = useState<ResourceId | ''>('');
  const [giveN, setGiveN] = useState(1);
  if (!inn) return null;
  const g = inn.guest;
  if (!g) return <p className="muted">No guest right now. {inn.next}</p>;
  const takeItem = g.stock.find((x) => x.res === take) ?? g.stock[0];
  const giveItem = g.buys.find((x) => x.res === give) ?? g.buys.find((x) => x.res === 'tools') ?? g.buys[0];
  const asked = takeItem ? takeItem.price * takeN : 0;
  const offered = giveItem ? giveItem.price * giveN : 0;
  return (
    <div className="residents">
      <div>
        <strong>{g.name}</strong> from {g.from} · {g.state}
        {g.leavesIn ? ` · leaves in ${g.leavesIn}` : ''}
      </div>
      <div className="muted">Sells: {g.stock.map((x) => `${x.n} ${x.name} (${x.price} each)`).join(', ') || 'nothing left'}</div>
      {g.state.startsWith('Staying') && takeItem && giveItem && (
        <>
          <div className="row">
            Take
            <input type="number" min={1} value={takeN} onChange={(e) => setTakeN(Math.max(1, Number(e.target.value)))} style={{ width: 46 }} />
            <Select value={takeItem.res} onChange={(e) => setTake(e.target.value as ResourceId)}>
              {g.stock.map((x) => (
                <option key={x.res} value={x.res}>
                  {x.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="row">
            Give
            <input type="number" min={1} value={giveN} onChange={(e) => setGiveN(Math.max(1, Number(e.target.value)))} style={{ width: 46 }} />
            <Select value={giveItem.res} onChange={(e) => setGive(e.target.value as ResourceId)}>
              {g.buys.map((x) => (
                <option key={x.res} value={x.res}>
                  {x.name} ({x.price})
                </option>
              ))}
            </Select>
          </div>
          <div className={offered >= asked ? 'muted' : 'reason'}>
            They ask {asked}; you offer {offered}.
          </div>
          <button
            className="btn small primary"
            disabled={offered < asked}
            onClick={() => game.dispatch({ type: 'barter', partyId: g.id, give: { [giveItem.res]: giveN }, take: { [takeItem.res]: takeN } })}
          >
            Trade
          </button>
        </>
      )}
    </div>
  );
}
