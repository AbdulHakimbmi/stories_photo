// =============================================================================
//  join.js — the phone page (no build step, no libraries). Everything the contributor
//  types is inserted with textContent, never as HTML.
// =============================================================================
const app = document.getElementById('app');
const parts = location.pathname.split('/').filter(Boolean); // ['join', <token>, 'respond', <memoryId>]
const JOIN = parts[1] || '';
const RESPOND_ID = parts[2] === 'respond' && /^[a-f0-9]{8,64}$/.test(parts[3] || '') ? parts[3] : null;
const API = `/api/p/${encodeURIComponent(JOIN)}`;

const CATEGORIES = [
  { id: 'everyday', label: 'Everyday Moments', hint: 'A meal, a habit, an ordinary day worth remembering' },
  { id: 'celebrations', label: 'Celebrations', hint: 'Birthdays, festivals, gatherings, milestones' },
  { id: 'people', label: 'People We Cherish', hint: 'A person, a pair, a whole family' },
  { id: 'places', label: 'Places We Remember', hint: 'A home, a street, a favourite spot' },
];
const STATUS_TEXT = {
  pending: 'Waiting for host approval', approved: 'On display in the garden', not_displayed: 'Not displayed',
  removed: 'Removed', unknown: 'Not found (the session may have ended)',
};
const SHORT_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const state = { info: null, file: null, previewUrl: null, details: {}, clientId: null, uploading: false, mine: loadMine(), timer: null };

