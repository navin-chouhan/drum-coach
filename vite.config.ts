import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Where the server keeps your data (server/db.ts): the practice database, uploaded audio, voices, recordings.
  const dataDir = resolve(import.meta.dirname, loadEnv(mode, import.meta.dirname, '').DATA_DIR || 'data');
  return {
    plugins: [react()],
    // the lazy notation chunk (VexFlow + embedded Bravura font, for offline use) is ~720 kB on its own
    build: { chunkSizeWarningLimit: 800 },
    server: {
      port: 5173,
      strictPort: true,
      // The app only fetches from its own origin. Vite's default CORS lets any localhost page (another project's dev
      // server, a downloaded HTML file) read the app and, through the proxy, the API.
      cors: false,
      // Vite's defaults, plus your data: never served as files (the app reads it through the API). Patterns with a
      // slash match absolute paths, hence the resolved folder.
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', `${dataDir}/**`, '*.db', '*.db-*'] },
      proxy: { '/api': `http://localhost:${process.env.PORT || 8787}` },
    },
  };
});
