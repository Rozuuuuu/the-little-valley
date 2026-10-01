import { useEffect, useState } from 'react';
import { canInstall, install, onShellChange } from './appShell';
import { BROWSER_PLAY_KEY, detectDevice, installSteps } from './platform';

/**
 * Shown instead of the game in an ordinary browser tab: Little Valley is played as an
 * installed app. Offers the browser's own install button where there is one, and the steps
 * for this device and browser otherwise.
 */
export function InstallGate({ onPlayInBrowser }: { onPlayInBrowser: () => void }) {
  const [, bump] = useState(0);
  const [installed, setInstalled] = useState(false);
  useEffect(() => onShellChange(() => bump((n) => n + 1)), []);
  useEffect(() => {
    const done = () => setInstalled(true);
    window.addEventListener('appinstalled', done);
    return () => window.removeEventListener('appinstalled', done);
  }, []);
  const device = detectDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const steps = installSteps(device);
  const offer = canInstall();
  return (
    <div className="install-gate">
      <div className="panel install-card" role="main">
        <h1 className="logo install-logo">
          Little
          <span className="second">Valley</span>
        </h1>
        {installed ? (
          <>
            <h2>Installed!</h2>
            <p>Open Little Valley from your {device.os === 'desktop' ? 'Start menu, dock or desktop' : 'home screen'} to play.</p>
          </>
        ) : (
          <>
            <h2>Download to play</h2>
            <p>Little Valley is an app: install it to play. It runs full screen{device.os === 'desktop' ? '' : ' in landscape'}, works offline, and keeps your valleys on this device.</p>
            {offer && (
              <button className="btn primary install-btn" onClick={() => void install()} autoFocus>
                ⬇ Install Little Valley
              </button>
            )}
            <ol className="install-steps" aria-label={offer ? 'Or install it yourself' : 'How to install'}>
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="muted">Already installed? Open Little Valley from your apps instead of this browser tab.</p>
          </>
        )}
        <button
          className="btn small browser-play"
          onClick={() => {
            try {
              window.localStorage.setItem(BROWSER_PLAY_KEY, '1');
            } catch {
              // Not remembered (private browsing): it still plays this time.
            }
            onPlayInBrowser();
          }}
        >
          Play in the browser anyway (for testing)
        </button>
      </div>
    </div>
  );
}
