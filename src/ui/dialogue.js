// =============================================================================
//  dialogue.js — dialogue panel (subtitles are the panel itself) and the examine panel.
//  Nothing advances on its own: the player presses Next or picks a choice.
// =============================================================================
import { h } from './dom.js';
import { DIALOGUES, EXAMINE } from '../data/content.js';
import { objectiveFor } from '../state/logic.js';
import { illustrationElement } from '../art/illustrations.js';

/**
 * Run a conversation. onEnd(marker) is called exactly once when it closes
 * (marker is the final node's `end` value, e.g. 'summary', otherwise undefined).
 */
export function openDialogue(game, treeId, { onEnd = () => {} } = {}) {
  const tree = DIALOGUES[treeId];
  if (!tree) { console.warn(`Unknown dialogue: ${treeId}`); onEnd(); return null; }

  let nodeId = tree.start;
  let finished = false;
  const ref = { current: null };
  const root = h('div', { class: 'dialogue', 'aria-live': 'off' });
  let currentChoices = [];
  let currentNext = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    const node = tree.nodes[nodeId];
    const marker = node && !node.next && !node.choices ? node.end : undefined;
    try { onEnd(marker); } catch (e) { console.error(e); }
  };

  const textOf = (node) => (typeof node.text === 'function' ? node.text(game.p, { objective: objectiveFor }) : node.text);

  const go = (id) => {
    nodeId = id;
    const node = tree.nodes[id];
    if (!node) { ref.current.close(); return; }
    if (node.effect) { try { node.effect(game.actions); } catch (e) { console.error(e); } }
    game.sound.play('blip');
    render();
  };

  const choose = (choice) => {
    game.sound.play('click');
    if (choice.effect) { try { choice.effect(game.actions); } catch (e) { console.error(e); } }
    if (choice.next) go(choice.next);
    else ref.current.close();
  };

  function render() {
    const node = tree.nodes[nodeId];
    const text = textOf(node);
    currentChoices = node.choices || [];
    currentNext = node.next || null;
    while (root.firstChild) root.removeChild(root.firstChild);

    root.appendChild(h('div', { class: 'dialogue__head' },
      h('span', { class: 'dialogue__speaker' }, node.speaker),
      h('button', { type: 'button', class: 'btn btn--quiet btn--small', onClick: () => ref.current.close(), 'aria-label': 'Leave conversation (Escape)' }, 'Leave ✕'),
    ));

    const body = h('div', { class: 'dialogue__body' });
    if (node.illus) body.appendChild(illustrationElement(node.illus, { w: 240, h: 160, className: 'illus illus--dialogue' }));
    const textCol = h('div', { class: 'dialogue__textcol' });
    // Subtitle text — a live region so screen readers read each new line
    textCol.appendChild(h('p', { class: 'dialogue__text', 'aria-live': 'polite', role: 'status' }, text));
    if (node.consent) {
      textCol.appendChild(h('div', { class: 'consent-card', role: 'note' },
        h('span', { class: 'consent-card__icon', 'aria-hidden': 'true' }, '🔒'),
        h('div', null, h('strong', null, node.consent.title), h('span', null, node.consent.body))));
    }
    body.appendChild(textCol);
    root.appendChild(body);

    const actions = h('div', { class: 'dialogue__actions' });
    let focusEl = null;
    if (currentChoices.length) {
      const list = h('ol', { class: 'choices' });
      currentChoices.forEach((c, i) => {
        const seen = c.seen ? c.seen(game.p) : false;
        const btn = h('button', { type: 'button', class: `choice ${c.badge ? 'choice--match' : ''}`, onClick: () => choose(c) },
          h('span', { class: 'choice__num', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', { class: 'choice__label' }, c.label),
          seen ? h('span', { class: 'choice__seen' }, '✓ asked') : null,
          c.badge ? h('span', { class: 'choice__badge' }, `✓ ${c.badge}`) : null,
        );
        list.appendChild(h('li', null, btn));
        if (i === 0) focusEl = btn;
      });
      actions.appendChild(list);
    } else if (currentNext) {
      const btn = h('button', { type: 'button', class: 'btn btn--primary', onClick: () => { game.sound.play('click'); go(currentNext); } }, 'Next ▸');
      actions.appendChild(btn);
      focusEl = btn;
    } else {
      const btn = h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ref.current.close() }, node.end === 'summary' ? 'See what we kept' : 'Close');
      actions.appendChild(btn);
      focusEl = btn;
    }
    root.appendChild(actions);
    root.appendChild(h('p', { class: 'dialogue__hint' }, currentChoices.length ? 'Press 1–3 to choose · Esc to leave' : 'Enter or E to continue · Esc to leave'));
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  // Keys: 1-3 pick a choice, E continues. (Enter / Space already work on the focused button.)
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
    if (m && currentChoices[Number(m[1]) - 1]) {
      e.preventDefault();
      choose(currentChoices[Number(m[1]) - 1]);
    } else if (e.code === 'KeyE' && !currentChoices.length && currentNext) {
      e.preventDefault();
      game.sound.play('click');
      go(currentNext);
    }
  });

  ref.current = game.overlays.open(root, { id: 'dialogue', kind: 'dialogue', label: 'Conversation', onClose: finish });
  go(tree.start);
  return ref.current;
}

// ---------------------------------------------------------------- examine panel
export function openExamine(game, itemId) {
  const { item } = game.actions.examine(itemId);
  if (!item) return null;
  const ref = { current: null };
  let side = 'front';
  const root = h('div', { class: 'panel panel--examine' });

  function render() {
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(h('h2', null, item.title));
    const stage = h('div', { class: 'examine__stage' });
    if (side === 'front') {
      stage.appendChild(illustrationElement(item.illus, { w: 480, h: 320, className: 'illus illus--examine' }));
    } else {
      stage.appendChild(h('div', { class: 'photo-back', role: 'img', 'aria-label': 'Back of the photograph, blank' }, h('span', null, '— blank —')));
    }
    root.appendChild(stage);
    root.appendChild(h('p', { class: 'examine__text' }, side === 'front' ? item.seenText : item.backText));
    if (side === 'front') root.appendChild(h('p', { class: 'callout' }, item.missingText));
    const row = h('div', { class: 'row row--end' });
    if (item.backText) {
      row.appendChild(h('button', { type: 'button', class: 'btn', onClick: () => { side = side === 'front' ? 'back' : 'front'; render(); } }, side === 'front' ? 'Turn it over' : 'Turn it back'));
    }
    row.appendChild(h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ref.current.close() }, 'Done'));
    root.appendChild(row);
  }
  render();
  ref.current = game.overlays.open(root, { id: 'examine', kind: 'modal', label: item.title });
  return ref.current;
}

export const EXAMINE_IDS = Object.keys(EXAMINE);
