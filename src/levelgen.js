// Procedural floor layouts. Pure: same floor + seed gives the same layout.
//
// The shape follows the classic arcade pattern (see analysis/round-layouts.txt
// in the project files): a shaft from the surface down to the middle, short
// straight pockets that each hold an enemy, and rocks resting in solid dirt.
// Maps grow with each act and are bigger than the screen, which scrolls.

import { Rng } from './rng.js';
import { ITEMS } from './items.js';
import { T_OPEN, T_DIRT, T_BEDROCK, BOSS_FLOORS, actFor } from './constants.js';

const MAP_SIZES = { 1: { cols: 19, rows: 24 }, 2: { cols: 23, rows: 30 }, 3: { cols: 27, rows: 36 } };
const BASE_AREA = 15 * 18; // the original single-screen field

export function mapSize(floor) {
  return MAP_SIZES[actFor(floor).num];
}

export function startFor(cols) {
  return { x: Math.floor(cols / 2), y: 8 };
}

export function difficulty(floor) {
  const act = actFor(floor).num;
  const { cols, rows } = mapSize(floor);
  const area = (cols * rows) / BASE_AREA;
  return {
    act,
    enemyCount: Math.min(16, Math.round((3 + Math.floor(floor / 2)) * area * 0.7)),
    scorchRatio: Math.min(0.55, 0.12 + floor * 0.02 + (act === 3 ? 0.1 : 0)),
    enemySpeed: Math.min(4.0, 2.4 + floor * 0.07),
    ghostDelay: [Math.max(4, 11 - floor * 0.35), Math.max(7, 17 - floor * 0.45)],
    chase: Math.min(0.75, 0.3 + floor * 0.025),
    rockCount: Math.round((floor <= 2 ? 3 : 4) * area),
    bedrockBlobs: Math.round((act === 1 ? 0 : act === 2 ? 3 : 4) * area),
    nuggets: Math.round((3 + Math.min(4, Math.floor(floor / 4))) * area),
  };
}

// New foe types join the mix as the run goes deeper.
export const FOE_INTRO = { gnawler: 4, splitter: 8, shellback: 12 };

export function pickKind(rng, floor, diff) {
  const weights = [['puff', 1 - diff.scorchRatio], ['scorch', diff.scorchRatio]];
  for (const [kind, from] of Object.entries(FOE_INTRO)) {
    if (floor >= from) weights.push([kind, Math.min(0.35, 0.15 + (floor - from) * 0.02)]);
  }
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let r = rng.float(0, total);
  for (const [kind, w] of weights) {
    r -= w;
    if (r < 0) return kind;
  }
  return 'puff';
}

export function bossLevel(floor) {
  const i = BOSS_FLOORS.indexOf(floor);
  return i < 0 ? 0 : i + 1;
}

export function generateFloor(floor, seed, opts = {}) {
  const fossilLuck = opts.fossilLuck || 0;
  // Retry with a derived seed if a layout can't fit everything.
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = tryGenerate(floor, (seed + attempt * 7919) >>> 0, fossilLuck);
    if (layout) return layout;
  }
  throw new Error(`Could not generate floor ${floor}`);
}

