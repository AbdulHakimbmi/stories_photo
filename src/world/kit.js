// =============================================================================
//  kit.js — small helpers for building the low-poly world:
//  materials, canvas textures, boxes/cylinders, signs, photo frames, plants, people.
// =============================================================================
import * as THREE from 'three';
import { PALETTE as P } from './config.js';

// ---------------------------------------------------------------- materials
const stdCache = new Map();
export function std(color, opts = {}) {
  const plain = Object.keys(opts).length === 0;
  if (plain && stdCache.has(color)) return stdCache.get(color);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...opts });
  if (plain) stdCache.set(color, m);
  return m;
}

export function canvasTexture(canvas, repX = 1, repY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Clone the materials of every mesh in a group so it can be highlighted on its own. */
export function makeUnique(group) {
  group.traverse((o) => {
    if (o.isMesh && o.material && !o.userData.noHighlight) o.material = o.material.clone();
  });
  return group;
}

// ---------------------------------------------------------------- builder
export class Kit {
  constructor(scene, colliders) {
    this.scene = scene;
    this.col = colliders;
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  /** x,z = centre; y = bottom. Optional solid collider (player + camera). */
  box({ x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, color = P.cream, mat = null, parent = null, solid = false, cast = true, receive = true, rotY = 0, cam = true, name = '' }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || std(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (name) mesh.name = name;
    if (!parent) mesh.userData.mergeable = true;
    (parent || this.root).add(mesh);
    if (solid) this.col.addSolid(x - w / 2, x + w / 2, z - d / 2, z + d / 2, { y0: y, y1: y + h, cam });
    return mesh;
  }

  /** A box that only exists for the camera (ceiling slabs etc.). */
  camOnly(minX, maxX, minZ, maxZ, y0, y1) {
    this.col.addSolid(minX, maxX, minZ, maxZ, { y0, y1, walk: false, cam: true });
  }

  cyl({ x = 0, y = 0, z = 0, r = 0.5, rTop = null, h = 1, seg = 8, color = P.cream, mat = null, parent = null, solid = false, cast = true, receive = true }) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop === null ? r : rTop, r, h, seg), mat || std(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (!parent) mesh.userData.mergeable = true;
    (parent || this.root).add(mesh);
    if (solid) this.col.addSolid(x - r, x + r, z - r, z + r, { y0: y, y1: y + h });
    return mesh;
  }

  cone({ x = 0, y = 0, z = 0, r = 0.5, h = 1, seg = 7, color = P.greenDark, parent = null, cast = true }) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), std(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = cast;
    if (!parent) mesh.userData.mergeable = true;
    (parent || this.root).add(mesh);
    return mesh;
  }

  ball({ x = 0, y = 0, z = 0, r = 0.5, color = P.greenDark, parent = null, detail = 1, cast = true, sx = 1, sy = 1, sz = 1 }) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), std(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    if (!parent) mesh.userData.mergeable = true;
    (parent || this.root).add(mesh);
    return mesh;
  }

  plane({ x = 0, y = 0, z = 0, w = 1, d = 1, color = P.cream, mat = null, parent = null }) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat || std(color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    if (!parent) mesh.userData.mergeable = true;
    (parent || this.root).add(mesh);
    return mesh;
  }

  /**
   * Performance: join the many small static meshes that share a material (and shadow flags)
   * into a few big ones, so the GPU has dozens of draw calls instead of hundreds.
   * Only plain, unnamed, untouched meshes placed straight into the kit root are merged.
   * Returns { before, after } mesh counts. Any failure leaves the scene unchanged.
   */
  mergeStatic() {
    const buckets = new Map();
    for (const child of this.root.children) {
      if (!child.isMesh || !child.userData.mergeable || child.name || child.children.length) continue;
      const m = child.material;
      if (!m || Array.isArray(m) || m.transparent) continue;
      const key = `${m.uuid}|${child.castShadow ? 1 : 0}|${child.receiveShadow ? 1 : 0}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(child);
    }
    const v = new THREE.Vector3();
    let before = 0;
    let after = 0;
    const jobs = [];
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      let count = 0;
      const geos = list.map((mesh) => {
        mesh.updateMatrix();
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
        count += g.attributes.position.count;
        return g;
      });
      const pos = new Float32Array(count * 3);
      const nor = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      let o = 0;
      list.forEach((mesh, k) => {
        const g = geos[k];
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
        const gp = g.attributes.position;
        const gn = g.attributes.normal;
        const gu = g.attributes.uv;
        for (let i = 0; i < gp.count; i++, o++) {
          v.fromBufferAttribute(gp, i).applyMatrix4(mesh.matrix);
          pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
          v.fromBufferAttribute(gn, i).applyMatrix3(normalMatrix).normalize();
          nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
          if (gu) { uv[o * 2] = gu.getX(i); uv[o * 2 + 1] = gu.getY(i); }
        }
      });
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      merged.computeBoundingSphere();
      const big = new THREE.Mesh(merged, list[0].material);
      big.castShadow = list[0].castShadow;
      big.receiveShadow = list[0].receiveShadow;
      jobs.push({ list, big });
      before += list.length;
      after += 1;
    }
    for (const { list, big } of jobs) { // only touch the scene once everything was built successfully
      for (const mesh of list) { this.root.remove(mesh); mesh.geometry.dispose(); }
      this.root.add(big);
    }
    return { before, after };
  }
}

// ---------------------------------------------------------------- signs
export function labelCanvas(lines, { w = 512, h = 128, bg = '#F4E9D4', fg = '#3A2F28', accent = '#4F8A8B', size = 40, border = true, align = 'center' } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  }
  const arr = Array.isArray(lines) ? lines : [lines];
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const gap = h / (arr.length + 1);
  arr.forEach((t, i) => {
    const s = i === 0 ? size : size * 0.62;
    ctx.font = `${i === 0 ? '700' : '500'} ${s}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.fillText(t, align === 'center' ? w / 2 : 24, gap * (i + 1));
  });
  return c;
}

