// Shared constants for the playfield and tiles.

export const COLS = 15;
export const ROWS = 18; // row 0 is open sky, rows 1..17 are earth
export const TILE = 32;
export const HUD_H = 40;

export const T_OPEN = 0;
export const T_DIRT = 1;
export const T_BEDROCK = 2;

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

// Depth layer 1..4 for a row, used for dirt colour and gold value.
export function layerFor(row) {
  if (row <= 0) return 0;
  return Math.min(4, 1 + Math.floor(((row - 1) * 4) / (ROWS - 1)));
}
