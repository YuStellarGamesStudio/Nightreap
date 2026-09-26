// Cosmetic skill visuals. Combat only emits events keyed by skill id; nothing here affects hits.
// Each entry maps an event kind to vector layers interpreted by core/vfx-renderer.js.
// Lookup order for an event: `${kind}#${effectIndex}:${element}`, `${kind}#${effectIndex}`, `${kind}:${element}`, `${kind}`.
// An empty layer list marks an event as intentionally silent (no fallback flash).

export const VFX_LIMITS = Object.freeze({
  maxVisuals: 160, seedRange: 1e6,
  fadeIn: 0.12, fadeOut: 0.6, fieldFade: 0.35, overlayFade: 0.4,
  projectileLift: 22, projectileShadow: 0.45, enemyImpactRadius: 34,
});

const steel = ['#ffffff', '#c9d6e8', '#5d7089'];
const ember = ['#fff4d0', '#ffab4a', '#b8401f'];
const blood = ['#ffd6c8', '#d9354a', '#5a0f1e'];
const gold = ['#fff7d6', '#f3c35a', '#8a5a16'];
const earth = ['#ecd9b4', '#9a7a52', '#3e2d1f'];
const stone = ['#d3ccbf', '#7d766c', '#2b2724'];
const arcane = ['#fbeaff', '#b57bff', '#4b1f8a'];
const fire = ['#fff3c4', '#ff8a2b', '#a8260f'];
const frost = ['#ffffff', '#9fe8ff', '#2d6f9e'];
const lightning = ['#ffffff', '#c9b3ff', '#5b3cc4'];
const poison = ['#f1ffd0', '#8ee05a', '#2f5a1a'];
const necro = ['#e8ffe9', '#58e0a0', '#0f3d33'];
const bone = ['#fffaf0', '#e3d6b8', '#5f503b'];
const shadow = ['#e2d4ff', '#7a5cb8', '#140e22'];
const nature = ['#f0ffd8', '#7fcf5a', '#24502a'];
const moon = ['#ffffff', '#b9d4ff', '#3a4f86'];
const wind = ['#ffffff', '#d7f2e8', '#6c9a8c'];
const dust = ['#e9dcc4', '#8f7c62', '#3b3128'];
const smoke = ['#8a8190', '#4a4452', '#17141c'];
const heal = ['#fff0f0', '#ff6b7a', '#7a1024'];
const mana = ['#eef6ff', '#5c9cff', '#17306e'];

const fx = (life, ...layers) => ({ life, layers });
const silent = fx(0);

// Melee strikes are tinted by the attacker's family (minions use their kind as family).
const meleePalettes = {
  demon: [ember, fire], undead: [bone, necro], beast: [blood, earth], elemental: [frost, frost],
  void: [shadow, arcane], sheep: [shadow, moon], skeleton: [bone, necro], golem: [stone, earth], wolf: [moon, blood],
};
const perFamily = make => Object.fromEntries([['cast', make(steel, dust)],
  ...Object.entries(meleePalettes).map(([family, [main, accent]]) => [`cast:${family}`, make(main, accent)])]);

