import { CONFIG, UI } from './data/config.js?v=0bc99017d137590b';
import { DEFAULT_SETTINGS, SAVE_LIMITS } from './data/save.js?v=459c3b474f9babff';
import { CLASSES, COMBAT } from './data/combat.js?v=936ca80f602c3b09';
import { AFFIXES, GEAR_BALANCE, SLOT_NAMES } from './data/gear.js?v=dd3a72133bbc3a05';
import { ACTS, DIFFICULTIES, WORLD } from './data/world.js?v=bea1f47a1d00e4e4';
import { SANCTUARIES } from './data/sanctuary.js?v=27c83fc812468275';
import { Renderer } from './core/renderer.js?v=dc15259262893062';
import { Input } from './core/input.js?v=eb9e1b198213da3e';
import { GameLoop } from './core/loop.js?v=d6afbf4fc767ffde';
import { AudioManager } from './core/audio.js?v=89a6cff3fc1a0229';
import { Combat, createPlayer } from './systems/combat.js?v=816d5bab3bd095be';
import { createArea, recordKill, advance, enterDungeon, enterSheep, deathPenalty } from './systems/world.js?v=51b61829a8005c30';
import { getModifiers, equip, unequip, sell, repair, buy, craft, grantLoot } from './systems/gear.js?v=eb46dd9db95cfb0f';
import { SaveStore } from './systems/save.js?v=0fc28909b3cdaba8';
import { revealExploration } from './systems/exploration.js?v=9c05b30176a59828';
import { registerPWA } from './systems/pwa.js?v=db9b2832dbced912';
import { getLanguage, setLanguage, text } from './systems/i18n.js?v=05f50c421756c74c';

const $ = id => document.getElementById(id);
const label = (en, zh) => ({ en, zh });
const WORDS = {
  noSlot: label('Empty slot', '空裝備槽'), rank: label('Rank', '等級'),
  durability: label('Durability', '耐久'), selectAffix: label('Select an affix', '選擇詞綴'),
  newCharacter: label('New character', '新角色'), noBackup: label('No backup to restore.', '沒有可還原的備份。'),
  importPreview: label('Import preview', '匯入預覽'), itemLevel: label('Item level', '物品等級'),
  seconds: label('seconds', '秒'), exportReady: label('Save exported.', '存檔已匯出。'),
  loaded: label('Character loaded.', '已讀取角色。'),
  imported: label('Save imported; current character reloaded.', '已匯入存檔並重新載入角色。'),
  restoreDone: label('Backup restored; current character reloaded.', '已還原備份並重新載入角色。'),
  healthShort: label('LIFE', '生命'), resourceShort: label('RESOURCE', '資源'),
  noAffixes: label('No affixes on this item.', '這件裝備沒有詞綴。'),
  primary: label('LMB · Primary', '左鍵 · 普攻'), secondary: label('RMB · Secondary', '右鍵 · 次要攻擊'),
  sanctuaryOnly: label('Available in the sanctuary only.', '僅能在庇護所使用。'),
};
const node = (tag, className, value) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value != null) element.textContent = value;
  return element;
};
const button = (value, action, className) => {
  const element = node('button', className, value);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
};
const message = value => text(value, language);
let language = getLanguage();
let settings = { ...DEFAULT_SETTINGS, language };
const saves = new SaveStore();
const audio = new AudioManager();
const renderer = new Renderer($('game'));
let player = createPlayer(CLASSES[0].id);
let state;
let combat;
let skillForm = null;
let inTown = true;
let oathOpen = false;
let titleOpen = true;
let hasSavedCharacter = false;
let activePanel = 'inventory';
let page = 0;
let selectedItemId = null;
let notifyUntil = 0;
let lastUi = 0;
let saveElapsed = 0;
let swapping = false;
let pendingDeath = false;
let modalPaused = false;
let modalOpen = false;
let input;
let inventoryReturnFocus = null;
const role = () => CLASSES.find(entry => entry.id === player.classId);
const show = (target, value) => { $(target).hidden = !value; };

