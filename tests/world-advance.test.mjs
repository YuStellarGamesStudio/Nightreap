import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, createPlayer } from '../src/systems/combat.js';
import { COMBAT } from '../src/data/combat.js';
import { ACTS } from '../src/data/world.js';
import { createArea, recordKill, advance } from '../src/systems/world.js';

test('clearing a guardian map still advances after dead enemies are removed', () => {
  const player = createPlayer('warrior');
  const area = createArea({ act: 0, map: ACTS[0].maps.length - 1 }, () => 0.5);
  player.progress.act = area.act;
  player.progress.map = area.map;
  const combat = new Combat({ player, area, paused: false }, {
    onKill(enemy) { recordKill(player, area, enemy); },
  });

  assert.equal(advance(player, area).ok, false, 'uncleared area remains locked');
  for (const enemy of [...area.enemies]) combat.kill(enemy);
  assert.equal(area.cleared, true);
  combat.update(COMBAT.base.enemyThink);
  assert.equal(area.enemies.length, 0, 'normal combat cleanup removes the defeated boss');

  const result = advance(player, area);
  assert.equal(result.ok, true);
  assert.deepEqual(result.options, { act: 1, map: 0, difficulty: 0, depth: 0 });
  assert.equal(player.progress.act, 1);
  assert.equal(player.progress.map, 0);
});

test('self-detonating farmland enemies count toward clearing the map', () => {
  const player = createPlayer('warrior');
  const area = createArea({ act: 0, map: 1 }, () => 0.5);
  player.x = area.start.x;
  player.y = area.start.y;
  player.progress.map = area.map;
  const combat = new Combat({ player, area, paused: false }, {
    onKill(enemy) { recordKill(player, area, enemy); },
  });
  const initialCount = area.enemies.length;
  assert.equal(area.requiredKills, initialCount);
  const bombers = area.enemies.filter(enemy => enemy.behavior === 'bomber').slice(0, 3);
  assert.equal(bombers.length, 3);

  for (const enemy of bombers) {
    enemy.x = player.x + enemy.radius + player.radius;
    enemy.y = player.y;
    combat.enemyAction(enemy, player);
  }
  combat.update(COMBAT.base.enemyThink);
  assert.equal(area.killed, 3);
  assert.ok(bombers.every(enemy => enemy.killRecorded && !area.enemies.includes(enemy)));

  for (const enemy of [...area.enemies]) combat.kill(enemy);
  combat.update(COMBAT.base.enemyThink);
  assert.equal(area.killed, initialCount);
  assert.equal(area.enemies.length, 0);
  assert.equal(area.cleared, true);
  assert.deepEqual(advance(player, area).options, { act: 0, map: 2, difficulty: 0, depth: 0 });
});

test('defeating the final boss unlocks and enters the next difficulty', () => {
  const player = createPlayer('warrior');
  const act = ACTS.length - 1;
  const map = ACTS[act].maps.length - 1;
  const area = createArea({ act, map }, () => 0.5);
  player.progress.act = act;
  player.progress.map = map;
  const combat = new Combat({ player, area, paused: false }, {
    onKill(enemy) { recordKill(player, area, enemy); },
  });

  for (const enemy of [...area.enemies]) combat.kill(enemy);
  combat.update(COMBAT.base.enemyThink);
  assert.equal(area.enemies.length, 0);
  assert.equal(player.progress.unlockedDifficulty, 1);
  const result = advance(player, area);
  assert.equal(result.ok, true);
  assert.deepEqual(result.options, { act: 0, map: 0, difficulty: 1, depth: 0 });
});
