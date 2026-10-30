import {writeFileSync} from 'node:fs';
import {drawBuffEffect} from '../dist/buffs/buff-visuals.js';
import {project} from '../dist/shared/model.js';
// 离线重放正式图元以检查造型，不是浏览器/GPU 截图或 FPS 数据。
const commands=[];
function recorder(ox,oy,list){const move=p=>p.map((v,i)=>v+(i%2?oy:ox));return {
 drawPoly:(x,y,p,fill,stroke,width=1)=>list.push({type:'poly',p:move(p.map((v,i)=>v+(i%2?y:x))),fill,stroke,width}),
 drawLine:(x,y,tx,ty,stroke,width=1)=>list.push({type:'lines',p:move([x,y,tx,ty]),stroke,width}),
 drawLines:(x,y,p,stroke,width=1)=>list.push({type:'lines',p:move(p.map((v,i)=>v+(i%2?y:x))),stroke,width}),
};}
for(const [row,[kind,element,name]]of [['bolt','lightning','雷电弹丸'],['blast','force','冲击爆炸'],['field','fire','火焰区域'],['orbit','ice','冰霜环绕']].entries())for(const [col,level]of [1,3,5].entries()){
 const x=24+col*366,y=86+row*208;
 commands.push({type:'rect',p:[x,y,350,194],fill:'#213729',stroke:'#4e6047',width:1},{type:'label',text:`${name} · Lv.${level} ${['基础','强化','满级'][col]}`,x:x+12,y:y+10});
 const floor=[],overlay=[];
 drawBuffEffect(recorder(x+175,y+128,overlay),recorder(x+175,y+128,floor),project,{kind,element,level,x:0,y:0,vx:480,vy:0,age:.08},8);
 commands.push(...floor,...overlay);
}
writeFileSync('artifacts/buff-level-preview.json',JSON.stringify({width:1128,height:936,title:'Buff 等级表现 · 正式绘图指令离线检查',commands}));
