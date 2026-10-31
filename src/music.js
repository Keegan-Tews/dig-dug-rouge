// Looping chiptune music, sequenced live with WebAudio. Each track is two bars
// of 16th notes: a lead line, a bass line and a drum line.
//
// Notes are semitones from the track's root (a MIDI number); '.' is a rest.
// Drums: k = kick, s = snare, h = hi-hat, . = rest.

export const STEPS = 32;

export const TRACKS = {
  title: {
    root: 57, bpm: 96, lead: 'triangle',
    notes: '0 . . 3 . . 7 . 10 . 7 . 3 . 5 . 7 . . 3 . . 0 . -2 . 0 . 3 . . .',
    bass: '-12 . . . . . . . -9 . . . . . . . -7 . . . . . . . -5 . . . -7 . . .',
    drums: 'k.......h.......k.....k.h.......',
  },
  topsoil: {
    root: 60, bpm: 132, lead: 'square',
    notes: '0 . 4 . 7 . 4 . 9 . 7 . 4 . 2 . 0 . 4 . 7 . 12 . 11 . 7 . 9 . 7 .',
    bass: '-12 . . . -12 . -5 . -7 . . . -7 . -5 . -12 . . . -12 . -5 . -5 . . . -5 . -1 .',
    drums: 'k.h.s.h.k.h.s.hhk.h.s.h.k.k.s.h.',
  },
  bedrock: {
    root: 55, bpm: 124, lead: 'square',
    notes: '0 . . 0 3 . 5 . 7 . . 5 3 . 0 . 10 . . 7 8 . 7 . 5 . 3 . 5 . . .',
    bass: '-12 . -12 . . . -12 . -9 . -9 . . . -7 . -4 . -4 . . . -4 . -5 . -5 . -7 . . .',
    drums: 'k...s..kk...s...k...s..kk.s.s.s.',
  },
  frozen: {
    root: 64, bpm: 108, lead: 'triangle',
    notes: '12 . 7 . 3 . 7 . 15 . 12 . 7 . 14 . 10 . 7 . 10 . 12 . . . 7 . . . . .',
    bass: '-12 . . . . . . . -16 . . . . . . . -14 . . . . . . . -9 . . . . . . .',
    drums: 'k...h...h.h.h...k...h...h.h.h.h.',
  },
  fungal: {
    root: 50, bpm: 84, lead: 'sine',
    notes: '0 . . . 1 . . . 0 . . . -2 . . . 3 . . 1 . . 0 . . . . . . . . .',
    bass: '-12 . . . . . . . . . . . . . . . -11 . . . . . . . . . . . . . . .',
    drums: 'k.........h.....k.......h...h...',
  },
  deep: {
    root: 52, bpm: 120, lead: 'square',
    notes: '0 . 0 . 3 . 0 . 7 . 6 . 3 . . . 0 . 0 . 3 . 0 . 10 . 7 . 6 . 3 .',
    bass: '-12 . . -12 . . -12 . -12 . . -12 . . -10 . -12 . . -12 . . -12 . -14 . . -14 . . -10 .',
    drums: 'k..k..s.k..k..s.k..k..s.k.k.s.ss',
  },
  magma: {
    root: 53, bpm: 146, lead: 'sawtooth',
    notes: '0 . 0 3 . 0 5 . 6 . 5 3 . 0 . . 0 . 0 3 . 0 5 . 8 . 6 5 . 3 . .',
    bass: '-12 -12 . -12 -12 . -12 . -12 -12 . -12 -12 . -9 . -12 -12 . -12 -12 . -12 . -7 -7 . -7 -6 . -6 .',
    drums: 'k.hks.h.k.hks.hhk.hks.h.k.hks.ss',
  },
  boss: {
    root: 57, bpm: 160, lead: 'square',
    notes: '0 . 3 . 0 . 6 . 7 . 6 . 3 . 0 . 0 . 3 . 0 . 6 . 10 . 9 . 7 . 6 .',
    bass: '-12 -12 -12 -12 -12 -12 -12 -12 -9 -9 -9 -9 -9 -9 -9 -9 -12 -12 -12 -12 -12 -12 -12 -12 -6 -6 -6 -6 -5 -5 -5 -5',
    drums: 'k.s.k.s.k.s.k.sskks.k.s.k.s.ksss',
  },
  shop: {
    root: 65, bpm: 104, lead: 'triangle',
    notes: '0 . 4 . 7 . 9 . 7 . 4 . 2 . 4 . 0 . 4 . 7 . 12 . 9 . 7 . 4 . . .',
    bass: '-12 . . . -5 . . . -10 . . . -3 . . . -12 . . . -5 . . . -7 . . . -5 . . .',
    drums: 'k...h.s.k.k.h.s.k...h.s.k.k.h.sh',
  },
};

// Turn a track's pattern strings into per-step arrays of numbers / nulls.
export function parseTrack(track) {
  const notes = (str) => str.trim().split(/\s+/).map((t) => (t === '.' ? null : Number(t)));
  return {
    ...track,
    notes: notes(track.notes),
    bass: notes(track.bass),
    drums: track.drums.split('').map((c) => (c === '.' ? null : c)),
  };
}

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  constructor(sfx, settings) {
    this.sfx = sfx;
    this.settings = settings;
    this.out = null;
    this.track = null;
    this.trackId = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.parsed = {};
  }

  get ctx() {
    return this.sfx.ctx;
  }

  // Start (or keep) a track. Passing null stops the music.
  play(id) {
    if (id === this.trackId) return;
    this.trackId = id;
    if (!this.ctx) return; // picked up by start() once audio unlocks
    this.start();
  }

  start() {
    if (!this.ctx) return;
    if (!this.out) {
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.sfx.master);
    }
    const id = this.trackId;
    this.track = id ? (this.parsed[id] ||= parseTrack(TRACKS[id])) : null;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.applyVolume();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  }

  applyVolume() {
    if (!this.out) return;
    const now = this.ctx.currentTime;
    const v = this.settings.music && this.track ? 0.32 : 0;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(v, now + 0.3);
  }

  tick() {
    const ctx = this.ctx;
    if (!ctx || !this.track || !this.settings.music) return;
    // Never try to catch up after the tab was hidden; just resync.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02;
    const stepLen = 60 / this.track.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepLen);
      this.step = (this.step + 1) % STEPS;
      this.nextTime += stepLen;
    }
  }

  playStep(i, t, len) {
    const tr = this.track;
    const n = tr.notes[i % tr.notes.length];
    if (n !== null) this.tone(tr.lead, midiHz(tr.root + n), t, len * 1.8, 0.05);
    const b = tr.bass[i % tr.bass.length];
    if (b !== null) this.tone('triangle', midiHz(tr.root + b), t, len * 1.6, 0.11);
    const d = tr.drums[i % tr.drums.length];
    if (d === 'k') this.kick(t);
    else if (d === 's') this.hit(t, 'bandpass', 1800, 0.12, 0.09);
    else if (d === 'h') this.hit(t, 'highpass', 7000, 0.04, 0.035);
  }

  tone(type, hz, t, dur, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  kick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  hit(t, type, freq, dur, vol) {
    const ctx = this.ctx;
    if (!this.sfx.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
  }
}
