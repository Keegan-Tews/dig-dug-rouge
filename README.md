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
| Pause | P or Esc |
| Mute | M |
| Pick a card | 1 to 4 |

Touch devices get an on-screen d-pad and pump button.

## The run

- **20 floors in 3 acts:** Topsoil (1 to 7), Bedrock (8 to 14, with undiggable bedrock) and The Deep (15 to 20).
- **Bosses** on floors 7, 14 and 20: The Bloat, Cinder Mother and The Deep King. They take many pumps, spawn minions and (later) breathe fire.
- **One hit and you're out.** Every run starts with one heart. Extra hearts come from the Spare Heart upgrade and shop heals; Hard Hats block one hit per floor. Falling rocks always kill.
- **After every floor**, pick one of three upgrades. **Every 3rd floor** has the Mole Market shop.
- **Gold** is lost when you die. **Fossils** dug up in the deeper layers are banked between runs and spent in the **Fossil Vault**.
- **Classes:** Digger (all-rounder), Sapper (fast digger, shorter hose) and Brute (slow, starts with a Hard Hat, pops foes in 3 pumps).
- Every floor is generated from the run seed, so a run can be replayed.

### Foes

- **Pufflings** wander tunnels and, after a while, drift through dirt as ghostly eyes.
- **Scorchlings** do the same and also breathe fire sideways, through dirt.

## Code layout

| File | What it does |
| --- | --- |
| `src/game.js` | One floor of play (`FloorSim`). No DOM, driven by `update(dt, input)`. |
| `src/levelgen.js` | Seeded procedural floor layouts and difficulty curve. |
| `src/run.js` | Run state: floors, rewards, shop, death and victory. |
| `src/upgrades.js` / `src/classes.js` | Upgrade catalog, classes and stat derivation. |
| `src/meta.js` | Fossil Vault unlocks and the save kept between runs (localStorage). |
| `src/render.js` | Canvas renderer; all art is drawn in code. |
| `src/main.js` | Scenes, menus and the fixed-step game loop. |
| `src/input.js`, `src/audio.js` | Keyboard/touch input and synthesized sound effects. |

## Tests

```sh
npm test
```

Uses Node's built-in test runner (Node 20 or newer), with no dependencies. The tests cover level generation across every floor, the floor rules (digging, pumping, rocks, fire, shields, bosses), the run loop and meta progression, plus a random-input fuzz pass over all 20 floors.
