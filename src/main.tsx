import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts ship with the game so it looks the same offline.
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import { App } from './ui/App';
import { InstallGate } from './ui/InstallGate';
import { currentAppSignals, runsAsApp } from './ui/platform';
import { lockLandscape } from './ui/RotateNotice';
import { installHudTextures } from './ui/hudTextures';
import './ui/styles.css';
import './ui/hud.css';
import './ui/pixel.css';

// Pixel dirt and grass for the HUD, painted from the game's palette.
installHudTextures();

/** Development builds (the dev server, scripted screenshots) play in the browser too. */
const DEV_PLAY = import.meta.env.DEV || import.meta.env.MODE === 'development';

/**
 * Little Valley is an app: in an ordinary browser tab it only offers the download. Installed,
 * it opens in its own window and asks to stay in landscape.
 */
function Root() {
  const [asApp, setAsApp] = useState(() => DEV_PLAY || runsAsApp(currentAppSignals()));
  useEffect(() => {
    // The page may switch into the app window (e.g. Chrome's "Open in app").
    const queries = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].map((m) => window.matchMedia(`(display-mode: ${m})`));
    const check = () => setAsApp(DEV_PLAY || runsAsApp(currentAppSignals()));
    queries.forEach((q) => q.addEventListener?.('change', check));
    return () => queries.forEach((q) => q.removeEventListener?.('change', check));
  }, []);
  useEffect(() => {
    if (asApp) lockLandscape();
  }, [asApp]);
  return asApp ? <App /> : <InstallGate />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// The production build caches itself so the game runs with no network.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline caching is a bonus; the game still runs without it.
    });
  });
}
