import { defineConfig } from 'vite';

// Relative base so the production build also works when served from any folder.
export default defineConfig({
  base: './',
  server: { host: 'localhost', port: 5173, open: false },
  preview: { host: 'localhost', port: 4173 },
  build: { chunkSizeWarningLimit: 900 }
});
