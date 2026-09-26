import { CONFIG, ART } from '../data/config.js';

const project = (x, y) => ({ x: x - y, y: (x + y) / 2 });

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.images = new Map();
    this.camera = { x: 0, y: 0 };
    this.width = 0; this.height = 0;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  async load() {
    await Promise.all([...new Set(Object.values(ART))].map(async name => {
      const image = new Image();
      image.src = `assets/${name}.svg`;
      await image.decode();
      this.images.set(name, image);
    }));
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
  floor(rect, path = false) {
    const ctx = this.ctx;
    const corners = [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]].map(([x,y]) => this.screen(x,y));
    ctx.beginPath(); corners.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.closePath();
    const gradient = ctx.createLinearGradient(corners[0].x,corners[0].y,corners[2].x,corners[2].y);
    gradient.addColorStop(0,path?'#262530':'#302c32'); gradient.addColorStop(0.5,'#1a1d25'); gradient.addColorStop(1,'#28252c');
    ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = '#50433e'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.strokeStyle = '#77706818';
    for (let x=rect.x; x<rect.x+rect.w; x+=CONFIG.groundTile) {
      const a=this.screen(x,rect.y),b=this.screen(x,rect.y+rect.h);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    for (let y=rect.y; y<rect.y+rect.h; y+=CONFIG.groundTile) {
      const a=this.screen(rect.x,y),b=this.screen(rect.x+rect.w,y);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.restore();
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
    for (const path of state.area.paths || []) this.floor(path,true);
    for (const room of state.area.rooms || []) this.floor(room);
    this.gate(state.area.exit,state.area.cleared?'#d5b976':'#685d70','EXIT');
    this.gate(state.area.portal,'#9174bf','DEPTH');
    this.gate(state.area.sheepPortal,'#c5aa6b','?');
    for (const hazard of state.area.hazards || []) {
      const h=this.screen(hazard.x,hazard.y);
      ctx.fillStyle='#90526430';ctx.strokeStyle='#9f786c60';ctx.beginPath();ctx.ellipse(h.x,h.y,hazard.radius*CONFIG.zoom,hazard.radius*CONFIG.zoom/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    const actors=[...(state.enemies||[]),...(state.minions||[]),p];
    actors.sort((a,b) => (a.x+a.y)-(b.x+b.y));
    for (const entity of actors) {
      if (entity.hp<=0) continue;
      const point=this.screen((entity.prevX??entity.x)+(entity.x-(entity.prevX??entity.x))*alpha,(entity.prevY??entity.y)+(entity.y-(entity.prevY??entity.y))*alpha);
      if (point.x < -CONFIG.renderMargin || point.x > this.width+CONFIG.renderMargin || point.y < -CONFIG.renderMargin || point.y > this.height+CONFIG.renderMargin) continue;
      let art=entity===p ? (p.form && p.form!=='human' ? p.form : p.classId) : ART[entity.kind] || ART[entity.family] || 'demon';
      if (entity.boss) art='boss';
      const image=this.images.get(art)||this.images.get('demon');
      const size=CONFIG.spriteSize*CONFIG.zoom*(entity.boss?CONFIG.eliteScale*CONFIG.eliteScale:entity.elite?CONFIG.eliteScale:state.minions?.includes(entity)?CONFIG.minionScale:1);
      ctx.fillStyle='#05070baa';ctx.beginPath();ctx.ellipse(point.x,point.y,CONFIG.shadowWidth*CONFIG.zoom,CONFIG.shadowHeight*CONFIG.zoom,0,0,Math.PI*2);ctx.fill();
      if(entity===p || entity.elite){ctx.strokeStyle=entity===p?'#b5ab8055':'#d4af5daa';ctx.beginPath();ctx.ellipse(point.x,point.y,size/3,size/7,0,0,Math.PI*2);ctx.stroke();}
      if(image) ctx.drawImage(image,point.x-size/2,point.y-size,size,size);
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
    const vignette=ctx.createRadialGradient(this.width/2,this.height/2,this.height/4,this.width/2,this.height/2,this.width/1.5);
    vignette.addColorStop(0,'#07090c00');vignette.addColorStop(1,'#050609bb');ctx.fillStyle=vignette;ctx.fillRect(0,0,this.width,this.height);
    this.minimap(state);
  }
  minimap(state){
    const ctx=this.ctx,size=CONFIG.miniSize,offset=this.width-size-CONFIG.playerRadius,scale=size/state.area.bounds.width;
    ctx.save();ctx.translate(offset,CONFIG.playerRadius);ctx.fillStyle='#0b0e16d9';ctx.fillRect(0,0,size,size);ctx.strokeStyle='#85734f';ctx.strokeRect(0,0,size,size);ctx.fillStyle='#555365';
    for(const rect of [...state.area.paths,...state.area.rooms])ctx.fillRect(rect.x*scale,rect.y*scale,rect.w*scale,rect.h*scale);
    ctx.fillStyle='#d4bd83';ctx.beginPath();ctx.arc(state.player.x*scale,state.player.y*scale,CONFIG.barHeight,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8e75c0';if(state.area.portal)ctx.fillRect(state.area.portal.x*scale,state.area.portal.y*scale,CONFIG.barHeight,CONFIG.barHeight);
    ctx.fillStyle='#afd8b2';if(state.area.exit)ctx.fillRect(state.area.exit.x*scale,state.area.exit.y*scale,CONFIG.barHeight,CONFIG.barHeight);ctx.restore();
  }
}