function tryGenerate(floor, seed, fossilLuck) {
  const rng = new Rng(seed);
  const { cols: COLS, rows: ROWS } = mapSize(floor);
  const START = startFor(COLS);
  const idx = (x, y) => y * COLS + x;
  const diff = difficulty(floor);
  const boss = bossLevel(floor);
  const grid = new Uint8Array(COLS * ROWS).fill(T_DIRT);
  for (let x = 0; x < COLS; x++) grid[idx(x, 0)] = T_OPEN;

  // Starting shaft and crossing.
  for (let y = 1; y <= START.y; y++) grid[idx(START.x, y)] = T_OPEN;
  for (let x = START.x - 1; x <= START.x + 1; x++) grid[idx(x, START.y)] = T_OPEN;

  // reserved[] marks tiles that must stay solid dirt (margins around tunnels).
  const reserved = new Uint8Array(COLS * ROWS);
  const reserveAround = (x0, y0, x1, y1) => {
    for (let y = y0 - 1; y <= y1 + 1; y++)
      for (let x = x0 - 1; x <= x1 + 1; x++)
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) reserved[idx(x, y)] = 1;
  };
  reserveAround(START.x, 1, START.x, START.y);
  reserveAround(START.x - 1, START.y, START.x + 1, START.y);

  const enemies = [];
  const pockets = [];

  const carvePocket = (minLen, maxLen, minRow, maxRow, forceHorizontal) => {
    for (let tries = 0; tries < 200; tries++) {
      const horiz = forceHorizontal || rng.chance(0.55);
      const len = rng.int(minLen, maxLen);
      const w = horiz ? len : 1;
      const h = horiz ? 1 : len;
      const x0 = rng.int(1, COLS - 1 - w);
      const y0 = rng.int(minRow, Math.min(maxRow, ROWS - 1 - h));
      let ok = true;
      for (let y = y0; y < y0 + h && ok; y++)
        for (let x = x0; x < x0 + w && ok; x++) {
          if (reserved[idx(x, y)]) ok = false;
          if (Math.abs(x - START.x) + Math.abs(y - START.y) < 5) ok = false;
        }
      if (!ok) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[idx(x, y)] = T_OPEN;
      reserveAround(x0, y0, x0 + w - 1, y0 + h - 1);
      const cells = [];
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells.push({ x, y });
      const pocket = { x0, y0, w, h, cells };
      pockets.push(pocket);
      return pocket;
    }
    return null;
  };

  if (boss) {
    const lair = carvePocket(5, 6, ROWS - 6, ROWS - 3, true);
    if (!lair) return null;
    const mid = lair.cells[Math.floor(lair.cells.length / 2)];
    enemies.push({ kind: 'boss', x: mid.x, y: mid.y, level: boss });
  }

  const regular = boss ? boss + Math.round(diff.enemyCount * 0.35) : diff.enemyCount;
  for (let i = 0; i < regular; i++) {
    const p = carvePocket(3, 4, 2, ROWS - 2, false);
    if (!p) return null;
    const c = rng.pick(p.cells);
    const kind = pickKind(rng, floor, diff);
    enemies.push({ kind, x: c.x, y: c.y });
  }

  // Bedrock blobs from Act II on: undiggable, they shape routes.
  for (let b = 0; b < diff.bedrockBlobs; b++) {
    for (let tries = 0; tries < 50; tries++) {
      const w = rng.int(1, 3);
      const h = rng.int(1, 2);
      const x0 = rng.int(0, COLS - w);
      const y0 = rng.int(3, ROWS - 1 - h);
      let ok = true;
      for (let y = y0; y < y0 + h && ok; y++)
        for (let x = x0; x < x0 + w && ok; x++) if (reserved[idx(x, y)]) ok = false;
      if (!ok) continue;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        grid[idx(x, y)] = T_BEDROCK;
        reserved[idx(x, y)] = 1;
      }
      break;
    }
  }

  const taken = new Set();
  const key = (x, y) => `${x},${y}`;

  // Rocks sit in dirt with dirt directly below, never over an open tile,
  // so nothing falls until the player digs underneath.
  const rocks = [];
  for (let r = 0; r < diff.rockCount; r++) {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(0, COLS - 1);
      const y = rng.int(2, ROWS - 3);
      if (x === START.x) continue;
      if (grid[idx(x, y)] !== T_DIRT || grid[idx(x, y + 1)] !== T_DIRT) continue;
      if (taken.has(key(x, y)) || taken.has(key(x, y + 1)) || taken.has(key(x, y - 1))) continue;
      rocks.push({ x, y });
      taken.add(key(x, y));
      break;
    }
  }

  // Buried treasure: gold nuggets everywhere, fossils in the deeper half.
  const items = [];
  const placeItem = (kind, minRow, value) => {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(0, COLS - 1);
      const y = rng.int(minRow, ROWS - 1);
      if (grid[idx(x, y)] !== T_DIRT || taken.has(key(x, y))) continue;
      items.push({ kind, x, y, value });
      taken.add(key(x, y));
      return;
    }
  };
  for (let n = 0; n < diff.nuggets; n++) placeItem('gold', 2, 2 + Math.floor(floor / 5));
  // Item caches: one per floor, sometimes two.
  const caches = 1 + (rng.chance(0.3) ? 1 : 0);
  for (let n = 0; n < caches; n++) {
    const before = items.length;
    placeItem('cache', 2, 1);
    if (items.length > before) items[items.length - 1].item = rng.pick(ITEMS).id;
  }

  // One fossil is guaranteed on every floor; a second turns up about half the time.
  placeItem('fossil', Math.floor(ROWS / 2), 1);
  if (rng.chance(Math.min(0.9, 0.45 + floor * 0.01 + fossilLuck * 0.2))) placeItem('fossil', Math.floor(ROWS / 2), 1);

  return {
    floor,
    seed,
    cols: COLS,
    rows: ROWS,
    grid,
    start: { ...START },
    enemies,
    rocks,
    items,
    boss,
    difficulty: diff,
  };
}