export const VFX = {
  // Warrior
  bash: {
    cast: fx(0.3, { shape: 'slash', colors: steel, width: 20, sweep: 0.45, trail: 0.75 },
      { shape: 'sparks', colors: steel, count: 5, speed: 0.35, spread: 0.9, start: 0.3, rise: 6, width: 1.5 }),
  },
  cleave: {
    cast: fx(0.42, { shape: 'slash', colors: ember, width: 30, sweep: 0.4, trail: 0.9, count: 2, stagger: 0.16 },
      { shape: 'slash', colors: steel, width: 10, reach: 0.96, sweep: 0.4, trail: 0.5 },
      { shape: 'sparks', colors: ember, count: 12, speed: 0.45, spread: 1.4, start: 0.25, rise: 10, width: 2 }),
  },
  charge: {
    launch: fx(0.25, { shape: 'ring', colors: dust, from: 0.2, to: 1.1, width: 5, blend: 'source-over' }),
    cast: fx(0.5, { shape: 'streak', colors: blood, width: 34, ghosts: 4 },
      { shape: 'smoke', colors: dust, count: 6, spread: 0.6, size: 16, rise: 10, at: 'origin' }),
    impact: fx(0.6, { shape: 'ring', colors: dust, from: 0.15, to: 1, width: 7, blend: 'source-over' },
      { shape: 'cracks', colors: ember, count: 7, length: 0.9, width: 3 },
      { shape: 'spikes', colors: stone, mode: 'scatter', count: 6, height: 18, width: 9, spread: 0.7, hold: 0.3 },
      { shape: 'smoke', colors: dust, count: 8, spread: 0.8, size: 22, rise: 16 }),
  },
  warcry: {
    'cast#0': fx(0.8, { shape: 'ring', colors: blood, from: 0.1, to: 1.6, width: 5, count: 3, stagger: 0.18 },
      { shape: 'motes', colors: ember, kind: 'ember', count: 16, spread: 1.2, rise: 60, size: 3 },
      { shape: 'column', colors: blood, height: 110, width: 34, at: 'origin' }),
    impact: fx(0.5, { shape: 'disc', colors: blood, scale: 1, grow: true }),
    overlay: { radius: 38, layers: [
      { shape: 'disc', colors: blood, scale: 1, alpha: 0.5 },
      { shape: 'motes', colors: ember, kind: 'ember', count: 8, spread: 1, rise: 50, size: 2.5, loop: 1.2 },
    ] },
  },
  earthslam: {
    impact: fx(0.7, { shape: 'ring', colors: earth, from: 0.1, to: 1, width: 9, blend: 'source-over' },
      { shape: 'cracks', colors: ember, count: 9, length: 1, width: 3.5 },
      { shape: 'sparks', colors: earth, count: 14, speed: 0.8, rise: 28, width: 3, blend: 'source-over' },
      { shape: 'smoke', colors: dust, count: 10, spread: 0.9, size: 26, rise: 18 }),
    field: { layers: [
      { shape: 'cracks', colors: ember, count: 9, length: 1, width: 3, phase: 'pending', grow: true },
      { shape: 'disc', colors: ember, scale: 0.8, phase: 'pending', grow: true, alpha: 0.35 },
    ] },
    pulse: fx(0.75, { shape: 'spikes', colors: stone, mode: 'ring', count: 12, height: 48, width: 24, stagger: 0.02, hold: 0.45 },
      { shape: 'spikes', colors: stone, mode: 'scatter', count: 7, height: 36, width: 20, spread: 0.6, hold: 0.45 },
      { shape: 'smoke', colors: dust, count: 10, spread: 1, size: 28, rise: 22 }),
  },
  whirlwind: {
    field: { layers: [
      { shape: 'vortex', colors: steel, arms: 3, turns: 0.35, from: 0.55, to: 1, width: 3, speed: 11, alpha: 0.55 },
      { shape: 'blades', colors: steel, count: 2, orbit: 0.72, speed: 12, size: 44, trail: 1.3 },
      { shape: 'smoke', colors: dust, count: 5, spread: 1, size: 18, rise: 8, loop: 0.8 },
    ] },
    pulse: fx(0.3, { shape: 'ring', colors: steel, from: 0.75, to: 1, width: 3 }),
  },
  ancestorhammer: {
    cast: fx(0.75, { shape: 'hammer', colors: gold, size: 70, drop: 0.3 },
      { shape: 'ring', colors: gold, from: 0.05, to: 0.75, width: 8, fill: 0.25, focus: 0.55, start: 0.3 },
      { shape: 'cracks', colors: gold, count: 8, length: 0.6, width: 3.5, focus: 0.55, start: 0.3 },
      { shape: 'sparks', colors: gold, count: 16, speed: 0.6, rise: 30, width: 2.5, focus: 0.55, start: 0.3 },
      { shape: 'column', colors: gold, height: 150, width: 40, focus: 0.55, start: 0.28 }),
  },
  bladestorm: {
    field: { layers: [
      { shape: 'vortex', colors: blood, arms: 4, turns: 0.5, from: 0.25, to: 1, width: 4, speed: 14, alpha: 0.6 },
      { shape: 'blades', colors: steel, count: 4, orbit: 0.75, speed: 15, size: 46, trail: 1.6 },
      { shape: 'blades', colors: blood, count: 3, orbit: 0.45, speed: -10, size: 32, trail: 1.1 },
      { shape: 'disc', colors: blood, scale: 1, alpha: 0.3 },
    ] },
    pulse: fx(0.32, { shape: 'ring', colors: blood, from: 0.8, to: 1.05, width: 4 },
      { shape: 'sparks', colors: steel, count: 6, speed: 0.3, scatter: 0.9, rise: 8, width: 1.5 }),
  },

  // Wizard
  missile: {
    launch: fx(0.25, { shape: 'sigil', colors: arcane, scale: 0.9, points: 5, speed: 5, at: 'origin', radius: 26 }),
    projectile: { shape: 'orb', colors: arcane, size: 7, trail: 38, sparkles: 5 },
    hit: fx(0.4, { shape: 'ring', colors: arcane, from: 0.1, to: 1, width: 3, radius: 32 },
      { shape: 'sparks', colors: arcane, count: 8, speed: 1, width: 1.5, radius: 36, rise: 10 }),
  },
  fireball: {
    launch: fx(0.3, { shape: 'flame', colors: fire, count: 3, spread: 0.3, height: 26, width: 12, at: 'origin', radius: 20 }),
    projectile: { shape: 'fireball', colors: fire, size: 11, trail: 58, embers: 6 },
    impact: fx(0.8, { shape: 'disc', colors: fire, scale: 1.05, grow: true },
      { shape: 'ring', colors: ember, from: 0.1, to: 1.05, width: 6 },
      { shape: 'flame', colors: fire, count: 9, spread: 0.7, height: 46, width: 18 },
      { shape: 'sparks', colors: ember, count: 16, speed: 0.9, rise: 34, width: 2 },
      { shape: 'smoke', colors: smoke, count: 8, spread: 0.7, size: 26, rise: 40, start: 0.25 }),
  },
  frostnova: {
    impact: fx(0.9, { shape: 'ring', colors: frost, from: 0.15, to: 1, width: 7, fill: 0.3 },
      { shape: 'shards', colors: frost, count: 18, spread: 1, height: 34, width: 9, ring: true },
      { shape: 'shards', colors: frost, count: 10, spread: 0.6, height: 22, width: 7 },
      { shape: 'motes', colors: frost, kind: 'snow', count: 22, spread: 1, rise: 40, size: 2.5 }),
  },
  lightningchain: {
    launch: fx(0.3, { shape: 'sparks', colors: lightning, count: 8, speed: 1, width: 1.5, radius: 34, at: 'origin', rise: 18 }),
    cast: fx(0.45, { shape: 'bolt', colors: lightning, mode: 'path', width: 5, jag: 14, flicker: 30, branches: 2 },
      { shape: 'sparks', colors: lightning, count: 5, speed: 1, width: 1.5, radius: 28, at: 'points', rise: 12 }),
  },
  meteor: {
    launch: fx(0.5, { shape: 'sigil', colors: fire, scale: 1, points: 6, speed: 3, at: 'origin', radius: 34 }),
    'field#0': { layers: [
      { shape: 'sigil', colors: fire, scale: 1, points: 7, speed: 1.6, phase: 'pending', grow: true, ground: true },
      { shape: 'disc', colors: fire, scale: 0.9, phase: 'pending', grow: true, alpha: 0.35 },
      { shape: 'meteor', colors: fire, height: 420, drift: 260, size: 22, phase: 'pending' },
    ] },
    'pulse#0': fx(1, { shape: 'disc', colors: fire, scale: 1.2, grow: true },
      { shape: 'column', colors: ember, height: 190, width: 70 },
      { shape: 'ring', colors: ember, from: 0.1, to: 1.2, width: 10 },
      { shape: 'cracks', colors: fire, count: 10, length: 1, width: 4 },
      { shape: 'sparks', colors: ember, count: 26, speed: 1, rise: 60, width: 2.5 },
      { shape: 'spikes', colors: stone, mode: 'scatter', count: 8, height: 22, width: 12, spread: 0.5, hold: 0.5 },
      { shape: 'smoke', colors: smoke, count: 12, spread: 0.9, size: 34, rise: 70, start: 0.2 }),
    'field#1': { layers: [
      { shape: 'disc', colors: fire, scale: 1, alpha: 0.4, phase: 'active' },
      { shape: 'flame', colors: fire, count: 14, spread: 0.9, height: 30, width: 12, phase: 'active' },
      { shape: 'motes', colors: ember, kind: 'ember', count: 14, spread: 1, rise: 60, size: 2.5, loop: 1.1, phase: 'active' },
    ] },
    'pulse#1': silent,
  },
  teleport: {
    cast: fx(0.55, { shape: 'column', colors: arcane, height: 120, width: 36, at: 'both' },
      { shape: 'streak', colors: arcane, width: 10, ghosts: 0, alpha: 0.5 },
      { shape: 'sparks', colors: arcane, count: 12, speed: 1, width: 1.5, radius: 40, at: 'both', rise: 26 },
      { shape: 'sigil', colors: arcane, scale: 1, points: 5, speed: 4, at: 'target', radius: 36 }),
  },
  energyshield: {
    cast: fx(0.6, { shape: 'ring', colors: mana, from: 1.6, to: 0.4, width: 5, radius: 60 },
      { shape: 'sparks', colors: mana, count: 12, speed: -0.8, width: 1.5, radius: 60, rise: 10 }),
    overlay: { radius: 30, layers: [
      { shape: 'bubble', colors: mana, size: 0.62, speed: 1.4 },
      { shape: 'disc', colors: mana, scale: 1, alpha: 0.35 },
    ] },
  },
  annihilation: {
    field: { layers: [
      { shape: 'disc', colors: arcane, scale: 1, alpha: 0.25 },
      { shape: 'vortex', colors: arcane, arms: 5, turns: 0.6, from: 0.2, to: 1, width: 3, speed: 2.4, alpha: 0.45 },
      { shape: 'smoke', colors: shadow, count: 10, spread: 1, size: 40, rise: 20, lift: 150, loop: 2.2 },
    ] },
    'pulse:fire': fx(0.8, { shape: 'meteor', colors: fire, height: 260, drift: 120, size: 12, count: 2, scatter: 0.8, fall: 0.35 },
      { shape: 'flame', colors: fire, count: 4, spread: 0.8, height: 34, width: 14, start: 0.35 },
      { shape: 'sparks', colors: ember, count: 10, speed: 0.25, scatter: 0.8, rise: 26, width: 2, start: 0.35 }),
    'pulse:frost': fx(0.8, { shape: 'shards', colors: frost, count: 9, spread: 0.85, height: 36, width: 11 },
      { shape: 'motes', colors: frost, kind: 'snow', count: 14, spread: 1, rise: 30, size: 2.5 }),
    'pulse:lightning': fx(0.4, { shape: 'bolt', colors: lightning, mode: 'strike', count: 3, height: 280, width: 5, jag: 18, flicker: 30, spread: 0.85 }),
  },

  // Necromancer
  bonetooth: {
    projectile: { shape: 'bone', colors: bone, size: 13, spin: 16, trail: 24, glow: necro },
    hit: fx(0.45, { shape: 'bones', colors: bone, mode: 'scatter', count: 5, height: 10, width: 4, speed: 40, arc: 22 },
      { shape: 'sparks', colors: necro, count: 6, speed: 1, width: 1.5, radius: 26 }),
  },
  raiseskeleton: {
    summon: fx(0.9, { shape: 'sigil', colors: necro, scale: 1.3, points: 5, speed: 3, radius: 30 },
      { shape: 'column', colors: necro, height: 90, width: 30 },
      { shape: 'motes', colors: necro, kind: 'dot', count: 12, spread: 1, rise: 60, size: 2.5, radius: 34 }),
  },
  corpseexplosion: {
    impact: fx(0.85, { shape: 'disc', colors: blood, scale: 1.1, grow: true },
      { shape: 'ring', colors: blood, from: 0.1, to: 1, width: 7 },
      { shape: 'bones', colors: bone, mode: 'scatter', count: 12, height: 14, width: 5, speed: 150, arc: 70 },
      { shape: 'sparks', colors: blood, count: 14, speed: 0.9, rise: 30, width: 2.5 },
      { shape: 'smoke', colors: ['#6e3a3e', '#3c1c24', '#12080c'], count: 9, spread: 0.7, size: 30, rise: 36 }),
  },
  boneprison: {
    cast: fx(0.5, { shape: 'ring', colors: necro, from: 1.2, to: 0.9, width: 4 },
      { shape: 'smoke', colors: dust, count: 8, spread: 1, size: 20, rise: 14 }),
    field: { layers: [
      { shape: 'bones', colors: bone, mode: 'ring', count: 14, height: 56, width: 13 },
      { shape: 'disc', colors: necro, scale: 1, alpha: 0.3 },
    ] },
  },
  poisonnova: {
    impact: fx(0.8, { shape: 'ring', colors: poison, from: 0.15, to: 1, width: 8, fill: 0.2 },
      { shape: 'motes', colors: poison, kind: 'bubble', count: 20, spread: 1, rise: 36, size: 4 },
      { shape: 'sparks', colors: poison, count: 12, speed: 0.9, width: 2, rise: 8 }),
    'field#1': { layers: [
      { shape: 'disc', colors: poison, scale: 1, alpha: 0.35 },
      { shape: 'smoke', colors: ['#b5e27a', '#5f9a36', '#1c3312'], count: 16, spread: 1, size: 52, rise: 14, loop: 2.4, alpha: 1 },
      { shape: 'motes', colors: poison, kind: 'bubble', count: 12, spread: 0.9, rise: 26, size: 3.5, loop: 1.4 },
    ] },
    'pulse#1': silent,
  },
  lifereap: {
    cast: fx(0.6, { shape: 'slash', colors: arcane, width: 18, sweep: 0.3, trail: 0.6, alpha: 0.6 },
      { shape: 'tendrils', colors: blood, count: 6, width: 3, beads: 3 },
      { shape: 'motes', colors: blood, kind: 'dot', count: 10, spread: 1, rise: 30, size: 3, at: 'origin', radius: 30, start: 0.4 }),
  },
  golem: {
    summon: fx(1.1, { shape: 'column', colors: earth, height: 160, width: 60 },
      { shape: 'ring', colors: dust, from: 0.2, to: 1.8, width: 8, radius: 50, blend: 'source-over' },
      { shape: 'cracks', colors: necro, count: 8, length: 1.6, width: 3, radius: 50 },
      { shape: 'spikes', colors: stone, mode: 'ring', count: 8, height: 26, width: 12, radius: 46, hold: 0.4 },
      { shape: 'smoke', colors: dust, count: 10, spread: 1.6, size: 30, rise: 26, radius: 50 }),
  },
  army: {
    launch: fx(1, { shape: 'sigil', colors: necro, scale: 1, points: 8, speed: 2.5, at: 'origin', radius: 120 },
      { shape: 'motes', colors: necro, kind: 'dot', count: 30, spread: 1, rise: 90, size: 2.5, at: 'origin', radius: 120 }),
    summon: fx(0.9, { shape: 'column', colors: necro, height: 80, width: 26 },
      { shape: 'bones', colors: bone, mode: 'scatter', count: 5, height: 10, width: 4, speed: 30, arc: 30, radius: 24 }),
    minion: fx(0.8, { shape: 'ring', colors: necro, from: 0.3, to: 1.3, width: 3, radius: 26 },
      { shape: 'motes', colors: necro, kind: 'dot', count: 6, spread: 1, rise: 40, size: 2, radius: 24 }),
  },

  // Ranger
  steadyshot: {
    projectile: { shape: 'arrow', colors: ['#fdf1d6', '#b98b55', '#4c3420'], head: ['#ffffff', '#b8c2cc'], fletch: '#c7483a', size: 30, trail: 30 },
    hit: fx(0.3, { shape: 'sparks', colors: steel, count: 6, speed: 1, width: 1.5, radius: 24, spread: 1.2, reverse: true }),
  },
  multishot: {
    launch: fx(0.3, { shape: 'slash', colors: wind, width: 8, reach: 0.12, range: 260, arc: 0.9, sweep: 0.2, trail: 1, alpha: 0.6 }),
    projectile: { shape: 'arrow', colors: ['#f1fff8', '#8fb59c', '#2f4a3a'], head: ['#ffffff', '#9fe0d0'], fletch: '#5fc9a8', size: 26, trail: 42, glow: wind },
    hit: fx(0.3, { shape: 'sparks', colors: wind, count: 6, speed: 1, width: 1.5, radius: 24, spread: 1.2, reverse: true }),
  },
  piercingshot: {
    launch: fx(0.35, { shape: 'ring', colors: wind, from: 0.3, to: 1.2, width: 4, radius: 40, count: 2, stagger: 0.2 }),
    projectile: { shape: 'arrow', colors: ['#ffffff', '#dce8f2', '#51657a'], head: ['#ffffff', '#e5f6ff'], fletch: '#f2f6ff', size: 44, trail: 110, glow: steel, rings: 3 },
    hit: fx(0.35, { shape: 'sparks', colors: steel, count: 10, speed: 1, width: 2, radius: 34, spread: 0.8, reverse: true }),
  },
  blasttrap: {
    cast: fx(0.5, { shape: 'ring', colors: fire, from: 1.4, to: 0.6, width: 3 },
      { shape: 'smoke', colors: dust, count: 4, spread: 1, size: 12, rise: 8 }),
    field: { layers: [
      { shape: 'trap', colors: fire, size: 20, blink: 2.4 },
      { shape: 'ring', colors: fire, from: 1, to: 1, width: 1.5, dashed: true, alpha: 0.4, spin: 0.8 },
    ] },
    impact: fx(0.85, { shape: 'disc', colors: fire, scale: 1.15, grow: true },
      { shape: 'flame', colors: fire, count: 10, spread: 0.7, height: 52, width: 20 },
      { shape: 'ring', colors: ember, from: 0.1, to: 1.1, width: 8 },
      { shape: 'sparks', colors: ember, count: 22, speed: 1, rise: 44, width: 2.5 },
      { shape: 'bones', colors: stone, mode: 'scatter', count: 7, height: 8, width: 5, speed: 110, arc: 60 },
      { shape: 'smoke', colors: smoke, count: 10, spread: 0.8, size: 30, rise: 50, start: 0.2 }),
  },
  shadowroll: {
    cast: fx(0.55, { shape: 'streak', colors: shadow, width: 26, ghosts: 5, blend: 'source-over', alpha: 0.75 },
      { shape: 'smoke', colors: smoke, count: 7, spread: 1, size: 18, rise: 12, at: 'both', radius: 26 }),
  },
  frostarrow: {
    projectile: { shape: 'arrow', colors: ['#ffffff', '#a9d8ea', '#2e5d78'], head: ['#ffffff', '#b8f1ff'], fletch: '#e8fbff', size: 32, trail: 60, glow: frost, snow: 5 },
    hit: fx(0.6, { shape: 'shards', colors: frost, count: 7, spread: 0.8, height: 22, width: 7, radius: 34 },
      { shape: 'ring', colors: frost, from: 0.2, to: 1, width: 4, radius: 38 },
      { shape: 'motes', colors: frost, kind: 'snow', count: 10, spread: 1, rise: 26, size: 2, radius: 34 }),
  },
  arrowrain: {
    field: { layers: [
      { shape: 'ring', colors: steel, from: 1, to: 1, width: 1.5, dashed: true, alpha: 0.45, spin: 0.4 },
      { shape: 'rain', colors: ['#ffffff', '#c7a377', '#4c3420'], count: 22, height: 240, rate: 2.6, slant: 60, length: 26, phase: 'active' },
      { shape: 'disc', colors: dust, scale: 1, alpha: 0.18, blend: 'source-over', phase: 'active' },
    ] },
    pulse: fx(0.3, { shape: 'sparks', colors: dust, count: 8, speed: 0.12, scatter: 0.9, rise: 10, width: 1.5, blend: 'source-over' }),
  },
  gale: {
    cast: fx(0.7, { shape: 'vortex', colors: wind, arms: 4, turns: 0.6, from: 0.3, to: 1.5, width: 3, speed: 8, radius: 50 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 12, spread: 1.3, rise: 50, size: 4, radius: 50 }),
    overlay: { radius: 36, layers: [
      { shape: 'vortex', colors: wind, arms: 3, turns: 0.3, from: 0.8, to: 1.1, width: 2, speed: 9, alpha: 0.6, dashes: true, lift: 26 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 5, spread: 1.1, rise: 40, size: 3.5, loop: 1.3 },
    ] },
  },

  // Druid (human)
  vinewhip: {
    cast: fx(0.4, { shape: 'vine', colors: nature, width: 7, sweep: 0.45, wave: 9, leaves: 6 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 5, spread: 0.5, rise: 20, size: 3.5, at: 'tip', start: 0.3 }),
  },
  bearform: {
    cast: fx(0.8, { shape: 'smoke', colors: ['#9a7a52', '#5a4330', '#1c140d'], count: 12, spread: 1, size: 30, rise: 40 },
      { shape: 'ring', colors: ember, from: 0.2, to: 1.3, width: 6 },
      { shape: 'motes', colors: earth, kind: 'leaf', count: 12, spread: 1.2, rise: 60, size: 4 }),
  },
  wolfform: {
    cast: fx(0.8, { shape: 'smoke', colors: ['#aab6cc', '#56607a', '#141824'], count: 12, spread: 1, size: 28, rise: 40 },
      { shape: 'ring', colors: moon, from: 0.2, to: 1.3, width: 5 },
      { shape: 'motes', colors: moon, kind: 'dot', count: 14, spread: 1.2, rise: 60, size: 2.5 }),
  },
  humanform: {
    cast: fx(0.8, { shape: 'smoke', colors: ['#9fbf88', '#4d6a3c', '#152112'], count: 10, spread: 1, size: 26, rise: 40 },
      { shape: 'ring', colors: nature, from: 0.2, to: 1.3, width: 5 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 14, spread: 1.2, rise: 60, size: 4 }),
  },
  tornado: {
    field: { layers: [
      { shape: 'vortex', colors: wind, funnel: 7, height: 120, from: 0.25, to: 1, width: 3, speed: 9, alpha: 0.75 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 10, spread: 0.9, rise: 110, size: 4, loop: 0.9, swirl: 7 },
      { shape: 'smoke', colors: dust, count: 6, spread: 0.8, size: 22, rise: 8, loop: 0.8 },
    ] },
    pulse: silent,
  },
  rejuvenation: {
    cast: fx(0.8, { shape: 'ring', colors: nature, from: 1.3, to: 0.3, width: 4, radius: 50 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 14, spread: 1.2, rise: 70, size: 4, radius: 46 },
      { shape: 'column', colors: nature, height: 100, width: 34 }),
    overlay: { radius: 32, layers: [
      { shape: 'disc', colors: nature, scale: 1, alpha: 0.4 },
      { shape: 'motes', colors: nature, kind: 'leaf', count: 6, spread: 1, rise: 50, size: 3.5, loop: 1.6 },
      { shape: 'motes', colors: heal, kind: 'dot', count: 5, spread: 0.8, rise: 60, size: 2, loop: 1.2 },
    ] },
  },
  wolves: {
    summon: fx(0.9, { shape: 'smoke', colors: ['#aab6cc', '#56607a', '#141824'], count: 8, spread: 1, size: 22, rise: 28, radius: 30 },
      { shape: 'ring', colors: moon, from: 0.2, to: 1.2, width: 4, radius: 34 },
      { shape: 'motes', colors: moon, kind: 'dot', count: 10, spread: 1, rise: 50, size: 2.5, radius: 30 }),
  },
  stonespikes: {
    cast: fx(1, { shape: 'cracks', colors: ember, mode: 'line', count: 2, width: 3 },
      { shape: 'spikes', colors: stone, mode: 'line', count: 11, height: 58, width: 28, stagger: 0.035, hold: 0.45 },
      { shape: 'smoke', colors: dust, count: 10, spread: 1, size: 22, rise: 16, at: 'line' }),
  },
  stormavatar: {
    cast: fx(0.7, { shape: 'bolt', colors: lightning, mode: 'strike', count: 4, height: 300, width: 5, jag: 20, flicker: 30, spread: 1, radius: 90 },
      { shape: 'ring', colors: lightning, from: 0.2, to: 1.5, width: 5, radius: 80 }),
    overlay: { radius: 34, layers: [
      { shape: 'disc', colors: lightning, scale: 1.2, alpha: 0.35 },
      { shape: 'sparks', colors: lightning, count: 6, speed: 0.6, rise: 40, width: 1.5, loop: 0.5 },
      { shape: 'smoke', colors: shadow, count: 4, spread: 1, size: 26, rise: 6, lift: 110, loop: 2 },
    ] },
  },
  stormStrike: {
    impact: fx(0.4, { shape: 'bolt', colors: lightning, mode: 'strike', count: 2, height: 300, width: 5, jag: 18, flicker: 30, spread: 0.8 },
      { shape: 'sparks', colors: lightning, count: 6, speed: 0.2, scatter: 0.8, rise: 16, width: 1.5 }),
  },

  // Druid (bear)
  bearslam: {
    cast: fx(0.38, { shape: 'claws', colors: earth, count: 3, gap: 16, width: 9, stagger: 0.07, tilt: 0.5 },
      { shape: 'sparks', colors: dust, count: 8, speed: 0.4, spread: 1.2, rise: 10, width: 2, start: 0.3, blend: 'source-over' }),
  },
  maul: {
    cast: fx(0.6, { shape: 'slash', colors: ember, width: 34, sweep: 0.3, trail: 0.7, reach: 0.9 },
      { shape: 'ring', colors: gold, from: 0.1, to: 0.6, width: 6, focus: 0.6, start: 0.25 },
      { shape: 'motes', colors: gold, kind: 'star', count: 5, spread: 0.3, rise: 36, size: 5, focus: 0.6, start: 0.3 }),
  },
  roar: {
    'cast#0': fx(0.8, { shape: 'ring', colors: earth, from: 0.1, to: 1.8, width: 6, count: 3, stagger: 0.16, radius: 90 },
      { shape: 'smoke', colors: dust, count: 8, spread: 1.4, size: 24, rise: 14, radius: 70 }),
    impact: fx(0.5, { shape: 'disc', colors: earth, scale: 1, grow: true, alpha: 0.5 }),
  },
  guard: {
    overlay: { radius: 34, layers: [
      { shape: 'bubble', colors: earth, size: 0.66, speed: 0.8 },
      { shape: 'disc', colors: gold, scale: 1, alpha: 0.3 },
    ] },
  },
  bearrush: {
    cast: fx(0.55, { shape: 'streak', colors: earth, width: 44, ghosts: 3 },
      { shape: 'smoke', colors: dust, count: 10, spread: 1, size: 24, rise: 12, at: 'line' }),
    impact: fx(0.7, { shape: 'ring', colors: dust, from: 0.1, to: 1, width: 9, blend: 'source-over' },
      { shape: 'claws', colors: earth, count: 4, gap: 18, width: 9, stagger: 0.04, tilt: -0.4, around: true },
      { shape: 'cracks', colors: ember, count: 8, length: 0.9, width: 3 }),
  },
  groundbreaker: {
    impact: fx(0.7, { shape: 'ring', colors: earth, from: 0.1, to: 1, width: 10, blend: 'source-over' },
      { shape: 'cracks', colors: gold, count: 10, length: 1, width: 3.5 },
      { shape: 'smoke', colors: dust, count: 10, spread: 1, size: 28, rise: 18 }),
    field: { layers: [
      { shape: 'cracks', colors: gold, count: 6, length: 1, width: 3, phase: 'pending', grow: true },
    ] },
    pulse: fx(0.8, { shape: 'spikes', colors: stone, mode: 'scatter', count: 14, height: 50, width: 24, spread: 0.9, stagger: 0.02, hold: 0.45 },
      { shape: 'sparks', colors: dust, count: 16, speed: 0.8, rise: 36, width: 3, blend: 'source-over' }),
  },

  // Druid (wolf)
  wolfbite: {
    'cast#0': fx(0.42, { shape: 'jaws', colors: moon, size: 56, close: 0.5 }),
    'cast#1': fx(0.55, { shape: 'jaws', colors: blood, size: 48, close: 0.5, start: 0.35, focus: 0.8 }),
  },
  feralpounce: {
    cast: fx(0.5, { shape: 'streak', colors: poison, width: 24, ghosts: 4 },
      { shape: 'claws', colors: poison, count: 3, gap: 14, width: 7, stagger: 0.05, tilt: 0.6, at: 'target', start: 0.4 }),
    impact: fx(0.6, { shape: 'ring', colors: poison, from: 0.1, to: 1, width: 5 },
      { shape: 'motes', colors: poison, kind: 'bubble', count: 10, spread: 1, rise: 26, size: 3 }),
  },
  packhowl: {
    'cast#0': fx(0.9, { shape: 'ring', colors: moon, from: 0.1, to: 2.2, width: 4, count: 3, stagger: 0.2, radius: 70 },
      { shape: 'motes', colors: moon, kind: 'dot', count: 16, spread: 1.4, rise: 80, size: 2.5, radius: 60 }),
    minion: fx(0.7, { shape: 'ring', colors: moon, from: 0.3, to: 1.3, width: 3, radius: 26 }),
  },
  pack: {
    overlay: { radius: 34, layers: [
      { shape: 'vortex', colors: moon, arms: 2, turns: 0.25, from: 0.9, to: 1.15, width: 2, speed: 10, alpha: 0.6, dashes: true, lift: 18 },
    ] },
  },
  rendingclaws: {
    cast: fx(0.45, { shape: 'claws', colors: poison, count: 4, gap: 20, width: 10, stagger: 0.05, tilt: -0.7 },
      { shape: 'motes', colors: poison, kind: 'bubble', count: 8, spread: 0.5, rise: 26, size: 3, at: 'tip', start: 0.3 }),
  },
  moonhunt: {
    cast: fx(0.6, { shape: 'streak', colors: moon, width: 30, ghosts: 5 },
      { shape: 'slash', colors: moon, width: 14, arc: 2.6, range: 60, sweep: 0.35, trail: 0.9, at: 'target' },
      { shape: 'motes', colors: moon, kind: 'dot', count: 12, spread: 1, rise: 40, size: 2.5, at: 'line' }),
  },

  // Affix procs and consumables
  procExplosion: {
    impact: fx(0.7, { shape: 'disc', colors: fire, scale: 1, grow: true },
      { shape: 'flame', colors: fire, count: 6, spread: 0.6, height: 38, width: 16 },
      { shape: 'ring', colors: ember, from: 0.1, to: 1, width: 6 },
      { shape: 'sparks', colors: ember, count: 12, speed: 0.9, rise: 30, width: 2 }),
  },
  procChain: {
    cast: fx(0.35, { shape: 'bolt', colors: lightning, mode: 'path', width: 4, jag: 12, flicker: 30 }),
  },
  procFrost: {
    impact: fx(0.8, { shape: 'ring', colors: frost, from: 0.15, to: 1, width: 5, fill: 0.2 },
      { shape: 'shards', colors: frost, count: 12, spread: 1, height: 26, width: 8, ring: true }),
  },
  reflect: {
    impact: fx(0.35, { shape: 'ring', colors: steel, from: 0.1, to: 0.6, width: 4 },
      { shape: 'sparks', colors: steel, count: 8, speed: 0.5, rise: 12, width: 1.5 }),
  },
  fireTrail: {
    field: { layers: [
      { shape: 'flame', colors: fire, count: 3, spread: 0.6, height: 24, width: 11 },
    ] },
    pulse: silent,
  },
  skeletonProc: {
    summon: fx(0.8, { shape: 'sigil', colors: necro, scale: 1.2, points: 5, speed: 3, radius: 26 },
      { shape: 'column', colors: necro, height: 70, width: 24 }),
  },
  potion: {
    'cast:health': fx(0.8, { shape: 'motes', colors: heal, kind: 'dot', count: 14, spread: 1, rise: 60, size: 2.5, radius: 26 },
      { shape: 'ring', colors: heal, from: 1.3, to: 0.4, width: 3, radius: 36 }),
    'cast:resource': fx(0.8, { shape: 'motes', colors: mana, kind: 'dot', count: 14, spread: 1, rise: 60, size: 2.5, radius: 26 },
      { shape: 'ring', colors: mana, from: 1.3, to: 0.4, width: 3, radius: 36 }),
  },
  cheatDeath: {
    cast: fx(1, { shape: 'column', colors: gold, height: 160, width: 50 },
      { shape: 'ring', colors: gold, from: 0.2, to: 2, width: 6, radius: 50 },
      { shape: 'motes', colors: gold, kind: 'star', count: 10, spread: 1, rise: 70, size: 4, radius: 40 }),
  },

  // Monster spells whose element has no class projectile, built from the same orb primitive.
  frostbolt: {
    launch: fx(0.3, { shape: 'motes', colors: frost, kind: 'snow', count: 8, spread: 1, rise: 20, size: 2, at: 'origin', radius: 22 }),
    projectile: { shape: 'orb', colors: frost, size: 8, trail: 44, sparkles: 5 },
    hit: fx(0.5, { shape: 'shards', colors: frost, count: 6, spread: 0.8, height: 20, width: 7, radius: 30 },
      { shape: 'ring', colors: frost, from: 0.2, to: 1, width: 3, radius: 32 }),
  },
  voidbolt: {
    launch: fx(0.3, { shape: 'sigil', colors: shadow, scale: 0.9, points: 5, speed: -4, at: 'origin', radius: 26 }),
    projectile: { shape: 'orb', colors: shadow, size: 8, trail: 46, sparkles: 5 },
    hit: fx(0.45, { shape: 'ring', colors: shadow, from: 0.1, to: 1, width: 3, radius: 32 },
      { shape: 'smoke', colors: shadow, count: 5, spread: 0.6, size: 16, rise: 14, radius: 30 }),
    impact: fx(0.8, { shape: 'ring', colors: shadow, from: 0.15, to: 1, width: 7, fill: 0.3 },
      { shape: 'vortex', colors: arcane, arms: 4, turns: 0.5, from: 0.2, to: 1, width: 3, speed: 3, alpha: 0.6 },
      { shape: 'sparks', colors: arcane, count: 12, speed: 0.9, rise: 26, width: 2 },
      { shape: 'smoke', colors: shadow, count: 8, spread: 0.8, size: 26, rise: 30, start: 0.2 }),
  },

  // Monster and minion melee; `cast` draws from the attacker toward the struck point.
  monsterSlash: perFamily((main, accent) => fx(0.3,
    { shape: 'slash', colors: main, width: 16, arc: 1.4, sweep: 0.45, trail: 0.7 },
    { shape: 'sparks', colors: accent, count: 5, speed: 0.35, spread: 0.9, start: 0.3, rise: 6, width: 1.5 })),
  monsterClaw: perFamily((main, accent) => fx(0.34,
    { shape: 'claws', colors: main, count: 3, gap: 12, width: 7, stagger: 0.05, tilt: 0.5 },
    { shape: 'sparks', colors: accent, count: 4, speed: 0.35, spread: 0.8, start: 0.3, rise: 8, width: 1.5 })),
  monsterBite: perFamily((main, accent) => fx(0.36,
    { shape: 'jaws', colors: main, size: 40, close: 0.5, focus: 0.8 },
    { shape: 'sparks', colors: accent, count: 4, speed: 0.3, spread: 0.7, start: 0.35, rise: 8, width: 1.5, at: 'target', radius: 22 })),
  monsterSlam: perFamily((main, accent) => fx(0.5,
    { shape: 'ring', colors: main, from: 0.1, to: 1, width: 6, at: 'target', radius: 44, blend: 'source-over' },
    { shape: 'cracks', colors: accent, count: 6, length: 0.8, width: 2.5, at: 'target', radius: 44 },
    { shape: 'smoke', colors: dust, count: 5, spread: 0.7, size: 18, rise: 12, at: 'target', radius: 40 })),
};

