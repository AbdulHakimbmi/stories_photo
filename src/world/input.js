// =============================================================================
//  input.js — keyboard + pointer-drag input. Created ONCE (no duplicate listeners).
//  No pointer lock is used, so Esc simply pauses and nothing is ever "captured".
// =============================================================================
const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyR']);

function isTyping(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

export class Input {
  /**
   * @param {HTMLElement} canvas  element that receives drag + wheel
   * @param {{onKey:(e:KeyboardEvent)=>void, onDrag:(dx:number,dy:number)=>void, onWheel:(dy:number)=>void, shouldCapture:()=>boolean}} cb
   */
  constructor(canvas, cb) {
    this.canvas = canvas;
    this.cb = cb;
    this.keys = new Set();
    this.dragId = null;
    this.last = { x: 0, y: 0 };

    this.onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target) && e.code !== 'Escape') return;
      if (MOVE_CODES.has(e.code)) {
        if (this.cb.shouldCapture()) {
          this.keys.add(e.code);
          if (e.code.startsWith('Arrow')) e.preventDefault();
        }
      }
      this.cb.onKey(e);
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    this.onBlur = () => this.clear();
    this.onVisibility = () => { if (document.hidden) this.clear(); };

    this.onPointerDown = (e) => {
      if (!this.cb.shouldCapture()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.dragId = e.pointerId;
      this.last = { x: e.clientX, y: e.clientY };
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.canvas.classList.add('dragging');
    };
    this.onPointerMove = (e) => {
      if (this.dragId !== e.pointerId) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      if (this.cb.shouldCapture()) this.cb.onDrag(dx, dy);
    };
    this.onPointerUp = (e) => {
      if (this.dragId !== e.pointerId) return;
      this.dragId = null;
      this.canvas.classList.remove('dragging');
    };
    this.onWheel = (e) => {
      if (!this.cb.shouldCapture()) return;
      e.preventDefault();
      this.cb.onWheel(e.deltaY);
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('lostpointercapture', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Forget every held key and any drag (called whenever a panel opens, so nothing sticks). */
  clear() {
    this.keys.clear();
    this.dragId = null;
    this.canvas.classList.remove('dragging');
  }

  get forward() { return this.keys.has('KeyW') || this.keys.has('ArrowUp'); }
  get back() { return this.keys.has('KeyS') || this.keys.has('ArrowDown'); }
  get left() { return this.keys.has('KeyA') || this.keys.has('ArrowLeft'); }
  get right() { return this.keys.has('KeyD') || this.keys.has('ArrowRight'); }
  get camLeft() { return this.keys.has('KeyQ'); }
  get camRight() { return this.keys.has('KeyR'); }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
