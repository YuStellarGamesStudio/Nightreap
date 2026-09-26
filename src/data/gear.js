// Tiers run from T4 (weakest) to T1 (strongest); values are integers.
const ranges = (t4, t3, t2, t1) => ({ 4: t4, 3: t3, 2: t2, 1: t1 });
const affix = (id, en, zh, kind, slots, tiers) => ({
  id, name: { en, zh }, kind, slots, tiers,
});

export const SLOT_NAMES = {
  weapon: { en: 'Weapon', zh: '武器' },
  head: { en: 'Helm', zh: '頭盔' },
  chest: { en: 'Armor', zh: '胸甲' },
  hands: { en: 'Gloves', zh: '手套' },
  feet: { en: 'Boots', zh: '靴子' },
  belt: { en: 'Belt', zh: '腰帶' },
  ring1: { en: 'Ring', zh: '戒指' },
  ring2: { en: 'Ring', zh: '戒指' },
  amulet: { en: 'Amulet', zh: '護身符' },
};

const armor = ['head', 'chest', 'hands', 'feet', 'belt'];
const all = ['weapon', ...armor, 'ring1', 'amulet'];
const offense = ['weapon', 'hands', 'ring1', 'amulet'];
const defense = ['head', 'chest', 'hands', 'feet', 'belt', 'ring1', 'amulet'];

