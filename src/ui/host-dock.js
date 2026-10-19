// =============================================================================
//  host-dock.js — the host panel: join QR code, approval queue, garden list and session controls.
//  It is a side panel, NOT a modal: the host can keep walking around while it is open.
//  In the fictional demo the same panel explains the demo and lists the demo memories.
// =============================================================================
import { h, clear } from './dom.js';
import { AREAS, TEMP_STORAGE_NOTE, PRIVACY_NOTICE, DEMO_NEXT } from '../data/content.js';
import { drawQr } from '../qr.js';
import { openConfirm } from './screens.js';

const TABS_LIVE = [['invite', 'Invite'], ['queue', 'Approvals'], ['garden', 'Garden'], ['session', 'Session']];
const TABS_DEMO = [['invite', 'Demo'], ['garden', 'Garden']];

export function openBigQr(game, url, title = 'Scan to add a memory') {
  const ref = { current: null };
  const canvas = h('canvas', { class: 'qr qr--big', role: 'img', 'aria-label': `QR code for ${url}` });
  const content = h('div', { class: 'panel panel--qr' },
    h('h2', null, title),
    canvas,
    h('p', { class: 'qr__url' }, url),
    h('p', { class: 'fine' }, 'Phones must be on the same network as this computer.'),
    h('div', { class: 'row row--end' }, h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ref.current.close() }, 'Close')),
  );
  try { drawQr(canvas, url, { size: Math.min(560, Math.floor(window.innerHeight * 0.6)) }); } catch (err) { canvas.replaceWith(h('p', { class: 'banner banner--warn' }, 'The QR code could not be drawn. Type the address above into the phone instead.')); }
  ref.current = game.overlays.open(content, { id: 'bigqr', kind: 'modal', label: title });
  return ref.current;
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0;left:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); } finally { ta.remove(); }
  });
}

