import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/game.js';
import { generateFloor } from '../src/levelgen.js';
import { T_ICE, T_OPEN, T_VINE } from '../src/constants.js';
import { newRun, screensAfterFloor, routeOptions, chooseRoute, runZone } from '../src/run.js';
import { defaultMeta } from '../src/meta.js';
import { layoutFrom, stats, run } from './helpers.js';

test('the path splits after the Act I boss', () => {
  assert.deepEqual(screensAfterFloor(7), ['reward', 'route']);
  assert.ok(!screensAfterFloor(6).includes('route'));
  assert.ok(!screensAfterFloor(14).includes('route'));
  const r = newRun(1, defaultMeta());
  r.floor = 7;
  assert.deepEqual(routeOptions(r), ['bedrock', 'frozen', 'fungal']);
  assert.equal(runZone(r, 8).id, 'bedrock', 'Bedrock is the default');
  assert.ok(!chooseRoute(r, 'deep'));
  assert.ok(chooseRoute(r, 'frozen'));
  assert.equal(runZone(r, 8).id, 'frozen');
  assert.equal(runZone(r, 14).id, 'frozen');
  assert.equal(runZone(r, 15).id, 'deep');
});

test('frozen floors have ice, icicles and chillers instead of scorchlings', () => {
  let ice = 0;
  let icicles = 0;
  const kinds = new Set();
  for (let seed = 0; seed < 10; seed++) {
    const l = generateFloor(11, seed, { zone: 'frozen' });
    ice += Array.from(l.grid).filter((t) => t === T_ICE).length;
    icicles += l.icicles.length;
    for (const e of l.enemies) kinds.add(e.kind);
    for (const ic of l.icicles) {
      assert.equal(l.grid[ic.y * l.cols + ic.x], T_OPEN, 'icicle hangs in an open tile');
      assert.notEqual(l.grid[(ic.y - 1) * l.cols + ic.x], T_OPEN, 'with a ceiling above');
      assert.ok(Math.abs(ic.x - l.start.x) > 2 || Math.abs(ic.y - l.start.y) > 2, 'not over the start');
    }
  }
  assert.ok(ice > 0);
  assert.ok(icicles > 0);
  assert.ok(kinds.has('chiller'));
  assert.ok(!kinds.has('scorch'));
  const bedrock = generateFloor(11, 3, { zone: 'bedrock' });
  assert.equal(Array.from(bedrock.grid).filter((t) => t === T_ICE).length, 0);
  assert.equal(bedrock.icicles.length, 0);
});

test('ice is slower to dig than dirt', () => {
  const dirt = new FloorSim(layoutFrom(['.......', 'P######', '######p']), stats());
  const ice = new FloorSim(layoutFrom(['.......', 'PIIIIII', '######p']), stats());
  dirt.freeze = ice.freeze = 99;
  run(dirt, 1, { dir: 'right' });
  run(ice, 1, { dir: 'right' });
  assert.ok(ice.player.x < dirt.player.x - 1);
});

test('an icicle drops on the player walking beneath it', () => {
  const sim = new FloorSim(layoutFrom([
    '#######',
    '##i####',
    'P.....#',
    '######p',
  ]), stats(), { hearts: 1 });
  sim.freeze = 99;
  run(sim, 0.45, { dir: 'right' });
  run(sim, 1);
  assert.equal(sim.player.alive, false);
  assert.notEqual(sim.icicles[0]?.state ?? 'gone', 'idle', 'it fell');
});

test('an icicle crushes foes under it for gold', () => {
  const sim = new FloorSim(layoutFrom([
    '#######',
    '##i####',
    '##p####',
    '##.####',
    'P.....#',
    '######p',
  ]), stats(), { hearts: 1 });
  sim.freeze = 99;
  sim.icicles[0].state = 'falling';
  run(sim, 1);
  assert.equal(sim.kills, 1);
  assert.ok(sim.gold > 0);
});

test('frost breath freezes the player instead of hurting', () => {
  const sim = new FloorSim(layoutFrom([
    '##########',
    'P##C######',
    '#########p',
  ]), stats(), { hearts: 1 });
  sim.enemies[0].fireCooldown = 0;
  sim.enemies[0].ghostTimer = 99;
  let chilled = false;
  for (let i = 0; i < 240; i++) {
    sim.update(1 / 120, {});
    if (sim.player.chilled > 0) chilled = true;
  }
  assert.ok(chilled);
  assert.equal(sim.player.alive, true);
});

