// =============================================================================
//  config.js — tweakable constants for the 3D world.
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
  sky: 0xcfe3dc,
};

// Physically based lights in recent Three.js versions: values around 1 are fairly dim.
export const LIGHT = {
  ambient: 0.6,
  hemi: 1.2,
  sun: 1.9,
  lamp: 12,
  lampDistance: 11,
};

export const PLAYER = {
  radius: 0.34,
  speed: 4.2,
  camDistance: 4.3,
  camMin: 2.2,
  camMax: 6.0,
  camHeight: 1.5,
  pitchMin: 0.05,
  pitchMax: 1.15,
  pitchDefault: 0.32,
};

// World limits (a safety net on top of the wall colliders).
export const BOUNDS = { minX: -13.6, maxX: 35.6, minZ: -9.6, maxZ: 6.6 };

// Where people can be sent (presenter buttons, "I'm stuck", start). yaw 0 = looking north (-Z).
export const LOCATIONS = {
  deck: { label: 'Void deck (Aisha, board and kiosk)', x: -3.0, z: 2.2, yaw: 0 },
  kiosk: { label: 'Memory kiosk and board', x: -2.2, z: -3.9, yaw: 0 },
  living: { label: 'Mission 1 — Lim family living room', x: 10.0, z: -3.3, yaw: 0 },
  corridor: { label: 'Mission 2 — Corridor bench', x: 19.2, z: 0.9, yaw: 0 },
  corner: { label: 'Mission 3 — Quiet corner', x: 31.0, z: -1.4, yaw: 0 },
};