function notify(value, sound) {
  if (sound) audio.play(sound);
  const container = $('notifications');
  const notice = node('div', 'notice', message(value));
  container.prepend(notice);
  while (container.childElementCount > CONFIG.notificationLimit) container.lastElementChild.remove();
  notifyUntil = performance.now() + CONFIG.messageDuration * 1000;
}
function failure(error) {
  console.error(error);
  notify(label(`${message(UI.uiError)}: ${error.message}`, `${text(UI.uiError, 'zh')}：${error.message}`));
}
async function persist(announce = false) {
  try {
    await saves.save(player, settings);
    if (announce) notify(UI.saved);
    return true;
  } catch (error) { failure(error); return false; }
}
async function persistSettings() {
  try { await saves.saveSettings(settings); } catch (error) { failure(error); }
}
function beginJourney() {
  titleOpen = false;
  show('title-screen', false);
  for (const element of document.querySelectorAll('.topbar, .layout, .skill-panel, .hud')) element.inert = false;
  oathOpen = !hasSavedCharacter;
  renderProgress();
  $('oath-button').focus();
  void audio.unlock().catch(failure);
}
function makeState(area) {
  player.x = area.start.x; player.y = area.start.y;
  player.prevX = player.x; player.prevY = player.y;
  revealExploration(area, player.x, player.y);
  state = { player, area, paused: inTown, enemies: area.enemies, minions: [], projectiles: [], effects: [], corpses: [], time: 0 };
  combat = new Combat(state, {
    modifiers: getModifiers,
    onKill(enemy) {
      const result = recordKill(player, area, enemy);
      for (const event of grantLoot(player, enemy, area)) notify(event);
      if (result.cleared) notify(UI.cleared, 'portal');
      if (result.finalBoss) void persist();
      if (enemy.boss) setScene();
      renderInventory(); renderProgress();
    },
    onDeath() { pendingDeath = true; },
    onEvent(event) {
      audio.play(event);
      if (event === 'level') { renderSkills(); renderProgress(); }
    },
  });
  if (inTown) player.hp = player.maxHp;
  setScene();
  renderAll();
}
function setScene() {
  audio.setScene(inTown ? 'town' : state.area.sheep ? 'sheep' : state.area.depth ? 'dungeon'
    : state.area.enemies.some(enemy => enemy.boss && enemy.hp > 0) ? 'boss' : `act${state.area.act}`);
}
function enterArea(options) {
  closeModal();
  setInventoryOpen(false);
  inTown = false;
  oathOpen = false;
  pendingDeath = false;
  input.clear();
  makeState(createArea(options));
  void audio.unlock().catch(failure);
  audio.play('portal');
}
function returnTown(dead = false) {
  if (inTown) return;
  if (dead) { deathPenalty(player); notify(UI.dead, 'death'); }
  inTown = true;
  input.clear();
  player.hp = player.maxHp;
  player.resource = player.maxResource;
  player.status = {}; player.cooldowns = {}; player.buffs = {}; player.form = 'human';
  makeState(createArea(player.progress));
  void persist();
}
function renderProgress() {
  const p = player, area = state.area;
  $('character-name').textContent = message(role().name);
  $('character-level').textContent = `${message(UI.level)} ${p.level}`;
  $('difficulty-label').textContent = message(DIFFICULTIES[inTown ? p.progress.difficulty : area.difficulty].name);
  $('area-kicker').textContent = inTown ? message(UI.journey) : `${message(ACTS[area.act].name)} · ${message(DIFFICULTIES[area.difficulty].name)}`;
  const sanctuary = SANCTUARIES[p.progress.act];
  $('area-name').textContent = inTown ? message(sanctuary.name) : message(area.name);
  const villageArt = `assets/sanctuary-${sanctuary.art}.svg`;
  if ($('village-art').getAttribute('src') !== villageArt) $('village-art').src = villageArt;
  $('village-art').alt = message(sanctuary.name);
  $('village-hero').src = `assets/${p.classId}.svg`;
  $('area-progress').textContent = inTown
    ? `${message(ACTS[p.progress.act].name)} · ${message(ACTS[p.progress.act].maps[p.progress.map].name)}`
    : `${message(UI.kills)} ${area.killed} / ${area.requiredKills}${area.depth ? ` · ${message(UI.depth)} ${area.depth}` : ''}`;
  const options = $('difficulty-select');
  options.replaceChildren();
  DIFFICULTIES.forEach((difficulty, index) => {
    const option = new Option(message(difficulty.name), index);
    option.disabled = index > p.progress.unlockedDifficulty;
    options.add(option);
  });
  options.value = p.progress.difficulty;
  show('village', inTown);
  show('sanctuary', inTown && oathOpen);
  show('travel-actions', !inTown);
  $('next-button').hidden = inTown || !area.cleared;
  $('dungeon-button').hidden = inTown || !!area.sheep;
  $('sheep-button').hidden = inTown || !area.sheepPortal;
  $('town-button').disabled = inTown;
  $('shop-button').disabled = !inTown;
  $('forge-button').disabled = !inTown;
}
function updateAreaStatus() {
  const area = state.area;
  if (inTown) return;
  $('area-progress').textContent = `${message(UI.kills)} ${area.killed} / ${area.requiredKills}${area.depth ? ` · ${message(UI.depth)} ${area.depth}` : ''}`;
  $('next-button').hidden = !area.cleared;
}
function renderClassChoice() {
  $('class-select').replaceChildren(...CLASSES.map(entry => {
    const card = button(null, () => void chooseClass(entry.id), 'class-card');
    card.setAttribute('aria-pressed', String(player.classId === entry.id));
    const portrait = node('img'); portrait.src = `assets/${entry.id}.svg`; portrait.alt = '';
    card.append(portrait, node('strong', '', message(entry.name)));
    return card;
  }));
  $('class-portrait').replaceChildren();
  const image = node('img'); image.src = `assets/${player.classId}.svg`; image.alt = '';
  $('class-portrait').append(image);
  $('class-name').textContent = message(role().name);
}
function renderSkills() {
  skillForm = player.form;
  const skills = combat.skills;
  $('skills').replaceChildren(...skills.map((skill, index) => {
    const hotkey = index === 0 ? 'L' : index === 7 ? 'R' : String(index);
    const tile = button(null, () => { if (!inTown && !state.paused) combat.cast(index, input.aim); }, 'skill-button');
    const icon = node('img', 'skill-icon'); icon.src = `assets/skills.svg?v=59750d7c3dbfe6f5#${skill.id}`; icon.alt = '';
    tile.append(icon);
    tile.title = `${index === 0 ? message(WORDS.primary) : index === 1 ? message(WORDS.secondary) : hotkey} · ${message(skill.description)}`;
    tile.append(node('span', 'skill-key', hotkey), node('span', 'skill-name', message(skill.name)),
      node('small', 'skill-cost', `${skill.cost} ${message(role().resourceName)}`));
    const remaining = player.cooldowns[skill.id] || 0;
    const cooldown = node('span', 'skill-cooldown', remaining > 0 ? `${remaining.toFixed(1)} ${message(WORDS.seconds)}` : '');
    tile.append(cooldown);
    tile.disabled = inTown || state.paused || remaining > 0 || player.resource < skill.cost;
    return tile;
  }));
  $('passives').replaceChildren(...role().passives.map(passive => node('div', 'passive-label', message(passive))));
  if (player.attributePoints) {
    const stats = node('div', 'attribute-points', `${message(UI.attributePoints)}: ${player.attributePoints}`);
    for (const attribute of Object.keys(player.attributes)) {
      stats.append(button(`${message(UI[attribute])} ${player.attributes[attribute]} +`, () => {
        if (combat.spendAttribute(attribute)) { renderSkills(); renderHud(); void persist(); }
      }, 'stat-button'));
    }
    $('passives').append(stats);
  }
  if (player.skillPoints) {
    const ranks = node('div', 'skill-points', `${message(UI.skillPoints)}: ${player.skillPoints}`);
    role().skills.slice(1).forEach((skill, index) => ranks.append(button(
      `${message(skill.name)} + (${message(WORDS.rank)} ${player.skillRanks[skill.id] || 0})`, () => {
        if (combat.spendSkill(index + 1)) { renderSkills(); void persist(); }
      }, 'stat-button')));
    $('passives').append(ranks);
  }
}
function updateSkillAvailability() {
  const skills = combat.skills;
  const tiles = $('skills').children;
  for (let index = 0; index < tiles.length; index++) {
    const skill = skills[index], remaining = player.cooldowns[skill.id] || 0;
    tiles[index].lastChild.textContent = remaining > 0 ? `${remaining.toFixed(1)} ${message(WORDS.seconds)}` : '';
    tiles[index].disabled = inTown || state.paused || remaining > 0 || player.resource < skill.cost;
  }
}
function setInventoryOpen(open) {
  const panel = $('inventory-panel');
  if (open === !panel.hidden) return;
  panel.hidden = !open;
  $('inventory-button').setAttribute('aria-expanded', String(open));
  input.clear();
  if (open) {
    inventoryReturnFocus = document.activeElement;
    renderInventory();
    $(`tab-${activePanel}`).focus();
  } else {
    if (panel.contains(document.activeElement)) inventoryReturnFocus?.focus();
    inventoryReturnFocus = null;
  }
}
function findSelected() {
  return player.inventory.find(item => item.id === selectedItemId) ||
    Object.values(player.equipment).find(item => item?.id === selectedItemId);
}
function itemIcon(slot, className = 'slot-icon') {
  const icon = node('img', className);
  icon.src = `assets/equipment-slots.svg?v=f1d9f97bb18d82ae#${slot}`;
  icon.alt = '';
  return icon;
}
function renderInventory() {
  $('tab-inventory').setAttribute('aria-selected', String(activePanel === 'inventory'));
  $('tab-equipment').setAttribute('aria-selected', String(activePanel === 'equipment'));
  $('gold-value').textContent = `${player.gold} ${message(UI.gold)}`;
  $('materials-value').textContent = `${player.materials} ${message(UI.materials)} · ${player.tickets} ${message(UI.tickets)}`;
  const equipment = activePanel === 'equipment';
  show('items', !equipment);
  show('inventory-pagination', !equipment);
  show('equipment-body', equipment);
  if (equipment) {
    const silhouette = node('img', 'equipment-silhouette');
    silhouette.src = 'assets/equipment-body.svg?v=9df0b002845ff23c'; silhouette.alt = '';
    $('equipment-body').replaceChildren(silhouette, ...Object.entries(SLOT_NAMES).map(([slot, name]) => {
      const item = player.equipment[slot];
      const tile = button(null, () => { selectedItemId = item?.id || null; renderItemDetail(); updateItemSelection(); },
        `equipment-slot ${item ? 'item-button' : 'empty-slot'}`);
      tile.dataset.slot = slot;
      if (item) tile.dataset.rarity = item.rarity;
      tile.dataset.itemId = item?.id || '';
      const slotName = `${message(name)}${slot.startsWith('ring') ? ` ${slot.slice(-1)}` : ''}`;
      tile.title = `${slotName} · ${item ? message(item.name) : message(WORDS.noSlot)}`;
      tile.append(node('span', 'slot-label', slotName), itemIcon(slot),
        node('strong', 'item-name', item ? message(item.name) : message(WORDS.noSlot)));
      return tile;
    }));
  } else {
    const pages = Math.max(1, Math.ceil(player.inventory.length / CONFIG.inventoryPage));
    page = Math.min(page, pages - 1);
    $('page-number').textContent = `${page + 1} / ${pages}`;
    $('previous-page').disabled = page === 0;
    $('next-page').disabled = page >= pages - 1;
    $('items').replaceChildren(...player.inventory.slice(page * CONFIG.inventoryPage, (page + 1) * CONFIG.inventoryPage).map(item => {
      const tile = button(null, () => { selectedItemId = item.id; renderItemDetail(); updateItemSelection(); }, 'item-button');
      tile.dataset.itemId = item.id;
      tile.dataset.rarity = item.rarity;
      const copy = node('div', 'item-copy');
      copy.append(node('strong', 'item-name', message(item.name)), node('small', 'item-meta',
        `${message(SLOT_NAMES[item.slot])} · ${item.durability}/${item.maxDurability}`));
      tile.append(itemIcon(item.slot), copy);
      return tile;
    }));
  }
  updateItemSelection();
  renderItemDetail();
}
function updateItemSelection() {
  for (const tile of $('inventory-panel').querySelectorAll('[data-item-id]'))
    tile.setAttribute('aria-pressed', String(!!selectedItemId && tile.dataset.itemId === selectedItemId));
}
function renderItemDetail() {
  const item = findSelected(), detail = $('item-detail'), actions = $('item-actions');
  detail.replaceChildren(); actions.replaceChildren();
  if (!item) { selectedItemId = null; detail.append(node('p', '', message(UI.empty))); return; }
  const title = node('h3', 'detail-name', message(item.name)); title.dataset.rarity = item.rarity;
  detail.append(itemIcon(item.slot, 'detail-icon'), title, node('p', 'detail-meta', `${message(SLOT_NAMES[item.slot])} · ${message(WORDS.itemLevel)} ${item.level} · ${message(WORDS.durability)} ${item.durability}/${item.maxDurability}`));
  for (const entry of item.affixes) {
    const affix = AFFIXES.find(definition => definition.id === entry.id);
    detail.append(node('div', 'affix-row', `${message(affix.name)} +${entry.value} · T${entry.tier}`));
  }
  const equippedSlot = Object.keys(player.equipment).find(slot => player.equipment[slot]?.id === item.id);
  const apply = (result, refresh = false) => {
    notify(result.message, result.ok ? 'equip' : null);
    if (result.ok) {
      if (refresh) combat.refreshPlayer();
      renderInventory(); renderSkills(); renderHud(); void persist();
    }
  };
  if (equippedSlot) actions.append(button(message(UI.unequip), () => apply(unequip(player, equippedSlot), true)));
  else {
    actions.append(button(message(UI.equip), () => apply(equip(player, item.id), true)));
    if (item.slot === 'ring1') actions.append(button(`${message(UI.equip)} · 2`, () => apply(equip(player, item.id, 'ring2'), true)));
    const sellButton = button(`${message(UI.sell)} · ${item.sellValue} ${message(UI.gold)}`, () => {
      if (inTown) apply(sell(player, item.id));
    });
    sellButton.disabled = !inTown;
    if (!inTown) sellButton.title = message(WORDS.sanctuaryOnly);
    actions.append(sellButton);
  }
  if (inTown && item.affixes.length) actions.append(button(message(UI.forge), () => openForge(item.id)));
}
function renderHud() {
  const p = player;
  $('health-label').textContent = message(WORDS.healthShort);
  $('resource-label').textContent = message(role().resourceName).toUpperCase();
  $('health-value').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  $('resource-value').textContent = `${Math.floor(p.resource)} / ${p.maxResource}`;
  $('health-fill').style.width = `${100 * p.hp / p.maxHp}%`;
  $('resource-fill').style.width = `${100 * p.resource / p.maxResource}%`;
  const required = Math.floor(COMBAT.base.xpBase * COMBAT.base.xpGrowth ** (p.level - 1) + p.level * COMBAT.base.xpLevelBonus);
  $('xp-value').textContent = `${message(UI.level)} ${p.level}`;
  $('xp-fill').style.width = `${100 * p.xp / required}%`;
  $('health-potion-count').textContent = p.potions.health;
  $('resource-potion-count').textContent = p.potions.resource;
  $('health-potion').disabled = inTown || !p.potions.health || p.hp >= p.maxHp;
  $('resource-potion').disabled = inTown || !p.potions.resource || p.resource >= p.maxResource;
}
function renderTranslations() {
  document.documentElement.lang = language;
  for (const [id, key] of Object.entries({ 'brand-title':'title', 'brand-subtitle':'subtitle',
    'inventory-button':'inventory', 'sanctuary-title':'character', 'sanctuary-hint':'sanctuaryHint',
    'save-button':'save', 'load-button':'load', 'settings-button':'settings',
    'town-button':'town', 'difficulty-caption':'difficulty',
    'next-button':'next', 'dungeon-button':'dungeon', 'sheep-button':'sheep',
    'resume-button':'resume', 'tab-inventory':'inventory', 'tab-equipment':'equipment',
    'shop-button':'shop', 'forge-button':'forge', 'desktop-warning':'desktop' }))
    $(id).textContent = message(UI[key]);
  $('enter-button').firstChild.textContent = `${message(UI.enter)} `;
  $('depart-button').textContent = message(UI.enter);
  $('oath-button').textContent = message(UI.character);
  $('oath-close').setAttribute('aria-label', message(UI.close));
  $('title-eyebrow').textContent = message(UI.subtitle);
  $('title-tagline').textContent = message(label('The night is endless. Your flame is not.', '長夜無盡，你的火光卻並非永恆。'));
  $('title-start').textContent = message(hasSavedCharacter ? label('Continue journey', '繼續旅程') : label('Begin your journey', '開始旅程'));
  $('title-load').textContent = message(UI.load);
  $('title-settings').textContent = message(UI.settings);
  $('title-language').textContent = language === 'en' ? '中文' : 'English';
  $('title-footnote').textContent = message(label('A sanctuary waits beyond the dark.', '黑暗彼端，仍有庇護你的燈火。'));
  $('update-button').textContent = message(label('Update ready · Save & reload', '更新已就緒 · 存檔並重新載入'));
  $('controls-hint').textContent = `${message(UI.controls)} · ${message(WORDS.secondary)}`;
  $('language-button').textContent = language === 'en' ? '中文' : 'English';
  $('modal-close').setAttribute('aria-label', message(UI.close));
  $('inventory-close').setAttribute('aria-label', message(UI.close));
  $('inventory-panel').setAttribute('aria-label', `${message(UI.inventory)} · ${message(UI.equipment)}`);
  $('shop-button').title = $('forge-button').title = inTown ? '' : message(WORDS.sanctuaryOnly);
}
function renderAll() { renderTranslations(); renderClassChoice(); renderProgress(); renderSkills(); renderInventory(); renderHud(); }

