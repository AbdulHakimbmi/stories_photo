// =============================================================================
//  journal.js — the memory journal. This is where context gets documented:
//  verified details, perspectives, uncertainty, name display and sharing.
// =============================================================================
import { h, clear } from './dom.js';
import { chip, recordView } from './record-view.js';
import {
  MISSIONS, M1_DETAILS, M1_VERIFIED_NEEDED, M2_NOTES, M2_NOTES_NEEDED, RECORD_TEXT, AUDIENCES, AUDIENCE_IDS,
} from '../data/content.js';
import {
  missionStatus, STATUS_LABEL, missionRecord, contributionToRecord, progressLabel,
} from '../state/logic.js';
import { illustrationElement } from '../art/illustrations.js';
import { openConfirm } from './screens.js';

const STATUS_CHIP = { undiscovered: '', 'in-progress': 'progress', documented: 'done', staged: 'staged' };

function opt({ key, label, desc, pressed = false, locked = false, onClick, tone = '' }) {
  return h('button', {
    type: 'button',
    class: `opt ${pressed ? 'opt--on' : ''} ${locked ? 'opt--locked' : ''} ${tone ? `opt--${tone}` : ''}`,
    'aria-pressed': String(!!pressed),
    dataset: { key },
    onClick,
  },
  h('span', { class: 'opt__mark', 'aria-hidden': 'true' }, pressed ? '✓' : locked ? '🔒' : '○'),
  h('span', { class: 'opt__body' }, h('span', { class: 'opt__label' }, label), desc ? h('span', { class: 'opt__desc' }, desc) : null),
  );
}

function step(num, title, done, ...children) {
  return h('section', { class: `step ${done ? 'step--done' : ''}`, 'aria-label': `Step ${num}: ${title}` },
    h('h4', { class: 'step__title' }, h('span', { class: 'step__num', 'aria-hidden': 'true' }, done ? '✓' : String(num)), title, done ? h('span', { class: 'sr-only' }, ' (complete)') : null),
    ...children);
}

const fbLine = (msg) => (msg ? h('p', { class: 'feedback', role: 'status' }, msg) : null);

