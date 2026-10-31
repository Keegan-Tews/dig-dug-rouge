// One floor of play. No DOM access: driven by update(dt, input) so it can be
// tested headlessly and rendered by render.js.

import { T_OPEN, T_DIRT, T_BEDROCK, T_ICE, T_VINE, T_LAVA, DIRS, OPPOSITE, layerFor } from './constants.js';
import { Rng } from './rng.js';
import { GEAR, GEAR_BY_ID, GEAR_SLOTS, FULL_CHEST_FOSSILS } from './gear.js';
import { BOMB_FUSE, BOMB_RADIUS, DRILL_TIME, DECOY_TIME, FROST_TIME, FROST_RANGE } from './items.js';

const POP_AT = { puff: 4, scorch: 4, chiller: 4, sporeling: 4, magmite: 4, gnawler: 4, splitter: 3, mini: 2, shellback: 4 };
const ICE_DIG = 0.4; // speed multiplier while digging ice
const ICICLE_FALL = 10;
const ICICLE_SIGHT = 7; // how far below an icicle the player can be to set it off
const CHILL_TIME = 1.5; // seconds frozen by frost breath
const SPORE_SLOW = 0.5; // speed multiplier inside a spore cloud
const VENT_PUFF = 2.5; // how long a vent's cloud hangs around
const VINE_REGROW = 6; // seconds an empty vine tunnel takes to close up
const LAVA_SPREAD = [4, 7]; // seconds between each pool creeping one tile
const LAVA_REACH = 5; // tiles each pool can creep
const SEEP_TIME = 1.2; // warning glow before lava fills a tile
const STEAM_WARN = 0.9;
const STEAM_BLAST = 1.1;
const STEAM_HEIGHT = 3; // tiles the blast rises through open tunnel
const EMBER_TIME = 2.2; // how long a Magmite's burning trail lasts
const SPEED_MULT = { mini: 1.3, shellback: 0.8, gnawler: 0.9 };
const BOSS_POP_AT = [0, 10, 14, 18];
const HOSE_EXTEND = 16; // tiles per second
const HOSE_RETRACT = 24;
const ROCK_FALL = 7;
const TOUCH = 0.6;
const GHOST_RANGE = 14;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export class FloorSim {
  constructor(layout, stats, opts = {}) {
    this.layout = layout;
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.grid = Uint8Array.from(layout.grid);
    this.stats = stats;
    this.diff = layout.difficulty;
    this.zone = layout.zone || 'topsoil';
    this.rng = new Rng(layout.seed ^ 0xa5a5a5a5);

    this.player = {
      x: layout.start.x, y: layout.start.y,
      tx: layout.start.x, ty: layout.start.y,
      dir: 'right', face: 'right',
      moving: false, walking: false, digging: false,
      hearts: opts.hearts ?? 1,
      shield: stats.shield || 0,
      invuln: 0,
      chilled: 0, // frozen in place by frost breath
      alive: true,
    };
    this.hose = null;
    this.enemies = layout.enemies.map((e, i) => this.makeEnemy(e, i));
    this.rocks = layout.rocks.map((r) => ({ x: r.x, y: r.y, fy: r.y, state: 'idle', timer: 0, kills: 0 }));
    this.icicles = (layout.icicles || []).map((i) => ({ x: i.x, y: i.y, fy: i.y, state: 'idle', timer: 0 }));
    this.vents = (layout.vents || []).map((v) => ({ x: v.x, y: v.y, timer: this.rng.float(1, 4), on: 0 }));
    this.glows = layout.glows || [];
    this.clouds = [];
    // Tiles that started as vines grow back once left alone.
    this.vineHome = [];
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] === T_VINE) this.vineHome.push(i);
    this.vineTimers = new Map();
    this.pools = (layout.lava || []).map((l) => ({ tiles: [{ x: l.x, y: l.y }], left: LAVA_REACH, timer: this.rng.float(...LAVA_SPREAD) }));
    this.seeps = [];
    this.steam = (layout.steam || []).map((s) => ({ x: s.x, y: s.y, state: 'idle', timer: this.rng.float(2, 5) }));
    this.embers = [];
    this.items = layout.items.map((it) => ({ ...it, taken: false }));

    // Usable items carried in the pack, and their effects in play.
    this.slots = stats.itemSlots ?? 2;
    this.pack = (opts.items || []).slice(0, this.slots);
    this.selected = 0;
    this.gear = (opts.gear || []).slice();
    this.bombs = [];
    this.decoy = null;
    this.drillTime = 0;

    this.time = 0;
    this.freeze = stats.tremor || 0;
    this.status = 'playing'; // playing | clearing | cleared | dying | dead
    this.statusTimer = 0;
    this.gold = 0;
    this.fossils = 0;
    this.kills = 0;
    this.events = [];
    this.nextId = this.enemies.length;
  }

  makeEnemy(e, id) {
    const boss = e.kind === 'boss';
    const level = e.level || 0;
    return {
      id,
      kind: e.kind,
      level,
      x: e.x, y: e.y, tx: e.x, ty: e.y,
      dir: this.rng.pick(['left', 'right', 'up', 'down']),
      face: this.rng.chance(0.5) ? 'left' : 'right',
      moving: false,
      state: e.state || 'walk',
      ghostTime: e.ghostTime || 0,
      // Gnawlers never ghost: they chew real tunnels instead.
      ghostTimer: e.kind === 'gnawler' ? Infinity : this.ghostDelay() * (boss ? 0.7 : 1),
      inflation: 0,
      popAt: boss ? BOSS_POP_AT[level] : POP_AT[e.kind],
      deflateTimer: 0,
      timer: 0,
      fireCooldown: this.rng.float(2, 4),
      fireLen: 0,
      spawnTimer: 6,
      speed: this.diff.enemySpeed * (boss ? 0.75 : SPEED_MULT[e.kind] || 1),
      radius: boss ? 0.85 : e.kind === 'mini' ? 0.45 : TOUCH,
      digging: false,
      // Chillers and the Frozen Caverns boss breathe frost instead of fire.
      frost: e.kind === 'chiller' || (boss && this.zone === 'frozen'),
      // Sporelings and the Fungal Grotto boss leave spore clouds instead.
      spores: e.kind === 'sporeling' || (boss && this.zone === 'fungal'),
      sporeTimer: this.rng.float(2, 5),
      // Magmites and the Magma Layer boss leave burning trails.
      trail: e.kind === 'magmite' || (boss && this.zone === 'magma'),
    };
  }

  ghostDelay() {
    const [a, b] = this.diff.ghostDelay;
    return this.rng.float(a, b);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- grid helpers ----

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  tile(x, y) {
    return this.grid[y * this.cols + x];
  }

  rockAt(x, y) {
    return this.rocks.find((r) => r.x === x && (r.state === 'idle' || r.state === 'wobble') && r.y === y);
  }

  isOpen(x, y) {
    return this.inBounds(x, y) && this.tile(x, y) === T_OPEN && !this.rockAt(x, y);
  }

  canDig(x, y) {
    return this.inBounds(x, y) && this.tile(x, y) !== T_BEDROCK && this.tile(x, y) !== T_LAVA && !this.rockAt(x, y);
  }

  // ---- main update ----

  update(dt, input = {}) {
    this.time += dt;
    if (this.status === 'dying' || this.status === 'clearing') {
      this.statusTimer -= dt;
      this.updateRocks(dt);
      this.updateIcicles(dt);
      this.updateCorpses(dt);
      if (this.statusTimer <= 0) this.status = this.status === 'dying' ? 'dead' : 'cleared';
      return;
    }
    if (this.status !== 'playing') return;

    if (this.freeze > 0) this.freeze -= dt;
    if (this.player.invuln > 0) this.player.invuln -= dt;

    this.updatePlayer(dt, input);
    this.updateItems(dt, input);
    this.updateHose(dt, input);
    this.updateRocks(dt);
    this.updateIcicles(dt);
    this.updateSpores(dt);
    this.updateVines(dt);
    this.updateMagma(dt);
    this.updateEnemies(dt);
    this.updateCorpses(dt);
    this.checkContacts();

    if (this.status === 'playing' && this.enemies.length === 0) {
      this.status = 'clearing';
      this.statusTimer = 1.2;
      this.emit('cleared');
    }
  }

  // ---- player ----

  updatePlayer(dt, input) {
    const p = this.player;
    p.walking = false;
    if (p.chilled > 0) {
      p.chilled -= dt;
      this.hose = null;
      return;
    }
    if (this.hose && this.hose.state !== 'retract') {
      if (input.dir && this.hose.state === 'attached') this.hose = null;
      else return; // standing still while the hose is out
    }
    const want = input.dir || null;

    if (!p.moving) {
      if (want) this.tryStep(want);
      return;
    }

    if (want === OPPOSITE[p.dir]) {
      const [dx, dy] = DIRS[p.dir];
      p.tx -= dx;
      p.ty -= dy;
      p.dir = want;
      if (want === 'left' || want === 'right') p.face = want;
    }
    // No input: stand still mid-tile. Perpendicular input: carry on to the
    // tile centre, then turn.
    if (!want) return;

    p.walking = true;
    const drill = this.drillTime > 0;
    // Vines are soft: no digging slowdown.
    const digMult = p.digging && p.digging !== 'vine' && !drill ? this.stats.digPenalty * (p.digging === 'ice' ? ICE_DIG : 1) : 1;
    const slow = this.inSpores(p.x, p.y) ? SPORE_SLOW : 1;
    const speed = this.stats.speed * (drill ? 1.5 : 1) * digMult * slow;
    const remaining = Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y);
    const step = speed * dt;
    if (step >= remaining) {
      p.x = p.tx;
      p.y = p.ty;
      p.moving = false;
      p.digging = false;
      this.collectAt(p.x, p.y);
      this.tryStep(want);
    } else {
      const [dx, dy] = DIRS[p.dir];
      p.x += dx * step;
      p.y += dy * step;
    }
  }

  tryStep(dir) {
    const p = this.player;
    if (dir === 'left' || dir === 'right') p.face = dir;
    p.dir = dir;
    const [dx, dy] = DIRS[dir];
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!this.canDig(nx, ny)) return false;
    const t = this.tile(nx, ny);
    p.digging = t === T_DIRT ? 'dirt' : t === T_ICE ? 'ice' : t === T_VINE ? 'vine' : false;
    if (p.digging) {
      this.grid[ny * this.cols + nx] = T_OPEN;
      this.emit('dig', { x: nx, y: ny });
    }
    p.tx = nx;
    p.ty = ny;
    p.moving = true;
    return true;
  }

  collectAt(x, y) {
    for (const it of this.items) {
      if (it.taken || it.x !== x || it.y !== y) continue;
      it.taken = true;
      if (it.kind === 'gold') {
        const g = Math.round(it.value * this.stats.goldMult);
        this.gold += g;
        this.emit('gold', { x, y, amount: g });
      } else if (it.kind === 'chest') {
        const options = GEAR.filter((g) => !this.gear.includes(g.id));
        if (this.gear.length < GEAR_SLOTS && options.length) {
          const g = this.rng.pick(options);
          this.gear.push(g.id);
          // Stats are this floor's own copy, so the gear works right away.
          GEAR_BY_ID[g.id].apply(this.stats);
          this.emit('gear', { x, y, gear: g.id });
        } else {
          this.fossils += FULL_CHEST_FOSSILS;
          this.emit('fossil', { x, y, amount: FULL_CHEST_FOSSILS });
        }
      } else if (it.kind === 'cache') {
        if (this.pack.length < this.slots) {
          this.pack.push(it.item);
          this.emit('item', { x, y, item: it.item });
        } else {
          // Pack full: the cache is sold for scrap.
          const g = Math.round(5 * this.stats.goldMult);
          this.gold += g;
          this.emit('gold', { x, y, amount: g });
        }
      } else {
        this.fossils += it.value;
        this.emit('fossil', { x, y });
      }
    }
  }

  // ---- items ----

  updateItems(dt, input) {
    if (input.cyclePressed && this.pack.length > 1) {
      this.selected = (this.selected + 1) % this.pack.length;
      this.emit('cycle');
    }
    if (this.selected >= this.pack.length) this.selected = 0;
    if (input.usePressed && this.pack.length && this.player.alive) {
      const [id] = this.pack.splice(this.selected, 1);
      this.useItem(id);
      if (this.selected >= this.pack.length) this.selected = 0;
    }

    if (this.drillTime > 0) this.drillTime -= dt;
    if (this.decoy) {
      this.decoy.time -= dt;
      if (this.decoy.time <= 0) this.decoy = null;
    }
    for (const b of this.bombs) {
      b.fuse -= dt;
      if (b.fuse <= 0) this.explode(b);
    }
    this.bombs = this.bombs.filter((b) => b.fuse > 0);
  }

  useItem(id) {
    const p = this.player;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (id === 'bomb') this.bombs.push({ x, y, fuse: BOMB_FUSE });
    else if (id === 'drill') this.drillTime = DRILL_TIME;
    else if (id === 'decoy') this.decoy = { x, y, time: DECOY_TIME };
    else if (id === 'frost') {
      for (const e of this.enemies) {
        if (e.state === 'popped' || e.state === 'crushed' || dist(e.x, e.y, p.x, p.y) > FROST_RANGE) continue;
        e.frozen = FROST_TIME;
        if (e.state === 'fire' || e.state === 'charge') {
          e.state = 'walk';
          e.fireLen = 0;
        }
      }
    }
    this.emit('use', { item: id, x, y });
  }

  explode(b) {
    const r = Math.ceil(BOMB_RADIUS);
    for (let y = b.y - r; y <= b.y + r; y++) {
      for (let x = b.x - r; x <= b.x + r; x++) {
        if (y < 1 || !this.inBounds(x, y) || dist(x, y, b.x, b.y) > BOMB_RADIUS) continue;
        const t = this.tile(x, y);
        if (t === T_DIRT || t === T_ICE || t === T_VINE) this.grid[y * this.cols + x] = T_OPEN;
        const rock = this.rockAt(x, y);
        if (rock) {
          rock.state = 'breaking';
          rock.timer = 0.4;
        }
      }
    }
    for (const e of this.enemies) {
      if (e.state === 'popped' || e.state === 'crushed') continue;
      if (dist(e.x, e.y, b.x, b.y) > BOMB_RADIUS + (e.kind === 'boss' ? 0.5 : 0)) continue;
      if (e.kind === 'boss') {
        // Bosses take a big chunk of inflation instead of dying outright.
        e.state = 'inflated';
        e.prevState = 'ghost';
        e.inflation += 4;
        e.deflateTimer = this.stats.deflateDelay * 1.5;
        if (e.inflation >= this.popThreshold(e)) this.pop(e);
      } else {
        e.inflation = e.popAt;
        this.pop(e, { noSplit: true });
      }
    }
    const p = this.player;
    if (p.alive && dist(p.x, p.y, b.x, b.y) <= BOMB_RADIUS) this.hurtPlayer('bomb');
    this.emit('boom', { x: b.x, y: b.y });
  }

  // Where foes are drawn to: a live decoy, else the player.
  target() {
    return this.decoy || this.player;
  }

  hurtPlayer(cause) {
    const p = this.player;
    if (!p.alive || p.invuln > 0) return;
    if (p.shield > 0 && cause !== 'rock') {
      p.shield -= 1;
      p.invuln = 1.5;
      this.hose = null;
      this.emit('shield', { cause });
      return;
    }
    if (p.hearts > 1) {
      p.hearts -= 1;
      p.invuln = 2;
      this.hose = null;
      this.emit('hurt', { cause });
      return;
    }
    p.hearts = 0;
    p.alive = false;
    this.hose = null;
    this.status = 'dying';
    this.statusTimer = 1.6;
    this.emit('death', { cause });
  }

  // ---- hose / pump ----

  updateHose(dt, input) {
    const p = this.player;
    if (!this.hose) {
      if (input.pumpPressed) {
        // Fire from the nearest tile centre so the hose lines up with tunnels.
        const dir = p.moving && (p.dir === 'up' || p.dir === 'down') ? p.dir : this.hoseDir(input);
        this.hose = { dir, len: 0, state: 'extend', target: null, auto: 0 };
        this.emit('hose');
      }
      return;
    }
    const h = this.hose;
    const [dx, dy] = DIRS[h.dir];

    if (h.state === 'extend') {
      const prev = h.len;
      h.len = Math.min(this.stats.hoseRange, h.len + HOSE_EXTEND * dt);
      // Walk the tip forward in small steps so it can't skip a target.
      for (let l = prev; l <= h.len + 1e-6; l += 0.1) {
        const tx = p.x + dx * l;
        const ty = p.y + dy * l;
        const cx = Math.round(tx);
        const cy = Math.round(ty);
        if (l > 0.45 && !this.isOpen(cx, cy)) {
          h.len = Math.max(0, l - 0.1);
          h.state = 'retract';
          return;
        }
        const hit = this.enemies.find((e) => this.pumpable(e) && this.hoseTouches(e, tx, ty, dx));
        if (hit && this.armored(hit, h.dir)) {
          h.len = l;
          h.state = 'retract';
          this.emit('clang', { x: hit.x, y: hit.y });
          return;
        }
        if (hit) {
          h.len = l;
          h.state = 'attached';
          h.target = hit;
          this.emit('latch', { x: hit.x, y: hit.y });
          this.pump(hit);
          return;
        }
      }
      if (h.len >= this.stats.hoseRange) h.state = 'retract';
      return;
    }

    if (h.state === 'retract') {
      h.len -= HOSE_RETRACT * dt;
      if (h.len <= 0) this.hose = null;
      return;
    }

    // attached
    const t = h.target;
    if (!t || t.state !== 'inflated') {
      this.hose = null;
      return;
    }
    h.len = dist(p.x, p.y, t.x, t.y);
    if (input.pumpPressed) {
      this.pump(t);
      h.auto = this.stats.autoPumpInterval;
    } else if (input.pumpHeld) {
      h.auto -= dt;
      if (h.auto <= 0) {
        this.pump(t);
        h.auto = this.stats.autoPumpInterval;
      }
    }
  }

  hoseTouches(e, tx, ty, dx) {
    const reach = e.kind === 'boss' ? 0.95 : 0.55;
    if (dist(tx, ty, e.x, e.y) < reach) return true;
    if (!this.stats.wideNozzle) return false;
    // Wide Nozzle: also catch foes up to one tile either side of the line.
    const along = dx ? Math.abs(tx - e.x) : Math.abs(ty - e.y);
    const side = dx ? Math.abs(ty - e.y) : Math.abs(tx - e.x);
    return along < reach && side < 1.1;
  }

  hoseDir(input) {
    if (input.dir) return input.dir;
    const p = this.player;
    return p.dir === 'up' || p.dir === 'down' ? p.dir : p.face;
  }

  pumpable(e) {
    return e.state === 'walk' || e.state === 'ghost' || e.state === 'inflated' || e.state === 'charge' || e.state === 'fire';
  }

  pump(e) {
    if (e.state !== 'inflated') {
      e.prevState = e.state === 'ghost' ? 'ghost' : 'walk';
      e.state = 'inflated';
      e.fireLen = 0;
    }
    e.inflation += this.stats.pumpPower;
    e.deflateTimer = this.stats.deflateDelay * (e.kind === 'boss' ? 1.5 : 1);
    this.emit('pump', { x: e.x, y: e.y, level: e.inflation / e.popAt });
    if (e.inflation >= this.popThreshold(e)) this.pop(e);
  }

  popThreshold(e) {
    return Math.max(1, e.popAt - (this.stats.popDiscount || 0) * (e.kind === 'boss' ? 2 : 1));
  }

  // Shellbacks shrug off a hose that hits their armoured front.
  armored(e, hoseDir) {
    return e.kind === 'shellback' && (e.state === 'walk' || e.state === 'charge') && hoseDir === OPPOSITE[e.dir];
  }

  pop(e, opts = {}) {
    if (this.hose && this.hose.target === e) this.hose = null;
    e.state = 'popped';
    e.timer = 0.35;
    this.hose = null;
    const g = Math.round(this.enemyGold(e) * this.stats.goldMult);
    this.gold += g;
    this.kills += 1;
    this.emit('pop', { x: e.x, y: e.y, amount: g, kind: e.kind });
    if (e.kind === 'splitter' && !opts.noSplit) this.split(e);
    if (e.kind === 'boss') {
      for (const o of this.enemies) {
        if (o !== e && o.state !== 'popped' && o.state !== 'crushed') {
          o.state = 'popped';
          o.timer = 0.35;
          this.kills += 1;
        }
      }
    }
  }

  split(e) {
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    const open = this.isOpen(x, y);
    for (let i = 0; i < 2; i++) {
      const m = this.makeEnemy({ kind: 'mini', x, y, state: open ? 'walk' : 'ghost', ghostTime: 0 }, this.nextId++);
      m.dir = i === 0 ? 'left' : 'right';
      m.face = m.dir;
      this.enemies.push(m);
    }
    this.emit('split', { x, y });
  }

  enemyGold(e) {
    if (e.kind === 'boss') return 25 * e.level;
    if (e.kind === 'mini') return 1;
    const layer = Math.max(1, layerFor(Math.round(e.y), this.rows));
    const extra = { scorch: 2, gnawler: 1, splitter: 1, shellback: 3 }[e.kind] || 0;
    return 1 + layer + extra;
  }

  // ---- rocks ----

  updateRocks(dt) {
    const p = this.player;
    for (const r of this.rocks) {
      if (r.state === 'idle') {
        const bx = r.x;
        const by = r.y + 1;
        if (!this.inBounds(bx, by) || this.tile(bx, by) !== T_OPEN || this.rockAt(bx, by)) continue;
        const playerBelow = p.alive && Math.abs(p.x - bx) < 0.6 && p.y > r.y && p.y < by + 0.6;
        if (playerBelow) continue;
        r.state = 'wobble';
        r.timer = 0.6;
        this.emit('wobble', { x: r.x, y: r.y });
      } else if (r.state === 'wobble') {
        r.timer -= dt;
        if (r.timer <= 0) {
          r.state = 'falling';
          r.fy = r.y;
        }
      } else if (r.state === 'falling') {
        r.fy += ROCK_FALL * dt;
        this.crushUnder(r);
        if (r.fy >= r.y + 1) {
          r.y += 1;
          const ny = r.y + 1;
          if (!this.inBounds(r.x, ny) || this.tile(r.x, ny) !== T_OPEN) {
            r.fy = r.y;
            r.state = 'breaking';
            r.timer = 0.4;
            this.emit('rock', { x: r.x, y: r.y, kills: r.kills });
            if (r.kills > 0) this.awardCrush(r);
          }
        }
      } else if (r.state === 'breaking') {
        r.timer -= dt;
        if (r.timer <= 0) r.state = 'gone';
      }
    }
    this.rocks = this.rocks.filter((r) => r.state !== 'gone');
  }

  crushUnder(r) {
    const hits = (x, y) => Math.abs(x - r.x) < 0.6 && y > r.fy - 0.3 && y < r.fy + 0.95;
    for (const e of this.enemies) {
      if (e.state === 'popped' || e.state === 'crushed' || e.kind === 'boss') continue;
      if (hits(e.x, e.y)) {
        e.state = 'crushed';
        e.timer = 0.6;
        e.crushedBy = r;
        r.kills += 1;
        this.kills += 1;
        if (this.hose && this.hose.target === e) this.hose = null;
      }
    }
    const p = this.player;
    if (p.alive && hits(p.x, p.y)) {
      p.invuln = 0;
      p.hearts = 1; // a rock is always fatal
      this.hurtPlayer('rock');
    }
  }

  awardCrush(r) {
    // Classic multi-crush scaling: each extra foe under one rock pays more.
    let total = 0;
    for (let i = 0; i < r.kills; i++) total += 4 * (i + 1);
    total = Math.round(total * this.stats.rockBonus * this.stats.goldMult);
    this.gold += total;
    this.emit('crush', { x: r.x, y: r.y, amount: total, kills: r.kills });
  }

  // ---- enemies ----

  updateCorpses(dt) {
    for (const e of this.enemies) {
      if (e.state === 'popped' || e.state === 'crushed') {
        e.timer -= dt;
        if (e.state === 'crushed' && e.crushedBy && e.crushedBy.state === 'falling') {
          e.y = Math.max(e.y, e.crushedBy.fy + 0.3);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !((e.state === 'popped' || e.state === 'crushed') && e.timer <= 0));
  }

  updateEnemies(dt) {
    if (this.freeze > 0) return;
    const spawned = [];
    for (const e of this.enemies) {
      if (e.frozen > 0) {
        e.frozen -= dt;
        continue;
      }
      switch (e.state) {
        case 'walk':
          this.enemyWalk(e, dt);
          break;
        case 'ghost':
          this.enemyGhost(e, dt);
          break;
        case 'inflated':
          e.deflateTimer -= dt;
          if (e.deflateTimer <= 0) {
            e.inflation -= 1;
            e.deflateTimer = this.stats.deflateDelay * (e.kind === 'boss' ? 1.5 : 1);
            this.emit('deflate', { x: e.x, y: e.y, level: e.inflation / e.popAt });
            if (e.inflation <= 0) {
              e.inflation = 0;
              this.recover(e);
            }
          }
          break;
        case 'charge':
          e.timer -= dt;
          if (e.timer <= 0) {
            e.state = 'fire';
            e.timer = 0.8;
            e.fireLen = 0;
            this.emit('fire', { x: e.x, y: e.y });
          }
          break;
        case 'fire': {
          e.timer -= dt;
          const range = e.kind === 'boss' ? 4 : 3;
          e.fireLen = Math.min(this.fireReach(e, range), e.fireLen + 12 * dt);
          if (!e.frost) this.meltIce(e);
          if (e.timer <= 0) {
            e.state = 'walk';
            e.fireLen = 0;
            e.fireCooldown = this.rng.float(2.5, 5);
          }
          break;
        }
        default:
          break;
      }
      if (e.kind === 'boss' && e.state !== 'popped') {
        e.spawnTimer -= dt;
        const minions = this.enemies.filter((o) => o.kind !== 'boss' && o.state !== 'popped' && o.state !== 'crushed').length;
        if (e.spawnTimer <= 0) {
          e.spawnTimer = 8 - e.level;
          if (minions < 2 + e.level) {
            const m = this.makeEnemy(
              { kind: e.level >= 2 && this.rng.chance(0.5) ? this.breather() : 'puff', x: Math.round(e.x), y: Math.round(e.y), state: 'ghost', ghostTime: 0 },
              this.nextId++,
            );
            spawned.push(m);
            this.emit('spawn', { x: e.x, y: e.y });
          }
        }
      }
    }
    this.enemies.push(...spawned);
  }

  recover(e) {
    // Back to a ghost briefly so it re-settles on the nearest tunnel tile.
    if (e.prevState === 'walk' && !e.moving && this.isOpen(e.x, e.y)) {
      e.state = 'walk';
    } else if (e.prevState === 'walk' && e.moving && this.isOpen(e.tx, e.ty)) {
      e.state = 'walk';
    } else {
      e.state = 'ghost';
      e.ghostTime = 1.2;
    }
  }

  enemyWalk(e, dt) {
    const p = this.player;
    // Fire breathers take a breath when the player is level with them.
    const breathes = e.kind === 'scorch' || e.kind === 'chiller' || (e.kind === 'boss' && e.level >= 2 && !e.spores);
    // Burning trail: each tile it leaves smoulders for a moment.
    if (e.trail && !e.moving && (e.lastX !== e.x || e.lastY !== e.y)) {
      if (e.lastX !== undefined && Math.abs(e.lastX - e.x) + Math.abs(e.lastY - e.y) === 1) this.embers.push({ x: e.lastX, y: e.lastY, time: EMBER_TIME });
      e.lastX = e.x;
      e.lastY = e.y;
    }
    if (breathes) e.fireCooldown -= dt;
    if (breathes && !e.moving) {
      const sameRow = Math.abs(p.y - e.y) < 0.5;
      const near = Math.abs(p.x - e.x) <= (e.kind === 'boss' ? 4 : 3);
      if (e.fireCooldown <= 0 && sameRow && near && p.alive) {
        e.face = p.x < e.x ? 'left' : 'right';
        e.state = 'charge';
        e.timer = 0.7;
        return;
      }
    }

    const goal = this.target();
    e.ghostTimer -= dt;
    // On big maps only foes within range come hunting through the dirt.
    if (!e.moving && e.ghostTimer <= 0 && dist(e.x, e.y, goal.x, goal.y) > GHOST_RANGE) e.ghostTimer = 2;
    if (!e.moving && e.ghostTimer <= 0) {
      e.state = 'ghost';
      e.ghostTime = 0;
      this.emit('ghost', { x: e.x, y: e.y });
      return;
    }

    if (!e.moving) {
      // Gnawlers within range chew straight through dirt toward the player.
      const chewing = e.kind === 'gnawler' && dist(e.x, e.y, goal.x, goal.y) <= GHOST_RANGE;
      const options = Object.keys(DIRS).filter((d) => {
        const [dx, dy] = DIRS[d];
        const nx = e.x + dx;
        const ny = e.y + dy;
        if (chewing) return ny >= 1 && this.canDig(nx, ny);
        return this.isOpen(nx, ny) && !(ny === 0 && e.kind === 'boss');
      });
      if (options.length === 0) return;
      let choices = options.filter((d) => d !== OPPOSITE[e.dir]);
      if (choices.length === 0) choices = options;
      let dir;
      if (this.rng.chance(chewing ? 0.85 : this.diff.chase)) {
        dir = choices.reduce((best, d) => {
          const [dx, dy] = DIRS[d];
          const score = dist(e.x + dx, e.y + dy, goal.x, goal.y);
          return !best || score < best.score ? { d, score } : best;
        }, null).d;
      } else {
        dir = this.rng.pick(choices);
      }
      const [dx, dy] = DIRS[dir];
      e.dir = dir;
      if (dir === 'left' || dir === 'right') e.face = dir;
      e.tx = e.x + dx;
      e.ty = e.y + dy;
      e.moving = true;
      const t = this.tile(e.tx, e.ty);
      e.digging = t === T_DIRT || t === T_VINE ? 'dirt' : t === T_ICE ? 'ice' : false;
      if (e.digging) this.grid[e.ty * this.cols + e.tx] = T_OPEN;
    }

    // A rock may have landed in the way.
    if (!this.isOpen(e.tx, e.ty)) {
      const [dx, dy] = DIRS[e.dir];
      e.tx -= dx;
      e.ty -= dy;
      e.dir = OPPOSITE[e.dir];
    }
    const remaining = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
    const step = e.speed * (e.digging ? (e.digging === 'ice' ? 0.3 : 0.55) : 1) * dt;
    if (step >= remaining) {
      e.x = e.tx;
      e.y = e.ty;
      e.moving = false;
      e.digging = false;
    } else {
      const sx = Math.sign(e.tx - e.x);
      const sy = Math.sign(e.ty - e.y);
      e.x += sx * step;
      e.y += sy * step;
    }
  }

  enemyGhost(e, dt) {
    const p = this.target();
    e.ghostTime += dt;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = e.speed * 0.55;
    e.x += (dx / d) * speed * dt;
    e.y += (dy / d) * speed * dt;
    e.x = Math.max(0, Math.min(this.cols - 1, e.x));
    e.y = Math.max(0, Math.min(this.rows - 1, e.y));
    if (Math.abs(dx) > 0.1) e.face = dx < 0 ? 'left' : 'right';
    if (e.ghostTime > 1.2) {
      const cx = Math.round(e.x);
      const cy = Math.round(e.y);
      if (dist(cx, cy, e.x, e.y) < 0.2 && this.isOpen(cx, cy) && !(cy === 0 && e.kind === 'boss')) {
        e.x = cx;
        e.y = cy;
        e.tx = cx;
        e.ty = cy;
        e.moving = false;
        e.state = 'walk';
        e.ghostTimer = this.ghostDelay();
      }
    }
  }

  fireReach(e, range) {
    // Fire goes through dirt but stops at bedrock and rocks.
    const step = e.face === 'left' ? -1 : 1;
    let reach = range;
    for (let i = 1; i <= range; i++) {
      const x = Math.round(e.x) + step * i;
      const y = Math.round(e.y);
      if (!this.inBounds(x, y) || this.tile(x, y) === T_BEDROCK || this.rockAt(x, y)) {
        reach = i - 0.5;
        break;
      }
    }
    return reach;
  }

  // Fire breath melts any ice it passes through.
  meltIce(e) {
    const span = this.fireSpan(e);
    if (!span) return;
    const y = Math.round(span.y);
    for (let x = Math.ceil(span.x0 - 0.5); x <= Math.floor(span.x1 + 0.5); x++) {
      if (this.inBounds(x, y) && this.tile(x, y) === T_ICE) this.grid[y * this.cols + x] = T_OPEN;
    }
  }

  // The zone's own breath-type foe, used for boss minions.
  breather() {
    return { frozen: 'chiller', fungal: 'sporeling', magma: 'magmite' }[this.zone] || 'scorch';
  }

  // ---- spores and vines ----

  inSpores(x, y) {
    return this.clouds.some((c) => dist(c.x, c.y, x, y) < c.r);
  }

  addCloud(x, y, r, time) {
    this.clouds.push({ x: Math.round(x), y: Math.round(y), r, time, life: time });
    this.emit('spore', { x: Math.round(x), y: Math.round(y) });
  }

  updateSpores(dt) {
    for (const c of this.clouds) c.time -= dt;
    this.clouds = this.clouds.filter((c) => c.time > 0);
    for (const v of this.vents) {
      if (v.on > 0) {
        v.on -= dt;
        continue;
      }
      v.timer -= dt;
      if (v.timer <= 0) {
        v.on = VENT_PUFF;
        v.timer = this.rng.float(3, 6);
        this.addCloud(v.x, v.y, 1.5, VENT_PUFF);
      }
    }
    if (this.freeze <= 0) {
      for (const e of this.enemies) {
        if (!e.spores || e.frozen > 0 || e.state !== 'walk') continue;
        e.sporeTimer -= dt;
        if (e.sporeTimer <= 0) {
          e.sporeTimer = e.kind === 'boss' ? 3.5 : this.rng.float(4, 7);
          this.addCloud(e.x, e.y, e.kind === 'boss' ? 1.8 : 1.2, 3);
        }
      }
    }
    const p = this.player;
    const slowed = p.alive && this.inSpores(p.x, p.y);
    if (slowed && !p.slowed) this.emit('spored', { x: p.x, y: p.y });
    p.slowed = slowed;
  }

  updateVines(dt) {
    if (!this.vineHome.length) return;
    const p = this.player;
    for (const i of this.vineHome) {
      if (this.grid[i] !== T_OPEN) continue;
      const x = i % this.cols;
      const y = (i - x) / this.cols;
      const near = (ox, oy, r) => Math.abs(ox - x) < r && Math.abs(oy - y) < r;
      const busy = near(p.x, p.y, 1.5) || near(p.tx, p.ty, 1.5)
        || this.enemies.some((e) => near(e.x, e.y, 1.2) || near(e.tx, e.ty, 1.2))
        || this.rocks.some((r) => near(r.x, r.state === 'falling' ? r.fy : r.y, 0.9))
        || this.bombs.some((b) => near(b.x, b.y, 1))
        || (this.decoy && near(this.decoy.x, this.decoy.y, 1));
      const t = busy ? 0 : (this.vineTimers.get(i) || 0) + dt;
      if (t >= VINE_REGROW) {
        this.grid[i] = T_VINE;
        this.vineTimers.delete(i);
        this.emit('vine', { x, y });
      } else {
        this.vineTimers.set(i, t);
      }
    }
  }

  // ---- magma ----

  lavaAt(x, y) {
    return this.inBounds(x, y) && this.tile(x, y) === T_LAVA;
  }

  updateMagma(dt) {
    const p = this.player;
    // Lava pools creep into open tunnel, down first, never up.
    for (const pool of this.pools) {
      if (pool.left <= 0) continue;
      pool.timer -= dt;
      if (pool.timer > 0) continue;
      pool.timer = this.rng.float(...LAVA_SPREAD);
      const free = (x, y) => this.isOpen(x, y) && y > 0 && !this.seeps.some((s) => s.x === x && s.y === y)
        && !this.enemies.some((e) => Math.round(e.x) === x && Math.round(e.y) === y && e.state !== 'ghost');
      let next = null;
      for (const t of pool.tiles) {
        if (free(t.x, t.y + 1)) { next = { x: t.x, y: t.y + 1 }; break; }
      }
      if (!next) {
        const side = this.rng.shuffle(pool.tiles.flatMap((t) => [{ x: t.x - 1, y: t.y }, { x: t.x + 1, y: t.y }]));
        next = side.find((c) => free(c.x, c.y)) || null;
      }
      if (!next) {
        pool.left = 0;
        continue;
      }
      pool.left -= 1;
      this.seeps.push({ x: next.x, y: next.y, timer: SEEP_TIME, pool });
    }
    for (const s of this.seeps) {
      s.timer -= dt;
      if (s.timer <= 0) {
        if (this.isOpen(s.x, s.y)) {
          this.grid[s.y * this.cols + s.x] = T_LAVA;
          s.pool.tiles.push({ x: s.x, y: s.y });
          this.emit('lava', { x: s.x, y: s.y });
        }
      }
    }
    this.seeps = this.seeps.filter((s) => s.timer > 0);

    // Steam vents: idle, hiss as a warning, then blast straight up.
    for (const v of this.steam) {
      v.timer -= dt;
      if (v.timer > 0) continue;
      if (v.state === 'idle') {
        v.state = 'warn';
        v.timer = STEAM_WARN;
        this.emit('hiss', { x: v.x, y: v.y });
      } else if (v.state === 'warn') {
        v.state = 'blast';
        v.timer = STEAM_BLAST;
        this.emit('steam', { x: v.x, y: v.y });
      } else {
        v.state = 'idle';
        v.timer = this.rng.float(3, 5.5);
      }
    }
    for (const v of this.steam) {
      if (v.state !== 'blast') continue;
      const top = this.steamTop(v);
      const inColumn = (x, y) => Math.abs(x - v.x) < 0.6 && y > top - 0.5 && y < v.y + 0.5;
      for (const e of this.enemies) {
        if (e.kind === 'boss' || e.state === 'popped' || e.state === 'crushed' || e.state === 'ghost' || !inColumn(e.x, e.y)) continue;
        this.pop(e); // steam pops foes outright
      }
      if (p.alive && inColumn(p.x, p.y)) this.hurtPlayer('steam');
    }

    for (const em of this.embers) em.time -= dt;
    this.embers = this.embers.filter((em) => em.time > 0);

    if (!p.alive) return;
    if (this.lavaAt(Math.round(p.x), Math.round(p.y))) {
      p.invuln = 0;
      p.hearts = 1; // lava is always fatal, like rocks
      p.shield = 0;
      this.hurtPlayer('lava');
      return;
    }
    if (!this.stats.fireproof && this.embers.some((em) => Math.abs(em.x - p.x) < 0.6 && Math.abs(em.y - p.y) < 0.6)) {
      this.hurtPlayer('fire');
    }
  }

  // Highest tile a vent's blast reaches through open tunnel.
  steamTop(v) {
    let top = v.y;
    while (top > v.y - STEAM_HEIGHT && this.isOpen(v.x, top - 1)) top -= 1;
    return top;
  }

  // ---- icicles ----

  updateIcicles(dt) {
    const p = this.player;
    for (const ic of this.icicles) {
      if (ic.state === 'idle') {
        if (!p.alive || Math.abs(p.x - ic.x) > 0.45 || p.y <= ic.y || p.y - ic.y > ICICLE_SIGHT) continue;
        // Only when nothing solid is between the icicle and the player.
        let clear = true;
        for (let y = ic.y + 1; y < Math.round(p.y) && clear; y++) if (!this.isOpen(ic.x, y)) clear = false;
        if (!clear) continue;
        ic.state = 'shake';
        ic.timer = 0.35;
        this.emit('crack', { x: ic.x, y: ic.y });
      } else if (ic.state === 'shake') {
        ic.timer -= dt;
        if (ic.timer <= 0) ic.state = 'falling';
      } else if (ic.state === 'falling') {
        ic.fy += ICICLE_FALL * dt;
        this.icicleHits(ic);
        const below = Math.floor(ic.fy) + 1;
        if (!this.isOpen(ic.x, below)) {
          ic.fy = Math.floor(ic.fy);
          ic.state = 'shatter';
          ic.timer = 0.3;
          this.emit('shatter', { x: ic.x, y: ic.fy });
        }
      } else if (ic.state === 'shatter') {
        ic.timer -= dt;
        if (ic.timer <= 0) ic.state = 'gone';
      }
    }
    this.icicles = this.icicles.filter((ic) => ic.state !== 'gone');
  }

  icicleHits(ic) {
    const hits = (x, y) => Math.abs(x - ic.x) < 0.5 && Math.abs(y - ic.fy) < 0.6;
    for (const e of this.enemies) {
      if (e.state === 'popped' || e.state === 'crushed' || e.kind === 'boss' || !hits(e.x, e.y)) continue;
      e.state = 'crushed';
      e.timer = 0.6;
      this.kills += 1;
      if (this.hose && this.hose.target === e) this.hose = null;
      const g = Math.round(this.enemyGold(e) * this.stats.goldMult);
      this.gold += g;
      this.emit('pop', { x: e.x, y: e.y, amount: g, kind: e.kind });
    }
    const p = this.player;
    if (p.alive && hits(p.x, p.y)) this.hurtPlayer('icicle');
  }

  fireSpan(e) {
    if (e.state !== 'fire' || e.fireLen <= 0) return null;
    const s = e.face === 'left' ? -1 : 1;
    const a = e.x + s * 0.4;
    const b = e.x + s * (0.4 + e.fireLen);
    return { x0: Math.min(a, b), x1: Math.max(a, b), y: e.y };
  }

  checkContacts() {
    const p = this.player;
    if (!p.alive) return;
    for (const e of this.enemies) {
      if (e.frozen > 0) continue;
      if (e.state === 'walk' || e.state === 'ghost' || e.state === 'charge' || e.state === 'fire') {
        if (dist(e.x, e.y, p.x, p.y) < e.radius) {
          this.hurtPlayer(e.kind);
          return;
        }
      }
      const span = this.fireSpan(e);
      const inBreath = span && Math.abs(p.y - span.y) < 0.6 && p.x > span.x0 - 0.3 && p.x < span.x1 + 0.3;
      if (inBreath && e.frost) {
        // Frost breath doesn't hurt, it freezes you in place.
        if (p.chilled <= 0 && p.invuln <= 0) {
          p.chilled = CHILL_TIME;
          this.emit('chill', { x: p.x, y: p.y });
        }
      } else if (inBreath && !this.stats.fireproof) {
        this.hurtPlayer('fire');
        return;
      }
    }
  }

  get boss() {
    return this.enemies.find((e) => e.kind === 'boss');
  }
}
