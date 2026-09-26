import { ACTS, BOSSES, DIFFICULTIES, MONSTERS, WORLD } from '../data/world.js';
import { TERRAIN } from '../data/terrain.js';

const choice = (items, rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
const anchorPosition = ([column, row], dx = 0, dy = 0) => ({
  x: TERRAIN.anchorOrigin + column * TERRAIN.anchorStep + dx,
  y: TERRAIN.anchorOrigin + row * TERRAIN.anchorStep + dy,
});

function packCenters(start, bounds, rng) {
  const { packBorder, packColumns, packRows, packCount, packStartDistance } = TERRAIN;
  const stepX = (bounds.width - packBorder * 2) / packColumns;
  const stepY = (bounds.height - packBorder * 2) / packRows;
  const sectors = Array.from({ length: packColumns * packRows }, (_, index) => index);
  for (let i = sectors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sectors[i], sectors[j]] = [sectors[j], sectors[i]];
  }
  const centers = [];
  for (const sector of sectors) {
    const column = sector % packColumns, row = Math.floor(sector / packColumns);
    for (let attempt = 0; attempt < TERRAIN.packPlacementAttempts; attempt++) {
      const x = packBorder + (column + rng()) * stepX;
      const y = packBorder + (row + rng()) * stepY;
      if (Math.hypot(x - start.x, y - start.y) >= packStartDistance) {
        centers.push({ x, y });
        break;
      }
    }
    if (centers.length === packCount) break;
  }
  if (centers.length < packCount) {
    throw new Error('Not enough safe terrain sectors for enemy packs');
  }
  return centers;
}

function spawnSeparation(area, x, y, radius) {
  if (x < radius + TERRAIN.navigation.cellSize || y < radius + TERRAIN.navigation.cellSize
      || x > area.bounds.width - radius - TERRAIN.navigation.cellSize
      || y > area.bounds.height - radius - TERRAIN.navigation.cellSize
      || Math.hypot(x - area.start.x, y - area.start.y) < WORLD.spawnDistance + radius
      || Math.hypot(x - area.exit.x, y - area.exit.y) < TERRAIN.enemyGateDistance + radius
      || Math.hypot(x - area.portal.x, y - area.portal.y) < TERRAIN.enemyGateDistance + radius
      || (area.sheepPortal && Math.hypot(x - area.sheepPortal.x, y - area.sheepPortal.y)
        < TERRAIN.enemyGateDistance + radius)) return -Infinity;
  let separation = Infinity;
  for (const enemy of area.enemies) {
    const gap = Math.hypot(x - enemy.x, y - enemy.y)
      - Math.max(TERRAIN.enemySpacing, radius + enemy.radius);
    if (gap < separation) separation = gap;
  }
  return separation;
}

function spawnPosition(area, center, radius, rng) {
  let bestX = 0, bestY = 0, bestSeparation = -Infinity;
  for (let attempt = 0; attempt < TERRAIN.enemyPlacementAttempts; attempt++) {
    const angle = rng() * Math.PI * 2;
    const distance = Math.sqrt(rng()) * TERRAIN.packRadius;
    const x = center.x + Math.cos(angle) * distance;
    const y = center.y + Math.sin(angle) * distance;
    const separation = spawnSeparation(area, x, y, radius);
    if (separation >= 0) return { x, y };
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestX = x;
      bestY = y;
    }
  }
  // A constant or unlucky RNG must never put enemies on gates or start.
  // Sweep reproducible points in the assigned pack, then alternate clearings.
  for (let pack = 0; pack <= area.packs.length; pack++) {
    const origin = pack ? area.packs[pack - 1] : center;
    for (let sample = 0; sample < TERRAIN.fallbackSamples; sample++) {
      const angle = (sample + area.enemies.length) * TERRAIN.fallbackAngle;
      const distance = Math.sqrt((sample + 0.5) / TERRAIN.fallbackSamples) * TERRAIN.packRadius;
      const x = origin.x + Math.cos(angle) * distance;
      const y = origin.y + Math.sin(angle) * distance;
      const separation = spawnSeparation(area, x, y, radius);
      if (separation >= 0) return { x, y };
      if (separation > bestSeparation) {
        bestSeparation = separation;
        bestX = x;
        bestY = y;
      }
    }
    if (bestSeparation > -Infinity) return { x: bestX, y: bestY };
  }
  throw new Error('No safe enemy spawn on continuous terrain');
}

