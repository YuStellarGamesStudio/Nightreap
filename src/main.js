import { CONFIG, UI, ART } from './data/config.js?v=dba7a118f0c64652';
import { DEFAULT_SETTINGS, SAVE_LIMITS } from './data/save.js?v=2a952fa1ede7fff0';
import { CLASSES, COMBAT } from './data/combat.js?v=936ca80f602c3b09';
import { AFFIXES, GEAR_BALANCE, SLOT_NAMES } from './data/gear.js?v=dd3a72133bbc3a05';
import { ACTS, DIFFICULTIES, WORLD } from './data/world.js?v=ef5f78c241fd8cdd';
import { SANCTUARIES } from './data/sanctuary.js?v=27c83fc812468275';
import { ACT_MUSIC } from './data/audio.js?v=2abfc8d355f88935';
import { Renderer } from './core/renderer.js?v=7e9ad97ec54d1165';
import { Input } from './core/input.js?v=eb9e1b198213da3e';
import { GameLoop } from './core/loop.js?v=b40248d3248ae163';
import { AudioManager } from './core/audio.js?v=5ba7100882cc0802';
import { Combat, createPlayer } from './systems/combat.js?v=8f40c21c338efe04';
import { createArea, recordKill, advance, enterDungeon, enterSheep, deathPenalty } from './systems/world.js?v=5c31f3b40f67ee3b';
import { getModifiers, equip, equipBest, unequip, sell, salePreview, sellMatching, repair, buy, craft, grantLoot } from './systems/gear.js?v=45d026153c480c72';
import { SaveStore } from './systems/save.js?v=4faf8ce27f236bfb';
import { revealExploration } from './systems/exploration.js?v=9c05b30176a59828';
import { registerPWA } from './systems/pwa.js?v=db9b2832dbced912';
import { getLanguage, setLanguage, text } from './systems/i18n.js?v=05f50c421756c74c';
import { captureViewport, screenshotFilename } from './core/screenshot.js?v=2ce5f207b47a042d';

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
  equipBest: label('Equip best', '一鍵換裝'),
  saleFilter: label('Sell filter', '出售篩選'),
  saleFilterActive: label('Sell filter · Auto ON', '出售篩選 · 自動開'),
  screenshot: label('Screenshot', '截圖'),
  screenshotReady: label('Screenshot download started.', '已開始下載截圖。'),
  equipBestHint: label('Compare all inventory items by the sum of affix values / their T1 maximums. Skip broken items; keep equipped items on ties. Not a build-specific recommendation.',
    '比較整個背包：各詞綴數值 ÷ 該詞綴 T1 上限後加總。略過損壞裝備，同分保留原裝；不代表特定流派最佳搭配。'),
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
  // UI notices follow wall-clock time, independently of town or paused simulation.
  const animation = notice.animate([
    { opacity: 1, transform: 'translateX(0)' },
    { opacity: 0, transform: 'translateX(100%)' },
  ], {
    delay: CONFIG.messageDuration * 1000,
    duration: CONFIG.notificationExitDuration * 1000,
    easing: 'ease-in',
    fill: 'forwards',
  });
  animation.onfinish = () => notice.remove();
  while (container.childElementCount > CONFIG.notificationLimit) {
    const oldest = container.lastElementChild;
    for (const active of oldest.getAnimations()) active.cancel();
    oldest.remove();
  }
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
      for (const event of grantLoot(player, enemy, area, settings.autoSell ? settings.saleFilter : null)) notify(event);
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
    : state.area.enemies.some(enemy => enemy.boss && enemy.hp > 0) ? 'boss' : ACT_MUSIC[state.area.act][state.area.map]);
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
  if (!dead && !window.confirm(message(label(
    'Return to the sanctuary? Current exploration will end; enemies and the area will reset when you enter again.',
    '確定返回庇護所？本次探索將結束，再次進入時怪物與地圖將重置。')))) return;
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
  const villageArt = `assets/sanctuaries/sanctuary-${sanctuary.art}.svg`;
  if ($('village-art').getAttribute('src') !== villageArt) $('village-art').src = villageArt;
  $('village-art').alt = message(sanctuary.name);
  $('village-hero').src = `assets/${ART[p.classId]}.svg`;
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
    const portrait = node('img'); portrait.src = `assets/${ART[entry.id]}.svg`; portrait.alt = '';
    card.append(portrait, node('strong', '', message(entry.name)));
    return card;
  }));
  $('class-portrait').replaceChildren();
  const image = node('img'); image.src = `assets/${ART[player.classId]}.svg`; image.alt = '';
  $('class-portrait').append(image);
  $('class-name').textContent = message(role().name);
}
function renderSkills() {
  skillForm = player.form;
  const skills = combat.skills;
  $('skills').replaceChildren(...skills.map((skill, index) => {
    const hotkey = index === 0 ? '' : index === 7 ? 'R' : String(index);
    const bindings = [hotkey, settings.leftMouseSkill === index ? 'LMB' : '', settings.rightMouseSkill === index ? 'RMB' : ''].filter(Boolean).join(' · ');
    const tile = button(null, () => { if (!inTown && !state.paused) combat.cast(index, input.aim); }, 'skill-button');
    const icon = node('img', 'skill-icon'); icon.src = `assets/ui/skills.svg?v=59750d7c3dbfe6f5#${skill.id}`; icon.alt = '';
    tile.append(icon);
    tile.title = `${bindings} · ${message(skill.description)}`;
    tile.append(node('span', 'skill-key', bindings), node('span', 'skill-name', message(skill.name)),
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
  icon.src = `assets/ui/equipment-slots.svg?v=f1d9f97bb18d82ae#${slot}`;
  icon.alt = '';
  return icon;
}
function inventoryPageSize() {
  const grid = $('items'), style = getComputedStyle(grid);
  const height = grid.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const gap = parseFloat(style.rowGap);
  const rows = Math.max(1, Math.floor((height + gap) / (parseFloat(style.gridAutoRows) + gap)));
  return rows * style.gridTemplateColumns.split(' ').length;
}
function renderInventory() {
  $('tab-inventory').setAttribute('aria-selected', String(activePanel === 'inventory'));
  $('tab-equipment').setAttribute('aria-selected', String(activePanel === 'equipment'));
  $('gold-value').textContent = `${player.gold} ${message(UI.gold)}`;
  $('materials-value').textContent = `${player.materials} ${message(UI.materials)} · ${player.tickets} ${message(UI.tickets)}`;
  const equipment = activePanel === 'equipment';
  $('equip-best').disabled = !player.inventory.length;
  $('sale-filter-button').textContent = message(settings.autoSell ? WORDS.saleFilterActive : WORDS.saleFilter);
  $('sale-filter-button').dataset.autoSell = String(settings.autoSell);
  show('items', !equipment);
  show('inventory-pagination', !equipment);
  show('equipment-body', equipment);
  if (equipment) {
    const silhouette = node('img', 'equipment-silhouette');
    silhouette.src = 'assets/ui/equipment-body.svg?v=9df0b002845ff23c'; silhouette.alt = '';
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
    const pageSize = inventoryPageSize();
    const pages = Math.max(1, Math.ceil(player.inventory.length / pageSize));
    page = Math.max(0, Math.min(page, pages - 1));
    $('page-number').textContent = `${page + 1} / ${pages}`;
    $('previous-page').disabled = page === 0;
    $('next-page').disabled = page >= pages - 1;
    $('items').replaceChildren(...player.inventory.slice(page * pageSize, (page + 1) * pageSize).map(item => {
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
  $('screenshot-button').textContent = message(WORDS.screenshot);
  for (const [id, key] of Object.entries({ 'brand-title':'title', 'brand-subtitle':'subtitle',
    'inventory-button':'inventory', 'sanctuary-title':'character', 'sanctuary-hint':'sanctuaryHint',
    'save-button':'save', 'settings-button':'settings',
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
  $('title-settings').textContent = message(UI.settings);
  $('title-language').textContent = language === 'en' ? '中文' : 'English';
  $('title-footnote').textContent = message(label('A sanctuary waits beyond the dark.', '黑暗彼端，仍有庇護你的燈火。'));
  $('update-button').textContent = message(label('Update ready · Save & reload', '更新已就緒 · 存檔並重新載入'));
  $('controls-hint').textContent = `${message(UI.controls)} · ${message(WORDS.secondary)}`;
  $('language-button').textContent = language === 'en' ? '中文' : 'English';
  $('modal-close').setAttribute('aria-label', message(UI.close));
  $('inventory-close').setAttribute('aria-label', message(UI.close));
  $('inventory-panel').setAttribute('aria-label', `${message(UI.inventory)} · ${message(UI.equipment)}`);
  $('equip-best').textContent = message(WORDS.equipBest);
  $('equip-best').title = message(WORDS.equipBestHint);
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
function openSaleFilter() {
  const content = openModal(WORDS.saleFilter);
  const form = node('div', 'sale-filter');
  form.append(node('p', 'sale-help', message(label(
    'Match a selected rarity AND slot, up to the item level below. No selection means no sales.',
    '稀有度、部位與等級上限須同時符合；同類可複選，未選擇則不出售。'))));
  const groups = {};
  const addGroup = (key, title, entries) => {
    const field = node('fieldset', 'sale-group');
    field.append(node('legend', '', message(title)));
    const choices = node('div', 'sale-choices');
    groups[key] = entries.map(([value, name]) => {
      const caption = node('label', 'sale-choice');
      const check = node('input');
      check.type = 'checkbox'; check.value = value; check.id = `sale-${key}-${value}`;
      check.checked = settings.saleFilter[key].includes(value);
      const copy = node('span', '', message(name));
      if (key === 'rarities') copy.dataset.rarity = value;
      caption.append(check, copy); choices.append(caption);
      return check;
    });
    field.append(choices); form.append(field);
  };
  addGroup('rarities', label('Rarity', '稀有度'), [
    ['common', label('Common · White', '普通 · 白色')],
    ['magic', label('Magic · Blue', '魔法 · 藍色')],
    ['rare', label('Rare · Gold', '稀有 · 金色')],
    ['legendary', label('Legendary · Orange', '傳說 · 橘色')],
  ]);
  addGroup('slots', label('Equipment slots', '裝備部位'),
    Object.entries(SLOT_NAMES).filter(([slot]) => slot !== 'ring2'));
  const levelLabel = node('label', 'sale-level', message(label('Maximum item level (inclusive)', '物品等級上限（含）')));
  const level = node('input');
  level.type = 'number'; level.id = 'sale-max-level'; level.min = '1';
  level.max = String(SAVE_LIMITS.itemLevel); level.step = '1'; level.required = true;
  level.value = String(settings.saleFilter.maxLevel);
  levelLabel.append(level); form.append(levelLabel);
  const summary = node('p', 'sale-summary'); summary.id = 'sale-summary'; summary.setAttribute('role', 'status');
  form.append(summary);
  const actions = node('div', 'sale-actions');
  const manual = button('', () => {
    if (!inTown || !level.reportValidity()) return;
    const result = sellMatching(player, settings.saleFilter);
    if (result.ok && result.count) {
      renderInventory(); renderHud(); void persist();
    }
    refresh();
    summary.textContent = `${message(result.message)} ${summary.textContent}`;
  });
  manual.id = 'sell-matching';
  const automatic = button('', () => {
    if (!settings.autoSell && !level.reportValidity()) return;
    settings.autoSell = !settings.autoSell;
    refresh(); renderInventory(); void persistSettings();
  });
  automatic.id = 'auto-sell-toggle';
  actions.append(manual, automatic); form.append(actions);
  form.append(node('p', 'sale-help', message(label(
    'Manual sales: sanctuary only. Auto-sell: new drops only, even with a full bag. Equipped gear is never sold. Sales cannot be undone.',
    '手動出售僅限庇護所；自動售出只處理新掉落，背包滿仍可售出。不出售身上裝備，售出後無法復原。'))));
  content.append(form);
  function refresh() {
    const valid = level.validity.valid;
    if (valid) {
      settings.saleFilter = {
        rarities: groups.rarities.filter(check => check.checked).map(check => check.value),
        slots: groups.slots.filter(check => check.checked).map(check => check.value),
        maxLevel: level.valueAsNumber,
      };
    }
    const selected = settings.saleFilter.rarities.length && settings.saleFilter.slots.length;
    if (!selected) settings.autoSell = false;
    const preview = salePreview(player, settings.saleFilter);
    summary.textContent = message(valid
      ? label(`${preview.count} matching items · ${preview.gold} gold`, `符合 ${preview.count} 件 · 共 ${preview.gold} 金幣`)
      : label(`Enter a whole level from 1 to ${SAVE_LIMITS.itemLevel}; this edit is not applied.`,
        `請輸入 1–${SAVE_LIMITS.itemLevel} 的整數等級；此修改尚未套用。`));
    manual.textContent = message(label(`Sell matching (${preview.count})`, `一鍵出售（${preview.count} 件）`));
    manual.disabled = !inTown || !valid || !preview.count;
    manual.title = inTown ? '' : message(WORDS.sanctuaryOnly);
    automatic.textContent = message(settings.autoSell
      ? label('Auto-sell: ON', '自動售出：開啟') : label('Auto-sell: OFF', '自動售出：關閉'));
    automatic.setAttribute('aria-pressed', String(settings.autoSell));
    automatic.disabled = !settings.autoSell && (!valid || !selected);
  }
  form.addEventListener('input', () => {
    refresh(); renderInventory();
    if (level.validity.valid) void persistSettings();
  });
  refresh();
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
    const caption = node('label', 'setting-toggle');
    const toggle = node('input'); toggle.type = 'checkbox'; toggle.checked = settings[`${prefix}Enabled`];
    const slider = node('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(SAVE_LIMITS.volume); slider.value = String(settings[`${prefix}Volume`]);
    slider.setAttribute('aria-label', `${message(name)} ${message(label('volume', '音量'))}`);
    const level = node('span', '', slider.value);
    toggle.addEventListener('change', () => { settings[`${prefix}Enabled`] = toggle.checked; audio.setSettings(settings); void persistSettings(); });
    slider.addEventListener('input', () => { settings[`${prefix}Volume`] = Number(slider.value); level.textContent = slider.value; audio.setSettings(settings); void persistSettings(); });
    caption.append(toggle, node('span', 'setting-track'), node('span', 'setting-caption', message(name)));
    field.append(caption, slider, level); content.append(field);
  }
  const bindings = node('div', 'mouse-bindings');
  bindings.append(node('p', '', message(label('Mouse skills · follows the skill slot when changing class or form.', '滑鼠技能 · 切換職業或形態時沿用技能欄位置。'))));
  for (const [key, name] of [['leftMouseSkill', label('Left mouse', '滑鼠左鍵')], ['rightMouseSkill', label('Right mouse', '滑鼠右鍵')]]) {
    const caption = node('label', 'setting-row', message(name));
    const select = node('select');
    select.id = key;
    combat.skills.forEach((skill, index) => {
      const option = node('option', '', message(skill.name));
      option.value = String(index); select.append(option);
    });
    select.value = String(settings[key]);
    select.addEventListener('change', () => {
      settings[key] = Number(select.value);
      renderSkills(); void persistSettings();
    });
    caption.append(select); bindings.append(caption);
  }
  content.append(bindings);
  const actions = node('div', 'modal-actions');
  actions.append(button(message(UI.load), () => void showSlots()), button(message(UI.export), () => void exportSaves()), button(message(UI.import), () => $('import-file').click()),
    button(message(UI.restore), () => void restoreBackup()));
  content.append(actions);
}
async function showSlots() {
  try {
    const entries = await saves.list();
    const content = openModal(UI.load);
    const grid = node('div', 'modal-grid'); content.append(grid);
    for (const entry of entries) {
      const name = message(CLASSES.find(character => character.id === entry.classId).name);
      const detail = entry.exists ? `${message(UI.level)} ${entry.level} · ${message(ACTS[entry.progress.act].name)}` : message(WORDS.newCharacter);
      const choice = button(`${name} · ${detail}`, async () => {
        try {
          if (!entry.exists) { notify(UI.noSave); return; }
          if (!window.confirm(message(label(
            `Load ${name} · ${detail}? Unsaved progress will be lost and you will return to the sanctuary.`,
            `確定讀取「${name} · ${detail}」？目前未儲存的進度將會遺失，並返回庇護所。`)))) return;
          const restored = await saves.load(entry.classId);
          if (!restored) { notify(UI.noSave); return; }
          player = Object.assign(createPlayer(entry.classId), restored);
          inTown = true; selectedItemId = null; page = 0;
          makeState(createArea(player.progress));
          hasSavedCharacter = true;
          if (titleOpen) beginJourney();
          notify(WORDS.loaded);
          closeModal();
        } catch (error) { failure(error); }
      });
      choice.disabled = !entry.exists;
      grid.append(choice);
    }
    content.append(button(message(UI.export), () => void exportSaves()), button(message(UI.import), () => $('import-file').click()),
      button(message(UI.restore), () => void restoreBackup()));
  } catch (error) { failure(error); }
}
async function downloadScreenshot() {
  const control = $('screenshot-button');
  if (control.disabled) return;
  const filename = screenshotFilename();
  try {
    // Snapshot before disabling the control so the image preserves the clicked view.
    const pending = captureViewport();
    control.disabled = true;
    const url = URL.createObjectURL(await pending);
    const link = node('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), CONFIG.messageDuration * 1000);
    notify(WORDS.screenshotReady);
  } catch (error) { failure(error); }
  finally { control.disabled = false; }
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
        if (!window.confirm(message(label(
          'Import this save? All character slots and settings will be replaced, including clearing slots absent from the file. Current saves will be backed up first.',
          '確定匯入此存檔？所有角色槽與設定將被取代，檔案中沒有的角色槽也會清空。覆蓋前會先備份目前存檔。')))) return;
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
    if (!window.confirm(message(label(
      'Restore the backup? All character slots and settings will be replaced, and unsaved progress will be lost.',
      '確定還原備份？所有角色槽與設定將被取代，目前未儲存的進度將會遺失。')))) return;
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
  input.attackSkill = settings.leftMouseSkill;
  input.secondarySkill = settings.rightMouseSkill;
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
  }
}
function render(alpha) { renderer.draw(state, alpha); }

input = new Input($('game'), (x, y) => renderer.toWorld(x, y), action);
$('modal').addEventListener('close', () => {
  if (modalOpen) { state.paused = modalPaused; modalOpen = false; renderSkills(); }
});
$('modal-close').addEventListener('click', closeModal);
$('inventory-button').addEventListener('click', () => setInventoryOpen($('inventory-panel').hidden));
$('screenshot-button').addEventListener('click', () => void downloadScreenshot());
$('inventory-close').addEventListener('click', () => setInventoryOpen(false));
$('equip-best').addEventListener('click', () => {
  const result = equipBest(player);
  notify(result.message, result.changed ? 'equip' : null);
  if (result.changed) {
    combat.refreshPlayer();
    renderInventory(); renderSkills(); renderHud(); void persist();
  }
});
$('sale-filter-button').addEventListener('click', openSaleFilter);
$('title-start').addEventListener('click', beginJourney);
$('title-settings').addEventListener('click', openSettings);
$('title-language').addEventListener('click', () => $('language-button').click());
$('save-button').addEventListener('click', () => void persist(true));
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
new ResizeObserver(() => {
  if (!$('inventory-panel').hidden && activePanel === 'inventory') renderInventory();
}).observe($('items'));
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
  $('title-start').disabled = $('title-settings').disabled = false;
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
