import test from 'node:test';
import assert from 'node:assert/strict';
import {paintHostileShot} from '../dist/rendering/projectile-presentation.js';
import {experienceShapes,fragmentShapes,lootPose} from '../dist/rendering/loot-presentation.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';

test('hostile shots have four directional polygons without loot-like white square cores or RNG',()=>{
 const random=Math.random;Math.random=()=>{throw Error('presentation consumed RNG');};
 try{
  for(const [vx,vy]of [[0,0],[1,0],[0,1],[-1,1],[10000,-10000]]){
   const calls=[],g={drawPoly:(...args)=>calls.push(args)};
   paintHostileShot(g,vx,vy,'#c99bef');assert.equal(calls.length,4);
   for(const c of calls)for(const value of c.flat())if(typeof value==='number')assert.ok(Number.isFinite(value));
   assert.ok(calls.some(c=>c[3]==='#ff778b'));assert.ok(calls.some(c=>c[3]==='#c99bef'));
   const before=JSON.stringify(calls);calls.length=0;paintHostileShot(g,vx,vy,'#c99bef');assert.equal(JSON.stringify(calls),before);
  }
  const points=(vx,vy)=>{const result=[];paintHostileShot({drawPoly:(_x,_y,p)=>result.push(p)},vx,vy,'#c99bef');return result;};
  const a=points(1,0),b=points(-1,0);
  for(let j=0;j<a.length;j++)for(let i=0;i<a[j].length;i+=2){assert.ok(Math.abs(a[j][i]+b[j][i])<1e-9);assert.ok(Math.abs(a[j][i+1]+b[j][i+1]+36)<1e-9);}
 }finally{Math.random=random;}
});

test('reward shapes and low floating pose distinguish XP, healing and fragments',()=>{
 const shapes=[experienceShapes(),experienceShapes(true),fragmentShapes()];
 assert.equal(new Set(shapes.map(s=>JSON.stringify(s))).size,3);
 for(const group of shapes){assert.ok(group.length<=7);assert.ok(group.every(s=>s.p.every(Number.isFinite)));assert.ok(group.every(s=>s.fill!=='#ff778b'));}
 const drop=Object.freeze({x:0,y:0,xp:1,collecting:false});
 for(const time of [0,1,3,9]){
  const pose=lootPose(drop,time);assert.ok(pose.lift>=.19&&pose.lift<=1.41);assert.deepEqual(lootPose(drop,time),pose);
 }
 const collecting=lootPose({...drop,collecting:true},0);assert.ok(collecting.sx>1);assert.ok(collecting.sy<1);
});

setupLayaStub();
const {Game}=await import('../dist/game/game.js');
test('live hostile shots cache their danger shape and keep original ground trajectory and damage',()=>{
 const g=new Game();g.start('storm',true);g.shoot(100,90,120,-40,35,true,'#c99bef');
 const s=g.shots.at(-1);let paints=0;s.node.graphics.clear=()=>paints++;s.node.graphics.drawPoly=()=>paints++;
 g.updateShots(.1);g.render();g.render();
 assert.equal(s.x,112);assert.equal(s.y,86);assert.equal(s.damage,35);assert.equal(s.life,5.9);assert.equal(paints,0);
});
