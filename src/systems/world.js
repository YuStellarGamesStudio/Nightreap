import { ACTS, BOSSES, DIFFICULTIES, MONSTERS, WORLD } from '../data/world.js';

const choice = (items, rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
const center = room => ({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
const rect = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const roomCenter = (room, dx = 0, dy = 0) => {
  const pos = center(room);
  return { x: pos.x + dx, y: pos.y + dy };
};

// A path is made from overlapping axis-aligned segments, not a visual-only link.
function connectRooms(rooms, links) {
  const paths = [];
  const width = WORLD.corridorWidth;
  for (const [from, to, firstAxis] of links) {
    const a = center(rooms[from]);
    const b = center(rooms[to]);
    if (firstAxis === 'x') {
      paths.push(rect((a.x + b.x) / 2, a.y, Math.abs(b.x - a.x) + width, width));
      paths.push(rect(b.x, (a.y + b.y) / 2, width, Math.abs(b.y - a.y) + width));
    } else {
      paths.push(rect(a.x, (a.y + b.y) / 2, width, Math.abs(b.y - a.y) + width));
      paths.push(rect((a.x + b.x) / 2, b.y, Math.abs(b.x - a.x) + width, width));
    }
  }
  return paths;
}

function authoredGeometry(mapData) {
  const rooms = mapData.rooms.map(([col, row, shape]) => {
    const [w, h] = WORLD.roomShapes[shape];
    return rect(WORLD.gridOrigin + col * WORLD.gridStep, WORLD.gridOrigin + row * WORLD.gridStep, w, h);
  });
  return { rooms, paths: connectRooms(rooms, mapData.links) };
}

function dungeonGeometry(rng) {
  const rooms = [];
  const links = [];
  const occupied = new Set();
  const size = WORLD.dungeonGridSize;
  const nodes = [{ col: 1, row: 1 }];
  occupied.add(1 + size);
  const count = WORLD.dungeonMinRooms + Math.floor(rng() * WORLD.dungeonRoomVariance);
  while (nodes.length < count) {
    const frontier = [];
    for (let i = 0; i < nodes.length; i++) {
      const { col, row } = nodes[i];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = col + dx;
        const y = row + dy;
        if (x >= 0 && y >= 0 && x < size && y < size && !occupied.has(x + y * size)) {
          frontier.push({ col: x, row: y, parent: i });
        }
      }
    }
    const next = choice(frontier, rng);
    occupied.add(next.col + next.row * size);
    const previous = nodes[next.parent];
    links.push([next.parent, nodes.length, next.col !== previous.col ? 'x' : 'y']);
    nodes.push(next);
  }
  const decorations = [];
  const events = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const template = choice(WORLD.dungeonTemplates, rng);
    rooms.push(rect(WORLD.gridOrigin + node.col * WORLD.gridStep, WORLD.gridOrigin + node.row * WORLD.gridStep, template.w, template.h));
    if (i > 0) {
      decorations.push({ ...roomCenter(rooms[i], -WORLD.portalOffset, WORLD.portalOffset), type: template.decor });
      if (i < nodes.length - 1 && rng() < WORLD.dungeonEventChance) {
        events.push({ ...roomCenter(rooms[i]), type: choice(WORLD.dungeonEvents, rng) });
      }
    }
  }
  return { rooms, paths: connectRooms(rooms, links), decorations, events };
}

function safeSpawn(room, radius, start, rng) {
  const padding = radius + WORLD.spawnPadding;
  for (let attempt = 0; attempt < WORLD.spawnAttempts; attempt++) {
    const x = room.x + padding + rng() * (room.w - 2 * padding);
    const y = room.y + padding + rng() * (room.h - 2 * padding);
    if (Math.hypot(x - start.x, y - start.y) >= WORLD.spawnDistance) return { x, y };
  }
  // Non-start rooms always clear the separation; a deterministic center is safe for tiny rooms.
  return center(room);
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
    const room = area.rooms[1 + Math.floor(rng() * (area.rooms.length - 1))];
    area.enemies.push(makeEnemy(id, safeSpawn(room, radius, area.start, rng), area, i, elite));
  }
  if (mapData.boss && !area.depth && !area.sheep) {
    area.enemies.push(makeBoss(mapData.boss, roomCenter(area.rooms.at(-1)), area));
  }
  area.requiredKills = area.enemies.length;
}

