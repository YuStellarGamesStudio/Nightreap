import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, createPlayer } from '../src/systems/combat.js';
import { COMBAT } from '../src/data/combat.js';

test('moving enemies do not stop player movement and mouse attacks', () => {
  const player = createPlayer('warrior');
  player.x = player.prevX = 500;
  player.y = player.prevY = 500;
  const enemy = {
    x: 680, y: 500, radius: 20, speed: 100, hp: 100, maxHp: 100,
    damage: 0, behavior: 'melee', status: {},
  };
  const area = { bounds: { width: 1000, height: 1000 }, obstacles: [], enemies: [enemy] };
  const state = { player, area, paused: false };
  const combat = new Combat(state);
  const input = { moveX: 1, moveY: 0, attack: true, aim: { x: 700, y: 500 } };

  combat.update(COMBAT.base.enemyThink, input);
  assert.ok(player.x > 500, 'WASD moves the player');
  assert.ok(enemy.x < 680, 'the enemy continues approaching');
  assert.ok(state.visuals.some(visual => visual.key === combat.skills[0].id), 'mouse attack casts');

  const previousX = player.x;
  combat.update(COMBAT.base.enemyThink, input);
  assert.ok(player.x > previousX, 'the following simulation frame still runs');
});
