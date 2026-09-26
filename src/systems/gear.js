import { AFFIXES, SLOT_NAMES, RARITY_NAMES, GEAR_BALANCE as B } from '../data/gear.js';

const definitions = new Map(AFFIXES.map(affix => [affix.id, affix]));
const slots = Object.keys(SLOT_NAMES);
const itemSlots = slots.filter(slot => slot !== 'ring2');
const message = (en, zh) => ({ en, zh });
const fail = (en, zh) => ({ ok: false, message: message(en, zh) });
const validMoney = amount => Number.isSafeInteger(amount) && amount >= 0;
const validPlayer = player => player && Array.isArray(player.inventory)
  && player.equipment && typeof player.equipment === 'object' && validMoney(player.gold);

function random(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return a number in [0, 1)');
  return value;
}

function choose(list, rng) {
  return list[Math.floor(random(rng) * list.length)];
}

function roll(weights, rng) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let draw = random(rng) * total;
  for (let index = 0; index < weights.length; index++) {
    draw -= weights[index];
    if (draw < 0) return index;
  }
  return weights.length - 1;
}

function rarityFor(difficulty, depth, rng) {
  const shift = Math.min(B.rarityWeights[0] - B.rarityMinimumCommon,
    difficulty * B.rarityShiftPerDifficulty + Math.log1p(depth) * B.rarityShiftPerLogDepth);
  const [common, magic, rare, legendary] = B.rarityWeights;
  return B.rarities[roll([
    common - shift, magic, rare + shift * B.rarityShiftRareShare,
    legendary + shift * (1 - B.rarityShiftRareShare),
  ], rng)];
}

function tierFor(difficulty, depth, rng) {
  // T1 remains exactly 2% of all naturally rolled affixes, even when only T1/T2
  // can carry a particular affix. Never renormalize over that restricted subset.
  const shift = Math.min(B.tierMaximumShift,
    difficulty * B.tierShiftPerDifficulty + Math.log1p(depth) * B.tierShiftPerLogDepth);
  return [4, 3, 2, 1][roll([
    B.tierWeights[4] - shift,
    B.tierWeights[3] + shift * (1 - B.tierShiftT2Share),
    B.tierWeights[2] + shift * B.tierShiftT2Share,
    B.tierWeights[1],
  ], rng)];
}

function valueFor(definition, tier, rng) {
  const [min, max] = definition.tiers[tier];
  return min + Math.floor(random(rng) * (max - min + 1));
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Secure random item identity is unavailable');
}

function itemName(slot, rarity, affixes) {
  const prefix = affixes.find(entry => entry.kind === 'prefix');
  const suffix = affixes.find(entry => entry.kind === 'suffix');
  const adjective = prefix ? definitions.get(prefix.id).name : null;
  const ending = suffix ? definitions.get(suffix.id).name : null;
  return {
    en: [RARITY_NAMES[rarity].en, adjective?.en, SLOT_NAMES[slot].en, ending?.en].filter(Boolean).join(' '),
    zh: `${RARITY_NAMES[rarity].zh}${adjective?.zh ?? ''}${SLOT_NAMES[slot].zh}${ending ? `・${ending.zh}` : ''}`,
  };
}

function nextAffix(slot, kind, difficulty, depth, existing, rng) {
  // Draw the tier before filtering the pool: cheatDeath cannot inflate the T1 rate.
  const tier = tierFor(difficulty, depth, rng);
  const candidates = AFFIXES.filter(definition => definition.kind === kind
    && definition.slots.includes(slot) && definition.tiers[tier]
    && !existing.some(entry => entry.id === definition.id));
  if (!candidates.length) throw new Error(`No eligible ${kind} affix on ${slot}`);
  const definition = choose(candidates, rng);
  return { id: definition.id, tier, value: valueFor(definition, tier, rng), kind };
}

