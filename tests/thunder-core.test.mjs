import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {BuffEvolutions} from '../dist/buffs/buff-evolutions.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const source={kind:'bolt',element:'lightning',damage:20,level:5,slot:0,branch:'charge'};
const enemy=(x=150,kind=0)=>({x,y:0,kind,hp:10000,dead:false});
function fixture(targets=[]){
 const hits=[];const host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>Math.hypot(t.x-x,t.y-y)<=r),damage:(t,d)=>{hits.push({t,d});t.hp-=d;},knock(){}};
 const e=new BuffEvolutions(host,{slow(){},burst(){},arc(){}});return {host,hits,e};
}
test('three weapons charge existing marks at a bounded rate across 30/60/120Hz',()=>{
 for(const hz of [30,60,120]){
  const t=enemy(),{e}=fixture([t]);e.weaponHit(t);assert.equal(e.thunder.size,0);e.hit(t,source);
  for(let i=0;i<hz*2;i++){for(let j=0;j<30;j++)e.weaponHit(t);e.update(1/hz);}
  assert.equal(e.detonations,1);assert.ok(e.weaponCharges<=4);
 }
});
test('multi-target contact shares a global gate, preserves snapshots and does not refresh expiry',()=>{
 const a=enemy(),b=enemy(170),{e}=fixture([a,b]);e.hit(a,source);e.hit(b,source);e.update(8);
 e.weaponHit(a);e.weaponHit(b);assert.equal(e.weaponCharges,1);assert.equal(e.thunder.get(a).stacks,3);assert.equal(e.thunder.get(b).stacks,2);
 assert.equal(e.thunder.get(a).life,1);assert.equal(e.thunder.get(a).source.damage,20);
 e.update(.13);e.weaponHit(b);assert.equal(e.weaponCharges,2);e.update(.88);assert.equal(e.thunder.size,0);
});
test('charge prioritizes strong targets, spread retains marked-target targeting',()=>{
 for(const branch of ['charge','spread']){
  const near=enemy(60),elite=enemy(200,3),boss=enemy(300,4),{host}=fixture([near,elite,boss]);
  const r=new BuffRuntime(host);r.chooseStarter('thunder');r.receiveFragment('lightning');r.receiveFragment('lightning');r.takeBranchReward();r.chooseBranch(branch,'bolt/lightning');
  near.y=60;elite.y=-100;boss.y=150;r.evolutions.hit(near,{...source,branch});r.trigger('hit',0,0,1);
  const bolt=r.effects.at(-1),expected=branch==='charge'?boss:near;
  assert.ok(Math.abs(bolt.vy/bolt.vx-expected.y/expected.x)<1e-9);
 }
});
test('spread death invests in at most three/five neighbors; charge transfers only to nearest strong enemy',()=>{
 for(const [level,cap]of [[3,3],[5,5]]){
  const a=enemy(0),others=Array.from({length:8},(_,i)=>enemy(10+i*10)),{e,hits}=fixture([a,...others]);a.dead=true;
  e.killed(a,{...source,branch:'spread',level});assert.equal(e.thunder.size,cap);assert.equal(hits.length,cap);assert.equal(e.detonations,0);
 }
 const a=enemy(0),near=enemy(10),elite=enemy(100,3),boss=enemy(150,4),{e,hits}=fixture([a,near,elite,boss]);a.dead=true;e.killed(a,source);
 assert.equal(hits.length,1);assert.equal(hits[0].t,boss);
});
test('orbit refresh preserves phase, per-target contact cooldown and one effect per slot',()=>{
 const t=enemy(),{host,hits}=fixture([t]),r=new BuffRuntime(host);r.chooseStarter('ice');
 r.trigger('hit',0,0,1);r.update(.001);assert.equal(hits.length,1);const old=r.effects[0];r.cooldowns[0]=0;
 r.trigger('hit',0,0,2);assert.equal(r.effects.filter(e=>e.kind==='orbit').length,1);assert.equal(r.effects[0],old);assert.equal(old.age,.001);
 r.update(.001);assert.equal(hits.length,1);assert.equal(old.damage,40);
});
test('real weapon contacts include quiet flame damage, exclude Buffs/thorns, and count reaction kills once',()=>{
 for(const weapon of ['storm','flame','blade']){
  const g=new Game();g.start(weapon,true);g.enemies.length=0;g.spawnEnemy(0);const t=g.enemies[0];Object.assign(t,{x:150,y:0,hp:10000});g.grid.rebuild(g.enemies);
  g.buffs.evolutions.hit(t,source);g.buffs.cooldowns.fill(999);
  g.hit(t,1,{source:weapon,impact:false,triggerBuffs:false});assert.equal(g.buffs.evolutions.weaponCharges,1);
  g.buffs.update(.6);g.hit(t,1,{source:{kind:'bolt',element:'lightning'},triggerBuffs:false});g.hit(t,1,{source:'thorns',triggerBuffs:false});assert.equal(g.buffs.evolutions.weaponCharges,1);
  g.hit(t,1,{source:weapon,impact:false,triggerBuffs:false});g.buffs.update(.6);t.hp=10;const kills=g.kills;
  g.hit(t,1,{source:weapon,impact:false,triggerBuffs:false});assert.equal(g.buffs.evolutions.detonations,1);assert.equal(g.kills,kills+1);
  assert.equal(g.damageRanking.rows().find(r=>r.id==='bolt/lightning').damage,10);g.returnToTitle();
 }
});
