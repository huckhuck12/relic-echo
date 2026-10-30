import {drawBuffEffect} from '../dist/buffs/buff-visuals.js';
import {project} from '../dist/shared/model.js';
import {UIControls} from '../dist/ui/ui-controls.js';

// 正式绘图函数的等级快照对比，不执行战斗/伤害，不能作为性能或平衡验收。
Laya.init(innerWidth,innerHeight,Laya.WebGL);Laya.stage.scaleMode='full';Laya.stage.bgColor='#17271f';
const root=new Laya.Sprite();Laya.stage.addChild(root);const ui=new UIControls(()=>{}),cells=[];
ui.text(root,'Buff 等级表现 · 基础 / 强化 / 满级',24,18,1080,25,'#e8d795');
ui.text(root,'图形快照对比，不执行战斗；实际攻击范围保持一致。',24,55,1080,13,'#a6b79b');
let element='fire',paused=false,low=false,age=0;
for(const [i,[id,label]]of [['fire','火焰'],['ice','冰霜'],['lightning','雷电'],['force','冲击']].entries())ui.button(root,label,24+i*122,84,110,44,()=>element=id);
ui.button(root,'暂停 / 继续',528,84,160,44,()=>paused=!paused);
ui.button(root,'低 / 高细节',702,84,160,44,()=>low=!low);
for(const [row,[kind,name]]of [['bolt','弹丸'],['blast','爆炸'],['field','区域'],['orbit','环绕']].entries())for(const [col,level]of [1,3,5].entries()){
 const panel=ui.panel(root,24+col*366,145+row*208,350,198,'#213729','#4e6047');
 ui.text(panel,`${name} · Lv.${level} ${['基础','强化','满级'][col]}`,12,10,326,15,'#e9d69f');
 const floor=new Laya.Sprite(),overlay=new Laya.Sprite();for(const layer of [floor,overlay]){layer.pos(175,125);panel.addChild(layer);}
 cells.push({kind,level,floor,overlay});
}
function resize(){const s=Math.min(Laya.stage.width/1128,Laya.stage.height/990);root.scale(s,s);root.pos((Laya.stage.width-1128*s)/2,(Laya.stage.height-990*s)/2);}
Laya.stage.on(Laya.Event.RESIZE,null,resize);resize();let last=performance.now();
Laya.timer.frameLoop(1,null,()=>{
 const now=performance.now();if(!paused)age+=Math.min(.05,(now-last)/1000);last=now;
 for(const c of cells){c.floor.graphics.clear();c.overlay.graphics.clear();drawBuffEffect(c.overlay.graphics,c.floor.graphics,project,{kind:c.kind,element,level:c.level,x:0,y:0,vx:480,vy:0,age:c.kind==='blast'?(age%.8)*.25/.8:age%3},low?3:8);}
});
