// Entry point: scenes, the fixed-step loop, and menu overlays.

import { actFor, TOTAL_FLOORS } from './constants.js';
import { randomSeed } from './rng.js';
import { generateFloor } from './levelgen.js';
import { FloorSim } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { UPGRADE_BY_ID } from './upgrades.js';
import { ITEM_BY_ID } from './items.js';
import { GEAR_BY_ID, GEAR_SLOTS } from './gear.js';
import { CLASSES, CLASS_BY_ID, classUnlocked } from './classes.js';
import {
  UNLOCKS, PERKS, loadMeta, saveMeta, buyUnlock, buyPerk, perkLevel, perkCost, recordRunEnd,
} from './meta.js';
import {
  newRun, runStats, floorSeed, screensAfterFloor, rewardChoices, applyUpgrade,
  shopStock, buyShopItem, completeFloor, advanceFloor, failRun, winRun, rngFor,
  isBossFloor, REROLL_PRICE, MAX_HEARTS,
} from './run.js';

const STEP = 1 / 120;
const BOSS_NAMES = ['', 'The Bloat', 'Cinder Mother', 'The Deep King'];

const canvas = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const renderer = new Renderer(canvas);
const input = new Input(window);
const sfx = new Sfx();
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

const state = {
  meta: loadMeta(storage),
  run: null,
  sim: null,
  scene: 'title',
  paused: false,
  banner: null,
  queue: [],
  lastBonus: 0,
  shop: null,
  rerolls: 0,
  tips: [],
  tip: null,
};

// Exposed for automated smoke tests and debugging from the console.
window.__game = state;

function el(html) {
  overlay.innerHTML = html;
  overlay.hidden = false;
  const first = overlay.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}

function hideOverlay() {
  overlay.hidden = true;
  overlay.innerHTML = '';
}

// ---- scenes ----

function showTitle() {
  state.scene = 'title';
  const m = state.meta;
  el(`
    <div class="panel title">
      <h1>TUNNEL<br/>POP</h1>
      <p class="tag">Dig. Pump. Pop. Don't die.</p>
      <p class="small">20 floors &middot; 3 bosses &middot; one hit</p>
      <div class="buttons">
        <button data-action="start">Start run</button>
        <button data-action="vault">Fossil Vault (${m.fossils} 🦴)</button>
        <button data-action="help">How to play</button>
      </div>
      <p class="small dim">Best floor: ${m.bestFloor || '-'} &middot; Runs: ${m.runs} &middot; Wins: ${m.wins}</p>
    </div>`);
}

function showHelp() {
  state.scene = 'help';
  el(`
    <div class="panel">
      <h2>How to play</h2>
      <ul class="help">
        <li><b>Move / dig:</b> arrow keys or WASD</li>
        <li><b>Pump:</b> Space (or Z). Hit a foe with the hose, then keep pumping (or hold) until it pops.</li>
        <li><b>Items:</b> E uses the selected item, Q switches between them. Find them in buried 📦 caches or buy them in the shop: 💣 Bomb, 🌀 Turbo Drill, 🧸 Squeaky Decoy and ❄️ Frost Flask.</li>
        <li><b>Rocks:</b> dig under one and step away. It falls and crushes anything below, including you.</li>
        <li><b>Pufflings</b> wander tunnels and drift through dirt as ghostly eyes. <b>Scorchlings</b> also breathe fire sideways.</li>
        <li>Deeper down: <b>Gnawlers</b> chew tunnels toward you, <b>Splitters</b> burst into two Minis, and <b>Shellbacks</b> can only be pumped from behind or the side.</li>
        <li>Clear every foe to finish a floor. Pick an upgrade after each one; every 3rd floor has a shop.</li>
        <li>Gold is lost when you die. <b>Fossils</b> you dig up are kept and unlock new upgrades in the Fossil Vault.</li>
        <li><b>P / Esc</b> pause &middot; <b>M</b> mute</li>
      </ul>
      <div class="buttons"><button data-action="title">Back</button></div>
    </div>`);
}