export function createDock(game) {
  const root = document.getElementById('dock');
  let tab = 'invite';
  let isOpen = false;
  let counts = { pendingMemories: 0, pendingResponses: 0, approved: 0, total: 0 };
  let linksData = null;
  let linksError = '';
  let queueData = null;
  let queueError = '';
  let managed = null;
  let paintToken = 0;

  const body = h('div', { class: 'dock__body' });
  const tablist = h('div', { class: 'dock__tabs', role: 'tablist', 'aria-label': 'Host panel sections' });
  const closeBtn = h('button', { type: 'button', class: 'btn btn--small', onClick: () => close(), 'aria-label': 'Close host panel (H)' }, 'Close');
  const title = h('h2', { class: 'dock__title' }, 'Host panel');
  const panel = h('aside', { class: 'dock', 'aria-label': 'Host panel' }, h('div', { class: 'dock__head' }, title, closeBtn), tablist, body);
  root.appendChild(panel);
  root.hidden = true;

  const tabs = () => (game.kind === 'live' ? TABS_LIVE : TABS_DEMO);
  const pending = () => counts.pendingMemories + counts.pendingResponses;

  function say(msg) { game.hud.toast(msg); game.announce(msg); }
  function fail(err) { game.hud.toast(err && err.message ? err.message : 'Something went wrong.', 6000); }

  /** Run an async action from a button: disable while busy, report errors, then repaint. */
  function act(btn, fn, okMsg) {
    return async () => {
      btn.disabled = true;
      try { await fn(); if (okMsg) say(okMsg); } catch (err) { fail(err); } finally { btn.disabled = false; }
    };
  }

  function paintTabs() {
    clear(tablist);
    for (const [id, label] of tabs()) {
      const n = id === 'queue' ? pending() : 0;
      const b = h('button', {
        type: 'button', role: 'tab', class: `dock__tab ${tab === id ? 'dock__tab--on' : ''}`, 'aria-selected': String(tab === id),
        onClick: () => select(id),
      }, label, n ? h('span', { class: 'count', 'aria-label': `${n} waiting` }, String(n)) : null);
      tablist.appendChild(b);
    }
  }

  function select(id) { tab = id; paint(); }

  // ---------------------------------------------------------------- INVITE tab
  async function loadLinks() {
    try { linksData = await game.live.links(); linksError = ''; } catch (err) { linksError = err.message; }
    if (isOpen && tab === 'invite') paint();
  }

  function paintInvite() {
    if (game.kind === 'demo') return paintDemo();
    if (!linksData && !linksError) { body.appendChild(h('p', null, 'Preparing the join link…')); loadLinks(); return; }
    if (linksError) { body.appendChild(h('p', { class: 'banner banner--warn', role: 'alert' }, linksError)); body.appendChild(h('button', { type: 'button', class: 'btn', onClick: () => { linksError = ''; paint(); } }, 'Try again')); return; }
    const L = linksData;
    const st = game.state.meta;
    const canvas = h('canvas', { class: 'qr', role: 'img', 'aria-label': `QR code that opens ${L.url}` });
    let qrOk = true;
    try { drawQr(canvas, L.url, { size: 300 }); } catch { qrOk = false; }
    const urlBox = h('input', { type: 'text', class: 'dock__url', readonly: true, value: L.url, 'aria-label': 'Join address for phones', onFocus: (e) => e.target.select() });
    const copy = h('button', { type: 'button', class: 'btn btn--small' }, 'Copy address');
    copy.addEventListener('click', () => copyText(L.url).then(() => say('Address copied.'), () => { urlBox.focus(); say('Select the address and copy it with Ctrl+C.'); }));

    body.append(
      st.ended ? h('p', { class: 'banner banner--warn', role: 'status' }, 'This session has ended. The join link no longer works.') : null,
      st.locked && !st.ended ? h('p', { class: 'banner banner--lock', role: 'status' }, 'New uploads are paused. The join link shows a polite “not accepting” message.') : null,
      h('p', { class: 'dock__lead' }, 'Scan with a phone camera to add a photograph and story.'),
      qrOk ? h('div', { class: 'qr-wrap' }, canvas) : h('p', { class: 'banner banner--warn' }, 'The QR code could not be drawn. Type the address below into the phone browser instead.'),
      h('div', { class: 'row row--wrap row--center' },
        h('button', { type: 'button', class: 'btn btn--small', onClick: () => openBigQr(game, L.url) }, 'Show large QR'),
        copy),
      h('label', { class: 'field' }, h('span', null, 'Or type this on the phone'), urlBox),
      L.isLocalhost ? h('div', { class: 'banner banner--warn', role: 'alert' },
        h('strong', null, 'This address will not work on a phone. '),
        '“localhost” means “this device”, so a phone would look for the garden on itself. Choose this computer’s network address below, or type it in.') : null,
      addressControls(L),
      h('details', { class: 'dock__help' },
        h('summary', null, 'The phone cannot connect?'),
        h('ul', null,
          h('li', null, 'Is the phone on the same Wi-Fi as this laptop? A mobile-data connection cannot reach it.'),
          h('li', null, 'Some campus, hotel and guest Wi-Fi networks isolate devices from each other. Use your phone’s hotspot for the laptop, or a private router.'),
          h('li', null, 'Allow the garden server (Node.js) through the laptop firewall for private networks only, on this port. Do not turn the firewall off.'),
          h('li', null, 'Several network cards? Try the other addresses above.'))),
      h('p', { class: 'fine' }, PRIVACY_NOTICE),
      h('p', { class: 'fine' }, TEMP_STORAGE_NOTE),
    );
  }

  function addressControls(L) {
    const input = h('input', { type: 'text', id: 'dock-addr', placeholder: '192.168.1.20 or 192.168.1.20:3000', 'aria-describedby': 'dock-addr-hint', autocomplete: 'off', spellcheck: 'false' });
    const apply = h('button', { type: 'button', class: 'btn btn--small' }, 'Use this address');
    apply.addEventListener('click', act(apply, async () => { linksData = await game.live.setAdvertised(input.value.trim()); paint(); }, 'Join address updated.'));
    const auto = h('button', { type: 'button', class: 'btn btn--small btn--quiet' }, 'Back to automatic');
    auto.addEventListener('click', act(auto, async () => { linksData = await game.live.setAdvertised(''); paint(); }, 'Using the automatic address.'));
    return h('details', { class: 'dock__help', open: L.isLocalhost },
      h('summary', null, 'Change the address phones will use'),
      L.candidates.length ? h('div', { class: 'row row--wrap' }, L.candidates.map((c) => {
        const b = h('button', { type: 'button', class: 'btn btn--small' }, `${c.url.replace('http://', '')} (${c.label})`);
        b.addEventListener('click', act(b, async () => { linksData = await game.live.setAdvertised(new URL(c.url).host); paint(); }, 'Join address updated.'));
        return b;
      })) : h('p', { class: 'fine' }, 'No network address was found automatically. Type this computer’s address, or connect to Wi-Fi first.'),
      h('label', { class: 'field', for: 'dock-addr' }, h('span', null, 'Type an address')),
      h('div', { class: 'row' }, input, apply),
      h('p', { class: 'fine', id: 'dock-addr-hint' }, 'Only the address phones are sent to changes. The server itself keeps listening as before.'),
      L.automatic ? null : auto);
  }

  // ---------------------------------------------------------------- DEMO tab
  function paintDemo() {
    const left = DEMO_NEXT.filter((m) => !game.state.get(m.id));
    body.append(
      h('p', { class: 'banner banner--demo' }, 'You are in the fictional demo. Nothing here is real, nothing is uploaded, and no server is involved.'),
      h('p', null, 'The three memories in the garden are made up and drawn in code. Click a plant to open it, or use the Garden tab.'),
      h('p', null, 'The gathering place appears when the garden holds an everyday memory, a celebration and a place. The button below plants the missing fictional memory so you can see it grow.'),
      left.length ? h('button', { type: 'button', class: 'btn btn--primary', onClick: () => game.plantNextDemo() }, 'Plant the next fictional memory') : h('p', { class: 'fine' }, 'All fictional memories are planted.'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: () => game.resetDemo() }, 'Reset the demo'),
        h('button', { type: 'button', class: 'btn btn--quiet', onClick: () => game.returnToTitle() }, 'Leave the demo')),
    );
  }

  // ---------------------------------------------------------------- APPROVALS tab
  async function loadQueue() {
    try { queueData = await game.live.queue(); queueError = ''; } catch (err) { queueError = err.message; }
    if (isOpen && tab === 'queue') paint();
  }

  function preview(id, alt) {
    const img = h('img', { class: 'qitem__img', alt, width: 160, height: 120 });
    game.live.hostImageUrl(id, 'thumb').then((u) => { img.src = u; }, () => { img.alt = 'Photo not available'; });
    return img;
  }

  function paintQueue() {
    if (queueError) { body.appendChild(h('p', { class: 'banner banner--warn', role: 'alert' }, queueError)); body.appendChild(h('button', { type: 'button', class: 'btn', onClick: () => { queueError = ''; queueData = null; paint(); } }, 'Try again')); return; }
    if (!queueData) { body.appendChild(h('p', null, 'Loading the queue…')); loadQueue(); return; }
    const { memories, responses } = queueData;
    if (!memories.length && !responses.length) {
      body.appendChild(h('p', { class: 'empty' }, 'Nothing is waiting. When someone sends a photo, it appears here. Nothing reaches the garden until you approve it.'));
      return;
    }
    body.appendChild(h('p', { class: 'fine' }, 'Check each photo and story before approving. Approved items become visible to everyone who is viewing this session.'));
    for (const m of memories) {
      const approve = h('button', { type: 'button', class: 'btn btn--primary btn--small' }, 'Approve and plant');
      approve.addEventListener('click', act(approve, async () => { await game.live.approveMemory(m.id); await loadQueue(); }, `“${m.title}” was planted.`));
      const hide = h('button', { type: 'button', class: 'btn btn--small' }, 'Do not display');
      hide.addEventListener('click', act(hide, async () => { await game.live.hideMemory(m.id); await loadQueue(); }, 'Kept out of the garden.'));
      const del = h('button', { type: 'button', class: 'btn btn--small btn--danger' }, 'Delete');
      del.addEventListener('click', () => openConfirm(game, {
        title: 'Delete this submission?', body: `“${m.title}” and its photograph will be deleted from the server now. This cannot be undone.`, confirmLabel: 'Delete', danger: true,
        onConfirm: act(del, async () => { await game.live.deleteMemory(m.id); game.live.forgetBlob(m.id); await loadQueue(); }, 'Deleted.'),
      }));
      body.appendChild(h('article', { class: 'qitem', 'aria-label': `Waiting: ${m.title}` },
        preview(m.id, `Photograph submitted with the title “${m.title}”`),
        h('div', { class: 'qitem__text' },
          h('h3', null, m.title),
          h('p', { class: 'fine' }, `${AREAS[m.category] ? AREAS[m.category].label : m.category} · ${m.yearUnknown || !m.year ? 'date uncertain' : m.year} · ${m.name ? `shared by ${m.name}` : 'no name given'}`),
          h('p', { class: 'qitem__story' }, m.story),
          h('div', { class: 'row row--wrap' }, approve, hide, del))));
    }
    for (const r of responses) {
      const approve = h('button', { type: 'button', class: 'btn btn--primary btn--small' }, 'Approve');
      approve.addEventListener('click', act(approve, async () => { await game.live.approveResponse(r.id); await loadQueue(); }, 'Recollection added as a leaf.'));
      const hide = h('button', { type: 'button', class: 'btn btn--small' }, 'Do not display');
      hide.addEventListener('click', act(hide, async () => { await game.live.hideResponse(r.id); await loadQueue(); }, 'Kept out of the garden.'));
      const del = h('button', { type: 'button', class: 'btn btn--small btn--danger' }, 'Delete');
      del.addEventListener('click', act(del, async () => { await game.live.deleteResponse(r.id); await loadQueue(); }, 'Deleted.'));
      body.appendChild(h('article', { class: 'qitem qitem--response', 'aria-label': `Recollection waiting on ${r.memoryTitle}` },
        h('div', { class: 'qitem__text' },
          h('h3', null, `Recollection on “${r.memoryTitle || 'a memory'}”`),
          h('p', { class: 'fine' }, r.name ? `from ${r.name}` : 'no name given'),
          h('blockquote', { class: 'qitem__story' }, r.text),
          h('div', { class: 'row row--wrap' }, approve, hide, del))));
    }
  }

  // ---------------------------------------------------------------- GARDEN tab
  async function loadManaged() {
    try { managed = (await game.live.managed()).memories; } catch { managed = []; }
    if (isOpen && tab === 'garden') paint();
  }

  function paintGarden() {
    const list = game.state.list;
    if (!list.length) body.appendChild(h('p', { class: 'empty' }, game.kind === 'live' ? 'The garden is empty. Approve a photograph from the Approvals tab and it grows here.' : 'The garden is empty.'));
    else {
      body.appendChild(h('p', { class: 'fine' }, `${list.length} memor${list.length === 1 ? 'y' : 'ies'} in the garden.`));
      const ul = h('ul', { class: 'mlist' });
      for (const m of list) {
        const open = h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.openMemory(m.id) }, 'Open');
        const walk = h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.focusMemory(m.id) }, 'Walk there');
        const row = h('li', { class: 'mlist__row' },
          h('div', { class: 'mlist__text' }, h('strong', null, m.title), h('span', { class: 'fine' }, `${AREAS[m.category].label}${m.responses.length ? ` · ${m.responses.length} recollection${m.responses.length === 1 ? '' : 's'}` : ''}`)),
          h('div', { class: 'row row--wrap' }, open, walk));
        if (game.kind === 'live') {
          const hide = h('button', { type: 'button', class: 'btn btn--small' }, 'Do not display');
          hide.addEventListener('click', act(hide, async () => { await game.live.hideMemory(m.id); managed = null; }, 'Removed from display. It is kept on the server until you delete it or the session ends.'));
          const del = h('button', { type: 'button', class: 'btn btn--small btn--danger' }, 'Delete');
          del.addEventListener('click', () => confirmDelete(m, del));
          row.lastChild.append(hide, del);
        }
        ul.appendChild(row);
      }
      body.appendChild(ul);
    }
    if (game.kind === 'live') {
      if (managed === null) { loadManaged(); return; }
      const hidden = managed.filter((m) => m.status === 'hidden');
      if (hidden.length) {
        body.appendChild(h('h3', null, 'Not displayed'));
        body.appendChild(h('p', { class: 'fine' }, 'These are not visible in the garden or to phones, but are still stored until you delete them.'));
        const ul = h('ul', { class: 'mlist' });
        for (const m of hidden) {
          const show = h('button', { type: 'button', class: 'btn btn--small' }, 'Display again');
          show.addEventListener('click', act(show, async () => { await game.live.approveMemory(m.id); managed = null; }, 'Planted again.'));
          const del = h('button', { type: 'button', class: 'btn btn--small btn--danger' }, 'Delete');
          del.addEventListener('click', () => confirmDelete(m, del));
          ul.appendChild(h('li', { class: 'mlist__row' }, h('div', { class: 'mlist__text' }, h('strong', null, m.title), h('span', { class: 'fine' }, AREAS[m.category].label)), h('div', { class: 'row row--wrap' }, show, del)));
        }
        body.appendChild(ul);
      }
    }
  }

  function confirmDelete(m, btn) {
    openConfirm(game, {
      title: 'Delete this memory?',
      body: `“${m.title}”, its story, its recollections and its photograph will be deleted from the server now. Screenshots or copies that someone already made cannot be deleted by this program.`,
      confirmLabel: 'Delete', danger: true,
      onConfirm: act(btn, async () => { await game.live.deleteMemory(m.id); game.live.forgetBlob(m.id); managed = null; }, 'Deleted. The plant is gone from the garden.'),
    });
  }

  // ---------------------------------------------------------------- SESSION tab
  function remaining(ms) {
    const mins = Math.max(0, Math.round((ms - Date.now()) / 60000));
    if (mins >= 90) return `${Math.round(mins / 60)} hours`;
    if (mins >= 60) return '1 hour';
    return `${mins} minute${mins === 1 ? '' : 's'}`;
  }

  function paintSession() {
    const info = game.live.info || {};
    const st = game.state.meta;
    const lock = h('button', { type: 'button', class: 'btn btn--toggle', 'aria-pressed': String(!!st.locked) }, st.locked ? 'Uploads paused — resume' : 'Pause new uploads');
    lock.addEventListener('click', act(lock, async () => { await game.live.setLocked(!st.locked); paint(); }, st.locked ? 'Uploads resumed.' : 'New uploads and recollections are paused.'));
    const end = h('button', { type: 'button', class: 'btn btn--danger' }, 'End the session');
    end.addEventListener('click', () => openConfirm(game, {
      title: 'End this session?', body: 'The join link stops working straight away. The garden stays on this screen and everything remains stored until the session expires or you delete it.', confirmLabel: 'End session', danger: true,
      onConfirm: act(end, async () => { await game.live.end(); paint(); }, 'Session ended.'),
    }));
    const wipe = h('button', { type: 'button', class: 'btn btn--danger' }, 'Delete all session data');
    wipe.addEventListener('click', () => openConfirm(game, {
      title: 'Delete everything?', body: 'Every photograph, story and recollection in this session is deleted from the server now, and the join link stops working. This cannot be undone.', confirmLabel: 'Delete everything', danger: true,
      onConfirm: async () => { try { await game.live.deleteSession(); game.afterSessionDeleted(); } catch (err) { fail(err); } },
    }));
    body.append(
      h('dl', { class: 'facts' },
        h('dt', null, 'Session'), h('dd', null, st.name || info.name || 'Our Memory Garden'),
        h('dt', null, 'Connection'), h('dd', null, game.connectionLabel()),
        h('dt', null, 'In the garden'), h('dd', null, `${counts.approved} memor${counts.approved === 1 ? 'y' : 'ies'}`),
        h('dt', null, 'Waiting'), h('dd', null, `${pending()}`),
        h('dt', null, 'Expires'), h('dd', null, info.expiresAt ? `in about ${remaining(info.expiresAt)}, then everything is deleted automatically` : '—')),
      h('div', { class: 'stack' }, lock, end, wipe),
      h('h3', null, 'What is kept'),
      h('ul', null,
        h('li', null, 'Only resized copies of approved and waiting photographs are stored, with camera and location information removed. Originals are never kept.'),
        h('li', null, 'Deleting a memory removes its stored files and text. It cannot remove copies other people already made.'),
        h('li', null, TEMP_STORAGE_NOTE)),
    );
  }

  // ---------------------------------------------------------------- paint / open / close
  function paint() {
    paintTabs();
    title.textContent = game.kind === 'live' ? 'Host panel' : 'Demo panel';
    const savedScroll = body.scrollTop;
    clear(body);
    if (!tabs().some(([id]) => id === tab)) tab = tabs()[0][0];
    if (tab === 'invite') paintInvite();
    else if (tab === 'queue') paintQueue();
    else if (tab === 'garden') paintGarden();
    else if (tab === 'session') paintSession();
    body.scrollTop = savedScroll;
    tablist.setAttribute('aria-label', 'Host panel sections');
  }

  function open(which) {
    if (which && tabs().some(([id]) => id === which)) tab = which;
    isOpen = true;
    root.hidden = false;
    paint();
    if (game.kind === 'live') { if (tab === 'queue') loadQueue(); if (tab === 'garden') { managed = null; } }
    game.hud.refresh();
  }
  function close() {
    isOpen = false;
    root.hidden = true;
    game.hud.refresh();
    const c = document.getElementById('game');
    if (c) c.focus({ preventScroll: true });
  }

  return {
    get isOpen() { return isOpen; },
    open, close,
    toggle: (force) => { if (force === true || (force === undefined && !isOpen)) open(); else close(); },
    get pending() { return pending(); },
    setCounts(c) {
      const before = pending();
      counts = { pendingMemories: c.pendingMemories || 0, pendingResponses: c.pendingResponses || 0, approved: c.approved || 0, total: c.total || 0 };
      if (isOpen) {
        paintTabs();
        if (tab === 'queue') loadQueue();
        else if (tab === 'session') { clear(body); paintSession(); }
      }
      return { before, after: pending() };
    },
    /** Called when the garden's memories change (live event or demo action). */
    onGardenChanged() { if (isOpen && tab === 'garden') { managed = null; paint(); } },
    onMetaChanged() { if (isOpen) { if (tab === 'session' || tab === 'invite') paint(); } },
    reset() { linksData = null; linksError = ''; queueData = null; queueError = ''; managed = null; counts = { pendingMemories: 0, pendingResponses: 0, approved: 0, total: 0 }; tab = 'invite'; isOpen = false; root.hidden = true; paintToken++; },
    refreshLinks() { linksData = null; if (isOpen && tab === 'invite') paint(); },
  };
}
