// =============================================================================
//  screens.js — title, about, controls, menu, confirm, notice and the gathering-place activity panel.
// =============================================================================
import { h } from './dom.js';
import {
  GAME_TITLE, SETTING_LINE, PROTOTYPE_NOTE, TEMP_STORAGE_NOTE, ABOUT_PARAGRAPHS, ABOUT_HOW, ABOUT_LIMITS,
  CONTROLS, ACTIVITY, AREAS,
} from '../data/content.js';

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

const closeBtn = (ref, label = 'Close') => h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ref.current.close() }, label);

// ---------------------------------------------------------------- title
export function openTitle(game, { notice = null, error = null } = {}) {
  const saved = game.savedHost();
  const errBox = h('p', { class: 'banner banner--warn', role: 'alert', hidden: !error }, error || '');
  const showError = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };
  let busy = false;
  const guard = (btn, fn) => async () => {
    if (busy) return;
    busy = true; btn.disabled = true; showError('');
    try { await fn(); } catch (err) { showError(err && err.message ? err.message : String(err)); } finally { busy = false; btn.disabled = false; }
  };

  const startBtn = h('button', { type: 'button', class: 'btn btn--primary btn--big' }, 'Start a live garden session');
  startBtn.addEventListener('click', guard(startBtn, () => game.startLive()));
  let resumeBtn = null;
  if (saved) {
    resumeBtn = h('button', { type: 'button', class: 'btn btn--big' }, `Resume “${saved.name || 'saved session'}”`);
    resumeBtn.addEventListener('click', guard(resumeBtn, () => game.resumeLive()));
  }
  const demoBtn = h('button', { type: 'button', class: 'btn btn--big', onClick: () => game.startDemo() }, 'Try the fictional demo');

  const content = h('div', { class: 'screen screen--title' },
    h('p', { class: 'badge' }, SETTING_LINE),
    h('h1', { class: 'title' }, GAME_TITLE),
    h('p', { class: 'lede' }, 'A shared garden where photographs from real phones grow into memory plants. Nothing reaches the garden until the host approves it.'),
    notice ? h('p', { class: 'banner banner--ok', role: 'status' }, notice) : null,
    errBox,
    h('div', { class: 'stack' },
      startBtn,
      resumeBtn,
      demoBtn,
      h('div', { class: 'row row--center row--wrap' },
        h('button', { type: 'button', class: 'btn', onClick: () => openControls(game) }, 'Controls'),
        h('button', { type: 'button', class: 'btn', onClick: () => openAbout(game) }, 'About this prototype'),
        saved ? h('button', { type: 'button', class: 'btn btn--quiet', onClick: () => confirmForget(game) }, 'Forget saved session') : null,
      ),
    ),
    h('div', { class: 'row row--center' }, soundToggle(game), motionToggle(game)),
    h('p', { class: 'fine' }, PROTOTYPE_NOTE),
    h('p', { class: 'fine' }, 'The live session needs the garden server running on this computer (see the README). The fictional demo needs nothing and uploads nothing.'),
  );
  return game.overlays.open(content, { id: 'title', kind: 'screen', label: 'Title screen', closable: false, initialFocus: startBtn });
}

function confirmForget(game) {
  openConfirm(game, {
    title: 'Forget the saved session?',
    body: 'This browser will stop being able to control that session. The session itself keeps running on the server until it expires; you can delete its data from the host panel before you forget it.',
    confirmLabel: 'Forget it', danger: true,
    onConfirm: () => game.forgetSaved(),
  });
}

// ---------------------------------------------------------------- confirm + notice
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

export function openNotice(game, { title, paragraphs = [], buttonLabel = 'OK', onClose = null, id = 'notice' }) {
  const ref = { current: null };
  const content = h('div', { class: 'panel panel--small' },
    h('h2', null, title),
    paragraphs.map((p) => h('p', null, p)),
    h('div', { class: 'row row--end' }, closeBtn(ref, buttonLabel)),
  );
  ref.current = game.overlays.open(content, { id, kind: 'modal', label: title, onClose });
  return ref.current;
}

// ---------------------------------------------------------------- about + controls
export function openAbout(game) {
  const ref = { current: null };
  const content = h('div', { class: 'panel panel--about' },
    h('p', { class: 'badge' }, SETTING_LINE),
    h('h2', null, `About ${GAME_TITLE}`),
    ABOUT_PARAGRAPHS.map((t) => h('p', null, t)),
    h('h3', null, 'How it works'),
    h('ol', null, ABOUT_HOW.map((t) => h('li', null, t))),
    h('h3', null, 'Limits to be aware of'),
    h('ul', null, ABOUT_LIMITS.map((t) => h('li', null, t))),
    h('p', { class: 'banner' }, PROTOTYPE_NOTE),
    h('div', { class: 'row row--end' }, closeBtn(ref)),
  );
  ref.current = game.overlays.open(content, { id: 'about', kind: 'modal', label: 'About this prototype' });
  return ref.current;
}

