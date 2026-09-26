import { TERRAIN } from '../data/terrain.js?v=a4d576ef9a3ef4e2';
import { initializeExploration, isExplored } from '../systems/exploration.js?v=9c05b30176a59828';
import { CONFIG } from '../data/config.js?v=f28e6c5b4673f66a';
import { rasterizeVector } from './vector-image.js?v=921478b13bcc057d';

const TAU = Math.PI * 2;
const THEMES = {
  ember: { ground: '#302a2c', edge: '#a98167', tree: '#3d392f', pond: '#555a51', rock: '#77716b' },
  crypt: { ground: '#30323b', edge: '#aaa39a', tree: '#41433c', pond: '#52616c', rock: '#89858a' },
  wood: { ground: '#283c38', edge: '#819a7a', tree: '#3b513e', pond: '#647e79', rock: '#8b9589' },
  frost: { ground: '#425666', edge: '#b5ccd1', tree: '#617574', pond: '#87b2ba', rock: '#abbabd' },
  abyss: { ground: '#3c2830', edge: '#b88171', tree: '#533c3b', pond: '#79636d', rock: '#877d7e' },
  dungeon: { ground: '#3c3740', edge: '#999096', tree: '#494647', pond: '#777e83', rock: '#949195' },
  sheep: { ground: '#3c403b', edge: '#acac91', tree: '#4b5446', pond: '#7a9284', rock: '#928f85' },
};

