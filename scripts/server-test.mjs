// =============================================================================
//  server-test.mjs — end-to-end tests of the real server (HTTP, SQLite, image pipeline).
//  Run with:  npm run test:server        (needs `npm install` first: it uses sharp)
//  It starts the server in-process on a random port with a temporary data folder.
// =============================================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadConfig } from '../server/config.js';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { cleanText, parseAdvertisedHost, isLocalRequest, redactPath, RateLimiter } from '../server/util.js';
import { sniffFormat } from '../server/images.js';
import { GardenState } from '../src/garden/state.js';
import { LiveSession, createSession } from '../src/net/live.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'garden-test-'));
const results = [];
let clock = Date.parse('2026-10-19T10:00:00Z');

async function boot(overrides = {}, dir = path.join(tmp, 'data-' + Math.random().toString(36).slice(2, 7))) {
  const distDir = path.join(tmp, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>game</title>');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'top secret');
  const cfg = loadConfig({}, { dataDir: dir, distDir, now: () => clock, port: 0, ...overrides });
  const store = openStore(dir);
  const app = createApp({ cfg, store });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { cfg, store, app, base, dir, close: async () => { await app.close(); store.close(); } };
}

async function api(base, method, url, { host, body, json, headers = {} } = {}) {
  const h = { ...headers };
  if (host) h['x-host-token'] = host;
  let payload = body;
  if (json !== undefined) { payload = JSON.stringify(json); h['content-type'] = 'application/json'; }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function makeJpeg({ w = 800, h = 400, orientation = 0, exif = false } = {}) {
  let img = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 80 } } });
  const opts = {};
  if (orientation) opts.orientation = orientation;
  if (exif) opts.exif = { IFD0: { Copyright: 'SECRET-COPYRIGHT-STRING', Artist: 'SECRET-ARTIST' } };
  img = Object.keys(opts).length ? img.withMetadata(opts) : img;
  return img.jpeg({ quality: 85 }).toBuffer();
}

function form(fields, file, filename = 'photo.jpg', type = 'image/jpeg') {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
  if (file) f.append('photo', new Blob([file], { type }), filename);
  return f;
}
const good = { title: 'Grandpa’s kopi', story: 'Every Sunday after market we shared one cup.', name: 'Wei', year: '1998', category: 'everyday', consent: 'true' };

