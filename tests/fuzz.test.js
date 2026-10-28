import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/game.js';
import { generateFloor } from '../src/levelgen.js';
import { BASE_STATS } from '../src/upgrades.js';
import { Rng } from '../src/rng.js';

test('random play on every floor never crashes or produces NaN positions', () => {
  const dirs = [null, 'up', 'down', 'left', 'right'];
  for (let floor = 1; floor <= 20; floor++) {
    for (let seed = 0; seed < 3; seed++) {
      const zone = floor >= 8 && floor <= 14 && seed > 0 ? ['frozen', 'fungal'][seed - 1] : undefined;
      const sim = new FloorSim(generateFloor(floor, seed * 31 + floor, { zone }), { ...BASE_STATS, shield: 2, itemSlots: 4 }, { hearts: 5, items: ['bomb', 'decoy', 'frost', 'drill'] });
      const rng = new Rng(seed + floor * 100);
      let input = {};
      for (let i = 0; i < 120 * 40 && (sim.status === 'playing' || sim.status === 'clearing' || sim.status === 'dying'); i++) {
        if (i % 30 === 0) input = { dir: rng.pick(dirs), pumpPressed: rng.chance(0.3), pumpHeld: rng.chance(0.5), usePressed: rng.chance(0.03), cyclePressed: rng.chance(0.05) };
        sim.update(1 / 120, input);
        input = { ...input, pumpPressed: false, usePressed: false, cyclePressed: false };
        sim.drainEvents();
      }
      for (const e of [sim.player, ...sim.enemies]) {
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `finite position on floor ${floor}`);
        assert.ok(e.x >= -0.01 && e.x <= sim.cols - 0.99 && e.y >= -0.01 && e.y <= sim.rows - 0.99, 'inside the map');
      }
    }
  }
});
