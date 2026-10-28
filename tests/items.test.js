import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/game.js';
import { T_OPEN } from '../src/constants.js';
import { generateFloor } from '../src/levelgen.js';
import { newRun, shopStock, buyShopItem, completeFloor, runStats } from '../src/run.js';
import { defaultMeta } from '../src/meta.js';
import { Rng } from '../src/rng.js';
import { BOMB_FUSE } from '../src/items.js';
import { layoutFrom, stats, run } from './helpers.js';

const use = (sim) => sim.update(1 / 120, { usePressed: true });

test('a bomb pops nearby foes and blasts the dirt around it', () => {
  const sim = new FloorSim(layoutFrom([
    '.........',
    '#########',
    '##.Pp####',
    '#########',
    '########p',
  ]), stats(), { items: ['bomb'], hearts: 1 });
  sim.freeze = 99;
  use(sim);
  assert.equal(sim.pack.length, 0);
  assert.equal(sim.bombs.length, 1);
  // Walk away before it goes off.
  run(sim, 0.6, { dir: 'left' });
  run(sim, BOMB_FUSE);
  assert.equal(sim.kills, 1);
  assert.equal(sim.tile(3, 1), T_OPEN, 'dirt above the bomb is gone');
  assert.equal(sim.player.alive, true);
});

test('standing on your own bomb hurts', () => {
  const sim = new FloorSim(layoutFrom([
    '.........',
    '###P#####',
    '########p',
  ]), stats(), { items: ['bomb'], hearts: 1 });
  sim.freeze = 99;
  use(sim);
  run(sim, BOMB_FUSE + 0.1);
  assert.equal(sim.player.alive, false);
});

test('a decoy draws foes away from the player', () => {
  const sim = new FloorSim(layoutFrom([
    '###########',
    'P.........p',
    '###########',
  ]), stats(), { items: ['decoy'] });
  sim.freeze = 99;
  use(sim);
  assert.deepEqual([sim.target().x, sim.target().y], [0, 1]);
  sim.player.x = 5;
  assert.notEqual(sim.target(), sim.player);
  run(sim, 7);
  assert.equal(sim.decoy, null, 'decoy expires');
  assert.equal(sim.target(), sim.player);
});

test('frost freezes foes in place and makes them harmless', () => {
  const sim = new FloorSim(layoutFrom([
    '#######',
    'P.p####',
    '######p',
  ]), stats(), { items: ['frost'], hearts: 1 });
  use(sim);
  const e = sim.enemies[0];
  const x = e.x;
  run(sim, 2, { dir: 'right' });
  assert.equal(e.x, x, 'did not move');
  assert.equal(sim.player.alive, true, 'touching a frozen foe is safe');
});

test('turbo drill speeds up digging', () => {
  const plain = new FloorSim(layoutFrom(['..........', 'P#########', '#########p']), stats());
  const drill = new FloorSim(layoutFrom(['..........', 'P#########', '#########p']), stats(), { items: ['drill'] });
  plain.freeze = drill.freeze = 99;
  use(drill);
  run(plain, 1, { dir: 'right' });
  run(drill, 1, { dir: 'right' });
  assert.ok(drill.player.x > plain.player.x + 1);
});

test('caches go into the pack, or turn into gold when it is full', () => {
  const sim = new FloorSim(layoutFrom(['.........', 'Pcc######', '########p']), stats({ itemSlots: 1 }));
  sim.freeze = 99;
  run(sim, 1, { dir: 'right' });
  assert.deepEqual(sim.pack, ['bomb']);
  assert.equal(sim.gold, 5);
});

test('Q cycles the selected item', () => {
  const sim = new FloorSim(layoutFrom(['P.', '#p']), stats(), { items: ['bomb', 'decoy'] });
  sim.freeze = 99;
  sim.update(1 / 120, { cyclePressed: true });
  assert.equal(sim.selected, 1);
  use(sim);
  assert.deepEqual(sim.pack, ['bomb']);
  assert.ok(sim.decoy);
});

test('every floor buries at least one item cache', () => {
  for (let floor = 1; floor <= 20; floor += 3) {
    const caches = generateFloor(floor, floor * 3).items.filter((i) => i.kind === 'cache');
    assert.ok(caches.length >= 1);
    for (const c of caches) assert.ok(['bomb', 'drill', 'decoy', 'frost'].includes(c.item));
  }
});

test('the pack carries over between floors and the shop respects its size', () => {
  const meta = defaultMeta();
  meta.unlocked.push('class_sapper');
  const r = newRun(1, meta, 'sapper');
  assert.deepEqual(r.items, ['bomb', 'bomb']);
  r.gold = 500;
  const stock = shopStock(r, new Rng(4));
  const offer = stock.find((i) => i.kind === 'item');
  assert.ok(offer);
  assert.ok(!buyShopItem(r, offer), 'pack is full');
  r.items = ['bomb'];
  assert.ok(buyShopItem(r, offer));
  assert.equal(r.items.length, runStats(r).itemSlots);

  const sim = { gold: 0, fossils: 0, kills: 0, stats: runStats(r), player: { hearts: 1 }, pack: ['frost'] };
  completeFloor(r, sim);
  assert.deepEqual(r.items, ['frost']);
});
