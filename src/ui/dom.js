// =============================================================================
//  dom.js — tiny DOM helpers and the overlay (modal) manager.
//  All text is inserted with textContent / text nodes, never innerHTML,
//  so anything a player types in the demo form cannot inject markup.
// =============================================================================
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'disabled') el.disabled = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Stack of open panels. The top panel traps Tab. Escape handling lives in the game
 * (it calls handle.onEscape if present, otherwise closes closable panels).
 */
export class Overlays {
  constructor(root) {
    this.root = root;
    this.stack = [];
    this.onChange = () => {};
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const top = this.top;
      if (!top) return;
      const items = focusables(top.wrapper);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !top.wrapper.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !top.wrapper.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
  }

  get isOpen() { return this.stack.length > 0; }
  get top() { return this.stack[this.stack.length - 1] || null; }
  has(id) { return this.stack.some((o) => o.id === id); }

  /**
   * @param {HTMLElement} content
   * @param {{id:string, kind?:string, label?:string, closable?:boolean, onClose?:Function, onEscape?:Function, initialFocus?:HTMLElement}} opts
   */
  open(content, { id, kind = 'modal', label = '', closable = true, onClose = null, onEscape = null, initialFocus = null } = {}) {
    if (id && this.has(id)) this.closeById(id);
    const wrapper = h('div', { class: `overlay overlay--${kind}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label || id || 'Panel' }, content);
    const handle = {
      id, kind, wrapper, closable, onClose, onEscape,
      previousFocus: document.activeElement,
      close: () => this.close(handle),
    };
    this.stack.push(handle);
    this.root.appendChild(wrapper);
    // Only the top panel is interactive; the ones below are hidden from assistive tech.
    this.stack.forEach((o, i) => { o.wrapper.toggleAttribute('inert', i !== this.stack.length - 1); });
    const target = initialFocus || focusables(wrapper)[0];
    if (target) target.focus({ preventScroll: true });
    this.onChange();
    return handle;
  }

  close(handle) {
    const i = this.stack.indexOf(handle);
    if (i < 0) return;
    this.stack.splice(i, 1);
    handle.wrapper.remove();
    this.stack.forEach((o, idx) => { o.wrapper.toggleAttribute('inert', idx !== this.stack.length - 1); });
    const back = handle.previousFocus;
    if (back && document.body.contains(back) && typeof back.focus === 'function') back.focus({ preventScroll: true });
    if (handle.onClose) { try { handle.onClose(); } catch (e) { console.error(e); } }
    this.onChange();
  }

  closeById(id) { const o = this.stack.find((x) => x.id === id); if (o) this.close(o); }
  closeTop() { const t = this.top; if (t) this.close(t); }
  closeAll() { while (this.stack.length) this.close(this.stack[this.stack.length - 1]); }
}

/** Polite announcement for screen readers (e.g. "Saved as family-only"). */
export function makeAnnouncer(root) {
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  root.appendChild(live);
  return (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };
}
