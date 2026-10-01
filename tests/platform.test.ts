import { describe, expect, it } from 'vitest';
import { detectDevice, installSteps, needsLandscape, runsAsApp } from '../src/ui/platform';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
};

describe('running as an app', () => {
  it('counts the installed window modes and iOS home-screen apps as the app; a browser tab is not', () => {
    expect(runsAsApp({ displayMode: 'standalone' })).toBe(true);
    expect(runsAsApp({ displayMode: 'fullscreen' })).toBe(true);
    expect(runsAsApp({ displayMode: 'minimal-ui' })).toBe(true);
    expect(runsAsApp({ displayMode: 'window-controls-overlay' })).toBe(true);
    expect(runsAsApp({ displayMode: 'browser', iosStandalone: true })).toBe(true);
    expect(runsAsApp({ displayMode: 'browser', referrer: 'android-app://com.example.app/' })).toBe(true);
    expect(runsAsApp({ displayMode: 'browser' })).toBe(false);
  });
});

describe('install help for each browser', () => {
  it('tells iPhone and iPad players to use Safari’s Share → Add to Home Screen', () => {
    expect(detectDevice(UA.iphoneSafari, 5)).toEqual({ os: 'ios', browser: 'safari' });
    expect(installSteps(detectDevice(UA.iphoneSafari, 5)).join(' ')).toMatch(/Share.*Add to Home Screen/);
    // An iPad asking for the desktop site still has a touch screen.
    expect(detectDevice(UA.ipadDesktopMode, 5).os).toBe('ios');
    // Other browsers on iOS: Safari is the one that can add it, so say so.
    expect(installSteps(detectDevice(UA.iphoneChrome, 5)).join(' ')).toMatch(/Safari/);
  });

  it('gives Android and desktop Chrome or Edge the install menu', () => {
    expect(detectDevice(UA.androidChrome, 5)).toEqual({ os: 'android', browser: 'chrome' });
    expect(installSteps(detectDevice(UA.androidChrome, 5)).join(' ')).toMatch(/Install app|Add to Home screen/);
    expect(detectDevice(UA.samsung, 5).browser).toBe('samsung');
    expect(detectDevice(UA.winEdge, 0)).toEqual({ os: 'desktop', browser: 'edge' });
    expect(installSteps(detectDevice(UA.winEdge, 0)).join(' ')).toMatch(/Apps/);
    expect(installSteps(detectDevice(UA.winChrome, 0)).join(' ')).toMatch(/Install/);
  });

  it('sends desktop Firefox players to a browser that can install apps', () => {
    expect(detectDevice(UA.winFirefox, 0)).toEqual({ os: 'desktop', browser: 'firefox' });
    expect(installSteps(detectDevice(UA.winFirefox, 0)).join(' ')).toMatch(/Chrome|Edge/);
    expect(installSteps(detectDevice(UA.macSafari, 0)).join(' ')).toMatch(/Add to Dock/);
  });
});

describe('landscape on phones and tablets', () => {
  it('asks touch screens held upright to turn sideways; desktops and landscape screens are fine', () => {
    expect(needsLandscape({ coarse: true, width: 390, height: 844 })).toBe(true);
    expect(needsLandscape({ coarse: true, width: 768, height: 1024 })).toBe(true);
    expect(needsLandscape({ coarse: true, width: 844, height: 390 })).toBe(false);
    expect(needsLandscape({ coarse: false, width: 500, height: 900 })).toBe(false);
  });
});
