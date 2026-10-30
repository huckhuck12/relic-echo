import {writeFileSync} from 'node:fs';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {enemyPose,drawEnemyDeath} from '../dist/rendering/enemy-presentation.js';
import {enemyArtPose,ENEMY_ACTION_SECONDS} from '../dist/enemies/enemy-actions.js';
// 正式绘图数据的离线联系表，不是浏览器截图；用于检查轮廓、姿态和碎裂形状。
const names=['苔藓史莱姆','骸骨法师','獠牙野猪','精英石像','遗迹核心'];
const rows=['移动','蓄力','出手','收招','受击','碎裂'],commands=[];
for(let row=0;row<6;row++)for(let kind=0;kind<5;kind++){
 const x=140+kind*245,y=220+row*190;
 commands.push({type:'label',text:names[kind]+' · '+rows[row],x:x-108,y:y-157,w:220});
 commands.push({type:'rect',p:[x-110,y-125,220,150],fill:'#213729'});
 const e={kind,x:0,y:0,flash:row===4?.07:0,wind:row===1&&[1,2,4].includes(kind)?.15:0,charge:kind===2&&row===2?.4:0,dx:1,dy:0};
 if((row===2||row===3)&&kind>0){e.action=kind===1?'cast':kind===2?(row===2?'launch':'brake'):kind===3?'burst':'slam';e.actionTime=ENEMY_ACTION_SECONDS[e.action]*(row===2?1:.35);}
 if(row===5){
  drawEnemyDeath({drawRect:(...a)=>commands.push({type:'rect',p:[x+a[0],y+a[1],a[2],a[3]],fill:a[4]})},{x:0,y:0,life:.3,max:.52,tx:kind>=3?58:30,ty:kind,color:['#93b962','#c7a1e4','#d79459','#99aa7c','#e2ae65'][kind]},5);
  continue;
 }
 const pose=enemyPose(e,.8,false),a=pose.rotation*Math.PI/180;
 const previewScale=kind===4?.8:1;
 const point=(px,py)=>{px*=pose.sx*previewScale;py*=pose.sy*previewScale;return [x+px*Math.cos(a)-py*Math.sin(a),y-pose.lift+px*Math.sin(a)+py*Math.cos(a)];};
 for(const shape of enemyShapes(kind,row===4,false,enemyArtPose(e))){
  const p=shape.p,vertices=shape.type==='rect'?[p[0],p[1],p[0]+p[2],p[1],p[0]+p[2],p[1]+p[3],p[0],p[1]+p[3]]:p;
  const projected=[];for(let i=0;i<vertices.length;i+=2)projected.push(...point(vertices[i],vertices[i+1]));
  commands.push({type:'poly',p:projected,fill:shape.fill});
 }
}
writeFileSync('artifacts/enemy-preview.json',JSON.stringify({width:1280,height:1230,title:'怪物出手与收招 · 标准画质 / 正式形状离线绘制',commands}));
