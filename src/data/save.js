// Persistent storage boundaries and the five fixed character slots. Gameplay
// entity fields not listed here are intentionally not part of a save.
export const SAVE_SCHEMA_VERSION = 1;
export const DATABASE_VERSION = 1;
export const DATABASE_NAME = 'nightreap';
export const CLASS_IDS = Object.freeze(['warrior', 'wizard', 'necromancer', 'ranger', 'druid']);
export const GEAR_SLOTS = Object.freeze(['weapon', 'head', 'chest', 'hands', 'feet', 'belt', 'ring1', 'ring2', 'amulet']);
export const ITEM_RARITIES = Object.freeze(['common', 'magic', 'rare', 'legendary']);
export const SAVE_LIMITS = Object.freeze({
  jsonLength: 1_000_000,
  level: 100,
  itemLevel: 10_000,
  inventory: 24,
  difficulty: 3,
  act: 4,
  map: 2,
  firstKills: 4,
  currency: 1_000_000_000,
  xp: 1_000_000_000_000,
  points: 1_000_000,
  stat: 1_000_000,
  consumable: 1_000_000,
  itemPrice: 1_000_000_000,
  itemIdLength: 128,
  labelLength: 128,
  skillRanks: 100,
  rank: 100,
  volume: 100,
  mouseSkill: 7,
  durability: 100,
});
export const DEFAULT_SETTINGS = Object.freeze({
  autoSell: false,
  saleFilter: Object.freeze({
    rarities: Object.freeze([]),
    slots: Object.freeze(GEAR_SLOTS.filter(slot => slot !== 'ring2')),
    maxLevel: SAVE_LIMITS.itemLevel,
  }),
  language: 'en',
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 35,
  sfxVolume: 60,
  leftMouseSkill: 0,
  rightMouseSkill: 1,
});
