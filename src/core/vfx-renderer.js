import { CONFIG } from '../data/config.js?v=cd5d8d477f8af273';
import { VFX, VFX_LIMITS, visualRecipe } from '../data/vfx.js?v=a956e5f214ab820d';

// Interprets the layer recipes in data/vfx.js with Canvas 2D vector primitives.
// World circles project to axis-aligned ellipses (√2 wide, 1/√2 tall) under x-y, (x+y)/2.
const TAU = Math.PI * 2;
const ISO_X = Math.SQRT2, ISO_Y = Math.SQRT1_2;
const clamp01 = value => value < 0 ? 0 : value > 1 ? 1 : value;
const easeOut = value => 1 - (1 - value) ** 3;
const easeIn = value => value * value;
const GROUND_SHAPES = new Set(['disc', 'ring', 'cracks', 'sigil', 'streak', 'trap']);

// Stable per-particle randomness so particles keep their paths between frames.
function hash(seed, index) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const rgbCache = new Map();
function rgba(hex, alpha) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const value = parseInt(hex.slice(1), 16);
    rgb = `${value >> 16 & 255},${value >> 8 & 255},${value & 255}`;
    rgbCache.set(hex, rgb);
  }
  return `rgba(${rgb},${clamp01(alpha)})`;
}

export class VfxRenderer {
  constructor(ctx, screen, contactShadow) {
    this.ctx = ctx;
    this.screen = screen;
    this.contactShadow = contactShadow;
    this.zoom = CONFIG.zoom;
  }

  // ---------- entry points ----------

  drawVisuals(visuals, time, ground) {
    for (const event of visuals) {
      const recipe = visualRecipe(event.key, event.kind, event.part, event.variant);
      if (!recipe) continue;
      const progress = clamp01(1 - event.life / (event.maxLife || 1));
      this.drawLayers(recipe.layers, event, progress, time, ground, 1, false);
    }
  }

  drawFields(effects, time, ground, follow) {
    for (const effect of effects) {
      if (!effect.vfx) continue;
      const recipe = visualRecipe(effect.vfx, 'field', effect.vfxPart);
      if (!recipe?.layers.length) continue;
      const pending = effect.delay > 0;
      const elapsed = (effect.maxLife || 0) - effect.life;
      const progress = pending ? clamp01(1 - effect.delay / (effect.windup || effect.delay))
        : clamp01(1 - effect.life / (effect.maxLife || 1));
      const fade = Math.min(1, effect.life / VFX_LIMITS.fieldFade, elapsed / VFX_LIMITS.fieldFade + 0.2);
      const at = effect.follow ? follow : effect;
      const event = { x: at.x, y: at.y, radius: effect.radius, seed: effect.seed ?? 1,
        elapsed, remaining: effect.life, angle: Math.atan2(effect.dy || 0, effect.dx || 1) };
      const layers = recipe.layers.filter(layer => !layer.phase || (layer.phase === 'pending') === pending);
      this.drawLayers(layers, event, progress, time, ground, fade, true);
    }
  }

  drawOverlays(player, point, time, ground) {
    for (const [key, buff] of Object.entries(player.buffs || {})) {
      const recipe = VFX[key]?.overlay;
      if (!recipe || !(buff.life > 0)) continue;
      const elapsed = (buff.duration || buff.life) - buff.life;
      const fade = Math.min(1, buff.life / VFX_LIMITS.overlayFade, elapsed / VFX_LIMITS.overlayFade);
      const event = { x: point.x, y: point.y, radius: recipe.radius, seed: key.length * 7919,
        elapsed, remaining: buff.life, angle: 0 };
      this.drawLayers(recipe.layers, event, 0, time, ground, fade, true);
    }
  }

  drawProjectile(shot, x, y, time) {
    const spec = VFX[shot.vfx]?.projectile;
    if (!spec) return false;
    const ctx = this.ctx, z = this.zoom, q = this.screen(x, y);
    const lift = VFX_LIMITS.projectileLift * z;
    const size = spec.size * z;
    const shadow = size * (spec.shape === 'arrow' ? 0.35 : 0.9);
    ctx.globalAlpha = VFX_LIMITS.projectileShadow;
    ctx.drawImage(this.contactShadow, q.x - shadow, q.y - shadow / 3, shadow * 2, shadow * 2 / 3);
    ctx.globalAlpha = 1;
    const angle = Math.atan2((shot.dx + shot.dy) / 2, shot.dx - shot.dy);
    ctx.save();
    ctx.translate(q.x, q.y - lift);
    ctx.rotate(angle);
    this[`projectile_${spec.shape}`](spec, size, time, shot);
    ctx.restore();
    return true;
  }

  // ---------- layer plumbing ----------

  drawLayers(layers, event, progress, time, ground, fade, looping) {
    const ctx = this.ctx;
    for (const layer of layers) {
      const isGround = layer.ground ?? GROUND_SHAPES.has(layer.shape);
      if (isGround !== ground) continue;
      const start = layer.start || 0;
      if (!looping && progress < start) continue;
      const t = looping ? progress : clamp01((progress - start) / (1 - start || 1));
      const envelope = looping ? 1 : Math.min(1, t / VFX_LIMITS.fadeIn)
        * (t < VFX_LIMITS.fadeOut ? 1 : 1 - (t - VFX_LIMITS.fadeOut) / (1 - VFX_LIMITS.fadeOut));
      const alpha = envelope * fade * (layer.alpha ?? 1);
      if (alpha <= 0) continue;
      const anchors = this.anchors(layer, event);
      const share = layer.at === 'line' ? 1 / anchors.length : 1;
      ctx.save();
      ctx.globalCompositeOperation = layer.blend || 'lighter';
      anchors.forEach((anchor, index) =>
        this[layer.shape](layer, event, anchor, t, alpha, share, time, (event.seed || 1) + index * 131, looping));
      ctx.restore();
    }
  }

  angleOf(event) {
    if (Number.isFinite(event.angle)) return event.angle;
    if (Number.isFinite(event.x2)) return Math.atan2(event.y2 - event.y, event.x2 - event.x);
    return 0;
  }

  anchors(layer, event) {
    const angle = this.angleOf(event), range = layer.range ?? event.range ?? 0;
    const target = Number.isFinite(event.x2) ? { x: event.x2, y: event.y2 } : event;
    switch (layer.at) {
      case 'target': return [target];
      case 'both': return [event, target];
      case 'points': return event.points?.length ? event.points : [event];
      case 'tip': return [{ x: event.x + Math.cos(angle) * range, y: event.y + Math.sin(angle) * range }];
      case 'line': {
        const end = Number.isFinite(event.x2) ? target
          : { x: event.x + Math.cos(angle) * range, y: event.y + Math.sin(angle) * range };
        return [0.15, 0.4, 0.65, 0.9].map(u => ({ x: event.x + (end.x - event.x) * u, y: event.y + (end.y - event.y) * u }));
      }
      default:
        if (layer.focus != null) return [{ x: event.x + Math.cos(angle) * range * layer.focus,
          y: event.y + Math.sin(angle) * range * layer.focus }];
        return [event];
    }
  }

  radiusOf(layer, event) {
    return layer.radius ?? event.radius ?? ((layer.range ?? event.range ?? 60) * 0.5);
  }

  // Particle clock: one-shot layers share the event progress; looping layers cycle per particle.
  particle(layer, t, time, seed, index, looping) {
    const offset = hash(seed, index * 7 + 3);
    if (!looping || !layer.loop) return { u: t, seed: seed + index };
    const cycle = time / layer.loop + offset;
    return { u: cycle % 1, seed: seed + index * 977 + Math.floor(cycle) * 7919 };
  }

  polar(anchor, angle, distance) {
    return this.screen(anchor.x + Math.cos(angle) * distance, anchor.y + Math.sin(angle) * distance);
  }

