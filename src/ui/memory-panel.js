// =============================================================================
//  memory-panel.js — opens one memory: the real photograph, title, story, recollections, a form to
//  add a recollection, a QR code so other people can add theirs from their phones, and conversation prompts.
//  All text is inserted as text (never HTML), so nothing a contributor typed can inject markup.
// =============================================================================
import { h } from './dom.js';
import { AREAS, CONVERSATION_PROMPTS, RECOLLECTION_PROMPT, PRIVACY_NOTICE } from '../data/content.js';
import { illustrationElement } from '../art/illustrations.js';
import { drawQr } from '../qr.js';
import { openConfirm } from './screens.js';
import { copyText, openBigQr } from './host-dock.js';

export function openMemoryPanel(game, memoryId) {
  const first = game.state.get(memoryId);
  if (!first) return null;
  const ref = { current: null };
  const root = h('div', { class: 'panel panel--memory' });
  let qrBox = null;       // the "others can add theirs" area, kept across repaints
  let qrState = 'idle';   // idle | loading | ready | error
  let qrData = null;
  let qrError = '';
  let draft = { text: '', name: '', consent: false, error: '' };
  let sending = false;

  function photo(m) {
    const frame = h('figure', { class: 'mem__photo' });
    if (m.fictional && m.illus) {
      frame.appendChild(illustrationElement(m.illus, { w: 640, h: 427, className: 'mem__img' }));
    } else {
      const img = h('img', { class: 'mem__img', alt: `Photograph: ${m.title}`, width: m.width || 4, height: m.height || 3 });
      img.addEventListener('error', () => { img.replaceWith(h('div', { class: 'mem__missing', role: 'img', 'aria-label': 'Photograph unavailable' }, 'Photograph unavailable')); });
      img.src = game.live.publicImageUrl(m.id, 'display');
      frame.appendChild(img);
    }
    return frame;
  }

  function related(m) {
    const others = game.state.list.filter((x) => x.id !== m.id && x.category === m.category);
    if (!others.length) return null;
    return h('div', { class: 'mem__related' },
      h('h3', null, `More in ${AREAS[m.category].label}`),
      h('div', { class: 'row row--wrap' }, others.slice(0, 6).map((o) => h('button', { type: 'button', class: 'btn btn--small', onClick: () => { ref.current.close(); game.openMemory(o.id); } }, o.title))));
  }

  function recollections(m) {
    const live = game.kind === 'live';
    return h('section', { class: 'mem__resp', 'aria-label': 'Recollections' },
      h('h3', null, m.responses.length ? `Recollections (${m.responses.length})` : 'Recollections'),
      m.responses.length ? h('ul', { class: 'resp' }, m.responses.map((r) => {
        const del = live ? h('button', { type: 'button', class: 'btn btn--small btn--danger', 'aria-label': `Remove the recollection from ${r.name || 'a contributor'}` }, 'Remove') : null;
        if (del) del.addEventListener('click', () => openConfirm(game, {
          title: 'Remove this recollection?', body: 'It is deleted from the server now and its leaf disappears from the plant.', confirmLabel: 'Remove', danger: true,
          onConfirm: async () => { try { await game.live.deleteResponse(r.id); game.hud.toast('Recollection removed.'); } catch (err) { game.hud.toast(err.message, 6000); } },
        }));
        return h('li', { class: 'resp__item' }, h('blockquote', null, r.text), h('p', { class: 'fine' }, `— ${r.name || 'a contributor'}`), del);
      })) : h('p', { class: 'fine' }, 'No one has added a recollection yet. Others may remember this moment differently, and both versions belong here.'));
  }

  function form(m) {
    const st = game.state.meta;
    if (game.kind === 'live' && (st.locked || st.ended)) {
      return h('p', { class: 'banner banner--lock' }, st.ended ? 'This session has ended, so recollections can no longer be added.' : 'New recollections are paused by the host.');
    }
    const text = h('textarea', { id: 'resp-text', rows: 4, maxlength: 400, 'aria-describedby': 'resp-hint resp-err' });
    text.value = draft.text;
    const name = h('input', { type: 'text', id: 'resp-name', maxlength: 40, autocomplete: 'off', placeholder: 'Optional', value: draft.name });
    const consent = h('input', { type: 'checkbox', id: 'resp-consent' });
    consent.checked = draft.consent;
    const err = h('p', { class: 'error', id: 'resp-err', role: 'alert', hidden: !draft.error }, draft.error);
    const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, game.kind === 'live' ? 'Send for approval' : 'Add to the demo plant');
    text.addEventListener('input', () => { draft.text = text.value; });
    name.addEventListener('input', () => { draft.name = name.value; });
    consent.addEventListener('change', () => { draft.consent = consent.checked; });
    const f = h('form', { class: 'kform', novalidate: true, 'aria-label': 'Add your recollection' },
      h('h3', null, 'Add your recollection'),
      h('div', { class: `field ${draft.error ? 'field--error' : ''}` },
        h('label', { for: 'resp-text' }, RECOLLECTION_PROMPT),
        text,
        h('span', { class: 'hint', id: 'resp-hint' }, 'A few sentences are plenty. Up to 400 characters.'),
        err),
      h('div', { class: 'field' }, h('label', { for: 'resp-name' }, 'Your name ', h('span', { class: 'optional' }, '(optional)')), name),
      h('label', { class: 'check check--wrap' }, consent, h('span', null, game.kind === 'live' ? `${PRIVACY_NOTICE} It also waits for the host’s approval first.` : 'I understand this is only a demonstration; nothing is saved or shared.')),
      h('div', { class: 'row' }, submit),
    );
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      const t = text.value.trim();
      if (!t) { draft.error = 'Please write a short recollection first.'; paint(); document.getElementById('resp-text')?.focus(); return; }
      if (!consent.checked) { draft.error = 'Please tick the box to confirm you are happy for this to be shown.'; paint(); document.getElementById('resp-text')?.focus(); return; }
      sending = true; submit.disabled = true;
      try {
        await game.addRecollection(m.id, { name: name.value.trim(), text: t });
        draft = { text: '', name: draft.name, consent: false, error: '' };
      } catch (er) { draft.error = er.message || 'That could not be sent.'; }
      sending = false;
      paint();
    });
    return f;
  }

  async function loadQr() {
    qrState = 'loading'; paint();
    try { qrData = await game.live.respondLink(memoryId); qrState = 'ready'; } catch (err) { qrError = err.message; qrState = 'error'; }
    paint();
  }

  function inviteBlock() {
    if (game.kind !== 'live') return null;
    const st = game.state.meta;
    if (st.locked || st.ended) return null;
    if (qrState === 'idle') return h('div', { class: 'mem__invite' }, h('button', { type: 'button', class: 'btn', onClick: loadQr }, 'Let others add theirs from a phone (QR)'));
    if (qrState === 'loading') return h('p', { class: 'fine' }, 'Preparing the QR code…');
    if (qrState === 'error') return h('p', { class: 'banner banner--warn', role: 'alert' }, qrError);
    const canvas = h('canvas', { class: 'qr qr--small', role: 'img', 'aria-label': `QR code that lets a phone add a recollection to ${first.title}` });
    let ok = true;
    try { drawQr(canvas, qrData.url, { size: 220 }); } catch { ok = false; }
    return h('div', { class: 'mem__invite' },
      ok ? canvas : null,
      h('div', null,
        h('p', null, 'Scan to add a recollection to this memory. It appears here after you approve it.'),
        h('p', { class: 'fine qr__url' }, qrData.url),
        qrData.isLocalhost ? h('p', { class: 'banner banner--warn' }, 'This address only works on this computer. Set the phone address in the host panel first.') : null,
        h('div', { class: 'row row--wrap' },
          h('button', { type: 'button', class: 'btn btn--small', onClick: () => openBigQr(game, qrData.url, 'Add a recollection') }, 'Large QR'),
          h('button', { type: 'button', class: 'btn btn--small', onClick: () => copyText(qrData.url).then(() => game.hud.toast('Address copied.'), () => game.hud.toast('Select the address and copy it.')) }, 'Copy address'))));
  }

  function paint() {
    const m = game.state.get(memoryId);
    if (!m) { if (ref.current) ref.current.close(); return; }
    const area = AREAS[m.category];
    const savedScroll = root.scrollTop;
    const focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : '';
    const isLive = game.kind === 'live';
    const hostRow = isLive ? h('div', { class: 'row row--wrap mem__host' },
      h('span', { class: 'fine' }, 'Host:'),
      h('button', { type: 'button', class: 'btn btn--small', onClick: () => openConfirm(game, { title: 'Stop displaying this memory?', body: `“${m.title}” disappears from the garden and from phones. It stays stored (see “Not displayed” in the host panel) until you delete it.`, confirmLabel: 'Do not display', onConfirm: async () => { try { await game.live.hideMemory(m.id); } catch (err) { game.hud.toast(err.message, 6000); } } }) }, 'Do not display'),
      h('button', { type: 'button', class: 'btn btn--small btn--danger', onClick: () => openConfirm(game, { title: 'Delete this memory?', body: `“${m.title}”, its recollections and its photograph are deleted from the server now. Copies others already made cannot be deleted.`, confirmLabel: 'Delete', danger: true, onConfirm: async () => { try { await game.live.deleteMemory(m.id); game.live.forgetBlob(m.id); } catch (err) { game.hud.toast(err.message, 6000); } } }) }, 'Delete')) : null;

    root.replaceChildren(
      h('div', { class: 'mem__top' },
        h('span', { class: 'chip chip--area', style: `border-color:${area.accentCss}` }, area.label),
        m.fictional ? h('span', { class: 'chip chip--fiction' }, 'Fictional example') : null,
        h('button', { type: 'button', class: 'btn btn--small', onClick: () => ref.current.close() }, 'Close')),
      h('div', { class: 'mem__grid' },
        photo(m),
        h('div', { class: 'mem__text' },
          h('h2', { class: 'mem__title' }, m.title),
          h('p', { class: 'fine' }, `${m.yearUnknown || !m.year ? 'Date uncertain' : `About ${m.year}`} · ${m.name ? `Shared by ${m.name}` : 'Shared by a contributor'}`),
          h('p', { class: 'mem__story' }, m.story),
          h('div', { class: 'row row--wrap' },
            h('button', { type: 'button', class: 'btn btn--small', onClick: () => { ref.current.close(); game.focusMemory(m.id); } }, 'Walk to this plant'),
            h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.toggleDock(true, 'garden') }, 'All memories')),
          hostRow)),
      recollections(m),
      form(m),
      inviteBlock(),
      h('details', { class: 'mem__prompts' },
        h('summary', null, 'Conversation prompts to try together'),
        h('ul', null, CONVERSATION_PROMPTS.map((p) => h('li', null, p)))),
      related(m),
    );
    root.scrollTop = savedScroll;
    if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
  }

  paint();
  ref.current = game.overlays.open(root, {
    id: 'memory', kind: 'modal', label: `Memory: ${first.title}`,
    initialFocus: root.querySelector('.btn'),
    onClose: () => { if (game.memoryView && game.memoryView.id === memoryId) game.memoryView = null; },
  });
  return { id: memoryId, refresh: paint, close: () => ref.current.close() };
}
