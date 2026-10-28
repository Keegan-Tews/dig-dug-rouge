// Gear: passive equipment found in a chest on each floor. Up to GEAR_SLOTS
// pieces are carried for the rest of the run and lost on death.

export const GEAR_SLOTS = 3;
export const FULL_CHEST_FOSSILS = 3;

export const GEAR = [
  {
    id: 'drill_bit', name: 'Drill Bit', icon: '🔩',
    desc: 'You dig through dirt at full walking speed.',
    apply: (s) => { s.digPenalty = 1; },
  },
  {
    id: 'wide_nozzle', name: 'Wide Nozzle', icon: '📯',
    desc: 'Your hose also catches foes one tile off to either side of its line.',
    apply: (s) => { s.wideNozzle = true; },
  },
  {
    id: 'pressure_valve', name: 'Pressure Valve', icon: '🔧',
    desc: 'Foes pop with one less pump.',
    apply: (s) => { s.popDiscount += 1; },
  },
  {
    id: 'fossil_compass', name: 'Fossil Compass', icon: '🧭',
    desc: 'Fossils, item caches and gear chests show up on the minimap.',
    apply: (s) => { s.compass = true; },
  },
];

export const GEAR_BY_ID = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export function applyGear(stats, gear = []) {
  for (const id of gear) GEAR_BY_ID[id]?.apply(stats);
  return stats;
}
