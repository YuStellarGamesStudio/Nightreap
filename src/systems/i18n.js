// Language selection and interface copy. Game content (classes, skills, monsters, gear, areas)
// keeps its own {en, zh} text beside the data it names.
export const LANGUAGES = Object.freeze(['en', 'zh']);

export function getLanguage() {
  if (typeof location !== 'undefined') {
    const query = new URLSearchParams(location.search).get('lang');
    if (LANGUAGES.includes(query)) return query;
  }
  return 'en';
}

export function setLanguage(lang) {
  if (!LANGUAGES.includes(lang)) throw new TypeError('Unsupported language');
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.pushState(history.state, '', url);
  return lang;
}

export function text(value, language = getLanguage()) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return typeof value[language] === 'string' && value[language]
    ? value[language] : typeof value.en === 'string' ? value.en : '';
}

const label = (en, zh) => ({ en, zh });

// Entries taking arguments are functions returning {en, zh}.
export const UI = {
  // Title and navigation
  title: label('NIGHTREAP', '永夜收割'), subtitle: label('BENEATH THE LAST MOON', '最後一輪月光之下'),
  tagline: label('The night is endless. Your flame is not.', '長夜無盡，你的火光卻並非永恆。'),
  beginJourney: label('Begin your journey', '開始旅程'), continueJourney: label('Continue journey', '繼續旅程'),
  titleFootnote: label('A sanctuary waits beyond the dark.', '黑暗彼端，仍有庇護你的燈火。'),
  updateReady: label('Update ready · Save & reload', '更新已就緒 · 存檔並重新載入'),
  journey: label('JOURNEY', '遠征'), inventory: label('Inventory', '背包'), equipment: label('Equipment', '裝備'),
  forge: label('Forge', '鍛造'), shop: label('Merchant', '商人'), settings: label('Settings', '設定'),
  enter: label('Enter the night', '踏入永夜'), town: label('Return to sanctuary', '返回庇護所'),
  next: label('Travel onward', '前往下一區'), dungeon: label('Descend into dungeon', '深入地下城'), sheep: label('Hidden gate · 1 ticket', '隱藏門 · 綿羊券 ×1'),
  sanctuary: label('Sanctuary', '永夜庇護所'), character: label('Choose your oath', '選擇你的誓約'),
  sanctuaryHint: label('Prepare your relics. Choose a difficulty, then step beyond the flame.', '整理你的遺物，選定難度，踏出守護之火。'),
  confirmReturn: label('Return to the sanctuary? Current exploration will end; enemies and the area will reset when you enter again.',
    '確定返回庇護所？本次探索將結束，再次進入時怪物與地圖將重置。'),
  controls: label('WASD move · Hold mouse attack · 1–6 skills · R ultimate · Q/E potions · Tab inventory', 'WASD 移動 · 按住滑鼠普攻 · 1–6 技能 · R 終極 · Q/E 藥水 · Tab 背包'),
  desktop: label('Nightreap needs a desktop viewport of at least 1280 × 720.', '永夜收割需要至少 1280 × 720 的桌機視窗。'),
  paused: label('Paused', '已暫停'), resume: label('Resume', '繼續'),
  deathTitle: label('YOU HAVE FALLEN', '你已倒下'),
  deathDescription: label('The night claims this battle, not your legacy. Your equipment is safe. Return when you are ready.',
    '永夜奪走了這場戰鬥，卻帶不走你的遺物。裝備仍然保留，準備好再返回庇護所。'),
  cleared: label('Area secured. The road is open.', '區域已清除，道路已開啟。'), kills: label('Harvest', '收割'),
  notNear: label('Approach the marked gateway first.', '請先靠近標記的入口。'),
  sanctuaryOnly: label('Available in the sanctuary only.', '僅能在庇護所使用。'),
  uiError: detail => label(`Action failed: ${detail}`, `操作失敗：${detail}`),

  // Character and HUD
  level: label('Level', '等級'), depth: label('Depth', '深度'), gold: label('Gold', '金幣'), materials: label('Materials', '材料'), tickets: label('Tickets', '綿羊券'),
  difficulty: label('Difficulty', '難度'), locked: label('Defeat the Abyss Lord to unlock.', '擊敗深淵之主解鎖。'),
  attributePoints: label('Attribute points', '屬性點'), skillPoints: label('Skill points', '技能點'),
  growth: label('Character growth', '角色成長'),
  strength: label('Strength', '力量'), dexterity: label('Dexterity', '敏捷'), intelligence: label('Intelligence', '智力'), vitality: label('Vitality', '體力'), spirit: label('Spirit', '精神'),
  human: label('Human', '人形'), bear: label('Bear', '熊形'), wolf: label('Wolf', '狼形'),
  rank: label('Rank', '等級'), seconds: label('seconds', '秒'),
  healthShort: label('LIFE', '生命'), resourceShort: label('RESOURCE', '資源'),
  primary: label('LMB · Primary', '左鍵 · 普攻'), secondary: label('RMB · Secondary', '右鍵 · 次要攻擊'),
  health: label('Health potion', '生命藥水'), resource: label('Resource potion', '資源藥水'),
  screenshot: label('Screenshot', '截圖'), screenshotReady: label('Screenshot download started.', '已開始下載截圖。'),

  // Items, forge and merchant
  equip: label('Equip', '裝備'), unequip: label('Unequip', '卸下'), sell: label('Sell', '出售'),
  reroll: label('Reroll', '重鑄'), reforge: label('Reforge', '洗詞綴'), upgrade: label('Upgrade', '升級詞綴'),
  repair: label('Repair all', '全部修理'), gamble: label('Gamble', '賭裝'),
  empty: label('No relics yet. The night will provide.', '尚無戰利品。永夜會有所回應。'),
  noSlot: label('Empty slot', '空裝備槽'), durability: label('Durability', '耐久'), itemLevel: label('Item level', '物品等級'),
  selectAffix: label('Select an affix', '選擇詞綴'), noAffixes: label('No affixes on this item.', '這件裝備沒有詞綴。'),
  equipBest: label('Equip best', '一鍵換裝'),
  equipBestHint: label('Compare all inventory items by the sum of affix values / their T1 maximums. Skip broken items; keep equipped items on ties. Not a build-specific recommendation.',
    '比較整個背包：各詞綴數值 ÷ 該詞綴 T1 上限後加總。略過損壞裝備，同分保留原裝；不代表特定流派最佳搭配。'),
  gambleRarities: {
    common: label('Common', '普通'), magic: label('Magic', '魔法'),
    rare: label('Rare', '稀有'), legendary: label('Legendary', '傳說'),
  },
  gambleRepeat: label('Gamble again', '再賭一次'),
  gambleWaiting: label('The relic is being revealed…', '裝備即將現形……'),
  gamblePrompt: label('An unknown relic waits in the dark.', '一件未知裝備靜候於黑暗中。'),

  // Sell filter
  saleFilter: label('Sell filter', '出售篩選'), saleFilterActive: label('Sell filter · Auto ON', '出售篩選 · 自動開'),
  saleHelp: label('Match a selected rarity AND slot, up to the item level below. No selection means no sales.',
    '稀有度、部位與等級上限須同時符合；同類可複選，未選擇則不出售。'),
  saleRarity: label('Rarity', '稀有度'), saleSlots: label('Equipment slots', '裝備部位'),
  saleRarities: {
    common: label('Common · White', '普通 · 白色'), magic: label('Magic · Blue', '魔法 · 藍色'),
    rare: label('Rare · Gold', '稀有 · 金色'), legendary: label('Legendary · Orange', '傳說 · 橘色'),
  },
  saleMaxLevel: label('Maximum item level (inclusive)', '物品等級上限（含）'),
  saleRules: label('Manual sales: sanctuary only. Auto-sell: new drops only, even with a full bag. Equipped gear is never sold. Sales cannot be undone.',
    '手動出售僅限庇護所；自動售出只處理新掉落，背包滿仍可售出。不出售身上裝備，售出後無法復原。'),
  salePreview: (count, gold) => label(`${count} matching items · ${gold} gold`, `符合 ${count} 件 · 共 ${gold} 金幣`),
  saleLevelInvalid: max => label(`Enter a whole level from 1 to ${max}; this edit is not applied.`, `請輸入 1–${max} 的整數等級；此修改尚未套用。`),
  sellMatching: count => label(`Sell matching (${count})`, `一鍵出售（${count} 件）`),
  autoSellOn: label('Auto-sell: ON', '自動售出：開啟'), autoSellOff: label('Auto-sell: OFF', '自動售出：關閉'),

  // Settings and saves
  music: label('Music', '音樂'), sfx: label('Sound effects', '音效'), volume: label('volume', '音量'),
  fullscreen: label('Fullscreen', '啟動全螢幕'), close: label('Close', '關閉'),
  mouseSkills: label('Mouse skills · follows the skill slot when changing class or form.', '滑鼠技能 · 切換職業或形態時沿用技能欄位置。'),
  leftMouse: label('Left mouse', '滑鼠左鍵'), rightMouse: label('Right mouse', '滑鼠右鍵'),
  save: label('Save', '存檔'), load: label('Load', '讀檔'), export: label('Export', '匯出'), import: label('Import', '匯入'),
  restore: label('Restore backup', '還原備份'), confirmImport: label('Back up & import', '備份並匯入'), cancel: label('Cancel', '取消'),
  saved: label('Progress saved.', '進度已保存。'), noSave: label('No saved character in this slot.', '此角色槽尚無存檔。'),
  newCharacter: label('New character', '新角色'), loaded: label('Character loaded.', '已讀取角色。'),
  confirmLoad: slot => label(`Load ${slot}? Unsaved progress will be lost and you will return to the sanctuary.`,
    `確定讀取「${slot}」？目前未儲存的進度將會遺失，並返回庇護所。`),
  exportReady: label('Save exported.', '存檔已匯出。'),
  importPreview: label('Import preview', '匯入預覽'),
  importHint: label('Preview only. Your current save will be backed up before replacement.', '目前僅預覽，確認覆蓋前會自動備份現有存檔。'),
  confirmImportSave: label('Import this save? All character slots and settings will be replaced, including clearing slots absent from the file. Current saves will be backed up first.',
    '確定匯入此存檔？所有角色槽與設定將被取代，檔案中沒有的角色槽也會清空。覆蓋前會先備份目前存檔。'),
  imported: label('Save imported; current character reloaded.', '已匯入存檔並重新載入角色。'),
  noBackup: label('No backup to restore.', '沒有可還原的備份。'),
  confirmRestore: label('Restore the backup? All character slots and settings will be replaced, and unsaved progress will be lost.',
    '確定還原備份？所有角色槽與設定將被取代，目前未儲存的進度將會遺失。'),
  restoreDone: label('Backup restored; current character reloaded.', '已還原備份並重新載入角色。'),
};
