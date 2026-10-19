// =============================================================================
//  screens.js — title, intro, about, controls, pause, confirm and ending screens.
// =============================================================================
import { h } from './dom.js';
import {
  GAME_TITLE, SETTING_LINE, INTRO_PARAGRAPHS, FICTION_NOTICE, ABOUT_PARAGRAPHS, SIMULATED_POINTS,
  CONTROLS, ENDING_QUOTE, AUDIENCES,
} from '../data/content.js';
import { docCount, stagedCount, missionRecord, publicRecords, restrictedRecords } from '../state/logic.js';

function toggleButton(label, getOn, onToggle) {
  const btn = h('button', { type: 'button', class: 'btn btn--toggle', 'aria-pressed': String(!!getOn()) });
  const paint = () => {
    const on = !!getOn();
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = `${label}: ${on ? 'On' : 'Off'}`;
  };
  btn.addEventListener('click', () => { onToggle(); paint(); });
  paint();
  return btn;
}

export const soundToggle = (game) => toggleButton('Sound', () => !game.settings.muted, () => game.setMuted(!game.settings.muted));
export const motionToggle = (game) => toggleButton('Reduced motion', () => game.settings.reducedMotion, () => game.setReducedMotion(!game.settings.reducedMotion));

function closeButton(game, handleRef, label = 'Close') {
  return h('button', { type: 'button', class: 'btn btn--primary', onClick: () => handleRef.current.close() }, label);
}

// ---------------------------------------------------------------- title
export function openTitle(game) {
  const hasSave = game.store.hasProgress('play') && game.playStarted();
  const warn = game.storageWarning();
  const note = game.takeNotice ? game.takeNotice() : null;
  const content = h('div', { class: 'screen screen--title' },
    h('p', { class: 'badge' }, SETTING_LINE),
    h('h1', { class: 'title' }, GAME_TITLE),
    h('p', { class: 'lede' }, 'Explore a neighbourhood, hear the stories behind photographs, and decide how a memory is kept.'),
    warn ? h('p', { class: 'banner banner--warn', role: 'status' }, warn) : null,
    note ? h('p', { class: 'banner banner--ok', role: 'status' }, note) : null,
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn btn--primary btn--big', onClick: () => game.startPlay() }, hasSave ? 'Continue' : 'Play'),
      h('button', { type: 'button', class: 'btn btn--big', onClick: () => game.startPresenter() }, 'Presenter mode'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onClick: () => openControls(game) }, 'Controls'),
        h('button', { type: 'button', class: 'btn', onClick: () => openAbout(game) }, 'About'),
        h('button', { type: 'button', class: 'btn btn--quiet', onClick: () => confirmResetAll(game) }, 'Reset progress'),
      ),
    ),
    h('div', { class: 'row row--center' }, soundToggle(game), motionToggle(game)),
    h('p', { class: 'fine' }, 'A speculative design prototype. All characters and stories are fictional. Not an existing programme.'),
  );
  return game.overlays.open(content, { id: 'title', kind: 'screen', label: 'Title screen', closable: false });
}

export function confirmResetAll(game) {
  openConfirm(game, {
    title: 'Reset all demo progress?',
    body: 'This clears the saved play progress and the presenter-mode progress in this browser. Your sound and motion settings are kept.',
    confirmLabel: 'Reset progress',
    danger: true,
    onConfirm: () => game.resetAllProgress(),
  });
}

// ---------------------------------------------------------------- confirm
export function openConfirm(game, { title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm }) {
  const ref = { current: null };
  const content = h('div', { class: 'panel panel--small' },
    h('h2', null, title),
    h('p', null, body),
    h('div', { class: 'row row--end' },
      h('button', { type: 'button', class: 'btn', onClick: () => ref.current.close() }, cancelLabel),
      h('button', { type: 'button', class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, onClick: () => { ref.current.close(); onConfirm(); } }, confirmLabel),
    ),
  );
  ref.current = game.overlays.open(content, { id: 'confirm', kind: 'modal', label: title, initialFocus: content.querySelector('.btn') });
  return ref.current;
}

// ---------------------------------------------------------------- intro
export function openIntro(game, onBegin) {
  const ref = { current: null };
  const content = h('div', { class: 'panel panel--intro' },
    h('p', { class: 'badge' }, SETTING_LINE),
    h('h2', null, 'A neighbourhood memory service'),
    INTRO_PARAGRAPHS.map((t) => h('p', null, t)),
    h('p', null, 'You are Marcus, a young adult helping prepare a community memory session at Block 12. Aisha, the coordinator, needs three stories documented.'),
    h('p', { class: 'banner' }, FICTION_NOTICE),
    h('div', { class: 'row row--end' },
      h('button', { type: 'button', class: 'btn btn--primary btn--big', onClick: () => { ref.current.close(); onBegin(); } }, 'Begin'),
    ),
  );
  ref.current = game.overlays.open(content, { id: 'intro', kind: 'screen', label: 'Introduction', closable: false });
  return ref.current;
}

// ---------------------------------------------------------------- about
export function openAbout(game) {
  const ref = { current: null };
  const content = h('div', { class: 'panel' },
    h('h2', null, 'About the future scenario'),
    h('p', { class: 'badge' }, SETTING_LINE),
    ABOUT_PARAGRAPHS.map((t) => h('p', null, t)),
    h('h3', null, 'What is simulated in this prototype'),
    h('ul', null, SIMULATED_POINTS.map((t) => h('li', null, t))),
    h('p', { class: 'banner' }, FICTION_NOTICE),
    h('div', { class: 'row row--end' }, closeButton(game, ref)),
  );
  ref.current = game.overlays.open(content, { id: 'about', kind: 'modal', label: 'About the future scenario' });
  return ref.current;
}

