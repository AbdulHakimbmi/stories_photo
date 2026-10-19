// =============================================================================
//  util.js — tokens, hashing, text cleaning, rate limiting, network helpers.
// =============================================================================
import crypto from 'node:crypto';
import os from 'node:os';

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const randomId = (bytes = 9) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Constant-time comparison of two hex digests. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

/**
 * Clean user text. Text is only ever rendered as text by the clients, but we also
 * drop control characters and bound the length so the database stays tidy.
 */
export function cleanText(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ');
  s = s.replace(/[‪-‮⁦-⁩]/g, ''); // bidi override characters
  s = multiline ? s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

/** Sliding-window rate limiter kept in memory (fine for a single-process demo). */
export class RateLimiter {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.hits = new Map();
  }
  /** Returns true if allowed (and records the hit). */
  take(key, limit, windowMs) {
    const t = this.now();
    const list = (this.hits.get(key) || []).filter((x) => t - x < windowMs);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 5000) this.prune(windowMs);
    return true;
  }
  prune(windowMs) {
    const t = this.now();
    for (const [k, list] of this.hits) if (!list.some((x) => t - x < windowMs)) this.hits.delete(k);
  }
}

/** Private network addresses of this machine, best guess first (Wi-Fi/Ethernet before virtual adapters). */
export function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const [name, list] of Object.entries(nets)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const virtual = /^(docker|veth|br-|vmnet|vbox|virbr|utun|awdl|llw|tailscale|zt|wsl|vEthernet)/i.test(name);
      const rank = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) ? 0 : 1;
      out.push({ name, address: a.address, rank: rank + (virtual ? 2 : 0) });
    }
  }
  return out.sort((x, y) => x.rank - y.rank);
}

export function ownAddresses() {
  const set = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) set.add(a.address);
  return set;
}

/** Is this request coming from the same computer the server runs on? */
export function isLocalRequest(req) {
  let addr = req.socket && req.socket.remoteAddress;
  if (!addr) return false;
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  return ownAddresses().has(addr);
}

/** Accept "192.168.1.5", "192.168.1.5:3000", "my-laptop.local" … and nothing else. */
export function parseAdvertisedHost(input, defaultPort) {
  const s = String(input || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const m = /^([A-Za-z0-9]([A-Za-z0-9.-]{0,120}[A-Za-z0-9])?)(?::(\d{1,5}))?$/.exec(s);
  if (!m) return null;
  const port = m[3] ? Number(m[3]) : defaultPort;
  if (port < 1 || port > 65535) return null;
  return { hostname: m[1], port };
}

export function redactPath(p) {
  return String(p).replace(/(\/(?:p|join)\/)[^/?#]+/g, '$1<token>');
}
