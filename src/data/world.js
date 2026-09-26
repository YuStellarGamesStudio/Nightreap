// Campaign identities and combat progression live here; terrain spacing is in terrain.js.
export const DIFFICULTIES = [
  { id: 'normal', name: { en: 'Normal', zh: '普通' }, health: 1, damage: 1, reward: 1 },
  { id: 'hard', name: { en: 'Hard', zh: '困難' }, health: 2.5, damage: 1.6, reward: 1.35 },
  { id: 'nightmare', name: { en: 'Nightmare', zh: '惡夢' }, health: 6, damage: 2.6, reward: 1.8 },
  { id: 'hell', name: { en: 'Hell', zh: '地獄' }, health: 14, damage: 4, reward: 2.4 },
];

// Authored anchors locate landmarks, hazards and gates across an open landscape.
// Anchor coordinates are [column, row], not a room footprint or a walkability mask.
const map = (en, zh, anchors, monsters, landmark, extras = {}) => ({
  name: { en, zh }, anchors, monsters, landmark, ...extras,
});
const mark = (anchor, type, en, zh, dx = 0, dy = 0) => ({ anchor, type, name: { en, zh }, dx, dy });

export const ACTS = [
  {
    id: 'ember-village', name: { en: 'Ember Village', zh: '燼火村莊' }, theme: 'ember',
    maps: [
      map('Burning Village Road', '燃燒村道', [[0,1],[1,1],[2,0],[2,2],[3,2]], ['imp','hellhound','revenant','ash-archer'], mark(2,'burnt-watchtower','Burnt Watchtower','焚毀瞭望塔'), { decor: [[1,'charred-cart',-80,72],[3,'fallen-timber',70,-78]] }),
      map('Blackened Farmland', '焦黑農田', [[0,2],[1,2],[1,0],[2,1],[3,0]], ['imp','cinderling','hellhound','revenant','ash-archer'], mark(3,'ash-silo','Ashen Silo','灰燼穀倉'), { decor: [[2,'scorched-harvest',-90,60],[4,'broken-plough',55,-85]], hazards: [{anchor:2,type:'ember-pit',dx:72,dy:50}] }),
      map('Village Chapel', '村中禮拜堂', [[0,1],[1,0],[1,2],[2,1],[3,1]], ['imp','hellhound','revenant','cinderling','ash-archer'], mark(4,'ruined-chapel','Village Chapel','村中禮拜堂'), { decor: [[1,'grave',75,60],[3,'shattered-bell',-65,-80]], boss: 'pyre-warden' }),
    ],
  },
  {
    id: 'weeping-crypt', name: { en: 'Weeping Crypt', zh: '哭泣墓穴' }, theme: 'crypt',
    maps: [
      map('Bone Passage', '骸骨迴廊', [[1,0],[1,1],[0,2],[2,2],[2,3]], ['skeletal-guard','ghost','void-tendril','crypt-scarab'], mark(2,'ossuary','Hall of Bones','骸骨堂'), { decor: [[1,'bone-pillar',60,-65],[4,'cracked-sarcophagus',-65,85]] }),
      map('Burial Treasury', '陪葬寶庫', [[0,1],[1,1],[1,0],[2,0],[3,1]], ['skeletal-guard','zombie-mage','ghost','void-tendril','crypt-scarab'], mark(3,'sealed-vault','Sealed Treasury','封印寶庫'), { eliteBonus: 2, decor: [[1,'ossuary-urn',68,78],[4,'golden-casket',-80,-55]] }),
      map('Ghost Well', '幽魂深井', [[0,0],[1,0],[1,2],[2,2],[3,3]], ['ghost','grave-burrower','zombie-mage','void-tendril','crypt-scarab'], mark(2,'ghost-well','Well of Lost Souls','失魂深井'), { decor: [[1,'hanging-chains',-65,65],[4,'bone-altar',68,-72]], boss: 'mourning-wraith' }),
    ],
  },
  {
    id: 'blighted-wood', name: { en: 'Blighted Wood', zh: '腐化林地' }, theme: 'wood',
    maps: [
      map('Poison-Mist Trail', '毒霧林徑', [[0,1],[1,1],[1,2],[2,2],[3,2]], ['blighted-wolf','venom-spider','parasite','treant','spore-stalker'], mark(3,'plague-pool','Blight Pool','瘟疫池'), { hazards: [{anchor:2,type:'poison-mist',dx:62,dy:-64},{anchor:3,type:'poison-mist',dx:-95,dy:85}], decor: [[1,'rotted-stump',-70,-60]] }),
      map('Hollow of the Great Tree', '巨樹心窟', [[1,0],[0,1],[1,1],[2,1],[2,3]], ['thorn-moth','venom-spider','parasite','treant','spore-stalker'], mark(2,'heart-tree','Heart of the Great Tree','巨樹心臟'), { decor: [[1,'root-arch',-65,78],[3,'spore-lantern',65,-65]] }),
      map('Beast Nest', '獸巢深穴', [[0,2],[1,2],[1,0],[2,1],[3,1]], ['blighted-wolf','venom-spider','parasite','thorn-moth','spore-stalker'], mark(4,'wolf-den','Corrupted Den','腐化獸穴'), { decor: [[2,'gnarled-roots',-80,75],[3,'egg-cluster',78,-60]], boss: 'blight-matriarch' }),
    ],
  },
  {
    id: 'frozen-sanctuary', name: { en: 'Frozen Sanctuary', zh: '冰封聖所' }, theme: 'frost',
    maps: [
      map('Blizzard Steps', '暴雪石階', [[0,3],[1,3],[1,2],[2,1],[3,0]], ['ice-elemental','frost-knight','snow-beast','frost-bat'], mark(3,'frost-stairs','Blizzard Staircase','暴雪階梯'), { decor: [[1,'frozen-banner',-55,70],[4,'ice-statue',70,65]] }),
      map('Frozen Chapel', '凍結禮拜堂', [[0,1],[1,0],[1,2],[2,1],[3,1]], ['ice-elemental','snow-oracle','frost-knight','snow-beast','frost-bat'], mark(3,'crystal-altar','Crystal Altar','水晶祭壇'), { decor: [[2,'ice-choir',-65,70],[4,'shattered-window',75,-70]] }),
      map('Ice Abyss', '冰淵裂谷', [[0,0],[1,0],[1,1],[2,2],[3,2]], ['ice-elemental','snow-oracle','frost-knight','snow-beast','frost-bat'], mark(3,'ice-rift','Ice Rift','冰淵裂隙'), { hazards: [{anchor:2,type:'ice-rift',dx:70,dy:48},{anchor:4,type:'ice-rift',dx:-95,dy:75}], decor: [[1,'frozen-column',-65,75]], boss: 'glacial-herald' }),
    ],
  },
  {
    id: 'hell-rift', name: { en: 'Hell Rift', zh: '地獄裂口' }, theme: 'abyss',
    maps: [
      map('Lava Battlefield', '熔岩戰場', [[0,1],[1,1],[1,0],[2,1],[2,2],[3,1]], ['infernal','hellhound','cinderling','frost-knight','parasite','void-colossus'], mark(3,'war-crater','Infernal War Crater','煉獄戰坑'), { countBonus: 12, hazards: [{anchor:2,type:'lava',dx:70,dy:65},{anchor:4,type:'lava',dx:-85,dy:70}], decor: [[1,'fallen-standard',-70,-75],[5,'obsidian-spike',80,-65]] }),
      map('Void Corridor', '虛空迴廊', [[0,0],[1,0],[1,1],[2,1],[2,2],[3,2]], ['imp','ghost','infernal','skeletal-guard','blighted-wolf','ice-elemental','void-tendril','cinderling','frost-knight','grave-burrower','void-colossus'], mark(3,'void-mirror','Mirror of the Void','虛空之鏡'), { decor: [[2,'rune-slab',65,65],[5,'rift-torch',-70,-70]] }),
      map('Abyss Throne', '深淵王座', [[0,1],[1,1],[1,0],[2,1],[3,1]], ['infernal','hellhound','ice-elemental','ghost','parasite','void-tendril','void-colossus'], mark(4,'abyss-throne','Throne of the Abyss Lord','深淵之主王座'), { decor: [[1,'dark-obelisk',-85,72],[3,'fallen-crown',65,-70]], boss: 'abyss-lord' }),
    ],
  },
];

