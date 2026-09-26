import { CONFIG, ART } from './data/config.js?v=150ea1c4a95afc0e';
import { DEFAULT_SETTINGS, SAVE_LIMITS } from './data/save.js?v=2a952fa1ede7fff0';
import { CLASSES, COMBAT } from './data/combat.js?v=fdc1129299fc0d36';
import { AFFIXES, GEAR_BALANCE, SLOT_NAMES } from './data/gear.js?v=dd3a72133bbc3a05';
import { ACTS, DIFFICULTIES, WORLD } from './data/world.js?v=ef5f78c241fd8cdd';
import { SANCTUARIES } from './data/sanctuary.js?v=27c83fc812468275';
import { ACT_MUSIC } from './data/audio.js?v=c5e4578c00cd424f';
import { Renderer } from './core/renderer.js?v=7185833c9fa0c452';
import { Input } from './core/input.js?v=ffe8149398002935';
import { GameLoop } from './core/loop.js?v=1f7b88356958683e';
import { AudioManager } from './core/audio.js?v=9175c82b0ec34617';
import { Combat, createPlayer, skillRankScales } from './systems/combat.js?v=2b5025875243e6d3';
import { createArea, recordKill, advance, enterDungeon, enterSheep, deathPenalty } from './systems/world.js?v=9d5a2afb8a663141';
import { getModifiers, equip, equipBest, unequip, sell, salePreview, sellMatching, repair, buy, craft, grantLoot } from './systems/gear.js?v=45d026153c480c72';
import { SaveStore } from './systems/save.js?v=4faf8ce27f236bfb';
import { revealExploration } from './systems/exploration.js?v=17e880da1985dcab';
import { registerPWA } from './systems/pwa.js?v=db9b2832dbced912';
import { UI, getLanguage, setLanguage, text } from './systems/i18n.js?v=e53b6131f86e52f9';
import { captureViewport, screenshotFilename } from './core/screenshot.js?v=2ce5f207b47a042d';

const $ = id => document.getElementById(id);
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
let shopSession = null;
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
  notify(UI.uiError(error.message));
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
function returnTown() {
  if (inTown) return;
  inTown = true;
  input.clear();
  player.hp = player.maxHp;
  player.resource = player.maxResource;
  player.status = {}; player.cooldowns = {}; player.buffs = {}; player.form = 'human';
  makeState(createArea(player.progress));
  void persist();
}

function confirmReturnTown() {
  if (inTown) return;
  const sanctuary = SANCTUARIES[player.progress.act];
  const content = openModal(UI.town);
  $('modal').classList.add('confirmation-modal');
  $('modal').setAttribute('aria-describedby', 'return-description');
  const destination = node('div', 'return-destination');
  const art = node('img', 'return-art');
  art.src = `assets/sanctuaries/sanctuary-${sanctuary.art}.svg`;
  art.alt = '';
  const caption = node('div', 'return-caption');
  caption.append(node('span', 'return-kicker', message(UI.sanctuary)), node('strong', '', message(sanctuary.name)));
  destination.append(art, caption);
  const description = node('p', 'return-description', message(UI.confirmReturn));
  description.id = 'return-description';
  const actions = node('div', 'return-actions');
  const cancel = button(message(UI.cancel), closeModal, 'subtle');
  actions.append(cancel, button(message(UI.town), () => {
    closeModal();
    returnTown();
  }, 'return-confirm'));
  content.append(destination, description, actions);
  cancel.focus();
}

