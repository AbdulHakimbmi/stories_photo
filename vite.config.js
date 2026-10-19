import { defineConfig } from 'vite';

// Development: the page is served by Vite (hot reload) on :5173, and every server call
// (/api, the phone page /join and its assets) is forwarded to the garden server on :3000.
// Production ("npm run showcase" / "npm start"): the garden server serves the built game itself.
const SERVER = process.env.GARDEN_SERVER || 'http://localhost:3000';
const proxy = {
  '/api': { target: SERVER, changeOrigin: false },
  '/join': { target: SERVER, changeOrigin: false },
  '/join-assets': { target: SERVER, changeOrigin: false },
};

export default defineConfig({
  base: './',
  server: { host: 'localhost', port: 5173, open: false, proxy },
  preview: { host: 'localhost', port: 4173, proxy },
  build: { chunkSizeWarningLimit: 900 },
});
