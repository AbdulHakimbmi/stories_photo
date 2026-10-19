// =============================================================================
//  main.js — wires everything together: renderer, world, player, state, UI.
//  Reading order if you are new to the code:
//    data/content.js  →  state/logic.js  →  world/world.js  →  ui/*.js  →  this file
// =============================================================================
import * as THREE from 'three';
import './style.css';
import { Overlays, makeAnnouncer } from './ui/dom.js';
import { Sound } from './audio/sound.js';
import {
  GameStore, createActions, getBrowserStorage, loadSettings, saveSettings,
  aishaTreeFor, publicRecords, canContribute, attentionIds,
} from './state/logic.js';
import { buildWorld } from './world/world.js';
import { Player } from './world/player.js';
import { Input } from './world/input.js';
import { LOCATIONS } from './world/config.js';
import { createHud } from './ui/hud.js';
import { openDialogue, openExamine } from './ui/dialogue.js';
import { openJournal } from './ui/journal.js';
import { openArchive } from './ui/archive.js';
import { openTitle, openIntro, openPause, openEnding } from './ui/screens.js';

const NEEDS_BRIEFING = new Set(['lim', 'mei', 'm1_photo', 'm1_pot', 'm1_note', 'devi', 'rahman', 'm2_photo', 'salmah']);
const EXAMINE_IDS = new Set(['m1_photo', 'm1_pot', 'm1_note', 'm2_photo']);