// ---------------------------------------------------------------- tiny helpers
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function setView(...nodes) {
  stopPolling();
  while (app.firstChild) app.removeChild(app.firstChild);
  nodes.flat(Infinity).forEach((n) => n && app.appendChild(n));
  const heading = app.querySelector('h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: false }); }
  window.scrollTo(0, 0);
}
const fmtMB = (b) => (b / 1048576 >= 1 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

function loadMine() {
  try { const v = JSON.parse(localStorage.getItem(`garden:${JOIN}:mine`) || '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.token === 'string').slice(0, 12) : []; } catch { return []; }
}
function saveMine() {
  try { localStorage.setItem(`garden:${JOIN}:mine`, JSON.stringify(state.mine.slice(-12))); } catch { /* private mode: still works for this visit */ }
}
function remember(entry) {
  if (!state.mine.some((m) => m.token === entry.token)) { state.mine.push(entry); saveMine(); }
}

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw Object.assign(new Error('We could not reach the garden. Check that your phone is still on the same Wi‑Fi as the laptop, then try again.'), { code: 'network' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw Object.assign(new Error((data && data.message) || `Something went wrong (${res.status}).`), { code: (data && data.error) || 'error', status: res.status });
  return data;
}

// ---------------------------------------------------------------- views
function header(title, subtitle) {
  return [h('span', { class: 'badge' }, 'Singapore, 2040 — a proposed future experience'), h('h1', null, title), subtitle ? h('p', null, subtitle) : null];
}

function errorView(title, message) {
  setView(header(title), h('p', { class: 'notice notice--error', role: 'alert' }, message),
    h('p', { class: 'fine' }, 'If you were given a QR code, ask the host to show it again, or to check that the session is still running.'));
}

function lockedBanner() {
  return state.info && state.info.locked ? h('p', { class: 'notice notice--warn', role: 'status' }, 'The host has paused new contributions for now. You can still check on what you sent earlier.') : null;
}

function mineLink() {
  if (!state.mine.length) return null;
  return h('button', { type: 'button', class: 'link', onClick: showMine }, `My contributions (${state.mine.length})`);
}

function welcome() {
  const fileInput = h('input', {
    type: 'file', hidden: true, id: 'photo-input', accept: 'image/jpeg,image/png,image/webp', tabindex: '-1', 'aria-hidden': 'true',
    onChange: () => { const f = fileInput.files && fileInput.files[0]; if (f) pickFile(f); fileInput.value = ''; },
  });
  const choose = h('button', { type: 'button', class: 'primary', disabled: !!(state.info && state.info.locked), onClick: () => fileInput.click() }, 'Choose a photo');
  setView(
    header(state.info.name, 'Add a photograph and the story behind it. Family and friends can add their own recollections too.'),
    lockedBanner(),
    h('p', { class: 'notice notice--privacy' }, h('strong', null, 'Privacy: '), 'Your photo and story will be visible to people viewing this session after host approval.'),
    h('p', { class: 'fine' }, `JPEG, PNG or WebP, up to ${fmtMB(state.info.maxUploadBytes)}. Please do not upload sensitive photographs or personal information. You can withdraw your memory at any time while this session is running.`),
    choose, fileInput, mineLink(),
    h('p', { class: 'fine' }, 'This is a temporary showcase, not a permanent archive or preservation service.'),
  );
}

async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const asc = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && asc(1, 4) === 'PNG') return 'png';
  if (asc(0, 4) === 'RIFF' && asc(8, 12) === 'WEBP') return 'webp';
  if (asc(4, 8) === 'ftyp') return 'heic';
  return 'other';
}

async function pickFile(file) {
  const limit = state.info.maxUploadBytes;
  const kind = await sniff(file);
  if (kind === 'heic') return fileProblem('That looks like a HEIC/HEIF photo, which is not supported yet. Please choose a JPEG, PNG or WebP photo. On an iPhone you can switch Settings → Camera → Formats → Most Compatible, or share the photo as JPEG.');
  if (kind === 'other' || (file.type && !SHORT_FILE_TYPES.includes(file.type) && kind !== 'jpeg' && kind !== 'png' && kind !== 'webp')) return fileProblem('That file type is not supported. Please choose a JPEG, PNG or WebP photograph.');
  if (file.size > limit) return fileProblem(`That photo is ${fmtMB(file.size)}, which is over the ${fmtMB(limit)} limit. Please choose a smaller one.`);
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.file = file;
  state.previewUrl = URL.createObjectURL(file);
  state.clientId = uuid();
  details();
}

function fileProblem(message) {
  welcome();
  const note = h('p', { class: 'notice notice--error', role: 'alert' }, message);
  app.insertBefore(note, app.querySelector('.notice--privacy'));
  note.setAttribute('tabindex', '-1');
  note.focus();
}

function details(errors = {}) {
  const d = state.details;
  const title = h('input', { type: 'text', id: 'f-title', maxlength: 80, required: true, autocomplete: 'off', value: d.title || '', 'aria-describedby': 'e-title', 'aria-invalid': errors.title ? 'true' : null });
  const story = h('textarea', { id: 'f-story', maxlength: 800, required: true, 'aria-describedby': 'e-story c-story', 'aria-invalid': errors.story ? 'true' : null }); story.value = d.story || '';
  const counter = h('div', { class: 'counter', id: 'c-story', 'aria-hidden': 'true' }, `${story.value.length} / 800`);
  story.addEventListener('input', () => { counter.textContent = `${story.value.length} / 800`; });
  const name = h('input', { type: 'text', id: 'f-name', maxlength: 40, autocomplete: 'off', value: d.name || '' });
  const year = h('input', { type: 'number', id: 'f-year', inputmode: 'numeric', min: 1850, max: new Date().getFullYear(), value: d.year || '', 'aria-describedby': 'e-year', 'aria-invalid': errors.year ? 'true' : null });
  const unsure = h('input', { type: 'checkbox', id: 'f-unsure', checked: !!d.yearUnknown, onChange: () => { year.disabled = unsure.checked; if (unsure.checked) year.value = ''; } });
  year.disabled = !!d.yearUnknown;
  const consent = h('input', { type: 'checkbox', id: 'f-consent', checked: !!d.consent, 'aria-describedby': 'e-consent', 'aria-invalid': errors.consent ? 'true' : null });
  const catRadios = CATEGORIES.map((c) => h('label', { class: 'choice' },
    h('input', { type: 'radio', name: 'category', value: c.id, checked: d.category === c.id }), h('span', null, h('strong', null, c.label), h('span', { class: 'hint' }, c.hint))));

  const submit = h('button', { type: 'submit', class: 'primary', disabled: !!state.info.locked }, 'Send for approval');
  const form = h('form', { novalidate: true, onSubmit: (e) => { e.preventDefault(); collect(); } },
    h('img', { class: 'preview', src: state.previewUrl, alt: 'Preview of the photograph you chose' }),
    h('p', { class: 'fine' }, `${state.file.name || 'Photo'} · ${fmtMB(state.file.size)}`),
    h('button', { type: 'button', class: 'link', onClick: () => { collectDraft(); welcome(); } }, 'Choose a different photo'),
    h('label', { for: 'f-title' }, 'Title ', h('span', { class: 'hint' }, '(required, short)')), title, errorLine('e-title', errors.title),
    h('label', { for: 'f-story' }, 'Story ', h('span', { class: 'hint' }, '(required — what was happening?)')), story, counter, errorLine('e-story', errors.story),
    h('fieldset', { 'aria-invalid': errors.category ? 'true' : null, 'aria-describedby': 'e-cat' }, h('legend', null, 'Where should it grow? ', h('span', { class: 'hint' }, '(required)')), catRadios, errorLine('e-cat', errors.category)),
    h('label', { for: 'f-name' }, 'Your name ', h('span', { class: 'hint' }, '(optional — shown with the memory)')), name,
    h('label', { for: 'f-year' }, 'Approximate year ', h('span', { class: 'hint' }, '(optional)')), year,
    h('label', { class: 'check', for: 'f-unsure' }, unsure, h('span', null, 'Not sure of the year')), errorLine('e-year', errors.year),
    h('p', { class: 'notice notice--privacy' }, 'Please do not upload sensitive photographs or personal information.'),
    h('label', { class: 'check', for: 'f-consent' }, consent, h('span', null, 'I have permission to share this photograph and agree to show it in this session.')), errorLine('e-consent', errors.consent),
    errors.form ? h('p', { class: 'notice notice--error', role: 'alert', id: 'form-error', tabindex: '-1' }, errors.form) : null,
    lockedBanner(), submit,
    h('button', { type: 'button', class: 'link', onClick: () => { collectDraft(); welcome(); } }, 'Back'),
  );

  function collectDraft() {
    state.details = {
      title: title.value, story: story.value, name: name.value, year: year.value, yearUnknown: unsure.checked, consent: consent.checked,
      category: (form.querySelector('input[name=category]:checked') || {}).value || '',
    };
  }
  function collect() {
    collectDraft();
    const e = {};
    const dd = state.details;
    if (!dd.title.trim()) e.title = 'Please add a short title.';
    if (!dd.story.trim()) e.story = 'Please add a short story.';
    if (!dd.category) e.category = 'Please choose where this memory should grow.';
    if (!dd.yearUnknown && dd.year && !/^\d{4}$/.test(String(dd.year).trim())) e.year = 'Enter four digits, like 1998, or tick “Not sure”.';
    if (!dd.consent) e.consent = 'Please tick the box to confirm you have permission.';
    if (Object.keys(e).length) { details(e); const first = app.querySelector('[aria-invalid=true], [role=alert]'); if (first) first.focus(); return; }
    send();
  }
  setView(header('Tell us about this photo'), form);
  if (errors.form) document.getElementById('form-error')?.focus();
  else { const first = Object.keys(errors).length ? app.querySelector('[aria-invalid=true]') : null; if (first) first.focus(); }
}

function errorLine(id, text) { return h('p', { class: 'field-error', id, role: text ? 'alert' : null }, text || ''); }

// ---------------------------------------------------------------- upload
async function prepareUpload(file) {
  // Shrink big camera photos on the phone so they upload quickly. The server re-checks and re-encodes everything anyway.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1048576) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

async function send() {
  if (state.uploading) return;
  state.uploading = true;
  const d = state.details;
  const bar = h('progress', { max: 100, value: 0, 'aria-label': 'Upload progress' });
  const label = h('p', { role: 'status' }, 'Preparing your photo…');
  setView(header('Sending your memory…'), h('div', { class: 'card' }, label, bar), h('p', { class: 'fine' }, 'Please keep this page open until it finishes.'));
  try {
    const photo = await prepareUpload(state.file);
    const fd = new FormData();
    fd.append('title', d.title.trim()); fd.append('story', d.story.trim()); fd.append('name', (d.name || '').trim());
    fd.append('category', d.category); fd.append('year', d.yearUnknown ? '' : String(d.year || '').trim()); fd.append('yearUnknown', d.yearUnknown ? 'true' : 'false');
    fd.append('consent', 'true'); fd.append('clientId', state.clientId);
    fd.append('photo', photo, photo === state.file ? (state.file.name || 'photo') : 'photo.jpg');
    label.textContent = 'Uploading…';
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}/memories`);
      xhr.timeout = 90000;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { bar.value = Math.round((e.loaded / e.total) * 100); if (e.loaded === e.total) label.textContent = 'Checking your photo…'; } };
      xhr.onerror = () => reject(Object.assign(new Error('We could not reach the garden. Check that your phone is still on the same Wi‑Fi as the laptop, then press “Send for approval” again — it will not be sent twice.'), { code: 'network' }));
      xhr.ontimeout = () => reject(Object.assign(new Error('The upload took too long. Check your connection and try again — it will not be sent twice.'), { code: 'network' }));
      xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
        else reject(Object.assign(new Error((body && body.message) || `The garden could not accept this (${xhr.status}).`), { code: (body && body.error) || 'error', status: xhr.status }));
      };
      xhr.send(fd);
    });
    state.uploading = false;
    const entry = { token: data.manageToken, kind: 'memory', title: d.title.trim(), at: Date.now() };
    remember(entry);
    state.details = {}; state.file = null;
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
    done(entry);
  } catch (err) {
    state.uploading = false;
    const fatal = ['unsupported_heic', 'unsupported_svg', 'unsupported_gif', 'unsupported_type', 'decode_failed', 'dimensions_too_large', 'too_large', 'invalid_image', 'photo_required'].includes(err.code);
    if (['locked', 'ended', 'expired', 'session_full'].includes(err.code)) { state.info.locked = err.code === 'locked' || state.info.locked; }
    if (fatal) { state.file = null; if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; welcome(); const note = h('p', { class: 'notice notice--error', role: 'alert', tabindex: '-1' }, err.message); app.insertBefore(note, app.querySelector('.notice--privacy')); note.focus(); return; }
    details({ form: err.message });
  }
}

function done(entry) {
  const statusEl = h('span', { class: 'status status--pending' }, STATUS_TEXT.pending);
  const link = `${location.origin}/join/${JOIN}#m=${entry.token}`;
  const linkBox = h('input', { type: 'text', readonly: true, class: 'linkbox', value: link, 'aria-label': 'Your private link', onFocus: (e) => e.target.select() });
  const copied = h('p', { class: 'fine', role: 'status' });
  setView(
    header('Thank you!'),
    h('p', { class: 'notice notice--ok', role: 'status' }, h('strong', null, 'Your memory is waiting for host approval.')),
    h('p', null, 'Status: ', statusEl),
    h('p', { class: 'fine' }, 'Keep this page open, or come back to it later. The status updates by itself.'),
    h('div', { class: 'card' },
      h('h2', null, 'Your private link'),
      h('p', { class: 'fine' }, 'This link lets you check on, or withdraw, your memory. Anyone who has it can do the same, so please do not share it.'),
      linkBox,
      h('button', { type: 'button', onClick: () => copyText(linkBox, copied) }, 'Copy private link'), copied),
    h('button', { type: 'button', class: 'primary', onClick: () => { welcome(); } }, 'Add another memory'),
    h('button', { type: 'button', onClick: showMine }, 'See my contributions and withdraw'),
  );
  const poll = async () => {
    try {
      const r = await api('POST', '/status', { tokens: [entry.token] });
      const st = r.results[0].status;
      statusEl.className = `status status--${st}`;
      statusEl.textContent = STATUS_TEXT[st] || st;
    } catch { /* keep the last status */ }
  };
  startPolling(poll);
}

async function copyText(input, note) {
  input.focus(); input.select();
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(input.value);
    else if (!document.execCommand('copy')) throw new Error('no copy');
    note.textContent = 'Copied.';
  } catch {
    note.textContent = 'Could not copy automatically. The link is selected: press and hold, then choose Copy.';
  }
}

// ---------------------------------------------------------------- my contributions + withdraw
async function showMine() {
  const list = h('div', { class: 'card' }, h('p', { role: 'status' }, 'Checking…'));
  setView(header('My contributions'), list, h('button', { type: 'button', class: 'primary', onClick: () => (RESPOND_ID ? respondView() : welcome()) }, 'Back'));
  const render = async () => {
    if (!state.mine.length) { list.replaceChildren(h('p', null, 'You have not sent anything from this phone yet.')); return; }
    let results;
    try { results = (await api('POST', '/status', { tokens: state.mine.map((m) => m.token) })).results; } catch (err) { list.replaceChildren(h('p', { class: 'notice notice--error', role: 'alert' }, err.message)); return; }
    const rows = state.mine.map((m, i) => {
      const r = results[i] || { status: 'unknown' };
      const title = r.title || m.title || '';
      const withdrawBtn = h('button', { type: 'button', class: 'danger', onClick: () => confirmRow(row, m, title) }, 'Withdraw');
      const row = h('div', { class: 'item' },
        h('strong', null, `${m.kind === 'response' ? 'Recollection on ' : ''}“${title || 'Removed'}”`), h('br'),
        h('span', { class: `status status--${r.status}` }, STATUS_TEXT[r.status] || r.status),
        r.status === 'removed' || r.status === 'unknown' ? h('button', { type: 'button', class: 'link', onClick: () => { state.mine = state.mine.filter((x) => x.token !== m.token); saveMine(); render(); } }, 'Remove from this list') : withdrawBtn);
      return row;
    });
    list.replaceChildren(...rows);
  };
  const confirmRow = (row, m, title) => {
    const ask = h('div', { class: 'notice notice--warn', role: 'alert' },
      h('p', null, 'This removes your photo and story from the garden. Withdraw it?'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'danger solid', onClick: async (e) => { e.target.disabled = true; try { await api('POST', '/withdraw', { token: m.token }); } catch (err) { ask.replaceChildren(h('p', null, err.message)); return; } render(); } }, 'Yes, withdraw'),
        h('button', { type: 'button', onClick: () => ask.remove() }, 'Keep it')));
    row.appendChild(ask);
    ask.querySelector('button').focus();
  };
  await render();
  startPolling(render, 8000);
}

// ---------------------------------------------------------------- add a recollection to an existing memory
async function respondView(errors = {}) {
  let snap;
  try { snap = await api('GET', '/snapshot'); } catch (err) { return errorView('Add a recollection', err.message); }
  state.info.locked = snap.session.locked;
  const m = snap.memories.find((x) => x.id === RESPOND_ID);
  if (!m) return errorView('This memory is not on display', 'It may have been removed, or it has not been approved yet.');
  const cat = CATEGORIES.find((c) => c.id === m.category);
  const text = h('textarea', { id: 'r-text', maxlength: 400, required: true, 'aria-invalid': errors.text ? 'true' : null, 'aria-describedby': 'e-text' }); text.value = state.respDraft?.text || '';
  const name = h('input', { type: 'text', id: 'r-name', maxlength: 40, autocomplete: 'off', value: state.respDraft?.name || '' });
  const consent = h('input', { type: 'checkbox', id: 'r-consent', checked: !!state.respDraft?.consent, 'aria-invalid': errors.consent ? 'true' : null, 'aria-describedby': 'e-rconsent' });
  const submit = h('button', { type: 'submit', class: 'primary', disabled: !!state.info.locked || state.uploading }, 'Send for approval');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    state.respDraft = { text: text.value, name: name.value, consent: consent.checked };
    const er = {};
    if (!text.value.trim()) er.text = 'Please write a short recollection.';
    if (!consent.checked) er.consent = 'Please tick the box to agree.';
    if (Object.keys(er).length) return respondView(er);
    state.uploading = true; submit.disabled = true;
    try {
      state.clientId = state.clientId || uuid();
      const r = await api('POST', `/memories/${RESPOND_ID}/responses`, { text: text.value.trim(), name: name.value.trim(), consent: true, clientId: state.clientId });
      state.uploading = false; state.respDraft = null; state.clientId = null;
      remember({ token: r.manageToken, kind: 'response', title: m.title, at: Date.now() });
      setView(header('Thank you!'), h('p', { class: 'notice notice--ok', role: 'status' }, h('strong', null, 'Your recollection is waiting for host approval.')),
        h('button', { type: 'button', class: 'primary', onClick: showMine }, 'See my contributions and withdraw'), h('button', { type: 'button', onClick: () => respondView() }, 'Back to the memory'));
    } catch (err) { state.uploading = false; respondView({ form: err.message }); }
  } },
    h('label', { for: 'r-text' }, 'What do you remember about this moment? ', h('span', { class: 'hint' }, '(required)')), text, errorLine('e-text', errors.text),
    h('label', { for: 'r-name' }, 'Your name ', h('span', { class: 'hint' }, '(optional)')), name,
    h('label', { class: 'check', for: 'r-consent' }, consent, h('span', null, 'I agree to show my recollection in this session.')), errorLine('e-rconsent', errors.consent),
    errors.form ? h('p', { class: 'notice notice--error', role: 'alert', tabindex: '-1', id: 'form-error' }, errors.form) : null,
    lockedBanner(), submit);
  setView(
    header('Add your recollection', cat ? cat.label : ''),
    h('div', { class: 'card' },
      h('img', { class: 'preview', src: `${API}/media/${m.id}/thumb`, alt: `Photograph titled ${m.title}` }),
      h('h2', null, m.title), h('p', { class: 'story' }, m.story),
      m.name ? h('p', { class: 'fine' }, `Shared by ${m.name}`) : null,
      m.responses.length ? h('div', null, h('h2', null, 'Other recollections'), m.responses.map((r) => h('div', { class: 'recollection' }, r.text, r.name ? h('div', { class: 'fine' }, `— ${r.name}`) : null))) : null),
    h('p', { class: 'notice notice--privacy' }, 'Your recollection will be shown beside the original story after host approval. It never replaces anyone else’s account.'),
    form, mineLink());
  if (errors.form) document.getElementById('form-error')?.focus();
}

// ---------------------------------------------------------------- polling
function startPolling(fn, every = 5000) {
  stopPolling();
  const tick = () => { if (!document.hidden) fn(); };
  state.timer = setInterval(tick, every);
}
function stopPolling() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

// ---------------------------------------------------------------- start
(async function start() {
  if (!JOIN) return errorView('Link not valid', 'This address is missing its garden code. Please scan the QR code again.');
  const m = /(?:^#|&)m=([A-Za-z0-9_-]{16,64})/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname); // keep the private token out of the address bar and history
    remember({ token: m[1], kind: 'memory', title: '', at: Date.now() });
  }
  try {
    state.info = await api('GET', '/info');
  } catch (err) {
    if (err.status === 410) return errorView(err.code === 'ended' ? 'This session has ended' : 'This session has expired', err.message);
    return errorView('We could not open the garden', err.message);
  }
  document.title = `${state.info.name} — add a memory`;
  if (m) return showMine();
  if (RESPOND_ID) return respondView();
  welcome();
})();
