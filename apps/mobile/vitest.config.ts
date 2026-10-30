import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const appRoot = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(appRoot, '../../packages/core');

// Same rule as metro.config.js: a bare import made by a core file resolves from this app's node_modules.
function coreDepsFromApp(): Plugin {
  return {
    name: 'drum-coach-core-deps-from-app',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || source.startsWith('.') || source.startsWith('\0') || isAbsolute(source)) return null;
      if (!importer.startsWith(coreRoot + sep)) return null;
      return this.resolve(source, join(appRoot, 'package.json'), { skipSelf: true });
    },
  };
}

// Pure TypeScript only (node environment): src/** here and the pure parts of A3's native module wrapper.
export default defineConfig({
  plugins: [coreDepsFromApp()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'modules/**/src/**/*.test.ts'],
  },
});
