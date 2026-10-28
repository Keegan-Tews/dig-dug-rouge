// Tiny synthesized sound effects via WebAudio. No audio files needed.

const SOUNDS = {
  dig: { type: 'square', f: [120, 90], d: 0.04, v: 0.03 },
  hose: { type: 'sawtooth', f: [500, 900], d: 0.08, v: 0.04 },
  pump: { type: 'square', f: [300, 520], d: 0.07, v: 0.06 },
  pop: { type: 'triangle', f: [900, 180], d: 0.18, v: 0.12 },
  crush: { type: 'sawtooth', f: [140, 40], d: 0.3, v: 0.12 },
  rock: { type: 'triangle', f: [90, 50], d: 0.2, v: 0.1 },
  wobble: { type: 'square', f: [70, 80], d: 0.12, v: 0.04 },
  gold: { type: 'square', f: [880, 1320], d: 0.1, v: 0.05 },
  fossil: { type: 'triangle', f: [660, 1760], d: 0.3, v: 0.08 },
  fire: { type: 'sawtooth', f: [200, 90], d: 0.4, v: 0.06 },
  clang: { type: 'square', f: [1400, 1300], d: 0.08, v: 0.06 },
  split: { type: 'sine', f: [500, 900], d: 0.15, v: 0.07 },
  gear: { type: 'triangle', f: [392, 1175], d: 0.35, v: 0.09 },
  item: { type: 'square', f: [523, 784], d: 0.15, v: 0.07 },
  boom: { type: 'sawtooth', f: [180, 30], d: 0.5, v: 0.16 },
  use: { type: 'triangle', f: [700, 500], d: 0.1, v: 0.06 },
  cycle: { type: 'square', f: [900, 900], d: 0.04, v: 0.04 },
  shield: { type: 'triangle', f: [1200, 600], d: 0.2, v: 0.08 },
  hurt: { type: 'square', f: [400, 100], d: 0.3, v: 0.1 },
  death: { type: 'square', f: [600, 60], d: 0.9, v: 0.12 },
  cleared: { type: 'triangle', f: [523, 1046], d: 0.5, v: 0.1 },
  buy: { type: 'square', f: [660, 990], d: 0.12, v: 0.06 },
  select: { type: 'triangle', f: [440, 660], d: 0.08, v: 0.06 },
  spawn: { type: 'sine', f: [200, 400], d: 0.2, v: 0.05 },
};

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastDig = 0;
  }

  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) this.ctx = new AC();
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    const s = SOUNDS[name];
    if (!s) return;
    const now = this.ctx.currentTime;
    if (name === 'dig') {
      if (now - this.lastDig < 0.09) return;
      this.lastDig = now;
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = s.type;
    osc.frequency.setValueAtTime(s.f[0], now);
    osc.frequency.exponentialRampToValueAtTime(s.f[1], now + s.d);
    gain.gain.setValueAtTime(s.v, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + s.d);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + s.d + 0.02);
  }
}
