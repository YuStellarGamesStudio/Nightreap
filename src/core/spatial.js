import { CONFIG } from '../data/config.js';

export class SpatialGrid {
  constructor(cellSize = CONFIG.cellSize) { this.cellSize = cellSize; this.cells = new Map(); }
  rebuild(entities) {
    this.cells.clear();
    for (const entity of entities) {
      if (entity.hp <= 0) continue;
      const x = Math.floor(entity.x / this.cellSize);
      const y = Math.floor(entity.y / this.cellSize);
      const key = `${x},${y}`;
      let bucket = this.cells.get(key);
      if (!bucket) this.cells.set(key, bucket = []);
      bucket.push(entity);
    }
  }
  query(x, y, radius) {
    const found = [];
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const bucket = this.cells.get(`${cx},${cy}`);
      if (!bucket) continue;
      for (const entity of bucket) {
        const range = radius + (entity.radius || 0);
        if ((entity.x - x) ** 2 + (entity.y - y) ** 2 <= range ** 2) found.push(entity);
      }
    }
    return found;
  }
}
