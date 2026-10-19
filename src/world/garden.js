// =============================================================================
//  garden.js — the 3D memory garden: four planting beds around a central plaza, paths, benches,
//  hedges, and the "gathering place" that grows when the three categories are represented.
//  Memory plants are added / removed at runtime as memories are approved / deleted.
// =============================================================================
import * as THREE from 'three';
import { PALETTE as P, LIGHT, BOUNDS, AREA_LAYOUT, BED, SLOT_COUNT, slotTransform } from './config.js';
import { AREAS, AREA_IDS } from '../data/content.js';
import { Colliders } from './collision.js';
import { Kit, std, canvasTexture, labelPlane, potPlant } from './kit.js';
import { MemoryPlant } from './plant.js';
import { grassTextureCanvas } from '../art/illustrations.js';

const easeOutBack = (x) => { const c1 = 1.70158; const c3 = c1 + 1; const y = x - 1; return 1 + c3 * y * y * y + c1 * y * y; };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * @param {{scene:THREE.Scene, lowFx?:boolean, merge?:boolean, resolveImage:(m:object)=>({url?:string,canvas?:HTMLCanvasElement}|null)}} opts
 */
export function buildGarden({ scene, lowFx = false, merge = true, resolveImage }) {
  const colliders = new Colliders(BOUNDS);
  const kit = new Kit(scene, colliders);
  const plants = new Map();           // memory id -> { plant, box, interactable }
  const interactables = [];
  const clouds = [];
  let reducedMotion = false;
  let clock = 0;

  // ------------------------------------------------------------------ light + sky
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.sky, 48, 120);
  scene.add(new THREE.AmbientLight(0xfff1dc, LIGHT.ambient));
  scene.add(new THREE.HemisphereLight(0xe6f3ee, 0xc9b58d, LIGHT.hemi));
  const SUN_OFFSET = { x: 6, y: 26, z: 14 };
  const sun = new THREE.DirectionalLight(0xfff0d2, LIGHT.sun);
  sun.position.set(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
  scene.add(sun, sun.target);
  if (!lowFx) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 70;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
    sun.shadow.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ ground, paths, plaza
  const grassTex = canvasTexture(grassTextureCanvas(), 36, 28);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 120), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, color: 0xe8f2dc }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const PATH = P.concrete;
  kit.box({ x: 0, z: 0, y: 0, w: 35.6, h: 0.05, d: 3.0, color: PATH, cast: false });
  kit.box({ x: 0, z: 0, y: 0, w: 3.0, h: 0.05, d: 27.6, color: PATH, cast: false });
  // round plaza
  kit.cyl({ x: 0, z: 0, r: 4.4, h: 0.08, seg: 24, color: P.stone, cast: false });
  kit.cyl({ x: 0, z: 0, r: 3.6, h: 0.1, seg: 24, color: P.creamDark, cast: false });
  kit.cyl({ x: 0, z: 0, r: 1.35, h: 0.26, seg: 16, color: P.stone, cast: false });
  kit.cyl({ x: 0, z: 0, r: 1.12, h: 0.28, seg: 16, color: P.soil, cast: false });
  colliders.addSolid(-1.4, 1.4, -1.4, 1.4, { y0: 0, y1: 0.3, cam: false });

  // ------------------------------------------------------------------ planting beds + labelled areas
  for (const id of AREA_IDS) {
    const a = AREA_LAYOUT[id];
    const area = AREAS[id];
    const north = a.cz < 0;
    const pathSide = north ? 1 : -1;
    kit.box({ x: a.cx, z: a.cz, y: 0, w: BED.w, h: 0.1, d: BED.d, color: P.soil, cast: false });
    const t = 0.18;
    kit.box({ x: a.cx, z: a.cz - BED.d / 2, y: 0, w: BED.w + t, h: 0.28, d: t, color: P.woodDark, cast: false });
    kit.box({ x: a.cx, z: a.cz + BED.d / 2, y: 0, w: BED.w + t, h: 0.28, d: t, color: P.woodDark, cast: false });
    kit.box({ x: a.cx - BED.w / 2, z: a.cz, y: 0, w: t, h: 0.28, d: BED.d, color: P.woodDark, cast: false });
    kit.box({ x: a.cx + BED.w / 2, z: a.cz, y: 0, w: t, h: 0.28, d: BED.d, color: P.woodDark, cast: false });
    // seed marks where plants will grow
    for (let s = 0; s < SLOT_COUNT; s++) {
      const tr = slotTransform(id, s);
      kit.cyl({ x: tr.plant.x, z: tr.plant.z, r: 0.5, h: 0.14, seg: 10, color: P.soilDark, cast: false });
    }
    // a border of small flowers in the area's accent colour along the path side
    for (let i = 0; i < 12; i++) {
      const fx = a.cx - BED.w / 2 + 0.7 + i * ((BED.w - 1.4) / 11);
      kit.ball({ x: fx, y: 0.42, z: a.cz + pathSide * (BED.d / 2 + 0.35), r: 0.14, color: i % 3 === 0 ? P.petalCream : area.accent, detail: 0, cast: false });
      kit.ball({ x: fx + 0.2, y: 0.28, z: a.cz + pathSide * (BED.d / 2 + 0.35), r: 0.2, color: P.greenDark, detail: 0, cast: false });
    }
    // sign
    const sz = a.cz + pathSide * (BED.d / 2 + 1.0);
    // low sign, so it never hides the photo cards behind it
    for (const dx of [-1.25, 1.25]) kit.cyl({ x: a.cx + dx, z: sz, r: 0.06, h: 0.95, seg: 6, color: P.woodDark, solid: true });
    const sign = labelPlane([area.label, area.blurb], 2.9, 0.66, { size: 52, accent: area.accentCss, bg: '#FBF4E6' });
    sign.position.set(a.cx, 0.62, sz + pathSide * 0.07);
    sign.rotation.y = north ? 0 : Math.PI;
    kit.root.add(sign);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.74, 0.08), std(P.wood));
    back.position.set(a.cx, 0.62, sz);
    back.castShadow = true;
    kit.root.add(back);
  }

  // ------------------------------------------------------------------ seed sprout + signpost at the plaza centre
  const seed = new THREE.Group();
  for (const [x, z, h] of [[0, 0, 0.5], [0.4, 0.2, 0.35], [-0.35, -0.2, 0.4]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, h, 5), std(P.greenLight));
    c.position.set(x, 0.28 + h / 2, z);
    seed.add(c);
  }
  scene.add(seed);
  const gSign = labelPlane(['Gathering place', 'grows from shared memories'], 2.3, 0.7, { size: 48, accent: '#4d7d4d' });
  gSign.position.set(0, 1.25, 2.0);
  kit.root.add(gSign);
  for (const dx of [-1.0, 1.0]) kit.cyl({ x: dx, z: 2.0, r: 0.05, h: 1.1, seg: 6, color: P.woodDark });
  colliders.addSolid(-1.2, 1.2, 1.9, 2.1, { y0: 0, y1: 1.3, cam: false });

  // ------------------------------------------------------------------ benches, lanterns, pots, trees, hedges
  function bench(x, z, yaw = 0) {
    // seat faces +Z when yaw = 0
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.55), std(P.wood));
    seat.position.y = 0.45; seat.castShadow = true; seat.receiveShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.08), std(P.woodDark));
    back.position.set(0, 0.78, -0.25); back.castShadow = true; g.add(back);
    for (const dx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.5), std(P.terraDark));
      leg.position.set(dx, 0.225, 0); leg.castShadow = true; g.add(leg);
    }
    scene.add(g);
    const c = Math.abs(Math.cos(yaw)) > 0.5;
    return colliders.addSolid(x - (c ? 1.0 : 0.38), x + (c ? 1.0 : 0.38), z - (c ? 0.38 : 1.0), z + (c ? 0.38 : 1.0), { y0: 0, y1: 1.1, cam: false });
  }
  bench(-6.4, 2.35, 0); bench(6.4, 2.35, 0);          // benches beside the path, facing the beds
  bench(-6.4, -2.35, Math.PI); bench(6.4, -2.35, Math.PI);
  bench(-15.6, 0, Math.PI / 2); bench(15.6, 0, Math.PI * 1.5);

  const lanternGlow = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd98a, emissiveIntensity: 1.1, roughness: 0.6 });
  const swayers = [];
  function lantern(x, z) {
    kit.cyl({ x, z, r: 0.07, h: 2.1, seg: 6, color: P.woodDark, solid: true });
    const g = new THREE.Group();
    g.position.set(x, 2.0, z);
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), lanternGlow);
    g.add(bulb);
    scene.add(g);
    swayers.push(g);
  }
  [[-4.6, -4.6], [4.6, -4.6], [-4.6, 4.6], [4.6, 4.6], [-16.4, 2.4], [16.4, -2.4]].forEach(([x, z]) => lantern(x, z));

  [[-2.4, 12.2], [2.4, 12.2], [-2.4, 9.6], [2.4, 9.6], [-2.4, -12.0], [2.4, -12.0]].forEach(([x, z], i) => potPlant(kit, x, z, { scale: 1.2, pot: i % 2 ? P.terra : P.tealDark }));

  function tree(x, z, s = 1) {
    kit.cyl({ x, z, r: 0.28 * s, h: 2.6 * s, color: P.woodDark, solid: true });
    kit.ball({ x, y: 3.4 * s, z, r: 1.7 * s, color: P.green });
    kit.ball({ x: x + 0.8 * s, y: 4.2 * s, z: z - 0.4 * s, r: 1.15 * s, color: P.greenLight });
    kit.ball({ x: x - 0.8 * s, y: 4.0 * s, z: z + 0.5 * s, r: 1.05 * s, color: P.greenDark });
  }
  [[-16.1, -12.2, 1.1], [16.1, -12.2, 1.0], [-16.1, 12.0, 1.0], [16.1, 12.0, 1.1], [-16.4, -4.0, 0.9], [16.4, 4.0, 0.9], [-5.0, -12.4, 0.9], [5.0, 12.2, 0.8]].forEach(([x, z, s]) => tree(x, z, s));

  const H = P.hedge;
  kit.box({ x: 0, z: -13.9, y: 0, w: 37, h: 1.3, d: 0.9, color: H, cast: false });
  kit.box({ x: -10, z: 14.1, y: 0, w: 17, h: 1.3, d: 0.9, color: H, cast: false });
  kit.box({ x: 10, z: 14.1, y: 0, w: 17, h: 1.3, d: 0.9, color: H, cast: false });
  kit.box({ x: -18.0, z: 0, y: 0, w: 0.9, h: 1.3, d: 29, color: H, cast: false });
  kit.box({ x: 18.0, z: 0, y: 0, w: 0.9, h: 1.3, d: 29, color: H, cast: false });

  // entrance arch (south). Marked on both sides.
  for (const dx of [-1.9, 1.9]) kit.box({ x: dx, z: 13.8, y: 0, w: 0.35, h: 2.8, d: 0.35, color: P.woodDark, solid: true });
  kit.box({ x: 0, z: 13.8, y: 2.65, w: 4.2, h: 0.35, d: 0.4, color: P.wood });
  const arch = labelPlane(['Our Memory Garden', 'a proposed future experience'], 3.2, 0.62, { size: 46, accent: '#35686a' });
  arch.position.set(0, 2.2, 13.58);
  arch.rotation.y = Math.PI;
  kit.root.add(arch);

  // soft hills in the distance
  [[-46, -38, 20, 6, 14, P.greenLight], [0, -52, 28, 8, 16, P.green], [44, -40, 22, 7, 14, P.greenDark], [-52, 20, 18, 5, 14, P.green], [54, 18, 20, 6, 14, P.greenLight], [0, 56, 26, 7, 14, P.greenLight]].forEach(([x, z, rx, ry, rz, c]) => {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), std(c));
    hill.scale.set(rx, ry, rz); hill.position.set(x, -ry * 0.35, z);
    scene.add(hill);
  });

  // clouds
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false });
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + j * 0.5, 0), cloudMat);
      m.position.set(j * 3 - 3, (j % 2) * 0.5, 0); m.scale.set(1.6, 0.6, 1); c.add(m);
    }
    c.position.set(-50 + i * 20, 36 + (i % 3) * 4, -10 + (i % 4) * 12);
    scene.add(c); clouds.push(c);
  }

  // ------------------------------------------------------------------ the gathering place (hidden until earned)
  const gather = new THREE.Group();
  {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 1.5, 6), std(P.woodDark));
    trunk.position.y = 1.0; gather.add(trunk);
    [[0, 2.1, 0, 0.8, P.green], [0.5, 1.75, 0.2, 0.55, P.greenLight], [-0.45, 1.8, -0.25, 0.55, P.greenDark]].forEach(([x, y, z, r, c]) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), std(c)); b.position.set(x, y, z); b.castShadow = true; gather.add(b);
    });
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), std(i % 2 ? P.petalPink : P.petalCream));
      f.position.set(Math.cos(a) * 0.85, 1.7 + (i % 5) * 0.2, Math.sin(a) * 0.85); gather.add(f);
    }
    for (const [x, z, yaw] of [[0, 2.85, 0], [0, -2.85, Math.PI]]) { // benches around the tree, facing it
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw + Math.PI;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.55), std(P.wood)); seat.position.y = 0.45; seat.castShadow = true; g.add(seat);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.08), std(P.terra)); bk.position.set(0, 0.78, -0.25); g.add(bk);
      for (const dx of [-0.85, 0.85]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.5), std(P.terraDark)); leg.position.set(dx, 0.225, 0); g.add(leg); }
      gather.add(g);
    }
    for (let i = 0; i < 6; i++) { // little glowing lanterns on the ground around the tree
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), lanternGlow); l.position.set(Math.cos(a) * 1.9, 0.3, Math.sin(a) * 1.9); gather.add(l);
    }
  }
  gather.visible = false;
  scene.add(gather);
  let gatherBoxes = [];
  const gatherState = { shown: false, t0: null, animating: false };

  function setGathering(complete, { animate = false } = {}) {
    if (complete === gatherState.shown) return;
    gatherState.shown = complete;
    seed.visible = !complete;
    for (const b of gatherBoxes) colliders.removeSolid(b);
    gatherBoxes = [];
    if (complete) {
      gather.visible = true;
      gatherBoxes.push(colliders.addSolid(-0.3, 0.3, -0.3, 0.3, { y0: 0, y1: 3, cam: false }));
      gatherBoxes.push(colliders.addSolid(-1.1, 1.1, 2.55, 3.15, { y0: 0, y1: 1.1, cam: false }));
      gatherBoxes.push(colliders.addSolid(-1.1, 1.1, -3.15, -2.55, { y0: 0, y1: 1.1, cam: false }));
      if (animate && !reducedMotion) { gather.scale.setScalar(0.001); gatherState.animating = true; gatherState.t0 = null; }
      else gather.scale.setScalar(1);
    } else {
      gather.visible = false;
      gatherState.animating = false;
    }
  }

  const gatherInteractable = { id: 'gathering', kind: 'gathering', label: 'See the gathering place', pos: new THREE.Vector3(0, 1, 1.4), range: 3.6 };
  interactables.push(gatherInteractable);

  // ------------------------------------------------------------------ memory plants
  function addMemory(memory, { animate = false } = {}) {
    if (plants.has(memory.id)) { updateMemory(memory); return plants.get(memory.id).plant; }
    const layout = slotTransform(memory.category, memory.slot);
    const plant = new MemoryPlant({ memory, layout, image: resolveImage(memory), animate, reducedMotion, now: clock });
    scene.add(plant.group);
    const px = layout.plant.x;
    const pz = layout.plant.z;
    const box = colliders.addSolid(px - 0.42, px + 0.42, pz - 0.42, pz + 0.42, { y0: 0, y1: 2, cam: false });
    const interactable = {
      id: memory.id, kind: 'memory', label: `Open “${memory.title}”`,
      pos: new THREE.Vector3((layout.plant.x + layout.card.x) / 2, 1, (layout.plant.z + layout.card.z) / 2), range: 2.9,
    };
    interactables.push(interactable);
    plants.set(memory.id, { plant, box, interactable });
    return plant;
  }

  function updateMemory(memory, { newResponse = null } = {}) {
    const rec = plants.get(memory.id);
    if (!rec) return;
    rec.plant.setMemory(memory, { newResponse, animate: !reducedMotion && !!newResponse });
    rec.interactable.label = `Open “${memory.title}”`;
  }

  function removeMemory(id) {
    const rec = plants.get(id);
    if (!rec) return;
    rec.plant.dispose();
    colliders.removeSolid(rec.box);
    const i = interactables.indexOf(rec.interactable);
    if (i >= 0) interactables.splice(i, 1);
    plants.delete(id);
  }

  function clearMemories() { for (const id of [...plants.keys()]) removeMemory(id); }

  function setHighlight(id) {
    for (const [pid, rec] of plants) rec.plant.setHighlight(pid === id);
  }

  const pickMeshes = () => [...plants.values()].flatMap((r) => r.plant.pickMeshes);

  // ------------------------------------------------------------------ per-frame
  function update(dt, t, { reducedMotion: reduced = false, playerPos = null } = {}) {
    reducedMotion = reduced;
    clock = t;
    if (playerPos && sun.castShadow) {
      const sx = Math.round(playerPos.x * 2) / 2;
      const sz = Math.round(playerPos.z * 2) / 2;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + SUN_OFFSET.x, SUN_OFFSET.y, sz + SUN_OFFSET.z);
    }
    for (const rec of plants.values()) rec.plant.update(dt, t, reduced);
    if (gatherState.animating) {
      if (gatherState.t0 === null) gatherState.t0 = t;
      const k = clamp01((t - gatherState.t0) / 2.2);
      gather.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      if (k >= 1) { gatherState.animating = false; gather.scale.setScalar(1); }
    }
    if (!reduced) {
      for (const g of swayers) g.rotation.z = Math.sin(t * 0.9 + g.position.x) * 0.05;
      for (const c of clouds) { c.position.x += dt * 0.35; if (c.position.x > 70) c.position.x = -70; }
      seed.rotation.y = Math.sin(t * 0.7) * 0.15;
    }
  }

  let mergeInfo = null;
  if (merge) {
    try { mergeInfo = kit.mergeStatic(); } catch (err) { console.warn('Static mesh merge skipped:', err); }
  }

  return {
    colliders, interactables, mergeInfo,
    addMemory, updateMemory, removeMemory, clearMemories, setHighlight, setGathering, pickMeshes, update,
    hasMemory: (id) => plants.has(id),
    plantIds: () => [...plants.keys()],
    plantCount: () => plants.size,
    leafCount: (id) => { const r = plants.get(id); return r ? r.plant.leaves.size : 0; },
    plantPosition: (id) => { const r = plants.get(id); return r ? { ...r.plant.layout } : null; },
    gatheringShown: () => gatherState.shown,
  };
}
