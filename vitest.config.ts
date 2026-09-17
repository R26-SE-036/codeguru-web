import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The hermetic suite: `npm test`.
 *
 * No network, no services, no browser. Every backend is a stubbed `fetch`, so
 * this runs anywhere in a few seconds and is the one to run on every change.
 * The suites that need the running platform are separate configs -
 * vitest.system.config.ts and playwright.config.ts - for the same reason the
 * backends keep their integration tests apart: a unit suite that needs seven
 * containers is a unit suite nobody runs.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