function segmentDistanceSquared(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared)) : 0;
  const offsetX = x - a.x - fraction * dx, offsetY = y - a.y - fraction * dy;
  return offsetX * offsetX + offsetY * offsetY;
}

function scatterObstacles(area, rng) {
  const config = TERRAIN.obstacle;
  const count = area.sheep ? config.sheepCount : area.depth ? config.dungeonCount : config.wildCount;
  const types = config.types[area.theme];
  const sites = [area.start, area.exit, area.portal, ...area.packs, ...area.landmarks,
    ...area.hazards, ...area.events, ...area.decorations];
  if (area.sheepPortal) sites.push(area.sheepPortal);
  const fallbackCount = config.fallbackColumns * config.fallbackRows;
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < config.placementAttempts + fallbackCount; attempt++) {
      let x, y;
      if (attempt < config.placementAttempts) {
        x = config.edgeInset + rng() * (area.bounds.width - config.edgeInset * 2);
        y = config.edgeInset + rng() * (area.bounds.height - config.edgeInset * 2);
      } else {
        const cell = (i + (attempt - config.placementAttempts) * (config.fallbackColumns + 2)) % fallbackCount;
        x = config.edgeInset + (cell % config.fallbackColumns + 0.5)
          * (area.bounds.width - config.edgeInset * 2) / config.fallbackColumns;
        y = config.edgeInset + (Math.floor(cell / config.fallbackColumns) + 0.5)
          * (area.bounds.height - config.edgeInset * 2) / config.fallbackRows;
      }
      const radius = config.minRadius + rng() * (config.maxRadius - config.minRadius);
      const aspect = config.minAspect + rng() * (config.maxAspect - config.minAspect);
      const rx = radius * aspect, ry = radius / aspect;
      const extent = Math.max(rx, ry);
      if (area.obstacles.some(other => Math.hypot(x - other.x, y - other.y)
        < extent + Math.max(other.rx, other.ry) + config.separation)) continue;
      if (sites.some(site => Math.hypot(x - site.x, y - site.y)
        < extent + (site.radius || TERRAIN.navigation.playerRadius) + config.pointClearance)) continue;
      if (area.enemies.some(enemy => Math.hypot(x - enemy.x, y - enemy.y)
        < extent + enemy.radius + config.pointClearance)) continue;
      // Reserved wide spokes and clearings guarantee player-sized travel to
      // each pack, interaction point, boss and individual enemy.
      const routeRadiusSquared = (extent + TERRAIN.navigation.playerRadius + config.routeClearance) ** 2;
      if (sites.some(site => segmentDistanceSquared(x, y, area.start, site) < routeRadiusSquared)
          || area.enemies.some((enemy, index) => !enemy.boss
            && segmentDistanceSquared(x, y, area.packs[index % area.packs.length], enemy) < routeRadiusSquared)) continue;
      area.obstacles.push({ x, y, rx, ry, type: choice(types, rng),
        variant: Math.floor(rng() * config.variantCount) });
      break;
    }
  }
}

