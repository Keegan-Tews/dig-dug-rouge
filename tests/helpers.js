import { T_OPEN, T_DIRT, T_BEDROCK } from '../src/constants.js';
import { difficulty } from '../src/levelgen.js';
import { BASE_STATS } from '../src/upgrades.js';

// Build a layout from ASCII: '.' open, '#' dirt, 'X' bedrock,
// 'P' player, 'p' puffling, 's' scorchling, 'n' gnawler, 'v' splitter, 'k' shellback,
// 'B' boss, 'R' rock, 'g' gold, 'f' fossil, 'c' item cache (a bomb).
export function layoutFrom(lines, { floor = 1, seed = 1 } = {}) {
  const rows = lines.length;
  const cols = lines[0].length;
  const grid = new Uint8Array(cols * rows);
  const enemies = [];
  const rocks = [];
  const items = [];
  let start = { x: 0, y: 0 };
  lines.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      let t = T_OPEN;
      if (ch === '#' || ch === 'R' || ch === 'g' || ch === 'f' || ch === 'c') t = T_DIRT;
      if (ch === 'X') t = T_BEDROCK;
      grid[y * cols + x] = t;
      if (ch === 'P') start = { x, y };
      if (ch === 'p') enemies.push({ kind: 'puff', x, y });
      if (ch === 's') enemies.push({ kind: 'scorch', x, y });
      if (ch === 'n') enemies.push({ kind: 'gnawler', x, y });
      if (ch === 'v') enemies.push({ kind: 'splitter', x, y });
      if (ch === 'k') enemies.push({ kind: 'shellback', x, y });
      if (ch === 'B') enemies.push({ kind: 'boss', x, y, level: 1 });
      if (ch === 'R') rocks.push({ x, y });
      if (ch === 'g') items.push({ kind: 'gold', x, y, value: 3 });
      if (ch === 'c') items.push({ kind: 'cache', x, y, value: 1, item: 'bomb' });
      if (ch === 'f') items.push({ kind: 'fossil', x, y, value: 1 });
    });
  });
  return { floor, seed, cols, rows, grid, start, enemies, rocks, items, boss: 0, difficulty: difficulty(floor) };
}

export function stats(overrides = {}) {
  return { ...BASE_STATS, ...overrides };
}

export function run(sim, seconds, input = {}, dt = 1 / 120) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) sim.update(dt, input);
}
