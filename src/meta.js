// Meta progression kept between runs. Unlocks widen options, never raw power.

export const UNLOCKS = [
  { id: 'fossil_sense', name: 'Fossil Sense', cost: 3, desc: 'Adds Fossil Sense to the upgrade pool.' },
  { id: 'spare_heart', name: 'Spare Heart', cost: 5, desc: 'Adds Spare Heart to the upgrade pool.' },
  { id: 'ash_coat', name: 'Ash Coat', cost: 6, desc: 'Adds Ash Coat to the upgrade pool.' },
  { id: 'tremor', name: 'Tremor Boots', cost: 6, desc: 'Adds Tremor Boots to the upgrade pool.' },
  { id: 'wide_choice', name: 'Wide Satchel', cost: 10, desc: 'See 4 upgrade choices after each floor instead of 3.' },
];

const KEY = 'tunnel-pop-meta-v1';

export function defaultMeta() {
  return { fossils: 0, unlocked: [], bestFloor: 0, runs: 0, wins: 0, lastClass: 'digger' };
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
