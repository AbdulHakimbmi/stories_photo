// =============================================================================
//  config.js — server settings. Everything has a safe default; override with
//  environment variables (see .env.example). No secrets live in this file.
// =============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const CATEGORIES = ['everyday', 'celebrations', 'people', 'places'];
export const SLOTS_PER_CATEGORY = 8;

export function loadConfig(env = process.env, overrides = {}) {
  const cfg = {
    root: ROOT,
    port: num(env.PORT, 3000),
    // 0.0.0.0 = reachable from other devices on your network (needed for phones).
    // Use HOST=127.0.0.1 to keep the server private to this computer.
    host: env.HOST || '0.0.0.0',
    publicHost: (env.PUBLIC_HOST || '').trim(), // optional: force the address shown in the QR code
    dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
    distDir: path.join(ROOT, 'dist'),
    webDir: path.join(ROOT, 'server', 'web'),
    sessionTtlMs: num(env.SESSION_TTL_HOURS, 4) * 3600 * 1000,
    maxUploadBytes: num(env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
    maxInputPixels: 60e6,   // decoder refuses anything larger (decompression-bomb guard)
    maxInputDimension: 14000,
    displayMax: 1600,       // longest edge of the stored display image
    thumbMax: 640,          // longest edge of the thumbnail used on the 3D cards
    maxMemoriesPerSession: 40,
    maxResponsesPerSession: 80,
    maxPerCategory: SLOTS_PER_CATEGORY,
    maxActiveSessions: 5,
    allowRemoteHost: env.ALLOW_REMOTE_HOST === '1', // let non-local machines create sessions (off by default)
    logRequests: env.LOG_REQUESTS === '1',
    sweepMs: 60 * 1000,
    uploadsPerWindow: 8,    // per IP per session
    responsesPerWindow: 12,
    rateWindowMs: 10 * 60 * 1000,
    now: () => Date.now(),
  };
  return Object.assign(cfg, overrides);
}