// Species identity is deliberately independent of behavior: a map can mix archetypes and families.
export const MONSTERS = {
  imp: { name: { en: 'Ash Imp', zh: '灰燼小惡魔' }, family:'demon', behavior:'melee', health:0.8, damage:0.85, speed:1.25, radius:19 },
  hellhound: { name: { en: 'Hellhound', zh: '煉獄獵犬' }, family:'demon', behavior:'charger', health:1.1, damage:1.2, speed:1.35, radius:23 },
  cinderling: { name: { en: 'Cinderling', zh: '燼火爆怪' }, family:'demon', behavior:'bomber', health:0.85, damage:1.6, speed:1.15, radius:19 },
  infernal: { name: { en: 'Infernal', zh: '煉獄魔' }, family:'demon', behavior:'caster', health:1.4, damage:1.3, speed:0.9, radius:25 },
  'ash-archer': { name: { en: 'Ashbone Archer', zh: '灰骨弓手' }, family:'demon', behavior:'ranged', health:1, damage:1.2, speed:0.95, radius:22 },
  revenant: { name: { en: 'Charred Revenant', zh: '焦骨亡者' }, family:'undead', behavior:'melee', health:1.2, damage:0.9, speed:0.85, radius:22 },
  'skeletal-guard': { name: { en: 'Skeletal Bulwark', zh: '骸骨衛士' }, family:'undead', behavior:'tank', health:2, damage:1.1, speed:0.68, radius:27 },
  ghost: { name: { en: 'Weeping Ghost', zh: '哭泣幽魂' }, family:'undead', behavior:'flying', health:0.85, damage:1.1, speed:1.3, radius:21 },
  'zombie-mage': { name: { en: 'Grave Mage', zh: '殭屍法師' }, family:'undead', behavior:'caster', health:0.9, damage:1.25, speed:0.75, radius:21 },
  'grave-burrower': { name: { en: 'Grave Burrower', zh: '墓穴潛行者' }, family:'undead', behavior:'burrower', health:1, damage:1.25, speed:1.15, radius:20 },
  'crypt-scarab': { name: { en: 'Crypt Scarab', zh: '墓穴甲蟲' }, family:'undead', behavior:'bomber', health:0.85, damage:1.6, speed:1.15, radius:19 },
  'blighted-wolf': { name: { en: 'Blighted Wolf', zh: '腐化之狼' }, family:'beast', behavior:'charger', health:0.95, damage:1.1, speed:1.45, radius:21 },
  'venom-spider': { name: { en: 'Venom Spider', zh: '劇毒蛛' }, family:'beast', behavior:'bomber', health:0.8, damage:1.25, speed:1.05, radius:20 },
  treant: { name: { en: 'Rotting Treant', zh: '腐朽樹妖' }, family:'beast', behavior:'tank', health:2.2, damage:1.15, speed:0.62, radius:30 },
  'thorn-moth': { name: { en: 'Thorn Moth', zh: '荊棘飛蛾' }, family:'beast', behavior:'flying', health:0.8, damage:1, speed:1.4, radius:19 },
  'spore-stalker': { name: { en: 'Spore Stalker', zh: '孢霧潛行者' }, family:'beast', behavior:'burrower', health:0.9, damage:1.15, speed:1.2, radius:19 },
  'ice-elemental': { name: { en: 'Ice Elemental', zh: '冰元素' }, family:'elemental', behavior:'ranged', health:1, damage:1.2, speed:0.95, radius:22 },
  'snow-beast': { name: { en: 'Snow Beast', zh: '雪原巨獸' }, family:'elemental', behavior:'tank', health:2.1, damage:1.25, speed:0.7, radius:29 },
  'snow-oracle': { name: { en: 'Snow Oracle', zh: '冰雪先知' }, family:'elemental', behavior:'caster', health:0.9, damage:1.3, speed:0.9, radius:21 },
  'frost-bat': { name: { en: 'Frostwing Bat', zh: '霜翼蝙蝠' }, family:'elemental', behavior:'flying', health:0.8, damage:1, speed:1.4, radius:19 },
  'frost-knight': { name: { en: 'Frost Knight', zh: '寒霜騎士' }, family:'undead', behavior:'ranged', health:1.5, damage:1.3, speed:0.9, radius:25 },
  parasite: { name: { en: 'Void Parasite', zh: '虛空寄生體' }, family:'void', behavior:'burrower', health:0.9, damage:1.15, speed:1.2, radius:19 },
  'void-tendril': { name: { en: 'Void Tendril', zh: '腐化觸手' }, family:'void', behavior:'ranged', health:1.1, damage:1.25, speed:0.85, radius:22 },
  'void-colossus': { name: { en: 'Void Colossus', zh: '虛空巨像' }, family:'void', behavior:'tank', health:2, damage:1.1, speed:0.68, radius:27 },
  sheep: { name: { en: 'Dread Sheep', zh: '夢魘綿羊' }, family:'sheep', behavior:'melee', health:1, damage:0.9, speed:1.15, radius:22 },
};