test('fire breath melts ice', () => {
  const sim = new FloorSim(layoutFrom([
    '##########',
    '#PIIs#####',
    '#########p',
  ]), stats({ fireproof: true }), { hearts: 1 });
  sim.enemies[0].fireCooldown = 0;
  sim.enemies[0].ghostTimer = 99;
  run(sim, 1.6);
  assert.equal(sim.tile(2, 1), T_OPEN);
  assert.equal(sim.tile(3, 1), T_OPEN);
});

test('the Rime Queen breathes frost', () => {
  const l = generateFloor(14, 5, { zone: 'frozen' });
  const sim = new FloorSim(l, stats());
  assert.equal(sim.enemies.find((e) => e.kind === 'boss').frost, true);
  const cinder = new FloorSim(generateFloor(14, 5, { zone: 'bedrock' }), stats());
  assert.equal(cinder.enemies.find((e) => e.kind === 'boss').frost, false);
});

test('fungal floors have vines, spore vents, glowing mushrooms and sporelings', () => {
  let vines = 0;
  let vents = 0;
  const kinds = new Set();
  for (let seed = 0; seed < 10; seed++) {
    const l = generateFloor(11, seed, { zone: 'fungal' });
    vines += Array.from(l.grid).filter((t) => t === T_VINE).length;
    vents += l.vents.length;
    assert.ok(l.glows.length > 0);
    for (const e of l.enemies) kinds.add(e.kind);
    for (const v of l.vents) assert.equal(l.grid[v.y * l.cols + v.x], T_OPEN);
  }
  assert.ok(vines > 0);
  assert.ok(vents > 0);
  assert.ok(kinds.has('sporeling'));
  assert.ok(!kinds.has('scorch'));
});

test('vines dig at full speed and grow back behind you', () => {
  const dirt = new FloorSim(layoutFrom(['.......', 'P######', '######p']), stats());
  const vine = new FloorSim(layoutFrom(['.......', 'PWWWWWW', '######p'], { zone: 'fungal' }), stats());
  dirt.freeze = vine.freeze = 99;
  run(dirt, 1, { dir: 'right' });
  run(vine, 1, { dir: 'right' });
  assert.ok(vine.player.x > dirt.player.x);

  const sim = new FloorSim(layoutFrom([
    '.........',
    'PWW......',
    '########p',
  ], { zone: 'fungal' }), stats());
  sim.freeze = 99;
  run(sim, 1.5, { dir: 'right' });
  assert.equal(sim.tile(1, 1), T_OPEN, 'dug through');
  run(sim, 1, { dir: 'right' });
  run(sim, 7);
  assert.equal(sim.tile(1, 1), T_VINE, 'grew back once you left');
  assert.equal(sim.tile(3, 1), T_OPEN, 'plain tunnels stay open');
});

test('spore clouds slow the player', () => {
  const lines = ['..........', 'P.........', '#########p'];
  const clear = new FloorSim(layoutFrom(lines, { zone: 'fungal' }), stats());
  const spored = new FloorSim(layoutFrom(lines, { zone: 'fungal' }), stats());
  clear.freeze = spored.freeze = 99;
  spored.addCloud(2, 1, 3, 99);
  run(clear, 1, { dir: 'right' });
  run(spored, 1, { dir: 'right' });
  assert.ok(spored.player.x < clear.player.x * 0.7);
  assert.equal(spored.player.slowed, true);
});

test('vents puff spore clouds on a timer', () => {
  const sim = new FloorSim(layoutFrom(['P....O....', '#########p'], { zone: 'fungal' }), stats());
  sim.freeze = 99;
  let puffed = false;
  for (let i = 0; i < 120 * 6; i++) {
    sim.update(1 / 120, {});
    if (sim.clouds.length) puffed = true;
  }
  assert.ok(puffed);
});

test('sporelings leave spore clouds and Old Rootmaw spores instead of breathing fire', () => {
  const sim = new FloorSim(layoutFrom(['P#########', '#####....S'], { zone: 'fungal' }), stats());
  sim.enemies[0].sporeTimer = 0.1;
  sim.enemies[0].ghostTimer = 99;
  run(sim, 0.3);
  assert.ok(sim.clouds.length > 0);
  assert.equal(sim.breather(), 'sporeling');
  const boss = new FloorSim(generateFloor(14, 5, { zone: 'fungal' }), stats()).boss;
  assert.equal(boss.spores, true);
  assert.equal(boss.frost, false);
});