export function generateItem({ level = 1, difficulty = 0, depth = 0, rarity, slot } = {}, rng = Math.random) {
  if (!Number.isSafeInteger(level) || level < 1 || level > B.maxItemLevel
    || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 3
    || !Number.isSafeInteger(depth) || depth < 0 || typeof rng !== 'function'
    || (slot !== undefined && !itemSlots.includes(slot))
    || (rarity !== undefined && !B.rarities.includes(rarity))) {
    throw new RangeError('Invalid item generation options');
  }
  const itemSlot = slot ?? choose(itemSlots, rng);
  const itemRarity = rarity ?? rarityFor(difficulty, depth, rng);
  const [minimum, maximum] = B.affixCounts[itemRarity];
  const count = minimum + Math.floor(random(rng) * (maximum - minimum + 1));
  const affixes = [];
  for (let index = 0; index < count; index++) {
    const prefixes = affixes.filter(entry => entry.kind === 'prefix').length;
    const suffixes = index - prefixes;
    const kind = prefixes >= B.maxKindAffixes ? 'suffix'
      : suffixes >= B.maxKindAffixes ? 'prefix'
        : index === 0 ? (random(rng) < 0.5 ? 'prefix' : 'suffix')
          : prefixes < suffixes ? 'prefix' : suffixes < prefixes ? 'suffix'
            : (random(rng) < 0.5 ? 'prefix' : 'suffix');
    affixes.push(nextAffix(itemSlot, kind, difficulty, depth, affixes, rng));
  }
  return {
    id: newId(), name: itemName(itemSlot, itemRarity, affixes), slot: itemSlot,
    rarity: itemRarity, level, durability: B.durability, maxDurability: B.durability,
    affixes, sellValue: B.sellBase[itemRarity] + level * B.sellPerLevel[itemRarity],
  };
}

export function getModifiers(player) {
  const modifiers = {};
  if (!player?.equipment) return modifiers;
  for (const slot of slots) {
    const item = player.equipment[slot];
    if (!item || !Number.isFinite(item.durability) || item.durability <= 0) continue;
    for (const entry of item.affixes ?? []) {
      if (!definitions.has(entry.id) || !Number.isFinite(entry.value)) continue;
      modifiers[entry.id] = (modifiers[entry.id] ?? 0) + entry.value;
    }
  }
  return modifiers;
}

export function equip(player, itemId, slot) {
  if (!validPlayer(player)) return fail('Invalid character.', '角色資料無效。');
  const index = player.inventory.findIndex(item => item?.id === itemId);
  if (index < 0) return fail('Item not in inventory.', '背包中找不到裝備。');
  const item = player.inventory[index];
  const destination = slot ?? (item.slot === 'ring1' && player.equipment.ring1 ? 'ring2' : item.slot);
  if (!slots.includes(destination) || (destination !== item.slot
    && !(item.slot === 'ring1' && destination === 'ring2'))) {
    return fail('Item does not fit that slot.', '裝備不適用於該部位。');
  }
  const previous = player.equipment[destination];
  player.inventory.splice(index, 1);
  if (previous) player.inventory.push(previous);
  player.equipment[destination] = item;
  return { ok: true, message: message(`Equipped ${item.name.en}.`, `已裝備${item.name.zh}。`) };
}

export function unequip(player, slot) {
  if (!validPlayer(player) || !slots.includes(slot)) return fail('Invalid slot.', '裝備部位無效。');
  const item = player.equipment[slot];
  if (!item) return fail('Nothing equipped in that slot.', '該部位沒有裝備。');
  if (player.inventory.length >= B.inventoryCapacity) return fail('Inventory is full.', '背包已滿。');
  player.inventory.push(item);
  player.equipment[slot] = null;
  return { ok: true, message: message(`Unequipped ${item.name.en}.`, `已卸下${item.name.zh}。`) };
}

export function sell(player, itemId) {
  if (!validPlayer(player)) return fail('Invalid character.', '角色資料無效。');
  const index = player.inventory.findIndex(item => item?.id === itemId);
  if (index < 0) return fail('Item not in inventory.', '背包中找不到裝備。');
  const item = player.inventory[index];
  if (!Number.isSafeInteger(item.sellValue) || item.sellValue < 0
    || !Number.isSafeInteger(player.gold + item.sellValue)) {
    return fail('Invalid sale value.', '出售價格無效。');
  }
  player.inventory.splice(index, 1);
  player.gold += item.sellValue;
  return { ok: true, message: message(`Sold for ${item.sellValue} gold.`, `出售獲得 ${item.sellValue} 金幣。`) };
}

