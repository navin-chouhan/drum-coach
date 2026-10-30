import { defineConfig } from 'vitest/config';

// Only the pure TypeScript (src/shared) and the Mac-side tool's loader run here; the app and the native module need a device.
export default defineConfig({ test: { include: ['src/shared/**/*.test.ts', 'tools/**/*.test.mjs'], environment: 'node' } });
