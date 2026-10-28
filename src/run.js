// Run state: one life through 20 floors, with upgrade picks and shops between.

import { Rng, hashSeed } from './rng.js';
import { TOTAL_FLOORS, BOSS_FLOORS, SHOP_EVERY } from './constants.js';
import { deriveStats, availableUpgrades, UPGRADE_BY_ID } from './upgrades.js';
import { CLASS_BY_ID, classUnlocked } from './classes.js';
import { applyPerks, perkHearts } from './meta.js';
import { ITEMS, ITEM_BY_ID } from './items.js';

export const BASE_HEARTS = 1;
export const MAX_HEARTS = 5;

export function newRun(seed, meta, classId = 'digger') {
  const unlocked = meta ? meta.unlocked.slice() : [];
  let cls = CLASS_BY_ID[classId] || CLASS_BY_ID.digger;
  if (!classUnlocked(cls, unlocked)) cls = CLASS_BY_ID.digger;
  const perks = meta && meta.perks ? { ...meta.perks } : {};
  return {
    seed: seed >>> 0,
    classId: cls.id,
    floor: 1,
    gold: 0,
    fossils: 0,
    hearts: Math.min(MAX_HEARTS, BASE_HEARTS + perkHearts(perks)),
    perks,
    upgrades: { ...cls.start },
    items: (cls.items || []).slice(),
    unlocked,
    kills: 0,
    goldEarned: 0,
    over: false,
    won: false,
  };
}

export function runStats(run) {
  return applyPerks(deriveStats(run.upgrades, CLASS_BY_ID[run.classId]), run.perks);
}

export function floorSeed(run, floor = run.floor) {
  return hashSeed(run.seed, 'floor', floor);
}

export function isBossFloor(floor) {
  return BOSS_FLOORS.includes(floor);
}

export function clearBonus(floor) {
  return 5 + floor * 2;
}

// Screens shown after clearing `floor`, in order.
export function screensAfterFloor(floor) {
  if (floor >= TOTAL_FLOORS) return ['victory'];
  const screens = ['reward'];
  if (floor % SHOP_EVERY === 0) screens.push('shop');
  return screens;
}

export function rewardChoices(run, rng) {
  const count = run.unlocked.includes('wide_choice') ? 4 : 3;
  const pool = availableUpgrades(run.upgrades, run.unlocked);
  return rng.shuffle(pool).slice(0, count).map((u) => u.id);
}

export function applyUpgrade(run, id) {
  const u = UPGRADE_BY_ID[id];
  if (!u) return false;
  const have = run.upgrades[id] || 0;
  if (have >= u.max) return false;
  run.upgrades[id] = have + 1;
  if (u.instant) u.instant(run);
  run.hearts = Math.min(run.hearts, MAX_HEARTS);
  return true;
}

export function upgradePrice(run, id) {
  const have = run.upgrades[id] || 0;
  return 20 + run.floor * 3 + have * 10;
}

export const HEAL_PRICE = 30;
export const REROLL_PRICE = 8;

export function shopStock(run, rng) {
  const pool = availableUpgrades(run.upgrades, run.unlocked);
  const items = rng
    .shuffle(pool)
    .slice(0, 3)
    .map((u) => ({ kind: 'upgrade', id: u.id, price: upgradePrice(run, u.id), sold: false }));
  items.push({ kind: 'heal', id: 'heal', price: HEAL_PRICE, sold: false });
  for (const it of rng.shuffle(ITEMS).slice(0, 2)) items.push({ kind: 'item', id: it.id, price: it.price, sold: false });
  return items;
}

export function buyShopItem(run, item) {
  if (item.sold || run.gold < item.price) return false;
  if (item.kind === 'heal') {
    if (run.hearts >= MAX_HEARTS) return false;
    run.hearts += 1;
  } else if (item.kind === 'item') {
    if (!ITEM_BY_ID[item.id] || run.items.length >= runStats(run).itemSlots) return false;
    run.items.push(item.id);
  } else if (!applyUpgrade(run, item.id)) {
    return false;
  }
  run.gold -= item.price;
  item.sold = true;
  return true;
}

// Fold a finished floor's results into the run.
export function completeFloor(run, sim) {
  const bonus = Math.round(clearBonus(run.floor) * sim.stats.goldMult);
  run.gold += sim.gold + bonus;
  run.goldEarned += sim.gold + bonus;
  run.fossils += sim.fossils;
  run.kills += sim.kills;
  run.hearts = sim.player.hearts;
  run.items = sim.pack.slice();
  return bonus;
}

export function advanceFloor(run) {
  run.floor += 1;
}

export function failRun(run, sim) {
  run.over = true;
  run.won = false;
  // Fossils dug up this floor still count; gold is lost with the run.
  run.fossils += sim ? sim.fossils : 0;
  run.kills += sim ? sim.kills : 0;
}

export function winRun(run) {
  run.over = true;
  run.won = true;
}

export function rngFor(run, ...tag) {
  return new Rng(hashSeed(run.seed, run.floor, ...tag));
}
