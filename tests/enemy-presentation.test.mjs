import test from 'node:test';
import assert from 'node:assert/strict';
import {enemyPose, enemyWindProgress, drawEnemyDeath,drawRangedWarning,drawChargeWarning,drawEnemyRelease} from '../dist/rendering/enemy-presentation.js';
import {project} from '../dist/shared/model.js';
import {enemyShapes} from '../dist/rendering/voxel.js';
import {enemyArtPose,ENEMY_ACTION_SECONDS} from '../dist/enemies/enemy-actions.js';

test('attack articulation differs from idle and stays finite within the 40-shape budget in both quality modes',()=>{
 const old=Math.random;Math.random=()=>{throw Error('visual consumed RNG');};
 try{for(const [kind,action]of [[1,'cast'],[2,'launch'],[2,'brake'],[3,'burst'],[4,'slam']])for(const detail of [false,true]){
  const e=Object.freeze({kind,x:10,y:30,dx:1,dy:0,flash:0,wind:0,charge:kind===2?.2:0,action,actionTime:ENEMY_ACTION_SECONDS[action]});
  const art=enemyArtPose(e),shapes=enemyShapes(kind,false,detail,art),pose=enemyPose(e,1,false);
  assert.ok(shapes.length<=40);assert.ok(shapes.every(s=>s.p.every(Number.isFinite)));assert.ok(Object.values(pose).every(Number.isFinite));
  if(kind!==2)assert.notDeepEqual(shapes,enemyShapes(kind,false,detail,enemyArtPose({...e,actionTime:0})));
  const calls=[],g=Object.fromEntries(['drawPoly','drawRect','drawLines'].map(n=>[n,(...a)=>calls.push(a)]));
  drawEnemyRelease(g,g,e,1,detail);assert.ok(calls.length<=3);assert.ok(calls.flat(Infinity).filter(v=>typeof v==='number').every(Number.isFinite));
 }}finally{Math.random=old;}
});

test('orange warning brightens at the end, keeps a thin centerline and clears on launch',()=>{
 const e={kind:2,x:0,y:0,dx:1,dy:0,radius:20,wind:.74};
 const calls=[],floor={drawPoly:(...a)=>calls.push(a),drawLine:(...a)=>calls.push(a)};
 drawChargeWarning(floor,e);const early=calls.map(a=>a);assert.equal(calls.length,3);assert.ok(calls[1].at(-1)<=1);
 calls.length=0;drawChargeWarning(floor,{...e,wind:.01});assert.equal(calls.length,3);assert.notEqual(early[0].at(-2),calls[0].at(-2));assert.ok(calls[0].at(-1)>early[0].at(-1));
 calls.length=0;drawChargeWarning(floor,{...e,wind:0});assert.equal(calls.length,0);
});

test('ranged warning has eight bounded ground dashes along locked aim and expires with wind',()=>{
 const oldRandom=Math.random;Math.random=()=>{throw Error('visual consumed RNG');};
 try{for(let d=0;d<8;d++)for(const wind of [.45,.2,.01]){
  const e=Object.freeze({kind:1,x:30,y:10,wind,dx:Math.cos(d*Math.PI/4),dy:Math.sin(d*Math.PI/4),flash:0,dead:false});
  const lines=[],upper=[],floor={drawLine:(...a)=>lines.push(a),drawLines(){}},g={drawPoly:(...a)=>upper.push(a),drawLines:(...a)=>upper.push(a)};
  drawRangedWarning(g,floor,e,1,false);assert.equal(lines.length,8);assert.ok(upper.length<=3);
  const q=project(e.x,e.y),v=project(e.dx,e.dy);
  for(const [x,y,tx,ty,,width]of lines){assert.ok(Math.abs((x-q.x)*v.y-(y-q.y)*v.x)<1e-7);assert.ok(Math.abs((tx-q.x)*v.y-(ty-q.y)*v.x)<1e-7);assert.ok(width<=1.4);}
  lines.length=0;upper.length=0;drawRangedWarning(g,floor,{...e,wind:0},1,false);assert.equal(lines.length+upper.length,0);
 }}finally{Math.random=oldRandom;}
});

