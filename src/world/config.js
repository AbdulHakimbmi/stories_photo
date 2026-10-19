// =============================================================================
//  config.js — tweakable constants and the garden layout.
//  If the scene looks too dark or too bright on your screen, change LIGHT below.
// =============================================================================
export const PALETTE = {
  cream: 0xf4e9d4,
  creamDark: 0xe6d3ae,
  creamLight: 0xfbf4e6,
  teal: 0x4f8a8b,
  tealDark: 0x35686a,
  tealLight: 0x8dbdba,
  terra: 0xc8694a,
  terraLight: 0xe0a184,
  terraDark: 0x9c4a32,
  green: 0x8db580,
  greenDark: 0x5e8f5e,
  greenLight: 0xb9d4a8,
  wood: 0xb98b5e,
  woodDark: 0x8a6240,
  concrete: 0xd9d2c3,
  stone: 0xbfb8a8,
  steel: 0x9aa3a6,
  ink: 0x3a2f28,
  sun: 0xf2c879,
  skins: [0xe8b98f, 0xc98e64, 0xa8714b, 0xf0c9a5],
  sky: 0xd5e8df,
  soil: 0x7a5a45,
  soilDark: 0x5f4636,
  grass: 0x9cc58b,
  petalPink: 0xe3a6a0,
  petalCream: 0xf6e7c1,
  hedge: 0x6b9a63,
};

// Physically based lights in recent Three.js versions: values around 1 are fairly dim.
export const LIGHT = {
  ambient: 0.7,
  hemi: 1.3,
  sun: 2.1,
};

export const PLAYER = {
  radius: 0.34,
  speed: 4.2,
  camDistance: 4.6,
  camMin: 2.4,
  camMax: 7.0,
  camHeight: 1.5,
  pitchMin: 0.05,
  pitchMax: 1.2,
  pitchDefault: 0.34,
};

// World limits (walkable area). The hedge and trees sit just outside.
export const BOUNDS = { minX: -17.2, maxX: 17.2, minZ: -13.2, maxZ: 13.4 };

// ---------------------------------------------------------------------------------------------
//  Garden layout (x = east, z = south). Four planting beds around a central plaza.
//  Each bed has 8 slots in two rows of four. Photo cards face the path (z = 0).
// ---------------------------------------------------------------------------------------------
export const BED = { w: 11.4, d: 6.4 };
export const AREA_LAYOUT = {
  everyday: { cx: -10, cz: -7.5 },
  celebrations: { cx: 10, cz: -7.5 },
  people: { cx: -10, cz: 7.5 },
  places: { cx: 10, cz: 7.5 },
};
export const SLOT_COUNT = 8;
const COLS = [-4.2, -1.4, 1.4, 4.2];

/**
 * Where does slot `slot` of an area go? Slots 0–3 are the front row (nearest the path, so the first
 * memories are easy to find); 4–7 are the back row. `yaw` is the direction the photo card faces.
 */
export function slotTransform(category, slot) {
  const a = AREA_LAYOUT[category] || AREA_LAYOUT.everyday;
  const s = a.cz < 0 ? 1 : -1;          // +1: path is to the south of the bed, -1: to the north
  const col = ((slot % 4) + 4) % 4;
  const front = slot % SLOT_COUNT < 4;
  const plantZ = a.cz + s * (front ? 0.9 : -1.9);
  return {
    plant: { x: a.cx + COLS[col], z: plantZ },
    card: { x: a.cx + COLS[col], z: plantZ + s * 0.95 },
    yaw: s > 0 ? 0 : Math.PI,
  };
}

// Where the player can be sent. yaw 0 = looking north (-Z).
export const LOCATIONS = {
  gate: { label: 'Garden gate', x: 0, z: 11.6, yaw: 0 },
  plaza: { label: 'Central plaza', x: 0, z: 3.4, yaw: 0 },
};

export const OVERVIEW = { pos: [0, 30, 21], look: [0, 0, 1.5] };
