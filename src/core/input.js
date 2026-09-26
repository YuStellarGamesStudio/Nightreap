export class Input {
  constructor(canvas, toWorld, onAction) {
    this.keys = new Set();
    this.aim = { x: 0, y: 0 };
    this.attack = false;
    this.secondary = false;
    this.secondaryQueued = false;
    this.canvas = canvas;
    canvas.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      this.aim = toWorld(event.clientX - rect.left, event.clientY - rect.top);
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.button !== 2) return;
      if (event.button === 2) event.preventDefault();
      canvas.focus();
      if (event.button === 0) this.attack = true;
      else {
        this.secondary = true;
        // pointerup often arrives before the next simulation step, so a click must stay queued.
        this.secondaryQueued = true;
      }
      const rect = canvas.getBoundingClientRect();
      this.aim = toWorld(event.clientX - rect.left, event.clientY - rect.top);
      onAction('gesture');
    });
    window.addEventListener('pointerup', event => {
      if (event.button === 0) this.attack = false;
      if (event.button === 2) this.secondary = false;
    });
    document.addEventListener('contextmenu', event => {
      event.preventDefault();
    });
    window.addEventListener('keydown', event => {
      if (canvas.closest('[inert]') || event.target.matches('input, select, textarea') || event.target.closest('dialog[open]')) return;
      const key = event.key.toLowerCase();
      if (['tab',' ','arrowup','arrowdown'].includes(key)) event.preventDefault();
      this.keys.add(key);
      if (!event.repeat) onAction(key);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }
  get moveX() { return Number(this.keys.has('d')) - Number(this.keys.has('a')); }
  get moveY() { return Number(this.keys.has('s')) - Number(this.keys.has('w')); }
  clear() { this.keys.clear(); this.attack = false; this.secondary = false; this.secondaryQueued = false; }
  takeSecondary() {
    const queued = this.secondaryQueued;
    this.secondaryQueued = false;
    return this.secondary || queued;
  }
}