function makeEnemy(speciesId, position, area, serial, elite = false) {
  const species = MONSTERS[speciesId];
  const difficulty = DIFFICULTIES[area.difficulty];
  const depth = area.depth;
  const health = speciesId === 'sheep' ? WORLD.sheepHealth : WORLD.baseHealth * species.health;
  const eliteHealth = elite ? WORLD.eliteHealth : 1;
  const eliteDamage = elite ? WORLD.eliteDamage : 1;
  const reward = difficulty.reward * (1 + depth * WORLD.depthReward);
  const level = WORLD.baseLevel + area.act * WORLD.levelsPerAct + area.map * WORLD.levelsPerMap
    + area.difficulty * WORLD.levelsPerDifficulty + depth * WORLD.levelsPerDepth;
  const xp = Math.round(WORLD.baseXp * (speciesId === 'sheep' ? WORLD.sheepXpMultiplier : 1)
    * reward * (elite ? WORLD.eliteXp : 1));
  const affixCount = WORLD.eliteAffixBase + area.difficulty * WORLD.eliteAffixPerDifficulty
    + Math.floor(depth / WORLD.eliteAffixDepthStep);
  const maxHp = Math.round(health * difficulty.health * (1 + depth * WORLD.depthHealth) * eliteHealth);
  const radius = species.radius * (elite ? WORLD.eliteSize : 1);
  return {
    id: `${speciesId}-${serial}`, speciesId, kind: speciesId, name: species.name,
    family: species.family, behavior: species.behavior,
    x: position.x, y: position.y, prevX: position.x, prevY: position.y,
    radius, hp: maxHp, maxHp, speed: WORLD.baseSpeed * species.speed,
    damage: WORLD.baseDamage * species.damage * difficulty.damage
      * (1 + depth * WORLD.depthDamage) * eliteDamage,
    xp, experience: xp, gold: Math.round(WORLD.baseGold * reward * (elite ? WORLD.eliteXp : 1)),
    level, difficulty: area.difficulty, depth, sheep: area.sheep, elite, boss: false,
    affixes: elite ? Array.from({ length: Math.min(affixCount, WORLD.eliteAffixes.length) },
      (_, index) => WORLD.eliteAffixes[(serial + index) % WORLD.eliteAffixes.length]) : [],
    dropChance: speciesId === 'sheep' ? WORLD.sheepDropChance : undefined,
    status: {},
  };
}

function makeBoss(bossId, position, area) {
  const template = BOSSES[bossId];
  const difficulty = DIFFICULTIES[area.difficulty];
  const reward = difficulty.reward * (1 + area.depth * WORLD.depthReward);
  const maxHp = Math.round(WORLD.bossHealth * template.health * difficulty.health
    * (1 + area.depth * WORLD.depthHealth));
  const xp = Math.round(WORLD.baseXp * WORLD.bossXp * reward);
  const final = bossId === 'abyss-lord';
  return {
    id: bossId, bossId, speciesId: bossId, kind: bossId, name: template.name,
    family: template.family, behavior: template.behavior, boss: true, elite: false,
    x: position.x, y: position.y, prevX: position.x, prevY: position.y,
    radius: WORLD.bossRadius, hp: maxHp, maxHp, speed: WORLD.bossSpeed,
    damage: WORLD.bossDamage * difficulty.damage * (1 + area.depth * WORLD.depthDamage),
    xp, experience: xp, gold: Math.round(WORLD.baseGold * WORLD.bossGold * reward),
    level: WORLD.baseLevel + area.act * WORLD.levelsPerAct + area.map * WORLD.levelsPerMap
      + area.difficulty * WORLD.levelsPerDifficulty + area.depth * WORLD.levelsPerDepth,
    difficulty: area.difficulty, depth: area.depth, sheep: false,
    bossAbilities: final ? WORLD.finalAbilitiesByDifficulty[area.difficulty].slice() : template.abilities.slice(),
    phaseThresholds: WORLD.bossPhaseThresholds.slice(), phase: 0, status: {}, affixes: [],
  };
}