async function newSession(env, name) {
  const r = await api(env.base, 'POST', '/api/sessions', { json: { name } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function upload(env, s, fields = good, file, extra = {}) {
  const buf = file === undefined ? await makeJpeg() : file;
  return api(env.base, 'POST', `/api/p/${s.joinToken}/memories`, { body: form({ ...fields, ...extra }, buf) });
}
async function readEvents(env, url, headers, ms) {
  const ac = new AbortController();
  const res = await fetch(env.base + url, { headers, signal: ac.signal });
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const done = (async () => {
    try {
      for (;;) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /event: (.*)/.exec(frame); const data = /data: (.*)/.exec(frame);
          if (ev) events.push({ event: ev[1], data: data ? JSON.parse(data[1]) : null });
        }
      }
    } catch { /* aborted */ }
  })();
  return { events, status: res.status, stop: async () => { ac.abort(); await done; }, wait: (n, t = 3000) => new Promise((resolve) => { const t0 = Date.now(); const iv = setInterval(() => { if (events.length >= n || Date.now() - t0 > t) { clearInterval(iv); resolve(events); } }, 20); }) };
}

function test(name, fn) { results.push({ name, fn }); }

// ------------------------------------------------------------------ unit-level
test('cleanText strips control and bidi characters and bounds length', () => {
  assert.equal(cleanText('  a\u0000b‮c  ', 20), 'a bc');
  assert.equal(cleanText('x'.repeat(500), 10).length, 10);
  assert.equal(cleanText(12, 10), '');
  assert.equal(cleanText('<img src=x onerror=alert(1)>', 100), '<img src=x onerror=alert(1)>'); // stored as plain text; clients render text only
  assert.equal(cleanText('a\n\n\n\nb', 20, { multiline: true }), 'a\n\nb');
});
test('advertised host parsing accepts addresses and rejects URLs/paths/junk', () => {
  assert.deepEqual(parseAdvertisedHost('192.168.1.20', 3000), { hostname: '192.168.1.20', port: 3000 });
  assert.deepEqual(parseAdvertisedHost('http://192.168.1.20:4000/', 3000), { hostname: '192.168.1.20', port: 4000 });
  assert.deepEqual(parseAdvertisedHost('my-laptop.local', 3000), { hostname: 'my-laptop.local', port: 3000 });
  for (const bad of ['', 'a b', 'evil.com/path', '1.2.3.4:99999', 'x@y', '<script>', 'a'.repeat(300)]) assert.equal(parseAdvertisedHost(bad, 3000), null, bad);
});
test('isLocalRequest: loopback yes, other machines no', () => {
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: '203.0.113.9' } }), false);
  assert.equal(isLocalRequest({ socket: {} }), false);
});
test('request logging hides tokens', () => {
  assert.equal(redactPath('/api/p/SECRETTOKEN123456/memories'), '/api/p/<token>/memories');
  assert.equal(redactPath('/join/SECRETTOKEN123456/respond/ab12'), '/join/<token>/respond/ab12');
});
test('rate limiter window', () => {
  let t = 0; const rl = new RateLimiter(() => t);
  assert.ok(rl.take('k', 2, 1000)); assert.ok(rl.take('k', 2, 1000)); assert.ok(!rl.take('k', 2, 1000));
  t = 1500; assert.ok(rl.take('k', 2, 1000));
});
test('file sniffing rejects SVG, HEIC, GIF, executables, text', () => {
  const pad = (s) => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.alloc(64)]);
  assert.equal(sniffFormat(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])), 'jpeg');
  assert.throws(() => sniffFormat(pad('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), (e) => e.code === 'unsupported_svg');
  assert.throws(() => sniffFormat(pad('\u0000\u0000\u0000\u0018ftypheic')), (e) => e.code === 'unsupported_heic');
  assert.throws(() => sniffFormat(pad('GIF89a')), (e) => e.code === 'unsupported_gif');
  assert.throws(() => sniffFormat(pad('MZ')), (e) => e.status === 415);
  assert.throws(() => sniffFormat(pad('hello world, not an image at all')), (e) => e.status === 415);
});

// ------------------------------------------------------------------ the main journey
test('FULL JOURNEY: upload → pending → approve → live event → respond → approve → withdraw', async () => {
  const env = await boot();
  try {
    const s = await newSession(env, 'Family garden');
    assert.ok(s.hostToken && s.joinToken && s.hostToken !== s.joinToken);
    assert.ok(s.joinToken.length >= 24 && s.hostToken.length >= 40);
    // the host token is never stored, only its hash
    const dump = JSON.stringify(env.store.db.prepare('SELECT * FROM sessions').all());
    assert.ok(!dump.includes(s.hostToken), 'host token must not be stored in the database');

    const live = await readEvents(env, '/api/h/events', { 'x-host-token': s.hostToken });
    assert.equal(live.status, 200);

    // exif + rotation test image: stored 800x400 with orientation 6 → displays as 400x800
    const photo = await makeJpeg({ w: 800, h: 400, orientation: 6, exif: true });
    assert.ok(photo.toString('latin1').includes('SECRET-COPYRIGHT-STRING'), 'test image really carries EXIF text');
    const up = await upload(env, s, good, photo);
    assert.equal(up.status, 201, JSON.stringify(up.data));
    assert.equal(up.data.status, 'pending');
    assert.ok(up.data.manageToken.length >= 24);
    const id = up.data.id;

    // pending must be invisible to participants
    let snap = await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`);
    assert.equal(snap.data.memories.length, 0);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/media/${id}/thumb`)).status, 404);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/media/${id}/display`)).status, 404);

    // host sees it, with a preview
    const q = await api(env.base, 'GET', '/api/h/queue', { host: s.hostToken });
    assert.equal(q.data.memories.length, 1);
    assert.equal(q.data.memories[0].title, good.title);
    assert.ok(!JSON.stringify(q.data).includes(up.data.manageToken), 'queue must not leak the contributor token');
    const media = await fetch(env.base + `/api/h/media/${id}/display`, { headers: { 'x-host-token': s.hostToken } });
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'image/webp');
    const outBuf = Buffer.from(await media.arrayBuffer());
    const meta = await sharp(outBuf).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 400, 'EXIF rotation applied (width/height swapped)');
    assert.equal(meta.height, 800);
    assert.ok(!meta.exif && !meta.icc, 'metadata stripped from served image');
    assert.ok(!outBuf.toString('latin1').includes('SECRET-'), 'EXIF text is not in the output bytes');

    // approve
    const ap = await api(env.base, 'POST', `/api/h/memories/${id}/approve`, { host: s.hostToken, json: {} });
    assert.equal(ap.status, 200);
    snap = await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`);
    assert.equal(snap.data.memories.length, 1);
    const pm = snap.data.memories[0];
    assert.deepEqual(Object.keys(pm).sort(), ['approvedAt', 'category', 'height', 'id', 'name', 'responses', 'slot', 'story', 'title', 'width', 'year', 'yearUnknown'].sort());
    assert.equal(pm.slot, 0);
    const wire = JSON.stringify(snap.data);
    for (const secret of [up.data.manageToken, s.hostToken, 'manage_hash', 'display_file', '.webp', 'host_hash']) assert.ok(!wire.includes(secret), `public snapshot leaks ${secret}`);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/media/${id}/thumb`)).status, 200);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/media/${id}/other`)).status, 404);

    // live event arrived on the host channel
    const evs = await live.wait(3);
    assert.ok(evs.some((e) => e.event === 'queue:changed'), 'queue event');
    const up1 = evs.filter((e) => e.event === 'memory:upsert');
    assert.equal(up1.length, 1);
    assert.equal(up1[0].data.memory.id, id);

    // second recollection flow
    const rsp = await api(env.base, 'POST', `/api/p/${s.joinToken}/memories/${id}/responses`, { json: { name: 'Mei', text: 'He always burnt the toast.', consent: true } });
    assert.equal(rsp.status, 201);
    assert.equal(rsp.data.status, 'pending');
    snap = await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`);
    assert.equal(snap.data.memories[0].responses.length, 0, 'pending recollection hidden');
    const q2 = await api(env.base, 'GET', '/api/h/queue', { host: s.hostToken });
    assert.equal(q2.data.responses.length, 1);
    assert.equal((await api(env.base, 'POST', `/api/h/responses/${rsp.data.id}/approve`, { host: s.hostToken, json: {} })).status, 200);
    snap = await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`);
    assert.equal(snap.data.memories[0].responses.length, 1);
    assert.equal(snap.data.memories[0].story, good.story, 'original story untouched');
    const evs2 = await live.wait(5);
    assert.ok(evs2.some((e) => e.event === 'response:upsert' && e.data.memoryId === id));

    // contributor status + withdraw
    const st = await api(env.base, 'POST', `/api/p/${s.joinToken}/status`, { json: { tokens: [up.data.manageToken, rsp.data.manageToken, 'x'.repeat(30)] } });
    assert.equal(st.data.results[0].status, 'approved');
    assert.equal(st.data.results[1].status, 'approved');
    assert.equal(st.data.results[2].status, 'unknown');
    const dir = path.join(env.store.uploadsDir, env.store.sessionByJoin(s.joinToken).id);
    assert.equal(fs.readdirSync(dir).length, 2);
    const wd = await api(env.base, 'POST', `/api/p/${s.joinToken}/withdraw`, { json: { token: up.data.manageToken } });
    assert.equal(wd.status, 200);
    assert.equal(fs.readdirSync(dir).length, 0, 'image files deleted from disk');
    snap = await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`);
    assert.equal(snap.data.memories.length, 0);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/media/${id}/thumb`)).status, 404);
    const st2 = await api(env.base, 'POST', `/api/p/${s.joinToken}/status`, { json: { tokens: [up.data.manageToken, rsp.data.manageToken] } });
    assert.equal(st2.data.results[0].status, 'removed');
    assert.equal(st2.data.results[0].title, '');
    assert.equal(st2.data.results[1].status, 'removed', 'its recollections go with it');
    const row = env.store.db.prepare('SELECT title, story, display_file FROM memories WHERE id = ?').get(id);
    assert.equal(row.title, ''); assert.equal(row.story, ''); assert.equal(row.display_file, null, 'content really removed from the database');
    const evs3 = await live.wait(7);
    assert.ok(evs3.some((e) => e.event === 'memory:remove' && e.data.id === id));
    await live.stop();
  } finally { await env.close(); }
});

