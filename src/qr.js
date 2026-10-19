// =============================================================================
//  qr.js — a small, dependency-free QR Code generator (byte mode, versions 1–10, levels L/M/Q/H).
//  Enough for a join link of up to ~200 characters. Returns a square matrix of booleans (true = dark).
//  Written for this project so the app needs no extra package; checked against an independent
//  decoder (see scripts/qr-test.py). Based on the public QR Code (ISO/IEC 18004) specification.
// =============================================================================

// [ecCodewordsPerBlock, blocksGroup1, dataPerBlockGroup1, blocksGroup2, dataPerBlockGroup2] for levels L, M, Q, H
const EC_TABLE = {
  1: [[7, 1, 19, 0, 0], [10, 1, 16, 0, 0], [13, 1, 13, 0, 0], [17, 1, 9, 0, 0]],
  2: [[10, 1, 34, 0, 0], [16, 1, 28, 0, 0], [22, 1, 22, 0, 0], [28, 1, 16, 0, 0]],
  3: [[15, 1, 55, 0, 0], [26, 1, 44, 0, 0], [18, 2, 17, 0, 0], [22, 2, 13, 0, 0]],
  4: [[20, 1, 80, 0, 0], [18, 2, 32, 0, 0], [26, 2, 24, 0, 0], [16, 4, 9, 0, 0]],
  5: [[26, 1, 108, 0, 0], [24, 2, 43, 0, 0], [18, 2, 15, 2, 16], [22, 2, 11, 2, 12]],
  6: [[18, 2, 68, 0, 0], [16, 4, 27, 0, 0], [24, 4, 19, 0, 0], [28, 4, 15, 0, 0]],
  7: [[20, 2, 78, 0, 0], [18, 4, 31, 0, 0], [18, 2, 14, 4, 15], [26, 4, 13, 1, 14]],
  8: [[24, 2, 97, 0, 0], [22, 2, 38, 2, 39], [22, 4, 18, 2, 19], [26, 4, 14, 2, 15]],
  9: [[30, 2, 116, 0, 0], [22, 3, 36, 2, 37], [20, 4, 16, 4, 17], [24, 4, 12, 4, 13]],
  10: [[18, 2, 68, 2, 69], [26, 4, 43, 1, 44], [24, 6, 19, 2, 20], [28, 6, 15, 2, 16]],
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// ---- Reed–Solomon over GF(256), polynomial 0x11D
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gmul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly; // highest degree first, leading 1
}
function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ res.shift();
    res.push(0);
    for (let i = 0; i < degree; i++) res[i] ^= gmul(gen[i + 1], factor);
  }
  return res;
}

function utf8(text) { return [...new TextEncoder().encode(text)]; }

function capacityBytes(version, level) {
  const [, b1, d1, b2, d2] = EC_TABLE[version][LEVELS[level]];
  return b1 * d1 + b2 * d2;
}

function bch(value, poly, bits, total) {
  let v = value << bits;
  for (let i = total - 1; i >= bits; i--) if ((v >>> i) & 1) v ^= poly << (i - bits);
  return v;
}

/** @returns {boolean[][]} square matrix (true = dark module), without the quiet zone */
export function makeQr(text, level = 'M') {
  const bytes = utf8(String(text));
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= capacityBytes(v, level) * 8) { version = v; break; }
  }
  if (!version) throw new Error('That text is too long for this QR generator.');
  const [ecLen, b1, d1, b2, d2] = EC_TABLE[version][LEVELS[level]];
  const dataCap = b1 * d1 + b2 * d2;

  // ---- bit stream: mode 0100 (bytes), 8-bit count (versions 1–9) / 16-bit count (10), data, terminator, padding
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCap; pad ^= 0xec ^ 0x11) data.push(pad);

  // ---- split into blocks, add error correction, interleave
  const blocks = [];
  let pos = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const n = i < b1 ? d1 : d2;
    const d = data.slice(pos, pos + n);
    pos += n;
    blocks.push({ d, e: rsRemainder(d, ecLen) });
  }
  const final = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.d.length) final.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) final.push(b.e[i]);

  // ---- matrix
  const size = version * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false)); // function-pattern modules
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx; const y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
  const al = ALIGN[version];
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  set(8, size - 8, true); // the always-dark module
  // reserve format + version areas
  const reserve = (x, y) => { fn[y][x] = true; };
  for (let i = 0; i < 9; i++) { reserve(8, i); reserve(i, 8); }
  for (let i = 0; i < 8; i++) { reserve(size - 1 - i, 8); reserve(8, size - 1 - i); }
  if (version >= 7) {
    const info = (version << 12) | bch(version, 0x1f25, 12, 18);
    for (let i = 0; i < 18; i++) {
      const dark = ((info >>> i) & 1) === 1;
      const a = Math.floor(i / 3); const b = (i % 3) + size - 11;
      set(a, b, dark); set(b, a, dark);
    }
  }

  // ---- place data bits (zig-zag from the bottom right)
  const allBits = [];
  for (const byte of final) for (let i = 7; i >= 0; i--) allBits.push((byte >>> i) & 1);
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - v : v;
        if (!fn[y][x] && bi < allBits.length) mod[y][x] = allBits[bi++] === 1;
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  function withMask(m) {
    const out = mod.map((row) => row.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) out[y][x] = !out[y][x];
    // format information (15 bits), written twice
    const fmt = ((((FORMAT_BITS[level] << 3) | m) << 10) | bch((FORMAT_BITS[level] << 3) | m, 0x537, 10, 15)) ^ 0x5412;
    const bit = (i) => ((fmt >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) out[i][8] = bit(i);
    out[7][8] = bit(6); out[8][8] = bit(7); out[8][7] = bit(8);
    for (let i = 9; i < 15; i++) out[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) out[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) out[size - 15 + i][8] = bit(i);
    out[size - 8][8] = true;
    return out;
  }

  function penalty(m) {
    let p = 0;
    const n = size;
    for (let pass = 0; pass < 2; pass++) { // rows then columns: runs of 5+ and finder-like patterns
      for (let a = 0; a < n; a++) {
        let run = 1;
        const at = (i) => (pass === 0 ? m[a][i] : m[i][a]);
        for (let i = 1; i < n; i++) {
          if (at(i) === at(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        for (let i = 0; i + 10 < n; i++) {
          const w = [];
          for (let k = 0; k < 11; k++) w.push(at(i + k) ? 1 : 0);
          const s = w.join('');
          if (s === '10111010000' || s === '00001011101') p += 40;
        }
      }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    let dark = 0;
    for (const row of m) for (const v of row) if (v) dark++;
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  }

  let best = null; let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const candidate = withMask(m);
    const score = penalty(candidate);
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

/** Draw the QR code onto a canvas element (with a white quiet zone). */
export function drawQr(canvas, text, { size = 280, level = 'M', dark = '#1d1a17' } = {}) {
  const m = makeQr(text, level);
  const quiet = 4;
  const total = m.length + quiet * 2;
  const scale = Math.max(1, Math.floor(size / total));
  canvas.width = total * scale;
  canvas.height = total * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark;
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
  return canvas;
}
