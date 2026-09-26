import { CLASSES, COMBAT } from '../data/combat.js?v=936ca80f602c3b09';
import { AUDIO } from '../data/audio.js?v=2abfc8d355f88935';
import { SpatialGrid } from '../core/spatial.js?v=d1a3265c4541c2d0';
import { isWalkable } from './world.js?v=5c31f3b40f67ee3b';

const B = COMBAT.base;
const colors = COMBAT.colors;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const direction = (from, to) => {
  const x = to.x - from.x, y = to.y - from.y, length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};
const roll = percent => Math.random() * 100 < percent;
const has = (enemy, affix) => enemy.affixes?.includes(affix);

export function createPlayer(classId) {
  if (!CLASSES.some(entry => entry.id === classId)) throw new RangeError(`Unknown class: ${classId}`);
  const player = {
    classId, level: 1, xp: 0, gold: 0, materials: 0, tickets: 0,
    potions: { health: 2, resource: 2 }, inventory: [], equipment: {},
    attributes: { ...COMBAT.startingAttributes[classId] }, attributePoints: 0,
    skillPoints: 0, skillRanks: {},
    progress: { difficulty: 0, unlockedDifficulty: 0, act: 0, map: 0, firstKills: [] },
    x: 0, y: 0, prevX: 0, prevY: 0, hp: B.hp, maxHp: B.hp,
    resource: classId === 'warrior' || classId === 'necromancer' ? 0 : B.resource,
    maxResource: B.resource, damage: B.damage, speed: B.speed,
    form: 'human', status: {}, cooldowns: {}, buffs: {}, kind: 'player', radius: 20,
  };
  return player;
}

export class Combat {
  constructor(state, { onKill = () => {}, onDeath = () => {}, onEvent = () => {}, modifiers = () => ({}) } = {}) {
    this.state = state;
    this.onKill = onKill;
    this.onDeath = onDeath;
    this.onEvent = onEvent;
    this.modifiers = modifiers;
    this.grid = new SpatialGrid();
    this.enemyThought = 0;
    this.dead = false;
    this.attackTime = 0;
    this.trailDistance = 0;
    this.nextMinionId = 0;
    this.nextMonsterMovementSound = 0;
    this.nextPlayerMovementSound = 0;
    state.enemies = state.area.enemies;
    state.minions ||= [];
    state.projectiles ||= [];
    state.effects ||= [];
    state.corpses ||= [];
    state.time ||= 0;
    const p = state.player;
    p.status ||= {};
    p.cooldowns ||= {};
    p.buffs ||= {};
    this.refreshPlayer(false);
  }

  get player() { return this.state.player; }
  get traits() { return this.modifiers(this.player) || {}; }
  get role() { return CLASSES.find(entry => entry.id === this.player.classId); }
  get skills() { return this.role.forms?.[this.player.form] || this.role.skills; }

  refreshPlayer(preserve = true) {
    const p = this.player, m = this.traits, previousHp = p.maxHp || B.hp;
    const previousResource = p.maxResource || B.resource;
    const attributes = p.attributes;
    const primary = COMBAT.primary[p.classId];
    const power = attributes[primary] + (m.attribute || 0);
    const formLife = p.classId === 'druid' && p.form === 'bear' ? B.bearLife
      : p.classId === 'druid' && p.form === 'wolf' ? B.wolfLife : 1;
    const formDamage = p.classId === 'druid' && p.form !== 'human'
      ? (p.form === 'bear' ? B.bearDamage : B.wolfDamage) : 1;
    const levelMultiplier = 1 + (p.level - 1) * B.levelGrowth;
    p.maxHp = Math.round((B.hp * levelMultiplier + attributes.vitality * B.attributeLife + (m.life || 0))
      * (1 + attributes.vitality * B.vitalityLife / 10) * formLife);
    p.maxResource = Math.round((B.resource + attributes.spirit * B.spiritResource) * (1 + (m.resource || 0) / 100));
    p.damage = B.damage * levelMultiplier * (1 + power * B.attributeDamage) * formDamage * (1 + (m.damage || 0) / 100);
    p.speed = B.speed * (1 + (m.moveSpeed || 0) / 100)
      * (p.form === 'bear' ? B.bearSpeed : p.form === 'wolf' ? B.wolfSpeed : 1)
      * (p.classId === 'ranger' ? 1 + B.passiveRangerSpeed : 1);
    p.armor = (attributes.strength + (primary === 'strength' ? m.attribute || 0 : 0)) * B.strengthArmor
      * (p.classId === 'warrior' ? 1 + B.passiveWarriorArmor : 1) + (m.armor || 0);
    p.resistance = clamp((m.resistance || 0) / 100, 0, B.maxResistance);
    p.critChance = clamp(B.baseCrit + attributes.dexterity * B.dexterityCrit
      + (m.critChance || 0) / 100 + (p.classId === 'ranger' ? B.passiveRangerCrit : 0), 0, B.maxCrit);
    p.critDamage = B.critMultiplier + (m.critDamage || 0) / 100;
    p.hp = preserve ? clamp(p.hp / previousHp * p.maxHp, 0, p.maxHp) : clamp(p.hp, 0, p.maxHp);
    p.resource = preserve ? clamp(p.resource / previousResource * p.maxResource, 0, p.maxResource)
      : clamp(p.resource, 0, p.maxResource);
    return p;
  }

  addExperience(amount) {
    const p = this.player;
    p.xp += Math.max(0, amount);
    let levels = 0;
    while (p.level < B.levelCap) {
      const required = Math.floor(B.xpBase * B.xpGrowth ** (p.level - 1) + p.level * B.xpLevelBonus);
      if (p.xp < required) break;
      p.xp -= required;
      p.level++;
      p.attributePoints += B.attributePoints;
      p.skillPoints += B.skillPoints;
      levels++;
    }
    if (levels) {
      this.refreshPlayer();
      this.onEvent('level');
    }
    return levels;
  }

  spendAttribute(attribute) {
    if (!Object.hasOwn(this.player.attributes, attribute) || this.player.attributePoints <= 0) return false;
    this.player.attributePoints--;
    this.player.attributes[attribute]++;
    this.refreshPlayer();
    return true;
  }

  spendSkill(index) {
    const ability = this.role.skills[index];
    if (!ability || index === 0 || this.player.skillPoints <= 0) return false;
    const rank = this.player.skillRanks[ability.id] || 0;
    if (rank >= B.maxSkillRank) return false;
    this.player.skillPoints--;
    this.player.skillRanks[ability.id] = rank + 1;
    return true;
  }

