import { useEffect, useState } from 'react';
import { applyUpdate, onUpdateChange, updateState } from './updates';

/**
 * A new version of the game: on the title screen (nothing open) it is applied at once; during
 * play a banner offers to save and update now, or later (then it is applied the next time the
 * title screen is reached).
 */
export function UpdateBanner({ idle, inGame, save }: { idle: boolean; inGame: boolean; save: () => Promise<unknown> }) {
  const [, bump] = useState(0);
  const [later, setLater] = useState(false);
  useEffect(() => onUpdateChange(() => bump((n) => n + 1)), []);
  const s = updateState();

  useEffect(() => {
    if (s.status === 'ready' && idle) void applyUpdate();
  }, [s.status, idle]);

  if (!inGame || later || (s.status !== 'ready' && s.status !== 'updating')) return null;
  const what = s.latest ? `${s.latest.short}${s.latest.message ? ` — ${s.latest.message}` : ''}` : '';
  return (
    <div className="panel update-banner" role="status">
      {s.status === 'updating' ? (
        <span>Saving and updating…</span>
      ) : (
        <>
          <span>
            <strong>A new version is ready.</strong> {what}
          </span>
          <span className="update-actions">
            <button className="btn small primary" onClick={() => void applyUpdate(save)}>
              Save and update
            </button>
            <button className="btn small" onClick={() => setLater(true)}>
              Later
            </button>
          </span>
        </>
      )}
    </div>
  );
}
