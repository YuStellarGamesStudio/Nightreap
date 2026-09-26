import { COMBAT } from '../data/combat.js?v=fdc1129299fc0d36';
import { TERRAIN } from '../data/terrain.js?v=fb3dec75add047a6';
import { isWalkable } from './world.js?v=b2d93fe55488415e';

const grids = new WeakMap();
const fields = new WeakMap();

const unit = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

// Same clearance as connected(): a cell center must clear the player circle
// plus half a diagonal, so adjacent centers cannot clip an obstacle corner.
function gridFor(area) {
  let grid = grids.get(area);
  if (grid) return grid;
  const { cellSize, playerRadius } = TERRAIN.navigation;
  const margin = playerRadius + cellSize * Math.SQRT2 / 2;
  const cols = Math.ceil(area.bounds.width / cellSize);
  const rows = Math.ceil(area.bounds.height / cellSize);
  const open = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      open[row * cols + col] = +isWalkable(area, (col + 0.5) * cellSize, (row + 0.5) * cellSize, margin);
    }
  }
  grid = { cell: cellSize, cols, rows, open };
  grids.set(area, grid);
  return grid;
}

function cellIndex(grid, x, y) {
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / grid.cell)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / grid.cell)));
  return row * grid.cols + col;
}

function nearestOpen(grid, index) {
  if (grid.open[index]) return index;
  const cols = grid.cols, rows = grid.rows;
  const col = index % cols, row = (index - col) / cols;
  for (let radius = 1; radius < cols + rows; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nextCol = col + dx, nextRow = row + dy;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
        const neighbor = nextRow * cols + nextCol;
        if (grid.open[neighbor]) return neighbor;
      }
    }
  }
  return index;
}

function fieldFor(grid, goal) {
  const index = nearestOpen(grid, cellIndex(grid, goal.x, goal.y));
  const cached = fields.get(goal);
  if (cached?.grid === grid && cached.index === index) return cached.dist;
  const dist = new Int16Array(grid.open.length);
  dist.fill(-1);
  const queue = new Int32Array(grid.open.length);
  let front = 0, back = 0;
  queue[back++] = index;
  dist[index] = 0;
  const cols = grid.cols;
  while (front < back) {
    const current = queue[front++];
    const column = current % cols;
    const row = (current - column) / cols;
    const next = dist[current] + 1;
    const push = neighbor => {
      if (!grid.open[neighbor] || dist[neighbor] >= 0) return;
      dist[neighbor] = next;
      queue[back++] = neighbor;
    };
    if (column > 0) push(current - 1);
    if (column + 1 < cols) push(current + 1);
    if (row > 0) push(current - cols);
    if (row + 1 < grid.rows) push(current + cols);
  }
  fields.set(goal, { grid, index, dist });
  return dist;
}

function clearAhead(area, entity, dir, distance) {
  const step = COMBAT.base.collisionStep;
  const steps = Math.max(1, Math.ceil(distance / step));
  for (let i = 1; i <= steps; i++) {
    const traveled = distance * i / steps;
    if (!isWalkable(area, entity.x + dir.x * traveled, entity.y + dir.y * traveled, entity.radius || 0)) return false;
  }
  return true;
}
function lineOpen(grid, from, to) {
  const x0 = from.x / grid.cell, y0 = from.y / grid.cell;
  const x1 = to.x / grid.cell, y1 = to.y / grid.cell;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const col = Math.floor(x0 + (x1 - x0) * t);
    const row = Math.floor(y0 + (y1 - y0) * t);
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows || !grid.open[row * grid.cols + col]) return false;
  }
  return true;
}

function cellCenter(grid, index) {
  const col = index % grid.cols;
  const row = (index - col) / grid.cols;
  return { x: (col + 0.5) * grid.cell, y: (row + 0.5) * grid.cell };
}

function nearestReached(grid, dist, index) {
  if (dist[index] >= 0) return index;
  const cols = grid.cols, rows = grid.rows;
  const col = index % cols, row = (index - col) / cols;
  for (let radius = 1; radius < cols + rows; radius++) {
    let found = -1, best = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nextCol = col + dx, nextRow = row + dy;
        if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows) continue;
        const neighbor = nextRow * cols + nextCol;
        if (dist[neighbor] < 0 || dist[neighbor] >= best) continue;
        best = dist[neighbor];
        found = neighbor;
      }
    }
    if (found >= 0) return found;
  }
  return -1;
}