  usePotion(type) {
    const p = this.player;
    if (type !== 'health' && type !== 'resource') return false;
    const field = type === 'health' ? 'hp' : 'resource';
    const cap = type === 'health' ? 'maxHp' : 'maxResource';
    if (!p.potions?.[type] || p[field] >= p[cap] || p.hp <= 0) return false;
    p.potions[type]--;
    p[field] = Math.min(p[cap], p[field] + p[cap] * B.potionFraction);
    this.flash(p.x, p.y, p.radius, 'heal');
    this.onEvent('potion');
    return true;
  }

  cast(index, aim = { x: this.player.x, y: this.player.y }) {
    const p = this.player, skill = this.skills[index];
    if (!skill || p.hp <= 0 || p.status.stunned > 0 || this.state.paused) return false;
    const cooldown = p.cooldowns[skill.id] || 0;
    if (cooldown > 0 || p.resource < skill.cost) return false;
    // Resource/cooldown remain untouched when a corpse or target-dependent skill cannot fire.
    if (skill.effects.some(effect => effect.type === 'raise') &&
      (!this.state.corpses.some(body => distance(body, p) <= skill.effects[0].range) || this.state.minions.length >= B.maxMinions)) return false;
    if (skill.effects.some(effect => effect.type === 'corpse') &&
      !this.state.corpses.some(body => distance(body, aim) <= skill.effects[0].range)) return false;
    const target = Number.isFinite(aim?.x) && Number.isFinite(aim?.y) ? aim : p;
    if (skill.effects.some(effect => effect.type === 'blink' || effect.type === 'dash') &&
      !this.destination(target, skill.effects[0].range)) return false;
    p.resource -= skill.cost;
    p.cooldowns[skill.id] = skill.cooldown * (1 - clamp((this.traits.cooldown || 0) / 100, 0, B.maxCooldown))
      / this.attackSpeed();
    const rank = Math.max(1, p.skillRanks[skill.id] || 1);
    const power = 1 + (rank - 1) * B.rankDamage;
    for (const effect of skill.effects) this.execute(effect, target, power);
    this.onEvent(index === 0 ? 'attack' : index === 7 ? 'ultimate' : 'skill');
    return true;
  }

  attackSpeed() {
    const p = this.player, m = this.traits;
    return 1 + (m.attackSpeed || 0) / 100 + (p.buffs.gale?.attackSpeed || 0)
      + (p.buffs.pack?.attackSpeed || 0) + (p.form === 'wolf' ? B.wolfAttackSpeed - 1 : 0);
  }

  destination(aim, range) {
    const p = this.player, d = direction(p, aim), length = Math.min(distance(p, aim), range);
    for (let traveled = length; traveled > 0; traveled -= B.collisionStep) {
      const x = p.x + d.x * traveled, y = p.y + d.y * traveled;
      if (isWalkable(this.state.area, x, y, p.radius)) return { x, y };
    }
    return null;
  }

