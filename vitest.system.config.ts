import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The system suite: `npm run test:system`.
 *
 * The whole platform, running, exercised through its one public address the
 * way a browser and the editor extension reach it - Caddy on HTTP_PORT, which
 * is what a deployment exposes. Nothing is stubbed. It is the gate before a
 * deploy: it fails, and says why, when the stack is not up or a dependency it
 * needs (Neo4j, Atlas, Neon) is not answering.
 *
 *     cd deploy && docker compose up -d --wait
 *     npm run test:system                     # SYSTEM_BASE_URL defaults to http://localhost:8090
 *
 * It creates real accounts, marked by name and on example.com, in the real
 * databases, and does not delete them - the platform has no account deletion.
 * Generating a lesson and a quiz spends the Gemini daily quota, so those two
 * checks run only with SYSTEM_TESTS_LLM=1.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/system/**/*.test.ts'],
    globalSetup: ['tests/system/global-setup.ts'],
    // One after another: they share a student, and Code Coach rate-limits
    // credential calls per client.
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 150_000,
  },
});
