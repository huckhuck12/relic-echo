import {writeFileSync} from 'node:fs';
import {drawRangedWarning,enemyPose} from '../dist/rendering/enemy-presentation.js';
import {drawShapes} from '../dist/rendering/appearance.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {project} from '../dist/shared/model.js';
import {enemyArtPose} from '../dist/enemies/enemy-actions.js';
// 重放正式绘图，检查地面虚线、怪物遮挡和杖头收束；不是浏览器截图。
const commands=[];
function recorder(ox,oy,out=commands){const shifted=(x,y,p)=>p.map((n,i)=>n+(i%2?oy+y:ox+x));return {clear(){},drawPoly(x,y,p,fill,stroke,width=1){out.push({type:'poly',p:shifted(x,y,p),fill,stroke,width});},drawLines(x,y,p,stroke,width=1){out.push({type:'lines',p:shifted(x,y,p),stroke,width});},drawLine(x,y,tx,ty,stroke,width=1){out.push({type:'lines',p:[x+ox,y+oy,tx+ox,ty+oy],stroke,width});},drawRect(x,y,w,h,fill,stroke,width=1){out.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width});}};}
for(const [row,wind]of [.44,.22,.02].entries()){
 const y=100+row*280,overlay=[];
 commands.push({type:'rect',p:[30,y,760,260],fill:'#263d2c'},{type:'label',text:['锁定 · 暗紫虚线','蓄力 · 逐渐变亮','临发射 · 杖头收束'][row],x:45,y:y+10});
 const e={kind:1,x:0,y:0,wind,dx:Math.SQRT1_2,dy:-Math.SQRT1_2,flash:0},pose=enemyPose(e,1,false),ox=130,oy=y+140;
 drawRangedWarning(recorder(ox,oy,overlay),recorder(ox,oy),e,1,false);
 drawShapes(recorder(ox,oy-pose.lift),enemyShapes(1,false,false,enemyArtPose(e)).map(shape=>{const p=shape.p,v=shape.type==='rect'?[p[0],p[1],p[0]+p[2],p[1],p[0]+p[2],p[1]+p[3],p[0],p[1]+p[3]]:p,out=[],a=pose.rotation*Math.PI/180;for(let i=0;i<v.length;i+=2){const x=v[i]*pose.sx,y=v[i+1]*pose.sy;out.push(x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a));}return {...shape,type:'poly',p:out};}));
 for(const distance of [170,330]){const p=project(distance*e.dx,distance*e.dy);drawShapes(recorder(ox+p.x,oy+p.y),enemyShapes(0,false,false));}
 commands.push(...overlay);
}
writeFileSync('artifacts/ranged-warning-preview.json',JSON.stringify({width:820,height:960,title:'紫色远程怪 / 地面瞄准虚线与局部聚能',commands}));
