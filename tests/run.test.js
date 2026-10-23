import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/rng.js';
import {
  newRun, runStats, screensAfterFloor, rewardChoices, applyUpgrade, shopStock,
  buyShopItem, failRun, isBossFloor, MAX_HEARTS,
} from '../src/run.js';
import { defaultMeta, buyUnlock, recordRunEnd, loadMeta, saveMeta } from '../src/meta.js';
import { UPGRADE_BY_ID } from '../src/upgrades.js';

test('runs start with one heart and no gold', () => {
  const run = newRun(1, defaultMeta());
  assert.equal(run.hearts, 1);
  assert.equal(run.gold, 0);
  assert.equal(run.floor, 1);
});

test('floor flow: reward every floor, shop every 3rd, victory after 20', () => {
  assert.deepEqual(screensAfterFloor(1), ['reward']);
  assert.deepEqual(screensAfterFloor(3), ['reward', 'shop']);
  assert.deepEqual(screensAfterFloor(18), ['reward', 'shop']);
  assert.deepEqual(screensAfterFloor(20), ['victory']);
  assert.ok(isBossFloor(7) && isBossFloor(14) && isBossFloor(20) && !isBossFloor(8));
});

test('reward choices are distinct and exclude locked upgrades', () => {
  const run = newRun(1, defaultMeta());
  const choices = rewardChoices(run, new Rng(5));
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices).size, 3);
  for (const id of choices) assert.ok(!UPGRADE_BY_ID[id].locked);
});

test('wide satchel unlock shows four choices', () => {
  const meta = defaultMeta();
  meta.unlocked.push('wide_choice');
  assert.equal(rewardChoices(newRun(1, meta), new Rng(5)).length, 4);
});

test('upgrades change stats and respect max stacks', () => {
  const run = newRun(1, defaultMeta());
  const base = runStats(run).hoseRange;
  for (let i = 0; i < 5; i++) applyUpgrade(run, 'long_hose');
  assert.equal(run.upgrades.long_hose, 3);
  assert.equal(runStats(run).hoseRange, base + 3);
});

test('spare heart adds a heart immediately', () => {
  const meta = defaultMeta();
  meta.unlocked.push('spare_heart');
  const run = newRun(1, meta);
  applyUpgrade(run, 'spare_heart');
  assert.equal(run.hearts, 2);
});

test('shop buying spends gold and caps hearts', () => {
  const run = newRun(1, defaultMeta());
  run.gold = 1000;
  const stock = shopStock(run, new Rng(3));
  const heal = stock.find((i) => i.kind === 'heal');
  const up = stock.find((i) => i.kind === 'upgrade');
  assert.ok(buyShopItem(run, up));
  assert.ok(!buyShopItem(run, up), 'cannot buy twice');
  run.hearts = MAX_HEARTS;
  assert.ok(!buyShopItem(run, heal));
  assert.equal(run.gold, 1000 - up.price);
});

test('dying loses gold but banks fossils into the vault', () => {
  const meta = defaultMeta();
  const run = newRun(1, meta);
  run.gold = 200;
  run.fossils = 2;
  run.floor = 6;
  failRun(run, { fossils: 1, kills: 3 });
  recordRunEnd(meta, run, false);
  assert.equal(meta.fossils, 3);
  assert.equal(meta.bestFloor, 6);
  assert.equal(meta.runs, 1);
});

test('vault unlocks cost fossils and persist', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const meta = defaultMeta();
  meta.fossils = 4;
  assert.ok(!buyUnlock(meta, 'spare_heart'));
  assert.ok(buyUnlock(meta, 'fossil_sense'));
  assert.equal(meta.fossils, 1);
  saveMeta(storage, meta);
  assert.deepEqual(loadMeta(storage).unlocked, ['fossil_sense']);
});

test('classes change the starting state', () => {
  const meta = defaultMeta();
  const base = runStats(newRun(1, meta));
  const sapper = runStats(newRun(1, meta, 'sapper'));
  assert.ok(sapper.speed > base.speed);
  assert.equal(sapper.hoseRange, base.hoseRange - 1);
  const brute = newRun(1, meta, 'brute');
  assert.equal(runStats(brute).shield, 1);
  assert.equal(runStats(brute).popDiscount, 1);
  assert.ok(runStats(brute).speed < base.speed);
  assert.equal(newRun(1, meta, 'nope').classId, 'digger');
});
