// =============================================================================
//  illustrations.js — all "photographs" are original illustrations drawn on a
//  <canvas> at runtime. No image files, no downloads, no real people.
// =============================================================================
import { ILLUSTRATIONS } from '../data/content.js';

const C = {
  cream: '#F4E9D4', creamDark: '#E6D3AE', creamLight: '#FBF4E6',
  teal: '#4F8A8B', tealDark: '#35686A', tealLight: '#8DBDBA',
  terra: '#C8694A', terraLight: '#E0A184', terraDark: '#9C4A32',
  green: '#8DB580', greenDark: '#5E8F5E', greenLight: '#B9D4A8',
  wood: '#B98B5E', woodDark: '#8A6240', ink: '#3A2F28', sun: '#F2C879',
  skins: ['#E8B98F', '#C98E64', '#A8714B', '#F0C9A5'],
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
const fillRR = (ctx, x, y, w, h, r, color) => { ctx.fillStyle = color; rr(ctx, x, y, w, h, r); ctx.fill(); };
const circle = (ctx, x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const ellipse = (ctx, x, y, rx, ry, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
const poly = (ctx, pts, color) => { ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };

/** A simple, friendly figure: head + shoulders (+ optional legs when standing). */
function person(ctx, x, baseY, s, o = {}) {
  const { shirt = C.teal, skin = C.skins[0], hair = '#2d2420', scarf = null, standing = false, elder = false, glasses = false } = o;
  const bodyH = (standing ? 70 : 38) * s;
  const bodyW = 34 * s;
  if (standing) {
    fillRR(ctx, x - 12 * s, baseY - 26 * s, 10 * s, 26 * s, 3 * s, '#4a3f3a');
    fillRR(ctx, x + 2 * s, baseY - 26 * s, 10 * s, 26 * s, 3 * s, '#4a3f3a');
  }
  const bodyTop = baseY - bodyH - (standing ? 4 * s : 0);
  fillRR(ctx, x - bodyW / 2, bodyTop, bodyW, bodyH - (standing ? 22 * s : 0), 10 * s, shirt);
  circle(ctx, x, bodyTop - 11 * s, 12 * s, skin);
  if (scarf) {
    ctx.fillStyle = scarf; ctx.beginPath();
    ctx.arc(x, bodyTop - 11 * s, 14 * s, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(x + 15 * s, bodyTop + 6 * s); ctx.lineTo(x - 15 * s, bodyTop + 6 * s); ctx.closePath(); ctx.fill();
    circle(ctx, x, bodyTop - 10 * s, 9 * s, skin);
  } else {
    ctx.fillStyle = elder ? '#b9b3aa' : hair; ctx.beginPath();
    ctx.arc(x, bodyTop - 14 * s, 12.5 * s, Math.PI, Math.PI * 2); ctx.fill();
  }
  circle(ctx, x - 4 * s, bodyTop - 11 * s, 1.4 * s, C.ink);
  circle(ctx, x + 4 * s, bodyTop - 11 * s, 1.4 * s, C.ink);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2 * s; ctx.beginPath();
  ctx.arc(x, bodyTop - 8 * s, 3.5 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  if (glasses) {
    ctx.lineWidth = 1.1 * s; ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.arc(x - 4 * s, bodyTop - 11 * s, 3.6 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 4 * s, bodyTop - 11 * s, 3.6 * s, 0, Math.PI * 2); ctx.stroke();
  }
}

function plant(ctx, x, y, s, potColor = C.terra) {
  poly(ctx, [[x - 14 * s, y - 22 * s], [x + 14 * s, y - 22 * s], [x + 10 * s, y], [x - 10 * s, y]], potColor);
  for (const [dx, dy, r] of [[-8, -34, 11], [8, -36, 12], [0, -46, 12], [-2, -30, 11]]) circle(ctx, x + dx * s, y + dy * s, r * s, C.greenDark);
  circle(ctx, x + 4 * s, y - 42 * s, 7 * s, C.green);
}

function lantern(ctx, x, y, s, color) {
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y - 14 * s); ctx.lineTo(x, y); ctx.stroke();
  ellipse(ctx, x, y + 12 * s, 9 * s, 12 * s, color);
  fillRR(ctx, x - 4 * s, y - 1 * s, 8 * s, 3 * s, 1, C.ink);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y + 12 * s, 4 * s, 12 * s, 0, 0, Math.PI * 2); ctx.stroke();
}

// ---------------------------------------------------------------------------
//  Scenes
// ---------------------------------------------------------------------------
const SCENES = {
  dinner(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#EBD9B7'); g.addColorStop(1, '#D9B98C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // window with curtain
    fillRR(ctx, 24, 30, 92, 120, 6, '#CBE3E0');
    fillRR(ctx, 24, 30, 30, 120, 4, C.teal);
    fillRR(ctx, 86, 30, 30, 120, 4, C.teal);
    // hanging lamp + glow
    const glow = ctx.createRadialGradient(w / 2, 62, 4, w / 2, 62, 190);
    glow.addColorStop(0, 'rgba(255,226,160,0.8)'); glow.addColorStop(1, 'rgba(255,226,160,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, 40); ctx.stroke();
    poly(ctx, [[w / 2 - 34, 66], [w / 2 + 34, 66], [w / 2 + 14, 40], [w / 2 - 14, 40]], C.terra);
    // six people: five behind the table, one child in front
    const skins = C.skins;
    person(ctx, 92, 205, 1.15, { shirt: C.terra, skin: skins[1], elder: true });
    person(ctx, 168, 190, 1.15, { shirt: C.teal, skin: skins[0], hair: '#2d2420' });
    person(ctx, 245, 183, 1.15, { shirt: C.greenDark, skin: skins[2], hair: '#1f1a17' });
    person(ctx, 322, 190, 1.15, { shirt: '#C79A3B', skin: skins[3], hair: '#4a2f22' });
    person(ctx, 398, 205, 1.15, { shirt: C.tealDark, skin: skins[1], hair: '#2d2420', glasses: true });
    person(ctx, 120, 296, 0.95, { shirt: C.terraLight, skin: skins[0], hair: '#2d2420' });
    // table
    ellipse(ctx, 245, 262, 205, 52, C.woodDark);
    ellipse(ctx, 245, 254, 205, 50, C.wood);
    ellipse(ctx, 245, 254, 168, 38, 'rgba(255,255,255,0.08)');
    // dishes
    for (const [x, y] of [[130, 262], [190, 272], [300, 272], [360, 262], [160, 244], [335, 244]]) {
      ellipse(ctx, x, y, 17, 6.5, '#FBF4E6'); ellipse(ctx, x, y - 2, 12, 4, '#E9C48A');
    }
    ellipse(ctx, 245, 250, 28, 10, '#9AA3A6');
    fillRR(ctx, 220, 226, 50, 22, 8, '#B5BDBF');
    ellipse(ctx, 245, 226, 25, 7, '#D3D9DB');
    circle(ctx, 245, 220, 4, C.ink);
    ellipse(ctx, 245, 282, 24, 7, '#E6D3AE'); ellipse(ctx, 245, 281, 18, 4.5, C.greenLight);
  },

  corridor(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#CFE6E3'); sky.addColorStop(1, '#F4E9D4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // ceiling, floor, side wall (one-point perspective)
    poly(ctx, [[0, 0], [w, 0], [w * 0.72, h * 0.26], [w * 0.28, h * 0.26]], '#D9CBB0');
    poly(ctx, [[0, h], [w, h], [w * 0.72, h * 0.62], [w * 0.28, h * 0.62]], '#D8B48E');
    poly(ctx, [[0, 0], [w * 0.28, h * 0.26], [w * 0.28, h * 0.62], [0, h]], '#EAD9B6');
    fillRR(ctx, w * 0.28, h * 0.26, w * 0.44, h * 0.36, 0, '#F4E9D4');
    // doors on the left wall
    poly(ctx, [[22, 70], [70, 96], [70, 205], [22, 250]], C.terra);
    poly(ctx, [[92, 106], [124, 122], [124, 190], [92, 204]], C.teal);
    // railing on the right with plants
    ctx.strokeStyle = C.tealDark; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w, h * 0.55); ctx.lineTo(w * 0.72, h * 0.5); ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const t = i / 8; const x = w - t * (w - w * 0.72); const y = h * 0.55 - t * (h * 0.05);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60 * (1 - t * 0.6)); ctx.stroke();
    }
    plant(ctx, 440, 292, 1.2); plant(ctx, 60, 300, 1.3, C.tealDark); plant(ctx, 386, 214, 0.7);
    // bunting
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 28); ctx.quadraticCurveTo(w / 2, 80, w, 28); ctx.stroke();
    const cols = [C.terra, C.sun, C.teal, C.greenLight];
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12; const x = t * w; const y = 28 + 4 * 4 * (t - t * t) * 13 + 2;
      poly(ctx, [[x - 9, y], [x + 9, y], [x, y + 18]], cols[i % 4]);
    }
    lantern(ctx, 150, 86, 1.1, C.terra); lantern(ctx, 330, 100, 1, C.sun); lantern(ctx, 250, 118, 0.9, C.teal);
    // bench with dishes
    fillRR(ctx, 168, 218, 150, 12, 3, C.woodDark); fillRR(ctx, 176, 230, 8, 28, 2, C.woodDark); fillRR(ctx, 300, 230, 8, 28, 2, C.woodDark);
    for (const x of [190, 225, 260, 295]) { ellipse(ctx, x, 214, 14, 5, '#FBF4E6'); ellipse(ctx, x, 212, 9, 3, '#E0A184'); }
    // neighbours
    const skins = C.skins;
    person(ctx, 120, 300, 1.1, { shirt: C.teal, skin: skins[1], standing: true });
    person(ctx, 175, 292, 1.0, { shirt: C.terra, skin: skins[2], standing: true, elder: true, glasses: true });
    person(ctx, 235, 285, 1.0, { shirt: C.greenDark, skin: skins[0], standing: true, scarf: C.greenLight });
    person(ctx, 292, 292, 1.05, { shirt: '#C79A3B', skin: skins[3], standing: true });
    person(ctx, 345, 300, 1.1, { shirt: C.tealDark, skin: skins[1], standing: true });
    person(ctx, 268, 305, 0.55, { shirt: C.terraLight, skin: skins[0], standing: true });
    person(ctx, 210, 306, 0.5, { shirt: C.sun, skin: skins[2], standing: true });
  },

  kueh(ctx, w, h) {
    ctx.fillStyle = '#EFE1C2'; ctx.fillRect(0, 0, w, h);
    // tiled wall
    for (let y = 0; y < 190; y += 24) for (let x = 0; x < w; x += 24) {
      ctx.fillStyle = ((x + y) / 24) % 2 === 0 ? '#D7E8E3' : '#C4DDD7'; ctx.fillRect(x, y, 23, 23);
    }
    // window
    fillRR(ctx, 330, 34, 110, 90, 6, '#CFE6F0'); ctx.strokeStyle = C.woodDark; ctx.lineWidth = 4; rr(ctx, 330, 34, 110, 90, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(385, 34); ctx.lineTo(385, 124); ctx.moveTo(330, 79); ctx.lineTo(440, 79); ctx.stroke();
    plant(ctx, 360, 124, 0.7);
    // counter
    fillRR(ctx, 0, 218, w, 102, 0, C.wood); fillRR(ctx, 0, 210, w, 16, 0, C.woodDark);
    // tray of kueh (rows of coloured squares)
    fillRR(ctx, 90, 190, 150, 30, 4, '#B5BDBF');
    const cols = ['#E9A7B6', '#9CCB86', '#F7F1E1', '#E9A7B6', '#9CCB86', '#F7F1E1'];
    cols.forEach((c, i) => { fillRR(ctx, 98 + i * 23, 195, 20, 20, 3, c); });
    // steaming pot
    fillRR(ctx, 330, 170, 90, 44, 6, '#9AA3A6'); ellipse(ctx, 375, 170, 45, 7, '#C7CED0');
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
    for (const x of [350, 375, 400]) { ctx.beginPath(); ctx.moveTo(x, 160); ctx.quadraticCurveTo(x + 10, 140, x, 122); ctx.stroke(); }
    // older woman with scarf (mother) and child
    person(ctx, 180, 260, 1.9, { shirt: C.terra, skin: C.skins[1], scarf: C.greenLight, standing: false });
    person(ctx, 270, 275, 1.25, { shirt: C.teal, skin: C.skins[1], hair: '#2d2420' });
    // hands on the counter
    ellipse(ctx, 215, 218, 10, 6, C.skins[1]); ellipse(ctx, 255, 224, 8, 5, C.skins[1]);
  },

  pot(ctx, w, h) {
    ctx.fillStyle = '#C9A57A'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(0, i * 36, w, 36); }
    ellipse(ctx, 240, 262, 150, 22, 'rgba(0,0,0,0.18)');
    // pot body
    fillRR(ctx, 110, 120, 260, 140, 22, '#A9B1B3');
    fillRR(ctx, 110, 120, 260, 40, 22, '#C2C9CB');
    ellipse(ctx, 240, 124, 130, 30, '#D6DCDE');
    ellipse(ctx, 240, 128, 112, 22, '#5C4A3F'); // crust
    ellipse(ctx, 240, 124, 96, 15, '#8A7058');
    // dent
    ctx.strokeStyle = 'rgba(70,80,84,0.45)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(160, 200, 24, -0.8, 0.9); ctx.stroke();
    // handles
    fillRR(ctx, 84, 150, 28, 14, 6, C.ink); fillRR(ctx, 368, 150, 28, 14, 6, C.ink);
    // spoon
    ctx.strokeStyle = C.woodDark; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(400, 290); ctx.lineTo(330, 210); ctx.stroke();
    ellipse(ctx, 322, 200, 18, 11, C.woodDark);
    ctx.lineCap = 'butt';
  },

  note(ctx, w, h) {
    ctx.fillStyle = '#C9A57A'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.035);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-176, -116, 360, 240);
    ctx.fillStyle = '#FBF6E4'; ctx.fillRect(-180, -120, 360, 240);
    ctx.strokeStyle = 'rgba(79,138,139,0.35)'; ctx.lineWidth = 1;
    for (let y = -78; y < 110; y += 30) { ctx.beginPath(); ctx.moveTo(-170, y); ctx.lineTo(170, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,105,74,0.45)'; ctx.beginPath(); ctx.moveTo(-140, -120); ctx.lineTo(-140, 120); ctx.stroke();
    ctx.fillStyle = '#2d3f55'; ctx.font = 'italic 21px "Segoe Print","Bradley Hand","Comic Sans MS",cursive';
    ctx.textBaseline = 'alphabetic';
    ['Mei — bring the good bowls.', 'First dinner with everyone', 'back at the table.', 'Don’t be late!   — Papa'].forEach((t, i) => ctx.fillText(t, -128, -52 + i * 30));
    ctx.restore();
    ctx.fillStyle = 'rgba(242,200,121,0.8)'; ctx.fillRect(w / 2 - 36, 26, 72, 22); // tape
  },

  market(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#F6E3B8'); sky.addColorStop(1, '#F4E9D4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    // background stalls
    fillRR(ctx, 20, 90, 120, 80, 0, '#CFE0D7'); fillRR(ctx, 350, 100, 110, 70, 0, '#E7C7B2');
    // awning stripes
    for (let i = 0; i < 12; i++) poly(ctx, [[60 + i * 30, 40], [90 + i * 30, 40], [96 + i * 30, 104], [66 + i * 30, 104]], i % 2 ? C.cream : C.terra);
    poly(ctx, [[60, 40], [420, 40], [440, 30], [40, 30]], C.terraDark);
    // posts and counter
    fillRR(ctx, 70, 100, 10, 190, 2, C.woodDark); fillRR(ctx, 400, 100, 10, 190, 2, C.woodDark);
    fillRR(ctx, 50, 220, 380, 22, 3, C.wood); fillRR(ctx, 60, 242, 360, 70, 0, C.woodDark);
    // vendor
    person(ctx, 240, 215, 1.4, { shirt: C.tealDark, skin: C.skins[2], hair: '#2d2420', glasses: true });
    // fruit piles
    const pile = (x, color, n) => { for (let i = 0; i < n; i++) circle(ctx, x + (i % 4) * 16 - 24 + (Math.floor(i / 4) % 2) * 8, 214 - Math.floor(i / 4) * 12, 9, color); };
    pile(110, '#E9893B', 12); pile(190, '#C2453B', 8); pile(300, '#9CCB86', 12); pile(375, '#F2C879', 8);
    // hanging scale
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(240, 104); ctx.lineTo(240, 150); ctx.stroke(); circle(ctx, 240, 152, 5, C.ink);
    plant(ctx, 456, 300, 1.1);
  },

  kites(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7); sky.addColorStop(0, '#A9D3DB'); sky.addColorStop(1, '#F4E9D4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    circle(ctx, 410, 62, 30, C.sun);
    // distant blocks
    [[30, 130, 50, 80, C.terraLight], [86, 100, 44, 110, C.tealLight], [140, 120, 56, 90, C.creamDark], [330, 110, 48, 100, C.tealLight], [384, 134, 60, 76, C.terraLight]]
      .forEach(([x, y, bw, bh, col]) => { fillRR(ctx, x, y, bw, bh, 0, col); for (let wy = y + 8; wy < y + bh - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 12) fillRR(ctx, wx, wy, 6, 8, 1, 'rgba(255,255,255,0.55)'); });
    // field
    ctx.fillStyle = C.green; ctx.beginPath(); ctx.moveTo(0, 230); ctx.quadraticCurveTo(w * 0.5, 190, w, 236); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.greenLight; ctx.beginPath(); ctx.moveTo(0, 270); ctx.quadraticCurveTo(w * 0.5, 240, w, 280); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // kite + string
    const kx = 290, ky = 70;
    poly(ctx, [[kx, ky - 40], [kx + 26, ky], [kx, ky + 44], [kx - 26, ky]], C.terra);
    poly(ctx, [[kx, ky - 40], [kx + 26, ky], [kx, ky]], C.sun);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(kx, ky - 40); ctx.lineTo(kx, ky + 44); ctx.moveTo(kx - 26, ky); ctx.lineTo(kx + 26, ky); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(kx, ky + 44); ctx.quadraticCurveTo(kx - 20, ky + 80, kx - 10, ky + 110); ctx.stroke();
    for (let i = 0; i < 4; i++) poly(ctx, [[kx - 10 - i * 2, ky + 58 + i * 13], [kx - 2 - i * 2, ky + 62 + i * 13], [kx - 16 - i * 2, ky + 68 + i * 13]], i % 2 ? C.teal : C.terra);
    ctx.strokeStyle = 'rgba(58,47,40,0.8)'; ctx.beginPath(); ctx.moveTo(kx, ky + 44); ctx.quadraticCurveTo(250, 170, 180, 262); ctx.stroke();
    person(ctx, 176, 296, 1.15, { shirt: C.tealDark, skin: C.skins[0], standing: true });
    person(ctx, 214, 300, 0.8, { shirt: C.terraLight, skin: C.skins[1], standing: true });
  },

  doorway(ctx, w, h) {
    ctx.fillStyle = '#EBD9B7'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 40) { ctx.fillStyle = 'rgba(0,0,0,0.04)'; ctx.fillRect(x, 0, 20, h); }
    // door frame + door
    fillRR(ctx, 150, 40, 180, 250, 4, C.woodDark);
    fillRR(ctx, 162, 52, 156, 238, 2, C.terra);
    fillRR(ctx, 178, 70, 56, 96, 3, C.terraDark); fillRR(ctx, 246, 70, 56, 96, 3, C.terraDark);
    fillRR(ctx, 178, 178, 56, 90, 3, C.terraDark); fillRR(ctx, 246, 178, 56, 90, 3, C.terraDark);
    circle(ctx, 298, 180, 6, C.sun);
    fillRR(ctx, 214, 18, 52, 20, 3, C.teal);
    ctx.fillStyle = C.cream; ctx.font = 'bold 13px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('#01-xx', 240, 33); ctx.textAlign = 'left';
    // bunting + lanterns
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 14); ctx.quadraticCurveTo(240, 60, w, 14); ctx.stroke();
    const cols = [C.terra, C.sun, C.teal, C.greenLight];
    for (let i = 0; i < 14; i++) { const t = (i + 0.5) / 14; const x = t * w; const y = 14 + 4 * 11 * (t - t * t) + 2; poly(ctx, [[x - 9, y], [x + 9, y], [x, y + 18]], cols[i % 4]); }
    lantern(ctx, 100, 70, 1.3, C.terra); lantern(ctx, 380, 70, 1.3, C.sun); lantern(ctx, 60, 110, 0.9, C.teal);
    // shoes + plant + mat
    fillRR(ctx, 168, 292, 144, 14, 3, C.tealDark);
    for (const [x, c] of [[40, C.ink], [66, C.terraLight], [92, C.teal], [388, C.greenDark], [414, C.ink]]) { fillRR(ctx, x, 280, 22, 11, 5, c); }
    plant(ctx, 440, 296, 1.3); plant(ctx, 30, 300, 0.9, C.tealDark);
  },
};

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------
function photoFinish(ctx, w, h, key) {
  // soft vignette + warm tint, so every scene reads as a keepsake
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
  v.addColorStop(0, 'rgba(60,35,10,0)'); v.addColorStop(1, 'rgba(60,35,10,0.30)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,214,150,0.09)'; ctx.fillRect(0, 0, w, h);
  if (key !== 'note' && key !== 'pot') {
    ctx.strokeStyle = 'rgba(251,244,230,0.95)'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
  }
}

/** Returns a fresh <canvas> with the illustration drawn on it. */
export function drawIllustration(key, w = 480, h = 320) {
  const scene = SCENES[key];
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!scene || !ctx) return canvas;
  ctx.save();
  ctx.scale(w / 480, h / 320); // scenes are authored at 480 x 320
  scene(ctx, 480, 320);
  ctx.restore();
  photoFinish(ctx, w, h, key);
  return canvas;
}