function flowVector(grid, dist, entity, goal) {
  const cols = grid.cols;
  const col = Math.floor(entity.x / grid.cell);
  const row = Math.floor(entity.y / grid.cell);
  if (col < 0 || row < 0 || col >= cols || row >= grid.rows) return unit(goal.x - entity.x, goal.y - entity.y);
  const index = row * cols + col;
  if (dist[index] === 0) return unit(goal.x - entity.x, goal.y - entity.y);
  if (dist[index] > 0) {
    let best = dist[index], chosen = -1;
    const consider = neighbor => {
      if (dist[neighbor] < 0 || dist[neighbor] >= best) return;
      best = dist[neighbor];
      chosen = neighbor;
    };
    if (col > 0) consider(index - 1);
    if (col + 1 < cols) consider(index + 1);
    if (row > 0) consider(index - cols);
    if (row + 1 < grid.rows) consider(index + cols);
    if (chosen >= 0) {
      const center = cellCenter(grid, chosen);
      return unit(center.x - entity.x, center.y - entity.y);
    }
  }
  const exit = nearestReached(grid, dist, index);
  if (exit < 0) return null;
  const center = cellCenter(grid, exit);
  return unit(center.x - entity.x, center.y - entity.y);
}

function slide(area, entity, goal, step, dist, grid) {
  let best = null;
  let bestDist = Infinity;
  let bestGoal = Infinity;
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      if (!x && !y) continue;
      const dir = unit(x, y);
      const nextX = entity.x + dir.x * step, nextY = entity.y + dir.y * step;
      if (!isWalkable(area, nextX, nextY, entity.radius || 0)) continue;
      const goalDist = Math.hypot(goal.x - nextX, goal.y - nextY);
      let flow = Infinity;
      if (dist) {
        const value = dist[cellIndex(grid, nextX, nextY)];
        if (value >= 0) flow = value;
      }
      if (flow < bestDist || (flow === bestDist && goalDist < bestGoal)) {
        bestDist = flow;
        bestGoal = goalDist;
        best = dir;
      }
    }
  }
  return best;
}

function remember(entity, dir, commit) {
  entity.navX = dir.x;
  entity.navY = dir.y;
  entity.navCommit = commit;
  return dir;
}

function clearHeading(entity) {
  entity.navX = 0;
  entity.navY = 0;
  entity.navCommit = 0;
}

// Ground units follow a shared field around obstacles. A committed slide keeps
// them moving through a concave corner instead of stopping when every closer step is blocked.
export function approachVector(area, entity, goal, flee = false, step = COMBAT.base.collisionStep) {
  const travel = Math.max(step, 0);
  const probe = Math.max(travel, COMBAT.base.collisionStep);
  const toward = unit(goal.x - entity.x, goal.y - entity.y);
  const direct = flee ? { x: -toward.x, y: -toward.y } : toward;
  if (entity.behavior === 'flying') return remember(entity, direct, 0);
  if (entity.navCommit > 0 && (entity.navX || entity.navY)) {
    const held = { x: entity.navX, y: entity.navY };
    if (clearAhead(area, entity, held, travel)) {
      entity.navCommit = Math.max(0, entity.navCommit - travel);
      return held;
    }
    clearHeading(entity);
  }
  const lookahead = TERRAIN.navigation.cellSize;
  const grid = gridFor(area);
  if (!flee && lineOpen(grid, entity, goal)) return remember(entity, direct, 0);
  const dist = flee ? null : fieldFor(grid, goal);
  const flow = dist ? flowVector(grid, dist, entity, goal) : null;
  if (flow && clearAhead(area, entity, flow, travel)) return remember(entity, flow, lookahead);
  const slideGoal = flow ? { x: entity.x + flow.x * lookahead, y: entity.y + flow.y * lookahead }
    : flee ? { x: entity.x * 2 - goal.x, y: entity.y * 2 - goal.y } : goal;
  const escaped = slide(area, entity, slideGoal, probe, dist, grid);
  if (!escaped) return remember(entity, direct, 0);
  // Hold the slide for one cell. Releasing immediately resumes the blocked straight line and the unit bounces.
  return remember(entity, escaped, lookahead);
}