function populate(area, mapData, rng) {
  const pool = area.sheep ? ['sheep'] : area.depth ? WORLD.dungeonMonsters : mapData.monsters;
  const amount = area.sheep ? WORLD.sheepEnemies : area.depth
    ? WORLD.dungeonEnemies + Math.floor(Math.sqrt(area.depth)) * WORLD.dungeonEnemiesPerDepth
    : WORLD.mapEnemies + area.map * WORLD.mapEnemiesPerMap + (mapData.countBonus || 0);
  const count = Math.min(amount, WORLD.maxEnemies - (mapData.boss && !area.depth && !area.sheep ? 1 : 0));
  const elites = area.sheep ? WORLD.sheepElites
    : WORLD.eliteBase + (mapData.eliteBonus || 0) + area.difficulty * WORLD.eliteBonus
      + Math.floor(area.depth * WORLD.eliteChanceByDepth);
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < count; i++) {
    // Complete cycles preserve each authored archetype before any repeats.
    const id = shuffled[i % shuffled.length];
    const elite = i < elites;
    const radius = MONSTERS[id].radius * (elite ? WORLD.eliteSize : 1);
    const position = spawnPosition(area, area.packs[i % area.packs.length], radius, rng);
    area.enemies.push(makeEnemy(id, position, area, i, elite));
  }
  if (mapData.boss && !area.depth && !area.sheep) {
    area.enemies.push(makeBoss(mapData.boss, area.exit, area));
  }
  area.requiredKills = area.enemies.length;
}

/** Build a continuous campaign wilderness, sheep realm or procedural dungeon floor. */
export function createArea({ act = 0, map = 0, difficulty = 0, depth = 0, sheep = false } = {}, rng = Math.random) {
  if (!Number.isInteger(act) || !ACTS[act] || !Number.isInteger(map) || !ACTS[act].maps[map]
      || !Number.isInteger(difficulty) || !DIFFICULTIES[difficulty]
      || !Number.isSafeInteger(depth) || depth < 0) {
    throw new RangeError('Invalid area coordinates');
  }
  const mapData = ACTS[act].maps[map];
  const dungeon = depth > 0 && !sheep;
  const anchors = dungeon ? TERRAIN.dungeonAnchors : mapData.anchors;
  const start = anchorPosition(anchors[0]);
  const exit = anchorPosition(anchors.at(-1));
  const portal = anchorPosition(anchors[1], -TERRAIN.portalOffset);
  const theme = sheep ? 'sheep' : dungeon ? 'dungeon' : ACTS[act].theme;
  const name = sheep ? { en: 'Dread Sheep Realm', zh: '夢魘綿羊秘境' }
    : dungeon ? { en: `Endless Dungeon · ${depth}`, zh: `無盡地下城 · ${depth}` } : mapData.name;
  const area = {
    act, map, difficulty, depth, sheep, theme, name, bounds: WORLD.bounds,
    start, exit, portal, enemies: [], obstacles: [], packs: [],
    decorations: [], landmarks: [], hazards: [], events: [],
    killed: 0, requiredKills: 0, cleared: false,
  };
  if (dungeon) {
    for (let i = 1; i < anchors.length; i++) {
      const position = anchorPosition(anchors[i], -TERRAIN.portalOffset, -TERRAIN.portalOffset);
      area.decorations.push({ ...position, type: choice(WORLD.dungeonDecor, rng) });
    }
  } else if (!sheep) {
    const feature = mapData.landmark;
    area.landmarks.push({ ...anchorPosition(anchors[feature.anchor], feature.dx, feature.dy),
      type: feature.type, name: feature.name });
    area.decorations.push(...(mapData.decor || []).map(([anchor, type, dx, dy]) => ({
      ...anchorPosition(anchors[anchor], dx, dy), type,
    })));
    area.hazards.push(...(mapData.hazards || []).map(hazard => ({
      ...anchorPosition(anchors[hazard.anchor], hazard.dx, hazard.dy),
      type: hazard.type, radius: WORLD.hazardRadius, damage: WORLD.hazardDamage, tick: WORLD.hazardTick,
    })));
    if (act === WORLD.sheepGateAct) area.sheepPortal = anchorPosition(anchors[1], TERRAIN.portalOffset);
  } else {
    area.landmarks.push({ ...anchorPosition(anchors[2]), type: 'sheep-stone',
      name: {en:'Dread Shepherd Stone',zh:'夢魘牧羊碑'} });
  }
  if (!dungeon) {
    const decor = WORLD.themeDecor[theme];
    for (let i = 1; i < anchors.length; i++) {
      area.decorations.push({ ...anchorPosition(anchors[i], -TERRAIN.portalOffset, -TERRAIN.portalOffset),
        type: decor[i % decor.length] });
    }
  }
  area.packs = packCenters(start, area.bounds, rng);
  if (dungeon) {
    for (let i = 0; i < TERRAIN.dungeonEventSites; i++) {
      if (rng() < WORLD.dungeonEventChance) {
        area.events.push({ ...area.packs[i], type: choice(WORLD.dungeonEvents, rng) });
      }
    }
  }
  populate(area, mapData, rng);
  scatterObstacles(area, rng);
  return area;
}