test('host-only actions are refused for participants, strangers and other sessions', async () => {
  const env = await boot();
  try {
    const a = await newSession(env, 'A');
    const b = await newSession(env, 'B');
    const up = await upload(env, a);
    const id = up.data.id;
    const attempts = [
      ['GET', '/api/h/queue'], ['GET', '/api/h/session'], ['GET', '/api/h/links'], ['POST', `/api/h/memories/${id}/approve`], ['POST', `/api/h/memories/${id}/hide`],
      ['DELETE', `/api/h/memories/${id}`], ['POST', '/api/h/lock'], ['POST', '/api/h/end'], ['DELETE', '/api/h/session'], ['GET', `/api/h/media/${id}/display`],
    ];
    for (const [m, u] of attempts) {
      for (const tok of [undefined, 'short', a.joinToken, 'z'.repeat(43)]) {
        const r = await api(env.base, m, u, { host: tok, json: m === 'GET' || m === 'DELETE' ? undefined : {} });
        assert.equal(r.status, 401, `${m} ${u} with ${tok ? tok.slice(0, 5) : 'no token'} should be 401, got ${r.status}`);
      }
    }
    // a host of another session cannot touch this session's memory
    for (const [m, u] of [['POST', `/api/h/memories/${id}/approve`], ['DELETE', `/api/h/memories/${id}`], ['POST', `/api/h/memories/${id}/hide`]]) {
      const r = await api(env.base, m, u, { host: b.hostToken, json: {} });
      assert.equal(r.status, 404, `${m} ${u}`);
    }
    assert.equal((await api(env.base, 'GET', `/api/h/media/${id}/display`, { host: b.hostToken })).status, 404);
    // the join token in a host-style header, or the host token in a join path, opens nothing
    assert.equal((await api(env.base, 'GET', `/api/p/${a.hostToken}/snapshot`)).status, 404);
    // participant path with another session's join token cannot reach this session's memories
    assert.equal((await api(env.base, 'POST', `/api/p/${b.joinToken}/memories/${id}/responses`, { json: { text: 'hi', consent: true } })).status, 404);
    // the memory is still there and pending
    assert.equal((await api(env.base, 'GET', '/api/h/queue', { host: a.hostToken })).data.memories.length, 1);
  } finally { await env.close(); }
});