// ---------------------------------------------------------------- controls
export function openControls(game) {
  const ref = { current: null };
  const content = h('div', { class: 'panel' },
    h('h2', null, 'Controls'),
    h('table', { class: 'controls' },
      h('tbody', null, CONTROLS.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, h('kbd', null, k)), h('td', null, v)))),
    ),
    h('h3', null, 'Comfort and access'),
    h('ul', null,
      h('li', null, 'All dialogue is shown as text and never advances on its own.'),
      h('li', null, 'There is no timer, no score and nothing to fail. Take as long as you like.'),
      h('li', null, 'Sound is optional. Turn it off any time with M, or in the pause menu.'),
      h('li', null, 'Turn on Reduced motion to stop bobbing, swaying and drifting.'),
      h('li', null, 'Stuck? Open the pause menu and choose “I’m stuck”.'),
    ),
    h('div', { class: 'row row--end' }, closeButton(game, ref)),
  );
  ref.current = game.overlays.open(content, { id: 'controls', kind: 'modal', label: 'Controls' });
  return ref.current;
}

// ---------------------------------------------------------------- pause
export function openPause(game) {
  const ref = { current: null };
  const content = h('div', { class: 'panel panel--small' },
    h('h2', null, 'Paused'),
    h('p', { class: 'fine' }, game.store.profile === 'presenter' ? 'Presenter mode — its progress is stored separately from normal play.' : 'Your progress is saved automatically in this browser (demo only).'),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn btn--primary btn--big', onClick: () => ref.current.close() }, 'Resume'),
      soundToggle(game),
      motionToggle(game),
      h('button', { type: 'button', class: 'btn', onClick: () => game.openJournal() }, 'Memory journal'),
      h('button', { type: 'button', class: 'btn', onClick: () => openControls(game) }, 'Controls'),
      h('button', { type: 'button', class: 'btn', onClick: () => { ref.current.close(); game.recoverPlayer(); } }, 'I’m stuck — return to the void deck'),
      h('button', { type: 'button', class: 'btn', onClick: () => { ref.current.close(); game.returnToTitle(); } }, 'Return to title'),
      h('button', {
        type: 'button', class: 'btn btn--danger',
        onClick: () => openConfirm(game, {
          title: 'Reset this demo?',
          body: game.store.profile === 'presenter'
            ? 'This clears all presenter-mode progress and puts the three missions back to their ready-to-demonstrate state. Normal play progress is not touched.'
            : 'This clears your play progress, journal, and archive contributions in this browser, then returns you to the start.',
          confirmLabel: 'Reset demo',
          danger: true,
          onConfirm: () => { ref.current.close(); game.resetCurrentProfile(); },
        }),
      }, 'Reset demo'),
    ),
  );
  ref.current = game.overlays.open(content, { id: 'pause', kind: 'modal', label: 'Pause menu' });
  return ref.current;
}

// ---------------------------------------------------------------- ending summary
export function openEnding(game) {
  const p = game.p;
  const n = docCount(p);
  const staged = stagedCount(p);
  const contribution = p.contributions[0] || null;
  const m1 = missionRecord(p, 'm1');
  const m2 = missionRecord(p, 'm2');
  const m3 = missionRecord(p, 'm3');
  const ref = { current: null };

  const lines = [
    [`${n === 3 ? 'Three' : n} ${n === 1 ? 'story' : 'stories'} documented`, staged ? `${n - staged} by you, ${staged} staged for the presenter demo` : 'with context, not just a picture'],
    ['Multiple perspectives preserved', m1 && m2 ? 'Lim and Mei; and Madam Devi and a neighbour' : m1 || m2 ? 'in the stories you documented' : 'none yet'],
    ['One contributor’s privacy preference respected', m3 ? 'Auntie Salmah’s memory is family-only and is not on the public board' : 'not yet — visit Auntie Salmah'],
    [contribution ? `${p.contributions.length === 1 ? 'One sample memory' : `${p.contributions.length} sample memories`} contributed` : 'No sample memory contributed yet',
      contribution ? `“${contribution.title}” — ${AUDIENCES[contribution.audience].short} (demo)` : 'use the kiosk'],
  ];
  const pub = publicRecords(p).length;
  const restricted = restrictedRecords(p).length;

  const content = h('div', { class: 'panel panel--ending' },
    h('p', { class: 'badge' }, 'Session complete'),
    h('h2', null, 'What we kept today'),
    h('ul', { class: 'summary' }, lines.map(([a, b]) => h('li', null, h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'), h('div', null, h('strong', null, a), h('span', { class: 'summary__sub' }, b))))),
    h('p', { class: 'fine' }, `On the public board: ${pub} · In the demo restricted list: ${restricted}. These are kept separate.`),
    h('blockquote', { class: 'quote' }, ENDING_QUOTE.map((l) => h('p', null, l))),
    h('div', { class: 'row row--wrap' },
      h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ref.current.close() }, 'Explore again'),
      h('button', { type: 'button', class: 'btn', onClick: () => game.openArchive({ tab: 'board' }) }, 'View the archive'),
      h('button', {
        type: 'button', class: 'btn',
        onClick: () => openConfirm(game, {
          title: 'Restart?',
          body: game.store.profile === 'presenter' ? 'This resets presenter-mode progress.' : 'This clears your play progress and begins again.',
          confirmLabel: 'Restart', danger: true,
          onConfirm: () => { ref.current.close(); game.resetCurrentProfile(); },
        }),
      }, 'Restart'),
      h('button', { type: 'button', class: 'btn', onClick: () => openAbout(game) }, 'About the future scenario'),
    ),
  );
  ref.current = game.overlays.open(content, { id: 'ending', kind: 'modal', label: 'Summary' });
  return ref.current;
}
