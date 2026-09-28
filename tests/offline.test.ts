import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serviceWorkerSource } from '../build/offline';

describe('works offline', () => {
  it('the page loads nothing from other sites (fonts are bundled)', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toMatch(/manifest\.webmanifest/);
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toMatch(/@fontsource\/pixelify-sans/);
    expect(main).toMatch(/@fontsource\/atkinson-hyperlegible/);
    const css = readFileSync('src/ui/styles.css', 'utf8');
    expect(css).not.toMatch(/https?:\/\//);
  });

  it('the service worker precaches every built file and answers from the cache first', () => {
    const sw = serviceWorkerSource(['assets/index-abc.js', 'assets/index-def.css', 'assets/font.woff2'], 'v-test');
    for (const f of ['./', './index.html', './assets/index-abc.js', './assets/index-def.css', './assets/font.woff2', './manifest.webmanifest']) expect(sw).toContain(JSON.stringify(f));
    expect(sw).toContain('little-valley-v-test');
    expect(sw).toMatch(/caches\.match/);
    // Old caches are removed when a new version activates.
    expect(sw).toMatch(/caches\.delete/);
  });
});
