import {writeFileSync} from 'node:fs';
import {avatarShapes,drawShapes} from '../dist/rendering/appearance.js';
import {emptyLoadout} from '../dist/shared/model.js';
import {CAST_DURATION,weaponSocket} from '../dist/rendering/player-pose.js';
// 正式角色绘图的动作联系表：只重放 Graphics，不替代浏览器动画验收。
const commands=[];
function recorder(ox,oy){return {clear(){},drawPoly(x,y,p,fill,stroke,width=1){commands.push({type:'poly',p:p.map((n,i)=>n+(i%2?oy+y:ox+x)),fill,stroke,width});},drawRect(x,y,w,h,fill,stroke,width=1){commands.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width});}};}
for(const [row,w]of ['storm','flame','blade'].entries())for(const [col,f]of [-1,0,.3,.65,1].entries()){
 const x=35+col*235,y=100+row*290,remaining=f<0?0:CAST_DURATION[w]*(1-f);
 commands.push({type:'rect',p:[x,y,220,275],fill:'#263d2c'},{type:'label',text:w+' / '+['待机','释放','随动','收招','复位'][col],x:x+8,y:y+8});
 for(const [n,d]of [0,7].entries()){
  const oy=y+137+n*120;
  drawShapes(recorder(x+110,oy),avatarShapes({...emptyLoadout(w),back:{id:'pack',quality:1}},false,1,0,d,remaining));
  const q=weaponSocket(w,d,0,remaining);commands.push({type:'lines',p:[x+107+q.x,oy+q.y,x+113+q.x,oy+q.y],stroke:'#ff6471',width:1});
 }
}
writeFileSync('artifacts/cast-preview.json',JSON.stringify({width:1230,height:990,title:'施放动作 / 上排右向、下排右上 / 红线为挂载点',commands}));
