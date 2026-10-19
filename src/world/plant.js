// =============================================================================
//  plant.js — one memory plant: a small low-poly plant, a framed photo card showing the
//  ACTUAL photograph (aspect ratio preserved, letterboxed on a cream mat — never stretched),
//  a title plate, a gentle "open me" indicator, and one small leaf per approved recollection.
//
//  A plant's size, health and look never depend on how many responses it has: leaves are
//  decoration of equal weight, and the plant itself is always the same size.
// =============================================================================
import * as THREE from 'three';
import { PALETTE as P } from './config.js';
import { AREAS } from '../data/content.js';
import { std } from './kit.js';

const loader = new THREE.TextureLoader();

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const easeOutBack = (x) => { const c1 = 1.70158; const c3 = c1 + 1; const y = x - 1; return 1 + c3 * y * y * y + c1 * y * y; };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Size of the cream mat (the photo sits inside it) for a given photo aspect ratio. */
export function matSize(aspect) {
  if (aspect >= 1.15) return { w: 1.3, h: 1.0 };
  if (aspect <= 0.87) return { w: 0.95, h: 1.3 };
  return { w: 1.15, h: 1.15 };
}
/** Largest size with the photo's own aspect that fits inside (w × h) minus a margin: letterboxing, never stretching. */
export function fitInside(aspect, w, h, margin = 0.07) {
  const iw = w - margin * 2;
  const ih = h - margin * 2;
  return aspect >= iw / ih ? { w: iw, h: iw / aspect } : { w: ih * aspect, h: ih };
}

function titleCanvas(title, fictional) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fbf4e6'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#b98b5e'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = '#3a2f28'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 44;
  const family = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
  const text = title || 'Untitled';
  ctx.font = `700 ${size}px ${family}`;
  while (ctx.measureText(text).width > 450 && size > 24) { size -= 2; ctx.font = `700 ${size}px ${family}`; }
  let shown = text;
  while (ctx.measureText(shown).width > 450 && shown.length > 3) shown = shown.slice(0, -2);
  if (shown !== text) shown = shown.trimEnd() + '…';
  ctx.fillText(shown, 256, fictional ? 52 : 64);
  if (fictional) { ctx.font = `600 26px ${family}`; ctx.fillStyle = '#8a6240'; ctx.fillText('Fictional example', 256, 96); }
  return c;
}

function messageCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6d3ae'; ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#5a4a3e'; ctx.font = '600 22px system-ui, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 96);
  return c;
}

