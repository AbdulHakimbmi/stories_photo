// =============================================================================
//  live.js — talks to the garden server (same origin as the page).
//   • HTTP for everything that matters (including photographs).
//   • A long-lived event stream (Server-Sent Events) for "something changed" notifications.
//  The host token is sent in a request header and kept in this browser's localStorage so a
//  page refresh does not lose control of the session. It never appears in a URL.
// =============================================================================
const STORE_KEY = 'ourMemoryGarden.host.v1';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export function loadSavedHost() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (v && typeof v.hostToken === 'string' && typeof v.joinToken === 'string') return v;
  } catch { /* storage unavailable or corrupt */ }
  return null;
}
export function saveHost(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* still works for this visit */ } }
export function forgetHost() { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }

async function parse(res) {
  let data = null;
  try { data = await res.json(); } catch { /* empty or not JSON */ }
  if (!res.ok) throw new ApiError((data && data.message) || `The server answered ${res.status}.`, res.status, (data && data.error) || 'error');
  return data;
}

/** Ask the server for a brand-new temporary garden session. Only works from the computer running the server. */
export async function createSession(name, base = '') {
  let res;
  try {
    res = await fetch(`${base}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  } catch {
    throw new ApiError('The garden server is not reachable. Start it with “npm start” and open http://localhost:3000 on this computer.', 0, 'network');
  }
  return parse(res);
}

export class LiveSession {
  /**
   * @param {{hostToken:string, joinToken:string}} creds
   * @param {import('../garden/state.js').GardenState} state
   * @param {{onStatus?:(s:string)=>void, onCounts?:(c:object)=>void, onEvent?:(name:string,data:any,result:string)=>void}} hooks
   */
  constructor(creds, state, hooks = {}, { baseUrl = '' } = {}) {
    this.base = baseUrl;
    this.hostToken = creds.hostToken;
    this.joinToken = creds.joinToken;
    this.state = state;
    this.hooks = hooks;
    this.status = 'connecting';
    this.abort = null;
    this.stopped = false;
    this.blobCache = new Map();
    this.info = null;
  }

  setStatus(s) {
    if (this.status === s) return;
    if (this.closing && s !== 'online') return;
    this.status = s;
    if (this.hooks.onStatus) this.hooks.onStatus(s);
  }

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: { 'x-host-token': this.hostToken, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new ApiError('The server is not reachable right now.', 0, 'network');
    }
    return parse(res);
  }

  /** Load the session and the current garden, then keep listening for changes. */
  async start() {
    this.info = await this.request('GET', '/api/h/session');
    this.joinToken = this.info.joinToken;
    this.state.patchMeta({ name: this.info.name, locked: this.info.locked, ended: this.info.ended }, false);
    await this.syncSnapshot();
    if (this.hooks.onCounts) this.hooks.onCounts(this.info.counts);
    this.listen();
    return this.info;
  }

  async syncSnapshot() {
    const snap = await this.request('GET', '/api/h/snapshot');
    this.state.replaceAll(snap);
    if (snap.counts && this.hooks.onCounts) this.hooks.onCounts(snap.counts);
  }

  stop() {
    this.stopped = true;
    if (this.abort) this.abort.abort();
    for (const url of this.blobCache.values()) URL.revokeObjectURL(url);
    this.blobCache.clear();
  }

  // ---------------------------------------------------------------- event stream (fetch + ReadableStream, so we can send a header)
  async listen() {
    let delay = 1000;
    while (!this.stopped) {
      this.abort = new AbortController();
      try {
        const res = await fetch(`${this.base}/api/h/events`, { headers: { 'x-host-token': this.hostToken }, signal: this.abort.signal, cache: 'no-store' });
        if (res.status === 401 || res.status === 410 || res.status === 404) {
          this.setStatus(res.status === 410 ? 'expired' : 'ended');
          return;
        }
        if (!res.ok || !res.body) throw new Error('stream refused');
        delay = 1000;
        await this.readStream(res.body);
      } catch (err) {
        if (this.stopped) return;
      }
      if (this.stopped) return;
      this.setStatus('offline');
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8000);
      try { await this.syncSnapshot(); } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 410)) { this.setStatus(err.status === 410 ? 'expired' : 'ended'); return; }
      }
    }
  }

  async readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(frame);
        const dt = /^data: (.+)$/m.exec(frame);
        if (!ev) continue;
        let data = null;
        try { data = dt ? JSON.parse(dt[1]) : null; } catch { continue; }
        this.handleEvent(ev[1], data);
      }
    }
  }

  async handleEvent(name, data) {
    if (name === 'hello') {
      this.setStatus('online');
      // Whatever happened while we were away, the snapshot is the truth (events are idempotent, so no duplicates).
      try { await this.syncSnapshot(); } catch { /* the next event or reconnect will retry */ }
      if (data && data.counts && this.hooks.onCounts) this.hooks.onCounts(data.counts);
      return;
    }
    if (name === 'queue:changed') { if (this.hooks.onCounts) this.hooks.onCounts(data); return; }
    if (name === 'session:ended') { this.setStatus(data && data.reason === 'expired' ? 'expired' : 'ended'); }
    const result = this.state.applyEvent(name, data);
    if (this.hooks.onEvent) this.hooks.onEvent(name, data, result);
  }

  // ---------------------------------------------------------------- host actions
  links() { return this.request('GET', '/api/h/links'); }
  setAdvertised(host) { return this.request('POST', '/api/h/advertised', { host }); }
  respondLink(memoryId) { return this.request('POST', '/api/h/respond-link', { memoryId }); }
  queue() { return this.request('GET', '/api/h/queue'); }
  managed() { return this.request('GET', '/api/h/memories'); }
  approveMemory(id) { return this.request('POST', `/api/h/memories/${encodeURIComponent(id)}/approve`, {}); }
  hideMemory(id) { return this.request('POST', `/api/h/memories/${encodeURIComponent(id)}/hide`, {}); }
  deleteMemory(id) { return this.request('DELETE', `/api/h/memories/${encodeURIComponent(id)}`); }
  approveResponse(id) { return this.request('POST', `/api/h/responses/${encodeURIComponent(id)}/approve`, {}); }
  hideResponse(id) { return this.request('POST', `/api/h/responses/${encodeURIComponent(id)}/hide`, {}); }
  deleteResponse(id) { return this.request('DELETE', `/api/h/responses/${encodeURIComponent(id)}`); }
  addResponse(memoryId, { name, text }) { return this.request('POST', `/api/h/memories/${encodeURIComponent(memoryId)}/responses`, { name, text }); }
  async setLocked(locked) {
    const r = await this.request('POST', '/api/h/lock', { locked });
    this.state.patchMeta({ locked: r.locked });
    return r;
  }
  async end() { const r = await this.request('POST', '/api/h/end', {}); this.state.patchMeta({ ended: true }); return r; }
  async deleteSession() {
    this.closing = true; // the server will close our event stream; that is not a "lost session" worth reporting
    try { const r = await this.request('DELETE', '/api/h/session'); this.stop(); forgetHost(); return r; } catch (err) { this.closing = false; throw err; }
  }

  /** URL the 3D textures and panels use for APPROVED photographs (no header needed). */
  publicImageUrl(id, size = 'thumb') {
    return `${this.base}/api/p/${encodeURIComponent(this.joinToken)}/media/${encodeURIComponent(id)}/${size}`;
  }

  /** Host-only preview of any (also pending) photograph, fetched with the header and shown as a blob. */
  async hostImageUrl(id, size = 'thumb') {
    const key = `${id}:${size}`;
    if (this.blobCache.has(key)) return this.blobCache.get(key);
    let res;
    try { res = await fetch(`${this.base}/api/h/media/${encodeURIComponent(id)}/${size}`, { headers: { 'x-host-token': this.hostToken } }); } catch { throw new ApiError('The server is not reachable right now.', 0, 'network'); }
    if (!res.ok) throw new ApiError('Photo not available.', res.status, 'not_found');
    const url = URL.createObjectURL(await res.blob());
    this.blobCache.set(key, url);
    return url;
  }
  forgetBlob(id) {
    for (const key of [...this.blobCache.keys()]) if (key.startsWith(id + ':')) { URL.revokeObjectURL(this.blobCache.get(key)); this.blobCache.delete(key); }
  }
}
