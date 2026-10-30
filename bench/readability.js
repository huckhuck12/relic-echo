import {experienceShapes,fragmentShapes,chestShapes,lootPose} from '../dist/rendering/loot-presentation.js';
import {paintHostileShot} from '../dist/rendering/projectile-presentation.js';
import {drawShapes} from '../dist/rendering/appearance.js';
import {unproject,project} from '../dist/shared/model.js';
import {UIControls} from '../dist/ui/ui-controls.js';

// 辨识沙盒：复用正式造型与浮动，弹道循环展示，不结算伤害/拾取，不是性能测试。
Laya.init(innerWidth,innerHeight,Laya.WebGL);Laya.stage.scaleMode='full';Laya.stage.bgColor='#17271f';
const root=new Laya.Sprite();Laya.stage.addChild(root);const ui=new UIControls(()=>{});
ui.text(root,'奖励与危险 · 轮廓辨识',24,18,1050,24,'#ead9ad');
ui.text(root,'绿菱片＝经验　十字补给＝治疗　金边符牌＝碎片　红边尖头＋尾迹＝敌方弹道',24,58,1050,15,'#becfb5');
ui.text(root,'隔离造型预览：弹道循环，无伤害与拾取；实战请用 acceptance.html',24,86,1050,12,'#9aaf9d');
let time=0,paused=false,slow=false,showDrops=true,showShots=true;
ui.button(root,'暂停 / 继续',24,116,150,42,()=>paused=!paused);
ui.button(root,'慢速 / 正常',188,116,150,42,()=>slow=!slow);
ui.button(root,'显示 / 隐藏奖励',352,116,180,42,()=>showDrops=!showDrops);
ui.button(root,'显示 / 隐藏弹道',546,116,180,42,()=>showShots=!showShots);
const area=new Laya.Sprite();area.pos(24,180);root.addChild(area);
for(let y=0;y<390;y+=30)for(let x=0;x<1050;x+=30)area.graphics.drawRect(x,y,30,30,(x/30+y/30)%2?'#2c4433':'#304a36');
const rewards=new Laya.Sprite(),shots=new Laya.Sprite();area.addChild(rewards);area.addChild(shots);
const drops=[],bullets=[];
for(let i=0;i<120;i++){
 const x=28+(i%20)*52,y=28+Math.floor(i/20)*62,kind=i%23;
 const drop={...unproject(x,y),xp:kind===0?-15:1,collecting:false,fragment:kind===1?'hit':undefined,item:kind===2?{id:'visor',quality:1}:undefined};
 const node=new Laya.Sprite();drawShapes(node.graphics,drop.item?chestShapes('#8fceff'):drop.fragment?fragmentShapes():experienceShapes(drop.xp<0));rewards.addChild(node);drops.push({drop,node,x,y});
}
for(let i=0;i<48;i++){
 const vx=i%2?260:-260,vy=i%3?40:-180,d=project(vx,vy),node=new Laya.Sprite();
 paintHostileShot(node.graphics,vx,vy,i%5?'#c99bef':'#efab82');shots.addChild(node);
 bullets.push({node,x:i*173%1050,y:i*47%390,dx:d.x,dy:d.y});
}
function resize(){const scale=Math.min(Laya.stage.width/1100,Laya.stage.height/600);root.scale(scale,scale);root.pos((Laya.stage.width-1100*scale)/2,(Laya.stage.height-600*scale)/2);}
Laya.stage.on(Laya.Event.RESIZE,null,resize);resize();let last=performance.now();
Laya.timer.frameLoop(1,null,()=>{
 const now=performance.now();if(!paused)time+=Math.min(.05,(now-last)/1000)*(slow?.3:1);last=now;
 rewards.visible=showDrops;shots.visible=showShots;
 for(const {drop,node,x,y}of drops){const pose=lootPose(drop,time);node.pos(x,y-pose.lift);node.scale(pose.sx,pose.sy);}
 for(const b of bullets)b.node.pos(((b.x+time*b.dx)%1050+1050)%1050,((b.y+time*b.dy)%390+390)%390);
});
