import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatAccentBudget,dashWake,impactFlecks} from '../dist/rendering/combat-accents.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();const {Game}=await import('../dist/game/game.js');
const record=()=>{const calls=[];return {calls,g:{drawPoly:(...args)=>calls.push(args)}};};
test('dense combat caps duplicate decoration but never consumes attack paths or bounds',()=>{
 const b=new CombatAccentBudget();b.reset(10,60,200);assert.equal(b.detail,3);
 const counts={};for(const kind of ['weaponHit','dash','impact','burst','line','blast','slash','death','cast','ring']){b.reset(10,60,200);counts[kind]=Array.from({length:60},()=>b.take(kind)).filter(Boolean).length;}
 assert.deepEqual(counts,{weaponHit:9,dash:4,impact:8,burst:8,line:60,blast:60,slash:60,death:60,cast:60,ring:60});
 b.reset(10,0,0);assert.equal(b.detail,10);assert.equal(Array.from({length:60},()=>b.take('weaponHit')).filter(Boolean).length,18);
 b.reset(5,0,0);assert.equal(b.take('dash'),true,'budget resets every render, not on simulation time');
});
test('dash wake follows captured direction, tapers away and flecks expire without simulation or RNG writes',()=>{
 const random=Math.random;Math.random=()=>{throw Error('visual RNG');};
 try{for(const tx of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const t of [0,.3,.8,1]){
  const effect=Object.freeze({x:40,y:20,life:1-t,max:1,tx,color:'#dfbc86',kind:'impact'}),a=record(),b=record();
  dashWake(a.g,effect);impactFlecks(b.g,effect,10);assert.ok(a.calls.length<=2);assert.ok(b.calls.length<=4);
  if(t===1){assert.equal(a.calls.length,0);assert.equal(b.calls.length,0);}
  for(const n of [...a.calls,...b.calls].flat(Infinity))if(typeof n==='number')assert.ok(Number.isFinite(n));
  const again=record();dashWake(again.g,effect);assert.deepEqual(a.calls,again.calls);
 }
 const a=record(),b=record();dashWake(a.g,{x:0,y:0,life:1,max:1,tx:0});dashWake(b.g,{x:0,y:0,life:1,max:1,tx:Math.PI});assert.notDeepEqual(a.calls,b.calls);
 }finally{Math.random=random;}
});
test('real dash stores its original heading in wake effects while gameplay continues normally',()=>{
 const g=new Game();g.sound=false;g.start('storm',true);g.player.dx=0;g.player.dy=1;g.dash();g.update(1/60);
 const wake=g.fx.find(e=>e.kind==='dash');assert.ok(wake);assert.equal(wake.tx,Math.PI/2);
 g.player.dx=1;g.player.dy=0;assert.equal(wake.tx,Math.PI/2);assert.ok(g.player.dash>0);
});
