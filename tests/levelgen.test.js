import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFloor, START } from '../src/levelgen.js';
import { T_OPEN, T_DIRT, BOSS_FLOORS } from '../src/constants.js';

test('same floor and seed give the same layout', () => {
  const a = generateFloor(5, 1234);
  const b = generateFloor(5, 1234);
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
  assert.deepEqual(a.enemies, b.enemies);
  assert.deepEqual(a.rocks, b.rocks);
});

test('different seeds give different layouts', () => {
  const a = generateFloor(5, 1);
  const b = generateFloor(5, 2);
  assert.notDeepEqual(Array.from(a.grid), Array.from(b.grid));
});

test('every floor 1-20 generates valid layouts across many seeds', () => {
  for (let floor = 1; floor <= 20; floor++) {
    for (let seed = 0; seed < 40; seed++) {
      const l = generateFloor(floor, seed * 7717 + floor);
      const at = (x, y) => l.grid[y * l.cols + x];
      assert.equal(at(START.x, START.y), T_OPEN, 'start is open');
      for (let y = 1; y <= START.y; y++) assert.equal(at(START.x, y), T_OPEN, 'shaft is open');
      assert.ok(l.enemies.length >= 3);
      for (const e of l.enemies) {
        assert.equal(at(e.x, e.y), T_OPEN, `enemy on open tile (floor ${floor})`);
        assert.ok(Math.abs(e.x - START.x) + Math.abs(e.y - START.y) >= 5, 'enemy not on top of player');
      }
      for (const r of l.rocks) {
        assert.equal(at(r.x, r.y), T_DIRT, 'rock in dirt');
        assert.equal(at(r.x, r.y + 1), T_DIRT, 'rock rests on dirt');
      }
      for (const it of l.items) assert.equal(at(it.x, it.y), T_DIRT, 'items buried in dirt');
      const bosses = l.enemies.filter((e) => e.kind === 'boss');
      assert.equal(bosses.length, BOSS_FLOORS.includes(floor) ? 1 : 0);
    }
  }
});

test('later floors have more enemies', () => {
  assert.ok(generateFloor(19, 9).enemies.length > generateFloor(1, 9).enemies.length);
});
