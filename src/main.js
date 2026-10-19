// =============================================================================
//  main.js — wires everything together: renderer, garden world, player, state, live session, UI.
//  Reading order if you are new to the code:
//    data/content.js → garden/state.js → net/live.js → world/garden.js + world/plant.js → ui/*.js → this file
//
//  Two modes share the same world and the same state object:
//    • "live": a LiveSession talks to the garden server (phones upload, the host approves).
//    • "demo": fictional memories drawn in code; nothing is uploaded and no server is needed.
// =============================================================================
import * as THREE from 'three';
import './style.css';
import { Overlays, makeAnnouncer } from './ui/dom.js';
import { Sound } from './audio/sound.js';
import { loadSettings, saveSettings } from './settings.js';
import { GardenState } from './garden/state.js';
import { LiveSession, ApiError, createSession, loadSavedHost, saveHost, forgetHost } from './net/live.js';
import { DEMO_MEMORIES, DEMO_NEXT, GAME_TITLE } from './data/content.js';
import { drawIllustration } from './art/illustrations.js';
import { buildGarden } from './world/garden.js';
import { Player } from './world/player.js';
import { Input } from './world/input.js';
import { LOCATIONS, OVERVIEW } from './world/config.js';
import { createHud } from './ui/hud.js';
import { createDock } from './ui/host-dock.js';
import { openMemoryPanel } from './ui/memory-panel.js';
import { openTitle, openMenu, openActivity, openNotice } from './ui/screens.js';

const OV_POS = new THREE.Vector3(...OVERVIEW.pos);
const OV_LOOK = new THREE.Vector3(...OVERVIEW.look);

