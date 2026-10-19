// End-to-end UI test: real Chromium + REAL garden server + the real game source (three.js replaced by a stub that renders nothing).
// What it proves: the DOM/UI flow, networking, live updates, state→world wiring, photo fetch for the 3D card, deletion.
// Run:  npm i -D playwright esbuild && npx playwright install chromium && npm run test:ui
// What it cannot prove: anything about how the 3D scene looks (no real three.js / GPU here).
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../../server/config.js';
import { openStore } from '../../server/store.js';
import { createApp } from '../../server/app.js';
import { build } from './build.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gui-'));
const dist = path.join(tmp, 'dist');
await build(dist);
const cfg = loadConfig({}, { dataDir: path.join(tmp, 'd'), distDir: dist, port: 0 });
const store = openStore(cfg.dataDir); const app = createApp({ cfg, store });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}`;

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL:', m); } else if (process.env.V) console.log('  ok:', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const photo = async (name, w, h, color) => { const f = path.join(tmp, name); fs.writeFileSync(f, await sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg({ quality: 88 }).toBuffer()); return f; };
const wide = await photo('wide.jpg', 3000, 2000, { r: 200, g: 120, b: 60 });

const browser = await chromium.launch();
const hostCtx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
const page = await hostCtx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const G = (expr) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`);
const waitG = async (expr, t = 8000) => { // polled from Node: the page's CSP forbids eval (a good thing)
  const end = Date.now() + t; let last;
  while (Date.now() < end) { try { last = await G(expr); if (last) return last; } catch (e) { last = e.message; } await sleep(60); }
  throw new Error('timed out waiting for: ' + expr + ' (last: ' + last + ')');
};

// ------------------------------------------------------------------ 1. title screen
await page.goto(base + '/');
await page.waitForSelector('.screen--title');
ok(await page.getByRole('button', { name: 'Start a live garden session' }).isVisible(), 'title: live session button');
ok(await page.getByRole('button', { name: 'Try the fictional demo' }).isVisible(), 'title: demo button');
ok(await page.getByText('Singapore, 2040 — a proposed future experience.').count() > 0, 'title: required setting line');
ok(await page.getByText('This prototype demonstrates shared contribution and storytelling. It is not a permanent digital preservation service.').count() > 0, 'title: required prototype note');

// ------------------------------------------------------------------ 2. start a live session; QR + address
await page.getByRole('button', { name: 'Start a live garden session' }).click();
await page.waitForSelector('canvas.qr', { timeout: 10000 });
ok(await G('g.kind') === 'live' && await G('g.mode') === 'playing', 'live session started, playing');
ok(await G('g.garden.plantCount()') === 0, 'garden starts empty');
let joinUrl = await page.locator('input.dock__url').inputValue();
ok(/^http:\/\/[^/]+\/join\/[A-Za-z0-9_-]{20,}$/.test(joinUrl), 'join URL shape: ' + joinUrl);
ok(!/hostToken|x-host/i.test(joinUrl), 'join URL contains no host credential');
const savedHost = await page.evaluate(() => JSON.parse(localStorage.getItem('ourMemoryGarden.host.v1')));
ok(!joinUrl.includes(savedHost.hostToken), 'host token is not in the join URL');
// decode the QR drawn on the canvas with an independent decoder (OpenCV)
const dataUrl = await page.locator('canvas.qr').first().evaluate((c) => c.toDataURL('image/png'));
const qrPng = path.join(tmp, 'qr.png'); fs.writeFileSync(qrPng, Buffer.from(dataUrl.split(',')[1], 'base64'));
const decoded = execFileSync('python3', ['-c', 'import cv2,sys; img=cv2.imread(sys.argv[1]); t,_,_=cv2.QRCodeDetector().detectAndDecode(img); print(t)', qrPng]).toString().trim();
ok(decoded === joinUrl, `QR canvas decodes to the join URL (${decoded})`);
const joinPath = new URL(joinUrl).pathname;     // phone talks to the same server; in this sandbox use 127.0.0.1