test('session creation is limited to this computer and same-origin requests', async () => {
  const env = await boot();
  try {
    const evil = await api(env.base, 'POST', '/api/sessions', { json: { name: 'x' }, headers: { origin: 'http://evil.example' } });
    assert.equal(evil.status, 403);
    const same = await api(env.base, 'POST', '/api/sessions', { json: { name: 'x' }, headers: { origin: env.base } });
    assert.equal(same.status, 201);
    // a request that is not from this machine (simulated through the helper) is refused
    assert.equal(isLocalRequest({ socket: { remoteAddress: '198.51.100.7' } }), false);
  } finally { await env.close(); }
});

test('unsupported, malformed and oversized files are rejected cleanly (and leave nothing behind)', async () => {
  const env = await boot({ maxUploadBytes: 300 * 1024, uploadsPerWindow: 100 });
  try {
    const s = await newSession(env, 'Files');
    const cases = [
      ['svg named .jpg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'.padEnd(100, ' ')), 415, 'unsupported_svg'],
      ['heic', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(64)]), 415, 'unsupported_heic'],
      ['text', Buffer.from('this is just some text, definitely not a photograph'), 415, 'unsupported_type'],
      ['exe', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]), 415, 'unsupported_type'],
      ['empty', Buffer.alloc(0), 400, 'invalid_image'],
      ['truncated jpeg', (await makeJpeg()).subarray(0, 300), 422, 'decode_failed'],
      ['jpeg header + garbage', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]), 422, 'decode_failed'],
    ];
    for (const [label, buf, status, code] of cases) {
      const r = await upload(env, s, good, buf);
      assert.equal(r.status, status, `${label}: ${JSON.stringify(r.data)}`);
      assert.equal(r.data.code ?? r.data.error, code, label);
      assert.ok(typeof r.data.message === 'string' && r.data.message.length > 10, `${label} has a human message`);
    }
    // too many pixels per side
    const wide = await sharp({ create: { width: 15000, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    const r1 = await upload(env, s, good, wide);
    assert.equal(r1.status, 413); assert.equal(r1.data.error, 'dimensions_too_large');
    // oversized file
    const big = await sharp({ create: { width: 1500, height: 1500, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).png().toBuffer();
    assert.ok(big.length > 300 * 1024);
    const r2 = await upload(env, s, good, big);
    assert.equal(r2.status, 413); assert.equal(r2.data.error, 'too_large');
    // nothing stored
    assert.equal(env.store.memories(env.store.sessionByJoin(s.joinToken).id).length, 0);
    const dir = path.join(env.store.uploadsDir, env.store.sessionByJoin(s.joinToken).id);
    assert.ok(!fs.existsSync(dir) || fs.readdirSync(dir).length === 0, 'no leftover files');
    // PNG with transparency and a WebP are accepted; JPEG too
    const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.3 } } }).png().toBuffer();
    const webp = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#4a8' } }).webp().toBuffer();
    assert.equal((await upload(env, s, { ...good, category: 'celebrations' }, png)).status, 201);
    assert.equal((await upload(env, s, { ...good, category: 'places' }, webp)).status, 201);
  } finally { await env.close(); }
});

