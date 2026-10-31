// Canvas renderer. All art is drawn procedurally (no sprite files).

import { ITEM_BY_ID, BOMB_FUSE } from './items.js';
import { GEAR_BY_ID } from './gear.js';
import { TILE, HUD_H, VIEW_COLS, VIEW_ROWS, T_DIRT, T_BEDROCK, T_ICE, T_VINE, T_LAVA, layerFor, actFor, TOTAL_FLOORS } from './constants.js';

const DIRT = [
  null,
  ['#e0a458', '#c98a3f'],
  ['#c8693a', '#a8542b'],
  ['#9b3f3a', '#7f302c'],
  ['#5d3a6e', '#472b56'],
];
const DIRT_FROZEN = [null, ['#dfe9f0', '#c5d6e2'], ['#b9cfdf', '#a1bcd0'], ['#8fb0c9', '#7a9cb7'], ['#6987a6', '#56738f']];
const DIRT_FUNGAL = [null, ['#3f4a3a', '#34402f'], ['#3a3d4c', '#2f3240'], ['#3a3050', '#2e2642'], ['#2b2340', '#211b33']];
const DIRT_MAGMA = [null, ['#5a3a30', '#4a2c24'], ['#55291f', '#441f17'], ['#4d1d15', '#3c140e'], ['#3a120c', '#2a0b07']];
const DIRT_ACT3 = [null, ['#6b5b8a', '#584a74'], ['#4f4a7d', '#3f3b66'], ['#3d3a66', '#302d52'], ['#2a2847', '#201e38']];
const TUNNEL = '#120d16';
// Drifting particles per area: count on screen, fall speed (px/s), sway, size range.
const AMBIENT = {
  default: { count: 14, vy: -4, sway: 6, size: [1, 2], colors: ['#d7ccc8', '#bcaaa4'] },
  frozen: { count: 40, vy: 22, sway: 14, size: [2, 3], colors: ['#ffffff', '#e1f5fe'] },
  fungal: { count: 26, vy: -8, sway: 10, size: [2, 3], colors: ['#ce93d8', '#80cbc4', '#b39ddb'] },
  magma: { count: 30, vy: -26, sway: 10, size: [1, 3], colors: ['#ff8a50', '#ffb74d', '#ff5722'] },
};
const KIND_COLOR = {
  puff: '#7cb342', scorch: '#ff7043', chiller: '#4fc3f7', sporeling: '#ce93d8', magmite: '#ff8a50', gnawler: '#8d6e63', splitter: '#ba68c8', mini: '#f48fb1', shellback: '#26a69a',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.popups = [];
    this.particles = [];
    this.rings = []; // expanding shockwave circles
    this.ambient = []; // drifting snow / spores / embers / dust, in view space
    this.vignette = null;
    this.shake = 0;
    this.flash = null; // { color, t, life } full-view tint that fades out
    this.hitstop = 0; // seconds the game loop should hold the sim still
    this.toast = null;
    this.cam = { x: 0, y: 0 };
    this.canvas.width = VIEW_COLS * TILE;
    this.canvas.height = VIEW_ROWS * TILE + HUD_H;
  }

  get viewW() {
    return VIEW_COLS * TILE;
  }

  get viewH() {
    return VIEW_ROWS * TILE;
  }

  // Follow the player, clamped to the map. `snap` jumps straight there.
  updateCamera(sim, dt, snap = false) {
    const p = sim.player;
    const maxX = Math.max(0, sim.cols * TILE - this.viewW);
    const maxY = Math.max(0, sim.rows * TILE - this.viewH);
    const tx = Math.min(maxX, Math.max(0, p.x * TILE + TILE / 2 - this.viewW / 2));
    const ty = Math.min(maxY, Math.max(0, p.y * TILE + TILE / 2 - this.viewH * 0.45));
    if (snap) {
      this.cam.x = tx;
      this.cam.y = ty;
      return;
    }
    const k = 1 - Math.exp(-dt * 8);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  flashView(color, life = 0.25) {
    this.flash = { color, t: 0, life };
  }

  // Freeze the action for a beat so big hits land. Longer stops win.
  stop(seconds) {
    this.hitstop = Math.max(this.hitstop, seconds);
  }

  showToast(text) {
    this.toast = { text, t: 0 };
  }

  addPopup(x, y, text, color = '#ffe066') {
    this.popups.push({ x, y, text, color, t: 0 });
  }

  burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      const size = 2 + Math.floor(Math.random() * 4);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, t: 0, life: 0.5 + Math.random() * 0.3, color, size });
    }
  }

  ring(x, y, color, radius = 1.2, life = 0.35) {
    this.rings.push({ x, y, color, radius, life, t: 0 });
  }

  // React to sim events with juice.
  handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'pop') {
        this.addPopup(ev.x, ev.y, `+${ev.amount}g`);
        this.burst(ev.x, ev.y, ev.kind === 'boss' ? '#ffd54f' : KIND_COLOR[ev.kind] || '#9ccc65', ev.kind === 'boss' ? 40 : 14);
        this.ring(ev.x, ev.y, '#ffffff', ev.kind === 'boss' ? 4 : 1.3, ev.kind === 'boss' ? 0.6 : 0.3);
        if (ev.kind === 'boss') {
          this.shake = 0.7;
          this.stop(0.4);
          this.flashView('255,255,255', 0.4);
        } else {
          this.shake = Math.max(this.shake, 0.08);
        }
      } else if (ev.type === 'latch') {
        this.ring(ev.x, ev.y, '#4fc3f7', 0.6, 0.2);
      } else if (ev.type === 'deflate') {
        this.burst(ev.x, ev.y - 0.3, '#cfd8dc', 3);
      } else if (ev.type === 'pump') {
        this.burst(ev.x, ev.y, '#e1f5fe', 2 + Math.round(ev.level * 3));
      } else if (ev.type === 'crush') {
        this.addPopup(ev.x, ev.y, `CRUSH x${ev.kills} +${ev.amount}g`, '#ffab40');
        this.shake = 0.3 + 0.1 * Math.min(3, ev.kills - 1);
        // Only multi-kills are big enough to stop the action.
        if (ev.kills > 1) this.stop(0.08 + 0.04 * Math.min(3, ev.kills));
      } else if (ev.type === 'rock') {
        this.burst(ev.x, ev.y + 0.3, '#9e9e9e', 8);
        this.shake = Math.max(this.shake, 0.15);
      } else if (ev.type === 'gold') {
        this.addPopup(ev.x, ev.y, `+${ev.amount}g`);
        this.burst(ev.x, ev.y, '#ffd54f', 6);
      } else if (ev.type === 'fossil') {
        this.addPopup(ev.x, ev.y, `+${ev.amount || 1} fossil${(ev.amount || 1) > 1 ? 's' : ''}`, '#e1f5fe');
        this.burst(ev.x, ev.y, '#e1f5fe', 10);
      } else if (ev.type === 'dig') {
        if (Math.random() < 0.5) this.burst(ev.x, ev.y, '#a1887f', 2);
      } else if (ev.type === 'shield') {
        this.addPopup(this.lastPlayer?.x ?? 7, this.lastPlayer?.y ?? 8, 'BLOCKED', '#4fc3f7');
        this.shake = 0.2;
        this.stop(0.15);
        this.flashView('79,195,247', 0.3);
      } else if (ev.type === 'gear') {
        this.addPopup(ev.x, ev.y, `+${GEAR_BY_ID[ev.gear].name}`, '#ffd54f');
        this.burst(ev.x, ev.y, '#ffd54f', 16);
      } else if (ev.type === 'item') {
        const it = ITEM_BY_ID[ev.item];
        this.addPopup(ev.x, ev.y, `+${it.name}`, '#80deea');
        this.burst(ev.x, ev.y, '#a1662f', 8);
      } else if (ev.type === 'boom') {
        this.burst(ev.x, ev.y, '#ffb74d', 30);
        this.burst(ev.x, ev.y, '#757575', 14);
        this.ring(ev.x, ev.y, '#ffb74d', 2.5, 0.4);
        this.shake = Math.max(this.shake, 0.45);
        this.flashView('255,183,77', 0.2);
      } else if (ev.type === 'use' && ev.item === 'frost') {
        this.burst(ev.x, ev.y, '#b3e5fc', 24);
      } else if (ev.type === 'chill') {
        this.addPopup(ev.x, ev.y, 'FROZEN!', '#81d4fa');
      } else if (ev.type === 'lava') {
        this.burst(ev.x, ev.y, '#ff9800', 5);
      } else if (ev.type === 'steam') {
        this.burst(ev.x, ev.y - 1, '#eceff1', 8);
      } else if (ev.type === 'spored') {
        this.addPopup(ev.x, ev.y, 'SLOWED', '#ce93d8');
      } else if (ev.type === 'spore') {
        this.burst(ev.x, ev.y, '#ce93d8', 6);
      } else if (ev.type === 'shatter') {
        this.burst(ev.x, ev.y + 0.4, '#e1f5fe', 10);
      } else if (ev.type === 'clang') {
        this.addPopup(ev.x, ev.y, 'CLANG', '#b0bec5');
        this.burst(ev.x, ev.y, '#eceff1', 5);
      } else if (ev.type === 'split') {
        this.addPopup(ev.x, ev.y, 'SPLIT!', '#f48fb1');
      } else if (ev.type === 'hurt') {
        this.shake = 0.3;
        this.stop(0.2);
        this.flashView('239,83,80', 0.4);
      } else if (ev.type === 'death') {
        this.shake = 0.5;
        this.stop(0.45);
        this.flashView('239,83,80', 0.6);
      } else if (ev.type === 'cleared') {
        this.flashView('255,213,79', 0.35);
      }
    }
  }

  step(dt) {
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < 1.1);
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 6 * dt;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.stepAmbient(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.flash) {
      this.flash.t += dt;
      if (this.flash.t >= this.flash.life) this.flash = null;
    }
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t >= 1.4) this.toast = null;
    }
  }

  // Each area gets its own drifting backdrop particles.
  stepAmbient(dt) {
    const zone = this.sim?.zone;
    const style = AMBIENT[zone] || AMBIENT.default;
    for (const a of this.ambient) {
      a.t += dt;
      a.x += (a.vx + Math.sin(a.t * a.wob) * style.sway) * dt;
      a.y += a.vy * dt;
    }
    this.ambient = this.ambient.filter((a) => a.t < a.life && a.y > -10 && a.y < this.viewH + 10);
    if (this.ambient.length < style.count && Math.random() < dt * style.count) {
      const fromTop = style.vy > 0;
      this.ambient.push({
        x: Math.random() * this.viewW,
        y: fromTop ? -4 : style.vy < 0 ? this.viewH + 4 : Math.random() * this.viewH,
        vx: (Math.random() - 0.5) * 6,
        vy: style.vy * (0.6 + Math.random() * 0.8),
        wob: 1 + Math.random() * 2,
        t: 0,
        life: 6 + Math.random() * 6,
        size: style.size[0] + Math.random() * (style.size[1] - style.size[0]),
        color: style.colors[Math.floor(Math.random() * style.colors.length)],
      });
    }
  }

  drawAmbient() {
    const ctx = this.ctx;
    for (const a of this.ambient) {
      const fade = Math.min(1, a.t / 0.8, (a.life - a.t) / 0.8);
      ctx.globalAlpha = Math.max(0, fade) * 0.7;
      ctx.fillStyle = a.color;
      ctx.fillRect(Math.round(a.x), Math.round(a.y), a.size, a.size);
    }
    ctx.globalAlpha = 1;
  }

  // A soft dark edge around the view, cached since the view size never changes.
  drawVignette() {
    if (!this.vignette) {
      const c = document.createElement('canvas');
      c.width = this.viewW;
      c.height = this.viewH;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(this.viewW / 2, this.viewH / 2, this.viewH * 0.35, this.viewW / 2, this.viewH / 2, this.viewH * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(5,3,10,0.45)');
      g.fillStyle = grad;
      g.fillRect(0, 0, this.viewW, this.viewH);
      this.vignette = c;
    }
    this.ctx.drawImage(this.vignette, 0, 0);
  }

  draw(sim, run, view = {}) {
    const ctx = this.ctx;
    this.sim = sim;
    const t = sim.time;
    ctx.save();
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!view.backdrop) this.drawHud(sim, run);

    ctx.translate(0, HUD_H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.viewW, this.viewH);
    ctx.clip();
    const cx = Math.round(this.cam.x);
    const cy = Math.round(this.cam.y);
    ctx.translate(-cx, -cy);
    if (this.shake > 0 && this.settings?.shake !== false) {
      const m = this.shake * 8;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    this.visible = {
      x0: Math.max(0, Math.floor(cx / TILE) - 1),
      y0: Math.max(0, Math.floor(cy / TILE) - 1),
      x1: Math.min(sim.cols - 1, Math.ceil((cx + this.viewW) / TILE)),
      y1: Math.min(sim.rows - 1, Math.ceil((cy + this.viewH) / TILE)),
    };
    this.drawGrid(sim, run);
    this.drawItems(sim, t);
    for (const r of sim.rocks) this.drawRock(r, t);
    for (const ic of sim.icicles) this.drawIcicle(ic, t);
    if (sim.zone === 'fungal') this.drawFungus(sim, t);
    if (sim.zone === 'magma') this.drawMagma(sim, t);
    for (const e of sim.enemies) this.drawFire(sim, e, t);
    this.drawGadgets(sim, t);
    this.drawHose(sim);
    for (const e of sim.enemies) this.drawEnemy(e, t);
    this.drawPlayer(sim.player, t, sim);
    if (sim.zone === 'fungal') {
      this.drawDark(sim, t);
      this.drawClouds(sim, t);
    }
    this.drawFx();
    ctx.restore();

    this.drawAmbient();
    this.drawVignette();
    if (sim.freeze > 0 && sim.status === 'playing') {
      ctx.fillStyle = 'rgba(120,180,255,0.08)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (this.flash) {
      ctx.fillStyle = `rgba(${this.flash.color},${0.45 * (1 - this.flash.t / this.flash.life)})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (!view.backdrop) {
      if (sim.cols > VIEW_COLS || sim.rows > VIEW_ROWS) this.drawMinimap(sim);
      this.drawPack(sim);
    }
    if (view.banner) this.drawBanner(sim, view.banner);
    // Fade to black as a floor ends, and back in as the next one starts.
    let fade = 0;
    if (sim.status === 'dying' || sim.status === 'clearing') fade = 0.7 * Math.max(0, 1 - sim.statusTimer / 0.8);
    else if (sim.status !== 'playing') fade = 0.7;
    if (view.banner && view.banner.max) fade = Math.max(fade, (view.banner.t - (view.banner.max - 0.6)) / 0.6);
    if (fade > 0) {
      ctx.fillStyle = `rgba(11,9,16,${Math.min(1, fade)})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (this.toast) this.drawToast();
    ctx.restore();
  }

  drawToast() {
    const ctx = this.ctx;
    ctx.globalAlpha = Math.min(1, (1.4 - this.toast.t) / 0.3);
    ctx.font = '10px "Press Start 2P", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(this.toast.text).width + 24;
    ctx.fillStyle = 'rgba(10,8,14,0.85)';
    ctx.fillRect(this.viewW / 2 - w / 2, this.viewH - 64, w, 26);
    ctx.fillStyle = '#f5e6c8';
    ctx.fillText(this.toast.text, this.viewW / 2, this.viewH - 51);
    ctx.globalAlpha = 1;
  }

  drawHud(sim, run) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    ctx.fillStyle = '#17121f';
    ctx.fillRect(0, 0, w, HUD_H);
    ctx.fillStyle = '#2c2238';
    ctx.fillRect(0, HUD_H - 2, w, 2);
    ctx.font = 'bold 14px "Press Start 2P", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    const y = HUD_H / 2;

    ctx.fillStyle = '#f5e6c8';
    ctx.textAlign = 'left';
    ctx.fillText(`F${run.floor}/${TOTAL_FLOORS}`, 8, y);

    // Hearts
    for (let i = 0; i < sim.player.hearts; i++) drawHeart(ctx, 114 + i * 18, y, 7);
    for (let i = 0; i < sim.player.shield; i++) drawShield(ctx, 114 + (sim.player.hearts + i) * 18, y, 7);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd54f';
    ctx.fillText(`${run.gold + sim.gold}g`, w - 70, y);
    ctx.fillStyle = '#e1f5fe';
    ctx.fillText(`🦴${run.fossils + sim.fossils}`, w - 8, y);

    const boss = sim.boss;
    if (boss) {
      const bw = 110;
      const bx = 200;
      ctx.fillStyle = '#3a2a2a';
      ctx.fillRect(bx, y - 6, bw, 12);
      const frac = 1 - boss.inflation / sim.popThreshold(boss);
      ctx.fillStyle = '#ef5350';
      ctx.fillRect(bx, y - 6, bw * Math.max(0, frac), 12);
      ctx.strokeStyle = '#f5e6c8';
      ctx.strokeRect(bx + 0.5, y - 5.5, bw - 1, 11);
    }
  }

  drawGrid(sim, run) {
    const ctx = this.ctx;
    const palette = sim.zone === 'frozen' ? DIRT_FROZEN : sim.zone === 'fungal' ? DIRT_FUNGAL : sim.zone === 'magma' ? DIRT_MAGMA : actFor(run.floor).num === 3 ? DIRT_ACT3 : DIRT;
    // Sky / surface row.
    const sky = ctx.createLinearGradient(0, 0, 0, TILE);
    sky.addColorStop(0, '#203a5c');
    sky.addColorStop(1, '#3f6e8c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, sim.cols * TILE, TILE);

    const v = this.visible;
    for (let y = Math.max(1, v.y0); y <= v.y1; y++) {
      const [c1, c2] = palette[layerFor(y, sim.rows)];
      for (let x = v.x0; x <= v.x1; x++) {
        const px = x * TILE;
        const py = y * TILE;
        const tile = sim.tile(x, y);
        if (tile === T_DIRT) {
          ctx.fillStyle = c1;
          ctx.fillRect(px, py, TILE, TILE);
          // Speckles, stable per tile.
          ctx.fillStyle = c2;
          const h = (x * 73856093) ^ (y * 19349663);
          for (let i = 0; i < 4; i++) {
            const sx = (h >> (i * 4)) & 0x1f;
            const sy = (h >> (i * 4 + 2)) & 0x1f;
            ctx.fillRect(px + (sx % 28) + 2, py + (sy % 28) + 2, 3, 3);
          }
        } else if (tile === T_ICE) {
          ctx.fillStyle = '#a7d8f0';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(px + 4, py + 4, 10, 3);
          ctx.fillRect(px + 4, py + 4, 3, 8);
          ctx.strokeStyle = 'rgba(70,130,180,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 18, py + 6);
          ctx.lineTo(px + 24, py + 16);
          ctx.lineTo(px + 20, py + 26);
          ctx.stroke();
        } else if (tile === T_VINE) {
          // A tangle of vines over dark dirt.
          ctx.fillStyle = c2;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = '#558b2f';
          ctx.lineWidth = 3;
          const h = (x * 31 + y * 17) % 4;
          ctx.beginPath();
          ctx.moveTo(px, py + 8 + h * 2);
          ctx.quadraticCurveTo(px + 16, py + 26 - h * 3, px + TILE, py + 10 + h);
          ctx.moveTo(px + 6 + h, py);
          ctx.quadraticCurveTo(px + 22, py + 14, px + 12 - h, py + TILE);
          ctx.stroke();
          ctx.fillStyle = '#8bc34a';
          ctx.fillRect(px + 9 + h * 3, py + 12, 5, 4);
          ctx.fillRect(px + 20 - h, py + 22, 5, 4);
        } else if (tile === T_LAVA) {
          this.drawLava(px, py, x, y);
        } else if (tile === T_BEDROCK) {
          ctx.fillStyle = '#4a4a55';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#5f5f6e';
          ctx.fillRect(px + 3, py + 3, TILE - 10, 6);
          ctx.fillStyle = '#33333c';
          ctx.fillRect(px + 6, py + TILE - 9, TILE - 9, 5);
        } else {
          ctx.fillStyle = c1;
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
    // Tunnels drawn as rounded shapes joined to open neighbours.
    ctx.fillStyle = TUNNEL;
    const inset = 4;
    for (let y = Math.max(1, v.y0); y <= v.y1; y++) {
      for (let x = v.x0; x <= v.x1; x++) {
        if (sim.tile(x, y) !== 0) continue;
        const px = x * TILE;
        const py = y * TILE;
        roundRect(ctx, px + inset, py + inset, TILE - inset * 2, TILE - inset * 2, 8);
        if (x + 1 < sim.cols && sim.tile(x + 1, y) === 0) ctx.fillRect(px + TILE / 2, py + inset, TILE, TILE - inset * 2);
        if (y + 1 < sim.rows && sim.tile(x, y + 1) === 0) ctx.fillRect(px + inset, py + TILE / 2, TILE - inset * 2, TILE);
        // Fill the gap in the middle of open 2x2 areas (blast holes, crossings).
        if (x + 1 < sim.cols && y + 1 < sim.rows && sim.tile(x + 1, y) === 0 && sim.tile(x, y + 1) === 0 && sim.tile(x + 1, y + 1) === 0) {
          ctx.fillRect(px + TILE / 2, py + TILE / 2, TILE, TILE);
        }
        if (y === 1) ctx.fillRect(px + inset, py - TILE / 2, TILE - inset * 2, TILE / 2 + 4);
      }
    }
    // Grass lip.
    ctx.fillStyle = '#6fbf4a';
    for (let x = 0; x < sim.cols; x++) {
      if (sim.tile(x, 1) !== 0) ctx.fillRect(x * TILE, TILE - 3, TILE, 5);
    }
  }

  drawItems(sim, t) {
    const ctx = this.ctx;
    for (const it of sim.items) {
      if (it.taken) continue;
      const cx = it.x * TILE + TILE / 2;
      const cy = it.y * TILE + TILE / 2;
      if (it.kind === 'gold') {
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy + 4);
        ctx.lineTo(cx - 2, cy - 5);
        ctx.lineTo(cx + 6, cy - 2);
        ctx.lineTo(cx + 5, cy + 5);
        ctx.closePath();
        ctx.fill();
        if (Math.sin(t * 3 + it.x * 1.7 + it.y) > 0.85) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx + 1, cy - 4, 2, 2);
        }
      } else if (it.kind === 'chest') {
        // Gear chest: bigger, banded, with a gold lock.
        ctx.fillStyle = '#795548';
        ctx.fillRect(cx - 11, cy - 6, 22, 14);
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 6, 11, 5, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#ffca28';
        ctx.fillRect(cx - 11, cy - 2, 22, 2);
        ctx.fillRect(cx - 2, cy - 4, 4, 6);
        if (Math.sin(t * 2 + it.x) > 0.8) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx + 7, cy - 9, 2, 2);
        }
      } else if (it.kind === 'cache') {
        // A small wooden crate with a metal band.
        ctx.fillStyle = '#a1662f';
        ctx.fillRect(cx - 8, cy - 7, 16, 14);
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(cx - 8, cy - 1, 16, 3);
        ctx.strokeStyle = '#4e342e';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 7.5, cy - 6.5, 15, 13);
        if (Math.sin(t * 2.5 + it.x + it.y * 1.3) > 0.9) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(cx + 4, cy - 6, 2, 2);
        }
      } else {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.5);
        ctx.fillStyle = '#eceff1';
        ctx.fillRect(-7, -2, 14, 4);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(s * 7, -2, 3, 0, Math.PI * 2);
          ctx.arc(s * 7, 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  drawRock(r, t) {
    const ctx = this.ctx;
    let x = r.x * TILE + TILE / 2;
    const y = (r.state === 'falling' ? r.fy : r.y) * TILE + TILE / 2;
    if (r.state === 'wobble') x += Math.sin(t * 60) * 2;
    if (r.state === 'breaking') {
      ctx.fillStyle = '#8d8d8d';
      const k = 1 - r.timer / 0.4;
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + i * 7, y + k * 8 - 4, 6, 6);
      return;
    }
    ctx.fillStyle = '#8a8580';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 14, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b3aea8';
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 4, 6, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a5550';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2);
    ctx.lineTo(x + 7, y + 7);
    ctx.stroke();
  }

  drawHose(sim) {
    const h = sim.hose;
    if (!h) return;
    const ctx = this.ctx;
    const p = sim.player;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[h.dir];
    let ex = p.x + d[0] * h.len;
    let ey = p.y + d[1] * h.len;
    if (h.state === 'attached' && h.target) {
      ex = h.target.x;
      ey = h.target.y;
    }
    ctx.strokeStyle = '#e8f1f2';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2);
    ctx.lineTo(ex * TILE + TILE / 2, ey * TILE + TILE / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.arc(ex * TILE + TILE / 2, ey * TILE + TILE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawIcicle(ic, t) {
    const ctx = this.ctx;
    let x = ic.x * TILE + TILE / 2;
    const top = (ic.state === 'falling' || ic.state === 'shatter' ? ic.fy : ic.y) * TILE;
    if (ic.state === 'shake') x += Math.sin(t * 70) * 1.5;
    if (ic.state === 'shatter') {
      ctx.fillStyle = '#e1f5fe';
      const k = 1 - ic.timer / 0.3;
      for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 5 * (1 + k), top + TILE - 6 - k * 6 + Math.abs(i) * 2, 3, 3);
      return;
    }
    ctx.fillStyle = '#e1f5fe';
    ctx.beginPath();
    ctx.moveTo(x - 8, top);
    ctx.lineTo(x + 8, top);
    ctx.lineTo(x + 1, top + 24);
    ctx.lineTo(x - 1, top + 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(79,195,247,0.6)';
    ctx.beginPath();
    ctx.moveTo(x + 2, top);
    ctx.lineTo(x + 8, top);
    ctx.lineTo(x + 1, top + 24);
    ctx.closePath();
    ctx.fill();
  }

  drawLava(px, py, x, y) {
    const ctx = this.ctx;
    const t = this.sim ? this.sim.time : 0;
    ctx.fillStyle = '#e65100';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#ff9800';
    const w = Math.sin(t * 2 + x * 1.3 + y) * 3;
    ctx.fillRect(px + 3, py + 8 + w, TILE - 6, 6);
    ctx.fillRect(px + 8, py + 20 - w, TILE - 14, 5);
    // A bubble now and then.
    const b = (t * 0.8 + x * 0.37 + y * 0.61) % 1;
    if (b < 0.35) {
      ctx.fillStyle = '#ffe082';
      ctx.beginPath();
      ctx.arc(px + 10 + ((x * 7 + y * 3) % 12), py + 18 - b * 20, 2 + b * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Creeping lava warnings, steam vents and their blasts, burning trails.
  drawMagma(sim, t) {
    const ctx = this.ctx;
    for (const s of sim.seeps) {
      const k = 1 - s.timer / 1.2;
      ctx.fillStyle = `rgba(255,112,67,${0.25 + 0.35 * k * (0.6 + 0.4 * Math.sin(t * 20))})`;
      roundRect(ctx, s.x * TILE + 3, s.y * TILE + 3, TILE - 6, TILE - 6, 8);
    }
    for (const em of sim.embers) {
      const cx = em.x * TILE + TILE / 2;
      const cy = em.y * TILE + TILE - 6;
      const k = Math.min(1, em.time / 0.6);
      ctx.globalAlpha = k;
      for (let i = -1; i <= 1; i++) {
        const h = 7 + Math.sin(t * 18 + i * 2 + em.x) * 3;
        ctx.fillStyle = '#ff7043';
        ctx.beginPath();
        ctx.moveTo(cx + i * 7 - 4, cy);
        ctx.lineTo(cx + i * 7, cy - h);
        ctx.lineTo(cx + i * 7 + 4, cy);
        ctx.fill();
        ctx.fillStyle = '#ffd54f';
        ctx.fillRect(cx + i * 7 - 1, cy - h * 0.5, 2, h * 0.5);
      }
      ctx.globalAlpha = 1;
    }
    for (const v of sim.steam) {
      const cx = v.x * TILE + TILE / 2;
      const by = v.y * TILE + TILE - 4;
      ctx.fillStyle = '#424242';
      ctx.fillRect(cx - 10, by - 4, 20, 5);
      ctx.fillStyle = v.state === 'idle' ? '#212121' : '#ff7043';
      for (let i = -7; i <= 5; i += 4) ctx.fillRect(cx + i, by - 3, 2, 3);
      if (v.state === 'warn') {
        ctx.fillStyle = 'rgba(236,239,241,0.6)';
        for (let i = 0; i < 3; i++) {
          const k = (t * 3 + i / 3) % 1;
          ctx.beginPath();
          ctx.arc(cx + (i - 1) * 6, by - 6 - k * 10, 2 + k * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (v.state === 'blast') {
        const top = sim.steamTop(v) * TILE;
        ctx.fillStyle = 'rgba(245,245,245,0.7)';
        const wob = Math.sin(t * 40) * 2;
        roundRect(ctx, cx - 11 - wob, top + 2, 22 + wob * 2, by - top - 2, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(cx - 4, top + 6, 8, by - top - 10);
      }
    }
  }

  // Glowing mushrooms, spore vents and the spore clouds themselves.
  drawFungus(sim, t) {
    const ctx = this.ctx;
    const shroom = (cx, by, s, cap) => {
      ctx.fillStyle = '#e0e0d0';
      ctx.fillRect(cx - 1.5 * s, by - 5 * s, 3 * s, 5 * s);
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.ellipse(cx, by - 5 * s, 5 * s, 3.5 * s, 0, Math.PI, 0);
      ctx.fill();
    };
    for (const g of sim.glows) {
      const cx = g.x * TILE + TILE / 2;
      const by = g.y * TILE + TILE - 6;
      shroom(cx - 6, by, 1, '#4dd0e1');
      shroom(cx + 5, by + 2, 0.7, '#80deea');
    }
    for (const v of sim.vents) {
      const cx = v.x * TILE + TILE / 2;
      const by = v.y * TILE + TILE - 4;
      // Swells just before it puffs.
      const swell = v.on <= 0 && v.timer < 0.6 ? 1 + Math.sin(t * 40) * 0.08 : 1;
      shroom(cx, by, 1.6 * swell, '#ab47bc');
      ctx.fillStyle = '#f3e5f5';
      ctx.fillRect(cx - 4, by - 10, 2, 2);
      ctx.fillRect(cx + 3, by - 9, 2, 2);
    }
  }

  // Spore clouds glow faintly, so they show even in the dark.
  drawClouds(sim, t) {
    const ctx = this.ctx;
    for (const c of sim.clouds) {
      const cx = c.x * TILE + TILE / 2;
      const cy = c.y * TILE + TILE / 2;
      const fade = Math.min(1, c.time / 0.6, (c.life - c.time) / 0.3);
      ctx.fillStyle = `rgba(186,104,200,${0.32 * fade})`;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + t * 0.6;
        const r = c.r * TILE * (0.45 + 0.1 * Math.sin(t * 2 + i));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.5, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // The Fungal Grotto is dark: only light sources cut through.
  lightsFor(sim, t) {
    const p = sim.player;
    const lights = [{ x: p.x, y: p.y, r: 3.6 }];
    for (const g of sim.glows) lights.push({ x: g.x, y: g.y, r: 1.6 });
    for (const v of sim.vents) lights.push({ x: v.x, y: v.y, r: v.on > 0 ? 2.6 : 1.8 + Math.sin(t * 2 + v.x) * 0.15 });
    for (const e of sim.enemies) {
      const span = sim.fireSpan(e);
      if (span) lights.push({ x: (span.x0 + span.x1) / 2, y: span.y, r: 2.2 });
    }
    for (const b of sim.bombs) lights.push({ x: b.x, y: b.y, r: 1.2 });
    return lights;
  }

  isLit(sim, x, y) {
    return (this.lights || []).some((l) => Math.hypot(l.x - x, l.y - y) < l.r * 0.8);
  }

  drawDark(sim, t) {
    if (!this.dark) {
      this.dark = document.createElement('canvas');
      this.dark.width = this.viewW;
      this.dark.height = this.viewH;
    }
    const d = this.dark.getContext('2d');
    const ox = Math.round(this.cam.x);
    const oy = Math.round(this.cam.y);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.viewW, this.viewH);
    d.fillStyle = 'rgba(4,2,10,0.96)';
    d.fillRect(0, 0, this.viewW, this.viewH);
    d.globalCompositeOperation = 'destination-out';
    this.lights = this.lightsFor(sim, t);
    for (const l of this.lights) {
      const x = l.x * TILE + TILE / 2 - ox;
      const y = l.y * TILE + TILE / 2 - oy;
      const r = l.r * TILE;
      if (x < -r || y < -r || x > this.viewW + r || y > this.viewH + r) continue;
      const g = d.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.ctx.drawImage(this.dark, ox, oy);
    // Foes out in the dark still give themselves away: their eyes glint.
    const ctx = this.ctx;
    for (const e of sim.enemies) {
      if (e.state === 'popped' || e.state === 'crushed' || this.isLit(sim, e.x, e.y)) continue;
      if (Math.sin(t * 1.7 + e.id * 2.3) < -0.6) continue; // a slow blink
      const cx = e.x * TILE + TILE / 2;
      const cy = e.y * TILE + TILE / 2 - 2;
      ctx.fillStyle = e.kind === 'boss' ? '#ffd54f' : '#fff59d';
      const s = e.kind === 'boss' ? 3 : 2;
      ctx.fillRect(cx - 4 - s / 2, cy, s, s);
      ctx.fillRect(cx + 3 - s / 2, cy, s, s);
    }
  }

  drawFire(sim, e, t) {
    const span = sim.fireSpan(e);
    if (!span) return;
    const ctx = this.ctx;
    const y = span.y * TILE + TILE / 2;
    const x0 = span.x0 * TILE + TILE / 2;
    const x1 = span.x1 * TILE + TILE / 2;
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    const left = e.face === 'left';
    const [c0, c1, c2] = e.frost ? ['#ffffff', '#81d4fa', 'rgba(41,182,246,0.5)'] : ['#fff59d', '#ff9800', 'rgba(229,57,53,0.6)'];
    g.addColorStop(left ? 1 : 0, c0);
    g.addColorStop(0.5, c1);
    g.addColorStop(left ? 0 : 1, c2);
    ctx.fillStyle = g;
    const wob = Math.sin(t * 40) * 2;
    roundRect(ctx, x0, y - 9 - wob, x1 - x0, 18 + wob * 2, 9);
  }

  popThresholdFor(e) {
    return this.sim ? this.sim.popThreshold(e) : e.popAt;
  }

  drawEnemy(e, t) {
    const ctx = this.ctx;
    const cx = e.x * TILE + TILE / 2;
    const cy = e.y * TILE + TILE / 2;
    const flip = e.face === 'left' ? -1 : 1;
    const boss = e.kind === 'boss';
    const base = boss ? 1.7 : 1;

    if (e.state === 'popped') {
      const k = 1 - e.timer / 0.35;
      ctx.strokeStyle = boss ? '#ffd54f' : '#c5e1a5';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r1 = 6 + k * 14 * base;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1 * 0.5, cy + Math.sin(a) * r1 * 0.5);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      return;
    }
    if (e.state === 'crushed') {
      ctx.fillStyle = KIND_COLOR[e.kind] || '#7cb342';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (e.state === 'ghost') {
      // Only the eyes drift through the dirt.
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, 11 * base, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, cx, cy, flip, e.kind === 'mini' ? 0.7 : base, '#fff', KIND_COLOR[e.kind] || '#ffd54f');
      ctx.globalAlpha = 1;
      return;
    }

    const infl = e.state === 'inflated' ? Math.min(1, e.inflation / this.popThresholdFor(e)) : 0;
    const scale = base * (e.kind === 'mini' ? 0.6 : 1) * (1 + infl * 0.9);
    ctx.save();
    ctx.translate(cx, cy);
    if (e.state === 'charge' && Math.floor(t * 16) % 2 === 0) ctx.globalAlpha = 0.6;

    if (e.kind === 'scorch' || e.kind === 'chiller') {
      const pal = e.kind === 'chiller'
        ? { body: '#29b6f6', head: '#4fc3f7', spikes: '#e1f5fe', feet: '#01579b' }
        : { body: '#e64a19', head: '#ff7043', spikes: '#ffb300', feet: '#5d1f0f' };
      const bob = e.moving ? Math.sin(t * 14) * 1.5 : 0;
      ctx.scale(flip * scale, scale);
      // Salamander: body, tail, spikes, snout.
      ctx.fillStyle = infl ? lerpColor(pal.body, '#ffffff', infl * 0.7) : pal.body;
      ctx.beginPath();
      ctx.ellipse(-1, 2 + bob, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-9, 2);
      ctx.quadraticCurveTo(-16, -2, -15, 8);
      ctx.lineTo(-8, 6);
      ctx.fill();
      ctx.fillStyle = pal.spikes;
      for (let i = -6; i <= 4; i += 5) {
        ctx.beginPath();
        ctx.moveTo(i - 2, -5 + bob);
        ctx.lineTo(i, -10 + bob);
        ctx.lineTo(i + 2, -5 + bob);
        ctx.fill();
      }
      ctx.fillStyle = infl ? lerpColor(pal.head, '#ffffff', infl * 0.7) : pal.head;
      ctx.beginPath();
      ctx.ellipse(9, 0 + bob, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(8, -4 + bob, 4, 4);
      ctx.fillStyle = '#111';
      ctx.fillRect(10, -3 + bob, 2, 2);
      ctx.fillStyle = pal.feet;
      ctx.fillRect(-8, 8 + bob, 3, 3);
      ctx.fillRect(4, 8 + bob, 3, 3);
    } else if (e.kind === 'magmite') {
      // A slug of cooling rock with molten cracks.
      const ooze = e.moving ? Math.sin(t * 10) * 1.5 : 0;
      ctx.scale(flip * scale, scale);
      ctx.fillStyle = infl ? lerpColor('#4e342e', '#ffccbc', infl) : '#4e342e';
      ctx.beginPath();
      ctx.ellipse(-1, 4, 13 + ooze, 7 - ooze * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(7, -1, 6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 4);
      ctx.lineTo(-5, 1);
      ctx.lineTo(-1, 6);
      ctx.lineTo(4, 2);
      ctx.stroke();
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(8, -3, 3, 3);
    } else if (e.kind === 'sporeling') {
      // A walking mushroom with a spotted cap.
      const bob = e.moving ? Math.abs(Math.sin(t * 12)) * 2 : 0;
      ctx.scale(flip * scale, scale);
      ctx.fillStyle = infl ? lerpColor('#efe6d8', '#ffffff', infl) : '#efe6d8';
      roundRect(ctx, -6, -2 - bob, 12, 13, 4);
      ctx.fillStyle = infl ? lerpColor('#8e24aa', '#f3e5f5', infl * 0.7) : '#8e24aa';
      ctx.beginPath();
      ctx.ellipse(0, -3 - bob, 13, 9, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f3e5f5';
      ctx.beginPath();
      ctx.arc(-6, -7 - bob, 2.2, 0, Math.PI * 2);
      ctx.arc(2, -9 - bob, 2.6, 0, Math.PI * 2);
      ctx.arc(8, -5 - bob, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 1 - bob, 2, 3);
      ctx.fillRect(4, 1 - bob, 2, 3);
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(-5, 10, 4, 2);
      ctx.fillRect(2, 10, 4, 2);
    } else if (e.kind === 'gnawler') {
      // Mole-like chewer with a drill snout; it shudders while digging.
      const shake = e.digging ? Math.sin(t * 50) * 1 : 0;
      ctx.scale(flip * scale, scale);
      ctx.translate(shake, 0);
      ctx.fillStyle = infl ? lerpColor('#8d6e63', '#efebe9', infl) : '#8d6e63';
      ctx.beginPath();
      ctx.ellipse(-2, 2, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bdbdbd';
      ctx.beginPath();
      ctx.moveTo(7, -4);
      ctx.lineTo(16, 1);
      ctx.lineTo(7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#757575';
      ctx.lineWidth = 1;
      for (const x of [9, 12]) {
        ctx.beginPath();
        ctx.moveTo(x, -2);
        ctx.lineTo(x, 4);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(1, 5, 3, 4);
      ctx.fillRect(-3, 5, 3, 4);
      ctx.fillStyle = '#111';
      ctx.fillRect(1, -4, 3, 3);
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(-10, 9, 4, 3);
      ctx.fillRect(2, 9, 4, 3);
    } else if (e.kind === 'shellback') {
      // Beetle with an armour plate on the side it is heading toward.
      ctx.scale(scale, scale);
      const d = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[e.dir] || 0;
      ctx.fillStyle = infl ? lerpColor('#26a69a', '#e0f2f1', infl) : '#26a69a';
      ctx.beginPath();
      ctx.ellipse(0, 1, 11, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#004d40';
      ctx.fillRect(-1, -8, 2, 18);
      ctx.save();
      ctx.rotate(d);
      if (!infl) {
        ctx.fillStyle = '#b0bec5';
        ctx.beginPath();
        ctx.arc(2, 0, 13, -1.1, 1.1);
        ctx.arc(2, 0, 8, 1.1, -1.1, true);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(6, -5, 3, 3);
      ctx.fillRect(6, 2, 3, 3);
      ctx.restore();
    } else {
      // Puffling, Splitter, its Minis, and the boss (a crowned giant one).
      const squish = e.moving ? 1 + Math.sin(t * 12) * 0.06 : 1;
      ctx.scale(scale * squish, scale / squish);
      const body = boss ? (e.frost ? '#81d4fa' : e.spores ? '#9c27b0' : e.trail ? '#ff5722' : ['#7e57c2', '#ab47bc', '#26a69a'][e.level - 1]) : KIND_COLOR[e.kind];
      ctx.fillStyle = infl ? lerpColor(body, '#f1f8e9', infl * 0.8) : body;
      ctx.beginPath();
      ctx.arc(0, 1, 11, Math.PI, 0);
      ctx.lineTo(11, 10);
      for (let i = 0; i < 4; i++) {
        const x = 11 - (i + 0.5) * 5.5;
        ctx.lineTo(x, 6);
        ctx.lineTo(x - 2.75, 10);
      }
      ctx.closePath();
      ctx.fill();
      if (e.kind === 'splitter') {
        // The seam it splits along.
        ctx.strokeStyle = '#6a1b9a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(-3 * flip, -10);
        ctx.lineTo(-3 * flip, 9);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(3 * flip, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a237e';
      ctx.beginPath();
      ctx.arc(4.5 * flip, -2, 2.3, 0, Math.PI * 2);
      ctx.fill();
      if (boss) {
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.moveTo(-7, -9);
        ctx.lineTo(-7, -16);
        ctx.lineTo(-3, -12);
        ctx.lineTo(0, -17);
        ctx.lineTo(3, -12);
        ctx.lineTo(7, -16);
        ctx.lineTo(7, -9);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (e.frozen > 0) {
      // An ice block around frozen foes, flickering as it thaws.
      const thaw = e.frozen < 1 && Math.floor(t * 10) % 2 === 0;
      ctx.fillStyle = thaw ? 'rgba(179,229,252,0.25)' : 'rgba(179,229,252,0.5)';
      ctx.strokeStyle = '#e1f5fe';
      ctx.lineWidth = 2;
      const r = 14 * (boss ? 1.6 : 1);
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  drawGadgets(sim, t) {
    const ctx = this.ctx;
    for (const b of sim.bombs) {
      const cx = b.x * TILE + TILE / 2;
      const cy = b.y * TILE + TILE / 2;
      const flash = b.fuse < BOMB_FUSE * 0.4 ? Math.floor(t * 16) % 2 === 0 : Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ef5350' : '#263238';
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 5);
      ctx.quadraticCurveTo(cx + 8, cy - 12, cx + 4, cy - 14);
      ctx.stroke();
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(cx + 2 + Math.sin(t * 30), cy - 16, 3, 3);
    }
    const d = sim.decoy;
    if (d) {
      const cx = d.x * TILE + TILE / 2;
      const cy = d.y * TILE + TILE / 2 + Math.sin(t * 8) * 2;
      ctx.globalAlpha = d.time < 1.5 && Math.floor(t * 10) % 2 === 0 ? 0.4 : 1;
      ctx.fillStyle = '#ff8a65';
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 6, cy - 8, 4, 0, Math.PI * 2);
      ctx.arc(cx + 6, cy - 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#212121';
      ctx.fillRect(cx - 4, cy - 3, 2, 2);
      ctx.fillRect(cx + 2, cy - 3, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px "Press Start 2P", ui-monospace, monospace';
      ctx.textAlign = 'center';
      if (Math.floor(t * 3) % 2 === 0) ctx.fillText('SQUEAK', cx, cy - 16);
      ctx.globalAlpha = 1;
    }
    if (sim.drillTime > 0 && sim.player.walking) {
      const p = sim.player;
      if (Math.random() < 0.6) this.burst(p.x, p.y, '#ffe082', 1);
    }
  }

  // Item slots along the bottom-left of the view.
  drawPack(sim) {
    const ctx = this.ctx;
    const size = 26;
    const y = this.viewH - size - 6;
    for (let i = 0; i < sim.slots; i++) {
      const x = 6 + i * (size + 4);
      const id = sim.pack[i];
      const sel = id && i === sim.selected;
      ctx.fillStyle = 'rgba(11,9,16,0.7)';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = sel ? '#ffd54f' : 'rgba(245,230,200,0.35)';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      if (id) {
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ITEM_BY_ID[id].icon, x + size / 2, y + size / 2 + 1);
      }
    }
    // Gear icons along the bottom-right.
    for (let i = 0; i < sim.gear.length; i++) {
      const x = this.viewW - 6 - (i + 1) * (size + 4) + 4;
      ctx.fillStyle = 'rgba(11,9,16,0.7)';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = 'rgba(255,202,40,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(GEAR_BY_ID[sim.gear[i]].icon, x + size / 2, y + size / 2 + 1);
    }
    if (sim.pack.length) {
      ctx.font = '8px "Press Start 2P", ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(245,230,200,0.75)';
      ctx.fillText(sim.pack.length > 1 ? 'E use  Q swap' : 'E use', 10 + sim.slots * (size + 4), y + size / 2);
    }
    ctx.textBaseline = 'middle';
  }

  drawPlayer(p, t, sim) {
    const ctx = this.ctx;
    this.lastPlayer = p;
    const cx = p.x * TILE + TILE / 2;
    const cy = p.y * TILE + TILE / 2;
    if (!p.alive) {
      const k = Math.min(1, (1.6 - sim.statusTimer) / 0.8);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(k * Math.PI * 2);
      ctx.globalAlpha = 1 - k * 0.6;
      drawMiner(ctx, 1, 0, false);
      ctx.restore();
      return;
    }
    if (p.invuln > 0 && Math.floor(t * 12) % 2 === 0) return;
    const flip = p.face === 'left' ? -1 : 1;
    const step = p.walking ? Math.sin(t * 18) : 0;
    ctx.save();
    // A little hop in the step, and a squash while pumping.
    ctx.translate(cx, cy - (p.walking ? Math.abs(step) * 1.5 : 0));
    if (sim.hose) ctx.scale(1 + Math.sin(t * 30) * 0.04, 1 - Math.sin(t * 30) * 0.04);
    if (p.dir === 'up' && p.moving) ctx.rotate(-Math.PI / 2 * flip);
    if (p.dir === 'down' && p.moving) ctx.rotate(Math.PI / 2 * flip);
    drawMiner(ctx, flip, step, !!sim.hose);
    ctx.restore();
    if (p.chilled > 0) {
      ctx.fillStyle = 'rgba(179,229,252,0.55)';
      ctx.strokeStyle = '#e1f5fe';
      ctx.lineWidth = 2;
      ctx.fillRect(cx - 14, cy - 16, 28, 30);
      ctx.strokeRect(cx - 14, cy - 16, 28, 30);
    }
    if (p.shield > 0) {
      ctx.strokeStyle = `rgba(79,195,247,${0.35 + Math.sin(t * 4) * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawFx() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      const sz = p.size || 4;
      ctx.fillRect(p.x * TILE + TILE / 2 - sz / 2, p.y * TILE + TILE / 2 - sz / 2, sz, sz);
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x * TILE + TILE / 2, r.y * TILE + TILE / 2, (0.3 + k * r.radius) * TILE, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 11px "Press Start 2P", ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      ctx.globalAlpha = 1 - p.t / 1.1;
      const x = p.x * TILE + TILE / 2;
      const y = p.y * TILE + TILE / 2 - 10 - p.t * 24;
      // Pop in a little oversized, then settle.
      const k = p.t < 0.12 ? 1 + (1 - p.t / 0.12) * 0.6 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      ctx.fillStyle = '#000';
      ctx.fillText(p.text, 1, 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawMinimap(sim) {
    const ctx = this.ctx;
    const s = 2;
    const w = sim.cols * s;
    const h = sim.rows * s;
    const ox = this.viewW - w - 6;
    const oy = 6;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(ox - 2, oy - 2, w + 4, h + 4);
    for (let y = 0; y < sim.rows; y++) {
      for (let x = 0; x < sim.cols; x++) {
        const t = sim.tile(x, y);
        ctx.fillStyle = t === 0 ? '#1d1626' : t === T_BEDROCK ? '#5f5f6e' : t === T_ICE ? '#a7d8f0' : t === T_VINE ? '#4e7d3a' : t === T_LAVA ? '#ff6d00' : sim.zone === 'frozen' ? '#8fb0c9' : sim.zone === 'fungal' ? '#3a3050' : sim.zone === 'magma' ? '#55291f' : '#6d4c41';
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }
    ctx.globalAlpha = 1;
    for (const e of sim.enemies) {
      if (e.state === 'popped' || e.state === 'crushed') continue;
      // In the dark, only foes you can see show up.
      if (sim.zone === 'fungal' && e.kind !== 'boss' && !this.isLit(sim, e.x, e.y)) continue;
      ctx.fillStyle = e.kind === 'boss' ? '#ffd54f' : KIND_COLOR[e.kind] || '#9ccc65';
      const r = e.kind === 'boss' ? 4 : 2;
      ctx.fillRect(ox + e.x * s + 1 - r / 2, oy + e.y * s + 1 - r / 2, r, r);
    }
    if (sim.stats.compass) {
      const colors = { fossil: '#e1f5fe', cache: '#ffb74d', chest: '#ffca28' };
      for (const it of sim.items) {
        if (it.taken || !colors[it.kind]) continue;
        ctx.fillStyle = colors[it.kind];
        ctx.fillRect(ox + it.x * s, oy + it.y * s, 2, 2);
      }
    }
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(ox + sim.player.x * s - 1, oy + sim.player.y * s - 1, 4, 4);
    ctx.strokeStyle = 'rgba(245,230,200,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + (this.cam.x / TILE) * s + 0.5, oy + (this.cam.y / TILE) * s + 0.5, VIEW_COLS * s, VIEW_ROWS * s);
  }

  drawBanner(sim, banner) {
    const ctx = this.ctx;
    const w = this.viewW;
    const y = this.viewH * 0.32;
    ctx.fillStyle = 'rgba(10,8,14,0.82)';
    ctx.fillRect(0, y - 44, w, 88);
    ctx.textAlign = 'center';
    ctx.fillStyle = banner.color || '#ffd54f';
    ctx.font = 'bold 20px "Press Start 2P", ui-monospace, monospace';
    ctx.fillText(banner.title, w / 2, y - 10);
    if (banner.sub) {
      ctx.fillStyle = '#f5e6c8';
      ctx.font = '11px "Press Start 2P", ui-monospace, monospace';
      ctx.fillText(banner.sub, w / 2, y + 22);
    }
  }
}

function drawMiner(ctx, flip, step, pumping) {
  ctx.scale(flip, 1);
  // Legs
  ctx.fillStyle = '#37474f';
  ctx.fillRect(-6, 7 + step * 1.5, 5, 6);
  ctx.fillRect(2, 7 - step * 1.5, 5, 6);
  // Body (orange overalls)
  ctx.fillStyle = '#ff8f00';
  roundRect(ctx, -8, -3, 16, 13, 4);
  ctx.fillStyle = '#ffb74d';
  ctx.fillRect(-3, -1, 6, 4);
  // Arm + pump nozzle
  ctx.fillStyle = '#ff8f00';
  ctx.fillRect(5, 0, 6, 4);
  ctx.fillStyle = pumping ? '#4fc3f7' : '#90a4ae';
  ctx.fillRect(10, -1, 5, 6);
  // Head
  ctx.fillStyle = '#ffccbc';
  ctx.beginPath();
  ctx.arc(1, -8, 6, 0, Math.PI * 2);
  ctx.fill();
  // Helmet with lamp
  ctx.fillStyle = '#1e88e5';
  ctx.beginPath();
  ctx.arc(0, -10, 7, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-7, -11, 15, 3);
  ctx.fillStyle = '#fff59d';
  ctx.fillRect(4, -15, 4, 4);
  // Eye
  ctx.fillStyle = '#212121';
  ctx.fillRect(3, -8, 2, 2);
}

function drawEyes(ctx, cx, cy, flip, s, white, pupil) {
  for (const o of [-4, 4]) {
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.arc(cx + o * s, cy - 1, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(cx + o * s + 1.5 * flip * s, cy - 1, 2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShield(ctx, x, y, r) {
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y - r);
  ctx.lineTo(x + r, y);
  ctx.quadraticCurveTo(x + r, y + r, x, y + r * 1.3);
  ctx.quadraticCurveTo(x - r, y + r, x - r, y);
  ctx.closePath();
  ctx.fill();
}

function drawHeart(ctx, x, y, r) {
  ctx.fillStyle = '#ef5350';
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function lerpColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [ar, ag, ab] = ch(pa);
  const [br, bg, bb] = ch(pb);
  const m = (x, y) => Math.round(x + (y - x) * Math.min(1, Math.max(0, k)));
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}
