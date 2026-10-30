import {writeFileSync} from 'node:fs';
import {drawHitFeedback,HIT_SECONDS} from '../dist/rendering/hit-feedback.js';
import {drawShapes} from '../dist/rendering/appearance.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
// 正式命中图元的离线重放；不包含浏览器混合、帧率或 GPU 验证。
const commands=[];
function recorder(ox,oy){
 const move=p=>p.map((v,i)=>v+(i%2?oy:ox));
 return {clear(){},drawPoly:(x,y,p,fill,stroke,width=1)=>commands.push({type:'poly',p:move(p.map((v,i)=>v+(i%2?y:x))),fill,stroke,width}),
 drawLines:(x,y,p,stroke,width=1)=>commands.push({type:'lines',p:move(p.map((v,i)=>v+(i%2?y:x))),stroke,width}),
 drawRect:(x,y,w,h,fill,stroke,width=1)=>commands.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width})};
}
for(const [col,weapon]of ['storm','flame','blade'].entries())for(const [row,t]of [0,.25,.65].entries()){
 const x=35+col*300,y=100+row*180,g=recorder(x+140,y+130);
 commands.push({type:'rect',p:[x,y,280,160],fill:'#213729'});
 commands.push({type:'label',text:['雷杖 · 局部电弧','炎炮 · 亮芯与余烬','环刃 · 定向切痕'][col]+` / ${Math.round(t*100)}%`,x:x+10,y:y+10});
 drawShapes(g,enemyShapes(0,false,false));
 drawHitFeedback(g,{x:0,y:0,life:HIT_SECONDS[weapon]*(1-t),max:HIT_SECONDS[weapon],tx:.35,ty:col});
}
writeFileSync('artifacts/hit-preview.json',JSON.stringify({width:950,height:660,title:'武器命中反馈 · 正式图元离线检查',commands}));