/** A circle must fit in the bounds and outside each visible ground ellipse. */
export function isWalkable(area, x, y, radius = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false;
  if (x - radius < 0 || y - radius < 0 || x + radius > area.bounds.width || y + radius > area.bounds.height) return false;
  for (const obstacle of area.obstacles) {
    const dx = x - obstacle.x, dy = y - obstacle.y;
    // Inflating both axes separately misses some diagonal circle/ellipse overlaps.
    // Uniform inflation by the short axis conservatively contains the Minkowski sum.
    const scale = 1 + radius / Math.min(obstacle.rx, obstacle.ry);
    const rx = obstacle.rx * scale, ry = obstacle.ry * scale;
    if (Math.abs(dx) < rx && Math.abs(dy) < ry && (dx / rx) ** 2 + (dy / ry) ** 2 < 1) return false;
  }
  return true;
}

/** Flood player-sized cells, including the half-cell margin so grid edges stay clear. */
export function connected(area) {
  const { cellSize, playerRadius } = TERRAIN.navigation;
  const columns = Math.ceil(area.bounds.width / cellSize), rows = Math.ceil(area.bounds.height / cellSize);
  const margin = playerRadius + cellSize * Math.SQRT2 / 2;
  const open = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      open[row * columns + col] = +isWalkable(area, (col + 0.5) * cellSize, (row + 0.5) * cellSize, margin);
    }
  }
  const locate = point => Math.floor(point.y / cellSize) * columns + Math.floor(point.x / cellSize);
  const first = locate(area.start);
  if (!open[first]) return false;
  const reached = new Uint8Array(open.length);
  const queue = new Int32Array(open.length);
  let front = 0, back = 0;
  queue[back++] = first;
  reached[first] = 1;
  while (front < back) {
    const index = queue[front++];
    const column = index % columns, row = (index - column) / columns;
    if (column > 0 && open[index - 1] && !reached[index - 1]) { reached[index - 1] = 1; queue[back++] = index - 1; }
    if (column + 1 < columns && open[index + 1] && !reached[index + 1]) { reached[index + 1] = 1; queue[back++] = index + 1; }
    if (row > 0 && open[index - columns] && !reached[index - columns]) { reached[index - columns] = 1; queue[back++] = index - columns; }
    if (row + 1 < rows && open[index + columns] && !reached[index + columns]) { reached[index + columns] = 1; queue[back++] = index + columns; }
  }
  const targets = [area.exit, area.portal, ...area.packs, ...area.landmarks, ...area.events, ...area.enemies];
  if (area.sheepPortal) targets.push(area.sheepPortal);
  return targets.every(target => isWalkable(area, target.x, target.y, target.radius || playerRadius)
    && !!reached[locate(target)]);
}