test('form validation, consent, categories, and non-multipart posts', async () => {
  const env = await boot({ uploadsPerWindow: 100 });
  try {
    const s = await newSession(env, 'Validation');
    const bad = [
      [{ ...good, title: '' }, 'title_required'], [{ ...good, title: '   ' }, 'title_required'], [{ ...good, story: '' }, 'story_required'],
      [{ ...good, category: 'nope' }, 'bad_category'], [{ ...good, consent: 'false' }, 'consent_required'], [{ ...good, year: '19x8' }, 'bad_year'],
      [{ ...good, year: '2999' }, 'bad_year'], [{ ...good, year: '1200' }, 'bad_year'],
    ];
    for (const [fields, code] of bad) {
      const r = await upload(env, s, fields);
      assert.equal(r.status, 400, code); assert.equal(r.data.error, code);
    }
    const fields = { ...good }; delete fields.consent;
    assert.equal((await upload(env, s, fields)).data.error, 'consent_required');
    const noPhoto = await api(env.base, 'POST', `/api/p/${s.joinToken}/memories`, { body: form(good, null) });
    assert.equal(noPhoto.data.error, 'photo_required');
    assert.equal((await api(env.base, 'POST', `/api/p/${s.joinToken}/memories`, { json: good })).status, 415);
    // "not sure" year, optional name
    const ok = await upload(env, s, { ...good, name: '', year: '', yearUnknown: 'true' });
    assert.equal(ok.status, 201);
    await api(env.base, 'POST', `/api/h/memories/${ok.data.id}/approve`, { host: s.hostToken, json: {} });
    const snap = (await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.memories[0];
    assert.equal(snap.year, null); assert.equal(snap.yearUnknown, true); assert.equal(snap.name, '');
    // text stays text (stored verbatim, bounded, no markup interpretation server side)
    const xss = await upload(env, s, { ...good, title: '<img src=x onerror=alert(1)>', story: '<script>alert(1)</script>'.repeat(60), category: 'people' });
    assert.equal(xss.status, 201);
    const row = env.store.memory(xss.data.id);
    assert.equal(row.title, '<img src=x onerror=alert(1)>');
    assert.ok(row.story.length <= 800);
    // responses
    await api(env.base, 'POST', `/api/h/memories/${xss.data.id}/approve`, { host: s.hostToken, json: {} });
    assert.equal((await api(env.base, 'POST', `/api/p/${s.joinToken}/memories/${xss.data.id}/responses`, { json: { text: '', consent: true } })).data.error, 'text_required');
    assert.equal((await api(env.base, 'POST', `/api/p/${s.joinToken}/memories/${xss.data.id}/responses`, { json: { text: 'x' } })).data.error, 'consent_required');
    assert.equal((await api(env.base, 'POST', `/api/p/${s.joinToken}/memories/nonexistent/responses`, { json: { text: 'x', consent: true } })).status, 404);
  } finally { await env.close(); }
});

test('duplicate submission (same clientId) creates one memory; upload rate limit; category and session caps', async () => {
  const env = await boot({ uploadsPerWindow: 7, maxPerCategory: 2, maxMemoriesPerSession: 4 });
  try {
    const s = await newSession(env, 'Limits');
    const a = await upload(env, s, good, undefined, { clientId: 'abc-123' });
    const b = await upload(env, s, good, undefined, { clientId: 'abc-123' });
    assert.equal(a.status, 201); assert.equal(b.status, 200);
    assert.equal(a.data.id, b.data.id); assert.equal(a.data.manageToken, b.data.manageToken);
    assert.equal(env.store.memories(env.store.sessionByJoin(s.joinToken).id).length, 1);
    assert.equal((await upload(env, s, good)).status, 201);               // 2nd in 'everyday'
    const third = await upload(env, s, good);                              // 3rd in 'everyday' → area full
    assert.equal(third.status, 409); assert.equal(third.data.error, 'category_full');
    assert.equal((await upload(env, s, { ...good, category: 'places' })).status, 201);
    assert.equal((await upload(env, s, { ...good, category: 'places' })).status, 201); // 4th overall
    const full = await upload(env, s, { ...good, category: 'people' });
    assert.equal(full.status, 409); assert.equal(full.data.error, 'session_full');
    // rate limit (7 per window per IP/session; 7 attempts already counted above)
    const limited = await upload(env, s, { ...good, category: 'people' });
    assert.equal(limited.status, 429); assert.equal(limited.data.error, 'rate_limited');
    assert.ok(limited.headers.get('retry-after'));
  } finally { await env.close(); }
});

test('lock, approve into a full area, hide/restore, host delete, end and delete session', async () => {
  const env = await boot({ maxPerCategory: 2 });
  try {
    const s = await newSession(env, 'Moderation');
    const a = await upload(env, s); const b = await upload(env, s);
    const ap = (id) => api(env.base, 'POST', `/api/h/memories/${id}/approve`, { host: s.hostToken, json: {} });
    assert.equal((await ap(a.data.id)).status, 200);
    assert.equal((await ap(b.data.id)).status, 200);
    let snap = (await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.memories;
    assert.deepEqual(snap.map((m) => m.slot).sort(), [0, 1]);
    // hide → disappears and slot is freed; restore → back
    assert.equal((await api(env.base, 'POST', `/api/h/memories/${a.data.id}/hide`, { host: s.hostToken, json: {} })).status, 200);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.memories.length, 1);
    const st = await api(env.base, 'POST', `/api/p/${s.joinToken}/status`, { json: { tokens: [a.data.manageToken] } });
    assert.equal(st.data.results[0].status, 'not_displayed');
    assert.equal((await ap(a.data.id)).status, 200);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.memories.length, 2);
    // lock
    assert.equal((await api(env.base, 'POST', '/api/h/lock', { host: s.hostToken, json: { locked: true } })).status, 200);
    const locked = await upload(env, s, { ...good, category: 'places' });
    assert.equal(locked.status, 403); assert.equal(locked.data.error, 'locked');
    assert.equal((await api(env.base, 'POST', `/api/p/${s.joinToken}/memories/${a.data.id}/responses`, { json: { text: 'x', consent: true } })).status, 403);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.session.locked, true);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.memories.length, 2, 'display continues while locked');
    await api(env.base, 'POST', '/api/h/lock', { host: s.hostToken, json: { locked: false } });
    // host delete
    assert.equal((await api(env.base, 'DELETE', `/api/h/memories/${a.data.id}`, { host: s.hostToken })).status, 200);
    assert.equal((await api(env.base, 'DELETE', `/api/h/memories/${a.data.id}`, { host: s.hostToken })).status, 200, 'delete is idempotent');
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/snapshot`)).data.memories.length, 1);
    const stA = await api(env.base, 'POST', `/api/p/${s.joinToken}/status`, { json: { tokens: [a.data.manageToken] } });
    assert.equal(stA.data.results[0].status, 'removed');
    // end session
    assert.equal((await api(env.base, 'POST', '/api/h/end', { host: s.hostToken, json: {} })).status, 200);
    for (const u of ['info', 'snapshot']) assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/${u}`)).status, 410);
    assert.equal((await upload(env, s)).status, 410);
    const info = await api(env.base, 'GET', '/api/h/session', { host: s.hostToken });
    assert.equal(info.status, 200); assert.equal(info.data.ended, true);
    // delete session data
    const dir = path.join(env.store.uploadsDir, env.store.sessionByHost(await (await import('../server/util.js')).sha256(s.hostToken)).id);
    assert.ok(fs.existsSync(dir));
    assert.equal((await api(env.base, 'DELETE', '/api/h/session', { host: s.hostToken })).status, 200);
    assert.ok(!fs.existsSync(dir), 'upload folder deleted');
    assert.equal(env.store.allSessions().length, 0);
    assert.equal(env.store.db.prepare('SELECT COUNT(*) AS n FROM memories').get().n, 0, 'rows deleted');
    assert.equal((await api(env.base, 'GET', '/api/h/session', { host: s.hostToken })).status, 401);
  } finally { await env.close(); }
});

