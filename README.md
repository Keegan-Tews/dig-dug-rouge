# Tunnel Pop

A roguelike digging game, rebuilt from the ground up and inspired by the 1982 arcade classic Dig Dug. Dig tunnels, pump foes until they pop, drop rocks on them, and see how deep one run can go.

All names, art and sound are original. Nothing from the original game is used.

## Play

No install or build step is needed. Any static file server works:

```sh
npm start          # serves the game at http://localhost:8080
```

Or open the folder with any other static server (`python3 -m http.server`, GitHub Pages, and so on). It needs to be served over HTTP because it uses ES modules.

### Controls

| Action | Keys |
| --- | --- |
| Move / dig | Arrow keys or WASD |
| Pump | Space, Z, J or X (hold to keep pumping) |
| Use item | E, K or C |
| Switch item | Q |
| Pause | P or Esc |
| Mute | M |
| Pick a card | 1 to 4 |

Touch devices get an on-screen d-pad plus pump, item and switch buttons.

## The run

- **20 floors in 3 acts:** Topsoil (1 to 7), then a choice of path for Act II (8 to 14), then The Deep (15 to 20).
- **The path splits** after the Act I boss. **Bedrock** has undiggable stone and more fire breathers. **Frozen Caverns** has ice that is slow to dig, icicles that drop on whatever walks beneath them (foes included), and Chillers. **Fungal Grotto** is pitch dark apart from glowing mushrooms (foes in the dark show only as glinting eyes), has spore vents whose clouds slow you down, and vine thickets that are quick to dig but grow back over your tunnels.
- **Scrolling maps** that grow each act (19x24, 23x30, then 27x36 tiles). The camera follows you and a minimap shows the whole floor.
- **Bosses** on floors 7, 14 and 20: The Bloat, Cinder Mother and The Deep King. They take many pumps, spawn minions and (later) breathe fire. Take the Frozen Caverns and the Act II boss is The Rime Queen, who breathes frost instead; in the Fungal Grotto it is Old Rootmaw, who leaves spore clouds behind.
- **One hit and you're out.** Every run starts with one heart. Extra hearts come from the Spare Heart upgrade and shop heals; Hard Hats block one hit per floor. Falling rocks always kill.
- **After every floor**, pick one of three upgrades. **Every 3rd floor** has the Mole Market shop.
- **Gold** is lost when you die. **Fossils** (one or two buried in the deeper half of every floor) are banked between runs and spent in the **Fossil Vault** on permanent stat upgrades (speed, gold, hose reach, deflate time, an extra per-floor shield, extra starting hearts), new classes and new upgrade-pool options.
- **Classes:** Digger (all-rounder), plus Sapper (fast digger, shorter hose) and Brute (slow, starts with a Hard Hat, pops foes in 3 pumps), which are unlocked in the vault.
- Every floor is generated from the run seed, so a run can be replayed.

### Items

You carry up to 2 usable items (Big Pack and the Deep Pockets perk add slots). Find them in buried 📦 caches (one or two per floor) or buy them in the shop. They carry between floors and are lost when you die. The Sapper starts with 2 bombs.

- 💣 **Bomb**: drop it and run. After a short fuse it blasts dirt, rocks and nearby foes (bosses take heavy damage), and you too if you're still close.
- 🌀 **Turbo Drill**: 5 seconds of 50% faster movement with full-speed digging.
- 🧸 **Squeaky Decoy**: foes chase the decoy instead of you for 6 seconds.
- ❄️ **Frost Flask**: freezes nearby foes for 4 seconds. Frozen foes are harmless and can be pumped.

### Gear

Each floor has a gear chest near the bottom. Gear works passively for the rest of the run, you carry up to 3 pieces, and it is lost when you die. A chest found with full slots gives 3 fossils instead.

- 🔩 **Drill Bit**: dig at full walking speed.
- 📯 **Wide Nozzle**: the hose also catches foes one tile off its line.
- 🔧 **Pressure Valve**: foes pop with one less pump.
- 🧭 **Fossil Compass**: fossils, caches and chests show on the minimap.

The first time you ever get each item or piece of gear, the game pauses with a short card explaining how it works. Each card is shown once, and that is remembered between runs.

### Foes

- **Pufflings** wander tunnels and, after a while, drift through dirt as ghostly eyes.
- **Scorchlings** do the same and also breathe fire sideways, through dirt. Fire melts ice.
- **Gnawlers** (from floor 4) never ghost; they chew real tunnels straight toward you, which can bring rocks down.
- **Splitters** (from floor 8) pop in 3 pumps but burst into two fast little **Minis**.
- **Chillers** (Frozen Caverns only) replace Scorchlings. Their frost breath doesn't hurt, but it freezes you in place for a moment and cuts your hose.
- **Sporelings** (Fungal Grotto only) replace Scorchlings. Every few seconds they leave a spore cloud where they stand.
- **Shellbacks** (from floor 12) have an armour plate on the side they face. A hose that hits them head-on just clangs off, so get behind or beside them, or drop a rock.

## Code layout

| File | What it does |
| --- | --- |
| `src/game.js` | One floor of play (`FloorSim`). No DOM, driven by `update(dt, input)`. |
| `src/levelgen.js` | Seeded procedural floor layouts and difficulty curve. |
| `src/run.js` | Run state: floors, rewards, shop, death and victory. |
| `src/upgrades.js` / `src/classes.js` | Upgrade catalog, classes and stat derivation. |
| `src/items.js` / `src/gear.js` | Usable item and gear catalogs and tuning. |
| `src/meta.js` | Fossil Vault perks and unlocks, and the save kept between runs (localStorage). |
| `src/render.js` | Canvas renderer; all art is drawn in code. |
| `src/main.js` | Scenes, menus and the fixed-step game loop. |
| `src/input.js`, `src/audio.js` | Keyboard/touch input and synthesized sound effects. |

## Tests

```sh
npm test
```

Uses Node's built-in test runner (Node 20 or newer), with no dependencies. The tests cover level generation across every floor, the floor rules (digging, pumping, rocks, fire, shields, bosses), the run loop and meta progression, plus a random-input fuzz pass over all 20 floors.
