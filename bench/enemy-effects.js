import {SceneRenderer} from '../dist/rendering/scene-renderer.js';
import {enemyPose, drawEnemyDeath,drawEnemyRelease} from '../dist/rendering/enemy-presentation.js';
import {enemyArtPose,ENEMY_ACTION_SECONDS} from '../dist/enemies/enemy-actions.js';
import {unproject} from '../dist/shared/model.js';
import {QUALITY_PRESETS} from '../dist/rendering/quality.js';
import {UIControls} from '../dist/ui/ui-controls.js';

// 隔离的表现沙盒：不产生伤害；复用正式造型、姿态、预警和死亡绘制代码。
Laya.init(innerWidth,innerHeight,Laya.WebGL);Laya.stage.scaleMode='full';Laya.stage.bgColor='#17271f';
const renderer=new SceneRenderer([]);renderer.world.visible=false;
const root=new Laya.Sprite();Laya.stage.addChild(root);
const controls=new UIControls(()=>{}),names=['苔藓史莱姆','骸骨法师','獠牙野猪','精英石像','遗迹核心'];
controls.text(root,'怪物表现 · 移动 → 蓄力 → 出招 → 受击 → 碎裂',24,22,1050,22,'#e8d795');
controls.text(root,'效果沙盒：无伤害结算，复用游戏正式绘制逻辑。',24,60,1050,13,'#a6b79b');
let paused=false,quality='standard',time=0;
controls.button(root,'暂停 / 继续',24,92,150,44,()=>paused=!paused);
const qualityButton=controls.button(root,'画质：标准',188,92,170,44,()=>{
 const modes=['low','standard','high'];quality=modes[(modes.indexOf(quality)+1)%3];
 qualityButton.children[0].text='画质：'+QUALITY_PRESETS[quality].name;
 for(const e of enemies)renderer.paintEnemy(e,buffs,QUALITY_PRESETS[quality]);
});
controls.button(root,'从头播放',372,92,150,44,()=>time=0);
const status=controls.text(root,'',550,107,540,14,'#d9d8b0');
const enemies=[],buffs={speedMultiplier:()=>1};
const floor=new Laya.Sprite();floor.zOrder=1;floor.mouseEnabled=false;root.addChild(floor);
for(let kind=0;kind<5;kind++){
 const x=120+kind*215;
 const panel=controls.panel(root,x-93,170,190,380,'#213729','#4e6047');
 controls.text(panel,names[kind],8,20,174,17,'#e3d6ad','center');
 controls.text(panel,['弹跳 / 伸缩','漂浮 / 法杖聚能','压身 / 冲锋','重踏 / 石块碎裂','锁定落点 / 收束圈'][kind],10,290,170,12,'#a6b79b','center');
 const node=new Laya.Sprite();node.zOrder=2;root.addChild(node);
 const point=unproject(x,410);
 const e={...point,kind,node,hp:100,max:100,radius:[16,18,20,35,58][kind],flash:0,wind:0,charge:0,dx:1,dy:0};
 renderer.paintEnemy(e,buffs,QUALITY_PRESETS[quality]);enemies.push(e);
}
const overlay=new Laya.Sprite();overlay.zOrder=3;root.addChild(overlay);overlay.mouseEnabled=false;
function resize(){const scale=Math.min(Laya.stage.width/1100,Laya.stage.height/590);root.scale(scale,scale);root.pos((Laya.stage.width-1100*scale)/2,(Laya.stage.height-590*scale)/2);}
Laya.stage.on(Laya.Event.RESIZE,null,resize);resize();
let last=performance.now();
Laya.timer.frameLoop(1,null,()=>{
 const now=performance.now();if(!paused)time+=Math.min(.05,(now-last)/1000);last=now;
 const t=time%6,wind=t>=2&&t<3,attack=t>=3&&t<3.7,flash=t>=3.7&&t<3.84,death=t>=4.1&&t<4.62;
 status.text=death?'击杀 · 方块碎裂':flash?'受击 · 回弹':attack?'出招':wind?'蓄力 · 注意预警':'移动';
 overlay.graphics.clear();
 floor.graphics.clear();
 for(const e of enemies){
  e.wind=wind&&(e.kind===1||e.kind===2||e.kind===4)?(e.kind===1?.45:e.kind===2?.75:.85)*(3-t):0;
  e.charge=e.kind===4&&wind?1:e.kind===2&&attack?.4:0;
  e.dx=e.kind===4?e.x:1;e.dy=e.kind===4?e.y:0;
  e.flash=flash?.06:0;
  e.action=e.kind===1?'cast':e.kind===2?(t>=3.7?'brake':'launch'):e.kind===4?'slam':'burst';
  e.actionTime=e.kind>0&&t>=3?Math.max(0,ENEMY_ACTION_SECONDS[e.action]-(t-(e.kind===2&&t>=3.7?3.7:3))):0;
  if(e.flashPaint!==flash||e.actionPaint!==enemyArtPose(e).key)renderer.paintEnemy(e,buffs,QUALITY_PRESETS[quality]);
  const pose=enemyPose(e,time,false),x=120+e.kind*215;
  e.node.pos(x,410-pose.lift);e.node.scale(pose.sx,pose.sy);e.node.rotation=pose.rotation;e.node.visible=!death;
  if(death)drawEnemyDeath(overlay.graphics,{x:e.x,y:e.y,life:.52-(t-4.1),max:.52,tx:e.kind>=3?58:30,ty:e.kind,color:['#93b962','#c7a1e4','#d79459','#99aa7c','#e2ae65'][e.kind]},QUALITY_PRESETS[quality].debris);
  if(!death)drawEnemyRelease(overlay.graphics,floor.graphics,e,time,QUALITY_PRESETS[quality].detail);
 }
 // 与正式场景共用预警绘制：冲锋路线贴地，其他提示位于上层。
 renderer.drawWarnings({enemies,time,visuals:QUALITY_PRESETS[quality]},overlay.graphics,floor.graphics);
});
