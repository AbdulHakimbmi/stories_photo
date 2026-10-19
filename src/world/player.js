// =============================================================================
//  player.js — Marcus (third-person), movement with collision, and the follow camera.
//  Camera: orbit around the player; the camera is shortened by a ray test against
//  walls/ceilings so it never ends up inside a wall.
// =============================================================================
import * as THREE from 'three';
import { PLAYER, PALETTE as P } from './config.js';
import { makePerson, std } from './kit.js';

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Player {
  constructor({ scene, camera, colliders, input }) {
    this.camera = camera;
    this.colliders = colliders;
    this.input = input;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;                       // camera heading (0 = looking north / -Z)
    this.pitch = PLAYER.pitchDefault;
    this.dist = PLAYER.camDistance;
    this.curDist = PLAYER.camDistance;
    this.modelYaw = 0;
    this.moving = false;
    this.walkT = 0;
    this._head = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    this.model = makePerson({ shirt: P.sun, pants: 0x3f4a56, skin: P.skins[1], hair: 0x1c1714, hairStyle: 'short', cuff: P.tealDark });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.44, 0.16), std(P.teal));
    pack.position.set(0, 1.15, -0.22);
    pack.castShadow = true;
    this.model.add(pack);
    scene.add(this.model);
  }

  teleport(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.colliders.resolve(this.pos, PLAYER.radius); // never land inside furniture
    this.yaw = yaw;
    this.pitch = PLAYER.pitchDefault;
    this.modelYaw = yaw + Math.PI;     // face away from the camera
    this.curDist = this.dist;
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.modelYaw;
    this.updateCamera(0.016);
  }

  /** Put the camera directly behind the player. */
  recenter() {
    this.yaw = wrap(this.modelYaw + Math.PI);
    this.pitch = PLAYER.pitchDefault;
  }

  rotate(dx, dy) {
    this.yaw = wrap(this.yaw - dx * 0.0055);
    this.pitch = clamp(this.pitch + dy * 0.0042, PLAYER.pitchMin, PLAYER.pitchMax);
  }

  zoom(deltaY) {
    this.dist = clamp(this.dist + Math.sign(deltaY) * 0.35, PLAYER.camMin, PLAYER.camMax);
  }

  update(dt, { canMove = true, reducedMotion = false } = {}) {
    dt = Math.min(dt, 0.05);
    const inp = this.input;
    let mx = 0;
    let mz = 0;
    if (canMove) {
      mz = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);
      mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (inp.camLeft) this.yaw = wrap(this.yaw + 1.9 * dt);
      if (inp.camRight) this.yaw = wrap(this.yaw - 1.9 * dt);
    }
    this.moving = canMove && (mx !== 0 || mz !== 0);
    if (this.moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const vx = fx * mz + rx * mx;
      const vz = fz * mz + rz * mx;
      this.pos.x += vx * PLAYER.speed * dt;
      this.pos.z += vz * PLAYER.speed * dt;
      this.colliders.resolve(this.pos, PLAYER.radius);
      const target = Math.atan2(vx, vz);
      this.modelYaw = wrap(this.modelYaw + wrap(target - this.modelYaw) * Math.min(1, dt * 12));
      this.walkT += dt * 9;
    } else {
      this.walkT += dt * 1.5;
    }

    // walk cycle (smaller when reduced motion is on)
    const parts = this.model.userData.parts;
    const amp = this.moving ? (reducedMotion ? 0.3 : 0.65) : 0;
    const s = Math.sin(this.walkT);
    if (parts.legL) parts.legL.rotation.x = s * amp;
    if (parts.legR) parts.legR.rotation.x = -s * amp;
    if (parts.armL) parts.armL.rotation.x = -s * amp * 0.8;
    if (parts.armR) parts.armR.rotation.x = s * amp * 0.8;
    this.model.position.set(this.pos.x, this.moving && !reducedMotion ? Math.abs(s) * 0.04 : 0, this.pos.z);
    this.model.rotation.y = this.modelYaw;

    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const head = this._head.set(this.pos.x, PLAYER.camHeight, this.pos.z);
    const cp = Math.cos(this.pitch);
    const dir = this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hit = this.colliders.camDistance(head, dir, this.dist + 0.4);
    const want = clamp(hit - 0.35, 0.8, this.dist);
    // pull in immediately (never show the inside of a wall), ease back out
    this.curDist = want < this.curDist ? want : this.curDist + (want - this.curDist) * Math.min(1, dt * 5);
    this.camera.position.set(head.x + dir.x * this.curDist, Math.max(0.3, head.y + dir.y * this.curDist), head.z + dir.z * this.curDist);
    this.camera.lookAt(head.x, head.y - 0.2, head.z);
    this.model.visible = this.curDist > 1.15; // hide Marcus if the camera is squeezed right up to him
  }
}