function showVault() {
  state.scene = 'vault';
  const m = state.meta;
  const scroll = overlay.querySelector('.panel')?.scrollTop || 0;
  const perks = PERKS.map((p) => {
    const level = perkLevel(m, p.id);
    const cost = perkCost(m, p.id);
    const maxed = cost === null;
    return `
      <div class="card ${maxed ? 'owned' : ''}">
        <div class="card-head"><b>${p.icon} ${p.name}</b><span>${level}/${p.costs.length}</span></div>
        <p>${p.desc}</p>
        ${maxed ? '' : `<button data-action="perk" data-id="${p.id}" ${m.fossils >= cost ? '' : 'disabled'}>Buy ${cost} 🦴</button>`}
      </div>`;
  }).join('');
  const unlocks = UNLOCKS.slice().sort((a, b) => a.cost - b.cost).map((u) => {
    const owned = m.unlocked.includes(u.id);
    const afford = m.fossils >= u.cost;
    return `
      <div class="card ${owned ? 'owned' : ''}">
        <div class="card-head"><b>${u.name}</b><span>${owned ? 'Unlocked' : `${u.cost} 🦴`}</span></div>
        <p>${u.desc}</p>
        ${owned ? '' : `<button data-action="unlock" data-id="${u.id}" ${afford ? '' : 'disabled'}>Unlock</button>`}
      </div>`;
  }).join('');
  el(`
    <div class="panel">
      <h2>Fossil Vault</h2>
      <p class="small">You have <b>${m.fossils} 🦴</b>. Everything here is permanent and carries into every future run.</p>
      <h3>Permanent upgrades</h3>
      <div class="cards">${perks}</div>
      <h3>Unlocks</h3>
      <div class="cards">${unlocks}</div>
      <div class="buttons"><button data-action="title">Back</button></div>
    </div>`);
  overlay.querySelector('.panel').scrollTop = scroll;
}

function showClasses() {
  state.scene = 'classes';
  const m = state.meta;
  const cards = CLASSES.map((c, i) => {
    const open = classUnlocked(c, m.unlocked);
    const cost = UNLOCKS.find((u) => u.id === c.unlock)?.cost;
    return `
      <button class="card pick ${open ? '' : 'owned'}" data-action="choose" data-id="${c.id}" ${open ? '' : 'disabled'}>
        <span class="key">${i + 1}</span>
        <div class="card-head"><b>${c.icon} ${c.name}</b><span>${open ? (m.lastClass === c.id ? 'Last used' : '') : `Vault: ${cost} 🦴`}</span></div>
        <p>${c.desc}</p>
      </button>`;
  }).join('');
  el(`
    <div class="panel">
      <h2>Choose your digger</h2>
      <div class="cards">${cards}</div>
      <div class="buttons"><button data-action="title" class="ghost">Back</button></div>
    </div>`);
  overlay.querySelector(`[data-id="${m.lastClass}"]:not([disabled])`)?.focus({ preventScroll: true });
}

function startRun(classId) {
  sfx.unlock();
  state.meta.lastClass = classId;
  saveMeta(storage, state.meta);
  state.run = newRun(randomSeed(), state.meta, classId);
  state.tips = [];
  startFloor();
}

function startFloor() {
  const run = state.run;
  const stats = runStats(run);
  const layout = generateFloor(run.floor, floorSeed(run), { fossilLuck: stats.fossilLuck });
  state.sim = new FloorSim(layout, stats, { hearts: run.hearts, items: run.items, gear: run.gear });
  // Explain anything carried in (starting items, shop buys) that is new to this player.
  for (const id of run.items) queueTip('item', id);
  for (const id of run.gear) queueTip('gear', id);
  renderer.updateCamera(state.sim, 0, true);
  renderer.popups = [];
  renderer.particles = [];
  const act = actFor(run.floor);
  const boss = isBossFloor(run.floor);
  state.banner = {
    title: boss ? BOSS_NAMES[layout.boss] : `FLOOR ${run.floor}`,
    sub: boss ? `Boss of Act ${act.num}` : `Act ${act.num}: ${act.name}`,
    color: boss ? '#ef5350' : '#ffd54f',
    t: 1.6,
  };
  state.scene = 'play';
  state.paused = false;
  input.reset();
  hideOverlay();
}

function floorCleared() {
  const run = state.run;
  state.lastBonus = completeFloor(run, state.sim);
  state.queue = screensAfterFloor(run.floor);
  nextScreen();
}

function nextScreen() {
  const next = state.queue.shift();
  if (next === 'reward') return showReward();
  if (next === 'shop') return showShop();
  if (next === 'victory') return showEnd(true);
  advanceFloor(state.run);
  startFloor();
}

function upgradeCard(id, extra = '') {
  const u = UPGRADE_BY_ID[id];
  const have = state.run.upgrades[id] || 0;
  return `
    <div class="card-head"><b>${u.icon} ${u.name}</b><span>${have}/${u.max}</span></div>
    <p>${u.desc}</p>${extra}`;
}

function showReward() {
  state.scene = 'reward';
  const run = state.run;
  const choices = rewardChoices(run, rngFor(run, 'reward'));
  state.choices = choices;
  const cards = choices
    .map((id, i) => `<button class="card pick" data-action="pick" data-id="${id}"><span class="key">${i + 1}</span>${upgradeCard(id)}</button>`)
    .join('');
  el(`
    <div class="panel">
      <h2>Floor ${run.floor} cleared!</h2>
      <p class="small">Clear bonus +${state.lastBonus}g &middot; Gold ${run.gold}g &middot; Hearts ${'❤️'.repeat(run.hearts)}</p>
      <p>Choose an upgrade:</p>
      <div class="cards">${cards || '<p class="dim">Nothing left to learn. You are complete.</p>'}</div>
      <div class="buttons"><button data-action="skip" class="ghost">Skip</button></div>
    </div>`);
}

