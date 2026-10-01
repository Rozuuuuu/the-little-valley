import { describe, expect, it } from 'vitest';
import { buildInfo, serviceWorkerSource } from '../build/offline';
import { isUpdate, type BuildInfo } from '../src/ui/version';
import { browserPlayAllowed, BROWSER_PLAY_KEY } from '../src/ui/platform';

const build = (commit: string, date = '2026-10-01T10:00:00Z'): BuildInfo => ({ commit, short: commit.slice(0, 7), date, message: 'msg' });

describe('updates', () => {
  it('stamps each build with its git commit, or "dev" without git', () => {
    const fake = (cmd: string) => ({ 'rev-parse HEAD': 'abcdef1234567890', 'log -1 --format=%cI': '2026-10-01T10:00:00+08:00', 'log -1 --format=%s': 'Grow the valley' })[cmd] ?? '';
    expect(buildInfo(fake)).toEqual({ commit: 'abcdef1234567890', short: 'abcdef1', date: '2026-10-01T10:00:00+08:00', message: 'Grow the valley' });
    expect(buildInfo(() => { throw new Error('no git'); }).commit).toBe('dev');
  });

  it('a different published commit is an update; the same one, or a dev build, is not', () => {
    expect(isUpdate(build('aaa1111'), build('bbb2222'))).toBe(true);
    expect(isUpdate(build('aaa1111'), build('aaa1111'))).toBe(false);
    expect(isUpdate(build('dev'), build('bbb2222'))).toBe(false);
    expect(isUpdate(build('aaa1111'), null)).toBe(false);
  });

  it('the service worker never serves a cached version.json, and waits to be told before taking over', () => {
    const sw = serviceWorkerSource(['assets/a.js'], 'v1');
    expect(sw).toMatch(/version\.json/);
    expect(sw).toMatch(/no-store/);
    // A new version installs in the background; the page decides when to switch.
    expect(sw).not.toMatch(/addAll\(FILES\)\)\.then\(\(\) => self\.skipWaiting\(\)\)/);
    expect(sw).toMatch(/'skip-waiting'/);
    expect(sw).not.toContain(JSON.stringify('./version.json'));
  });
});

describe('playing in the browser for testing', () => {
  it('is allowed by ?play=browser or a remembered choice', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(browserPlayAllowed('', storage)).toBe(false);
    expect(browserPlayAllowed('?play=browser', storage)).toBe(true);
    store.set(BROWSER_PLAY_KEY, '1');
    expect(browserPlayAllowed('', storage)).toBe(true);
  });
});
