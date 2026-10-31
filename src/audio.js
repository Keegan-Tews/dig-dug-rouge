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
  chill: { type: 'sine', f: [1600, 400], d: 0.4, v: 0.08 },
  crack: { type: 'square', f: [2000, 1800], d: 0.06, v: 0.05 },
  shatter: { type: 'triangle', f: [2400, 600], d: 0.25, v: 0.08 },
  spore: { type: 'sine', f: [300, 180], d: 0.3, v: 0.04 },
  spored: { type: 'triangle', f: [500, 250], d: 0.25, v: 0.06 },
  lava: { type: 'sawtooth', f: [90, 60], d: 0.25, v: 0.04 },
  hiss: { type: 'sawtooth', f: [3000, 2600], d: 0.5, v: 0.015 },
  steam: { type: 'sawtooth', f: [1800, 600], d: 0.6, v: 0.05 },
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

// Impacts get a burst of filtered noise on top of the tone so they thump.
const NOISE = {
  boom: { d: 0.6, v: 0.35, cut: 900 },
  crush: { d: 0.35, v: 0.25, cut: 600 },
  rock: { d: 0.18, v: 0.15, cut: 500 },
  hurt: { d: 0.2, v: 0.18, cut: 2000 },
  death: { d: 0.5, v: 0.2, cut: 1200 },
  pop: { d: 0.08, v: 0.12, cut: 3000 },
  shatter: { d: 0.2, v: 0.1, cut: 5000 },
};

const SETTINGS_KEY = 'tunnelpop_audio';

export class Sfx {
  constructor(storage = null) {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.storage = storage;
    this.muted = false;
    this.lastDig = 0;
    try {
      this.muted = JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}').muted === true;
    } catch {
      this.muted = false;
    }
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify({ muted: this.muted }));
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this session.
    }
    return this.muted;
  }

  // `pitch` scales the sound's frequencies, e.g. to climb with each pump.
  play(name, pitch = 1) {
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
    osc.frequency.setValueAtTime(s.f[0] * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(s.f[1] * pitch, now + s.d);
    gain.gain.setValueAtTime(s.v, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + s.d);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + s.d + 0.02);
    const n = NOISE[name];
    if (n && this.noise) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(n.cut, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + n.d);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(n.v, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + n.d);
      src.connect(filter).connect(ng).connect(this.master);
      src.start(now);
      src.stop(now + n.d + 0.02);
    }
  }
}
