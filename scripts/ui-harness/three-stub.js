// Test-only stand-in for three.js with a REAL scene graph (children/add/remove/traverse/userData/visible),
// real Vector3 maths, and a TextureLoader that really fetches the image URL. It renders nothing.
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  fromBufferAttribute() { return this; }
  applyMatrix4() { return this; }
  applyMatrix3() { return this; }
}
export class Euler extends Vector3 {}
export class Matrix3 { getNormalMatrix() { return this; } }
export class Matrix4 {}
export class Color { constructor(c) { this.c = c; } set(c) { this.c = c; return this; } copy(o) { this.c = o.c; return this; } setHex(c) { this.c = c; return this; } clone() { return new Color(this.c); } }
export class Fog { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } }
export class Object3D {
  constructor() {
    this.children = []; this.parent = null; this.visible = true; this.userData = {}; this.name = '';
    this.position = new Vector3(); this.rotation = new Euler(); this.scale = new Vector3(1, 1, 1);
    this.castShadow = false; this.receiveShadow = false; this.matrix = {}; this.layers = { test: () => true };
  }
  add(...objs) { for (const o of objs) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
  remove(...objs) { for (const o of objs) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } } return this; }
  traverse(fn) { fn(this); for (const c of [...this.children]) c.traverse(fn); }
  getWorldPosition(v) { return (v || new Vector3()).copy(this.position); }
  lookAt() {}
  updateMatrix() {}
}
export class Group extends Object3D {}
export class Scene extends Object3D { constructor() { super(); this.background = null; this.fog = null; } }
export class Mesh extends Object3D { constructor(geometry, material) { super(); this.isMesh = true; this.geometry = geometry; this.material = material; } raycast() {} }
export class Sprite extends Object3D { constructor(material) { super(); this.material = material; } }
class Light extends Object3D { constructor() { super(); this.shadow = { mapSize: new Vector2(), camera: { updateProjectionMatrix() {} } }; this.target = new Object3D(); } }
export class AmbientLight extends Light {}
export class HemisphereLight extends Light {}
export class DirectionalLight extends Light {}
export class PointLight extends Light {}
export class PerspectiveCamera extends Object3D { updateProjectionMatrix() {} }

export class BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a.length / n; } }
export class BufferGeometry { constructor() { this.attributes = {}; this.index = null; } setAttribute(n, a) { this.attributes[n] = a; } computeBoundingSphere() {} dispose() { this.disposed = true; } toNonIndexed() { return this; } }
const geo = () => class extends BufferGeometry { constructor(...a) { super(); this.params = a; this.attributes = { position: { count: 0 }, normal: { count: 0 } }; } };
export const BoxGeometry = geo(), CylinderGeometry = geo(), ConeGeometry = geo(), IcosahedronGeometry = geo(), OctahedronGeometry = geo(),
  PlaneGeometry = geo(), RingGeometry = geo(), SphereGeometry = geo(), TorusGeometry = geo();

class Material { constructor(p = {}) { Object.assign(this, p); for (const k of ['color', 'emissive']) if (typeof this[k] === 'number') this[k] = new Color(this[k]); else if (k in p && p[k] === undefined) delete this[k]; this.uuid = Math.random().toString(36).slice(2); } clone() { const o = new this.constructor({ ...this }); return o; } dispose() { this.disposed = true; } }
export class MeshStandardMaterial extends Material { constructor(p = {}) { super(p); this.emissive ||= new Color(0); this.color ||= new Color(0xffffff); this.emissiveIntensity ??= 1; } }
export class MeshBasicMaterial extends Material { constructor(p = {}) { super(p); this.color ||= new Color(0xffffff); } }
export class SpriteMaterial extends Material {}
export class Texture { constructor(image) { this.image = image; this.repeat = new Vector2(); } dispose() { this.disposed = true; } }
export class CanvasTexture extends Texture { constructor(c) { super(c); (window.__canvasTextures ||= []).push(c); } }
export class TextureLoader {
  load(url, onLoad, onProgress, onError) {
    const log = (window.__texLog ||= []);
    const img = new Image();
    img.onload = () => { log.push({ url, ok: true, w: img.naturalWidth, h: img.naturalHeight }); const t = new Texture(img); if (onLoad) onLoad(t); };
    img.onerror = () => { log.push({ url, ok: false }); if (onError) onError(new Error('texture failed')); };
    img.src = url;
    return new Texture(img);
  }
}
export class Raycaster {
  setFromCamera() {}
  intersectObjects(list) {
    const id = window.__pickId;
    const hit = id ? list.find((o) => o.userData && o.userData.memoryId === id) : null;
    return hit ? [{ object: hit }] : [];
  }
}
export class Clock { constructor() { this.t0 = performance.now(); this.last = this.t0; this.elapsedTime = 0; } getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime = (n - this.t0) / 1000; return d; } }
export class WebGLRenderer {
  constructor({ canvas }) { this.domElement = canvas; this.shadowMap = {}; this.info = { render: { calls: 0, triangles: 0 } }; }
  setPixelRatio() {} setSize() {} render() { window.__frames = (window.__frames || 0) + 1; }
}
export const PCFShadowMap = 1, PCFSoftShadowMap = 2, RepeatWrapping = 1000, SRGBColorSpace = 'srgb', DoubleSide = 2;
