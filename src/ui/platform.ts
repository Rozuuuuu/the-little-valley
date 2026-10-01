/**
 * Where the game is running: as the installed app or in a browser tab, on which kind of
 * device and browser, and whether the screen is the right way round. Little Valley is played
 * as an installed app, in landscape; a browser tab only offers the download.
 */

export type DisplayMode = 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui' | 'window-controls-overlay';

export interface AppSignals {
  displayMode: DisplayMode;
  /** Safari on iOS sets navigator.standalone for home-screen apps. */
  iosStandalone?: boolean;
  /** A Trusted Web Activity (an Android app wrapping the game) opens it with this referrer. */
  referrer?: string;
}

/** Running as the installed app, not in an ordinary browser tab. */
export function runsAsApp(s: AppSignals): boolean {
  return s.displayMode !== 'browser' || s.iosStandalone === true || (s.referrer ?? '').startsWith('android-app://');
}

/** The current page's signals. */
export function currentAppSignals(): AppSignals {
  const modes: DisplayMode[] = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay'];
  const displayMode = modes.find((m) => window.matchMedia?.(`(display-mode: ${m})`).matches) ?? 'browser';
  return { displayMode, iosStandalone: (navigator as { standalone?: boolean }).standalone === true, referrer: document.referrer };
}

export interface Device {
  os: 'ios' | 'android' | 'desktop';
  browser: 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other';
}

/** The kind of device and browser, from the user agent and the number of touch points. */
export function detectDevice(ua: string, maxTouchPoints: number): Device {
  // An iPad asking for the desktop site says "Macintosh" but has a touch screen.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const os: Device['os'] = ios ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  let browser: Device['browser'] = 'other';
  if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'edge';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'firefox';
  else if (/Chrome|CriOS|Chromium/.test(ua)) browser = 'chrome';
  else if (/Safari/.test(ua)) browser = 'safari';
  return { os, browser };
}

/** How to install the game on this device, step by step. */
export function installSteps(d: Device): string[] {
  if (d.os === 'ios') {
    if (d.browser !== 'safari') return ['Open this page in Safari (only Safari can add apps to the Home Screen on iPhone and iPad).', 'Tap the Share button, then “Add to Home Screen”.', 'Open Little Valley from your Home Screen.'];
    return ['Tap the Share button (the square with an arrow) at the bottom or top of Safari.', 'Choose “Add to Home Screen”, then “Add”.', 'Open Little Valley from your Home Screen.'];
  }
  if (d.os === 'android') {
    if (d.browser === 'samsung') return ['Tap the menu (☰) at the bottom of Samsung Internet.', 'Choose “Add page to” → “Home screen”.', 'Open Little Valley from your home screen.'];
    if (d.browser === 'firefox') return ['Tap the menu (⋮) in Firefox.', 'Choose “Install” (or “Add to Home screen”).', 'Open Little Valley from your home screen.'];
    return ['Tap the browser menu (⋮) at the top right.', 'Choose “Install app” (or “Add to Home screen”).', 'Open Little Valley from your home screen or app drawer.'];
  }
  if (d.browser === 'edge') return ['Open the Edge menu (…) at the top right.', 'Choose “Apps” → “Install Little Valley”.', 'Little Valley opens in its own window, and from now on from your Start menu or desktop.'];
  if (d.browser === 'chrome') return ['Click the install icon at the right end of the address bar (a screen with an arrow), or open the menu (⋮) → “Cast, save and share” → “Install page as app”.', 'Click “Install”.', 'Little Valley opens in its own window, and from now on from your Start menu, dock or desktop.'];
  if (d.browser === 'safari') return ['In Safari’s menu bar, choose File → “Add to Dock”.', 'Click “Add”.', 'Open Little Valley from your Dock or Applications folder.'];
  return ['This browser can’t install apps. Open this page in Chrome or Microsoft Edge (or Safari on a Mac).', 'Then install it from the browser’s menu.', 'Little Valley opens in its own window from then on.'];
}

/** A touch screen held upright: the game asks to be turned sideways. */
export function needsLandscape(s: { coarse: boolean; width: number; height: number }): boolean {
  return s.coarse && s.height > s.width;
}
