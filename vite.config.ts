import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { buildInfo, offlinePrecache } from './build/offline';

/** The commit this build is made from: shown in the game, and how installed apps spot updates. */
const BUILD = buildInfo();

export default defineConfig({
  // Relative paths, so the built game also runs from any folder or file host.
  base: './',
  plugins: [react(), offlinePrecache(BUILD)],
  define: { __BUILD__: JSON.stringify(BUILD) },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
