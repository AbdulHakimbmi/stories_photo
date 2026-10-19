// =============================================================================
//  app.js — the HTTP API, static file serving and live events, using only Node's
//  built-in `http` module (no Express). Every route is listed in one place below.
//
//  Roles
//   host         X-Host-Token header  → approve / hide / delete / lock / end. Created only on this computer.
//   participant  join token in the path (/api/p/<join>/…) → submit a memory or recollection, view approved ones.
//   contributor  private manage token (sent in a request body, never in a URL) → check status / withdraw.
// =============================================================================
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CATEGORIES } from './config.js';
import { Hub } from './hub.js';
import { processImage, saveDerivatives, safeUploadPath, deleteMemoryFiles, deleteSessionFiles } from './images.js';
import {
  HttpError, RateLimiter, cleanText, isLocalRequest, lanAddresses, parseAdvertisedHost,
  randomId, randomToken, redactPath, safeEqual, sha256,
} from './util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "connect-src 'self'", "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

const JOIN_ASSETS = new Set(['join.js', 'join.css']);

export function createApp({ cfg, store }) {
  const hub = new Hub();
  const limiter = new RateLimiter(cfg.now);
  const idempotency = new Map(); // `${sessionId}:${clientId}` -> { id, manageToken, at }
  let advertised = null;         // { hostname, port } chosen by the host, or null for automatic
  const routes = [];

  // ------------------------------------------------------------------ small helpers
  const now = () => cfg.now();
  const ip = (req) => (req.socket && req.socket.remoteAddress) || 'unknown';

  function route(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  }

  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(data);
  }

  async function readBody(req, limit) {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume(); // drain so the client can read our answer
      throw new HttpError(413, 'too_large', 'That upload is too large.');
    }
    const chunks = [];
    let size = 0;
    let over = false;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) { over = true; if (size > limit * 4) { req.destroy(); break; } continue; }
      if (!over) chunks.push(chunk);
    }
    if (over) throw new HttpError(413, 'too_large', 'That upload is too large.');
    return Buffer.concat(chunks);
  }

  async function readJson(req, limit = 16 * 1024) {
    const type = String(req.headers['content-type'] || '');
    if (!type.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'bad_content_type', 'Expected JSON.');
    const buf = await readBody(req, limit);
    try {
      const v = JSON.parse(buf.toString('utf8') || '{}');
      if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
      return v;
    } catch {
      throw new HttpError(400, 'bad_json', 'The request body was not valid JSON.');
    }
  }

  function rateLimit(req, key, limit, windowMs = cfg.rateWindowMs) {
    if (!limiter.take(`${key}:${ip(req)}`, limit, windowMs)) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a few minutes and try again.');
    }
  }

  async function purgeSession(session, reason = 'expired') { // reason: 'expired' (time limit) or 'deleted' (by the host / cleanup)
    hub.publish(`pub:${session.id}`, 'session:ended', { reason });
    hub.publish(`host:${session.id}`, 'session:ended', { reason });
    await deleteSessionFiles(store.uploadsDir, session.id);
    store.deleteSession(session.id);
    hub.closeChannel(`pub:${session.id}`);
    hub.closeChannel(`host:${session.id}`);
    for (const k of idempotency.keys()) if (k.startsWith(session.id + ':')) idempotency.delete(k);
  }

  /** Looks a session up by its join token. Expired sessions are deleted on the spot. */
  async function sessionForJoin(joinToken) {
    if (typeof joinToken !== 'string' || joinToken.length < 16 || joinToken.length > 64) throw new HttpError(404, 'not_found', 'This garden link is not valid.');
    const s = store.sessionByJoin(joinToken);
    if (!s) throw new HttpError(404, 'not_found', 'This garden link is not valid.');
    if (s.expires_at <= now()) { await purgeSession(s); throw new HttpError(410, 'expired', 'This garden session has expired.'); }
    if (s.ended_at) throw new HttpError(410, 'ended', 'The host has ended this garden session.');
    return s;
  }

  async function sessionForHost(req) {
    const token = req.headers['x-host-token'];
    if (typeof token !== 'string' || token.length < 16 || token.length > 100) throw new HttpError(401, 'unauthorized', 'Host authorisation is required.');
    const s = store.sessionByHost(sha256(token));
    if (!s) throw new HttpError(401, 'unauthorized', 'Host authorisation is required.');
    if (s.expires_at <= now()) { await purgeSession(s); throw new HttpError(410, 'expired', 'This garden session has expired.'); }
    return s;
  }

  // ------------------------------------------------------------------ serialisation (what each role may see)
  const approvedResponses = (memoryId) => store.responsesForMemory(memoryId).filter((r) => r.status === 'approved');

  function publicResponse(r) {
    return { id: r.id, name: r.author || '', text: r.text, approvedAt: r.approved_at };
  }

  /** The ONLY shape that leaves the server for display: no tokens, no file names, no pending data. */
  function publicMemory(m) {
    return {
      id: m.id, title: m.title, story: m.story, name: m.author || '', year: m.year, yearUnknown: !!m.year_unknown,
      category: m.category, slot: m.slot, width: m.width, height: m.height, approvedAt: m.approved_at,
      responses: approvedResponses(m.id).map(publicResponse),
    };
  }

  function snapshot(session) {
    return {
      session: { name: session.name, locked: !!session.locked, ended: !!session.ended_at, expiresAt: session.expires_at },
      memories: store.memories(session.id).filter((m) => m.status === 'approved').map(publicMemory),
    };
  }

  function queue(session) {
    const memories = store.memories(session.id).filter((m) => m.status === 'pending');
    const titles = new Map(store.memories(session.id).map((m) => [m.id, m.title]));
    const responses = store.responses(session.id).filter((r) => r.status === 'pending');
    return {
      memories: memories.map((m) => ({ id: m.id, title: m.title, story: m.story, name: m.author || '', year: m.year, yearUnknown: !!m.year_unknown, category: m.category, width: m.width, height: m.height, createdAt: m.created_at })),
      responses: responses.map((r) => ({ id: r.id, memoryId: r.memory_id, memoryTitle: titles.get(r.memory_id) || '', name: r.author || '', text: r.text, createdAt: r.created_at })),
    };
  }

  function hostMemories(session) {
    return store.memories(session.id).filter((m) => m.status === 'approved' || m.status === 'hidden').map((m) => ({ ...publicMemory(m), status: m.status }));
  }

  function counts(session) {
    const ms = store.memories(session.id);
    const rs = store.responses(session.id);
    return {
      pendingMemories: ms.filter((m) => m.status === 'pending').length,
      pendingResponses: rs.filter((r) => r.status === 'pending').length,
      approved: ms.filter((m) => m.status === 'approved').length,
      total: ms.filter((m) => m.status !== 'removed').length,
    };
  }

  const pub = (session, event, data) => {
    hub.publish(`pub:${session.id}`, event, data);
    hub.publish(`host:${session.id}`, event, data);
  };
  const hostOnly = (session, event, data) => hub.publish(`host:${session.id}`, event, data);
  const queueChanged = (session) => hostOnly(session, 'queue:changed', counts(session));

  // ------------------------------------------------------------------ actions shared by host and contributor
  async function removeMemoryEverywhere(session, m) {
    await deleteMemoryFiles(store.uploadsDir, session.id, [m.display_file, m.thumb_file]);
    store.tx(() => {
      store.removeMemory(m.id);
      for (const r of store.responsesForMemory(m.id)) store.removeResponse(r.id);
    });
    pub(session, 'memory:remove', { id: m.id });
    queueChanged(session);
  }

  function removeResponseEverywhere(session, r) {
    store.removeResponse(r.id);
    pub(session, 'response:remove', { memoryId: r.memory_id, id: r.id });
    queueChanged(session);
  }

  function freeSlot(session, category) {
    const used = new Set(store.memories(session.id).filter((m) => m.status === 'approved' && m.category === category).map((m) => m.slot));
    for (let i = 0; i < cfg.maxPerCategory; i++) if (!used.has(i)) return i;
    return -1;
  }

  // ------------------------------------------------------------------ links / QR (host only)
  function baseUrl() {
    if (advertised) return `http://${advertised.hostname}:${advertised.port}`;
    if (cfg.publicHost) {
      const p = parseAdvertisedHost(cfg.publicHost, cfg.port);
      if (p) return `http://${p.hostname}:${p.port}`;
    }
    const lan = lanAddresses()[0];
    return `http://${lan ? lan.address : 'localhost'}:${cfg.port}`;
  }

  async function links(session, memoryId) {
    const base = baseUrl();
    let p = `/join/${session.join_token}`;
    if (memoryId) p += `/respond/${memoryId}`;
    const url = base + p;
    return {
      url,
      baseUrl: base,
      isLocalhost: /\/\/(localhost|127\.|\[?::1)/.test(base),
      automatic: !advertised && !cfg.publicHost,
      candidates: lanAddresses().map((a) => ({ label: a.name, url: `http://${a.address}:${cfg.port}` })),
    };
  }

  // ------------------------------------------------------------------ validation of submissions
  const parseYear = (raw, unknown) => {
    if (unknown) return null;
    const s = cleanText(String(raw ?? ''), 8);
    if (!s) return null;
    if (!/^\d{4}$/.test(s)) throw new HttpError(400, 'bad_year', 'Please enter the approximate year as four digits (for example 1998), or tick "Not sure".');
    const y = Number(s);
    const max = new Date(now()).getFullYear();
    if (y < 1850 || y > max) throw new HttpError(400, 'bad_year', `The year should be between 1850 and ${max}, or tick "Not sure".`);
    return y;
  };
  const truthy = (v) => v === 'true' || v === 'on' || v === true || v === '1';

  // ------------------------------------------------------------------ ROUTES: session creation (this computer only)
  route('POST', '/api/sessions', async ({ req, res }) => {
    if (!cfg.allowRemoteHost && !isLocalRequest(req)) {
      throw new HttpError(403, 'host_local_only', 'Garden sessions can only be created from the computer that runs the server.');
    }
    const body = await readJson(req);
    // keep the number of live sessions small (demo scale); clear out finished ones first
    const all = store.allSessions();
    for (const s of all) if (s.ended_at || s.expires_at <= now()) await purgeSession(s, s.expires_at <= now() ? 'expired' : 'deleted');
    if (store.allSessions().length >= cfg.maxActiveSessions) throw new HttpError(409, 'too_many_sessions', 'Too many active garden sessions. Delete or end an old one first.');
    const hostToken = randomToken(32);
    const session = {
      id: randomId(6), name: cleanText(body.name, 60) || 'Our Memory Garden', mode: 'live',
      joinToken: randomToken(24), hostHash: sha256(hostToken), createdAt: now(), expiresAt: now() + cfg.sessionTtlMs,
    };
    store.createSession(session);
    send(res, 201, { hostToken, joinToken: session.joinToken, name: session.name, expiresAt: session.expiresAt });
  });

  // ------------------------------------------------------------------ ROUTES: host
  route('GET', '/api/h/session', async ({ req, res }) => {
    const s = await sessionForHost(req);
    send(res, 200, {
      name: s.name, joinToken: s.join_token, locked: !!s.locked, ended: !!s.ended_at, expiresAt: s.expires_at,
      counts: counts(s), limits: { maxPerCategory: cfg.maxPerCategory, maxUploadBytes: cfg.maxUploadBytes },
    });
  });

  route('GET', '/api/h/links', async ({ req, res }) => {
    const s = await sessionForHost(req);
    send(res, 200, await links(s));
  });

  route('POST', '/api/h/respond-link', async ({ req, res }) => {
    const s = await sessionForHost(req);
    const { memoryId } = await readJson(req);
    const m = typeof memoryId === 'string' ? store.memory(memoryId) : null;
    if (!m || m.session_id !== s.id || m.status !== 'approved') throw new HttpError(404, 'not_found', 'That memory is not on display.');
    send(res, 200, await links(s, m.id));
  });

  route('POST', '/api/h/advertised', async ({ req, res }) => {
    const s = await sessionForHost(req);
    const { host } = await readJson(req);
    if (!host || !String(host).trim()) advertised = null;
    else {
      const parsed = parseAdvertisedHost(host, cfg.port);
      if (!parsed) throw new HttpError(400, 'bad_host', 'Enter an address like 192.168.1.20 or 192.168.1.20:3000 (no spaces or paths).');
      advertised = parsed;
    }
    send(res, 200, await links(s));
  });

  route('GET', '/api/h/snapshot', async ({ req, res }) => {
    const s = await sessionForHost(req);
    send(res, 200, { ...snapshot(s), counts: counts(s) });
  });

  route('GET', '/api/h/queue', async ({ req, res }) => {
    const s = await sessionForHost(req);
    send(res, 200, queue(s));
  });

  route('GET', '/api/h/memories', async ({ req, res }) => {
    const s = await sessionForHost(req);
    send(res, 200, { memories: hostMemories(s) });
  });

  route('GET', '/api/h/events', async ({ req, res }) => {
    const s = await sessionForHost(req);
    if (!hub.subscribe(`host:${s.id}`, req, res)) throw new HttpError(429, 'too_many_listeners', 'Too many open game windows for this session.');
    hub.publish(`host:${s.id}`, 'hello', { counts: counts(s), locked: !!s.locked });
  });

  route('GET', '/api/h/media/:memId/:size', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    await serveImage(res, s, store.memory(params.memId), params.size, false);
  });

  route('POST', '/api/h/memories/:memId/approve', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const m = store.memory(params.memId);
    if (!m || m.session_id !== s.id || m.status === 'removed') throw new HttpError(404, 'not_found', 'That memory no longer exists.');
    if (m.status !== 'approved') {
      const slot = freeSlot(s, m.category);
      if (slot < 0) throw new HttpError(409, 'category_full', 'That area of the garden is full. Remove a memory first.');
      store.approveMemory(m.id, slot, m.approved_at || now());
    }
    const fresh = store.memory(m.id);
    pub(s, 'memory:upsert', { memory: publicMemory(fresh) });
    queueChanged(s);
    send(res, 200, { ok: true, memory: publicMemory(fresh) });
  });

  route('POST', '/api/h/memories/:memId/hide', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const m = store.memory(params.memId);
    if (!m || m.session_id !== s.id || m.status === 'removed') throw new HttpError(404, 'not_found', 'That memory no longer exists.');
    const wasApproved = m.status === 'approved';
    store.setMemoryStatus(m.id, 'hidden');
    if (wasApproved) pub(s, 'memory:remove', { id: m.id });
    queueChanged(s);
    send(res, 200, { ok: true });
  });

  route('DELETE', '/api/h/memories/:memId', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const m = store.memory(params.memId);
    if (!m || m.session_id !== s.id) throw new HttpError(404, 'not_found', 'That memory no longer exists.');
    if (m.status !== 'removed') await removeMemoryEverywhere(s, m);
    send(res, 200, { ok: true });
  });

  route('POST', '/api/h/responses/:id/approve', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const r = store.response(params.id);
    if (!r || r.session_id !== s.id || r.status === 'removed') throw new HttpError(404, 'not_found', 'That recollection no longer exists.');
    const m = store.memory(r.memory_id);
    if (!m || m.status !== 'approved') throw new HttpError(409, 'memory_not_displayed', 'Approve or restore the memory first, then its recollections.');
    store.approveResponse(r.id, now());
    const fresh = store.response(r.id);
    pub(s, 'response:upsert', { memoryId: r.memory_id, response: publicResponse(fresh) });
    queueChanged(s);
    send(res, 200, { ok: true });
  });

  route('POST', '/api/h/responses/:id/hide', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const r = store.response(params.id);
    if (!r || r.session_id !== s.id || r.status === 'removed') throw new HttpError(404, 'not_found', 'That recollection no longer exists.');
    const was = r.status === 'approved';
    store.setResponseStatus(r.id, 'hidden');
    if (was) pub(s, 'response:remove', { memoryId: r.memory_id, id: r.id });
    queueChanged(s);
    send(res, 200, { ok: true });
  });

  route('DELETE', '/api/h/responses/:id', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const r = store.response(params.id);
    if (!r || r.session_id !== s.id) throw new HttpError(404, 'not_found', 'That recollection no longer exists.');
    if (r.status !== 'removed') removeResponseEverywhere(s, r);
    send(res, 200, { ok: true });
  });

  // a recollection typed on the host's own keyboard (still goes through the approval queue)
  route('POST', '/api/h/memories/:memId/responses', async ({ req, res, params }) => {
    const s = await sessionForHost(req);
    const body = await readJson(req);
    const out = createResponse(s, params.memId, body);
    send(res, 201, { id: out.id, status: 'pending' });
  });

  route('POST', '/api/h/lock', async ({ req, res }) => {
    const s = await sessionForHost(req);
    const { locked } = await readJson(req);
    store.setLocked(s.id, !!locked);
    pub(s, 'session:update', { locked: !!locked });
    send(res, 200, { locked: !!locked });
  });

  route('POST', '/api/h/end', async ({ req, res }) => {
    const s = await sessionForHost(req);
    store.endSession(s.id, now());
    hub.publish(`pub:${s.id}`, 'session:ended', { reason: 'ended' });
    hub.closeChannel(`pub:${s.id}`);
    hostOnly(s, 'session:update', { ended: true });
    send(res, 200, { ended: true });
  });

  route('DELETE', '/api/h/session', async ({ req, res }) => {
    const s = await sessionForHost(req);
    await purgeSession(s, 'deleted');
    send(res, 200, { deleted: true });
  });

  // ------------------------------------------------------------------ ROUTES: participants
  route('GET', '/api/p/:join/info', async ({ res, params }) => {
    const s = await sessionForJoin(params.join);
    send(res, 200, {
      name: s.name, locked: !!s.locked, expiresAt: s.expires_at, categories: CATEGORIES,
      maxUploadBytes: cfg.maxUploadBytes, maxPerCategory: cfg.maxPerCategory,
    });
  });

  route('GET', '/api/p/:join/snapshot', async ({ res, params }) => {
    const s = await sessionForJoin(params.join);
    send(res, 200, snapshot(s));
  });

  route('GET', '/api/p/:join/events', async ({ req, res, params }) => {
    const s = await sessionForJoin(params.join);
    if (!hub.subscribe(`pub:${s.id}`, req, res)) throw new HttpError(429, 'too_many_listeners', 'Too many viewers right now.');
    hub.publish(`pub:${s.id}`, 'hello', { locked: !!s.locked });
  });

  route('GET', '/api/p/:join/media/:memId/:size', async ({ res, params }) => {
    const s = await sessionForJoin(params.join);
    await serveImage(res, s, store.memory(params.memId), params.size, true);
  });

  route('POST', '/api/p/:join/memories', async ({ req, res, params }) => {
    const s = await sessionForJoin(params.join);
    if (s.locked) throw new HttpError(403, 'locked', 'The host has paused new contributions for now.');
    rateLimit(req, `up:${s.id}`, cfg.uploadsPerWindow);
    const type = String(req.headers['content-type'] || '');
    if (!type.toLowerCase().startsWith('multipart/form-data')) throw new HttpError(415, 'bad_content_type', 'Please submit the form from the contribution page.');

    const buf = await readBody(req, cfg.maxUploadBytes + 256 * 1024);
    let form;
    try {
      form = await new Request('http://local/upload', { method: 'POST', headers: { 'content-type': type }, body: buf }).formData();
    } catch {
      throw new HttpError(400, 'bad_form', 'The upload could not be read. Please try again.');
    }

    const title = cleanText(String(form.get('title') ?? ''), 80);
    const story = cleanText(String(form.get('story') ?? ''), 800, { multiline: true });
    const author = cleanText(String(form.get('name') ?? ''), 40);
    const category = String(form.get('category') ?? '');
    const yearUnknown = truthy(form.get('yearUnknown'));
    const year = parseYear(form.get('year'), yearUnknown);
    const clientId = String(form.get('clientId') ?? '').slice(0, 64);
    if (!title) throw new HttpError(400, 'title_required', 'Please add a short title.');
    if (!story) throw new HttpError(400, 'story_required', 'Please add a short story.');
    if (!CATEGORIES.includes(category)) throw new HttpError(400, 'bad_category', 'Please choose an area of the garden.');
    if (!truthy(form.get('consent'))) throw new HttpError(400, 'consent_required', 'Please confirm you have permission to share this photograph.');
    const file = form.get('photo');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') throw new HttpError(400, 'photo_required', 'Please choose a photograph.');
    if (file.size > cfg.maxUploadBytes) throw new HttpError(413, 'too_large', `That photograph is larger than ${Math.round(cfg.maxUploadBytes / 1048576)} MB.`);

    if (clientId && /^[A-Za-z0-9-]+$/.test(clientId)) { // a retry of the same submission returns the same result
      const prior = idempotency.get(`${s.id}:${clientId}`);
      if (prior) return send(res, 200, { id: prior.id, status: 'pending', manageToken: prior.manageToken, duplicate: true });
    }

    const live = store.memories(s.id).filter((m) => m.status !== 'removed');
    if (live.length >= cfg.maxMemoriesPerSession) throw new HttpError(409, 'session_full', 'This garden has reached its limit for the demo.');
    if (live.filter((m) => m.category === category).length >= cfg.maxPerCategory) throw new HttpError(409, 'category_full', 'That area of the garden is full. Please choose another area.');

    const img = await processImage(Buffer.from(await file.arrayBuffer()), cfg);
    const id = randomId(9);
    const manageToken = randomToken(24);
    const files = await saveDerivatives(store.uploadsDir, s.id, id, img);
    try {
      store.insertMemory({
        id, sessionId: s.id, title, story, author: author || null, year, yearUnknown, category,
        displayFile: files.displayFile, thumbFile: files.thumbFile, width: img.width, height: img.height,
        status: 'pending', manageHash: sha256(manageToken), createdAt: now(),
      });
    } catch (err) {
      await deleteMemoryFiles(store.uploadsDir, s.id, [files.displayFile, files.thumbFile]);
      throw err;
    }
    if (clientId && /^[A-Za-z0-9-]+$/.test(clientId)) idempotency.set(`${s.id}:${clientId}`, { id, manageToken, at: now() });
    queueChanged(s);
    send(res, 201, { id, status: 'pending', manageToken });
  });

  function createResponse(s, memId, body) {
    const m = store.memory(memId);
    if (!m || m.session_id !== s.id || m.status !== 'approved') throw new HttpError(404, 'not_found', 'That memory is not on display, so it cannot receive recollections.');
    const text = cleanText(body.text, 400, { multiline: true });
    const author = cleanText(body.name, 40);
    if (!text) throw new HttpError(400, 'text_required', 'Please write a short recollection.');
    if (store.responses(s.id).filter((r) => r.status !== 'removed').length >= cfg.maxResponsesPerSession) throw new HttpError(409, 'session_full', 'This garden has reached its limit for recollections.');
    const clientId = typeof body.clientId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(body.clientId) ? body.clientId : null;
    if (clientId) {
      const prior = idempotency.get(`${s.id}:${clientId}`);
      if (prior) return { id: prior.id, manageToken: prior.manageToken };
    }
    const id = randomId(9);
    const manageToken = randomToken(24);
    store.insertResponse({ id, memoryId: m.id, sessionId: s.id, author: author || null, text, status: 'pending', manageHash: sha256(manageToken), createdAt: now() });
    if (clientId) idempotency.set(`${s.id}:${clientId}`, { id, manageToken, at: now() });
    queueChanged(s);
    return { id, manageToken };
  }

  route('POST', '/api/p/:join/memories/:memId/responses', async ({ req, res, params }) => {
    const s = await sessionForJoin(params.join);
    if (s.locked) throw new HttpError(403, 'locked', 'The host has paused new contributions for now.');
    rateLimit(req, `re:${s.id}`, cfg.responsesPerWindow);
    const body = await readJson(req);
    if (!truthy(body.consent)) throw new HttpError(400, 'consent_required', 'Please confirm you agree to show your recollection in this session.');
    const out = createResponse(s, params.memId, body);
    send(res, 201, { id: out.id, status: 'pending', manageToken: out.manageToken });
  });

  // Contributors check on, or withdraw, their own submissions with the private token they were given.
  route('POST', '/api/p/:join/status', async ({ req, res, params }) => {
    const s = await sessionForJoin(params.join);
    rateLimit(req, `st:${s.id}`, 120, 60 * 1000);
    const { tokens } = await readJson(req);
    if (!Array.isArray(tokens) || tokens.length > 12) throw new HttpError(400, 'bad_request', 'Too many items.');
    const results = tokens.map((t) => {
      if (typeof t !== 'string' || t.length < 16 || t.length > 64) return { status: 'unknown' };
      const h = sha256(t);
      const m = store.memoryByManage(h);
      if (m && m.session_id === s.id) return { kind: 'memory', id: m.id, status: m.status === 'hidden' ? 'not_displayed' : m.status, title: m.status === 'removed' ? '' : m.title };
      const r = store.responseByManage(h);
      if (r && r.session_id === s.id) {
        const parent = store.memory(r.memory_id);
        return { kind: 'response', id: r.id, memoryId: r.memory_id, status: r.status === 'hidden' ? 'not_displayed' : r.status, title: parent && parent.status !== 'removed' ? parent.title : '' };
      }
      return { status: 'unknown' };
    });
    send(res, 200, { results });
  });

  route('POST', '/api/p/:join/withdraw', async ({ req, res, params }) => {
    const s = await sessionForJoin(params.join);
    rateLimit(req, `wd:${s.id}`, 30, 60 * 1000);
    const { token } = await readJson(req);
    if (typeof token !== 'string' || token.length < 16 || token.length > 64) throw new HttpError(404, 'not_found', 'We could not find that contribution.');
    const h = sha256(token);
    const m = store.memoryByManage(h);
    if (m && m.session_id === s.id) {
      if (m.status !== 'removed') await removeMemoryEverywhere(s, m);
      return send(res, 200, { status: 'removed' });
    }
    const r = store.responseByManage(h);
    if (r && r.session_id === s.id) {
      if (r.status !== 'removed') removeResponseEverywhere(s, r);
      return send(res, 200, { status: 'removed' });
    }
    throw new HttpError(404, 'not_found', 'We could not find that contribution.');
  });

  // ------------------------------------------------------------------ images
  async function serveImage(res, session, m, size, publicOnly) {
    const ok = m && m.session_id === session.id && (publicOnly ? m.status === 'approved' : m.status !== 'removed');
    const file = ok ? (size === 'thumb' ? m.thumb_file : size === 'display' ? m.display_file : null) : null;
    const full = file ? safeUploadPath(store.uploadsDir, session.id, file) : null;
    if (!full) throw new HttpError(404, 'not_found', 'Image not found.');
    let stat;
    try { stat = await fsp.stat(full); } catch { throw new HttpError(404, 'not_found', 'Image not found.'); }
    res.writeHead(200, {
      'Content-Type': 'image/webp', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': publicOnly ? 'private, max-age=300' : 'no-store', 'Content-Disposition': 'inline',
    });
    fs.createReadStream(full).on('error', () => res.destroy()).pipe(res);
  }

  // ------------------------------------------------------------------ static files
  async function serveFile(req, res, full, { immutable = false, html = false } = {}) {
    let stat;
    try { stat = await fsp.stat(full); } catch { return false; }
    if (!stat.isFile()) return false;
    const ext = path.extname(full).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': stat.size,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    if (html || ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(full).on('error', () => res.destroy()).pipe(res);
    return true;
  }

  function within(base, rel) {
    const full = path.resolve(base, '.' + path.sep + rel);
    return full === base || full.startsWith(base + path.sep) ? full : null;
  }

  async function serveStatic(req, res, pathname) {
    if (pathname === '/join' || pathname.startsWith('/join/')) {
      if (await serveFile(req, res, path.join(cfg.webDir, 'join.html'), { html: true })) return;
    }
    if (pathname.startsWith('/join-assets/')) {
      const name = pathname.slice('/join-assets/'.length);
      if (JOIN_ASSETS.has(name) && await serveFile(req, res, path.join(cfg.webDir, name))) return;
      throw new HttpError(404, 'not_found', 'Not found.');
    }
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(400, 'bad_path', 'Bad path.'); }
    if (rel.includes('\0')) throw new HttpError(400, 'bad_path', 'Bad path.');
    const dist = path.resolve(cfg.distDir);
    if (rel === '/' || rel === '') rel = '/index.html';
    const full = within(dist, rel);
    if (full && await serveFile(req, res, full, { immutable: rel.startsWith('/assets/') })) return;
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      return send(res, 503, 'The game has not been built yet. Run "npm run build" (or use "npm run dev" for development), then reload this page.',
        { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    throw new HttpError(404, 'not_found', 'Not found.');
  }

  // ------------------------------------------------------------------ main handler
  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    let pathname = '/';
    try {
      const url = new URL(req.url, 'http://local');
      pathname = url.pathname;
      if (cfg.logRequests) console.log(`${req.method} ${redactPath(pathname)}`);
      const isApi = pathname.startsWith('/api/');
      if (isApi && req.method !== 'GET' && req.method !== 'HEAD') {
        // cross-site pages cannot make state-changing calls: if the browser says where the request came from, it must be us
        const origin = req.headers.origin;
        if (origin && req.headers.host) {
          let originHost = '';
          try { originHost = new URL(origin).host; } catch { /* handled below */ }
          if (originHost !== req.headers.host) throw new HttpError(403, 'cross_origin', 'Cross-site requests are not allowed.');
        }
      }
      if (isApi) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(pathname);
          if (!m) continue;
          const params = {};
          r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = ''; } });
          return await r.handler({ req, res, params, url });
        }
        throw new HttpError(404, 'not_found', 'Unknown API route.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
      return await serveStatic(req, res, pathname);
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      if (err instanceof HttpError) {
        const headers = err.status === 429 ? { 'Retry-After': '60' } : {};
        return send(res, err.status, { error: err.code, message: err.message }, headers);
      }
      console.error('Unexpected server error on', req.method, redactPath(pathname), '-', err && err.message);
      return send(res, 500, { error: 'server_error', message: 'Something went wrong on the server. Please try again.' });
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  server.requestTimeout = 60 * 1000;
  server.headersTimeout = 20 * 1000;
  server.keepAliveTimeout = 5 * 1000;

  async function sweep() {
    const t = now();
    for (const s of store.allSessions()) if (s.expires_at <= t) await purgeSession(s);
    for (const [k, v] of idempotency) if (t - v.at > 15 * 60 * 1000) idempotency.delete(k);
  }

  return {
    server, hub, sweep,
    baseUrl,
    close: () => new Promise((resolve) => { hub.close(); server.close(() => resolve()); server.closeAllConnections?.(); }),
  };
}
