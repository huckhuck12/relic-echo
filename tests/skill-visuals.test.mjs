import test from 'node:test';
import assert from 'node:assert/strict';
import {lightningStroke,paintFlameShot,slashRibbon,orbitBlade,flameBurst,burningGround,castFlash,bladePulse,drawBladeOrbit} from '../dist/rendering/skill-visuals.js';
import {drawBuffEffect,buffVisualTier,buffRankSeal} from '../dist/buffs/buff-visuals.js';
import {drawEvolutionBurst} from '../dist/buffs/buff-evolution-visuals.js';
import {project} from '../dist/shared/model.js';

function recorder(){
 const calls=[];
 return {calls,g:Object.fromEntries(['drawLines','drawLine','drawPoly','drawRect'].map(name=>[name,(...args)=>calls.push({name,args})]))};
}
function finite(calls){for(const c of calls)for(const v of c.args.flat())if(typeof v==='number')assert.ok(Number.isFinite(v));}

test('all Buff combinations distinguish three level tiers within bounded deterministic graphics',()=>{
 const original=Math.random;Math.random=()=>{throw Error('render consumed RNG');};
 try{for(const kind of ['bolt','blast','field','orbit'])for(const element of ['fire','ice','lightning','force'])for(const detail of [3,5,8]){
  const signatures=[];let base;
  for(const level of [1,2,3,4,5]){
   const e=Object.freeze({kind,element,x:0,y:0,vx:480,vy:0,age:.08,level}),out=recorder(),floor=recorder();
   drawBuffEffect(out.g,floor.g,project,e,detail);const all=[...out.calls,...floor.calls];finite(all);
   if(level===1)base=all.length;assert.ok(all.length<=base+4);assert.ok(all.length<60);
   if(kind==='field')assert.equal(out.calls.length,0);
   signatures.push(JSON.stringify([out.calls,floor.calls]));
   const again=recorder(),againFloor=recorder();drawBuffEffect(again.g,againFloor.g,project,e,detail);
   assert.equal(JSON.stringify([again.calls,againFloor.calls]),signatures.at(-1));
  }
  assert.equal(signatures[0],signatures[1]);assert.equal(signatures[2],signatures[3]);
  assert.equal(new Set(signatures).size,3,`${kind}/${element}/${detail}`);
 }}finally{Math.random=original;}
 assert.deepEqual([1,2,3,4,5].map(buffVisualTier),[0,0,1,1,2]);
});

test('rank seals stay inside their assigned world radius and simplify without losing tier identity',()=>{
 for(const level of [3,5])for(const detail of [3,8]){
  const out=recorder();buffRankSeal(out.g,project,0,0,'fire',level,.08,32,detail);finite(out.calls);
  assert.ok(out.calls.length<=(detail===3?1:3));
  const points=out.calls[0].args[2];for(let i=0;i<points.length;i+=2){const x=points[i]/(2*.7071)+points[i+1]/(2*.3536),y=points[i+1]/(2*.3536)-points[i]/(2*.7071);assert.ok(Math.hypot(x,y)<=32+.001);}
 }
});

test('evolution burst tier signatures remain finite and bounded at both quality settings',()=>{
 for(const kind of ['detonate','shatter'])for(const detail of [3,8]){
  const signatures=[];for(const level of [1,3,5]){
   const out=recorder(),floor=recorder();drawEvolutionBurst(out.g,floor.g,project,kind,0,0,.2,level,detail);
   finite([...out.calls,...floor.calls]);assert.ok(out.calls.length+floor.calls.length<=7);
   signatures.push(JSON.stringify([out.calls,floor.calls]));
  }assert.equal(new Set(signatures).size,3);
 }
});

test('guided blade pulse stays within damage radius without a filled melee sweep and bounds orbit graphics',()=>{
 for(const t of [0,.3,.8,1]){
  const out=recorder();bladePulse(out.g,0,0,210,.4,t);finite(out.calls);assert.ok(out.calls.length<=6);assert.ok(out.calls.every(c=>c.name==='drawLines'));
  for(const c of out.calls){const points=c.args[2];for(let i=0;i<points.length;i+=2){const sx=points[i],sy=points[i+1]+18,x=sx/(2*.7071)+sy/(2*.3536),y=sy/(2*.3536)-sx/(2*.7071);assert.ok(Math.hypot(x,y)<=210+.001);}}
  const blades=recorder();drawBladeOrbit(blades.g,10,20,t,.22*(1-t),210,7,1);finite(blades.calls);assert.ok(blades.calls.length<=28);
 }
});

