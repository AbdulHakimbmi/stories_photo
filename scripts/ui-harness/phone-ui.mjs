// Real Chromium (phone-sized) against the real server: the contribution page, end to end.
// Run:  npm run test:ui  (needs: npm i -D playwright; npx playwright install chromium)
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { loadConfig } from '../../server/config.js';
import { openStore } from '../../server/store.js';
import { createApp } from '../../server/app.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-'));
const cfg = loadConfig({}, { dataDir: path.join(tmp, 'd'), distDir: path.join(tmp, 'dist'), port: 0 });
fs.mkdirSync(cfg.distDir, { recursive: true }); fs.writeFileSync(path.join(cfg.distDir, 'index.html'), '<title>x</title>');
const store = openStore(cfg.dataDir); const app = createApp({ cfg, store });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}`;
const sess = await (await fetch(base + '/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Wei family garden' }) })).json();
const host = (m, u, b) => fetch(base + u, { method: m, headers: { 'x-host-token': sess.hostToken, ...(b ? { 'content-type': 'application/json' } : {}) }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

// a "camera photo": 3000x2000 JPEG with EXIF orientation 6 (should end up portrait)
const photo = path.join(tmp, 'IMG_0001.jpg');
fs.writeFileSync(photo, await sharp({ create: { width: 3000, height: 2000, channels: 3, noise: { type: 'gaussian', mean: 140, sigma: 40 } } }).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer());
const svg = path.join(tmp, 'evil.svg'); fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const heic = path.join(tmp, 'IMG_0002.heic'); fs.writeFileSync(heic, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]));
const txt = path.join(tmp, 'notes.jpg'); fs.writeFileSync(txt, 'just text pretending to be a jpg, padded padded padded padded');

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL:', m); } else if (process.env.V) console.log('  ok:', m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${base}/join/${sess.joinToken}`);
ok((await page.locator('h1').textContent()) === 'Wei family garden', 'garden name shown');
ok(await page.getByText('visible to people viewing this session after host approval').isVisible(), 'privacy notice shown');
ok(await page.getByText('up to 10.0 MB').count() > 0 || await page.getByText('10 MB').count() > 0 || await page.getByText(/up to 10/).count() > 0, 'size limit shown');
ok(await page.getByRole('button', { name: 'Choose a photo' }).isVisible(), 'choose button');

// bad files: friendly message, stays on welcome
for (const [f, text] of [[svg, /not supported/], [heic, /HEIC/], [txt, /not supported/]]) {
  await page.setInputFiles('#photo-input', f);
  await page.waitForSelector('[role=alert]');
  ok(await page.locator('[role=alert]').first().textContent().then((t) => text.test(t)), `rejects ${path.basename(f)} with a clear message`);
  ok(await page.getByRole('button', { name: 'Choose a photo' }).isVisible(), 'still able to choose another photo');
}

