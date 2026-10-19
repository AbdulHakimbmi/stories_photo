// =============================================================================
//  collision.js — axis-aligned boxes for walls and furniture.
//   walk boxes  : block the player (circle vs box on the XZ plane)
//   camera boxes: stop the third-person camera from poking through walls/ceilings
// =============================================================================
export class Colliders {
  constructor(bounds) {
    this.walk = [];
    this.cam = [];
    this.bounds = bounds;
  }

  addSolid(minX, maxX, minZ, maxZ, { y0 = 0, y1 = 3, walk = true, cam = true } = {}) {
    const b = { minX, maxX, minZ, maxZ, y0, y1 };
    if (walk) this.walk.push(b);
    if (cam) this.cam.push(b);
    return b;
  }

  removeSolid(box) {
    this.walk = this.walk.filter((b) => b !== box);
    this.cam = this.cam.filter((b) => b !== box);
  }

  /** Push a circle (pos.x, pos.z, radius r) out of every walk box, then clamp to world bounds. */
  resolve(pos, r) {
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const b of this.walk) {
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // centre is inside the box: leave by the shortest way
          const left = pos.x - b.minX;
          const right = b.maxX - pos.x;
          const up = pos.z - b.minZ;
          const down = b.maxZ - pos.z;
          const m = Math.min(left, right, up, down);
          if (m === left) pos.x = b.minX - r;
          else if (m === right) pos.x = b.maxX + r;
          else if (m === up) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    const B = this.bounds;
    if (B) {
      pos.x = Math.max(B.minX, Math.min(B.maxX, pos.x));
      pos.z = Math.max(B.minZ, Math.min(B.maxZ, pos.z));
    }
  }

  /** How far can a ray from o in direction d travel before it hits a camera box? */
  camDistance(o, d, maxDist) {
    let best = maxDist;
    for (const b of this.cam) {
      // ignore boxes the origin is already inside
      if (o.x > b.minX && o.x < b.maxX && o.y > b.y0 && o.y < b.y1 && o.z > b.minZ && o.z < b.maxZ) continue;
      let t0 = 0;
      let t1 = best;
      let hit = true;
      const axes = [
        [o.x, d.x, b.minX, b.maxX],
        [o.y, d.y, b.y0, b.y1],
        [o.z, d.z, b.minZ, b.maxZ],
      ];
      for (const [oo, dd, mn, mx] of axes) {
        if (Math.abs(dd) < 1e-8) {
          if (oo < mn || oo > mx) { hit = false; break; }
        } else {
          let ta = (mn - oo) / dd;
          let tb = (mx - oo) / dd;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) { hit = false; break; }
        }
      }
      if (hit && t0 < best) best = t0;
    }
    return best;
  }
}