test('sessions expire: link invalidated and data deleted (request-time check and sweep)', async () => {
  const env = await boot({ sessionTtlMs: 60 * 1000 });
  try {
    const s1 = await newSession(env, 'expires on request');
    const s2 = await newSession(env, 'expires by sweep');
    const up = await upload(env, s1);
    const id1 = env.store.sessionByJoin(s1.joinToken).id;
    const dir1 = path.join(env.store.uploadsDir, id1);
    assert.ok(fs.existsSync(dir1));
    await api(env.base, 'POST', `/api/h/memories/${up.data.id}/approve`, { host: s1.hostToken, json: {} });
    assert.equal((await api(env.base, 'GET', `/api/p/${s1.joinToken}/snapshot`)).data.memories.length, 1);
    clock += 61 * 1000;
    const r = await api(env.base, 'GET', `/api/p/${s1.joinToken}/snapshot`);
    assert.equal(r.status, 410); assert.equal(r.data.error, 'expired');
    assert.ok(!fs.existsSync(dir1), 'files deleted on expiry');
    assert.equal(env.store.sessionByJoin(s1.joinToken), null);
    assert.equal((await api(env.base, 'GET', '/api/h/session', { host: s1.hostToken })).status, 401);
    // second one is removed by the periodic sweep
    assert.ok(env.store.sessionByJoin(s2.joinToken));
    await env.app.sweep();
    assert.equal(env.store.sessionByJoin(s2.joinToken), null);
    assert.equal((await api(env.base, 'GET', `/api/p/${s2.joinToken}/info`)).status, 404);
  } finally { await env.close(); }
});