// good photo
await page.setInputFiles('#photo-input', photo);
await page.waitForSelector('#f-title');
ok(await page.locator('img.preview').isVisible(), 'local preview shown');
// empty submit → errors, nothing sent
await page.getByRole('button', { name: 'Send for approval' }).click();
ok((await page.locator('.field-error[role=alert]').count()) >= 3, 'empty form shows field errors');
ok((await host('GET', '/api/h/queue')).memories.length === 0, 'nothing uploaded by an invalid form');
await page.fill('#f-title', 'Sunday kopi');
await page.fill('#f-story', 'Every Sunday after market, Grandpa and I shared one cup of kopi.\nHe let me stir.');
await page.getByLabel(/Celebrations|Everyday Moments/).first().check();
await page.fill('#f-name', 'Wei');
await page.check('#f-unsure');
ok(await page.locator('#f-year').isDisabled(), '"Not sure" disables the year');
await page.getByRole('button', { name: 'Send for approval' }).click();
ok(await page.locator('.field-error:not(:empty)').first().textContent().then((t) => /permission/.test(t)), 'consent required');
await page.check('#f-consent');
await page.getByRole('button', { name: 'Send for approval' }).click();
await page.waitForSelector('text=Your memory is waiting for host approval.', { timeout: 15000 });
ok(true, 'success message shown');
const q = await host('GET', '/api/h/queue');
ok(q.memories.length === 1 && q.memories[0].title === 'Sunday kopi' && q.memories[0].story.includes('stir') && q.memories[0].name === 'Wei', 'host queue has the real submission');
ok(q.memories[0].width < q.memories[0].height, 'phone photo rotated upright by EXIF (portrait)');
ok(q.memories[0].yearUnknown === true, 'year unknown recorded');
const img = await fetch(base + `/api/h/media/${q.memories[0].id}/display`, { headers: { 'x-host-token': sess.hostToken } });
ok(img.headers.get('content-type') === 'image/webp', 'display image is a WebP');
const priv = await page.locator('input.linkbox').inputValue();
ok(/#m=/.test(priv) && !priv.includes(sess.hostToken), 'private link present, no host token');
// approve on "laptop" → phone status updates by polling
await host('POST', `/api/h/memories/${q.memories[0].id}/approve`, {});
await page.waitForSelector('.status--approved', { timeout: 9000 });
ok(true, 'phone status changes to approved');
// duplicate protection: reload & my contributions
await page.reload(); // lost in-memory state; stored capability should survive
await page.getByRole('button', { name: /My contributions/ }).click();
await page.waitForSelector('.item');
ok(await page.locator('.item').first().textContent().then((t) => /Sunday kopi/.test(t) && /On display/.test(t)), 'my contributions lists it after reload');

// respond page
const memId = q.memories[0].id;
await page.goto(`${base}/join/${sess.joinToken}/respond/${memId}`);
await page.waitForSelector('#r-text');
ok(await page.getByRole('heading', { name: 'Sunday kopi' }).isVisible() && await page.getByText('He let me stir.').count() > 0, 'respond page shows the memory and original story');
ok(await page.locator('img.preview').evaluate((i) => i.complete && i.naturalWidth > 0), 'respond page loads the real approved image');
await page.fill('#r-text', 'I remember he always burnt the toast.');
await page.getByRole('button', { name: 'Send for approval' }).click();
await page.waitForSelector('.field-error:not(:empty)');
ok(/agree/.test(await page.locator('.field-error:not(:empty)').first().textContent()), 'consent needed for recollection');
await page.check('#r-consent');
await page.getByRole('button', { name: 'Send for approval' }).click();
await page.waitForSelector('text=Your recollection is waiting for host approval.');
const q2 = await host('GET', '/api/h/queue');
ok(q2.responses.length === 1 && q2.responses[0].text.includes('toast'), 'recollection reached the host queue');

// withdraw
await page.getByRole('button', { name: /See my contributions/ }).click();
await page.waitForSelector('.item');
await page.locator('.item').first().getByRole('button', { name: 'Withdraw' }).click();
await page.getByRole('button', { name: 'Yes, withdraw' }).click();
await page.waitForSelector('.status--removed', { timeout: 5000 });
const after = await (await fetch(`${base}/api/p/${sess.joinToken}/snapshot`)).json();
ok(after.memories.length === 1 || after.memories.length === 0, 'snapshot readable after withdraw');
// the first item in list was the memory (oldest first) → memory removed
ok(after.memories.length === 0, 'withdrawn memory is gone from the public snapshot');

// locked & ended states
await host('POST', '/api/h/lock', { locked: true });
await page.goto(`${base}/join/${sess.joinToken}`);
ok(await page.getByText('paused new contributions').count() > 0 && await page.getByRole('button', { name: 'Choose a photo' }).isDisabled(), 'locked state explained, upload disabled');
await host('POST', '/api/h/end', {});
await page.goto(`${base}/join/${sess.joinToken}`);
ok(await page.getByText(/has ended/).count() > 0, 'ended session shows a clear message');
await page.goto(`${base}/join/not-a-real-token-value-123456`);
ok(await page.getByText(/not valid/).count() > 0, 'invalid link message');
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll on a phone');
const real = errors.filter((e) => !/status of (410|404)/.test(e));
ok(real.length === 0, 'no console/page errors: ' + real.join(' | '));
console.log(`${n - fails}/${n} phone-page checks passed`);
await browser.close(); await app.close(); store.close(); fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
