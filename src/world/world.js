// =============================================================================
//  world.js — builds the whole low-poly neighbourhood and exposes a small API:
//    world.interactables  : things the player can press E on
//    world.npcs           : the fictional residents
//    world.colliders      : walls and furniture (player + camera)
//    world.update(...)    : ambient motion, markers, highlights
//    world.updateBoard(records) : redraw the PUBLIC memory board texture
//
//  Layout (top-down, x → east, z → south; one flat level so nothing can be fallen from):
//    Void deck   x -14..4,  z -7..7      (Aisha, memory board, kiosk, benches)
//    Corridor    x   4..26, z -2..2      (open railing on the south side)
//    Living room x   6..14, z -10..-2.3  (Lim family — door at x 9..11)
//    Quiet corner x 26..36, z -5..5      (Auntie Salmah on a bench)
// =============================================================================
import * as THREE from 'three';
import { PALETTE as P, LIGHT, BOUNDS } from './config.js';
import { Colliders } from './collision.js';
import { Kit, std, canvasTexture, makeUnique, labelPlane, nameTag, photoFrame, potPlant, makePerson } from './kit.js';
import {
  tileTextureCanvas, woodTextureCanvas, grassTextureCanvas, facadeTextureCanvas, drawIllustration,
} from '../art/illustrations.js';
import { GAME_TITLE } from '../data/content.js';