test('ranged charge centers on the posed staff crystal for both detail levels',()=>{
 const e={kind:1,x:40,y:60,wind:.1,dx:1,dy:0,flash:.05,icePaint:true};
 for(const detail of [false,true]){
  const calls=[],g={drawPoly:(...a)=>calls.push(a),drawLines(){}},floor={drawLine(){},drawLines(){}};
  drawRangedWarning(g,floor,e,.7,detail);
  const crystal=enemyShapes(1,true,detail,enemyArtPose(e)).filter(s=>s.part==='staff').at(-1).p;
  const center={x:0,y:0};for(let i=0;i<crystal.length;i+=2){center.x+=crystal[i]/(crystal.length/2);center.y+=crystal[i+1]/(crystal.length/2);}
  const q=project(e.x,e.y),pose=enemyPose(e,.7,true),a=pose.rotation*Math.PI/180,x=center.x*pose.sx,y=center.y*pose.sy;
  assert.ok(Math.abs(calls[0][0]-(q.x+x*Math.cos(a)-y*Math.sin(a)))<1e-8);
  assert.ok(Math.abs(calls[0][1]-(q.y-pose.lift+x*Math.sin(a)+y*Math.cos(a)))<1e-8);
 }
});

test('enemy poses are distinct, deterministic and leave combat snapshots unchanged',()=>{
  const poses=[];
  for(let kind=0;kind<5;kind++){
    const e=Object.freeze({kind,x:70,y:20,flash:0,wind:0,charge:0,dx:1,dy:0});
    const before=JSON.stringify(e),pose=enemyPose(e,.7,false);
    poses.push(JSON.stringify(pose));
    assert.deepEqual(pose,enemyPose(e,.7,false));assert.equal(JSON.stringify(e),before);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(pose.sx>.7&&pose.sx<1.4&&pose.sy>.7&&pose.sy<1.4);
    assert.notDeepEqual(pose,enemyPose(e,1.2,false));
  }
  assert.equal(new Set(poses).size,5);
});

test('telegraph compresses charger, hit recoil overlays it, and slow changes gait without changing wind progress',()=>{
  const e={kind:2,x:0,y:0,flash:0,wind:.375,charge:0,dx:1,dy:0};
  const wind=enemyPose(e,1,false);assert.ok(wind.sx>1&&wind.sy<1);
  const hit=enemyPose({...e,flash:.05},1,false);assert.ok(hit.sx>wind.sx&&hit.sy<wind.sy);
  assert.equal(enemyWindProgress(e),.5);assert.equal(enemyWindProgress({...e,wind:99}),0);
  assert.equal(enemyWindProgress({...e,wind:-1}),1);
  const walking={...e,wind:0};assert.notDeepEqual(enemyPose(walking,1,false),enemyPose(walking,1,true));
});

test('death fragments obey quality budgets with finite geometry and never consume combat RNG',()=>{
  const random=Math.random;Math.random=()=>{throw Error('visuals consumed combat RNG');};
  try{
    for(let kind=0;kind<5;kind++)for(const debris of [3,5,10])for(const t of [0,.15,.5,.95,1]){
      const calls=[],g={drawRect:(...a)=>calls.push(a)};
      const effect=Object.freeze({x:80,y:20,kind:'death',life:(1-t)*.52,max:.52,tx:kind>=3?58:30,ty:kind,color:'#aabbcc'});
      drawEnemyDeath(g,effect,debris);
      assert.ok(calls.length<=(kind>=3?debris:Math.min(5,debris))+1);
      assert.ok(calls.every(c=>c.slice(0,4).every(Number.isFinite)&&c[2]>0&&c[3]>0));
      enemyPose({kind,x:0,y:0,wind:0,charge:0,flash:0},t,false);
    }
  }finally{Math.random=random;}
});

test('enemy silhouettes retain bounded shape counts on both detail settings',()=>{
  for(let kind=0;kind<5;kind++)for(const detail of [false,true])for(const flash of [false,true]){
    const shapes=enemyShapes(kind,flash,detail);
    assert.ok(shapes.length<=40);assert.ok(shapes.every(s=>s.p.every(Number.isFinite)));
  }
});
