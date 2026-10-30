import {BuffRuntime,FRAGMENTS} from '../dist/buffs/buffs.js';
import {EVOLUTIONS} from '../dist/buffs/buff-evolutions.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {drawShapes} from '../dist/rendering/appearance.js';
import {project} from '../dist/shared/model.js';
import {UIControls} from '../dist/ui/ui-controls.js';

// 真实 BuffRuntime 的隔离演示。模拟命中事件固定成功，仍遵守正式 2 秒冷却。
// 靶子不死亡，便于反复观察叠层；不能作为正式局触发概率、平衡或性能结论。
Laya.init(innerWidth,innerHeight,Laya.WebGL);Laya.stage.scaleMode='full';Laya.stage.bgColor='#17271f';
const root=new Laya.Sprite();Laya.stage.addChild(root);const ui=new UIControls(()=>{});
ui.text(root,'Buff 专属进化 · 从组合到打法',24,20,1080,25,'#e8d795');
ui.text(root,'固定成功的模拟命中，保留 2 秒冷却；靶子不死亡。正式局命中仍为 30% 概率。',24,62,1080,13,'#a6b79b');
let paused=false,fast=false;
ui.button(root,'暂停 / 继续',24,98,150,44,()=>paused=!paused);
ui.button(root,'正常 / 二倍预览',188,98,180,44,()=>fast=!fast);
const cells=[];
for(const [i,definition]of EVOLUTIONS.entries()){
 const panel=ui.panel(root,24+i*366,165,350,420,'#213729','#4e6047');
 ui.text(panel,definition.name,14,16,322,21,'#e9d69f','center');
 const description=ui.text(panel,definition.note,14,54,322,12,'#b6c8ad');description.leading=4;
 const floor=new Laya.Sprite(),actors=new Laya.Sprite(),overlay=new Laya.Sprite();
 for(const layer of [floor,actors,overlay]){layer.pos(175,260);panel.addChild(layer);}
 const points=i===0?[[50,0],[100,20],[80,50],[120,-30]]:i===1?[[0,0],[25,0],[-20,0],[0,32]]:[[90,0],[20,0],[0,60],[50,50]];
 const targets=points.map(([x,y])=>({x,y,dead:false,hp:100000})),player={x:0,y:0,dx:1,dy:0};
 const state={elapsed:3,event:0,damage:0};
 const runtime=new BuffRuntime({player,query:(x,y,r)=>targets.filter(t=>Math.hypot(t.x-x,t.y-y)<=r),damage:(target,value)=>{
  target.hp-=value;state.damage+=value;
 },knock(){}});
 for(const fragment of FRAGMENTS)runtime.grant(fragment.id);
 runtime.install(0,'trigger','hit');runtime.install(0,'action',definition.action);runtime.install(0,'element',definition.element);runtime.setVisualBudget(24);
 const nodes=targets.map(target=>{const node=new Laya.Sprite(),p=project(target.x,target.y);drawShapes(node.graphics,enemyShapes(0,false,false));node.pos(p.x,p.y);actors.addChild(node);return node;});
 const status=ui.text(panel,'',14,342,322,13,'#d2ddbc','center');
 ui.text(panel,['追击同一目标 → 叠印 → 引爆传导','在两端留火种 → 中间形成燃烧带','环绕接触 → 叠层碎裂 → 减速扩散'][i],14,382,322,12,'#97afaa','center');
 cells.push({runtime,targets,nodes,floor,overlay,status,state,index:i});
}
ui.button(root,'重播全部',382,98,150,44,()=>{for(const c of cells){c.runtime.clearTransient();c.runtime.cooldowns.fill(0);Object.assign(c.state,{elapsed:3,event:0,damage:0});}});
function resize(){const scale=Math.min(Laya.stage.width/1128,Laya.stage.height/620);root.scale(scale,scale);root.pos((Laya.stage.width-1128*scale)/2,(Laya.stage.height-620*scale)/2);}
Laya.stage.on(Laya.Event.RESIZE,null,resize);resize();let last=performance.now();
Laya.timer.frameLoop(1,null,()=>{
 const now=performance.now(),dt=paused?0:Math.min(.05,(now-last)/1000)*(fast?2:1);last=now;
 for(const c of cells){
  if(dt>0){c.state.elapsed+=dt;if(c.state.elapsed>=2.1){c.state.elapsed=0;const x=c.index===1?(c.state.event++%2?120:-120):0;c.runtime.trigger('hit',x,0,1,()=>0);}c.runtime.update(dt);}
  c.floor.graphics.clear();c.overlay.graphics.clear();c.runtime.render(c.overlay.graphics,project,c.floor.graphics);
  const marks=c.index===0?c.runtime.evolutions.thunder:c.runtime.evolutions.frost;
  const bursts=c.index===0?c.runtime.evolutions.detonations:c.runtime.evolutions.shatters;
  c.status.text=c.index===1?`火种 ${c.runtime.evolutions.seeds.length} · 燃烧带 ${c.runtime.evolutions.links.length}\n中间靶累计伤害 ${Math.round(c.state.damage)}`:`主靶叠层 ${marks.get(c.targets[0])?.stacks||0}/3 · 累计爆发 ${bursts}\n邻近靶减速 ${c.runtime.speedMultiplier(c.targets[1])<1?'生效':'无'}`;
  c.nodes.forEach((node,i)=>node.alpha=c.runtime.speedMultiplier(c.targets[i])<1?.7:1);
 }
});
