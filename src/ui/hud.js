// =============================================================================
//  hud.js — on-screen heads-up display: objective, progress, buttons, interaction prompt,
//  toasts, and the presenter-mode control panel.
// =============================================================================
import { h, clear } from './dom.js';
import { MISSIONS, MISSION_IDS } from '../data/content.js';
import { LOCATIONS } from '../world/config.js';
import { objectiveFor, progressLabel, missionStatus, STATUS_LABEL } from '../state/logic.js';
import { openConfirm } from './screens.js';

const CUES = [
  ['0:00', 'Void deck: point out the “proposed future” framing, Aisha, the empty public board and the kiosk.'],
  ['0:25', 'Jump to the Lim home. Examine the photo, talk to Lim and Mei, then in the journal attach two verified details, keep both recollections and choose the agreed sharing.'],
  ['1:10', 'Jump to the corridor. Hear both neighbours, ask about names, then keep both perspectives and mark the date uncertain.'],
  ['1:50', 'Jump to the quiet corner. Try “Public” so Auntie Salmah gently explains her wish, correct to family-only.'],
  ['2:20', 'Short on time? Use a clearly labelled “staged” shortcut for anything skipped. Then use the kiosk to contribute a sample memory.'],
  ['2:45', 'Open the archive: public board versus restricted list. Return to Aisha for the summary.'],
];

export function createHud(game) {
  const root = document.getElementById('hud');
  const toasts = document.getElementById('toasts');
  const presenterRoot = document.getElementById('presenter');

  const progress = h('div', { class: 'hud__progress' });
  const objective = h('div', { class: 'hud__objective' });
  const status = h('div', { class: 'hud__status', 'aria-label': 'Progress and objective' }, progress, objective);

  const journalBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.toggleJournal(), 'aria-label': 'Open memory journal (J)' }, 'Journal ', h('kbd', null, 'J'));
  const soundBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.setMuted(!game.settings.muted) });
  const pauseBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.openPauseMenu(), 'aria-label': 'Pause and settings (Escape)' }, 'Pause ', h('kbd', null, 'Esc'));
  const buttons = h('div', { class: 'hud__buttons' }, journalBtn, soundBtn, pauseBtn);

  const promptLabel = h('span', { class: 'prompt__label' });
  const prompt = h('button', { type: 'button', class: 'prompt', hidden: true, onClick: () => game.interact() }, h('kbd', null, 'E'), promptLabel);
  const hint = h('p', { class: 'hud__hint' }, 'WASD / arrows move · drag to look around · E interact · J journal');

  root.append(status, buttons, prompt, hint);

  function paintSound() {
    soundBtn.textContent = game.settings.muted ? 'Sound: off' : 'Sound: on';
    soundBtn.setAttribute('aria-pressed', String(!game.settings.muted));
  }

  function refresh() {
    const p = game.p;
    progress.textContent = progressLabel(p);
    objective.textContent = '';
    objective.append(h('strong', null, 'Objective: '), objectiveFor(p));
    paintSound();
    paintPresenter();
  }

  function setPrompt(label) {
    if (!label) { prompt.hidden = true; return; }
    promptLabel.textContent = label;
    prompt.hidden = false;
  }

  function setVisible(visible) {
    root.hidden = !visible;
    presenterRoot.hidden = !visible || game.store.profile !== 'presenter';
  }

  function toast(msg, ms = 4500) {
    const t = h('div', { class: 'toast' }, msg);
    toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.removeChild(toasts.firstChild);
    setTimeout(() => t.remove(), ms);
  }

  // ---------------------------------------------------------------- presenter panel
  let presenterOpen = true;
  function paintPresenter() {
    const isPresenter = game.store.profile === 'presenter' && game.mode === 'playing';
    presenterRoot.hidden = !isPresenter;
    if (!isPresenter) return;
    const p = game.p;
    const wasOpen = presenterRoot.querySelector('details');
    if (wasOpen) presenterOpen = wasOpen.open;
    clear(presenterRoot);
    const details = h('details', { class: 'presenter', open: presenterOpen },
      h('summary', null, 'Presenter tools'),
      h('p', { class: 'fine' }, 'All three missions are ready and none is completed. Do them live, or use a labelled “staged” shortcut.'),
      h('h3', null, 'Jump to'),
      h('div', { class: 'presenter__jumps' }, Object.entries(LOCATIONS).filter(([k]) => k !== 'kiosk').map(([k, loc]) => h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.teleportTo(k) }, loc.label)),
        h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.teleportTo('kiosk') }, 'Kiosk and board')),
      h('h3', null, 'Missions'),
      h('ul', { class: 'presenter__missions' }, MISSION_IDS.map((id) => {
        const st = missionStatus(p, id);
        return h('li', null,
          h('span', { class: 'presenter__mname' }, MISSIONS[id].title),
          h('span', { class: 'fine' }, STATUS_LABEL[st]),
          p[id].done ? null : h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.actions.stageMission(id) }, 'Stage as demo shortcut'));
      })),
      h('div', { class: 'row' },
        h('button', {
          type: 'button', class: 'btn btn--small btn--danger',
          onClick: () => openConfirm(game, { title: 'Reset all missions?', body: 'This puts all three missions back to their ready-to-demonstrate state and clears presenter-mode contributions. Normal play progress is not touched.', confirmLabel: 'Reset missions', danger: true, onConfirm: () => game.resetCurrentProfile() }),
        }, 'Reset all missions'),
        h('button', { type: 'button', class: 'btn btn--small', onClick: () => game.returnToTitle() }, 'Exit presenter mode'),
      ),
      h('h3', null, 'Three-minute run sheet'),
      h('ol', { class: 'presenter__cues' }, CUES.map(([t, text]) => h('li', null, h('b', null, t), ' ', text))),
    );
    presenterRoot.appendChild(details);
  }

  return { refresh, setPrompt, setVisible, toast, paintSound };
}
