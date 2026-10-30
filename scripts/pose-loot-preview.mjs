import {writeFileSync} from 'node:fs';
import {avatarShapes,drawShapes} from '../dist/rendering/appearance.js';
import {emptyLoadout} from '../dist/shared/model.js';
import {weaponSocket} from '../dist/rendering/player-pose.js';
import {experienceShapes,chestShapes} from '../dist/rendering/loot-presentation.js';
// 复用正式造型，红色十字标记无后坐力时的真实挂载点。离线图元重放不是浏览器截图。
const commands=[];
function recorder(ox,oy){return {clear(){},drawPoly(x,y,p,fill,stroke,width=1){commands.push({type:'poly',p:p.map((n,i)=>n+(i%2?oy+y:ox+x)),fill,stroke,width});},drawRect(x,y,w,h,fill,stroke,width=1){commands.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width});}};}
const names=['右','右下','下','左下','左','左上','上','右上'];
for(const [row,w]of ['storm','flame','blade'].entries())for(let d=0;d<8;d++){
 const x=35+d*160,y=100+row*170;
 commands.push({type:'rect',p:[x,y,150,155],fill:'#263d2c'},{type:'label',text:w+' / '+names[d],x:x+4,y:y+5});
 const loadout={...emptyLoadout(w),back:{id:'pack',quality:1}};
 drawShapes(recorder(x+75,y+125),avatarShapes(loadout,false,1,0,d));
 const q=weaponSocket(w,d);commands.push({type:'lines',p:[x+71+q.x,y+125+q.y,x+79+q.x,y+125+q.y],stroke:'#ff6471',width:2},{type:'lines',p:[x+75+q.x,y+121+q.y,x+75+q.x,y+129+q.y],stroke:'#ff6471',width:2});
}
for(const [i,shapes]of [experienceShapes(),experienceShapes(true),chestShapes('#e2d3aa'),chestShapes('#8fceff'),chestShapes('#edbc62')].entries()){
 const x=90+i*240;drawShapes(recorder(x,700),shapes);commands.push({type:'label',text:['经验晶体','治疗晶体','普通宝箱','稀有宝箱','史诗宝箱'][i],x:x-35,y:725});
}
writeFileSync('artifacts/pose-loot-preview.json',JSON.stringify({width:1350,height:790,title:'八向造型 / 红色挂载点 / 掉落造型',commands}));