export function openControls(game) {
  const ref = { current: null };
  const content = h('div', { class: 'panel' },
    h('h2', null, 'Controls'),
    h('table', { class: 'controls' },
      h('tbody', null, CONTROLS.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, h('kbd', null, k)), h('td', null, v)))),
    ),
    h('h3', null, 'Comfort and access'),
    h('ul', null,
      h('li', null, 'Everything can be done with on-screen buttons. The host panel lists every memory with an Open button, so you never have to find a plant in 3D.'),
      h('li', null, 'There is no timer, no score and nothing to fail. Take as long as you like.'),
      h('li', null, 'Sound is off by default and optional. Toggle it with M or in the menu.'),
      h('li', null, 'Turn on Reduced motion to stop swaying, bobbing and growth animations. It starts from your system setting.'),
      h('li', null, 'Stuck? Open the menu and choose “Back to the gate”.'),
    ),
    h('div', { class: 'row row--end' }, closeBtn(ref)),
  );
  ref.current = game.overlays.open(content, { id: 'controls', kind: 'modal', label: 'Controls' });
  return ref.current;
}

// ---------------------------------------------------------------- menu (Esc)
export function openMenu(game) {
  const ref = { current: null };
  const go = (fn) => () => { ref.current.close(); fn(); };
  const live = game.kind === 'live';
  const content = h('div', { class: 'panel panel--small' },
    h('h2', null, 'Menu'),
    h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ref.current.close() }, 'Back to the garden'),
      h('button', { type: 'button', class: 'btn', onClick: go(() => game.toggleDock(true)) }, live ? 'Open the host panel' : 'Open the demo panel'),
      h('button', { type: 'button', class: 'btn', onClick: go(() => game.openActivity()) }, 'Gathering place activity'),
      h('button', { type: 'button', class: 'btn', onClick: go(() => game.recoverPlayer()) }, 'Back to the gate (if you are stuck)'),
      h('button', { type: 'button', class: 'btn', onClick: () => openControls(game) }, 'Controls'),
      h('button', { type: 'button', class: 'btn', onClick: () => openAbout(game) }, 'About this prototype'),
      h('div', { class: 'row row--center' }, soundToggle(game), motionToggle(game)),
      h('button', { type: 'button', class: 'btn btn--quiet', onClick: go(() => game.returnToTitle()) }, live ? 'Leave to the title screen (the session keeps running)' : 'Leave the demo'),
    ),
  );
  ref.current = game.overlays.open(content, { id: 'pause', kind: 'modal', label: 'Menu' });
  return ref.current;
}

// ---------------------------------------------------------------- the optional gathering-place activity
export function openActivity(game) {
  const ref = { current: null };
  const body = h('div');
  const paint = () => {
    const prog = game.state.progress();
    body.replaceChildren(
      h('p', null, ACTIVITY.intro),
      h('ul', { class: 'summary' }, prog.items.map((it) => h('li', null,
        h('span', { class: `tick ${it.done ? 'tick--on' : ''}`, 'aria-hidden': 'true' }, it.done ? '✓' : ''),
        h('span', null, h('strong', null, it.label), h('span', { class: 'summary__sub' }, `${AREAS[it.category].label} — ${it.done ? 'done' : 'not yet'}`))))),
      prog.complete ? h('p', { class: 'banner banner--ok', role: 'status' }, ACTIVITY.done) : h('p', { class: 'fine' }, `${prog.count} of ${prog.items.length} are in the garden.`),
      game.kind === 'demo' && !prog.complete ? h('button', { type: 'button', class: 'btn btn--primary', onClick: () => { game.plantNextDemo(); } }, 'Plant the next fictional memory') : null,
    );
  };
  paint();
  const unsub = game.state.subscribe(paint);
  const content = h('div', { class: 'panel panel--small' },
    h('h2', null, ACTIVITY.title),
    body,
    h('div', { class: 'row row--end' }, closeBtn(ref)),
  );
  ref.current = game.overlays.open(content, { id: 'activity', kind: 'modal', label: ACTIVITY.title, onClose: unsub });
  return ref.current;
}

export { TEMP_STORAGE_NOTE };
