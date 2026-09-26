export class Input {
  constructor(canvas, toWorld, onAction) {
    this.keys = new Set();
    this.aim = { x: 0, y: 0 };
    this.attack = false;
    this.canvas = canvas;
    canvas.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      this.aim = toWorld(event.clientX - rect.left, event.clientY - rect.top);
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      canvas.focus(); this.attack = true;
      const rect = canvas.getBoundingClientRect();
      this.aim = toWorld(event.clientX - rect.left, event.clientY - rect.top);
      onAction('gesture');
    });
    window.addEventListener('pointerup', () => { this.attack = false; });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    window.addEventListener('keydown', event => {
      if (event.target.matches('input, select, textarea')) return;
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
  clear() { this.keys.clear(); this.attack = false; }
}
