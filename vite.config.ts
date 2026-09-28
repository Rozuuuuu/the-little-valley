import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { offlinePrecache } from './build/offline';

export default defineConfig({
  // Relative paths, so the built game also runs from any folder or file host.
  base: './',
  plugins: [react(), offlinePrecache()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