// Attack visuals keyed by attacker kind. Bows fire the ranger arrow, spellcasters use the spell of
// their element: `shot` styles projectiles, `spell` detonates on caster/bomber warning circles
// (the circle still draws first so the dodge window stays readable), `melee` picks the swing.
// Unlisted melee attackers (boss summons) default to `monsterClaw`.
export const ATTACK_VFX = {
  'ash-archer': { shot: 'steadyshot' },
  'frost-knight': { shot: 'frostbolt' },
  'ice-elemental': { shot: 'frostbolt' },
  'void-tendril': { shot: 'voidbolt' },
  infernal: { spell: 'fireball' },
  'zombie-mage': { spell: 'corpseexplosion' },
  'snow-oracle': { spell: 'frostnova' },
  cinderling: { spell: 'procExplosion' },
  'crypt-scarab': { spell: 'corpseexplosion' },
  'venom-spider': { spell: 'poisonnova' },
  imp: { melee: 'monsterClaw' },
  hellhound: { melee: 'monsterBite' },
  revenant: { melee: 'monsterSlash' },
  'skeletal-guard': { melee: 'monsterSlash' },
  ghost: { melee: 'monsterClaw' },
  'grave-burrower': { melee: 'monsterClaw' },
  'blighted-wolf': { melee: 'monsterBite' },
  treant: { melee: 'monsterSlam' },
  'thorn-moth': { melee: 'monsterClaw' },
  'spore-stalker': { melee: 'monsterClaw' },
  'snow-beast': { melee: 'monsterSlam' },
  'frost-bat': { melee: 'monsterBite' },
  parasite: { melee: 'monsterBite' },
  'void-colossus': { melee: 'monsterSlam' },
  sheep: { melee: 'monsterBite' },
  skeleton: { melee: 'monsterSlash' },
  golem: { melee: 'monsterSlam' },
  wolf: { melee: 'monsterBite' },
  'pyre-warden': { shot: 'fireball', spell: 'fireball' },
  'mourning-wraith': { shot: 'bonetooth', spell: 'corpseexplosion' },
  'glacial-herald': { shot: 'frostbolt', spell: 'frostnova' },
  'abyss-lord': { shot: 'missile', spell: 'voidbolt' },
};

export function visualRecipe(key, kind, part = 0, variant) {
  const entry = key && VFX[key];
  if (!entry) return null;
  for (const name of [`${kind}#${part}:${variant}`, `${kind}#${part}`, `${kind}:${variant}`, kind])
    if (Object.hasOwn(entry, name)) return entry[name];
  return null;
}
