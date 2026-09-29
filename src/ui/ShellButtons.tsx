import { useEffect, useState } from 'react';
import { canInstall, install, isFullscreen, onShellChange, toggleFullscreen } from './appShell';

/** Install as an app (when the browser offers it) and full screen. */
export function ShellButtons() {
  const [, bump] = useState(0);
  useEffect(() => onShellChange(() => bump((n) => n + 1)), []);
  return (
    <div className="extra">
      {canInstall() && (
        <button className="btn primary" onClick={() => void install()}>
          ⬇ Install app
        </button>
      )}
      <button className="btn" onClick={() => void toggleFullscreen()}>
        {isFullscreen() ? '⤡ Leave full screen' : '⤢ Full screen'}
      </button>
    </div>
  );
}