export function labelPlane(lines, pw, ph, opts = {}) {
  const canvas = labelCanvas(lines, { w: 512, h: Math.round(512 * (ph / pw)), ...opts });
  const tex = canvasTexture(canvas);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.userData.noHighlight = true;
  return mesh;
}

// ---------------------------------------------------------------- props
export function potPlant(kit, x, z, { scale = 1, pot = P.terra, parent = null, solid = true } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const potMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * scale, 0.19 * scale, 0.42 * scale, 7), std(pot));
  potMesh.position.y = 0.21 * scale;
  potMesh.castShadow = true;
  g.add(potMesh);
  const leaf = [P.greenDark, P.green, P.greenLight];
  [[0, 0.74, 0, 0.3], [0.14, 0.58, 0.08, 0.22], [-0.14, 0.62, -0.06, 0.24], [0.02, 0.95, 0.04, 0.2]].forEach(([dx, dy, dz, r], i) => {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * scale, 0), std(leaf[i % 3]));
    b.position.set(dx * scale, dy * scale, dz * scale);
    b.castShadow = true;
    g.add(b);
  });
  (parent || kit.root).add(g);
  if (solid) kit.col.addSolid(x - 0.26 * scale, x + 0.26 * scale, z - 0.26 * scale, z + 0.26 * scale, { y0: 0, y1: 1.2 * scale, cam: false });
  return g;
}

// ---------------------------------------------------------------- people
/**
 * A friendly low-poly person made of boxes and spheres. Feet at y = 0, face toward +Z.
 * Returns the group; group.userData.parts holds the pieces that idle-animate.
 */
export function makePerson({ shirt = P.teal, pants = 0x4a3f3a, skin = P.skins[0], hair = 0x2a211c, hairStyle = 'short', scarf = null, elder = false, glasses = false, scale = 1, seated = false, cuff = null } = {}) {
  const g = new THREE.Group();
  const parts = {};
  const mk = (geo, color, x, y, z) => {
    const m = new THREE.Mesh(geo, std(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const hairColor = elder ? 0xbdb7ae : hair;

  if (!seated) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.11, 0.8, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.2), std(pants));
      leg.position.y = -0.4;
      leg.castShadow = true;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), std(0x2f2622));
      shoe.position.set(0, -0.76, 0.04);
      pivot.add(leg, shoe);
      g.add(pivot);
      parts[side < 0 ? 'legL' : 'legR'] = pivot;
    }
  } else {
    mk(new THREE.BoxGeometry(0.18, 0.16, 0.52), pants, -0.11, 0.5, 0.22);
    mk(new THREE.BoxGeometry(0.18, 0.16, 0.52), pants, 0.11, 0.5, 0.22);
    mk(new THREE.BoxGeometry(0.16, 0.46, 0.16), pants, -0.11, 0.24, 0.45);
    mk(new THREE.BoxGeometry(0.16, 0.46, 0.16), pants, 0.11, 0.24, 0.45);
  }
  const baseY = seated ? 0.5 : 0.8;
  const torso = mk(new THREE.BoxGeometry(0.46, 0.62, 0.27), shirt, 0, baseY + 0.31, 0);
  parts.torso = torso;
  if (cuff) mk(new THREE.BoxGeometry(0.48, 0.1, 0.29), cuff, 0, baseY + 0.05, 0);

  const armGeo = new THREE.BoxGeometry(0.12, 0.56, 0.13);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, baseY + 0.58, 0);
    const arm = new THREE.Mesh(armGeo, std(shirt));
    arm.position.y = -0.27;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), std(skin));
    hand.position.y = -0.58;
    pivot.add(hand);
    g.add(pivot);
    parts[side < 0 ? 'armL' : 'armR'] = pivot;
  }

  const headY = baseY + 0.62 + 0.24;
  const head = new THREE.Group();
  head.position.set(0, headY, 0);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), std(skin));
  skull.castShadow = true;
  head.add(skull);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.02), std(0x2a211c));
    eye.position.set(side * 0.075, 0.025, 0.185);
    head.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), std(0x7a3b2e));
  smile.position.set(0, -0.06, 0.19);
  head.add(smile);
  if (glasses) {
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 4, 8), std(0x2a211c));
      ring.position.set(side * 0.075, 0.025, 0.196);
      head.add(ring);
    }
  }
  if (scarf) {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.225, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), std(scarf));
    top.position.y = 0.01;
    top.castShadow = true;
    head.add(top);
    for (const side of [-1, 1]) {
      const sideCloth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.34), std(scarf));
      sideCloth.position.set(side * 0.2, -0.06, -0.03);
      head.add(sideCloth);
    }
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.1), std(scarf));
    drape.position.set(0, -0.1, -0.15);
    head.add(drape);
  } else if (hairStyle !== 'none') {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.215, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), std(hairColor));
    top.position.y = 0.025;
    top.castShadow = true;
    head.add(top);
    if (hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.1), std(hairColor));
      back.position.set(0, -0.08, -0.16);
      head.add(back);
    } else if (hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), std(hairColor));
      bun.position.set(0, 0.24, -0.08);
      head.add(bun);
    }
  }
  g.add(head);
  parts.head = head;
  g.scale.setScalar(scale);
  g.userData.parts = parts;
  g.userData.seated = seated;
  g.userData.height = (seated ? 1.4 : 1.76) * scale;
  return g;
}
