// Meta progression kept between runs: fossils buy permanent stat perks,
// new classes, and new options for the upgrade pool.

// Permanent perks: each level costs the next entry in `costs`.
export const PERKS = [
  { id: 'perm_speed', name: 'Strong Legs', icon: '🦵', costs: [3, 6, 10], desc: '+5% move speed per level.', apply: (s, n) => { s.speed *= 1 + 0.05 * n; } },
  { id: 'perm_gold', name: 'Prospector', icon: '💰', costs: [2, 5, 9], desc: '+10% gold per level.', apply: (s, n) => { s.goldMult += 0.1 * n; } },
  { id: 'perm_lungs', name: 'Deep Breath', icon: '🫁', costs: [3, 6, 10], desc: 'Inflated foes deflate 15% slower per level.', apply: (s, n) => { s.deflateDelay *= 1 + 0.15 * n; } },
  { id: 'perm_hose', name: 'Longer Hose', icon: '➰', costs: [5, 12], desc: '+1 hose reach per level.', apply: (s, n) => { s.hoseRange += n; } },
  { id: 'perm_hat', name: 'Lucky Hat', icon: '⛑️', costs: [15], desc: 'Block one extra hit on every floor.', apply: (s, n) => { s.shield += n; } },
  { id: 'perm_pack', name: 'Deep Pockets', icon: '🎒', costs: [8], desc: 'Carry one more usable item in every run.', apply: (s, n) => { s.itemSlots += n; } },
  { id: 'perm_heart', name: 'Thick Skin', icon: '❤️', costs: [12, 25], desc: 'Start every run with one more heart per level.', hearts: 1 },
];

export const PERK_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p]));


export const UNLOCKS = [
  { id: 'fossil_sense', name: 'Fossil Sense', cost: 3, desc: 'Adds Fossil Sense to the upgrade pool.' },
  { id: 'spare_heart', name: 'Spare Heart', cost: 5, desc: 'Adds Spare Heart to the upgrade pool.' },
  { id: 'ash_coat', name: 'Ash Coat', cost: 6, desc: 'Adds Ash Coat to the upgrade pool.' },
  { id: 'tremor', name: 'Tremor Boots', cost: 6, desc: 'Adds Tremor Boots to the upgrade pool.' },
  { id: 'class_sapper', name: 'Sapper class', cost: 4, desc: 'Unlocks the Sapper: fast digger with a shorter hose.' },
  { id: 'class_brute', name: 'Brute class', cost: 6, desc: 'Unlocks the Brute: slow, starts with a Hard Hat, pops foes in 3 pumps.' },
  { id: 'wide_choice', name: 'Wide Satchel', cost: 10, desc: 'See 4 upgrade choices after each floor instead of 3.' },
];

const KEY = 'tunnel-pop-meta-v1';

export function defaultMeta() {
  return { fossils: 0, unlocked: [], perks: {}, bestFloor: 0, runs: 0, wins: 0, lastClass: 'digger', seen: [] };
}

export function loadMeta(storage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return defaultMeta();
    return { ...defaultMeta(), ...JSON.parse(raw) };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(storage, meta) {
  try {
    if (storage) storage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // Storage can be unavailable (private mode); progress just won't persist.
  }
}

export function perkLevel(meta, id) {
  return (meta.perks && meta.perks[id]) || 0;
}

// Cost of the next level, or null when maxed.
export function perkCost(meta, id) {
  const p = PERK_BY_ID[id];
  if (!p) return null;
  const level = perkLevel(meta, id);
  return level < p.costs.length ? p.costs[level] : null;
}

export function buyPerk(meta, id) {
  const cost = perkCost(meta, id);
  if (cost === null || meta.fossils < cost) return false;
  meta.fossils -= cost;
  meta.perks = { ...meta.perks, [id]: perkLevel(meta, id) + 1 };
  return true;
}

export function applyPerks(stats, perks = {}) {
  for (const [id, n] of Object.entries(perks)) {
    const p = PERK_BY_ID[id];
    if (p && p.apply && n > 0) p.apply(stats, n);
  }
  return stats;
}

export function perkHearts(perks = {}) {
  return PERKS.reduce((sum, p) => sum + (p.hearts ? p.hearts * (perks[p.id] || 0) : 0), 0);
}

export function buyUnlock(meta, id) {
  const u = UNLOCKS.find((x) => x.id === id);
  if (!u || meta.unlocked.includes(id) || meta.fossils < u.cost) return false;
  meta.fossils -= u.cost;
  meta.unlocked.push(id);
  return true;
}

export function recordRunEnd(meta, run, won) {
  meta.runs += 1;
  if (won) meta.wins += 1;
  meta.bestFloor = Math.max(meta.bestFloor, run.floor);
  meta.fossils += run.fossils;
}