export function openJournal(game, { select = null } = {}) {
  const ref = { current: null };
  const fb = {};
  let celebrate = null;
  const firstInProgress = () => ['m1', 'm2', 'm3'].find((m) => missionStatus(game.p, m) === 'in-progress') || 'm1';
  let selected = select || firstInProgress();
  const root = h('div', { class: 'panel panel--journal' });

  const unsub = game.store.subscribe(() => { if (game.overlays.has('journal')) render(); });

  function entries() {
    const p = game.p;
    const list = ['m1', 'm2', 'm3'].map((id) => ({ id, label: MISSIONS[id].title, status: missionStatus(p, id), kind: 'mission' }));
    for (const c of p.contributions) list.push({ id: c.id, label: c.title, status: 'contribution', kind: 'contribution', audience: c.audience });
    return list;
  }

  // ------------------------------------------------------------ mission 1
  function detailM1(p) {
    const m = p.m1;
    if (m.done) return h('div', null, celebrate === 'm1' ? celebrateBanner('Documented. This record is now on the public memory board.') : null, recordView(missionRecord(p, 'm1'), { headingLevel: 3 }));
    const lim = RECORD_TEXT.m1.perspectives[0];
    const mei = RECORD_TEXT.m1.perspectives[1];
    const nDetails = m.details.length;
    return h('div', null,
      h('h3', { class: 'journal__title', tabindex: '-1' }, MISSIONS.m1.title),
      h('div', { class: 'chips' }, chip(STATUS_LABEL[missionStatus(p, 'm1')], 'progress')),
      h('div', { class: 'journal__top' },
        m.photo ? illustrationElement('dinner', { w: 300, h: 200, className: 'illus illus--journal' }) : h('div', { class: 'illus-ph' }, 'Photograph not yet examined'),
        h('div', null,
          h('h4', null, 'What the photo alone tells you'),
          h('p', null, m.photo ? 'Six people around a round table. No names, no date, no reason. The image alone does not contain the meaning of the evening.' : 'Find the photograph on the sideboard in the Lim family home.'),
          h('p', { class: 'fine' }, `Found so far: photograph ${m.photo ? '✓' : '—'} · rice pot ${m.pot ? '✓' : '—'} · note ${m.note ? '✓' : '—'}`),
        ),
      ),
      h('h4', null, 'Recollections'),
      h('div', { class: 'persp' },
        h('figure', { class: `persp__card ${m.spokeLim ? '' : 'persp__card--empty'}` }, h('blockquote', null, m.spokeLim ? lim.text : 'Not heard yet — talk to Uncle Lim.'), h('figcaption', null, '— Uncle Lim')),
        h('figure', { class: `persp__card ${m.spokeMei ? '' : 'persp__card--empty'}` }, h('blockquote', null, m.spokeMei ? mei.text : 'Not heard yet — talk to Mei.'), h('figcaption', null, '— Mei')),
      ),

      step(1, `Attach ${M1_VERIFIED_NEEDED} verified details (${nDetails} attached)`, nDetails >= M1_VERIFIED_NEEDED,
        h('p', { class: 'fine' }, 'Only attach details that someone who was there, or the objects themselves, can confirm.'),
        h('div', { class: 'opts' }, M1_DETAILS.map((d) => {
          const unlocked = d.needs(p);
          const on = m.details.includes(d.id);
          return opt({
            key: `d-${d.id}`,
            label: unlocked ? d.text : 'Locked detail',
            desc: unlocked ? `${d.verified ? 'Verified' : 'Unconfirmed'} · ${d.source}` : d.needsHint,
            pressed: on,
            locked: !unlocked,
            tone: unlocked && !d.verified ? 'warn' : '',
            onClick: () => { const r = game.actions.attachDetail(d.id); fb.details = r.ok ? '' : r.message || ''; render(); },
          });
        })),
        fbLine(fb.details)),

      step(2, 'Keep the recollections', m.recollections === 'both',
        h('p', { class: 'fine' }, 'Uncle Lim remembers the rice. Mei remembers the talking. Do you have to choose?'),
        h('div', { class: 'opts' },
          opt({ key: 'r-both', label: 'Keep both recollections side by side', desc: 'Recommended — they describe different parts of the same night.', pressed: m.recollections === 'both', onClick: () => { const r = game.actions.chooseRecollection('both'); fb.rec = r.ok ? '' : r.message || ''; render(); } }),
          opt({ key: 'r-lim', label: 'Keep only Uncle Lim’s account', onClick: () => { const r = game.actions.chooseRecollection('lim'); fb.rec = r.message || ''; render(); } }),
          opt({ key: 'r-mei', label: 'Keep only Mei’s account', onClick: () => { const r = game.actions.chooseRecollection('mei'); fb.rec = r.message || ''; render(); } }),
        ),
        fbLine(fb.rec)),

      step(3, 'Choose how it is shared', m.sharing === 'public',
        h('div', { class: 'agree' },
          h('strong', null, 'What the contributors said'),
          h('ul', null,
            h('li', null, m.limConsent ? 'Uncle Lim: share on the neighbourhood board, first name only, no address.' : 'Uncle Lim: not asked yet — ask him in the Lim home.'),
            h('li', null, m.meiConsent ? 'Mei: the neighbourhood board is fine, first names only.' : 'Mei: not asked yet — ask her in the Lim home.'),
          ),
        ),
        h('div', { class: 'opts' },
          opt({ key: 's-public', label: 'Public neighbourhood archive', pressed: m.sharing === 'public', onClick: () => { const r = game.actions.chooseSharingM1('public'); fb.share = r.ok ? '' : r.message || ''; render(); } }),
          opt({ key: 's-family', label: 'Selected family members only', onClick: () => { const r = game.actions.chooseSharingM1('family'); fb.share = r.message || ''; render(); } }),
          opt({ key: 's-none', label: 'Do not save', onClick: () => { const r = game.actions.chooseSharingM1('none'); fb.share = r.message || ''; render(); } }),
        ),
        fbLine(fb.share)),

      saveBlock('m1'),
    );
  }

  // ------------------------------------------------------------ mission 2
  function detailM2(p) {
    const m = p.m2;
    if (m.done) return h('div', null, celebrate === 'm2' ? celebrateBanner('Documented. This record is now on the public memory board.') : null, recordView(missionRecord(p, 'm2'), { headingLevel: 3 }));
    return h('div', null,
      h('h3', { class: 'journal__title', tabindex: '-1' }, MISSIONS.m2.title),
      h('div', { class: 'chips' }, chip(STATUS_LABEL[missionStatus(p, 'm2')], 'progress')),
      h('div', { class: 'journal__top' },
        m.photo ? illustrationElement('corridor', { w: 300, h: 200, className: 'illus illus--journal' }) : h('div', { class: 'illus-ph' }, 'Photograph not yet found'),
        h('div', null,
          h('h4', null, 'What the photo alone tells you'),
          h('p', null, m.photo ? 'Many neighbours, lanterns, plates on a bench. Nothing written on the back — no date, no names, no occasion.' : 'Look for an old photograph on the corridor wall, above the bench.'),
        ),
      ),
      h('h4', null, 'Accounts'),
      h('div', { class: 'persp' },
        h('figure', { class: `persp__card ${m.spokeDevi ? '' : 'persp__card--empty'}` }, h('blockquote', null, m.spokeDevi ? 'A celebration! Everyone brought a dish and lined them along the corridor. The children ran up and down with paper lanterns, somebody’s radio was playing, and we danced a little.' : 'Not heard yet — talk to Madam Devi.'), h('figcaption', null, '— Madam Devi')),
        h('figure', { class: `persp__card ${m.spokeRahman ? '' : 'persp__card--empty'}` }, h('blockquote', null, m.spokeRahman ? 'The day the corridor looked after a family. People came with food, sat with them and took turns minding the little ones. What I remember is people showing up.' : 'Not heard yet — talk to Mr Rahman.'), h('figcaption', null, '— Mr Rahman')),
      ),

      step(1, 'Perspectives', m.perspectives === 'both',
        h('div', { class: 'opts' },
          opt({ key: 'p-both', label: 'Keep both perspectives', desc: 'One describes the mood, the other what neighbours did. Different aspects of the same day.', pressed: m.perspectives === 'both', onClick: () => { const r = game.actions.keepPerspectives('both'); fb.persp = r.ok ? '' : r.message || ''; render(); } }),
          opt({ key: 'p-one', label: 'Keep only one account', onClick: () => { const r = game.actions.keepPerspectives('one'); fb.persp = r.message || ''; render(); } }),
        ),
        fbLine(fb.persp)),

      step(2, 'The date', m.date === 'uncertain',
        h('p', { class: 'fine' }, 'Madam Devi thinks it was before the lifts were upgraded. Mr Rahman is not sure either.'),
        h('div', { class: 'opts' },
          opt({ key: 'dt-unc', label: 'Mark the exact date as uncertain', desc: 'The record will say the date is unknown rather than invent one.', pressed: m.date === 'uncertain', onClick: () => { const r = game.actions.chooseDate('uncertain'); fb.date = r.ok ? '' : r.message || ''; render(); } }),
          opt({ key: 'dt-guess', label: 'Write a best-guess date (for example “14 March”)', onClick: () => { const r = game.actions.chooseDate('guess'); fb.date = r.message || ''; render(); } }),
        ),
        fbLine(fb.date)),

      step(3, `Add context notes (${m.notes.length} added, need ${M2_NOTES_NEEDED})`, m.notes.length >= M2_NOTES_NEEDED,
        h('div', { class: 'opts' }, M2_NOTES.map((n) => {
          const unlocked = n.needs(p);
          return opt({
            key: `n-${n.id}`,
            label: unlocked ? n.text : 'Locked note',
            desc: unlocked ? '' : n.needsHint,
            pressed: m.notes.includes(n.id),
            locked: !unlocked,
            onClick: () => { const r = game.actions.toggleNote(n.id); fb.notes = r.ok ? '' : r.message || ''; render(); },
          });
        })),
        fbLine(fb.notes)),

      step(4, 'Names on the record', !!(m.deviName && m.rahmanName),
        h('p', { class: 'fine' }, 'You ask each neighbour in conversation. Their answer is recorded here.'),
        h('ul', { class: 'namelist' },
          h('li', null, m.deviName === 'show' ? 'Madam Devi: name shown.' : m.deviName === 'anonymous' ? 'Madam Devi: shown as “a neighbour”.' : 'Madam Devi: not asked yet — ask her by the bench.'),
          h('li', null, m.rahmanName === 'anonymous' ? 'Mr Rahman: shown as “a neighbour”.' : m.rahmanName === 'show' ? 'Mr Rahman: name shown.' : 'Mr Rahman: not asked yet — ask him by the bench.'),
        )),

      saveBlock('m2'),
    );
  }

  // ------------------------------------------------------------ mission 3
  function detailM3(p) {
    const m = p.m3;
    if (m.done) return h('div', null, celebrate === 'm3' ? celebrateBanner('Saved as family-only. It is in the restricted list, not on the public board.') : null, recordView(missionRecord(p, 'm3'), { headingLevel: 3, banner: 'This is a demo restricted record. It is never shown on the public board.' }));
    return h('div', null,
      h('h3', { class: 'journal__title', tabindex: '-1' }, MISSIONS.m3.title),
      h('div', { class: 'chips' }, chip(STATUS_LABEL[missionStatus(p, 'm3')], 'progress')),
      m.spoke
        ? h('div', null,
          m.wishHeard ? h('div', { class: 'consent-card' }, h('span', { class: 'consent-card__icon', 'aria-hidden': 'true' }, '🔒'), h('div', null, h('strong', null, 'Auntie Salmah’s wish'), h('span', null, 'Keep for selected relatives only. Not on the public board.'))) : null,
          h('p', null, 'Choose how her memory is kept by talking with her at the quiet corner. If a choice does not match what she asked for, she will tell you and you can correct it. Consent and preservation are separate decisions: keeping it private does not mean losing it.'))
        : h('p', null, 'You have not met Auntie Salmah yet. She is resting at the quiet corner at the far end of the corridor.'),
    );
  }

  // ------------------------------------------------------------ contributions
  function detailContribution(c) {
    const rec = contributionToRecord(c);
    return h('div', null,
      recordView(rec, { headingLevel: 3 }),
      h('section', { class: 'step', 'aria-label': 'Change who can see this' },
        h('h4', null, 'Who can see this? (demo)'),
        h('p', { class: 'fine' }, 'Changing the audience moves the record between the public board, the restricted list and your drafts straight away. This simulates how a contributor could change their mind in the proposed service.'),
        h('div', { class: 'opts' }, AUDIENCE_IDS.map((a) => opt({
          key: `aud-${a}`, label: AUDIENCES[a].label, desc: AUDIENCES[a].help, pressed: c.audience === a,
          onClick: () => { if (game.actions.updateAudience(c.id, a)) { game.announce(`Moved to ${AUDIENCES[a].short}.`); } },
        }))),
        h('div', { class: 'row' },
          h('button', {
            type: 'button', class: 'btn btn--danger btn--small',
            onClick: () => openConfirm(game, {
              title: 'Delete this sample memory?', body: 'It will be removed from the board, the restricted list and your journal. (Demo only.)',
              confirmLabel: 'Delete', danger: true,
              onConfirm: () => { game.actions.deleteContribution(c.id); selected = 'm1'; render(); },
            }),
          }, 'Delete this sample'),
        ),
      ),
    );
  }

  // ------------------------------------------------------------ shared pieces
  function celebrateBanner(text) {
    return h('p', { class: 'banner banner--ok', role: 'status' }, '✓ ', text);
  }

  function saveBlock(id) {
    const missing = game.actions.missingFor(id);
    const ready = missing.length === 0;
    return h('div', { class: 'savebar' },
      !ready ? h('p', { class: 'fine' }, `Still to do: ${missing.join(' · ')}`) : h('p', { class: 'fine' }, 'Everything is in place.'),
      h('button', {
        type: 'button', class: 'btn btn--primary', 'aria-disabled': String(!ready), dataset: { key: 'save' },
        onClick: () => {
          const r = game.actions.finalize(id);
          if (r.ok) { celebrate = id; fb.save = ''; render(); const t = root.querySelector('.record__title'); if (t) t.focus(); } else { fb.save = r.missing ? `Not yet: ${r.missing.join(', ')}.` : ''; render(); }
        },
      }, 'Save to the archive'),
      fbLine(fb.save),
    );
  }

  // ------------------------------------------------------------ main render
  function render() {
    const p = game.p;
    const active = document.activeElement && root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const list = entries();
    if (!list.some((e) => e.id === selected)) selected = 'm1';
    clear(root);

    root.appendChild(h('div', { class: 'journal__header' },
      h('div', null, h('h2', null, 'Memory journal'), h('p', { class: 'fine' }, progressLabel(p))),
      h('button', { type: 'button', class: 'btn', onClick: () => ref.current.close() }, 'Close (J)'),
    ));

    const nav = h('nav', { class: 'journal__nav', 'aria-label': 'Memories' },
      h('ul', null, list.map((e) => h('li', null, h('button', {
        type: 'button', class: `navbtn ${e.id === selected ? 'navbtn--on' : ''}`, 'aria-current': e.id === selected ? 'true' : null, dataset: { key: `nav-${e.id}` },
        onClick: () => { selected = e.id; celebrate = e.id === celebrate ? celebrate : null; render(); },
      },
      h('span', { class: 'navbtn__title' }, e.label),
      e.kind === 'mission'
        ? h('span', { class: `chip chip--${STATUS_CHIP[e.status] || 'quiet'}` }, e.status === 'undiscovered' ? 'Not discovered' : e.status === 'in-progress' ? 'In progress' : e.status === 'staged' ? 'Staged' : 'Documented')
        : h('span', { class: `chip chip--${e.audience}` }, AUDIENCES[e.audience].short))))),
    );

    let detail;
    if (selected === 'm1') detail = detailM1(p);
    else if (selected === 'm2') detail = detailM2(p);
    else if (selected === 'm3') detail = detailM3(p);
    else {
      const c = p.contributions.find((x) => x.id === selected);
      detail = c ? detailContribution(c) : detailM1(p);
    }
    root.appendChild(h('div', { class: 'journal__body' }, nav, h('div', { class: 'journal__detail' }, detail)));

    if (active) {
      const el = root.querySelector(`[data-key="${active}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  render();
  ref.current = game.overlays.open(root, { id: 'journal', kind: 'modal', label: 'Memory journal', onClose: () => { unsub(); game.afterJournalClosed(); } });
  return ref.current;
}