  move(entity, dx, dy) {
    const area = this.state.area, radius = entity.radius || 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / B.collisionStep));
    for (let step = 0; step < steps; step++) {
      const x = entity.x + dx / steps, y = entity.y + dy / steps;
      if (isWalkable(area, x, entity.y, radius)) entity.x = x;
      if (isWalkable(area, entity.x, y, radius)) entity.y = y;
    }
  }

  flash(x, y, radius, type, life = B.effectFlashLife) {
    this.state.effects.push({ x, y, radius, type, color: colors[type] || colors.physical, life, maxLife: life });
  }

  nearby(x, y, radius) { return this.grid.query(x, y, radius); }

  applyStatus(entity, status, duration, damage = 0) {
    if (!status || entity.hp <= 0) return;
    const statuses = entity.status ||= {};
    const time = duration || B.statusLife[status];
    statuses[status] = Math.max(statuses[status] || 0,
      time * (entity === this.player || this.player.classId !== 'wizard' ? 1 : 1 + B.passiveWizardStatus));
    if (status === 'burning' || status === 'poisoned') {
      const dots = entity.dots ||= {};
      dots[status] = Math.max(dots[status] || 0, damage * B.dotDamage
        * (status === 'poisoned' && this.player.classId === 'necromancer' ? 1 + B.passiveNecroPoison : 1));
    }
  }

  damageEnemy(enemy, power, options = {}) {
    if (enemy.hp <= 0 || enemy._killed) return 0;
    const m = this.traits, p = this.player, status = enemy.status || {};
    const scale = (key, active) => active ? (m[key] || 0) / 100 : 0;
    const bonus = scale('burningDamage', status.burning > 0) + scale('frozenDamage', status.frozen > 0)
      + scale('poisonedDamage', status.poisoned > 0) + scale('fearedDamage', status.feared > 0)
      + scale('stunnedDamage', status.stunned > 0) + scale('eliteDamage', enemy.elite || enemy.boss)
      + scale('executeDamage', enemy.hp / enemy.maxHp < 0.3)
      + scale('healthyDamage', p.hp / p.maxHp > 0.8);
    const controlled = status.frozen > 0 || status.feared > 0 || status.stunned > 0;
    const critical = !options.dot && Math.random() < clamp(p.critChance * (options.critScale || 1)
      + (controlled ? (m.controlCrit || 0) / 100 : 0), 0, B.maxCrit);
    const amount = Math.min(enemy.hp, Math.max(0, (options.flat ? power : p.damage * power)
      * (1 + bonus) * (critical ? p.critDamage : 1) * (options.element === 'physical' ? 1 : 1 - (enemy.resistance || 0))));
    enemy.hp -= amount;
    if (!options.dot && amount > 0 && distance(enemy, p) < AUDIO.audibleRange)
      this.onEvent('monsterHurt');
    if (!options.dot && amount > 0) {
      if (p.classId === 'warrior') p.resource = Math.min(p.maxResource, p.resource + B.hitRage);
      if (p.classId === 'ranger') p.resource = Math.min(p.maxResource, p.resource + B.hitEnergy);
      p.hp = Math.min(p.maxHp, p.hp + amount * (m.lifeSteal || 0) / 100 + amount * (options.heal || 0));
      p.resource = Math.min(p.maxResource, p.resource + amount * (m.resourceSteal || 0) / 100);
      if (options.status) this.applyStatus(enemy, options.status, options.statusTime, p.damage * power);
      if (options.knockback) this.push(enemy, options.knockback, options.origin || p);
      if (options.proc !== false) {
        if (roll(m.burnOnHit || 0)) this.applyStatus(enemy, 'burning', 0, amount);
        if (roll(m.poisonOnHit || 0)) this.applyStatus(enemy, 'poisoned', 0, amount);
        if (roll(m.freezeOnHit || 0)) this.applyStatus(enemy, 'frozen');
        if (critical && roll(m.chainLightning || 0))
          this.chain(enemy, B.procChainTargets, B.procChainRange, B.procChainDamage, { proc: false, element: 'lightning' });
      }
    }
    if (enemy.hp <= 0) this.kill(enemy);
    return amount;
  }

  kill(enemy) {
    if (enemy._killed) return;
    enemy._killed = true;
    enemy.hp = 0;
    this.state.corpses.push({ x: enemy.x, y: enemy.y, radius: enemy.radius,
      life: B.corpseLife, family: enemy.family });
    if (this.state.corpses.length > B.deathCorpseLimit) this.state.corpses.shift();
    const p = this.player, m = this.traits;
    if (p.classId === 'necromancer') p.resource = Math.min(p.maxResource,
      p.resource + B.killEssence * (1 + B.passiveNecroEssence));
    if (m.killSpeed) p.buffs.killSpeed = { life: B.killSpeedDuration };
    this.addExperience(enemy.xp ?? enemy.experience ?? 0);
    this.onKill(enemy);
    this.onEvent(enemy.boss ? 'bossKill' : 'kill');
    // Proc damage is explicitly non-triggering: explosions never recursively chain.
    if (roll(m.explosion || 0)) this.area(enemy.x, enemy.y, B.procExplosionRadius,
      B.procExplosionDamage, { proc: false, element: 'fire' });
    if (roll(m.skeletonOnKill || 0)) this.summon('skeleton', 1, B.skeletonLife);
  }

  damagePlayer(amount, element = 'physical', attacker = null) {
    const p = this.player;
    if (p.hp <= 0 || p.buffs.invulnerable?.life > 0) return 0;
    const reduction = clamp((p.buffs.warcry?.reduction || 0) + (p.buffs.energyshield?.reduction || 0)
      + (p.buffs.guard?.reduction || 0) + (p.buffs.energyshield ? B.passiveWizardShield : 0), 0, B.maxResistance);
    const mitigation = element === 'physical' ? B.armorScale / (B.armorScale + p.armor) : 1 - p.resistance;
    const actual = Math.min(p.hp, Math.max(0, amount * mitigation * (1 - reduction)));
    if (actual >= p.hp && this.traits.cheatDeath && !p.cooldowns.cheatDeath) {
      p.hp = 1;
      p.cooldowns.cheatDeath = B.cheatDeathCooldown;
      this.flash(p.x, p.y, p.radius, 'heal');
      return actual;
    }
    p.hp -= actual;
    if (p.classId === 'warrior' && actual > 0) p.resource = Math.min(p.maxResource,
      p.resource + B.hurtRage * (1 + B.passiveWarriorRage));
    if (actual > 0) {
      p.buffs.invulnerable = { life: B.damageInvulnerability };
      if (attacker && has(attacker, 'vampiric')) attacker.hp = Math.min(attacker.maxHp,
        attacker.hp + actual * B.eliteLeech);
      if (roll(this.traits.frostNova || 0)) this.area(p.x, p.y, B.procFrostRadius, 0,
        { status: 'frozen', proc: false, element: 'frost' });
      this.onEvent('hurt');
    }
    if (p.hp <= 0 && !this.dead) { this.dead = true; this.onDeath(); }
    return actual;
  }

  push(target, distanceValue, from) {
    const d = direction(from, target);
    this.move(target, d.x * distanceValue, d.y * distanceValue);
  }

  area(x, y, radius, power, options = {}) {
    let hits = 0;
    for (const enemy of this.nearby(x, y, radius)) {
      if (options.normalOnly && (enemy.elite || enemy.boss)) continue;
      if (power > 0) this.damageEnemy(enemy, power, { ...options, origin: { x, y } });
      else if (options.status) this.applyStatus(enemy, options.status, options.statusTime);
      hits++;
    }
    this.flash(x, y, radius, options.element || options.status || 'physical');
    return hits;
  }

  cone(origin, target, effect, power) {
    const facing = direction(origin, target);
    let hits = 0;
    for (const enemy of this.nearby(origin.x, origin.y, effect.range)) {
      const d = direction(origin, enemy);
      if (d.x * facing.x + d.y * facing.y < Math.cos(effect.arc / 2)) continue;
      this.damageEnemy(enemy, power * effect.power, effect);
      hits++;
    }
    if (hits >= (effect.crowd || Infinity)) this.player.resource = Math.min(this.player.maxResource,
      this.player.resource + effect.rage);
    this.flash(origin.x + facing.x * effect.range / 2, origin.y + facing.y * effect.range / 2,
      effect.range / 2, effect.element || 'physical');
  }

  line(origin, target, effect, power) {
    const facing = direction(origin, target);
    const endpoint = { x: origin.x + facing.x * effect.range, y: origin.y + facing.y * effect.range };
    for (const enemy of this.nearby(origin.x, origin.y, effect.range)) {
      const along = (enemy.x - origin.x) * facing.x + (enemy.y - origin.y) * facing.y;
      const side = Math.abs((enemy.x - origin.x) * facing.y - (enemy.y - origin.y) * facing.x);
      if (along >= 0 && along <= effect.range && side <= effect.width + enemy.radius)
        this.damageEnemy(enemy, power * effect.power, effect);
    }
    this.flash(endpoint.x, endpoint.y, effect.width, effect.element || 'physical');
  }

  chain(first, jumps, range, power, options = {}) {
    const visited = new Set();
    let current = first;
    for (let i = 0; current && i < jumps; i++) {
      visited.add(current);
      this.damageEnemy(current, power, options);
      this.flash(current.x, current.y, current.radius * 2, 'lightning');
      let next = null, closest = Infinity;
      for (const enemy of this.nearby(current.x, current.y, range)) {
        const dist = distance(current, enemy);
        if (!visited.has(enemy) && dist < closest) { next = enemy; closest = dist; }
      }
      current = next;
    }
  }

  summon(kind, count, duration, taunt = 0) {
    const s = this.state, p = this.player;
    for (let i = 0; i < count && s.minions.length < B.maxMinions; i++) {
      if (kind === 'golem' && s.minions.some(minion => minion.kind === 'golem')) break;
      const angle = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(angle) * B.minionRadius * 2;
      const y = p.y + Math.sin(angle) * B.minionRadius * 2;
      const minion = {
        id: `minion-${++this.nextMinionId}`, kind, family: kind, side: 'player',
        x: isWalkable(s.area, x, y, B.minionRadius) ? x : p.x,
        y: isWalkable(s.area, x, y, B.minionRadius) ? y : p.y,
        prevX: x, prevY: y, radius: B.minionRadius,
        hp: p.maxHp * B.minionHealth * (kind === 'golem' ? B.golemHealth : 1),
        maxHp: p.maxHp * B.minionHealth * (kind === 'golem' ? B.golemHealth : 1),
        speed: B.minionSpeed, damage: p.damage * B.minionDamage
          * (kind === 'golem' ? B.golemDamage : kind === 'wolf' ? B.wolfDamage : 1),
        life: duration, attackTime: 0, taunt, status: {},
      };
      s.minions.push(minion);
      this.flash(minion.x, minion.y, minion.radius * 2, kind === 'wolf' ? 'heal' : 'arcane');
    }
  }

  execute(effect, target, power) {
    const p = this.player, s = this.state;
    switch (effect.type) {
      case 'cone': this.cone(p, target, effect, power); break;
      case 'nova': this.area(p.x, p.y, effect.radius, power * effect.power,
        { ...effect, innerRadius: effect.innerRadius }); break;
      case 'line': this.line(p, target, effect, power); break;
      case 'projectile': {
        const face = direction(p, target), count = effect.count || 1;
        for (let i = 0; i < count; i++) {
          const angle = (i - (count - 1) / 2) * (effect.spread || 0);
          const dx = face.x * Math.cos(angle) - face.y * Math.sin(angle);
          const dy = face.y * Math.cos(angle) + face.x * Math.sin(angle);
          this.projectile({ x: p.x, y: p.y, dx, dy, side: 'player',
            power: effect.power * power, speed: B.projectileSpeed, range: effect.range,
            radius: B.projectileRadius, homing: effect.homing, pierce: effect.pierce,
            blast: effect.blast, status: effect.status, statusTime: effect.statusTime,
            knockback: effect.knockback, element: effect.element });
        }
        break;
      }
      case 'chain': {
        let nearest = null, best = Infinity;
        for (const enemy of this.nearby(target.x, target.y, effect.range)) {
          const dist = distance(enemy, target);
          if (dist < best) { nearest = enemy; best = dist; }
        }
        if (nearest) this.chain(nearest, effect.jumps, effect.jumpRange, effect.power * power,
          { element: effect.element });
        break;
      }
      case 'zone': {
        const origin = effect.range ? this.targetPoint(target, effect.range) : p;
        s.effects.push({ x: origin.x, y: origin.y, radius: effect.radius,
          type: effect.delay ? 'telegraph' : 'zone', color: colors[effect.element] || colors.physical,
          life: (effect.delay || 0) + (effect.duration || 0) + B.effectFlashLife,
          maxLife: (effect.delay || 0) + (effect.duration || 0) + B.effectFlashLife,
          delay: effect.delay || 0, active: effect.duration || 0, interval: effect.interval || 0,
          pulse: 0, pulses: effect.pulses || 0, power: power * effect.power,
          element: effect.element, status: effect.status, statusTime: effect.statusTime, side: 'player' });
        break;
      }
      case 'aura':
        s.effects.push({ x: p.x, y: p.y, radius: effect.radius, type: 'aura',
          color: colors[effect.element] || colors.arcane, life: effect.duration,
          maxLife: effect.duration, interval: effect.interval, pulse: 0,
          follow: effect.follow, pull: effect.pull, reflect: effect.reflect,
          randomElement: effect.randomElement, power: effect.power * power,
          element: effect.element, side: 'player' });
        break;
      case 'buff': p.buffs[effect.key] = { ...effect, life: effect.duration
        * (p.classId === 'druid' && effect.key === 'stormavatar' ? 1 + B.passiveDruidForm : 1) }; break;
      case 'buffMinions':
        for (const minion of s.minions) minion.buff = { life: effect.duration,
          damage: effect.damage, speed: effect.speed }; break;
      case 'blink':
      case 'dash': {
        const dest = this.destination(target, effect.range);
        if (dest) {
          if (effect.type === 'dash') {
            const d = direction(p, dest);
            this.move(p, d.x * distance(p, dest), d.y * distance(p, dest));
          } else { p.x = dest.x; p.y = dest.y; }
          if (effect.invulnerable) p.buffs.invulnerable = { life: effect.invulnerable };
          this.flash(p.x, p.y, p.radius * 2, 'arcane');
        }
        break;
      }
      case 'rush': {
        const dest = this.destination(target, effect.range);
        if (!dest) break;
        const d = direction(p, dest), length = distance(p, dest), hit = new Set();
        for (let step = 0; step < length; step += B.collisionStep) {
          this.move(p, d.x * B.collisionStep, d.y * B.collisionStep);
          for (const enemy of this.nearby(p.x, p.y, effect.radius)) {
            if (hit.has(enemy)) continue;
            hit.add(enemy);
            this.damageEnemy(enemy, effect.power * power, { ...effect, origin: p });
          }
        }
        if (effect.finishRadius) this.area(p.x, p.y, effect.finishRadius, effect.finishPower * power,
          { element: 'physical', knockback: effect.knockback });
        if (effect.invulnerable) p.buffs.invulnerable = { life: effect.invulnerable };
        break;
      }
      case 'form':
        p.form = effect.form;
        this.refreshPlayer();
        if (effect.taunt) for (const enemy of this.nearby(p.x, p.y, effect.taunt)) enemy.tauntedBy = p;
        this.flash(p.x, p.y, p.radius * 3, 'heal');
        break;
      case 'raise': {
        let raised = 0;
        for (let i = s.corpses.length - 1; i >= 0 && raised < effect.count; i--) {
          if (distance(s.corpses[i], p) > effect.range || s.minions.length >= B.maxMinions) continue;
          const corpse = s.corpses.splice(i, 1)[0];
          this.summon(effect.kind, 1, B.skeletonLife);
          const minion = s.minions.at(-1);
          minion.x = corpse.x; minion.y = corpse.y;
          raised++;
        }
        break;
      }
      case 'corpse': {
        const queue = [];
        for (const corpse of s.corpses) if (distance(corpse, target) <= effect.range) queue.push(corpse);
        if (!queue.length) break;
        const consumed = new Set();
        // Breadth-first explosion: each corpse detonates once; secondary hits never proc other procs.
        for (let i = 0; i < queue.length; i++) {
          const corpse = queue[i];
          if (consumed.has(corpse)) continue;
          consumed.add(corpse);
          this.area(corpse.x, corpse.y, effect.radius, effect.power * power,
            { element: effect.element, proc: false });
          for (const next of s.corpses) if (!consumed.has(next) && !queue.includes(next)
            && distance(corpse, next) < effect.chainRange) queue.push(next);
        }
        s.corpses = s.corpses.filter(body => !consumed.has(body));
        break;
      }
      case 'prison': {
        const point = this.targetPoint(target, effect.range);
        for (const enemy of this.nearby(point.x, point.y, effect.radius)) {
          this.applyStatus(enemy, effect.status, effect.statusTime);
          enemy.prison = { x: point.x, y: point.y, radius: effect.radius, life: effect.duration };
        }
        s.effects.push({ x: point.x, y: point.y, radius: effect.radius,
          type: 'prison', color: colors.physical, life: effect.duration, maxLife: effect.duration });
        break;
      }
      case 'trap': {
        const point = this.targetPoint(target, effect.range);
        s.effects.push({ x: point.x, y: point.y, radius: effect.triggerRadius,
          blastRadius: effect.radius, type: 'trap', color: colors.fire,
          power: effect.power * power, element: effect.element,
          life: effect.duration, maxLife: effect.duration });
        break;
      }
      case 'tornado': {
        const d = direction(p, target);
        s.effects.push({ x: p.x, y: p.y, dx: d.x, dy: d.y, radius: effect.radius,
          type: 'tornado', color: colors.frost, life: effect.duration,
          maxLife: effect.duration, speed: effect.speed, pulse: 0,
          interval: effect.interval, power: effect.power * power, pull: effect.pull,
          side: 'player' });
        break;
      }
      case 'summon': this.summon(effect.kind, effect.count, effect.duration, effect.taunt); break;
    }
  }

  targetPoint(target, range) {
    const p = this.player, d = direction(p, target);
    const length = Math.min(distance(p, target), range);
    return { x: p.x + d.x * length, y: p.y + d.y * length };
  }

  projectile(options) {
    const lifetime = options.range ? options.range / options.speed : B.projectileLife;
    this.state.projectiles.push({ ...options, prevX: options.x, prevY: options.y,
      life: lifetime, maxLife: lifetime, hit: new Set(), kind: 'projectile',
      color: colors[options.element] || colors.physical });
  }

  tickProjectiles(dt) {
    const s = this.state, p = this.player;
    for (let i = s.projectiles.length - 1; i >= 0; i--) {
      const shot = s.projectiles[i];
      shot.prevX = shot.x; shot.prevY = shot.y;
      if (shot.homing) {
        let target = null, best = Infinity;
        for (const enemy of this.nearby(shot.x, shot.y, B.minionFindRadius)) {
          const d = distance(shot, enemy);
          if (d < best) { target = enemy; best = d; }
        }
        if (target) { const facing = direction(shot, target); shot.dx = facing.x; shot.dy = facing.y; }
      }
      let struck = false;
      const steps = Math.max(1, Math.ceil(shot.speed * dt / B.collisionStep));
      for (let step = 0; step < steps && !struck; step++) {
        shot.x += shot.dx * shot.speed * dt / steps;
        shot.y += shot.dy * shot.speed * dt / steps;
        if (!isWalkable(s.area, shot.x, shot.y, shot.radius)) { struck = true; break; }
        if (shot.side === 'player') {
          for (const enemy of this.nearby(shot.x, shot.y, shot.radius + B.projectileHitPadding)) {
            if (shot.hit.has(enemy)) continue;
            shot.hit.add(enemy);
            if (shot.blast) this.area(shot.x, shot.y, shot.blast, shot.power,
              { status: shot.status, statusTime: shot.statusTime, element: shot.element });
            else this.damageEnemy(enemy, shot.power, shot);
            if (!shot.pierce) { struck = true; break; }
          }
        } else if (p.hp > 0 && distance(shot, p) < shot.radius + p.radius) {
          if (!p.buffs.bladestorm && !s.effects.some(effect => effect.reflect && effect.life > 0)) {
            this.damagePlayer(shot.damage, shot.element, shot.source);
            if (shot.status) this.applyStatus(p, shot.status, shot.statusTime);
          } else this.area(shot.x, shot.y, B.procExplosionRadius, B.procExplosionDamage,
            { element: 'physical', proc: false });
          struck = true;
        } else {
          for (const minion of s.minions) {
            if (minion.hp <= 0 || distance(shot, minion) > shot.radius + minion.radius) continue;
            minion.hp -= shot.damage;
            struck = true;
            break;
          }
        }
      }
      shot.life -= dt;
      if (struck || shot.life <= 0) s.projectiles.splice(i, 1);
    }
  }

  tickEffects(dt) {
    const s = this.state;
    for (let i = s.effects.length - 1; i >= 0; i--) {
      const effect = s.effects[i];
      effect.life -= dt;
      if (effect.follow) { effect.x = this.player.x; effect.y = this.player.y; }
      if (effect.type === 'tornado') {
        this.move(effect, effect.dx * effect.speed * dt, effect.dy * effect.speed * dt);
      }
      if (effect.type === 'trap' && this.nearby(effect.x, effect.y, effect.radius).length) {
        this.area(effect.x, effect.y, effect.blastRadius, effect.power, { element: effect.element });
        effect.life = 0;
      }
      if (effect.type === 'zone' || effect.type === 'telegraph' || effect.type === 'aura'
        || effect.type === 'tornado' || effect.type === 'trail' || effect.type === 'hazard') {
        if (effect.delay > 0) {
          effect.delay -= dt;
          if (effect.delay <= 0) effect.type = effect.side === 'enemy' ? 'hazard' : 'zone';
        } else if (effect.pulses !== 0 || effect.active > 0 || effect.type === 'aura'
          || effect.type === 'tornado' || effect.type === 'trail' || effect.type === 'hazard') {
          effect.pulse -= dt;
          if (effect.pulse <= 0) {
            effect.pulse = effect.interval || B.statusTick;
            if (effect.side === 'enemy') {
              if (distance(effect, this.player) < effect.radius + this.player.radius)
                this.damagePlayer(effect.damage, effect.element, effect.source);
            } else {
              if (effect.pull) for (const enemy of this.nearby(effect.x, effect.y, effect.radius * 2)) {
                const d = direction(enemy, effect);
                this.move(enemy, d.x * effect.pull * effect.interval, d.y * effect.pull * effect.interval);
              }
              const element = effect.randomElement
                ? ['fire', 'frost', 'lightning'][Math.floor(Math.random() * 3)] : effect.element;
              this.area(effect.x, effect.y, effect.radius, effect.power,
                { element, status: effect.status || (effect.randomElement && element === 'frost' ? 'frozen' :
                  effect.randomElement && element === 'fire' ? 'burning' : null),
                statusTime: effect.statusTime, proc: effect.type === 'trail' ? false : undefined });
            }
            if (effect.pulses > 0) effect.pulses--;
          }
          if (effect.active > 0) effect.active -= dt;
        }
      }
      if (effect.life <= 0) s.effects.splice(i, 1);
    }
  }

  tickStatuses(entity, dt) {
    const status = entity.status ||= {};
    for (const key of Object.keys(status)) {
      if (status[key] <= 0) { delete status[key]; continue; }
      const elapsed = Math.min(dt, status[key]);
      if (entity.dots?.[key] && entity.hp > 0) {
        if (entity === this.player) this.damagePlayer(entity.dots[key] * elapsed, key === 'burning' ? 'fire' : 'poison');
        else this.damageEnemy(entity, entity.dots[key] * elapsed, { flat: true, dot: true, proc: false });
      }
      status[key] -= dt;
      if (status[key] <= 0) { delete status[key]; if (entity.dots) delete entity.dots[key]; }
    }
  }

  tickMinions(dt) {
    const s = this.state;
    for (let i = s.minions.length - 1; i >= 0; i--) {
      const m = s.minions[i];
      m.prevX = m.x; m.prevY = m.y;
      m.life -= dt;
      m.attackTime -= dt;
      if (m.buff) { m.buff.life -= dt; if (m.buff.life <= 0) delete m.buff; }
      if (m.life <= 0 || m.hp <= 0) { s.minions.splice(i, 1); continue; }
      let target = null, best = Infinity;
      for (const enemy of this.nearby(m.x, m.y, B.minionFindRadius)) {
        const d = distance(m, enemy);
        if (d < best) { target = enemy; best = d; }
      }
      if (distance(m, this.player) > B.minionTeleportRange) {
        m.x = this.player.x; m.y = this.player.y;
      } else if (target && best > m.radius + target.radius + B.enemyContactRange) {
        const d = direction(m, target), speed = m.speed * (1 + (m.buff?.speed || 0));
        this.move(m, d.x * speed * dt, d.y * speed * dt);
      } else if (!target && distance(m, this.player) > B.minionFollowRadius) {
        const d = direction(m, this.player);
        this.move(m, d.x * m.speed * dt, d.y * m.speed * dt);
      }
      if (target && best < m.radius + target.radius + B.enemyContactRange && m.attackTime <= 0) {
        this.damageEnemy(target, m.damage / this.player.damage * (1 + (m.buff?.damage || 0)),
          { proc: false, element: 'physical' });
        m.attackTime = B.minionAttackInterval;
      }
    }
  }

  enemyTarget(enemy) {
    let target = this.player, best = distance(enemy, target);
    for (const minion of this.state.minions) {
      const d = distance(enemy, minion);
      if (d < best || (minion.taunt && d < minion.taunt)) { target = minion; best = d; }
    }
    return target;
  }

  enemyHit(enemy, target, multiplier = 1, status = null) {
    if (target === this.player) {
      this.damagePlayer(enemy.damage * multiplier, enemy.element || 'physical', enemy);
      if (status) this.applyStatus(target, status);
      if (distance(enemy, this.player) < AUDIO.audibleRange) this.onEvent('enemyAttack');
    } else target.hp -= enemy.damage * multiplier;
  }

  enemyProjectile(enemy, target, spread = 0, status = null) {
    const d = direction(enemy, target), angle = Math.atan2(d.y, d.x) + spread;
    this.projectile({ x: enemy.x, y: enemy.y, dx: Math.cos(angle), dy: Math.sin(angle),
      side: 'enemy', source: enemy, radius: B.enemyProjectileRadius,
      speed: B.enemyProjectileSpeed, range: B.enemyCasterRange + B.enemyRangedRange,
      damage: enemy.damage, element: enemy.element || 'physical', status });
    if (distance(enemy, this.player) < AUDIO.audibleRange) this.onEvent('enemyAttack');
  }

  telegraph(enemy, target, radius, delay, damage, element = 'physical', type = 'strike') {
    this.state.effects.push({ x: target.x, y: target.y, radius,
      type: 'telegraph', color: colors.warning, life: delay + B.effectFlashLife,
      maxLife: delay + B.effectFlashLife, delay, active: 0, pulses: 1,
      damage, side: 'enemy', element, source: enemy, strike: type });
    if (!enemy.boss && distance(enemy, this.player) < AUDIO.audibleRange)
      this.onEvent(element === 'physical' ? 'enemyAttack' : 'monsterCast');
  }

  enemyAction(enemy, target) {
    const dist = distance(enemy, target), behavior = enemy.behavior || 'melee';
    const elite = enemy.elite || enemy.boss;
    const interval = B.enemyAttackInterval * (has(enemy, 'swift') ? 1 - B.enemyFlank : 1);
    switch (behavior) {
      case 'ranged':
      case 'caster': {
        const range = behavior === 'caster' ? B.enemyCasterRange : B.enemyRangedRange;
        if (dist < range) {
          if (behavior === 'caster') this.telegraph(enemy, target, B.enemyBomberRange,
            B.enemyWindup, enemy.damage, enemy.element || 'arcane');
          else {
            this.enemyProjectile(enemy, target);
            if (has(enemy, 'multishot')) {
              this.enemyProjectile(enemy, target, B.eliteMultishotAngle);
              this.enemyProjectile(enemy, target, -B.eliteMultishotAngle);
            }
          }
          enemy.attackTime = interval * (behavior === 'caster' ? 1.6 : 1.35);
        }
        break;
      }
      case 'bomber':
        if (dist < B.enemyBomberRange + target.radius) {
          this.telegraph(enemy, target, B.enemyBomberRange, B.enemyWindup,
            enemy.damage * 2, 'fire');
          enemy.hp = 0;
          enemy._killed = true;
          enemy.attackTime = interval;
        }
        break;
      case 'charger':
        if (dist < B.enemyChargeRange && dist > B.enemyTankRange) {
          const d = direction(enemy, target);
          enemy.charge = { dx: d.x, dy: d.y, life: B.enemyChargeLength / (enemy.speed * B.enemyChargeSpeed) };
          this.telegraph(enemy, target, B.enemyTankRange, B.enemyWindup, enemy.damage, 'physical');
          enemy.attackTime = interval * 1.8;
        } else if (dist < enemy.radius + target.radius + B.enemyContactRange) {
          this.enemyHit(enemy, target);
          enemy.attackTime = interval;
        }
        break;
      case 'burrower':
        if (dist < B.enemyBurrowRange && dist > B.enemyTankRange) {
          enemy.burrow = { x: target.x, y: target.y, life: B.enemyBurrowDelay };
          this.telegraph(enemy, target, B.enemyTankRange, B.enemyBurrowDelay,
            enemy.damage, 'physical');
          enemy.attackTime = interval * 2;
        } else if (dist < enemy.radius + target.radius + B.enemyContactRange) {
          this.enemyHit(enemy, target);
          enemy.attackTime = interval;
        }
        break;
      default:
        if (dist < enemy.radius + target.radius + (behavior === 'tank' ? B.enemyTankRange : B.enemyContactRange)) {
          this.telegraph(enemy, target, enemy.radius + target.radius + B.enemyContactRange,
            B.enemyWindup, enemy.damage * (behavior === 'tank' ? 1.5 : 1), 'physical');
          enemy.attackTime = interval * (behavior === 'tank' ? 1.6 : 1);
        }
    }
    if (elite && has(enemy, 'flame') && Math.random() < B.enemyBurnChance)
      this.telegraph(enemy, target, B.enemyBomberRange, B.enemyWindup,
        enemy.damage * B.enemyPoisonChance, 'fire');
  }

  bossAction(enemy, target) {
    const diff = enemy.difficulty ?? this.state.area.difficulty ?? 0;
    const ratio = enemy.hp / enemy.maxHp;
    const phase = ratio <= B.bossPhaseThree ? 3 : ratio <= B.bossPhaseTwo ? 2 : 1;
    if (phase !== enemy.phase) {
      enemy.phase = phase;
      this.flash(enemy.x, enemy.y, B.bossNovaRadius, 'arcane', B.bossTelegraphLife);
      this.onEvent('bossPhase');
      if (distance(enemy, this.player) < AUDIO.audibleRange) this.onEvent('monsterRoar');
    }
    const cycle = enemy.attackCycle = (enemy.attackCycle || 0) + 1;
    const abilities = enemy.bossAbilities || ['fanVolley', 'summon', 'hazard', 'homing'];
    const available = abilities.filter((_, index) => index <= diff && (phase > 1 || index === 0));
    const ability = available[(cycle - 1) % available.length];
    if (ability === 'summon') {
      const count = Math.min(B.bossSummonCount + phase - 1, B.maxEnemies - this.state.enemies.length);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const x = enemy.x + Math.cos(angle) * B.bossRingRadius;
        const y = enemy.y + Math.sin(angle) * B.bossRingRadius;
        if (!isWalkable(this.state.area, x, y, B.minionRadius)) continue;
        this.state.enemies.push({ id: `${enemy.id}-summon-${cycle}-${i}`, kind: 'monster', family: enemy.family,
          behavior: 'melee', x, y, prevX: x, prevY: y, radius: B.minionRadius,
          hp: enemy.maxHp * B.bossSummonHealth, maxHp: enemy.maxHp * B.bossSummonHealth,
          speed: enemy.speed * B.bossSummonSpeed, damage: enemy.damage * B.bossSummonDamage,
          xp: B.bossSummonXp, gold: 0, status: {} });
      }
    } else if (ability === 'hazard') {
      this.state.effects.push({ x: target.x, y: target.y, radius: B.bossHazardRadius,
        type: 'telegraph', color: colors.warning,
        life: B.bossWindup + B.bossHazardLife, maxLife: B.bossWindup + B.bossHazardLife,
        delay: B.bossWindup, active: B.bossHazardLife, pulse: 0, interval: B.statusTick,
        damage: enemy.damage * B.bossSummonDamage, element: 'fire', side: 'enemy', source: enemy });
    } else if (ability === 'homing') {
      const d = direction(enemy, target);
      this.projectile({ x: enemy.x, y: enemy.y, dx: d.x, dy: d.y,
        side: 'enemy', source: enemy, radius: B.enemyProjectileRadius * 2,
        speed: B.bossTrackingSpeed, range: B.enemyLeash, damage: enemy.damage,
        element: 'arcane', homingPlayer: true });
    } else {
      const face = direction(enemy, target);
      const count = B.bossBulletCount + (phase - 1) * B.bossBulletGrowth;
      for (let i = 0; i < count; i++) {
        const angle = Math.atan2(face.y, face.x) + (i - (count - 1) / 2) * B.bossBarrageWidth;
        this.projectile({ x: enemy.x, y: enemy.y, dx: Math.cos(angle), dy: Math.sin(angle),
          side: 'enemy', source: enemy, radius: B.enemyProjectileRadius,
          speed: B.enemyProjectileSpeed, range: B.enemyLeash, damage: enemy.damage,
          element: 'arcane' });
      }
      this.telegraph(enemy, target, B.bossNovaRadius, B.bossWindup,
        enemy.damage, 'arcane');
    }
    if (phase >= 2 && diff >= 1) this.telegraph(enemy, target, B.bossRingRadius,
      B.bossWindup, enemy.damage * B.bossSummonDamage, 'arcane');
    enemy.attackTime = B.bossCooldown * (1 - (phase - 1) * B.bossPhaseSpeed);
    if (distance(enemy, this.player) < AUDIO.audibleRange) this.onEvent('bossCast');
  }

  emitMonsterMovement(enemy) {
    if (this.state.time < this.nextMonsterMovementSound ||
        (enemy.x === enemy.prevX && enemy.y === enemy.prevY) ||
        distance(enemy, this.player) >= AUDIO.audibleRange) return;
    this.nextMonsterMovementSound = this.state.time + AUDIO.monsterMovementInterval;
    this.onEvent('monsterMove');
  }

  tickEnemies(dt, think) {
    const p = this.player;
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.prevX = enemy.x; enemy.prevY = enemy.y;
      this.tickStatuses(enemy, dt);
      if (enemy.hp <= 0) continue;
      enemy.attackTime = Math.max(0, (enemy.attackTime || 0) - dt);
      if (enemy.prison) {
        enemy.prison.life -= dt;
        if (enemy.prison.life <= 0) delete enemy.prison;
      }
      if (enemy.burrow) {
        enemy.burrow.life -= dt;
        if (enemy.burrow.life <= 0) {
          if (isWalkable(this.state.area, enemy.burrow.x, enemy.burrow.y, enemy.radius)) {
            enemy.x = enemy.burrow.x; enemy.y = enemy.burrow.y;
          }
          delete enemy.burrow;
        }
        continue;
      }
      if (enemy.charge) {
        const speed = enemy.speed * B.enemyChargeSpeed;
        this.move(enemy, enemy.charge.dx * speed * dt, enemy.charge.dy * speed * dt);
        enemy.charge.life -= dt;
        if (enemy.charge.life <= 0) delete enemy.charge;
        this.emitMonsterMovement(enemy);
        continue;
      }
      if (enemy.status.stunned > 0 || enemy.status.frozen > 0) continue;
      if (think) {
        enemy.target = this.enemyTarget(enemy);
        if (!enemy._roared && distance(enemy, this.player) < AUDIO.audibleRange) {
          enemy._roared = true;
          this.onEvent('monsterRoar');
        }
        if (enemy.boss) {
          if (enemy.attackTime <= 0 && distance(enemy, enemy.target) < B.enemyLeash)
            this.bossAction(enemy, enemy.target);
        } else if (enemy.attackTime <= 0 && distance(enemy, enemy.target) < B.enemyAggro)
          this.enemyAction(enemy, enemy.target);
      }
      const target = enemy.target || p, dist = distance(enemy, target);
      if (dist > B.enemyLeash) continue;
      const behavior = enemy.behavior || 'melee';
      const ranged = behavior === 'ranged' || behavior === 'caster';
      const idealRange = ranged ? (behavior === 'caster' ? B.enemyCasterRange : B.enemyRangedRange) * 0.7
        : enemy.radius + target.radius + B.enemyContactRange;
      if (enemy.prison && distance(enemy, enemy.prison) >= enemy.prison.radius - enemy.radius) continue;
      const fleeing = enemy.status.feared > 0 || ranged && dist < B.enemyRetreatRange;
      if (!fleeing && dist <= idealRange) continue;
      const face = direction(enemy, target);
      const speed = enemy.speed * (has(enemy, 'swift') ? B.enemyFlyingSpeed : 1)
        * (behavior === 'flying' ? B.enemyFlyingSpeed : behavior === 'tank' ? B.enemyTankSpeed : 1);
      this.move(enemy, face.x * speed * dt * (fleeing ? -1 : 1),
        face.y * speed * dt * (fleeing ? -1 : 1));
      this.emitMonsterMovement(enemy);
    }
  }

  update(dt, input = {}) {
    if (this.state.paused || dt <= 0 || this.player.hp <= 0) return;
    const s = this.state, p = this.player;
    s.time += dt;
    p.prevX = p.x; p.prevY = p.y;
    for (const [key, time] of Object.entries(p.cooldowns)) {
      p.cooldowns[key] = Math.max(0, time - dt);
      if (p.cooldowns[key] === 0) delete p.cooldowns[key];
    }
    for (const [key, buff] of Object.entries(p.buffs)) {
      buff.life -= dt;
      if (key === 'rejuvenation') p.hp = Math.min(p.maxHp,
        p.hp + p.maxHp * buff.regeneration * dt);
      if (buff.life <= 0) delete p.buffs[key];
    }
    if (p.buffs.stormavatar) {
      p.buffs.stormavatar.lightningTime = (p.buffs.stormavatar.lightningTime || 0) - dt;
      if (p.buffs.stormavatar.lightningTime <= 0) {
        p.buffs.stormavatar.lightningTime = B.stormInterval;
        this.area(p.x, p.y, B.stormRadius, B.stormDamage, { element: 'lightning' });
      }
    }
    this.tickStatuses(p, dt);
    p.hp = Math.min(p.maxHp, p.hp + ((this.traits.regen || 0)
      + (p.classId === 'druid' ? B.passiveDruidRegen : 0)) * dt);
    const resourceBonus = 1 + (this.traits.resource || 0) / 100;
    if (p.classId === 'wizard' || p.classId === 'druid')
      p.resource = Math.min(p.maxResource, p.resource +
        (p.classId === 'wizard' ? B.manaRegen : B.natureRegen)
        * resourceBonus * (1 + p.attributes.spirit * B.spiritRegen / 100) * dt);
    let x = Number(input.moveX) || 0, y = Number(input.moveY) || 0;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    if (p.status.frozen > 0) { x *= B.frozenSlow; y *= B.frozenSlow; }
    if (p.status.stunned > 0 || p.status.feared > 0) { x = 0; y = 0; }
    const speedBonus = (p.buffs.killSpeed ? (this.traits.killSpeed || 0) / 100 : 0)
      + (p.buffs.pack?.speed || 0) + (p.buffs.stormavatar?.speed || 0);
    this.move(p, x * p.speed * (1 + speedBonus) * dt, y * p.speed * (1 + speedBonus) * dt);
    if (this.state.time >= this.nextPlayerMovementSound &&
        (p.x !== p.prevX || p.y !== p.prevY)) {
      this.nextPlayerMovementSound = this.state.time + AUDIO.playerMovementInterval;
      this.onEvent('playerMove');
    }
    if (this.traits.fireTrail && distance(p, { x: p.prevX, y: p.prevY }) > 0) {
      this.trailDistance += distance(p, { x: p.prevX, y: p.prevY });
      if (this.trailDistance >= B.trailStep) {
        this.trailDistance %= B.trailStep;
        s.effects.push({ x: p.x, y: p.y, radius: B.trailRadius, type: 'trail',
          color: colors.fire, life: B.trailLife, maxLife: B.trailLife,
          interval: B.fireTrailTick, pulse: 0, power: p.damage * B.trailDamage / p.damage,
          element: 'fire', side: 'player' });
      }
    }
    this.attackTime = Math.max(0, this.attackTime - dt);
    const leftSkill = input.attackSkill ?? 0, rightSkill = input.secondarySkill ?? 1;
    if (input.attack && (leftSkill !== 0 || this.attackTime <= 0) && this.cast(leftSkill, input.aim) && leftSkill === 0)
      this.attackTime = B.attackInterval / this.attackSpeed();
    if (input.secondary && (rightSkill !== 0 || this.attackTime <= 0) && this.cast(rightSkill, input.aim) && rightSkill === 0)
      this.attackTime = B.attackInterval / this.attackSpeed();
    this.enemyThought += dt;
    const think = this.enemyThought >= B.enemyThink;
    if (think) this.enemyThought %= B.enemyThink;
    this.grid.rebuild(s.enemies);
    this.tickEnemies(dt, think);
    this.grid.rebuild(s.enemies);
    this.tickProjectiles(dt);
    this.tickEffects(dt);
    this.tickMinions(dt);
    for (let i = s.corpses.length - 1; i >= 0; i--) {
      s.corpses[i].life -= dt;
      if (s.corpses[i].life <= 0) s.corpses.splice(i, 1);
    }
    for (let i = s.enemies.length - 1; i >= 0; i--) if (s.enemies[i].hp <= 0) s.enemies.splice(i, 1);
  }
}