async function decodeVector(markup) {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws into a canvas context whose DPR transform is already set by Renderer.resize(). */
export class TerrainRenderer {
  constructor(ctx, project) {
    this.ctx = ctx;
    this.project = project;
    this.images = new Map();
    this.sources = new Map();
    this.rasterRatio = 1;
    this.patterns = new Map();
    this.transform = { ax: 0, ay: 0, bx: 0, by: 0, x: 0, y: 0 };
  }

  async load() {
    const url = 'assets/terrain.svg';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
    const svg = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const root = svg.documentElement;
    if (root.localName !== 'svg' || svg.querySelector('parsererror')) throw new Error(`Invalid ${url}`);
    const serialize = new XMLSerializer();
    const defs = root.querySelector('defs');
    const shared = defs ? serialize.serializeToString(defs) : '';
    const groups = [...root.children].filter(group => group.localName === 'g' && group.hasAttribute('data-terrain'));
    await Promise.all(groups.map(async group => {
      const name = group.getAttribute('data-terrain');
      const fragment = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${shared}${serialize.serializeToString(group)}</svg>`;
      this.sources.set(name, await decodeVector(fragment));
    }));
    this.rasterize(this.rasterRatio);
  }

  rasterize(ratio) {
    this.rasterRatio = ratio;
    // Cover the largest projected obstacle, including its raised silhouette, at native DPR.
    const obstacleSize = 2 * Math.hypot(TERRAIN.obstacle.maxRadius,
      TERRAIN.obstacle.maxRadius * TERRAIN.obstacle.maxAspect) * CONFIG.zoom * Math.max(1, TERRAIN.render.obstacleHeight);
    const groundSize = TERRAIN.render.groundTile * CONFIG.zoom * Math.SQRT2;
    for (const [name, source] of this.sources)
      this.images.set(name, rasterizeVector(source, (name.startsWith('ground-') ? groundSize : obstacleSize) * ratio));
    this.patterns.clear();
  }

  updateProjection() {
    const origin = this.project(0, 0);
    const xAxis = this.project(1, 0);
    const yAxis = this.project(0, 1);
    const transform = this.transform;
    transform.ax = xAxis.x - origin.x; transform.ay = xAxis.y - origin.y;
    transform.bx = yAxis.x - origin.x; transform.by = yAxis.y - origin.y;
    transform.x = origin.x; transform.y = origin.y;
  }

  drawGround(area) {
    this.updateProjection();
    const ctx = this.ctx;
    const { ax, ay, bx, by, x, y } = this.transform;
    const theme = THEMES[area.theme] ? area.theme : 'dungeon';
    const image = this.images.get(`ground-${theme}`);
    if (!image) throw new Error('TerrainRenderer.load() must finish before drawing');
    let pattern = this.patterns.get(theme);
    if (!pattern) {
      pattern = ctx.createPattern(image, 'repeat');
      pattern.setTransform(new DOMMatrix().scale(TERRAIN.render.groundTile / image.width));
      this.patterns.set(theme, pattern);
    }
    ctx.save();
    ctx.transform(ax, ay, bx, by, x, y);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, area.bounds.width, area.bounds.height);
    ctx.strokeStyle = THEMES[theme].edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, area.bounds.width, area.bounds.height);
    ctx.restore();
  }

  /** Call between sorted actors at obstacle.x + obstacle.y (same key as actor sorting). */
  drawObstacle(obstacle, theme = 'dungeon') {
    const ctx = this.ctx;
    const colors = THEMES[theme] || THEMES.dungeon;
    const { ax, ay, bx, by } = this.transform;
    const center = this.project(obstacle.x, obstacle.y);
    ctx.save();
    ctx.transform(ax, ay, bx, by, center.x, center.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, obstacle.rx, obstacle.ry, 0, 0, TAU);
    ctx.fillStyle = obstacle.type === 'pond' ? colors.pond : obstacle.type === 'tree' ? colors.tree : colors.rock;
    ctx.fill();
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (obstacle.type === 'pond') {
      const image = this.images.get('obstacle-pond');
      if (image) {
        ctx.clip();
        ctx.drawImage(image, -obstacle.rx, -obstacle.ry, 2 * obstacle.rx, 2 * obstacle.ry);
      }
    }
    ctx.restore();
    if (obstacle.type === 'pond') return;
    const image = this.images.get(`obstacle-${obstacle.type}`);
    if (!image) return;
    const halfWidth = Math.hypot(obstacle.rx * ax, obstacle.ry * bx);
    const width = halfWidth * 2;
    const height = width * TERRAIN.render.obstacleHeight;
    const flip = obstacle.variant % 2 ? -1 : 1;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.scale(flip, 1);
    ctx.drawImage(image, -width / 2, -height * 211 / 256, width, height);
    ctx.restore();
  }

  /** Last world pass: black cells mask terrain, tall objects, enemies and effects alike. */
  drawFog(area, screenWidth, screenHeight) {
    const exploration = initializeExploration(area);
    const { ax, ay, bx, by, x, y } = this.transform;
    const determinant = ax * by - ay * bx;
    const screenX = screenWidth - x, screenY = screenHeight - y;
    const x0 = (-x * by + y * bx) / determinant;
    const x1 = (screenX * by + y * bx) / determinant;
    const x2 = (-x * by - screenY * bx) / determinant;
    const x3 = (screenX * by - screenY * bx) / determinant;
    const y0 = (x * ay - y * ax) / determinant;
    const y1 = (-screenX * ay - y * ax) / determinant;
    const y2 = (x * ay + screenY * ax) / determinant;
    const y3 = (-screenX * ay + screenY * ax) / determinant;
    const { width, height, cellSize, cells } = exploration;
    const left = Math.max(0, Math.floor(Math.min(x0, x1, x2, x3) / cellSize) - 1);
    const right = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2, x3) / cellSize) + 1);
    const top = Math.max(0, Math.floor(Math.min(y0, y1, y2, y3) / cellSize) - 1);
    const bottom = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2, y3) / cellSize) + 1);
    const ctx = this.ctx;
    ctx.save();
    ctx.transform(ax, ay, bx, by, x, y);
    ctx.fillStyle = '#000';
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        if (cells[row * width + col]) continue;
        ctx.fillRect(col * cellSize, row * cellSize,
          Math.min(cellSize, area.bounds.width - col * cellSize),
          Math.min(cellSize, area.bounds.height - row * cellSize));
      }
    }
    // Feather only into known cells; unexplored cells remain fully opaque.
    const shadow = `rgba(0,0,0,${TERRAIN.exploration.frontierAlpha})`;
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        if (!cells[row * width + col]) continue;
        const cx = col * cellSize, cy = row * cellSize;
        const w = Math.min(cellSize, area.bounds.width - cx), h = Math.min(cellSize, area.bounds.height - cy);
        if (col > 0 && !cells[row * width + col - 1]) {
          const gradient = ctx.createLinearGradient(cx, 0, cx + w, 0);
          gradient.addColorStop(0, shadow); gradient.addColorStop(1, '#0000');
          ctx.fillStyle = gradient; ctx.fillRect(cx, cy, w, h);
        }
        if (col + 1 < width && !cells[row * width + col + 1]) {
          const gradient = ctx.createLinearGradient(cx + w, 0, cx, 0);
          gradient.addColorStop(0, shadow); gradient.addColorStop(1, '#0000');
          ctx.fillStyle = gradient; ctx.fillRect(cx, cy, w, h);
        }
        if (row > 0 && !cells[(row - 1) * width + col]) {
          const gradient = ctx.createLinearGradient(0, cy, 0, cy + h);
          gradient.addColorStop(0, shadow); gradient.addColorStop(1, '#0000');
          ctx.fillStyle = gradient; ctx.fillRect(cx, cy, w, h);
        }
        if (row + 1 < height && !cells[(row + 1) * width + col]) {
          const gradient = ctx.createLinearGradient(0, cy + h, 0, cy);
          gradient.addColorStop(0, shadow); gradient.addColorStop(1, '#0000');
          ctx.fillStyle = gradient; ctx.fillRect(cx, cy, w, h);
        }
      }
    }
    ctx.restore();
  }

  drawMinimap(area, player, left, top, size = TERRAIN.render.miniSize) {
    const ctx = this.ctx;
    const exploration = area.exploration;
    const sx = size / area.bounds.width, sy = size / area.bounds.height;
    const colors = THEMES[area.theme] || THEMES.dungeon;
    const marker = TERRAIN.render.miniMarkerSize, halfMarker = marker / 2;
    ctx.save();
    ctx.translate(left, top);
    ctx.fillStyle = '#080b12';
    ctx.fillRect(0, 0, size, size);
    if (exploration) {
      ctx.fillStyle = colors.ground;
      for (let row = 0; row < exploration.height; row++) {
        for (let col = 0; col < exploration.width; col++) {
          if (!exploration.cells[row * exploration.width + col]) continue;
          const x = col * exploration.cellSize, y = row * exploration.cellSize;
          ctx.fillRect(x * sx, y * sy, Math.min(exploration.cellSize, area.bounds.width - x) * sx,
            Math.min(exploration.cellSize, area.bounds.height - y) * sy);
        }
      }
      for (const obstacle of area.obstacles || []) {
        if (!isExplored(area, obstacle.x, obstacle.y)) continue;
        ctx.fillStyle = obstacle.type === 'pond' ? colors.pond : '#151e25';
        ctx.beginPath();
        ctx.ellipse(obstacle.x * sx, obstacle.y * sy,
          Math.max(TERRAIN.render.miniObstacleRadius, obstacle.rx * sx),
          Math.max(TERRAIN.render.miniObstacleRadius, obstacle.ry * sy), 0, 0, TAU);
        ctx.fill();
      }
    }
    if (area.portal && isExplored(area, area.portal.x, area.portal.y)) {
      ctx.fillStyle = '#a690ca'; ctx.fillRect(area.portal.x * sx - halfMarker, area.portal.y * sy - halfMarker, marker, marker);
    }
    if (area.sheepPortal && isExplored(area, area.sheepPortal.x, area.sheepPortal.y)) {
      ctx.fillStyle = '#d8bb83'; ctx.fillRect(area.sheepPortal.x * sx - halfMarker, area.sheepPortal.y * sy - halfMarker, marker, marker);
    }
    if (area.exit && isExplored(area, area.exit.x, area.exit.y)) {
      ctx.fillStyle = '#a6d4b1'; ctx.fillRect(area.exit.x * sx - halfMarker, area.exit.y * sy - halfMarker, marker, marker);
    }
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = TERRAIN.render.miniStrokeWidth;
    ctx.strokeRect(0, 0, size, size);
    ctx.fillStyle = '#f1ddaa';
    ctx.beginPath(); ctx.arc(player.x * sx, player.y * sy, TERRAIN.render.miniPlayerRadius, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