function showShop(fresh = true) {
  state.scene = 'shop';
  const run = state.run;
  if (fresh) {
    state.shop = shopStock(run, rngFor(run, 'shop'));
    state.rerolls = 0;
  }
  const items = state.shop
    .map((it, i) => {
      const slots = runStats(run).itemSlots;
      const full = (it.kind === 'heal' && run.hearts >= MAX_HEARTS) || (it.kind === 'item' && run.items.length >= slots);
      const can = !it.sold && run.gold >= it.price && !full;
      let body;
      if (it.kind === 'heal') {
        body = `<div class="card-head"><b>❤️ Patch Up</b><span>${run.hearts}/${MAX_HEARTS}</span></div><p>Gain one heart.</p>`;
      } else if (it.kind === 'item') {
        const item = ITEM_BY_ID[it.id];
        body = `<div class="card-head"><b>${item.icon} ${item.name}</b><span>Pack ${run.items.length}/${slots}</span></div><p>${item.desc}</p>`;
      } else {
        body = upgradeCard(it.id);
      }
      return `<div class="card ${it.sold ? 'owned' : ''}">${body}
        <button data-action="buy" data-index="${i}" ${can ? '' : 'disabled'}>${it.sold ? 'Sold' : `Buy ${it.price}g`}</button></div>`;
    })
    .join('');
  el(`
    <div class="panel">
      <h2>Mole Market</h2>
      <p class="small">You have <b>${run.gold}g</b>. Gold is lost if you die, so spend it.</p>
      <p class="small dim">Pack: ${packText(run)}</p>
      <div class="cards">${items}</div>
      <div class="buttons">
        <button data-action="reroll" ${run.gold >= REROLL_PRICE ? '' : 'disabled'}>Reroll (${REROLL_PRICE}g)</button>
        <button data-action="continue">Descend</button>
      </div>
    </div>`);
}

function packText(run) {
  return run.items.map((id) => `${ITEM_BY_ID[id].icon} ${ITEM_BY_ID[id].name}`).join(', ') || 'empty';
}

function showEnd(won) {
  const run = state.run;
  if (won) winRun(run);
  else failRun(run, state.sim);
  recordRunEnd(state.meta, run, won);
  saveMeta(storage, state.meta);
  state.scene = won ? 'victory' : 'gameover';
  const ups = Object.entries(run.upgrades)
    .map(([id, n]) => `${UPGRADE_BY_ID[id].icon} ${UPGRADE_BY_ID[id].name}${n > 1 ? ` x${n}` : ''}`)
    .join(', ') || 'none';
  el(`
    <div class="panel">
      <h2 class="${won ? 'win' : 'lose'}">${won ? 'You reached the core!' : 'Run over'}</h2>
      <p class="small dim">${CLASS_BY_ID[run.classId].icon} ${CLASS_BY_ID[run.classId].name}</p>
      <p>${won ? `All ${TOTAL_FLOORS} floors cleared.` : `Fell on floor ${run.floor} of ${TOTAL_FLOORS}.`}</p>
      <ul class="help">
        <li>Foes popped or crushed: <b>${run.kills}</b></li>
        <li>Gold earned: <b>${run.goldEarned}g</b>${won ? '' : ' (lost)'}</li>
        <li>Fossils banked: <b>${run.fossils} 🦴</b> (vault total ${state.meta.fossils})</li>
        <li>Upgrades: ${ups}</li>
      </ul>
      <div class="buttons">
        <button data-action="start">New run</button>
        <button data-action="vault">Fossil Vault</button>
        <button data-action="title">Title</button>
      </div>
    </div>`);
}

function showPause() {
  state.paused = true;
  el(`
    <div class="panel">
      <h2>Paused</h2>
      <div class="buttons">
        <button data-action="resume">Resume</button>
        <button data-action="abandon" class="ghost">Abandon run</button>
      </div>
    </div>`);
}

// ---- first-time tips ----

function queueTip(kind, id) {
  const key = `${kind}:${id}`;
  if (state.meta.seen.includes(key) || state.tips.includes(key)) return;
  state.tips.push(key);
}

