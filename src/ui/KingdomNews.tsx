import { useSnapshot } from './context';

/** News as it reached you: who told you, how sure it is, and how old. */
export function KingdomNews() {
  const s = useSnapshot();
  const n = s.news;
  if (n.items.length === 0) return <p className="muted">No news yet. Merchants, allies, your envoy and your borders bring word of other kingdoms.</p>;
  return (
    <section className="family-card">
      <h3>News</h3>
      {n.items.map((i) => (
        <div key={i.id} className={`route news-${i.certainty}`}>
          <div>
            {i.text}
            {i.corrected ? ' (corrects an earlier report)' : ''}
          </div>
          <div className="muted">
            {i.certainty === 'rumor' ? 'Rumour' : i.certainty === 'observed' ? 'Seen' : 'Confirmed'} · {i.source} · {i.age} · {i.where}
          </div>
        </div>
      ))}
      {n.summarised > 0 && <p className="muted">{n.summarised} older reports have been summarised away.</p>}
    </section>
  );
}
