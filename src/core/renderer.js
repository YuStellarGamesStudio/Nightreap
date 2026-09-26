import { ANIMATION, FLOATING_ART, SHADOW } from '../data/animation.js?v=10a39b3874379afb';
import { CONFIG, ART } from '../data/config.js?v=cd5d8d477f8af273';
import { TerrainRenderer } from './terrain-renderer.js?v=f80ebf0560569bd3';
import { isExplored } from '../systems/exploration.js?v=9c05b30176a59828';
import { rasterizeVector } from './vector-image.js?v=921478b13bcc057d';
import { VfxRenderer } from './vfx-renderer.js?v=7add6bbce47fb00e';
import { visualRecipe } from '../data/vfx.js?v=22df8b0455347034';

const project = (x, y) => ({ x: x - y, y: (x + y) / 2 });

const rigMotions = new Set(['static', 'leg-left', 'leg-right', 'arm-left', 'arm-right', 'wing-left', 'wing-right', 'tail']);

async function loadPart(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function shadowTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SHADOW.textureSize;
  const context = canvas.getContext('2d');
  const radius = SHADOW.textureSize / 2;
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
  for (const [offset, alpha] of stops) gradient.addColorStop(offset, `rgba(${SHADOW.color},${alpha})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, SHADOW.textureSize, SHADOW.textureSize);
  return canvas;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.rigs = new Map();
    // Baked once: per-actor radial gradients would cost too much with 300 enemies on screen.
    this.shadows = [SHADOW.cast, SHADOW.contact].map(layer => ({ layer, texture: shadowTexture(layer.stops) }));
    this.motion = new WeakMap();
    this.terrain = new TerrainRenderer(this.ctx, (x, y) => this.screen(x, y));
    this.vfx = new VfxRenderer(this.ctx, (x, y) => this.screen(x, y), this.shadows[1].texture);
    this.camera = { x: 0, y: 0 };
    this.width = 0; this.height = 0;
    this.rasterRatio = 0;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  async load() {
    await this.terrain.load();
    await Promise.all([...new Set(Object.values(ART))].map(async name => {
      const url = `assets/${name}.svg`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
      const document = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
      const root = document.documentElement;
      const viewBox = root.getAttribute('viewBox');
      const groups = [...root.children].filter(child => child.localName === 'g' && child.hasAttribute('data-part'));
      if (root.localName !== 'svg' || !viewBox || !groups.length) throw new Error(`Missing SVG rig: ${url}`);
      const serializer = new XMLSerializer();
      const defs = [...root.children].find(child => child.localName === 'defs');
      const shared = defs ? serializer.serializeToString(defs) : '';
      const parts = await Promise.all(groups.map(async group => {
        const pivot = group.getAttribute('data-pivot')?.trim().split(/[\s,]+/).map(Number);
        const motion = group.getAttribute('data-motion');
        if (!pivot || pivot.length !== 2 || !pivot.every(Number.isFinite) || !rigMotions.has(motion))
          throw new Error(`Invalid rig part ${name}/${group.getAttribute('data-part')}`);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${shared}${serializer.serializeToString(group)}</svg>`;
        const source = await loadPart(svg);
        const size = Math.max(ANIMATION.svgSize, CONFIG.spriteSize * CONFIG.zoom * CONFIG.eliteScale ** 2);
        return { source, image: rasterizeVector(source, size * this.rasterRatio), x: pivot[0], y: pivot[1], motion };
      }));
      this.rigs.set(name, parts);
    }));
  }
  drawRig(parts, x, y, size, facing, stride, floatPhase) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y - size);
    ctx.scale(facing * size / ANIMATION.svgSize, size / ANIMATION.svgSize);
    ctx.translate(-ANIMATION.svgSize / 2, 0);
    for (const part of parts) {
      const motion = part.motion;
      let angle = 0, lift = 0;
      if (stride && (motion === 'leg-left' || motion === 'leg-right')) {
        const step = Math.sin(stride + (motion === 'leg-right' ? Math.PI : 0));
        angle = step * ANIMATION.legAngle;
        lift = Math.max(0, step) * ANIMATION.footLift;
      } else if (motion === 'arm-left' || motion === 'arm-right') {
        const step = stride ? Math.sin(stride + (motion === 'arm-left' ? Math.PI : 0)) : 0;
        angle = step * ANIMATION.armAngle + (floatPhase === null ? 0 : Math.sin(floatPhase) * ANIMATION.floatArmAngle);
      } else if (motion === 'wing-left' || motion === 'wing-right') {
        angle = Math.sin(floatPhase ?? stride) * ANIMATION.wingAngle * (motion === 'wing-right' ? -1 : 1);
      } else if (motion === 'tail') {
        angle = Math.sin(floatPhase ?? stride) * ANIMATION.tailAngle;
      }
      if (angle || lift) {
        ctx.save();
        ctx.translate(part.x, part.y - lift);
        ctx.rotate(angle);
        ctx.translate(-part.x, -part.y);
        ctx.drawImage(part.image, 0, 0, ANIMATION.svgSize, ANIMATION.svgSize);
        ctx.restore();
      } else ctx.drawImage(part.image, 0, 0, ANIMATION.svgSize, ANIMATION.svgSize);
    }
    ctx.restore();
  }
  drawShadow(x, y, size, floatPhase) {
    const ctx = this.ctx;
    const floating = floatPhase !== null;
    // Floating rigs sit lowest when sin(phase) is 1; the shadow shrinks and fades as they rise.
    const lift = floating ? (1 - Math.sin(floatPhase)) / 2 : 0;
    const scale = floating ? SHADOW.floatScale * (1 - lift * SHADOW.floatLiftShrink) : 1;
    const fade = floating ? SHADOW.floatAlpha * (1 - lift * SHADOW.floatLiftFade) : 1;
    for (const { layer, texture } of this.shadows) {
      // Airborne units have no ground contact, only the diffuse cast shadow.
      if (floating && layer === SHADOW.contact) continue;
      const rx = layer.radiusX * size * scale, ry = layer.radiusY * size * scale;
      ctx.save();
      ctx.globalAlpha = layer.alpha * fade;
      ctx.translate(x + layer.offsetX * size, y + layer.offsetY * size);
      ctx.rotate(layer.angle);
      ctx.drawImage(texture, -rx, -ry, rx * 2, ry * 2);
      ctx.restore();
    }
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = rect.width; this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (ratio !== this.rasterRatio) {
      this.rasterRatio = ratio;
      const size = Math.max(ANIMATION.svgSize, CONFIG.spriteSize * CONFIG.zoom * CONFIG.eliteScale ** 2);
      for (const parts of this.rigs.values())
        for (const part of parts) part.image = rasterizeVector(part.source, size * ratio);
      this.terrain.rasterize(ratio);
    }
  }
  toWorld(x, y) {
    const px = (x - this.width / 2) / CONFIG.zoom + this.camera.x;
    const py = (y - this.height / 2) / CONFIG.zoom + this.camera.y;
    return { x: py + px / 2, y: py - px / 2 };
  }
  screen(x, y) {
    const point = project(x, y);
    return { x: (point.x - this.camera.x) * CONFIG.zoom + this.width / 2, y: (point.y - this.camera.y) * CONFIG.zoom + this.height / 2 };
  }
  gate(point,color,label) {
    if (!point) return;
    const ctx=this.ctx,p=this.screen(point.x,point.y);
    const r=CONFIG.spriteSize*CONFIG.zoom;
    const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
    glow.addColorStop(0,color+'80'); glow.addColorStop(1,color+'00');
    ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r/2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-r/3,r/3,r/2,0,0,Math.PI*2);ctx.stroke();
    ctx.font='11px Georgia';ctx.textAlign='center';ctx.fillStyle='#d3c6af';ctx.fillText(label,p.x,p.y+r/3);
  }
  draw(state,alpha) {
    // Moving between displays can change DPR without changing the canvas's CSS size.
    if (this.rasterRatio !== (window.devicePixelRatio || 1)) this.resize();
    const ctx=this.ctx,p=state.player;
    const target=project(p.x,p.y);
    this.camera.x += (target.x-this.camera.x)*CONFIG.cameraEase;
    this.camera.y += (target.y-this.camera.y)*CONFIG.cameraEase;
    ctx.fillStyle='#0d1017';ctx.fillRect(0,0,this.width,this.height);
    this.terrain.drawGround(state.area);
    this.gate(state.area.exit,state.area.cleared?'#d5b976':'#685d70','EXIT');
    this.gate(state.area.portal,'#9174bf','DEPTH');
    this.gate(state.area.sheepPortal,'#c5aa6b','?');
    for (const hazard of state.area.hazards || []) {
      const h=this.screen(hazard.x,hazard.y);
      ctx.fillStyle='#90526430';ctx.strokeStyle='#9f786c60';ctx.beginPath();ctx.ellipse(h.x,h.y,hazard.radius*CONFIG.zoom,hazard.radius*CONFIG.zoom/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    const follow={ x:(p.prevX??p.x)+(p.x-(p.prevX??p.x))*alpha, y:(p.prevY??p.y)+(p.y-(p.prevY??p.y))*alpha };
    const effects=state.effects||[], visuals=state.visuals||[];
    this.vfx.drawFields(effects,state.time,true,follow);
    this.vfx.drawVisuals(visuals,state.time,true);
    this.vfx.drawOverlays(p,follow,state.time,true);
    const actors=[...state.area.obstacles,...(state.enemies||[]),...(state.minions||[]),p];
    actors.sort((a,b) => (a.x+a.y)-(b.x+b.y));
    for (const entity of actors) {
      if (entity.rx != null) { this.terrain.drawObstacle(entity, state.area.theme); continue; }
      if (entity !== p && !isExplored(state.area, entity.x, entity.y)) continue;
      if (entity.hp<=0) continue;
      let art=entity===p ? ART[p.form && p.form!=='human' ? p.form : p.classId] : ART[entity.kind] || ART[entity.family] || ART.demon;
      if (entity.boss) art=ART.boss;
      const parts=this.rigs.get(art) || this.rigs.get(ART.demon);
      const prevX=entity.prevX??entity.x,prevY=entity.prevY??entity.y;
      let worldX=prevX+(entity.x-prevX)*alpha,worldY=prevY+(entity.y-prevY)*alpha;
      let pose=this.motion.get(entity);
      if (state.paused && pose && pose.art===art) { worldX=pose.x;worldY=pose.y; }
      const point=this.screen(worldX,worldY);
      if (point.x < -CONFIG.renderMargin || point.x > this.width+CONFIG.renderMargin || point.y < -CONFIG.renderMargin || point.y > this.height+CONFIG.renderMargin) continue;
      const size=CONFIG.spriteSize*CONFIG.zoom*(entity.boss?CONFIG.eliteScale*CONFIG.eliteScale:entity.elite?CONFIG.eliteScale:state.minions?.includes(entity)?CONFIG.minionScale:1);
      if (!pose || pose.art!==art) {
        pose={ art, x:worldX, y:worldY, phase:0, facing:1, moving:false, floatPhase:state.time*ANIMATION.floatRate };
        this.motion.set(entity,pose);
        this.faceAttack(entity,pose,worldX,worldY,state.time);
      } else if (!state.paused) {
        const dx=worldX-pose.x,dy=worldY-pose.y;
        const distance=Math.hypot(dx,dy);
        const simulatedStep=Math.hypot(entity.x-prevX,entity.y-prevY);
        // Ignore the whole teleport interval, including its interpolated subframes.
        pose.moving=simulatedStep>ANIMATION.minMovement && simulatedStep<=ANIMATION.maxStepDistance
          && distance>ANIMATION.minMovement && distance<=ANIMATION.maxSampleDistance;
        if (pose.moving) {
          pose.phase=(pose.phase+Math.min(distance,ANIMATION.maxStepDistance)*Math.PI*2/ANIMATION.strideDistance)%(Math.PI*2);
          if (Math.abs(dx-dy)>ANIMATION.facingThreshold) pose.facing=dx-dy<0?-1:1;
        }
        pose.x=worldX;pose.y=worldY;
        pose.floatPhase=state.time*ANIMATION.floatRate;
        this.faceAttack(entity,pose,worldX,worldY,state.time);
      }
      const floating=FLOATING_ART.has(art);
      const phase=floating?pose.floatPhase:null;
      this.drawShadow(point.x,point.y,size,phase);
      if(entity===p || entity.elite){ctx.strokeStyle=entity===p?'#b5ab8055':'#d4af5daa';ctx.beginPath();ctx.ellipse(point.x,point.y,size/3,size/7,0,0,Math.PI*2);ctx.stroke();}
      this.drawRig(parts,point.x,point.y+(floating?Math.sin(phase)*ANIMATION.floatHeight:0),
        size,pose.facing,pose.moving?pose.phase:0,phase);
      if(entity.hp<entity.maxHp || entity.boss){ctx.fillStyle='#20151d';ctx.fillRect(point.x-CONFIG.barWidth/2,point.y-size-CONFIG.barHeight,CONFIG.barWidth,CONFIG.barHeight);ctx.fillStyle=entity===p?'#b25261':'#bd865a';ctx.fillRect(point.x-CONFIG.barWidth/2,point.y-size-CONFIG.barHeight,CONFIG.barWidth*Math.max(0,entity.hp/entity.maxHp),CONFIG.barHeight);}
      if(entity.status && Object.values(entity.status).some(v=>v>0||v?.duration>0)){ctx.strokeStyle=entity.status.frozen?'#9bdded':'#ca7657';ctx.beginPath();ctx.arc(point.x,point.y-size/2,size/2,0,Math.PI*2);ctx.stroke();}
    }
    for(const effect of effects){
      if (effect.vfx && visualRecipe(effect.vfx,'field',effect.vfxPart)) continue;
      const q=this.screen(effect.x,effect.y),r=(effect.radius||CONFIG.playerRadius)*CONFIG.zoom;
      ctx.globalAlpha=Math.min(1,Math.max(0,effect.life/(effect.maxLife||effect.life||1)))*CONFIG.effectOpacity;
      ctx.strokeStyle=effect.color||'#d9ae72';ctx.fillStyle=effect.color||'#a55241';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(q.x,q.y,r,r/2,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha*=0.2;ctx.fill();ctx.globalAlpha=1;
    }
    this.vfx.drawFields(effects,state.time,false,follow);
    this.vfx.drawVisuals(visuals,state.time,false);
    this.vfx.drawOverlays(p,follow,state.time,false);
    for(const projectile of state.projectiles || []){
      const px=(projectile.prevX??projectile.x)+(projectile.x-(projectile.prevX??projectile.x))*alpha;
      const py=(projectile.prevY??projectile.y)+(projectile.y-(projectile.prevY??projectile.y))*alpha;
      if (this.vfx.drawProjectile(projectile,px,py,state.time)) continue;
      const q=this.screen(px,py),r=(projectile.radius||CONFIG.barHeight)*CONFIG.zoom;
      ctx.fillStyle=projectile.side==='enemy'?'#e47563':'#d8c69a';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=CONFIG.shadowWidth;
      ctx.beginPath();ctx.ellipse(q.x,q.y-CONFIG.playerRadius,r*2,r,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    this.terrain.drawFog(state.area, this.width, this.height);
    const vignette=ctx.createRadialGradient(this.width/2,this.height/2,this.height/4,this.width/2,this.height/2,this.width/1.5);
    vignette.addColorStop(0,'#07090c00');vignette.addColorStop(1,'#050609bb');ctx.fillStyle=vignette;ctx.fillRect(0,0,this.width,this.height);
    this.minimap(state);
  }
  // Attack facing wins over movement facing briefly so strikes visibly point at their target.
  faceAttack(entity,pose,x,y,time){
    const aim=entity.attackAim;
    // A new area restarts state.time, so aims stamped in a previous map are ignored.
    if(!aim || time<aim.time || time-aim.time>ANIMATION.attackFacingHold) return;
    const sideways=(aim.x-x)-(aim.y-y);
    if(Math.abs(sideways)>ANIMATION.facingThreshold) pose.facing=sideways<0?-1:1;
  }
  minimap(state){
    this.terrain.drawMinimap(state.area, state.player,
      this.width-CONFIG.miniSize-CONFIG.playerRadius, CONFIG.playerRadius, CONFIG.miniSize);
  }
}
