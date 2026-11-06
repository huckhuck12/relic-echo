import test from 'node:test';
import assert from 'node:assert/strict';
import {BuffEvolutions,EVOLUTION_LIMITS} from '../dist/buffs/buff-evolutions.js';
import {BuffRuntime} from '../dist/buffs/buffs.js';
import {setupLayaStub} from './helpers/laya-stub.mjs';
setupLayaStub();
const {Game}=await import('../dist/game/game.js');
const source={kind:'bolt',element:'lightning',damage:20,level:5,slot:0,branch:'charge'};
const enemy=(x,hp=1000)=>({x,y:0,hp,dead:false,kind:0});
function fixture(targets){
 const hits=[],arcs=[];let e;
 const host={player:{x:0,y:0,dx:1,dy:0},query:(x,y,r)=>targets.filter(t=>Math.hypot(t.x-x,t.y-y)<=r),knock(){},damage:(t,d,...args)=>{if(t.dead)return;hits.push({t,d,args});t.hp-=d;if(t.hp<=0){t.dead=true;e.killed(t);}}};
 e=new BuffEvolutions(host,{slow(){},burst(){},arc:(...a)=>arcs.push(a)});
 return {e,host,hits,arcs};
}
test('a marked weapon kill chooses nearest live eligible neighbor, keeps source snapshot and pays once',()=>{
 const a=enemy(0),far=enemy(150),near=enemy(30),{e,hits}=fixture([a,far,near]);
 e.hit(a,source);e.update(2);a.dead=true;assert.equal(e.killed(a),true);
 assert.equal(e.thunder.has(a),false);assert.equal(e.thunder.get(near).stacks,2);assert.equal(e.thunder.get(near).life,7);
 assert.equal(hits.length,1);assert.equal(hits[0].t,near);assert.equal(hits[0].d,16);assert.equal(hits[0].args.at(-1).slot,0);
 source.damage=99;assert.equal(e.thunder.get(near).source.damage,20);source.damage=20;
 assert.equal(e.killed(a),false);assert.equal(hits.length,1);assert.equal(e.detonations,0);
});
test('lethal remnant cannot recurse through a crowded weak pack',()=>{
 const targets=Array.from({length:100},(_,i)=>enemy(i,1)),{e,hits}=fixture(targets);
 targets[0].dead=true;e.killed(targets[0],source);
 assert.equal(e.inheritances,1);assert.equal(hits.length,1);assert.equal(targets.filter(t=>t.dead).length,2);
 assert.equal(e.thunder.size,0);assert.equal(e.detonations,0);
});
test('inheritance cannot refresh windows, change existing owner, exceed threshold or bypass locks',()=>{
 const a=enemy(0),b=enemy(30),{e}=fixture([a,b]);
 const old={...source,slot:1,branch:'spread',damage:5};e.hit(b,old);e.update(8);
 e.hit(a,source);a.dead=true;e.killed(a);
 const m=e.thunder.get(b);assert.equal(m.life,1);assert.equal(m.stacks,2);assert.equal(m.source.slot,1);assert.equal(m.source.damage,5);assert.equal(e.detonations,0);
 e.update(1.01);assert.equal(e.thunder.has(b),false);
 for(const mark of [{stacks:2,life:9,lock:1,source},{stacks:2,life:9,lock:0,inherited:true,source}]){
  e.thunder.set(b,mark);assert.equal(e.killed(a,source),false);assert.equal(e.thunder.get(b),mark);
 }
});
test('new direct investment rearms inherited energy; death alone never rearms it',()=>{
 const a=enemy(0),b=enemy(30),c=enemy(60),{e}=fixture([a,b,c]);
 a.dead=true;e.killed(a,source);assert.equal(e.thunder.get(b).inherited,true);
 e.hit(b,source);assert.equal(e.thunder.get(b).stacks,4);assert.equal(e.thunder.get(b).inherited,false);
 b.dead=true;e.killed(b);assert.equal(e.thunder.get(c).stacks,4);assert.equal(e.inheritances,2);
});
test('expired, consumed, locked, living, isolated and Boss deaths do not leak energy',()=>{
 for(const change of [{life:0},{stacks:0},{lock:1},{inherited:true}]){
  const a=enemy(0),b=enemy(30),{e,hits}=fixture([a,b]);e.hit(a,source);Object.assign(e.thunder.get(a),change);a.dead=true;
  assert.equal(e.killed(a),false);assert.equal(hits.length,0);assert.equal(e.thunder.has(a),false);
 }
 for(const kind of [0,4]){const a=enemy(0),{e}=fixture([a]);a.kind=kind;assert.equal(e.killed(a,source),false);a.dead=true;assert.equal(e.killed(a,source),false);}
});
test('per-step budget, capacity and clear bound death queries and inheritance work',()=>{
 const recipients=Array.from({length:30},(_,i)=>enemy(i)),{e}=fixture(recipients);
 for(let i=0;i<30;i++)e.killed({...enemy(i),dead:true},source);
 assert.equal(e.inheritances,EVOLUTION_LIMITS.thunderInheritsPerStep);assert.equal(e.thunder.size,16);
 e.update(.01);assert.equal(e.killed({...enemy(29),dead:true},source),true);
 e.clear();assert.equal(e.inheritances,0);assert.equal(e.thunder.size,0);
 for(let i=0;i<200;i++)e.hit(enemy(1000+i),source);
 assert.equal(e.killed({...enemy(0),dead:true},source),false);assert.equal(e.thunder.size,200);
});
test('failed searches also consume the step budget and zero feedback budget cannot change mechanics',()=>{
 const {e,host}=fixture([]);let queries=0;host.query=()=>{queries++;return [];};
 for(let i=0;i<200;i++)e.killed({...enemy(i),dead:true},source);
 assert.equal(queries,16);assert.equal(e.inheritances,0);e.update(.01);
 e.killed({...enemy(0),dead:true},source);assert.equal(queries,17);
 const totals=[];
 for(const budget of [0,48]){
  const a=enemy(0,1),b=enemy(40),hits=[];let r;
  r=new BuffRuntime({player:{x:0,y:0},query:()=>[a,b],knock(){},damage:(t,d)=>{hits.push(d);t.hp-=d;if(t.hp<=0){t.dead=true;r.enemyKilled(t);}}});
  r.setVisualBudget(budget);r.apply(a,{...source,x:0,y:0});totals.push(hits);assert.ok(r.feedback.length<=budget);
 }
 assert.deepEqual(totals[0],totals[1]);
});
test('runtime lethal base bolt merges stored and new marks once despite synchronous death callbacks',()=>{
 const a=enemy(0,1),b=enemy(40),hits=[];let r;
 const host={player:{x:0,y:0},query:()=>[a,b],knock(){},damage:(t,d)=>{hits.push([t,d]);t.hp-=d;if(t.hp<=0){t.dead=true;r.enemyKilled(t);}}};
 r=new BuffRuntime(host);r.evolutions.hit(a,source);r.apply(a,{...source,x:0,y:0});
 assert.equal(r.evolutions.inheritances,1);assert.equal(r.evolutions.thunder.get(b).stacks,4);assert.deepEqual(hits.map(h=>h[1]),[20,32]);
 r.apply(a,{...source,x:0,y:0});assert.equal(hits.length,2);assert.equal(r.evolutions.thunder.has(a),false);
});
test('real Game death hooks preserve effective damage ledger, source and unique kill rewards',()=>{
 const g=new Game();g.start('storm',true);g.enemies.length=0;
 for(let i=0;i<3;i++){g.spawnEnemy(0);Object.assign(g.enemies.at(-1),{x:100+i*30,y:0,hp:1});}
 const [a,b,c]=g.enemies;g.grid.rebuild(g.enemies);const before=g.kills;
 g.buffs.apply(a,{...source,x:a.x,y:a.y});
 assert.equal(g.kills-before,2);assert.equal(a.dead,true);assert.equal(b.dead,true);assert.equal(c.dead,false);
 assert.equal(g.buffs.evolutions.inheritances,1);
 const row=g.damageRanking.rows().find(r=>r.id==='bolt/lightning');assert.equal(row.damage,2);
 g.returnToTitle();assert.equal(g.buffs.evolutions.thunder.size,0);
});
