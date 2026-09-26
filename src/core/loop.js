import { CONFIG } from '../data/config.js?v=f28e6c5b4673f66a';

export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.accumulator = 0;
    this.last = null;
    this.running = false;
    this.frame = this.frame.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = null;
    this.handle = requestAnimationFrame(this.frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.handle); }
  frame(now) {
    if (!this.running) return;
    const elapsed = this.last === null ? 0 : Math.min((now - this.last) / 1000, CONFIG.maxFrame);
    this.last = now;
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= CONFIG.step && steps < CONFIG.maxSteps) {
      this.update(CONFIG.step);
      this.accumulator -= CONFIG.step;
      steps++;
    }
    // Drop overdue simulation time instead of entering an unbounded catch-up spiral.
    if (steps === CONFIG.maxSteps) this.accumulator %= CONFIG.step;
    this.render(this.accumulator / CONFIG.step, elapsed);
    this.handle = requestAnimationFrame(this.frame);
  }
}