// ------------------------------------------------------------------ 3. a phone uploads a real photo through the real phone page
const phoneCtx = await browser.newContext({ ...devices['Pixel 7'] });
const phone = await phoneCtx.newPage();
await phone.goto(base + joinPath);
await phone.setInputFiles('#photo-input', wide);
await phone.waitForSelector('#f-title');
await phone.fill('#f-title', 'Sunday kopi');
await phone.fill('#f-story', 'Every Sunday after market, Grandpa and I shared one cup of kopi.');
await phone.getByLabel(/Celebrations/).first().check();
await phone.fill('#f-name', 'Wei');
await phone.fill('#f-year', '1999');
await phone.check('#f-consent');
await phone.getByRole('button', { name: 'Send for approval' }).click();
await phone.waitForSelector('text=Your memory is waiting for host approval.', { timeout: 15000 });
ok(true, 'phone: upload accepted, waiting message');
ok(await G('g.garden.plantCount()') === 0, 'nothing is in the garden before approval');

// ------------------------------------------------------------------ 4. host sees it in the queue
await waitG('g.dock.pending === 1');
ok(await page.locator('.hud__buttons .count').first().textContent() === '1', 'HUD badge shows 1 waiting');
ok(await page.locator('.toast', { hasText: 'waiting for your approval' }).count() > 0, 'toast announces the waiting item');
await page.getByRole('tab', { name: /Approvals/ }).click();
await page.waitForSelector('.qitem');
const preview = page.locator('.qitem__img').first();
await preview.waitFor();
await page.waitForFunction(() => { const i = document.querySelector('.qitem__img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
ok(true, 'queue preview shows the real uploaded photo (host-authenticated fetch)');
ok(await page.locator('.qitem h3').first().textContent() === 'Sunday kopi', 'queue shows the title');
ok((await page.locator('.qitem__story').first().textContent()).includes('Grandpa'), 'queue shows the story');

// ------------------------------------------------------------------ 5. approve → plant appears live (no reload)
await page.evaluate(() => { window.__noReload = 'same-page'; });
await page.getByRole('button', { name: 'Approve and plant' }).click();
await waitG('g.garden.plantCount() === 1');
ok(await page.evaluate(() => window.__noReload) === 'same-page', 'plant appeared without a page reload');
const memId = await G('g.state.list[0].id');
ok(await G('g.state.get(g.state.list[0].id).category') === 'celebrations' && await G('g.state.list[0].slot') === 0, 'celebrations slot 0 allocated');
await page.waitForFunction((id) => (window.__texLog || []).some((t) => t.url.includes(`/media/${id}/thumb`) && t.ok), memId, { timeout: 8000 });
const tex = await page.evaluate((id) => window.__texLog.find((t) => t.url.includes(`/media/${id}/thumb`)), memId);
ok(tex.w > 0 && tex.w / tex.h > 1.4 && tex.w / tex.h < 1.6, `3D card texture is the real photo at its own aspect ratio (${tex.w}x${tex.h})`);
ok(await page.locator('.toast', { hasText: 'A new memory has grown' }).count() > 0, 'toast: new memory has grown');
await phone.waitForSelector('.status--approved', { timeout: 9000 });
ok(true, 'phone status becomes approved');

// ------------------------------------------------------------------ 6. clicking the plant opens the story with the real photo
await page.evaluate((id) => { window.__pickId = id; }, memId);
await G('g.onTap(10, 10)');
await page.waitForSelector('.panel--memory');
await page.waitForFunction(() => { const i = document.querySelector('img.mem__img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
ok(await page.locator('.mem__title').textContent() === 'Sunday kopi', 'panel: title');
ok((await page.locator('.mem__story').textContent()).includes('shared one cup of kopi'), 'panel: story');
ok((await page.locator('.mem__grid').textContent()).includes('About 1999') && (await page.locator('.mem__grid').textContent()).includes('Shared by Wei'), 'panel: year and name');
const dims = await page.locator('img.mem__img').evaluate((i) => [i.naturalWidth, i.naturalHeight]);
ok(Math.abs(dims[0] / dims[1] - 1.5) < 0.05, 'panel: real photo, original proportions kept');
ok(await page.getByText('Conversation prompts to try together').count() > 0, 'panel: conversation prompts');

// ------------------------------------------------------------------ 7. recollection typed in the panel → approval → leaf
await page.fill('#resp-text', 'He always burnt the toast.');
await page.getByRole('button', { name: 'Send for approval' }).click();
await page.waitForSelector('#resp-err:not([hidden])');
ok(/tick the box/.test(await page.locator('#resp-err').textContent()), 'recollection: consent required');
await page.check('#resp-consent');
await page.getByRole('button', { name: 'Send for approval' }).click();
await waitG('g.dock.pending === 1');
ok(await G(`g.state.get('${memId}').responses.length`) === 0, 'recollection does not appear before approval');
// a second recollection arrives from a phone, via the respond page
await phone.goto(base + joinPath + '/respond/' + memId);
await phone.fill('#r-text', 'Grandpa let me stir.');
await phone.check('#r-consent');
await phone.getByRole('button', { name: 'Send for approval' }).click();
await phone.waitForSelector('text=Your recollection is waiting for host approval.');
await waitG('g.dock.pending === 2');
await page.keyboard.press('Escape');                    // close the memory panel
await page.getByRole('tab', { name: /Approvals/ }).click();
await page.waitForSelector('.qitem--response');
ok(await page.locator('.qitem--response').count() === 2, 'host queue lists both recollections');
while (await page.getByRole('button', { name: 'Approve', exact: true }).count()) { await page.getByRole('button', { name: 'Approve', exact: true }).first().click(); await sleep(250); }
await waitG(`g.state.get('${memId}').responses.length === 2`);
ok(await G(`g.garden.leafCount('${memId}')`) === 2, 'plant grew one leaf per approved recollection');

// ------------------------------------------------------------------ 8. keyboard: walk to the plant, press E
await G(`g.focusMemory('${memId}')`);
await waitG(`g.target && g.target.id === '${memId}'`);
await sleep(100);
ok(await page.locator('.prompt').isVisible(), 'prompt appears next to the plant ' + await page.evaluate(() => { const p = document.querySelector('.prompt'); const r = p.getBoundingClientRect(); return JSON.stringify({ hidden: p.hidden, r: [r.x, r.y, r.width, r.height], hudHidden: document.getElementById('hud').hidden, text: p.textContent }); }));
await page.keyboard.press('KeyE');
await page.waitForSelector('.panel--memory');
ok((await page.locator('.resp__item').count()) === 2, 'panel lists both approved recollections');
await page.keyboard.press('Escape');

// ------------------------------------------------------------------ 9. overview + dock toggles
await page.keyboard.press('KeyG');
ok(await G('g.overview') === true, 'G: whole-garden view');
await page.keyboard.press('KeyG');
ok(await G('g.overview') === false, 'G again: back to walking');
await page.keyboard.press('KeyH');
ok(await G('g.dock.isOpen') === false, 'H closes the host panel');
await page.keyboard.press('KeyH');
ok(await G('g.dock.isOpen') === true, 'H opens it again');

// ------------------------------------------------------------------ 10. gathering place from three categories (via API, as phones would)
const hostHdr = { 'x-host-token': savedHost.hostToken, 'content-type': 'application/json' };
async function phoneUpload(category, title) {
  const fd = new FormData();
  fd.set('photo', new Blob([fs.readFileSync(wide)], { type: 'image/jpeg' }), 'p.jpg');
  Object.entries({ title, story: 'A short story for ' + title, category, name: 'Tester', yearUnknown: 'true', consent: 'true', clientId: 'c-' + title.replace(/\W/g, '') }).forEach(([k, v]) => fd.set(k, v));
  const r = await fetch(`${base}/api/p/${savedHost.joinToken}/memories`, { method: 'POST', body: fd });
  return (await r.json()).id;
}
const eId = await phoneUpload('everyday', 'Morning walk');
const pId = await phoneUpload('places', 'The old field');
await fetch(`${base}/api/h/memories/${eId}/approve`, { method: 'POST', headers: hostHdr, body: '{}' });
await waitG('g.garden.plantCount() === 2');
ok(await G('g.garden.gatheringShown()') === false, 'gathering place not yet grown with 2 of 3');
await fetch(`${base}/api/h/memories/${pId}/approve`, { method: 'POST', headers: hostHdr, body: '{}' });
await waitG('g.garden.gatheringShown() === true');
ok(await page.locator('.toast', { hasText: 'A gathering place has grown' }).count() > 0, 'toast: gathering place has grown');
ok((await page.locator('.hud__progress').textContent()) === 'Gathering place: grown', 'HUD shows the activity as complete');

// ------------------------------------------------------------------ 11. reload + resume: instant, no duplicates
await page.reload();
await page.waitForSelector('.screen--title');
await page.getByRole('button', { name: /^Resume/ }).click();
await waitG('g.kind === "live" && g.garden.plantCount() === 3');
ok(await G('g.garden.gatheringShown()') === true, 'resume: all plants and the gathering place are back');
ok((await G('g.garden.plantIds().length')) === (await G('new Set(g.garden.plantIds()).size')), 'resume: no duplicate plants');
await sleep(1200);
ok(await G('g.garden.plantCount()') === 3, 'still 3 plants after the stream reconnected');

// ------------------------------------------------------------------ 12. lock / phone sees it
await page.getByRole('tab', { name: 'Session' }).click();
await page.getByRole('button', { name: 'Pause new uploads' }).click();
await waitG('g.state.meta.locked === true');
await phone.goto(base + joinPath);
ok(await phone.getByText('paused new contributions').count() > 0, 'phone is told that uploads are paused');
await page.getByRole('button', { name: /Uploads paused/ }).click();
await waitG('g.state.meta.locked === false');

// ------------------------------------------------------------------ 13. delete removes plant, files and the public image
const filesBefore = fs.readdirSync(path.join(cfg.dataDir, 'uploads'), { recursive: true }).filter((f) => /\.webp$/.test(f)).length;
ok(filesBefore >= 6, `server holds image files for 3 memories (${filesBefore})`);
await page.getByRole('tab', { name: 'Garden' }).click();
await page.waitForSelector('.mlist__row');
await page.locator('.mlist__row', { hasText: 'Sunday kopi' }).getByRole('button', { name: 'Delete' }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
await waitG('g.garden.plantCount() === 2');
ok(await G(`g.garden.hasMemory('${memId}')`) === false, 'delete: plant removed from the garden');
const filesAfter = fs.readdirSync(path.join(cfg.dataDir, 'uploads'), { recursive: true }).filter((f) => /\.webp$/.test(f)).length;
ok(filesAfter === filesBefore - 2, 'delete: its image files are gone from the server');
const gone = await fetch(`${base}/api/p/${savedHost.joinToken}/media/${memId}/thumb`);
ok(gone.status === 404, 'delete: public image URL now returns 404');
ok(await G('g.garden.gatheringShown()') === false, 'deleting the only celebration takes the gathering place away again (it is recomputed from what exists)');

// ------------------------------------------------------------------ 14. end session / delete session data
await page.getByRole('tab', { name: 'Session' }).click();
await page.getByRole('button', { name: 'Delete all session data' }).click();
await page.getByRole('button', { name: 'Delete everything' }).click();
await page.waitForSelector('.screen--title');
ok(await page.getByText('All data for that session was deleted from the server.').count() > 0, 'delete session: back at title with a clear message');
const left = fs.existsSync(path.join(cfg.dataDir, 'uploads')) ? fs.readdirSync(path.join(cfg.dataDir, 'uploads'), { recursive: true }).filter((f) => /\.webp$/.test(f)).length : 0;
ok(left === 0, 'delete session: no image files remain');
ok(await page.getByRole('button', { name: /^Resume/ }).count() === 0, 'delete session: saved session forgotten');
const dead = await fetch(`${base}/api/p/${savedHost.joinToken}/info`);
ok(dead.status === 404 || dead.status === 410, 'delete session: join link is dead');

// ------------------------------------------------------------------ 15. fictional demo (no server involvement)
const reqsBefore = [];
page.on('request', (r) => reqsBefore.push(r.url()));
await page.getByRole('button', { name: 'Try the fictional demo' }).click();
try { await waitG('g.kind === "demo" && g.garden.plantCount() === 3', 3000); } catch (e) { console.log('DEMO START FAILED; page errors:', errors.slice(-5)); console.log(await G('JSON.stringify({kind:g.kind,mode:g.mode,n:g.garden.plantCount(),list:g.state.list.length})')); throw e; }
ok(!reqsBefore.some((u) => u.includes('/api/')), 'demo makes no API requests');
ok(await page.locator('.hchip', { hasText: 'Fictional demo' }).count() > 0, 'demo is clearly labelled');
await page.evaluate(() => { window.__pickId = 'demo-market'; }); await G('g.onTap(5,5)');
await page.waitForSelector('.panel--memory');
ok(await page.locator('.chip--fiction').count() === 1, 'demo memory is tagged "Fictional example"');
ok(await page.locator('canvas.mem__img').count() === 1, 'demo memory shows its drawn picture');
await page.fill('#resp-text', 'A made-up recollection.'); await page.check('#resp-consent');
await page.getByRole('button', { name: 'Add to the demo plant' }).click();
await waitG("g.state.get('demo-market').responses.length === 2");
ok(await G("g.garden.leafCount('demo-market')") === 2, 'demo: leaf added');
await page.keyboard.press('Escape');
ok(await G('g.garden.gatheringShown()') === false, 'demo: gathering place not grown yet');
await page.keyboard.press('KeyH');
await page.getByRole('button', { name: 'Plant the next fictional memory' }).first().click();
await waitG('g.garden.plantCount() === 4 && g.garden.gatheringShown()');
ok(true, 'demo: planting the fourth fictional memory grows the gathering place');
await page.getByRole('button', { name: 'Reset the demo' }).first().click();
await waitG('g.garden.plantCount() === 3 && !g.garden.gatheringShown()');
ok(await G("g.state.get('demo-market').responses.length") === 1, 'demo reset restores the original state');

// ------------------------------------------------------------------ 15b. the server forgets the session (data cleared) -> clear message
await page.getByRole('button', { name: /^Menu/ }).click();
await page.getByRole('button', { name: /Leave the demo/ }).last().click();
await page.waitForSelector('.screen--title');
await page.getByRole('button', { name: 'Start a live garden session' }).click();
await page.waitForSelector('canvas.qr', { timeout: 10000 });
const lostCreds = await page.evaluate(() => JSON.parse(localStorage.getItem('ourMemoryGarden.host.v1')));
await fetch(`${base}/api/h/session`, { method: 'DELETE', headers: { 'x-host-token': lostCreds.hostToken } });   // as if the server's data were wiped
await page.getByRole('heading', { name: 'The server no longer knows this session' }).waitFor({ timeout: 15000 });
ok(true, 'session lost: explained in plain words');
await page.getByRole('button', { name: 'Back to the title screen' }).click();
await page.waitForSelector('.screen--title');
ok(await page.getByRole('button', { name: /^Resume/ }).count() === 0, 'session lost: stale saved session forgotten');

// ------------------------------------------------------------------ 16. server unreachable → friendly message
await app.close();
await page.getByRole('button', { name: 'Start a live garden session' }).click();
await page.waitForSelector('.screen--title .banner--warn:not([hidden])');
ok(/not reachable/.test(await page.locator('.screen--title .banner--warn').textContent()), 'server down: clear, friendly message');

const real = errors.filter((e) => !/status of (410|404)|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
ok(real.length === 0, 'no unexpected console/page errors: ' + real.join(' | '));
console.log(`${n - fails}/${n} UI checks passed`);
await browser.close(); store.close(); fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
