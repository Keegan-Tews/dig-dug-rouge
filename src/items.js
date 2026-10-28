// Usable items the player carries between floors (lost on death).

export const ITEMS = [
  { id: 'bomb', name: 'Bomb', icon: '💣', price: 15, desc: 'Drop it and run. Blasts dirt, rocks and foes nearby, and you too if you stay.' },
  { id: 'drill', name: 'Turbo Drill', icon: '🌀', price: 12, desc: 'For 5 seconds you move 50% faster and dig at full speed.' },
  { id: 'decoy', name: 'Squeaky Decoy', icon: '🧸', price: 12, desc: 'Foes chase the decoy instead of you for 6 seconds.' },
  { id: 'frost', name: 'Frost Flask', icon: '❄️', price: 18, desc: 'Freezes nearby foes solid for 4 seconds. Frozen foes are harmless.' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const BOMB_FUSE = 1.6;
export const BOMB_RADIUS = 1.6;
export const DRILL_TIME = 5;
export const DECOY_TIME = 6;
export const FROST_TIME = 4;
export const FROST_RANGE = 9;
