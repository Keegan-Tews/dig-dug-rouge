import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/game.js';
import { T_OPEN } from '../src/constants.js';
import { layoutFrom, stats, run } from './helpers.js';

test('player digs through dirt and leaves a tunnel', () => {
  const sim = new FloorSim(layoutFrom([
    '..........',
    'P####.....',
    '########p#',
  ]), stats());
  sim.freeze = 99;
  run(sim, 1.5, { dir: 'right' });
  assert.ok(sim.player.x >= 3);
  assert.equal(sim.tile(1, 1), T_OPEN);
  assert.equal(sim.tile(2, 1), T_OPEN);
});

test('player cannot dig bedrock', () => {
  const sim = new FloorSim(layoutFrom([
    '..........',
    'PX........',
  ]), stats());
  sim.freeze = 99;
  run(sim, 1, { dir: 'right' });
  assert.equal(sim.player.x, 0);
});

test('pumping an enemy four times pops it and clears the floor', () => {
  const sim = new FloorSim(layoutFrom([
    '#########',
    'P..p#####',
    '#########',
  ]), stats({ deflateDelay: 5 }));
  sim.freeze = 99;
  sim.update(1 / 120, { pumpPressed: true });
  run(sim, 0.3);
  assert.equal(sim.enemies[0].state, 'inflated');
  for (let i = 0; i < 3; i++) {
    sim.update(1 / 120, { pumpPressed: true });
    run(sim, 0.05);
  }
  assert.equal(sim.kills, 1);
  assert.ok(sim.gold > 0);
  run(sim, 2);
  assert.equal(sim.status, 'cleared');
});

test('hose stops at dirt', () => {
  const sim = new FloorSim(layoutFrom([
    '#########',
    'P.#p#####',
    '#########',
  ]), stats());
  sim.freeze = 99;
  sim.update(1 / 120, { pumpPressed: true });
  run(sim, 0.5);
  assert.equal(sim.enemies[0].state, 'walk');
  assert.equal(sim.hose, null);
});

test('inflated enemies deflate and recover if left alone', () => {
  const sim = new FloorSim(layoutFrom([
    '#########',
    'P..p.####',
    '#########',
  ]), stats());
  sim.freeze = 99;
  sim.update(1 / 120, { pumpPressed: true });
  run(sim, 0.2);
  assert.equal(sim.enemies[0].state, 'inflated');
  sim.freeze = 0;
  sim.hose = null;
  run(sim, 1.0);
  assert.notEqual(sim.enemies[0].state, 'inflated');
});

test('the hose latching on, pumping and deflating each emit a sound event', () => {
  const sim = new FloorSim(layoutFrom([
    '#########',
    'P..p.####',
    '#########',
  ]), stats());
  sim.freeze = 99;
  sim.update(1 / 120, { pumpPressed: true });
  run(sim, 0.2);
  const pumped = sim.drainEvents().map((e) => e.type);
  assert.ok(pumped.includes('latch'));
  assert.ok(pumped.includes('pump'));
  sim.freeze = 0;
  sim.hose = null;
  run(sim, 1.0);
  const deflate = sim.drainEvents().find((e) => e.type === 'deflate');
  assert.ok(deflate);
  assert.ok(deflate.level >= 0 && deflate.level < 1);
});

test('touching an enemy with one heart kills the player', () => {
  const sim = new FloorSim(layoutFrom([
    '#######',
    'P.p####',
  ]), stats(), { hearts: 1 });
  run(sim, 2, { dir: 'right' });
  assert.equal(sim.player.alive, false);
  run(sim, 2);
  assert.equal(sim.status, 'dead');
});

test('a spare heart absorbs one hit', () => {
  const sim = new FloorSim(layoutFrom([
    '#######',
    'P.p####',
  ]), stats(), { hearts: 2 });
  run(sim, 0.5, { dir: 'right' });
  assert.equal(sim.player.alive, true);
  assert.equal(sim.player.hearts, 1);
});

test('rock falls when dug under and crushes enemies for bonus gold', () => {
  // Player digs right along row 2 under the rock, then keeps going.
  const sim = new FloorSim(layoutFrom([
    '.........',
    '##R######',
    'P#######.',
    '##.######',
    '##p######',
    '##.######',
  ]), stats());
  sim.freeze = 99;
  sim.player.hearts = 1;
  run(sim, 1.6, { dir: 'right' });
  sim.freeze = 99;
  run(sim, 1.5);
  assert.equal(sim.kills, 1);
  assert.ok(sim.gold >= 4);
  assert.equal(sim.player.alive, true);
});

test('standing under a falling rock is fatal even with hearts', () => {
  const sim = new FloorSim(layoutFrom([
    '.....',
    '#R###',
    '#P###',
    '#.###',
    '#.##p',
  ]), stats(), { hearts: 3 });
  // Step down out from under the rock, into its path.
  run(sim, 0.26, { dir: 'down' });
  run(sim, 1.5);
  assert.equal(sim.player.alive, false);
});

