import { configDefaults, defineConfig } from 'vitest/config';

<<<<<<< HEAD
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.claude/**', 'data/**', 'spikes/**', 'apps/**'],
    setupFiles: ['./vitest.setup.ts'], // a temporary DATA_DIR per test file: your practice data is never touched
    // `npm run test:coverage`: the input → scoring path (src/engine) and the server's modules are unit-tested and must
    // stay that way; the screens are covered by the play test instead. Thresholds sit just under today's numbers: raise
    // them when coverage goes up, never lower them.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/main.tsx', 'src/vite-env.d.ts', 'server/index.ts' /* routes: wiring only */],
      reporter: ['text-summary', 'html'],
      thresholds: {
        'src/engine/**': { statements: 98, branches: 90, functions: 98, lines: 99 },
        'server/**': { statements: 69, branches: 61, functions: 69, lines: 75 },
      },
    },
  },
});
=======
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.claude/**', 'data/**', 'spikes/**', 'apps/**'] } });
>>>>>>> 6c6f440 (Phase 1 start: core workspace skeleton, platform contracts, briefs A1/A2/A3/A9, board)