export const AFFIXES = [
  affix('attribute', 'Mighty', '威能', 'prefix', all, ranges([2, 4], [5, 7], [8, 11], [12, 16])),
  affix('damage', 'Savage', '凶猛', 'prefix', ['weapon'], ranges([5, 9], [10, 14], [15, 19], [20, 25])),
  affix('attackSpeed', 'Swift', '迅捷', 'prefix', ['weapon', 'hands'], ranges([3, 5], [6, 9], [10, 14], [15, 20])),
  affix('critChance', 'Keen', '銳利', 'prefix', ['weapon', 'ring1'], ranges([2, 4], [5, 7], [8, 10], [11, 15])),
  affix('critDamage', 'Ruthless', '無情', 'prefix', ['weapon', 'amulet'], ranges([6, 10], [11, 16], [17, 23], [24, 32])),
  affix('life', 'Vital', '生機', 'prefix', armor, ranges([12, 20], [21, 32], [33, 48], [49, 70])),
  affix('regen', 'Mending', '復元', 'prefix', armor, ranges([1, 2], [3, 4], [5, 7], [8, 11])),
  affix('armor', 'Fortified', '堅甲', 'prefix', armor, ranges([5, 9], [10, 16], [17, 25], [26, 38])),
  affix('resistance', 'Warding', '守護', 'prefix', [...armor, 'amulet'], ranges([3, 5], [6, 8], [9, 12], [13, 18])),
  affix('moveSpeed', 'Fleet', '疾行', 'prefix', ['feet'], ranges([3, 5], [6, 9], [10, 13], [14, 18])),
  affix('cooldown', 'Focused', '專注', 'prefix', ['head', 'hands'], ranges([2, 3], [4, 6], [7, 9], [10, 13])),
  affix('resource', 'Boundless', '無盡', 'prefix', ['belt', 'ring1'], ranges([4, 7], [8, 12], [13, 18], [19, 26])),
  affix('burningDamage', 'of Embers', '餘燼', 'suffix', all, ranges([8, 15], [16, 25], [26, 35], [36, 50])),
  affix('frozenDamage', 'of Shattering', '碎冰', 'suffix', all, ranges([8, 15], [16, 25], [26, 35], [36, 50])),
  affix('poisonedDamage', 'of Venom', '劇毒', 'suffix', all, ranges([8, 15], [16, 25], [26, 35], [36, 50])),
  affix('fearedDamage', 'of Dread', '驚懼', 'suffix', all, ranges([8, 15], [16, 25], [26, 35], [36, 50])),
  affix('stunnedDamage', 'of Ruin', '毀滅', 'suffix', all, ranges([8, 15], [16, 25], [26, 35], [36, 50])),
  affix('eliteDamage', 'of the Slayer', '屠戮', 'suffix', all, ranges([6, 11], [12, 18], [19, 27], [28, 40])),
  affix('executeDamage', 'of Execution', '處決', 'suffix', all, ranges([8, 14], [15, 23], [24, 34], [35, 48])),
  affix('healthyDamage', 'of Vigor', '氣盛', 'suffix', all, ranges([5, 9], [10, 15], [16, 23], [24, 33])),
  affix('controlCrit', 'of Precision', '精準', 'suffix', all, ranges([2, 4], [5, 7], [8, 11], [12, 16])),
  affix('killSpeed', 'of the Hunt', '狩獵', 'suffix', ['weapon', 'hands', 'feet', 'ring1', 'amulet'], ranges([5, 8], [9, 13], [14, 19], [20, 27])),
  affix('explosion', 'of Detonation', '爆裂', 'suffix', offense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('chainLightning', 'of Storms', '雷霆', 'suffix', offense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('frostNova', 'of Winter', '寒冬', 'suffix', defense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('burnOnHit', 'of Ignition', '引燃', 'suffix', offense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('poisonOnHit', 'of Blight', '疫病', 'suffix', offense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('freezeOnHit', 'of Rime', '霜凍', 'suffix', offense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('lifeSteal', 'of Leeching', '汲血', 'suffix', offense, ranges([1, 2], [3, 4], [5, 7], [8, 10])),
  affix('resourceSteal', 'of Siphoning', '汲能', 'suffix', offense, ranges([1, 2], [3, 4], [5, 7], [8, 10])),
  affix('skeletonOnKill', 'of the Grave', '亡骸', 'suffix', offense, ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  affix('fireTrail', 'of Cinders', '燼跡', 'suffix', ['feet', 'belt', 'chest', 'amulet'], ranges([5, 8], [9, 14], [15, 22], [23, 30])),
  // Not rollable at T3/T4. A global tier roll precedes affix selection so T1 never gets renormalized.
  affix('cheatDeath', 'of Last Breath', '絕境', 'suffix', defense, ranges(null, null, [1, 1], [1, 1])),
];

export const RARITY_NAMES = {
  common: { en: 'Worn', zh: '磨損的' },
  magic: { en: 'Enchanted', zh: '附魔的' },
  rare: { en: 'Ancient', zh: '遠古的' },
  legendary: { en: 'Nightforged', zh: '永夜鑄造的' },
};

export const GEAR_BALANCE = {
  inventoryCapacity: 24,
  maxItemLevel: 10000,
  durability: 100,
  repairGoldPerPoint: 1,
  rarities: ['common', 'magic', 'rare', 'legendary'],
  rarityWeights: [45, 35, 18, 2],
  rarityShiftPerDifficulty: 5,
  rarityShiftPerLogDepth: 3,
  rarityMinimumCommon: 5,
  rarityShiftRareShare: 0.7,
  tierWeights: { 4: 60, 3: 25, 2: 13, 1: 2 },
  tierShiftPerDifficulty: 5,
  tierShiftPerLogDepth: 3,
  tierMaximumShift: 45,
  tierShiftT2Share: 0.65,
  affixCounts: { common: [0, 0], magic: [1, 2], rare: [2, 3], legendary: [4, 4] },
  maxKindAffixes: 2,
  sellBase: { common: 12, magic: 30, rare: 65, legendary: 140 },
  sellPerLevel: { common: 2, magic: 4, rare: 7, legendary: 12 },
  healthPotionGold: 30,
  resourcePotionGold: 25,
  gambleGold: 100,
  normalDropChance: 0.24,
  sheepDropChance: 0.65,
  ticketChanceActTwo: 0.12,
  ticketAct: 1,
  dungeonMaterialChance: 0.27,
  dungeonMaterialPerDepth: 5,
  dungeonMaterialElite: 2,
  dungeonMaterialBoss: 4,
  bossMinimumRarity: 'rare',
  firstKillRarity: 'legendary',
  baseEnemyGold: 8,
  craft: {
    reroll: { cost: 3, success: 0.8 },
    reforge: { cost: 2, success: 0.9 },
    upgrade: { cost: 5, successByTargetTier: { 3: 0.65, 2: 0.4, 1: 0.15 } },
  },
};