test('scorchlings breathe fire along their row', () => {
  const sim = new FloorSim(layoutFrom([
    '##########',
    'P##s######',
    '##########',
  ]), stats(), { hearts: 1 });
  sim.enemies[0].fireCooldown = 0;
  run(sim, 2.5);
  assert.equal(sim.player.alive, false);
});

test('ash coat makes the player fireproof', () => {
  const sim = new FloorSim(layoutFrom([
    '##########',
    'P##s######',
    '##########',
  ]), stats({ fireproof: true }), { hearts: 1 });
  sim.enemies[0].fireCooldown = 0;
  sim.enemies[0].ghostTimer = 99;
  run(sim, 1.6);
  assert.equal(sim.player.alive, true);
});

test('collecting buried gold and fossils', () => {
  const sim = new FloorSim(layoutFrom([
    '.........',
    'Pgf######',
    '########p',
  ]), stats({ goldMult: 2 }));
  sim.freeze = 99;
  run(sim, 1, { dir: 'right' });
  assert.equal(sim.gold, 6);
  assert.equal(sim.fossils, 1);
});

test('enemies eventually ghost through dirt toward the player', () => {
  const sim = new FloorSim(layoutFrom([
    '###########',
    'P#######p.#',
    '###########',
  ]), stats(), { hearts: 1 });
  sim.enemies[0].ghostTimer = 0.1;
  run(sim, 10);
  assert.equal(sim.player.alive, false);
});

test('popping the boss clears its minions', () => {
  const sim = new FloorSim(layoutFrom([
    '###########',
    'P..B......p',
    '###########',
  ]), stats({ pumpPower: 4, deflateDelay: 5 }));
  sim.freeze = 99;
  sim.update(1 / 120, { pumpPressed: true });
  run(sim, 0.2);
  for (let i = 0; i < 3; i++) {
    sim.update(1 / 120, { pumpPressed: true });
    run(sim, 0.05);
  }
  assert.equal(sim.kills, 2);
  run(sim, 2);
  assert.equal(sim.status, 'cleared');
});

test('a hard hat blocks one hit but not a rock', () => {
  const sim = new FloorSim(layoutFrom([
    '#######',
    'P.p####',
  ]), stats({ shield: 1 }), { hearts: 1 });
  run(sim, 0.5, { dir: 'right' });
  assert.equal(sim.player.alive, true);
  assert.equal(sim.player.shield, 0);
  sim.player.invuln = 0;
  sim.hurtPlayer('rock');
  assert.equal(sim.player.alive, false);
});

test('brute pops foes in three pumps', () => {
  const sim = new FloorSim(layoutFrom([
    '#########',
    'P..p####p',
  ]), stats({ popDiscount: 1, deflateDelay: 5 }));
  sim.freeze = 99;
  for (let i = 0; i < 3; i++) {
    sim.update(1 / 120, { pumpPressed: true });
    run(sim, 0.25);
  }
  assert.equal(sim.kills, 1);
});

test('gnawlers chew their own tunnels toward the player', () => {
  const sim = new FloorSim(layoutFrom([
    '##########',
    'P#######.n',
    '##########',
  ]), stats(), { hearts: 1 });
  const dirtBefore = Array.from(sim.grid).filter((t) => t === 1).length;
  run(sim, 15);
  const dirtAfter = Array.from(sim.grid).filter((t) => t === 1).length;
  assert.ok(dirtAfter < dirtBefore, 'dug some dirt');
  assert.ok(sim.enemies.every((e) => e.state !== 'ghost'), 'never ghosts');
  assert.equal(sim.player.alive, false);
});

test('splitters burst into two minis that must also be popped', () => {
  const sim = new FloorSim(layoutFrom([
    '##########',
    'P..v######',
    '##########',
  ]), stats({ deflateDelay: 5 }));
  sim.freeze = 99;
  for (let i = 0; i < 3; i++) {
    sim.update(1 / 120, { pumpPressed: true });
    run(sim, 0.25);
  }
  run(sim, 0.5);
  const minis = sim.enemies.filter((e) => e.kind === 'mini');
  assert.equal(minis.length, 2);
  assert.equal(sim.status, 'playing');
});

test('shellbacks block a head-on hose but pop from behind', () => {
  const make = () => new FloorSim(layoutFrom([
    '#########',
    'P..k####p',
  ]), stats({ deflateDelay: 5 }));
  const front = make();
  front.freeze = 99;
  front.enemies[0].dir = 'left'; // facing the player
  front.update(1 / 120, { pumpPressed: true });
  run(front, 0.4);
  assert.equal(front.enemies[0].state, 'walk');

  const back = make();
  back.freeze = 99;
  back.enemies[0].dir = 'right'; // facing away
  for (let i = 0; i < 4; i++) {
    back.update(1 / 120, { pumpPressed: true });
    run(back, 0.25);
  }
  assert.equal(back.kills, 1);
});