function showTip() {
  const key = state.tips.shift();
  const [kind, id] = key.split(':');
  const def = kind === 'item' ? ITEM_BY_ID[id] : GEAR_BY_ID[id];
  state.paused = true;
  state.tip = key;
  const how = kind === 'item'
    ? 'It goes in your pack (bottom left). Press <b>E</b> to use the selected item and <b>Q</b> to switch items. On touch screens, use the ITEM and ⟳ buttons.'
    : `Gear works on its own for the rest of the run. You can carry up to ${GEAR_SLOTS} pieces (bottom right). A chest found with full gear slots gives fossils instead.`;
  el(`
    <div class="panel tip">
      <p class="small dim">${kind === 'item' ? 'New item' : 'New gear'}</p>
      <div class="tip-icon">${def.icon}</div>
      <h2>${def.name}</h2>
      <p>${def.desc}</p>
      <p class="small">${how}</p>
      <div class="buttons"><button data-action="tipdone">Got it</button></div>
    </div>`);
}

function resume() {
  state.paused = false;
  input.reset();
  hideOverlay();
}

// ---- actions ----

const actions = {
  start: showClasses,
  choose: (b) => startRun(b.dataset.id),
  title: showTitle,
  help: showHelp,
  vault: showVault,
  resume,
  tipdone: () => {
    if (state.tip && !state.meta.seen.includes(state.tip)) {
      state.meta.seen.push(state.tip);
      saveMeta(storage, state.meta);
    }
    state.tip = null;
    if (state.tips.length) showTip();
    else resume();
  },
  abandon: () => {
    state.paused = false;
    showEnd(false);
  },
  perk: (b) => {
    if (buyPerk(state.meta, b.dataset.id)) {
      saveMeta(storage, state.meta);
      sfx.play('buy');
    }
    showVault();
  },
  unlock: (b) => {
    if (buyUnlock(state.meta, b.dataset.id)) {
      saveMeta(storage, state.meta);
      sfx.play('buy');
    }
    showVault();
  },
  pick: (b) => {
    applyUpgrade(state.run, b.dataset.id);
    sfx.play('select');
    nextScreen();
  },
  skip: () => nextScreen(),
  buy: (b) => {
    if (buyShopItem(state.run, state.shop[Number(b.dataset.index)])) sfx.play('buy');
    showShop(false);
  },
  reroll: () => {
    const run = state.run;
    if (run.gold < REROLL_PRICE) return;
    run.gold -= REROLL_PRICE;
    state.rerolls += 1;
    state.shop = shopStock(run, rngFor(run, 'shop', state.rerolls));
    showShop(false);
  },
  continue: () => nextScreen(),
};

overlay.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  sfx.unlock();
  actions[b.dataset.action]?.(b);
});

input.onPress((code) => {
  if (code === 'KeyM') {
    sfx.muted = !sfx.muted;
    return;
  }
  if (state.tip && code === 'Escape') {
    actions.tipdone();
    return;
  }
  if (state.scene === 'play' && (code === 'Escape' || code === 'KeyP')) {
    if (state.paused) resume();
    else showPause();
    return;
  }
  if (state.scene === 'reward' && /^Digit[1-4]$/.test(code)) {
    const id = state.choices?.[Number(code.slice(5)) - 1];
    if (id) actions.pick({ dataset: { id } });
  }
  if (state.scene === 'classes' && /^Digit[1-4]$/.test(code)) {
    const c = CLASSES[Number(code.slice(5)) - 1];
    if (c && classUnlocked(c, state.meta.unlocked)) startRun(c.id);
  }
  if (state.scene === 'title' && code === 'Enter') showClasses();
});

// ---- loop ----

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.scene === 'play' && state.sim && !state.paused) {
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    } else {
      acc += dt;
      while (acc >= STEP) {
        state.sim.update(STEP, input.sample());
        const events = state.sim.drainEvents();
        renderer.handleEvents(events);
        for (const ev of events) {
          sfx.play(ev.type);
          if (ev.type === 'item') queueTip('item', ev.item);
          if (ev.type === 'gear') queueTip('gear', ev.gear);
        }
        acc -= STEP;
        if (state.tips.length) break;
      }
      if (state.tips.length) showTip();
    }
    renderer.step(dt);
    renderer.updateCamera(state.sim, dt);
    if (state.sim.status === 'cleared') floorCleared();
    else if (state.sim.status === 'dead') showEnd(false);
  } else {
    acc = 0;
  }
  if (state.sim && state.run) renderer.draw(state.sim, state.run, { banner: state.banner });
  requestAnimationFrame(frame);
}

const touch = document.getElementById('touch');
if (touch) input.bindTouch(touch);

// A quiet backdrop floor behind the title menu.
state.sim = new FloorSim(generateFloor(1, 20261023), runStats(newRun(0)), { hearts: 1 });
state.run = newRun(0);
renderer.updateCamera(state.sim, 0, true);
showTitle();
requestAnimationFrame(frame);
