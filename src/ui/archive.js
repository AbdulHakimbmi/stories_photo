// =============================================================================
//  archive.js — the memory board (public) + demo restricted list + contribution kiosk.
//  Public, restricted and draft records come from three separate selectors in logic.js,
//  so a family-only or private record can never appear in the public tab.
// =============================================================================
import { h, clear } from './dom.js';
import { recordView } from './record-view.js';
import { AUDIENCES, AUDIENCE_IDS, SAMPLE_ILLUS } from '../data/content.js';
import { publicRecords, restrictedRecords, canContribute, docCount, MAX_CONTRIBUTIONS } from '../state/logic.js';
import { illustrationElement } from '../art/illustrations.js';

const TABS = [
  { id: 'board', label: 'Public board' },
  { id: 'restricted', label: 'Restricted records (demo)' },
  { id: 'contribute', label: 'Contribute a memory' },
];

export function openArchive(game, { tab = 'board' } = {}) {
  const ref = { current: null };
  const root = h('div', { class: 'panel panel--archive' });
  let current = tab;
  let selectedRecord = null;      // record id being read
  let confirmation = null;        // {record}
  let errors = {};
  let form = { illus: '', title: '', story: '', year: '', yearUnknown: false, people: '', audience: '' };
  const unsub = game.store.subscribe(() => { if (game.overlays.has('archive')) render(); });

  const cardOf = (rec, onOpen, locked = false) => h('li', null,
    h('button', { type: 'button', class: `card ${locked ? 'card--locked' : ''}`, dataset: { key: `rec-${rec.id}` }, onClick: onOpen },
      illustrationElement(rec.illus, { w: 240, h: 160, className: 'illus illus--card' }),
      h('span', { class: 'card__title' }, locked ? `🔒 ${rec.title}` : rec.title),
      h('span', { class: 'card__meta' }, rec.contributors),
      h('span', { class: 'card__meta' }, rec.dateLabel),
    ));

  // ---------------------------------------------------------------- board tab
  function boardTab(p) {
    if (selectedRecord) {
      const rec = publicRecords(p).find((r) => r.id === selectedRecord);
      if (rec) return h('div', null, backButton(), recordView(rec, { headingLevel: 3 }));
      selectedRecord = null;
    }
    const recs = publicRecords(p);
    return h('div', null,
      h('p', { class: 'banner' }, 'Public records only. Anyone in the neighbourhood could read these. Family-only and private records are never shown here or on the wall board.'),
      recs.length
        ? h('ul', { class: 'cards' }, recs.map((r) => cardOf(r, () => { selectedRecord = r.id; render(); })))
        : h('p', { class: 'empty' }, 'Nothing is public yet. Document a story and choose the public archive to see it appear here and on the wall.'),
    );
  }

  // ---------------------------------------------------------------- restricted tab
  function restrictedTab(p) {
    const banner = 'Demo only: in the proposed service, only relatives chosen by the contributor could open these. Here they are listed so you can see that they are kept apart from the public board.';
    if (selectedRecord) {
      const rec = restrictedRecords(p).find((r) => r.id === selectedRecord);
      if (rec) return h('div', null, backButton(), recordView(rec, { headingLevel: 3, banner }));
      selectedRecord = null;
    }
    const recs = restrictedRecords(p);
    return h('div', null,
      h('p', { class: 'banner banner--lock' }, '🔒 ', banner),
      recs.length
        ? h('ul', { class: 'cards' }, recs.map((r) => cardOf(r, () => { selectedRecord = r.id; render(); }, true)))
        : h('p', { class: 'empty' }, 'No family-only records yet. Auntie Salmah’s memory will appear here once it is saved, and any sample you contribute as family-only.'),
    );
  }

  function backButton() {
    return h('button', { type: 'button', class: 'btn btn--small', dataset: { key: 'back' }, onClick: () => { selectedRecord = null; render(); } }, '← Back to the list');
  }

  // ---------------------------------------------------------------- contribute tab
  function contributeTab(p) {
    if (!canContribute(p)) {
      return h('div', null,
        h('p', { class: 'banner banner--lock' }, `The kiosk opens once three stories are documented. Stories documented: ${docCount(p)} of 3.`),
        h('p', null, 'Keep exploring: talk to the residents, document their stories in your journal (J), and come back.'),
      );
    }
    if (confirmation) return confirmationView(confirmation.record);
    return formView(p);
  }

  function confirmationView(rec) {
    const where = {
      public: { where: 'the public memory board', text: `“${rec.title}” is now on the public memory board in the void deck. Anyone in the neighbourhood could read it.`, tab: 'board' },
      family: { where: 'the demo restricted-record list', text: `“${rec.title}” was saved as family-only. It appears only in the demo restricted-record list. It is not on the public board.`, tab: 'restricted' },
      draft: { where: 'your journal as a private draft', text: `“${rec.title}” was kept as a private draft in your journal. It is not on the public board and not in the restricted list.`, tab: null },
    }[rec.sharing];
    return h('div', { class: 'confirm' },
      h('h3', { tabindex: '-1', dataset: { key: 'confirm-title' } }, '✓ Memory added (demo)'),
      h('p', { class: 'banner banner--ok', role: 'status' }, where.text),
      h('p', { class: 'fine' }, 'Reminder: audience settings simulate how the proposed service would work. Nothing was uploaded or sent anywhere. This is stored only in this browser for the demo.'),
      h('div', { class: 'row row--wrap' },
        where.tab ? h('button', { type: 'button', class: 'btn btn--primary', onClick: () => { confirmation = null; current = where.tab; selectedRecord = rec.id; render(); } }, `See it in ${where.where}`) : h('button', { type: 'button', class: 'btn btn--primary', onClick: () => { ref.current.close(); game.openJournal({ select: rec.id }); } }, 'Open it in the journal'),
        h('button', { type: 'button', class: 'btn', onClick: () => { confirmation = null; form = { illus: '', title: '', story: '', year: '', yearUnknown: false, people: '', audience: '' }; render(); } }, 'Add another'),
        h('button', { type: 'button', class: 'btn', onClick: () => ref.current.close() }, 'Back to the neighbourhood'),
      ),
      h('p', { class: 'fine' }, 'When you are ready, return to Aisha to wrap up the session.'),
    );
  }

  function field(id, labelText, control, { hint = null, optional = false } = {}) {
    return h('div', { class: `field ${errors[id] ? 'field--error' : ''}` },
      h('label', { for: `f-${id}` }, labelText, optional ? h('span', { class: 'optional' }, ' (optional)') : null),
      hint ? h('span', { class: 'hint', id: `h-${id}` }, hint) : null,
      control,
      errors[id] ? h('span', { class: 'error', id: `e-${id}`, role: 'alert' }, errors[id]) : null,
    );
  }

  function formView(p) {
    const full = p.contributions.length >= MAX_CONTRIBUTIONS;
    const err = (id) => (errors[id] ? { 'aria-invalid': 'true', 'aria-describedby': `e-${id}` } : {});
    const title = h('input', { id: 'f-title', type: 'text', maxlength: '60', autocomplete: 'off', value: form.title, ...err('title'), onInput: (e) => { form.title = e.target.value; } });
    const story = h('textarea', { id: 'f-story', rows: '4', maxlength: '400', value: form.story, ...err('story'), onInput: (e) => { form.story = e.target.value; counter.textContent = `${e.target.value.length} / 400`; } });
    const counter = h('span', { class: 'hint' }, `${form.story.length} / 400`);
    const year = h('input', { id: 'f-year', type: 'text', maxlength: '24', autocomplete: 'off', placeholder: 'for example: around 1995', value: form.year, disabled: form.yearUnknown, ...err('year'), onInput: (e) => { form.year = e.target.value; } });
    const unknown = h('input', { id: 'f-yearUnknown', type: 'checkbox', checked: form.yearUnknown, onChange: (e) => { form.yearUnknown = e.target.checked; year.disabled = form.yearUnknown; if (form.yearUnknown) { year.value = ''; form.year = ''; } } });
    const people = h('input', { id: 'f-people', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'first names or “my cousins”', value: form.people, ...err('people'), onInput: (e) => { form.people = e.target.value; } });

    const illusSet = h('fieldset', { class: `field fieldset ${errors.illus ? 'field--error' : ''}` },
      h('legend', null, 'Choose a sample illustration'),
      h('p', { class: 'hint' }, 'No photo upload is needed in this prototype.'),
      h('div', { class: 'thumbs' }, SAMPLE_ILLUS.map((s) => h('label', { class: 'thumb' },
        h('input', { type: 'radio', name: 'illus', value: s.key, checked: form.illus === s.key, onChange: () => { form.illus = s.key; } }),
        illustrationElement(s.key, { w: 200, h: 133, className: 'illus illus--thumb' }),
        h('span', null, s.label),
      ))),
      errors.illus ? h('span', { class: 'error', role: 'alert' }, errors.illus) : null,
    );

    const audSet = h('fieldset', { class: `field fieldset ${errors.audience ? 'field--error' : ''}` },
      h('legend', null, 'Who can see this memory?'),
      h('div', { class: 'aud' }, AUDIENCE_IDS.map((a) => h('label', { class: 'aud__opt' },
        h('input', { type: 'radio', name: 'audience', value: a, checked: form.audience === a, onChange: () => { form.audience = a; } }),
        h('span', null, h('strong', null, AUDIENCES[a].label), h('span', { class: 'hint' }, AUDIENCES[a].help)),
      ))),
      errors.audience ? h('span', { class: 'error', role: 'alert' }, errors.audience) : null,
    );

    const formEl = h('form', { class: 'kform', novalidate: true, onSubmit: (e) => {
      e.preventDefault();
      const r = game.actions.submitContribution(form);
      if (r.ok) {
        confirmation = { record: r.record };
        errors = {};
        game.announce('Memory added. See the confirmation for where it went.');
        render();
        const t = root.querySelector('[data-key="confirm-title"]');
        if (t) t.focus();
        return;
      }
      errors = r.errors || (r.reason === 'full' ? { title: `You can add up to ${MAX_CONTRIBUTIONS} sample memories in this demo. Delete one in your journal first.` } : {});
      game.sound.play('soft');
      render();
      const first = ['illus', 'title', 'story', 'year', 'people', 'audience'].find((k) => errors[k]);
      const target = first === 'illus' ? root.querySelector('input[name="illus"]') : first === 'audience' ? root.querySelector('input[name="audience"]') : root.querySelector(`#f-${first}`);
      if (target) target.focus();
    } },
    h('p', { class: 'banner banner--demo' }, h('strong', null, 'Demo only — please do not enter sensitive personal information.')),
    h('p', { class: 'fine' }, 'Audience settings simulate how the proposed service would work. Nothing is uploaded or sent anywhere, and there are no real family access controls.'),
    illusSet,
    field('title', 'Title', title),
    field('story', 'Short story', h('div', null, story, counter)),
    field('year', 'Approximate year', h('div', { class: 'inline' }, year, h('label', { class: 'check' }, unknown, ' Date unknown'))),
    field('people', 'People involved', people, { optional: true }),
    audSet,
    full ? h('p', { class: 'error' }, `You have added the maximum of ${MAX_CONTRIBUTIONS} sample memories.`) : null,
    h('div', { class: 'row row--end' }, h('button', { type: 'submit', class: 'btn btn--primary btn--big', disabled: full }, 'Add to the archive (demo)')),
    );
    return formEl;
  }

  // ---------------------------------------------------------------- render
  function render() {
    const p = game.p;
    const active = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    clear(root);
    root.appendChild(h('div', { class: 'journal__header' },
      h('div', null, h('h2', null, 'Neighbourhood memory archive'), h('p', { class: 'fine' }, 'Block 12 (fictional) · proposed future demo')),
      h('button', { type: 'button', class: 'btn', onClick: () => ref.current.close() }, 'Close'),
    ));
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Archive sections' }, TABS.map((t) => h('button', {
      type: 'button', role: 'tab', id: `tab-${t.id}`, class: `tab ${t.id === current ? 'tab--on' : ''}`, 'aria-selected': String(t.id === current), 'aria-controls': 'archive-panel',
      tabindex: t.id === current ? '0' : '-1',
      onClick: () => { current = t.id; selectedRecord = null; render(); },
      onKeydown: (e) => {
        const i = TABS.findIndex((x) => x.id === current);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
          current = n.id; selectedRecord = null; render();
          const el = root.querySelector(`#tab-${n.id}`); if (el) el.focus();
        }
      },
    },
    t.label,
    t.id === 'board' ? h('span', { class: 'count' }, String(publicRecords(p).length)) : t.id === 'restricted' ? h('span', { class: 'count' }, String(restrictedRecords(p).length)) : null)));
    root.appendChild(tabs);
    const panel = h('div', { class: 'archive__panel', id: 'archive-panel', role: 'tabpanel', 'aria-labelledby': `tab-${current}` },
      current === 'board' ? boardTab(p) : current === 'restricted' ? restrictedTab(p) : contributeTab(p));
    root.appendChild(panel);
    if (active) {
      const el = root.querySelector(`[data-key="${active}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  render();
  ref.current = game.overlays.open(root, { id: 'archive', kind: 'modal', label: 'Neighbourhood memory archive', onClose: () => { unsub(); game.afterArchiveClosed(); } });
  return ref.current;
}

