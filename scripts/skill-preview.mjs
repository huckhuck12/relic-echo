import {writeFileSync} from 'node:fs';
import {lightningStroke,paintFlameShot,bladePulse,drawBladeOrbit,flameBurst,castFlash} from '../dist/rendering/skill-visuals.js';
import {drawBuffEffect,ring} from '../dist/buffs/buff-visuals.js';
import {drawShapes,avatarShapes} from '../dist/rendering/appearance.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {project,unproject,emptyLoadout} from '../dist/shared/model.js';
import {CAST_DURATION,weaponSocket} from '../dist/rendering/player-pose.js';
// 正式 Graphics 函数的离线绘图命令；不是浏览器截图，也不模拟 GPU 混合。
const commands=[];
function recorder(ox,oy){
 const move=p=>p.map((v,i)=>v+(i%2?oy:ox));
 return {clear(){},drawPoly:(x,y,p,fill,stroke,width=1)=>commands.push({type:'poly',p:move(p.map((v,i)=>v+(i%2?y:x))),fill,stroke,width}),
 drawLines:(x,y,p,stroke,width=1)=>commands.push({type:'lines',p:move(p.map((v,i)=>v+(i%2?y:x))),stroke,width}),
 drawLine:(x,y,tx,ty,stroke,width=1)=>commands.push({type:'lines',p:move([x,y,tx,ty]),stroke,width}),
 drawRect:(x,y,w,h,fill,stroke,width=1)=>commands.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width})};
}
const names=['雷杖 · 跳跃电弧','炎炮 · 尾焰与焰冠','环刃 · 御刃与轨迹'],stages=['施放','展开','消散'];
for(let row=0;row<3;row++)for(let col=0;col<3;col++){
 const x=40+col*450,y=115+row*225,g=recorder(x+215,y+165),weapon=['storm','flame','blade'][col];
 commands.push({type:'rect',p:[x,y,425,205],fill:'#213729'});
 commands.push({type:'label',text:names[col]+' / '+stages[row],x:x+14,y:y+12});
 const originScreen=col===2?-35:-80;
 drawShapes(recorder(x+215+originScreen,y+165),avatarShapes(emptyLoadout(weapon),false,1,0,0,row===0?CAST_DURATION[weapon]:0));
 for(const [px,py]of [[60,-10],[110,25],[100,-45]])drawShapes(recorder(x+215+px,y+165+py),enemyShapes(0,false,false));
 const origin=unproject(originScreen,0),target=unproject(60,-10),t=[.04,.35,.8][row];
 const socket=weaponSocket(weapon,0,0,CAST_DURATION[weapon]),cast=unproject(originScreen+socket.x,socket.y);
 if(col===0){lightningStroke(g,-80+socket.x,socket.y,60,-36,t*.17,1-t);lightningStroke(g,60,-36,110,-1,t*.17,.8*(1-t));lightningStroke(g,110,-1,100,-71,t*.17,.6*(1-t));}
 if(col===1){
  if(row===0){const shot=recorder(x+215+originScreen+socket.x,y+165+socket.y+18);paintFlameShot(shot,680,-80);}
  else{flameBurst(g,target.x,target.y,105,row===1?.12:.6,5);ring(g,project,target.x,target.y,105*(row===1?.55:.95),'#ffe0a1',2);}
 }
 if(col===2){bladePulse(g,origin.x,origin.y,150,.3,t);drawBladeOrbit(g,origin.x,origin.y,t,CAST_DURATION.blade*(1-t),150,3);}
 if(row===0)castFlash(g,cast.x,cast.y,.2,col===1?1:col===0?0:2,.1,col===1?'#ffb467':'#aeeaff',true);
}
for(const [i,element]of ['fire','ice','lightning','force'].entries()){
 const x=40+i*337,y=805,g=recorder(x+155,y+160);
 commands.push({type:'rect',p:[x,y,315,205],fill:'#213729'});
 commands.push({type:'label',text:['火焰 · 焰冠','冰霜 · 晶簇','雷电 · 辐射电弧','冲击 · 定向气浪'][i],x:x+14,y:y+12});
 drawBuffEffect(g,g,project,{kind:'blast',element,x:0,y:0,vx:0,vy:0,age:.07},5);
}
writeFileSync('artifacts/skill-preview.json',JSON.stringify({width:1400,height:1040,title:'技能表现 · 正式绘图函数离线检查',commands}));