export class MemoryPlant {
  /**
   * @param {object} o
   * @param {object} o.memory      normalised memory
   * @param {{plant:{x:number,z:number}, card:{x:number,z:number}, yaw:number}} o.layout
   * @param {{url?:string, canvas?:HTMLCanvasElement}} o.image
   * @param {boolean} o.animate    play the grow/reveal animation
   * @param {boolean} o.reducedMotion
   */
  constructor({ memory, layout, image, animate = false, reducedMotion = false, now = 0 }) {
    this.id = memory.id;
    this.memory = memory;
    this.layout = layout;
    this.group = new THREE.Group();
    this.group.name = `memory-${memory.id}`;
    this.own = { geos: [], mats: [], textures: [] };
    this.leaves = new Map();
    this.highlight = false;
    this.disposed = false;
    const seed = hashString(memory.id);
    this.phase = (seed % 628) / 100;
    const rand = rng(seed);
    const accent = (AREAS[memory.category] || AREAS.everyday).accent;

    // ---------------------------------------------------------------- plant
    this.plantGroup = new THREE.Group();
    this.plantGroup.position.set(layout.plant.x, 0, layout.plant.z);
    this.group.add(this.plantGroup);
    this.buildPlant(Math.floor(rand() * 3), accent, rand);

    // ---------------------------------------------------------------- card
    this.cardGroup = new THREE.Group();
    this.cardGroup.position.set(layout.card.x, 0, layout.card.z);
    this.cardGroup.rotation.y = layout.yaw;
    this.group.add(this.cardGroup);
    this.buildCard(memory, accent, image);

    // ---------------------------------------------------------------- picking (invisible, only used for mouse clicks)
    this.pickMeshes = [];
    const pickMat = this.mat(new THREE.MeshBasicMaterial({ visible: false }));
    const pickA = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.85, 0.85, 2.3, 8)), pickMat);
    pickA.position.y = 1.15;
    this.plantGroup.add(pickA);
    const pickB = new THREE.Mesh(this.geo(new THREE.BoxGeometry(1.7, 2.5, 0.9)), pickMat);
    pickB.position.y = 1.25;
    this.cardGroup.add(pickB);
    for (const m of [pickA, pickB]) { m.userData.memoryId = memory.id; this.pickMeshes.push(m); }

    this.syncLeaves(memory.responses, false);

    // ---------------------------------------------------------------- grow / reveal
    this.growStart = null;
    this.growing = !!animate && !reducedMotion;
    this.ring = null;
    if (this.growing) {
      this.growStart = now;
      this.plantGroup.scale.setScalar(0.001);
      this.cardGroup.scale.setScalar(0.001);
      this.ring = new THREE.Mesh(this.geo(new THREE.RingGeometry(0.4, 0.55, 28)), this.mat(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.set(layout.plant.x, 0.08, layout.plant.z);
      this.group.add(this.ring);
    }
  }

  // ---------------------------------------------------------------- bookkeeping
  geo(g) { this.own.geos.push(g); return g; }
  mat(m) { this.own.mats.push(m); return m; }
  mesh(geometry, material, { cast = true } = {}) {
    const m = new THREE.Mesh(this.geo(geometry), material);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- the plant itself
  buildPlant(variety, accent, rand) {
    const g = this.plantGroup;
    const greens = [P.greenDark, P.green, P.greenLight];
    const soil = this.mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.14, 10), std(P.soil));
    soil.position.y = 0.07;
    g.add(soil);
    const accentMat = std(accent);
    if (variety === 0) { // small tree
      const trunk = this.mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.25, 6), std(P.woodDark));
      trunk.position.y = 0.7; g.add(trunk);
      [[0, 1.65, 0, 0.62], [0.36, 1.35, 0.15, 0.46], [-0.32, 1.4, -0.2, 0.44]].forEach(([x, y, z, r], i) => {
        const c = this.mesh(new THREE.IcosahedronGeometry(r, 0), std(greens[i % 3])); c.position.set(x, y, z); g.add(c);
      });
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2; const b = this.mesh(new THREE.IcosahedronGeometry(0.09, 0), accentMat);
        b.position.set(Math.cos(a) * 0.55, 1.35 + rand() * 0.6, Math.sin(a) * 0.55); g.add(b);
      }
    } else if (variety === 1) { // rounded bush with flowers
      [[0, 0.5, 0, 0.5], [0.35, 0.42, 0.18, 0.38], [-0.34, 0.45, -0.1, 0.4], [0.05, 0.75, -0.2, 0.34]].forEach(([x, y, z, r], i) => {
        const c = this.mesh(new THREE.IcosahedronGeometry(r, 0), std(greens[(i + 1) % 3])); c.position.set(x, y, z); g.add(c);
      });
      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2; const f = this.mesh(new THREE.IcosahedronGeometry(0.11, 0), accentMat);
        f.position.set(Math.cos(a) * (0.35 + rand() * 0.25), 0.5 + rand() * 0.55, Math.sin(a) * (0.35 + rand() * 0.25)); g.add(f);
      }
    } else { // tall bloom
      const stem = this.mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.3, 5), std(P.greenDark));
      stem.position.y = 0.75; g.add(stem);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const petal = this.mesh(new THREE.IcosahedronGeometry(0.2, 0), accentMat);
        petal.scale.set(1.1, 0.45, 0.7); petal.position.set(Math.cos(a) * 0.28, 1.45, Math.sin(a) * 0.28); petal.rotation.y = -a; g.add(petal);
      }
      const eye = this.mesh(new THREE.IcosahedronGeometry(0.17, 0), std(P.sun)); eye.position.y = 1.47; g.add(eye);
      [[0.3, 0.5, 0.25], [-0.3, 0.75, -0.25]].forEach(([x, y, z], i) => {
        const leaf = this.mesh(new THREE.IcosahedronGeometry(0.3, 0), std(greens[i + 1])); leaf.scale.set(1.2, 0.3, 0.6); leaf.position.set(x, y, z); leaf.rotation.y = i ? 0.8 : -0.5; g.add(leaf);
      });
    }
    this.canopy = g;
  }

  // ---------------------------------------------------------------- the photo card
  buildCard(memory, accent, image) {
    const g = this.cardGroup;
    const aspect = memory.width / memory.height;
    const mat = matSize(aspect);
    const cy = 1.62;
    const post = this.mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.3, 6), std(P.woodDark));
    post.position.set(0, 0.65, -0.05); g.add(post);

    this.frameMat = this.mat(std(P.wood).clone());
    const frame = this.mesh(new THREE.BoxGeometry(mat.w + 0.18, mat.h + 0.18, 0.07), this.frameMat);
    frame.position.set(0, cy, 0); g.add(frame);
    const matMesh = this.mesh(new THREE.PlaneGeometry(mat.w, mat.h), this.mat(new THREE.MeshBasicMaterial({ color: P.creamLight, toneMapped: false })), { cast: false });
    matMesh.position.set(0, cy, 0.04); g.add(matMesh);

    // the photograph itself: its own plane, scaled to fit the mat without distortion
    this.matBox = { w: mat.w, h: mat.h };
    this.photoMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xe6d3ae, toneMapped: false }));
    this.photo = this.mesh(new THREE.PlaneGeometry(1, 1), this.photoMat, { cast: false });
    this.photo.position.set(0, cy, 0.046);
    this.fit(aspect);
    g.add(this.photo);
    this.loadImage(image);

    this.titleTex = new THREE.CanvasTexture(titleCanvas(memory.title, memory.fictional));
    this.titleTex.colorSpace = THREE.SRGBColorSpace;
    this.own.textures.push(this.titleTex);
    this.titleMat = this.mat(new THREE.MeshBasicMaterial({ map: this.titleTex, toneMapped: false }));
    this.title = this.mesh(new THREE.PlaneGeometry(1.3, 0.325), this.titleMat, { cast: false });
    this.title.position.set(0, cy - mat.h / 2 - 0.3, 0.05);
    g.add(this.title);

    // gentle indicator above the card
    this.indicator = this.mesh(new THREE.OctahedronGeometry(0.11, 0), this.mat(new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6, flatShading: true })), { cast: false });
    this.baseIndicatorY = cy + mat.h / 2 + 0.38;
    this.indicator.position.set(0, this.baseIndicatorY, 0.05);
    g.add(this.indicator);
  }

  fit(aspect) {
    const f = fitInside(aspect, this.matBox.w, this.matBox.h);
    this.photo.scale.set(f.w, f.h, 1);
  }

  loadImage(image) {
    if (!image) return;
    const apply = (tex) => {
      if (this.disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.own.textures.push(tex);
      this.photoMat.map = tex;
      this.photoMat.color.set(0xffffff);
      this.photoMat.needsUpdate = true;
      const img = tex.image;
      const w = img && (img.naturalWidth || img.width);
      const h = img && (img.naturalHeight || img.height);
      if (w && h) this.fit(w / h); // trust the real pixels over the stored dimensions
    };
    if (image.canvas) { apply(new THREE.CanvasTexture(image.canvas)); return; }
    if (image.url) {
      loader.load(image.url, apply, undefined, () => {
        if (this.disposed) return;
        const t = new THREE.CanvasTexture(messageCanvas('Photo unavailable'));
        apply(t);
      });
    }
  }

  // ---------------------------------------------------------------- updates
  setMemory(memory, { newResponse = null, animate = false } = {}) {
    const titleChanged = memory.title !== this.memory.title || memory.fictional !== this.memory.fictional;
    this.memory = memory;
    if (titleChanged) {
      this.titleTex.image = titleCanvas(memory.title, memory.fictional);
      this.titleTex.needsUpdate = true;
    }
    this.syncLeaves(memory.responses, animate, newResponse);
  }

  /** One small leaf per approved recollection (capped for tidiness). All leaves are equal. */
  syncLeaves(responses, animate, newId = null) {
    const keep = new Set(responses.map((r) => r.id));
    for (const [id, leaf] of this.leaves) if (!keep.has(id)) { this.plantGroup.remove(leaf); leaf.geometry.dispose(); this.leaves.delete(id); }
    responses.slice(0, 12).forEach((r, i) => {
      if (this.leaves.has(r.id)) return;
      const rand = rng(hashString(r.id));
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), std(i % 2 ? P.greenLight : P.green));
      leaf.scale.set(1.2, 0.28, 0.6);
      const a = rand() * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.42, 0.45 + (i % 6) * 0.2, Math.sin(a) * 0.42);
      leaf.rotation.set(0.4, -a, 0.5);
      leaf.castShadow = true;
      leaf.userData.born = animate && r.id === newId ? this.lastTime ?? 0 : null;
      leaf.userData.grow = animate && r.id === newId;
      if (leaf.userData.grow) leaf.scale.multiplyScalar(0.01);
      leaf.userData.full = new THREE.Vector3(1.2, 0.28, 0.6);
      this.plantGroup.add(leaf);
      this.leaves.set(r.id, leaf);
    });
  }

  setHighlight(on) {
    if (this.highlight === on) return;
    this.highlight = on;
    this.frameMat.emissive.setHex(on ? 0x8a5a2b : 0x000000);
    this.frameMat.emissiveIntensity = on ? 0.6 : 0;
    this.indicator.scale.setScalar(on ? 1.6 : 1);
  }

  update(dt, t, reducedMotion) {
    this.lastTime = t;
    if (this.growing) {
      if (this.growStart === null) this.growStart = t;
      const e = t - this.growStart;
      this.plantGroup.scale.setScalar(Math.max(0.001, easeOutBack(clamp01(e / 1.6))));
      this.cardGroup.scale.setScalar(Math.max(0.001, easeOutBack(clamp01((e - 0.7) / 0.9))));
      if (this.ring) {
        const k = clamp01(e / 1.5);
        this.ring.scale.setScalar(1 + k * 4);
        this.ring.material.opacity = 0.7 * (1 - k);
        if (k >= 1) { this.group.remove(this.ring); this.ring = null; }
      }
      if (e >= 1.7) { this.growing = false; this.plantGroup.scale.setScalar(1); this.cardGroup.scale.setScalar(1); }
    }
    for (const leaf of this.leaves.values()) {
      if (leaf.userData.grow) {
        if (leaf.userData.born === null) leaf.userData.born = t;
        const k = clamp01((t - leaf.userData.born) / 0.9);
        leaf.scale.copy(leaf.userData.full).multiplyScalar(Math.max(0.01, easeOutBack(k)));
        if (k >= 1) { leaf.userData.grow = false; leaf.scale.copy(leaf.userData.full); }
      }
    }
    if (!reducedMotion) {
      this.plantGroup.rotation.z = Math.sin(t * 0.8 + this.phase) * 0.012;
      this.indicator.position.y = this.baseIndicatorY + Math.sin(t * 2 + this.phase) * 0.05;
      this.indicator.rotation.y = t * 1.2;
    } else {
      this.plantGroup.rotation.z = 0;
      this.indicator.position.y = this.baseIndicatorY;
    }
  }

  dispose() {
    this.disposed = true;
    for (const leaf of this.leaves.values()) leaf.geometry.dispose();
    this.leaves.clear();
    this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    for (const g of this.own.geos) g.dispose();
    for (const m of this.own.mats) { if (m.map && m.map !== this.titleTex) m.map = null; m.dispose(); }
    for (const t of this.own.textures) t.dispose();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