export function buildWorld({ scene, lowFx = false }) {
  const colliders = new Colliders(BOUNDS);
  const kit = new Kit(scene, colliders);
  const interactables = [];
  const npcs = {};
  const swayers = [];
  const clouds = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------------ lighting
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.sky, 55, 140);
  scene.add(new THREE.AmbientLight(0xfff1dc, LIGHT.ambient));
  scene.add(new THREE.HemisphereLight(0xdff0ee, 0xc9a97d, LIGHT.hemi));
  const sun = new THREE.DirectionalLight(0xfff0d2, LIGHT.sun);
  sun.position.set(14, 26, 16);
  sun.target.position.set(10, 0, 0);
  scene.add(sun, sun.target);
  if (!lowFx) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix();
  }

  const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
  function lamp(x, y, z, { intensity = LIGHT.lamp, distance = LIGHT.lampDistance } = {}) {
    const l = new THREE.PointLight(0xffe2b0, intensity, distance, 2);
    l.position.set(x, y, z);
    scene.add(l);
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 8), lampBulbMat);
    bulb.position.set(x, y + 0.25, z);
    scene.add(bulb);
  }

  // ------------------------------------------------------------------ ground + floors
  const grassTex = canvasTexture(grassTextureCanvas(), 40, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 150), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(10, 0, 10);
  ground.receiveShadow = true;
  scene.add(ground);

  const deckTile = canvasTexture(tileTextureCanvas('#E9D7B2', '#DFC79C', 'rgba(120,80,40,0.18)'), 9, 7);
  kit.box({ x: -5, z: 0, y: 0, w: 18, h: 0.04, d: 14, mat: new THREE.MeshStandardMaterial({ map: deckTile, roughness: 0.9 }), cast: false });
  const corrTile = canvasTexture(tileTextureCanvas('#EFE2C6', '#E4D3AE', 'rgba(120,80,40,0.16)'), 11, 2);
  kit.box({ x: 15, z: 0, y: 0, w: 22, h: 0.04, d: 4, mat: new THREE.MeshStandardMaterial({ map: corrTile, roughness: 0.9 }), cast: false });
  const woodTex = canvasTexture(woodTextureCanvas(), 8, 8);
  kit.box({ x: 10, z: -6.15, y: 0, w: 8, h: 0.04, d: 7.7, mat: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 }), cast: false });
  const cornerGrass = canvasTexture(grassTextureCanvas(), 5, 5);
  kit.box({ x: 31, z: 0, y: 0, w: 10, h: 0.04, d: 10, mat: new THREE.MeshStandardMaterial({ map: cornerGrass, roughness: 1 }), cast: false });
  const pathTile = canvasTexture(tileTextureCanvas('#EAD9B6', '#E2CFA6', 'rgba(120,80,40,0.2)', 128, 2), 6, 1);
  kit.box({ x: 29.5, z: 0.3, y: 0.04, w: 7, h: 0.02, d: 2, mat: new THREE.MeshStandardMaterial({ map: pathTile, roughness: 0.9 }), cast: false });
  kit.box({ x: 31, z: -2.2, y: 0.04, w: 2, h: 0.02, d: 4.4, mat: new THREE.MeshStandardMaterial({ map: pathTile, roughness: 0.9 }), cast: false });

  // ------------------------------------------------------------------ structure: void deck
  const WALL = P.cream;
  const T = 0.3;
  // north wall (back of the void deck, holds the memory board and kiosk)
  kit.box({ x: -5, z: -7.15, y: 0, w: 18.6, h: 3.5, d: T, color: P.creamLight, solid: true });
  // west planter wall + south planter wall (low, so the camera can look out over the garden)
  kit.box({ x: -14.15, z: 0, y: 0, w: T, h: 1.0, d: 14.6, color: P.terraLight, solid: true, cam: false });
  kit.box({ x: -5, z: 7.15, y: 0, w: 18.6, h: 0.9, d: T, color: P.terraLight, solid: true, cam: false });
  // east wall, with the opening into the corridor (z -2..2)
  kit.box({ x: 4.15, z: -4.65, y: 0, w: T, h: 3.5, d: 5.4, color: WALL, solid: true });
  kit.box({ x: 4.15, z: 4.65, y: 0, w: T, h: 3.5, d: 5.4, color: WALL, solid: true });
  // deck canopy (what the block above rests on) — camera-blocking only; the player can never reach it
  kit.box({ x: -5, y: 3.2, z: 0, w: 18.6, h: 0.35, d: 14.8, color: P.concrete, solid: false });
  kit.camOnly(-14.3, 4.3, -7.3, 7.4, 3.2, 3.55);
  // columns
  for (const cx of [-11, -5, 1]) for (const cz of [-4.5, 4.5]) {
    kit.box({ x: cx, z: cz, y: 0, w: 0.6, h: 3.2, d: 0.6, color: P.concrete, solid: true });
    kit.box({ x: cx, z: cz, y: 0, w: 0.75, h: 0.3, d: 0.75, color: P.teal, solid: false });
  }
  lamp(-10, 3.0, 0); lamp(-3, 3.0, 0); lamp(-7, 3.0, -5);

  // ------------------------------------------------------------------ structure: corridor
  kit.box({ x: 15, y: 3.2, z: 0, w: 22, h: 0.35, d: 4.6, color: P.concrete, solid: false });
  kit.camOnly(4.3, 26.3, -2.3, 2.3, 3.2, 3.55);
  // north wall with the living-room doorway at x 9..11
  kit.box({ x: 6.65, z: -2.15, y: 0, w: 4.7, h: 3.2, d: T, color: WALL, solid: true });
  kit.box({ x: 18.65, z: -2.15, y: 0, w: 15.3, h: 3.2, d: T, color: WALL, solid: true });
  kit.box({ x: 10, z: -2.15, y: 2.4, w: 2, h: 0.8, d: T, color: WALL, solid: false }); // lintel
  // decorative unit doors + number plates
  for (const [dx, plate] of [[5.6, '#01-10'], [14.6, '#01-14'], [23.2, '#01-18']]) {
    const door = kit.box({ x: dx, z: -1.97, y: 0, w: 1.0, h: 2.1, d: 0.06, color: dx === 14.6 ? P.teal : P.terra, solid: false, cast: false });
    door.name = 'unit-door';
    const plateMesh = labelPlane(plate, 0.5, 0.2, { size: 56, bg: '#FBF4E6', accent: '#8A6240' });
    plateMesh.position.set(dx, 2.35, -1.93);
    kit.root.add(plateMesh);
  }
  // railing on the south edge
  kit.box({ x: 15, z: 2.0, y: 1.0, w: 22, h: 0.08, d: 0.1, color: P.tealDark, solid: false });
  kit.box({ x: 15, z: 2.0, y: 0.3, w: 22, h: 0.05, d: 0.06, color: P.tealDark, solid: false });
  for (let x = 4.5; x <= 25.5; x += 1.0) kit.box({ x, z: 2.0, y: 0, w: 0.06, h: 1.0, d: 0.06, color: P.teal, solid: false, cast: false });
  colliders.addSolid(4, 26, 1.9, 2.15, { y0: 0, y1: 1.1, cam: false });
  kit.box({ x: 15, z: 2.0, y: 0, w: 22, h: 0.25, d: 0.25, color: P.creamDark, solid: false }); // kerb
  for (const lx of [8, 15.5, 22.5]) lamp(lx, 3.0, 0, { intensity: LIGHT.lamp * 0.9 });
  for (const px of [5.4, 9.2, 13.2, 17.6, 21.6, 25.2]) potPlant(kit, px, 1.6, { scale: px === 25.2 ? 1.15 : 1, pot: px % 2 > 1 ? P.teal : P.terra });
  // string of lanterns over the gathering spot (gently swaying)
  const lanternGroup = new THREE.Group();
  [[16.2, P.terra], [17.6, P.sun], [19.0, P.teal], [20.4, P.terra], [21.8, P.sun]].forEach(([lx, c], i) => {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, flatShading: true }));
    l.scale.set(1, 1.25, 1);
    l.position.set(lx, 2.55 - (i % 2) * 0.12, 0.1 + (i % 2) * 0.4);
    lanternGroup.add(l);
  });
  kit.root.add(lanternGroup);
  swayers.push({ obj: lanternGroup, amp: 0.03, speed: 0.9, axis: 'x' });

  // ------------------------------------------------------------------ the block above (facade)
  const facadeTex = canvasTexture(facadeTextureCanvas(), 20.3, 5);
  const facadeMat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 1 });
  const plainMat = std(P.creamDark);
  const roofMat = std(P.terraDark);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(40.6, 15, 16), [plainMat, plainMat, roofMat, plainMat, facadeMat, plainMat]);
  upper.position.set(6, 3.55 + 7.5, -6);
  upper.castShadow = !lowFx;
  upper.receiveShadow = true;
  scene.add(upper);
  // lift/stair core + water tank on the roof for the HDB silhouette
  kit.box({ x: -2, z: -6, y: 18.5, w: 3, h: 2.2, d: 3, color: P.terraLight });
  kit.box({ x: 18, z: -6, y: 18.5, w: 2.4, h: 1.6, d: 2.4, color: P.tealLight });
  // ground-floor mass behind the walls (so nothing hollow is ever visible)
  kit.box({ x: -5, z: -10.65, y: 0, w: 18.6, h: 3.5, d: 7, color: P.creamDark, cast: false });
  kit.box({ x: 5.0, z: -8.2, y: 0, w: 1.4, h: 3.5, d: 12, color: P.creamDark, cast: false });
  kit.box({ x: 20.15, z: -8.3, y: 0, w: 12.4, h: 3.5, d: 12, color: P.creamDark, cast: false });
  // neighbouring blocks, fog-softened skyline
  const skyline = [[-6, 44, 14], [22, 50, 18], [52, 42, 12], [-34, 38, 16], [66, 8, 12], [-46, 0, 14]];
  skyline.forEach(([sx, sz, sh], i) => {
    const tex = canvasTexture(facadeTextureCanvas(), 14, sh / 3);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(28, sh, 10), [plainMat, plainMat, roofMat, plainMat, m, m]);
    b.position.set(sx, sh / 2, sz);
    b.rotation.y = i > 3 ? Math.PI / 2 * (i === 4 ? 1 : -1) : 0;
    scene.add(b);
  });

  // ------------------------------------------------------------------ garden (outside the railing; decorative)
  const treeSpots = [[9, 6.5], [16.5, 8], [24, 6.2], [-9, 10], [-2, 11], [4, 10], [34, 9], [40, 2], [-16, 3], [13, 12]];
  treeSpots.forEach(([tx, tz], i) => {
    const s = 0.9 + (i % 3) * 0.25;
    kit.cyl({ x: tx, z: tz, r: 0.22 * s, h: 2.0 * s, color: P.woodDark });
    kit.ball({ x: tx, y: 2.5 * s, z: tz, r: 1.25 * s, color: i % 2 ? P.green : P.greenDark });
    kit.ball({ x: tx + 0.5 * s, y: 3.2 * s, z: tz - 0.3 * s, r: 0.9 * s, color: P.greenLight });
  });
  for (const [hx, hz] of [[0, 8.6], [11, 5.4], [19, 5.2], [28, 7]]) kit.box({ x: hx, z: hz, y: 0, w: 4, h: 0.7, d: 0.9, color: P.greenDark, cast: false });

  // ------------------------------------------------------------------ living room
  const roomWallColor = P.creamLight;
  kit.box({ x: 5.85, z: -6.15, y: 0, w: T, h: 3.2, d: 7.9, color: roomWallColor, solid: true });       // west
  kit.box({ x: 14.15, z: -6.15, y: 0, w: T, h: 3.2, d: 7.9, color: roomWallColor, solid: true });      // east
  kit.box({ x: 10, z: -10.15, y: 0, w: 8.6, h: 3.2, d: T, color: roomWallColor, solid: true });        // north
  kit.box({ x: 10, y: 2.85, z: -6.15, w: 8.3, h: 0.35, d: 7.9, color: P.concrete, solid: false, cast: false });
  kit.camOnly(5.7, 14.3, -10.3, -2.0, 2.85, 3.5);
  // accent wall + window on the west wall
  kit.box({ x: 10, z: -9.96, y: 0.0, w: 8, h: 2.8, d: 0.04, color: P.tealLight, cast: false, receive: true });
  const win = kit.box({ x: 6.03, z: -7.9, y: 1.05, w: 0.04, h: 1.1, d: 1.7, color: 0xcfe6f0, cast: false });
  win.material = new THREE.MeshStandardMaterial({ color: 0xcfe6f0, emissive: 0xcfe6f0, emissiveIntensity: 0.5 });
  kit.box({ x: 6.05, z: -7.9, y: 1.0, w: 0.06, h: 0.08, d: 1.8, color: P.woodDark, cast: false });
  kit.box({ x: 6.05, z: -7.9, y: 2.1, w: 0.06, h: 0.08, d: 1.8, color: P.woodDark, cast: false });
  lamp(10, 2.3, -6.2, { intensity: LIGHT.lamp * 1.1, distance: 12 });
  lamp(10, 2.3, -3.6, { intensity: LIGHT.lamp * 0.7, distance: 9 });
  // rug, table, chairs
  kit.cyl({ x: 10, z: -6.2, r: 1.9, h: 0.03, seg: 12, color: P.terra, cast: false });
  kit.cyl({ x: 10, z: -6.2, r: 1.5, h: 0.035, seg: 12, color: P.terraLight, cast: false });
  kit.cyl({ x: 10, y: 0, z: -6.2, r: 0.18, h: 0.72, color: P.woodDark });
  kit.cyl({ x: 10, y: 0.72, z: -6.2, r: 1.0, h: 0.06, seg: 12, color: P.wood });
  colliders.addSolid(9.0, 11.0, -7.2, -5.2, { y0: 0, y1: 0.8 });
  for (const [cx, cz, ax, az] of [[8.55, -6.2, -1, 0], [11.45, -6.2, 1, 0], [10, -7.65, 0, -1], [10, -4.75, 0, 1]]) {
    kit.box({ x: cx, z: cz, y: 0.0, w: 0.45, h: 0.45, d: 0.45, color: P.teal, solid: true, cam: false });
    kit.box({ x: cx + ax * 0.19, z: cz + az * 0.19, y: 0.45, w: ax ? 0.07 : 0.45, h: 0.5, d: az ? 0.07 : 0.45, color: P.tealDark, cast: false });
  }
  // hanging lamp shade over the table
  kit.cyl({ x: 10, y: 2.0, z: -6.2, r: 0.5, rTop: 0.12, h: 0.35, seg: 8, color: P.terra });
  kit.cyl({ x: 10, y: 2.35, z: -6.2, r: 0.015, h: 0.6, seg: 4, color: P.ink });
  // sideboard with the family photograph
  kit.box({ x: 10, z: -9.7, y: 0, w: 2.8, h: 0.9, d: 0.5, color: P.woodDark, solid: true });
  kit.box({ x: 10, z: -9.7, y: 0.9, w: 2.9, h: 0.05, d: 0.55, color: P.wood });
  potPlant(kit, 8.85, -9.7, { scale: 0.7, solid: false, parent: null }).position.y = 0.95;
  // sofa along the west wall
  kit.box({ x: 6.7, z: -4.9, y: 0, w: 1.0, h: 0.45, d: 2.3, color: P.terra, solid: true, cam: false });
  kit.box({ x: 6.3, z: -4.9, y: 0.45, w: 0.3, h: 0.55, d: 2.3, color: P.terraDark });
  kit.box({ x: 6.7, z: -3.85, y: 0.45, w: 1.0, h: 0.3, d: 0.2, color: P.terraDark });
  kit.box({ x: 6.7, z: -5.95, y: 0.45, w: 1.0, h: 0.3, d: 0.2, color: P.terraDark });
  // bookshelf on the east wall
  kit.box({ x: 13.7, z: -7.4, y: 0, w: 0.5, h: 1.9, d: 2.0, color: P.woodDark, solid: true });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    kit.box({ x: 13.45, z: -8.2 + j * 0.38, y: 0.15 + i * 0.45, w: 0.12, h: 0.3, d: 0.26, color: [P.teal, P.terra, P.green, P.sun, P.tealDark][(i + j) % 5], cast: false });
  }
  // side table with the handwritten note
  kit.cyl({ x: 12.9, z: -8.8, r: 0.32, h: 0.55, seg: 8, color: P.wood, solid: true });
  potPlant(kit, 13.2, -3.0, { scale: 1.1 });
  // shoe rack by the door
  kit.box({ x: 12.3, z: -2.75, y: 0, w: 1.0, h: 0.4, d: 0.3, color: P.woodDark, solid: false });

  // ------------------------------------------------------------------ quiet corner
  const hedge = P.greenDark;
  kit.box({ x: 31.2, z: -5.2, y: 0, w: 10.6, h: 1.3, d: 0.5, color: hedge, solid: true, cam: false });
  kit.box({ x: 31.2, z: 5.2, y: 0, w: 10.6, h: 1.3, d: 0.5, color: hedge, solid: true, cam: false });
  kit.box({ x: 36.2, z: 0, y: 0, w: 0.5, h: 1.3, d: 10.9, color: hedge, solid: true, cam: false });
  kit.box({ x: 26.15, z: -3.65, y: 0, w: 0.3, h: 1.3, d: 3.3, color: hedge, solid: true, cam: false });
  kit.box({ x: 26.15, z: 3.65, y: 0, w: 0.3, h: 1.3, d: 3.3, color: hedge, solid: true, cam: false });
  // tree
  kit.cyl({ x: 34, z: -3, r: 0.28, h: 2.4, color: P.woodDark, solid: true });
  kit.ball({ x: 34, y: 3.2, z: -3, r: 1.6, color: P.green });
  kit.ball({ x: 34.7, y: 4.1, z: -3.4, r: 1.1, color: P.greenLight });
  kit.ball({ x: 33.3, y: 3.9, z: -2.5, r: 1.0, color: P.greenDark });
  // bench
  kit.box({ x: 31, z: -4.15, y: 0.4, w: 2.4, h: 0.1, d: 0.6, color: P.wood });
  kit.box({ x: 31, z: -4.5, y: 0.5, w: 2.4, h: 0.55, d: 0.08, color: P.wood });
  for (const bx of [29.95, 32.05]) kit.box({ x: bx, z: -4.15, y: 0, w: 0.1, h: 0.4, d: 0.55, color: P.tealDark });
  colliders.addSolid(29.7, 32.3, -4.55, -3.75, { y0: 0, y1: 1.1 });
  // table + stools, planters, sign
  kit.cyl({ x: 29, z: 2.8, r: 0.6, h: 0.06, y: 0.7, seg: 10, color: P.stone });
  kit.cyl({ x: 29, z: 2.8, r: 0.12, h: 0.7, color: P.stone, solid: true });
  for (const [sx, sz] of [[28.1, 2.8], [29.9, 2.8]]) kit.cyl({ x: sx, z: sz, r: 0.22, h: 0.4, seg: 7, color: P.terra, solid: true });
  for (const [px, pz] of [[27, -4.3], [27, 4.3], [34.3, 4.3], [34.3, 0.5]]) potPlant(kit, px, pz, { scale: 1.2, pot: P.tealDark });
  kit.box({ x: 33.5, z: 2.5, y: 0, w: 2.6, h: 0.35, d: 1.2, color: P.woodDark, solid: true, cam: false });
  for (let i = 0; i < 5; i++) kit.ball({ x: 32.5 + i * 0.5, y: 0.5, z: 2.5 + (i % 2) * 0.2, r: 0.2, color: [P.terraLight, P.sun, P.greenLight, P.terra, P.tealLight][i], detail: 0 });
  kit.cyl({ x: 27.6, z: -1.7, r: 0.04, h: 1.5, color: P.ink, seg: 4 });
  const quietSign = labelPlane(['Quiet corner', 'a place to sit and remember'], 1.4, 0.55, { size: 54 });
  quietSign.position.set(27.6, 1.7, -1.66);
  kit.root.add(quietSign);

  // ------------------------------------------------------------------ void deck furniture
  // benches
  for (const bx of [-9, -2.5]) {
    kit.box({ x: bx, z: 5.7, y: 0.42, w: 2.4, h: 0.1, d: 0.6, color: bx < -5 ? P.terra : P.teal });
    kit.box({ x: bx, z: 6.02, y: 0.52, w: 2.4, h: 0.5, d: 0.08, color: bx < -5 ? P.terraDark : P.tealDark });
    for (const dx of [-1.0, 1.0]) kit.box({ x: bx + dx, z: 5.7, y: 0, w: 0.1, h: 0.42, d: 0.55, color: P.concrete });
    colliders.addSolid(bx - 1.25, bx + 1.25, 5.35, 6.1, { y0: 0, y1: 1.1, cam: false });
  }
  // stone chess table with stools
  kit.cyl({ x: -11.8, z: 0.2, r: 0.5, h: 0.06, y: 0.72, seg: 6, color: P.stone });
  kit.cyl({ x: -11.8, z: 0.2, r: 0.14, h: 0.72, seg: 6, color: P.stone, solid: true });
  for (const [sx, sz] of [[-11.8, -0.8], [-11.8, 1.2]]) kit.cyl({ x: sx, z: sz, r: 0.2, h: 0.4, seg: 6, color: P.stone, solid: true });
  // mailboxes on the east wall
  for (let i = 0; i < 8; i++) kit.box({ x: 3.88, z: 2.8 + i * 0.5, y: 1.1, w: 0.1, h: 0.4, d: 0.42, color: i % 2 ? P.steel : P.tealLight, cast: false });
  // planters along the west wall and a bicycle-less rack
  for (const pz of [-5.4, -2.5, 3.0, 5.2]) potPlant(kit, -13.5, pz, { scale: 1.2 });
  // old notice board (decor)
  kit.box({ x: 3.88, z: -5.2, y: 1.2, w: 0.08, h: 1.0, d: 1.6, color: P.wood });
  for (let i = 0; i < 6; i++) kit.box({ x: 3.8, z: -5.8 + (i % 3) * 0.5, y: 1.35 + Math.floor(i / 3) * 0.4, w: 0.02, h: 0.26, d: 0.34, color: [P.creamLight, P.sun, P.terraLight][i % 3], cast: false });
  const deckSign = labelPlane(['Block 12 · void deck', 'a proposed neighbourhood memory service'], 3.6, 0.7, { size: 52 });
  deckSign.position.set(1.4, 2.7, -6.97);
  deckSign.rotation.y = 0;
  kit.root.add(deckSign);

  // ------------------------------------------------------------------ memory board (PUBLIC records only)
  const BW = 1280;
  const BH = 640;
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = BW;
  boardCanvas.height = BH;
  const boardTex = canvasTexture(boardCanvas);
  const boardGroup = new THREE.Group();
  boardGroup.position.set(-8, 0, -6.9);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(4.7, 2.5, 0.1), std(P.woodDark));
  boardFrame.position.set(0, 1.8, 0.0);
  boardGroup.add(boardFrame);
  const boardFace = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  boardFace.position.set(0, 1.8, 0.06);
  boardFace.userData.noHighlight = true;
  boardGroup.add(boardFace);
  for (const lx of [-2.0, 2.0]) kit.box({ x: -8 + lx, z: -6.8, y: 0, w: 0.12, h: 0.6, d: 0.12, color: P.woodDark, solid: false });
  const plaque = labelPlane(['Family-only and private records are never shown on this wall'], 4.4, 0.26, { size: 24, bg: '#E6D3AE', accent: '#8A6240' });
  plaque.position.set(0, 0.3, 0.06);
  boardGroup.add(plaque);
  scene.add(boardGroup);
  lamp(-8, 3.0, -5.6, { intensity: LIGHT.lamp * 0.8, distance: 9 });

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t}…`;
  }

  function updateBoard(records) {
    const ctx = boardCanvas.getContext('2d');
    const sans = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#F4E9D4';
    ctx.fillRect(0, 0, BW, BH);
    ctx.fillStyle = '#35686A';
    ctx.fillRect(0, 0, BW, 92);
    ctx.fillStyle = '#FBF4E6';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = `700 44px ${sans}`;
    ctx.fillText('Neighbourhood Memory Board', 28, 48);
    ctx.font = `500 22px ${sans}`;
    ctx.fillText('Public records only · Block 12 (fictional) · proposed future demo', 28, 78);
    const cols = 3;
    const rows = 2;
    const pad = 22;
    const cw = (BW - pad * (cols + 1)) / cols;
    const ch = (BH - 92 - 50 - pad * (rows + 1)) / rows;
    const shown = records.slice(0, cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      const x = pad + (i % cols) * (cw + pad);
      const y = 92 + pad + Math.floor(i / cols) * (ch + pad);
      const rec = shown[i];
      if (rec) {
        ctx.fillStyle = '#FBF4E6';
        ctx.fillRect(x, y, cw, ch);
        ctx.strokeStyle = '#B98B5E';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, cw, ch);
        const img = drawIllustration(rec.illus, 480, 320);
        ctx.drawImage(img, 0, 60, 480, 164, x + 8, y + 8, cw - 16, 132);
        ctx.fillStyle = '#3A2F28';
        ctx.font = `700 24px ${sans}`;
        ctx.fillText(ellipsize(ctx, rec.title, cw - 20), x + 10, y + 140 + 26);
        ctx.font = `500 17px ${sans}`;
        ctx.fillStyle = '#5a4a3e';
        ctx.fillText(ellipsize(ctx, rec.contributors, cw - 20), x + 10, y + 140 + 48);
      } else {
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = '#B98B5E';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, cw, ch);
        ctx.setLineDash([]);
        ctx.fillStyle = '#8A6240';
        ctx.font = `500 22px ${sans}`;
        ctx.textAlign = 'center';
        ctx.fillText('A place for a shared memory', x + cw / 2, y + ch / 2 + 8);
        ctx.textAlign = 'left';
      }
    }
    ctx.fillStyle = '#8A6240';
    ctx.font = `500 19px ${sans}`;
    ctx.fillText(records.length > cols * rows ? `+ ${records.length - cols * rows} more public records — open the kiosk to read them all` : 'Fictional demo records. Press E at the board to read a full record.', 28, BH - 16);
    boardTex.needsUpdate = true;
  }
  updateBoard([]);

  // ------------------------------------------------------------------ kiosk
  const kioskGroup = new THREE.Group();
  kioskGroup.position.set(-2.6, 0, -6.3);
  const kBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.6), std(P.teal));
  kBase.position.y = 0.5;
  kBase.castShadow = true;
  const kTop = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 0.12), std(P.tealDark));
  kTop.position.set(0, 1.45, 0.05);
  kTop.rotation.x = -0.25;
  kTop.castShadow = true;
  const kScreen = labelPlane(['Memory kiosk', 'Add a sample memory (demo)'], 1.05, 0.62, { size: 56 });
  kScreen.position.set(0, 1.46, 0.13);
  kScreen.rotation.x = -0.25;
  const kSlot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.04), std(P.ink));
  kSlot.position.set(0, 0.78, 0.31);
  kioskGroup.add(kBase, kTop, kScreen, kSlot);
  scene.add(kioskGroup);
  colliders.addSolid(-3.2, -2.0, -6.65, -5.95, { y0: 0, y1: 1.9 });

  // ------------------------------------------------------------------ interactables + people
  const markerMat = new THREE.MeshBasicMaterial({ color: P.sun, toneMapped: false });
  function addInteractable({ id, label, pos, range = 2.4, group = null, markerY = 2.1, npc = false }) {
    if (group) makeUnique(group);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), markerMat);
    marker.position.set(pos.x, markerY, pos.z);
    marker.visible = false;
    scene.add(marker);
    const it = { id, label, pos, range, group, marker, markerY, npc, baseMarkerY: markerY };
    interactables.push(it);
    return it;
  }

  function addNpc({ id, label, name, x, z, homeYaw, person, tagY, mode = 'body', range = 2.7 }) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = homeYaw;
    g.add(person);
    const tag = nameTag(name);
    tag.position.set(0, tagY, 0);
    g.add(tag);
    scene.add(g);
    if (mode !== 'sit') colliders.addSolid(x - 0.32, x + 0.32, z - 0.32, z + 0.32, { y0: 0, y1: 1.9, cam: false });
    npcs[id] = { id, group: g, person, homeYaw, mode, phase: Math.random() * 6.28, parts: person.userData.parts, x, z, yaw: homeYaw };
    addInteractable({ id, label, pos: V(x, 1, z), range, group: person, markerY: tagY + 0.45, npc: true });
  }

  addNpc({
    id: 'aisha', label: 'Talk to Aisha', name: 'Aisha', x: -5.4, z: -3.4, homeYaw: 0, tagY: 2.15,
    person: makePerson({ shirt: P.tealDark, pants: 0x3f3a36, skin: P.skins[1], hairStyle: 'bun', hair: 0x1f1a17, cuff: P.terra }),
  });
  addNpc({
    id: 'lim', label: 'Talk to Uncle Lim', name: 'Uncle Lim', x: 7.9, z: -6.9, homeYaw: Math.PI / 2, tagY: 2.15,
    person: makePerson({ shirt: P.terraLight, skin: P.skins[0], elder: true, hairStyle: 'short', glasses: true, scale: 0.97 }),
  });
  addNpc({
    id: 'mei', label: 'Talk to Mei', name: 'Mei', x: 12.2, z: -6.2, homeYaw: -Math.PI / 2, tagY: 2.15,
    person: makePerson({ shirt: P.green, pants: 0x4b5a63, skin: P.skins[0], hairStyle: 'long', hair: 0x1f1a17 }),
  });
  addNpc({
    id: 'devi', label: 'Talk to Madam Devi', name: 'Madam Devi', x: 16.9, z: -0.7, homeYaw: Math.PI / 2, tagY: 2.15,
    person: makePerson({ shirt: P.teal, pants: 0x5a4a52, skin: P.skins[2], hairStyle: 'bun', hair: 0x2a1f1a, scale: 0.95, cuff: P.sun }),
  });
  addNpc({
    id: 'rahman', label: 'Talk to Mr Rahman', name: 'Mr Rahman', x: 21.7, z: -0.7, homeYaw: -Math.PI / 2, tagY: 2.15,
    person: makePerson({ shirt: P.tealLight, pants: 0x4a4a4f, skin: P.skins[1], elder: true, glasses: true, scale: 1.0 }),
  });
  addNpc({
    id: 'salmah', label: 'Talk to Auntie Salmah', name: 'Auntie Salmah', x: 31, z: -4.15, homeYaw: 0, tagY: 1.85, mode: 'sit', range: 3.0,
    person: makePerson({ shirt: P.terra, pants: 0x4a3f3a, skin: P.skins[3], scarf: P.greenLight, seated: true, scale: 0.97, elder: true }),
  });
  // Salmah's person sits on the bench seat (0.5 up)
  npcs.salmah.person.position.y = 0.0;

  // objects
  function addObject(id, label, group, pos, { range = 2.4, markerY = 1.5 } = {}) {
    scene.add(group);
    return addInteractable({ id, label, pos, range, group, markerY });
  }

  // m1: photograph on the sideboard
  const m1Photo = photoFrame('dinner', 0.56, 0.38);
  m1Photo.position.set(10.0, 1.17, -9.68);
  m1Photo.rotation.x = -0.12;
  addObject('m1_photo', 'Examine the photograph', m1Photo, V(10.0, 1.1, -9.3), { range: 2.4, markerY: 1.75 });

  // m1: rice pot on the table
  const pot = new THREE.Group();
  pot.position.set(10.0, 0.78, -6.2);
  const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.22, 8), std(P.steel));
  potBody.position.y = 0.11;
  potBody.castShadow = true;
  const potLid = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, 0.05, 8), std(0xbfc6c8));
  potLid.position.y = 0.245;
  const potKnob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), std(P.ink));
  potKnob.position.y = 0.3;
  const potH1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.05), std(P.ink));
  potH1.position.set(0.25, 0.14, 0);
  const potH2 = potH1.clone();
  potH2.position.x = -0.25;
  pot.add(potBody, potLid, potKnob, potH1, potH2);
  // a few bowls around it
  for (const [bx, bz] of [[0.5, 0.2], [-0.5, 0.25], [0.3, -0.5], [-0.35, -0.45]]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.07, 7), std(P.creamLight));
    bowl.position.set(bx, 0.035, bz);
    pot.add(bowl);
  }
  addObject('m1_pot', 'Examine the rice pot', pot, V(10.0, 0.9, -6.2), { range: 2.6, markerY: 1.35 });

  // m1: handwritten note on the side table
  const note = new THREE.Group();
  note.position.set(12.9, 0.57, -8.8);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.008, 0.32), std(0xfbf6e4));
  paper.rotation.y = 0.4;
  paper.castShadow = true;
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.16, 6), std(P.tealDark));
  vase.position.set(0.15, 0.08, 0.1);
  note.add(paper, vase);
  addObject('m1_note', 'Read the handwritten note', note, V(12.9, 0.8, -8.8), { range: 2.4, markerY: 1.25 });

  // m2: old photograph on the corridor wall
  const m2Photo = photoFrame('corridor', 1.1, 0.74);
  m2Photo.position.set(19.2, 1.6, -1.95);
  addObject('m2_photo', 'Examine the old photograph', m2Photo, V(19.2, 1.5, -1.6), { range: 3.1, markerY: 2.45 });
  // bench under it
  kit.box({ x: 19.2, z: -1.55, y: 0.42, w: 2.4, h: 0.1, d: 0.6, color: P.wood });
  kit.box({ x: 19.2, z: -1.85, y: 0.52, w: 2.4, h: 0.5, d: 0.08, color: P.woodDark });
  for (const dx of [-1.0, 1.0]) kit.box({ x: 19.2 + dx, z: -1.55, y: 0, w: 0.1, h: 0.42, d: 0.5, color: P.tealDark });
  colliders.addSolid(17.95, 20.45, -2.0, -1.2, { y0: 0, y1: 1.1, cam: false });
  for (const dx of [-0.7, 0, 0.7]) { // plates on the bench
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.03, 8), std(P.creamLight));
    plate.position.set(19.2 + dx, 0.54, -1.55);
    kit.root.add(plate);
  }

  // board + kiosk
  addInteractable({ id: 'board', label: 'Read the memory board', pos: V(-8, 1.5, -5.9), range: 3.4, group: boardGroup, markerY: 2.9 });
  addInteractable({ id: 'kiosk', label: 'Use the memory kiosk', pos: V(-2.6, 1, -5.5), range: 2.6, group: kioskGroup, markerY: 2.25 });

  // ------------------------------------------------------------------ clouds (slow drift)
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + j * 0.5, 0), cloudMat);
      m.position.set(j * 3 - 3, (j % 2) * 0.5, 0);
      m.scale.set(1.6, 0.6, 1);
      c.add(m);
    }
    c.position.set(-40 + i * 17, 34 + (i % 3) * 4, 6 + (i % 4) * 12);
    scene.add(c);
    clouds.push(c);
  }

  // ------------------------------------------------------------------ per-frame update
  const attention = new Set();
  let highlightedId = null;
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  function setAttention(ids) {
    attention.clear();
    for (const id of ids) attention.add(id);
    for (const it of interactables) it.marker.visible = attention.has(it.id);
  }

  function setEmissive(group, hex, intensity) {
    group.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive && !o.userData.noHighlight) {
        if (o.material.userData && o.material.userData.glow) return;
        o.material.emissive.setHex(hex);
        o.material.emissiveIntensity = intensity;
      }
    });
  }

  function setHighlight(id) {
    if (id === highlightedId) return;
    const prev = interactables.find((i) => i.id === highlightedId);
    if (prev && prev.group) setEmissive(prev.group, 0x000000, 0);
    highlightedId = id;
  }

  function update(dt, t, { reducedMotion = false, playerPos = null } = {}) {
    // markers bob + spin
    for (const it of interactables) {
      if (!it.marker.visible) continue;
      it.marker.position.y = it.baseMarkerY + (reducedMotion ? 0 : Math.sin(t * 2.2 + it.pos.x) * 0.07);
      it.marker.rotation.y = reducedMotion ? 0.6 : t * 1.4;
    }
    // highlight pulse
    const cur = interactables.find((i) => i.id === highlightedId);
    if (cur && cur.group) setEmissive(cur.group, 0x8a5a2b, reducedMotion ? 0.5 : 0.45 + Math.sin(t * 4) * 0.15);
    // people: idle sway + turn toward the player when close
    for (const n of Object.values(npcs)) {
      const p = n.parts;
      if (!reducedMotion) {
        const s = Math.sin(t * 1.4 + n.phase);
        if (p.armL) p.armL.rotation.x = s * 0.06;
        if (p.armR) p.armR.rotation.x = -s * 0.06;
        if (p.head) p.head.rotation.x = Math.sin(t * 0.9 + n.phase) * 0.03;
        n.person.position.y = n.mode === 'sit' ? 0.0 : Math.max(0, Math.sin(t * 1.4 + n.phase)) * 0.012;
      }
      if (playerPos) {
        const dx = playerPos.x - n.x;
        const dz = playerPos.z - n.z;
        const near = dx * dx + dz * dz < 5 * 5;
        const target = near ? Math.atan2(dx, dz) : n.homeYaw;
        if (n.mode === 'sit') {
          const rel = Math.max(-0.9, Math.min(0.9, wrap(target - n.homeYaw)));
          if (p.head) p.head.rotation.y += (rel - p.head.rotation.y) * Math.min(1, dt * 4);
        } else {
          const diff = wrap(target - n.yaw);
          n.yaw += reducedMotion ? diff : diff * Math.min(1, dt * 3.5);
          n.group.rotation.y = n.yaw;
        }
      }
    }
    // swaying decorations + clouds
    if (!reducedMotion) {
      for (const s of swayers) s.obj.rotation[s.axis] = Math.sin(t * s.speed) * s.amp;
      for (const c of clouds) { c.position.x += dt * 0.35; if (c.position.x > 70) c.position.x = -70; }
    }
  }

  return {
    colliders, interactables, npcs, update, updateBoard, setAttention, setHighlight,
    getInteractable: (id) => interactables.find((i) => i.id === id) || null,
    title: GAME_TITLE,
  };
}
