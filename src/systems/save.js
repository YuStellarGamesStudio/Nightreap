import {
  CLASS_IDS, DATABASE_NAME, DATABASE_VERSION, DEFAULT_SETTINGS,
  GEAR_SLOTS, ITEM_RARITIES, SAVE_LIMITS, SAVE_SCHEMA_VERSION,
} from '../data/save.js?v=459c3b474f9babff';
import { AFFIXES } from '../data/gear.js?v=dd3a72133bbc3a05';

const classes = new Set(CLASS_IDS);
const slots = new Set(GEAR_SLOTS);
const affixesById = new Map(AFFIXES.map(affix => [affix.id, affix]));
const rarities = new Set(ITEM_RARITIES);
const playerFields = [
  'classId', 'level', 'xp', 'gold', 'materials', 'tickets', 'potions',
  'inventory', 'equipment', 'attributes', 'attributePoints', 'skillPoints',
  'skillRanks', 'progress',
];
const safeKey = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const safeKill = /^abyss-lord:[0-3]$/;

function fail(path) {
  throw new TypeError(`Invalid save data: ${path}`);
}

function object(value, path, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(path);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`);
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor' ||
        (!required.includes(key) && !optional.includes(key))) fail(`${path}.${key}`);
  }
  return value;
}

function number(value, path, min, max, integer = true) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
      (integer && !Number.isSafeInteger(value))) fail(path);
  return value;
}

function label(value, path) {
  object(value, path, ['en', 'zh']);
  for (const lang of ['en', 'zh']) {
    if (typeof value[lang] !== 'string' || !value[lang].trim() ||
        value[lang].length > SAVE_LIMITS.labelLength) fail(`${path}.${lang}`);
  }
  return { en: value.en, zh: value.zh };
}

function settingsValue(value) {
  object(value, 'settings', ['language', 'musicEnabled', 'sfxEnabled', 'musicVolume', 'sfxVolume']);
  if (value.language !== 'en' && value.language !== 'zh') fail('settings.language');
  if (typeof value.musicEnabled !== 'boolean' || typeof value.sfxEnabled !== 'boolean') fail('settings.enabled');
  return {
    language: value.language, musicEnabled: value.musicEnabled, sfxEnabled: value.sfxEnabled,
    musicVolume: number(value.musicVolume, 'settings.musicVolume', 0, SAVE_LIMITS.volume, false),
    sfxVolume: number(value.sfxVolume, 'settings.sfxVolume', 0, SAVE_LIMITS.volume, false),
  };
}

function itemValue(value, path, equippedSlot = null) {
  object(value, path, ['id', 'name', 'slot', 'rarity', 'level', 'durability', 'maxDurability', 'affixes', 'sellValue']);
  if (typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) fail(`${path}.id`);
  if (!slots.has(value.slot) || value.slot === 'ring2' || !rarities.has(value.rarity)) fail(`${path}.slot/rarity`);
  if (equippedSlot && value.slot !== equippedSlot &&
      !(equippedSlot === 'ring2' && value.slot === 'ring1')) fail(`${path}.slot`);
  const level = number(value.level, `${path}.level`, 1, SAVE_LIMITS.itemLevel);
  const maxDurability = number(value.maxDurability, `${path}.maxDurability`, 1, SAVE_LIMITS.durability);
  const durability = number(value.durability, `${path}.durability`, 0, maxDurability, false);
  if (!Array.isArray(value.affixes) || value.affixes.length > 4) fail(`${path}.affixes`);
  const counts = { prefix: 0, suffix: 0 };
  const seen = new Set();
  const affixes = value.affixes.map((affix, index) => {
    const at = `${path}.affixes[${index}]`;
    object(affix, at, ['id', 'tier', 'value', 'kind']);
    const definition = affixesById.get(affix.id);
    if (!definition || seen.has(affix.id) ||
        definition.kind !== affix.kind || !definition.slots.includes(value.slot)) fail(at);
    const tier = number(affix.tier, `${at}.tier`, 1, 4);
    const range = definition.tiers[tier];
    if (!range) fail(`${at}.tier`);
    seen.add(affix.id);
    if (++counts[affix.kind] > 2) fail(`${at}.kind`);
    return {
      id: affix.id, kind: affix.kind, tier,
      value: number(affix.value, `${at}.value`, range[0], range[1]),
    };
  });
  const length = affixes.length;
  if (value.rarity === 'common' && length !== 0 ||
      value.rarity === 'magic' && (length < 1 || length > 2) ||
      value.rarity === 'rare' && (length < 2 || length > 3) ||
      value.rarity === 'legendary' && length !== 4) fail(`${path}.affixes`);
  return {
    id: value.id, name: label(value.name, `${path}.name`), slot: value.slot,
    rarity: value.rarity, level, durability, maxDurability, affixes,
    sellValue: number(value.sellValue, `${path}.sellValue`, 0, SAVE_LIMITS.itemPrice),
  };
}

function playerValue(value) {
  object(value, 'player', playerFields);
  if (!classes.has(value.classId)) fail('player.classId');
  const p = { classId: value.classId };
  p.level = number(value.level, 'player.level', 1, SAVE_LIMITS.level);
  for (const [key, max] of [
    ['xp', SAVE_LIMITS.xp], ['gold', SAVE_LIMITS.currency], ['materials', SAVE_LIMITS.currency],
    ['tickets', SAVE_LIMITS.consumable], ['attributePoints', SAVE_LIMITS.points], ['skillPoints', SAVE_LIMITS.points],
  ]) p[key] = number(value[key], `player.${key}`, 0, max);
  object(value.potions, 'player.potions', ['health', 'resource']);
  p.potions = {
    health: number(value.potions.health, 'player.potions.health', 0, SAVE_LIMITS.consumable),
    resource: number(value.potions.resource, 'player.potions.resource', 0, SAVE_LIMITS.consumable),
  };
  if (!Array.isArray(value.inventory) || value.inventory.length > SAVE_LIMITS.inventory) fail('player.inventory');
  const uniqueItems = new Set();
  const acceptItem = (item, path, slot) => {
    const clean = itemValue(item, path, slot);
    if (uniqueItems.has(clean.id)) fail(`${path}.id`);
    uniqueItems.add(clean.id);
    return clean;
  };
  p.inventory = value.inventory.map((item, index) => acceptItem(item, `player.inventory[${index}]`));
  object(value.equipment, 'player.equipment', [], GEAR_SLOTS);
  p.equipment = {};
  for (const slot of GEAR_SLOTS) {
    const item = value.equipment[slot];
    if (item != null) p.equipment[slot] = acceptItem(item, `player.equipment.${slot}`, slot);
  }
  object(value.attributes, 'player.attributes', ['strength', 'dexterity', 'intelligence', 'vitality', 'spirit']);
  p.attributes = {};
  for (const key of ['strength', 'dexterity', 'intelligence', 'vitality', 'spirit']) {
    p.attributes[key] = number(value.attributes[key], `player.attributes.${key}`, 0, SAVE_LIMITS.stat);
  }
  object(value.skillRanks, 'player.skillRanks', [], Object.keys(value.skillRanks ?? {}));
  if (Object.keys(value.skillRanks).length > SAVE_LIMITS.skillRanks) fail('player.skillRanks');
  p.skillRanks = {};
  for (const [key, rank] of Object.entries(value.skillRanks)) {
    if (!safeKey.test(key)) fail(`player.skillRanks.${key}`);
    p.skillRanks[key] = number(rank, `player.skillRanks.${key}`, 0, SAVE_LIMITS.rank);
  }
  object(value.progress, 'player.progress', ['difficulty', 'unlockedDifficulty', 'act', 'map', 'firstKills']);
  p.progress = {
    difficulty: number(value.progress.difficulty, 'player.progress.difficulty', 0, SAVE_LIMITS.difficulty),
    unlockedDifficulty: number(value.progress.unlockedDifficulty, 'player.progress.unlockedDifficulty', 0, SAVE_LIMITS.difficulty),
    act: number(value.progress.act, 'player.progress.act', 0, SAVE_LIMITS.act),
    map: number(value.progress.map, 'player.progress.map', 0, SAVE_LIMITS.map),
  };
  if (p.progress.difficulty > p.progress.unlockedDifficulty ||
      !Array.isArray(value.progress.firstKills) || value.progress.firstKills.length > SAVE_LIMITS.firstKills) fail('player.progress');
  const firstKills = new Set();
  for (const kill of value.progress.firstKills) {
    if (typeof kill !== 'string' || !safeKill.test(kill) || firstKills.has(kill)) fail('player.progress.firstKills');
    firstKills.add(kill);
  }
  p.progress.firstKills = [...firstKills];
  return p;
}

// A live player includes world/combat fields; pick only persistent fields before validating.
function persistentPlayer(player) {
  if (!player || typeof player !== 'object') fail('player');
  const selected = {};
  for (const key of playerFields) selected[key] = player[key];
  return playerValue(selected);
}

function parseImport(text) {
  if (typeof text !== 'string' || text.length > SAVE_LIMITS.jsonLength) fail('file size');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('JSON syntax'); }
  object(parsed, 'file', ['schemaVersion', 'characters', 'settings']);
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION || !Array.isArray(parsed.characters) ||
      parsed.characters.length > CLASS_IDS.length) fail('file.schemaVersion/characters');
  const seen = new Set();
  const characters = parsed.characters.map((value) => {
    const player = playerValue(value);
    if (seen.has(player.classId)) fail('file.characters duplicate class');
    seen.add(player.classId);
    return player;
  });
  return { schemaVersion: SAVE_SCHEMA_VERSION, characters, settings: settingsValue(parsed.settings) };
}

function summary(snapshot) {
  return {
    characters: snapshot.characters.map((player) => ({
      classId: player.classId, level: player.level, gold: player.gold,
      difficulty: player.progress.difficulty, unlockedDifficulty: player.progress.unlockedDifficulty,
      act: player.progress.act, map: player.progress.map, equipment: Object.keys(player.equipment).length,
      inventory: player.inventory.length,
    })),
    settings: { ...snapshot.settings }, snapshot,
  };
}

function transactionResult(transaction, schedule) {
  return new Promise((resolve, reject) => {
    let result;
    let failure;
    const abort = error => {
      failure = error;
      try { transaction.abort(); } catch { /* Transaction already finished. */ }
      reject(error);
    };
    const guard = callback => event => {
      try { callback(event); } catch (error) { abort(error); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(failure || transaction.error || new Error('IndexedDB transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    try { schedule((value) => { result = value; }, guard); }
    catch (error) { abort(error); }
  });
}

export class SaveStore {
  constructor() { this.db = null; this.opening = null; }

  async open() {
    if (this.db) return this;
    if (this.opening) return this.opening;
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable; save disabled');
    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'classId' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error('IndexedDB upgrade blocked by another tab'));
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onsuccess = () => {
        if (blocked || this.db) { request.result.close(); return; }
        this.db = request.result;
        this.db.onversionchange = () => { this.db.close(); this.db = null; };
        resolve(this);
      };
    }).finally(() => { this.opening = null; });
    return this.opening;
  }

  async save(player, settings) {
    const clean = persistentPlayer(player);
    const cleanSettings = settingsValue(settings);
    await this.open();
    const tx = this.db.transaction(['characters', 'meta'], 'readwrite');
    return transactionResult(tx, done => {
      tx.objectStore('characters').put({ classId: clean.classId, player: clean, savedAt: Date.now() });
      tx.objectStore('meta').put({ key: 'settings', value: cleanSettings });
      done(clean);
    });
  }

  async saveSettings(settings) {
    const clean = settingsValue(settings);
    await this.open();
    const tx = this.db.transaction('meta', 'readwrite');
    return transactionResult(tx, done => {
      tx.objectStore('meta').put({ key: 'settings', value: clean });
      done(clean);
    });
  }

  async loadSettings() {
    await this.open();
    const tx = this.db.transaction('meta', 'readonly');
    return transactionResult(tx, (done, guard) => {
      tx.objectStore('meta').get('settings').onsuccess = guard(event =>
        done(event.target.result ? settingsValue(event.target.result.value) : null));
    });
  }

  async load(classId) {
    if (!classes.has(classId)) fail('classId');
    await this.open();
    const tx = this.db.transaction('characters', 'readonly');
    return transactionResult(tx, (done, guard) => {
      tx.objectStore('characters').get(classId).onsuccess = guard(event =>
        done(event.target.result ? playerValue(event.target.result.player) : null));
    });
  }

  async list() {
    await this.open();
    const tx = this.db.transaction('characters', 'readonly');
    return transactionResult(tx, (done, guard) => {
      tx.objectStore('characters').getAll().onsuccess = guard(event => {
        const byClass = new Map(event.target.result.map(row => {
          const player = playerValue(row.player);
          if (row.classId !== player.classId) fail('stored classId');
          return [player.classId, { classId: player.classId, exists: true,
            level: player.level, gold: player.gold, progress: player.progress, savedAt: row.savedAt }];
        }));
        done(CLASS_IDS.map(classId => byClass.get(classId) || { classId, exists: false }));
      });
    });
  }

  async exportJSON() {
    await this.open();
    const tx = this.db.transaction(['characters', 'meta'], 'readonly');
    return transactionResult(tx, (done, guard) => {
      const characters = tx.objectStore('characters').getAll();
      const settings = tx.objectStore('meta').get('settings');
      const finish = () => {
        if (characters.readyState !== 'done' || settings.readyState !== 'done') return;
        const result = {
          schemaVersion: SAVE_SCHEMA_VERSION,
          characters: characters.result.map(row => {
            const player = playerValue(row.player);
            if (row.classId !== player.classId) fail('stored classId');
            return player;
          }),
          settings: settings.result ? settingsValue(settings.result.value) : { ...DEFAULT_SETTINGS },
        };
        done(JSON.stringify(result));
      };
      characters.onsuccess = guard(finish);
      settings.onsuccess = guard(finish);
    });
  }

  previewImport(text) { return summary(parseImport(text)); }

  async importJSON(text) {
    const snapshot = parseImport(text);
    await this.open();
    const tx = this.db.transaction(['characters', 'meta'], 'readwrite');
    return transactionResult(tx, (done, guard) => {
      const store = tx.objectStore('characters');
      const meta = tx.objectStore('meta');
      const previous = store.getAll();
      const previousSettings = meta.get('settings');
      let replaced = false;
      const replace = () => {
        if (replaced || previous.readyState !== 'done' || previousSettings.readyState !== 'done') return;
        replaced = true;
        const backup = {
          schemaVersion: SAVE_SCHEMA_VERSION,
          characters: previous.result.map(row => {
            const player = playerValue(row.player);
            if (row.classId !== player.classId) fail('stored classId');
            return player;
          }),
          settings: previousSettings.result ? settingsValue(previousSettings.result.value) : { ...DEFAULT_SETTINGS },
        };
        meta.put({ key: 'backup', value: backup });
        store.clear();
        for (const player of snapshot.characters)
          store.put({ classId: player.classId, player, savedAt: Date.now() });
        meta.put({ key: 'settings', value: snapshot.settings });
        done(summary(snapshot));
      };
      previous.onsuccess = guard(replace);
      previousSettings.onsuccess = guard(replace);
    });
  }

  async restoreBackup() {
    await this.open();
    const tx = this.db.transaction(['characters', 'meta'], 'readwrite');
    return transactionResult(tx, (done, guard) => {
      const store = tx.objectStore('characters');
      const meta = tx.objectStore('meta');
      meta.get('backup').onsuccess = guard(event => {
        if (!event.target.result) { done(false); return; }
        const backup = parseImport(JSON.stringify(event.target.result.value));
        store.clear();
        for (const player of backup.characters)
          store.put({ classId: player.classId, player, savedAt: Date.now() });
        meta.put({ key: 'settings', value: backup.settings });
        done(true);
      });
    });
  }
}
