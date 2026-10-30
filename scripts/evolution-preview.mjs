import {writeFileSync} from 'node:fs';
import {BuffRuntime,FRAGMENTS} from '../dist/buffs/buffs.js';
import {EVOLUTIONS} from '../dist/buffs/buff-evolutions.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {drawShapes} from '../dist/rendering/appearance.js';
import {project} from '../dist/shared/model.js';
// 直接推进正式进化状态并重放正式绘图；不代替浏览器截图、交互或性能验收。
const commands=[];
function recorder(ox,oy){const move=p=>p.map((v,i)=>v+(i%2?oy:ox));return {
 clear(){},drawPoly:(x,y,p,fill,stroke,width=1)=>commands.push({type:'poly',p:move(p.map((v,i)=>v+(i%2?y:x))),fill,stroke,width}),
 drawRect:(x,y,w,h,fill,stroke,width=1)=>commands.push({type:'rect',p:[x+ox,y+oy,w,h],fill,stroke,width}),
 drawLine:(x,y,tx,ty,stroke,width=1)=>commands.push({type:'lines',p:move([x,y,tx,ty]),stroke,width}),
 drawLines:(x,y,p,stroke,width=1)=>commands.push({type:'lines',p:move(p.map((v,i)=>v+(i%2?y:x))),stroke,width}),
};}
for(let row=0;row<2;row++)for(const [col,definition]of EVOLUTIONS.entries()){
 const x=24+col*366,y=90+row*270;
 commands.push({type:'rect',p:[x,y,350,250],fill:'#213729'},{type:'label',text:definition.name+' / '+(row?'触发进化':'叠层或布置'),x:x+12,y:y+12});
 const targets=(col===1?[[0,0],[30,0],[0,25]]:[[60,0],[110,20],[50,60]]).map(([x,y])=>({x,y,dead:false,hp:100000}));
 let total=0;
 const runtime=new BuffRuntime({player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>Math.hypot(t.x-x,t.y-y)<=r),damage:(target,value)=>{target.hp-=value;total+=value;},knock(){}});
 for(const f of FRAGMENTS)runtime.grant(f.id);runtime.setVisualBudget(24);
 if(col===1){runtime.evolutions.seed(-120,0,10);if(row){runtime.evolutions.seed(120,0,10);runtime.update(.01);}}
 else for(let n=0;n<(row?3:2);n++)runtime.evolutions.hit(targets[0],{kind:definition.action,element:definition.element,damage:col===0?26:12});
 // 先地面、再靶子、再上层表现，保留和实际场景一致的基本层序。
 const floor=[],over=[];
 const capture=list=>{const r=recorder(x+175,y+185);return Object.fromEntries(Object.entries(r).map(([key,fn])=>[key,(...args)=>{const start=commands.length;fn(...args);list.push(...commands.splice(start));}]));};
 runtime.render(capture(over),project,capture(floor));commands.push(...floor);
 for(const target of targets){const q=project(target.x,target.y);drawShapes(recorder(x+175+q.x,y+185+q.y),enemyShapes(0,false,false));}
 commands.push(...over,{type:'label',text:col===1?`火种 ${runtime.evolutions.seeds.length} / 连线 ${runtime.evolutions.links.length}`:row?`额外伤害 ${Math.round(total)} / 爆发后短暂锁层`:'同一目标累积 2 / 3 层',x:x+12,y:y+221});
}
writeFileSync('artifacts/evolution-preview.json',JSON.stringify({width:1128,height:650,title:'Buff 专属进化 · 正式规则与图元离线检查',commands}));
