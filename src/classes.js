// Playable classes: different starting states for a run. Classes with an
// `unlock` id are bought with fossils in the Fossil Vault.

export const CLASSES = [
  {
    id: 'digger', name: 'Digger', icon: '⛏️',
    desc: 'All-rounder. No tricks, no weaknesses.',
    start: {},
    apply: () => {},
  },
  {
    id: 'sapper', name: 'Sapper', icon: '🥾', unlock: 'class_sapper',
    desc: 'Moves 15% faster and digs at full speed. Hose reaches 1 tile less.',
    start: {},
    apply: (s) => { s.speed *= 1.15; s.digPenalty = 1; s.hoseRange -= 1; },
  },
  {
    id: 'brute', name: 'Brute', icon: '🛡️', unlock: 'class_brute',
    desc: 'Moves 15% slower, but starts with a Hard Hat and pops foes in 3 pumps.',
    start: { hard_hat: 1 },
    apply: (s) => { s.speed *= 0.85; s.popDiscount += 1; },
  },
];

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

export function classUnlocked(cls, unlocked) {
  return !cls.unlock || unlocked.includes(cls.unlock);
}