export function repair(player) {
  if (!validPlayer(player)) return fail('Invalid character.', '角色資料無效。');
  const owned = [...player.inventory, ...slots.map(slot => player.equipment[slot]).filter(Boolean)];
  let cost = 0;
  for (const item of owned) {
    if (!Number.isInteger(item.maxDurability) || item.maxDurability < 0
      || !Number.isInteger(item.durability) || item.durability < 0
      || item.durability > item.maxDurability) return fail('Invalid durability.', '耐久度資料無效。');
    cost += (item.maxDurability - item.durability) * B.repairGoldPerPoint;
  }
  if (!Number.isSafeInteger(cost) || player.gold < cost) return fail('Not enough gold for repairs.', '金幣不足以修理。');
  for (const item of owned) item.durability = item.maxDurability;
  player.gold -= cost;
  return { ok: true, message: message(`Repaired equipment for ${cost} gold.`, `花費 ${cost} 金幣修好裝備。`) };
}

export function buy(player, type = 'health') {
  if (!validPlayer(player) || !player.potions || !validMoney(player.potions.health)
    || !validMoney(player.potions.resource)) return fail('Invalid character.', '角色資料無效。');
  const prices = { health: B.healthPotionGold, resource: B.resourcePotionGold, gamble: B.gambleGold };
  if (!Object.hasOwn(prices, type)) return fail('Unknown shop item.', '商店沒有此商品。');
  if (player.gold < prices[type]) return fail('Not enough gold.', '金幣不足。');
  if (type === 'gamble' && player.inventory.length >= B.inventoryCapacity) {
    return fail('Inventory is full.', '背包已滿。');
  }
  if (type !== 'gamble' && !Number.isSafeInteger(player.potions[type] + 1)) {
    return fail('Potion limit reached.', '藥水數量已達上限。');
  }
  // Create the unknown item before charging; a failure cannot consume gold.
  const item = type === 'gamble' ? generateItem({ level: Math.min(B.maxItemLevel, Math.max(1, player.level || 1)),
    difficulty: Math.min(3, Math.max(0, player.progress?.difficulty || 0)) }) : null;
  player.gold -= prices[type];
  if (item) player.inventory.push(item);
  else player.potions[type]++;
  return { ok: true, message: item
    ? message(`Gambled ${item.name.en}.`, `賭得${item.name.zh}。`)
    : message('Potion purchased.', '已購買藥水。'), item };
}

function ownedItem(player, itemId) {
  return player.inventory.find(item => item?.id === itemId)
    ?? slots.map(slot => player.equipment[slot]).find(item => item?.id === itemId);
}

export function craft(player, itemId, affixIndex, operation = 'reroll', rng = Math.random) {
  if (!validPlayer(player) || !validMoney(player.materials)) return fail('Invalid character.', '角色資料無效。');
  const item = ownedItem(player, itemId);
  if (!item || !Number.isInteger(affixIndex) || affixIndex < 0 || !Array.isArray(item.affixes)
    || affixIndex >= item.affixes.length || !Object.hasOwn(B.craft, operation)
    || typeof rng !== 'function') return fail('Invalid crafting target.', '合成目標無效。');
  const previous = item.affixes[affixIndex];
  const definition = definitions.get(previous.id);
  if (!definition || previous.kind !== definition.kind || !definition.slots.includes(item.slot)
    || !definition.tiers[previous.tier]
    || item.affixes.some((entry, index) => index !== affixIndex && entry.id === previous.id)) {
    return fail('Invalid affix.', '詞綴資料無效。');
  }
  if (operation === 'upgrade' && previous.tier === 1) return fail('Already at T1.', '已達 T1 頂級。');
  const alternatives = operation === 'reroll' ? AFFIXES.filter(candidate =>
    candidate.id !== previous.id && candidate.kind === previous.kind
    && candidate.slots.includes(item.slot) && candidate.tiers[previous.tier]
    && !item.affixes.some(entry => entry.id === candidate.id)) : null;
  if (alternatives && !alternatives.length) return fail('No replacement affix available.', '沒有可用的替換詞綴。');
  const recipe = B.craft[operation];
  if (player.materials < recipe.cost) return fail('Not enough materials.', '材料不足。');
  const chance = operation === 'upgrade' ? recipe.successByTargetTier[previous.tier - 1] : recipe.success;
  const succeeded = random(rng) < chance;
  let replacement;
  if (succeeded) {
    const nextDefinition = alternatives ? choose(alternatives, rng) : definition;
    const tier = operation === 'upgrade' ? previous.tier - 1 : previous.tier;
    replacement = { id: nextDefinition.id, kind: previous.kind, tier,
      value: valueFor(nextDefinition, tier, rng) };
  }
  // The failure path spends materials only; the old affix and item remain untouched.
  player.materials -= recipe.cost;
  if (succeeded) {
    item.affixes[affixIndex] = replacement;
    if (operation === 'reroll') item.name = itemName(item.slot, item.rarity, item.affixes);
  }
  return { ok: succeeded, message: succeeded
    ? message('Crafting succeeded.', '合成成功。')
    : message('Crafting failed; only materials were consumed.', '合成失敗，僅消耗材料。') };
}

