import { defineConfig } from 'vitest/config';

// Core alone (cd packages/core && npx vitest run): node environment, no DOM, and no `performance` global, to prove the
// core never reads a clock by itself. The root `npm test` runs these same files once, with the root config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
