import {lightningStroke,paintFlameShot,bladePulse,drawBladeOrbit,flameBurst,burningGround,castFlash} from '../dist/rendering/skill-visuals.js';
import {avatarShapes,drawShapes} from '../dist/rendering/appearance.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {emptyLoadout,project,unproject} from '../dist/shared/model.js';
import {ring} from '../dist/buffs/buff-visuals.js';
import {UIControls} from '../dist/ui/ui-controls.js';
import {QUALITY_PRESETS} from '../dist/rendering/quality.js';
import {CAST_DURATION,castFrame,weaponSocket,bladeOrbit} from '../dist/rendering/player-pose.js';
import {drawHitFeedback,HIT_SECONDS} from '../dist/rendering/hit-feedback.js';
import {enemyPose} from '../dist/rendering/enemy-presentation.js';

// 展示正式绘图函数的施放/轨迹/命中过程，不使用独立替代美术，也不在此模拟伤害。
Laya.init(innerWidth,innerHeight,Laya.WebGL);Laya.stage.scaleMode='full';Laya.stage.bgColor='#17271f';
const root=new Laya.Sprite();Laya.stage.addChild(root);const ui=new UIControls(()=>{});
ui.text(root,'技能表现 · 施放 / 飞行 / 命中',24,22,1050,25,'#e8d795');
ui.text(root,'雷杖：跳跃电弧　　炎炮：热芯与焰冠　　环刃：抬手引导 / 外扩回收',24,65,1050,14,'#b4c2a2');
let time=0,paused=false,quality='standard';
ui.button(root,'暂停 / 继续',24,100,150,44,()=>paused=!paused);
const qualityButton=ui.button(root,'画质：标准',188,100,170,44,()=>{const modes=['low','standard','high'];quality=modes[(modes.indexOf(quality)+1)%3];qualityButton.children[0].text='画质：'+QUALITY_PRESETS[quality].name;});
ui.button(root,'从头播放',372,100,150,44,()=>{time=0;for(const c of cells)c.spin=0;});
const origin=unproject(-80,0),target=unproject(65,-8),cells=[];
for(const [i,weapon]of ['storm','flame','blade'].entries()){
 const card=ui.panel(root,24+i*360,175,344,340,'#213729','#4e6047');
 ui.text(card,['雷杖 · 跳跃电弧','炎炮 · 飞行与爆炸','环刃 · 御刃与回收'][i],12,20,320,20,'#e5d7ae','center');
 const floor=new Laya.Sprite(),actors=new Laya.Sprite(),fx=new Laya.Sprite();
 for(const node of [floor,actors,fx]){node.pos(172,250);card.addChild(node);}
 const avatar=new Laya.Sprite();drawShapes(avatar.graphics,avatarShapes(emptyLoadout(weapon),false,1,0,0));avatar.pos(weapon==='blade'?-10:-80,0);actors.addChild(avatar);
 const monsters=[];
 for(const [x,y]of [[65,-8],[110,28],[100,-50]]){const e=new Laya.Sprite();drawShapes(e.graphics,enemyShapes(0,false,false));e.pos(x,y);actors.addChild(e);monsters.push({node:e,x,y});}
 const shot=new Laya.Sprite();paintFlameShot(shot.graphics,680,-180);actors.addChild(shot);shot.visible=false;
 cells.push({weapon,floor,fx,shot,avatar,monsters,castKey:-1,spin:0});
}
ui.text(root,'复用游戏正式绘图 · 暂停可对照细节 · Buff 组合请查看 buff-effects.html',24,545,1060,13,'#a5b79b');
function resize(){const scale=Math.min(Laya.stage.width/1128,Laya.stage.height/600);root.scale(scale,scale);root.pos((Laya.stage.width-1128*scale)/2,(Laya.stage.height-600*scale)/2);}
Laya.stage.on(Laya.Event.RESIZE,null,resize);resize();let last=performance.now();
Laya.timer.frameLoop(1,null,()=>{
 const now=performance.now(),dt=paused?0:Math.min(.05,(now-last)/1000);time+=dt;last=now;
 const age=time%1.3;
 for(const c of cells){
  const g=c.fx.graphics,floor=c.floor.graphics,detail=QUALITY_PRESETS[quality].debris;g.clear();floor.clear();c.shot.visible=false;
  for(const m of c.monsters){
   const hitAge=age-(c.weapon==='flame'?.35:0),life=hitAge>=0?Math.max(0,HIT_SECONDS[c.weapon]-hitAge):0;
   const world=unproject(m.x,m.y),direction=c.weapon==='blade'?{dx:-world.y,dy:world.x}:{dx:1,dy:.35};
   const pose=enemyPose({...world,kind:0,flash:0,hitReaction:{weapon:c.weapon,...direction,life}},time,false);
   m.node.pos(m.x,m.y-pose.lift);m.node.scale(pose.sx,pose.sy);m.node.rotation=pose.rotation;
   if(life>0){const d=project(direction.dx,direction.dy);drawHitFeedback(g,{...world,life,max:HIT_SECONDS[c.weapon],tx:Math.atan2(d.y,d.x),ty:c.weapon==='storm'?0:c.weapon==='flame'?1:2});}
  }
  const remaining=Math.max(0,CAST_DURATION[c.weapon]-age),key=castFrame(c.weapon,remaining);
  if(c.castKey!==key){drawShapes(c.avatar.graphics,avatarShapes(emptyLoadout(c.weapon),false,1,0,0,remaining));c.castKey=key;}
  const bladeOrigin=unproject(-10,0),socket=weaponSocket(c.weapon,0,0,CAST_DURATION[c.weapon]),castOrigin=unproject((c.weapon==='blade'?-10:-80)+socket.x,socket.y);
  if(age<.12)castFlash(g,castOrigin.x,castOrigin.y,.4,c.weapon==='storm'?0:c.weapon==='flame'?1:2,age/.12,c.weapon==='flame'?'#ff9e59':'#b8caff',true);
  if(c.weapon==='storm'&&age<.22){lightningStroke(g,-80+socket.x,socket.y,65,-34,age,1-age/.22);lightningStroke(g,65,-34,110,2,age,.7*(1-age/.22));lightningStroke(g,110,2,100,-76,age,.5*(1-age/.22));}
  if(c.weapon==='flame'){
   if(age<.35){const launch=Math.max(0,1-age/.12);c.shot.visible=true;c.shot.pos(-80+145*age/.35+socket.x*launch,-8*age/.35+(socket.y+18)*launch);}
   if(age>=.35&&age<.67){const t=(age-.35)/.32;flameBurst(g,target.x,target.y,105,t,detail);ring(floor,project,target.x,target.y,105*(1-Math.pow(1-t,3)),'#eebc72',2);}
   if(age>=.35)burningGround(floor,target.x,target.y,84,time,detail);
  }
  if(c.weapon==='blade'){
   c.spin+=dt*(bladeOrbit(time,remaining,150).speed-9);
   if(age<.2)bladePulse(g,bladeOrigin.x,bladeOrigin.y,150,time*9+c.spin,age/.2);
   drawBladeOrbit(g,bladeOrigin.x,bladeOrigin.y,time,remaining,150,3,c.spin);
  }
 }
});
