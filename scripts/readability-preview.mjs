import {writeFileSync} from 'node:fs';
import {drawShapes} from '../dist/rendering/appearance.js';
import {block,pixel} from '../dist/rendering/voxel.js';
import {experienceShapes,fragmentShapes,chestShapes} from '../dist/rendering/loot-presentation.js';
import {paintHostileShot} from '../dist/rendering/projectile-presentation.js';
import {project} from '../dist/shared/model.js';
// 旧版只用于并排对照，右侧始终调用正式函数；离线图元重放不代表浏览器画面或性能。
const commands=[];
function recorder(ox,oy){
 const move=p=>p.map((v,i)=>v+(i%2?oy:ox));
 return {clear(){},drawPoly:(x,y,p,fill,stroke,width=1)=>commands.push({type:'poly',p:move(p.map((v,i)=>v+(i%2?y:x))),fill,stroke,width}),
 drawRect:(x,y,w,h,fill,stroke,width=1)=>commands.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width}),
 drawLine:(x,y,tx,ty,stroke,width=1)=>commands.push({type:'lines',p:move([x,y,tx,ty]),stroke,width})};
}
const oldXP=healing=>[{type:'poly',p:[-7,-4,0,-9,8,-4,0,1],fill:'#173c36'},...block(-4,-2,7,9,3,healing?'#ed9874':'#97e773'),pixel(-2,-11,2,6,healing?'#ffe7d3':'#e9ffc9')];
function oldShot(g,vx,vy,color){const trail=project(-vx*.035,-vy*.035);g.drawLine(trail.x,trail.y-18,0,-18,'#30283e',6);g.drawLine(trail.x,trail.y-18,0,-18,color,2);g.drawRect(-4,-22,8,8,color,'#ffdc9d',1);g.drawRect(-2,-20,4,4,'#fff4e5');}
const label=(text,x,y)=>commands.push({type:'label',text,x,y});
for(let column=0;column<2;column++){
 const x=30+column*555;
 commands.push({type:'rect',p:[x,90,530,170],fill:'#294330'});label(column?'新版 · 奖励靠轮廓识别':'旧版 · 奖励多为亮色小块',x+15,102);
 const groups=column?[experienceShapes(),experienceShapes(true),fragmentShapes(),chestShapes('#8fceff')]:[oldXP(false),oldXP(true),[...block(-6,0,12,12,5,'#d7a6ff'),pixel(-2,-10,4,7,'#fff1ce')],chestShapes('#8fceff')];
 for(const [i,shapes]of groups.entries()){drawShapes(recorder(x+65+i*130,184),shapes);label(['经验','治疗','碎片','装备'][i],x+43+i*130,213);}
 commands.push({type:'rect',p:[x,275,530,150],fill:'#294330'});label(column?'新版 · 红边尖头 / 固定尾迹':'旧版 · 方形弹头 / 亮色内芯',x+15,287);
 for(const [i,[vx,vy]]of [[260,-260],[-260,260],[260,260],[-260,-260],[260,40]].entries())(column?paintHostileShot:oldShot)(recorder(x+60+i*103,370),vx,vy,i===4?'#efab82':'#c99bef');
 label(column?'新版 · 密集场景造型对照':'旧版 · 密集场景造型对照',x+15,445);
 for(let row=0;row<12;row++)for(let col=0;col<18;col++)commands.push({type:'rect',p:[x+col*29,480+row*29,29,29],fill:(row+col)%2?'#2c4433':'#304a36'});
 for(let i=0;i<100;i++){const px=x+22+(i%16)*31,py=507+Math.floor(i/16)*43;drawShapes(recorder(px,py),column?experienceShapes():oldXP(false));}
 for(let i=0;i<36;i++){const px=x+30+i*137%470,py=528+i*59%270;(column?paintHostileShot:oldShot)(recorder(px,py),i%2?260:-260,i%3?40:-180,i%5?'#c99bef':'#efab82');}
}
writeFileSync('artifacts/readability-preview.json',JSON.stringify({width:1140,height:860,title:'经验与敌方弹道 · 正式图元辨识对照（离线）',commands}));