/** Build the campaign map, an independent sheep realm, or one procedural dungeon floor. */
export function createArea({ act = 0, map = 0, difficulty = 0, depth = 0, sheep = false } = {}, rng = Math.random) {
  if (!Number.isInteger(act) || !ACTS[act] || !Number.isInteger(map) || !ACTS[act].maps[map]
      || !Number.isInteger(difficulty) || !DIFFICULTIES[difficulty]
      || !Number.isSafeInteger(depth) || depth < 0) {
    throw new RangeError('Invalid area coordinates');
  }
  const mapData = ACTS[act].maps[map];
  const geometry = depth > 0 && !sheep ? dungeonGeometry(rng) : authoredGeometry(mapData);
  const { rooms, paths } = geometry;
  const start = roomCenter(rooms[0]);
  const exit = roomCenter(rooms.at(-1));
  const portal = roomCenter(rooms[1], -WORLD.portalOffset, 0);
  const theme = sheep ? 'sheep' : depth ? 'dungeon' : ACTS[act].theme;
  const name = sheep ? { en: 'Dread Sheep Realm', zh: '夢魘綿羊秘境' }
    : depth ? { en: `Endless Dungeon · ${depth}`, zh: `無盡地下城 · ${depth}` } : mapData.name;
  const area = {
    act, map, difficulty, depth, sheep, theme, name, bounds: WORLD.bounds,
    rooms, paths, start, exit, portal, enemies: [],
    decorations: geometry.decorations || [], landmarks: [], hazards: [], events: geometry.events || [],
    killed: 0, requiredKills: 0, cleared: false,
  };
  if (!depth && !sheep) {
    const feature = mapData.landmark;
    area.landmarks.push({ ...roomCenter(rooms[feature.room], feature.dx, feature.dy), type: feature.type, name: feature.name });
    area.decorations.push(...(mapData.decor || []).map(([room, type, dx, dy]) => ({
      ...roomCenter(rooms[room], dx, dy), type,
    })));
    area.hazards.push(...(mapData.hazards || []).map(hazard => ({
      ...roomCenter(rooms[hazard.room], hazard.dx, hazard.dy),
      type: hazard.type, radius: WORLD.hazardRadius, damage: WORLD.hazardDamage, tick: WORLD.hazardTick,
    })));
    if (act === WORLD.sheepGateAct) area.sheepPortal = roomCenter(rooms[1], WORLD.portalOffset, 0);
  }
  if (sheep) {
    area.landmarks.push({ ...roomCenter(rooms[2]), type: 'sheep-stone', name: {en:'Dread Shepherd Stone',zh:'夢魘牧羊碑'} });
  }
  const decor = WORLD.themeDecor[theme] || WORLD.themeDecor.crypt;
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    area.decorations.push({ ...roomCenter(room, -WORLD.portalOffset, -WORLD.portalOffset), type: decor[i % decor.length] });
  }
  populate(area, mapData, rng);
  return area;
}

/** A circular character must fit entirely inside at least one room or corridor. */
export function isWalkable(area, x, y, radius = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false;
  if (x - radius < 0 || y - radius < 0 || x + radius > area.bounds.width || y + radius > area.bounds.height) return false;
  for (const tile of area.rooms) {
    if (x - radius >= tile.x && y - radius >= tile.y
        && x + radius <= tile.x + tile.w && y + radius <= tile.y + tile.h) return true;
  }
  for (const tile of area.paths) {
    if (x - radius >= tile.x && y - radius >= tile.y
        && x + radius <= tile.x + tile.w && y + radius <= tile.y + tile.h) return true;
  }
  return false;
}

/** Graph over genuinely overlapping walkable rectangles, including every enemy and exit. */
export function connected(area) {
  const tiles = [...area.rooms, ...area.paths];
  if (!tiles.length || !isWalkable(area, area.start.x, area.start.y)
      || !isWalkable(area, area.exit.x, area.exit.y)
      || !isWalkable(area, area.portal.x, area.portal.y)
      || (area.sheepPortal && !isWalkable(area, area.sheepPortal.x, area.sheepPortal.y))) return false;
  const seen = new Uint8Array(tiles.length);
  const queue = [0];
  seen[0] = 1;
  for (let index = 0; index < queue.length; index++) {
    const a = tiles[queue[index]];
    for (let i = 0; i < tiles.length; i++) {
      if (seen[i]) continue;
      const b = tiles[i];
      if (Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)
          && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)) {
        seen[i] = 1;
        queue.push(i);
      }
    }
  }
  if (seen.some(value => !value)) return false;
  return area.enemies.every(enemy => isWalkable(area, enemy.x, enemy.y, enemy.radius));
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
