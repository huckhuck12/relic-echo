import test from 'node:test';
import assert from 'node:assert/strict';
import {difficultyAt} from '../dist/game/difficulty.js';
import {RUNS} from '../dist/game/pace.js';
import {MapEvents,SEAL_REWARDS} from '../dist/game/map-events.js';
import {updateSpawns} from '../dist/enemies/enemy-spawner.js';
import {SpatialGrid} from '../dist/shared/model.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');

test('quick pressure stays unchanged while standard has a distinct bounded growth curve',()=>{
 const quick=difficultyAt(300),standard=difficultyAt(600,RUNS.standard);
 assert.equal(quick.batch,10);assert.equal(quick.pack,80);assert.equal(quick.damage,4.2);assert.equal(quick.speed,1.8);assert.equal(quick.spawnInterval,.22);
 assert.equal(standard.batch,6);assert.equal(standard.pack,44);assert.equal(standard.damage,3.2);assert.equal(standard.speed,1.6);assert.equal(standard.spawnInterval,.28);
 let previous=difficultyAt(0,RUNS.standard);
 for(let t=1;t<=720;t++){
  const d=difficultyAt(t,RUNS.standard);
  for(const key of ['hp','damage','speed','projectileSpeed','batch','pack'])assert.ok(d[key]>=previous[key]);
  assert.ok(d.maxEnemies<=240);assert.ok(d.spawnInterval>=.28);assert.ok(d.pack<=48);previous=d;
 }
});

test('only completed seals grant relief, reset removes it and Boss arrival caps it',()=>{
 const map=new MapEvents();map.reset(RUNS.standard);const site=map.sites[0],hooks={start(){},complete(){},announce(){}};
 map.update(75,site,1,RUNS.standard,hooks);assert.equal(map.reliefUntil,0);
 for(let t=76;t<=93;t++)map.update(t,site,1,RUNS.standard,hooks);
 assert.equal(site.state,'completed');assert.equal(map.reliefUntil,93+SEAL_REWARDS.reliefSeconds);
 map.reset(RUNS.standard);assert.equal(map.reliefUntil,0);
 const last=map.sites[3];last.state='active';last.startedAt=570;last.progress=17;
 map.update(599,last,1,RUNS.standard,hooks);assert.equal(last.state,'completed');assert.equal(map.reliefUntil,600);
 map.reset(RUNS.quick);assert.equal(map.reliefUntil,0);assert.equal(map.sites.length,0);
});

test('seal respite reduces new spawns, defers surges and never removes enemies or delays timed elites/Boss',()=>{
 const state={time:250,run:RUNS.standard,reliefUntil:270,player:{x:0,y:0},enemies:[],shots:[],fields:[],grid:new SpatialGrid(),spawnTimer:0,nextSurge:249,eliteIndex:2,bossSpawned:false};
 const hooks={acquire:()=>({}),release(){throw Error('should not clear enemies');},paintEnemy(){},clearTransient(){},ring(){},onToast(){}};
 updateSpawns(state,hooks,1/60);assert.equal(state.spawnTimer,difficultyAt(250,RUNS.standard).spawnInterval*2);
 assert.equal(state.nextSurge,249);assert.equal(state.eliteIndex,3);assert.ok(state.enemies.some(e=>e.kind===3));
 const prior=state.enemies[0];state.time=270;updateSpawns(state,hooks,1/60);assert.equal(state.nextSurge,270+difficultyAt(270,RUNS.standard).surgeInterval);assert.ok(state.enemies.includes(prior));
 const count=state.enemies.length;state.time+=1/60;updateSpawns(state,hooks,1/60);assert.equal(state.enemies.length,count);
 const g=new Game();g.start('storm',true,'standard');g.sound=false;g.level=2;g.mapEvents.reliefUntil=900;g.time=600;g.update(1/60);
 assert.ok(g.enemies.some(e=>e.kind===4));
});

test('seal choice gives actual bounded 15% plus a fragment or 45% healing with atomic stale protection',()=>{
 for(const [choice,hp]of [['fragment',65],['heal',95]]){
  const g=new Game();g.start('storm',true,'standard');g.sound=false;g.player.hp=50;
  g.show({type:'event',site:'test'});const id=g.flow.dialogId;
  assert.equal(g.claimReward(id,{type:'event',id:'invalid'}),false);assert.equal(g.player.hp,50);
  assert.equal(g.claimReward(id,{type:'event',id:choice}),true);assert.equal(g.player.hp,hp);
  assert.equal(g.claimReward(id,{type:'event',id:choice}),false);assert.equal(g.player.hp,hp);
  if(choice==='fragment'){assert.equal(g.dialog.type,'fragment');assert.equal(g.dialog.choices.length,3);}
 }
 const g=new Game();g.start('storm',true,'standard');g.player.hp=99;g.show({type:'event',site:'test'});
 g.claimReward(g.flow.dialogId,{type:'event',id:'fragment'});assert.equal(g.player.hp,100);
});

test('standard surges stop adding elites at three living elites while scheduled elites and quick surges remain',()=>{
 for(const [run,time,expected]of [[RUNS.standard,500,3],[RUNS.quick,250,5]]){
  const state={time,run,player:{x:0,y:0},enemies:Array.from({length:3},()=>({kind:3,dead:false})),shots:[],fields:[],grid:new SpatialGrid(),spawnTimer:999,nextSurge:time-1,eliteIndex:run.eliteTimes.length,bossSpawned:false};
  const hooks={acquire:()=>({}),release(){},paintEnemy(){},clearTransient(){},ring(){},onToast(){}};
  updateSpawns(state,hooks,1/60);assert.equal(state.enemies.filter(e=>e.kind===3).length,expected);
  if(run.id==='standard'){
   state.time=510;state.eliteIndex=5;state.nextSurge=999;updateSpawns(state,hooks,1/60);
   assert.equal(state.enemies.filter(e=>e.kind===3).length,4);assert.equal(state.eliteIndex,6);
  }
 }
});
