import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialGrid} from '../dist/shared/model.js';
import {spawnEnemy, spawnBoss, updateSpawns} from '../dist/enemies/enemy-spawner.js';
import {updateEnemies} from '../dist/enemies/enemy-ai.js';

// 独立模块测试：不创建 Game 或 Laya，只观察世界数据和对外动作。
function fixture(time=0) {
  const state={time,player:{x:0,y:0},enemies:[],shots:[],fields:[],grid:new SpatialGrid(),spawnTimer:999,nextSurge:999,eliteIndex:0,bossSpawned:false};
  const released=[],painted=[],messages=[],rings=[],events=[];
  const hooks={acquire:()=>({}),release:n=>{released.push(n);events.push('release');},paintEnemy:e=>{painted.push(e);events.push('paint');},clearTransient:()=>events.push('clear'),ring:(...a)=>rings.push(a),onToast:m=>messages.push(m)};
  return {state,hooks,released,painted,messages,rings,events};
}
function enemy(f,kind,x,y,extra={}) {
  spawnEnemy(f.state,f.hooks,kind,400,0);
  return Object.assign(f.state.enemies.at(-1),{x,y,cooldown:999,...extra});
}
function aiFixture(f) {
  const shots=[],hits=[],hurts=[],rings=[];
  let battle=true;
  const state={time:f.state.time,player:f.state.player,enemies:f.state.enemies,pillars:[],grid:f.state.grid};
  state.grid.rebuild(state.enemies);
  const hooks={speedMultiplier:()=>1,hit:(...a)=>hits.push(a),hurt:d=>hurts.push(d),shoot:(...a)=>shots.push(a),ring:(...a)=>rings.push(a),isBattle:()=>battle};
  return {state,hooks,shots,hits,hurts,rings,stop:()=>{battle=false;}};
}

test('spawner preserves random consumption at capacity and replaces one ordinary for an elite',()=>{
  const f=fixture(270),oldRandom=Math.random;let calls=0;
  Math.random=()=>{calls++;return .5;};
  try {
    for(let i=0;i<240;i++)spawnEnemy(f.state,f.hooks,0,400,0);
    const first=f.state.enemies[0],before=calls;
    spawnEnemy(f.state,f.hooks,0);
    assert.equal(calls-before,2); // 被拒绝的生成仍计算默认距离和角度，不计算冷却。
    assert.equal(f.state.enemies.length,240);assert.equal(f.released.length,0);
    spawnEnemy(f.state,f.hooks,3,400,0);
    assert.equal(f.state.enemies.length,240);assert.equal(f.released[0],first.node);
    assert.equal(f.state.enemies.includes(first),false);assert.equal(f.state.enemies.at(-1).kind,3);
    f.state.enemies.forEach(e=>{e.kind=3;});
    spawnEnemy(f.state,f.hooks,3,400,0);
    assert.equal(f.released.length,1);assert.equal(f.state.enemies.length,240);
  }finally{Math.random=oldRandom;}
});

test('Boss transition returns old nodes, clears transient combat and schedules reinforcements once',()=>{
  const f=fixture(300),old=enemy(f,0,400,0),shot={node:{}};
  f.state.shots.push(shot);f.state.fields.push({life:3});f.state.grid.rebuild(f.state.enemies);
  spawnBoss(f.state,f.hooks);
  assert.deepEqual(f.released,[old.node,shot.node]);assert.equal(f.events.at(-4),'clear');
  assert.equal(f.state.shots.length,0);assert.equal(f.state.fields.length,0);
  assert.equal(f.state.grid.query(400,0,1000).length,0);
  assert.equal(f.state.enemies.length,1);assert.equal(f.state.enemies[0].max,8400);
  assert.equal(f.state.bossSpawned,true);assert.equal(f.state.spawnTimer,3);
  f.state.eliteIndex=4;f.state.time=303;
  updateSpawns(f.state,f.hooks,3);
  assert.deepEqual(f.state.enemies.map(e=>e.kind),[4,2,1,2]);assert.equal(f.state.spawnTimer,5);
  assert.equal(f.messages.length,1);
  f.state.time=360;updateSpawns(f.state,f.hooks,5);
  assert.equal(f.state.enemies.length,4);
});

