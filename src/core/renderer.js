import { ANIMATION, FLOATING_ART } from '../data/animation.js?v=ee8f6f7a081853ea';
import { CONFIG, ART } from '../data/config.js?v=0bc99017d137590b';
import { TerrainRenderer } from './terrain-renderer.js?v=fa54c2b9186e698c';
import { isExplored } from '../systems/exploration.js?v=9c05b30176a59828';

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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.rigs = new Map();
    this.motion = new WeakMap();
    this.terrain = new TerrainRenderer(this.ctx, (x, y) => this.screen(x, y));
    this.camera = { x: 0, y: 0 };
    this.width = 0; this.height = 0;
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
        return { image: await loadPart(svg), x: pivot[0], y: pivot[1], motion };
      }));
      this.rigs.set(name, parts);
    }));
  }
  drawRig(parts, x, y, size, facing, stride, floatPhase) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y - size);
    ctx.translate(size / 2, 0);
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
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.width = rect.width; this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
    const actors=[...state.area.obstacles,...(state.enemies||[]),...(state.minions||[]),p];
    actors.sort((a,b) => (a.x+a.y)-(b.x+b.y));
    for (const entity of actors) {
      if (entity.rx != null) { this.terrain.drawObstacle(entity, state.area.theme); continue; }
      if (entity !== p && !isExplored(state.area, entity.x, entity.y)) continue;
      if (entity.hp<=0) continue;
      let art=entity===p ? (p.form && p.form!=='human' ? p.form : p.classId) : ART[entity.kind] || ART[entity.family] || 'demon';
      if (entity.boss) art='boss';
      const parts=this.rigs.get(art) || this.rigs.get('demon');
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
      }
      ctx.fillStyle='#05070baa';ctx.beginPath();ctx.ellipse(point.x,point.y,CONFIG.shadowWidth*CONFIG.zoom,CONFIG.shadowHeight*CONFIG.zoom,0,0,Math.PI*2);ctx.fill();
      if(entity===p || entity.elite){ctx.strokeStyle=entity===p?'#b5ab8055':'#d4af5daa';ctx.beginPath();ctx.ellipse(point.x,point.y,size/3,size/7,0,0,Math.PI*2);ctx.stroke();}
      const floating=FLOATING_ART.has(art);
      const phase=floating?pose.floatPhase:null;
      this.drawRig(parts,point.x,point.y+(floating?Math.sin(phase)*ANIMATION.floatHeight:0),
        size,pose.facing,pose.moving?pose.phase:0,phase);
      if(entity.hp<entity.maxHp || entity.boss){ctx.fillStyle='#20151d';ctx.fillRect(point.x-CONFIG.barWidth/2,point.y-size-CONFIG.barHeight,CONFIG.barWidth,CONFIG.barHeight);ctx.fillStyle=entity===p?'#b25261':'#bd865a';ctx.fillRect(point.x-CONFIG.barWidth/2,point.y-size-CONFIG.barHeight,CONFIG.barWidth*Math.max(0,entity.hp/entity.maxHp),CONFIG.barHeight);}
      if(entity.status && Object.values(entity.status).some(v=>v>0||v?.duration>0)){ctx.strokeStyle=entity.status.frozen?'#9bdded':'#ca7657';ctx.beginPath();ctx.arc(point.x,point.y-size/2,size/2,0,Math.PI*2);ctx.stroke();}
    }
    for(const effect of state.effects || []){
      const q=this.screen(effect.x,effect.y),r=(effect.radius||CONFIG.playerRadius)*CONFIG.zoom;
      ctx.globalAlpha=Math.min(1,Math.max(0,effect.life/(effect.maxLife||effect.life||1)))*CONFIG.effectOpacity;
      ctx.strokeStyle=effect.color||'#d9ae72';ctx.fillStyle=effect.color||'#a55241';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(q.x,q.y,r,r/2,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha*=0.2;ctx.fill();ctx.globalAlpha=1;
    }
    for(const projectile of state.projectiles || []){
      const q=this.screen(projectile.x,projectile.y),r=(projectile.radius||CONFIG.barHeight)*CONFIG.zoom;
      ctx.fillStyle=projectile.side==='enemy'?'#e47563':'#d8c69a';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=CONFIG.shadowWidth;
      ctx.beginPath();ctx.ellipse(q.x,q.y-CONFIG.playerRadius,r*2,r,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    this.terrain.drawFog(state.area, this.width, this.height);
    const vignette=ctx.createRadialGradient(this.width/2,this.height/2,this.height/4,this.width/2,this.height/2,this.width/1.5);
    vignette.addColorStop(0,'#07090c00');vignette.addColorStop(1,'#050609bb');ctx.fillStyle=vignette;ctx.fillRect(0,0,this.width,this.height);
    this.minimap(state);
  }
  minimap(state){
    this.terrain.drawMinimap(state.area, state.player,
      this.width-CONFIG.miniSize-CONFIG.playerRadius, CONFIG.playerRadius, CONFIG.miniSize);
  }
}
