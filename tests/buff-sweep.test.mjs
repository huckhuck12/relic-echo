import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuffEffect,updateBuffEffects} from '../dist/buffs/buff-effects.js';
import {BuffRuntime} from '../dist/buffs/buffs.js';
function fixture(targets=[]){
 const hits=[];const host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>Math.hypot(t.x-x,t.y-y)<=r),damage:t=>hits.push(t),knock:()=>{}};
 return {host,hits};
}
const enemy=(x,y)=>({x,y,dead:false});
const recipe={trigger:'dash',action:'orbit',element:'ice'};
function orbit(host){return createBuffEffect(host,recipe,'dash',0,0,12,1);}
test('orbit catches a target between the old 350ms samples and enforces target cooldown',()=>{
 const t=enemy(Math.cos(1)*90,Math.sin(1)*90),{host,hits}=fixture([t]),effects=[orbit(host)];
 updateBuffEffects(effects,host,.35,t=>hits.push(t));assert.equal(hits.length,1);
 updateBuffEffects(effects,host,.01,t=>hits.push(t));assert.equal(hits.length,1);
});
test('stationary orbit contacts are stable across 30, 60 and 120Hz and large updates',()=>{
 const counts=[30,60,120].map(hz=>{const {host,hits}=fixture([enemy(90,0)]),effects=[orbit(host)];for(let i=0;i<hz*3;i++)updateBuffEffects(effects,host,1/hz,t=>hits.push(t));return hits.length;});
 assert.ok(counts[0]>=5);assert.deepEqual(counts,[counts[0],counts[0],counts[0]]);
 const {host,hits}=fixture([enemy(90,0)]),effects=[orbit(host)];updateBuffEffects(effects,host,5,t=>hits.push(t));assert.equal(hits.length,counts[0]);assert.equal(effects.length,0);
});
test('orbit follows translated path without hitting the whole disk at the new centre',()=>{
 const t=enemy(1000,-90),{host,hits}=fixture([t]),effects=[orbit(host)];host.player.x=1000;
 updateBuffEffects(effects,host,.02,t=>hits.push(t));assert.equal(hits.length,0);
});
test('orbit excludes dead targets, caps contact histories and never bypasses cooldown at capacity',()=>{
 const targets=Array.from({length:700},()=>enemy(90,0));targets[0].dead=true;
 const {host,hits}=fixture(targets),effects=[orbit(host)];updateBuffEffects(effects,host,.001,t=>hits.push(t));assert.equal(hits.length,600);
 updateBuffEffects(effects,host,.001,t=>hits.push(t));assert.equal(hits.length,600);assert.ok(!hits.includes(targets[0]));
});
test('bolt selects nearest live in-range target rather than query enumeration order',()=>{
 const {host}=fixture([enemy(200,100),enemy(60,0),{...enemy(0,10),dead:true}]);
 const e=createBuffEffect(host,{...recipe,action:'bolt'},'dash',0,0,26,1);assert.equal(e.vx,480);assert.equal(e.vy,0);
});
test('thunder focuses live unlocked marks, then falls back to nearest when expired or locked',()=>{
 const near=enemy(0,60),marked=enemy(120,0),{host}=fixture([near,marked]),runtime=new BuffRuntime(host);
 runtime.grant('dash');runtime.grant('bolt');runtime.grant('lightning');for(const part of ['trigger','action','element'])runtime.install(0,part,{trigger:'dash',action:'bolt',element:'lightning'}[part]);
 const mark={stacks:2,life:8,lock:0};runtime.evolutions.thunder.set(marked,mark);
 runtime.trigger('dash',0,0,1);assert.equal(runtime.effects.at(-1).vx,480);
 for(const change of [{lock:1},{lock:0,life:0}]){Object.assign(mark,change);runtime.cooldowns[0]=0;runtime.trigger('dash',0,0,1);assert.equal(runtime.effects.at(-1).vy,480);}
});
test('bolt resolves earliest circle entry, including off-axis targets and overlapping start',()=>{
 for(const targets of [[enemy(150,0),enemy(70,0)],[enemy(80,31),enemy(90,0)],[enemy(100,0),enemy(0,0)]]){
  const {host,hits}=fixture(targets);const e={kind:'bolt',element:'fire',x:0,y:0,vx:480,vy:0,age:0,life:1.2,tick:0,damage:26,level:1};
  updateBuffEffects([e],host,.5,t=>hits.push(t));assert.equal(hits[0],targets[1]);assert.equal(hits.length,1);
 }
});