  // Filled strip along screen points with per-point half widths.
  ribbon(points, widths) {
    const ctx = this.ctx, left = [], right = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length * widths[i], ny = dx / length * widths[i];
      left.push(points[i].x + nx, points[i].y + ny);
      right.push(points[i].x - nx, points[i].y - ny);
    }
    ctx.beginPath();
    ctx.moveTo(left[0], left[1]);
    for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
    for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
    ctx.closePath();
    ctx.fill();
  }

  groundEllipse(center, radius) {
    this.ctx.beginPath();
    this.ctx.ellipse(center.x, center.y, radius * this.zoom * ISO_X, radius * this.zoom * ISO_Y, 0, 0, TAU);
  }

  // ---------- melee shapes ----------

  slash(layer, event, anchor, t, alpha) {
    const ctx = this.ctx, angle = this.angleOf(event);
    const range = (layer.range ?? event.range ?? 100) * (layer.reach ?? 1);
    const arc = (layer.arc ?? event.arc ?? 1.6) * (layer.arcScale ?? 1);
    const sweepTime = layer.sweep ?? 0.45, count = layer.count ?? 1, stagger = layer.stagger ?? 0;
    for (let k = 0; k < count; k++) {
      const delay = k * stagger;
      const local = clamp01((t - delay) / (1 - delay));
      if (local <= 0) continue;
      const sweep = easeOut(clamp01(local / sweepTime));
      const fade = alpha * (1 - clamp01((local - sweepTime) / (1 - sweepTime)));
      const side = (k % 2 ? -1 : 1) * (layer.reverse ? -1 : 1);
      const begin = angle - side * arc / 2;
      const head = begin + side * arc * sweep;
      const tail = begin + side * arc * Math.max(0, sweep - (layer.trail ?? 0.8));
      const radius = range * (1 - k * 0.14);
      const outer = [], inner = [], core = [];
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, a = tail + (head - tail) * u;
        const thickness = layer.width * u ** 0.8;
        outer.push(this.polar(anchor, a, radius));
        inner.push(this.polar(anchor, a, radius - thickness));
        core.push(this.polar(anchor, a, radius - thickness * 0.3));
      }
      const from = outer[0], to = outer[steps];
      const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      gradient.addColorStop(0, rgba(layer.colors[2], 0));
      gradient.addColorStop(0.55, rgba(layer.colors[1], 0.55 * fade));
      gradient.addColorStop(1, rgba(layer.colors[0], 0.95 * fade));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      outer.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      for (let i = steps; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(layer.colors[0], 0.8 * fade);
      ctx.beginPath();
      outer.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      for (let i = steps; i >= 0; i--) ctx.lineTo(core[i].x, core[i].y);
      ctx.closePath(); ctx.fill();
    }
  }

  claws(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, z = this.zoom;
    const angle = layer.around ? hash(seed, 1) * TAU : this.angleOf(event);
    const range = event.range ?? this.radiusOf(layer, event) * 2;
    const center = layer.at || layer.around ? anchor
      : { x: anchor.x + Math.cos(angle) * range * 0.55, y: anchor.y + Math.sin(angle) * range * 0.55 };
    const length = range * (layer.length ?? 0.75);
    const stroke = angle + Math.PI / 2 + (layer.tilt ?? 0);
    const sx = Math.cos(stroke), sy = Math.sin(stroke);
    const nx = Math.cos(angle), ny = Math.sin(angle);
    for (let i = 0; i < layer.count; i++) {
      const reveal = easeOut(clamp01((t - i * (layer.stagger ?? 0)) / 0.3));
      if (reveal <= 0) continue;
      const offset = (i - (layer.count - 1) / 2) * layer.gap;
      const ox = center.x + nx * offset - sx * length / 2, oy = center.y + ny * offset - sy * length / 2;
      const points = [], widths = [];
      for (let j = 0; j <= 10; j++) {
        const u = j / 10 * reveal, bend = Math.sin(u * Math.PI) * length * 0.12;
        points.push(this.screen(ox + sx * length * u + nx * bend, oy + sy * length * u + ny * bend));
        widths.push(layer.width * z * 0.5 * Math.sin(Math.PI * (j / 10)) ** 0.7);
      }
      ctx.fillStyle = rgba(layer.colors[2], 0.5 * alpha);
      this.ribbon(points, widths.map(w => w * 1.7));
      ctx.fillStyle = rgba(layer.colors[1], 0.8 * alpha);
      this.ribbon(points, widths);
      ctx.fillStyle = rgba(layer.colors[0], alpha);
      this.ribbon(points, widths.map(w => w * 0.35));
    }
  }

  jaws(layer, event, anchor, t, alpha) {
    const ctx = this.ctx, angle = this.angleOf(event), range = event.range ?? 100;
    const focus = layer.focus ?? 0.6;
    const center = this.screen(anchor.x + Math.cos(angle) * range * focus, anchor.y + Math.sin(angle) * range * focus);
    const size = layer.size * this.zoom;
    const close = layer.close ?? 0.4;
    const shut = easeOut(clamp01(t / close));
    const open = size * (0.06 + 0.55 * (1 - shut));
    // Once snapped shut, the jaws dissolve quickly so only the bite flash remains.
    alpha *= 1 - clamp01((t - close) / (1 - close)) ** 0.5;
    const screenAngle = Math.atan2((Math.sin(angle) + Math.cos(angle)) / 2, Math.cos(angle) - Math.sin(angle));
    ctx.save();
    ctx.translate(center.x, center.y - VFX_LIMITS.projectileLift * this.zoom * 0.6);
    ctx.rotate(screenAngle);
    ctx.lineCap = 'round';
    // Each jaw is a curve from the hinge (behind) to the tip (toward the target), teeth pointing inward.
    for (const side of [-1, 1]) {
      const hinge = { x: -size, y: 0 }, control = { x: -size * 0.1, y: side * open * 1.7 }, tip = { x: size * 0.6, y: side * open * 0.35 };
      const at = u => ({
        x: (1 - u) ** 2 * hinge.x + 2 * (1 - u) * u * control.x + u * u * tip.x,
        y: (1 - u) ** 2 * hinge.y + 2 * (1 - u) * u * control.y + u * u * tip.y,
      });
      for (const [color, width, opacity] of [[layer.colors[1], size * 0.24, 0.45], [layer.colors[0], size * 0.07, 1]]) {
        ctx.strokeStyle = rgba(color, opacity * alpha); ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(hinge.x, hinge.y); ctx.quadraticCurveTo(control.x, control.y, tip.x, tip.y); ctx.stroke();
      }
      ctx.fillStyle = rgba(layer.colors[0], alpha);
      for (const u of [0.42, 0.58, 0.74, 0.9]) {
        const p = at(u), q = at(u + 0.04), tooth = size * (u > 0.85 ? 0.3 : 0.2);
        ctx.beginPath();
        ctx.moveTo(p.x - size * 0.06, p.y);
        ctx.lineTo((p.x + q.x) / 2, p.y - side * tooth);
        ctx.lineTo(q.x + size * 0.06, q.y);
        ctx.closePath(); ctx.fill();
      }
    }
    if (shut > 0.9) {
      const flash = (1 - clamp01((t - (layer.close ?? 0.4)) / 0.35)) * alpha;
      ctx.strokeStyle = rgba(layer.colors[0], flash); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + 0.3;
        ctx.moveTo(size * 0.3 + Math.cos(a) * size * 0.25, Math.sin(a) * size * 0.25);
        ctx.lineTo(size * 0.3 + Math.cos(a) * size * 0.6, Math.sin(a) * size * 0.6);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  vine(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, angle = this.angleOf(event);
    const range = (event.range ?? 120) * (layer.reach ?? 1), arc = event.arc ?? 1.5;
    const sweep = easeOut(clamp01(t / (layer.sweep ?? 0.45)));
    const fade = alpha * (1 - clamp01((t - (layer.sweep ?? 0.45)) / (1 - (layer.sweep ?? 0.45))));
    const head = angle - arc / 2 + arc * sweep;
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const a = angle - arc / 2 + (head - (angle - arc / 2)) * u;
      const reach = range * (0.35 + 0.65 * Math.min(1, u * 1.6));
      const wave = Math.sin(u * Math.PI * 3 + time * 10) * (layer.wave ?? 8);
      points.push(this.polar(anchor, a, reach + wave));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const trace = (color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    };
    trace(rgba(layer.colors[2], 0.9 * fade), layer.width * this.zoom * 1.5);
    trace(rgba(layer.colors[1], fade), layer.width * this.zoom);
    trace(rgba(layer.colors[0], 0.7 * fade), layer.width * this.zoom * 0.3);
    const leaves = layer.leaves ?? 5;
    for (let i = 1; i <= leaves; i++) {
      const index = Math.min(points.length - 2, Math.floor(i / (leaves + 1) * points.length));
      const p = points[index], q = points[index + 1];
      const tangent = Math.atan2(q.y - p.y, q.x - p.x) + (i % 2 ? 0.9 : -0.9);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(tangent);
      ctx.fillStyle = rgba(layer.colors[1], fade);
      ctx.beginPath(); ctx.ellipse(layer.width * 0.9, 0, layer.width * 1.1, layer.width * 0.45, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(layer.colors[0], 0.8 * fade); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(layer.width * 1.8, 0); ctx.stroke();
      ctx.restore();
    }
  }

  hammer(layer, event, anchor, t, alpha) {
    const ctx = this.ctx, angle = this.angleOf(event), range = event.range ?? 120;
    const center = this.screen(anchor.x + Math.cos(angle) * range * 0.55, anchor.y + Math.sin(angle) * range * 0.55);
    const size = layer.size * this.zoom, drop = layer.drop ?? 0.3;
    const fall = clamp01(t / drop);
    const fade = alpha * (1 - clamp01((t - drop) / (1 - drop)) ** 1.5);
    const paint = (progress, opacity) => {
      const rotation = -1.1 * (1 - easeIn(progress));
      ctx.save();
      ctx.translate(center.x - size * 0.9, center.y - size * 0.15);
      ctx.rotate(rotation);
      const handle = ctx.createLinearGradient(0, -size * 0.08, 0, size * 0.08);
      handle.addColorStop(0, rgba('#6b4a2a', opacity)); handle.addColorStop(1, rgba('#2a1a10', opacity));
      ctx.fillStyle = handle;
      ctx.fillRect(0, -size * 0.07, size * 1.05, size * 0.14);
      const head = ctx.createLinearGradient(size * 0.9, -size * 0.45, size * 1.25, size * 0.45);
      head.addColorStop(0, rgba(layer.colors[0], opacity));
      head.addColorStop(0.5, rgba(layer.colors[1], opacity));
      head.addColorStop(1, rgba(layer.colors[2], opacity));
      ctx.fillStyle = head;
      ctx.beginPath(); ctx.roundRect(size * 0.85, -size * 0.42, size * 0.42, size * 0.84, size * 0.08); ctx.fill();
      ctx.strokeStyle = rgba(layer.colors[0], opacity); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(size * 1.06, -size * 0.3); ctx.lineTo(size * 1.06, size * 0.3); ctx.stroke();
      ctx.restore();
    };
    ctx.globalCompositeOperation = 'source-over';
    if (fall < 1) for (let ghost = 2; ghost >= 1; ghost--) paint(Math.max(0, fall - ghost * 0.18), fade * 0.2);
    paint(fall, fade);
  }

  // ---------- area shapes ----------

  ring(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, base = this.radiusOf(layer, event), center = this.screen(anchor.x, anchor.y);
    const count = layer.count ?? 1, stagger = layer.stagger ?? 0;
    for (let k = 0; k < count; k++) {
      const local = clamp01((t - k * stagger) / (1 - k * stagger || 1));
      if (count > 1 && local <= 0) continue;
      const radius = base * ((layer.from ?? 0) + ((layer.to ?? 1) - (layer.from ?? 0)) * easeOut(local));
      const fade = alpha * (count > 1 ? 1 - local : 1);
      if (radius <= 0) continue;
      if (layer.fill) {
        ctx.save(); ctx.translate(center.x, center.y); ctx.scale(1, ISO_Y / ISO_X);
        const rx = radius * this.zoom * ISO_X;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        glow.addColorStop(0, rgba(layer.colors[1], 0));
        glow.addColorStop(0.8, rgba(layer.colors[1], layer.fill * fade));
        glow.addColorStop(1, rgba(layer.colors[0], 0));
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const width = layer.width * (1 - local * 0.6);
      if (layer.dashed) { ctx.setLineDash([10, 12]); ctx.lineDashOffset = -time * (layer.spin ?? 0) * 60; }
      ctx.strokeStyle = rgba(layer.colors[1], 0.4 * fade); ctx.lineWidth = width * 2.4;
      this.groundEllipse(center, radius); ctx.stroke();
      ctx.strokeStyle = rgba(layer.colors[0], 0.9 * fade); ctx.lineWidth = Math.max(1, width * 0.6);
      this.groundEllipse(center, radius); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  disc(layer, event, anchor, t, alpha) {
    const ctx = this.ctx, center = this.screen(anchor.x, anchor.y);
    const radius = this.radiusOf(layer, event) * (layer.scale ?? 1) * (layer.grow ? 0.3 + 0.7 * easeOut(t) : 1);
    const rx = radius * this.zoom * ISO_X;
    if (rx <= 0) return;
    ctx.save(); ctx.translate(center.x, center.y); ctx.scale(1, ISO_Y / ISO_X);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    glow.addColorStop(0, rgba(layer.colors[0], 0.8 * alpha));
    glow.addColorStop(0.35, rgba(layer.colors[1], 0.55 * alpha));
    glow.addColorStop(1, rgba(layer.colors[2], 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }

  cracks(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event);
    const grow = layer.grow ? easeOut(t) : easeOut(clamp01(t / 0.3));
    const lines = [];
    if (layer.mode === 'line') {
      const angle = this.angleOf(event), range = event.range ?? radius * 2;
      for (let i = 0; i < layer.count; i++) {
        const points = [anchor];
        for (let j = 1; j <= 8; j++) {
          const along = range * j / 8 * grow, side = (hash(seed, i * 20 + j) - 0.5) * 22;
          points.push({ x: anchor.x + Math.cos(angle) * along - Math.sin(angle) * side,
            y: anchor.y + Math.sin(angle) * along + Math.cos(angle) * side });
        }
        lines.push(points);
      }
    } else {
      for (let i = 0; i < layer.count; i++) {
        const angle = (i + hash(seed, i) * 0.6) / layer.count * TAU;
        const length = radius * (layer.length ?? 1) * (0.6 + 0.4 * hash(seed, i + 50)) * grow;
        const points = [anchor];
        for (let j = 1; j <= 5; j++) {
          const a = angle + (hash(seed, i * 11 + j) - 0.5) * 0.5;
          points.push({ x: anchor.x + Math.cos(a) * length * j / 5, y: anchor.y + Math.sin(a) * length * j / 5 });
        }
        lines.push(points);
      }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const trace = (color, width, mode) => {
      ctx.globalCompositeOperation = mode; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      for (const line of lines) line.forEach((point, index) => {
        const p = this.screen(point.x, point.y);
        index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
    };
    trace(rgba('#0b0806', 0.8 * alpha), layer.width * 1.5, 'source-over');
    trace(rgba(layer.colors[1], 0.7 * alpha), layer.width, 'lighter');
    trace(rgba(layer.colors[0], 0.9 * alpha), layer.width * 0.35, 'lighter');
  }

  sigil(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, center = this.screen(anchor.x, anchor.y);
    const grow = layer.grow ? easeOut(t) : easeOut(clamp01(t / 0.2));
    const rx = this.radiusOf(layer, event) * (layer.scale ?? 1) * grow * this.zoom * ISO_X;
    if (rx <= 0) return;
    ctx.save(); ctx.translate(center.x, center.y); ctx.scale(1, ISO_Y / ISO_X); ctx.rotate(time * (layer.speed ?? 2));
    const inner = rx * 0.72, points = layer.points ?? 5;
    const trace = (color, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.moveTo(inner, 0); ctx.arc(0, 0, inner, 0, TAU);
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * TAU, r = i % 2 ? rx * 0.88 : rx * 0.8;
        ctx.moveTo(Math.cos(a) * rx * 0.97, Math.sin(a) * rx * 0.97); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const step = Math.floor(points / 2) || 1;
      for (let i = 0; i <= points; i++) {
        const a = (i * step % points) / points * TAU - Math.PI / 2;
        i ? ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner) : ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      }
      ctx.stroke();
    };
    trace(rgba(layer.colors[1], 0.4 * alpha), 5);
    trace(rgba(layer.colors[0], 0.9 * alpha), 1.4);
    ctx.restore();
  }

  streak(layer, event, anchor, t, alpha) {
    if (!Number.isFinite(event.x2)) return;
    const ctx = this.ctx, a = this.screen(event.x, event.y), b = this.screen(event.x2, event.y2);
    const angle = Math.atan2(event.y2 - event.y, event.x2 - event.x);
    const points = [], widths = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      points.push(this.screen(event.x + (event.x2 - event.x) * u, event.y + (event.y2 - event.y) * u));
      widths.push(layer.width * this.zoom * 0.5 * u ** 0.7 * (1 - t * 0.5));
    }
    const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    gradient.addColorStop(0, rgba(layer.colors[2], 0));
    gradient.addColorStop(0.6, rgba(layer.colors[1], 0.5 * alpha));
    gradient.addColorStop(1, rgba(layer.colors[0], 0.8 * alpha));
    ctx.fillStyle = gradient;
    this.ribbon(points, widths);
    const sprite = CONFIG.spriteSize * this.zoom;
    const ghosts = layer.ghosts ?? 0;
    for (let k = 1; k <= ghosts; k++) {
      const u = k / (ghosts + 1), p = points[Math.round(u * 12)];
      const opacity = alpha * u * 0.55 * (1 - t);
      const body = ctx.createRadialGradient(p.x, p.y - sprite * 0.45, 0, p.x, p.y - sprite * 0.45, sprite * 0.4);
      body.addColorStop(0, rgba(layer.colors[1], opacity));
      body.addColorStop(1, rgba(layer.colors[2], 0));
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - sprite * 0.45, sprite * 0.2, sprite * 0.4, 0, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = rgba(layer.colors[0], 0.6 * alpha); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const offset = side * layer.width * 0.8;
      const s = this.screen(event.x - Math.sin(angle) * offset, event.y + Math.cos(angle) * offset);
      const e = this.screen(event.x2 - Math.sin(angle) * offset, event.y2 + Math.cos(angle) * offset);
      ctx.moveTo(s.x + (e.x - s.x) * t * 0.6, s.y - sprite * 0.3 + (e.y - s.y) * t * 0.6); ctx.lineTo(e.x, e.y - sprite * 0.3);
    }
    ctx.stroke();
  }

  trap(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, p = this.screen(anchor.x, anchor.y), size = layer.size * this.zoom;
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createRadialGradient(p.x - size * 0.3, p.y - size * 0.2, 0, p.x, p.y, size);
    body.addColorStop(0, rgba('#6f6a66', alpha)); body.addColorStop(1, rgba('#191614', alpha));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, size, size / 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#c9c2b5', alpha);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, cx = p.x + Math.cos(a) * size, cy = p.y + Math.sin(a) * size / 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.sin(a) * 3, cy + Math.cos(a) * 1.5);
      ctx.lineTo(cx + Math.cos(a) * size * 0.35, cy + Math.sin(a) * size * 0.18 - 2);
      ctx.lineTo(cx + Math.sin(a) * 3, cy - Math.cos(a) * 1.5);
      ctx.fill();
    }
    // Blinks faster as the trap nears expiry.
    const urgency = 1 + 2 * clamp01(1 - (event.remaining ?? 1) / 3);
    const pulse = 0.5 + 0.5 * Math.sin(time * (layer.blink ?? 2) * urgency * TAU);
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(p.x, p.y - 2, 0, p.x, p.y - 2, size * 1.2);
    glow.addColorStop(0, rgba(layer.colors[0], alpha * (0.4 + 0.6 * pulse)));
    glow.addColorStop(0.3, rgba(layer.colors[1], alpha * 0.6 * pulse));
    glow.addColorStop(1, rgba(layer.colors[2], 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 2, size * 1.2, size * 0.8, 0, 0, TAU); ctx.fill();
  }

  // ---------- particles ----------

  sparks(layer, event, anchor, t, alpha, share, time, seed, looping) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const angle = this.angleOf(event), count = Math.ceil(layer.count * share);
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const { u, seed: s } = this.particle(layer, t, time, seed, i, looping);
      const direction = layer.spread != null
        ? angle + (layer.reverse ? Math.PI : 0) + (hash(s, 1) - 0.5) * layer.spread
        : hash(s, 1) * TAU;
      const origin = layer.scatter ? hash(s, 2) * layer.scatter * radius : 0;
      const originAngle = hash(s, 3) * TAU;
      const ox = anchor.x + Math.cos(originAngle) * origin, oy = anchor.y + Math.sin(originAngle) * origin;
      const travel = (layer.speed ?? 1) * radius * (0.5 + 0.5 * hash(s, 4));
      const inward = travel < 0;
      const at = value => {
        const distance = inward ? -travel * (1 - easeOut(value)) : travel * easeOut(value);
        const p = this.screen(ox + Math.cos(direction) * distance, oy + Math.sin(direction) * distance);
        p.y -= (layer.rise ?? 0) * z * 4 * value * (1 - value);
        return p;
      };
      const head = at(u), tail = at(Math.max(0, u - 0.12));
      const fade = alpha * (1 - u);
      ctx.strokeStyle = rgba(layer.colors[1], 0.5 * fade); ctx.lineWidth = (layer.width ?? 2) * 2.2;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.strokeStyle = rgba(layer.colors[0], fade); ctx.lineWidth = layer.width ?? 2;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
    }
  }

  motes(layer, event, anchor, t, alpha, share, time, seed, looping) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const count = Math.ceil(layer.count * share);
    for (let i = 0; i < count; i++) {
      const { u, seed: s } = this.particle(layer, t, time, seed, i, looping);
      const turn = hash(s, 1) * TAU + (layer.swirl ? u * layer.swirl : 0);
      const distance = Math.sqrt(hash(s, 2)) * (layer.spread ?? 1) * radius;
      const p = this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance);
      const size = (layer.size ?? 3) * z * (0.7 + 0.6 * hash(s, 3));
      const x = p.x + Math.sin(u * 6 + i) * size * 2;
      const y = p.y - (layer.rise ?? 40) * z * easeOut(u) - (layer.lift ?? 0) * z;
      const fade = alpha * Math.sin(Math.PI * u);
      if (fade <= 0) continue;
      switch (layer.kind) {
        case 'leaf': {
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(x, y); ctx.rotate(time * 3 + i);
          ctx.fillStyle = rgba(layer.colors[1], fade);
          ctx.beginPath(); ctx.ellipse(0, 0, size * 1.6, size * 0.7, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(layer.colors[2], fade); ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(-size * 1.5, 0); ctx.lineTo(size * 1.5, 0); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'snow': {
          ctx.strokeStyle = rgba(layer.colors[0], fade); ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const a = k / 3 * Math.PI + time;
            ctx.moveTo(x - Math.cos(a) * size, y - Math.sin(a) * size); ctx.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
          }
          ctx.stroke();
          break;
        }
        case 'bubble': {
          const grown = size * (0.6 + u);
          ctx.strokeStyle = rgba(layer.colors[1], fade); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, grown, 0, TAU); ctx.stroke();
          ctx.fillStyle = rgba(layer.colors[0], fade * 0.8);
          ctx.beginPath(); ctx.arc(x - grown * 0.35, y - grown * 0.35, grown * 0.25, 0, TAU); ctx.fill();
          break;
        }
        case 'star': {
          ctx.fillStyle = rgba(layer.colors[0], fade);
          ctx.save(); ctx.translate(x, y); ctx.rotate(time * 4 + i);
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const r = k % 2 ? size * 0.35 : size, a = k / 8 * TAU;
            k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0);
          }
          ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        }
        case 'ember':
          ctx.fillStyle = rgba(layer.colors[1], fade * 0.8);
          ctx.beginPath(); ctx.ellipse(x, y, size * 0.6, size * 1.4, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(layer.colors[0], fade);
          ctx.beginPath(); ctx.arc(x, y, size * 0.4, 0, TAU); ctx.fill();
          break;
        default:
          ctx.fillStyle = rgba(layer.colors[1], fade * 0.35);
          ctx.beginPath(); ctx.arc(x, y, size * 2.2, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(layer.colors[0], fade);
          ctx.beginPath(); ctx.arc(x, y, size * 0.8, 0, TAU); ctx.fill();
      }
    }
  }

  smoke(layer, event, anchor, t, alpha, share, time, seed, looping) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const count = Math.ceil(layer.count * share);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < count; i++) {
      const { u, seed: s } = this.particle(layer, t, time, seed, i, looping);
      const turn = hash(s, 1) * TAU, distance = Math.sqrt(hash(s, 2)) * (layer.spread ?? 1) * radius;
      const p = this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance);
      const size = (layer.size ?? 20) * z * (0.6 + 0.8 * u) * (0.7 + 0.5 * hash(s, 3));
      const y = p.y - (layer.rise ?? 20) * z * u - (layer.lift ?? 0) * z;
      const fade = alpha * Math.sin(Math.PI * Math.min(1, u * 1.3)) * 0.55;
      if (fade <= 0) continue;
      const puff = ctx.createRadialGradient(p.x, y, 0, p.x, y, size);
      puff.addColorStop(0, rgba(layer.colors[1], fade));
      puff.addColorStop(0.6, rgba(layer.colors[2], fade * 0.6));
      puff.addColorStop(1, rgba(layer.colors[2], 0));
      ctx.fillStyle = puff;
      ctx.beginPath(); ctx.arc(p.x, y, size, 0, TAU); ctx.fill();
    }
  }

  flame(layer, event, anchor, t, alpha, share, time, seed, looping) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const count = Math.ceil(layer.count * share);
    const grow = looping ? 1 : easeOut(clamp01(t / 0.2)) * (1 - clamp01((t - 0.55) / 0.45));
    for (let i = 0; i < count; i++) {
      const turn = hash(seed, i * 3) * TAU, distance = Math.sqrt(hash(seed, i * 3 + 1)) * (layer.spread ?? 0.6) * radius;
      const p = this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance);
      const flicker = 0.75 + 0.35 * Math.sin(time * (9 + hash(seed, i) * 6) + i * 2.1);
      const height = layer.height * z * flicker * grow * (0.7 + 0.5 * hash(seed, i * 5));
      const width = layer.width * z * (0.8 + 0.3 * hash(seed, i * 7)) * Math.max(0.3, grow);
      if (height <= 1) continue;
      const sway = Math.sin(time * 7 + i) * width * 0.45;
      const gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y - height);
      gradient.addColorStop(0, rgba(layer.colors[0], 0.9 * alpha));
      gradient.addColorStop(0.35, rgba(layer.colors[1], 0.75 * alpha));
      gradient.addColorStop(1, rgba(layer.colors[2], 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(p.x - width / 2, p.y);
      ctx.quadraticCurveTo(p.x - width * 0.6, p.y - height * 0.5, p.x + sway, p.y - height);
      ctx.quadraticCurveTo(p.x + width * 0.6, p.y - height * 0.5, p.x + width / 2, p.y);
      ctx.quadraticCurveTo(p.x, p.y + width * 0.2, p.x - width / 2, p.y);
      ctx.fill();
    }
  }

  shards(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const center = this.screen(anchor.x, anchor.y);
    const grow = easeOut(clamp01(t / 0.25)) * (1 - clamp01((t - 0.7) / 0.3));
    const list = [];
    for (let i = 0; i < layer.count; i++) {
      const turn = layer.ring ? (i + hash(seed, i) * 0.4) / layer.count * TAU : hash(seed, i) * TAU;
      const distance = (layer.ring ? 0.85 + 0.15 * hash(seed, i + 40) : Math.sqrt(hash(seed, i + 40))) * (layer.spread ?? 1) * radius;
      list.push(this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance));
    }
    list.sort((a, b) => a.y - b.y);
    list.forEach((p, i) => {
      const height = layer.height * z * (0.6 + 0.6 * hash(seed, i + 80)) * grow;
      const width = layer.width * z * (0.7 + 0.5 * hash(seed, i + 90));
      if (height <= 1) return;
      const lean = clamp01(Math.abs(p.x - center.x) / (radius * z * 2)) * Math.sign(p.x - center.x) * height * 0.35;
      ctx.globalCompositeOperation = 'source-over';
      const gradient = ctx.createLinearGradient(p.x, p.y, p.x + lean, p.y - height);
      gradient.addColorStop(0, rgba(layer.colors[2], 0.85 * alpha));
      gradient.addColorStop(0.5, rgba(layer.colors[1], 0.85 * alpha));
      gradient.addColorStop(1, rgba(layer.colors[0], 0.95 * alpha));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(p.x - width / 2, p.y);
      ctx.lineTo(p.x + lean, p.y - height);
      ctx.lineTo(p.x + width / 2, p.y);
      ctx.lineTo(p.x, p.y + width * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(layer.colors[0], 0.8 * alpha); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - width * 0.1, p.y); ctx.lineTo(p.x + lean, p.y - height); ctx.stroke();
    });
  }

  spikes(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const angle = this.angleOf(event), range = event.range ?? radius * 2;
    const list = [];
    for (let i = 0; i < layer.count; i++) {
      let x, y;
      if (layer.mode === 'line') {
        const along = range * (0.12 + 0.88 * i / Math.max(1, layer.count - 1));
        const side = (hash(seed, i) - 0.5) * (layer.jitter ?? layer.width * 1.2);
        x = anchor.x + Math.cos(angle) * along - Math.sin(angle) * side;
        y = anchor.y + Math.sin(angle) * along + Math.cos(angle) * side;
      } else {
        const turn = layer.mode === 'ring' ? i / layer.count * TAU + hash(seed, i) * 0.3 : hash(seed, i) * TAU;
        const distance = layer.mode === 'ring' ? radius * (0.9 + 0.15 * hash(seed, i + 30))
          : Math.sqrt(hash(seed, i + 30)) * (layer.spread ?? 1) * radius;
        x = anchor.x + Math.cos(turn) * distance; y = anchor.y + Math.sin(turn) * distance;
      }
      const delay = i * (layer.stagger ?? 0);
      const local = clamp01((t - delay) / (1 - delay || 1));
      const rise = easeOut(clamp01(local / 0.18));
      const sink = clamp01((local - (layer.hold ?? 0.4) - 0.18) / Math.max(0.05, 1 - (layer.hold ?? 0.4) - 0.18));
      list.push({ p: this.screen(x, y), factor: rise * (1 - sink), index: i });
    }
    list.sort((a, b) => a.p.y - b.p.y);
    ctx.globalCompositeOperation = 'source-over';
    for (const { p, factor, index } of list) {
      if (factor <= 0) continue;
      const height = layer.height * z * (0.7 + 0.5 * hash(seed, index + 60)) * factor;
      const width = layer.width * z * (0.7 + 0.4 * hash(seed, index + 70));
      const tip = { x: p.x + (hash(seed, index + 80) - 0.5) * width * 0.8, y: p.y - height };
      ctx.fillStyle = rgba('#0d0b09', 0.45 * alpha);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, width * 0.75, width * 0.3, 0, 0, TAU); ctx.fill();
      const lit = ctx.createLinearGradient(p.x - width / 2, p.y, tip.x, tip.y);
      lit.addColorStop(0, rgba(layer.colors[1], alpha)); lit.addColorStop(1, rgba(layer.colors[0], alpha));
      ctx.fillStyle = lit;
      ctx.beginPath(); ctx.moveTo(p.x - width / 2, p.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(p.x + width * 0.05, p.y + width * 0.12); ctx.closePath(); ctx.fill();
      const dark = ctx.createLinearGradient(p.x, p.y, tip.x, tip.y);
      dark.addColorStop(0, rgba(layer.colors[2], alpha)); dark.addColorStop(1, rgba(layer.colors[1], alpha));
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(p.x + width * 0.05, p.y + width * 0.12); ctx.lineTo(tip.x, tip.y); ctx.lineTo(p.x + width / 2, p.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(layer.colors[2], 0.9 * alpha); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - width / 2, p.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(p.x + width / 2, p.y); ctx.stroke();
    }
  }

  bones(layer, event, anchor, t, alpha, share, time, seed, looping) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    ctx.globalCompositeOperation = 'source-over';
    if (layer.mode === 'ring') {
      const emerge = looping ? easeOut(clamp01((event.elapsed ?? 1) / 0.25)) * clamp01((event.remaining ?? 1) / 0.3) : easeOut(clamp01(t / 0.2));
      const center = this.screen(anchor.x, anchor.y), list = [];
      for (let i = 0; i < layer.count; i++) {
        const turn = i / layer.count * TAU;
        list.push({ p: this.screen(anchor.x + Math.cos(turn) * radius, anchor.y + Math.sin(turn) * radius), i });
      }
      list.sort((a, b) => a.p.y - b.p.y);
      for (const { p, i } of list) {
        const height = layer.height * z * (0.8 + 0.4 * hash(seed, i)) * emerge;
        const width = layer.width * z;
        if (height <= 1) continue;
        const lean = (center.x - p.x) * 0.18;
        const tip = { x: p.x + lean, y: p.y - height };
        const gradient = ctx.createLinearGradient(p.x, p.y, tip.x, tip.y);
        gradient.addColorStop(0, rgba(layer.colors[2], alpha));
        gradient.addColorStop(0.4, rgba(layer.colors[1], alpha));
        gradient.addColorStop(1, rgba(layer.colors[0], alpha));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(p.x - width / 2, p.y);
        ctx.quadraticCurveTo(p.x - width * 0.6 + lean * 0.3, p.y - height * 0.6, tip.x, tip.y);
        ctx.quadraticCurveTo(p.x + width * 0.3 + lean * 0.6, p.y - height * 0.5, p.x + width / 2, p.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba(layer.colors[2], alpha); ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = rgba(layer.colors[1], alpha);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, width * 0.65, width * 0.28, 0, 0, TAU); ctx.fill();
      }
      return;
    }
    const center = this.screen(anchor.x, anchor.y), count = Math.ceil(layer.count * share);
    for (let i = 0; i < count; i++) {
      const turn = hash(seed, i) * TAU, distance = (layer.speed ?? 80) * z * easeOut(t) * (0.5 + 0.5 * hash(seed, i + 9));
      const x = center.x + Math.cos(turn) * distance, y = center.y + Math.sin(turn) * distance * 0.5
        - (layer.arc ?? 30) * z * 4 * t * (1 - t);
      const length = layer.height * z, width = layer.width * z;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 9 + hash(seed, i + 3) * TAU);
      ctx.fillStyle = rgba(layer.colors[1], alpha);
      ctx.fillRect(-length / 2, -width * 0.25, length, width * 0.5);
      ctx.fillStyle = rgba(layer.colors[0], alpha);
      for (const end of [-1, 1]) for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.arc(end * length / 2, side * width * 0.25, width * 0.32, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- energy shapes ----------

  bolt(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, z = this.zoom, lift = VFX_LIMITS.projectileLift * z;
    const frame = Math.floor(time * (layer.flicker ?? 24));
    const paths = [];
    if (layer.mode === 'strike') {
      const radius = this.radiusOf(layer, event);
      for (let i = 0; i < (layer.count ?? 1); i++) {
        const turn = hash(seed, i) * TAU, distance = Math.sqrt(hash(seed, i + 20)) * (layer.spread ?? 1) * radius;
        const ground = this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance);
        const strike = clamp01(t / 0.15 - i * 0.3);
        if (strike <= 0) continue;
        const top = { x: ground.x - layer.height * z * 0.18, y: ground.y - layer.height * z };
        paths.push([top, { x: top.x + (ground.x - top.x) * strike, y: top.y + (ground.y - top.y) * strike }]);
        if (strike >= 1) {
          ctx.fillStyle = rgba(layer.colors[1], 0.5 * alpha);
          ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 22 * z, 9 * z, 0, 0, TAU); ctx.fill();
        }
      }
    } else {
      const points = (event.points?.length ? event.points : [event]).map(point => {
        const p = this.screen(point.x, point.y);
        return { x: p.x, y: p.y - lift };
      });
      const reveal = Math.min(points.length - 1, (points.length - 1) * easeOut(clamp01(t / 0.35)));
      for (let i = 0; i < Math.ceil(reveal); i++) {
        const a = points[i], b = points[i + 1], fraction = Math.min(1, reveal - i);
        paths.push([a, { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }]);
      }
    }
    const flicker = alpha * (0.6 + 0.4 * hash(seed, frame));
    const jag = (layer.jag ?? 12) * z;
    const zigzag = (a, b, salt) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(3, Math.round(length / (jag * 1.4)));
      const nx = -(b.y - a.y) / (length || 1), ny = (b.x - a.x) / (length || 1);
      const result = [a];
      for (let i = 1; i < steps; i++) {
        const u = i / steps, offset = (hash(seed + frame * 31, salt + i) - 0.5) * 2 * jag;
        result.push({ x: a.x + (b.x - a.x) * u + nx * offset, y: a.y + (b.y - a.y) * u + ny * offset });
      }
      result.push(b);
      return result;
    };
    const lines = [];
    paths.forEach(([a, b], index) => {
      const line = zigzag(a, b, index * 50);
      lines.push(line);
      for (let k = 0; k < (layer.branches ?? 0); k++) {
        const from = line[1 + Math.floor(hash(seed + frame, index * 9 + k) * (line.length - 2))];
        const turn = hash(seed + frame, index * 13 + k) * TAU, length = jag * 3;
        lines.push(zigzag(from, { x: from.x + Math.cos(turn) * length, y: from.y + Math.sin(turn) * length }, index * 70 + k * 7));
      }
    });
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [color, width, opacity] of [[layer.colors[2], (layer.width ?? 4) * 3, 0.35], [layer.colors[1], layer.width ?? 4, 0.8], [layer.colors[0], (layer.width ?? 4) * 0.35, 1]]) {
      ctx.strokeStyle = rgba(color, opacity * flicker); ctx.lineWidth = width;
      ctx.beginPath();
      for (const line of lines) line.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
    }
  }

  tendrils(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, angle = this.angleOf(event), range = event.range ?? 150, arc = event.arc ?? 1;
    const lift = VFX_LIMITS.projectileLift * this.zoom;
    const origin = this.screen(anchor.x, anchor.y);
    origin.y -= lift;
    ctx.lineCap = 'round';
    for (let i = 0; i < layer.count; i++) {
      const a = angle + (hash(seed, i) - 0.5) * arc, reach = range * (0.55 + 0.45 * hash(seed, i + 7));
      const far = this.polar(anchor, a, reach);
      far.y -= lift * 0.6;
      const bend = (hash(seed, i + 13) - 0.5) * 80 * this.zoom;
      const control = { x: (far.x + origin.x) / 2 - (far.y - origin.y) * bend / 200, y: (far.y + origin.y) / 2 + (far.x - origin.x) * bend / 200 - 20 };
      const curve = u => ({
        x: (1 - u) ** 2 * far.x + 2 * (1 - u) * u * control.x + u * u * origin.x,
        y: (1 - u) ** 2 * far.y + 2 * (1 - u) * u * control.y + u * u * origin.y,
      });
      for (const [color, width, opacity] of [[layer.colors[1], layer.width * 2, 0.4], [layer.colors[0], layer.width * 0.5, 0.9]]) {
        ctx.strokeStyle = rgba(color, opacity * alpha); ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(far.x, far.y); ctx.quadraticCurveTo(control.x, control.y, origin.x, origin.y); ctx.stroke();
      }
      for (let j = 0; j < (layer.beads ?? 3); j++) {
        const p = curve((t * 2 + j / (layer.beads ?? 3) + hash(seed, i + 3)) % 1);
        ctx.fillStyle = rgba(layer.colors[0], alpha);
        ctx.beginPath(); ctx.arc(p.x, p.y, layer.width * 0.9, 0, TAU); ctx.fill();
      }
    }
  }

  column(layer, event, anchor, t, alpha) {
    const ctx = this.ctx, p = this.screen(anchor.x, anchor.y), z = this.zoom;
    const height = layer.height * z * (0.6 + 0.4 * easeOut(t));
    const width = layer.width * z * (1 - t * 0.6);
    const gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y - height);
    gradient.addColorStop(0, rgba(layer.colors[0], 0.85 * alpha));
    gradient.addColorStop(0.4, rgba(layer.colors[1], 0.5 * alpha));
    gradient.addColorStop(1, rgba(layer.colors[2], 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(p.x - width / 2, p.y);
    ctx.lineTo(p.x - width * 0.3, p.y - height);
    ctx.lineTo(p.x + width * 0.3, p.y - height);
    ctx.lineTo(p.x + width / 2, p.y);
    ctx.ellipse(p.x, p.y, width / 2, width / 5, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = rgba(layer.colors[0], 0.5 * alpha);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, width * 0.8, width * 0.3, 0, 0, TAU); ctx.fill();
  }

  meteor(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, z = this.zoom, radius = this.radiusOf(layer, event);
    for (let i = 0; i < (layer.count ?? 1); i++) {
      const fall = clamp01(t / (layer.fall ?? 1));
      if (fall >= 1) continue;
      const turn = hash(seed, i) * TAU, distance = layer.scatter ? Math.sqrt(hash(seed, i + 5)) * layer.scatter * radius : 0;
      const ground = this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance);
      const start = { x: ground.x - layer.drift * z, y: ground.y - layer.height * z };
      const k = easeIn(fall);
      const rock = { x: start.x + (ground.x - start.x) * k, y: start.y + (ground.y - start.y) * k };
      const size = layer.size * z * (0.8 + 0.4 * fall);
      const tailLength = Math.min(1, fall * 3) * layer.height * z * 0.45;
      const dx = start.x - ground.x, dy = start.y - ground.y, length = Math.hypot(dx, dy);
      const tail = { x: rock.x + dx / length * tailLength, y: rock.y + dy / length * tailLength };
      const trail = ctx.createLinearGradient(rock.x, rock.y, tail.x, tail.y);
      trail.addColorStop(0, rgba(layer.colors[0], 0.9 * alpha));
      trail.addColorStop(0.3, rgba(layer.colors[1], 0.6 * alpha));
      trail.addColorStop(1, rgba(layer.colors[2], 0));
      ctx.fillStyle = trail;
      this.ribbon([rock, { x: (rock.x + tail.x) / 2, y: (rock.y + tail.y) / 2 }, tail], [size, size * 0.6, 0]);
      const glow = ctx.createRadialGradient(rock.x, rock.y, 0, rock.x, rock.y, size * 2);
      glow.addColorStop(0, rgba(layer.colors[1], 0.7 * alpha)); glow.addColorStop(1, rgba(layer.colors[2], 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(rock.x, rock.y, size * 2, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const body = ctx.createRadialGradient(rock.x - size * 0.3, rock.y - size * 0.3, 0, rock.x, rock.y, size);
      body.addColorStop(0, rgba('#5a3a2a', alpha)); body.addColorStop(0.7, rgba('#22140f', alpha)); body.addColorStop(1, rgba(layer.colors[1], alpha));
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(rock.x, rock.y, size, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
    }
  }

  rain(layer, event, anchor, t, alpha, share, time, seed) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    ctx.lineCap = 'round';
    for (let i = 0; i < layer.count; i++) {
      const cycle = time * layer.rate + hash(seed, i);
      const u = cycle % 1, s = seed + i * 331 + Math.floor(cycle) * 7919;
      const turn = hash(s, 1) * TAU, distance = Math.sqrt(hash(s, 2)) * radius;
      const ground = this.screen(anchor.x + Math.cos(turn) * distance, anchor.y + Math.sin(turn) * distance);
      const fall = 1 - u;
      const tip = { x: ground.x - layer.slant * z * fall, y: ground.y - layer.height * z * fall };
      const direction = Math.atan2(layer.height, layer.slant);
      const tail = { x: tip.x - Math.cos(direction) * layer.length * z, y: tip.y - Math.sin(direction) * layer.length * z };
      const fade = alpha * Math.min(1, u * 4);
      ctx.strokeStyle = rgba(layer.colors[1], fade); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.strokeStyle = rgba(layer.colors[0], fade); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(tip.x - Math.cos(direction) * 5 * z, tip.y - Math.sin(direction) * 5 * z); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      if (u > 0.9) {
        ctx.fillStyle = rgba(layer.colors[0], alpha * (1 - u) * 6);
        ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 6 * z, 2.5 * z, 0, 0, TAU); ctx.fill();
      }
    }
  }

  vortex(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, radius = this.radiusOf(layer, event), z = this.zoom;
    const center = this.screen(anchor.x, anchor.y);
    ctx.lineCap = 'round';
    if (layer.funnel) {
      const levels = layer.funnel;
      const body = ctx.createLinearGradient(center.x, center.y, center.x, center.y - layer.height * z);
      body.addColorStop(0, rgba(layer.colors[1], 0.25 * alpha)); body.addColorStop(1, rgba(layer.colors[2], 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(center.x - radius * z * layer.from * ISO_X, center.y);
      ctx.lineTo(center.x - radius * z * layer.to * ISO_X, center.y - layer.height * z);
      ctx.lineTo(center.x + radius * z * layer.to * ISO_X, center.y - layer.height * z);
      ctx.lineTo(center.x + radius * z * layer.from * ISO_X, center.y);
      ctx.fill();
      for (let j = 0; j < levels; j++) {
        const u = j / (levels - 1), r = radius * (layer.from + (layer.to - layer.from) * u);
        const sway = Math.sin(time * 2 + j * 0.6) * radius * 0.08 * z;
        const start = time * layer.speed + j * 0.9;
        for (const [color, width, opacity] of [[layer.colors[1], layer.width * 2, 0.45], [layer.colors[0], layer.width * 0.5, 0.9]]) {
          ctx.strokeStyle = rgba(color, opacity * alpha); ctx.lineWidth = width;
          ctx.beginPath();
          ctx.ellipse(center.x + sway, center.y - layer.height * z * u, r * z * ISO_X, r * z * ISO_Y, 0, start, start + Math.PI * 1.4);
          ctx.stroke();
        }
      }
      return;
    }
    const lift = (layer.lift ?? 0) * z;
    if (layer.dashes) ctx.setLineDash([6, 9]);
    for (let k = 0; k < layer.arms; k++) {
      const base = time * layer.speed + k * TAU / layer.arms;
      const points = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14, a = base + u * layer.turns * TAU;
        const r = radius * (layer.from + (layer.to - layer.from) * u);
        const p = this.polar(anchor, a, r);
        p.y -= lift;
        points.push(p);
      }
      for (const [color, width, opacity] of [[layer.colors[1], layer.width * 2.2, 0.45], [layer.colors[0], layer.width * 0.6, 0.9]]) {
        ctx.strokeStyle = rgba(color, opacity * alpha); ctx.lineWidth = width;
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  blades(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, radius = (event.radius ?? 60) * (layer.orbit ?? 0.7), z = this.zoom;
    const size = layer.size * z, lift = size * 0.9, direction = Math.sign(layer.speed) || 1;
    for (let k = 0; k < layer.count; k++) {
      const a = time * layer.speed + k * TAU / layer.count;
      const points = [], widths = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, angle = a - direction * layer.trail * (1 - u);
        const p = this.polar(anchor, angle, radius);
        p.y -= lift;
        points.push(p); widths.push(size * 0.16 * u);
      }
      ctx.fillStyle = rgba(layer.colors[1], 0.45 * alpha);
      this.ribbon(points, widths);
      const p = points[10], q = points[9];
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.y - q.y, p.x - q.x));
      const gradient = ctx.createLinearGradient(-size / 2, 0, size / 2, 0);
      gradient.addColorStop(0, rgba(layer.colors[2], alpha)); gradient.addColorStop(1, rgba(layer.colors[0], alpha));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-size / 2, 0);
      ctx.quadraticCurveTo(0, -size * 0.32, size / 2, -size * 0.05);
      ctx.quadraticCurveTo(0, -size * 0.08, -size / 2, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  bubble(layer, event, anchor, t, alpha, share, time) {
    const ctx = this.ctx, p = this.screen(anchor.x, anchor.y);
    const sprite = CONFIG.spriteSize * this.zoom, radius = sprite * layer.size;
    const cy = p.y - sprite * 0.45;
    const fill = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, radius);
    fill.addColorStop(0, rgba(layer.colors[1], 0.04 * alpha));
    fill.addColorStop(0.75, rgba(layer.colors[1], 0.16 * alpha));
    fill.addColorStop(0.96, rgba(layer.colors[0], 0.5 * alpha));
    fill.addColorStop(1, rgba(layer.colors[0], 0));
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(p.x, cy, radius, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(layer.colors[1], 0.55 * alpha); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, cy, radius * 0.98, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(layer.colors[0], 0.85 * alpha); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const offset of [0, Math.PI]) {
      const a = time * (layer.speed ?? 1) + offset;
      ctx.beginPath(); ctx.arc(p.x, cy, radius * 0.9, a, a + 0.8); ctx.stroke();
    }
  }

  // ---------- projectiles (drawn in a frame rotated to the flight direction) ----------

  projectile_arrow(spec, size, time, shot) {
    const ctx = this.ctx, z = this.zoom, trail = spec.trail * z;
    if (spec.glow) {
      const glow = ctx.createRadialGradient(size * 0.35, 0, 0, size * 0.35, 0, size * 0.55);
      glow.addColorStop(0, rgba(spec.glow[1], 0.55)); glow.addColorStop(1, rgba(spec.glow[2], 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(size * 0.35, 0, size * 0.55, 0, TAU); ctx.fill();
    }
    const streak = ctx.createLinearGradient(-size * 0.5, 0, -size * 0.5 - trail, 0);
    streak.addColorStop(0, rgba((spec.glow ?? spec.colors)[0], 0.55)); streak.addColorStop(1, rgba((spec.glow ?? spec.colors)[1], 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = streak;
    ctx.beginPath(); ctx.moveTo(-size * 0.45, -1.6 * z); ctx.lineTo(-size * 0.5 - trail, 0); ctx.lineTo(-size * 0.45, 1.6 * z); ctx.fill();
    for (let k = 0; k < (spec.rings ?? 0); k++) {
      const x = -size * (0.8 + k * 0.9) - ((time * 18) % 1) * size * 0.9;
      ctx.strokeStyle = rgba(spec.glow[0], 0.5 * (1 - k / spec.rings)); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, 0, 2.5 * z, 7 * z * (1 + k * 0.3), 0, 0, TAU); ctx.stroke();
    }
    for (let k = 0; k < (spec.snow ?? 0); k++) {
      const x = -size * 0.6 - hash(k + 1, Math.floor(time * 12)) * trail, y = (hash(k + 7, Math.floor(time * 12)) - 0.5) * 10 * z;
      ctx.fillStyle = rgba(spec.glow[0], 0.8);
      ctx.beginPath(); ctx.arc(x, y, 1.3 * z, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba(spec.colors[2], 1); ctx.lineWidth = 3 * z;
    ctx.beginPath(); ctx.moveTo(-size * 0.55, 0); ctx.lineTo(size * 0.42, 0); ctx.stroke();
    ctx.strokeStyle = rgba(spec.colors[1], 1); ctx.lineWidth = 1.6 * z;
    ctx.beginPath(); ctx.moveTo(-size * 0.55, 0); ctx.lineTo(size * 0.42, 0); ctx.stroke();
    ctx.fillStyle = rgba(spec.head[1], 1);
    ctx.beginPath(); ctx.moveTo(size * 0.36, -3.5 * z); ctx.lineTo(size * 0.62, 0); ctx.lineTo(size * 0.36, 3.5 * z); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(spec.head[0], 1); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = rgba(spec.fletch, 1);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, 0); ctx.lineTo(-size * 0.62, side * 4.5 * z);
      ctx.lineTo(-size * 0.4, side * 4 * z); ctx.lineTo(-size * 0.34, 0); ctx.closePath(); ctx.fill();
    }
  }

  projectile_orb(spec, size, time) {
    const ctx = this.ctx, z = this.zoom;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < (spec.sparkles ?? 4); k++) {
      const u = ((time * 3 + k / spec.sparkles) % 1);
      const x = -u * spec.trail * z, y = Math.sin(time * 14 + k * 2) * size * 0.8 * (1 - u);
      ctx.fillStyle = rgba(spec.colors[0], 0.9 * (1 - u));
      ctx.beginPath(); ctx.arc(x, y, size * 0.3 * (1 - u) + 0.6, 0, TAU); ctx.fill();
    }
    const trail = ctx.createLinearGradient(0, 0, -spec.trail * z, 0);
    trail.addColorStop(0, rgba(spec.colors[1], 0.6)); trail.addColorStop(1, rgba(spec.colors[2], 0));
    ctx.fillStyle = trail;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.7); ctx.lineTo(-spec.trail * z, 0); ctx.lineTo(0, size * 0.7); ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
    glow.addColorStop(0, rgba(spec.colors[1], 0.7)); glow.addColorStop(1, rgba(spec.colors[2], 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, size * 2.4, 0, TAU); ctx.fill();
    const core = ctx.createRadialGradient(-size * 0.2, -size * 0.2, 0, 0, 0, size);
    core.addColorStop(0, rgba(spec.colors[0], 1)); core.addColorStop(1, rgba(spec.colors[1], 0.9));
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, size, 0, TAU); ctx.fill();
    for (const offset of [0, Math.PI]) {
      const a = time * 12 + offset;
      ctx.fillStyle = rgba(spec.colors[0], 0.9);
      ctx.beginPath(); ctx.arc(Math.cos(a) * size * 1.6, Math.sin(a) * size * 0.8, 1.4 * z, 0, TAU); ctx.fill();
    }
  }

  projectile_fireball(spec, size, time) {
    const ctx = this.ctx, z = this.zoom, trail = spec.trail * z;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < (spec.embers ?? 4); k++) {
      const u = (time * 2.5 + k / spec.embers) % 1;
      ctx.fillStyle = rgba(spec.colors[1], 0.9 * (1 - u));
      ctx.beginPath(); ctx.arc(-u * trail * 1.2, Math.sin(k * 3.7 + time * 9) * size * 0.9 * u, 1.6 * z, 0, TAU); ctx.fill();
    }
    const flicker = 1 + 0.12 * Math.sin(time * 40);
    const tongue = ctx.createLinearGradient(size, 0, -trail, 0);
    tongue.addColorStop(0, rgba(spec.colors[0], 0.95));
    tongue.addColorStop(0.3, rgba(spec.colors[1], 0.8));
    tongue.addColorStop(1, rgba(spec.colors[2], 0));
    ctx.fillStyle = tongue;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.quadraticCurveTo(size * 0.2, -size * 1.3 * flicker, -trail, Math.sin(time * 18) * size * 0.4);
    ctx.quadraticCurveTo(size * 0.2, size * 1.3 * flicker, size, 0);
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
    glow.addColorStop(0, rgba(spec.colors[1], 0.6)); glow.addColorStop(1, rgba(spec.colors[2], 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, size * 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(spec.colors[0], 1);
    ctx.beginPath(); ctx.arc(size * 0.15, 0, size * 0.55, 0, TAU); ctx.fill();
  }

  projectile_bone(spec, size, time) {
    const ctx = this.ctx, z = this.zoom;
    ctx.globalCompositeOperation = 'lighter';
    const trail = ctx.createLinearGradient(0, 0, -spec.trail * z, 0);
    trail.addColorStop(0, rgba(spec.glow[1], 0.5)); trail.addColorStop(1, rgba(spec.glow[2], 0));
    ctx.fillStyle = trail;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.35); ctx.lineTo(-spec.trail * z, 0); ctx.lineTo(0, size * 0.35); ctx.fill();
    ctx.rotate(time * spec.spin);
    ctx.globalCompositeOperation = 'source-over';
    const shaft = ctx.createLinearGradient(0, -size * 0.12, 0, size * 0.12);
    shaft.addColorStop(0, rgba(spec.colors[0], 1)); shaft.addColorStop(1, rgba(spec.colors[2], 1));
    ctx.fillStyle = shaft;
    ctx.fillRect(-size / 2, -size * 0.1, size, size * 0.2);
    ctx.fillStyle = rgba(spec.colors[1], 1);
    ctx.strokeStyle = rgba(spec.colors[2], 1); ctx.lineWidth = 0.8;
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.arc(end * size / 2, side * size * 0.12, size * 0.15, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
}
