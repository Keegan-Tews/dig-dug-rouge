import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/game.js';
import { generateFloor } from '../src/levelgen.js';
import { GEAR_SLOTS, FULL_CHEST_FOSSILS } from '../src/gear.js';
import { defaultMeta } from '../src/meta.js';
import { layoutFrom, stats, run } from './helpers.js';

test('a chest gives a new piece of gear that works immediately', () => {
  const sim = new FloorSim(layoutFrom(['.........', 'Ph#######', '########p']), stats(), { gear: ['drill_bit', 'wide_nozzle'] });
  sim.freeze = 99;
  run(sim, 0.5, { dir: 'right' });
  assert.equal(sim.gear.length, 3);
  const added = sim.gear[2];
  assert.ok(['pressure_valve', 'fossil_compass'].includes(added), 'never a duplicate');
  if (added === 'pressure_valve') assert.equal(sim.stats.popDiscount, 1);
  else assert.equal(sim.stats.compass, true);
});

test('a chest found with full gear slots gives fossils instead', () => {
  const full = ['drill_bit', 'wide_nozzle', 'pressure_valve'].slice(0, GEAR_SLOTS);
  const sim = new FloorSim(layoutFrom(['.........', 'Ph#######', '########p']), stats(), { gear: full });
  sim.freeze = 99;
  run(sim, 0.5, { dir: 'right' });
  assert.equal(sim.gear.length, GEAR_SLOTS);
  assert.equal(sim.fossils, FULL_CHEST_FOSSILS);
});

test('wide nozzle catches foes one tile off the hose line', () => {
  const layout = ['.........', 'P.....###', '###p#####', '########p'];
  const plain = new FloorSim(layoutFrom(layout), stats({ deflateDelay: 5 }));
  const wide = new FloorSim(layoutFrom(layout), stats({ deflateDelay: 5, wideNozzle: true }));
  for (const sim of [plain, wide]) {
    sim.freeze = 99;
    sim.update(1 / 120, { pumpPressed: true });
    run(sim, 0.4);
  }
  assert.equal(plain.enemies[0].state, 'walk');
  assert.equal(wide.enemies[0].state, 'inflated');
});

test('every floor has a gear chest near the bottom', () => {
  for (let floor = 1; floor <= 20; floor += 2) {
    const l = generateFloor(floor, floor * 11);
    const chests = l.items.filter((i) => i.kind === 'chest');
    assert.equal(chests.length, 1);
    assert.ok(chests[0].y >= l.rows - 6);
  }
});

test('first-time tips start unseen', () => {
  assert.deepEqual(defaultMeta().seen, []);
});