test('weapon graphics remain bounded, finite and deterministic without drawing from combat RNG',()=>{
 const random=Math.random;Math.random=()=>{throw Error('visuals consumed combat RNG');};
 try{
  for(const t of [0,.1,.5,.99,1])for(const detail of [3,5,10]){
   const out=recorder();
   lightningStroke(out.g,0,0,2000,1000,t,1-t);
   paintFlameShot(out.g,680,0);paintFlameShot(out.g,0,0);
   slashRibbon(out.g,0,0,150,t*2,t);orbitBlade(out.g,30,20,t*7);
   flameBurst(out.g,40,20,105,t,detail);burningGround(out.g,0,0,85,t,detail);castFlash(out.g,0,0,1,1,t,'#ffaa55');
   finite(out.calls);assert.ok(out.calls.length<50);
  }
 }finally{Math.random=random;}
});

test('lightning joins exact endpoints with at most ten segments even on a long chain',()=>{
 const out=recorder();lightningStroke(out.g,10,20,5000,-30,.08,.8);
 const paths=out.calls.filter(c=>c.name==='drawLines').slice(0,3);
 assert.equal(paths.length,3);
 for(const c of paths){const p=c.args[2];assert.deepEqual(p.slice(0,2),[10,20]);assert.deepEqual(p.slice(-2),[5000,-30]);assert.ok(p.length<=22);}
 assert.deepEqual(paths[0].args[2],paths[2].args[2]);
});

test('blade sweep stays within its world attack radius and has a filled taper plus bright edge',()=>{
 const out=recorder(),radius=150;slashRibbon(out.g,0,0,radius,.8,.1);
 const fill=out.calls.find(c=>c.name==='drawPoly'),points=fill.args[2];
 assert.equal(points.length,68);assert.equal(out.calls.filter(c=>c.name==='drawLines').length,2);
 // 逆投影检查厚度面片，不能把视觉扩到比真实范围更远。
 for(let i=0;i<points.length;i+=2){const sx=points[i],sy=points[i+1]+18,x=sx/(2*.7071)+sy/(2*.3536),y=sy/(2*.3536)-sx/(2*.7071);assert.ok(Math.hypot(x,y)<=radius+.05);}
});

test('fire projectile points with velocity and is cached as four directional polygons',()=>{
 const a=recorder(),b=recorder();paintFlameShot(a.g,680,0);paintFlameShot(b.g,-680,0);
 assert.equal(a.calls.length,4);assert.ok(a.calls.every(c=>c.name==='drawPoly'));
 const p=a.calls[0].args[2],q=b.calls[0].args[2];
 for(let i=0;i<p.length;i+=2){assert.ok(Math.abs(p[i]+q[i])<1e-9);assert.ok(Math.abs(p[i+1]+q[i+1]+36)<1e-9);}
});

test('Buff elements have distinct silhouettes and preserve input snapshots at every quality',()=>{
 for(const kind of ['bolt','blast','field','orbit']){
  const signatures=new Set();
  for(const element of ['fire','ice','lightning','force'])for(const detail of [3,5,8]){
   const e=Object.freeze({kind,element,x:0,y:0,vx:480,vy:0,age:.08}),before=JSON.stringify(e),out=recorder(),floor=recorder();
   drawBuffEffect(out.g,floor.g,project,e,detail);finite([...out.calls,...floor.calls]);
   assert.equal(JSON.stringify(e),before);assert.ok(out.calls.length+floor.calls.length<55);
   if(detail===5)signatures.add(JSON.stringify([out.calls,floor.calls]));
   if(kind==='field'){assert.equal(out.calls.length,0);assert.ok(floor.calls.length>0);}
  }
  assert.equal(signatures.size,4);
 }
});
