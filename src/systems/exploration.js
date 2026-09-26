import { TERRAIN } from '../data/terrain.js?v=fb3dec75add047a6';

// Stored only on the transient area, never in the character save.
export function initializeExploration(area) {
  if (area.exploration) return area.exploration;
  const { cellSize } = TERRAIN.exploration;
  const width = Math.ceil(area.bounds.width / cellSize);
  const height = Math.ceil(area.bounds.height / cellSize);
  area.exploration = { cellSize, width, height, cells: new Uint8Array(width * height) };
  return area.exploration;
}

export function revealExploration(area, x, y) {
  const exploration = initializeExploration(area);
  const { cellSize, width, height, cells } = exploration;
  const radius = TERRAIN.exploration.revealRadius;
  const left = Math.max(0, Math.floor((x - radius) / cellSize));
  const right = Math.min(width - 1, Math.floor((x + radius) / cellSize));
  const top = Math.max(0, Math.floor((y - radius) / cellSize));
  const bottom = Math.min(height - 1, Math.floor((y + radius) / cellSize));
  const radiusSquared = radius * radius;
  for (let row = top; row <= bottom; row++) {
    const cellTop = row * cellSize;
    const nearY = Math.max(cellTop, Math.min(y, Math.min(cellTop + cellSize, area.bounds.height)));
    for (let col = left; col <= right; col++) {
      const cellLeft = col * cellSize;
      const nearX = Math.max(cellLeft, Math.min(x, Math.min(cellLeft + cellSize, area.bounds.width)));
      if ((nearX - x) ** 2 + (nearY - y) ** 2 <= radiusSquared) cells[row * width + col] = 1;
    }
  }
  return exploration;
}

export function isExplored(area, x, y) {
  if (x < 0 || y < 0 || x >= area.bounds.width || y >= area.bounds.height) return false;
  const exploration = area.exploration;
  if (!exploration) return false;
  return exploration.cells[Math.floor(y / exploration.cellSize) * exploration.width + Math.floor(x / exploration.cellSize)] === 1;
}
