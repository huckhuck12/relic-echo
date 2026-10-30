import {BuffRuntime,ACTIONS,ELEMENTS,FRAGMENTS} from '../dist/buffs/buffs.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {drawShapes} from '../dist/rendering/appearance.js';
import {project} from '../dist/shared/model.js';
import {QUALITY_PRESETS} from '../dist/rendering/quality.js';

// Uses the production runtime and Graphics renderer, not a separate animation mockup.
Laya.init(innerWidth,innerHeight,Laya.WebGL);Laya.stage.scaleMode='full';Laya.stage.bgColor='#17271f';
const root=new Laya.Sprite();Laya.stage.addChild(root);
function text(value,x,y,w,size=16){const t=new Laya.Text();Object.assign(t,{text:value,color:'#e8e9d1',fontSize:size,width:w,font:'Microsoft YaHei'});t.pos(x,y);root.addChild(t);return t;}
text('BUFF 效果 · 行为 × 元素',24,16,430,22);
let paused=false,quality='standard';
function button(x,w,label,action){const n=new Laya.Sprite();n.pos(x,12);n.size(w,44);n.graphics.drawRect(0,0,w,44,'#304b38','#8bb17b',1);root.addChild(n);const t=new Laya.Text();Object.assign(t,{text:label,color:'#f4eed8',fontSize:16,width:w,align:'center',y:12,mouseEnabled:false});n.addChild(t);n.on(Laya.Event.CLICK,null,()=>action(t));}
button(810,150,'暂停 / 继续',()=>paused=!paused);
button(980,210,'画质：标准',t=>{const modes=['low','standard','high'];quality=modes[(modes.indexOf(quality)+1)%3];t.text='画质：'+QUALITY_PRESETS[quality].name;for(const c of cells)c.runtime.setVisualBudget(QUALITY_PRESETS[quality].buffFeedback);});
for(let i=0;i<4;i++){text(ACTIONS[i].name,170+i*270,70,220);text(ELEMENTS[i].name,12,180+i*170,70);}
const cells=[];
for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  const node=new Laya.Sprite();node.pos(160+col*270,190+row*170);root.addChild(node);
  const floor=new Laya.Sprite(),actors=new Laya.Sprite(),overlay=new Laya.Sprite();node.addChild(floor);node.addChild(actors);node.addChild(overlay);
  const targets=[{x:55,y:0,dead:false},{x:100,y:20,dead:false},{x:40,y:70,dead:false}],player={x:0,y:0,dx:1,dy:0};
  const runtime=new BuffRuntime({player,query:(x,y,r)=>targets.filter(t=>Math.hypot(t.x-x,t.y-y)<=r),damage(){},knock(target,force,x,y){const dx=target.x-x,dy=target.y-y,d=Math.hypot(dx,dy)||1;target.x+=dx/d*12;target.y+=dy/d*12;}});
  for(const f of FRAGMENTS)runtime.grant(f.id);runtime.install(0,'trigger','dash');runtime.install(0,'action',ACTIONS[col].id);runtime.install(0,'element',ELEMENTS[row].id);runtime.setVisualBudget(24);
  const sprites=targets.map(()=>{const sprite=new Laya.Sprite();actors.addChild(sprite);return sprite;});
  cells.push({runtime,floor,overlay,sprites,targets,player,clock:4.8,phase:0});
}
function resize(){const scale=Math.min(Laya.stage.width/1240,Laya.stage.height/800);root.scale(scale,scale);root.pos((Laya.stage.width-1240*scale)/2,(Laya.stage.height-800*scale)/2);}
Laya.stage.on(Laya.Event.RESIZE,null,resize);resize();
let last=performance.now();Laya.timer.frameLoop(1,null,()=>{
  const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
  for(const c of cells){
    if(!paused){c.clock+=dt;c.phase+=dt;if(c.clock>=4.8){c.clock=0;c.targets.forEach((t,i)=>Object.assign(t,[{x:55,y:0},{x:100,y:20},{x:40,y:70}][i]));c.runtime.cooldowns.fill(0);c.runtime.trigger('dash',0,0,1);}c.player.x=Math.sin(c.phase*2)*12;c.runtime.update(dt);}
    c.floor.graphics.clear();c.overlay.graphics.clear();
    c.targets.forEach((t,i)=>{const p=project(t.x,t.y),ice=c.runtime.speedMultiplier(t)<1,shapes=enemyShapes(0,false,false);if(ice)for(let j=1;j<shapes.length;j++)if(shapes[j].p[2]>10)shapes[j].fill='#8bcedf';drawShapes(c.sprites[i].graphics,shapes);c.sprites[i].pos(p.x,p.y);});
    c.runtime.render(c.overlay.graphics,project,c.floor.graphics);
  }
});
