// Prints QR matrices for a set of sample links as JSON (used by scripts/qr-check.py).
import { makeQr } from '../src/qr.js';
const samples = [];
for (const level of ['L', 'M', 'Q', 'H']) {
  for (const n of [5, 14, 30, 50, 66, 80, 100, 120, 150, 170, 200]) {
    const text = 'http://192.168.1.23:3000/join/' + 'aB3-_x9Z'.repeat(40).slice(0, Math.max(0, n - 30));
    try { samples.push({ level, text, matrix: makeQr(text, level).map((r) => r.map((v) => (v ? 1 : 0))) }); } catch { /* too long for this level */ }
  }
}
samples.push({ level: 'M', text: 'http://192.168.0.7:3000/join/0123456789abcdef0123456789abcdef0123456789abcdef', matrix: makeQr('http://192.168.0.7:3000/join/0123456789abcdef0123456789abcdef0123456789abcdef').map((r) => r.map((v) => (v ? 1 : 0))) });
console.log(JSON.stringify(samples));