class Game {
  constructor() {
    const { storage, persistent } = getBrowserStorage();
    this.storage = storage;
    this.settings = loadSettings(storage, window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.store = new GameStore(storage, { persistent });
    this.store.load('play');
    this.mode = 'title';           // 'title' | 'playing'
    this.target = null;
    this.notice = null;
    this.boardSignature = '';
    this.sound = new Sound();
    this.sound.setMuted(this.settings.muted);
    document.documentElement.classList.toggle('reduce-motion', this.settings.reducedMotion);

    const q = new URLSearchParams(window.location.search);
    this.lowFx = q.has('low');

    // ---- renderer
    const canvas = document.getElementById('game');
    // Performance: sharp-screen laptops (pixel ratio >= 1.5) do not need multisampling, and we cap
    // the render resolution at 1.5x. If the frame rate stays low the resolution is reduced further
    // (see adaptResolution), because drawing fewer pixels is the single biggest saving.
    const dpr = window.devicePixelRatio || 1;
    this.maxPixelRatio = this.lowFx ? 1 : Math.min(dpr, 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowFx && dpr < 1.5, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = !this.lowFx;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.perf = { frames: 0, acc: 0, n: 0, since: 0 };
    this.fpsBox = null;
    if (q.has('fps')) { // add ?fps to the address to see a small performance read-out
      this.fpsBox = document.createElement('div');
      this.fpsBox.setAttribute('aria-hidden', 'true');
      this.fpsBox.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:50;padding:3px 7px;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.6);border-radius:4px;pointer-events:none';
      document.body.appendChild(this.fpsBox);
      this.fpsAcc = 0; this.fpsN = 0;
    }
    this.frameCount = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showFatal('The graphics context was lost (this can happen if the GPU is busy or the laptop sleeps).'); });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 220);
    this.world = buildWorld({ scene: this.scene, lowFx: this.lowFx, merge: !q.has('nomerge') });

    // ---- UI plumbing
    const overlayRoot = document.getElementById('overlays');
    this.overlays = new Overlays(overlayRoot);
    this.announce = makeAnnouncer(overlayRoot);
    this.actions = createActions(this.store, {
      toast: (m) => { this.hud.toast(m); this.announce(m); },
      sfx: (n) => this.sound.play(n),
    });
    this.hud = createHud(this);
    this.hud.setVisible(false);

    // ---- input + player
    this.input = new Input(canvas, {
      onKey: (e) => this.onKey(e),
      onDrag: (dx, dy) => this.player.rotate(dx, dy),
      onWheel: (dy) => this.player.zoom(dy),
      shouldCapture: () => this.mode === 'playing' && !this.overlays.isOpen,
    });
    this.player = new Player({ scene: this.scene, camera: this.camera, colliders: this.world.colliders, input: this.input });
    this.player.model.visible = false;

    this.overlays.onChange = () => {
      this.input.clear();                       // a panel opening/closing can never leave a key "stuck"
      if (this.overlays.isOpen) { this.hud.setPrompt(null); this.world.setHighlight(null); this.target = null; }
      document.body.classList.toggle('has-overlay', this.overlays.isOpen);
    };
    // Keep HUD, board texture and markers in sync with every state change (one subscription only).
    this.store.subscribe(() => this.refresh());

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    this.refresh();
    openTitle(this);
    requestAnimationFrame(this.loop);
    window.__game = this; // handy for debugging in the browser console
  }

  get p() { return this.store.p; }
  get reducedMotion() { return !!this.settings.reducedMotion; }

  // ------------------------------------------------------------------ settings
  setMuted(m) {
    this.settings.muted = !!m;
    this.sound.setMuted(this.settings.muted);
    saveSettings(this.storage, this.settings);
    this.hud.paintSound();
    if (!m) this.sound.play('click');
  }

  setReducedMotion(v) {
    this.settings.reducedMotion = !!v;
    document.documentElement.classList.toggle('reduce-motion', this.settings.reducedMotion);
    saveSettings(this.storage, this.settings);
  }

  storageWarning() {
    if (!this.store.persistent) return 'Local storage is unavailable in this browser, so progress cannot be saved. The demo still works, but progress is lost when you close the page.';
    return this.store.loadWarning;
  }
  takeNotice() { const n = this.notice; this.notice = null; return n; }
  playStarted() { return !!(this.p.started || this.p.briefed); }

  // ------------------------------------------------------------------ flow
  startPlay() {
    this.sound.unlock();
    this.overlays.closeAll();
    this.store.load('play');
    if (!this.p.introSeen) {
      openIntro(this, () => { this.actions.markIntroSeen(); this.enterWorld(true); });
    } else {
      this.enterWorld(false);
    }
  }

  startPresenter() {
    this.sound.unlock();
    this.overlays.closeAll();
    this.store.load('presenter');
    this.enterWorld(false);
    this.hud.toast('Presenter mode: all three missions are ready. None is completed.', 6000);
  }

  enterWorld(first) {
    this.mode = 'playing';
    this.player.model.visible = true;
    this.hud.setVisible(true);
    this.teleportTo('deck');
    this.refresh();
    if (first) this.hud.toast('Press E near Aisha to begin. Drag to look around.', 7000);
  }

  returnToTitle() {
    this.overlays.closeAll();
    this.mode = 'title';
    this.target = null;
    this.hud.setPrompt(null);
    this.hud.setVisible(false);
    this.player.model.visible = false;
    this.store.load('play');
    openTitle(this);
  }

  resetCurrentProfile() {
    this.overlays.closeAll();
    this.store.reset();
    if (this.mode === 'playing') {
      if (this.store.profile === 'play' && !this.p.introSeen) {
        this.hud.setVisible(false);
        openIntro(this, () => { this.actions.markIntroSeen(); this.enterWorld(true); });
      } else {
        this.enterWorld(false);
        this.hud.toast(this.store.profile === 'presenter' ? 'Presenter missions reset. Ready to demonstrate.' : 'Demo reset.');
      }
    }
  }

  resetAllProgress() {
    this.store.resetAll();
    this.store.load('play');
    this.notice = 'All demo progress was cleared.';
    this.overlays.closeAll();
    openTitle(this);
  }

  /** "I'm stuck" — always works, from anywhere. */
  recoverPlayer() {
    this.overlays.closeAll();
    this.input.clear();
    this.teleportTo('deck');
    this.hud.toast('Back at the void deck.');
  }

  teleportTo(key) {
    const loc = LOCATIONS[key];
    if (!loc) return;
    this.overlays.closeAll();
    this.player.teleport(loc.x, loc.z, loc.yaw);
  }

  // ------------------------------------------------------------------ panels
  openPauseMenu() { if (this.mode === 'playing' && !this.overlays.has('pause')) openPause(this); }
  openJournal(opts) { if (!this.overlays.has('journal')) openJournal(this, opts); }
  toggleJournal() {
    if (this.overlays.has('journal')) { this.overlays.closeById('journal'); return; }
    if (this.mode === 'playing' && !this.overlays.isOpen) { this.sound.play('open'); openJournal(this); }
  }
  openArchive(opts) { if (!this.overlays.has('archive')) openArchive(this, opts); }
  openEnding() { if (!this.overlays.has('ending')) openEnding(this); }
  afterJournalClosed() { this.refresh(); }
  afterArchiveClosed() { this.refresh(); }

  // ------------------------------------------------------------------ interaction
  interact() {
    if (this.mode !== 'playing' || this.overlays.isOpen || !this.target) return;
    this.runInteraction(this.target.id);
  }

  runInteraction(id) {
    const p = this.p;
    this.sound.play('open');
    if (!p.briefed && NEEDS_BRIEFING.has(id)) { openDialogue(this, 'hint_unbriefed'); return; }
    if (EXAMINE_IDS.has(id)) { openExamine(this, id); return; }
    switch (id) {
      case 'aisha':
        openDialogue(this, aishaTreeFor(p), { onEnd: (marker) => { if (marker === 'summary') this.openEnding(); } });
        break;
      case 'lim': openDialogue(this, 'lim'); break;
      case 'mei': openDialogue(this, 'mei'); break;
      case 'devi': openDialogue(this, 'devi'); break;
      case 'rahman': openDialogue(this, 'rahman'); break;
      case 'salmah': openDialogue(this, p.m3.done ? 'salmah_done' : 'salmah'); break;
      case 'board': this.openArchive({ tab: 'board' }); break;
      case 'kiosk': this.openArchive({ tab: 'contribute' }); break;
      default: break;
    }
  }

  updateTarget() {
    if (this.overlays.isOpen || this.mode !== 'playing') return;
    let best = null;
    let bestD = Infinity;
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    for (const it of this.world.interactables) {
      const d = Math.hypot(px - it.pos.x, pz - it.pos.z);
      if (d <= it.range && d < bestD) { best = it; bestD = d; }
    }
    if (best !== this.target) {
      this.target = best;
      this.world.setHighlight(best ? best.id : null);
      this.hud.setPrompt(best ? best.label : null);
    }
  }

  /** Keep the HUD, the 3D memory board and the floating markers in sync with the state. */
  refresh() {
    if (!this.hud || !this.world) return;
    const p = this.p;
    this.hud.refresh();
    const pub = publicRecords(p);
    const sig = pub.map((r) => `${r.id}:${r.title}:${r.contributors}`).join('|');
    if (sig !== this.boardSignature) {
      this.boardSignature = sig;
      this.world.updateBoard(pub);        // ONLY public records are ever drawn on the wall
    }
    this.world.setAttention(this.mode === 'playing' || this.mode === 'title' ? attentionIds(p) : []);
  }

  // ------------------------------------------------------------------ input
  onKey(e) {
    this.sound.unlock();
    if (e.code === 'Escape') {
      if (this.overlays.isOpen) {
        const top = this.overlays.top;
        e.preventDefault();
        if (top.onEscape) top.onEscape();
        else if (top.closable) top.close();
      } else if (this.mode === 'playing') {
        e.preventDefault();
        this.openPauseMenu();
      }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyM') { this.setMuted(!this.settings.muted); return; }
    if (this.mode !== 'playing') return;
    if (this.overlays.isOpen) {
      if (e.code === 'KeyJ' && this.overlays.top && this.overlays.top.id === 'journal') this.overlays.top.close();
      return;
    }
    if (e.code === 'KeyE') { e.preventDefault(); this.interact(); }
    else if (e.code === 'KeyJ') { e.preventDefault(); this.toggleJournal(); }
    else if (e.code === 'KeyC') this.player.recenter();
  }

  // ------------------------------------------------------------------ frame loop
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    let focus = this.player.pos;
    if (this.mode === 'title') {
      // slow, calm drift across the void deck behind the title screen
      const a = this.reducedMotion ? 0.4 : t * 0.12;
      this.camera.position.set(-5 + Math.sin(a) * 3.5, 2.0, 5.2);
      this.camera.lookAt(-5 + Math.sin(a) * 1.5, 1.4, -4);
      focus = { x: -5, y: 0, z: -3 };
    } else {
      this.player.update(dt, { canMove: !this.overlays.isOpen, reducedMotion: this.reducedMotion });
      this.updateTarget();
    }
    this.world.update(dt, t, { reducedMotion: this.reducedMotion, playerPos: focus });
    this.frameCount++;
    // While a panel covers the screen the world behind it barely changes: draw it every other frame.
    const covered = this.mode === 'playing' && this.overlays.isOpen;
    if (!covered || this.frameCount % 2 === 0) this.renderer.render(this.scene, this.camera);
    if (!covered) this.adaptResolution(dt, t);
    if (this.fpsBox) {
      this.fpsAcc += dt; this.fpsN += 1;
      if (this.fpsAcc >= 0.5) {
        const info = this.renderer.info;
        this.fpsBox.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ratio ${this.pixelRatio.toFixed(2)} · ${info.render.calls} draws · ${Math.round(info.render.triangles / 1000)}k tris`;
        this.fpsAcc = 0; this.fpsN = 0;
      }
    }
  }

  /** If the average frame rate stays under ~40 fps, quietly render at a lower resolution. */
  adaptResolution(dt, t) {
    const perf = this.perf;
    if (this.lowFx || document.hidden || t < 4) return; // ignore start-up (shader compiling)
    perf.acc += dt;
    perf.n += 1;
    if (perf.acc < 2) return;
    const avg = perf.acc / perf.n;
    perf.acc = 0;
    perf.n = 0;
    if (avg > 1 / 40 || this.pixelRatio <= 0.75) return;
    this.pixelRatio = Math.max(0.75, this.pixelRatio * 0.85);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
  }
}

function showFatal(message) {
  const el = document.getElementById('fallback');
  if (!el) return;
  el.hidden = false;
  const msg = el.querySelector('[data-msg]');
  if (msg) msg.textContent = message;
}

try {
  // eslint-disable-next-line no-new
  new Game();
} catch (err) {
  console.error(err);
  showFatal(`Something went wrong while starting: ${err && err.message ? err.message : err}`);
}
