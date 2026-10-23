// One floor of play. No DOM access: driven by update(dt, input) so it can be
// tested headlessly and rendered by render.js.

import { T_OPEN, T_DIRT, T_BEDROCK, DIRS, OPPOSITE, layerFor } from './constants.js';
import { Rng } from './rng.js';

const POP_AT = { puff: 4, scorch: 4 };
const BOSS_POP_AT = [0, 10, 14, 18];
const HOSE_EXTEND = 16; // tiles per second
const HOSE_RETRACT = 24;
const ROCK_FALL = 7;
const TOUCH = 0.6;

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
    this.rng = new Rng(layout.seed ^ 0xa5a5a5a5);

    this.player = {
      x: layout.start.x, y: layout.start.y,
      tx: layout.start.x, ty: layout.start.y,
      dir: 'right', face: 'right',
      moving: false, walking: false, digging: false,
      hearts: opts.hearts ?? 1,
      shield: stats.shield || 0,
      invuln: 0,
      alive: true,
    };
    this.hose = null;
    this.enemies = layout.enemies.map((e, i) => this.makeEnemy(e, i));
    this.rocks = layout.rocks.map((r) => ({ x: r.x, y: r.y, fy: r.y, state: 'idle', timer: 0, kills: 0 }));
    this.items = layout.items.map((it) => ({ ...it, taken: false }));

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
      ghostTimer: this.ghostDelay() * (boss ? 0.7 : 1),
      inflation: 0,
      popAt: boss ? BOSS_POP_AT[level] : POP_AT[e.kind],
      deflateTimer: 0,
      timer: 0,
      fireCooldown: this.rng.float(2, 4),
      fireLen: 0,
      spawnTimer: 6,
      speed: this.diff.enemySpeed * (boss ? 0.75 : 1),
      radius: boss ? 0.85 : TOUCH,
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
    return this.inBounds(x, y) && this.tile(x, y) !== T_BEDROCK && !this.rockAt(x, y);
  }

  // ---- main update ----

  update(dt, input = {}) {
    this.time += dt;
    if (this.status === 'dying' || this.status === 'clearing') {
      this.statusTimer -= dt;
      this.updateRocks(dt);
      this.updateCorpses(dt);
      if (this.statusTimer <= 0) this.status = this.status === 'dying' ? 'dead' : 'cleared';
      return;
    }
    if (this.status !== 'playing') return;

    if (this.freeze > 0) this.freeze -= dt;
    if (this.player.invuln > 0) this.player.invuln -= dt;

    this.updatePlayer(dt, input);
    this.updateHose(dt, input);
    this.updateRocks(dt);
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
    const speed = this.stats.speed * (p.digging ? this.stats.digPenalty : 1);
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
    p.digging = this.tile(nx, ny) === T_DIRT;
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
      } else {
        this.fossils += it.value;
        this.emit('fossil', { x, y });
      }
    }
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
        const hit = this.enemies.find((e) => this.pumpable(e) && dist(tx, ty, e.x, e.y) < (e.kind === 'boss' ? 0.95 : 0.55));
        if (hit) {
          h.len = l;
          h.state = 'attached';
          h.target = hit;
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

  pop(e) {
    e.state = 'popped';
    e.timer = 0.35;
    this.hose = null;
    const g = Math.round(this.enemyGold(e) * this.stats.goldMult);
    this.gold += g;
    this.kills += 1;
    this.emit('pop', { x: e.x, y: e.y, amount: g, kind: e.kind });
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

  enemyGold(e) {
    if (e.kind === 'boss') return 25 * e.level;
    const layer = Math.max(1, layerFor(Math.round(e.y)));
    return 1 + layer + (e.kind === 'scorch' ? 2 : 0);
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
              { kind: e.level >= 2 && this.rng.chance(0.5) ? 'scorch' : 'puff', x: Math.round(e.x), y: Math.round(e.y), state: 'ghost', ghostTime: 0 },
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
    const breathes = e.kind === 'scorch' || (e.kind === 'boss' && e.level >= 2);
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

    e.ghostTimer -= dt;
    if (!e.moving && e.ghostTimer <= 0) {
      e.state = 'ghost';
      e.ghostTime = 0;
      this.emit('ghost', { x: e.x, y: e.y });
      return;
    }

    if (!e.moving) {
      const options = Object.keys(DIRS).filter((d) => {
        const [dx, dy] = DIRS[d];
        return this.isOpen(e.x + dx, e.y + dy) && !(e.y + dy === 0 && e.kind === 'boss');
      });
      if (options.length === 0) return;
      let choices = options.filter((d) => d !== OPPOSITE[e.dir]);
      if (choices.length === 0) choices = options;
      let dir;
      if (this.rng.chance(this.diff.chase)) {
        dir = choices.reduce((best, d) => {
          const [dx, dy] = DIRS[d];
          const score = dist(e.x + dx, e.y + dy, p.x, p.y);
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
    }

    // A rock may have landed in the way.
    if (!this.isOpen(e.tx, e.ty)) {
      const [dx, dy] = DIRS[e.dir];
      e.tx -= dx;
      e.ty -= dy;
      e.dir = OPPOSITE[e.dir];
    }
    const remaining = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
    const step = e.speed * dt;
    if (step >= remaining) {
      e.x = e.tx;
      e.y = e.ty;
      e.moving = false;
    } else {
      const sx = Math.sign(e.tx - e.x);
      const sy = Math.sign(e.ty - e.y);
      e.x += sx * step;
      e.y += sy * step;
    }
  }

  enemyGhost(e, dt) {
    const p = this.player;
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
      if (e.state === 'walk' || e.state === 'ghost' || e.state === 'charge' || e.state === 'fire') {
        if (dist(e.x, e.y, p.x, p.y) < e.radius) {
          this.hurtPlayer(e.kind);
          return;
        }
      }
      const span = this.fireSpan(e);
      if (span && !this.stats.fireproof && Math.abs(p.y - span.y) < 0.6 && p.x > span.x0 - 0.3 && p.x < span.x1 + 0.3) {
        this.hurtPlayer('fire');
        return;
      }
    }
  }

  get boss() {
    return this.enemies.find((e) => e.kind === 'boss');
  }
}