/** A canvas element ready to put in the page, with an accessible description. */
export function illustrationElement(key, { w = 480, h = 320, className = 'illus' } = {}) {
  const c = drawIllustration(key, w, h);
  c.className = className;
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', `Illustration: ${(ILLUSTRATIONS[key] || {}).label || 'a fictional scene'}`);
  return c;
}

export const illustrationAlt = (key) => `Illustration: ${(ILLUSTRATIONS[key] || {}).label || 'a fictional scene'}`;

// ---------------------------------------------------------------------------
//  Procedural textures for the 3D world (also canvas-only)
// ---------------------------------------------------------------------------
export function tileTextureCanvas(c1, c2, groutColor = 'rgba(0,0,0,0.12)', size = 128, cells = 2) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size / cells;
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    ctx.fillStyle = (x + y) % 2 === 0 ? c1 : c2; ctx.fillRect(x * s, y * s, s, s);
  }
  ctx.strokeStyle = groutColor; ctx.lineWidth = 3;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(size, i * s); ctx.stroke();
  }
  // light speckle
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`; ctx.fillRect(rnd() * size, rnd() * size, 2, 2); }
  return c;
}

export function woodTextureCanvas(base = '#C79B6B', dark = '#B2865A', size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 16) { ctx.fillStyle = (y / 16) % 2 ? dark : base; ctx.fillRect(0, y, size, 15); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y + 15, size, 1); }
  return c;
}

export function grassTextureCanvas(size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#A8C98F'; ctx.fillRect(0, 0, size, size);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 160; i++) { ctx.fillStyle = rnd() > 0.5 ? 'rgba(94,143,94,0.25)' : 'rgba(185,212,168,0.35)'; ctx.fillRect(rnd() * size, rnd() * size, 3, 3); }
  return c;
}

/** One floor of one bay of an HDB-inspired facade; repeated by the renderer. */
export function facadeTextureCanvas() {
  const c = makeCanvas(128, 192);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F1E4C9'; ctx.fillRect(0, 0, 128, 192);
  ctx.fillStyle = '#E3D2AB'; ctx.fillRect(0, 0, 128, 14); // slab edge
  // corridor railing (teal) with balusters
  ctx.fillStyle = '#4F8A8B'; ctx.fillRect(0, 96, 128, 7);
  ctx.fillStyle = 'rgba(53,104,106,0.9)';
  for (let x = 6; x < 128; x += 12) ctx.fillRect(x, 103, 3, 62);
  ctx.fillStyle = '#4F8A8B'; ctx.fillRect(0, 165, 128, 5);
  // door (terracotta) and window
  ctx.fillStyle = '#C8694A'; ctx.fillRect(14, 36, 34, 60);
  ctx.fillStyle = '#9C4A32'; ctx.fillRect(18, 42, 26, 22);
  ctx.fillStyle = '#CFE0E3'; ctx.fillRect(70, 44, 40, 38);
  ctx.strokeStyle = '#8A6240'; ctx.lineWidth = 3; ctx.strokeRect(70, 44, 40, 38);
  ctx.beginPath(); ctx.moveTo(90, 44); ctx.lineTo(90, 82); ctx.stroke();
  return c;
}

export function cloudTextureCanvas() {
  const c = makeCanvas(8, 8);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 8, 8);
  return c;
}