test('approved memories survive a server restart; reconnecting clients get a snapshot without duplicates', async () => {
  const dir = path.join(tmp, 'restart');
  let env = await boot({}, dir);
  const s = await newSession(env, 'Persistent');
  const up = await upload(env, s);
  await api(env.base, 'POST', `/api/h/memories/${up.data.id}/approve`, { host: s.hostToken, json: {} });
  const pending = await upload(env, s, { ...good, category: 'places', title: 'still pending' });
  await env.close();

  env = await boot({}, dir);
  try {
    const snap1 = await api(env.base, 'GET', `/api/h/snapshot`, { host: s.hostToken });
    assert.equal(snap1.status, 200);
    assert.equal(snap1.data.memories.length, 1);
    assert.equal(snap1.data.memories[0].id, up.data.id);
    assert.equal((await api(env.base, 'GET', `/api/p/${s.joinToken}/media/${up.data.id}/thumb`)).status, 200);
    // pending item is still in the host queue after the restart
    assert.equal((await api(env.base, 'GET', '/api/h/queue', { host: s.hostToken })).data.memories.length, 1);
    // re-approving (a duplicated click or event) does not create a second plant or change the slot
    await api(env.base, 'POST', `/api/h/memories/${up.data.id}/approve`, { host: s.hostToken, json: {} });
    await api(env.base, 'POST', `/api/h/memories/${up.data.id}/approve`, { host: s.hostToken, json: {} });
    const snap2 = await api(env.base, 'GET', `/api/h/snapshot`, { host: s.hostToken });
    assert.equal(snap2.data.memories.length, 1); assert.equal(snap2.data.memories[0].slot, snap1.data.memories[0].slot);
    // the contributor can still see their pending item's status
    const st = await api(env.base, 'POST', `/api/p/${s.joinToken}/status`, { json: { tokens: [pending.data.manageToken] } });
    assert.equal(st.data.results[0].status, 'pending');
  } finally { await env.close(); }
});