test('wave clock preserves surge and elite boundaries without changing run time',()=>{
  const f=fixture(11.99);f.state.nextSurge=12;
  updateSpawns(f.state,f.hooks,.01);assert.equal(f.state.enemies.length,0);
  f.state.time=12;updateSpawns(f.state,f.hooks,.01);
  assert.equal(f.state.enemies.length,8);assert.equal(f.state.nextSurge,36);assert.equal(f.state.time,12);
  f.state.time=45;f.state.nextSurge=999;updateSpawns(f.state,f.hooks,.01);
  assert.equal(f.state.eliteIndex,1);assert.equal(f.state.enemies.filter(e=>e.kind===3).length,1);
  updateSpawns(f.state,f.hooks,.01);assert.equal(f.state.eliteIndex,1);
});

test('ranged telegraph keeps its captured aim after the player moves',()=>{
  const f=fixture(270),e=enemy(f,1,400,0,{cooldown:0}),a=aiFixture(f);
  updateEnemies(a.state,a.hooks,.01);assert.equal(e.wind,.45);assert.equal(a.shots.length,0);
  f.state.player.y=500;updateEnemies(a.state,a.hooks,.46);
  assert.equal(a.shots.length,3);
  assert.equal(e.action,'cast');assert.equal(e.actionTime,.26);assert.ok(a.shots.every(s=>s[7]===e));
  const center=a.shots[1];assert.ok(center[2]<0);assert.ok(Math.abs(center[3])<1e-10);
  assert.ok(a.shots.every(s=>s[5]===true));
});

test('charger waits for telegraph completion and applies slow during its captured-direction charge',()=>{
  const f=fixture(),e=enemy(f,2,400,0,{cooldown:0}),a=aiFixture(f);
  updateEnemies(a.state,a.hooks,.01);assert.equal(e.wind,.75);
  const x=e.x;updateEnemies(a.state,a.hooks,.76);
  assert.equal(e.x,x);assert.equal(e.charge,.45);
  assert.equal(e.action,'launch');assert.equal(e.actionTime,.18);
  a.hooks.speedMultiplier=()=>.5;
  f.state.player.y=500;updateEnemies(a.state,a.hooks,.1);
  assert.ok(Math.abs(e.x-(x-27))<1e-9);assert.equal(e.y,0);
  updateEnemies(a.state,a.hooks,.36);assert.equal(e.action,'brake');assert.equal(e.actionTime,.24);
});

test('Boss ground attack uses telegraphed position and half-health volley has 24 shots',()=>{
  const f=fixture(300),e=enemy(f,4,400,0,{cooldown:0}),a=aiFixture(f),oldRandom=Math.random;
  Math.random=()=>0;
  try{updateEnemies(a.state,a.hooks,.01);}finally{Math.random=oldRandom;}
  assert.equal(e.wind,.85);assert.equal(e.dx,0);assert.equal(e.dy,0);
  f.state.player.y=500;updateEnemies(a.state,a.hooks,.86);
  assert.equal(a.hurts.length,0);assert.deepEqual(a.rings[0],[0,0,'#f6ac82']);
  assert.equal(e.action,'slam');assert.equal(e.actionTime,.34);
  e.cooldown=0;e.hp=e.max*.4;Math.random=()=>.9;
  try{updateEnemies(a.state,a.hooks,.01);}finally{Math.random=oldRandom;}
  assert.equal(a.shots.length,24);
  assert.equal(e.action,'burst');assert.equal(e.actionTime,.3);
});

test('burn death prevents attacks and live battle status stops subsequent enemy updates',()=>{
  const f=fixture(),burning=enemy(f,1,400,0,{burn:1,burnD:12,wind:.01}),next=enemy(f,0,0,0),last=enemy(f,0,500,0),a=aiFixture(f);
  a.hooks.hit=(e,damage,options)=>{assert.ok(Math.abs(damage-1.2)<1e-12);assert.deepEqual(options,{impact:false,round:false});e.dead=true;};
  a.hooks.hurt=()=>a.stop();
  const cooldown=last.cooldown;
  updateEnemies(a.state,a.hooks,.1);
  assert.equal(burning.dead,true);assert.equal(a.shots.length,0);assert.ok(next.cooldown<999);
  assert.equal(last.cooldown,cooldown);assert.equal(f.state.enemies.length,3);
});