async function chooseClass(classId) {
  if (!inTown || swapping || player.classId === classId) return;
  swapping = true;
  try {
    if (!await persist()) return;
    const saved = await saves.load(classId);
    player = Object.assign(createPlayer(classId), saved || {});
    selectedItemId = null; page = 0;
    makeState(createArea(player.progress));
  } catch (error) { failure(error); }
  finally { swapping = false; }
}
function closeModal() { if ($('modal').open) $('modal').close(); }
function openModal(title) {
  if (!$('modal').open) {
    modalPaused = state.paused;
    modalOpen = true;
    state.paused = true;
    input.clear();
    $('modal').showModal();
  }
  $('modal-title').textContent = message(title);
  $('modal-content').replaceChildren();
  return $('modal-content');
}
function rowButton(container, title, detail, callback) {
  const row = node('div', 'modal-row');
  row.append(node('strong', '', title), node('small', '', detail), button('→', callback));
  container.append(row);
  return row;
}
function openShop() {
  if (!inTown) return;
  const content = openModal(UI.shop);
  for (const [type, name, price] of [
    ['health', UI.health, GEAR_BALANCE.healthPotionGold],
    ['resource', UI.resource, GEAR_BALANCE.resourcePotionGold],
    ['gamble', UI.gamble, GEAR_BALANCE.gambleGold],
  ]) rowButton(content, message(name), `${price} ${message(UI.gold)}`, () => {
    if (!inTown) return;
    const result = buy(player, type);
    notify(result.message, result.ok ? 'loot' : null);
    if (result.ok) { renderInventory(); renderHud(); void persist(); }
  });
  rowButton(content, message(UI.repair), `${message(UI.gold)}: ${player.gold}`, () => {
    if (!inTown) return;
    const result = repair(player);
    notify(result.message);
    if (result.ok) { combat.refreshPlayer(); renderInventory(); void persist(); }
  });
}
function openForge(itemId = selectedItemId, affixIndex = 0) {
  if (!inTown) return;
  const owned = [...player.inventory, ...Object.values(player.equipment).filter(Boolean)];
  const item = owned.find(entry => entry.id === itemId);
  if (!item) {
    const content = openModal(UI.forge);
    const choices = owned.filter(entry => entry.affixes.length);
    if (!choices.length) content.append(node('p', '', message(WORDS.noAffixes)));
    else for (const choice of choices) {
      const tile = button(null, () => openForge(choice.id), 'affix-choice');
      tile.dataset.rarity = choice.rarity;
      tile.append(itemIcon(choice.slot, 'item-choice-icon'), node('span', '', message(choice.name)));
      content.append(tile);
    }
    return;
  }
  if (!item.affixes.length) { notify(WORDS.noAffixes); return; }
  const content = openModal(UI.forge);
  content.append(itemIcon(item.slot, 'detail-icon'), node('h3', '', message(item.name)), node('p', '', message(WORDS.selectAffix)));
  const affixes = node('div', 'modal-grid'); content.append(affixes);
  item.affixes.forEach((entry, index) => {
    const affix = AFFIXES.find(definition => definition.id === entry.id);
    const choice = button(`${message(affix.name)} +${entry.value} · T${entry.tier}`, () => openForge(item.id, index), 'affix-choice');
    choice.setAttribute('aria-pressed', String(affixIndex === index));
    affixes.append(choice);
  });
  const actions = node('div', 'modal-actions'); content.append(actions);
  for (const operation of ['reroll', 'reforge', 'upgrade']) {
    const recipe = GEAR_BALANCE.craft[operation];
    const action = button(`${message(UI[operation])} · ${recipe.cost} ${message(UI.materials)}`, () => {
      if (!inTown) return;
      const before = player.materials;
      const result = craft(player, item.id, affixIndex, operation);
      notify(result.message, result.ok ? 'equip' : null);
      if (player.materials !== before) {
        if (result.ok) { combat.refreshPlayer(); renderSkills(); renderHud(); }
        renderInventory(); void persist();
      }
      openForge(item.id, affixIndex);
    });
    action.disabled = player.materials < recipe.cost || operation === 'upgrade' && item.affixes[affixIndex].tier === 1;
    actions.append(action);
  }
}
function openSettings() {
  const content = openModal(UI.settings);
  for (const [prefix, name] of [['music', UI.music], ['sfx', UI.sfx]]) {
    const field = node('div', 'setting-row');
    const toggle = node('input'); toggle.type = 'checkbox'; toggle.checked = settings[`${prefix}Enabled`];
    const slider = node('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(SAVE_LIMITS.volume); slider.value = String(settings[`${prefix}Volume`]);
    const level = node('span', '', slider.value);
    toggle.addEventListener('change', () => { settings[`${prefix}Enabled`] = toggle.checked; audio.setSettings(settings); void persistSettings(); });
    slider.addEventListener('input', () => { settings[`${prefix}Volume`] = Number(slider.value); level.textContent = slider.value; audio.setSettings(settings); void persistSettings(); });
    const caption = node('label', '', message(name)); caption.prepend(toggle);
    field.append(caption, slider, level); content.append(field);
  }
  const actions = node('div', 'modal-actions');
  actions.append(button(message(UI.export), () => void exportSaves()), button(message(UI.import), () => $('import-file').click()),
    button(message(UI.restore), () => void restoreBackup()));
  content.append(actions);
}
async function showSlots(load = false) {
  try {
    const entries = await saves.list();
    const content = openModal(load ? UI.load : UI.save);
    const grid = node('div', 'modal-grid'); content.append(grid);
    for (const entry of entries) {
      const name = message(CLASSES.find(character => character.id === entry.classId).name);
      const detail = entry.exists ? `${message(UI.level)} ${entry.level} · ${message(ACTS[entry.progress.act].name)}` : message(WORDS.newCharacter);
      const choice = button(`${name} · ${detail}`, async () => {
        try {
          if (load) {
            if (!entry.exists) { notify(UI.noSave); return; }
            const restored = await saves.load(entry.classId);
            if (!restored) { notify(UI.noSave); return; }
            player = Object.assign(createPlayer(entry.classId), restored);
            inTown = true; selectedItemId = null; page = 0;
            makeState(createArea(player.progress));
            hasSavedCharacter = true;
            if (titleOpen) beginJourney();
            notify(WORDS.loaded);
          } else if (entry.classId === player.classId) await persist(true);
          else { notify(label('Select that class at the sanctuary to save it.', '請先在庇護所選擇該職業才能存檔。')); return; }
          closeModal();
        } catch (error) { failure(error); }
      });
      choice.disabled = !load && entry.classId !== player.classId;
      grid.append(choice);
    }
    content.append(button(message(UI.export), () => void exportSaves()), button(message(UI.import), () => $('import-file').click()),
      button(message(UI.restore), () => void restoreBackup()));
  } catch (error) { failure(error); }
}
async function exportSaves() {
  try {
    if (!await persist()) return;
    const json = await saves.exportJSON();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = 'nightreap-save.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), CONFIG.messageDuration * 1000);
    notify(WORDS.exportReady);
  } catch (error) { failure(error); }
}
async function importFile(file) {
  if (!file) return;
  try {
    const json = await file.text();
    const preview = saves.previewImport(json);
    const content = openModal(WORDS.importPreview);
    content.append(node('p', '', message(UI.importHint)));
    for (const entry of preview.characters) {
      const name = message(CLASSES.find(character => character.id === entry.classId).name);
      content.append(node('div', 'modal-row', `${name} · ${message(UI.level)} ${entry.level} · ${message(DIFFICULTIES[entry.difficulty].name)} · ${message(ACTS[entry.act].maps[entry.map].name)} · ${entry.gold} ${message(UI.gold)} · ${entry.inventory} ${message(UI.inventory)} · ${entry.equipment} ${message(UI.equipment)}`));
    }
    if (!preview.characters.length) content.append(node('p', '', message(WORDS.newCharacter)));
    const actions = node('div', 'modal-actions'); content.append(actions);
    actions.append(button(message(UI.confirmImport), async () => {
      try {
        if (!await persist()) return;
        await saves.importJSON(json);
        settings = { ...preview.settings };
        language = setLanguage(settings.language);
        audio.setSettings(settings);
        const restored = await saves.load(player.classId);
        player = Object.assign(createPlayer(player.classId), restored || {});
        inTown = true; selectedItemId = null; page = 0;
        makeState(createArea(player.progress));
        closeModal(); notify(WORDS.imported);
      } catch (error) { failure(error); }
    }), button(message(UI.cancel), closeModal));
  } catch (error) { failure(error); }
}
async function restoreBackup() {
  try {
    const restored = await saves.restoreBackup();
    if (!restored) { notify(WORDS.noBackup); return; }
    settings = { ...await saves.loadSettings() };
    language = setLanguage(settings.language);
    audio.setSettings(settings);
    player = Object.assign(createPlayer(player.classId), await saves.load(player.classId) || {});
    inTown = true; selectedItemId = null; page = 0;
    makeState(createArea(player.progress));
    closeModal(); notify(WORDS.restoreDone);
  } catch (error) { failure(error); }
}
function tryTravel(kind) {
  if (inTown || state.paused) return;
  const area = state.area;
  const gate = kind === 'next' ? area.exit : kind === 'dungeon' ? area.portal : area.sheepPortal;
  if (!gate || Math.hypot(player.x - gate.x, player.y - gate.y) > WORLD.spawnDistance) { notify(UI.notNear); return; }
  const result = kind === 'next' ? advance(player, area)
    : kind === 'dungeon' ? enterDungeon(player, area) : enterSheep(player, area);
  if (!result.ok) { notify(result.message); return; }
  notify(result.message);
  enterArea(result.options);
  void persist();
}
function action(key) {
  if (key === 'gesture') { void audio.unlock().catch(failure); return; }
  if (titleOpen) return;
  if (key === 'tab') { setInventoryOpen($('inventory-panel').hidden); return; }
  if (key === 'escape') {
    if ($('modal').open) { closeModal(); return; }
    if (!$('inventory-panel').hidden) { setInventoryOpen(false); return; }
    if (oathOpen) { oathOpen = false; renderProgress(); $('oath-button').focus(); return; }
    if (inTown) return;
    state.paused = !state.paused;
    show('pause-overlay', state.paused);
    input.clear(); renderSkills(); return;
  }
  if (inTown || state.paused) return;
  if (/^[1-6]$/.test(key)) combat.cast(Number(key), input.aim);
  else if (key === 'r') combat.cast(7, input.aim);
  else if (key === 'q' || key === 'e') combat.usePotion(key === 'q' ? 'health' : 'resource');
}
function update(dt) {
  if (inTown || state.paused) return;
  if (input.secondary) combat.cast(1, input.aim);
  combat.update(dt, input);
  revealExploration(state.area, player.x, player.y);
  if (pendingDeath) { pendingDeath = false; returnTown(true); return; }
  saveElapsed += dt;
  if (saveElapsed >= CONFIG.saveInterval) { saveElapsed %= CONFIG.saveInterval; void persist(); }
  lastUi += dt;
  if (lastUi >= CONFIG.uiInterval) {
    lastUi = 0; renderHud();
    if (player.form !== skillForm) renderSkills();
    else updateSkillAvailability();
    updateAreaStatus();
    if (notifyUntil && performance.now() > notifyUntil) { $('notifications').replaceChildren(); notifyUntil = 0; }
  }
}
function render(alpha) { renderer.draw(state, alpha); }

input = new Input($('game'), (x, y) => renderer.toWorld(x, y), action);
$('modal').addEventListener('close', () => {
  if (modalOpen) { state.paused = modalPaused; modalOpen = false; renderSkills(); }
});
$('modal-close').addEventListener('click', closeModal);
$('inventory-button').addEventListener('click', () => setInventoryOpen($('inventory-panel').hidden));
$('inventory-close').addEventListener('click', () => setInventoryOpen(false));
$('title-start').addEventListener('click', beginJourney);
$('title-load').addEventListener('click', () => void showSlots(true));
$('title-settings').addEventListener('click', openSettings);
$('title-language').addEventListener('click', () => $('language-button').click());
$('save-button').addEventListener('click', () => void showSlots());
$('load-button').addEventListener('click', () => void showSlots(true));
$('settings-button').addEventListener('click', openSettings);
$('language-button').addEventListener('click', () => {
  closeModal();
  language = setLanguage(language === 'en' ? 'zh' : 'en'); settings.language = language;
  renderAll(); void persistSettings();
});
window.addEventListener('popstate', () => {
  closeModal();
  language = getLanguage(); settings.language = language; renderAll(); void persistSettings();
});
$('difficulty-select').addEventListener('change', event => {
  const difficulty = Number(event.target.value);
  if (inTown && difficulty <= player.progress.unlockedDifficulty && DIFFICULTIES[difficulty]) {
    player.progress.difficulty = difficulty;
    player.progress.act = 0; player.progress.map = 0;
    renderProgress(); void persist();
  }
});
$('enter-button').addEventListener('click', () => enterArea(player.progress));
const depart = () => { if (inTown) enterArea(player.progress); };
$('depart-button').addEventListener('click', depart);
$('oath-button').addEventListener('click', () => {
  if (!inTown) return;
  oathOpen = true; renderProgress(); $('oath-close').focus();
});
$('oath-close').addEventListener('click', () => {
  oathOpen = false; renderProgress(); $('oath-button').focus();
});
$('town-button').addEventListener('click', () => returnTown());
$('next-button').addEventListener('click', () => tryTravel('next'));
$('dungeon-button').addEventListener('click', () => tryTravel('dungeon'));
$('sheep-button').addEventListener('click', () => tryTravel('sheep'));
$('resume-button').addEventListener('click', () => { state.paused = false; show('pause-overlay', false); renderSkills(); });
$('tab-inventory').addEventListener('click', () => { activePanel = 'inventory'; page = 0; renderInventory(); });
$('tab-equipment').addEventListener('click', () => { activePanel = 'equipment'; page = 0; renderInventory(); });
$('previous-page').addEventListener('click', () => { page--; renderInventory(); });
$('next-page').addEventListener('click', () => { page++; renderInventory(); });
$('shop-button').addEventListener('click', openShop);
$('forge-button').addEventListener('click', () => openForge());
$('health-potion').addEventListener('click', () => { if (!inTown) combat.usePotion('health'); });
$('resource-potion').addEventListener('click', () => { if (!inTown) combat.usePotion('resource'); });
$('import-file').addEventListener('change', event => {
  void importFile(event.target.files?.[0]); event.target.value = '';
});
document.addEventListener('visibilitychange', () => { if (document.hidden && !titleOpen) void persist(); });
window.addEventListener('resize', () => {
  show('desktop-warning', window.innerWidth < CONFIG.minWidth || window.innerHeight < CONFIG.minHeight);
});

async function boot() {
  for (const element of document.querySelectorAll('.topbar, .layout, .skill-panel, .hud')) element.inert = true;
  try {
    await Promise.all([renderer.load(), audio.load()]);
    const stored = await saves.loadSettings();
    if (stored) settings = { ...stored, language };
    audio.setSettings(settings);
    const slots = await saves.list();
    const savedSlot = slots.find(entry => entry.exists);
    const saved = savedSlot ? await saves.load(savedSlot.classId) : null;
    if (saved) {
      player = Object.assign(createPlayer(savedSlot.classId), saved);
      hasSavedCharacter = true;
    }
  } catch (error) { failure(error); }
  makeState(createArea(player.progress));
  show('pause-overlay', false);
  show('desktop-warning', window.innerWidth < CONFIG.minWidth || window.innerHeight < CONFIG.minHeight);
  $('title-start').disabled = $('title-load').disabled = $('title-settings').disabled = false;
  $('title-start').focus();
  void registerPWA({
    beforeUpdate: () => titleOpen ? Promise.resolve(true) : persist(),
    onUpdate(apply) {
      show('update-button', true);
      $('update-button').onclick = () => void apply();
    },
    onError: failure,
  });
  new GameLoop(update, render).start();
}
void boot();