test('static serving: the game and phone page load; path traversal and private files are refused', async () => {
  const env = await boot();
  try {
    const s = await newSession(env, 'Static');
    assert.equal((await fetch(env.base + '/')).status, 200);
    const join = await fetch(env.base + `/join/${s.joinToken}`);
    assert.equal(join.status, 200);
    assert.match(join.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.equal((await fetch(env.base + `/join/${s.joinToken}/respond/abc`)).status, 200);
    assert.equal((await fetch(env.base + '/join-assets/join.js')).status, 200);
    for (const bad of ['/join-assets/../store.js', '/join-assets/store.js', '/..%2f..%2fsecret.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt', '/uploads/anything', '/data/garden.sqlite', '/server/store.js', '/package.json', '/%00']) {
      const r = await fetch(env.base + bad);
      assert.ok(r.status === 404 || r.status === 400, `${bad} → ${r.status}`);
      const body = await r.text();
      assert.ok(!body.includes('top secret') && !body.includes('DatabaseSync'), bad);
    }
    assert.equal((await api(env.base, 'POST', '/join/x', { json: {} })).status, 405);
    const h = (await fetch(env.base + '/')).headers;
    assert.equal(h.get('x-content-type-options'), 'nosniff');
  } finally { await env.close(); }
});

test('advertised address can be changed by the host and goes into the join link', async () => {
  const env = await boot();
  try {
    const s = await newSession(env, 'Links');
    const l0 = await api(env.base, 'GET', '/api/h/links', { host: s.hostToken });
    assert.equal(l0.status, 200);
    assert.ok(l0.data.url.endsWith(`/join/${s.joinToken}`));
    assert.ok(!l0.data.url.includes(s.hostToken), 'the participant URL never contains the host token');
    const l1 = await api(env.base, 'POST', '/api/h/advertised', { host: s.hostToken, json: { host: '192.168.50.7:4000' } });
    assert.equal(l1.data.url, `http://192.168.50.7:4000/join/${s.joinToken}`);
    assert.equal(l1.data.isLocalhost, false);
    assert.equal((await api(env.base, 'POST', '/api/h/advertised', { host: s.hostToken, json: { host: 'evil.com/x?y' } })).status, 400);
    const l2 = await api(env.base, 'POST', '/api/h/advertised', { host: s.hostToken, json: { host: '127.0.0.1:3000' } });
    assert.equal(l2.data.isLocalhost, true, 'localhost addresses are flagged so the UI can warn');
    // QR is produced when the optional library is installed; otherwise null (the URL is still shown)
    assert.equal(l1.data.qrSvg, undefined); // the QR code is drawn by the game page itself, from this url
    await api(env.base, 'POST', '/api/h/advertised', { host: s.hostToken, json: { host: '' } });
    // respond link for a memory
    const up = await upload(env, s);
    assert.equal((await api(env.base, 'POST', '/api/h/respond-link', { host: s.hostToken, json: { memoryId: up.data.id } })).status, 404, 'pending memories have no respond link');
    await api(env.base, 'POST', `/api/h/memories/${up.data.id}/approve`, { host: s.hostToken, json: {} });
    const rl = await api(env.base, 'POST', '/api/h/respond-link', { host: s.hostToken, json: { memoryId: up.data.id } });
    assert.ok(rl.data.url.endsWith(`/join/${s.joinToken}/respond/${up.data.id}`));
  } finally { await env.close(); }
});

test('the game client (LiveSession + GardenState) receives live approvals, recollections and removals without duplicates', async () => {
  const env = await boot();
  try {
    const creds = await createSession('Game client test', env.base);
    const state = new GardenState();
    const statuses = [];
    const live = new LiveSession(creds, state, { onStatus: (x) => statuses.push(x) }, { baseUrl: env.base });
    await live.start();
    const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 20)); } };
    await waitFor(() => live.status === 'online');
    const changes = [];
    state.subscribe((c) => changes.push(c));

    const up = await api(env.base, 'POST', `/api/p/${creds.joinToken}/memories`, { body: form(good, await makeJpeg()) });
    assert.equal(state.list.length, 0, 'pending uploads never reach the game state');
    await live.approveMemory(up.data.id);
    await waitFor(() => state.list.length === 1);
    assert.equal(state.list[0].title, good.title);
    assert.equal(live.publicImageUrl(up.data.id).startsWith(env.base + '/api/p/'), true);
    assert.equal((await fetch(live.publicImageUrl(up.data.id, 'thumb'))).status, 200, 'the approved photo loads from the public URL the 3D texture uses');

    await live.approveMemory(up.data.id); // a duplicated click: still one plant
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(state.list.length, 1);
    assert.equal(changes.filter((c) => c.added.length).length, 1, 'exactly one "added" notification');

    const r = await api(env.base, 'POST', `/api/p/${creds.joinToken}/memories/${up.data.id}/responses`, { json: { name: 'Mei', text: 'Burnt toast.', consent: true } });
    const q = await live.queue();
    assert.equal(q.responses.length, 1);
    await live.approveResponse(r.data.id);
    await waitFor(() => state.get(up.data.id).responses.length === 1);

    await live.setLocked(true);
    await waitFor(() => state.meta.locked === true);

    // simulate a dropped connection: abort the stream, change things meanwhile, then expect a clean resync
    live.abort.abort();
    const up2 = await api(env.base, 'POST', `/api/p/${creds.joinToken}/memories`, { body: form({ ...good, category: 'places', title: 'second' }, await makeJpeg()) }).catch(() => null);
    await live.setLocked(false);
    const up3 = await api(env.base, 'POST', `/api/p/${creds.joinToken}/memories`, { body: form({ ...good, category: 'places', title: 'second' }, await makeJpeg()) });
    await live.approveMemory(up3.data.id);
    await waitFor(() => state.list.length === 2, 6000);
    assert.equal(new Set(state.list.map((m) => m.id)).size, 2, 'no duplicates after reconnect');
    await waitFor(() => live.status === 'online', 6000); // the snapshot can arrive a moment before the stream says hello
    assert.ok(statuses.includes('offline') && live.status === 'online', 'went offline and came back: ' + statuses.join(','));

    await live.deleteMemory(up.data.id);
    await waitFor(() => state.list.length === 1);
    await live.end();
    assert.equal(state.meta.ended, true);
    live.stop();
  } finally { await env.close(); }
});

test('tokens never appear in server logs when request logging is on', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  const env = await boot({ logRequests: true });
  try {
    const s = await newSession(env, 'Logs');
    await api(env.base, 'GET', `/api/p/${s.joinToken}/info`);
    await fetch(env.base + `/join/${s.joinToken}`);
    await api(env.base, 'GET', '/api/h/session', { host: s.hostToken });
    console.log = orig;
    const all = logs.join('\n');
    assert.ok(all.includes('GET /api/p/<token>/info'));
    assert.ok(!all.includes(s.joinToken) && !all.includes(s.hostToken));
  } finally { console.log = orig; await env.close(); }
});

// ------------------------------------------------------------------ run
let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n       ') : err}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
