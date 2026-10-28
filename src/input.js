// Keyboard (and optional touch) input. The newest held direction wins.

const KEY_DIRS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
const PUMP_KEYS = new Set(['Space', 'KeyZ', 'KeyJ', 'KeyX']);

export class Input {
  constructor(target = window) {
    this.held = []; // direction stack, newest last
    this.pumpDown = false;
    this.pumpEdge = false;
    this.listeners = new Set();
    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('blur', () => this.reset());
  }

  onKey(e, down) {
    const dir = KEY_DIRS[e.code];
    if (dir) {
      e.preventDefault();
      this.setDir(dir, down);
      return;
    }
    if (PUMP_KEYS.has(e.code)) {
      e.preventDefault();
      this.setPump(down, e.repeat);
      return;
    }
    if (down && !e.repeat) for (const fn of this.listeners) fn(e.code, e);
  }

  setDir(dir, down) {
    this.held = this.held.filter((d) => d !== dir);
    if (down) this.held.push(dir);
  }

  setPump(down, repeat = false) {
    if (down && !this.pumpDown && !repeat) this.pumpEdge = true;
    this.pumpDown = down;
  }

  onPress(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Snapshot for one simulation step; clears edge-triggered state.
  sample() {
    const s = {
      dir: this.held.length ? this.held[this.held.length - 1] : null,
      pumpPressed: this.pumpEdge,
      pumpHeld: this.pumpDown,
    };
    this.pumpEdge = false;
    return s;
  }

  reset() {
    this.held = [];
    this.pumpDown = false;
    this.pumpEdge = false;
  }

  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-dir]')) {
      const dir = el.dataset.dir;
      const on = (e) => { e.preventDefault(); this.setDir(dir, true); };
      const off = (e) => { e.preventDefault(); this.setDir(dir, false); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    }
    const pump = root.querySelector('[data-pump]');
    if (pump) {
      pump.addEventListener('pointerdown', (e) => { e.preventDefault(); this.setPump(true); });
      const up = (e) => { e.preventDefault(); this.setPump(false); };
      pump.addEventListener('pointerup', up);
      pump.addEventListener('pointerleave', up);
      pump.addEventListener('pointercancel', up);
    }
  }
}
