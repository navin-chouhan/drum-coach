import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // the lazy notation chunk (VexFlow + embedded Bravura font, for offline use) is ~720 kB on its own
  build: { chunkSizeWarningLimit: 800 },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.PORT || 8787}` },
  },
});
