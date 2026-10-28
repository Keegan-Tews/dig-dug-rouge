// Shared constants for the playfield and tiles.

// The visible window, in tiles. Floors are bigger and scroll.
export const VIEW_COLS = 15;
export const VIEW_ROWS = 18;
export const TILE = 32;
export const HUD_H = 40;

export const T_OPEN = 0;
export const T_DIRT = 1;
export const T_BEDROCK = 2;
export const T_ICE = 3;
export const T_VINE = 4;
export const T_LAVA = 5;

export const TOTAL_FLOORS = 20;
export const BOSS_FLOORS = [7, 14, 20];
export const SHOP_EVERY = 3;

export const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const ACTS = [
  { num: 1, name: 'Topsoil', first: 1, last: 7 },
  { num: 2, name: 'Bedrock', first: 8, last: 14 },
  { num: 3, name: 'The Deep', first: 15, last: 20 },
];

export function actFor(floor) {
  return ACTS.find((a) => floor >= a.first && floor <= a.last) || ACTS[ACTS.length - 1];
}

// Zones are the themed areas a floor belongs to. Acts listed in ROUTES let
// the player choose which zone to dig through after the previous act's boss.
export const ZONES = {
  topsoil: { id: 'topsoil', name: 'Topsoil', act: 1, boss: 'The Bloat' },
  bedrock: {
    id: 'bedrock', name: 'Bedrock', act: 2, boss: 'Cinder Mother',
    desc: 'Undiggable stone splits the map into lanes. More fire breathers.',
  },
  frozen: {
    id: 'frozen', name: 'Frozen Caverns', act: 2, boss: 'The Rime Queen',
    desc: 'Ice that is slow to dig, icicles that drop on anything below, and Chillers whose frost breath freezes you in place.',
  },
  fungal: {
    id: 'fungal', name: 'Fungal Grotto', act: 2, boss: 'Old Rootmaw',
    desc: 'Pitch dark except for glowing mushrooms. Spore clouds slow you down, and vines grow back over the tunnels you dig.',
  },
  deep: {
    id: 'deep', name: 'The Deep', act: 3, boss: 'The Deep King',
    desc: 'The most bedrock and fire breathers yet. The classic way down.',
  },
  magma: {
    id: 'magma', name: 'Magma Layer', act: 3, boss: 'The Slag Tyrant',
    desc: 'Lava creeps into open tunnels, steam vents blast on a timer, and Magmites leave burning trails.',
  },
};

export const ROUTES = { 2: ['bedrock', 'frozen', 'fungal'], 3: ['deep', 'magma'] };
const DEFAULT_ZONE = { 1: 'topsoil', 2: 'bedrock', 3: 'deep' };

export function zoneFor(floor, route = {}) {
  const act = actFor(floor).num;
  return ZONES[route[act] || DEFAULT_ZONE[act]];
}

// Depth layer 1..4 for a row, used for dirt colour and gold value.
// Row 0 is open sky; rows below it are earth.
export function layerFor(row, rows) {
  if (row <= 0) return 0;
  return Math.min(4, 1 + Math.floor(((row - 1) * 4) / (rows - 1)));
}