class Game {
  constructor() {
    this.settings = loadSettings();
    this.mode = 'title';          // 'title' | 'playing'
    this.kind = 'demo';           // 'live' | 'demo' (what the garden currently shows)
    this.overview = false;
    this.blend = 0;               // 0 = walking camera, 1 = whole-garden camera
    this.target = null;
    this.live = null;
    this.memoryView = null;
    this.state = new GardenState();
    this.sound = new Sound();
    this.sound.setMuted(this.settings.muted);
    document.documentElement.classList.toggle('reduce-motion', this.settings.reducedMotion);
    document.title = `${GAME_TITLE} — a proposed future experience (prototype)`;

    const q = new URLSearchParams(window.location.search);
    this.lowFx = q.has('low');

    // ---- renderer (performance choices explained in the README)
    const canvas = document.getElementById('game');
    const dpr = window.devicePixelRatio || 1;
    this.maxPixelRatio = this.lowFx ? 1 : Math.min(dpr, 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowFx && dpr < 1.5, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = !this.lowFx;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.perf = { acc: 0, n: 0 };
    this.fpsBox = null;
    if (q.has('fps')) { // add ?fps to the address to see a small performance read-out
      this.fpsBox = document.createElement('div');
      this.fpsBox.setAttribute('aria-hidden', 'true');
      this.fpsBox.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:50;padding:3px 7px;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.6);border-radius:4px;pointer-events:none';
      document.body.appendChild(this.fpsBox);
      this.fpsAcc = 0; this.fpsN = 0;
    }
    this.frameCount = 0;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showFatal('The graphics context was lost (this can happen if the GPU is busy or the laptop sleeps). Reload the page; a live session can be resumed from the title screen.'); });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 240);
    this.garden = buildGarden({ scene: this.scene, lowFx: this.lowFx, merge: !q.has('nomerge'), resolveImage: (m) => this.resolveImage(m) });
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._look = new THREE.Vector3();

    // ---- UI plumbing
    const overlayRoot = document.getElementById('overlays');
    this.overlays = new Overlays(overlayRoot);
    this.announce = makeAnnouncer(overlayRoot);
    this.hud = createHud(this);
    this.hud.setVisible(false);
    this.dock = createDock(this);

    // ---- input + player
    this.input = new Input(canvas, {
      onKey: (e) => this.onKey(e),
      onDrag: (dx, dy) => this.player.rotate(dx, dy),
      onWheel: (dy) => this.player.zoom(dy),
      onTap: (x, y) => this.onTap(x, y),
      shouldCapture: () => this.mode === 'playing' && !this.overlays.isOpen,
    });
    this.player = new Player({ scene: this.scene, camera: this.camera, colliders: this.garden.colliders, input: this.input });
    this.player.model.visible = false;

    this.overlays.onChange = () => {
      this.input.clear();                       // a panel opening/closing can never leave a key "stuck"
      if (this.overlays.isOpen) { this.hud.setPrompt(null); this.garden.setHighlight(null); this.target = null; }
      document.body.classList.toggle('has-overlay', this.overlays.isOpen);
    };

    this.state.subscribe((change) => this.onStateChange(change));

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    this.hud.refresh();
    openTitle(this);
    requestAnimationFrame(this.loop);
    window.__game = this; // handy for debugging in the browser console
  }

  get reducedMotion() { return !!this.settings.reducedMotion; }

  // ------------------------------------------------------------------ settings
  setMuted(m) {
    this.settings.muted = !!m;
    this.sound.setMuted(this.settings.muted);
    saveSettings(this.settings);
    this.hud.paintSound();
    if (!m) this.sound.play('click');
  }
  setReducedMotion(v) {
    this.settings.reducedMotion = !!v;
    document.documentElement.classList.toggle('reduce-motion', this.settings.reducedMotion);
    saveSettings(this.settings);
  }

  // ------------------------------------------------------------------ images for the 3D photo cards
  resolveImage(m) {
    if (m.fictional && m.illus) return { canvas: drawIllustration(m.illus, 512, 341) };
    if (this.live) return { url: this.live.publicImageUrl(m.id, 'thumb') };
    return null;
  }

  // ------------------------------------------------------------------ modes
  savedHost() { return loadSavedHost(); }
  forgetSaved() {
    forgetHost();
    this.overlays.closeAll();
    openTitle(this, { notice: 'The saved session was forgotten in this browser.' });
  }

  /** Throw away whatever the garden shows now (before starting something else). */
  resetWorld() {
    this.overlays.closeAll();
    if (this.live) { this.live.stop(); this.live = null; }
    this.state.clear();
    this.state.patchMeta({ name: '', locked: false, ended: false }, false);
    this.garden.clearMemories();
    this.garden.setGathering(false);
    this.dock.reset();
    this.overview = false;
    this.blend = 0;
    this.memoryView = null;
    this.lostShown = false;
  }

  async startLive() {
    const creds = await createSession('Our Memory Garden');
    saveHost({ hostToken: creds.hostToken, joinToken: creds.joinToken, name: creds.name });
    await this.beginLive(creds, true);
  }

  async resumeLive() {
    const saved = loadSavedHost();
    if (!saved) throw new Error('There is no saved session in this browser.');
    try { await this.beginLive(saved, false); } catch (err) {
      if (err instanceof ApiError && [401, 404, 410].includes(err.status)) {
        forgetHost();
        throw new Error('That session has ended or expired, so it was forgotten. Start a new live session instead.');
      }
      throw err;
    }
  }

  async beginLive(creds, fresh) {
    this.resetWorld();
    this.kind = 'live';
    const live = new LiveSession(creds, this.state, {
      onStatus: (s) => { if (this.live === live) this.onConnectionStatus(s); },
      onCounts: (c) => { if (this.live === live) this.onCounts(c); },
    });
    this.live = live;
    try { await live.start(); } catch (err) {
      live.stop();
      this.live = null;
      this.kind = 'demo';
      this.state.clear();
      throw err;
    }
    this.enterWorld();
    this.dock.open('invite');
    if (fresh) this.hud.toast('Scan the QR code with a phone on the same Wi-Fi to add a photograph.', 8000);
    else this.hud.toast('Session resumed.');
  }

  startDemo() {
    this.resetWorld();
    this.kind = 'demo';
    this.state.replaceAll({ memories: DEMO_MEMORIES });
    this.enterWorld();
    this.hud.toast('Fictional demo: click a plant, or use the Demo panel (H).', 7000);
  }

  plantNextDemo() {
    const next = DEMO_NEXT.find((m) => !this.state.get(m.id));
    if (!next) return;
    this.state.upsertMemory(next);
    this.dock.onGardenChanged();
  }

  resetDemo() {
    if (this.kind !== 'demo') return;
    this.overlays.closeAll();
    this.state.replaceAll({ memories: DEMO_MEMORIES });
    this.garden.setGathering(false);
    this.dock.onGardenChanged();
    this.hud.toast('Demo reset.');
  }

  enterWorld() {
    this.overlays.closeAll();
    this.mode = 'playing';
    this.player.model.visible = true;
    this.hud.setVisible(true);
    this.teleportTo('gate');
    this.hud.refresh();
    document.getElementById('game').focus({ preventScroll: true });
  }

  returnToTitle(opts = {}) {
    this.resetWorld();
    this.kind = 'demo';
    this.mode = 'title';
    this.target = null;
    this.hud.setPrompt(null);
    this.hud.setVisible(false);
    this.player.model.visible = false;
    this.hud.refresh();
    openTitle(this, opts);
  }

  afterSessionDeleted() { this.returnToTitle({ notice: 'All data for that session was deleted from the server.' }); }

  connectionLabel() {
    const s = this.live ? this.live.status : 'offline';
    return { online: 'Connected', connecting: 'Connecting…', offline: 'Reconnecting…', expired: 'Session expired', ended: 'Session unavailable' }[s] || s;
  }

  onConnectionStatus(s) {
    this.hud.refresh();
    if (this.dock.isOpen) this.dock.onMetaChanged();
    if ((s === 'expired' || s === 'ended') && !this.lostShown && this.mode === 'playing') {
      this.lostShown = true;
      const expired = s === 'expired';
      openNotice(this, {
        title: expired ? 'This session expired' : 'The server no longer knows this session',
        paragraphs: expired
          ? ['Sessions are temporary. This one reached its time limit and its photographs and stories were deleted from the server.']
          : ['The session may have been deleted, or the server’s data was cleared and restarted. Photographs and stories from it are no longer stored.'],
        buttonLabel: 'Back to the title screen',
        onClose: () => { forgetHost(); this.returnToTitle({ notice: expired ? 'The session expired and was deleted.' : 'The session is no longer available.' }); },
      });
    }
  }

  onCounts(c) {
    const { before, after } = this.dock.setCounts(c);
    this.hud.refresh();
    if (this.mode === 'playing' && after > before) {
      this.sound.play('soft');
      const n = after;
      this.hud.toast(`${n} item${n === 1 ? ' is' : 's are'} waiting for your approval.`, { ms: 7000, action: { label: 'Review', run: () => this.toggleDock(true, 'queue') } });
    }
  }

  /** The host panel can also be used to type a recollection (it still waits for approval). */
  async addRecollection(memoryId, { name, text }) {
    if (this.kind === 'live') {
      await this.live.addResponse(memoryId, { name, text });
      this.hud.toast('Sent. It appears on the plant after you approve it in the host panel.', 6000);
      this.announce('Recollection sent for approval.');
    } else {
      this.state.upsertResponse(memoryId, { id: `demo-r-${Date.now()}`, name, text });
      this.announce('Recollection added to the demonstration plant.');
    }
  }

  // ------------------------------------------------------------------ state → world
  onStateChange(change) {
    const g = this.garden;
    const live = !change.snapshot;
    for (const id of change.removed || []) {
      g.removeMemory(id);
      if (this.live) this.live.forgetBlob(id);
      if (this.memoryView && this.memoryView.id === id) { this.memoryView.close(); this.hud.toast('That memory was removed.'); }
    }
    for (const id of change.added || []) {
      const m = this.state.get(id);
      if (!m) continue;
      g.addMemory(m, { animate: live && !this.reducedMotion });
      if (live) {
        this.sound.play('chime');
        this.hud.toast(`A new memory has grown: “${m.title}”`, { ms: 7000, action: { label: 'Walk there', run: () => this.focusMemory(id) } });
        this.announce(`A new memory has grown: ${m.title}`);
      }
    }
    for (const id of change.updated || []) {
      const m = this.state.get(id);
      if (!m) continue;
      g.updateMemory(m, { newResponse: change.newResponse || null });
      if (change.newResponse) {
        this.sound.play('open');
        this.hud.toast(`A recollection was added to “${m.title}”.`);
      }
    }
    if (change.snapshot || (change.added && change.added.length) || (change.removed && change.removed.length)) {
      const was = g.gatheringShown();
      const prog = this.state.progress();
      g.setGathering(prog.complete, { animate: live && prog.complete && !was });
      if (live && prog.complete && !was) {
        this.sound.play('chime');
        this.hud.toast('A gathering place has grown in the middle of the garden.', { ms: 9000, action: { label: 'Go and see', run: () => this.teleportTo('plaza') } });
        this.announce('A gathering place has grown in the middle of the garden.');
      }
    }
    if (this.memoryView && (change.meta || (change.updated || []).includes(this.memoryView.id) || change.snapshot)) this.memoryView.refresh();
    this.dock.onGardenChanged();
    if (change.meta) this.dock.onMetaChanged();
    this.hud.refresh();
  }

  // ------------------------------------------------------------------ navigation
  teleportTo(key) {
    const loc = LOCATIONS[key];
    if (!loc) return;
    this.overlays.closeAll();
    this.setOverview(false);
    this.player.teleport(loc.x, loc.z, loc.yaw);
  }

  /** Stand on the path side of a memory plant, facing its photograph. */
  focusMemory(id) {
    const lay = this.garden.plantPosition(id);
    if (!lay) return;
    this.overlays.closeAll();
    this.setOverview(false);
    const dir = lay.yaw === 0 ? 1 : -1; // photo cards face the path
    this.player.teleport(lay.card.x, lay.card.z + dir * 1.7, lay.yaw);
  }

  recoverPlayer() {
    this.overlays.closeAll();
    this.input.clear();
    this.teleportTo('gate');
    this.hud.toast('Back at the garden gate.');
  }

  setOverview(on) {
    this.overview = !!on;
    this.hud.refresh();
  }
  toggleOverview() {
    if (this.mode !== 'playing' || this.overlays.isOpen) return;
    this.setOverview(!this.overview);
    this.announce(this.overview ? 'Showing the whole garden.' : 'Back to walking.');
  }

  toggleDock(force, tab) {
    if (this.mode !== 'playing') return;
    if (force === true) this.dock.open(tab); else this.dock.toggle(force);
    this.hud.refresh();
  }

  // ------------------------------------------------------------------ panels
  openMenu() { if (this.mode === 'playing' && !this.overlays.has('pause')) openMenu(this); }
  openActivity() { if (this.mode === 'playing' && !this.overlays.has('activity')) { this.sound.play('open'); openActivity(this); } }
  openMemory(id) {
    if (this.mode !== 'playing' || !this.state.get(id)) return;
    if (this.overlays.has('memory')) this.overlays.closeById('memory');
    this.sound.play('open');
    this.memoryView = openMemoryPanel(this, id);
  }

  // ------------------------------------------------------------------ interaction
  interact() {
    if (this.mode !== 'playing' || this.overlays.isOpen || this.overview || !this.target) return;
    if (this.target.kind === 'memory') this.openMemory(this.target.id);
    else if (this.target.kind === 'gathering') this.openActivity();
  }

  updateTarget() {
    if (this.overlays.isOpen || this.mode !== 'playing' || this.overview) {
      if (this.target) { this.target = null; this.garden.setHighlight(null); this.hud.setPrompt(null); }
      return;
    }
    let best = null;
    let bestD = Infinity;
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    for (const it of this.garden.interactables) {
      const d = Math.hypot(px - it.pos.x, pz - it.pos.z);
      if (d <= it.range && d < bestD) { best = it; bestD = d; }
    }
    if (best !== this.target || (best && best.label !== this._lastLabel)) {
      this.target = best;
      this._lastLabel = best ? best.label : null;
      this.garden.setHighlight(best && best.kind === 'memory' ? best.id : null);
      this.hud.setPrompt(best ? best.label : null);
    }
  }

  onTap(x, y) {
    if (this.mode !== 'playing' || this.overlays.isOpen) return;
    const canvas = this.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    this._ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.garden.pickMeshes(), false);
    if (hits.length) {
      const id = hits[0].object.userData.memoryId;
      if (id) this.openMemory(id);
    }
  }

  // ------------------------------------------------------------------ keys
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
        if (this.dock.isOpen) this.toggleDock(false);
        else if (this.overview) this.setOverview(false);
        else this.openMenu();
      }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyM') { this.setMuted(!this.settings.muted); return; }
    if (this.mode !== 'playing' || this.overlays.isOpen) return;
    if (e.code === 'KeyE') { e.preventDefault(); this.interact(); }
    else if (e.code === 'KeyG') this.toggleOverview();
    else if (e.code === 'KeyH') this.toggleDock();
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
      // slow, calm drift above the garden behind the title screen
      const a = this.reducedMotion ? 0.5 : t * 0.07;
      this.camera.position.set(Math.sin(a) * 24, 11 + Math.sin(a * 0.7) * 1.5, 4 + Math.cos(a) * 18);
      this.camera.lookAt(0, 0.8, 0);
      focus = { x: 0, y: 0, z: 0 };
    } else {
      this.player.update(dt, { canMove: !this.overlays.isOpen && !this.overview, reducedMotion: this.reducedMotion });
      this.updateTarget();
      const goal = this.overview ? 1 : 0;
      this.blend += (goal - this.blend) * Math.min(1, dt * (this.reducedMotion ? 60 : 3.5));
      if (Math.abs(goal - this.blend) < 0.004) this.blend = goal;
      if (this.blend > 0) {
        const e = this.blend * this.blend * (3 - 2 * this.blend);
        const head = this._look.set(this.player.pos.x, 1.3, this.player.pos.z).lerp(OV_LOOK, e);
        this.camera.position.lerp(OV_POS, e);
        this.camera.lookAt(head);
        this.player.model.visible = true;
      }
      if (this.overview) focus = { x: 0, y: 0, z: 0 };
    }
    this.garden.update(dt, t, { reducedMotion: this.reducedMotion, playerPos: focus });
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
  const reload = document.getElementById('reload-btn'); // no inline handlers: the page's security policy forbids them
  if (reload && !reload.dataset.bound) { reload.dataset.bound = '1'; reload.addEventListener('click', () => location.reload()); }
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