function showDeath() {
  state.paused = true;
  player.hp = 0;
  input.clear();
  setInventoryOpen(false);
  deathPenalty(player);
  audio.play('death');
  renderHud();
  $('death-screen').showModal();
  $('death-return').focus();
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
    const cooldown = node('span', 'skill-cooldown', remaining > 0 ? `${remaining.toFixed(1)} ${message(UI.seconds)}` : '');
    tile.append(cooldown);
    tile.disabled = inTown || state.paused || remaining > 0 || player.resource < skill.cost;
    return tile;
  }));
  const points = player.attributePoints + player.skillPoints;
  $('passives').replaceChildren(button(`${message(UI.growth)}${points ? ` · +${points}` : ''}`, openGrowth, 'growth-button'));
}
function growthHint(choice, description, container) {
  const wrapper = node('div', 'growth-choice');
  const hint = node('div', 'growth-tooltip', description);
  hint.id = `growth-hint-${$('modal-content').querySelectorAll('.growth-tooltip').length}`;
  hint.setAttribute('role', 'tooltip');
  hint.hidden = true;
  choice.setAttribute('aria-describedby', hint.id);
  const reveal = () => {
    hint.hidden = false;
    const rect = choice.getBoundingClientRect();
    hint.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - hint.offsetWidth - 8))}px`;
    hint.style.top = `${Math.max(8, rect.top - hint.offsetHeight - 8)}px`;
  };
  wrapper.addEventListener('mouseenter', reveal);
  wrapper.addEventListener('mouseleave', () => { hint.hidden = true; });
  choice.addEventListener('focus', reveal);
  choice.addEventListener('blur', () => { hint.hidden = true; });
  wrapper.append(choice);
  container.append(wrapper, hint);
}

function openGrowth() {
  const content = openModal(UI.growth);
  content.append(...role().passives.map(passive => node('div', 'passive-label', message(passive))));
  const stats = node('div', 'modal-grid');
  content.append(node('h3', '', `${message(UI.attributePoints)}: ${player.attributePoints}`), stats);
  const B = COMBAT.base;
  const format = value => String(Number(value.toFixed(2)));
  const separator = language === 'zh' ? '；' : '; ';
  for (const attribute of Object.keys(player.attributes)) {
    const choice = button(`${message(UI[attribute])} ${player.attributes[attribute]} +`, () => {
      if (combat.spendAttribute(attribute)) { renderSkills(); renderHud(); openGrowth(); void persist(); }
    }, 'stat-button');
    choice.disabled = !player.attributePoints;
    const primary = COMBAT.primary[player.classId] === attribute;
    const effects = [];
    if (attribute === 'strength') {
      const armor = B.strengthArmor * (player.classId === 'warrior' ? 1 + B.passiveWarriorArmor : 1);
      effects.push(message(UI.growthArmor(format(armor))));
    } else if (attribute === 'dexterity') {
      effects.push(message(UI.growthCrit(format(B.dexterityCrit * 100))), message(UI.growthDexterityNote));
    } else if (attribute === 'vitality') {
      effects.push(message(UI.growthLife(B.attributeLife, format(B.vitalityLife * 10))));
    } else if (attribute === 'spirit') {
      effects.push(message(UI.growthResource(B.spiritResource)));
      if (player.classId === 'wizard' || player.classId === 'druid') effects.push(message(UI.growthRegen(format(B.spiritRegen))));
    } else if (!primary) {
      effects.push(message(UI.growthIntelligence), message(UI.growthNoEffect));
    }
    if (primary) effects.push(message(UI.growthPrimary(format(B.attributeDamage * 100))));
    const lines = [`${message(UI[attribute])} ${player.attributes[attribute]} → ${player.attributes[attribute] + 1}`];
    if (effects.length) lines.push(`${message(UI.growthPerPoint)}${language === 'zh' ? '' : ' '}${effects.join(separator)}`);
    growthHint(choice, lines.join('\n'), stats);
  }
  const ranks = node('div', 'modal-grid');
  content.append(node('h3', '', `${message(UI.skillPoints)}: ${player.skillPoints}`), ranks);
  role().skills.slice(1).forEach((skill, index) => {
    const choice = button(`${message(skill.name)} + (${message(UI.rank)} ${player.skillRanks[skill.id] || 0})`, () => {
      if (combat.spendSkill(index + 1)) { renderSkills(); openGrowth(); void persist(); }
    }, 'stat-button');
    const rank = player.skillRanks[skill.id] || 0;
    const next = Math.min(rank + 1, B.maxSkillRank);
    const detail = [message(skill.description), message(UI.growthRank(rank, next, B.maxSkillRank))];
    if (rank >= B.maxSkillRank) detail.push(message(UI.growthMaxRank));
    else if (!skillRankScales(skill)) detail.push(message(UI.growthUnscaled));
    else if (!rank) detail.push(message(UI.growthDamageSteady('1.00')));
    else {
      const multiplier = value => (1 + (value - 1) * B.rankDamage).toFixed(2);
      detail.push(message(UI.growthDamage(multiplier(rank), multiplier(next))));
    }
    choice.disabled = !player.skillPoints || rank >= B.maxSkillRank;
    growthHint(choice, detail.join('\n'), ranks);
  });
  $('modal-close').focus();
}
function updateSkillAvailability() {
  const skills = combat.skills;
  const tiles = $('skills').children;
  for (let index = 0; index < tiles.length; index++) {
    const skill = skills[index], remaining = player.cooldowns[skill.id] || 0;
    tiles[index].lastChild.textContent = remaining > 0 ? `${remaining.toFixed(1)} ${message(UI.seconds)}` : '';
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
  $('sale-filter-button').textContent = message(settings.autoSell ? UI.saleFilterActive : UI.saleFilter);
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
      tile.title = `${slotName} · ${item ? message(item.name) : message(UI.noSlot)}`;
      tile.append(node('span', 'slot-label', slotName), itemIcon(slot),
        node('strong', 'item-name', item ? message(item.name) : message(UI.noSlot)));
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
function appendItemDescription(container, item) {
  const title = node('h3', 'detail-name', message(item.name)); title.dataset.rarity = item.rarity;
  container.append(title, node('p', 'detail-meta', `${message(SLOT_NAMES[item.slot])} · ${message(UI.itemLevel)} ${item.level} · ${message(UI.durability)} ${item.durability}/${item.maxDurability}`));
  for (const entry of item.affixes) {
    const affix = AFFIXES.find(definition => definition.id === entry.id);
    container.append(node('div', 'affix-row', `${message(affix.name)} +${entry.value} · T${entry.tier}`));
  }
}
function renderItemDetail() {
  const item = findSelected(), detail = $('item-detail'), actions = $('item-actions');
  detail.replaceChildren(); actions.replaceChildren();
  if (!item) { selectedItemId = null; detail.append(node('p', '', message(UI.empty))); return; }
  detail.append(itemIcon(item.slot, 'detail-icon'));
  appendItemDescription(detail, item);
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
    if (!inTown) sellButton.title = message(UI.sanctuaryOnly);
    actions.append(sellButton);
  }
  if (inTown && item.affixes.length) actions.append(button(message(UI.forge), () => openForge(item.id)));
}
function renderHud() {
  const p = player;
  $('health-label').textContent = message(UI.healthShort);
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
  $('death-title').textContent = message(UI.deathTitle);
  $('death-description').textContent = message(UI.deathDescription);
  $('death-return').textContent = message(UI.town);
  document.documentElement.lang = language;
  $('screenshot-button').textContent = message(UI.screenshot);
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
  $('title-tagline').textContent = message(UI.tagline);
  $('title-start').textContent = message(hasSavedCharacter ? UI.continueJourney : UI.beginJourney);
  $('title-settings').textContent = message(UI.settings);
  $('title-language').textContent = language === 'en' ? '中文' : 'English';
  $('title-footnote').textContent = message(UI.titleFootnote);
  $('update-button').textContent = message(UI.updateReady);
  $('controls-hint').textContent = `${message(UI.controls)} · ${message(UI.secondary)}`;
  $('language-button').textContent = language === 'en' ? '中文' : 'English';
  $('modal-close').setAttribute('aria-label', message(UI.close));
  $('inventory-close').setAttribute('aria-label', message(UI.close));
  $('inventory-panel').setAttribute('aria-label', `${message(UI.inventory)} · ${message(UI.equipment)}`);
  $('equip-best').textContent = message(UI.equipBest);
  $('equip-best').title = message(UI.equipBestHint);
  $('shop-button').title = $('forge-button').title = inTown ? '' : message(UI.sanctuaryOnly);
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
function closeModal() {
  invalidateShop();
  if ($('modal').open) $('modal').close();
}
function invalidateShop() {
  if (!shopSession) return;
  for (const timer of shopSession.timers) clearTimeout(timer);
  shopSession = null;
}
function openModal(title) {
  invalidateShop();
  $('modal').classList.remove('confirmation-modal');
  $('modal').removeAttribute('aria-describedby');
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
  const content = openModal(UI.saleFilter);
  const form = node('div', 'sale-filter');
  form.append(node('p', 'sale-help', message(UI.saleHelp)));
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
  addGroup('rarities', UI.saleRarity, Object.entries(UI.saleRarities));
  addGroup('slots', UI.saleSlots,
    Object.entries(SLOT_NAMES).filter(([slot]) => slot !== 'ring2'));
  const levelLabel = node('label', 'sale-level', message(UI.saleMaxLevel));
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
  form.append(node('p', 'sale-help', message(UI.saleRules)));
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
      ? UI.salePreview(preview.count, preview.gold) : UI.saleLevelInvalid(SAVE_LIMITS.itemLevel));
    manual.textContent = message(UI.sellMatching(preview.count));
    manual.disabled = !inTown || !valid || !preview.count;
    manual.title = inTown ? '' : message(UI.sanctuaryOnly);
    automatic.textContent = message(settings.autoSell ? UI.autoSellOn : UI.autoSellOff);
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
  const session = { timers: new Set(), revealing: false };
  shopSession = session;
  const layout = node('div', 'shop-layout');
  const controls = node('div', 'shop-controls');
  const panel = node('div', 'gamble-panel');
  const gold = node('p', 'shop-gold');
  const status = node('p', 'shop-status');
  status.setAttribute('role', 'status');
  const repeat = button(`${message(UI.gambleRepeat)} · ${GEAR_BALANCE.gambleGold} ${message(UI.gold)}`,
    gamble, 'gamble-repeat');
  repeat.hidden = true;
  panel.append(node('p', 'gamble-placeholder', message(UI.gamblePrompt)), repeat);
  layout.append(controls, panel);
  content.append(gold, layout, status);
  const active = () => shopSession === session && $('modal').open && content.isConnected && inTown;
  const refreshGold = () => { gold.textContent = `${message(UI.gold)}: ${player.gold}`; };
  refreshGold();
  for (const [type, name, price] of [
    ['health', UI.health, GEAR_BALANCE.healthPotionGold],
    ['resource', UI.resource, GEAR_BALANCE.resourcePotionGold],
    ['gamble', UI.gamble, GEAR_BALANCE.gambleGold],
  ]) {
    const row = rowButton(controls, message(name), `${price} ${message(UI.gold)}`,
      type === 'gamble' ? gamble : () => {
        if (!active()) return;
        const result = buy(player, type);
        status.textContent = message(result.message);
        refreshGold();
        if (result.ok) { renderInventory(); renderHud(); void persist(); }
      });
    if (type === 'gamble') session.gambleButton = row.lastElementChild;
  }
  rowButton(controls, message(UI.repair), '', () => {
    if (!active()) return;
    const result = repair(player);
    status.textContent = message(result.message);
    refreshGold();
    if (result.ok) {
      combat.refreshPlayer();
      renderInventory(); renderHud(); void persist();
    }
  });

  function gamble() {
    if (!active() || session.revealing) return;
    const result = buy(player, 'gamble');
    refreshGold();
    if (!result.ok) { status.textContent = message(result.message); return; }
    renderInventory(); renderHud(); void persist();
    status.textContent = message(UI.gambleWaiting);
    const item = result.item;
    const card = node('div', 'gamble-card gamble-revealing');
    card.dataset.rarity = item.rarity;
    card.style.setProperty('--gamble-reveal-duration', `${CONFIG.gambleRevealDuration}s`);
    const details = node('div', 'gamble-details');
    details.setAttribute('aria-hidden', 'true');
    details.append(node('span', 'gamble-rarity', message(UI.gambleRarities[item.rarity])));
    appendItemDescription(details, item);
    if (!item.affixes.length) details.append(node('p', 'gamble-no-affixes', message(UI.noAffixes)));
    card.append(itemIcon(item.slot, 'gamble-icon'), details);
    panel.querySelector('.gamble-card, .gamble-placeholder')?.remove();
    panel.prepend(card);
    repeat.hidden = false;
    session.revealing = true;
    session.gambleButton.disabled = true;
    repeat.disabled = true;
    const silhouetteTimer = setTimeout(() => {
      session.timers.delete(silhouetteTimer);
      if (!active() || !card.isConnected) return;
      card.classList.remove('gamble-revealing');
      details.removeAttribute('aria-hidden');
      audio.play(`gamble${item.rarity[0].toUpperCase()}${item.rarity.slice(1)}`);
      status.textContent = message(result.message);
    }, CONFIG.gambleSilhouetteDuration * 1000);
    const revealTimer = setTimeout(() => {
      session.timers.delete(revealTimer);
      if (!active() || !card.isConnected) return;
      session.revealing = false;
      session.gambleButton.disabled = false;
      repeat.disabled = false;
    }, (CONFIG.gambleSilhouetteDuration + CONFIG.gambleRevealDuration) * 1000);
    session.timers.add(silhouetteTimer);
    session.timers.add(revealTimer);
  }
}
function openForge(itemId = selectedItemId, affixIndex = 0) {
  if (!inTown) return;
  const owned = [...player.inventory, ...Object.values(player.equipment).filter(Boolean)];
  const item = owned.find(entry => entry.id === itemId);
  if (!item) {
    const content = openModal(UI.forge);
    const choices = owned.filter(entry => entry.affixes.length);
    if (!choices.length) content.append(node('p', '', message(UI.noAffixes)));
    else for (const choice of choices) {
      const tile = button(null, () => openForge(choice.id), 'affix-choice');
      tile.dataset.rarity = choice.rarity;
      tile.append(itemIcon(choice.slot, 'item-choice-icon'), node('span', '', message(choice.name)));
      content.append(tile);
    }
    return;
  }
  if (!item.affixes.length) { notify(UI.noAffixes); return; }
  const content = openModal(UI.forge);
  content.append(itemIcon(item.slot, 'detail-icon'), node('h3', '', message(item.name)), node('p', '', message(UI.selectAffix)));
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
    slider.setAttribute('aria-label', `${message(name)} ${message(UI.volume)}`);
    const level = node('span', '', slider.value);
    toggle.addEventListener('change', () => { settings[`${prefix}Enabled`] = toggle.checked; audio.setSettings(settings); void persistSettings(); });
    slider.addEventListener('input', () => { settings[`${prefix}Volume`] = Number(slider.value); level.textContent = slider.value; audio.setSettings(settings); void persistSettings(); });
    caption.append(toggle, node('span', 'setting-track'), node('span', 'setting-caption', message(name)));
    field.append(caption, slider, level); content.append(field);
  }
  const bindings = node('div', 'mouse-bindings');
  bindings.append(node('p', '', message(UI.mouseSkills)));
  for (const [key, name] of [['leftMouseSkill', UI.leftMouse], ['rightMouseSkill', UI.rightMouse]]) {
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
    button(message(UI.restore), () => void restoreBackup()),
    button(message(UI.fullscreen), () => {
      // A modal dialog left open across a fullscreen switch can strand the document inert:
      // the fullscreen root then renders above the dialog, leaving every interface unusable.
      closeModal();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen().catch(() => {});
    }));
  content.append(actions);
}
async function showSlots() {
  try {
    const entries = await saves.list();
    const content = openModal(UI.load);
    const grid = node('div', 'modal-grid'); content.append(grid);
    for (const entry of entries) {
      const name = message(CLASSES.find(character => character.id === entry.classId).name);
      const detail = entry.exists ? `${message(UI.level)} ${entry.level} · ${message(ACTS[entry.progress.act].name)}` : message(UI.newCharacter);
      const choice = button(`${name} · ${detail}`, () => confirmLoad(entry, name, detail));
      choice.disabled = !entry.exists;
      grid.append(choice);
    }
    content.append(button(message(UI.export), () => void exportSaves()), button(message(UI.import), () => $('import-file').click()),
      button(message(UI.restore), () => void restoreBackup()));
  } catch (error) { failure(error); }
}
function confirmLoad(entry, name, detail) {
  if (!entry.exists) return;
  const content = openModal(UI.load);
  $('modal').classList.add('confirmation-modal');
  $('modal').setAttribute('aria-describedby', 'load-description');
  const preview = node('div', 'return-destination');
  const art = node('img', 'return-art');
  art.src = `assets/sanctuaries/sanctuary-${SANCTUARIES[entry.progress.act].art}.svg`;
  art.alt = '';
  const caption = node('div', 'return-caption');
  caption.append(node('span', 'return-kicker', detail), node('strong', '', name));
  preview.append(art, caption);
  const description = node('p', 'return-description', message(UI.confirmLoad(`${name} · ${detail}`)));
  description.id = 'load-description';
  const actions = node('div', 'return-actions');
  const cancel = button(message(UI.cancel), () => void showSlots(), 'subtle');
  const confirm = button(message(UI.load), async () => {
    confirm.disabled = true;
    cancel.disabled = true;
    try {
      const restored = await saves.load(entry.classId);
      if (!restored) { notify(UI.noSave); await showSlots(); return; }
      player = Object.assign(createPlayer(entry.classId), restored);
      inTown = true; selectedItemId = null; page = 0;
      makeState(createArea(player.progress));
      hasSavedCharacter = true;
      if (titleOpen) beginJourney();
      notify(UI.loaded);
      closeModal();
    } catch (error) { failure(error); }
    finally { confirm.disabled = false; cancel.disabled = false; }
  }, 'return-confirm');
  actions.append(cancel, confirm);
  content.append(preview, description, actions);
  cancel.focus();
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
    notify(UI.screenshotReady);
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
    notify(UI.exportReady);
  } catch (error) { failure(error); }
}
async function importFile(file) {
  if (!file) return;
  try {
    const json = await file.text();
    const preview = saves.previewImport(json);
    const content = openModal(UI.importPreview);
    content.append(node('p', '', message(UI.importHint)));
    for (const entry of preview.characters) {
      const name = message(CLASSES.find(character => character.id === entry.classId).name);
      content.append(node('div', 'modal-row', `${name} · ${message(UI.level)} ${entry.level} · ${message(DIFFICULTIES[entry.difficulty].name)} · ${message(ACTS[entry.act].maps[entry.map].name)} · ${entry.gold} ${message(UI.gold)} · ${entry.inventory} ${message(UI.inventory)} · ${entry.equipment} ${message(UI.equipment)}`));
    }
    if (!preview.characters.length) content.append(node('p', '', message(UI.newCharacter)));
    const actions = node('div', 'modal-actions'); content.append(actions);
    actions.append(button(message(UI.confirmImport), async () => {
      try {
        if (!window.confirm(message(UI.confirmImportSave))) return;
        if (!await persist()) return;
        await saves.importJSON(json);
        settings = { ...preview.settings };
        language = setLanguage(settings.language);
        audio.setSettings(settings);
        const restored = await saves.load(player.classId);
        player = Object.assign(createPlayer(player.classId), restored || {});
        inTown = true; selectedItemId = null; page = 0;
        makeState(createArea(player.progress));
        closeModal(); notify(UI.imported);
      } catch (error) { failure(error); }
    }), button(message(UI.cancel), closeModal));
  } catch (error) { failure(error); }
}
async function restoreBackup() {
  try {
    if (!window.confirm(message(UI.confirmRestore))) return;
    const restored = await saves.restoreBackup();
    if (!restored) { notify(UI.noBackup); return; }
    settings = { ...await saves.loadSettings() };
    language = setLanguage(settings.language);
    audio.setSettings(settings);
    player = Object.assign(createPlayer(player.classId), await saves.load(player.classId) || {});
    inTown = true; selectedItemId = null; page = 0;
    makeState(createArea(player.progress));
    closeModal(); notify(UI.restoreDone);
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
  if (titleOpen || $('death-screen').open) return;
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
  if (inTown || state.paused) { input.secondaryQueued = false; return; }
  input.attackSkill = settings.leftMouseSkill;
  input.secondarySkill = settings.rightMouseSkill;
  combat.update(dt, input);
  revealExploration(state.area, player.x, player.y);
  if (pendingDeath) { pendingDeath = false; showDeath(); return; }
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
$('death-screen').addEventListener('cancel', event => event.preventDefault());
$('death-screen').addEventListener('keydown', event => {
  if (event.key === 'Tab') { event.preventDefault(); $('death-return').focus(); }
});
$('death-return').addEventListener('click', () => {
  if (!$('death-screen').open) return;
  $('death-screen').close();
  returnTown();
  $('depart-button').focus();
});
$('modal').addEventListener('close', () => {
  invalidateShop();
  if (modalOpen) { state.paused = inTown || modalPaused; modalOpen = false; renderSkills(); }
});
$('modal').addEventListener('keydown', event => {
  if (event.key !== 'Tab' || !$('modal').classList.contains('confirmation-modal')) return;
  const first = $('modal-close');
  const last = $('modal-content').querySelector('.return-confirm');
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
$('town-button').addEventListener('click', confirmReturnTown);
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
function syncViewportWarning() {
  show('desktop-warning', window.innerWidth < CONFIG.minWidth || window.innerHeight < CONFIG.minHeight);
}
window.addEventListener('resize', syncViewportWarning);
// Fullscreen transitions fire transient sizes; re-check once the transition has settled
// so a transient undersized value cannot leave the full-screen warning stuck over the UI.
document.addEventListener('fullscreenchange', () => {
  syncViewportWarning();
  setTimeout(syncViewportWarning, 300);
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
