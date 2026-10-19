// =============================================================================
//  index.js — starts the showcase server:  node server/index.js   (npm start)
//  Serves the built game (dist/), the phone page, the API and live events from ONE address,
//  so the laptop and the phones talk to the same place.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { createApp } from './app.js';
import { lanAddresses } from './util.js';

const cfg = loadConfig();

if (process.argv.includes('--clear-data')) {
  // Safe reset: only ever touches the data folder this server uses, and only the database + uploads inside it.
  const dir = cfg.dataDir;
  if (path.basename(dir) !== 'data' && !process.env.DATA_DIR) { console.error('Refusing to clear an unexpected folder:', dir); process.exit(1); }
  for (const name of ['uploads', 'garden.sqlite', 'garden.sqlite-wal', 'garden.sqlite-shm']) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  console.log(`Cleared demo data in ${dir}`);
  process.exit(0);
}

const store = openStore(cfg.dataDir);
const app = createApp({ cfg, store });
await app.sweep(); // remove anything that expired while the server was off

const sweeper = setInterval(() => { app.sweep().catch((e) => console.error('Cleanup failed:', e.message)); }, cfg.sweepMs);
sweeper.unref();

app.server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${cfg.port} is already in use. Close the other program, or choose another port:\n  PORT=3100 npm start        (macOS / Linux)\n  $env:PORT=3100; npm start  (Windows PowerShell)\n`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

app.server.listen(cfg.port, cfg.host, () => {
  const lan = lanAddresses();
  const built = fs.existsSync(path.join(cfg.distDir, 'index.html'));
  console.log('\n  Our Memory Garden — showcase server');
  console.log('  ------------------------------------');
  console.log(`  Host this on your laptop:   http://localhost:${cfg.port}/     <- open THIS on the laptop`);
  if (cfg.host === '127.0.0.1' || cfg.host === 'localhost') {
    console.log('  (HOST is set to this computer only: phones cannot connect. Remove HOST to allow them.)');
  } else if (lan.length) {
    console.log('  Phones on the same network use the address in the QR code, which will be based on:');
    lan.forEach((a, i) => console.log(`    ${i === 0 ? '*' : ' '} http://${a.address}:${cfg.port}/   (${a.name})`));
    console.log('  If the QR code shows the wrong address, change it in the host panel (Invite tab) or set PUBLIC_HOST.');
  } else {
    console.log('  No network address found: phones cannot reach this computer until it is on Wi-Fi/Ethernet or a hotspot.');
  }
  if (!built) console.log('\n  NOTE: the game has not been built yet. Run "npm run build" first (or use "npm run dev").');
  console.log(`\n  Sessions expire after ${Math.round(cfg.sessionTtlMs / 3600000 * 10) / 10} h. Data folder: ${cfg.dataDir}`);
  console.log('  Press Ctrl+C to stop.\n');
});

const shutdown = async () => {
  clearInterval(sweeper);
  await app.close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
