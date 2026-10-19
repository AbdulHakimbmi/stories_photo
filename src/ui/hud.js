// =============================================================================
//  hud.js — on-screen heads-up display: session chips, gathering-place progress, buttons,
//  the "press E" prompt and toasts.
// =============================================================================
import { h } from './dom.js';
import { GAME_TITLE } from '../data/content.js';

export function createHud(game) {
  const root = document.getElementById('hud');
  const toasts = document.getElementById('toasts');

  const modeChip = h('span', { class: 'hchip' });
  const connChip = h('span', { class: 'hchip', role: 'status' });
  const lockChip = h('span', { class: 'hchip hchip--warn', hidden: true }, 'New uploads paused');
  const actBtn = h('button', { type: 'button', class: 'hud__progress', onClick: () => game.openActivity(), 'aria-label': 'Gathering place activity' });
  const status = h('div', { class: 'hud__status' },
    h('div', { class: 'hud__name' }, GAME_TITLE),
    h('div', { class: 'hud__chips' }, modeChip, connChip, lockChip),
    actBtn);

  const hostBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.toggleDock() });
  const viewBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.toggleOverview() });
  const soundBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.setMuted(!game.settings.muted) });
  const menuBtn = h('button', { type: 'button', class: 'btn btn--hud', onClick: () => game.openMenu(), 'aria-label': 'Menu (Escape)' }, 'Menu ', h('kbd', null, 'Esc'));
  const buttons = h('div', { class: 'hud__buttons' }, hostBtn, viewBtn, soundBtn, menuBtn);

  const promptLabel = h('span', { class: 'prompt__label' });
  const prompt = h('button', { type: 'button', class: 'prompt', hidden: true, onClick: () => game.interact() }, h('kbd', null, 'E'), promptLabel);
  const hint = h('p', { class: 'hud__hint' }, 'WASD / arrows move · drag to look · click a plant to open it · G whole garden · H host panel');

  root.append(status, buttons, prompt, hint);

  function paintSound() {
    soundBtn.textContent = game.settings.muted ? 'Sound: off' : 'Sound: on';
    soundBtn.setAttribute('aria-pressed', String(!game.settings.muted));
  }

  function refresh() {
    const live = game.kind === 'live';
    const st = game.state.meta;
    modeChip.textContent = live ? `Live session${st.name ? ` — ${st.name}` : ''}` : 'Fictional demo';
    modeChip.classList.toggle('hchip--demo', !live);
    connChip.hidden = !live;
    if (live) {
      const label = game.connectionLabel();
      connChip.textContent = label;
      connChip.classList.toggle('hchip--bad', game.live && game.live.status !== 'online');
      connChip.classList.toggle('hchip--ok', game.live && game.live.status === 'online');
    }
    lockChip.hidden = !(live && st.locked && !st.ended);
    if (live && st.ended) { lockChip.hidden = false; lockChip.textContent = 'Session ended'; } else lockChip.textContent = 'New uploads paused';
    const prog = game.state.progress();
    actBtn.textContent = prog.complete ? 'Gathering place: grown' : `Gathering place: ${prog.count} of ${prog.items.length}`;
    const n = game.dock ? game.dock.pending : 0;
    hostBtn.textContent = '';
    hostBtn.append(live ? 'Host panel' : 'Demo panel', n ? h('span', { class: 'count', 'aria-label': `${n} waiting for approval` }, String(n)) : null, ' ', h('kbd', null, 'H'));
    hostBtn.setAttribute('aria-expanded', String(!!(game.dock && game.dock.isOpen)));
    viewBtn.textContent = game.overview ? 'Back to walking' : 'View whole garden';
    viewBtn.setAttribute('aria-pressed', String(!!game.overview));
    paintSound();
  }

  function setPrompt(label) {
    if (!label) { prompt.hidden = true; return; }
    promptLabel.textContent = label;
    prompt.hidden = false;
  }

  function setVisible(visible) { root.hidden = !visible; }

  /** @param {{ms?:number, action?:{label:string, run:()=>void}}} opts */
  function toast(msg, opts = 4500) {
    const o = typeof opts === 'number' ? { ms: opts } : (opts || {});
    const t = h('div', { class: 'toast' }, h('span', null, msg));
    if (o.action) {
      t.appendChild(h('button', { type: 'button', class: 'toast__btn', onClick: () => { t.remove(); o.action.run(); } }, o.action.label));
    }
    toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.removeChild(toasts.firstChild);
    setTimeout(() => t.remove(), o.ms || 4500);
  }

  return { refresh, setPrompt, setVisible, toast, paintSound };
}