/** Call once for each killed enemy before loot; regular loot is owned by Gear. */
export function recordKill(player, area, enemy) {
  if (!area.enemies.includes(enemy) || enemy.killRecorded) {
    return { cleared: area.cleared, finalBoss: false, firstKill: false };
  }
  enemy.killRecorded = true;
  area.killed++;
  const finalBoss = !area.sheep && area.depth === 0 && area.act === ACTS.length - 1
    && area.map === ACTS[area.act].maps.length - 1 && enemy.bossId === 'abyss-lord';
  let firstKill = false;
  if (finalBoss) {
    const key = `abyss-lord:${area.difficulty}`;
    if (!player.progress.firstKills.includes(key)) {
      player.progress.firstKills.push(key);
      player.gold += WORLD.firstBossGold;
      enemy.firstKill = true;
      firstKill = true;
    }
    player.progress.unlockedDifficulty = Math.max(player.progress.unlockedDifficulty,
      Math.min(DIFFICULTIES.length - 1, area.difficulty + 1));
  }
  area.cleared = area.killed >= area.requiredKills;
  return { cleared: area.cleared, finalBoss, firstKill };
}

export function advance(player, area) {
  if (!area.cleared) return { ok: false, message: { en: 'Clear this area first.', zh: '請先清除本區域敵人。' } };
  if (area.sheep) {
    return { ok: true, options: { act: area.act, map: area.map, difficulty: area.difficulty, depth: 0 },
      message: { en: 'The sheep realm fades.', zh: '綿羊秘境逐漸消散。' } };
  }
  if (area.depth) {
    return { ok: true, options: { act: area.act, map: area.map, difficulty: area.difficulty, depth: area.depth + 1 },
      message: { en: 'Descend into the next floor.', zh: '深入地下城下一層。' } };
  }
  const progress = player.progress;
  const current = progress.difficulty === area.difficulty && progress.act === area.act && progress.map === area.map;
  const lastMap = area.map === ACTS[area.act].maps.length - 1;
  const final = area.act === ACTS.length - 1 && lastMap;
  if (lastMap && !area.enemies.some(enemy => enemy.boss && enemy.killRecorded)) {
    return { ok: false, message: { en: 'Defeat the guardian first.', zh: '請先擊敗守關首領。' } };
  }
  if (current) {
    if (!lastMap) progress.map++;
    else if (!final) { progress.act++; progress.map = 0; }
    else if (progress.unlockedDifficulty > area.difficulty) {
      progress.difficulty = area.difficulty + 1;
      progress.act = 0;
      progress.map = 0;
    }
  }
  const options = final && progress.difficulty === area.difficulty
    ? { act: area.act, map: area.map, difficulty: area.difficulty, depth: 0 }
    : { act: current ? progress.act : area.act, map: current ? progress.map : area.map,
        difficulty: current ? progress.difficulty : area.difficulty, depth: 0 };
  return { ok: true, options, message: final
    ? { en: 'The Abyss Lord has fallen.', zh: '深淵之主已倒下。' }
    : { en: 'The next passage opens.', zh: '通往下一地區的道路已開啟。' } };
}

export function enterDungeon(player, area) {
  if (area.sheep) return { ok: false, message: { en:'No dungeon entrance here.', zh:'此處沒有地下城入口。' } };
  return { ok: true, options: { act: area.act, map: area.map, difficulty: area.difficulty, depth: area.depth + 1 },
    message: { en: 'You enter the endless dungeon.', zh: '你踏入無盡地下城。' } };
}

export function enterSheep(player, area) {
  if (area.sheep || area.depth !== 0 || area.act !== WORLD.sheepGateAct) {
    return { ok: false, message: { en: 'The hidden gate is not here.', zh: '此處沒有隱藏傳送門。' } };
  }
  if (player.tickets < 1) return { ok: false, message: { en: 'A sheep ticket is required.', zh: '需要一張綿羊券。' } };
  player.tickets--;
  return { ok: true, options: { act: area.act, map: area.map, difficulty: area.difficulty, depth: 0, sheep: true },
    message: { en: 'The sheep gate opens.', zh: '綿羊秘境傳送門開啟。' } };
}

export function deathPenalty(player) {
  const lost = Math.min(WORLD.deathGoldCap, Math.floor(player.gold * WORLD.deathGoldRate));
  player.gold -= lost;
  return lost;
}