export function grantLoot(player, enemy, area, rng = Math.random) {
  if (!validPlayer(player) || !validMoney(player.materials) || !validMoney(player.tickets)
    || !enemy || !area || typeof rng !== 'function') return [];
  const difficulty = Number.isInteger(area.difficulty) ? Math.min(3, Math.max(0, area.difficulty)) : 0;
  const depth = Number.isSafeInteger(area.depth) ? Math.max(0, area.depth) : 0;
  const level = Math.min(B.maxItemLevel, Math.max(1, Number.isSafeInteger(enemy.level) ? enemy.level : player.level || 1));
  const gold = Number.isSafeInteger(enemy.gold) && enemy.gold >= 0 ? enemy.gold : B.baseEnemyGold;
  const dungeon = depth > 0 && !area.sheep;
  const materialDrop = dungeon && (enemy.boss || enemy.elite || random(rng) < B.dungeonMaterialChance);
  const materials = materialDrop ? 1 + Math.floor(depth / B.dungeonMaterialPerDepth)
    + (enemy.boss ? B.dungeonMaterialBoss : enemy.elite ? B.dungeonMaterialElite : 0) : 0;
  const ticket = !area.sheep && !dungeon && area.act === B.ticketAct && random(rng) < B.ticketChanceActTwo;
  const chance = area.sheep ? B.sheepDropChance : B.normalDropChance;
  const drop = Boolean(enemy.boss || enemy.elite || random(rng) < chance);
  const items = [];
  const available = Math.max(0, B.inventoryCapacity - player.inventory.length);
  // First-kill loot takes priority if only one inventory slot remains.
  if (enemy.boss && enemy.firstKill && available) {
    items.push(generateItem({ level, difficulty, depth, rarity: B.firstKillRarity }, rng));
  }
  if (drop && items.length < available) {
    const rarity = rarityFor(difficulty, depth, rng);
    const minimum = enemy.boss ? B.bossMinimumRarity : null;
    const guaranteed = minimum && B.rarities.indexOf(rarity) < B.rarities.indexOf(minimum) ? minimum : rarity;
    items.push(generateItem({ level, difficulty, depth, rarity: guaranteed }, rng));
  }
  if (!Number.isSafeInteger(player.gold + gold) || !Number.isSafeInteger(player.materials + materials)
    || (ticket && !Number.isSafeInteger(player.tickets + 1))) return [];
  player.gold += gold;
  player.materials += materials;
  if (ticket) player.tickets++;
  player.inventory.push(...items);
  const events = [];
  if (gold) events.push(message(`+${gold} gold`, `+${gold} 金幣`));
  if (materials) events.push(message(`+${materials} materials`, `+${materials} 材料`));
  if (ticket) events.push(message('Sheep ticket found!', '獲得綿羊券！'));
  for (const item of items) events.push(message(`Found ${item.name.en}!`, `獲得${item.name.zh}！`));
  if (drop && items.length < (enemy.firstKill ? 2 : 1)) events.push(message('Inventory full; item left behind.', '背包已滿，無法拾取掉落裝備。'));
  return events;
}
