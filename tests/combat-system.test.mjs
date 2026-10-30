import test from 'node:test';
import assert from 'node:assert/strict';
import {damageEnemy,damagePlayer} from '../dist/combat/combat-system.js';
import {presentEnemyHit} from '../dist/combat/combat-feedback.js';

// 这些测试不创建 Game 或 Laya，确保伤害规则可以独立于显示层维护。
function fixture(extra={}){
 const enemy={x:90,y:0,hp:100,max:100,kind:0,kx:0,ky:0,dead:false,flash:0,...extra};
 const state=Object.freeze({player:Object.freeze({x:0,y:0}),time:0,crit:1});
 const events=[],results=[];
 const hooks={recordDamage:v=>events.push(['damage',v]),present:(e,r)=>{events.push(['present']);results.push(r);},
  killed:(e,proc)=>{assert.equal(e.dead,true);events.push(['kill',proc]);return e.kind===4;},triggerHit:()=>events.push(['hit'])};
 return {enemy,state,hooks,events,results};
}

test('direct damage samples crit once and orders feedback, death reward and hit dispatch',()=>{
 const f=fixture({hp:10}),random=Math.random;let draws=0;Math.random=()=>{draws++;return 0;};
 try{
  damageEnemy(f.state,f.hooks,f.enemy,10,{canCrit:true});
  assert.equal(draws,1);assert.equal(f.enemy.hp,-5);assert.equal(f.enemy.kx,210);
  assert.deepEqual(f.events,[['damage',15],['present'],['kill',true],['hit']]);
  assert.equal(f.results[0].critical,true);
 }finally{Math.random=random;}
});

test('death is marked before recursive damage and Boss terminal kills skip hit dispatch',()=>{
 const f=fixture({hp:1});
 f.hooks.killed=(enemy,proc)=>{assert.equal(enemy.dead,true);f.events.push(['kill',proc]);damageEnemy(f.state,f.hooks,enemy,50);return false;};
 damageEnemy(f.state,f.hooks,f.enemy,5,{triggerBuffs:false});
 assert.deepEqual(f.events,[['damage',5],['present'],['kill',false]]);
 const boss=fixture({kind:4,hp:1});damageEnemy(boss.state,boss.hooks,boss.enemy,5);
 assert.deepEqual(boss.events,[['damage',5],['present'],['kill',true]]);assert.equal(boss.enemy.kx,20);
});

test('continuous damage preserves fractional values and consumes no crit RNG or knockback',()=>{
 const f=fixture(),random=Math.random;Math.random=()=>{throw Error('unexpected crit draw');};
 try{
  damageEnemy(f.state,f.hooks,f.enemy,.125,{impact:false,round:false});
  assert.equal(f.enemy.hp,99.875);assert.equal(f.enemy.kx,0);assert.equal(f.enemy.ky,0);
  assert.deepEqual(f.events,[['damage',.125],['present']]);assert.equal(f.results[0].impact,false);
 }finally{Math.random=random;}
});

test('quiet is presentation-only and does not suppress knockback or Buff dispatch',()=>{
 const f=fixture();damageEnemy(f.state,f.hooks,f.enemy,10,{quiet:true});
 assert.equal(f.enemy.kx,210);assert.equal(f.results[0].quiet,true);assert.deepEqual(f.events.at(-1),['hit']);
});

function playerFixture(extra={}){
 const player={x:12,y:23,hp:50,inv:0,...extra},events=[];
 const state={player,battle:true,training:false,reduction:.25,thornDamage:20};
 const hooks={present:()=>events.push('present'),retaliate:d=>events.push(['thorns',d]),finish:()=>events.push('finish'),triggerHurt:(x,y)=>events.push(['hurt',x,y])};
 return {player,state,hooks,events};
}

test('player damage retaliates before lethal finish and only survivors dispatch hurt Buff',()=>{
 const f=playerFixture();damagePlayer(f.state,f.hooks,20);assert.equal(f.player.hp,35);assert.equal(f.player.inv,.5);
 assert.deepEqual(f.events,['present',['thorns',20],['hurt',12,23]]);
 const lethal=playerFixture({hp:5});damagePlayer(lethal.state,lethal.hooks,20);
 assert.equal(lethal.player.hp,0);assert.deepEqual(lethal.events,['present',['thorns',20],'finish']);
});

test('invulnerability, nonbattle and training guard all damage callbacks',()=>{
 for(const mode of ['invulnerable','notBattle','training']){
  const f=playerFixture();if(mode==='invulnerable')f.player.inv=.1;if(mode==='notBattle')f.state.battle=false;if(mode==='training')f.state.training=true;
  damagePlayer(f.state,f.hooks,999);assert.equal(f.player.hp,50);assert.deepEqual(f.events,[]);
  if(mode==='training')assert.equal(f.player.inv,.5);
 }
 const f=playerFixture();f.state.reduction=1;f.state.thornDamage=undefined;damagePlayer(f.state,f.hooks,1);
 assert.equal(f.player.hp,49);assert.deepEqual(f.events,['present',['hurt',12,23]]);
});

test('presentation preserves combat fields, respects label caps and does not consume RNG',()=>{
 const f=fixture(),labels=[],events=[];
 const hooks={acquireLabel:()=>({}),effect:(...a)=>events.push(a),kick:()=>events.push('kick'),freeze:()=>events.push('freeze')};
 const state={enemyCount:600,labels,visuals:{labels:4}},random=Math.random;
 Math.random=()=>{throw Error('presentation consumed RNG');};
 try{
  for(let i=0;i<20;i++)presentEnemyHit(state,hooks,f.enemy,{value:10,critical:false,impact:true,quiet:false,feedback:{weapon:'blade',dx:1,dy:0}});
  assert.equal(labels.length,4);assert.equal(f.enemy.hp,100);assert.equal(f.enemy.kx,0);assert.equal(f.enemy.dead,false);
  assert.ok(events.every(e=>e[0]==='weaponHit'));assert.equal(f.enemy.hitReaction.weapon,'blade');
  const quiet=fixture();events.length=0;
  presentEnemyHit(state,hooks,quiet.enemy,{value:5,critical:true,impact:true,quiet:true});
  assert.equal(quiet.enemy.flash,0);assert.deepEqual(events,['kick','freeze']);
 }finally{Math.random=random;}
});
