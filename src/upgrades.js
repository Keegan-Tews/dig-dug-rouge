// Upgrade catalog and stat derivation. Pure data + functions.

export const BASE_STATS = {
  speed: 4.2, // tiles per second
  hoseRange: 3, // tiles
  pumpPower: 1, // inflation added per pump
  autoPumpInterval: 0.3, // seconds between pumps while holding
  deflateDelay: 0.7, // seconds per inflation step lost
  goldMult: 1,
  rockBonus: 1,
  fireproof: false,
  tremor: 0, // seconds enemies stay frozen at floor start
  fossilLuck: 0,
  shield: 0, // hits blocked per floor, recharged each floor
  digPenalty: 0.8, // speed multiplier while digging through dirt
  popDiscount: 0, // pumps fewer needed to pop a foe
  itemSlots: 2, // usable items the pack can hold
  wideNozzle: false, // hose catches foes one tile off its line
  compass: false, // minimap shows buried treasure
};

// `locked` upgrades only enter the pool once bought in the Fossil Vault.
export const UPGRADES = [
  {
    id: 'long_hose', name: 'Long Hose', icon: '➰', max: 3,
    desc: 'Your pump hose reaches 1 tile further.',
    apply: (s) => { s.hoseRange += 1; },
  },
  {
    id: 'big_lungs', name: 'Big Lungs', icon: '🫁', max: 2,
    desc: 'Each pump inflates foes one extra step.',
    apply: (s) => { s.pumpPower += 1; },
  },
  {
    id: 'quick_boots', name: 'Quick Boots', icon: '👢', max: 3,
    desc: 'Move and dig 12% faster.',
    apply: (s) => { s.speed *= 1.12; },
  },
  {
    id: 'slow_leak', name: 'Slow Leak', icon: '🎈', max: 2,
    desc: 'Inflated foes take 40% longer to deflate.',
    apply: (s) => { s.deflateDelay *= 1.4; },
  },
  {
    id: 'gold_nose', name: 'Gold Nose', icon: '🪙', max: 3,
    desc: 'Earn 40% more gold.',
    apply: (s) => { s.goldMult += 0.4; },
  },
  {
    id: 'heavy_rocks', name: 'Heavy Rocks', icon: '🪨', max: 1,
    desc: 'Rock crushes pay triple gold.',
    apply: (s) => { s.rockBonus = 3; },
  },
  {
    id: 'bellows', name: 'Bellows', icon: '💨', max: 2,
    desc: 'Holding pump works 35% faster.',
    apply: (s) => { s.autoPumpInterval *= 0.65; },
  },
  {
    id: 'big_pack', name: 'Big Pack', icon: '🎒', max: 1,
    desc: 'Carry one more usable item.',
    apply: (s) => { s.itemSlots += 1; },
  },
  {
    id: 'hard_hat', name: 'Hard Hat', icon: '⛑️', max: 2,
    desc: 'Blocks one hit per floor. Recharges every floor. Rocks still crush.',
    apply: (s) => { s.shield += 1; },
  },
  {
    id: 'spare_heart', name: 'Spare Heart', icon: '❤️', max: 4, locked: true,
    desc: 'Gain a heart: survive one more hit this run.',
    instant: (run) => { run.hearts += 1; },
  },
  {
    id: 'ash_coat', name: 'Ash Coat', icon: '🧥', max: 1, locked: true,
    desc: 'Fire breath and burning trails can no longer hurt you.',
    apply: (s) => { s.fireproof = true; },
  },
  {
    id: 'tremor', name: 'Tremor Boots', icon: '💥', max: 1, locked: true,
    desc: 'Foes are frozen for 3 seconds when a floor starts.',
    apply: (s) => { s.tremor = 3; },
  },
  {
    id: 'fossil_sense', name: 'Fossil Sense', icon: '🦴', max: 2, locked: true,
    desc: 'Fossils turn up more often.',
    apply: (s) => { s.fossilLuck += 1; },
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export function deriveStats(upgradeCounts, cls) {
  const s = { ...BASE_STATS };
  if (cls) cls.apply(s);
  for (const [id, count] of Object.entries(upgradeCounts)) {
    const u = UPGRADE_BY_ID[id];
    if (!u || !u.apply) continue;
    for (let i = 0; i < count; i++) u.apply(s);
  }
  return s;
}

export function availableUpgrades(upgradeCounts, unlocked) {
  return UPGRADES.filter(
    (u) => (!u.locked || unlocked.includes(u.id)) && (upgradeCounts[u.id] || 0) < u.max,
  );
}
