import test from 'node:test';
import assert from 'node:assert/strict';
import {setupLayaStub} from './helpers/laya-stub.mjs';
import {drawHitFeedback,HIT_SECONDS} from '../dist/rendering/hit-feedback.js';
import {enemyPose} from '../dist/rendering/enemy-presentation.js';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const create=()=>{const g=new Game();g.start('storm',true);for(let i=0;i<2;i++)for(const part of ['trigger','action','element'])g.buffs.install(i,part,null);return g;};

test('hit shapes are distinct, finite, deterministic, expired and bounded without combat RNG',()=>{
 const random=Math.random;Math.random=()=>{throw Error('presentation consumed RNG');};
 try{
  const silhouettes=[];
  for(let ty=0;ty<3;ty++)for(const t of [0,.2,.6,1]){
   const calls=[],g=Object.fromEntries(['drawLines','drawPoly','drawRect'].map(name=>[name,(...args)=>calls.push([name,...args])]));
   const effect={x:30,y:20,life:1-t,max:1,tx:.8,ty};
   drawHitFeedback(g,effect);assert.ok(calls.length<=6);
   for(const v of calls.flat(Infinity))if(typeof v==='number')assert.ok(Number.isFinite(v));
   if(t===0)silhouettes.push(JSON.stringify(calls));
   if(t===1)assert.equal(calls.length,0);
   const before=JSON.stringify(calls);calls.length=0;drawHitFeedback(g,effect);assert.equal(JSON.stringify(calls),before);
  }
  assert.equal(new Set(silhouettes).size,3);
 }finally{Math.random=random;}
});

test('weapon feedback preserves damage, RNG consumption and physical knockback',()=>{
 const random=Math.random;
 function run(feedback){let draws=0;Math.random=()=>{draws++;return .8;};const g=create();g.spawnEnemy(0);const e=g.enemies.at(-1);Object.assign(e,{x:120,y:40,hp:99999,kx:0,ky:0});g.hit(e, 30, { canCrit: true, feedback: feedback });return {hp:e.hp,kx:e.kx,ky:e.ky,damage:g.damage,draws};}
 try{assert.deepEqual(run({weapon:'flame',dx:1,dy:0}),run(undefined));}finally{Math.random=random;}
});

test('real storm and blade hits select feedback; flame explosion keeps its source after swapping weapon',()=>{
 for(const weapon of ['storm','blade']){
  const g=create();g.start(weapon,true);g.spawnEnemy(0);const e=g.enemies.at(-1);Object.assign(e,{x:50,y:10,hp:99999,bladeCd:0});g.grid.rebuild(g.enemies);g.attack();
  assert.equal(e.hitReaction.weapon,weapon);assert.ok(g.fx.some(f=>f.kind==='weaponHit'));
 }
 const g=create();g.spawnEnemy(0);const e=g.enemies.at(-1);Object.assign(e,{x:80,y:0,hp:99999});g.grid.rebuild(g.enemies);
 g.shoot(70,0,680,0,20,false,'#ffaa55',true);g.updateShots(.01);
 assert.equal(g.loadout.weapon.id,'storm');assert.equal(e.hitReaction.weapon,'flame');assert.ok(e.hitReaction.dx>0);
});

test('reaction freezes with inventory, expires with simulation, respects FX caps and resets on restart',()=>{
 const g=create();g.spawnEnemy(0);const e=g.enemies.at(-1);e.hp=99999;
 for(let i=0;i<150;i++)g.hit(e, 1, { triggerBuffs: false, feedback: {weapon:'storm',dx:1,dy:0} });
 assert.ok(g.fx.length<=g.visuals.particles);
 g.toggleInventory();const before=structuredClone(e.hitReaction);g.loop.last=performance.now()-60;g.loop.frame();assert.deepEqual(e.hitReaction,before);
 g.close();g.updateEnemies(HIT_SECONDS.storm+.01);assert.equal(e.hitReaction.life,0);
 const pose=enemyPose(e,g.time,false);e.hitReaction=undefined;assert.deepEqual(enemyPose(e,g.time,false),pose);
 g.start('blade',true);assert.equal(g.fx.length,0);assert.ok(g.enemies.every(e=>!e.hitReaction));
});

test('three weapon simulations keep identical combat state with presentation enabled or disabled',()=>{
 const random=Math.random;
 function run(weapon,enabled){
  let seed=91827;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const g=create();g.start(weapon,true);g.spawnTimer=999;g.nextSurge=999;
  if(!enabled)g.weaponHooks.hit=(e,damage,{feedback,...options}={})=>g.hit(e,damage,options);
  for(let i=0;i<12;i++){g.spawnEnemy(i%3);Object.assign(g.enemies.at(-1),{x:60+i*7,y:i*6,hp:99999,max:99999});}
  for(let i=0;i<480;i++){if(g.dialog?.type==='upgrade')g.chooseUpgrade(g.dialog.choices[0]);g.update(1/60);g.render();}
  return {seed,time:g.time,damage:g.damage,kills:g.kills,player:{...g.player},
   enemies:g.enemies.map(({node,hitReaction,flashPaint,icePaint,actionPaint,...combat})=>combat),
   shots:g.shots.map(({node,...shot})=>shot),fields:g.fields};
 }
 try{for(const weapon of ['storm','flame','blade'])assert.deepEqual(run(weapon,true),run(weapon,false),weapon);}finally{Math.random=random;}
});
