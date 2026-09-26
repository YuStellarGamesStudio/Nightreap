export const CONFIG = Object.freeze({
  step: 1 / 60, maxSteps: 5, maxFrame: 0.25, aiInterval: 0.1, cellSize: 128,
  minWidth: 1280, minHeight: 720, worldSize: 2400, playerRadius: 18,
  playerSpeed: 180, playerHealth: 240, playerDamage: 24, playerResource: 100,
  cameraEase: 0.12, zoom: 0.85, spriteSize: 70, minionScale: 0.7, eliteScale: 1.35,
  groundTile: 160, renderMargin: 140, shadowWidth: 22,
  barWidth: 40, barHeight: 4, effectOpacity: 0.65, miniSize: 120,
  uiInterval: 0.12, messageDuration: 5, notificationExitDuration: 0.5, notificationLimit: 4,
  gambleSilhouetteDuration: 0.24, gambleRevealDuration: 0.44,
  saveInterval: 10, maxEnemies: 300, maxMinions: 12,
  healthPotionFraction: 0.5, resourcePotionFraction: 0.5,
  start: { x: 1200, y: 1200 },
});
export const DEFAULT_SETTINGS = Object.freeze({ musicEnabled: true, sfxEnabled: true, musicVolume: 35, sfxVolume: 60 });
export const ART = Object.freeze({
  warrior: 'characters/warrior', wizard: 'characters/wizard', necromancer: 'characters/necromancer',
  ranger: 'characters/ranger', druid: 'characters/druid',
  demon: 'creatures/demon', undead: 'creatures/skeleton', beast: 'creatures/wolf',
  elemental: 'creatures/elemental', void: 'creatures/void', sheep: 'creatures/sheep',
  skeleton: 'creatures/skeleton', wolf: 'creatures/wolf', golem: 'creatures/golem',
  bear: 'creatures/bear', boss: 'creatures/boss',
  'ash-archer': 'creatures/ash-archer', 'crypt-scarab': 'creatures/crypt-scarab',
  'spore-stalker': 'creatures/spore-stalker', 'frost-bat': 'creatures/frost-bat',
  'void-colossus': 'creatures/void-colossus',
});
// Keyed by species/boss id: shared family sprites still fall into distinct species corpses.
export const CORPSE_ART = Object.freeze(Object.fromEntries([
  'imp', 'hellhound', 'cinderling', 'infernal', 'ash-archer',
  'revenant', 'skeletal-guard', 'ghost', 'zombie-mage', 'grave-burrower', 'crypt-scarab', 'frost-knight',
  'blighted-wolf', 'venom-spider', 'treant', 'thorn-moth', 'spore-stalker',
  'ice-elemental', 'snow-beast', 'snow-oracle', 'frost-bat', 'parasite', 'void-tendril', 'void-colossus', 'sheep',
  'pyre-warden', 'mourning-wraith', 'blight-matriarch', 'glacial-herald', 'abyss-lord',
].map(kind => [kind, `corpses/${kind}`])));