export const BOSSES = {
  'pyre-warden': { name:{en:'Pyre Warden',zh:'焚火守衛'}, family:'demon', behavior:'caster', health:0.55, abilities:['fanVolley','hazard'] },
  'mourning-wraith': { name:{en:'Mourning Wraith',zh:'哀哭幽魂'}, family:'undead', behavior:'flying', health:0.7, abilities:['fanVolley','summon'] },
  'blight-matriarch': { name:{en:'Blight Matriarch',zh:'腐疫女王'}, family:'beast', behavior:'burrower', health:0.8, abilities:['summon','hazard'] },
  'glacial-herald': { name:{en:'Glacial Herald',zh:'冰封先驅'}, family:'elemental', behavior:'caster', health:0.9, abilities:['fanVolley','hazard','summon'] },
  'abyss-lord': { name:{en:'Abyss Lord',zh:'深淵之主'}, family:'void', behavior:'caster', health:1, abilities:['fanVolley','summon','hazard','homing'] },
};

export const WORLD = {
  bounds: { width: 2400, height: 2400 }, spawnDistance: 260,
  sheepGateAct: 1, maxEnemies: 300, enemyCountMultiplier: 1.75,
  baseHealth: 45, baseDamage: 8, baseSpeed: 65, baseXp: 12, baseGold: 8,
  baseLevel: 1, levelsPerAct: 5, levelsPerMap: 2, levelsPerDifficulty: 14, levelsPerDepth: 2,
  mapEnemies: 23, mapEnemiesPerMap: 3, dungeonEnemies: 20, dungeonEnemiesPerDepth: 2,
  sheepEnemies: 32, sheepElites: 3, eliteBase: 1, eliteBonus: 1, eliteHealth: 5, eliteDamage: 1.5, eliteXp: 5,
  eliteSize: 1.3, eliteChanceByDepth: 0.06, eliteAffixes: ['swift','multishot','vampiric','shielded','flame'],
  eliteAffixBase: 1, eliteAffixPerDifficulty: 1, eliteAffixDepthStep: 8,
  depthHealth: 0.12, depthDamage: 0.06, depthReward: 0.08,
  bossHealth: 3600, bossDamage: 28, bossSpeed: 58, bossRadius: 58,
  bossXp: 28, bossGold: 24, bossPhaseThresholds: [0.7,0.35],
  finalAbilitiesByDifficulty: [['fanVolley'],['fanVolley','summon'],['fanVolley','summon','hazard'],['fanVolley','summon','hazard','homing']],
  firstBossGold: 500, deathGoldRate: 0.05, deathGoldCap: 80,
  sheepHealth: 60, sheepXpMultiplier: 3, sheepDropChance: 0.65,
  hazardRadius: 54, hazardDamage: 5, hazardTick: 1,
  dungeonEventChance: 0.55,
  dungeonDecor: ['sarcophagus', 'dark-shrine', 'broken-armory', 'stalagmites', 'sealed-coffer'],
  dungeonEvents: ['treasure','ambush','altar','trap'],
  dungeonMonsters: ['skeletal-guard','zombie-mage','grave-burrower','ghost','void-tendril','parasite','infernal','ice-elemental','ash-archer','crypt-scarab','spore-stalker','frost-bat','void-colossus'],
  themeDecor: {
    ember:['ember-brazier','charred-tree','broken-fence'], crypt:['bone-pillar','stone-coffin','funeral-candle'],
    wood:['spore-cluster','twisted-tree','rotted-root'], frost:['ice-crystal','frozen-pillar','snow-drift'],
    abyss:['rift-flame','obsidian-spike','void-rune'], sheep:['black-wool','moon-stone','shepherd-staff'],
  },
};
